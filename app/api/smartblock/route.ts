import { NextRequest, NextResponse } from 'next/server';

// Vercel 서버리스 함수 설정
// 무료 플랜(Hobby) 제한: 최대 10초 실행 시간, 1024MB 메모리
export const runtime = 'nodejs';
export const maxDuration = 10; // 무료 플랜 최대값

// Puppeteer 관련 타입 정의 (any를 피하기 위해)
type Puppeteer = typeof import('puppeteer');
type PuppeteerCore = typeof import('puppeteer-core');
type Chromium = typeof import('@sparticuz/chromium');

export async function POST(request: NextRequest) {
// 
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
    // Vercel 환경에 최적화된 실행 옵션 설정 (무료 플랜 최적화)
    let launchOptions: any = {
      headless: true,
      timeout: isVercel ? 2500 : 60000, // 무료 플랜: 2.5초 타임아웃
    };

    if (isVercel && chromium) {
      console.log('>>> Vercel 무료 플랜: 극도로 최적화된 설정 적용');
      // @sparticuz/chromium에서 권장하는 인자 사용
      launchOptions.args = [...chromium.args];
      launchOptions.executablePath = await chromium.executablePath();
      launchOptions.headless = chromium.headless; 

      // 메모리 및 성능 최적화 인자 (무료 플랜용)
      launchOptions.args.push(
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--single-process', // 메모리 절약 (필수)
        '--no-zygote', // 메모리 절약 (필수)
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-domain-reliability',
        '--disable-features=TranslateUI',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-notifications',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-first-run',
        '--no-pings',
        '--use-mock-keychain',
        '--hide-scrollbars',
        '--ignore-certificate-errors',
        '--ignore-ssl-errors',
        '--ignore-certificate-errors-spki-list',
        '--window-size=1024,768', // 더 작은 창 크기로 메모리 절약
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
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
    
    // Puppeteer를 헤드리스 모드로 실행 (무료 플랜: 빠른 실행)
    try {
      console.log('>>> 브라우저 실행 시작 (타임아웃: 2.5초)');
      const launchPromise = puppeteer.launch(launchOptions);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('브라우저 실행 타임아웃')), 2500)
      );
      browser = await Promise.race([launchPromise, timeoutPromise]) as any;
      console.log('>>> Puppeteer 브라우저 실행 성공');
    } catch (launchError: any) {
      console.error('>>> Puppeteer 브라우저 실행 실패:', launchError);
      throw new Error(`Puppeteer 브라우저 실행 실패: ${launchError?.message || '알 수 없는 오류'}`);
    } 

    const page = await browser.newPage();
    
    // User-Agent 설정
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 페이지 이동 (무료 플랜: 초고속 로딩)
    const pageTimeout = isVercel ? 3500 : 60000; // 무료 플랜: 3.5초만 대기
    console.log(`>>> 네이버 검색 페이지 로드 시도: ${url} (타임아웃: ${pageTimeout}ms)`);
    await page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: pageTimeout
    });

    if (isVercel) {
      // 빠른 스크롤 (스마트블록은 보통 상단에 있음)
      await page.evaluate('window.scrollTo(0, 300)');
      await new Promise((resolve) => setTimeout(resolve, 400));
      await page.evaluate('window.scrollTo(0, 900)');
    } else {
      // 로컬: 기존 로직
      let previousHeight;
      let scrollCount = 0;
      const maxScrolls = 10;
      while (scrollCount < maxScrolls) {
        previousHeight = await page.evaluate('document.body.scrollHeight');
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        await new Promise(resolve => setTimeout(resolve, 2000));
        let newHeight = await page.evaluate('document.body.scrollHeight');
        if (newHeight === previousHeight) break;
        scrollCount++;
      }
    }
    // --- 스크롤 로직 종료 ---

    // 스마트블록 컨테이너를 찾기 위한 셀렉터
    const smartBlockSelectors = [
      'a.jyxwDwu8umzdhCQxX48l',
      '.fds-flicking-augmentation a',
      '.sds-comps-vertical-layout[data-template-id="ugcItem"]',
      '.fds-ugc-block-mod',
    ];

    // 스마트블록 대기 (무료 플랜: 매우 짧은 대기)
    const selectorTimeout = isVercel ? 2500 : 15000; // 무료 플랜: 2.5초만 대기
    try {
      await Promise.any(
        smartBlockSelectors.map((selector) =>
          page.waitForSelector(selector, { timeout: selectorTimeout })
        )
      );
    } catch (e) {
      console.log('>>> 스마트블록 대기 시간 초과. 현재 DOM으로 추출 시도.');
    }
    // 최소 대기 (무료 플랜: 600ms)
    await new Promise((resolve) => setTimeout(resolve, isVercel ? 600 : 2000));

    const smartBlocks = await page.evaluate(() => {
      const results: any[] = [];

      // 스마트블록 컨테이너들 찾기 (각 탭)
      let collectionRoots = Array.from(document.querySelectorAll('.fds-collection-root'));

      if (collectionRoots.length === 0) {
        collectionRoots = Array.from(
          document.querySelectorAll('.sds-comps-vertical-layout[data-template-type="vertical"][data-template-id="layout"]')
        );
      }

      const maxBlocks = Math.min(4, collectionRoots.length);

      for (let index = 0; index < maxBlocks; index++) {
        const collectionRoot = collectionRoots[index] as Element;
        
        // 스마트블록 탭 제목 추출 (여러 셀렉터 시도)
        let blockTitle = '';
        
        // 방법 1: 기본 셀렉터
        const headlineElement = collectionRoot.querySelector('.fds-comps-header-headline .fds-comps-text');
        if (headlineElement) {
          blockTitle = headlineElement.textContent?.trim() || '';
        }
        
        // 방법 2: 직접 클래스로 찾기
        if (!blockTitle) {
          const headlineDirect = collectionRoot.querySelector('.fds-comps-header-headline');
          if (headlineDirect) {
            blockTitle = headlineDirect.textContent?.trim() || '';
          }
        }
        
        // 방법 3: zGAg4BVegdEEkSYCTjAo 클래스로 찾기
        if (!blockTitle) {
          const altHeadline = collectionRoot.querySelector('.zGAg4BVegdEEkSYCTjAo .fds-comps-text');
          if (altHeadline) {
            blockTitle = altHeadline.textContent?.trim() || '';
          }
        }
        
        // 방법 4: LesvR5EImSth_zBjoUn2 클래스로 찾기
        if (!blockTitle) {
          const altHeadline2 = collectionRoot.querySelector('.LesvR5EImSth_zBjoUn2 .fds-comps-text');
          if (altHeadline2) {
            blockTitle = altHeadline2.textContent?.trim() || '';
          }
        }

        // 기본값 설정
        if (!blockTitle) {
          blockTitle = `스마트블록 ${index + 1}`;
        }

        // 블로그 아이템들 찾기
        const blogItems: any[] = [];
        const blogModules =
          collectionRoot.querySelectorAll('.fds-ugc-block-mod').length > 0
            ? collectionRoot.querySelectorAll('.fds-ugc-block-mod')
            : collectionRoot.querySelectorAll('.sds-comps-vertical-layout[data-template-id="ugcItem"]');

        blogModules.forEach((module: Element, itemIndex: number) => {
          const selectText = (...selectors: string[]): string => {
            for (const selector of selectors) {
              const el = selector ? module.querySelector(selector) : null;
              if (el && el.textContent) {
                const text = el.textContent.trim();
                if (text) return text;
              }
            }
            return '';
          };

          const selectHref = (...selectorList: string[]): string => {
            for (const selector of selectorList) {
              if (!selector) continue;
              const el = module.querySelector(selector) as HTMLAnchorElement | null;
              if (el?.href) {
                return el.href;
              }
            }
            return '';
          };

          // 블로그 제목 / 내용 / 링크 추출
          const blogTitle = selectText(
            '.fds-comps-right-image-text-title .fds-comps-text',
            '.sds-comps-text-type-headline1',
            '.sds-comps-text-ellipsis-1',
            '.sds-comps-text-type-headline3'
          );

          const blogContent = selectText(
            '.fds-comps-right-image-text-content .fds-comps-text',
            '.fds-comps-text-type-body1',
            '.sds-comps-text-type-body1',
            '.sds-comps-text-ellipsis-2'
          );

          const blogLink =
            selectHref(
              '.fds-comps-right-image-text-title',
              '.sds-comps-text-type-headline1 a',
              '.sds-comps-profile-info-title a',
              'a[href*="blog.naver.com"]',
              'a[href*="cafe.naver.com"]'
            ) || '';

          const profileLink =
            selectHref(
              '.fds-thumb-anchor',
              '.sds-comps-profile-source-thumb a',
              '.sds-comps-profile-info-title a'
            ) || '';

          const nickname = selectText(
            '.fds-info-inner-text .fds-comps-text',
            '.fds-info-text-group .fds-comps-text',
            '.fds-comps-author-name',
            '.sds-comps-profile-info-title .sds-comps-text'
          );

          const extractBlogId = (href?: string | null) => {
            if (!href) return '';
            const directMatch = href.match(/blog\.naver\.com\/([^/?#]+)/);
            if (directMatch) return directMatch[1].toLowerCase();
            try {
              const urlObj = new URL(href);
              if (urlObj.hostname !== 'blog.naver.com') return '';
              const segments = urlObj.pathname.split('/').filter(Boolean);
              if (segments.length > 0) return segments[0].toLowerCase();
              const queryId = urlObj.searchParams.get('blogId');
              if (queryId) return queryId.toLowerCase();
            } catch {
              // ignore invalid url
            }
            return '';
          };

          const blogIdFromProfile = extractBlogId(profileLink);
          const blogIdFromLink = extractBlogId(blogLink);
          const blogId = blogIdFromProfile || blogIdFromLink;

          if (blogTitle) {
            blogItems.push({
              index: itemIndex + 1,
              title: blogTitle,
              content: blogContent,
              link: blogLink,
              profileLink,
              blogId,
              authorId: blogId,
              nickname,
              author: nickname,
            });
          }
        });

        if (blockTitle && blogItems.length > 0) {
          results.push({
            id: `smart_block_${index}_${Date.now()}`,
            title: blockTitle,
            icon: '📋',
            type: 'table',
            data: blogItems
          });
        }
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
