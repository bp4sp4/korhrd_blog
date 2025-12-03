'use client';

import { useCallback, useEffect, useState } from 'react';
import Pagination from '../Pagination/Pagination';
import styles from './RecordActivityLog.module.css';

type RecordAction = 'create' | 'update' | 'delete' | string;

type ChangeDetail = {
  before: any;
  after: any;
};

interface RecordActivityMetadata {
  ranking?: number | string | null;
  searchVolume?: number | string | null;
  specialNote?: string | null;
  link?: string | null;
  changes?: Record<string, ChangeDetail>;
  [key: string]: any;
}

interface RecordActivityLogEntry {
  id: string;
  action: RecordAction;
  record_id: string | null;
  keyword: string | null;
  title: string | null;
  field: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  metadata: RecordActivityMetadata | null;
  created_at: string;
}

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface CrawlerStats {
  recent: Array<{
    id: string;
    startedAt: string | null;
    completedAt: string;
    duration: number | null;
    durationFormatted: string | null;
    totalRecords: number;
    processed: number;
    success: number;
    rankingUpdated: number;
    searchVolumeUpdated: number;
    totalTimeSeconds: number | null;
  }>;
  summary: {
    last24Hours: {
      totalRuns: number;
      totalProcessed: number;
      totalSuccess: number;
      totalRankingUpdated: number;
      totalSearchVolumeUpdated: number;
      totalDuration: number;
    };
  };
}

export default function RecordActivityLog() {
  const [logs, setLogs] = useState<RecordActivityLogEntry[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [crawlerStats, setCrawlerStats] = useState<CrawlerStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const ACTION_LABELS: Record<string, string> = {
    create: '신규 등록',
    update: '수정',
    delete: '삭제',
  };

  const ACTION_DESCRIPTIONS: Record<string, string> = {
    create: '새 블로그 기록을 등록했습니다.',
    update: '블로그 기록을 수정했습니다.',
    delete: '블로그 기록을 삭제했습니다.',
  };

  const ROLE_LABELS: Record<string, string> = {
    super_admin: '최고 관리자',
    admin: '관리자',
    member: '팀원',
  };

  const FIELD_LABELS: Record<string, string> = {
    id: '아이디',
    record_id: '기록 ID',
    recordId: '기록 ID',
    field: '분야',
    keyword: '키워드',
    ranking: '상위노출 순위',
    searchVolume: '검색량',
    search_volume: '검색량',
    title: '제목',
    link: '링크',
    author: '작성자',
    specialNote: '특이사항',
    special_note: '특이사항',
    teamId: '팀 ID',
    team_id: '팀 ID',
    contact: '연락처',
  };

  const formatAction = (action: RecordAction) => {
    if (!action) return '기타';
    const lower = action.toLowerCase();
    return ACTION_LABELS[lower] || action.toUpperCase();
  };

  const formatActionDescription = (action: RecordAction) => {
    if (!action) return '알 수 없는 작업을 수행했습니다.';
    const lower = action.toLowerCase();
    return ACTION_DESCRIPTIONS[lower] || '기타 작업을 수행했습니다.';
  };

  const formatRole = (role: string | null) => {
    if (!role) return '권한 정보 없음';
    return ROLE_LABELS[role] || role;
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}초`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
      return remainingSeconds > 0 ? `${minutes}분 ${remainingSeconds}초` : `${minutes}분`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}시간 ${remainingMinutes}분` : `${hours}시간`;
  };;

  const buildDetailItems = (log: RecordActivityLogEntry) => {
    const items: string[] = [];

    const formatValueForDisplay = (key: string, value: any) => {
      if (key === 'ranking') {
        if (value === undefined || value === null || value === '') {
          return '미노출';
        }
        const numericValue = Number(value);
        if (Number.isNaN(numericValue) || numericValue <= 0) {
          return '미노출';
        }
        return `${numericValue}위`;
      }

      if (key === 'searchVolume' || key === 'search_volume') {
        if (value === undefined || value === null || value === '') {
          return '없음';
        }
        const numericValue =
          typeof value === 'string' ? Number(value) : value;
        if (typeof numericValue === 'number' && !Number.isNaN(numericValue)) {
          return numericValue.toLocaleString('ko-KR');
        }
        return String(value);
      }

      if (value === undefined || value === null || value === '') {
        return '없음';
      }

      if (typeof value === 'number') {
        return value.toLocaleString('ko-KR');
      }

      if (typeof value === 'object') {
        return JSON.stringify(value);
      }

      return `"${String(value).trim()}"`;
    };

    if (log.metadata) {
      const { ranking, searchVolume, specialNote, link, changes, ...rest } = log.metadata;

      if (ranking !== undefined && ranking !== null && ranking !== '') {
        const rankingValue =
          typeof ranking === 'string' ? Number(ranking) : ranking;
        const rankingLabel =
          typeof rankingValue === 'number' && rankingValue > 0
            ? rankingValue
            : '미노출';
        items.push(`상위노출 순위: ${rankingLabel}`);
      }

      if (searchVolume !== undefined && searchVolume !== null) {
        const numericValue =
          typeof searchVolume === 'string'
            ? Number(searchVolume)
            : searchVolume;
        const formatted =
          typeof numericValue === 'number' && !Number.isNaN(numericValue)
            ? numericValue.toLocaleString('ko-KR')
            : searchVolume;
        items.push(`검색량: ${formatted}`);
      }

      if (specialNote) {
        items.push(`특이사항: ${specialNote}`);
      }

      if (link) {
        items.push(`링크: ${link}`);
      }

      if (changes && typeof changes === 'object') {
        const changeEntries = Object.entries(changes as Record<string, ChangeDetail>).filter(
          ([, value]) =>
            value !== undefined &&
            value !== null &&
            typeof value === 'object' &&
            ('before' in value || 'after' in value)
        );

        if (changeEntries.length > 0) {
          changeEntries.forEach(([key, value]) => {
            const label = FIELD_LABELS[key] || key;
            const beforeDisplay = formatValueForDisplay(key, (value as ChangeDetail).before);
            const afterDisplay = formatValueForDisplay(key, (value as ChangeDetail).after);
            items.push(`${label}: ${beforeDisplay} -> ${afterDisplay}`);
          });
        }
      }

      Object.entries(rest).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        const label = FIELD_LABELS[key] || key;
        items.push(`${label}: ${formatValueForDisplay(key, value)}`);
      });
    }

    if (items.length === 0) {
      items.push('추가 정보가 기록되지 않았습니다.');
    }

    return items;
  };

  const fetchLogs = useCallback(
    async (page = pagination.page, limit = pagination.limit) => {
      setIsLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });
        const response = await fetch(`/api/admin/record-logs?${params.toString()}`);
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || '활동 로그를 불러오지 못했습니다.');
        }

        setLogs(result.logs || []);
        setPagination({
          page: result.pagination?.page ?? page,
          limit: result.pagination?.limit ?? limit,
          total: result.pagination?.total ?? 0,
          totalPages: result.pagination?.totalPages ?? 1,
        });
      } catch (err: any) {
        setError(err.message || '활동 로그를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    },
    [pagination.page, pagination.limit]
  );

  const fetchCrawlerStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const response = await fetch('/api/rankings/stats');
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '크롤링 통계를 불러오지 못했습니다.');
      }

      setCrawlerStats(result);
    } catch (err: any) {
      console.error('Failed to fetch crawler stats:', err);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchCrawlerStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePageChange = (page: number) => {
    fetchLogs(page, pagination.limit);
  };

  const handlePageSizeChange = (size: number) => {
    fetchLogs(1, size);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>기록 활동 로그</h2>
          <p className={styles.subtitle}>
            블로그 기록의 생성 · 수정 · 삭제 내역을 시간순으로 확인할 수 있습니다.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
        <button
          className={styles.refreshButton}
            onClick={() => {
              fetchLogs(pagination.page, pagination.limit);
              fetchCrawlerStats();
            }}
            disabled={isLoading || isLoadingStats}
        >
          새로고침
        </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* 크롤링 통계 섹션 */}
      {crawlerStats && (
        <div className={styles.statsSection}>
          <h3 className={styles.statsTitle}>크롤링 통계</h3>
          
          {/* 최근 24시간 요약 */}
          <div className={styles.summaryCard}>
            <h4 className={styles.summaryTitle}>최근 24시간 요약</h4>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>실행 횟수</span>
                <span className={styles.summaryValue}>{crawlerStats.summary.last24Hours.totalRuns}회</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>처리된 레코드</span>
                <span className={styles.summaryValue}>{crawlerStats.summary.last24Hours.totalProcessed.toLocaleString()}개</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>성공한 레코드</span>
                <span className={styles.summaryValue}>{crawlerStats.summary.last24Hours.totalSuccess.toLocaleString()}개</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>순위 업데이트</span>
                <span className={styles.summaryValue}>{crawlerStats.summary.last24Hours.totalRankingUpdated.toLocaleString()}개</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>검색량 업데이트</span>
                <span className={styles.summaryValue}>{crawlerStats.summary.last24Hours.totalSearchVolumeUpdated.toLocaleString()}개</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>총 소요 시간</span>
                <span className={styles.summaryValue}>
                  {formatDuration(crawlerStats.summary.last24Hours.totalDuration)}
                </span>
              </div>
            </div>
          </div>

          {/* 최근 크롤링 실행 내역 */}
          {crawlerStats.recent.length > 0 && (
            <div className={styles.recentCard}>
              <h4 className={styles.recentTitle}>최근 크롤링 실행 내역</h4>
              <div className={styles.recentList}>
                {crawlerStats.recent.map((stat) => (
                  <div key={stat.id} className={styles.recentItem}>
                    <div className={styles.recentHeader}>
                      <span className={styles.recentTime}>
                        {new Date(stat.completedAt).toLocaleString('ko-KR')}
                      </span>
                      {stat.durationFormatted && (
                        <span className={styles.recentDuration}>
                          ⏱️ {stat.durationFormatted}
                        </span>
                      )}
                    </div>
                    <div className={styles.recentDetails}>
                      <div className={styles.recentDetailRow}>
                        <span>전체 레코드:</span>
                        <strong>{stat.totalRecords.toLocaleString()}개</strong>
                      </div>
                      <div className={styles.recentDetailRow}>
                        <span>처리:</span>
                        <strong>{stat.processed.toLocaleString()}개</strong>
                      </div>
                      <div className={styles.recentDetailRow}>
                        <span>성공:</span>
                        <strong className={styles.successText}>{stat.success.toLocaleString()}개</strong>
                      </div>
                      <div className={styles.recentDetailRow}>
                        <span>순위 업데이트:</span>
                        <strong className={styles.updateText}>{stat.rankingUpdated.toLocaleString()}개</strong>
                      </div>
                      <div className={styles.recentDetailRow}>
                        <span>검색량 업데이트:</span>
                        <strong className={styles.updateText}>{stat.searchVolumeUpdated.toLocaleString()}개</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>시간</th>
              <th>작업</th>
              <th>기록 정보</th>
              <th>작성자</th>
              <th>세부 설명</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className={styles.emptyState}>
                  데이터를 불러오는 중입니다...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.emptyState}>
                  표시할 로그가 없습니다.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const actionKey = (log.action || '').toLowerCase();
                const badgeClass = styles[`badge-${actionKey}`] ?? '';

                return (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString('ko-KR')}</td>
                    <td className={styles.actionCell}>
                      <span className={`${styles.badge} ${badgeClass}`}>
                        {formatAction(log.action)}
                      </span>
                      <span className={styles.actionDescription}>
                        {formatActionDescription(log.action)}
                      </span>
                    </td>
                    <td className={styles.recordCell}>
                      <div className={styles.recordTitle}>{log.title || '-'}</div>
                      <div className={styles.recordMeta}>
                        <span>ID: {log.record_id || '-'}</span>
                        <span>키워드: {log.keyword || '-'}</span>
                        <span>분야: {log.field || '-'}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.actorName}>{log.actor_name || '미확인'}</div>
                      <div className={styles.actorMeta}>
                        <span>{formatRole(log.actor_role)}</span>
                        <span>{log.actor_id || '-'}</span>
                      </div>
                    </td>
                    <td>
                      <ul className={styles.detailList}>
                        {buildDetailItems(log).map((item, idx) => (
                          <li key={`${log.id}-detail-${idx}`}>{item}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={pagination.page}
        totalPages={pagination.totalPages}
        totalCount={pagination.total}
        pageSize={pagination.limit}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        pageSizeOptions={[10, 20, 50, 100]}
        showPageSizeSelector
      />
    </div>
  );
}


