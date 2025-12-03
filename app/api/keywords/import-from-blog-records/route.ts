import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * 블로그 기록에서 모든 키워드를 가져와서 키워드 메뉴판에 일괄 등록
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

    // blog_records에서 키워드와 field 가져오기
    const { data: blogRecords, error: blogError } = await adminClient
      .from('blog_records')
      .select('keyword, field')
      .not('keyword', 'is', null);

    if (blogError) {
      console.error('[import-keywords] 블로그 기록 조회 실패:', blogError);
      throw blogError;
    }

    if (!blogRecords || blogRecords.length === 0) {
      return NextResponse.json({
        success: true,
        message: '등록할 키워드가 없습니다.',
        imported: 0,
        skipped: 0,
      });
    }

    // 키워드 추출 및 정규화 (중복 제거, 공백 제거, field별로 그룹화)
    // 같은 키워드가 여러 field에 있으면 가장 많이 나타난 field의 category 사용
    const keywordMap = new Map<string, { keyword: string; category: string; count: number }>();
    const unmappedFields = new Set<string>(); // 매핑되지 않은 field 추적
    
    blogRecords.forEach((record) => {
      if (record.keyword && typeof record.keyword === 'string') {
        const normalized = record.keyword.trim();
        if (normalized.length > 0) {
          // 키워드 내용과 field를 모두 고려해서 category 결정
          const category = analyzeKeywordCategory(normalized, record.field);
          
          // 매핑되지 않은 field가 있으면 기록
          if (record.field && !['사회복지사', '보육교사', '한국어교원', '평생교육사', '편입', '대학원', '대졸자전형', '일반과정', '산업기사/기사', '민간자격증'].includes(record.field)) {
            unmappedFields.add(record.field);
          }
          
          const key = normalized.toLowerCase().replace(/\s+/g, ' ');
          
          if (keywordMap.has(key)) {
            const existing = keywordMap.get(key)!;
            existing.count += 1;
            // 같은 키워드가 여러 field에 있으면 count가 많은 쪽의 category 사용
            // 하지만 키워드 내용 기반 분류가 더 정확하므로, 새로운 category가 더 적합하면 업데이트
            const newCategory = analyzeKeywordCategory(normalized, record.field);
            if (newCategory !== existing.category && existing.count === 1) {
              // 첫 번째 발견이었고 category가 다르면 업데이트 (키워드 내용 기반이 더 정확)
              existing.category = newCategory;
            }
          } else {
            keywordMap.set(key, {
              keyword: normalized,
              category,
              count: 1,
            });
          }
        }
      }
    });
    
    // 매핑되지 않은 field가 있으면 로그 출력
    if (unmappedFields.size > 0) {
      console.warn('[import-keywords] 매핑되지 않은 field 발견:', Array.from(unmappedFields));
    }

    const keywordsToImport = Array.from(keywordMap.values());

    // 각 키워드의 field → category 매핑 로그 출력 (디버깅용)
    console.log(`[import-keywords] 총 ${keywordsToImport.length}개의 고유 키워드 발견`);
    console.log('[import-keywords] 키워드별 category 분포:');
    const categoryCounts: Record<string, number> = {};
    keywordsToImport.forEach((item) => {
      categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    });
    Object.entries(categoryCounts).forEach(([category, count]) => {
      console.log(`  - ${category}: ${count}개`);
    });
    
    // 샘플로 처음 10개 키워드의 상세 정보 출력
    console.log('[import-keywords] 샘플 키워드 (처음 10개):');
    keywordsToImport.slice(0, 10).forEach((item) => {
      console.log(`  - "${item.keyword}" → category: ${item.category}, count: ${item.count}`);
    });

    if (keywordsToImport.length === 0) {
      return NextResponse.json({
        success: true,
        message: '등록할 유효한 키워드가 없습니다.',
        imported: 0,
        skipped: 0,
      });
    }

    // 기존 keyword_records에서 이미 존재하는 키워드 확인 (대소문자 무시, 공백 정규화)
    const { data: existingKeywords, error: existingError } = await adminClient
      .from('keyword_records')
      .select('keyword');

    if (existingError) {
      console.error('[import-keywords] 기존 키워드 조회 실패:', existingError);
      throw existingError;
    }

    const existingKeywordSet = new Set<string>();
    (existingKeywords || []).forEach((record) => {
      if (record.keyword && typeof record.keyword === 'string') {
        // 정규화: 소문자 변환, 공백 제거
        const normalized = record.keyword.trim().toLowerCase().replace(/\s+/g, ' ');
        existingKeywordSet.add(normalized);
      }
    });

    // 새로 추가할 키워드만 필터링 (정확한 중복 체크)
    const newKeywords = keywordsToImport.filter((item) => {
      const normalized = item.keyword.trim().toLowerCase().replace(/\s+/g, ' ');
      return !existingKeywordSet.has(normalized);
    });

    if (newKeywords.length === 0) {
      return NextResponse.json({
        success: true,
        message: '모든 키워드가 이미 등록되어 있습니다.',
        imported: 0,
        skipped: keywordsToImport.length,
        total: keywordsToImport.length,
      });
    }

    // keyword_records에 일괄 삽입 (category 포함)
    const keywordsToInsert = newKeywords.map((item) => ({
      keyword: item.keyword.trim(),
      blog_id: null,
      memo: null,
      category: item.category, // field에서 매핑된 category 사용 (기본값: '사회복지사')
    }));

    // 배치로 나누어 삽입 (한 번에 너무 많이 하지 않도록)
    const BATCH_SIZE = 100;
    let imported = 0;
    let errors = 0;

    for (let i = 0; i < keywordsToInsert.length; i += BATCH_SIZE) {
      const batch = keywordsToInsert.slice(i, i + BATCH_SIZE);
      try {
        const { error: insertError } = await adminClient
          .from('keyword_records')
          .insert(batch);

        if (insertError) {
          console.error(`[import-keywords] 배치 ${i / BATCH_SIZE + 1} 삽입 실패:`, insertError);
          errors += batch.length;
        } else {
          imported += batch.length;
        }
      } catch (err) {
        console.error(`[import-keywords] 배치 ${i / BATCH_SIZE + 1} 오류:`, err);
        errors += batch.length;
      }
    }

    const unmappedFieldsList = Array.from(unmappedFields);
    
    // 새로 추가된 키워드들의 category 분포 계산
    const importedCategoryCounts: Record<string, number> = {};
    newKeywords.forEach((item) => {
      importedCategoryCounts[item.category] = (importedCategoryCounts[item.category] || 0) + 1;
    });
    
    // 전체 키워드들의 category 분포 (중복 제거 전)
    const totalCategoryCounts: Record<string, number> = {};
    keywordsToImport.forEach((item) => {
      totalCategoryCounts[item.category] = (totalCategoryCounts[item.category] || 0) + 1;
    });
    
    const message = unmappedFieldsList.length > 0
      ? `${imported}개의 키워드가 등록되었습니다. (매핑되지 않은 field: ${unmappedFieldsList.join(', ')})`
      : `${imported}개의 키워드가 등록되었습니다.`;

    return NextResponse.json({
      success: true,
      message,
      imported,
      skipped: keywordsToImport.length - newKeywords.length,
      total: keywordsToImport.length,
      errors,
      unmappedFields: unmappedFieldsList.length > 0 ? unmappedFieldsList : undefined,
      // category 분포 정보 추가
      categoryDistribution: {
        imported: importedCategoryCounts, // 새로 추가된 키워드의 category 분포
        total: totalCategoryCounts, // 전체 고유 키워드의 category 분포
      },
    });
  } catch (error: any) {
    console.error('[import-keywords] API 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message ?? '키워드 일괄 등록 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

