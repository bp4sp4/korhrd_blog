import { createClient } from '@/lib/supabase/server';
import KeywordMenu from '@/components/KeywordMenu/KeywordMenu';

export const dynamic = 'force-dynamic';

export default async function KeywordMenuPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();
    isAdmin = profile?.is_admin || false;
  }

  return <KeywordMenu isAdmin={isAdmin} />;
}

