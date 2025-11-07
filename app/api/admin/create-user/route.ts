import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is super_admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden: Only super admin can create users' }, { status: 403 });
    }

    const { email, password, name, teamId, role } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    // Create user using admin client with service role key
    const adminClient = createAdminClient();
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (authData.user) {
      // 트리거가 자동으로 프로필을 생성하므로, 약간의 지연 후 is_admin 업데이트
      // 또는 UPSERT를 사용하여 프로필이 없으면 생성, 있으면 업데이트
      // Determine role and is_admin
      const userRole = role || 'member';
      const isAdmin = userRole === 'super_admin' || userRole === 'admin';

      const { error: profileError } = await adminClient
        .from('profiles')
        .upsert(
          {
            id: authData.user.id,
            email,
            name,
            is_admin: isAdmin,
            role: userRole,
            team_id: teamId || null,
          },
          {
            onConflict: 'id',
          }
        );

      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true, user: authData.user });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

