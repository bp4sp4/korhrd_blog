import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import PasswordChangeForm from '@/components/PasswordChangeForm/PasswordChangeForm';

export default async function PasswordChangePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div style={{ padding: '32px 24px' }}>
      <PasswordChangeForm />
    </div>
  );
}


