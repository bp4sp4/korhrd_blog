import { createAdminClient } from '@/lib/supabase/admin';
import { fetchNaverRanking, fetchNaverSearchCountFromKeywordTool } from '@/lib/naver/ranking';
import { NextRequest, NextResponse } from 'next/server';

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

function normalizeKeyword(value?: string | null): string {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
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
    if (!NAVER_HOSTS.includes(url.hostname)) {
      return null;
    }
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
  if (normalizedAuthor && /^[a-z0-9_\-]+$/.test(normalizedAuthor)) {
    identifiers.add(normalizedAuthor);
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
  if (entry.title) addIdentifier(entry.title);

  if (entry.link) {
    try {
      const url = new URL(entry.link);
      // blog.naver.com과 cafe.naver.com 모두 처리
      if (url.hostname === 'blog.naver.com' || url.hostname === 'cafe.naver.com') {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments[0]) addIdentifier(segments[0]);
        const queryId = url.searchParams.get('blogId');
        if (queryId) addIdentifier(queryId);
      }
    } catch {
      // ignore invalid url
    }
  }

  return Array.from(identifiers);
}

function findMatch(
  entryIdentifiers: string[],
  recordIdentifiers: string[]
): { identifier: string } | null {
  for (const recordId of recordIdentifiers) {
    if (!recordId) continue;
    if (entryIdentifiers.some((candidate) => candidate === recordId)) {
      return { identifier: recordId };
    }
    if (
      recordId.length >= 5 &&
      entryIdentifiers.some((candidate) => candidate.includes(recordId))
    ) {
      return { identifier: recordId };
    }
  }
  return null;
}

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

    let records: BlogRecord[] = [];

    if (idsFromQuery.size > 0) {
      const { data, error } = await adminClient
        .from('blog_records')
        .select('id, keyword, link, title, author')
        .in('id', Array.from(idsFromQuery))
        .limit(limit ?? 200);

      if (error) {
        console.error('[ranking] supabase in(id) 실패', error);
      }

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

      console.log('[ranking] supabase eq', eqQuery);
      console.log('[ranking] supabase ilike', ilikeQuery);

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

    for (const record of records) {
      try {
        // 1. 랭킹 가져오기 (단일 레코드 조회 시 더 짧은 타임아웃)
        const timeout = records.length === 1 ? 20000 : 30000; // 단일: 20초, 여러: 30초
        const entries = await fetchSmartblockEntries(record.keyword, request, timeout);
        
        // record의 identifier 수집
        const recordIdentifiers = collectRecordIdentifiers(record);
        console.log(`[ranking] ${record.keyword} - record identifiers:`, recordIdentifiers);
        console.log(`[ranking] ${record.keyword} - record data:`, {
          id: record.id,
          author: record.author,
          title: record.title,
          link: record.link,
        });
        
        // entries에서 매칭되는 항목 찾기
        let matched: Awaited<ReturnType<typeof fetchNaverRanking>>[number] | null = null;
        for (const entry of entries) {
          const entryIdentifiers = collectEntryIdentifiers(entry);
          console.log(`[ranking] ${record.keyword} - entry rank ${entry.rank} identifiers:`, entryIdentifiers);
          console.log(`[ranking] ${record.keyword} - entry data:`, {
            rank: entry.rank,
            blogId: entry.blogId,
            nickname: entry.nickname,
            title: entry.title,
            link: entry.link,
          });
          const matchResult = findMatch(entryIdentifiers, recordIdentifiers);
          if (matchResult) {
            console.log(`[ranking] ${record.keyword} - 매칭 성공! rank: ${entry.rank}, identifier: ${matchResult.identifier}`);
            matched = entry;
            break;
          } else {
            console.log(`[ranking] ${record.keyword} - rank ${entry.rank} 매칭 실패`);
          }
        }

        const rank = matched ? matched.rank : null;
        if (!matched) {
          console.warn(`[ranking] ${record.keyword} - 매칭된 항목 없음. entries 개수: ${entries.length}`);
        }

        // 2. 검색량 가져오기 (타임아웃 10초)
        let searchVolume: number | null = null;
        try {
          const searchVolumeController = new AbortController();
          const searchVolumeTimeout = setTimeout(() => searchVolumeController.abort(), 10000);
          
          try {
            const searchCountResult = await fetchNaverSearchCountFromKeywordTool(record.keyword);
            clearTimeout(searchVolumeTimeout);
            
            if (searchCountResult.total !== null && searchCountResult.total > 0) {
              searchVolume = searchCountResult.total;
              console.log(`[ranking] 검색량 수집 성공: ${record.keyword} = ${searchVolume}`);
            } else {
              console.log(`[ranking] 검색량 수집 실패 또는 0: ${record.keyword}`);
            }
          } catch (searchVolumeFetchError: any) {
            clearTimeout(searchVolumeTimeout);
            if (searchVolumeFetchError.name === 'AbortError') {
              console.warn(`[ranking] 검색량 조회 타임아웃: ${record.keyword}`);
            } else {
              throw searchVolumeFetchError;
            }
          }
        } catch (searchVolumeError: any) {
          console.warn(`[ranking] 검색량 수집 실패: ${record.keyword}`, searchVolumeError?.message);
          // 검색량 수집 실패해도 랭킹은 업데이트
        }

        // 3. 데이터베이스 업데이트
        const updateData: {
          ranking: number | null;
          search_volume?: number | null;
          updated_at: string;
        } = {
          ranking: rank,
          updated_at: new Date().toISOString(),
        };

        // 검색량이 있으면 업데이트에 포함
        if (searchVolume !== null) {
          updateData.search_volume = searchVolume;
        }

        console.log(`[ranking] DB 업데이트 시도: ${record.id} / ${record.keyword}`, {
          ranking: rank,
          searchVolume: searchVolume,
          updateData,
        });

        const { data: updateResult, error } = await adminClient
          .from('blog_records')
          .update(updateData)
          .eq('id', record.id)
          .eq('keyword', record.keyword)
          .select('id, ranking, search_volume');

        if (error) {
          console.error(`[ranking] DB 업데이트 실패: ${record.id} / ${record.keyword}`, {
            error: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            updateData,
          });
        } else {
          const updatedCount = updateResult?.length || 0;
          if (updatedCount > 0) {
            console.log(`[ranking] DB 업데이트 성공: ${record.id} / ${record.keyword}`, {
              updatedRows: updatedCount,
              updatedData: updateResult?.[0],
              ranking: rank,
              searchVolume: searchVolume,
            });
            
            // Activity log 기록
            try {
              await adminClient.from('record_activity_logs').insert({
                action: 'update',
                record_id: record.id,
                keyword: record.keyword,
                actor_id: null,
                actor_name: 'crawler',
                actor_role: 'system',
                metadata: {
                  ranking: rank,
                  searchVolume: searchVolume,
                  link: matched?.link ?? null,
                  nickname: matched?.nickname ?? null,
                  fetchedAt: new Date().toISOString(),
                },
              });
            } catch (logError: any) {
              console.warn(`[ranking] Activity log 기록 실패: ${record.id} / ${record.keyword}`, logError?.message);
            }

            // 일별 랭킹 점수 기록 (오후 6시 기준)
            if (rank !== null) {
              try {
                // 한국 시간(KST) 기준으로 오후 6시 기준 날짜 계산
                const now = new Date();
                const kstFormatter = new Intl.DateTimeFormat('en-US', {
                  timeZone: 'Asia/Seoul',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  hour12: false,
                });
                
                const kstParts = kstFormatter.formatToParts(now);
                const kstHour = parseInt(kstParts.find(p => p.type === 'hour')?.value || '0', 10);
                const kstYear = parseInt(kstParts.find(p => p.type === 'year')?.value || '0', 10);
                const kstMonth = parseInt(kstParts.find(p => p.type === 'month')?.value || '0', 10);
                const kstDay = parseInt(kstParts.find(p => p.type === 'day')?.value || '0', 10);

                // 오후 6시 기준 날짜 계산 (18시 이전이면 전날)
                let targetDate = new Date(kstYear, kstMonth - 1, kstDay);
                if (kstHour < 18) {
                  targetDate.setDate(targetDate.getDate() - 1);
                }

                const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

                // 점수 계산
                let score = 0;
                let ranking1Count = 0;
                let ranking2Count = 0;
                let ranking3Count = 0;
                let notRankedCount = 0;

                if (rank === 1) {
                  score = 5;
                  ranking1Count = 1;
                } else if (rank === 2) {
                  score = 3;
                  ranking2Count = 1;
                } else if (rank === 3) {
                  score = 2;
                  ranking3Count = 1;
                } else {
                  score = 1;
                  notRankedCount = 1;
                }

                // author_name은 record.author를 우선 사용 (작성자 기준으로 순위 구분)
                const authorName = record.author?.trim() || record.id || 'unknown';
                const keyword = record.keyword?.trim() || '';

                // 같은 키워드에 대한 기존 점수 확인 (같은 키워드의 최신 랭킹만 반영)
                const { data: existingScore, error: fetchError } = await adminClient
                  .from('daily_ranking_scores')
                  .select('score, ranking_1_count, ranking_2_count, ranking_3_count, not_ranked_count')
                  .eq('author_name', authorName)
                  .eq('date', dateStr)
                  .eq('keyword', keyword)
                  .single();

                let previousScore = 0;
                let previousRanking1Count = 0;
                let previousRanking2Count = 0;
                let previousRanking3Count = 0;
                let previousNotRankedCount = 0;

                // 기존 점수가 있으면 이전 점수를 제거하고 새 점수로 교체
                if (existingScore && !fetchError) {
                  previousScore = existingScore.score || 0;
                  previousRanking1Count = existingScore.ranking_1_count || 0;
                  previousRanking2Count = existingScore.ranking_2_count || 0;
                  previousRanking3Count = existingScore.ranking_3_count || 0;
                  previousNotRankedCount = existingScore.not_ranked_count || 0;
                  console.log(`[ranking] 기존 점수 발견 (같은 키워드): ${authorName} / ${keyword} / ${dateStr} / 이전 점수: ${previousScore} → 새 점수: ${score}`);
                }

                // upsert로 일별 점수 업데이트 (키워드별로 구분)
                const { error: scoreError } = await adminClient
                  .from('daily_ranking_scores')
                  .upsert(
                    {
                      author_name: authorName,
                      date: dateStr,
                      keyword: keyword,
                      score: score,
                      ranking_1_count: ranking1Count,
                      ranking_2_count: ranking2Count,
                      ranking_3_count: ranking3Count,
                      not_ranked_count: notRankedCount,
                    },
                    {
                      onConflict: 'author_name,date,keyword',
                      ignoreDuplicates: false,
                    }
                  );

                if (scoreError) {
                  console.warn(`[ranking] 일별 점수 기록 실패: ${record.id} / ${record.keyword}`, scoreError?.message);
                } else {
                  if (previousScore > 0) {
                    console.log(`[ranking] 일별 점수 업데이트 성공: ${authorName} / ${keyword} / ${dateStr} / rank: ${rank} / 이전: ${previousScore}점 → 현재: ${score}점`);
                  } else {
                    console.log(`[ranking] 일별 점수 기록 성공: ${authorName} / ${keyword} / ${dateStr} / rank: ${rank} / score: ${score}점`);
                  }
                }
              } catch (scoreError: any) {
                console.warn(`[ranking] 일별 점수 계산 실패: ${record.id} / ${record.keyword}`, scoreError?.message);
              }
            }
          } else {
            console.warn(`[ranking] DB 업데이트: 매칭되는 행이 없음 (0개 업데이트됨): ${record.id} / ${record.keyword}`);
          }
        }

        results.push({
          id: record.id,
          keyword: record.keyword,
          ranking: rank,
          searchVolume: searchVolume,
          nickname: matched?.nickname ?? null,
          link: matched?.link ?? null,
          success: !error && (updateResult?.length || 0) > 0,
          error: error?.message ?? null,
        });
      } catch (err: any) {
        console.error(`[ranking] ${record.keyword} 처리 실패`, err);
        results.push({
          id: record.id,
          keyword: record.keyword,
          ranking: null,
          searchVolume: null,
          success: false,
          error: err?.message ?? '스마트블록 조회 실패',
        });
      }

      // API 호출 간격 조절 (1시간마다 실행되므로 최소 딜레이만 유지)
      if (records.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 여러 레코드 조회 시에만 1초 대기
      }
    }

    console.log('[ranking] debug', {
      requestedKeyword: keywordParam,
      recordCount: records.length,
      records,
      results,
    });

    return NextResponse.json({
      success: true,
      updated: results,
    });
  } catch (error: any) {
    console.error('[ranking] 업데이트 실패', error);
    return NextResponse.json(
      { error: error?.message ?? '랭킹 수집 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

async function fetchSmartblockEntries(
  keyword: string,
  request: NextRequest,
  timeout: number = 30000
): Promise<Awaited<ReturnType<typeof fetchNaverRanking>>> {
  try {
    const smartblockUrl = new URL('/api/smartblock', request.url);
    
    // 타임아웃을 위한 AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(smartblockUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ keyword }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[ranking] 스마트블록 API 응답 실패: ${response.status} - ${keyword}`);
        return [];
      }

      const json = await response.json();
      const smartBlocks = Array.isArray(json.smartBlocks) ? json.smartBlocks : [];
      const results: Awaited<ReturnType<typeof fetchNaverRanking>> = [];

    const extractBlogId = (value?: string | null): string | null => {
      if (!value) return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      const directMatch = trimmed.match(/blog\.naver\.com\/([^/?#]+)/);
      if (directMatch) return directMatch[1].toLowerCase();
      const fromUrl = extractBlogIdFromUrl(trimmed);
      return fromUrl ? fromUrl.toLowerCase() : null;
    };

    // 스마트블록과 일반 검색 결과를 구분
    const smartBlockBlocks = smartBlocks.filter(
      (block: any) => block?.title && !block.title.includes('일반 검색 결과')
    );
    const generalSearchBlocks = smartBlocks.filter(
      (block: any) => block?.title && block.title.includes('일반 검색 결과')
    );

    // 1. 스마트블록 처리
    for (const block of smartBlockBlocks) {
      const items = Array.isArray(block?.data) ? block.data : [];
      items.forEach((item: any, index: number) => {
        const rawBlogId =
          typeof item?.authorId === 'string'
            ? item.authorId
            : typeof item?.blogId === 'string'
            ? item.blogId
            : undefined;
        const blogId =
          extractBlogId(rawBlogId) ??
          extractBlogId(typeof item?.profileLink === 'string' ? item.profileLink : undefined) ??
          extractBlogId(typeof item?.link === 'string' ? item.link : undefined);

        const nicknameRaw =
          typeof item?.author === 'string'
            ? item.author
            : typeof item?.nickname === 'string'
            ? item.nickname
            : undefined;
        const nickname = nicknameRaw ? nicknameRaw.trim() : undefined;

        if (!blogId && !nickname) {
          return;
        }

        const title =
          typeof item?.title === 'string' ? item.title.trim() : '';
        const link =
          typeof item?.link === 'string' ? item.link : '';
        const snippet =
          typeof item?.content === 'string' ? item.content.trim() : undefined;

        // ader.naver.com/v1/ 링크 제외
        if (link && link.startsWith('https://ader.naver.com/v1/')) {
          return;
        }

        results.push({
          keyword,
          blogId: blogId ?? '',
          title,
          link,
          rank: 0, // 나중에 재계산
          nickname,
          snippet,
        });
      });
    }

    // 스마트블록에서 필터링 후 실제 추가된 항목 수 계산 (일반 검색 결과의 rank 오프셋 계산용)
    const smartBlockItemCount = results.length;

    // 2. 일반 검색 결과 처리 (스마트블록이 없으면 1등부터, 있으면 스마트블록 다음 순위부터)
    for (const block of generalSearchBlocks) {
      const items = Array.isArray(block?.data) ? block.data : [];
      items.forEach((item: any, index: number) => {
        const rawBlogId =
          typeof item?.authorId === 'string'
            ? item.authorId
            : typeof item?.blogId === 'string'
            ? item.blogId
            : undefined;
        const blogId =
          extractBlogId(rawBlogId) ??
          extractBlogId(typeof item?.profileLink === 'string' ? item.profileLink : undefined) ??
          extractBlogId(typeof item?.link === 'string' ? item.link : undefined);

        const nicknameRaw =
          typeof item?.author === 'string'
            ? item.author
            : typeof item?.nickname === 'string'
            ? item.nickname
            : undefined;
        const nickname = nicknameRaw ? nicknameRaw.trim() : undefined;

        if (!blogId && !nickname) {
          return;
        }

        const title =
          typeof item?.title === 'string' ? item.title.trim() : '';
        const link =
          typeof item?.link === 'string' ? item.link : '';
        const snippet =
          typeof item?.content === 'string' ? item.content.trim() : undefined;

        // ader.naver.com/v1/ 링크 제외
        if (link && link.startsWith('https://ader.naver.com/v1/')) {
          return;
        }

        results.push({
          keyword,
          blogId: blogId ?? '',
          title,
          link,
          rank: 0, // 나중에 재계산
          nickname,
          snippet,
        });
      });
    }

    // 필터링 후 순위 재계산 (1부터 시작)
    results.forEach((result, index) => {
      result.rank = index + 1;
    });

      return results;
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.warn(`[ranking] 스마트블록 조회 타임아웃 (${timeout}ms): ${keyword}`);
      } else {
        console.error(`[ranking] 스마트블록 기반 순위 수집 실패: ${keyword}`, fetchError?.message);
      }
      return [];
    }
  } catch (error) {
    console.error('[ranking] 스마트블록 기반 순위 수집 실패', error);
    return [];
  }
}

