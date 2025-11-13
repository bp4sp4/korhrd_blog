import { NextRequest, NextResponse } from 'next/server';
import lambdaChromium from '@sparticuz/chromium';
import {
  chromium as playwrightChromium,
  type Browser,
  type BrowserContext,
} from 'playwright-core';

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
    if (genericEndpoint.includes('/playwright')) {
      return genericEndpoint;
    }
    try {
      const url = new URL(genericEndpoint);
      if (!url.pathname.includes('/playwright')) {
        url.pathname = url.pathname.replace(/\/?$/, '/playwright');
      }
      return url.toString();
    } catch {
      return `${genericEndpoint}${genericEndpoint.includes('?') ? '&' : '?'}launch=playwright`;
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

  return `wss://${region}.browserless.io?token=${token}`;
}

export async function POST(request: NextRequest) {
  const isVercel = !!(process.env.VERCEL || process.env.VERCEL_ENV);
  const browserlessEndpoint = resolveBrowserlessEndpoint();

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
      // 429 에러 발생 시에만 재시도 (1시간마다 실행되므로 최소한의 재시도만)
      let lastError: any = null;
      const maxRetries = 2; // 재시도 1회만 (총 2회 시도)
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            // 재시도 전 대기 (5초)
            console.log(`[smartblock] Browserless 재시도 ${attempt}/${maxRetries - 1} (5초 대기 후)`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
          
          console.log(`[smartblock] Browserless 연결 시도 ${attempt + 1}/${maxRetries}: ${browserlessEndpoint}`);
          
          // 브라우저 연결 타임아웃 (15초)
          const connectPromise = playwrightChromium.connect({
            wsEndpoint: browserlessEndpoint,
          });
          
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Browserless 연결 타임아웃 (15초)')), 15000);
          });
          
          browser = await Promise.race([connectPromise, timeoutPromise]);
          console.log('[smartblock] Browserless 연결 성공');
          break; // 성공하면 루프 종료
        } catch (error: any) {
          lastError = error;
          const errorMessage = error?.message || String(error);
          
          // 429 에러인 경우에만 재시도
          if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
            console.warn(
              `[smartblock] Browserless rate limit (429) - 재시도 ${attempt + 1}/${maxRetries}`,
              errorMessage
            );
            if (attempt === maxRetries - 1) {
              // 마지막 시도 실패 시 로컬로 폴백
              console.error('[smartblock] Browserless rate limit으로 인한 최종 실패, 로컬/Chromium으로 폴백');
              browser = null;
            }
          } else {
            // 429가 아닌 다른 에러는 즉시 폴백
            console.error(
              '[smartblock] Browserless (Playwright) 연결 실패, 로컬/Chromium 런치로 폴백합니다.',
              errorMessage
            );
            browser = null;
            break;
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

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: isVercel ? 10000 : 60000,
    });

    if (isVercel) {
      await page.evaluate(() => {
        window.scrollTo(0, 300);
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
      await page.evaluate(() => {
        window.scrollTo(0, 900);
      });
    } else {
      let prevHeight = 0;
      for (let i = 0; i < 8; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        prevHeight = await page.evaluate(() => document.body.scrollHeight);
        // eslint-disable-next-line no-await-in-loop
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise((resolve) => setTimeout(resolve, 1200));
        // eslint-disable-next-line no-await-in-loop
        const newHeight = await page.evaluate(() => document.body.scrollHeight);
        if (newHeight === prevHeight) break;
      }
    }

    const selectors = [
      '.fds-ugc-block-mod',
      '.sds-comps-vertical-layout[data-template-id="ugcItem"]',
      'a.jyxwDwu8umzdhCQxX48l',
    ];

    try {
      await Promise.any(
        selectors.map((selector) =>
          page.waitForSelector(selector, { timeout: isVercel ? 3000 : 15000 })
        )
      );
    } catch {
      console.warn('[smartblock] selector wait timeout, using current DOM');
    }
    await new Promise((resolve) => setTimeout(resolve, isVercel ? 500 : 2000));

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

