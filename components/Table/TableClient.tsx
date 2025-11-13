'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { TableData } from './Table';
import Pagination from '../Pagination/Pagination';
import styles from './Table.module.css';

const FIELDS_EDIT = [
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

interface TableClientProps {
  data: TableData[];
  isAdmin?: boolean;
  currentUserId?: string | null;
  currentUserName?: string | null;
  userRole?: string;
  userTeamId?: string | null;
}

export default function TableClient({
  data,
  isAdmin = false,
  currentUserId,
  currentUserName,
  userRole = 'member',
  userTeamId = null,
}: TableClientProps) {
  const router = useRouter();
  
  // 디버깅: 데이터에 created_at이 있는지 확인
  useEffect(() => {
    if (data.length > 0) {
      const sample = data[0];
      console.log('[TableClient] Sample record:', {
        id: sample.id,
        keyword: sample.keyword,
        hasCreatedAt: !!sample.created_at,
        created_at: sample.created_at,
      });
    }
  }, [data]);

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
  const [editingRecord, setEditingRecord] = useState<TableData | null>(null);
  const [editForm, setEditForm] = useState<Partial<TableData & { ranking: string | number; searchVolume: string | number }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isRefreshingRankings, setIsRefreshingRankings] = useState(false);

  const logRecordActivity = async (
    action: 'create' | 'update' | 'delete',
    record: TableData,
    metadata: Record<string, any> = {}
  ) => {
    try {
      const supabase = createClient();
      await supabase.from('record_activity_logs').insert({
        action,
        record_id: record.id,
        keyword: record.keyword,
        title: record.title,
        field: record.field,
        actor_id: currentUserId || null,
        actor_name: currentUserName || null,
        actor_role: userRole,
        metadata,
      });
    } catch (logError) {
      console.error('Failed to log record activity:', logError);
    }
  };

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

  const handleCheckboxChange = (record: TableData, checked: boolean) => {
    const recordKey = `${record.id}-${record.keyword}-${record.title}`;
    setSelectedRecords((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(recordKey);
      } else {
        newSet.delete(recordKey);
      }
      return newSet;
    });
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
      const isAuthor = currentUserName && record.author && 
        currentUserName.trim() === record.author.trim();
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
      if (!currentUserName || !record.author) {
        return false;
      }
      return currentUserName.trim() === record.author.trim();
    }
    
    // 기존 isAdmin 체크 (하위 호환성)
    if (isAdmin) {
      return true;
    }
    
    return false;
  };

  const handleEdit = (record: TableData) => {
    // 권한 체크
    if (!canModifyRecord(record)) {
      setError('이 항목을 수정할 권한이 없습니다. (자기 팀의 데이터 또는 자기 작성 데이터만 수정 가능)');
      return;
    }
    
    setEditingRecord(record);
    setEditForm(record);
    setError('');
    setSuccess('');
    // 수정 후 체크 해제
    const recordKey = `${record.id}-${record.keyword}-${record.title}`;
    setSelectedRecords((prev) => {
      const newSet = new Set(prev);
      newSet.delete(recordKey);
      return newSet;
    });
  };

  const handleDelete = async (record: TableData) => {
    // 권한 체크
    if (!canModifyRecord(record)) {
      setError('이 항목을 삭제할 권한이 없습니다. (자기 팀의 데이터 또는 자기 작성 데이터만 삭제 가능)');
      return;
    }

    if (!confirm(`"${record.title}" 기록을 정말 삭제하시겠습니까?`)) return;

    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from('blog_records')
        .delete()
        .eq('id', record.id)
        .eq('keyword', record.keyword)
        .eq('title', record.title);

      if (deleteError) throw deleteError;

      void logRecordActivity('delete', record, {
        specialNote: record.specialNote || null,
        searchVolume: record.searchVolume,
        ranking: record.ranking,
      });

      // 삭제 후 체크 해제
      const recordKey = `${record.id}-${record.keyword}-${record.title}`;
      setSelectedRecords((prev) => {
        const newSet = new Set(prev);
        newSet.delete(recordKey);
        return newSet;
      });

      setSuccess('삭제되었습니다.');
      setShowSuccessMessage(true);
      setTimeout(() => {
        setShowSuccessMessage(false);
        setSuccess('');
      }, 3000);

      router.refresh();
    } catch (err: any) {
      setError(err.message || '삭제 중 오류가 발생했습니다.');
      setShowSuccessMessage(false);
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
      const normalizeRequiredText = (
        input: string | number | null | undefined,
        fallback: string
      ) => {
        if (input === undefined || input === null) return fallback;
        const trimmed = String(input).trim();
        return trimmed.length > 0 ? trimmed : fallback;
      };

      const normalizeOptionalText = (
        input: string | null | undefined,
        fallback: string | null | undefined
      ) => {
        if (input === undefined) {
          return fallback ?? null;
        }
        if (input === null) {
          return null;
        }
        const trimmed = input.trim();
        return trimmed.length > 0 ? trimmed : null;
      };

      const parseNumberInput = (
        input: string | number | null | undefined,
        fallback: number | null | undefined
      ) => {
        if (input === undefined || input === null) {
          return fallback ?? null;
        }
        if (typeof input === 'string') {
          const trimmed = input.trim();
          if (trimmed === '') {
            return fallback ?? null;
          }
          const parsed = Number(trimmed);
          return Number.isFinite(parsed) ? parsed : fallback ?? null;
        }
        if (typeof input === 'number') {
          return Number.isFinite(input) ? input : fallback ?? null;
        }
        return fallback ?? null;
      };

      const normalizedValues: {
        field: string;
        keyword: string;
        ranking: number | null;
        searchVolume: number | null;
        title: string;
        link: string | null;
        author: string | null;
        specialNote: string | null;
      } = {
        field: normalizeRequiredText(editForm.field, editingRecord.field),
        keyword: normalizeRequiredText(editForm.keyword, editingRecord.keyword),
        ranking: parseNumberInput(editForm.ranking, editingRecord.ranking),
        searchVolume: parseNumberInput(editForm.searchVolume, editingRecord.searchVolume),
        title: normalizeRequiredText(editForm.title, editingRecord.title),
        link: normalizeOptionalText(editForm.link ?? null, editingRecord.link),
        author: normalizeOptionalText(editForm.author ?? null, editingRecord.author),
        specialNote: normalizeOptionalText(editForm.specialNote ?? null, editingRecord.specialNote),
      };

      const updatePayload = {
        field: normalizedValues.field,
        keyword: normalizedValues.keyword,
        ranking:
          normalizedValues.ranking === null || normalizedValues.ranking === undefined
            ? null
            : normalizedValues.ranking,
        search_volume:
          normalizedValues.searchVolume === null || normalizedValues.searchVolume === undefined
            ? null
            : normalizedValues.searchVolume,
        title: normalizedValues.title,
        link: normalizedValues.link ? String(normalizedValues.link) : null,
        author: normalizedValues.author ? String(normalizedValues.author) : null,
        special_note: normalizedValues.specialNote ? String(normalizedValues.specialNote) : null,
      };

      const { error: updateError } = await supabase
        .from('blog_records')
        .update(updatePayload)
        .eq('id', editingRecord.id)
        .eq('keyword', editingRecord.keyword)
        .eq('title', editingRecord.title);

      if (updateError) throw updateError;

      const sanitizeForChange = (value: any) => {
        if (value === undefined || value === null) return null;
        if (typeof value === 'string') {
          const trimmed = value.trim();
          return trimmed === '' ? null : trimmed;
        }
        return value;
      };

      const toComparable = (key: string, value: any) => {
        const sanitized = sanitizeForChange(value);
        if (sanitized === null) return null;
        if (key === 'ranking' || key === 'searchVolume') {
          const num = Number(sanitized);
          return Number.isNaN(num) ? null : num;
        }
        if (typeof sanitized === 'string') {
          return sanitized;
        }
        return sanitized;
      };

      const changes: Record<string, { before: any; after: any }> = {};

      Object.entries(normalizedValues).forEach(([key, value]) => {
        if (key === 'specialNote') {
          const before = sanitizeForChange((editingRecord as any).specialNote ?? null);
          const after = sanitizeForChange(value);
          if (toComparable(key, before) !== toComparable(key, after)) {
            changes.specialNote = {
              before,
              after,
            };
          }
          return;
        }

        const beforeValue = sanitizeForChange((editingRecord as any)[key]);
        const afterValue = sanitizeForChange(value);
        if (toComparable(key, beforeValue) !== toComparable(key, afterValue)) {
          (changes as any)[key] = {
            before: beforeValue ?? null,
            after: afterValue ?? null,
          };
        }
      });

      if (editingRecord && Object.keys(changes).length > 0) {
        void logRecordActivity('update', editingRecord, { changes });
      }

      setEditingRecord(null);
      setSuccess('수정되었습니다.');
      setShowSuccessMessage(true);
      setTimeout(() => {
        setShowSuccessMessage(false);
        setSuccess('');
      }, 3000);

      router.refresh();
    } catch (err: any) {
      setError(err.message || '수정 중 오류가 발생했습니다.');
      setShowSuccessMessage(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 랭킹 업데이트 함수 (수동 호출 가능)
  const updateRankings = useCallback(async () => {
      try {
        console.log('[blog-records] 랭킹 자동 업데이트 시작');
        
        // 모든 고유 ID 수집
        const ids = Array.from(
          new Set(
            data
              .map((item) => item.id?.trim().toLowerCase())
              .filter((value): value is string => !!value)
          )
        );

        if (ids.length === 0) {
          console.warn('[blog-records] 랭킹 업데이트할 아이디가 없습니다.');
          return;
        }

        console.log(`[blog-records] 총 ${ids.length}개 아이디의 랭킹 업데이트 시작`);

        // API 호출 (최대 200개씩 처리)
        const batchSize = 200;
        const batches = [];
        for (let i = 0; i < ids.length; i += batchSize) {
          batches.push(ids.slice(i, i + batchSize));
        }

        let totalUpdated = 0;
        let totalSuccess = 0;
        let totalFailed = 0;

        for (const batch of batches) {
          const params = new URLSearchParams();
          params.set('ids', batch.join(','));
          params.set('limit', String(batch.length));

          try {
            const response = await fetch(`/api/rankings/fetch?${params.toString()}`, {
              method: 'GET',
              cache: 'no-store', // 캐시 방지
            });

            const result = await response.json();

            if (!response.ok) {
              console.error('[blog-records] 랭킹 업데이트 실패:', result?.error || '알 수 없는 오류');
              totalFailed += batch.length;
              continue;
            }

            // API 응답에서 실제 업데이트된 항목 확인
            const updates = Array.isArray(result?.updated) ? result.updated : [];
            const successCount = updates.filter((u: any) => u.success && (u.ranking !== null || u.searchVolume !== null)).length;
            const rankingUpdated = updates.filter((u: any) => u.success && u.ranking !== null).length;
            const searchVolumeUpdated = updates.filter((u: any) => u.success && u.searchVolume !== null).length;

            totalUpdated += updates.length;
            totalSuccess += successCount;

            console.log(`[blog-records] 배치 업데이트 완료: ${batch.length}개 요청, ${successCount}개 성공 (랭킹: ${rankingUpdated}, 검색량: ${searchVolumeUpdated})`);
          } catch (batchError: any) {
            console.error(`[blog-records] 배치 처리 중 오류:`, batchError);
            totalFailed += batch.length;
          }
        }

        console.log(`[blog-records] 전체 업데이트 완료: 총 ${ids.length}개 중 ${totalSuccess}개 성공, ${totalFailed}개 실패`);

        // 업데이트가 성공한 경우에만 페이지 새로고침
        if (totalSuccess > 0) {
          console.log('[blog-records] 페이지 새로고침 시작...');
          // 약간의 지연 후 새로고침 (DB 업데이트가 완료될 시간 확보)
          await new Promise(resolve => setTimeout(resolve, 1000));
          router.refresh();
          console.log('[blog-records] 페이지 새로고침 완료');
        } else {
          console.warn('[blog-records] 업데이트된 항목이 없어 페이지 새로고침을 건너뜁니다.');
        }
      } catch (error: any) {
        console.error('[blog-records] 랭킹 자동 업데이트 중 오류:', error);
      } finally {
        setIsRefreshingRankings(false);
      }
    }, [data, router]);

  // 수동 랭킹 새로고침 핸들러
  const handleManualRefreshRankings = async () => {
    if (isRefreshingRankings) return;
    setIsRefreshingRankings(true);
    await updateRankings();
  };

  // 한국 시간(KST) 기준 매 정시마다 모든 기록의 랭킹 자동 업데이트
  useEffect(() => {
    if (data.length === 0) return;

    // 한국 시간(KST) 기준으로 다음 정시까지의 시간 계산
    const getTimeUntilNextHour = () => {
      const now = new Date();
      
      // KST 시간대(Asia/Seoul)의 현재 시간 정보 가져오기
      const kstFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      
      const kstParts = kstFormatter.formatToParts(now);
      const kstHour = parseInt(kstParts.find(p => p.type === 'hour')?.value || '0', 10);
      const kstMinute = parseInt(kstParts.find(p => p.type === 'minute')?.value || '0', 10);
      const kstSecond = parseInt(kstParts.find(p => p.type === 'second')?.value || '0', 10);
      
      // 현재 KST 시간에서 다음 정시까지의 밀리초 계산
      // 현재 분, 초, 밀리초를 제외한 나머지 시간을 계산
      const currentMsInHour = (kstMinute * 60 + kstSecond) * 1000 + now.getMilliseconds();
      const msUntilNextHour = (60 * 60 * 1000) - currentMsInHour;
      
      // 음수가 되면 안 되므로, 이미 정시를 지났다면 0 반환
      return Math.max(0, msUntilNextHour);
    };

    // 다음 정시까지 대기 후 실행
    const msUntilNextHour = getTimeUntilNextHour();
    console.log(`[blog-records] 다음 정시까지 ${Math.round(msUntilNextHour / 1000 / 60)}분 대기 후 랭킹 업데이트 시작`);
    
    let intervalId: NodeJS.Timeout | null = null;
    
    const timeoutId = setTimeout(() => {
      void updateRankings();
      // 그 다음부터 1시간마다 실행 (1시간 = 3600000ms)
      intervalId = setInterval(() => {
        void updateRankings();
      }, 3600000);
    }, msUntilNextHour);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [data.length, router, data]);

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
          <div className={styles.filterHeaderRight} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleManualRefreshRankings();
              }}
              disabled={isRefreshingRankings}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                backgroundColor: isRefreshingRankings ? '#e5e7eb' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isRefreshingRankings ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="모든 랭킹 수동 새로고침"
            >
              {isRefreshingRankings ? '⏳' : '🔄'} {isRefreshingRankings ? '업데이트 중...' : '랭킹 새로고침'}
            </button>
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

      {/* 선택된 항목에 대한 수정/삭제 버튼 */}
      {selectedRecords.size > 0 && (
        <div className={styles.selectedActions}>
          <div className={styles.selectedInfo}>
            {selectedRecords.size}개 항목 선택됨
          </div>
          <div className={styles.actionButtons}>
            {(() => {
              const selectedItems = paginatedData.filter(item => {
                const recordKey = `${item.id}-${item.keyword}-${item.title}`;
                return selectedRecords.has(recordKey);
              });
              
              // 선택된 항목 중 수정 가능한 항목만 필터링 (권한 체크)
              const editableItems = selectedItems.filter(item => canModifyRecord(item));

              if (editableItems.length === 0) return null;

              return (
                <>
                  {editableItems.length === 1 && (
                    <button
                      className={`${styles.actionButton} ${styles.editButton}`}
                      onClick={() => handleEdit(editableItems[0])}
                    >
                      수정
                    </button>
                  )}
                  <button
                    className={`${styles.actionButton} ${styles.deleteButton}`}
                    onClick={async () => {
                      if (!confirm(`선택한 ${editableItems.length}개 기록을 정말 삭제하시겠습니까?`)) return;

                      try {
                        const supabase = createClient();
                        for (const item of editableItems) {
                          const { error: deleteError } = await supabase
                            .from('blog_records')
                            .delete()
                            .eq('id', item.id)
                            .eq('keyword', item.keyword)
                            .eq('title', item.title);

                          if (deleteError) {
                            throw deleteError;
                          }

                          void logRecordActivity('delete', item, {
                            specialNote: item.specialNote || null,
                            searchVolume: item.searchVolume,
                            ranking: item.ranking,
                          });
                        }

                        // 선택 상태 초기화
                        setSelectedRecords(new Set());
                        
                        setSuccess(`${editableItems.length}개 기록이 삭제되었습니다.`);
                        setShowSuccessMessage(true);
                        setTimeout(() => {
                          setShowSuccessMessage(false);
                          setSuccess('');
                        }, 3000);

                        router.refresh();
                      } catch (err: any) {
                        setError(err.message || '삭제 중 오류가 발생했습니다.');
                        setShowSuccessMessage(false);
                      }
                    }}
                  >
                    삭제 ({editableItems.length})
                  </button>
                </>
              );
            })()}
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
                    checked={paginatedData.length > 0 && paginatedData.every(item => {
                      const key = `${item.id}-${item.keyword}-${item.title}`;
                      return selectedRecords.has(key);
                    })}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const allKeys = paginatedData.map(item => 
                          `${item.id}-${item.keyword}-${item.title}`
                        );
                        setSelectedRecords(new Set(allKeys));
                      } else {
                        setSelectedRecords(new Set());
                      }
                    }}
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
                <th>등록일</th>
                <th>특이사항</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {paginatedData.length > 0 ? (
                paginatedData.flatMap((item, index) => {
                  const recordKey = `${item.id}-${item.keyword}-${item.title}`;
                  const isChecked = selectedRecords.has(recordKey);
                  // 권한 체크 함수 사용
                  const canEdit = canModifyRecord(item);
                  
                  return (
                    <tr key={`${item.id}-${index}`}>
                      <td>
                        {canEdit && (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => handleCheckboxChange(item, e.target.checked)}
                          />
                        )}
                      </td>
                      <td className={styles.idCell}>{item.id}</td>
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
                        {item.created_at
                          ? new Date(item.created_at).toLocaleDateString('ko-KR', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                            })
                          : '등록일 없음'}
                      </td>
                      <td className={styles.specialNoteCell}>{item.specialNote || '-'}</td>
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
          pageSizeOptions={[10, 20, 50, 100]}
          showPageSizeSelector={true}
        />
      </div>

      {editingRecord && (
        <div className={styles.modal} onClick={() => setEditingRecord(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
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
                  {FIELDS_EDIT.map((field) => (
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

