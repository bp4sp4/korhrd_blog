import { NextRequest, NextResponse } from 'next/server';

// Vercel 서버리스 함수 설정
export const runtime = 'nodejs';
export const maxDuration = 10;

export async function POST(request: NextRequest) {
  try {
    const { keyword } = await request.json();

    if (!keyword) {
      return NextResponse.json({ error: '키워드가 필요합니다.' }, { status: 400 });
    }

    // 네이버 검색 페이지 HTML 가져오기
    const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;
    
    console.log('>>> 네이버 검색 페이지 가져오기 시도:', url);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP 오류: ${response.status}`);
    }

    const html = await response.text();
    console.log('>>> HTML 가져오기 성공, 길이:', html.length);

    // HTML에서 스마트블록 데이터 추출
    const smartBlocks = extractSmartBlocksFromHTML(html, keyword);

    return NextResponse.json({
      keyword,
      timestamp: new Date().toLocaleString(),
      smartBlocks: smartBlocks,
      totalBlocks: smartBlocks.length
    });
  } catch (error: any) {
    console.error('스마트블록 추출 오류:', error);
    
    return NextResponse.json({ 
      error: '스마트블록을 가져오는데 실패했습니다.',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    }, { status: 500 });
  }
}

function extractSmartBlocksFromHTML(html: string, keyword: string): any[] {
  const results: any[] = [];
  const items: any[] = [];
  const extractedTitles = new Set<string>();

  try {
    // 정규식으로 스마트블록 링크 패턴 찾기
    // 네이버 스마트블록은 일반적으로 특정 클래스명이나 데이터 속성을 가집니다
    
    // 방법 1: 클래스명으로 찾기
    const classPattern = /<a[^>]*class="[^"]*jyxwDwu8umzdhCQxX48l[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    
    while ((match = classPattern.exec(html)) !== null) {
      const linkHtml = match[0];
      const content = match[1];
      
      // 텍스트 추출 (HTML 태그 제거)
      const textMatch = content.match(/<span[^>]*class="[^"]*sds-comps-ellipsis-content[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      if (textMatch) {
        let text = textMatch[1]
          .replace(/<mark[^>]*>([\s\S]*?)<\/mark>/gi, '$1') // mark 태그 내용만 유지
          .replace(/<[^>]+>/g, '') // 모든 HTML 태그 제거
          .replace(/\s+/g, ' ')
          .trim();
        
        if (text && text.length > 0 && !extractedTitles.has(text)) {
          // 태그 추출
          const badgeMatch = linkHtml.match(/<span[^>]*class="[^"]*sds-comps-text-type-badge[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
          let tag: string | undefined;
          let tagType: 'personal' | 'popular' | undefined;
          
          if (badgeMatch) {
            tag = badgeMatch[1].replace(/<[^>]+>/g, '').trim();
            if (tag.includes('님을 위한')) {
              tagType = 'personal';
            } else if (tag.includes('인기')) {
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
        }
      }
    }

    // 방법 2: JSON-LD나 스크립트 태그에서 데이터 찾기
    const scriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    while ((match = scriptPattern.exec(html)) !== null) {
      const scriptContent = match[1];
      
      // 스마트블록 관련 데이터가 JSON으로 포함되어 있을 수 있음
      if (scriptContent.includes('smartBlock') || scriptContent.includes('jyxwDwu8umzdhCQxX48l')) {
        // JSON 데이터 추출 시도
        const jsonMatch = scriptContent.match(/\{[\s\S]*"smartBlock"[\s\S]*\}/i);
        if (jsonMatch) {
          try {
            const data = JSON.parse(jsonMatch[0]);
            // 데이터 파싱 로직 추가 가능
          } catch (e) {
            // JSON 파싱 실패 무시
          }
        }
      }
    }

    // 방법 3: href 패턴으로 찾기 (query 파라미터가 있는 링크)
    const hrefPattern = /<a[^>]*href="[^"]*query=([^"&]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    const hrefMatches: string[] = [];
    
    while ((match = hrefPattern.exec(html)) !== null) {
      const queryParam = decodeURIComponent(match[1]);
      const linkContent = match[2];
      
      // 스마트블록 영역에 있는 링크만 추출 (특정 클래스나 구조로 판단)
      if (linkContent.includes('sds-comps-ellipsis-content') && 
          queryParam !== keyword &&
          queryParam.length > 0 &&
          !extractedTitles.has(queryParam)) {
        hrefMatches.push(queryParam);
      }
    }
    
    // href에서 찾은 키워드들 추가
    for (const queryParam of hrefMatches.slice(0, 20)) { // 최대 20개
      if (!extractedTitles.has(queryParam)) {
        items.push({
          title: queryParam,
          icon: '💡',
          description: `${queryParam} 관련 정보`,
        });
        extractedTitles.add(queryParam);
      }
    }

    if (items.length > 0) {
      results.push({
        id: 'smart_block_' + Date.now(),
        title: '함께 많이 찾는',
        icon: '💡',
        type: 'topics',
        data: items
      });
    }

    console.log(`>>> 추출된 스마트블록 항목 수: ${items.length}`);
    
  } catch (error: any) {
    console.error('HTML 파싱 오류:', error);
  }

  return results;
}
