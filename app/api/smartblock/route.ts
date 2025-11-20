import { NextRequest, NextResponse } from 'next/server';
import {
  chromium as playwrightChromium,
  type Browser,
  type BrowserContext,
} from 'playwright-core';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5분으로 증가 (크롤링 시간이 길어질 수 있음)

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
    if (!explicitPlaywrightEndpoint.startsWith('wss://') && !explicitPlaywrightEndpoint.startsWith('ws://')) {
      console.warn('[smartblock] BROWSERLESS_PLAYWRIGHT_WS_ENDPOINT가 올바른 WebSocket URL 형식이 아닙니다:', explicitPlaywrightEndpoint.substring(0, 50));
    }
    return explicitPlaywrightEndpoint;
  }

  const genericEndpoint = process.env.BROWSERLESS_WS_ENDPOINT;
  if (genericEndpoint) {
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
    } catch (error) {
      console.warn('[smartblock] BROWSERLESS_WS_ENDPOINT URL 파싱 실패:', error);
      if (!genericEndpoint.includes('/chromium/playwright')) {
        const cleaned = genericEndpoint.replace(/\/playwright\/?$/, '').replace(/\/chromium\/?$/, '');
        return `${cleaned}${cleaned.includes('?') ? '&' : '?'}token=${process.env.BROWSERLESS_TOKEN || ''}`;
      }
      return genericEndpoint;
    }
  }

  const token = process.env.BROWSERLESS_TOKEN;
  if (!token || token.trim() === '') {
    console.warn('[smartblock] BROWSERLESS_TOKEN이 설정되지 않았습니다.');
    return null;
  }

  const region =
    process.env.BROWSERLESS_REGION ||
    process.env.BROWSERLESS_DEPLOYMENT ||
    'production-sfo';

  const endpoint = `wss://${region}.browserless.io/chromium/playwright?token=${token}`;
  console.log(`[smartblock] Browserless 엔드포인트 생성: wss://${region}.browserless.io/chromium/playwright?token=***`);
  return endpoint;
}

export async function POST(request: NextRequest) {
  const isVercel = !!(process.env.VERCEL || process.env.VERCEL_ENV);
  const browserlessEndpoint = resolveBrowserlessEndpoint();

  console.log('[smartblock] Browserless 설정 확인:', {
    hasExplicitEndpoint: !!process.env.BROWSERLESS_PLAYWRIGHT_WS_ENDPOINT,
    hasGenericEndpoint: !!process.env.BROWSERLESS_WS_ENDPOINT,
    hasToken: !!process.env.BROWSERLESS_TOKEN,
    resolvedEndpoint: browserlessEndpoint ? `${browserlessEndpoint.substring(0, 50)}...` : 'null',
    isVercel,
  });

  try {
    const { keyword } = await request.json();
    if (!keyword || typeof keyword !== 'string') {
      return NextResponse.json({ error: 'keyword is required' }, { status: 400 });
    }

    if (isVercel && !browserlessEndpoint) {
      return NextResponse.json(
        {
          error: 'Vercel 환경에서는 Browserless (Playwright) 연결이 필요합니다.',
          hint: '환경 변수 BROWSERLESS_PLAYWRIGHT_WS_ENDPOINT 또는 BROWSERLESS_TOKEN을 설정해 주세요.',
        },
        { status: 500 }
      );
    }

    console.log(`[smartblock] 요청 시작: ${keyword} (Vercel: ${isVercel})`);
    const smartBlocks = await scrapeSmartBlocks(keyword, browserlessEndpoint, isVercel);
    console.log(`[smartblock] 요청 완료: ${keyword} - 블록 개수: ${smartBlocks.length}`);

    return NextResponse.json({
      keyword,
      timestamp: new Date().toLocaleString(),
      smartBlocks,
      totalBlocks: smartBlocks.length,
    });
  } catch (error: any) {
    console.error('[smartblock] failed to fetch', {
      error: error?.message,
      stack: error?.stack,
      name: error?.name,
      isVercel,
    });
    return NextResponse.json(
      {
        error: '스마트블록 데이터를 가져오지 못했습니다.',
        details:
          process.env.NODE_ENV === 'development' ? error?.message ?? 'unknown error' : undefined,
      },
      { status: 500 }
    );
  }
}

async function scrapeSmartBlocks(
  keyword: string,
  browserlessEndpoint: string | null,
  isVercel: boolean
) {
  const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
  const useBrowserless = !!browserlessEndpoint;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  const viewport = { width: 1280, height: 720 };
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  try {
    if (useBrowserless && browserlessEndpoint) {
      // Browserless 연결 (타임아웃 60초)
      const connectTimeout = 60000;
      console.log(`[smartblock] Browserless 연결 시도: ${browserlessEndpoint.substring(0, 50)}...`);
      
      try {
        browser = await playwrightChromium.connect({
          wsEndpoint: browserlessEndpoint,
          timeout: connectTimeout,
        });
        console.log('[smartblock] Browserless 연결 성공');
      } catch (error: any) {
        console.error('[smartblock] Browserless 연결 실패:', error?.message);
        throw new Error(`Browserless 연결 실패: ${error?.message || '알 수 없는 오류'}`);
      }
    }

    if (!browser) {
      // 로컬 환경: 일반 playwright 사용
      const browserType = isVercel ? playwrightChromium : await getLocalChromium();
      browser = await browserType.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] as string[],
      });
      console.log('[smartblock] 로컬 브라우저 실행 성공');
    }

    try {
      context = await browser.newContext({
        userAgent,
        viewport,
      });
    } catch (error) {
      console.warn('[smartblock] 새 컨텍스트 생성 실패, 기존 컨텍스트 재사용', error);
      const existingContext = browser.contexts()[0];
      if (!existingContext) {
        throw error;
      }
      context = existingContext;
      await context.setExtraHTTPHeaders({ 'User-Agent': userAgent });
    }

    const page = await context.newPage();
    try {
      await page.setViewportSize(viewport);
    } catch {
      // ignore if viewport cannot be adjusted
    }

    // 페이지 로드 타임아웃 60초
    const pageLoadTimeout = 60000;
    console.log(`[smartblock] 페이지 로드 시작: ${url} (타임아웃: ${pageLoadTimeout}ms)`);
    
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: pageLoadTimeout,
      });
      console.log('[smartblock] 페이지 로드 완료');
      
      // 페이지 로드 후 추가 대기 (동적 콘텐츠 로딩을 위해)
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error: any) {
      console.error('[smartblock] 페이지 로드 실패:', error?.message || String(error));
      throw new Error(`페이지 로드 실패: ${error?.message || '알 수 없는 오류'}`);
    }

    // 스크롤 로직
    await page.evaluate(() => {
      window.scrollTo(0, 300);
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await page.evaluate(() => {
      window.scrollTo(0, 900);
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await page.evaluate(() => {
      window.scrollTo(0, 1500);
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const selectors = [
      '.fds-ugc-block-mod',
      '.sds-comps-vertical-layout[data-template-id="ugcItem"]',
      'a.jyxwDwu8umzdhCQxX48l',
    ];

    // 스마트블록 요소 대기 (타임아웃 60초)
    const selectorTimeout = 60000;
    try {
      await Promise.any(
        selectors.map((selector) =>
          page.waitForSelector(selector, { timeout: selectorTimeout })
        )
      );
      console.log('[smartblock] 스마트블록 요소 발견');
    } catch (error: any) {
      console.warn('[smartblock] selector wait timeout, using current DOM', error?.message || String(error));
    }
    
    // 추가 대기 시간
    const waitTime = 3000;
    console.log(`[smartblock] 최종 대기 중... (${waitTime}ms)`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));

    const smartBlocks = await page.evaluate(() => {
      const extractBlogId = (value?: string | null) => {
        if (!value) return '';
        const directMatch = value.match(/blog\.naver\.com\/([^/?#]+)/);
        if (directMatch) return directMatch[1].toLowerCase();
        try {
          const urlObj = new URL(value);
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

      const selectText = (module: Element, ...selectors: string[]) => {
        for (const selector of selectors) {
          if (!selector) continue;
          const el = module.querySelector(selector);
          if (el && el.textContent) {
            const text = el.textContent.trim();
            if (text) return text;
          }
        }
        return '';
      };

      const selectHref = (module: Element, ...selectors: string[]) => {
        for (const selector of selectors) {
          if (!selector) continue;
          const el = module.querySelector(selector) as HTMLAnchorElement | null;
          if (el?.href) {
            return el.href;
          }
        }
        return '';
      };

      // 광고인지 확인하는 함수
      const isAd = (module: Element): boolean => {
        // 광고 관련 클래스 확인
        const adClasses = [
          'api_ad_text',
          'api_ad_sa',
          'ad',
          'ad_item',
          'sponsored',
          'advert',
          'advertisement',
          'fds-ad',
          'sds-ad',
        ];
        
        // 모듈 자체 또는 부모 요소에 광고 클래스가 있는지 확인
        for (const adClass of adClasses) {
          if (module.classList.contains(adClass) || 
              module.closest(`.${adClass}`) !== null) {
            return true;
          }
        }
        
        // 광고 텍스트 확인
        const adTexts = ['광고', 'AD', 'Ad', 'Sponsored', 'SPONSORED'];
        const moduleText = module.textContent || '';
        for (const adText of adTexts) {
          if (moduleText.includes(adText)) {
            // 단, 제목이나 본문에 광고라는 단어가 포함된 경우는 제외
            // 광고 레이블로 표시된 경우만 제외
            const adLabel = module.querySelector('[class*="ad"], [class*="sponsor"], [aria-label*="광고"], [aria-label*="ad"]');
            if (adLabel) {
              return true;
            }
          }
        }
        
        // data 속성으로 광고 표시 확인
        const dataAttrs = ['data-ad', 'data-sponsor', 'data-sponsored'];
        for (const attr of dataAttrs) {
          if (module.hasAttribute(attr) || module.closest(`[${attr}]`) !== null) {
            return true;
          }
        }
        
        return false;
      };

      const results: any[] = [];

      // 1. 스마트블록 영역 찾기
      let roots = Array.from(document.querySelectorAll('.fds-collection-root'));
      if (roots.length === 0) {
        roots = Array.from(
          document.querySelectorAll(
            '.sds-comps-vertical-layout[data-template-type="vertical"][data-template-id="layout"]'
          )
        );
      }

      const blockCount = Math.min(4, roots.length);

      for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
        const root = roots[blockIndex] as Element;
        let blockTitle = '';
        const titleSelectors = [
          '.fds-comps-header-headline .fds-comps-text',
          '.fds-comps-header-headline',
          '.sds-comps-header-title h2',
          '.sds-comps-header-title .sds-comps-text',
          '.sds-comps-header-title',
          '.zGAg4BVegdEEkSYCTjAo .fds-comps-text',
          '.LesvR5EImSth_zBjoUn2 .fds-comps-text',
        ];
        for (const selector of titleSelectors) {
          if (!blockTitle) {
            const el = root.querySelector(selector);
            if (el && el.textContent) {
              blockTitle = el.textContent.trim();
            }
          }
        }
        if (!blockTitle) blockTitle = `스마트블록 ${blockIndex + 1}`;

        const modules =
          root.querySelectorAll('.fds-ugc-block-mod').length > 0
            ? root.querySelectorAll('.fds-ugc-block-mod')
            : root.querySelectorAll('.sds-comps-vertical-layout[data-template-id="ugcItem"]');

        const items: any[] = [];

        modules.forEach((module, itemIndex) => {
          // 광고 제외
          if (isAd(module)) {
            return;
          }

          const title = selectText(
            module,
            '.fds-comps-right-image-text-title .fds-comps-text',
            '.sds-comps-text-type-headline1',
            '.sds-comps-text-ellipsis-1'
          );
          const content = selectText(
            module,
            '.fds-comps-right-image-text-content .fds-comps-text',
            '.fds-comps-text-type-body1',
            '.sds-comps-text-type-body1'
          );
          const link = selectHref(
            module,
            '.fds-comps-right-image-text-title',
            '.sds-comps-text-type-headline1 a',
            '.sds-comps-profile-info-title a',
            'a[href*="blog.naver.com"]',
            'a[href*="cafe.naver.com"]'
          );
          const profileLink = selectHref(
            module,
            '.fds-thumb-anchor',
            '.sds-comps-profile-source-thumb a',
            '.sds-comps-profile-info-title a'
          );
          const nickname = selectText(
            module,
            '.fds-info-inner-text .fds-comps-text',
            '.fds-info-text-group .fds-comps-text',
            '.fds-comps-author-name',
            '.sds-comps-profile-info-title .sds-comps-text'
          );

          const blogId = extractBlogId(profileLink) || extractBlogId(link);

          // ader.naver.com/v1/ 링크 제외
          if (link && link.startsWith('https://ader.naver.com/v1/')) {
            return;
          }

          if (title) {
            items.push({
              index: 0, // 나중에 재계산
              title,
              content,
              link,
              profileLink,
              blogId,
              authorId: blogId,
              nickname,
              author: nickname,
            });
          }
        });

        // 광고 제외 후 순위 재계산 (1부터 시작)
        items.forEach((item, index) => {
          item.index = index + 1;
        });

        if (items.length > 0) {
          results.push({
            id: `smart_block_${blockIndex}_${Date.now()}`,
            title: blockTitle,
            icon: '📋',
            type: 'table',
            data: items,
          });
        }
      }

      // 2. 일반 검색 결과 영역 찾기 (스마트블록이 없거나 결과가 적을 때)
      // spw_rerank 영역의 일반 검색 결과도 수집
      if (results.length === 0 || results.every(r => r.data.length === 0)) {
        const generalSearchRoots = Array.from(document.querySelectorAll('.spw_rerank'));
        
        for (const generalRoot of generalSearchRoots) {
          // 일반 검색 결과 내의 UGC 아이템 찾기 (ugcItem: 블로그/카페, webItem: 웹사이트)
          const ugcModules = Array.from(
            generalRoot.querySelectorAll('.sds-comps-vertical-layout[data-template-id="ugcItem"]')
          );
          const webModules = Array.from(
            generalRoot.querySelectorAll('.sds-comps-vertical-layout[data-template-id="webItem"], .fds-web-doc-root')
          );

          const allModules = [...ugcModules, ...webModules];

          if (allModules.length > 0) {
            const items: any[] = [];
            let blockTitle = '일반 검색 결과';

            allModules.forEach((module, itemIndex) => {
              // 광고 제외
              if (isAd(module)) {
                return;
              }

              // UGC 아이템 (블로그/카페) 처리
              const isUgcItem = module.getAttribute('data-template-id') === 'ugcItem' || 
                                module.classList.contains('fds-ugc-single-intention-item-list-rra');
              
              // Web 아이템 처리
              const isWebItem = module.getAttribute('data-template-id') === 'webItem' || 
                               module.classList.contains('fds-web-doc-root');

              let title = '';
              let content = '';
              let link = '';
              let profileLink = '';
              let nickname = '';

              if (isUgcItem) {
                // 블로그/카페 아이템
                title = selectText(
                  module,
                  '.sds-comps-text-type-headline1',
                  '.sds-comps-text-ellipsis-1',
                  'a[href*="blog.naver.com"]',
                  'a[href*="cafe.naver.com"]'
                );
                content = selectText(
                  module,
                  '.sds-comps-text-type-body1',
                  '.fds-ugc-ellipsis2',
                  '.fds-ugc-ellipsis3'
                );
                link = selectHref(
                  module,
                  '.sds-comps-text-type-headline1 a',
                  '.sds-comps-profile-info-title a',
                  'a[href*="blog.naver.com"]',
                  'a[href*="cafe.naver.com"]'
                );
                profileLink = selectHref(
                  module,
                  '.sds-comps-profile-source-thumb a',
                  '.sds-comps-profile-info-title a'
                );
                nickname = selectText(
                  module,
                  '.sds-comps-profile-info-title .sds-comps-text',
                  '.sds-comps-text-ellipsis-1'
                );
              } else if (isWebItem) {
                // 웹사이트 아이템 (블로그/카페가 아닌 일반 웹사이트도 처리)
                title = selectText(
                  module,
                  '.sds-comps-text-type-headline1',
                  '.sds-comps-text-ellipsis-1',
                  'a[href*="blog.naver.com"]',
                  'a[href*="cafe.naver.com"]'
                );
                content = selectText(
                  module,
                  '.sds-comps-text-type-body1',
                  '.sds-comps-text-content'
                );
                link = selectHref(
                  module,
                  '.sds-comps-text-type-headline1 a',
                  '.sds-comps-profile-info-title a',
                  'a[href*="blog.naver.com"]',
                  'a[href*="cafe.naver.com"]',
                  'a[target="_blank"]'
                );
                profileLink = selectHref(
                  module,
                  '.sds-comps-profile-source-thumb a',
                  '.sds-comps-profile-info-title a',
                  '.sds-comps-profile a'
                );
                nickname = selectText(
                  module,
                  '.sds-comps-profile-info-title .sds-comps-text',
                  '.sds-comps-profile-info-title-text'
                );
              }

              const blogId = extractBlogId(profileLink) || extractBlogId(link);

              // ader.naver.com/v1/ 링크 제외
              if (link && link.startsWith('https://ader.naver.com/v1/')) {
                return;
              }

              // 블로그/카페 링크가 있거나 제목이 있으면 수집
              if (title && (link || blogId)) {
                items.push({
                  index: 0, // 나중에 재계산
                  title,
                  content,
                  link,
                  profileLink,
                  blogId,
                  authorId: blogId,
                  nickname,
                  author: nickname,
                });
              }
            });

            // 광고 제외 후 순위 재계산 (1부터 시작)
            items.forEach((item, index) => {
              item.index = index + 1;
            });

            if (items.length > 0) {
              results.push({
                id: `general_search_${Date.now()}`,
                title: blockTitle,
                icon: '📋',
                type: 'table',
                data: items,
              });
              // 첫 번째 일반 검색 결과만 수집 (1등 확인용)
              break;
            }
          }
        }
      }

      return results;
    });

    await page.close();

    return smartBlocks;
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

