import { NextRequest, NextResponse } from 'next/server';

// 네이버 검색 API 엔드포인트
const NAVER_API_BASE = 'https://openapi.naver.com/v1/search';

export async function POST(request: NextRequest) {
  try {
    const { keyword, count = 30, tab = 'blog' } = await request.json();

    if (!keyword) {
      return NextResponse.json({ error: '키워드가 필요합니다.' }, { status: 400 });
    }

    // 환경 변수에서 API 키 가져오기
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ 
        error: '네이버 API 키가 설정되지 않았습니다. NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 환경 변수에 설정해주세요.' 
      }, { status: 500 });
    }

    const searchData = await fetchNaverSearchResults(keyword, count, tab, clientId, clientSecret);

    return NextResponse.json({
      keyword,
      timestamp: new Date().toLocaleString(),
      ...searchData
    });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

async function fetchNaverSearchResults(
  keyword: string, 
  count: number, 
  tab: string,
  clientId: string, 
  clientSecret: string
) {
  const results: any = {
    summary: {
      monthlySearchVolume: '',
      monthlyPublicationCount: '',
      blockOrder: '',
      keywordTopic: '',
      keywordType: '',
      autocompletion: '',
      averageCharCount: '',
      averageCoreKeywords: '',
      averagePublicationDate: '',
      indexRatio: { red: 0, blue: 0 }
    },
    tabs: [
      { title: '블로그', active: tab === 'blog' },
      { title: '뉴스', active: tab === 'news' },
      { title: '카페글', active: tab === 'cafearticle' },
      { title: '웹문서', active: tab === 'webkr' }
    ],
    results: {} as any
  };

  // 각 탭별로 API 호출
  const apiTypes = [
    { key: 'blog', endpoint: 'blog' },
    { key: 'news', endpoint: 'news' },
    { key: 'cafearticle', endpoint: 'cafearticle' },
    { key: 'webkr', endpoint: 'webkr' }
  ];

  for (const apiType of apiTypes) {
    try {
      const display = Math.min(count, 100); // API 최대값 100
      const url = `${NAVER_API_BASE}/${apiType.endpoint}.json?query=${encodeURIComponent(keyword)}&display=${display}&start=1&sort=sim`;
      
      const response = await fetch(url, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret
        }
      });

      if (!response.ok) {
        console.error(`${apiType.key} API 오류:`, response.status);
        results.results[apiType.key === 'blog' ? '블로그' : 
                       apiType.key === 'news' ? '뉴스' :
                       apiType.key === 'cafearticle' ? '카페글' : '웹문서'] = [];
        continue;
      }

      const data = await response.json();
      const items = data.items || [];

      // API 응답을 표준 형식으로 변환
      const formattedResults = items.map((item: any, index: number) => {
        // 제목에서 HTML 태그 제거
        const title = item.title?.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') || '';
        const description = item.description?.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') || '';
        
        // 블로그/카페글의 경우 bloggerlink에서 아이디 추출
        let id = '';
        let nickname = '';
        if (item.bloggerlink) {
          const match = item.bloggerlink.match(/blog\.naver\.com\/([^\/]+)/);
          id = match ? match[1] : '';
          nickname = item.bloggername || id;
        } else if (item.cafename) {
          id = item.cafename;
          nickname = item.cafename;
        }

        return {
          rank: index + 1,
          title: title,
          id: id,
          nickname: nickname,
          index: apiType.key === 'blog' ? '블로그' : 
                 apiType.key === 'news' ? '뉴스' :
                 apiType.key === 'cafearticle' ? '카페' : '웹',
          reliability: '',
          publicationDate: item.postdate ? formatDate(item.postdate) : '',
          charCount: description.length,
          coreKeyword: keyword,
          subKeyword: '',
          imageCount: 0,
          visitorCount: '',
          diagnosis: '',
          link: item.link || item.originallink || ''
        };
      });

      const tabName = apiType.key === 'blog' ? '블로그' : 
                     apiType.key === 'news' ? '뉴스' :
                     apiType.key === 'cafearticle' ? '카페글' : '웹문서';
      
      results.results[tabName] = formattedResults;

      // 첫 번째 탭의 데이터로 요약 정보 업데이트
      if (apiType.key === tab && formattedResults.length > 0) {
        const totalChars = formattedResults.reduce((sum: number, r: any) => sum + r.charCount, 0);
        results.summary.averageCharCount = Math.round(totalChars / formattedResults.length).toString();
        results.summary.monthlyPublicationCount = data.total?.toString() || '';
      }
    } catch (error) {
      console.error(`${apiType.key} API 호출 오류:`, error);
      const tabName = apiType.key === 'blog' ? '블로그' : 
                     apiType.key === 'news' ? '뉴스' :
                     apiType.key === 'cafearticle' ? '카페글' : '웹문서';
      results.results[tabName] = [];
    }
  }

  return results;
}

// 날짜 포맷팅 (YYYYMMDD -> "N일 전" 형식)
function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return '';
  
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  
  const date = new Date(year, month, day);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '1일 전';
  return `${diffDays}일 전`;
}

