import { NextRequest, NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium';
import puppeteerCore from 'puppeteer-core';

export const runtime = 'nodejs';
export const maxDuration = 10;

let localPuppeteerPromise: Promise<typeof puppeteerCore> | null = null;

async function getLocalPuppeteer() {
  if (!localPuppeteerPromise) {
    localPuppeteerPromise = import('puppeteer').then(
      (mod) => mod.default as unknown as typeof puppeteerCore
    );
  }

  return localPuppeteerPromise;
}

function resolveBrowserlessEndpoint() {
  if (process.env.BROWSERLESS_WS_ENDPOINT) {
    return process.env.BROWSERLESS_WS_ENDPOINT;
  }

  if (process.env.BROWSERLESS_TOKEN) {
    return `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`;
  }

  return null;
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
          error: 'Vercel 환경에서는 Browserless 연결이 필요합니다.',
          hint: '환경 변수 BROWSERLESS_TOKEN 또는 BROWSERLESS_WS_ENDPOINT를 설정해 주세요.',
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
  let browser: Awaited<ReturnType<typeof puppeteerCore.launch>> | Awaited<
    ReturnType<typeof puppeteerCore.connect>
  > | null = null;
  let connectedToBrowserless = false;

  try {
    if (useBrowserless) {
      try {
        browser = await puppeteerCore.connect({
          browserWSEndpoint: browserlessEndpoint,
        });
        connectedToBrowserless = true;
      } catch (error) {
        console.error('[smartblock] Browserless 연결 실패, 로컬/Chromium 런치로 폴백합니다.', error);
        if (isVercel) {
          throw new Error(
            'Browserless 연결이 거부되었습니다. 토큰 유효성, 요금제 상태, 또는 허용 라이브러리 설정을 확인하세요.'
          );
        }
      }
    }

    if (!browser) {
      const puppeteer = isVercel ? puppeteerCore : await getLocalPuppeteer();
      const launchOptions = isVercel
        ? {
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: true,
            defaultViewport: { width: 1280, height: 720 },
          }
        : {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] as string[],
          };
      browser = await puppeteer.launch(launchOptions);
    }

    const page = await browser.newPage();
    const pageAny = page as any;

    await pageAny.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await pageAny.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: isVercel ? 8000 : 60000,
    });

    if (isVercel) {
      await pageAny.evaluate('window.scrollTo(0, 300)');
      await new Promise((resolve) => setTimeout(resolve, 400));
      await pageAny.evaluate('window.scrollTo(0, 900)');
    } else {
      let prevHeight = 0;
      for (let i = 0; i < 8; i += 1) {
        prevHeight = await pageAny.evaluate('document.body.scrollHeight');
        await pageAny.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const newHeight = await pageAny.evaluate('document.body.scrollHeight');
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
          pageAny.waitForSelector(selector, { timeout: isVercel ? 2500 : 15000 })
        )
      );
    } catch {
      console.warn('[smartblock] selector wait timeout, using current DOM');
    }
    await new Promise((resolve) => setTimeout(resolve, isVercel ? 500 : 2000));

    const smartBlocks = await pageAny.evaluate(() => {
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

    return smartBlocks;
  } finally {
    if (browser) {
      if (connectedToBrowserless) {
        await browser
          .disconnect()
          .catch(() => undefined);
      } else {
        await browser.close().catch(() => undefined);
      }
    }
  }
}

