'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './UserInfo.module.css';

interface UserInfoProps {
  email: string | null;
  isAdmin: boolean;
}

export default function UserInfo({ email, isAdmin }: UserInfoProps) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  if (!email) {
    return (
      <div className={styles.loginPrompt}>
        <span>로그인이 필요합니다.</span>
        <a href="/login" className={styles.loginLink}>
          로그인하기
        </a>
      </div>
    );
  }


}

