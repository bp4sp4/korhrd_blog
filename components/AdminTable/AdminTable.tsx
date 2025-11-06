'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TableData } from '../Table/Table';
import styles from './AdminTable.module.css';

const FIELDS = [
  '전체',
  '사회복지사',
  '보육교사',
  '한국어교원',
  '평생교육사',
  '편입',
  '대학원',
  '대졸자전형',
  '일반과정',
  '산업기사/기사',
];

interface AdminTableProps {
  initialData: TableData[];
}

export default function AdminTable({ initialData }: AdminTableProps) {
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState({
    id: '',
    field: '전체',
    keyword: '',
    ranking: '',
    searchVolume: '',
    title: '',
    author: '',
  });
  const [editingRecord, setEditingRecord] = useState<TableData | null>(null);
  const [editForm, setEditForm] = useState<Partial<TableData>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const filteredData = useMemo(() => {
    return data.filter((item) => {
      if (filters.id && !item.id.toLowerCase().includes(filters.id.toLowerCase())) {
        return false;
      }
      if (filters.field !== '전체' && item.field !== filters.field) {
        return false;
      }
      if (filters.keyword && !item.keyword.toLowerCase().includes(filters.keyword.toLowerCase())) {
        return false;
      }
      if (filters.ranking && item.ranking !== Number(filters.ranking)) {
        return false;
      }
      if (filters.searchVolume && item.searchVolume < Number(filters.searchVolume)) {
        return false;
      }
      if (filters.title && !item.title.toLowerCase().includes(filters.title.toLowerCase())) {
        return false;
      }
      if (filters.author && !item.author.toLowerCase().includes(filters.author.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [data, filters]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFilters({
      id: '',
      field: '전체',
      keyword: '',
      ranking: '',
      searchVolume: '',
      title: '',
      author: '',
    });
    setCurrentPage(1);
  };

  const handleEdit = (record: TableData) => {
    setEditingRecord(record);
    setEditForm(record);
    setError('');
    setSuccess('');
  };

  const handleDelete = async (record: TableData) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from('blog_records')
        .delete()
        .eq('id', record.id)
        .eq('keyword', record.keyword)
        .eq('title', record.title);

      if (deleteError) throw deleteError;

      setData((prev) => prev.filter((item) => item !== record));
      setSuccess('삭제되었습니다.');
    } catch (err: any) {
      setError(err.message || '삭제 중 오류가 발생했습니다.');
    }
  };

  const handleUpdate = async () => {
    if (!editingRecord) return;

    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('blog_records')
        .update({
          field: editForm.field,
          keyword: editForm.keyword,
          ranking: editForm.ranking ? parseInt(String(editForm.ranking)) : null,
          search_volume: editForm.searchVolume ? parseInt(String(editForm.searchVolume)) : null,
          title: editForm.title,
          link: editForm.link,
          author: editForm.author || null,
        })
        .eq('id', editingRecord.id)
        .eq('keyword', editingRecord.keyword)
        .eq('title', editingRecord.title);

      if (updateError) throw updateError;

      setData((prev) =>
        prev.map((item) =>
          item === editingRecord ? { ...editingRecord, ...editForm } : item
        )
      );
      setEditingRecord(null);
      setSuccess('수정되었습니다.');
    } catch (err: any) {
      setError(err.message || '수정 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className={styles.filterSection}>
        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>아이디</label>
            <input
              type="text"
              className={styles.filterInput}
              value={filters.id}
              onChange={(e) => handleFilterChange('id', e.target.value)}
              placeholder="아이디 검색"
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>분야</label>
            <select
              className={styles.filterSelect}
              value={filters.field}
              onChange={(e) => handleFilterChange('field', e.target.value)}
            >
              {FIELDS.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>키워드</label>
            <input
              type="text"
              className={styles.filterInput}
              value={filters.keyword}
              onChange={(e) => handleFilterChange('keyword', e.target.value)}
              placeholder="키워드 검색"
            />
          </div>
        </div>
        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>상위노출 순위</label>
            <input
              type="number"
              className={styles.filterInput}
              value={filters.ranking}
              onChange={(e) => handleFilterChange('ranking', e.target.value)}
              placeholder="순위"
              min="1"
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>검색량 (이상)</label>
            <input
              type="number"
              className={styles.filterInput}
              value={filters.searchVolume}
              onChange={(e) => handleFilterChange('searchVolume', e.target.value)}
              placeholder="최소 검색량"
              min="0"
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>제목</label>
            <input
              type="text"
              className={styles.filterInput}
              value={filters.title}
              onChange={(e) => handleFilterChange('title', e.target.value)}
              placeholder="제목 검색"
            />
          </div>
        </div>
        <div className={styles.filterRow}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>작성자</label>
            <input
              type="text"
              className={styles.filterInput}
              value={filters.author}
              onChange={(e) => handleFilterChange('author', e.target.value)}
              placeholder="작성자 검색"
            />
          </div>
        </div>
        <div className={styles.filterActions}>
          <button
            className={`${styles.filterButton} ${styles.secondary}`}
            onClick={handleResetFilters}
          >
            필터 초기화
          </button>
          <div style={{ flex: 1 }} />
          <span className={styles.paginationInfo}>
            총 {filteredData.length}개 결과
          </span>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th>아이디</th>
                <th>분야</th>
                <th>키워드</th>
                <th>상위노출 순위</th>
                <th>검색량</th>
                <th>제목</th>
                <th>링크</th>
                <th>작성자</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {paginatedData.length > 0 ? (
                paginatedData.map((item, index) => (
                  <tr key={`${item.id}-${index}`}>
                    <td>{item.id}</td>
                    <td>{item.field}</td>
                    <td>{item.keyword}</td>
                    <td>{item.ranking}</td>
                    <td>{item.searchVolume.toLocaleString()}</td>
                    <td>{item.title}</td>
                    <td>
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.link}
                      >
                        {item.link}
                      </a>
                    </td>
                    <td>{item.author}</td>
                    <td>
                      <div className={styles.actionButtons}>
                        <button
                          className={`${styles.actionButton} ${styles.editButton}`}
                          onClick={() => handleEdit(item)}
                        >
                          수정
                        </button>
                        <button
                          className={`${styles.actionButton} ${styles.deleteButton}`}
                          onClick={() => handleDelete(item)}
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className={styles.emptyState}>
                    <p>검색 결과가 없습니다.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingRecord && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>기록 수정</h3>
              <button
                className={styles.closeButton}
                onClick={() => {
                  setEditingRecord(null);
                  setError('');
                  setSuccess('');
                }}
              >
                ×
              </button>
            </div>
            {error && <div className={styles.error}>{error}</div>}
            {success && <div className={styles.success}>{success}</div>}
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>아이디</label>
                <input
                  type="text"
                  className={styles.input}
                  value={editForm.id || ''}
                  disabled
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>분야</label>
                <select
                  className={styles.select}
                  value={editForm.field || ''}
                  onChange={(e) => setEditForm({ ...editForm, field: e.target.value })}
                >
                  {FIELDS.filter((f) => f !== '전체').map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>키워드</label>
                <input
                  type="text"
                  className={styles.input}
                  value={editForm.keyword || ''}
                  onChange={(e) => setEditForm({ ...editForm, keyword: e.target.value })}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>상위노출 순위</label>
                <input
                  type="number"
                  className={styles.input}
                  value={editForm.ranking || ''}
                  onChange={(e) => setEditForm({ ...editForm, ranking: e.target.value })}
                  min="1"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>검색량</label>
                <input
                  type="number"
                  className={styles.input}
                  value={editForm.searchVolume || ''}
                  onChange={(e) => setEditForm({ ...editForm, searchVolume: e.target.value })}
                  min="0"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>제목</label>
                <input
                  type="text"
                  className={styles.input}
                  value={editForm.title || ''}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>링크</label>
                <input
                  type="url"
                  className={styles.input}
                  value={editForm.link || ''}
                  onChange={(e) => setEditForm({ ...editForm, link: e.target.value })}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>작성자</label>
                <input
                  type="text"
                  className={styles.input}
                  value={editForm.author || ''}
                  onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
                />
              </div>
            </div>
            <div className={styles.modalActions}>
              <button
                className={`${styles.button} ${styles.secondary}`}
                onClick={() => {
                  setEditingRecord(null);
                  setError('');
                  setSuccess('');
                }}
              >
                취소
              </button>
              <button
                className={`${styles.button} ${styles.primary}`}
                onClick={handleUpdate}
                disabled={isSubmitting}
              >
                {isSubmitting ? '수정 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

