import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * 기존 keyword_records의 category를 키워드 내용을 분석해서 업데이트
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // 키워드 내용을 분석해서 category를 결정하는 함수
    // 순서가 중요함: 더 구체적인 키워드부터 체크
    const analyzeKeywordCategory = (keyword: string, field: string | null): string => {
      const normalizedKeyword = keyword.toLowerCase().trim();
      
      // 0. 재취업, 취업, 컴공, 40대, 중장년 같은 키워드는 무조건 기타로 분류 (가장 먼저 체크)
      // 단, 예외 처리:
      // - "사회복지사"가 포함된 경우 (사회복지사 취업, 사회복지사 자격증 취업 등)
      // - "아동", "어린이집", "유치원", "보조교사"가 포함된 경우 (아동분야 관련 취업)
      // - "자격증"이 포함된 경우 (취업 자격증, 취업잘되는자격증 등)
      if (
        (normalizedKeyword.includes('재취업') ||
         normalizedKeyword.includes('컴공') ||
         normalizedKeyword.includes('중장년')) &&
        !normalizedKeyword.includes('사회복지사') &&
        !normalizedKeyword.includes('아동') &&
        !normalizedKeyword.includes('어린이집') &&
        !normalizedKeyword.includes('유치원') &&
        !normalizedKeyword.includes('보조교사')
      ) {
        return '기타';
      }
      
      // 취업, 40대가 포함된 경우도 예외 처리
      if (
        (normalizedKeyword.includes('취업') || normalizedKeyword.includes('40대')) &&
        !normalizedKeyword.includes('사회복지사') &&
        !normalizedKeyword.includes('아동') &&
        !normalizedKeyword.includes('어린이집') &&
        !normalizedKeyword.includes('유치원') &&
        !normalizedKeyword.includes('보조교사') &&
        !normalizedKeyword.includes('자격증')
      ) {
        return '기타';
      }
      
      // 1. 학위 관련 (사회복지사보다 먼저 체크 - "사회복지사 유보통합" 같은 경우를 위해)
      // 유보, 유보통합, 학위과정, 학위 포함
      if (
        normalizedKeyword.includes('유보') ||
        normalizedKeyword.includes('유보통합') ||
        normalizedKeyword.includes('학위과정') ||
        normalizedKeyword.includes('학위')
      ) {
        return '학위과정';
      }
      
      // 2. 사회복지사 관련 (정확히 "사회복지사"가 포함된 경우만)
      if (normalizedKeyword.includes('사회복지사')) {
        return '사회복지사';
      }
      
      // 3. 산업기사, 응시자격 또는 구체적인 자격증 관련
      // "취업 자격증", "취업잘되는자격증", "40대 자격증 추천" 등도 포함
      if (
        normalizedKeyword.includes('산업기사') ||
        normalizedKeyword.includes('응시자격') ||
        (normalizedKeyword.includes('자격증') && 
         !normalizedKeyword.includes('재취업') && 
         !normalizedKeyword.includes('컴공') &&
         !normalizedKeyword.includes('중장년'))
      ) {
        return '산업기사/기사자격증';
      }
      
      // 4. 학점 또는 학점은행제 포함
      if (normalizedKeyword.includes('학점') || normalizedKeyword.includes('학점은행제')) {
        return '학점은행제';
      }
      
      // 5. 보육 또는 보육교사 포함
      if (normalizedKeyword.includes('보육') || normalizedKeyword.includes('보육교사')) {
        return '보육교사';
      }
      
      // 6. 심리 또는 상담 포함
      if (normalizedKeyword.includes('심리') || normalizedKeyword.includes('상담')) {
        return '심리/상담';
      }
      
      // 7. 평생 또는 평생교육원 포함
      if (normalizedKeyword.includes('평생') || normalizedKeyword.includes('평생교육원')) {
        return '평생교육원';
      }
      
      // 8. 대학교 또는 편입 포함
      if (normalizedKeyword.includes('대학교') || normalizedKeyword.includes('편입')) {
        return '대학교 편입';
      }
      
      // 9. 아동 관련 (복지 관련보다 먼저 체크 - 초등돌봄 등이 돌봄보다 우선)
      // 아동, 아동분야, 아동분야 민간자격증, 청소년, 방과후, 유아, 초등, 초등돌봄, 어린이, 어린이집, 어린이 재단, 유치원, 보조교사 포함
      if (
        normalizedKeyword.includes('아동') ||
        normalizedKeyword.includes('아동분야') ||
        normalizedKeyword.includes('아동분야 민간자격증') ||
        normalizedKeyword.includes('청소년') ||
        normalizedKeyword.includes('방과후') ||
        normalizedKeyword.includes('유아') ||
        normalizedKeyword.includes('초등돌봄') ||
        normalizedKeyword.includes('초등') ||
        normalizedKeyword.includes('어린이') ||
        normalizedKeyword.includes('어린이집') ||
        normalizedKeyword.includes('어린이 재단') ||
        normalizedKeyword.includes('유치원') ||
        normalizedKeyword.includes('보조교사')
      ) {
        return '아동분야 민간자격증';
      }
      
      // 10. 복지 관련 (사회복지사 제외, 초등돌봄 제외)
      // 복지학과, 복지, 돌봄, 동행, 활동 보조사, 생활 관련, 복지 + 민간자격증, 복지자격증 등
      if (
        normalizedKeyword.includes('복지학과') ||
        (normalizedKeyword.includes('돌봄') && !normalizedKeyword.includes('초등돌봄')) ||
        normalizedKeyword.includes('동행') ||
        normalizedKeyword.includes('활동 보조사') ||
        normalizedKeyword.includes('활동보조사') ||
        normalizedKeyword.includes('생활') ||
        (normalizedKeyword.includes('복지') && normalizedKeyword.includes('민간자격증')) ||
        normalizedKeyword.includes('복지자격증') ||
        (normalizedKeyword.includes('복지') && normalizedKeyword.includes('자격증')) ||
        (normalizedKeyword.includes('복지') && !normalizedKeyword.includes('사회복지사'))
      ) {
        return '복지분야 민간자격증';
      }
      
      // field 기반 분류 (키워드 분석으로 분류되지 않은 경우)
      // 단, 키워드 내용과 field가 관련이 있어야 함
      if (field) {
        const fieldMap: Record<string, string> = {
          '사회복지사': '사회복지사',
          '보육교사': '보육교사',
          '한국어교원': '평생교육원',
          '평생교육사': '평생교육원',
          '편입': '대학교 편입',
          '대학원': '대학교 편입',
          '대졸자전형': '대학교 편입',
          '일반과정': '학점은행제',
          '산업기사/기사': '산업기사/기사자격증',
          '민간자격증': '복지분야 민간자격증',
        };
        
        // field가 "사회복지사"인 경우, 키워드에 "사회복지사"가 없으면 field 기반 분류 사용 안 함
        if (field === '사회복지사' && !normalizedKeyword.includes('사회복지사')) {
          // 키워드와 field가 관련 없으면 기타로 분류
          return '기타';
        }
        
        // field가 "보육교사"인 경우, 키워드에 "보육" 또는 "보육교사"가 없으면 field 기반 분류 사용 안 함
        if (field === '보육교사' && !normalizedKeyword.includes('보육') && !normalizedKeyword.includes('보육교사')) {
          return '기타';
        }
        
        // 재취업, 취업, 컴공, 40대, 중장년 같은 키워드는 field와 관계없이 기타로 분류 (이미 위에서 체크했지만 이중 체크)
        if (
          normalizedKeyword.includes('재취업') ||
          normalizedKeyword.includes('취업') ||
          normalizedKeyword.includes('컴공') ||
          normalizedKeyword.includes('40대') ||
          normalizedKeyword.includes('중장년')
        ) {
          return '기타';
        }
        
        if (fieldMap[field]) {
          return fieldMap[field];
        }
      }
      
      // 10. 그 외는 기타
      return '기타';
    };

    // keyword_records에서 모든 키워드 가져오기 (기존 category 포함)
    const { data: keywordRecords, error: fetchError } = await adminClient
      .from('keyword_records')
      .select('id, keyword, category');

    if (fetchError) {
      console.error('[update-categories] 키워드 조회 실패:', fetchError);
      throw fetchError;
    }

    if (!keywordRecords || keywordRecords.length === 0) {
      return NextResponse.json({
        success: true,
        message: '업데이트할 키워드가 없습니다.',
        updated: 0,
        unchanged: 0,
      });
    }

    // blog_records에서 keyword와 field 매핑 가져오기 (field 정보가 필요한 경우)
    const { data: blogRecords, error: blogError } = await adminClient
      .from('blog_records')
      .select('keyword, field')
      .not('keyword', 'is', null);

    if (blogError) {
      console.error('[update-categories] 블로그 기록 조회 실패:', blogError);
      // blog_records 조회 실패해도 계속 진행 (field 없이 키워드만으로 분류)
    }

    // keyword -> field 매핑 생성
    const keywordToFieldMap = new Map<string, string | null>();
    if (blogRecords) {
      blogRecords.forEach((record) => {
        if (record.keyword && typeof record.keyword === 'string') {
          const normalized = record.keyword.trim().toLowerCase();
          // 같은 키워드가 여러 field에 있으면 첫 번째 것 사용
          if (!keywordToFieldMap.has(normalized)) {
            keywordToFieldMap.set(normalized, record.field);
          }
        }
      });
    }

    // 각 키워드의 새로운 category 계산
    // 모든 키워드를 분석해서 올바른 category로 재분류 (기존 category 무시)
    const updates: Array<{ id: string; keyword: string; oldCategory: string | null; newCategory: string }> = [];
    const categoryDistribution: Record<string, number> = {};

    keywordRecords.forEach((record) => {
      // 키워드 내용을 분석해서 올바른 category 결정
      const field = keywordToFieldMap.get(record.keyword.toLowerCase()) || null;
      const newCategory = analyzeKeywordCategory(record.keyword, field);
      
      // 기존 category와 다르면 업데이트 필요
      if (record.category !== newCategory) {
        updates.push({
          id: record.id,
          keyword: record.keyword,
          oldCategory: record.category,
          newCategory,
        });
      }
      
      categoryDistribution[newCategory] = (categoryDistribution[newCategory] || 0) + 1;
    });

    console.log(`[update-categories] 총 ${keywordRecords.length}개 키워드 중 ${updates.length}개 업데이트 필요`);
    console.log('[update-categories] 업데이트 후 category 분포:');
    Object.entries(categoryDistribution).forEach(([category, count]) => {
      console.log(`  - ${category}: ${count}개`);
    });

    if (updates.length === 0) {
      return NextResponse.json({
        success: true,
        message: '모든 키워드의 category가 이미 올바르게 설정되어 있습니다.',
        updated: 0,
        unchanged: keywordRecords.length,
        categoryDistribution,
      });
    }

    // 배치로 업데이트 (한 번에 너무 많이 업데이트하지 않도록)
    const BATCH_SIZE = 50;
    let updatedCount = 0;
    const errors: Array<{ keyword: string; error: string }> = [];

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      
      const updatePromises = batch.map(async (update) => {
        try {
          const { error } = await adminClient
            .from('keyword_records')
            .update({ category: update.newCategory })
            .eq('id', update.id);

          if (error) {
            console.error(`[update-categories] 업데이트 실패: ${update.keyword}`, error);
            errors.push({ keyword: update.keyword, error: error.message });
            return false;
          }
          return true;
        } catch (err: any) {
          console.error(`[update-categories] 업데이트 중 오류: ${update.keyword}`, err);
          errors.push({ keyword: update.keyword, error: err?.message || 'Unknown error' });
          return false;
        }
      });

      const results = await Promise.allSettled(updatePromises);
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          updatedCount++;
        }
      });

      // 배치 간 딜레이 (DB 부하 방지)
      if (i + BATCH_SIZE < updates.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    console.log(`[update-categories] 업데이트 완료: ${updatedCount}/${updates.length}개 성공`);

    return NextResponse.json({
      success: true,
      message: `${updatedCount}개의 키워드 category가 업데이트되었습니다.`,
      updated: updatedCount,
      unchanged: keywordRecords.length - updatedCount,
      total: keywordRecords.length,
      errors: errors.length > 0 ? errors : undefined,
      categoryDistribution,
    });
  } catch (error: any) {
    console.error('[update-categories] 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || '키워드 category 업데이트 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

