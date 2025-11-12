import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: keywords, error } = await adminClient
      .from('keyword_records')
      .select('id, keyword, blog_id, memo, category, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[keywords] GET query error:', error);
      throw error;
    }

    const items = keywords ?? [];

    if (items.length === 0) {
      return NextResponse.json({ keywords: [] });
    }

    // blog_id로 매칭할 블로그 ID 수집
    const blogIds = Array.from(
      new Set(
        items
          .map((item) => item.blog_id)
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      )
    );

    // 키워드로 매칭할 키워드 수집 (정규화: 공백 제거, 소문자 변환)
    const keywordTexts = Array.from(
      new Set(
        items
          .map((item) => item.keyword.trim().toLowerCase().replace(/\s+/g, ' '))
          .filter((value) => value.length > 0)
      )
    );

    let blogRecordsByIdAndKeyword: Record<string, any> = {};
    let blogRecordsByKeyword: Record<string, any> = {};

    // blog_id로 매칭 (같은 id에 여러 레코드가 있을 수 있으므로 키워드도 함께 고려)
    if (blogIds.length > 0) {
      const { data: blogData, error: blogError } = await adminClient
        .from('blog_records')
        .select('id, keyword, title, ranking, link, author, search_volume, created_at')
        .in('id', blogIds);

      if (blogError) {
        console.error('[keywords] Failed to load related blog records by id', blogError);
      } else if (blogData) {
        // blog_id와 keyword 조합으로 맵 생성
        blogData.forEach((record) => {
          const normalizedKeyword = record.keyword?.trim().toLowerCase().replace(/\s+/g, ' ') || '';
          const key = `${record.id}::${normalizedKeyword}`;
          blogRecordsByIdAndKeyword[key] = record;
        });
      }
    }

    // 키워드로 매칭 (정확히 일치하는 것만)
    if (keywordTexts.length > 0) {
      // 모든 키워드에 대해 일치하는 레코드 찾기 (배치 처리)
      const { data: allBlogData, error: blogError } = await adminClient
        .from('blog_records')
        .select('id, keyword, title, ranking, link, author, search_volume, created_at')
        .limit(1000); // 충분한 수의 레코드 가져오기

      if (blogError) {
        console.error('[keywords] Failed to load blog records for keyword matching', blogError);
      } else if (allBlogData) {
        // 메모리에 로드한 데이터에서 키워드 매칭
        for (const keywordText of keywordTexts) {
          const exactMatch = allBlogData.find((record) => {
            if (!record.keyword) return false;
            const normalized = record.keyword.trim().toLowerCase().replace(/\s+/g, ' ');
            return normalized === keywordText;
          });

          if (exactMatch) {
            blogRecordsByKeyword[keywordText] = exactMatch;
          }
        }
      }
    }

    // 키워드 레코드와 블로그 레코드 매칭
    const merged = items.map((item) => {
      const normalizedKeyword = item.keyword.trim().toLowerCase().replace(/\s+/g, ' ');
      
      // 1순위: blog_id와 keyword 조합으로 정확히 매칭된 레코드
      let matchedBlog = null;
      if (item.blog_id) {
        const key = `${item.blog_id}::${normalizedKeyword}`;
        matchedBlog = blogRecordsByIdAndKeyword[key] || null;
      }
      
      // 2순위: 키워드로 매칭된 레코드 (blog_id+keyword 매칭이 없거나 ranking이 없는 경우)
      if (!matchedBlog || !matchedBlog.ranking) {
        const keywordMatched = blogRecordsByKeyword[normalizedKeyword];
        if (keywordMatched) {
          matchedBlog = keywordMatched;
        }
      }
      
      return {
        ...item,
        blog: matchedBlog ?? null,
      };
    });

    return NextResponse.json({ keywords: merged });
  } catch (error: any) {
    console.error('[keywords] GET failed', error);
    const errorMessage = error?.message ?? '키워드 목록을 불러오지 못했습니다.';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();

    type RawKeywordPayload = {
      keyword?: unknown;
      blogId?: unknown;
      memo?: unknown;
      category?: unknown;
    };

    const rawItems: RawKeywordPayload[] = Array.isArray(body?.keywords)
      ? (body.keywords as RawKeywordPayload[])
      : ([
          {
            keyword: body?.keyword,
            blogId: body?.blogId,
            memo: body?.memo,
            category: body?.category,
          },
        ] as RawKeywordPayload[]);

    type SanitizedKeyword = {
      keyword: string;
      blog_id: string | null;
      memo: string | null;
      category: string | null;
    };

    const sanitized: SanitizedKeyword[] = rawItems
      .map((item) => {
        const keyword = typeof item.keyword === 'string' ? item.keyword.trim() : '';
        if (!keyword) return null;
        const blogId =
          typeof item.blogId === 'string' && item.blogId.trim().length > 0
            ? item.blogId.trim()
            : null;
        const memo =
          typeof item.memo === 'string' && item.memo.trim().length > 0
            ? item.memo.trim()
            : null;
        const category =
          typeof item.category === 'string' && item.category.trim().length > 0
            ? item.category.trim()
            : null;
        return { keyword, blog_id: blogId, memo, category } satisfies SanitizedKeyword;
      })
      .filter((item): item is SanitizedKeyword => item !== null);

    if (sanitized.length === 0) {
      return NextResponse.json({ error: '등록할 유효한 키워드가 없습니다.' }, { status: 400 });
    }

    const deduped = Array.from(
      sanitized.reduce<Map<string, SanitizedKeyword>>((acc, current) => {
        const key = current.keyword.toLowerCase();
        if (!acc.has(key)) {
          acc.set(key, current);
        } else {
          const existing = acc.get(key)!;
          acc.set(key, {
            keyword: existing.keyword,
            blog_id: current.blog_id ?? existing.blog_id,
            memo: current.memo ?? existing.memo,
            category: current.category ?? existing.category,
          });
        }
        return acc;
      }, new Map<string, SanitizedKeyword>()).values()
    );

    const keywordsOnly = deduped.map((item) => item.keyword);

    type KeywordRow = {
      id: string;
      keyword: string;
      blog_id: string | null;
      memo: string | null;
      category: string | null;
      created_at: string;
    };

    const { data: existing, error: existingError } = await adminClient
      .from('keyword_records')
      .select('id, keyword')
      .in('keyword', keywordsOnly);

    if (existingError) throw existingError;

    const existingMap = new Map<string, string>();
    (existing ?? []).forEach((record) => existingMap.set(record.keyword.toLowerCase(), record.id));

    const toInsert = deduped.filter((entry) => !existingMap.has(entry.keyword.toLowerCase()));
    const toUpdate = deduped
      .map((entry) => {
        const id = existingMap.get(entry.keyword.toLowerCase());
        if (!id) return null;
        if (!entry.blog_id && !entry.memo && !entry.category) return null;
        return { id, keyword: entry.keyword, blog_id: entry.blog_id, memo: entry.memo, category: entry.category };
      })
      .filter(
        (entry): entry is { id: string; keyword: string; blog_id: string | null; memo: string | null; category: string | null } =>
          entry !== null && (entry.blog_id !== null || entry.memo !== null || entry.category !== null)
      );

    const inserted: KeywordRow[] = [];
    const updated: KeywordRow[] = [];

    if (toInsert.length > 0) {
      const { data: insertData, error: insertError } = await adminClient
        .from('keyword_records')
        .insert(toInsert)
        .select('id, keyword, blog_id, memo, category, created_at');

      if (insertError) throw insertError;
      if (Array.isArray(insertData)) {
        inserted.push(...(insertData as KeywordRow[]));
      }
    }

    if (toUpdate.length > 0) {
      const { data: updateData, error: updateError } = await adminClient
        .from('keyword_records')
        .upsert(toUpdate, { onConflict: 'id' })
        .select('id, keyword, blog_id, memo, category, created_at');

      if (updateError) throw updateError;
      if (Array.isArray(updateData)) {
        updated.push(...(updateData as KeywordRow[]));
      }
    }

    return NextResponse.json({ keywords: [...inserted, ...updated] });
  } catch (error: any) {
    console.error('[keywords] POST failed', error);

    if (error?.code === '23505') {
      return NextResponse.json({ error: '이미 등록된 키워드입니다.' }, { status: 409 });
    }

    const errorMessage = error?.message ?? '키워드를 저장하지 못했습니다.';

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden: Only admin can delete keywords' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '키워드 ID가 필요합니다.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from('keyword_records')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[keywords] DELETE failed', error);
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[keywords] DELETE failed', error);
    const errorMessage = error?.message ?? '키워드를 삭제하지 못했습니다.';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

