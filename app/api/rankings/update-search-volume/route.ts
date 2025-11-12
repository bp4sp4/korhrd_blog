import { createAdminClient } from '@/lib/supabase/admin';
import { fetchNaverSearchCountFromKeywordTool } from '@/lib/naver/ranking';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 검색량만 빠르게 업데이트하는 API
 * 랭킹 수집 없이 검색량만 가져와서 업데이트합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const adminClient = createAdminClient();
    const { searchParams } = new URL(request.url);
    const keywordParamRaw = searchParams.get('keyword');
    const keywordParam = keywordParamRaw ? keywordParamRaw.trim() : null;
    const singleIdParam = searchParams.get('id');
    const idsParamRaw = searchParams.get('ids');
    const idsFromQuery = new Set<string>();
    
    if (singleIdParam) {
      singleIdParam
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .forEach((value) => idsFromQuery.add(value));
    }
    if (idsParamRaw) {
      idsParamRaw
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .forEach((value) => idsFromQuery.add(value));
    }
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.max(1, Math.min(Number(limitParam), 200)) : undefined;

    let records: Array<{ id: string; keyword: string }> = [];

    if (idsFromQuery.size > 0) {
      const { data, error } = await adminClient
        .from('blog_records')
        .select('id, keyword')
        .in('id', Array.from(idsFromQuery))
        .limit(limit ?? 200);

      if (error) {
        console.error('[search-volume] supabase in(id) 실패', error);
      }

      records = (data ?? []).filter((record) => !!record.keyword);
    } else if (keywordParam && keywordParam.length > 0) {
      const trimmed = keywordParam.replace(/\s+/g, ' ').trim();
      const lower = trimmed.toLowerCase();

      const eqQuery = await adminClient
        .from('blog_records')
        .select('id, keyword')
        .eq('keyword', keywordParam)
        .limit(limit ?? 200);

      const ilikeQuery = await adminClient
        .from('blog_records')
        .select('id, keyword')
        .ilike('keyword', `%${trimmed}%`)
        .limit(limit ?? 200);

      const combined = [...(eqQuery.data ?? []), ...(ilikeQuery.data ?? [])];
      const seen = new Set<string>();
      records = combined.filter((record) => {
        if (!record.keyword) return false;
        const normalized = record.keyword.replace(/\s+/g, ' ').trim().toLowerCase();
        const key = `${record.id}:${normalized}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return normalized === lower || normalized.includes(lower);
      });
    } else {
      const { data } = await adminClient
        .from('blog_records')
        .select('id, keyword')
        .order('created_at', { ascending: false })
        .limit(limit ?? 200);
      records = data ?? [];
    }

    const results = [];

    for (const record of records) {
      try {
        // 검색량만 가져오기
        let searchVolume: number | null = null;
        try {
          const searchCountResult = await fetchNaverSearchCountFromKeywordTool(record.keyword);
          if (searchCountResult.total !== null && searchCountResult.total > 0) {
            searchVolume = searchCountResult.total;
            console.log(`[search-volume] 검색량 수집 성공: ${record.keyword} = ${searchVolume}`);
          } else {
            console.log(`[search-volume] 검색량 수집 실패 또는 0: ${record.keyword}`);
          }
        } catch (searchVolumeError: any) {
          console.warn(`[search-volume] 검색량 수집 실패: ${record.keyword}`, searchVolumeError?.message);
        }

        // 검색량만 업데이트
        if (searchVolume !== null) {
          const { error } = await adminClient
            .from('blog_records')
            .update({
              search_volume: searchVolume,
              updated_at: new Date().toISOString(),
            })
            .eq('id', record.id)
            .eq('keyword', record.keyword);

          if (!error) {
            await adminClient.from('record_activity_logs').insert({
              action: 'update',
              record_id: record.id,
              keyword: record.keyword,
              actor_id: null,
              actor_name: 'crawler',
              actor_role: 'system',
              metadata: {
                searchVolume: searchVolume,
                fetchedAt: new Date().toISOString(),
              },
            });
          }

          results.push({
            id: record.id,
            keyword: record.keyword,
            searchVolume: searchVolume,
            success: !error,
            error: error?.message ?? null,
          });
        } else {
          results.push({
            id: record.id,
            keyword: record.keyword,
            searchVolume: null,
            success: false,
            error: '검색량을 가져올 수 없습니다.',
          });
        }
      } catch (err: any) {
        console.error(`[search-volume] ${record.keyword} 처리 실패`, err);
        results.push({
          id: record.id,
          keyword: record.keyword,
          searchVolume: null,
          success: false,
          error: err?.message ?? '검색량 수집 실패',
        });
      }

      // API 호출 간격 조절
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log('[search-volume] debug', {
      requestedKeyword: keywordParam,
      recordCount: records.length,
      results,
    });

    return NextResponse.json({
      success: true,
      updated: results,
    });
  } catch (error: any) {
    console.error('[search-volume] 업데이트 실패', error);
    return NextResponse.json(
      { error: error?.message ?? '검색량 수집 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

