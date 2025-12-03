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

// --- [New Helper: 개별 레코드 처리 로직 분리] ---

async function processRecord(
  record: BlogRecord,
  request: NextRequest,
  adminClient: any,
  retryCount: number = 0
): Promise<{
  id: string;
  keyword: string;
  ranking: number | null;
  searchVolume: number | null;
  success: boolean;
  error: string | null;
}> {
  const MAX_RETRIES = 2; // 최대 2회 재시도
  try {
    console.log(`[ranking] 처리 중: ${record.keyword} (${record.id})${retryCount > 0 ? ` [재시도 ${retryCount}/${MAX_RETRIES}]` : ''}`);
    
    // 1. 랭킹 가져오기 (재시도 로직 포함)
    let entries: Awaited<ReturnType<typeof fetchNaverRanking>> = [];
    let fetchError: any = null;
    
    try {
      entries = await fetchSmartblockEntries(record.keyword, request);
    } catch (err: any) {
      fetchError = err;
      console.warn(`[ranking] ${record.keyword} (${record.id}) - 스마트블록 가져오기 실패:`, err?.message);
      // 재시도 가능한 경우 재시도
      if (retryCount < MAX_RETRIES && (err?.message?.includes('timeout') || err?.message?.includes('abort') || !err?.message)) {
        console.log(`[ranking] ${record.keyword} (${record.id}) - 재시도 예정...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1))); // 재시도 간격 증가
        return processRecord(record, request, adminClient, retryCount + 1);
      }
    }
    
    const rankedEntries = entries.filter(e => e.rank !== null && e.rank !== undefined);
    console.log(`[ranking] ${record.keyword} (${record.id}) - 가져온 항목 수: ${entries.length}, 순위 있는 항목: ${rankedEntries.length}`);
    
    if (rankedEntries.length === 0 && !fetchError) {
      console.warn(`[ranking] ${record.keyword} (${record.id}) - 순위 있는 항목이 없음`);
    }
    
    // 간단한 매칭 로직: 아이디와 키워드만 확인
    const normalizedRecordKeyword = normalizeKeywordForComparison(record.keyword);
    const normalizedRecordId = record.id?.trim().toLowerCase() || null;
    const normalizedRecordAuthor = record.author?.trim().toLowerCase() || null;
    
    let matched: Awaited<ReturnType<typeof fetchNaverRanking>>[number] | null = null;
    let matchReason = '';
    
    // 1. 키워드가 일치하는 항목들 중에서
    // 2. 아이디(blogId) 또는 닉네임(author)이 일치하는 항목 찾기
    for (const entry of rankedEntries) {
      // 키워드 확인
      const normalizedEntryKeyword = normalizeKeywordForComparison(entry.keyword);
      if (normalizedEntryKeyword !== normalizedRecordKeyword) {
        continue; // 키워드가 다르면 스킵
      }
      
      // 아이디(blogId) 확인
      const normalizedEntryBlogId = typeof entry.blogId === 'string' && entry.blogId.trim()
        ? entry.blogId.trim().toLowerCase()
        : null;
      
      // 닉네임 확인
      const normalizedEntryNickname = entry.nickname?.trim().toLowerCase() || null;
      
      // 아이디 일치 또는 닉네임 일치
      const blogIdMatch = normalizedEntryBlogId && normalizedRecordId && normalizedEntryBlogId === normalizedRecordId;
      const nicknameMatch = normalizedEntryNickname && normalizedRecordAuthor && normalizedEntryNickname === normalizedRecordAuthor;
      
      if (blogIdMatch || nicknameMatch) {
        matched = entry;
        matchReason = blogIdMatch 
          ? `아이디 일치 (${normalizedEntryBlogId}, 순위: ${entry.rank})`
          : `닉네임 일치 (${normalizedEntryNickname}, 순위: ${entry.rank})`;
        break; // 첫 번째 매칭 항목 사용
      }
    }
    
    if (matched) {
      console.log(`[ranking] ${record.keyword} (${record.id}) - 매칭 성공! [${matchReason}] 순위: ${matched.rank}, 블록: ${matched.blockTitle || 'N/A'}, blogId: ${matched.blogId}, nickname: ${matched.nickname || 'N/A'}`);
    } else {
      // 매칭 실패 시 상세 정보 로깅
      const topEntries = rankedEntries.slice(0, 10).map(e => ({
        rank: e.rank,
        blogId: e.blogId,
        nickname: e.nickname,
        keyword: e.keyword,
        title: e.title?.substring(0, 40),
        blockTitle: e.blockTitle,
        link: e.link?.substring(0, 60)
      }));
      console.warn(`[ranking] ${record.keyword} (${record.id}) - 매칭 실패 (미노출).`, {
        recordId: normalizedRecordId,
        recordAuthor: record.author?.trim().toLowerCase() || null,
        recordKeyword: normalizedRecordKeyword,
        topEntries,
        totalRankedEntries: rankedEntries.length
      });
    }

    // 실제 DB에 반영될 순위 (entry.rank는 스마트블록에서 index + 1로 설정된 실제 순위)
    // 매칭이 안 되면 null (미노출)로 처리
    let rank: number | null = null;
    
    if (matched) {
      // 매칭 검증: matched가 있으면 rank가 반드시 있어야 함
      if (matched.rank === null || matched.rank === undefined) {
        console.warn(`[ranking] ${record.keyword} (${record.id}) - 매칭되었지만 rank가 null입니다. 미노출로 처리합니다.`);
        rank = null;
      } else {
        rank = matched.rank;
      }
      console.log(`[ranking] 결과: ${record.keyword} (${record.id}) -> rank: ${rank} (실제 순위: ${matched.rank}, 블록: ${matched.blockTitle || 'N/A'}, index: ${matched.blockRank || 'N/A'})`);
    } else {
      rank = null;
      console.log(`[ranking] 결과: ${record.keyword} (${record.id}) -> rank: null (미노출 - 순위나 리스트에 없음)`);
    }

    // 2. 검색량 가져오기 (병렬 처리를 위해 타임아웃 5초로 단축)
    let searchVolume: number | null = null;
    try {
      const searchVolumeController = new AbortController();
      const searchVolumeTimeout = setTimeout(() => searchVolumeController.abort(), 5000);
      try {
        const searchCountResult = await fetchNaverSearchCountFromKeywordTool(record.keyword);
        clearTimeout(searchVolumeTimeout);
        if (searchCountResult.total !== null && searchCountResult.total > 0) {
          searchVolume = searchCountResult.total;
        }
      } catch (e) {
        clearTimeout(searchVolumeTimeout);
        // 검색량 실패는 무시 (랭킹은 계속 진행)
      }
    } catch (e) {
      // 검색량 실패는 무시
    }

    // 3. 데이터베이스 업데이트
    const updateData: any = {
      ranking: rank,
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

    // Activity Log 기록 (매칭 성공 여부와 관계없이 크롤링 실행 추적)
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
            matched: matched !== null, // 매칭 성공 여부
            matchReason: matched ? matchReason : null, // 매칭 이유
            link: matched?.link ?? null,
            nickname: matched?.nickname ?? null,
            fetchedAt: new Date().toISOString(),
            blockTitle: matchedAny?.blockTitle ?? null,
            blockRank: matchedAny?.blockRank ?? null,
            entriesCount: entries.length, // 가져온 항목 수
            rankedEntriesCount: entries.filter(e => e.rank !== null && e.rank !== undefined).length, // 순위 있는 항목 수
            retryCount: retryCount, // 재시도 횟수
          },
        });
      } catch (logError) {
        console.warn('[ranking] 로그 기록 실패', logError);
      }
    } else if (error) {
      console.error(`[ranking] DB 업데이트 실패: ${record.id}`, error.message);
    }

    return {
      id: record.id,
      keyword: record.keyword,
      ranking: rank,
      searchVolume: searchVolume,
      success: !error && (updateResult?.length || 0) > 0,
      error: error?.message ?? null,
    };
  } catch (err: any) {
    console.error(`[ranking] ${record.keyword} 처리 에러`, err);
    return {
      id: record.id,
      keyword: record.keyword,
      ranking: null,
      searchVolume: null,
      success: false,
      error: err?.message ?? 'Unknown Error',
    };
  }
}

// --- [Main Handler] ---

export async function GET(request: NextRequest) {
  let records: BlogRecord[] = [];
  let allResults: Array<{
    id: string;
    keyword: string;
    ranking: number | null;
    searchVolume: number | null;
    success: boolean;
    error: string | null;
  }> = [];
  
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
      // 파라미터가 없으면 모든 레코드 처리 (전체 레코드 가져오기)
      const query = adminClient
        .from('blog_records')
        .select('id, keyword, link, title, author')
        .order('created_at', { ascending: false });
      
      if (limit && limit > 0) {
        // limit이 명시적으로 지정된 경우에만 제한 적용
        const { data } = await query.limit(limit);
      records = data ?? [];
        console.log(`[ranking] 제한된 레코드 조회: ${records.length}개 (limit: ${limit})`);
          } else {
        // limit이 없으면 모든 레코드 가져오기 (페이지네이션)
        // 배포 환경에서 안정적으로 작동하도록 각 페이지마다 새로운 쿼리 생성
        let allRecords: BlogRecord[] = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        const maxPages = 100; // 최대 100페이지 (10만개) 제한으로 무한 루프 방지

        while (hasMore && page < maxPages) {
          try {
            // 각 페이지마다 새로운 쿼리 생성 (중요: Supabase 쿼리 재사용 시 문제 발생 가능)
            const { data, error } = await adminClient
              .from('blog_records')
              .select('id, keyword, link, title, author')
              .order('created_at', { ascending: false })
              .range(page * pageSize, (page + 1) * pageSize - 1);
            
            if (error) {
              console.error(`[ranking] 페이지 ${page + 1} 조회 오류:`, error);
              // 에러가 발생해도 이미 가져온 데이터는 유지하고 중단
              break;
            }

            if (data && data.length > 0) {
              allRecords = [...allRecords, ...data];
              page++;
              hasMore = data.length === pageSize;
              console.log(`[ranking] 페이지 ${page} 조회 완료: ${data.length}개 (누적: ${allRecords.length}개)`);
              
              // 배포 환경에서 메모리 관리를 위해 주기적으로 로깅
              if (page % 10 === 0) {
                console.log(`[ranking] 진행 상황: ${allRecords.length}개 레코드 로드됨 (${page}페이지)`);
              }
            } else {
              hasMore = false;
          }
          } catch (pageError: any) {
            console.error(`[ranking] 페이지 ${page + 1} 처리 중 예외 발생:`, pageError?.message);
            // 예외 발생 시 이미 가져온 데이터는 유지하고 중단
            break;
          }
        }

        records = allRecords;
        console.log(`[ranking] 전체 레코드 조회 완료: ${records.length}개`);
        
        if (page >= maxPages) {
          console.warn(`[ranking] 경고: 최대 페이지 수(${maxPages})에 도달했습니다. 일부 레코드가 누락되었을 수 있습니다.`);
        }
      }
    }

    console.log(`[ranking] 시작: 총 ${records.length}개 처리 예정`);
    const startTime = Date.now();
            
    // 크롤링 시작 로그 기록
            try {
              await adminClient.from('record_activity_logs').insert({
                action: 'update',
        record_id: null, // 전체 크롤링이므로 record_id 없음
        keyword: null,
                actor_name: 'crawler',
                actor_role: 'system',
                metadata: {
          type: 'crawler_start',
          totalRecords: records.length,
          startedAt: new Date().toISOString(),
                },
              });
    } catch (logError) {
      console.warn('[ranking] 크롤링 시작 로그 기록 실패', logError);
    }

    // **BATCH PROCESSING (병렬 처리)**
    // 배포 환경에서 안정적으로 작동하도록 배치 크기와 지연 시간 조정
    // 순위를 확실하게 가져오기 위해 배치 크기를 줄이고 대기 시간을 늘림
    const BATCH_SIZE = 2; // 한 번에 2개씩 실행 (네이버 차단 방지 및 안정성 향상)
    const BATCH_DELAY_MS = 2000; // 배치 간 2초 대기 (서버 부하 방지 및 네이버 차단 방지)
    const ITEM_DELAY_MS = 500; // 배치 내 항목 간 0.5초 대기 (추가 안정성)

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      // 2개씩 잘라서 가져옴
      const batch = records.slice(i, i + BATCH_SIZE);
      
      console.log(`[Batch] ${i + 1}~${i + batch.length}번째 항목 처리 중... (총 ${records.length}개 중)`);
      
      try {
        // 2개를 동시에 실행하되, 각 항목 간 약간의 지연 추가
        const batchResults = await Promise.allSettled(
          batch.map((record, idx) => {
            // 첫 번째 항목은 즉시 실행, 나머지는 지연
            if (idx === 0) {
              return processRecord(record, request, adminClient);
            } else {
              return new Promise((resolve) => {
                setTimeout(() => {
                  processRecord(record, request, adminClient).then(resolve).catch(resolve);
                }, ITEM_DELAY_MS);
              });
            }
          })
        );
        
        // 성공/실패 결과 분리
        const successful = batchResults
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
          .map(r => r.value);
        const failed = batchResults
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map(r => ({ error: r.reason?.message || 'Unknown error' }));
        
        allResults.push(...successful);
        
        // 실패한 항목도 결과에 포함 (에러 정보 포함)
        if (failed.length > 0) {
          console.warn(`[ranking] 배치 ${Math.floor(i / BATCH_SIZE) + 1}에서 ${failed.length}개 항목 처리 실패`);
          failed.forEach((f, idx) => {
            const record = batch[idx];
            if (record) {
              allResults.push({
          id: record.id,
          keyword: record.keyword,
                ranking: null,
                searchVolume: null,
                success: false,
                error: f.error,
        });
            }
          });
        }
      } catch (batchError: any) {
        console.error(`[ranking] 배치 ${Math.floor(i / BATCH_SIZE) + 1} 처리 중 예외 발생:`, batchError?.message);
        // 배치 전체가 실패해도 다음 배치는 계속 처리
        batch.forEach(record => {
          allResults.push({
          id: record.id,
          keyword: record.keyword,
          ranking: null,
          searchVolume: null,
          success: false,
            error: batchError?.message || 'Batch processing error',
          });
        });
      }

      // 배치 간 휴식 (서버 부하 방지 및 네이버 차단 방지)
      if (i + BATCH_SIZE < records.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
      
      // 진행 상황 로깅 (배포 환경에서도 모니터링 가능하도록)
      const processedCount = allResults.length;
      const successCount = allResults.filter(r => r.success).length;
      if (processedCount % 10 === 0 || processedCount === records.length) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const progressPercent = Math.round((processedCount / records.length) * 100);
        console.log(`[ranking] 진행 상황: ${processedCount}/${records.length}개 처리 완료 (${progressPercent}%, 성공: ${successCount}개, 경과: ${elapsed}초)`);
      }
    }

    const endTime = Date.now();
    const totalTime = Math.round((endTime - startTime) / 1000);
    const successCount = allResults.filter(r => r.success).length;
    const rankingUpdatedCount = allResults.filter(r => r.success && r.ranking !== null).length;
    const searchVolumeUpdatedCount = allResults.filter(r => r.success && r.searchVolume !== null).length;
    
    console.log(`[ranking] 완료: 총 ${records.length}개 중 ${allResults.length}개 처리, ${successCount}개 성공 (총 소요 시간: ${totalTime}초)`);
    
    // 크롤링 완료 로그 기록
    try {
      await adminClient.from('record_activity_logs').insert({
        action: 'update',
        record_id: null, // 전체 크롤링이므로 record_id 없음
        keyword: null,
        actor_name: 'crawler',
        actor_role: 'system',
        metadata: {
          type: 'crawler_complete',
          totalRecords: records.length,
          processed: allResults.length,
          success: successCount,
          rankingUpdated: rankingUpdatedCount,
          searchVolumeUpdated: searchVolumeUpdatedCount,
          totalTimeSeconds: totalTime,
          completedAt: new Date().toISOString(),
        },
    });
    } catch (logError) {
      console.warn('[ranking] 크롤링 완료 로그 기록 실패', logError);
    }

    return NextResponse.json({
      success: true,
      updated: allResults,
      summary: {
        total: records.length,
        processed: allResults.length,
        success: successCount,
        totalTimeSeconds: totalTime,
      },
    });
  } catch (error: any) {
    console.error('[ranking] 전체 처리 중 오류 발생:', error);
    
    // 타임아웃이나 오류가 발생해도 처리된 결과는 반환
    if (allResults.length > 0) {
      console.log(`[ranking] 오류 발생했지만 처리된 ${allResults.length}개 결과 반환`);
      return NextResponse.json({
        success: false,
        error: error?.message ?? 'Server Error',
        updated: allResults,
        summary: {
          total: records?.length || 0,
          processed: allResults.length,
          success: allResults.filter(r => r.success).length,
          partial: true, // 부분 처리됨을 표시
        },
      });
    }
    
    return NextResponse.json(
      { 
        error: error?.message ?? 'Server Error',
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      },
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

    // 2. 모든 스마트블록 처리 (각 블록의 항목에 순위 부여)
    // 인기글 블록이 있으면 우선 처리, 그 다음 다른 블록들 처리
    const seenEntries = new Map<string, { rank: number; blockTitle: string; blockRank: number }>();
    const getEntryKey = (link: string, blogId: string) => 
      `${normalizeUrl(link)?.toLowerCase()}|${blogId.toLowerCase()}`;

    // 2-1. 인기글 블록 우선 처리
    if (popularBlock) {
      const items = Array.isArray(popularBlock.data) ? popularBlock.data : [];
      console.log(`[ranking] ${keyword} - 인기글 블록 처리: "${popularBlock.title}" (항목 수: ${items.length})`);
      
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
        const actualRank = index + 1;

        // 인기글 블록은 우선순위가 높으므로 항상 저장 (덮어쓰기)
        seenEntries.set(entryKey, {
          rank: actualRank,
          blockTitle: popularBlock.title,
          blockRank: actualRank,
        });

        results.push({
          keyword,
          blogId: blogId ?? '',
          title,
          link,
          rank: actualRank,
          nickname,
          snippet: item?.content,
          blockTitle: popularBlock.title,
          blockRank: actualRank,
        } as any);
      });
    }

    // 2-2. 나머지 스마트블록 처리 (각 블록의 순위 부여)
    for (const block of smartBlockBlocks) {
      if (block === popularBlock) continue; // 인기글 블록은 이미 처리함
      
      const items = Array.isArray(block.data) ? block.data : [];
      console.log(`[ranking] ${keyword} - 블록 처리: "${block.title}" (항목 수: ${items.length})`);
      
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
        const actualRank = index + 1;

        // 이미 인기글 블록에 있으면 순위 유지, 없으면 이 블록의 순위 사용
        const existing = seenEntries.get(entryKey);
        if (!existing) {
          // 이 블록에서 처음 발견된 항목이면 순위 부여
          seenEntries.set(entryKey, {
            rank: actualRank,
            blockTitle: block.title,
            blockRank: actualRank,
          });

        results.push({
          keyword,
          blogId: blogId ?? '',
          title,
          link,
            rank: actualRank, // 이 블록의 순위 부여
          nickname,
            snippet: item?.content,
            blockTitle: block.title,
            blockRank: actualRank,
          } as any);
        } else {
          // 이미 다른 블록에 있으면 순위는 유지하되, 정보만 추가 (중복 방지)
          // 인기글 블록이 아닌 경우에만 추가 정보로 기록
          if (existing.blockTitle.includes('인기글')) {
            // 인기글 블록에 이미 있으면 추가하지 않음
            return;
          }
        }
      });
    }

      return results;
  } catch (fetchError) {
    console.error(`[ranking] 스마트블록 에러: ${keyword}`, fetchError);
    return [];
  }
}