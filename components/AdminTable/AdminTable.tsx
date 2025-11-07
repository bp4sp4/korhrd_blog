'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { TableData } from '../Table/Table';
import Pagination from '../Pagination/Pagination';
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
  '민간자격증',
];

interface AdminTableProps {
  initialData: TableData[];
  userRole?: string;
  userTeamId?: string | null;
  userName?: string | null;
}

export default function AdminTable({ initialData, userRole = 'member', userTeamId = null, userName = null }: AdminTableProps) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState({
    id: '',
    field: '전체',
    keyword: '',
    ranking: '',
    searchVolume: '',
    title: '',
    author: '',
    specialNote: '',
  });
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [editingRecord, setEditingRecord] = useState<TableData | null>(null);
  const [editForm, setEditForm] = useState<Partial<TableData & { ranking: string | number; searchVolume: string | number }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [itemsPerPage, setItemsPerPage] = useState(7);

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
      if (filters.specialNote && (!item.specialNote || !item.specialNote.toLowerCase().includes(filters.specialNote.toLowerCase()))) {
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
    setSelectedRecords(new Set()); // 필터 변경 시 선택 초기화
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
      specialNote: '',
    });
    setCurrentPage(1);
  };

  // 메달 이미지 반환 함수
  const getMedalImage = (ranking: number) => {
    if (ranking === 1) return '/goldmedal.png';
    if (ranking === 2) return '/silvermedal.png';
    if (ranking === 3) return '/bronzemedal.png';
    return null;
  };

  // 레코드 고유 키 생성
  const getRecordKey = (record: TableData) => {
    return `${record.id}-${record.keyword}-${record.title}`;
  };

  // 체크박스 선택/해제
  const handleToggleSelect = (record: TableData) => {
    const key = getRecordKey(record);
    setSelectedRecords((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // 전체 선택/해제
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const keys = new Set(paginatedData.map(getRecordKey));
      setSelectedRecords(keys);
    } else {
      setSelectedRecords(new Set());
    }
  };

  // 선택된 레코드 가져오기
  const getSelectedRecords = () => {
    return paginatedData.filter((record) => selectedRecords.has(getRecordKey(record)));
  };

  const handleEdit = () => {
    const selected = getSelectedRecords();
    if (selected.length !== 1) {
      setError('수정하려면 하나의 항목만 선택해주세요.');
      return;
    }
    const record = selected[0];
    
    // 권한 체크
    if (!canModifyRecord(record)) {
      setError('이 항목을 수정할 권한이 없습니다. (자기 팀의 데이터 또는 자기 작성 데이터만 수정 가능)');
      return;
    }
    
    setEditingRecord(record);
    setEditForm(record);
    setError('');
    setSuccess('');
  };

  // 권한 체크 함수
  const canModifyRecord = (record: TableData): boolean => {
    // super_admin은 모든 데이터 수정/삭제 가능
    if (userRole === 'super_admin') {
      return true;
    }
    
    // admin은 자기 팀의 데이터 또는 자기 작성 데이터 수정/삭제 가능
    if (userRole === 'admin') {
      // 자기 작성 데이터인지 확인
      const isAuthor = userName && record.author && 
        userName.trim() === record.author.trim();
      if (isAuthor) {
        return true;
      }
      // 자기 팀의 데이터인지 확인
      if (userTeamId && record.teamId) {
        return userTeamId === record.teamId;
      }
      return false;
    }
    
    // member는 자기 작성 데이터만 수정/삭제 가능
    if (userRole === 'member') {
      if (!userName || !record.author) {
        return false;
      }
      return userName.trim() === record.author.trim();
    }
    
    return false;
  };

  const handleDelete = async () => {
    const selected = getSelectedRecords();
    if (selected.length === 0) {
      setError('삭제할 항목을 선택해주세요.');
      return;
    }

    // 권한 체크: 삭제할 수 없는 항목 필터링
    const deletableRecords = selected.filter(canModifyRecord);
    const nonDeletableRecords = selected.filter(record => !canModifyRecord(record));

    if (nonDeletableRecords.length > 0) {
      setError(`${nonDeletableRecords.length}개의 항목은 삭제할 권한이 없습니다. (자기 팀의 데이터 또는 자기 작성 데이터만 삭제 가능)`);
      return;
    }

    if (deletableRecords.length === 0) {
      setError('삭제할 수 있는 항목이 없습니다.');
      return;
    }

    const confirmMessage = deletableRecords.length === 1
      ? `"${deletableRecords[0].title}" 기록을 정말 삭제하시겠습니까?`
      : `선택한 ${deletableRecords.length}개의 기록을 정말 삭제하시겠습니까?`;

    if (!confirm(confirmMessage)) return;

    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const supabase = createClient();
      
      // 권한이 있는 항목만 삭제
      for (const record of deletableRecords) {
        const { error: deleteError } = await supabase
          .from('blog_records')
          .delete()
          .eq('id', record.id)
          .eq('keyword', record.keyword)
          .eq('title', record.title);

        if (deleteError) throw deleteError;
      }

      // 로컬 상태 업데이트
      setData((prev) => prev.filter((item) => {
        const key = getRecordKey(item);
        return !selectedRecords.has(key);
      }));
      
      // 선택 초기화
      setSelectedRecords(new Set());
      
      setSuccess(`${deletableRecords.length}개의 기록이 삭제되었습니다.`);
      setShowSuccessMessage(true);
      setTimeout(() => {
        setShowSuccessMessage(false);
        setSuccess('');
      }, 3000);
      
      // 서버 데이터와 동기화
      router.refresh();
    } catch (err: any) {
      setError(err.message || '삭제 중 오류가 발생했습니다.');
      setShowSuccessMessage(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingRecord) return;

    // 권한 체크
    if (!canModifyRecord(editingRecord)) {
      setError('이 항목을 수정할 권한이 없습니다. (자기 팀의 데이터 또는 자기 작성 데이터만 수정 가능)');
      return;
    }

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
              link: editForm.link || null, // 링크는 선택사항
              author: editForm.author || null,
              special_note: editForm.specialNote || null,
            })
        .eq('id', editingRecord.id)
        .eq('keyword', editingRecord.keyword)
        .eq('title', editingRecord.title);

      if (updateError) throw updateError;

      // 로컬 상태 업데이트
      setData((prev) =>
        prev.map((item) =>
          item.id === editingRecord.id && 
          item.keyword === editingRecord.keyword && 
          item.title === editingRecord.title
            ? { ...item, ...editForm }
            : item
        )
      );
      
      setEditingRecord(null);
      setSelectedRecords(new Set());
      setSuccess('수정되었습니다.');
      setShowSuccessMessage(true);
      setTimeout(() => {
        setShowSuccessMessage(false);
        setSuccess('');
      }, 3000);
      
      // 서버 데이터와 동기화
      router.refresh();
    } catch (err: any) {
      setError(err.message || '수정 중 오류가 발생했습니다.');
      setShowSuccessMessage(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {(error || (showSuccessMessage && success)) && (
        <div className={`${styles.message} ${error ? styles.errorMessage : styles.successMessage}`}>
          {error || success}
        </div>
      )}
      
      <div className={styles.filterSection}>
        <div className={styles.filterHeader} onClick={() => setIsFilterOpen(!isFilterOpen)}>
          <div className={styles.filterHeaderLeft}>
            <Filter size={18} />
            <span className={styles.filterHeaderTitle}>필터</span>
            {Object.values(filters).some(v => v !== '' && v !== '전체') && (
              <span className={styles.filterBadge}>활성</span>
            )}
          </div>
          <div className={styles.filterHeaderRight}>
            <span className={styles.paginationInfo}>
              총 {filteredData.length}개 결과
            </span>
            {isFilterOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </div>
        
        {isFilterOpen && (
          <div className={styles.filterContent}>
            <div className={styles.filterGrid}>
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
              <div className={styles.filterGroup}>
                <label className={styles.filterLabel}>특이사항</label>
                <input
                  type="text"
                  className={styles.filterInput}
                  value={filters.specialNote}
                  onChange={(e) => handleFilterChange('specialNote', e.target.value)}
                  placeholder="특이사항 검색"
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
            </div>
          </div>
        )}
      </div>

      {/* 선택된 항목에 대한 액션 버튼 */}
      {selectedRecords.size > 0 && (
        <div className={styles.bulkActions}>
          <div className={styles.bulkActionsInfo}>
            {selectedRecords.size}개 항목 선택됨
          </div>
          <div className={styles.bulkActionsButtons}>
            <button
              className={`${styles.bulkActionButton} ${styles.editButton}`}
              onClick={handleEdit}
              disabled={selectedRecords.size !== 1 || isSubmitting}
            >
              수정
            </button>
            <button
              className={`${styles.bulkActionButton} ${styles.deleteButton}`}
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              삭제 ({selectedRecords.size})
            </button>
          </div>
        </div>
      )}

      <div className={styles.tableContainer}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={paginatedData.length > 0 && paginatedData.every((item) => selectedRecords.has(getRecordKey(item)))}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className={styles.checkbox}
                  />
                </th>
                <th>아이디</th>
                <th>분야</th>
                <th>키워드</th>
                <th>상위노출 순위</th>
                <th>검색량</th>
                <th>제목</th>
                <th>링크</th>
                <th>작성자</th>
                <th>특이사항</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {paginatedData.length > 0 ? (
                paginatedData.map((item, index) => {
                  const recordKey = getRecordKey(item);
                  const isSelected = selectedRecords.has(recordKey);
                  const canModify = canModifyRecord(item);
                  return (
                    <tr key={`${item.id}-${index}`} className={isSelected ? styles.selectedRow : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item)}
                          className={styles.checkbox}
                          disabled={!canModify}
                        />
                      </td>
                      <td>{item.id}</td>
                      <td>{item.field}</td>
                      <td>{item.keyword}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {getMedalImage(item.ranking) ? (
                            <img
                              src={getMedalImage(item.ranking) || ''}
                              alt={`${item.ranking}위 메달`}
                              style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                            />
                          ) : (
                            <span>
                              {item.ranking && item.ranking > 3 ? (
                                <span style={{ color: '#9ca3af' }}>미노출</span>
                              ) : item.ranking ? (
                                item.ranking
                              ) : (
                                <span style={{ color: '#9ca3af' }}>미노출</span>
                              )}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{item.searchVolume.toLocaleString()}</td>
                      <td>{item.title}</td>
                      <td>
                        {item.link ? (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.link}
                          >
                            {item.link}
                          </a>
                        ) : (
                          <span className={styles.noLink}>-</span>
                        )}
                      </td>
                      <td>{item.author}</td>
                      <td>{item.specialNote || '-'}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} className={styles.emptyState}>
                    <p>검색 결과가 없습니다.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={filteredData.length}
          pageSize={itemsPerPage}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setItemsPerPage(size);
            setCurrentPage(1);
          }}
          pageSizeOptions={[7, 10, 20, 50, 100]}
          showPageSizeSelector={true}
        />
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
            {error && !showSuccessMessage && <div className={styles.error}>{error}</div>}
            {success && showSuccessMessage && <div className={styles.success}>{success}</div>}
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
                  value={editForm.ranking?.toString() || ''}
                  onChange={(e) => setEditForm({ ...editForm, ranking: e.target.value ? parseInt(e.target.value) || 0 : 0 })}
                  min="1"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>검색량</label>
                <input
                  type="number"
                  className={styles.input}
                  value={editForm.searchVolume?.toString() || ''}
                  onChange={(e) => setEditForm({ ...editForm, searchVolume: e.target.value ? parseInt(e.target.value) || 0 : 0 })}
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
              <div className={styles.formGroup}>
                <label className={styles.label}>특이사항</label>
                <input
                  type="text"
                  className={styles.input}
                  value={editForm.specialNote || ''}
                  onChange={(e) => setEditForm({ ...editForm, specialNote: e.target.value })}
                  placeholder="특이사항을 입력하세요"
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

