import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('[ranking-stats] Profile fetch error:', profileError);
      return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
    }

    // owner만 접근 가능
    if (!profile || profile.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Only owner can access stats' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(10, Math.max(1, Number(searchParams.get('limit') ?? '5'))); // 기본 5개, 최대 10개

    // 크롤링 완료 로그 조회 (type: 'crawler_complete')
    // Supabase에서 JSON 필드 필터링은 직접 비교가 어려우므로 모든 로그를 가져온 후 필터링
    const { data: allCrawlerLogs, error: allLogsError } = await supabase
      .from('record_activity_logs')
      .select('*')
      .eq('actor_name', 'crawler')
      .eq('action', 'update')
      .order('created_at', { ascending: false })
      .limit(limit * 3); // 충분히 가져와서 필터링

    if (allLogsError) {
      console.error('[ranking-stats] All logs query error:', allLogsError);
      return NextResponse.json({ error: allLogsError.message }, { status: 400 });
    }

    // metadata.type이 'crawler_complete'인 것만 필터링
    const completeLogs = (allCrawlerLogs || []).filter((log: any) => {
      const metadata = log.metadata || {};
      return metadata.type === 'crawler_complete';
    }).slice(0, limit);

    // 크롤링 시작 로그 조회 (type: 'crawler_start')
    const startLogs = (allCrawlerLogs || []).filter((log: any) => {
      const metadata = log.metadata || {};
      return metadata.type === 'crawler_start';
    });

    // 완료 로그와 시작 로그를 매칭하여 통계 생성
    const stats = (completeLogs || []).map((completeLog: any) => {
      const metadata = completeLog.metadata || {};
      const completedAt = new Date(completeLog.created_at);
      
      // 해당 완료 로그와 가장 가까운 시작 로그 찾기 (완료 시간 이전의 가장 최근 시작 로그)
      const matchingStart = (startLogs || []).find((startLog: any) => {
        const startMetadata = startLog.metadata || {};
        if (startMetadata.type === 'crawler_start') {
          const startedAt = new Date(startLog.created_at);
          return startedAt <= completedAt;
        }
        return false;
      });

      const startedAt = matchingStart ? new Date(matchingStart.created_at) : null;
      const duration = startedAt ? Math.round((completedAt.getTime() - startedAt.getTime()) / 1000) : null; // 초 단위

      return {
        id: completeLog.id,
        startedAt: startedAt?.toISOString() || null,
        completedAt: completedAt.toISOString(),
        duration: duration, // 초 단위
        durationFormatted: duration ? formatDuration(duration) : null,
        totalRecords: metadata.totalRecords || 0,
        processed: metadata.processed || 0,
        success: metadata.success || 0,
        rankingUpdated: metadata.rankingUpdated || 0,
        searchVolumeUpdated: metadata.searchVolumeUpdated || 0,
        totalTimeSeconds: metadata.totalTimeSeconds || null,
      };
    });

    // 전체 통계 (최근 24시간)
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);

    const { data: recentLogs, error: recentError } = await supabase
      .from('record_activity_logs')
      .select('*')
      .eq('actor_name', 'crawler')
      .eq('action', 'update')
      .gte('created_at', oneDayAgo.toISOString())
      .order('created_at', { ascending: false });

    if (recentError) {
      console.error('[ranking-stats] Recent logs query error:', recentError);
    }

    const recentCompleteLogs = (recentLogs || []).filter((log: any) => {
      const metadata = log.metadata || {};
      return metadata.type === 'crawler_complete';
    });

    const totalStats = {
      last24Hours: {
        totalRuns: recentCompleteLogs.length,
        totalProcessed: recentCompleteLogs.reduce((sum: number, log: any) => {
          return sum + (log.metadata?.processed || 0);
        }, 0),
        totalSuccess: recentCompleteLogs.reduce((sum: number, log: any) => {
          return sum + (log.metadata?.success || 0);
        }, 0),
        totalRankingUpdated: recentCompleteLogs.reduce((sum: number, log: any) => {
          return sum + (log.metadata?.rankingUpdated || 0);
        }, 0),
        totalSearchVolumeUpdated: recentCompleteLogs.reduce((sum: number, log: any) => {
          return sum + (log.metadata?.searchVolumeUpdated || 0);
        }, 0),
        totalDuration: recentCompleteLogs.reduce((sum: number, log: any) => {
          return sum + (log.metadata?.totalTimeSeconds || 0);
        }, 0),
      },
    };

    return NextResponse.json({
      recent: stats,
      summary: totalStats,
    });
  } catch (error: any) {
    console.error('[ranking-stats] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}초`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}분 ${remainingSeconds}초` : `${minutes}분`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}시간 ${remainingMinutes}분` : `${hours}시간`;
}

