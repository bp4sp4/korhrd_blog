import { NextRequest, NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium';
import puppeteerCore from 'puppeteer-core';

export const runtime = 'nodejs';
export const maxDuration = 10;

let localPuppeteerPromise: Promise<typeof import('puppeteer')> | null = null;

async function getPuppeteer(isVercel: boolean) {
  if (isVercel) {
    return puppeteerCore;
  }

  if (!localPuppeteerPromise) {
    localPuppeteerPromise = import('puppeteer').then((mod) => mod.default);
  }

  return localPuppeteerPromise;
}

export async function POST(request: NextRequest) {
  const isVercel = !!(process.env.VERCEL || process.env.VERCEL_ENV);

  try {
    const { keyword } = await request.json();
    if (!keyword || typeof keyword !== 'string') {
      return NextResponse.json({ error: 'keyword is required' }, { status: 400 });
    }

    const puppeteer = await getPuppeteer(isVercel);
    const smartBlocks = await scrapeSmartBlocks(keyword, puppeteer, isVercel);

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
  puppeteer: typeof puppeteerCore | typeof import('puppeteer'),
  isVercel: boolean
) {
  const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

  try {
    const launchOptions: any = isVercel
      ? {
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless ?? true,
          defaultViewport: { width: 1280, height: 720 },
        }
      : {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        };

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: isVercel ? 8000 : 60000,
    });

    if (isVercel) {
      await page.evaluate('window.scrollTo(0, 300)');
      await new Promise((resolve) => setTimeout(resolve, 400));
      await page.evaluate('window.scrollTo(0, 900)');
    } else {
      let prevHeight = 0;
      for (let i = 0; i < 8; i += 1) {
        prevHeight = await page.evaluate('document.body.scrollHeight');
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const newHeight = await page.evaluate('document.body.scrollHeight');
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
          page.waitForSelector(selector, { timeout: isVercel ? 2500 : 15000 })
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

    return smartBlocks;
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

