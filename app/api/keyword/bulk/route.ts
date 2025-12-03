import { NextRequest, NextResponse } from 'next/server';
import { fetchNaverSearchCountFromKeywordTool, fetchNaverSearchVolume } from '@/lib/naver/ranking';

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
      return NextResponse.json(
        { error: '키워드 배열이 필요합니다.' },
        { status: 400 }
      );
    }

    // 환경 변수에서 API 키 가져오기
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          error:
            '네이버 API 키가 설정되지 않았습니다. NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 환경 변수에 설정해주세요.',
        },
        { status: 500 }
      );
    }

    const results: KeywordResult[] = [];

    // 각 키워드에 대해 병렬 처리 (배치로 나누어 처리)
    const BATCH_SIZE = 5; // 한 번에 5개씩 처리
    for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
      const batch = keywords.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (keyword: string) => {
        try {
          // 자동완성 가져오기
          let autocompletion: string | null = null;
          try {
            const autocompleteResponse = await fetch(
              `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(keyword)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&q_enc=UTF-8&st=100&_callback=`,
              { cache: 'no-store' }
            );
            const text = await autocompleteResponse.text();
            const jsonMatch = text.match(/^[^(]*\((.+)\);?$/);
            if (jsonMatch) {
              const data = JSON.parse(jsonMatch[1]);
              if (data.items && data.items[0] && data.items[0].length > 0) {
                autocompletion = data.items[0][0][0];
              }
            }
          } catch (error) {
            console.error(`[bulk] 자동완성 오류 (${keyword}):`, error);
          }

          // 모바일/PC 조회수 가져오기 (네이버 검색광고 키워드 도구)
          const searchCountResult = await fetchNaverSearchCountFromKeywordTool(keyword);
          console.log(`[bulk] ${keyword} - 검색광고 키워드 도구 결과:`, {
            total: searchCountResult.total,
            pc: searchCountResult.pc,
            mobile: searchCountResult.mobile,
          });

          // 월 검색량 가져오기 (네이버 데이터랩)
          const searchVolumeResult = await fetchNaverSearchVolume(keyword, {
            clientId,
            clientSecret,
          });
          console.log(`[bulk] ${keyword} - 데이터랩 결과:`, {
            actualSearchCount: searchVolumeResult.actualSearchCount,
            pcSearchCount: searchVolumeResult.pcSearchCount,
            mobileSearchCount: searchVolumeResult.mobileSearchCount,
            totalCombinedRatio: searchVolumeResult.totalCombinedRatio,
          });

          // 월 검색량: actualSearchCount가 있으면 사용, 없으면 searchCountResult.total 사용
          const monthlySearchVolume =
            searchVolumeResult.actualSearchCount !== null
              ? searchVolumeResult.actualSearchCount
              : searchCountResult.total;

          // 월 발행수 가져오기 (네이버 검색 API - 최근 1개월 내 발행된 포스트만)
          let monthlyPublicationCount: number | null = null;
          try {
            // 최근 1개월 내 발행된 포스트만 가져오기 위해 날짜 정렬 사용
            // 최대 1000개까지 조회하여 최근 1개월 내 포스트 수 계산
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            const oneMonthAgoStr = oneMonthAgo.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD 형식
            
            let totalCount = 0;
            let start = 1;
            const display = 100; // 한 번에 100개씩 조회
            let hasMore = true;
            let recentCount = 0; // 최근 1개월 내 포스트 수
            
            // 최대 1000개까지 조회 (네이버 API 제한)
            while (hasMore && start <= 1000) {
              const searchResponse = await fetch(
                `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=${display}&start=${start}&sort=date`,
                {
                  headers: {
                    'X-Naver-Client-Id': clientId,
                    'X-Naver-Client-Secret': clientSecret,
                  },
                  cache: 'no-store',
                }
              );

              if (searchResponse.ok) {
                const searchData = await searchResponse.json();
                const items = searchData.items || [];
                
                if (items.length === 0) {
                  hasMore = false;
                  break;
                }
                
                // 최근 1개월 내 발행된 포스트만 카운트
                for (const item of items) {
                  const postDate = item.postdate; // YYYYMMDD 형식
                  if (postDate && postDate >= oneMonthAgoStr) {
                    recentCount++;
                  } else {
                    // 날짜가 1개월 이전이면 더 이상 조회할 필요 없음
                    hasMore = false;
                    break;
                  }
                }
                
                // 다음 페이지가 있는지 확인
                if (items.length < display || start + display > 1000) {
                  hasMore = false;
                } else {
                  start += display;
                }
                
                // 첫 번째 응답에서 전체 수 확인
                if (start === 1) {
                  totalCount = searchData.total || 0;
                }
              } else {
                hasMore = false;
                break;
              }
              
              // API 호출 제한 방지를 위한 딜레이
              if (hasMore) {
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
            }
            
            // 최근 1개월 내 포스트 수가 있으면 사용, 없으면 null
            monthlyPublicationCount = recentCount > 0 ? recentCount : null;
            
            console.log(`[bulk] ${keyword} - 월 발행수 계산:`, {
              totalCount,
              recentCount,
              monthlyPublicationCount,
            });
          } catch (error) {
            console.error(`[bulk] 월 발행수 조회 오류 (${keyword}):`, error);
          }

          console.log(`[bulk] ${keyword} - 최종 결과:`, {
            monthlySearchVolume,
            monthlyPublicationCount,
            pcViews: searchCountResult.pc,
            mobileViews: searchCountResult.mobile,
          });

          return {
            keyword,
            autocompletion,
            pcViews: searchCountResult.pc,
            mobileViews: searchCountResult.mobile,
            monthlySearchVolume,
            monthlyPublicationCount,
          } as KeywordResult;
        } catch (error: any) {
          console.error(`[bulk] 키워드 처리 오류 (${keyword}):`, error);
          return {
            keyword,
            autocompletion: null,
            pcViews: null,
            mobileViews: null,
            monthlySearchVolume: null,
            monthlyPublicationCount: null,
            error: error?.message || '처리 중 오류가 발생했습니다.',
          } as KeywordResult;
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const keyword = batch[batchResults.indexOf(result)];
          results.push({
            keyword,
            autocompletion: null,
            pcViews: null,
            mobileViews: null,
            monthlySearchVolume: null,
            monthlyPublicationCount: null,
            error: result.reason?.message || '처리 중 오류가 발생했습니다.',
          });
        }
      });

      // 배치 간 딜레이 (API 호출 제한 방지)
      if (i + BATCH_SIZE < keywords.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[bulk] API 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error?.message },
      { status: 500 }
    );
  }
}

