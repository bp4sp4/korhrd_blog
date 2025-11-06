'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './AddRecordForm.module.css';

const FIELDS = [
  '사회복지사',
  '보육교사',
  '한국어교원',
  '평생교육사',
  '편입',
  '대학원',
  '대졸자전형',
  '일반과정',
  '산업기사/기사',
  '민간자격증',
];

interface AddRecordFormProps {
  onRecordAdded?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function AddRecordForm({ onRecordAdded, isOpen = false, onClose }: AddRecordFormProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    id: '',
    field: '사회복지사',
    keyword: '',
    ranking: '',
    searchVolume: '',
    title: '',
    link: '',
    author: '',
    specialNote: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 모달이 열릴 때 작성자 필드 초기화 (한글로 입력받음)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.id || !formData.keyword || !formData.title || !formData.link || !formData.author) {
      setError('필수 항목을 모두 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { error: insertError } = await supabase.from('blog_records').insert({
        id: formData.id,
        field: formData.field,
        keyword: formData.keyword,
        ranking: formData.ranking ? parseInt(formData.ranking) : null,
        search_volume: formData.searchVolume ? parseInt(formData.searchVolume) : null,
        title: formData.title,
        link: formData.link,
        author: formData.author || null,
        special_note: formData.specialNote || null,
      });

      if (insertError) throw insertError;

      // 작성자 이름을 localStorage에 저장 (본인이 작성한 기록 판별용)
      if (formData.author && typeof window !== 'undefined') {
        const stored = localStorage.getItem('myAuthorNames');
        let names: string[] = stored ? JSON.parse(stored) : [];
        if (!names.includes(formData.author)) {
          names.push(formData.author);
          localStorage.setItem('myAuthorNames', JSON.stringify(names));
        }
      }

      setSuccess('기록이 성공적으로 추가되었습니다.');
      setFormData({
        id: '',
        field: '사회복지사',
        keyword: '',
        ranking: '',
        searchVolume: '',
        title: '',
        link: '',
        author: '',
        specialNote: '',
      });

      router.refresh();
      
      // 2초 후 모달 닫기
      setTimeout(() => {
        if (onClose) {
          onClose();
        }
        setSuccess('');
      }, 2000);
      
      if (onRecordAdded) {
        onRecordAdded();
      }
    } catch (err: any) {
      setError(err.message || '기록 추가 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const handleClose = () => {
    setFormData({
      id: '',
      field: '사회복지사',
      keyword: '',
      ranking: '',
      searchVolume: '',
      title: '',
      link: '',
      author: '',
      specialNote: '',
    });
    setError('');
    setSuccess('');
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className={styles.modal} onClick={handleClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.formTitle}>새 기록 추가</h2>
          <button className={styles.closeButton} onClick={handleClose}>
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit}>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>아이디 *</label>
            <input
              type="text"
              name="id"
              className={styles.input}
              value={formData.id}
              onChange={handleChange}
              placeholder="아이디를 입력하세요"
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>분야 *</label>
            <select
              name="field"
              className={styles.select}
              value={formData.field}
              onChange={handleChange}
              required
            >
              {FIELDS.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>키워드 *</label>
            <input
              type="text"
              name="keyword"
              className={styles.input}
              value={formData.keyword}
              onChange={handleChange}
              placeholder="키워드를 입력하세요"
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>상위노출 순위</label>
            <input
              type="number"
              name="ranking"
              className={styles.input}
              value={formData.ranking}
              onChange={handleChange}
              placeholder="순위를 입력하세요"
              min="1"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>검색량</label>
            <input
              type="number"
              name="searchVolume"
              className={styles.input}
              value={formData.searchVolume}
              onChange={handleChange}
              placeholder="검색량을 입력하세요"
              min="0"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>제목 *</label>
            <input
              type="text"
              name="title"
              className={styles.input}
              value={formData.title}
              onChange={handleChange}
              placeholder="제목을 입력하세요"
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>링크 *</label>
            <input
              type="url"
              name="link"
              className={styles.input}
              value={formData.link}
              onChange={handleChange}
              placeholder="https://example.com"
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>작성자 *</label>
            <input
              type="text"
              name="author"
              className={styles.input}
              value={formData.author}
              onChange={handleChange}
              placeholder="작성자 이름을 한글로 입력하세요 (예: 홍길동)"
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>특이사항</label>
            <input
              type="text"
              name="specialNote"
              className={styles.input}
              value={formData.specialNote}
              onChange={handleChange}
              placeholder="특이사항을 입력하세요"
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
                id: '',
                field: '사회복지사',
                keyword: '',
                ranking: '',
                searchVolume: '',
                title: '',
                link: '',
                author: '',
                specialNote: '',
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
            {isSubmitting ? '추가 중...' : '등록하기'}
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}

