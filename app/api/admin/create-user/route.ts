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

    // 먼저 동일 이메일 사용자 존재 여부 확인
    const { data: existingUserData, error: existingUserError } = await adminClient.auth.admin.getUserByEmail(email);

    if (existingUserError) {
      return NextResponse.json({ error: existingUserError.message }, { status: 400 });
    }

    const userRole = role || 'member';
    const isAdmin = userRole === 'super_admin' || userRole === 'admin';
    const normalizedTeamId = teamId || null;

    if (existingUserData?.user) {
      const targetUserId = existingUserData.user.id;

      const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, {
        password,
        email_confirm: true,
      });

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      const { error: profileError } = await adminClient
        .from('profiles')
        .upsert(
          {
            id: targetUserId,
            email,
            name,
            is_admin: isAdmin,
            role: userRole,
            team_id: normalizedTeamId,
          },
          {
            onConflict: 'id',
          }
        );

      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        user: existingUserData.user,
        message: '기존 계정 정보를 업데이트했습니다.',
      });
    }

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (authData.user) {
      const { error: profileError } = await adminClient
        .from('profiles')
        .upsert(
          {
            id: authData.user.id,
            email,
            name,
            is_admin: isAdmin,
            role: userRole,
            team_id: normalizedTeamId,
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

