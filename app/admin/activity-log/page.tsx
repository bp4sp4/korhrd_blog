import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import RecordActivityLog from '@/components/RecordActivityLog/RecordActivityLog';

export default async function AdminActivityLogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'super_admin' && profile.role !== 'admin')) {
    redirect('/');
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <RecordActivityLog />
    </section>
  );
}




