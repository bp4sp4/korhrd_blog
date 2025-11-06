import { createClient } from '@/lib/supabase/server';
import HeaderClient from './HeaderClient';

export default async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let email: string | null = null;
  let isAdmin = false;

  if (user) {
    email = user.email || null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();
    isAdmin = profile?.is_admin || false;
  }

  return <HeaderClient email={email} isAdmin={isAdmin} />;
}

