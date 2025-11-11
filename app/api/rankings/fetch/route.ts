import { createAdminClient } from '@/lib/supabase/admin';
import { fetchNaverRanking } from '@/lib/naver/ranking';
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
      if (url.hostname === 'blog.naver.com') {
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
        const entries = await fetchSmartblockEntries(record.keyword, request);
        const matched = entries.find(
          (entry) =>
            entry.blogId &&
            entry.blogId.toLowerCase() === record.id.toLowerCase()
        );

        const rank = matched ? matched.rank : null;

        const { error } = await adminClient
          .from('blog_records')
          .update({
            ranking: rank,
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
              ranking: rank,
              link: matched?.link ?? null,
              nickname: matched?.nickname ?? null,
              fetchedAt: new Date().toISOString(),
            },
          });
        }

        results.push({
          id: record.id,
          keyword: record.keyword,
          ranking: rank,
          nickname: matched?.nickname ?? null,
          link: matched?.link ?? null,
          success: !error,
          error: error?.message ?? null,
        });
      } catch (err: any) {
        console.error(`[ranking] ${record.keyword} 처리 실패`, err);
        results.push({
          id: record.id,
          keyword: record.keyword,
          ranking: null,
          success: false,
          error: err?.message ?? '스마트블록 조회 실패',
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 800));
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
  request: NextRequest
): Promise<Awaited<ReturnType<typeof fetchNaverRanking>>> {
  try {
    const smartblockUrl = new URL('/api/smartblock', request.url);
    const response = await fetch(smartblockUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({ keyword }),
    });

    if (!response.ok) {
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

    for (const block of smartBlocks) {
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

        results.push({
          keyword,
          blogId: blogId ?? '',
          title,
          link,
          rank: index + 1,
          nickname,
          snippet,
        });
      });
    }

    return results;
  } catch (error) {
    console.error('[ranking] 스마트블록 기반 순위 수집 실패', error);
    return [];
  }
}

