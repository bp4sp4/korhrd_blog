import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function PUT(request: NextRequest) {
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
      return NextResponse.json({ error: 'Forbidden: Only owner or super admin can update teams' }, { status: 403 });
    }

    const { id, name, description, group_id } = await request.json();

    if (!id || !name) {
      return NextResponse.json(
        { error: 'Team ID and name are required' },
        { status: 400 }
      );
    }

    // Update team using admin client
    const adminClient = createAdminClient();
    const { data: teamData, error: teamError } = await adminClient
      .from('teams')
      .update({
        name,
        description: description || null,
        group_id: group_id || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (teamError) {
      return NextResponse.json({ error: teamError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, team: teamData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

