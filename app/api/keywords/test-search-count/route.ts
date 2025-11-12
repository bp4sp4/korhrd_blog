import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchNaverSearchCountFromKeywordTool } from '@/lib/naver/ranking';

/**
 * 네이버 검색광고 키워드 도구에서 검색 횟수 테스트용 API
 */
export async function POST(request: NextRequest) {
  try {
    // 개발 환경에서는 인증 우회 가능 (선택적)
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (!isDevelopment) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        { 
          error: 'JSON 파싱 실패', 
          details: 'Body가 올바른 JSON 형식인지 확인해주세요. 예: {"keyword": "테스트"}' 
        },
        { status: 400 }
      );
    }

    const { keyword } = body;

    if (!keyword || typeof keyword !== 'string') {
      return NextResponse.json(
        { 
          error: '키워드가 필요합니다.', 
          received: body,
          example: { keyword: '테스트키워드' }
        },
        { status: 400 }
      );
    }

    console.log(`[test-search-count] 네이버 검색 횟수 크롤링 테스트 시작: ${keyword}`);

    const startTime = Date.now();
    
    // 네이버 검색광고 키워드 도구 API만 시도 (실제 검색 횟수)
    // 네이버 통합 검색 결과 페이지는 검색 횟수를 제공하지 않으므로 사용하지 않음
    const searchCountResult = await fetchNaverSearchCountFromKeywordTool(keyword);
    
    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      keyword,
      search_count: {
        total: searchCountResult.total,
        pc: searchCountResult.pc,
        mobile: searchCountResult.mobile,
      },
      duration_ms: duration,
      timestamp: new Date().toISOString(),
      message: searchCountResult.total !== null 
        ? `네이버 검색 횟수 수집 성공: ${searchCountResult.total.toLocaleString()}건${searchCountResult.pc !== null ? ` (PC: ${searchCountResult.pc.toLocaleString()}, Mobile: ${searchCountResult.mobile?.toLocaleString()})` : ''}` 
        : '검색 횟수를 찾을 수 없습니다. 네이버 검색광고 키워드 도구 API 인증이 필요하거나 페이지 구조가 변경되었을 수 있습니다.',
    });
  } catch (error: any) {
    console.error('[test-search-count] 테스트 실패', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message ?? '검색 횟수 크롤링 테스트 중 오류가 발생했습니다.',
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET 요청으로도 테스트 가능 (쿼리 파라미터로 키워드 전달)
 */
export async function GET(request: NextRequest) {
  try {
    // 개발 환경에서는 인증 우회 가능 (선택적)
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (!isDevelopment) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword');

    if (!keyword) {
      return NextResponse.json(
        { error: '키워드 쿼리 파라미터가 필요합니다. 예: ?keyword=테스트' },
        { status: 400 }
      );
    }

    console.log(`[test-search-count] 네이버 검색 횟수 크롤링 테스트 시작: ${keyword}`);

    const startTime = Date.now();
    
    // 네이버 검색광고 키워드 도구 API만 시도 (실제 검색 횟수)
    // 네이버 통합 검색 결과 페이지는 검색 횟수를 제공하지 않으므로 사용하지 않음
    const searchCountResult = await fetchNaverSearchCountFromKeywordTool(keyword);
    
    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      keyword,
      search_count: {
        total: searchCountResult.total,
        pc: searchCountResult.pc,
        mobile: searchCountResult.mobile,
      },
      duration_ms: duration,
      timestamp: new Date().toISOString(),
      message: searchCountResult.total !== null 
        ? `네이버 검색 횟수 수집 성공: ${searchCountResult.total.toLocaleString()}건${searchCountResult.pc !== null ? ` (PC: ${searchCountResult.pc.toLocaleString()}, Mobile: ${searchCountResult.mobile?.toLocaleString()})` : ''}` 
        : '검색 횟수를 찾을 수 없습니다. 네이버 검색광고 키워드 도구 API 인증이 필요하거나 페이지 구조가 변경되었을 수 있습니다.',
    });
  } catch (error: any) {
    console.error('[test-search-count] 테스트 실패', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message ?? '검색 횟수 크롤링 테스트 중 오류가 발생했습니다.',
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      },
      { status: 500 }
    );
  }
}

