'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './PasswordChangeForm.module.css';

const MIN_PASSWORD_LENGTH = 8;

export default function PasswordChangeForm() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'error' | 'success' | null>(null);

  const resetForm = () => {
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setMessageType(null);

    if (!newPassword || !confirmPassword) {
      setMessage('새 비밀번호와 확인 비밀번호를 모두 입력해주세요.');
      setMessageType('error');
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage('비밀번호가 일치하지 않습니다.');
      setMessageType('error');
      return;
    }

    if (newPassword.trim().length < MIN_PASSWORD_LENGTH) {
      setMessage(`비밀번호는 최소 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
      setMessageType('error');
      return;
    }

    try {
      setIsSubmitting(true);
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword.trim(),
      });

      if (error) {
        throw error;
      }

      setMessage('비밀번호가 성공적으로 변경되었습니다. 다시 로그인해주세요.');
      setMessageType('success');
      resetForm();

      // 보안을 위해 로그아웃 후 로그인 페이지로 이동
      await supabase.auth.signOut();
      setTimeout(() => {
        router.push('/login');
        router.refresh();
      }, 1500);
    } catch (err: any) {
      setMessage(err.message || '비밀번호 변경 중 오류가 발생했습니다.');
      setMessageType('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>비밀번호 변경</h1>
      <p className={styles.description}>
        보안을 위해 새 비밀번호를 설정하고 다시 로그인해주세요.
      </p>

      {message && (
        <div
          className={`${styles.message} ${
            messageType === 'error' ? styles.errorMessage : styles.successMessage
          }`}
        >
          {message}
        </div>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label className={styles.label}>새 비밀번호</label>
          <input
            type="password"
            className={styles.input}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="새 비밀번호를 입력하세요"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>비밀번호 확인</label>
          <input
            type="password"
            className={styles.input}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="비밀번호를 다시 입력하세요"
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={resetForm}
            disabled={isSubmitting}
          >
            초기화
          </button>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={isSubmitting}
          >
            {isSubmitting ? '변경 중...' : '비밀번호 변경'}
          </button>
        </div>
      </form>
    </div>
  );
}


