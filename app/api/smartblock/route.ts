import { NextRequest, NextResponse } from 'next/server';

// Vercel 서버리스 함수 설정
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { keyword } = await request.json();

    if (!keyword) {
      return NextResponse.json({ error: '키워드가 필요합니다.' }, { status: 400 });
    }

    // 환경 감지 (더 견고하게)
    const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined;
    const isProduction = process.env.NODE_ENV === 'production';
    
    console.log('>>> 환경 정보:', { 
      VERCEL: process.env.VERCEL, 
      VERCEL_ENV: process.env.VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
      isVercel,
      isProduction
    });
    
    // 동적 import로 puppeteer 로드 (환경에 따라 다르게)
    let puppeteer: any = null;
    let chromium: any = null;
    let importError: any = null;
    
    // Vercel 환경에서는 puppeteer-core + @sparticuz/chromium 시도
    if (isVercel) {
      try {
        console.log('>>> Vercel 환경: puppeteer-core + @sparticuz/chromium 로드 시도');
        puppeteer = (await import('puppeteer-core')).default;
        chromium = await import('@sparticuz/chromium');
        
        // Chromium 바이너리 경로 설정
        if (chromium && typeof chromium.setGraphicsMode === 'function') {
          chromium.setGraphicsMode(false); // 헤드리스 모드 최적화
        }
        console.log('>>> puppeteer-core + @sparticuz/chromium 로드 성공');
      } catch (vercelError: any) {
        console.error('>>> Vercel 환경에서 puppeteer-core 로드 실패:', vercelError);
        importError = vercelError;
        
        // Fallback: 일반 puppeteer 시도
        try {
          console.log('>>> Fallback: 일반 puppeteer 로드 시도');
          puppeteer = (await import('puppeteer')).default;
          chromium = null;
          console.log('>>> Fallback puppeteer 로드 성공');
        } catch (fallbackError: any) {
          console.error('>>> Fallback puppeteer 로드도 실패:', fallbackError);
          importError = fallbackError;
        }
      }
    } else {
      // 로컬 개발 환경: 일반 puppeteer 사용
      try {
        console.log('>>> 로컬 환경: puppeteer 로드 시도');
        puppeteer = (await import('puppeteer')).default;
        console.log('>>> puppeteer 로드 성공');
      } catch (localError: any) {
        console.error('>>> 로컬 환경에서 puppeteer 로드 실패:', localError);
        importError = localError;
      }
    }
    
    // 모든 import 시도가 실패한 경우
    if (!puppeteer) {
      console.error('>>> 모든 Puppeteer import 시도 실패');
      return NextResponse.json({ 
        error: 'Puppeteer를 로드할 수 없습니다.',
        details: importError?.message || '알 수 없는 오류',
        stack: importError?.stack,
        isVercel,
        isProduction,
        env: {
          VERCEL: process.env.VERCEL,
          VERCEL_ENV: process.env.VERCEL_ENV,
          NODE_ENV: process.env.NODE_ENV
        }
      }, { status: 500 });
    }
    
    console.log('>>> Puppeteer 로드 최종 성공:', { 
      hasPuppeteer: !!puppeteer, 
      hasChromium: !!chromium,
      isVercel 
    });

    // 실제로 Puppeteer 실행 시도
    console.log('>>> 스마트블록 크롤링 시작:', keyword);
    const smartBlockData = await crawlNaverSearchWithPuppeteer(keyword, puppeteer, chromium, isVercel);

    return NextResponse.json({
      keyword,
      timestamp: new Date().toLocaleString(),
      smartBlocks: smartBlockData,
      totalBlocks: smartBlockData.length
    });
  } catch (error: any) {
    console.error('크롤링 오류:', error);
    console.error('오류 상세:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      code: error?.code
    });
    
    // 더 자세한 에러 정보 반환 (개발 환경에서만)
    const errorResponse: any = { 
      error: '서버 오류가 발생했습니다.',
    };
    
    if (process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'development') {
      errorResponse.details = error?.message;
      errorResponse.stack = error?.stack;
    }
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}

async function crawlNaverSearchWithPuppeteer(
  keyword: string, 
  puppeteer: any, 
  chromium: any,
  isVercel: boolean
) {
  let browser;

  try {
    // 배포 환경(Vercel 등)에서 Puppeteer 실행 옵션
    const launchOptions: any = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // 서버리스 환경에서 메모리 절약
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-domain-reliability',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-notifications',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-pings',
        '--use-mock-keychain',
        '--hide-scrollbars',
        '--ignore-certificate-errors',
        '--ignore-ssl-errors',
        '--ignore-certificate-errors-spki-list'
      ]
    };

    // Vercel/서버리스 환경에서는 @sparticuz/chromium 사용
    if (isVercel && chromium) {
      try {
        console.log('>>> Vercel 환경: @sparticuz/chromium 사용');
        if (typeof chromium.executablePath === 'function') {
          launchOptions.executablePath = await chromium.executablePath();
        } else if (chromium.executablePath) {
          launchOptions.executablePath = chromium.executablePath;
        }
        launchOptions.timeout = 30000; // 30초 타임아웃
        console.log('>>> Chromium executablePath 설정됨:', launchOptions.executablePath ? '설정됨' : '실패');
      } catch (chromiumError: any) {
        console.error('>>> Chromium executablePath 가져오기 실패:', chromiumError);
        // chromium 없이도 계속 진행 (일반 puppeteer 사용)
      }
    }

    console.log('>>> Puppeteer 실행 옵션:', {
      headless: launchOptions.headless,
      argsCount: launchOptions.args?.length,
      executablePath: launchOptions.executablePath ? '설정됨' : '기본값',
      timeout: launchOptions.timeout
    });
    
    // Puppeteer를 헤드리스 모드로 실행 (GUI 없이)
    try {
      browser = await puppeteer.launch(launchOptions);
      console.log('>>> Puppeteer 브라우저 실행 성공');
    } catch (launchError: any) {
      console.error('>>> Puppeteer 브라우저 실행 실패:', launchError);
      throw new Error(`Puppeteer 브라우저 실행 실패: ${launchError?.message || '알 수 없는 오류'}`);
    } 

    const page = await browser.newPage();
    
    // User-Agent 설정 (봇으로 인식되지 않도록 실제 브라우저처럼 위장)
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 네이버 검색 페이지로 이동
    const pageTimeout = isVercel ? 45000 : 60000; // Vercel에서는 45초로 제한
    await page.goto(`https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`, { 
      waitUntil: 'domcontentloaded', // DOM 콘텐츠가 로드될 때까지 기다림
      timeout: pageTimeout
    });

    // --- 페이지 스크롤 로직 시작 ---
    // 페이지를 끝까지 스크롤하여 모든 동적 콘텐츠 (스마트블록 포함)가 로드되도록 합니다.
    let previousHeight;
    let scrollCount = 0;
    const maxScrolls = isVercel ? 3 : 10; // Vercel에서는 최대 3번만 스크롤 (성능 최적화)
    
    while (scrollCount < maxScrolls) {
      previousHeight = await page.evaluate('document.body.scrollHeight');
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      // Vercel에서는 더 짧은 대기 시간 사용
      await new Promise(resolve => setTimeout(resolve, isVercel ? 1500 : 2000));
      let newHeight = await page.evaluate('document.body.scrollHeight');
      if (newHeight === previousHeight) {
        break; // 더 이상 스크롤할 내용이 없으면 중단
      }
      scrollCount++;
    }
    // --- 페이지 스크롤 로직 종료 ---

    // 스마트블록 컨테이너를 찾기 위한 셀렉터
    // 실제 네이버 스마트블록 구조에 맞춘 셀렉터
    const smartBlockSelectors = [
      'a.jyxwDwu8umzdhCQxX48l', // 스마트블록 링크
      'a[class*="jyxwDwu8umzdhCQxX48l"]', // 클래스가 포함된 링크
      '.fds-flicking-augmentation a', // flicking 컨테이너 내 링크
    ];

    // 스마트블록이 로드될 때까지 대기
    const selectorTimeout = isVercel ? 10000 : 15000; // Vercel에서는 더 짧은 타임아웃
    await Promise.any(smartBlockSelectors.map(selector => 
        page.waitForSelector(selector, { timeout: selectorTimeout })
    )).catch(() => console.log('>>> 스마트블록을 찾지 못했습니다. 계속 진행합니다.'));

    // 추가 대기 시간 (동적 콘텐츠 로딩) - Vercel에서는 더 짧게
    await new Promise(resolve => setTimeout(resolve, isVercel ? 1000 : 2000));

    const smartBlocks = await page.evaluate(() => {
      const results: any[] = [];
      const extractedTitles = new Set<string>(); // 중복된 키워드 추출을 방지하기 위한 Set
      const items: any[] = [];

      // 스마트블록 링크 찾기 (여러 셀렉터 시도)
      const smartBlockLinks = document.querySelectorAll(
        'a.jyxwDwu8umzdhCQxX48l, ' +
        'a[class*="jyxwDwu8umzdhCQxX48l"], ' +
        '.fds-flicking-augmentation a[href*="query="]'
      );

      smartBlockLinks.forEach((link: Element) => {
        // 검색어 텍스트 추출
        const textElement = link.querySelector('span.sds-comps-ellipsis-content');
        if (!textElement) return;

        // mark 태그 제거하고 순수 텍스트만 추출
        const clonedElement = textElement.cloneNode(true) as Element;
        const markTags = clonedElement.querySelectorAll('mark');
        markTags.forEach(mark => mark.remove());
        
        let text = clonedElement.textContent?.trim() || '';
        
        // mark 태그가 있으면 그 안의 텍스트도 포함하여 전체 검색어 구성
        const markElements = textElement.querySelectorAll('mark');
        if (markElements.length > 0) {
          const originalText = textElement.textContent?.trim() || '';
          text = originalText.replace(/\s+/g, ' ').trim();
        }

        if (!text || text.length < 1 || extractedTitles.has(text)) {
          return; // 빈 텍스트나 중복은 제외
        }

        // 태그 추출 (박상훈님을 위한, 요즘 인기 등)
        let tag: string | undefined;
        let tagType: 'personal' | 'popular' | undefined;
        
        const badgeElement = link.querySelector('span.sds-comps-text-type-badge');
        if (badgeElement) {
          const badgeText = badgeElement.textContent?.trim() || '';
          if (badgeText.includes('박상훈님을 위한') || badgeText.includes('개인화')) {
            tag = '박상훈님을 위한';
            tagType = 'personal';
          } else if (badgeText.includes('요즘 인기') || badgeText.includes('인기')) {
            tag = '요즘 인기';
            tagType = 'popular';
          } else if (badgeText) {
            tag = badgeText;
          }
        }

        items.push({
          title: text,
          tag: tag,
          tagType: tagType,
          icon: tagType === 'popular' ? '🔥' : tagType === 'personal' ? '⭐' : '💡',
          description: `${text} 관련 정보`,
        });

        extractedTitles.add(text);
      });

      if (items.length > 0) {
        results.push({
          id: 'smart_block_' + Date.now(),
          title: '함께 많이 찾는',
          icon: '💡',
          type: 'topics',
          data: items
        });
      }

      return results;
    });

    console.log(`>>> 최종 추출된 스마트블록 그룹 개수: ${smartBlocks.length}`);
    smartBlocks.forEach((block: any) => {
        console.log(`>>>   - ${block.title} (${block.data.length}개 항목)`);
    });

    return smartBlocks;
    
  } catch (error: any) {
    console.error('Puppeteer 크롤링 중 예상치 못한 오류 발생:', error);
    console.error('오류 상세:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name
    });
    // 에러를 상위로 전달하여 클라이언트에서 처리할 수 있도록
    throw new Error(`스마트블록 크롤링 실패: ${error?.message || '알 수 없는 오류'}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

