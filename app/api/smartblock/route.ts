import { NextRequest, NextResponse } from 'next/server';
import lambdaChromium from '@sparticuz/chromium';
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
    // 명시적 엔드포인트 검증
    if (!explicitPlaywrightEndpoint.startsWith('wss://') && !explicitPlaywrightEndpoint.startsWith('ws://')) {
      console.warn('[smartblock] BROWSERLESS_PLAYWRIGHT_WS_ENDPOINT가 올바른 WebSocket URL 형식이 아닙니다:', explicitPlaywrightEndpoint.substring(0, 50));
    }
    return explicitPlaywrightEndpoint;
  }

  const genericEndpoint = process.env.BROWSERLESS_WS_ENDPOINT;
  if (genericEndpoint) {
    // 기존 엔드포인트가 이미 설정되어 있으면 그대로 사용
    // /chromium/playwright 경로가 없으면 추가
    try {
      const url = new URL(genericEndpoint);
      // /chromium/playwright 경로가 없으면 추가
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
    console.warn('[smartblock] BROWSERLESS_TOKEN이 설정되지 않았습니다.');
    return null;
  }

  // 토큰이 비어있는지 확인
  if (token.trim() === '') {
    console.warn('[smartblock] BROWSERLESS_TOKEN이 비어있습니다.');
    return null;
  }

  const region =
    process.env.BROWSERLESS_REGION ||
    process.env.BROWSERLESS_DEPLOYMENT ||
    'production-sfo';

  // Browserless Playwright 엔드포인트: /chromium/playwright 경로 사용
  const endpoint = `wss://${region}.browserless.io/chromium/playwright?token=${token}`;
  console.log(`[smartblock] Browserless 엔드포인트 생성: wss://${region}.browserless.io/chromium/playwright?token=***`);
  return endpoint;
}

export async function POST(request: NextRequest) {
  const isVercel = !!(process.env.VERCEL || process.env.VERCEL_ENV);
  const browserlessEndpoint = resolveBrowserlessEndpoint();

  // Browserless 엔드포인트 진단 정보 로깅
  console.log('[smartblock] Browserless 설정 확인:', {
    hasExplicitEndpoint: !!process.env.BROWSERLESS_PLAYWRIGHT_WS_ENDPOINT,
    hasGenericEndpoint: !!process.env.BROWSERLESS_WS_ENDPOINT,
    hasToken: !!process.env.BROWSERLESS_TOKEN,
    region: process.env.BROWSERLESS_REGION || process.env.BROWSERLESS_DEPLOYMENT || 'production-sfo',
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

    const smartBlocks = await scrapeSmartBlocks(keyword, browserlessEndpoint, isVercel);

    return NextResponse.json({
      keyword,
      timestamp: new Date().toLocaleString(),
      smartBlocks,
      totalBlocks: smartBlocks.length,
    });
  } catch (error: any) {
    console.error('[smartblock] failed to fetch', error);
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
      // 배포 환경에서는 Browserless 연결이 필수이므로 더 적극적으로 재시도
      let lastError: any = null;
      const maxRetries = isVercel ? 5 : 4; // Vercel 환경에서는 5회 시도, 로컬은 4회
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            // 재시도 전 대기 (지수 백오프: 3초, 6초, 12초, 15초)
            const delay = Math.min(3000 * Math.pow(2, attempt - 1), 15000);
            console.log(`[smartblock] Browserless 재시도 ${attempt}/${maxRetries - 1} (${delay}ms 대기 후)`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          console.log(`[smartblock] Browserless 연결 시도 ${attempt + 1}/${maxRetries}: ${browserlessEndpoint}`);
          
          // 브라우저 연결 타임아웃 증가 (확실한 연결을 위해 60초)
          const connectTimeout = 60000;
          const connectPromise = playwrightChromium.connect({
            wsEndpoint: browserlessEndpoint,
            timeout: connectTimeout, // Playwright의 내장 타임아웃
          });
          
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Browserless 연결 타임아웃 (${connectTimeout}ms)`)), connectTimeout);
          });
          
          browser = await Promise.race([connectPromise, timeoutPromise]);
          console.log('[smartblock] Browserless 연결 성공');
          break; // 성공하면 루프 종료
        } catch (error: any) {
          lastError = error;
          const errorMessage = error?.message || String(error);
          const errorStack = error?.stack || '';
          
          // 상세한 에러 로깅
          console.error(
            `[smartblock] Browserless 연결 실패 (시도 ${attempt + 1}/${maxRetries}):`,
            {
              message: errorMessage,
              endpoint: browserlessEndpoint ? `${browserlessEndpoint.substring(0, 80)}...` : 'null',
              attempt: attempt + 1,
              maxRetries,
              errorType: error?.constructor?.name || 'Unknown',
              errorCode: error?.code || 'N/A',
              stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
            }
          );
          
          // 429 에러인 경우
          if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
            console.warn(
              `[smartblock] Browserless rate limit (429) - 재시도 예정`,
              errorMessage
            );
            if (attempt === maxRetries - 1) {
              // 마지막 시도 실패 시 로컬로 폴백
              console.error('[smartblock] Browserless rate limit으로 인한 최종 실패, 로컬/Chromium으로 폴백');
              browser = null;
            }
          } 
          // WebSocket 연결 에러인 경우 (타임아웃 포함)
          else if (
            errorMessage.includes('WebSocket') || 
            errorMessage.includes('ECONNREFUSED') || 
            errorMessage.includes('ETIMEDOUT') ||
            errorMessage.includes('ENOTFOUND') ||
            errorMessage.includes('ECONNRESET') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('Timeout') ||
            errorMessage.includes('exceeded') ||
            error?.code === 'ECONNREFUSED' ||
            error?.code === 'ETIMEDOUT' ||
            error?.code === 'ENOTFOUND'
          ) {
            console.warn(
              `[smartblock] Browserless 네트워크/타임아웃 에러 - 재시도 예정 (${attempt + 1}/${maxRetries})`,
              {
                message: errorMessage,
                code: error?.code || 'N/A',
                endpoint: browserlessEndpoint,
                isVercel,
              }
            );
            if (attempt === maxRetries - 1) {
              // Vercel 환경에서는 Browserless 연결 실패 시 에러 발생 (폴백 불가)
              if (isVercel) {
                console.error('[smartblock] Vercel 환경에서 Browserless 연결 최종 실패 - 폴백 불가능', {
                  message: errorMessage,
                  code: error?.code || 'N/A',
                  endpoint: browserlessEndpoint,
                  attempts: maxRetries,
                });
                throw new Error(
                  `Browserless 연결 실패: ${errorMessage}. Vercel 환경에서는 Browserless 연결이 필수입니다. ` +
                  `토큰과 엔드포인트를 확인해주세요. (시도 횟수: ${maxRetries})`
                );
              } else {
                console.error('[smartblock] Browserless 네트워크 에러로 인한 최종 실패, 로컬/Chromium으로 폴백', {
                  message: errorMessage,
                  code: error?.code || 'N/A',
                  endpoint: browserlessEndpoint,
                  hint: 'Browserless 서비스에 연결할 수 없습니다. 토큰이나 엔드포인트 URL을 확인해주세요.',
                });
                browser = null;
              }
            }
          }
          // 기타 에러도 재시도 시도
          else {
            console.warn(
              `[smartblock] Browserless 기타 에러 - 재시도 예정`,
              errorMessage
            );
            if (attempt === maxRetries - 1) {
              console.error('[smartblock] Browserless 연결 최종 실패, 로컬/Chromium으로 폴백', errorMessage);
              browser = null;
            }
          }
        }
      }
      
      if (!browser && isVercel) {
        console.warn(
          '[smartblock] Vercel 환경에서 Browserless 연결이 실패했습니다. @sparticuz/chromium 실행으로 폴백을 시도합니다. 실행 시간이 길어질 수 있습니다.'
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

    try {
      context = await browser.newContext({
        userAgent,
        viewport,
      });
    } catch (error) {
      console.warn('[smartblock] Playwright 새 컨텍스트 생성 실패, 기존 컨텍스트 재사용', error);
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
      // ignore if viewport cannot be adjusted (e.g. persistent context)
    }

    // 페이지 로드 타임아웃 증가 (확실한 로딩을 위해 더 길게)
    const pageLoadTimeout = isVercel ? 60000 : 90000; // Vercel: 60초, 로컬: 90초
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
      // 페이지 로드 실패해도 계속 진행 (이미 로드된 내용 사용)
      throw new Error(`페이지 로드 실패: ${error?.message || '알 수 없는 오류'}`);
    }

    // 스크롤 로직 개선 (더 많은 스크롤로 확실한 데이터 로딩)
    if (isVercel) {
      // Vercel 환경: 더 많은 스크롤 포인트
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
    } else {
      // 로컬 환경: 더 많은 스크롤 반복
      let prevHeight = 0;
      for (let i = 0; i < 12; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        prevHeight = await page.evaluate(() => document.body.scrollHeight);
        // eslint-disable-next-line no-await-in-loop
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 1.2초 -> 2초로 증가
        // eslint-disable-next-line no-await-in-loop
        const newHeight = await page.evaluate(() => document.body.scrollHeight);
        if (newHeight === prevHeight) {
          // 높이가 변하지 않으면 한 번 더 대기 후 종료
          await new Promise((resolve) => setTimeout(resolve, 2000));
          break;
        }
      }
    }

    const selectors = [
      '.fds-ugc-block-mod',
      '.sds-comps-vertical-layout[data-template-id="ugcItem"]',
      'a.jyxwDwu8umzdhCQxX48l',
    ];

    // 스마트블록 요소 대기 (타임아웃 대폭 증가 - 확실한 요소 로딩을 위해)
    const selectorTimeout = isVercel ? 15000 : 30000; // Vercel: 15초, 로컬: 30초
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
    
    // 추가 대기 시간 증가 (동적 콘텐츠 로딩을 위해 더 길게)
    const waitTime = isVercel ? 3000 : 5000; // Vercel: 3초, 로컬: 5초
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

      const results: any[] = [];

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

          if (title) {
            items.push({
              index: itemIndex + 1,
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

      return results;
    });

    await page.close();

    return smartBlocks;
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

