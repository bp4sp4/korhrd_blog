'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ChevronDown, ChevronUp, Filter, RefreshCw } from 'lucide-react';
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
  userId?: string | null;
  userRole?: string;
  userTeamId?: string | null;
  userName?: string | null;
}

export default function AdminTable({
  initialData,
  userId,
  userRole = 'member',
  userTeamId = null,
  userName = null,
}: AdminTableProps) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  
  // 디버깅: 초기 데이터에 created_at이 있는지 확인
  useEffect(() => {
    if (initialData.length > 0) {
      const sample = initialData[0];
      console.log('[AdminTable] Sample record:', {
        id: sample.id,
        keyword: sample.keyword,
        hasCreatedAt: !!sample.created_at,
        created_at: sample.created_at,
      });
    }
  }, [initialData]);
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
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [refreshingRecords, setRefreshingRecords] = useState<Set<string>>(new Set());
  const [isBulkRefreshing, setIsBulkRefreshing] = useState(false);
  const [refreshingSearchVolumes, setRefreshingSearchVolumes] = useState<Set<string>>(new Set());
  const [isBulkRefreshingSearchVolume, setIsBulkRefreshingSearchVolume] = useState(false);

  const showTemporarySuccess = (message: string) => {
    setSuccess(message);
    setShowSuccessMessage(true);
    window.setTimeout(() => {
      setShowSuccessMessage(false);
      setSuccess('');
    }, 3000);
  };

  const normalizeKeywordValue = (value: string) =>
    value ? value.replace(/\s+/g, ' ').trim().toLowerCase() : '';

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
        actor_id: userId || null,
        actor_name: userName || null,
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
    return `${record.id}-${record.keyword}`;
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

  const handleRefreshRanking = async (record: TableData) => {
    const key = getRecordKey(record);
    if (refreshingRecords.has(key)) {
      return;
    }

    setRefreshingRecords((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    setError('');

    try {
      const params = new URLSearchParams({
        id: record.id,
      });

      const response = await fetch(`/api/rankings/fetch?${params.toString()}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('순위 갱신 요청에 실패했습니다.');
      }

      const result = await response.json();

      const updatedEntry = Array.isArray(result?.updated)
        ? result.updated.find(
            (entry: any) =>
              entry &&
              entry.id === record.id &&
              typeof entry.keyword === 'string' &&
              normalizeKeywordValue(entry.keyword) === normalizeKeywordValue(record.keyword)
          )
        : null;

      const updatedRanking =
        updatedEntry && typeof updatedEntry.ranking === 'number'
          ? updatedEntry.ranking
          : null;
      
      const updatedSearchVolume =
        updatedEntry && updatedEntry.searchVolume !== null && updatedEntry.searchVolume !== undefined
          ? updatedEntry.searchVolume
          : null;

      let rankingLabel = '미노출';

      if (typeof updatedRanking === 'number' || updatedSearchVolume !== null) {
        setData((prev) =>
          prev.map((item) =>
            item.id === record.id &&
            normalizeKeywordValue(item.keyword) === normalizeKeywordValue(record.keyword)
              ? {
                  ...item,
                  ...(typeof updatedRanking === 'number' && { ranking: updatedRanking }),
                  ...(updatedSearchVolume !== null && { searchVolume: updatedSearchVolume }),
                }
              : item
          )
        );

        const messages = [];
        if (typeof updatedRanking === 'number') {
          rankingLabel =
            updatedRanking > 0 && updatedRanking <= 3 ? `${updatedRanking}위` : '미노출';
          messages.push(`순위가 ${rankingLabel}로`);
        }
        if (updatedSearchVolume !== null) {
          messages.push(`검색량이 ${updatedSearchVolume.toLocaleString()}건으로`);
        }
        
        showTemporarySuccess(`${record.keyword} ${messages.join(', ')} 갱신되었습니다.`);
      } else {
        showTemporarySuccess(`${record.keyword}는 스마트블록에서 확인되지 않았습니다 (미노출).`);
      }

      router.refresh();
    } catch (refreshError: any) {
      console.error('Failed to refresh ranking', refreshError);
      setError(refreshError?.message || '순위 갱신 중 오류가 발생했습니다.');
      setShowSuccessMessage(false);
    } finally {
      setRefreshingRecords((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // 검색량만 빠르게 갱신
  const handleRefreshSearchVolume = async (record: TableData) => {
    const key = getRecordKey(record);
    if (refreshingSearchVolumes.has(key)) {
      return;
    }

    setRefreshingSearchVolumes((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    setError('');

    try {
      const params = new URLSearchParams({
        id: record.id,
      });

      const response = await fetch(`/api/rankings/update-search-volume?${params.toString()}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('검색량 갱신 요청에 실패했습니다.');
      }

      const result = await response.json();

      const updatedEntry = Array.isArray(result?.updated)
        ? result.updated.find(
            (entry: any) =>
              entry &&
              entry.id === record.id &&
              typeof entry.keyword === 'string' &&
              normalizeKeywordValue(entry.keyword) === normalizeKeywordValue(record.keyword)
          )
        : null;

      const updatedSearchVolume =
        updatedEntry && updatedEntry.searchVolume !== null && updatedEntry.searchVolume !== undefined
          ? updatedEntry.searchVolume
          : null;

      if (updatedSearchVolume !== null) {
        setData((prev) =>
          prev.map((item) =>
            item.id === record.id &&
            normalizeKeywordValue(item.keyword) === normalizeKeywordValue(record.keyword)
              ? {
                  ...item,
                  searchVolume: updatedSearchVolume,
                }
              : item
          )
        );

        showTemporarySuccess(`${record.keyword}의 검색량이 ${updatedSearchVolume.toLocaleString()}건으로 갱신되었습니다.`);
      } else {
        showTemporarySuccess(`${record.keyword}의 검색량을 가져올 수 없습니다.`);
      }

      router.refresh();
    } catch (refreshError: any) {
      console.error('Failed to refresh search volume', refreshError);
      setError(refreshError?.message || '검색량 갱신 중 오류가 발생했습니다.');
      setShowSuccessMessage(false);
    } finally {
      setRefreshingSearchVolumes((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // 검색량 일괄 갱신
  const handleRefreshVisibleSearchVolumes = async () => {
    if (isBulkRefreshingSearchVolume) return;

    const ids = Array.from(
      new Set(
        paginatedData
          .map((item) => item.id?.trim().toLowerCase())
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
      )
    );

    if (ids.length === 0) {
      setError('현재 페이지에 검색량을 갱신할 아이디가 없습니다.');
      setShowSuccessMessage(false);
      return;
    }

    const confirmMessage =
      ids.length === 1
        ? `"${ids[0]}" 아이디의 검색량을 갱신할까요?`
        : `현재 페이지의 ${ids.length}개 아이디 검색량을 모두 갱신할까요?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsBulkRefreshingSearchVolume(true);
    setError('');
    setShowSuccessMessage(false);

    try {
      const params = new URLSearchParams();
      params.set('ids', ids.join(','));
      params.set('limit', String(Math.min(200, paginatedData.length)));

      const response = await fetch(`/api/rankings/update-search-volume?${params.toString()}`, {
        method: 'GET',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || '검색량 갱신 요청에 실패했습니다.');
      }

      const updates = Array.isArray(result?.updated) ? result.updated : [];
      const updateMap = new Map<string, any>();

      updates.forEach((entry: any) => {
        if (!entry || !entry.id || !entry.keyword) return;
        const key = `${entry.id.toLowerCase()}__${normalizeKeywordValue(entry.keyword)}`;
        updateMap.set(key, entry);
      });

      let searchVolumeCount = 0;

      setData((prev) =>
        prev.map((item) => {
          const key = `${item.id.toLowerCase()}__${normalizeKeywordValue(item.keyword)}`;
          const update = updateMap.get(key);
          if (update && update.searchVolume !== null && update.searchVolume !== undefined) {
            searchVolumeCount += 1;
            return {
              ...item,
              searchVolume: update.searchVolume,
            };
          }
          return item;
        })
      );

      if (searchVolumeCount > 0) {
        showTemporarySuccess(`현재 페이지에서 ${searchVolumeCount}개 항목의 검색량을 갱신했습니다.`);
      } else {
        showTemporarySuccess('현재 페이지에 검색량을 갱신할 항목이 없습니다.');
      }

      router.refresh();
    } catch (bulkError: any) {
      console.error('Failed to refresh visible search volumes', bulkError);
      setError(bulkError?.message || '검색량 일괄 갱신 중 오류가 발생했습니다.');
      setShowSuccessMessage(false);
    } finally {
      setIsBulkRefreshingSearchVolume(false);
    }
  };

  const handleRefreshVisibleRankings = async () => {
    if (isBulkRefreshing) return;

    const ids = Array.from(
      new Set(
        paginatedData
          .map((item) => item.id?.trim().toLowerCase())
          .filter((value): value is string => !!value)
      )
    );

    if (ids.length === 0) {
      setError('현재 페이지에 순위를 갱신할 아이디가 없습니다.');
      setShowSuccessMessage(false);
      return;
    }

    const confirmMessage =
      ids.length === 1
        ? `"${ids[0]}" 아이디의 순위를 갱신할까요?`
        : `현재 페이지의 ${ids.length}개 아이디 순위를 모두 갱신할까요?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsBulkRefreshing(true);
    setError('');
    setShowSuccessMessage(false);

    try {
      const params = new URLSearchParams();
      params.set('ids', ids.join(','));
      params.set('limit', String(Math.min(200, paginatedData.length)));

      const response = await fetch(`/api/rankings/fetch?${params.toString()}`, {
        method: 'GET',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || '순위 갱신 요청에 실패했습니다.');
      }

      const updates = Array.isArray(result?.updated) ? result.updated : [];
      const updateMap = new Map<string, any>();

      updates.forEach((entry: any) => {
        if (!entry || !entry.id || !entry.keyword) return;
        const key = `${entry.id.toLowerCase()}__${normalizeKeywordValue(entry.keyword)}`;
        updateMap.set(key, entry);
      });

      let successCount = 0;
      let searchVolumeCount = 0;

      setData((prev) =>
        prev.map((item) => {
          const key = `${item.id.toLowerCase()}__${normalizeKeywordValue(item.keyword)}`;
          const update = updateMap.get(key);
          if (update) {
            const updatedItem: any = { ...item };
            if (typeof update.ranking === 'number') {
              successCount += 1;
              updatedItem.ranking = update.ranking;
            }
            // 검색량도 업데이트
            if (update.searchVolume !== null && update.searchVolume !== undefined) {
              searchVolumeCount += 1;
              updatedItem.searchVolume = update.searchVolume;
            }
            return updatedItem;
          }
          return item;
        })
      );

      if (successCount > 0 || searchVolumeCount > 0) {
        const messages = [];
        if (successCount > 0) {
          messages.push(`${successCount}개 항목의 순위`);
        }
        if (searchVolumeCount > 0) {
          messages.push(`${searchVolumeCount}개 항목의 검색량`);
        }
        showTemporarySuccess(`현재 페이지에서 ${messages.join('과 ')}를 갱신했습니다.`);
      } else {
        showTemporarySuccess('현재 페이지에 갱신할 항목이 없습니다 (미노출).');
      }

      router.refresh();
    } catch (bulkError: any) {
      console.error('Failed to refresh visible rankings', bulkError);
      setError(bulkError?.message || '순위 일괄 갱신 중 오류가 발생했습니다.');
      setShowSuccessMessage(false);
    } finally {
      setIsBulkRefreshing(false);
    }
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
    // owner는 모든 데이터 수정/삭제 가능
    if (userRole === 'owner') {
      return true;
    }
    
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

        await logRecordActivity('delete', record, {
          specialNote: record.specialNote || null,
          searchVolume: record.searchVolume,
          ranking: record.ranking,
        });
      }

      // 로컬 상태 업데이트
      setData((prev) => prev.filter((item) => {
        const key = getRecordKey(item);
        return !selectedRecords.has(key);
      }));
      
      // 선택 초기화
      setSelectedRecords(new Set());
      
      showTemporarySuccess(`${deletableRecords.length}개의 기록이 삭제되었습니다.`);
      
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

      const changes: Record<
        string,
        { before: any; after: any }
      > = {};

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

      const updatedRecordForState: Partial<TableData> = {
        field: normalizedValues.field,
        keyword: normalizedValues.keyword,
        ranking: normalizedValues.ranking ?? editingRecord.ranking ?? 0,
        searchVolume: normalizedValues.searchVolume ?? editingRecord.searchVolume ?? 0,
        title: normalizedValues.title,
        link: normalizedValues.link !== null ? normalizedValues.link : undefined,
        author: normalizedValues.author !== null ? normalizedValues.author : undefined,
        specialNote: normalizedValues.specialNote !== null ? normalizedValues.specialNote : undefined,
      };

      // 로컬 상태 업데이트
      setData((prev) =>
        prev.map((item) =>
          item.id === editingRecord.id && 
          item.keyword === editingRecord.keyword && 
          item.title === editingRecord.title
            ? { ...item, ...updatedRecordForState }
            : item
        )
      );

      if (Object.keys(changes).length > 0) {
        await logRecordActivity('update', editingRecord, { changes });
      }
      
      setEditingRecord(null);
      setSelectedRecords(new Set());
      showTemporarySuccess('수정되었습니다.');
      
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
            <div className={styles.globalRefreshWrapper} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className={styles.globalRefreshIconButton}
                  onClick={handleRefreshVisibleRankings}
                  disabled={isBulkRefreshing}
                  aria-label="현재 페이지 순위 일괄 갱신"
                  title={isBulkRefreshing ? '순위 갱신 중...' : '현재 페이지 순위를 한 번에 갱신'}
                >
                  <RefreshCw
                    size={18}
                    className={isBulkRefreshing ? styles.iconSpinning : undefined}
                  />
                </button>
                <button
                  type="button"
                  className={styles.globalRefreshIconButton}
                  onClick={handleRefreshVisibleSearchVolumes}
                  disabled={isBulkRefreshingSearchVolume}
                  aria-label="현재 페이지 검색량 일괄 갱신"
                  title={isBulkRefreshingSearchVolume ? '검색량 갱신 중...' : '현재 페이지 검색량을 한 번에 갱신'}
                  style={{ color: '#0369a1' }}
                >
                  <RefreshCw
                    size={18}
                    className={isBulkRefreshingSearchVolume ? styles.iconSpinning : undefined}
                  />
                </button>
              </div>
            </div>
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
                <th>순위 새로고침</th>
                <th>검색량</th>
                <th>제목</th>
                <th>링크</th>
                <th>작성자</th>
                <th>특이사항</th>
                <th>등록일</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {paginatedData.length > 0 ? (
                paginatedData.map((item, index) => {
                  const recordKey = getRecordKey(item);
                  const isSelected = selectedRecords.has(recordKey);
                  const isRefreshing = refreshingRecords.has(recordKey);
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
                      <td className={styles.idCell}>{item.id}</td>
                      <td>{item.field}</td>
                      <td>{item.keyword}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                          <button
                            className={styles.refreshButton}
                            onClick={() => handleRefreshRanking(item)}
                            disabled={!canModify || isSubmitting || refreshingRecords.has(getRecordKey(item))}
                            title="순위 새로고침"
                            style={{ fontSize: '12px', padding: '4px 8px', minWidth: '28px', height: '24px' }}
                          >
                            {refreshingRecords.has(getRecordKey(item)) ? '⏳' : '🔄'}
                          </button>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexDirection: 'column' }}>
                          <button
                            className={styles.refreshButton}
                            onClick={() => handleRefreshRanking(item)}
                            disabled={!canModify || isSubmitting || refreshingRecords.has(getRecordKey(item))}
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                          >
                            {refreshingRecords.has(getRecordKey(item)) ? '갱신 중...' : '랭킹'}
                          </button>
                          <button
                            className={styles.refreshButton}
                            onClick={() => handleRefreshSearchVolume(item)}
                            disabled={!canModify || isSubmitting || refreshingSearchVolumes.has(getRecordKey(item))}
                            style={{ fontSize: '12px', padding: '4px 8px', backgroundColor: '#f0f9ff', color: '#0369a1' }}
                          >
                            {refreshingSearchVolumes.has(getRecordKey(item)) ? '조회 중...' : '검색량'}
                          </button>
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
                      <td className={styles.specialNoteCell}>{item.specialNote || '-'}</td>
                      <td>
                        {item.created_at
                          ? new Date(item.created_at).toLocaleDateString('ko-KR', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                            })
                          : '-'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={13} className={styles.emptyState}>
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

