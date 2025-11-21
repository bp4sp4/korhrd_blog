import { createAdminClient } from '@/lib/supabase/admin';
import { fetchNaverRanking, fetchNaverSearchCountFromKeywordTool } from '@/lib/naver/ranking';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5분

type BlogRecord = {
  id: string;
  keyword: string;
  link: string | null;
  title: string | null;
  author: string | null;
  link_infos?: {
    url: string | null;
    blog_id: string | null;
  }[] | null;
};

const NAVER_HOSTS = ['blog.naver.com', 'cafe.naver.com'];

// --- [Helper Functions] ---

function normalizeKeyword(value?: string | null): string {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}

// 키워드 비교용: 띄어쓰기 제거 및 소문자
function normalizeKeywordForComparison(value?: string | null): string {
  if (!value) return '';
  return value.replace(/\s+/g, '').toLowerCase();
}

function normalizeUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);

    // Naver 블로그 포스트 뷰 URL을 정규화 (blogId/logNo 형태로)
    if (
      url.hostname === 'blog.naver.com' &&
      url.searchParams.has('blogId') &&
      url.searchParams.has('logNo')
    ) {
      const blogId = url.searchParams.get('blogId');
      const logNo = url.searchParams.get('logNo');
      if (blogId && logNo) {
        return `${url.hostname}/${blogId.toLowerCase()}/${logNo}`;
      }
    }

    const sanitizedPath = url.pathname.replace(/\/+$/, '');
    return `${url.hostname}${sanitizedPath}`;
  } catch {
    return value.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }
}

function extractBlogIdFromUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);

    // query parameter에서 blogId 추출 (PostView.naver 등)
    const blogIdParam = url.searchParams.get('blogId');
    if (blogIdParam) {
      return blogIdParam.trim().toLowerCase();
    }

    if (!NAVER_HOSTS.includes(url.hostname)) {
      return null;
    }
    
    // cafe.naver.com의 경우 카페 이름 추출
    if (url.hostname === 'cafe.naver.com') {
      const segments = url.pathname
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);
      if (segments.length > 0) {
        return segments[0].toLowerCase();
      }
      const artParam = url.searchParams.get('art');
      if (artParam) {
        const match = value.match(/cafe\.naver\.com\/([^/?#]+)/);
        if (match) {
          return match[1].toLowerCase();
        }
      }
    }
    
    // blog.naver.com의 경우
    const segments = url.pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (segments.length === 0) return null;
    return segments[0].toLowerCase();
  } catch {
    return null;
  }
}

function normalizeText(value?: string | null): string | null {
  if (!value) return null;
  return value.replace(/\s+/g, '').toLowerCase();
}

function collectRecordIdentifiers(record: BlogRecord): string[] {
  const identifiers = new Set<string>();

  const normalizedId = record.id?.trim().toLowerCase();
  if (normalizedId && /^[a-z0-9_\-]+$/.test(normalizedId)) {
    identifiers.add(normalizedId);
  }

  const normalizedAuthor = record.author?.trim().toLowerCase();
  if (normalizedAuthor) {
    identifiers.add(normalizedAuthor);
  }

  const normalizedKeyword = normalizeKeywordForComparison(record.keyword);
  if (normalizedKeyword) {
    identifiers.add(normalizedKeyword);
  }

  const normalizedTitle = normalizeText(record.title);
  if (normalizedTitle) {
    identifiers.add(normalizedTitle);
  }

  const urlKey = normalizeUrl(record.link);
  if (urlKey) {
    identifiers.add(urlKey.toLowerCase());
  }

  const blogIdFromLink = extractBlogIdFromUrl(record.link);
  if (blogIdFromLink) {
    identifiers.add(blogIdFromLink);
  }

  if (Array.isArray(record.link_infos)) {
    for (const info of record.link_infos) {
      const infoBlogId = info?.blog_id?.trim().toLowerCase();
      if (infoBlogId && /^[a-z0-9_\-]+$/.test(infoBlogId)) {
        identifiers.add(infoBlogId);
      }

      const infoUrlKey = normalizeUrl(info?.url ?? null);
      if (infoUrlKey) {
        identifiers.add(infoUrlKey.toLowerCase());
      }

      const infoBlogIdFromUrl = extractBlogIdFromUrl(info?.url ?? null);
      if (infoBlogIdFromUrl) {
        identifiers.add(infoBlogIdFromUrl);
      }
    }
  }

  return Array.from(identifiers);
}

function collectEntryIdentifiers(entry: Awaited<ReturnType<typeof fetchNaverRanking>>[number]): string[] {
  const identifiers = new Set<string>();

  const addIdentifier = (value?: string | null) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    identifiers.add(trimmed.toLowerCase());
  };

  addIdentifier(entry.blogId);

  const entryUrlKey = normalizeUrl(entry.link);
  if (entryUrlKey) addIdentifier(entryUrlKey);

  const blogIdFromLink = extractBlogIdFromUrl(entry.link);
  if (blogIdFromLink) addIdentifier(blogIdFromLink);

  if (entry.nickname) addIdentifier(entry.nickname);
  
  if (entry.keyword) {
    const normalizedKeyword = normalizeKeywordForComparison(entry.keyword);
    if (normalizedKeyword) {
      identifiers.add(normalizedKeyword);
    }
  }
  
  const normalizedTitle = normalizeText(entry.title);
  if (normalizedTitle) identifiers.add(normalizedTitle);

  if (entry.link) {
    try {
      const url = new URL(entry.link);
      if (url.hostname === 'blog.naver.com' || url.hostname === 'cafe.naver.com') {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments[0]) addIdentifier(segments[0]);
        const queryId = url.searchParams.get('blogId');
        if (queryId) addIdentifier(queryId);
      }
    } catch {}
  }

  return Array.from(identifiers);
}

function findMatch(
  entryIdentifiers: string[],
  recordIdentifiers: string[],
  recordKeyword?: string
): { identifier: string } | null {
  if (recordKeyword) {
    const keywordMatch = entryIdentifiers.find(id => id === recordKeyword);
    if (keywordMatch && recordIdentifiers.includes(recordKeyword)) {
      for (const recordId of recordIdentifiers) {
        if (!recordId || recordId === recordKeyword) continue;
        if (entryIdentifiers.some((candidate) => candidate === recordId)) {
          return { identifier: recordId };
        }
      }
    }
  }
  
  for (const recordId of recordIdentifiers) {
    if (!recordId) continue;
    if (entryIdentifiers.some((candidate) => candidate === recordId)) {
      return { identifier: recordId };
    }
  }
  
  for (const recordId of recordIdentifiers) {
    if (!recordId) continue;
    if (recordId.length <= 20 && /^[a-z0-9_\-]+$/.test(recordId)) {
      if (entryIdentifiers.some((candidate) => candidate === recordId)) {
        return { identifier: recordId };
      }
    }
  }
  
  for (const recordId of recordIdentifiers) {
    if (!recordId) continue;
    if (
      recordId.length >= 5 &&
      entryIdentifiers.some((candidate) => candidate.includes(recordId) || recordId.includes(candidate))
    ) {
      return { identifier: recordId };
    }
  }
  
  return null;
}

// --- [Main Handler] ---

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
      singleIdParam.split(',').forEach(v => idsFromQuery.add(v.trim().toLowerCase()));
    }
    if (idsParamRaw) {
      idsParamRaw.split(',').forEach(v => idsFromQuery.add(v.trim().toLowerCase()));
    }
    
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.max(1, Math.min(Number(limitParam), 200)) : undefined;

    let records: BlogRecord[] = [];

    // DB에서 대상 레코드 가져오기
    if (idsFromQuery.size > 0) {
      const { data } = await adminClient
        .from('blog_records')
        .select('id, keyword, link, title, author')
        .in('id', Array.from(idsFromQuery))
        .limit(limit ?? 200);
      records = (data ?? []).filter((record) => !!record.keyword);
    } else if (keywordParam && keywordParam.length > 0) {
      const trimmed = keywordParam.replace(/\s+/g, ' ').trim();
      const lower = trimmed.toLowerCase();

      const eqQuery = await adminClient
        .from('blog_records')
        .select('id, keyword, link, title, author')
        .eq('keyword', keywordParam)
        .limit(limit ?? 200);

      const ilikeQuery = await adminClient
        .from('blog_records')
        .select('id, keyword, link, title, author')
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
        .select('id, keyword, link, title, author')
        .order('created_at', { ascending: false })
        .limit(limit ?? 200);
      records = data ?? [];
    }

    const results = [];
    console.log(`[ranking] 시작: ${records.length}개 레코드 처리`);

    for (const record of records) {
      try {
        console.log(`[ranking] 처리 중: ${record.keyword} (${record.id})`);
        
        // 1. 랭킹 가져오기 (여기서 순위가 계산되어 나옵니다)
        const entries = await fetchSmartblockEntries(record.keyword, request);
        
        console.log(`[ranking] ${record.keyword} (${record.id}) - 가져온 항목 수: ${entries.length}, 순위 있는 항목: ${entries.filter(e => e.rank !== null && e.rank !== undefined).length}`);
        
        // 내 글 찾기 (매칭 로직)
        const recordIdentifiers = collectRecordIdentifiers(record);
        const normalizedRecordKeyword = normalizeKeywordForComparison(record.keyword);
        
        let matched: Awaited<ReturnType<typeof fetchNaverRanking>>[number] | null = null;
        const normalizedRecordId = record.id?.trim().toLowerCase() || null;
        
        for (const entry of entries) {
          // rank가 null이면 순위에 포함되지 않는 항목이므로 스킵
          if (entry.rank === null || entry.rank === undefined) continue;

          // 1) 블로그 ID가 있으면 반드시 동일해야 함
          if (normalizedRecordId) {
            const normalizedEntryBlogId =
              typeof entry.blogId === 'string' && entry.blogId.trim()
                ? entry.blogId.trim().toLowerCase()
                : null;

            if (!normalizedEntryBlogId) {
              console.warn(
                `[ranking] ${record.keyword} - blogId 없음으로 스킵 (recordId: ${normalizedRecordId})`
              );
              continue;
            }

            if (normalizedEntryBlogId !== normalizedRecordId) {
              console.warn(
                `[ranking] ${record.keyword} - blogId 불일치 (recordId: ${normalizedRecordId}, entry blogId: ${normalizedEntryBlogId})`
              );
              continue;
            }
          }

          const normalizedEntryKeyword = normalizeKeywordForComparison(entry.keyword);
          const keywordMatches = normalizedEntryKeyword === normalizedRecordKeyword;
          
          if (!keywordMatches) {
            console.warn(
              `[ranking] ${record.keyword} - 키워드 불일치로 스킵 (record: ${normalizedRecordKeyword}, entry: ${normalizedEntryKeyword})`
            );
            continue;
          }
          
          const entryIdentifiers = collectEntryIdentifiers(entry);
          const matchResult = findMatch(entryIdentifiers, recordIdentifiers, normalizedRecordKeyword);
          if (matchResult) {
            console.log(`[ranking] ${record.keyword} (${record.id}) - 매칭 성공! 순위: ${entry.rank}, 블록: ${entry.blockTitle || 'N/A'}, blogId: ${entry.blogId}`);
            matched = entry;
            break;
          }
        }
        
        if (!matched) {
          console.warn(`[ranking] ${record.keyword} (${record.id}) - 매칭 실패. 순위 있는 항목들:`, 
            entries.filter(e => e.rank !== null && e.rank !== undefined).map(e => ({
              rank: e.rank,
              blogId: e.blogId,
              title: e.title?.substring(0, 30),
              blockTitle: e.blockTitle
            }))
          );
        }

        // 실제 DB에 반영될 순위
        const rank = matched ? matched.rank : null;

        console.log(`[ranking] 결과: ${record.keyword} -> rank: ${rank}`);

        // 2. 검색량 가져오기
        let searchVolume: number | null = null;
        try {
          const searchVolumeController = new AbortController();
          const searchVolumeTimeout = setTimeout(() => searchVolumeController.abort(), 10000);
          try {
            const searchCountResult = await fetchNaverSearchCountFromKeywordTool(record.keyword);
            clearTimeout(searchVolumeTimeout);
            if (searchCountResult.total !== null && searchCountResult.total > 0) {
              searchVolume = searchCountResult.total;
            }
          } catch (e) {
            clearTimeout(searchVolumeTimeout);
          }
        } catch (e) {
          console.warn(`[ranking] 검색량 실패: ${record.keyword}`);
        }

        // 3. 데이터베이스 업데이트
        const updateData: any = {
          ranking: rank, // 여기서 계산된 순위를 업데이트합니다
          updated_at: new Date().toISOString(),
        };

        if (searchVolume !== null) {
          updateData.search_volume = searchVolume;
        }

        const { data: updateResult, error } = await adminClient
          .from('blog_records')
          .update(updateData)
          .eq('id', record.id)
          .eq('keyword', record.keyword)
          .select();

        if (error) {
          console.error(`[ranking] DB 업데이트 실패: ${record.id}`, error.message);
        } else {
          // Activity Log 기록
          if ((updateResult?.length || 0) > 0) {
            try {
              const matchedAny = matched as any;
              await adminClient.from('record_activity_logs').insert({
                action: 'update',
                record_id: record.id,
                keyword: record.keyword,
                actor_name: 'crawler',
                actor_role: 'system',
                metadata: {
                  ranking: rank,
                  searchVolume: searchVolume,
                  link: matched?.link ?? null,
                  nickname: matched?.nickname ?? null,
                  fetchedAt: new Date().toISOString(),
                  blockTitle: matchedAny?.blockTitle ?? null,
                  blockRank: matchedAny?.blockRank ?? null,
                },
              });
            } catch (logError) {
              console.warn('[ranking] 로그 기록 실패', logError);
            }
          }
        }

        results.push({
          id: record.id,
          keyword: record.keyword,
          ranking: rank,
          searchVolume: searchVolume,
          success: !error && (updateResult?.length || 0) > 0,
          error: error?.message ?? null,
        });

        // 딜레이 (여러 건 처리 시)
        if (records.length > 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (err: any) {
        console.error(`[ranking] ${record.keyword} 처리 에러`, err);
        results.push({
          id: record.id,
          keyword: record.keyword,
          success: false,
          error: err?.message ?? 'Unknown Error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      updated: results,
      summary: {
        total: records.length,
        success: results.filter(r => r.success).length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'Server Error' },
      { status: 500 }
    );
  }
}

// --- [Ranking Logic] ---

async function fetchSmartblockEntries(
  keyword: string,
  request: NextRequest,
  timeout: number = 60000
): Promise<Awaited<ReturnType<typeof fetchNaverRanking>>> {
  try {
    const smartblockUrl = new URL('/api/smartblock', request.url);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(smartblockUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ keyword }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[ranking] 스마트블록 API 실패: ${response.status}`);
      return [];
    }

    const json = await response.json();
    const smartBlocks = Array.isArray(json.smartBlocks) ? json.smartBlocks : [];
    const results: Awaited<ReturnType<typeof fetchNaverRanking>> = [];

    const extractBlogId = (value?: string | null): string | null => {
      if (!value) return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      const blogMatch = trimmed.match(/blog\.naver\.com\/([^/?#]+)/);
      if (blogMatch) return blogMatch[1].toLowerCase();
      const cafeMatch = trimmed.match(/cafe\.naver\.com\/([^/?#]+)/);
      if (cafeMatch) return cafeMatch[1].toLowerCase();
      const fromUrl = extractBlogIdFromUrl(trimmed);
      return fromUrl ? fromUrl.toLowerCase() : null;
    };

    // 1. 블록 분류
    // 인기글 블록 찾기: "인기글"이 포함된 블록 (예: "교육·학문 인기글", "'키워드' 인기글" 등)
    const popularBlock = smartBlocks.find((block: any) => {
      const title = block?.title?.trim() || '';
      return title.includes('인기글');
    });
    
    console.log(`[ranking] ${keyword} - 발견된 블록들:`, smartBlocks.map((b: any) => b?.title).filter(Boolean));
    if (popularBlock) {
      console.log(`[ranking] ${keyword} - 인기글 블록 발견: "${popularBlock.title}"`);
    } else {
      console.log(`[ranking] ${keyword} - 인기글 블록 없음`);
    }
    
    const smartBlockBlocks = smartBlocks.filter((block: any) => block?.title && !block.title.includes('일반 검색 결과'));
    
    // 2. 순위 측정 대상 블록 선정 (인기글 > 첫번째 스마트블록)
    const rankingBlock = popularBlock || (smartBlockBlocks.length > 0 ? smartBlockBlocks[0] : null);
    
    if (rankingBlock) {
      console.log(`[ranking] ${keyword} - 순위 측정 대상 블록: "${rankingBlock.title}" (항목 수: ${Array.isArray(rankingBlock.data) ? rankingBlock.data.length : 0})`);
    }

    const seenEntries = new Set<string>();
    const getEntryKey = (link: string, blogId: string) => 
      `${normalizeUrl(link)?.toLowerCase()}|${blogId.toLowerCase()}`;

    // 3. [핵심] 순위 블록 처리 (순위를 1, 2, 3... 강제 할당)
    if (rankingBlock) {
      const items = Array.isArray(rankingBlock.data) ? rankingBlock.data : [];
      
      items.forEach((item: any, index: number) => {
        const rawBlogId = item?.authorId || item?.blogId;
        const blogId = extractBlogId(rawBlogId) ?? 
                       extractBlogId(item?.profileLink) ?? 
                       extractBlogId(item?.link);

        const nicknameRaw = item?.author || item?.nickname;
        const nickname = nicknameRaw ? nicknameRaw.trim() : undefined;

        if (!blogId && !nickname) return;

        const title = typeof item?.title === 'string' ? item.title.trim() : '';
        const link = typeof item?.link === 'string' ? item.link : '';
        
        if (link && link.startsWith('https://ader.naver.com/')) return;

        const entryKey = getEntryKey(link, blogId ?? '');
        seenEntries.add(entryKey);

        // [FIX] API가 주는 index 대신 배열의 index + 1을 사용하여 실제 노출 순위 반영
        const actualRank = index + 1;

        results.push({
          keyword,
          blogId: blogId ?? '',
          title,
          link,
          rank: actualRank, // <-- 여기가 1, 2, 3... 으로 들어감
          nickname,
          snippet: item?.content,
          blockTitle: rankingBlock.title,
          blockRank: actualRank,
        } as any);
      });
    }

    // 4. 나머지 블록 처리 (순위는 null, 매칭 확인용)
    for (const block of smartBlocks) {
      if (block === rankingBlock) continue; // 이미 처리함
      
      const items = Array.isArray(block.data) ? block.data : [];
      items.forEach((item: any, index: number) => {
        const rawBlogId = item?.authorId || item?.blogId;
        const blogId = extractBlogId(rawBlogId) ?? 
                       extractBlogId(item?.profileLink) ?? 
                       extractBlogId(item?.link);
        const nickname = item?.author || item?.nickname;
        
        if (!blogId && !nickname) return;

        const link = typeof item?.link === 'string' ? item.link : '';
        const entryKey = getEntryKey(link, blogId ?? '');
        
        if (seenEntries.has(entryKey)) return;
        seenEntries.add(entryKey);

        results.push({
          keyword,
          blogId: blogId ?? '',
          title: item?.title || '',
          link,
          rank: null, // 순위 집계 대상 아님
          nickname: nickname || '',
          snippet: item?.content,
          blockTitle: block.title,
          blockRank: index + 1,
        } as any);
      });
    }

    return results;
  } catch (fetchError) {
    console.error(`[ranking] 스마트블록 에러: ${keyword}`, fetchError);
    return [];
  }
}