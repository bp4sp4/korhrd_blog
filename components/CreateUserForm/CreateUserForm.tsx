'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './CreateUserForm.module.css';

export default function CreateUserForm() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    isAdmin: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.email || !formData.password) {
      setError('이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          isAdmin: formData.isAdmin,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '사용자 생성 중 오류가 발생했습니다.');
      }

      setSuccess('사용자가 성공적으로 생성되었습니다.');
      setFormData({
        email: '',
        password: '',
        isAdmin: false,
      });
      
      // 페이지 새로고침하여 계정 목록 업데이트
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      setError(err.message || '사용자 생성 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.createUserForm}>
      <h2 className={styles.formTitle}>계정 생성</h2>
      <form onSubmit={handleSubmit}>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>이메일 *</label>
            <input
              type="email"
              name="email"
              className={styles.input}
              value={formData.email}
              onChange={handleChange}
              placeholder="이메일을 입력하세요"
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>비밀번호 *</label>
            <input
              type="password"
              name="password"
              className={styles.input}
              value={formData.password}
              onChange={handleChange}
              placeholder="비밀번호를 입력하세요"
              required
              minLength={6}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>권한</label>
            <div className={styles.checkboxGroup}>
              <input
                type="checkbox"
                name="isAdmin"
                className={styles.checkbox}
                checked={formData.isAdmin}
                onChange={handleChange}
              />
              <span>관리자 권한 부여</span>
            </div>
          </div>
        </div>
        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}
        <div className={styles.formActions}>
          <button
            type="button"
            className={`${styles.button} ${styles.secondary}`}
            onClick={() => {
              setFormData({
                email: '',
                password: '',
                isAdmin: false,
              });
              setError('');
              setSuccess('');
            }}
          >
            초기화
          </button>
          <button
            type="submit"
            className={`${styles.button} ${styles.primary}`}
            disabled={isSubmitting}
          >
            {isSubmitting ? '생성 중...' : '계정 생성'}
          </button>
        </div>
      </form>
    </div>
  );
}

