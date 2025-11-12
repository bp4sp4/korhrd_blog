'use client';

import { useState } from 'react';
import styles from './CreateGroupForm.module.css';

export default function CreateGroupForm() {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name) {
      setError('그룹 이름을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/admin/create-group', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '그룹 생성 중 오류가 발생했습니다.');
      }

      setSuccess('그룹이 성공적으로 생성되었습니다.');
      setFormData({
        name: '',
        description: '',
      });
      
      // 페이지 새로고침하여 그룹 목록 업데이트
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      setError(err.message || '그룹 생성 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.createGroupForm}>
      <h2 className={styles.formTitle}>그룹 생성</h2>
      <form onSubmit={handleSubmit}>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>그룹 이름 *</label>
            <input
              type="text"
              name="name"
              className={styles.input}
              value={formData.name}
              onChange={handleChange}
              placeholder="그룹 이름을 입력하세요"
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>설명</label>
            <textarea
              name="description"
              className={styles.textarea}
              value={formData.description}
              onChange={handleChange}
              placeholder="그룹에 대한 설명을 입력하세요 (선택사항)"
              rows={3}
            />
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
                name: '',
                description: '',
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
            {isSubmitting ? '생성 중...' : '그룹 생성'}
          </button>
        </div>
      </form>
    </div>
  );
}

