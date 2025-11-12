import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword');

    if (!keyword || !keyword.trim()) {
      return NextResponse.json({ blogId: null });
    }

    const normalizedKeyword = keyword.trim().toLowerCase().replace(/\s+/g, ' ');

    const adminClient = createAdminClient();
    
    // 키워드로 정확히 일치하는 블로그 기록 찾기
    // 먼저 정확히 일치하는 것 찾기
    const { data: exactMatch, error: exactError } = await adminClient
      .from('blog_records')
      .select('id, keyword')
      .eq('keyword', keyword.trim())
      .limit(1)
      .maybeSingle();

    if (!exactError && exactMatch) {
      return NextResponse.json({ blogId: exactMatch.id });
    }

    // 정확히 일치하지 않으면 정규화된 키워드로 매칭
    const { data: blogRecords, error } = await adminClient
      .from('blog_records')
      .select('id, keyword')
      .limit(500);

    if (error) {
      console.error('[keywords/find-blog-id] Failed to fetch blog records', error);
      return NextResponse.json({ blogId: null });
    }

    // 정규화된 키워드로 매칭
    const matchedRecord = blogRecords?.find((record) => {
      if (!record.keyword) return false;
      const normalized = record.keyword.trim().toLowerCase().replace(/\s+/g, ' ');
      return normalized === normalizedKeyword;
    });

    if (matchedRecord) {
      return NextResponse.json({ blogId: matchedRecord.id });
    }

    return NextResponse.json({ blogId: null });
  } catch (error: any) {
    console.error('[keywords/find-blog-id] Error', error);
    return NextResponse.json({ blogId: null });
  }
}

