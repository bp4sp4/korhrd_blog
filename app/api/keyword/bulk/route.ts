import { NextRequest, NextResponse } from 'next/server';
import { fetchNaverSearchCountFromKeywordTool } from '@/lib/naver/ranking';
import { load } from 'cheerio';

// 네이버 검색 API 엔드포인트
const NAVER_API_BASE = 'https://openapi.naver.com/v1/search';

interface KeywordResult {
  keyword: string;
  autocompletion: string | null;
  pcViews: number | null;
  mobileViews: number | null;
  monthlySearchVolume: number | null;
  monthlyPublicationCount: number | null;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { keywords } = await request.json();

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: '키워드 배열이 필요합니다.' }, { status: 400 });
    }

    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경 변수를 설정해주세요.' },
        { status: 500 }
      );
    }

    const results: KeywordResult[] = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
      const batch = keywords.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (keyword: string) => {
          try {
            /** --------------------------
             * 1) 자동완성
             * -------------------------- */
            let autocompletion: string | null = null;
            try {
              const autoRes = await fetch(
                `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(keyword)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&q_enc=UTF-8&st=100&_callback=`,
                { cache: 'no-store' }
              );
              const text = await autoRes.text();
              const jsonMatch = text.match(/^[^(]*\((.+)\);?$/);
              if (jsonMatch) {
                const data = JSON.parse(jsonMatch[1]);
                autocompletion = data.items?.[0]?.[0]?.[0] ?? null;
              }
            } catch (e) {
              console.warn(`[auto] 자동완성 실패: ${keyword}`);
            }

            /** --------------------------
             * 2) PC / 모바일 검색량 (네이버 검색광고 API - 키워드 도구)
             * ※ monthlyPcQcCnt + monthlyMobileQcCnt = 월 검색량
             * 엔드포인트: /keywordstool?hintKeywords={keyword}&showDetail=1
             * 응답: keywordList[0].monthlyPcQcCnt, monthlyMobileQcCnt
             * -------------------------- */
            const searchCount = await fetchNaverSearchCountFromKeywordTool(keyword);

            /** --------------------------
             * 3) 월 검색량 (키워드 도구에서 이미 제공)
             * -------------------------- */
            const monthlySearchVolume = searchCount.total ?? null;

            /** --------------------------
             * 4) 월 발행수 (네이버 내부 API 시도 후 검색 API 사용)
             * -------------------------- */
            let monthlyPublicationCount: number | null = null;
            try {
              // 방법 0-0: 네이버 블로그 API 시도 (monthBlogCnt - 가장 정확할 가능성 높음)
              // 엔드포인트: /api/contents/{keyword}/blog
              // 응답 구조: data.items.blog.monthBlogCnt
              try {
                // 키워드에서 공백 제거하지 않음 (원본 키워드 사용)
                // 상대 경로로 호출 (브라우저에서 실행되는 것처럼)
                const blogApiUrl = `https://search.naver.com/api/contents/${encodeURIComponent(
                  keyword
                )}/blog`;
                
                // Referer를 실제 네이버 검색 페이지 URL 형식으로 설정 (중요!)
                // 네이버 검색 페이지는 where=nexearch, ssc=tab.nx.all 등의 파라미터를 사용
                const refererUrl = `https://search.naver.com/search.naver?sm=tab_hty.top&where=nexearch&ssc=tab.nx.all&query=${encodeURIComponent(keyword)}`;
                
                const blogRes = await fetch(blogApiUrl, {
                  headers: {
                    'User-Agent':
                      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': refererUrl, // 실제 네이버 검색 페이지 URL 형식으로 설정
                    'Accept': 'application/json',
                    'Origin': 'https://search.naver.com', // Referer와 일치
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                  },
                  cache: 'no-store',
                });

                if (blogRes.ok) {
                  const contentType = blogRes.headers.get('content-type');
                  
                  // JSON 응답인지 확인
                  if (contentType && contentType.includes('application/json')) {
                    const blogData = await blogRes.json();
                    
                    // 디버깅: 응답 구조 확인 (항상 로그 출력)
                    console.log(`[pub] 블로그 API 응답 - 키워드: ${keyword}`, JSON.stringify(blogData).substring(0, 1000));
                    
                    // monthBlogCnt 필드 확인 (월간 블로그 개수)
                    // 응답 구조: data.items.blog.monthBlogCnt
                    const monthBlogCnt = blogData?.items?.blog?.monthBlogCnt;
                    
                    if (typeof monthBlogCnt === 'number' && monthBlogCnt >= 0) {
                      monthlyPublicationCount = monthBlogCnt;
                      console.log(`[pub] 블로그 API 성공 - 키워드: ${keyword}, 월간 발행수: ${monthBlogCnt}`);
                    } else {
                      // 다른 경로도 시도
                      const possiblePaths = [
                        blogData?.blog?.monthBlogCnt,
                        blogData?.monthBlogCnt,
                        blogData?.items?.monthBlogCnt,
                        blogData?.data?.items?.blog?.monthBlogCnt,
                        blogData?.data?.blog?.monthBlogCnt,
                      ];
                      
                      for (const count of possiblePaths) {
                        if (typeof count === 'number' && count >= 0) {
                          monthlyPublicationCount = count;
                          console.log(`[pub] 블로그 API 성공 (대체 경로) - 키워드: ${keyword}, 월간 발행수: ${count}`);
                          break;
                        }
                      }
                    }
                  } else {
                    // JSON이 아닌 경우 (HTML 에러 페이지 등)
                    const text = await blogRes.text();
                    console.warn(`[pub] 블로그 API JSON 아님 - 키워드: ${keyword}, Content-Type: ${contentType}, 응답: ${text.substring(0, 200)}`);
                  }
                } else {
                  // 404 등 실패 시 로그
                  const errorText = await blogRes.text().catch(() => '');
                  console.warn(`[pub] 블로그 API HTTP 실패 - 키워드: ${keyword}, 상태: ${blogRes.status}, 응답: ${errorText.substring(0, 200)}`);
                }
              } catch (e: any) {
                console.warn(`[pub] 블로그 API 실패 - 키워드: ${keyword}`, e?.message);
              }

              // 방법 0-1: 네이버 그래프 API 시도 (월간 발행수 포함 가능)
              if (!monthlyPublicationCount) {
                try {
                  // 키워드에서 공백 제거
                  const cleanKeyword = keyword.replace(/\s+/g, '');
                  const today = new Date();
                  const startDate = new Date(today.setFullYear(today.getFullYear() - 3));
                  const endDate = new Date(new Date().setDate(new Date().getDate() - 1));
                  const period = 'date';
                  
                  const graphApiUrl = `https://search.naver.com/api/keywords/${encodeURIComponent(
                    cleanKeyword
                  )}/graph?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&period=${period}`;
                
                const graphRes = await fetch(graphApiUrl, {
                  headers: {
                    'User-Agent':
                      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://search.naver.com/',
                    'Accept': 'application/json',
                  },
                  cache: 'no-store',
                });

                if (graphRes.ok) {
                  const graphData = await graphRes.json();
                  
                  // 디버깅: 응답 구조 확인
                  if (process.env.NODE_ENV === 'development') {
                    console.log(`[pub] 그래프 API 응답 - 키워드: ${keyword}`, JSON.stringify(graphData).substring(0, 500));
                  }
                  
                  // 그래프 데이터에서 최근 한 달 발행수 추출 시도
                  if (graphData?.data && Array.isArray(graphData.data)) {
                    // 최근 한 달 데이터만 필터링
                    const oneMonthAgo = new Date();
                    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
                    
                    const recentData = graphData.data.filter((item: any) => {
                      const itemDate = new Date(item.date || item.time || item.timestamp);
                      return itemDate >= oneMonthAgo;
                    });
                    
                    if (recentData.length > 0) {
                      // 발행수 합계 또는 평균 계산
                      const totalCount = recentData.reduce((sum: number, item: any) => {
                        return sum + (item.count || item.value || item.total || 0);
                      }, 0);
                      
                      if (totalCount > 0) {
                        monthlyPublicationCount = totalCount;
                        console.log(`[pub] 그래프 API 성공 - 키워드: ${keyword}, 발행수: ${totalCount}`);
                      }
                    }
                  }
                }
              } catch (e: any) {
                console.warn(`[pub] 그래프 API 실패 - 키워드: ${keyword}`, e?.message);
              }

              // 방법 0-2: 네이버 내부 API 시도 (realtime)
              if (!monthlyPublicationCount) {
                try {
                  // 키워드에서 공백 제거
                  const cleanKeyword = keyword.replace(/\s+/g, '');
                  const internalApiUrl = `https://search.naver.com/api/contents/${encodeURIComponent(
                    cleanKeyword
                  )}/realtime?type=18&keyword=${encodeURIComponent(cleanKeyword)}`;
                  
                  const internalRes = await fetch(internalApiUrl, {
                    headers: {
                      'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                      'Referer': 'https://search.naver.com/',
                      'Accept': 'application/json',
                    },
                    cache: 'no-store',
                  });

                  if (internalRes.ok) {
                    const internalData = await internalRes.json();
                    
                    // 디버깅: 응답 구조 확인
                    if (process.env.NODE_ENV === 'development') {
                      console.log(`[pub] 내부 API 응답 - 키워드: ${keyword}`, JSON.stringify(internalData).substring(0, 500));
                    }
                    
                    // 응답 구조에 따라 월간 발행수 추출 시도 (다양한 필드명 확인)
                    const possibleFields = [
                      'blogCount',
                      'blog_count',
                      'count',
                      'total',
                      'monthlyCount',
                      'monthly_count',
                      'resultCount',
                      'result_count',
                      'items',
                    ];
                    
                    for (const field of possibleFields) {
                      const value = internalData?.[field];
                      if (typeof value === 'number' && value > 0) {
                        monthlyPublicationCount = value;
                        console.log(`[pub] 내부 API 성공 - 키워드: ${keyword}, 필드: ${field}, 발행수: ${value}`);
                        break;
                      } else if (Array.isArray(value) && value.length > 0) {
                        // items 배열인 경우
                        const count = value.length;
                        if (count > 0) {
                          monthlyPublicationCount = count;
                          console.log(`[pub] 내부 API 성공 (배열 길이) - 키워드: ${keyword}, 발행수: ${count}`);
                          break;
                        }
                      } else if (value && typeof value === 'object') {
                        // 중첩된 객체인 경우
                        const nestedCount = value.count || value.total || value.blogCount;
                        if (typeof nestedCount === 'number' && nestedCount > 0) {
                          monthlyPublicationCount = nestedCount;
                          console.log(`[pub] 내부 API 성공 (중첩 객체) - 키워드: ${keyword}, 발행수: ${nestedCount}`);
                          break;
                        }
                      }
                    }
                  } else {
                    console.warn(`[pub] 내부 API HTTP 실패 - 키워드: ${keyword}, 상태: ${internalRes.status}`);
                  }
                } catch (e: any) {
                  // 내부 API 실패 시 무시하고 다음 방법 시도
                  console.warn(`[pub] 내부 API 실패 - 키워드: ${keyword}`, e?.message);
                }
              }

              // 방법 1: 네이버 검색 API로 최근 한 달 블로그 포스트 개수 세기 (내부 API 실패 시)
              if (!monthlyPublicationCount) {
                // 날짜 필터링은 API에서 직접 지원하지 않으므로, 최근 결과를 가져와서 날짜로 필터링
                const oneMonthAgo = new Date();
                oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
                const oneMonthAgoStr = oneMonthAgo.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD

                let totalCount = 0;
                let start = 1;
                const display = 100; // API 최대값
                let hasMore = true;
                let recentCount = 0;

                // 최대 10번 반복 (1000개까지)
                while (hasMore && start <= 1000) {
                  const apiUrl = `${NAVER_API_BASE}/blog.json?query=${encodeURIComponent(
                    keyword
                  )}&display=${display}&start=${start}&sort=date`;

                  const apiRes = await fetch(apiUrl, {
                    headers: {
                      'X-Naver-Client-Id': clientId,
                      'X-Naver-Client-Secret': clientSecret,
                    },
                    cache: 'no-store',
                  });

                  if (!apiRes.ok) {
                    console.warn(`[pub] 네이버 검색 API 실패: ${apiRes.status}`);
                    break;
                  }

                  const apiData = await apiRes.json();
                  const items = apiData.items || [];

                  if (items.length === 0) {
                    hasMore = false;
                    break;
                  }

                  // 최근 한 달 내 포스트 개수 세기
                  for (const item of items) {
                    if (item.postdate && item.postdate >= oneMonthAgoStr) {
                      recentCount++;
                    } else {
                      // 날짜가 한 달 이전이면 더 이상 확인할 필요 없음 (정렬이 date이므로)
                      hasMore = false;
                      break;
                    }
                  }

                  // 전체 개수 업데이트
                  if (apiData.total) {
                    totalCount = parseInt(apiData.total, 10);
                  }

                  // 1000개 제한 또는 더 이상 최근 포스트가 없으면 종료
                  if (items.length < display || !hasMore || start + display > 1000) {
                    hasMore = false;
                  } else {
                    start += display;
                    // API 호출 간 딜레이
                    await new Promise((resolve) => setTimeout(resolve, 100));
                  }
                }

                // 최근 한 달 포스트 개수만 사용 (전체 검색 결과 수가 아님)
                // recentCount가 1000개면 실제로는 더 많을 수 있지만, API 제한으로 정확히 알 수 없음
                // 이 경우 HTML 파싱으로 정확한 월간 발행수를 가져와야 함
                if (recentCount > 0 && recentCount < 1000) {
                  // 1000개 미만이면 정확한 개수
                  monthlyPublicationCount = recentCount;
                } else if (recentCount >= 1000) {
                  // 1000개 이상이면 HTML 파싱으로 정확한 값 가져오기
                  monthlyPublicationCount = null; // 아래 HTML 파싱으로 가져옴
                }
                // recentCount가 0이면 HTML 파싱으로 시도

                // 방법 2: HTML 파싱 (백업 방법 - API가 실패하거나 부정확한 경우)
                if (!monthlyPublicationCount) {
                const url = `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(
                  keyword
                )}&sm=tab_opt&nso=so:r,p:1m,a:all`;

                const res = await fetch(url, {
                  headers: {
                    'User-Agent':
                      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  },
                  cache: 'no-store',
                });

                if (res.ok) {
                  const html = await res.text();
                  const $ = load(html);

                  // 방법 1: 여러 셀렉터 시도 (우선순위 순서)
                  // 네이버 블로그 검색 결과 페이지의 실제 HTML 구조 기반
                  const selectors = [
                    // 가장 정확한 셀렉터들 (우선순위 높음)
                    '.total_info .num', // 총 건수 표시 영역
                    '.api_subject_tx .num', // 검색 결과 수
                    '.sub_filter .num', // 필터 영역의 숫자
                    '.title_num', // 제목 영역의 숫자
                    '.result_text .num', // 결과 텍스트의 숫자
                    '.api_txt_lines.total .num', // 총 개수
                    // 일반적인 셀렉터들
                    '.api_subject_tx',
                    '.result_text',
                    '.api_txt_lines.total',
                    '.total',
                    '.total_info',
                    // 속성 기반 셀렉터들
                    '[class*="num"]',
                    '[class*="count"]',
                    '[class*="total"]',
                    '.area_total',
                    // ID 기반 (가능한 경우)
                    '#total_count',
                    '#result_count',
                  ];

                  let countText: string | null = null;
                  for (const selector of selectors) {
                    const elements = $(selector);
                    if (elements.length > 0) {
                      // 여러 요소가 있으면 첫 번째 요소 사용
                      const text = elements.first().text().trim();
                      if (text && text.length > 0) {
                        countText = text;
                        console.log(`[pub] 셀렉터 성공 - 키워드: ${keyword}, 셀렉터: ${selector}, 텍스트: ${text.substring(0, 50)}`);
                        break;
                      }
                    }
                  }

                  // 방법 2: script 태그에서 JSON 데이터 파싱
                  if (!countText || countText.length === 0) {
                    const scriptTags = $('script').toArray();
                    for (const script of scriptTags) {
                      const scriptContent = $(script).html() || '';
                      
                      // JSON 데이터에서 totalCount, resultCount 등 찾기
                      const jsonPatterns = [
                        /"total":\s*(\d+)/i,
                        /totalCount["\s]*:["\s]*(\d+)/i,
                        /resultCount["\s]*:["\s]*(\d+)/i,
                        /searchCount["\s]*:["\s]*(\d+)/i,
                        /blogTotal["\s]*:["\s]*(\d+)/i,
                        /blogCount["\s]*:["\s]*(\d+)/i,
                      ];

                      for (const pattern of jsonPatterns) {
                        const matches = scriptContent.matchAll(new RegExp(pattern.source, 'gi'));
                        const counts: number[] = [];
                        for (const match of matches) {
                          const count = parseInt(match[1], 10);
                          // 최소 10 이상만 허용 (작은 숫자는 제외)
                          if (count >= 10 && count < 100000000) {
                            counts.push(count);
                          }
                        }
                        if (counts.length > 0) {
                          // 가장 큰 숫자를 선택
                          const maxCount = Math.max(...counts);
                          if (maxCount >= 10) {
                            monthlyPublicationCount = maxCount;
                            break;
                          }
                        }
                      }
                      if (monthlyPublicationCount) break;
                    }
                  }

                  // 방법 3: 셀렉터로 찾은 텍스트에서 숫자 추출
                  if (countText && !monthlyPublicationCount) {
                    const patterns = [
                      /\/\s*([\d,]+)건/, // "1-10 / 1,320건" (가장 정확한 패턴)
                      /총\s*([\d,]+)건/, // "총 1,320건"
                      /([\d,]+)건/, // "1,320건"
                      /([\d,]+)\s*건/, // "1,320 건"
                      /(\d{1,3}(?:,\d{3})*)건/, // "1,320건" (천단위 콤마 포함)
                    ];

                    for (const pattern of patterns) {
                      const match = countText.match(pattern);
                      if (match) {
                        const parsed = parseInt(match[1].replace(/,/g, ''), 10);
                        // 최소 10 이상만 허용 (작은 숫자는 제외)
                        if (parsed >= 10 && parsed < 100000000) {
                          monthlyPublicationCount = parsed;
                          break;
                        }
                      }
                    }
                  }

                  // 방법 4: 전체 HTML 텍스트에서 "건" 패턴 검색 (최후의 수단)
                  if (!monthlyPublicationCount) {
                    const bodyText = $('body').text();
                    
                    // 다양한 패턴으로 "건" 찾기
                    const countPatterns = [
                      /([\d,]+)건/g, // "1,320건"
                      /\/\s*([\d,]+)건/g, // "/ 1,320건"
                      /총\s*([\d,]+)건/g, // "총 1,320건"
                      /([\d,]+)\s*건/g, // "1,320 건"
                      /(\d{1,3}(?:,\d{3})*)건/g, // "1,320건" (천단위 콤마)
                    ];
                    
                    const allMatches: number[] = [];
                    for (const pattern of countPatterns) {
                      const matches = bodyText.matchAll(pattern);
                      for (const match of matches) {
                        const countStr = match[1] || match[0].replace(/[^0-9,]/g, '');
                        const count = parseInt(countStr.replace(/,/g, ''), 10);
                        if (!isNaN(count) && count >= 10 && count < 100000000) {
                          allMatches.push(count);
                        }
                      }
                    }
                    
                    if (allMatches.length > 0) {
                      // 중복 제거 후 가장 큰 숫자 선택
                      const uniqueCounts = [...new Set(allMatches)];
                      const maxCount = Math.max(...uniqueCounts);
                      monthlyPublicationCount = maxCount;
                      console.log(`[pub] "건" 패턴 성공 - 키워드: ${keyword}, 발행수: ${maxCount}, 후보들: ${uniqueCounts.slice(0, 5).join(', ')}`);
                    } else {
                      console.warn(`[pub] "건" 패턴 매치 없음 - 키워드: ${keyword}`);
                    }
                  }

                  // 디버깅: 실패 시 상세 로그
                  if (!monthlyPublicationCount) {
                    console.warn(`[pub] 파싱 실패 - 키워드: ${keyword}`);
                    
                    // 상세 디버깅 정보 출력
                    console.warn(`[pub] HTML 길이: ${html.length} bytes`);
                    
                    // 모든 셀렉터 시도 결과 확인
                    const selectorResults: string[] = [];
                    for (const selector of selectors) {
                      const elements = $(selector);
                      if (elements.length > 0) {
                        const text = elements.first().text().trim();
                        if (text && text.length > 0) {
                          selectorResults.push(`${selector}: "${text.substring(0, 50)}"`);
                        }
                      }
                    }
                    if (selectorResults.length > 0) {
                      console.warn(`[pub] 찾은 셀렉터들:`, selectorResults);
                    } else {
                      console.warn(`[pub] 모든 셀렉터 실패`);
                    }
                    
                    // body 텍스트에서 "건" 패턴 검색 (더 상세하게)
                    const bodyText = $('body').text();
                    const countMatches = bodyText.match(/[\d,]+건/g);
                    if (countMatches && countMatches.length > 0) {
                      console.warn(`[pub] "건" 패턴 매치:`, countMatches.slice(0, 10));
                      
                      // 각 매치에서 숫자 추출
                      const extractedCounts = countMatches
                        .map((m) => parseInt(m.replace(/[^0-9]/g, ''), 10))
                        .filter((c) => !isNaN(c) && c >= 10 && c < 100000000);
                      
                      if (extractedCounts.length > 0) {
                        console.warn(`[pub] 추출된 숫자들:`, extractedCounts.slice(0, 10));
                      }
                    } else {
                      console.warn(`[pub] "건" 패턴 매치 없음`);
                    }
                    
                    // script 태그에서 JSON 데이터 찾기
                    const scriptTags = $('script').toArray();
                    let foundJson = false;
                    for (const script of scriptTags) {
                      const content = $(script).html() || '';
                      if (content.includes('total') || content.includes('count') || content.includes('blog')) {
                        console.warn(`[pub] JSON 후보 (처음 500자):`, content.substring(0, 500));
                        foundJson = true;
                        break;
                      }
                    }
                    
                    // HTML 샘플 출력 (검색 결과 영역)
                    const searchArea = $('.api_subject_tx, .result_text, .total_info, .sub_filter').html();
                    if (searchArea) {
                      console.warn(`[pub] 검색 결과 영역 HTML (처음 500자):`, searchArea.substring(0, 500));
                    }
                  }
                } else {
                  console.warn(`[pub] HTTP 실패 - 키워드: ${keyword}, 상태: ${res.status}`);
                }
                }
              }
            }
          } catch (e: any) {
            console.warn(`[pub] 월 발행수 실패: ${keyword}`, e?.message);
          }

            return {
              keyword,
              autocompletion,
              pcViews: searchCount.pc,
              mobileViews: searchCount.mobile,
              monthlySearchVolume,
              monthlyPublicationCount,
            };
          } catch (error: any) {
            return {
              keyword,
              autocompletion: null,
              pcViews: null,
              mobileViews: null,
              monthlySearchVolume: null,
              monthlyPublicationCount: null,
              error: error?.message ?? '처리 중 오류 발생',
            };
          }
        })
      );

      results.push(...batchResults);

      // 배치 간 딜레이
      if (i + BATCH_SIZE < keywords.length) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류 발생', details: error?.message },
      { status: 500 }
    );
  }
}
