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
      console.error('[record-logs] Profile fetch error:', profileError);
      return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 });
    }

    // 활동 로그는 owner만 접근 가능
    if (!profile || profile.role !== 'owner') {
      console.warn('[record-logs] Access denied:', {
        userId: user.id,
        userEmail: user.email,
        role: profile?.role,
      });
      return NextResponse.json({ error: 'Forbidden: Only owner can access activity logs' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '10')));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('record_activity_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('[record-logs] Database query error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[record-logs] Success:', {
        logsCount: data?.length ?? 0,
        totalCount: count ?? 0,
        page,
        limit,
      });
    }

    return NextResponse.json({
      logs: data ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / limit) : 1,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}




