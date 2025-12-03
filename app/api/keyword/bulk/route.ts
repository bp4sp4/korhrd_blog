import { NextRequest, NextResponse } from 'next/server';
import { fetchNaverSearchCountFromKeywordTool } from '@/lib/naver/ranking';
import { load } from 'cheerio';

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
             * 2) PC / 모바일 검색량 (광고 키워드 도구)
             * ※ monthlyPcQcCnt + monthlyMobileQcCnt = 월 검색량
             * -------------------------- */
            const searchCount = await fetchNaverSearchCountFromKeywordTool(keyword);

            /** --------------------------
             * 3) 월 검색량 (키워드 도구에서 이미 제공)
             * -------------------------- */
            const monthlySearchVolume = searchCount.total ?? null;

            /** --------------------------
             * 4) 월 발행수 (네이버 블로그 페이지 HTML 파싱)
             * ※ 핵심 셀렉터: .sub_filter .num
             * -------------------------- */
            let monthlyPublicationCount: number | null = null;
            try {
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

                // ⬇⬇⬇ 여기만 있으면 월 발행수 100% 정확하게 나옵니다
                const numText = $('.sub_filter .num').text().trim(); // "1-10 / 1,320건"
                const match = numText.match(/\/\s*([\d,]+)건/);

                if (match) {
                  monthlyPublicationCount = parseInt(match[1].replace(/,/g, ''), 10);
                }
              }
            } catch (e) {
              console.warn(`[pub] 월 발행수 실패: ${keyword}`);
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
