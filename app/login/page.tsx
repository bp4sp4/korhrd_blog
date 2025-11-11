'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './login.module.css';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const supabase = createClient();
      let listenerCleanedUp = false;
      const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
          if (!listenerCleanedUp) {
            listener.subscription.unsubscribe();
            listenerCleanedUp = true;
          }
          window.location.replace('/');
        }
      });

      const cleanupListener = () => {
        if (!listenerCleanedUp) {
          listener.subscription.unsubscribe();
          listenerCleanedUp = true;
        }
      };

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        cleanupListener();
        throw signInError;
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        cleanupListener();
        throw sessionError;
      }

      if (session) {
        cleanupListener();
        window.location.replace('/');
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 800));

      const {
        data: { session: retrySession },
        error: retryError,
      } = await supabase.auth.getSession();

      if (retryError) {
        cleanupListener();
        throw retryError;
      }

      if (retrySession) {
        cleanupListener();
        window.location.replace('/');
        return;
      }

      cleanupListener();
      throw new Error('세션을 설정하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } catch (err: any) {
      setError(err.message || '로그인에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginCard}>
        <div className={styles.logoContainer}>
          <Link href="/"><div className={styles.img}><img src="/logo.png" alt="logo" /></div></Link>
        </div>

        <form onSubmit={handleLogin} className={styles.form}>
          <div className={styles.formGroup}>
            <label className={styles.label}>이메일</label>
            <input
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일을 입력하세요"
              required
              autoComplete="email"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>비밀번호</label>
            <input
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              required
              autoComplete="current-password"
            />
          </div>
          {error && <div className={styles.error}>{error}</div>}
          <button
            type="submit"
            className={styles.button}
            disabled={isLoading}
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}

