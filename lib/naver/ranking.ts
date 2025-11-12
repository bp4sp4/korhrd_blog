import { createHmac } from 'crypto';
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
  /** 실제 검색 횟수 (네이버 통합 검색량, 금일 제외 최근 한달) */
  actualSearchCount: number | null;
  /** PC 실제 검색 횟수 */
  pcSearchCount: number | null;
  /** Mobile 실제 검색 횟수 */
  mobileSearchCount: number | null;
  /** 원본 API 응답 데이터 (디버깅용) */
  rawData?: any;
}

/**
 * 네이버 검색광고 키워드 도구 API를 사용하여 실제 검색 횟수를 가져옵니다.
 * 금일을 제외한 최근 한 달간의 네이버 통합 검색량을 가져옵니다.
 * 
 * 참고: 네이버 검색광고 API는 검색광고 계정이 필요하며,
 * API 키 대신 쿠키/세션 인증이 필요할 수 있습니다.
 */
export async function fetchNaverSearchCountFromKeywordTool(
  keyword: string,
  options?: {
    userAgent?: string;
    cookie?: string;
    apiKey?: string;
    apiSecret?: string;
    customerId?: string;
  }
): Promise<{ total: number | null; pc: number | null; mobile: number | null }> {
  try {
    // 네이버 검색광고 API 키 가져오기
    const apiKey = options?.apiKey ?? process.env.NAVER_SEARCHAD_API_KEY;
    const apiSecret = options?.apiSecret ?? process.env.NAVER_SEARCHAD_API_SECRET;
    const apiCustomerId = options?.customerId ?? process.env.NAVER_SEARCHAD_CUSTOMER_ID;

    // 디버깅: 환경 변수 확인
    if (process.env.NODE_ENV === 'development') {
      console.log('[searchCount] API 자격 증명 확인:', {
        hasApiKey: !!apiKey,
        hasApiSecret: !!apiSecret,
        hasCustomerId: !!apiCustomerId,
        apiKeyLength: apiKey?.length ?? 0,
        apiSecretLength: apiSecret?.length ?? 0,
      });
    }

    if (!apiKey || !apiSecret || !apiCustomerId) {
      console.warn(
        '[searchCount] 네이버 검색광고 API 자격 증명이 설정되지 않았습니다. NAVER_SEARCHAD_API_KEY, NAVER_SEARCHAD_API_SECRET, NAVER_SEARCHAD_CUSTOMER_ID 환경 변수를 확인해주세요.'
      );
      return { total: null, pc: null, mobile: null };
    }
    
    // 작동하는 예제 정확히 따라하기
    const method = 'GET';
    const uri = '/keywordstool';
    const timestamp = Date.now().toString();
    
    // 키워드에서 공백 제거
    const cleanKeyword = keyword.replace(/\s+/g, '');
    
    // 시그니처 생성 (예제와 동일: utils/naverSign.js 방식)
    // message = timestamp + '.' + method + '.' + uri
    const message = `${timestamp}.${method}.${uri}`;
    const hmac = createHmac('sha256', apiSecret);
    const signature = hmac.update(message).digest('base64');
    
    // URL 생성
    const fullUrl = `https://api.naver.com${uri}?hintKeywords=${encodeURIComponent(cleanKeyword)}&showDetail=1`;
    
    // 헤더 설정 (예제 정확히 따라: X-API-SECRET 없음, X-Customer 사용)
    const headers: Record<string, string> = {
      'X-API-KEY': apiKey,
      'X-Customer': apiCustomerId, // 예제: X-Customer (대문자 C)
      'X-Signature': signature,
      'X-Timestamp': timestamp,
      'Content-Type': 'application/json',
    };
    
    // 디버깅
    if (process.env.NODE_ENV === 'development') {
      console.log('[searchCount] API 요청 (작동하는 예제 정확히 따라):', {
        url: fullUrl,
        method,
        uri,
        timestamp,
        signature: signature.substring(0, 30) + '...',
        keyword: cleanKeyword,
      });
    }

    try {
      const response = await fetch(fullUrl, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[searchCount] API 응답 전체:`, JSON.stringify(data, null, 2));
        
        // API 응답 구조 확인
        if (!data.keywordList || !Array.isArray(data.keywordList)) {
          console.error(`[searchCount] keywordList가 없거나 배열이 아닙니다:`, {
            hasKeywordList: !!data.keywordList,
            isArray: Array.isArray(data.keywordList),
            dataKeys: Object.keys(data),
            dataSample: JSON.stringify(data).substring(0, 500),
          });
          return { total: null, pc: null, mobile: null };
        }
        
        console.log(`[searchCount] keywordList 개수: ${data.keywordList.length}`);
        
        // 모든 키워드 데이터 로그 출력 (디버깅)
        console.log(`[searchCount] keywordList 전체:`, data.keywordList.map((item: any) => ({
          relKeyword: item.relKeyword,
          monthlyPcQcCnt: item.monthlyPcQcCnt,
          monthlyMobileQcCnt: item.monthlyMobileQcCnt,
        })));
        
        // 키워드 매칭 - 더 유연하게
        // 1. 정확히 일치하는 키워드 찾기
        let keywordData = data.keywordList.find((item: any) => {
          const itemKeyword = item.relKeyword?.replace(/\s+/g, '') || '';
          return itemKeyword === cleanKeyword || 
                 item.relKeyword === keyword ||
                 item.relKeyword === cleanKeyword;
        });
        
        // 2. 대소문자 무시하고 찾기
        if (!keywordData) {
          keywordData = data.keywordList.find((item: any) => {
            const itemKeyword = item.relKeyword?.replace(/\s+/g, '') || '';
            return itemKeyword.toLowerCase() === cleanKeyword.toLowerCase() ||
                   item.relKeyword?.toLowerCase() === keyword.toLowerCase();
          });
        }
        
        // 3. 부분 일치 찾기 (키워드가 포함된 경우)
        if (!keywordData) {
          keywordData = data.keywordList.find((item: any) => {
            const itemKeyword = item.relKeyword?.replace(/\s+/g, '') || '';
            return itemKeyword.includes(cleanKeyword) || 
                   cleanKeyword.includes(itemKeyword) ||
                   item.relKeyword?.includes(keyword) ||
                   keyword.includes(item.relKeyword || '');
          });
        }
        
        // 4. 첫 번째 항목 사용 (매칭 실패 시)
        if (!keywordData && data.keywordList.length > 0) {
          console.warn(`[searchCount] 정확한 키워드 매칭 실패, 첫 번째 항목 사용:`, {
            originalKeyword: keyword,
            cleanKeyword,
            firstItem: data.keywordList[0].relKeyword,
          });
          keywordData = data.keywordList[0];
        }
        
        if (keywordData) {
          console.log(`[searchCount] 키워드 데이터 발견:`, {
            relKeyword: keywordData.relKeyword,
            monthlyPcQcCnt: keywordData.monthlyPcQcCnt,
            monthlyMobileQcCnt: keywordData.monthlyMobileQcCnt,
            allFields: Object.keys(keywordData),
          });
          
          // 검색량 추출 - 여러 필드명 시도
          let pcCnt: number = 0;
          let moCnt: number = 0;
          
          // PC 검색량
          const pcValue = keywordData.monthlyPcQcCnt ?? 
                         keywordData.monthlyPcQcCnt ?? 
                         keywordData.pcQcCnt ?? 
                         keywordData.pcSearchCnt ?? 
                         keywordData.monthlyPcQcCnt ?? null;
          
          if (pcValue === '< 10' || pcValue === null || pcValue === undefined) {
            pcCnt = 0;
          } else if (typeof pcValue === 'number') {
            pcCnt = pcValue;
          } else {
            pcCnt = parseInt(String(pcValue).replace(/,/g, ''), 10) || 0;
          }
          
          // Mobile 검색량
          const moValue = keywordData.monthlyMobileQcCnt ?? 
                         keywordData.mobileQcCnt ?? 
                         keywordData.mobileSearchCnt ?? 
                         keywordData.monthlyMobileQcCnt ?? null;
          
          if (moValue === '< 10' || moValue === null || moValue === undefined) {
            moCnt = 0;
          } else if (typeof moValue === 'number') {
            moCnt = moValue;
          } else {
            moCnt = parseInt(String(moValue).replace(/,/g, ''), 10) || 0;
          }
          
          const sumCnt = pcCnt + moCnt;
          
          console.log(`[searchCount] 계산된 검색량:`, { 
            pcCnt, 
            moCnt, 
            sumCnt,
            pcValue,
            moValue,
          });
          
          if (sumCnt > 0) {
            return {
              total: sumCnt,
              pc: pcCnt > 0 ? pcCnt : null,
              mobile: moCnt > 0 ? moCnt : null,
            };
          } else {
            console.warn(`[searchCount] 검색량이 0입니다:`, { 
              pcCnt, 
              moCnt, 
              sumCnt,
              keywordData: JSON.stringify(keywordData),
            });
          }
        } else {
          console.error(`[searchCount] 키워드를 찾을 수 없습니다.`, {
            originalKeyword: keyword,
            cleanKeyword,
            keywordListLength: data.keywordList.length,
            availableKeywords: data.keywordList.slice(0, 10).map((item: any) => item.relKeyword),
          });
        }
      } else {
        const errorText = await response.text();
        console.error(`[searchCount] 네이버 검색광고 API 실패 (status: ${response.status})`, errorText);
        if (process.env.NODE_ENV === 'development') {
          console.log(`[searchCount] 요청 URL:`, fullUrl);
          console.log(`[searchCount] 요청 헤더:`, headers);
          console.log(`[searchCount] 시그니처 메시지:`, `${timestamp}.${method}.${uri}`);
        }
      }
    } catch (error: any) {
      console.error(`[searchCount] API 요청 실패:`, error?.message);
    }
    
    return { total: null, pc: null, mobile: null };
  } catch (error: any) {
    console.warn(`[searchCount] 네이버 검색광고 API 호출 실패: ${keyword}`, error?.message);
    return { total: null, pc: null, mobile: null };
  }
}

/**
 * 네이버 통합 검색 결과 페이지에서 검색 횟수를 크롤링합니다.
 * 네이버 검색 결과 페이지에서 "약 XXX건" 형태의 검색 결과 수를 추출합니다.
 * 
 * 참고: 네이버 검색 결과 페이지에는 검색 횟수가 직접 표시되지 않을 수 있습니다.
 */
export async function fetchNaverSearchCountFromPage(
  keyword: string,
  options?: { userAgent?: string }
): Promise<{ total: number | null; pc: number | null; mobile: number | null }> {
  try {
    // 네이버 통합 검색 결과 페이지
    const searchUrl = `https://search.naver.com/search.naver?where=nexearch&sm=top_hty&fbm=0&ie=utf8&query=${encodeURIComponent(keyword)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': options?.userAgent ?? DEFAULT_USER_AGENT,
        Referer: 'https://www.naver.com/',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.warn(`[searchCount] 네이버 검색 페이지 접근 실패 (status: ${response.status})`);
      return { total: null, pc: null, mobile: null };
    }

    const html = await response.text();
    const $ = load(html);

    // 디버깅: 개발 환경에서 HTML 일부 저장
    if (process.env.NODE_ENV === 'development') {
      console.log(`[searchCount] HTML 길이: ${html.length} bytes`);
      // 검색 결과 수가 있을 만한 부분만 추출
      const bodyText = $('body').text().substring(0, 5000);
      console.log(`[searchCount] Body 텍스트 샘플: ${bodyText.substring(0, 500)}`);
    }

    // 네이버 검색 결과 페이지에서 검색 결과 수 찾기
    // 여러 가능한 선택자 시도 (최신 네이버 구조 반영)
    const possibleSelectors = [
      '.api_subject_bx',
      '.api_subject_bx .api_txt_lines',
      '.api_cs_wrap',
      '.api_cs_wrap .api_txt_lines',
      '.title_desc',
      '.sub_txt',
      '.api_ani_send',
      '.speller',
      '.speller_other',
      '[class*="result"]',
      '[class*="count"]',
      '[class*="total"]',
      '[id*="result"]',
      '[id*="count"]',
      'h2',
      'h3',
      '.title',
      '.desc',
    ];

    let searchCount: number | null = null;

    // "약 XXX건" 또는 "XXX건" 패턴 찾기 (더 다양한 패턴)
    const countPatterns = [
      /약\s*([0-9,]+)\s*건/i,
      /([0-9,]+)\s*건/i,
      /총\s*([0-9,]+)\s*건/i,
      /검색결과\s*([0-9,]+)/i,
      /검색\s*결과\s*([0-9,]+)/i,
      /([0-9,]+)\s*개의?\s*결과/i,
      /결과\s*([0-9,]+)/i,
      /총\s*([0-9,]+)/i,
    ];

    for (const selector of possibleSelectors) {
      const elements = $(selector);
      for (let i = 0; i < elements.length; i++) {
        const text = $(elements[i]).text().trim();
        for (const pattern of countPatterns) {
          const match = text.match(pattern);
          if (match) {
            const countStr = match[1].replace(/,/g, '');
            const count = parseInt(countStr, 10);
            if (!isNaN(count) && count > 0) {
              searchCount = count;
              break;
            }
          }
        }
        if (searchCount) break;
      }
      if (searchCount) break;
    }

    // 전체 페이지 텍스트에서도 검색 (더 정확한 패턴 매칭)
    if (!searchCount) {
      const bodyText = $('body').text();
      // 여러 매치 중 가장 큰 숫자 선택 (검색 결과 수일 가능성 높음)
      const allMatches: number[] = [];
      for (const pattern of countPatterns) {
        const matches = bodyText.matchAll(new RegExp(pattern.source, 'gi'));
        for (const match of matches) {
          const countStr = match[1].replace(/,/g, '');
          const count = parseInt(countStr, 10);
          if (!isNaN(count) && count > 0 && count < 1000000000) {
            allMatches.push(count);
          }
        }
      }
      if (allMatches.length > 0) {
        // 가장 큰 숫자를 검색 결과 수로 간주 (일반적으로 검색 결과 수가 가장 큼)
        searchCount = Math.max(...allMatches);
      }
    }

    // JSON 데이터에서 검색량 찾기 (더 많은 패턴)
    if (!searchCount) {
      const scriptTags = $('script').toArray();
      const jsonPatterns = [
        /totalCount["\s]*:["\s]*(\d+)/i,
        /searchCount["\s]*:["\s]*(\d+)/i,
        /resultCount["\s]*:["\s]*(\d+)/i,
        /"total":\s*(\d+)/i,
        /total["\s]*:["\s]*(\d+)/i,
        /count["\s]*:["\s]*(\d+)/i,
        /result_total["\s]*:["\s]*(\d+)/i,
        /search_total["\s]*:["\s]*(\d+)/i,
      ];
      
      const jsonMatches: number[] = [];
      for (const script of scriptTags) {
        const scriptContent = $(script).html() || '';
        for (const pattern of jsonPatterns) {
          const matches = scriptContent.matchAll(new RegExp(pattern.source, 'gi'));
          for (const match of matches) {
            const count = parseInt(match[1], 10);
            if (!isNaN(count) && count > 0 && count < 1000000000) {
              jsonMatches.push(count);
            }
          }
        }
      }
      
      if (jsonMatches.length > 0) {
        // 가장 큰 숫자 선택
        searchCount = Math.max(...jsonMatches);
      }
    }
    
    // 디버깅: 찾지 못한 경우 로그
    if (!searchCount && process.env.NODE_ENV === 'development') {
      console.warn(`[searchCount] 검색 횟수를 찾지 못함: ${keyword}`);
      // HTML의 일부를 로그로 출력하여 구조 확인
      const titleDesc = $('.title_desc').text();
      const apiSubject = $('.api_subject_bx').text();
      console.log(`[searchCount] .title_desc: ${titleDesc.substring(0, 200)}`);
      console.log(`[searchCount] .api_subject_bx: ${apiSubject.substring(0, 200)}`);
    }

    // PC/Mobile 분리는 네이버 통합 검색 결과 페이지에서 직접 제공하지 않음
    return {
      total: searchCount,
      pc: null,
      mobile: null,
    };
  } catch (error: any) {
    console.warn(`[searchCount] 네이버 통합 검색 크롤링 실패: ${keyword}`, error?.message);
    return { total: null, pc: null, mobile: null };
  }
}

/**
 * 네이버 검색광고 키워드 도구에서 실제 검색 횟수를 크롤링합니다.
 * 금일을 제외한 최근 한 달간의 네이버 통합 검색량을 가져옵니다.
 * 
 * 참고: 네이버 검색광고 키워드 도구는 로그인이 필요할 수 있으며,
 * 공식 API가 없어 크롤링으로 시도합니다.
 */
async function fetchActualSearchCount(
  keyword: string,
  options?: { userAgent?: string }
): Promise<{ total: number | null; pc: number | null; mobile: number | null }> {
  // 네이버 검색광고 키워드 도구 API 시도 (실제 검색 횟수)
  const keywordToolResult = await fetchNaverSearchCountFromKeywordTool(keyword, options);
  if (keywordToolResult.total !== null) {
    return keywordToolResult;
  }
  
  console.log(`[searchCount] API 실패, 키워드 도구 페이지 크롤링 시도: ${keyword}`);
  
  // 참고: 네이버 통합 검색 결과 페이지에는 검색 횟수가 표시되지 않으므로
  // 이 방법은 사용하지 않음 (잘못된 숫자를 추출할 수 있음)
  // 네이버 검색광고 키워드 도구에서만 실제 검색 횟수를 가져올 수 있음

  // API 실패 시 네이버 검색광고 키워드 도구 페이지 크롤링 시도
  try {
    // 네이버 검색광고 키워드 도구 URL (키워드 포함)
    // 실제로는 로그인 후 키워드를 입력하고 검색해야 함
    const keywordToolUrl = `https://searchad.naver.com/keywordtool`;
    
    // 키워드 도구 페이지 접근 시도
    const response = await fetch(keywordToolUrl, {
      headers: {
        'User-Agent': options?.userAgent ?? DEFAULT_USER_AGENT,
        Referer: 'https://searchad.naver.com/',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.warn(`[searchCount] 키워드 도구 페이지 접근 실패 (status: ${response.status})`);
      const errorText = await response.text();
      if (process.env.NODE_ENV === 'development') {
        console.log(`[searchCount] 키워드 도구 페이지 오류 응답:`, errorText.substring(0, 1000));
      }
      return { total: null, pc: null, mobile: null };
    }

    const html = await response.text();
    const $ = load(html);
    
    // 디버깅: 개발 환경에서 HTML 구조 확인
    if (process.env.NODE_ENV === 'development') {
      console.log(`[searchCount] 키워드 도구 페이지 HTML 길이: ${html.length} bytes`);
      // 로그인 페이지인지 확인
      if (html.includes('로그인') || html.includes('login') || html.includes('signin')) {
        console.warn(`[searchCount] 키워드 도구 페이지가 로그인 페이지로 리다이렉트되었을 수 있습니다.`);
      }
    }

    // 키워드 도구 페이지에서 검색량 정보 찾기
    const possibleSelectors = [
      '.keyword_data .monthly_qc_cnt',
      '.keyword_info .search_volume',
      '[data-monthly-qc-cnt]',
      '.monthly_search_count',
      '.search_volume_text',
    ];

    let searchCount: number | null = null;
    let pcCount: number | null = null;
    let mobileCount: number | null = null;

    for (const selector of possibleSelectors) {
      const countElement = $(selector).first();
      if (countElement.length > 0) {
        const countText = countElement.text().trim();
        const countMatch = countText.replace(/[^0-9]/g, '');
        if (countMatch) {
          searchCount = parseInt(countMatch, 10);
          if (!isNaN(searchCount) && searchCount > 0) {
            break;
          }
        }
      }
    }

    // PC/Mobile 분리 정보 찾기
    const pcSelectors = ['.pc_qc_cnt', '[data-pc-count]', '.pc_search_count'];
    const mobileSelectors = ['.mobile_qc_cnt', '[data-mobile-count]', '.mobile_search_count'];

    for (const selector of pcSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        const text = element.text().trim().replace(/[^0-9]/g, '');
        if (text) {
          pcCount = parseInt(text, 10);
          if (!isNaN(pcCount) && pcCount > 0) break;
        }
      }
    }

    for (const selector of mobileSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        const text = element.text().trim().replace(/[^0-9]/g, '');
        if (text) {
          mobileCount = parseInt(text, 10);
          if (!isNaN(mobileCount) && mobileCount > 0) break;
        }
      }
    }

    // JSON 데이터에서 검색량 찾기 (더 많은 패턴 시도)
    if (!searchCount) {
      const scriptTags = $('script').toArray();
      const jsonPatterns = [
        /monthlyQcCnt["\s]*:["\s]*(\d+)/i,
        /monthlyPcQcCnt["\s]*:["\s]*(\d+)/i,
        /monthlyMobileQcCnt["\s]*:["\s]*(\d+)/i,
        /searchVolume["\s]*:["\s]*(\d+)/i,
        /"monthlyQcCnt":\s*(\d+)/i,
        /"monthlyPcQcCnt":\s*(\d+)/i,
        /"monthlyMobileQcCnt":\s*(\d+)/i,
        /월간검색수["\s]*:["\s]*(\d+)/i,
        /월간PC검색수["\s]*:["\s]*(\d+)/i,
        /월간모바일검색수["\s]*:["\s]*(\d+)/i,
      ];
      
      const jsonMatches: { count: number; type: string }[] = [];
      
      for (const script of scriptTags) {
        const scriptContent = $(script).html() || '';
        for (const pattern of jsonPatterns) {
          const matches = scriptContent.matchAll(new RegExp(pattern.source, 'gi'));
          for (const match of matches) {
            const count = parseInt(match[1], 10);
            if (!isNaN(count) && count > 0 && count < 100000000) {
              jsonMatches.push({ count, type: pattern.source });
            }
          }
        }
      }
      
      if (jsonMatches.length > 0) {
        // 디버깅: 개발 환경에서 찾은 모든 매치 출력
        if (process.env.NODE_ENV === 'development') {
          console.log(`[searchCount] JSON에서 찾은 검색량 후보:`, jsonMatches);
        }
        
        // 가장 큰 숫자를 검색량으로 선택 (일반적으로 검색량이 가장 큼)
        const maxMatch = jsonMatches.reduce((max, current) => 
          current.count > max.count ? current : max
        );
        searchCount = maxMatch.count;
        
        // PC/Mobile 분리 정보도 찾기
        for (const match of jsonMatches) {
          if (match.type.includes('Pc') && !pcCount) {
            pcCount = match.count;
          }
          if (match.type.includes('Mobile') && !mobileCount) {
            mobileCount = match.count;
          }
        }
      }
    }

    // PC와 Mobile이 있으면 합산
    if (pcCount !== null && mobileCount !== null && searchCount === null) {
      searchCount = pcCount + mobileCount;
    }

    return {
      total: searchCount,
      pc: pcCount,
      mobile: mobileCount,
    };
  } catch (error: any) {
    console.warn(`[searchCount] 실제 검색 횟수 수집 실패: ${keyword}`, error?.message);
    return { total: null, pc: null, mobile: null };
  }
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
        actualSearchCount: null,
        pcSearchCount: null,
        mobileSearchCount: null,
      };
    }

    // 실제 검색 횟수 가져오기 시도 (병렬 처리)
    const actualCountPromise = fetchActualSearchCount(keyword);

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
    
    // 실제 검색 횟수 가져오기
    const actualCount = await actualCountPromise;

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
        actualSearchCount: actualCount.total,
        pcSearchCount: actualCount.pc,
        mobileSearchCount: actualCount.mobile,
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
        actualSearchCount: actualCount.total,
        pcSearchCount: actualCount.pc,
        mobileSearchCount: actualCount.mobile,
        rawData: { pc: pcData?.data, mobile: mobileData?.data },
      };
    }

    console.warn(`[searchVolume] 검색량 정보를 찾을 수 없음: ${keyword}`);
    const actualCountFallback = await actualCountPromise;
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
      actualSearchCount: actualCountFallback.total,
      pcSearchCount: actualCountFallback.pc,
      mobileSearchCount: actualCountFallback.mobile,
      rawData: { pc: null, mobile: null },
    };
  } catch (error: any) {
    console.warn(`[searchVolume] 검색량 수집 실패: ${keyword}`, error?.message);
    // 에러 발생 시에도 실제 검색 횟수는 시도
    let actualCount: { total: number | null; pc: number | null; mobile: number | null } = { total: null, pc: null, mobile: null };
    try {
      actualCount = await fetchActualSearchCount(keyword);
    } catch (e) {
      // 무시
    }
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
      actualSearchCount: actualCount.total,
      pcSearchCount: actualCount.pc,
      mobileSearchCount: actualCount.mobile,
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


