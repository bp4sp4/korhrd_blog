import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(request: NextRequest) {
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
      return NextResponse.json({ error: 'Forbidden: Only owner or super admin can delete groups' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('groupId');

    if (!groupId) {
      return NextResponse.json(
        { error: 'Group ID is required' },
        { status: 400 }
      );
    }

    // Delete group using admin client
    const adminClient = createAdminClient();
    
    // First, remove all teams from the group (set group_id to null)
    const { error: updateError } = await adminClient
      .from('teams')
      .update({ group_id: null })
      .eq('group_id', groupId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    // Then delete the group
    const { error: deleteError } = await adminClient
      .from('groups')
      .delete()
      .eq('id', groupId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

