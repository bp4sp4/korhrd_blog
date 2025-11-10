'use client';

import { useMemo, useState } from 'react';
import styles from './PasswordManager.module.css';

interface PasswordManagerUser {
  id: string;
  name: string | null;
  email: string | null;
}

interface PasswordManagerProps {
  users: PasswordManagerUser[];
}

const MIN_PASSWORD_LENGTH = 8;

export default function PasswordManager({ users }: PasswordManagerProps) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId),
    [users, selectedUserId]
  );

  const resetForm = () => {
    setNewPassword('');
    setConfirmPassword('');
    setSelectedUserId('');
  };

  const handleGeneratePassword = () => {
    const chars =
      'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    const passwordLength = 12;
    let generated = '';
    for (let i = 0; i < passwordLength; i += 1) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(generated);
    setConfirmPassword(generated);
    setSuccess('임시 비밀번호가 생성되었습니다. 저장을 눌러 적용해주세요.');
    setError('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedUserId) {
      setError('비밀번호를 변경할 계정을 선택해주세요.');
      return;
    }

    if (!newPassword || !confirmPassword) {
      setError('새 비밀번호와 확인 비밀번호를 모두 입력해주세요.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`비밀번호는 최소 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch('/api/admin/update-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: selectedUserId,
          newPassword: newPassword.trim(),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || '비밀번호 변경에 실패했습니다.');
      }

      setSuccess('비밀번호가 성공적으로 변경되었습니다.');
      setTimeout(() => setSuccess(''), 4000);
      resetForm();
    } catch (err: any) {
      setError(err.message || '비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>비밀번호 변경</h2>
        <p className={styles.caption}>
          선택한 계정의 비밀번호를 즉시 변경합니다. 변경 후 사용자에게 새 비밀번호를 전달해주세요.
        </p>
      </div>

      {(error || success) && (
        <div
          className={`${styles.message} ${
            error ? styles.errorMessage : styles.successMessage
          }`}
        >
          {error || success}
        </div>
      )}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label className={styles.label}>계정 선택</label>
          <select
            className={styles.select}
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
          >
            <option value="">계정을 선택하세요</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name || user.email || '이름 없음'}
              </option>
            ))}
          </select>
          {selectedUser && (
            <div className={styles.userMeta}>
              <span className={styles.userMetaItem}>
                이름: {selectedUser.name || '이름 없음'}
              </span>
              <span className={styles.userMetaItem}>
                이메일: {selectedUser.email || '이메일 없음'}
              </span>
            </div>
          )}
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>새 비밀번호</label>
          <div className={styles.inputRow}>
            <input
              type="text"
              className={styles.input}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="새 비밀번호를 입력하세요"
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={handleGeneratePassword}
            >
              임시 비밀번호 생성
            </button>
          </div>
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
            className={styles.tertiaryButton}
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


