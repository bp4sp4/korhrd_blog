import { load } from 'cheerio';

export interface NaverSearchResult {
  keyword: string;
  blogId: string;
  title: string;
  link: string;
  nickname?: string;
  snippet?: string;
  rank: number;
}

const NAVER_REVIEW_ENDPOINT =
  'https://s.search.naver.com/p/review/50/search.naver';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

/**
 * 네이버 검색 결과(블로그/카페 혼합)에서 키워드 상위 노출 항목을 파싱합니다.
 * 네이버 페이지 구조 변경 시 이 함수도 함께 수정해야 합니다.
 */
export async function fetchNaverRanking(
  keyword: string,
  options?: { userAgent?: string }
): Promise<NaverSearchResult[]> {
  const queryParams = new URLSearchParams({
    query: keyword,
    where: 'nexearch',
    sm: 'tab_jum',
  });

  const response = await fetch(`${NAVER_REVIEW_ENDPOINT}?${queryParams.toString()}`, {
    headers: {
      'User-Agent': options?.userAgent ?? DEFAULT_USER_AGENT,
      Referer: 'https://www.naver.com/',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`네이버 검색 요청 실패 (status: ${response.status})`);
  }

  const html = await response.text();
  const $ = load(html);
  const result: NaverSearchResult[] = [];

  const extractBlogId = (href?: string | null): string | null => {
    if (!href) return null;
    const directMatch = href.match(/blog\.naver\.com\/([^/?#]+)/);
    if (directMatch) return directMatch[1];
    try {
      const urlObj = new URL(href);
      if (urlObj.hostname !== 'blog.naver.com') return null;
      const segments = urlObj.pathname.split('/').filter(Boolean);
      if (segments.length > 0) {
        return segments[0];
      }
      const queryId = urlObj.searchParams.get('blogId');
      if (queryId) return queryId;
    } catch {
      // ignore invalid url
    }
    return null;
  };

  const smartBlockModules = $('.fds-ugc-block-mod');

  if (smartBlockModules.length > 0) {
    smartBlockModules.each((idx, element) => {
      const rank = idx + 1;
      const profileAnchor = $(element).find('a.fds-thumb-anchor').first();
      const profileHref = profileAnchor.attr('href') ?? '';
      let blogId = extractBlogId(profileHref);

      const titleAnchor = $(element).find('a.fds-comps-right-image-text-title').first();
      const articleHref = titleAnchor.attr('href') ?? profileHref;
      if (!blogId) {
        blogId = extractBlogId(articleHref);
      }

      if (!blogId) {
        return;
      }

      const nicknameElement = $(element)
        .find('.fds-info-inner-text .fds-comps-text, .fds-info-text-group .fds-comps-text')
        .first();
      const nickname = nicknameElement.text().trim() || undefined;

      const title = titleAnchor.text().trim();

      const snippetElement = $(element)
        .find('.fds-comps-right-image-text-content .fds-comps-text')
        .first();
      const snippet = snippetElement.text().trim() || undefined;

      result.push({
        keyword,
        blogId,
        title,
        link: articleHref,
        nickname,
        snippet,
        rank,
      });
    });
  }

  if (result.length === 0) {
    $('.sds-comps-vertical-layout[data-template-id="ugcItem"]').each((idx, element) => {
      const rank = idx + 1;
      const profileAnchor = $(element).find('a.jyxwDwu8umzdhCQxX48l').first();
      const titleElement = $(element).find('.sds-comps-text-type-headline1').first();
      const link = profileAnchor.attr('href') ?? '';
      const title = titleElement.text().trim();

      let blogId = extractBlogId(link);

      if (!blogId) {
        return;
      }

      result.push({
        keyword,
        blogId,
        title,
        link,
        rank,
      });
    });
  }

  return result;
}

