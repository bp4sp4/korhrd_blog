import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const adminClient = createAdminClient();

    // 한국 시간(KST) 기준으로 오후 6시 기준 날짜 계산
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

    // 오후 6시 기준 날짜 계산 (18시 이전이면 전날)
    let targetDate = new Date(kstYear, kstMonth - 1, kstDay);
    if (kstHour < 18) {
      targetDate.setDate(targetDate.getDate() - 1);
    }

    const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

    console.log(`[calculate-scores] 대상 날짜: ${dateStr} (현재 KST 시간: ${kstHour}시)`);

    // blog_records에서 ranking이 있는 모든 레코드 가져오기
    const { data: records, error: recordsError } = await adminClient
      .from('blog_records')
      .select('id, keyword, ranking, author')
      .not('ranking', 'is', null);

    if (recordsError) {
      console.error('[calculate-scores] blog_records 조회 실패', recordsError);
      return NextResponse.json({ error: recordsError.message }, { status: 500 });
    }

    if (!records || records.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: '랭킹이 있는 레코드가 없습니다.',
        date: dateStr,
        processed: 0
      });
    }

    console.log(`[calculate-scores] 처리할 레코드 수: ${records.length}개`);

    // 작성자별, 키워드별로 점수 집계
    const scoreMap = new Map<string, {
      author_name: string;
      keyword: string;
      score: number;
      ranking_1_count: number;
      ranking_2_count: number;
      ranking_3_count: number;
      not_ranked_count: number;
    }>();

    records.forEach((record) => {
      const authorName = record.author?.trim() || record.id || 'unknown';
      const keyword = record.keyword?.trim() || '';
      const ranking = record.ranking || 0;

      if (ranking <= 0) return; // 랭킹이 0 이하면 스킵

      const key = `${authorName}|${keyword}`;

      if (!scoreMap.has(key)) {
        scoreMap.set(key, {
          author_name: authorName,
          keyword: keyword,
          score: 0,
          ranking_1_count: 0,
          ranking_2_count: 0,
          ranking_3_count: 0,
          not_ranked_count: 0,
        });
      }

      const entry = scoreMap.get(key)!;

      // 점수 계산 (금메달 5점, 은메달 3점, 동메달 2점, 미노출 1점)
      if (ranking === 1) {
        entry.score += 5;
        entry.ranking_1_count += 1;
      } else if (ranking === 2) {
        entry.score += 3;
        entry.ranking_2_count += 1;
      } else if (ranking === 3) {
        entry.score += 2;
        entry.ranking_3_count += 1;
      } else {
        entry.score += 1;
        entry.not_ranked_count += 1;
      }
    });

    console.log(`[calculate-scores] 집계된 항목 수: ${scoreMap.size}개`);

    // daily_ranking_scores 테이블에 upsert
    const scoresToUpsert = Array.from(scoreMap.values()).map(entry => ({
      author_name: entry.author_name,
      date: dateStr,
      keyword: entry.keyword,
      score: entry.score,
      ranking_1_count: entry.ranking_1_count,
      ranking_2_count: entry.ranking_2_count,
      ranking_3_count: entry.ranking_3_count,
      not_ranked_count: entry.not_ranked_count,
    }));

    const { error: upsertError } = await adminClient
      .from('daily_ranking_scores')
      .upsert(scoresToUpsert, {
        onConflict: 'author_name,date,keyword',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error('[calculate-scores] daily_ranking_scores 업데이트 실패', upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    // 작성자별 총점 집계
    const authorTotalMap = new Map<string, {
      author_name: string;
      total_score: number;
      total_ranking_1_count: number;
      total_ranking_2_count: number;
      total_ranking_3_count: number;
      total_not_ranked_count: number;
    }>();

    scoreMap.forEach((entry) => {
      const authorName = entry.author_name;
      if (!authorTotalMap.has(authorName)) {
        authorTotalMap.set(authorName, {
          author_name: authorName,
          total_score: 0,
          total_ranking_1_count: 0,
          total_ranking_2_count: 0,
          total_ranking_3_count: 0,
          total_not_ranked_count: 0,
        });
      }

      const total = authorTotalMap.get(authorName)!;
      total.total_score += entry.score;
      total.total_ranking_1_count += entry.ranking_1_count;
      total.total_ranking_2_count += entry.ranking_2_count;
      total.total_ranking_3_count += entry.ranking_3_count;
      total.total_not_ranked_count += entry.not_ranked_count;
    });

    const authorTotals = Array.from(authorTotalMap.values())
      .sort((a, b) => b.total_score - a.total_score)
      .slice(0, 10);

    console.log(`[calculate-scores] 처리 완료: ${scoresToUpsert.length}개 항목 저장`);

    return NextResponse.json({
      success: true,
      message: '점수 계산 및 저장 완료',
      date: dateStr,
      processed: records.length,
      scores_count: scoresToUpsert.length,
      top_10: authorTotals.map((entry, index) => ({
        rank: index + 1,
        ...entry,
      })),
    });
  } catch (error: any) {
    console.error('[calculate-scores] 점수 계산 중 오류', error);
    return NextResponse.json(
      { error: error?.message ?? '점수 계산 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

