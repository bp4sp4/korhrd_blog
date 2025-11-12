import { createClient } from '@/lib/supabase/server';
import SidebarClient from './SidebarClient';

export default async function Sidebar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  let isOwner = false;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin, role')
      .eq('id', user.id)
      .single();
    isAdmin = profile?.is_admin || false;
    isOwner = profile?.role === 'owner';
  }

  return <SidebarClient isAdmin={isAdmin} isOwner={isOwner} />;
}

