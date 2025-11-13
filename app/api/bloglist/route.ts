import { NextRequest, NextResponse } from 'next/server';
import lambdaChromium from '@sparticuz/chromium';
import {
  chromium as playwrightChromium,
  type Browser,
  type BrowserContext,
} from 'playwright-core';

// 네이버 검색 API 엔드포인트
const NAVER_API_BASE = 'https://openapi.naver.com/v1/search';

export const runtime = 'nodejs';
export const maxDuration = 20;

let localChromiumPromise: Promise<typeof playwrightChromium> | null = null;

async function getLocalChromium() {
  if (!localChromiumPromise) {
    localChromiumPromise = import('playwright').then((mod) => mod.chromium);
  }

  return localChromiumPromise;
}

function resolveBrowserlessEndpoint() {
  const explicitPlaywrightEndpoint = process.env.BROWSERLESS_PLAYWRIGHT_WS_ENDPOINT;
  if (explicitPlaywrightEndpoint) {
    return explicitPlaywrightEndpoint;
  }

  const genericEndpoint = process.env.BROWSERLESS_WS_ENDPOINT;
  if (genericEndpoint) {
    // /chromium/playwright 경로가 없으면 추가
    try {
      const url = new URL(genericEndpoint);
      if (!url.pathname.includes('/chromium/playwright')) {
        if (url.pathname === '/' || url.pathname === '') {
          url.pathname = '/chromium/playwright';
        } else if (url.pathname.endsWith('/playwright')) {
          url.pathname = url.pathname.replace(/\/playwright$/, '/chromium/playwright');
        } else {
          url.pathname = url.pathname.replace(/\/?$/, '/chromium/playwright');
        }
      }
      return url.toString();
    } catch {
      // /chromium/playwright 경로 추가
      if (!genericEndpoint.includes('/chromium/playwright')) {
        const cleaned = genericEndpoint.replace(/\/playwright\/?$/, '').replace(/\/chromium\/?$/, '');
        return `${cleaned}${cleaned.includes('?') ? '&' : '?'}token=${process.env.BROWSERLESS_TOKEN || ''}`;
      }
      return genericEndpoint;
    }
  }

  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) {
    return null;
  }

  const region =
    process.env.BROWSERLESS_REGION ||
    process.env.BROWSERLESS_DEPLOYMENT ||
    'production-sfo';

  // Browserless Playwright 엔드포인트: /chromium/playwright 경로 사용
  return `wss://${region}.browserless.io/chromium/playwright?token=${token}`;
}

export async function POST(request: NextRequest) {
  try {
    const { blogId, count = 30, sort = 'date' } = await request.json();

    if (!blogId) {
      return NextResponse.json({ error: '블로거 ID가 필요합니다.' }, { status: 400 });
    }

    const blogInfo = await fetchBlogInfo(blogId);
    
    // 먼저 RSS 피드 시도
    const rssResult = await fetchBlogListFromRSS(blogId, count);
    if (rssResult.items.length > 0) {
      // RSS 피드에서 블로그 정보도 가져오기
      const rssBlogInfo = await fetchBlogInfoFromRSS(blogId);
      // Puppeteer로 가져온 정보와 병합 (RSS가 우선)
      const mergedBlogInfo = {
        ...blogInfo,
        ...rssBlogInfo,
        blogTopic: rssBlogInfo.blogTopic || blogInfo.blogTopic
      };
      
      return NextResponse.json({
        blogId,
        timestamp: new Date().toLocaleString(),
        total: rssResult.total,
        items: rssResult.items,
        source: 'rss',
        blogInfo: mergedBlogInfo
      });
    }

    // RSS 피드가 없으면 네이버 검색 API 시도
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ 
        error: '네이버 API 키가 설정되지 않았습니다. NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 환경 변수에 설정해주세요.' 
      }, { status: 500 });
    }

    const blogList = await fetchBlogListByUserId(blogId, count, sort, clientId, clientSecret);

    return NextResponse.json({
      blogId,
      timestamp: new Date().toLocaleString(),
      total: blogList.total,
      items: blogList.items,
      source: 'api',
      blogInfo: blogInfo
    });
  } catch (error) {
    console.error('API 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

async function createPlaywrightContext(): Promise<{
  browser: Browser;
  context: BrowserContext;
}> {
  const isVercel = !!(process.env.VERCEL || process.env.VERCEL_ENV);
  const browserlessEndpoint = resolveBrowserlessEndpoint();
  const viewport = { width: 1280, height: 720 };
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    if (browserlessEndpoint) {
      try {
        browser = await playwrightChromium.connect({
          wsEndpoint: browserlessEndpoint,
        });
      } catch (error) {
        console.error(
          '[bloglist] Browserless (Playwright) 연결 실패, 로컬/Chromium 런치로 폴백합니다.',
          error
        );
      }
    }

    if (!browser) {
      const browserType = isVercel ? playwrightChromium : await getLocalChromium();
      const launchOptions = isVercel
        ? {
            args: lambdaChromium.args,
            executablePath: await lambdaChromium.executablePath(),
            headless: true,
          }
        : {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] as string[],
          };
      browser = await browserType.launch(launchOptions);
    }

    context = await browser.newContext({
      userAgent,
      viewport,
    });

    return { browser, context };
  } catch (error) {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    throw error;
  }
}

// 네이버 블로그 상세 정보 가져오기 (Playwright 사용)
async function fetchBlogInfo(blogId: string) {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  
  try {
    console.log(`>>> 블로그 상세 정보 크롤링 시작: ${blogId}`);

    const { browser: createdBrowser, context: createdContext } = await createPlaywrightContext();
    browser = createdBrowser;
    context = createdContext;
    const page = await context.newPage();
    
    const blogUrl = `https://blog.naver.com/${encodeURIComponent(blogId)}`;
    console.log(`>>> 블로그 URL: ${blogUrl}`);
    
    await page.goto(blogUrl, { 
      waitUntil: 'networkidle',
      timeout: 60000
    });

    // 초기 로딩 대기
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 페이지 스크롤하여 동적 콘텐츠 로드
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if(totalHeight >= scrollHeight){
            clearInterval(timer);
            resolve(null);
          }
        }, 100);
      });
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 모든 iframe이 로드될 때까지 대기
    const frames = page.frames();
    console.log(`>>> 발견된 iframe 개수: ${frames.length}`);
    for (const frame of frames) {
      try {
        // iframe이 로드될 때까지 대기
        await frame.waitForFunction(() => document.readyState === 'complete', { timeout: 5000 }).catch(() => {});
      } catch (e) {
        // iframe 로드 대기 실패는 무시
      }
    }
    await new Promise(resolve => setTimeout(resolve, 2000));

    const blogInfo = await page.evaluate(() => {
      const info: any = {
        blogName: '',
        blogTopic: '',
        nickname: '',
        neighborCount: '',
        creationDate: '',
        operationPeriod: '',
        todayVisitors: '',
        totalScraps: '',
        monthlyPosts: '',
        totalPosts: '',
        blogIndex: '', // 블로그지수 (예: 최적3)
        cRank: '', // C-RANK (예: 82/100)
        dia: '', // D.I.A (예: 69/100)
        diaPlus: '' // D.I.A+ (예: 64/100)
      };

      // iframe 내부도 확인
      const checkIframe = (iframe: HTMLIFrameElement) => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            return iframeDoc.body;
          }
        } catch (e) {
          // Cross-origin iframe은 접근 불가
        }
        return null;
      };

      // 메인 문서와 iframe 문서 모두 확인
      const documents = [document];
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of Array.from(iframes)) {
        const iframeBody = checkIframe(iframe as HTMLIFrameElement);
        if (iframeBody) {
          documents.push(iframeBody.ownerDocument);
        }
      }

      // 모든 문서에서 정보 찾기
      for (const doc of documents) {
        // 블로그명 찾기
        const blogNameSelectors = [
          '.blog_name', '.blog-title', 'h1.blog-title', '.profile_name',
          '[class*="blogName"]', '[class*="blog_name"]', '.se_blogName',
          'h1', 'h2', '.title', '[class*="Title"]'
        ];
        for (const selector of blogNameSelectors) {
          const el = doc.querySelector(selector);
          if (el) {
            const text = el.textContent?.trim() || '';
            if (text && text.length > 0 && text.length < 50) {
              info.blogName = text;
              break;
            }
          }
        }
        if (info.blogName) break;

        // 닉네임 찾기
        const nicknameSelectors = [
          '.nickname', '.profile_nickname', '.user_nickname',
          '[class*="nickname"]', '[class*="Nickname"]', '.se_nickname'
        ];
        for (const selector of nicknameSelectors) {
          const el = doc.querySelector(selector);
          if (el) {
            const text = el.textContent?.trim() || '';
            if (text && text.length > 0 && text.length < 30) {
              info.nickname = text;
              break;
            }
          }
        }
        if (info.nickname) break;
      }
      
      // 페이지 전체 텍스트에서 패턴 찾기 (모든 문서)
      let pageText = '';
      for (const doc of documents) {
        pageText += (doc.body?.textContent || '') + ' ';
      }
      
      // 이웃수 패턴: "18명", "이웃 18명", "이웃수 18명" 등
      const neighborPatterns = [
        /이웃\s*(\d+)\s*명/,
        /이웃수\s*(\d+)\s*명/,
        /이웃\s*:\s*(\d+)\s*명/,
        /(\d+)\s*명\s*이웃/
      ];
      for (const pattern of neighborPatterns) {
        const match = pageText.match(pattern);
        if (match) {
          info.neighborCount = `${match[1]}명`;
          break;
        }
      }

      // 개설일 패턴: "2010.07.29", "2010-07-29", "개설일 2010.07.29" 등
      // 여러 날짜 패턴 중 가장 오래된 날짜를 개설일로 추정
      const datePatterns = [
        /개설일\s*[:：]?\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/,
        /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*개설/,
        /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/
      ];
      
      let oldestDate: Date | null = null;
      let oldestDateStr = '';
      
      for (const pattern of datePatterns) {
        const matches = pageText.matchAll(new RegExp(pattern.source, 'g'));
        for (const match of matches) {
          const year = parseInt(match[1]);
          const month = parseInt(match[2]);
          const day = parseInt(match[3]);
          
          // 유효한 날짜 범위 확인 (2000년 이후, 현재 이전)
          if (year >= 2000 && year <= new Date().getFullYear()) {
            const date = new Date(year, month - 1, day);
            if (!isNaN(date.getTime()) && date <= new Date()) {
              if (!oldestDate || date < oldestDate) {
                oldestDate = date;
                oldestDateStr = `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
              }
            }
          }
        }
      }
      
      if (oldestDateStr) {
        info.creationDate = oldestDateStr;
        
        // 운영기간 계산
        if (oldestDate) {
          const now = new Date();
          const years = now.getFullYear() - oldestDate.getFullYear();
          const months = now.getMonth() - oldestDate.getMonth();
          const totalMonths = years * 12 + months;
          const operationYears = Math.floor(totalMonths / 12);
          const operationMonths = totalMonths % 12;
          if (operationYears > 0 && operationMonths > 0) {
            info.operationPeriod = `${operationYears}년 ${operationMonths}개월`;
          } else if (operationYears > 0) {
            info.operationPeriod = `${operationYears}년`;
          } else if (operationMonths > 0) {
            info.operationPeriod = `${operationMonths}개월`;
          }
        }
      }

      // 통계 정보 박스나 섹션에서 직접 추출 시도
      const statSelectors = [
        '[class*="stat"]', '[class*="Stat"]', '[class*="info"]', '[class*="Info"]',
        '.blog_info', '.profile_info', '.statistics', '.stats'
      ];
      
      for (const doc of documents) {
        for (const selector of statSelectors) {
          const statElements = doc.querySelectorAll(selector);
          for (const el of Array.from(statElements)) {
            const text = el.textContent || '';
            
            // 오늘 방문자 패턴: "116명", "오늘 116명", "오늘 방문자 116명" 등
            const visitorPatterns = [
              /오늘\s*방문자\s*[:：]?\s*(\d+)\s*명/,
              /오늘\s*(\d+)\s*명/,
              /방문자\s*[:：]?\s*(\d+)\s*명/,
              /(\d+)\s*명\s*방문/
            ];
            for (const pattern of visitorPatterns) {
              const match = text.match(pattern);
              if (match && !info.todayVisitors) {
                info.todayVisitors = `${match[1]}명`;
                break;
              }
            }

            // 스크랩수 패턴: "44개", "스크랩 44개", "총 스크랩 44개" 등
            const scrapPatterns = [
              /총\s*스크랩\s*[:：]?\s*(\d+)\s*개/,
              /스크랩\s*[:：]?\s*(\d+)\s*개/,
              /스크랩수\s*[:：]?\s*(\d+)\s*개/,
              /(\d+)\s*개\s*스크랩/
            ];
            for (const pattern of scrapPatterns) {
              const match = text.match(pattern);
              if (match && !info.totalScraps) {
                info.totalScraps = `${match[1]}개`;
                break;
              }
            }

            // 한달 포스팅 패턴: "12개", "한달 12개", "한달 포스팅 12개" 등
            const monthlyPatterns = [
              /한달\s*포스팅\s*[:：]?\s*(\d+)\s*개/,
              /한달\s*(\d+)\s*개/,
              /월간\s*포스팅\s*[:：]?\s*(\d+)\s*개/,
              /(\d+)\s*개\s*포스팅/
            ];
            for (const pattern of monthlyPatterns) {
              const match = text.match(pattern);
              if (match && !info.monthlyPosts) {
                info.monthlyPosts = `${match[1]}개`;
                break;
              }
            }
          }
        }
      }
      
      // 페이지 전체 텍스트에서도 패턴 찾기 (백업)
      if (!info.todayVisitors) {
        const visitorPatterns = [
          /오늘\s*방문자\s*[:：]?\s*(\d+)\s*명/,
          /오늘\s*(\d+)\s*명/,
          /방문자\s*[:：]?\s*(\d+)\s*명/
        ];
        for (const pattern of visitorPatterns) {
          const match = pageText.match(pattern);
          if (match) {
            info.todayVisitors = `${match[1]}명`;
            break;
          }
        }
      }

      if (!info.totalScraps) {
        const scrapPatterns = [
          /총\s*스크랩\s*[:：]?\s*(\d+)\s*개/,
          /스크랩\s*[:：]?\s*(\d+)\s*개/,
          /스크랩수\s*[:：]?\s*(\d+)\s*개/
        ];
        for (const pattern of scrapPatterns) {
          const match = pageText.match(pattern);
          if (match) {
            info.totalScraps = `${match[1]}개`;
            break;
          }
        }
      }

      if (!info.monthlyPosts) {
        const monthlyPatterns = [
          /한달\s*포스팅\s*[:：]?\s*(\d+)\s*개/,
          /한달\s*(\d+)\s*개/,
          /월간\s*포스팅\s*[:：]?\s*(\d+)\s*개/
        ];
        for (const pattern of monthlyPatterns) {
          const match = pageText.match(pattern);
          if (match) {
            info.monthlyPosts = `${match[1]}개`;
            break;
          }
        }
      }

      // 총 게시물 패턴: "204개", "총 204개", "총 게시물 204개" 등
      const totalPatterns = [
        /총\s*게시물\s*[:：]?\s*(\d+)\s*개/,
        /총\s*(\d+)\s*개/,
        /게시물\s*[:：]?\s*(\d+)\s*개/
      ];
      for (const pattern of totalPatterns) {
        const match = pageText.match(pattern);
        if (match) {
          info.totalPosts = `${match[1]}개`;
          break;
        }
      }

      // 블로그지수, C-RANK, D.I.A, D.I.A+ 찾기
      // 참고: 이 지표들은 네이버 내부 지표로 공개 API로 제공되지 않으며,
      // 블로그 메인 페이지에도 일반적으로 표시되지 않습니다.
      // 만약 페이지에 표시되어 있다면 아래 패턴으로 찾을 수 있습니다.
      
      // 블로그지수 패턴: "최적3", "블로그지수 최적3", "지수 최적3" 등
      const indexPatterns = [
        /블로그지수\s*[:：]?\s*(최적\d+|준최\d+\.\d+|최고\d+|보통\d+|낮음\d+)/i,
        /지수\s*[:：]?\s*(최적\d+|준최\d+\.\d+|최고\d+|보통\d+|낮음\d+)/i,
        /(최적\d+|준최\d+\.\d+|최고\d+|보통\d+|낮음\d+)\s*지수/i
      ];
      for (const pattern of indexPatterns) {
        const match = pageText.match(pattern);
        if (match) {
          info.blogIndex = match[1];
          break;
        }
      }

      // C-RANK, D.I.A, D.I.A+ 패턴 (페이지에 표시된 경우에만 추출)
      const cRankMatch = pageText.match(/C[- ]?RANK[^0-9]*(\d{1,3})/i);
      if (cRankMatch) {
        const score = parseInt(cRankMatch[1]);
        if (score >= 0 && score <= 100) {
          info.cRank = `${score}/100`;
        }
      }

      const diaMatch = pageText.match(/D\.?I\.?A(?!\+)[^0-9]*(\d{1,3})/i);
      if (diaMatch) {
        const score = parseInt(diaMatch[1]);
        if (score >= 0 && score <= 100) {
          info.dia = `${score}/100`;
        }
      }

      const diaPlusMatch = pageText.match(/D\.?I\.?A\+[^0-9]*(\d{1,3})/i);
      if (diaPlusMatch) {
        const score = parseInt(diaPlusMatch[1]);
        if (score >= 0 && score <= 100) {
          info.diaPlus = `${score}/100`;
        }
      }

      console.log('>>> 페이지 텍스트 샘플:', pageText.substring(0, 1000));
      console.log('>>> 찾은 정보:', info);

      return info;
    });

    console.log(`>>> 블로그 상세 정보:`, blogInfo);
    return blogInfo;
    
  } catch (error) {
    console.error('블로그 상세 정보 크롤링 오류:', error);
    return {
      blogName: '',
      blogTopic: '',
      nickname: '',
      neighborCount: '',
      creationDate: '',
      operationPeriod: '',
      todayVisitors: '',
      totalScraps: '',
      monthlyPosts: '',
      totalPosts: '',
      blogIndex: '',
      cRank: '',
      dia: '',
      diaPlus: ''
    };
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

// 네이버 블로그 RSS 피드에서 블로그 정보 가져오기
async function fetchBlogInfoFromRSS(blogId: string) {
  try {
    const rssUrl = `https://rss.blog.naver.com/${blogId}.xml`;
    
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      return {
        blogTopic: ''
      };
    }

    const xmlText = await response.text();
    
    // RSS 피드의 channel에서 블로그 정보 추출
    const blogInfo: any = {
      blogTopic: ''
    };
    
    // category 태그 찾기 (CDATA 포함)
    const categoryMatch = xmlText.match(/<category><!\[CDATA\[(.*?)\]\]><\/category>|<category>(.*?)<\/category>/);
    if (categoryMatch) {
      blogInfo.blogTopic = (categoryMatch[1] || categoryMatch[2] || '').trim();
    }
    
    // title 태그에서 블로그명 추출
    const titleMatch = xmlText.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
    if (titleMatch) {
      const title = (titleMatch[1] || titleMatch[2] || '').replace(/<[^>]*>/g, '').trim();
      // RSS 피드의 title은 보통 블로그명
      if (title && !title.includes('RSS') && !title.includes('rss')) {
        blogInfo.blogName = title;
      }
    }
    
    // description 태그에서 추가 정보 추출
    const descMatch = xmlText.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/);
    if (descMatch) {
      const description = (descMatch[1] || descMatch[2] || '').replace(/<[^>]*>/g, '').trim();
      // description에서 닉네임이나 다른 정보 추출 시도
    }
    
    return blogInfo;
  } catch (error) {
    console.error('RSS 블로그 정보 가져오기 오류:', error);
    return {
      blogTopic: ''
    };
  }
}

// 네이버 블로그 RSS 피드에서 글 목록 가져오기
async function fetchBlogListFromRSS(blogId: string, count: number) {
  try {
    // 네이버 블로그 RSS 피드 URL 형식
    const rssUrl = `https://rss.blog.naver.com/${blogId}.xml`;
    console.log(`>>> RSS 피드 URL 시도: ${rssUrl}`);
    
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      console.log(`>>> RSS 피드 접근 실패: ${response.status}`);
      return { total: 0, items: [] };
    }

    const xmlText = await response.text();
    
    // XML 파싱 (간단한 정규식 사용)
    const items: any[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    let itemCount = 0;

    while ((match = itemRegex.exec(xmlText)) !== null && itemCount < count) {
      const itemXml = match[1];
      
      // CDATA와 일반 텍스트 모두 처리
      const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
      const linkMatch = itemXml.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>|<link>(.*?)<\/link>/);
      const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);
      const descriptionMatch = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/);
      
      const title = titleMatch ? (titleMatch[1] || titleMatch[2] || '').replace(/<[^>]*>/g, '').trim() : '';
      // 링크에서 CDATA 처리 및 URL 디코딩
      let link = '';
      if (linkMatch) {
        link = (linkMatch[1] || linkMatch[2] || '').trim();
        // CDATA 제거 (이미 정규식에서 처리했지만 안전을 위해)
        link = link.replace(/<!\[CDATA\[|\]\]>/g, '');
        // URL 디코딩
        try {
          link = decodeURIComponent(link);
        } catch (e) {
          // 디코딩 실패 시 원본 사용
        }
      }
      const pubDate = pubDateMatch ? pubDateMatch[1].trim() : '';
      const description = descriptionMatch ? (descriptionMatch[1] || descriptionMatch[2] || '').replace(/<[^>]*>/g, '').trim() : '';
      
      // 날짜 형식 변환 (RFC 822 -> YYYY.MM.DD)
      let publicationDate = '';
      if (pubDate) {
        try {
          const date = new Date(pubDate);
          if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            publicationDate = `${year}.${month}.${day}`;
          }
        } catch (e) {
          // 날짜 파싱 실패 시 무시
        }
      }
      
      if (title && link) {
        items.push({
          publicationDate: publicationDate,
          title: title,
          index: '준최5.5',
          reliability: '',
          relevance: '',
          reflection: '',
          charCount: description.length,
          imageCount: 0,
          likes: '',
          comments: '',
          shares: '',
          link: link,
          id: blogId,
          nickname: blogId,
          description: description
        });
        itemCount++;
      }
    }

    console.log(`>>> RSS 피드에서 ${items.length}개의 글 발견`);
    return {
      total: items.length,
      items: items
    };
  } catch (error) {
    console.error('RSS 피드 가져오기 오류:', error);
    return { total: 0, items: [] };
  }
}

async function fetchBlogListByUserId(
  blogId: string,
  count: number,
  sort: string,
  clientId: string,
  clientSecret: string
) {
  try {
    const allItems: any[] = [];
    const maxPages = Math.ceil(count / 100) + 3; // 충분한 페이지 수집
    
    console.log(`>>> 블로거 ID "${blogId}"의 블로그 글 목록을 가져오는 중...`);
    
    // 여러 검색 전략 시도
    const searchStrategies = [
      `blog.naver.com/${blogId}`, // 블로그 URL 포함
      blogId, // 블로거 ID 직접
    ];
    
    let strategyIndex = 0;
    let foundResults = false;
    
    // 여러 페이지를 가져와서 해당 블로거의 글만 수집
    for (let page = 1; page <= maxPages && allItems.length < count; page++) {
      const start = (page - 1) * 100 + 1;
      const display = 100; // API 최대값
      
      // 검색 전략 선택 (첫 페이지에서만 전략 변경)
      const query = page === 1 ? searchStrategies[strategyIndex] : searchStrategies[strategyIndex];
      const url = `${NAVER_API_BASE}/blog.json?query=${encodeURIComponent(query)}&display=${display}&start=${start}&sort=${sort}`;
      
      console.log(`>>> [페이지 ${page}] 검색 전략: "${query}", URL: ${url.substring(0, 100)}...`);
      
      const response = await fetch(url, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`블로그 API 오류 (페이지 ${page}):`, response.status, errorText);
        
        // 첫 페이지에서 첫 번째 전략이 실패하면 다음 전략 시도
        if (page === 1 && strategyIndex < searchStrategies.length - 1) {
          strategyIndex++;
          page = 0; // 다음 반복에서 다시 1부터 시작
          continue;
        }
        break;
      }

      const data = await response.json();
      const items = data.items || [];
      const total = data.total || 0;
      
      console.log(`>>> [페이지 ${page}] API 응답: 전체 ${total}개, 현재 페이지 ${items.length}개`);
      
      if (items.length === 0) {
        // 첫 페이지에서 결과가 없으면 다음 검색 전략 시도
        if (page === 1 && strategyIndex < searchStrategies.length - 1) {
          strategyIndex++;
          page = 0; // 다음 반복에서 다시 1부터 시작
          continue;
        }
        break; // 더 이상 결과가 없으면 중단
      }
      
      // 디버깅: 첫 번째 아이템의 bloggerlink 확인
      if (page === 1 && items.length > 0) {
        console.log(`>>> [디버깅] 첫 번째 결과 예시:`);
        console.log(`>>>   - title: ${items[0].title?.substring(0, 50)}...`);
        console.log(`>>>   - bloggerlink: ${items[0].bloggerlink}`);
        console.log(`>>>   - bloggername: ${items[0].bloggername}`);
      }

      // 해당 블로거 ID의 글만 필터링
      const filteredItems = items.filter((item: any) => {
        // bloggerlink에서 블로거 ID 추출 (정확한 매칭)
        if (item.bloggerlink) {
          // blog.naver.com/블로거ID 형식에서 ID 추출
          const match = item.bloggerlink.match(/blog\.naver\.com\/([^\/\?&#]+)/);
          if (match) {
            const extractedId = match[1];
            // 정확히 일치하는지 확인
            if (extractedId === blogId || extractedId.toLowerCase() === blogId.toLowerCase()) {
              return true;
            }
          }
        }
        // bloggername으로도 확인
        if (item.bloggername) {
          const name = item.bloggername.toLowerCase().trim();
          const targetId = blogId.toLowerCase().trim();
          if (name === targetId) {
            return true;
          }
        }
        return false;
      });

      console.log(`>>> [페이지 ${page}] 필터링: ${items.length}개 중 ${filteredItems.length}개가 해당 블로거의 글`);

      allItems.push(...filteredItems);
      foundResults = foundResults || filteredItems.length > 0;
      
      // 충분한 결과를 수집했거나 더 이상 결과가 없으면 중단
      if (allItems.length >= count || items.length < display) {
        break;
      }
    }
    
    if (!foundResults && allItems.length === 0) {
      console.log(`>>> 경고: 블로거 ID "${blogId}"에 대한 검색 결과가 없습니다.`);
      console.log(`>>> 가능한 원인:`);
      console.log(`>>>   1. 블로거 ID가 잘못되었거나 존재하지 않음`);
      console.log(`>>>   2. 해당 블로거의 글이 검색 인덱스에 없음`);
      console.log(`>>>   3. 네이버 검색 API가 해당 블로거의 글을 반환하지 않음`);
      console.log(`>>> 해결 방법: 네이버 블로그에서 직접 확인하거나, 블로거 ID를 다시 확인해주세요.`);
    }

    // 요청한 개수만큼만 반환
    const finalItems = allItems.slice(0, count);

    console.log(`>>> 최종 결과: ${allItems.length}개 수집, ${finalItems.length}개 반환`);

    // API 응답을 표준 형식으로 변환
    const formattedResults = finalItems.map((item: any, index: number) => {
      // 제목에서 HTML 태그 제거
      const title = item.title?.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') || '';
      const description = item.description?.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') || '';
      
      // 발행일 포맷팅 (YYYYMMDD -> YYYY.MM.DD)
      let publicationDate = '';
      if (item.postdate) {
        const dateStr = item.postdate;
        if (dateStr.length === 8) {
          publicationDate = `${dateStr.substring(0, 4)}.${dateStr.substring(4, 6)}.${dateStr.substring(6, 8)}`;
        }
      }

      // 글자수 계산
      const charCount = description.length;

      return {
        publicationDate: publicationDate,
        title: title,
        index: '준최5.5', // 기본값 (실제 블로그지수는 API로 가져올 수 없음)
        reliability: '', // 신뢰도 (API로 제공되지 않음)
        relevance: '', // 연관도 (API로 제공되지 않음)
        reflection: '', // 반영도 (API로 제공되지 않음)
        charCount: charCount,
        imageCount: 0, // 이미지수 (API로 제공되지 않음)
        likes: '', // 공감 (API로 제공되지 않음)
        comments: '', // 댓글 (API로 제공되지 않음)
        shares: '', // 공유 (API로 제공되지 않음)
        link: item.link || item.originallink || '',
        id: blogId,
        nickname: item.bloggername || blogId,
        description: description
      };
    });

    return {
      total: formattedResults.length,
      items: formattedResults
    };
  } catch (error) {
    console.error('블로그 리스트 API 호출 오류:', error);
    return { total: 0, items: [] };
  }
}

