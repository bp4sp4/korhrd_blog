import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const adminClient = createAdminClient();
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // YYYY-MM-DD 형식
    const periodParam = searchParams.get('period'); // 'day' | 'month'
    
    // 한국 시간(KST) 기준으로 오전 10시 기준 날짜 계산
    const now = new Date();
    const kstFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    });
    
    const kstParts = kstFormatter.formatToParts(now);
    const kstHour = parseInt(kstParts.find(p => p.type === 'hour')?.value || '0', 10);
    const kstYear = parseInt(kstParts.find(p => p.type === 'year')?.value || '0', 10);
    const kstMonth = parseInt(kstParts.find(p => p.type === 'month')?.value || '0', 10);
    const kstDay = parseInt(kstParts.find(p => p.type === 'day')?.value || '0', 10);

    // 오전 10시 기준 날짜 계산 (10시 이전이면 전날)
    let targetDate = new Date(kstYear, kstMonth - 1, kstDay);
    if (kstHour < 10) {
      targetDate.setDate(targetDate.getDate() - 1);
    }

    const defaultDateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
    const targetDateStr = dateParam || defaultDateStr;

    let scores: any[] = [];

    if (periodParam === 'month') {
      // 한 달간 총점 집계
      const startDate = new Date(targetDate);
      startDate.setDate(1); // 월의 첫 날
      
      const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
      const endDateStr = targetDateStr;

      const { data, error } = await adminClient
        .from('daily_ranking_scores')
        .select('author_name, score, ranking_1_count, ranking_2_count, ranking_3_count, not_ranked_count, date, keyword')
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .order('date', { ascending: false });

      if (error) {
        console.error('[ranking-scores] 월별 점수 조회 실패', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // 이름별로 집계 (모든 키워드의 점수 합산)
      const scoreMap = new Map<string, {
        author_name: string;
        total_score: number;
        total_ranking_1_count: number;
        total_ranking_2_count: number;
        total_ranking_3_count: number;
        total_not_ranked_count: number;
        dates: string[];
        keywords: Set<string>;
      }>();

      (data || []).forEach((row: any) => {
        const authorName = row.author_name;
        if (!scoreMap.has(authorName)) {
          scoreMap.set(authorName, {
            author_name: authorName,
            total_score: 0,
            total_ranking_1_count: 0,
            total_ranking_2_count: 0,
            total_ranking_3_count: 0,
            total_not_ranked_count: 0,
            dates: [],
            keywords: new Set(),
          });
        }

        const entry = scoreMap.get(authorName)!;
        entry.total_score += row.score || 0;
        entry.total_ranking_1_count += row.ranking_1_count || 0;
        entry.total_ranking_2_count += row.ranking_2_count || 0;
        entry.total_ranking_3_count += row.ranking_3_count || 0;
        entry.total_not_ranked_count += row.not_ranked_count || 0;
        if (!entry.dates.includes(row.date)) {
          entry.dates.push(row.date);
        }
        if (row.keyword) {
          entry.keywords.add(row.keyword);
        }
      });

      scores = Array.from(scoreMap.values()).map(entry => ({
        author_name: entry.author_name,
        total_score: entry.total_score,
        total_ranking_1_count: entry.total_ranking_1_count,
        total_ranking_2_count: entry.total_ranking_2_count,
        total_ranking_3_count: entry.total_ranking_3_count,
        total_not_ranked_count: entry.total_not_ranked_count,
        days_count: entry.dates.length,
        keywords_count: entry.keywords.size,
      }));
    } else {
      // 일별 점수 조회 (이름별로 집계 - 모든 키워드의 점수 합산)
      // 해당 날짜의 점수만 조회 (현재 달의 모든 날짜를 합산하지 않음)
      const { data, error } = await adminClient
        .from('daily_ranking_scores')
        .select('author_name, score, ranking_1_count, ranking_2_count, ranking_3_count, not_ranked_count, date, keyword')
        .eq('date', targetDateStr);

      if (error) {
        console.error('[ranking-scores] 일별 점수 조회 실패', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // 이름별로 집계 (해당 날짜의 모든 키워드 점수 합산)
      // 같은 날짜에 중복된 점수가 있을 수 있으므로, 같은 작성자+키워드 조합은 하나만 사용
      const seenKeys = new Set<string>();
      const scoreMap = new Map<string, {
        author_name: string;
        total_score: number;
        total_ranking_1_count: number;
        total_ranking_2_count: number;
        total_ranking_3_count: number;
        total_not_ranked_count: number;
        keywords: Set<string>;
      }>();

      (data || []).forEach((row: any) => {
        const authorName = row.author_name;
        const keyword = row.keyword || '';
        const uniqueKey = `${authorName}|${keyword}`;
        
        // 같은 작성자+키워드 조합이 이미 처리되었으면 스킵 (중복 방지)
        if (seenKeys.has(uniqueKey)) {
          return;
        }
        seenKeys.add(uniqueKey);
        
        if (!scoreMap.has(authorName)) {
          scoreMap.set(authorName, {
            author_name: authorName,
            total_score: 0,
            total_ranking_1_count: 0,
            total_ranking_2_count: 0,
            total_ranking_3_count: 0,
            total_not_ranked_count: 0,
            keywords: new Set(),
          });
        }

        const entry = scoreMap.get(authorName)!;
        entry.total_score += row.score || 0;
        entry.total_ranking_1_count += row.ranking_1_count || 0;
        entry.total_ranking_2_count += row.ranking_2_count || 0;
        entry.total_ranking_3_count += row.ranking_3_count || 0;
        entry.total_not_ranked_count += row.not_ranked_count || 0;
        if (keyword) {
          entry.keywords.add(keyword);
        }
      });

      scores = Array.from(scoreMap.values()).map(entry => ({
        author_name: entry.author_name,
        total_score: entry.total_score,
        total_ranking_1_count: entry.total_ranking_1_count,
        total_ranking_2_count: entry.total_ranking_2_count,
        total_ranking_3_count: entry.total_ranking_3_count,
        total_not_ranked_count: entry.total_not_ranked_count,
        date: targetDateStr,
        keywords_count: entry.keywords.size,
      }));
    }

    // 총점 기준으로 정렬 및 순위 부여
    scores.sort((a, b) => b.total_score - a.total_score);
    scores = scores.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    return NextResponse.json({
      success: true,
      date: targetDateStr,
      period: periodParam || 'day',
      scores,
      total_count: scores.length,
    });
  } catch (error: any) {
    console.error('[ranking-scores] 점수 조회 실패', error);
    return NextResponse.json(
      { error: error?.message ?? '점수 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

