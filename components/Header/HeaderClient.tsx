'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './Header.module.css';

interface HeaderClientProps {
  email: string | null;
  isAdmin: boolean;
}

export default function HeaderClient({ email, isAdmin }: HeaderClientProps) {
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className={styles.header}>
      <div className={styles.leftSection}>
        <div className={styles.title}>
          
        </div>
      </div>
      <div className={styles.rightSection}>
  
        {email && (
          <div className={styles.userInfo}>
            <span className={styles.userEmail}>{email}</span>
            <span className={`${styles.userRole} ${isAdmin ? styles.admin : styles.user}`}>
              {isAdmin ? '관리자' : '일반'}
            </span>
          </div>
        )}
        {email && (
          <a href="/account/password" className={styles.passwordLink}>
            비밀번호 변경
          </a>
        )}
     
     
     
        {email && (
          <button className={styles.actionButton} onClick={handleLogout} title="로그아웃">
            <LogOut size={20} />
          </button>
        )}
        {!email && (
          <a href="/login" className={styles.loginLink}>
            로그인
          </a>
        )}
      </div>
    </header>
  );
}

