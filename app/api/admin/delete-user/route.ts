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

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'owner' && profile?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden: Only owner or super admin can delete users' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    console.log('Delete user request - userId:', userId, 'current user:', user.id);

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Prevent self-deletion
    if (userId === user.id) {
      return NextResponse.json(
        { error: '자기 자신의 계정은 삭제할 수 없습니다.' },
        { status: 400 }
      );
    }

    // Check if user exists
    const { data: userProfile, error: checkError } = await supabase
      .from('profiles')
      .select('id, email, name')
      .eq('id', userId)
      .single();

    if (checkError || !userProfile) {
      return NextResponse.json(
        { error: '삭제할 사용자를 찾을 수 없습니다.' },
        { status: 400 }
      );
    }

    // Delete user using admin client
    const adminClient = createAdminClient();
    
    // Delete user from auth first (profiles will be cascade deleted if foreign key is set up correctly)
    const { data: deleteData, error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error('Error deleting user from auth:', deleteError);
      
      // If auth deletion fails, the user might not exist in auth.users
      // Try to clean up profiles manually as fallback
      const { error: profileDeleteError } = await adminClient
        .from('profiles')
        .delete()
        .eq('id', userId);
      
      if (profileDeleteError) {
        console.error('Error deleting profile:', profileDeleteError);
        return NextResponse.json({ 
          error: `사용자 삭제 중 오류가 발생했습니다: ${deleteError.message || JSON.stringify(deleteError)}` 
        }, { status: 400 });
      }
      
      // Profile deleted but auth user deletion failed
      // This might mean the user was already deleted from auth but profile remained
      console.log('Profile deleted but auth deletion failed - user may have been partially deleted');
      return NextResponse.json({ 
        success: true,
        message: '프로필이 삭제되었습니다. 인증 사용자는 이미 삭제되었거나 존재하지 않습니다.'
      });
    }

    console.log('User deleted successfully from auth');
    
    // Verify profile was cascade deleted, if not, delete it manually
    const { data: remainingProfile } = await adminClient
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();
    
    if (remainingProfile) {
      console.log('Profile still exists, deleting manually');
      const { error: profileDeleteError } = await adminClient
        .from('profiles')
        .delete()
        .eq('id', userId);
      
      if (profileDeleteError) {
        console.error('Error deleting remaining profile:', profileDeleteError);
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

