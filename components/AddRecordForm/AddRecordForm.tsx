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
  currentUserId?: string | null;
  currentUserName?: string | null;
  userRole?: string | null;
}

const getInitialFormData = (author: string) => ({
  id: '',
  field: '사회복지사',
  keyword: '',
  ranking: '',
  title: '',
  link: '',
  specialNote: '',
  author,
});

export default function AddRecordForm({
  onRecordAdded,
  isOpen = false,
  onClose,
  currentUserId,
  currentUserName,
  userRole = 'member',
}: AddRecordFormProps) {
  const router = useRouter();
  const canEditAuthor = userRole === 'admin' || userRole === 'super_admin';
  const defaultAuthor = canEditAuthor ? (currentUserName || '') : (currentUserName || '');
  const [formData, setFormData] = useState(() => getInitialFormData(defaultAuthor));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isFetchingSearchVolume, setIsFetchingSearchVolume] = useState(false);
  const [autoSearchVolume, setAutoSearchVolume] = useState<number | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError('');
    setSuccess('');
  };

  // 키워드가 변경되면 검색량 자동 가져오기 (입력과 동시에)
  useEffect(() => {
    const keyword = formData.keyword.trim();
    if (!keyword || keyword.length < 2) {
      setIsFetchingSearchVolume(false);
      setAutoSearchVolume(null);
      return;
    }

    // 디바운싱: 300ms 후에 검색량 가져오기 (더 빠르게)
    const timeoutId = setTimeout(async () => {
      setIsFetchingSearchVolume(true);
      try {
        const response = await fetch('/api/keywords/test-search-count', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ keyword }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.search_count?.total && data.search_count.total > 0) {
            setAutoSearchVolume(data.search_count.total);
          } else {
            setAutoSearchVolume(null);
          }
        } else {
          setAutoSearchVolume(null);
        }
      } catch (err) {
        console.warn('검색량 자동 가져오기 실패:', err);
      } finally {
        setIsFetchingSearchVolume(false);
      }
    }, 300); // 1초에서 300ms로 단축

    return () => clearTimeout(timeoutId);
  }, [formData.keyword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const authorValue = canEditAuthor ? formData.author.trim() : (currentUserName || '').trim();

    if (!formData.id || !formData.keyword || !formData.title || !authorValue) {
      setError('필수 항목을 모두 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 키워드로 검색량 가져오기 (이미 가져온 값이 있으면 사용, 없으면 새로 가져오기)
      let searchVolume: number | null = autoSearchVolume;
      
      if (searchVolume === null) {
        try {
          const searchResponse = await fetch('/api/keywords/test-search-count', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ keyword: formData.keyword }),
          });

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            if (searchData.search_count?.total && searchData.search_count.total > 0) {
              searchVolume = searchData.search_count.total;
            }
          }
        } catch (searchErr) {
          console.warn('검색량 가져오기 실패:', searchErr);
          // 검색량 가져오기 실패해도 기록은 저장
        }
      }

      const supabase = createClient();
      const { error: insertError } = await supabase.from('blog_records').insert({
        id: formData.id,
        field: formData.field,
        keyword: formData.keyword,
        ranking: formData.ranking ? parseInt(formData.ranking) : null,
        search_volume: searchVolume,
        title: formData.title,
        link: formData.link || null, // 링크는 선택사항
        author: authorValue || null,
        special_note: formData.specialNote || null,
      });

      if (insertError) {
        if (insertError.code === '23505') {
          setError('이미 동일한 기록이 존재합니다. 아이디/키워드/제목을 확인해주세요.');
          return;
        }
        throw insertError;
      }

      const metadata = {
        ranking: formData.ranking ? Number(formData.ranking) : null,
        searchVolume: searchVolume,
        link: formData.link || null,
        specialNote: formData.specialNote || null,
      };

      const logPayload = {
        action: 'create',
        record_id: formData.id,
        keyword: formData.keyword,
        title: formData.title,
        field: formData.field,
        actor_id: currentUserId || null,
        actor_name: currentUserName || authorValue || null,
        actor_role: userRole,
        metadata,
      };

      const { error: logError } = await supabase
        .from('record_activity_logs')
        .insert(logPayload);

      if (logError) {
        console.error('Failed to log record activity:', logError);
      }

      setSuccess('기록이 성공적으로 추가되었습니다.');
      setFormData(getInitialFormData(canEditAuthor ? '' : authorValue));
      setAutoSearchVolume(null);
      setIsFetchingSearchVolume(false);

      router.refresh();
      
      // 즉시 모달 닫기
      if (onClose) {
        onClose();
      }
      
      if (onRecordAdded) {
        onRecordAdded();
      }
      
      // 성공 메시지는 잠시 후 초기화 (화면에는 표시되지 않지만 상태 정리)
      setTimeout(() => {
        setSuccess('');
      }, 100);
    } catch (err: any) {
      setError(err.message || '기록 추가 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    if (canEditAuthor && !formData.author && currentUserName) {
      setFormData((prev) => ({ ...prev, author: currentUserName }));
      return;
    }

    if (!canEditAuthor && formData.author !== (currentUserName || '')) {
      setFormData((prev) => ({ ...prev, author: currentUserName || '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentUserName, canEditAuthor]);

  if (!isOpen) return null;

  const handleClose = () => {
    setFormData(getInitialFormData(canEditAuthor ? '' : (currentUserName || '')));
    setError('');
    setSuccess('');
    setAutoSearchVolume(null);
    setIsFetchingSearchVolume(false);
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className={styles.modal}>
      <div
        className={styles.modalContent}
        onClick={(e) => e.stopPropagation()}
      >
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
          {(isFetchingSearchVolume || autoSearchVolume !== null) && (
            <div className={styles.formGroup}>
              <label className={styles.label}>검색량</label>
              <div className={styles.input} style={{ color: '#6b7280', fontStyle: 'italic' }}>
                {isFetchingSearchVolume ? '검색량 조회 중...' : autoSearchVolume !== null ? `${autoSearchVolume.toLocaleString()}건 (자동 조회)` : '검색량 없음'}
              </div>
            </div>
          )}
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
            <label className={styles.label}>작성자 *</label>
            {canEditAuthor ? (
              <input
                type="text"
                name="author"
                className={styles.input}
                value={formData.author}
                onChange={handleChange}
                placeholder="작성자 이름을 입력하세요"
                required
              />
            ) : (
              <input
                type="text"
                className={styles.input}
                value={currentUserName || ''}
                readOnly
                disabled
              />
            )}
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>링크</label>
            <input
              type="url"
              name="link"
              className={styles.input}
              value={formData.link}
              onChange={handleChange}
              placeholder="https://example.com (선택사항)"
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
              setFormData(getInitialFormData(canEditAuthor ? '' : (currentUserName || '')));
              setError('');
              setSuccess('');
              setAutoSearchVolume(null);
              setIsFetchingSearchVolume(false);
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

