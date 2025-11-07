import { NextRequest, NextResponse } from 'next/server';

// Vercel 서버리스 함수 설정
export const runtime = 'nodejs';
export const maxDuration = 60;

// Puppeteer 관련 타입 정의 (any를 피하기 위해)
type Puppeteer = typeof import('puppeteer');
type PuppeteerCore = typeof import('puppeteer-core');
type Chromium = typeof import('@sparticuz/chromium');

export async function POST(request: NextRequest) {
  // 환경 변수는 함수 시작 시 한 번만 읽습니다.
  const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined;
  const isProduction = process.env.NODE_ENV === 'production';

  console.log('>>> 환경 정보:', {
    isVercel,
    isProduction,
    runtime: runtime, // 'nodejs'
  });

  let puppeteer: PuppeteerCore | Puppeteer | null = null;
  let chromium: Chromium | null = null;
  let importError: any = null;

  try {
    const { keyword } = await request.json();

    if (!keyword) {
      return NextResponse.json({ error: '키워드가 필요합니다.' }, { status: 400 });
    }

    // --- 동적 import 및 환경 설정 ---
    if (isVercel) {
      // Vercel 환경: puppeteer-core + @sparticuz/chromium 사용 (필수)
      console.log('>>> Vercel 환경: puppeteer-core + @sparticuz/chromium 로드 시도');
      try {
        // Vercel에서 필요한 모듈만 로드
        puppeteer = (await import('puppeteer-core')).default as unknown as PuppeteerCore;
        chromium = await import('@sparticuz/chromium');
        console.log('>>> Vercel용 Puppeteer/Chromium 로드 성공');
      } catch (vercelError: any) {
        importError = vercelError;
        console.error('>>> Vercel 환경 Puppeteer 로드 실패 (종속성 누락 가능성):', vercelError.message);
        // 이 환경에서는 이 시도가 실패하면 복구 불가능합니다.
      }
    } else {
      // 로컬 개발 환경: 일반 puppeteer 사용
      console.log('>>> 로컬 환경: 일반 puppeteer 로드 시도');
      try {
        puppeteer = (await import('puppeteer')).default as unknown as Puppeteer;
        console.log('>>> 로컬용 Puppeteer 로드 성공');
      } catch (localError: any) {
        importError = localError;
        console.error('>>> 로컬 환경 Puppeteer 로드 실패:', localError.message);
      }
    }

    // 모든 import 시도가 실패한 경우 처리
    if (!puppeteer) {
      console.error('>>> 모든 Puppeteer import 시도 실패');
      return NextResponse.json({
        error: 'Puppeteer를 로드할 수 없습니다. (종속성 확인 필요)',
        details: importError?.message || '알 수 없는 오류',
        isVercel,
        isProduction,
      }, { status: 500 });
    }
    // --- 동적 import 및 환경 설정 끝 ---

    console.log('>>> Puppeteer 로드 최종 성공. 크롤링 시작:', keyword);
    // 실제로 Puppeteer 실행 시도
    const smartBlockData = await crawlNaverSearchWithPuppeteer(
      keyword,
      puppeteer,
      chromium,
      isVercel
    );

    return NextResponse.json({
      keyword,
      timestamp: new Date().toLocaleString(),
      smartBlocks: smartBlockData,
      totalBlocks: smartBlockData.length
    });
  } catch (error: any) {
    console.error('최종 크롤링/서버 오류:', error);

    const errorResponse: any = {
      error: '서버 오류가 발생했습니다. Puppeteer 실행 오류가 의심됩니다.',
    };

    // 개발 환경에서만 상세 정보 반환
    if (process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'development') {
      errorResponse.details = error?.message;
      errorResponse.stack = error?.stack;
      errorResponse.name = error?.name;
    }

    return NextResponse.json(errorResponse, { status: 500 });
  }
}

async function crawlNaverSearchWithPuppeteer(
  keyword: string,
  puppeteer: any, // puppeteer-core 또는 puppeteer
  chromium: any, // @sparticuz/chromium 또는 null
  isVercel: boolean
) {
  let browser: any;
  const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;

  try {
    // Vercel 환경에 최적화된 실행 옵션 설정
    let launchOptions: any = {
      headless: true, // Vercel 환경에서는 항상 true
      timeout: isVercel ? 45000 : 60000,
    };

    if (isVercel && chromium) {
      console.log('>>> Vercel 환경: @sparticuz/chromium 최적화 설정 적용');
      // @sparticuz/chromium에서 권장하는 인자와 실행 경로 사용
      launchOptions.args = chromium.args;
      launchOptions.executablePath = await chromium.executablePath();
      launchOptions.headless = chromium.headless; // Vercel 환경에 맞는 Headless 설정 (대부분 'new')

      // 추가적인 메모리 절약 인자
      launchOptions.args.push(
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--single-process'
      );

      console.log('>>> Chromium executablePath 설정 완료:', launchOptions.executablePath ? 'OK' : 'FAIL');
    } else {
      // 로컬 환경 또는 Chromium을 로드하지 못한 경우
      launchOptions.args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ];
    }
    
    // Puppeteer를 헤드리스 모드로 실행
    try {
      browser = await puppeteer.launch(launchOptions);
      console.log('>>> Puppeteer 브라우저 실행 성공');
    } catch (launchError: any) {
      console.error('>>> Puppeteer 브라우저 실행 실패:', launchError);
      // 브라우저 실행 실패는 500 에러의 가장 흔한 원인입니다.
      throw new Error(`Puppeteer 브라우저 실행 실패: (경로: ${launchOptions.executablePath || '기본값'}) ${launchError?.message || '알 수 없는 오류'}`);
    } 

    const page = await browser.newPage();
    
    // User-Agent 설정
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 페이지 이동
    const pageTimeout = isVercel ? 45000 : 60000;
    console.log(`>>> 네이버 검색 페이지 로드 시도: ${url} (타임아웃: ${pageTimeout}ms)`);
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: pageTimeout
    });

    // --- 스크롤 로직 (동적 로딩) ---
    let previousHeight;
    let scrollCount = 0;
    const maxScrolls = isVercel ? 3 : 10; // Vercel에서는 3회로 제한

    while (scrollCount < maxScrolls) {
      previousHeight = await page.evaluate('document.body.scrollHeight');
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      // 스크롤 후 동적 로딩을 위한 충분한 대기 시간
      await new Promise(resolve => setTimeout(resolve, isVercel ? 1500 : 2000));
      let newHeight = await page.evaluate('document.body.scrollHeight');
      
      if (newHeight === previousHeight) {
        break; // 더 이상 스크롤할 내용이 없으면 중단
      }
      scrollCount++;
    }
    // --- 스크롤 로직 종료 ---

    // 스마트블록 컨테이너를 찾기 위한 셀렉터
    const smartBlockSelectors = [
      'a.jyxwDwu8umzdhCQxX48l', // 표준 스마트블록 링크 클래스
      '.fds-flicking-augmentation a', // flicking 컨테이너 내 링크
    ];

    // 스마트블록이 로드될 때까지 대기
    const selectorTimeout = isVercel ? 10000 : 15000; 
    try {
        // 하나의 셀렉터라도 성공할 때까지 기다림
        await Promise.any(smartBlockSelectors.map(selector => 
            page.waitForSelector(selector, { timeout: selectorTimeout })
        ));
    } catch (e) {
        console.log('>>> 지정된 시간 내에 스마트블록을 찾지 못했습니다. 현재 DOM 상태로 추출을 시도합니다.');
    }
    // 추가 대기 시간 (최종 렌더링을 위해)
    await new Promise(resolve => setTimeout(resolve, isVercel ? 1000 : 2000));

    const smartBlocks = await page.evaluate(() => {
      const results: any[] = [];
      const extractedTitles = new Set<string>();
      const items: any[] = [];

      // 스마트블록 링크 찾기 (여러 셀렉터 시도)
      const smartBlockLinks = document.querySelectorAll(
        'a.jyxwDwu8umzdhCQxX48l, ' +
        '.fds-flicking-augmentation a[href*="query="]'
      );

      smartBlockLinks.forEach((link: Element) => {
        // 검색어 텍스트 추출 (주요 키워드)
        const textElement = link.querySelector('span.sds-comps-ellipsis-content');
        if (!textElement) return;

        // mark 태그를 제거하고 순수 텍스트만 추출하는 로직은 복잡하므로,
        // 현재는 텍스트를 포함하는 가장 안전한 방식으로 추출합니다.
        const originalText = textElement.textContent?.trim() || '';
        let text = originalText.replace(/\s+/g, ' ').trim();

        if (!text || text.length < 1 || extractedTitles.has(text)) {
          return;
        }

        // 태그 추출 (박상훈님을 위한, 요즘 인기 등)
        let tag: string | undefined;
        let tagType: 'personal' | 'popular' | undefined;
        
        const badgeElement = link.querySelector('span.sds-comps-text-type-badge');
        if (badgeElement) {
          const badgeText = badgeElement.textContent?.trim() || '';
          tag = badgeText;
          if (badgeText.includes('님을 위한')) {
            tagType = 'personal';
          } else if (badgeText.includes('인기')) {
            tagType = 'popular';
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

    return smartBlocks;
    
  } catch (error: any) {
    // 오류를 상위로 전달하여 catch 블록에서 처리
    throw error;
  } finally {
    if (browser) {
      // 메모리 누수를 방지하기 위해 브라우저를 반드시 닫습니다.
      await browser.close();
    }
  }
}