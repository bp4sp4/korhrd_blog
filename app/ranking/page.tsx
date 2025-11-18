'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

interface RankingScore {
  author_name: string;
  total_score: number;
  total_ranking_1_count: number;
  total_ranking_2_count: number;
  total_ranking_3_count: number;
  total_not_ranked_count: number;
  rank: number;
  date?: string;
  keywords_count?: number;
}

export default function RankingPage() {
  const router = useRouter();
  const [rankingScores, setRankingScores] = useState<RankingScore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdateTime, setLastUpdateTime] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchName, setSearchName] = useState('');
  const itemsPerPage = 20;

  // 일별 랭킹 점수 조회
  const fetchRankingScores = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/rankings/scores?period=day', {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        console.error('[RankingPage] 순위 조회 실패:', response.status);
        return;
      }

      const result = await response.json();
      if (result.success && Array.isArray(result.scores)) {
        setRankingScores(result.scores);
        setLastUpdateTime(result.date);
      }
    } catch (error: any) {
      console.error('[RankingPage] 순위 조회 중 오류:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 초기 로드 시 및 Realtime 업데이트 시 순위 조회
  useEffect(() => {
    if (typeof window !== 'undefined') {
      fetchRankingScores();

      // Realtime 구독: daily_ranking_scores 테이블의 변경사항 감지
      const supabase = createClient();
      const channel = supabase
        .channel('ranking-scores-updates-page')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'daily_ranking_scores',
          },
          () => {
            void fetchRankingScores();
          }
        )
        .subscribe();

      // 주기적으로 순위 갱신 (30초마다)
      const intervalId = setInterval(() => {
        void fetchRankingScores();
      }, 30000);

      return () => {
        void supabase.removeChannel(channel);
        clearInterval(intervalId);
      };
    }
  }, []);

  // 필터링된 데이터
  const filteredData = rankingScores.filter((item) => {
    if (searchName && !item.author_name.toLowerCase().includes(searchName.toLowerCase())) {
      return false;
    }
    return true;
  });

  // 페이지네이션
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatUpdateTime = (time: string | null) => {
    if (!time) return null;
    try {
      const date = new Date(time);
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const period = hours >= 12 ? '오후' : '오전';
      const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
      return `${period} ${displayHours}시${minutes > 0 ? ` ${minutes}분` : ''}`;
    } catch {
      return null;
    }
  };

  const getCurrentDateLabel = () => {
    return '오전 10시 기준으로';
  };

  return (
    <div className={styles.container}>
      <div className={styles.mainContent}>
        {/* 헤더 */}
        <div className={styles.header}>
          <h1 className={styles.title}>일일 랭킹</h1>
          <p className={styles.subtitle}>
            작성자별 상위노출 순위 점수 집계
            <br />
            <span className={styles.updateTime}>
              마지막 업데이트:{' '}
              {lastUpdateTime ? formatUpdateTime(lastUpdateTime) : '로딩 중...'}
              {' • '}
              {getCurrentDateLabel()}
            </span>
          </p>
        </div>

        {/* 필터 섹션 */}
        <div className={styles.tossFilterSection}>
          <div className={styles.filterOptions}>
            <div className={styles.searchInputWrapper}>
              <input
                type="text"
                className={styles.tossSearchInput}
                placeholder="작성자 검색"
                value={searchName}
                onChange={(e) => {
                  setSearchName(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className={styles.searchFilter}>
              <button
                className={styles.tossResetButton}
                onClick={() => {
                  setSearchName('');
                  setCurrentPage(1);
                }}
              >
                초기화
              </button>
            </div>
          </div>
        </div>

        {/* 랭킹 리스트 */}
        {isLoading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner}></div>
            <p>랭킹 로딩 중...</p>
          </div>
        ) : (
          <div className={styles.rankingList}>
            <div className={styles.rankingHeader}>
              <div className={styles.rankColumn}>순위</div>
              <div className={styles.nameColumn}>작성자</div>
              <div className={styles.scoreColumn}>총 점수</div>
            </div>

            {paginatedData.length > 0 ? (
              paginatedData.map((score, index) => {
                return (
                  <div
                    key={score.author_name}
                    className={`${styles.rankingItem} ${index % 2 === 0 ? styles.even : styles.odd}`}
                  >
                    <div className={styles.rankColumn}>
                      <span className={styles.rankNumber}>#{score.rank}</span>
                    </div>
                    <div className={styles.nameColumn}>
                      <div className={styles.userName}>{score.author_name}</div>
                    </div>
                    <div className={styles.scoreColumn}>
                      <span className={styles.totalScore}>{score.total_score}점</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={styles.emptyState}>
                <p>랭킹 데이터가 없습니다.</p>
              </div>
            )}
          </div>
        )}

        {/* 페이지네이션 */}
        {!isLoading && filteredData.length > 0 && totalPages > 1 && (
          <div className={styles.pagination}>
            <div className={styles.paginationContainer}>
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={styles.navButton}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="line-icon">
                  <path
                    d="M14.3 17.4c-.2 0-.5-.1-.6-.3l-4.5-4.5c-.4-.4-.4-.9 0-1.3l4.5-4.5c.4-.4.9-.4 1.3 0s.4.9 0 1.3L11 12l3.9 3.9c.4.4.4.9 0 1.3-.2.1-.4.2-.6.2z"
                    fill="#a8b2bc"
                  ></path>
                </svg>
              </button>

              {/* 페이지 번호 */}
              {(() => {
                const startPage = Math.floor((currentPage - 1) / 10) * 10 + 1;
                const endPage = Math.min(startPage + 9, totalPages);

                return (
                  <>
                    {startPage > 1 && (
                      <>
                        <button
                          onClick={() => handlePageChange(1)}
                          className={`${styles.pageButton} ${styles.pageButtonInactive}`}
                        >
                          1
                        </button>
                        <span className={styles.ellipsis}>...</span>
                      </>
                    )}
                    {Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map((page) => (
                      <button
                        key={page}
                        onClick={() => handlePageChange(page)}
                        className={`${styles.pageButton} ${
                          currentPage === page ? styles.pageButtonActive : styles.pageButtonInactive
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                    {endPage < totalPages && (
                      <>
                        <span className={styles.ellipsis}>...</span>
                        <button
                          onClick={() => handlePageChange(totalPages)}
                          className={`${styles.pageButton} ${styles.pageButtonInactive}`}
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                  </>
                );
              })()}

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={styles.navButton}
              >
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="m9.733 17.342c-.23 0-.46-.088-.636-.264-.352-.352-.352-.922 0-1.273l3.896-3.896-3.867-3.867c-.352-.351-.352-.921 0-1.272.352-.352.921-.352 1.272 0l4.504 4.503c.169.168.264.397.264.636s-.096.468-.264.636l-4.534 4.533c-.176.176-.406.264-.636.264z"
                    fill="#b0b8c1"
                  ></path>
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

