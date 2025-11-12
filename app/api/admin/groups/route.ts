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

    // Check if user is owner or super_admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'owner' && profile.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all groups
    const { data: groups, error: groupsError } = await supabase
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false });

    if (groupsError) {
      return NextResponse.json({ error: groupsError.message }, { status: 400 });
    }

    // Get team count for each group
    const formattedGroups = await Promise.all(
      (groups || []).map(async (group: any) => {
        const { count, error: countError } = await supabase
          .from('teams')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', group.id);

        return {
          ...group,
          team_count: countError ? 0 : (count || 0),
        };
      })
    );

    return NextResponse.json({ groups: formattedGroups });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

