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

    // Check if user is owner or super_admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'owner' && profile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden: Only owner or super admin can create users' }, { status: 403 });
    }

    const { email, password, name, teamId, role } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, password, and name are required' },
        { status: 400 }
      );
    }

    // owner 역할은 계정 생성 시 설정할 수 없음
    if (role === 'owner') {
      return NextResponse.json(
        { error: '시스템 소유자 역할은 계정 생성 시 설정할 수 없습니다.' },
        { status: 400 }
      );
    }

    // Create user using admin client with service role key
    const adminClient = createAdminClient();

    // 먼저 동일 이메일 사용자 존재 여부 확인
    const normalizedEmail = String(email).toLowerCase();
    const {
      data: usersList,
      error: listUsersError,
    } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listUsersError) {
      return NextResponse.json({ error: listUsersError.message }, { status: 400 });
    }

    const existingUser = usersList?.users?.find(
      (candidate) => candidate.email?.toLowerCase() === normalizedEmail
    );

    const userRole = role || 'member';
    const isAdmin = userRole === 'owner' || userRole === 'super_admin' || userRole === 'admin';
    const normalizedTeamId = teamId || null;

    if (existingUser) {
      const targetUserId = existingUser.id;

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
        user: existingUser,
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

