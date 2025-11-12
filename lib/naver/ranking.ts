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

export interface NaverSearchVolumeResult {
  /** 상대 지수 (최대값 100 기준, 평균값) */
  ratio: number | null;
  /** 한 달 동안의 총 상대 지수 합계 (PC + Mobile) */
  totalRatio: number | null;
  /** 최대 상대 지수 */
  maxRatio: number | null;
  /** 최소 상대 지수 */
  minRatio: number | null;
  /** 데이터 포인트 개수 (일수) */
  dataPoints: number;
  /** PC 상대 지수 (평균값) */
  pcRatio: number | null;
  /** Mobile 상대 지수 (평균값) */
  mobileRatio: number | null;
  /** 한 달 동안 PC + Mobile 합계 상대 지수 */
  totalCombinedRatio: number | null;
  /** PC 한 달 총합 */
  pcTotalRatio: number | null;
  /** Mobile 한 달 총합 */
  mobileTotalRatio: number | null;
  /** 원본 API 응답 데이터 (디버깅용) */
  rawData?: any;
}

/**
 * 네이버 데이터랩 API에서 키워드 검색량을 가져옵니다.
 * 네이버 데이터랩 검색어 트렌드 API를 사용합니다.
 * 
 * @param keyword 검색할 키워드
 * @param options API 인증 정보 (clientId, clientSecret)
 * @returns 검색량 정보 (상대 지수 및 통계)
 */
export async function fetchNaverSearchVolume(
  keyword: string,
  options?: { clientId?: string; clientSecret?: string }
): Promise<NaverSearchVolumeResult> {
  try {
    const clientId = options?.clientId ?? process.env.NAVER_CLIENT_ID;
    const clientSecret = options?.clientSecret ?? process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.warn('[searchVolume] 네이버 API 키가 설정되지 않았습니다.');
      return {
        ratio: null,
        totalRatio: null,
        maxRatio: null,
        minRatio: null,
        dataPoints: 0,
        pcRatio: null,
        mobileRatio: null,
        totalCombinedRatio: null,
        pcTotalRatio: null,
        mobileTotalRatio: null,
      };
    }

    // 최근 1개월 데이터 조회
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);

    const formatDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const baseRequestBody = {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      timeUnit: 'date', // 일별 데이터로 변경하여 한 달 동안의 총 검색량 계산
      keywordGroups: [
        {
          groupName: keyword,
          keywords: [keyword],
        },
      ],
      ages: [],
      gender: '',
    };

    // PC와 Mobile을 각각 조회
    const [pcResponse, mobileResponse] = await Promise.all([
      fetch('https://openapi.naver.com/v1/datalab/search', {
        method: 'POST',
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...baseRequestBody,
          device: 'pc',
        }),
        cache: 'no-store',
      }),
      fetch('https://openapi.naver.com/v1/datalab/search', {
        method: 'POST',
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...baseRequestBody,
          device: 'mo',
        }),
        cache: 'no-store',
      }),
    ]);

    const processResponse = async (response: Response, deviceName: string) => {
      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[searchVolume] ${deviceName} API 요청 실패 (status: ${response.status})`, errorText);
        return null;
      }

      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        if (result.data && result.data.length > 0) {
          const values = result.data.map((item: any) => item.ratio || 0).filter((val: number) => val > 0);
          if (values.length > 0) {
            const sum = values.reduce((acc: number, val: number) => acc + val, 0);
            const average = sum / values.length;
            return { average, sum, values, data };
          }
        }
      }
      return null;
    };

    const pcData = await processResponse(pcResponse, 'PC');
    const mobileData = await processResponse(mobileResponse, 'Mobile');

    // PC와 Mobile 데이터 결합
    if (pcData && mobileData) {
      const pcValues = pcData.values;
      const mobileValues = mobileData.values;
      const combinedValues = [...pcValues, ...mobileValues];

      const combinedSum = pcData.sum + mobileData.sum;
      const combinedAverage = combinedSum / combinedValues.length;
      const combinedMax = Math.max(...combinedValues);
      const combinedMin = Math.min(...combinedValues);

      return {
        ratio: Math.round(combinedAverage * 100) / 100,
        totalRatio: Math.round(combinedSum * 100) / 100,
        maxRatio: Math.round(combinedMax * 100) / 100,
        minRatio: Math.round(combinedMin * 100) / 100,
        dataPoints: combinedValues.length,
        pcRatio: Math.round((pcData.average) * 100) / 100,
        mobileRatio: Math.round((mobileData.average) * 100) / 100,
        totalCombinedRatio: Math.round(combinedSum * 100) / 100,
        pcTotalRatio: Math.round((pcData.sum) * 100) / 100,
        mobileTotalRatio: Math.round((mobileData.sum) * 100) / 100,
        rawData: { pc: pcData.data, mobile: mobileData.data },
      };
    } else if (pcData || mobileData) {
      // 하나만 성공한 경우
      const data = pcData || mobileData!;
      return {
        ratio: Math.round((data.average) * 100) / 100,
        totalRatio: Math.round((data.sum) * 100) / 100,
        maxRatio: Math.round(Math.max(...data.values) * 100) / 100,
        minRatio: Math.round(Math.min(...data.values) * 100) / 100,
        dataPoints: data.values.length,
        pcRatio: pcData ? Math.round((pcData.average) * 100) / 100 : null,
        mobileRatio: mobileData ? Math.round((mobileData.average) * 100) / 100 : null,
        totalCombinedRatio: Math.round((data.sum) * 100) / 100,
        pcTotalRatio: pcData ? Math.round((pcData.sum) * 100) / 100 : null,
        mobileTotalRatio: mobileData ? Math.round((mobileData.sum) * 100) / 100 : null,
        rawData: { pc: pcData?.data, mobile: mobileData?.data },
      };
    }

    console.warn(`[searchVolume] 검색량 정보를 찾을 수 없음: ${keyword}`);
    return {
      ratio: null,
      totalRatio: null,
      maxRatio: null,
      minRatio: null,
      dataPoints: 0,
      pcRatio: null,
      mobileRatio: null,
      totalCombinedRatio: null,
      pcTotalRatio: null,
      mobileTotalRatio: null,
      rawData: { pc: null, mobile: null },
    };
  } catch (error: any) {
    console.warn(`[searchVolume] 검색량 수집 실패: ${keyword}`, error?.message);
    return {
      ratio: null,
      totalRatio: null,
      maxRatio: null,
      minRatio: null,
      dataPoints: 0,
      pcRatio: null,
      mobileRatio: null,
      totalCombinedRatio: null,
      pcTotalRatio: null,
      mobileTotalRatio: null,
    };
  }
}

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

