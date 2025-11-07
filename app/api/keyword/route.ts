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

  // 월 검색량 가져오기 (데이터랩 API)
  const monthlySearchVolume = await fetchMonthlySearchVolume(keyword, clientId, clientSecret);
  results.summary.monthlySearchVolume = monthlySearchVolume;

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
        
        // 키워드 주제 추론 (검색 결과 제목에서 자주 나오는 단어 분석)
        if (!results.summary.keywordTopic && formattedResults.length > 0) {
          results.summary.keywordTopic = extractKeywordTopic(formattedResults, keyword);
        }
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

// 키워드 주제 추론 (검색 결과 제목 분석)
function extractKeywordTopic(results: any[], keyword: string): string {
  // 자주 사용되는 주제 키워드 패턴
  const topicPatterns = [
    { pattern: /교육|학원|강의|수업|학습/, topic: '교육' },
    { pattern: /건강|병원|의료|치료|증상/, topic: '건강/의료' },
    { pattern: /요리|레시피|음식|맛집/, topic: '요리/음식' },
    { pattern: /여행|관광|호텔|숙박/, topic: '여행' },
    { pattern: /뷰티|화장품|피부|스킨케어/, topic: '뷰티' },
    { pattern: /패션|옷|스타일|코디/, topic: '패션' },
    { pattern: /자격증|시험|합격/, topic: '자격증' },
    { pattern: /취업|면접|이력서/, topic: '취업' },
    { pattern: /투자|주식|부동산/, topic: '투자/금융' },
    { pattern: /IT|프로그래밍|개발|코딩/, topic: 'IT/기술' },
    { pattern: /게임|플레이|리뷰/, topic: '게임' },
    { pattern: /책|독서|서평/, topic: '도서' },
  ];

  // 검색 결과 제목에서 패턴 매칭
  const topicCounts: { [key: string]: number } = {};
  
  results.forEach((result) => {
    const title = result.title || '';
    topicPatterns.forEach(({ pattern, topic }) => {
      if (pattern.test(title)) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    });
  });

  // 가장 많이 매칭된 주제 반환
  const sortedTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1]);
  
  if (sortedTopics.length > 0 && sortedTopics[0][1] >= 2) {
    return sortedTopics[0][0];
  }

  return '';
}

// 네이버 데이터랩 API로 월 검색량 가져오기
async function fetchMonthlySearchVolume(
  keyword: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  try {
    // 네이버 데이터랩 API 엔드포인트 (검색어 트렌드)
    const url = `https://openapi.naver.com/v1/datalab/search`;
    
    const body = {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0].replace(/-/g, ''),
      endDate: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      timeUnit: 'month',
      keywordGroups: [
        {
          groupName: keyword,
          keywords: [keyword]
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (response.ok) {
      const data = await response.json();
      if (data.results && data.results.length > 0 && data.results[0].data) {
        // 최근 월의 검색량 데이터 (ratio는 상대값이므로 평균이나 최신값 사용)
        const monthlyData = data.results[0].data;
        if (monthlyData.length > 0) {
          // 최신 월 데이터의 ratio 사용 (상대값)
          const latestRatio = monthlyData[monthlyData.length - 1].ratio || 0;
          // 상대값을 문자열로 반환 (실제 검색량은 데이터랩에서 제공하지 않음)
          return latestRatio > 0 ? `${Math.round(latestRatio)}` : '';
        }
      }
    } else {
      // 데이터랩 API가 실패하면 빈 문자열 반환 (월 검색량은 선택사항)
      console.log('데이터랩 API 응답 실패:', response.status);
    }
  } catch (error) {
    console.error('데이터랩 API 호출 오류:', error);
  }
  
  return '';
}

