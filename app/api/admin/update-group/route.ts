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
      return NextResponse.json({ error: 'Forbidden: Only owner or super admin can update groups' }, { status: 403 });
    }

    const { id, name, description } = await request.json();

    if (!id || !name) {
      return NextResponse.json(
        { error: 'Group ID and name are required' },
        { status: 400 }
      );
    }

    // Update group using admin client
    const adminClient = createAdminClient();
    const { data: groupData, error: groupError } = await adminClient
      .from('groups')
      .update({
        name,
        description: description || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (groupError) {
      return NextResponse.json({ error: groupError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, group: groupData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

