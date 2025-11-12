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

  // 활동 로그는 owner만 접근 가능
  if (!profile || profile.role !== 'owner') {
    redirect('/');
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <RecordActivityLog />
    </section>
  );
}




