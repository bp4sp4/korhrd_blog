import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchNaverSearchVolume } from '@/lib/naver/ranking';

// 네이버 API 키 확인
function getNaverApiKeys() {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  return { clientId, clientSecret };
}

/**
 * 네이버 검색량 수집 기능 테스트용 API
 * 키워드를 받아서 검색량을 가져와서 반환합니다 (저장하지 않음)
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

    console.log(`[test-search-volume] 키워드 검색량 테스트 시작: ${keyword}`);

    const { clientId, clientSecret } = getNaverApiKeys();
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          success: false,
          error: '네이버 API 키가 설정되지 않았습니다. NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 환경 변수에 설정해주세요.',
        },
        { status: 500 }
      );
    }

    const startTime = Date.now();
    const searchVolumeResult = await fetchNaverSearchVolume(keyword, { clientId, clientSecret });
    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      keyword,
      search_volume: {
        ratio: searchVolumeResult.ratio,
        total_ratio: searchVolumeResult.totalRatio,
        max_ratio: searchVolumeResult.maxRatio,
        min_ratio: searchVolumeResult.minRatio,
        data_points: searchVolumeResult.dataPoints,
        pc_ratio: searchVolumeResult.pcRatio,
        mobile_ratio: searchVolumeResult.mobileRatio,
        total_combined_ratio: searchVolumeResult.totalCombinedRatio,
        pc_total_ratio: searchVolumeResult.pcTotalRatio,
        mobile_total_ratio: searchVolumeResult.mobileTotalRatio,
        actual_search_count: searchVolumeResult.actualSearchCount,
        pc_search_count: searchVolumeResult.pcSearchCount,
        mobile_search_count: searchVolumeResult.mobileSearchCount,
      },
      duration_ms: duration,
      timestamp: new Date().toISOString(),
      message: searchVolumeResult.ratio !== null 
        ? `한 달 동안 검색량 수집 성공 (평균: ${searchVolumeResult.ratio}, PC 총합: ${searchVolumeResult.pcTotalRatio}, Mobile 총합: ${searchVolumeResult.mobileTotalRatio}, 전체 총합: ${searchVolumeResult.totalCombinedRatio}${searchVolumeResult.actualSearchCount ? `, 실제 검색 횟수: ${searchVolumeResult.actualSearchCount.toLocaleString()}회` : ''})` 
        : '검색량을 찾을 수 없습니다. 네이버 데이터랩 API 응답을 확인해주세요.',
      // 개발 환경에서만 원본 데이터 포함
      ...(process.env.NODE_ENV === 'development' && searchVolumeResult.rawData ? { raw_data: searchVolumeResult.rawData } : {}),
    });
  } catch (error: any) {
    console.error('[test-search-volume] 테스트 실패', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message ?? '검색량 테스트 중 오류가 발생했습니다.',
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

    console.log(`[test-search-volume] 키워드 검색량 테스트 시작: ${keyword}`);

    const { clientId, clientSecret } = getNaverApiKeys();
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          success: false,
          error: '네이버 API 키가 설정되지 않았습니다. NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 환경 변수에 설정해주세요.',
        },
        { status: 500 }
      );
    }

    const startTime = Date.now();
    const searchVolumeResult = await fetchNaverSearchVolume(keyword, { clientId, clientSecret });
    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      keyword,
      search_volume: {
        ratio: searchVolumeResult.ratio,
        total_ratio: searchVolumeResult.totalRatio,
        max_ratio: searchVolumeResult.maxRatio,
        min_ratio: searchVolumeResult.minRatio,
        data_points: searchVolumeResult.dataPoints,
        pc_ratio: searchVolumeResult.pcRatio,
        mobile_ratio: searchVolumeResult.mobileRatio,
        total_combined_ratio: searchVolumeResult.totalCombinedRatio,
        pc_total_ratio: searchVolumeResult.pcTotalRatio,
        mobile_total_ratio: searchVolumeResult.mobileTotalRatio,
        actual_search_count: searchVolumeResult.actualSearchCount,
        pc_search_count: searchVolumeResult.pcSearchCount,
        mobile_search_count: searchVolumeResult.mobileSearchCount,
      },
      duration_ms: duration,
      timestamp: new Date().toISOString(),
      message: searchVolumeResult.ratio !== null 
        ? `한 달 동안 검색량 수집 성공 (평균: ${searchVolumeResult.ratio}, PC 총합: ${searchVolumeResult.pcTotalRatio}, Mobile 총합: ${searchVolumeResult.mobileTotalRatio}, 전체 총합: ${searchVolumeResult.totalCombinedRatio}${searchVolumeResult.actualSearchCount ? `, 실제 검색 횟수: ${searchVolumeResult.actualSearchCount.toLocaleString()}회` : ''})` 
        : '검색량을 찾을 수 없습니다. 네이버 데이터랩 API 응답을 확인해주세요.',
      // 개발 환경에서만 원본 데이터 포함
      ...(process.env.NODE_ENV === 'development' && searchVolumeResult.rawData ? { raw_data: searchVolumeResult.rawData } : {}),
    });
  } catch (error: any) {
    console.error('[test-search-volume] 테스트 실패', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message ?? '검색량 테스트 중 오류가 발생했습니다.',
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      },
      { status: 500 }
    );
  }
}

