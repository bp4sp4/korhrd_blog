import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { keyword } = await request.json();

    if (!keyword) {
      return NextResponse.json({ error: '키워드가 필요합니다.' }, { status: 400 });
    }

    // 동적 import로 puppeteer 로드 (서버 사이드에서만)
    const puppeteer = (await import('puppeteer')).default;
    const smartBlockData = await crawlNaverSearchWithPuppeteer(keyword, puppeteer);

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
      name: error?.name
    });
    return NextResponse.json({ 
      error: '서버 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    }, { status: 500 });
  }
}

async function crawlNaverSearchWithPuppeteer(keyword: string, puppeteer: typeof import('puppeteer').default) {
  let browser;

  try {
    // 배포 환경(Vercel 등)에서 Puppeteer 실행 옵션
    const isProduction = process.env.NODE_ENV === 'production';
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
        '--disable-gpu'
      ]
    };

    // 프로덕션 환경에서는 추가 옵션
    if (isProduction) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
    }

    console.log('>>> Puppeteer 실행 옵션:', JSON.stringify(launchOptions, null, 2));
    
    // Puppeteer를 헤드리스 모드로 실행 (GUI 없이)
    browser = await puppeteer.launch(launchOptions); 

    const page = await browser.newPage();
    
    // User-Agent 설정 (봇으로 인식되지 않도록 실제 브라우저처럼 위장)
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 네이버 검색 페이지로 이동
    await page.goto(`https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`, { 
      waitUntil: 'domcontentloaded', // DOM 콘텐츠가 로드될 때까지 기다림
      timeout: 60000 // 최대 1분까지 기다림
    });

    // --- 페이지 스크롤 로직 시작 ---
    // 페이지를 끝까지 스크롤하여 모든 동적 콘텐츠 (스마트블록 포함)가 로드되도록 합니다.
    let previousHeight;
    while (true) {
      previousHeight = await page.evaluate('document.body.scrollHeight');
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
      // `page.waitForTimeout` 대신 `setTimeout`을 사용합니다.
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 대기하여 콘텐츠 로딩 기다림
      let newHeight = await page.evaluate('document.body.scrollHeight');
      if (newHeight === previousHeight) {
        break; // 더 이상 스크롤할 내용이 없으면 중단
      }
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
    await Promise.any(smartBlockSelectors.map(selector => 
        page.waitForSelector(selector, { timeout: 15000 })
    )).catch(() => console.log('>>> 스마트블록을 찾지 못했습니다. 계속 진행합니다.'));

    // 추가 대기 시간 (동적 콘텐츠 로딩)
    await new Promise(resolve => setTimeout(resolve, 2000));

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

