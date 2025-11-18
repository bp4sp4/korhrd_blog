'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import AddRecordForm from '../AddRecordForm/AddRecordForm';
import styles from './AddRecordButton.module.css';

interface AddRecordButtonProps {
  currentUserId?: string | null;
  currentUserName?: string | null;
  userRole?: string | null;
  userTeamId?: string | null;
  lastUpdateTime?: string | null;
}

interface RankingScore {
  author_name: string;
  total_score: number;
  total_ranking_1_count: number;
  total_ranking_2_count: number;
  total_ranking_3_count: number;
  total_not_ranked_count: number;
  rank: number;
  date?: string;
  days_count?: number;
}

export default function AddRecordButton({ currentUserId, currentUserName, userRole = 'member', userTeamId = null, lastUpdateTime = null }: AddRecordButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [updateTime, setUpdateTime] = useState<string | null>(lastUpdateTime || null);
  const [rankingScores, setRankingScores] = useState<RankingScore[]>([]);
  const [isLoadingScores, setIsLoadingScores] = useState(false);

  // Supabase Realtime으로 마지막 업데이트 시간 구독 및 localStorage 동기화
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const supabase = createClient();

      // 초기값 가져오기 (record_activity_logs에서 가장 최근 랭킹 업데이트 시간)
      const fetchLastUpdateTime = async () => {
        const { data: logs, error } = await supabase
          .from('record_activity_logs')
          .select('created_at')
          .eq('action', 'update')
          .eq('actor_name', 'crawler')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        let lastUpdateTime: string | null = null;
        
        if (!error && logs?.created_at) {
          lastUpdateTime = new Date(logs.created_at).toISOString();
          console.log('[AddRecordButton] DB에서 가져온 업데이트 시간:', lastUpdateTime);
        } else {
          // DB에 값이 없으면 localStorage 확인
          const stored = localStorage.getItem('rankingLastUpdateTime');
          if (stored) {
            lastUpdateTime = stored;
            console.log('[AddRecordButton] localStorage에서 가져온 업데이트 시간:', lastUpdateTime);
          }
        }

        // 마지막 업데이트 시간이 1시간 이상 지났다면 현재 시간으로 갱신
        if (lastUpdateTime) {
          const lastUpdate = new Date(lastUpdateTime).getTime();
          const now = new Date().getTime();
          const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
          
          if (hoursSinceUpdate >= 1) {
            // 1시간 이상 지났다면 현재 시간으로 갱신
            const currentTime = new Date().toISOString();
            console.log('[AddRecordButton] 1시간 이상 지나서 현재 시간으로 갱신:', currentTime);
            setUpdateTime(currentTime);
            localStorage.setItem('rankingLastUpdateTime', currentTime);
          } else {
            setUpdateTime(lastUpdateTime);
            localStorage.setItem('rankingLastUpdateTime', lastUpdateTime);
          }
        } else {
          // 아무 값도 없으면 현재 시간으로 설정
          const currentTime = new Date().toISOString();
          console.log('[AddRecordButton] 초기 시간 설정:', currentTime);
          setUpdateTime(currentTime);
          localStorage.setItem('rankingLastUpdateTime', currentTime);
        }
      };

      void fetchLastUpdateTime();

      // Realtime 구독: record_activity_logs 테이블의 INSERT 이벤트 감지
      const channel = supabase
        .channel('ranking-updates-button')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'record_activity_logs',
            filter: 'action=eq.update',
          },
          (payload) => {
            const newRecord = payload.new as { actor_name?: string; created_at?: string };
            // crawler가 업데이트한 경우만 시간 갱신
            if (newRecord.actor_name === 'crawler' && newRecord.created_at) {
              const updateTime = new Date(newRecord.created_at).toISOString();
              console.log('[AddRecordButton] Realtime 업데이트 시간 변경:', updateTime);
              setUpdateTime(updateTime);
              localStorage.setItem('rankingLastUpdateTime', updateTime);
            }
          }
        )
        .subscribe();

      // 커스텀 이벤트 리스너 (같은 탭에서 업데이트된 경우)
      const handleCustomUpdate = () => {
        const stored = localStorage.getItem('rankingLastUpdateTime');
        if (stored) {
          setUpdateTime(stored);
        }
      };

      window.addEventListener('rankingUpdated', handleCustomUpdate);

      // 1시간마다 마지막 업데이트 시간 자동 갱신 (랭킹 업데이트 여부와 관계없이)
      const updateTimeInterval = setInterval(() => {
        const currentTime = new Date().toISOString();
        console.log('[AddRecordButton] 1시간마다 자동 시간 갱신:', currentTime);
        setUpdateTime(currentTime);
        if (typeof window !== 'undefined') {
          localStorage.setItem('rankingLastUpdateTime', currentTime);
        }
      }, 3600000); // 1시간 = 3600000ms

      return () => {
        void supabase.removeChannel(channel);
        window.removeEventListener('rankingUpdated', handleCustomUpdate);
        clearInterval(updateTimeInterval);
      };
    }
  }, []); // 의존성 배열 비움 - 마운트 시 한 번만 실행

  // props로 전달된 lastUpdateTime이 변경되면 업데이트
  useEffect(() => {
    if (lastUpdateTime) {
      setUpdateTime(lastUpdateTime);
    }
  }, [lastUpdateTime]);

  // 이름별 랭킹 점수 조회 (일별)
  const fetchRankingScores = async () => {
    setIsLoadingScores(true);
    try {
      const response = await fetch('/api/rankings/scores?period=day', {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        console.error('[AddRecordButton] 순위 조회 실패:', response.status);
        return;
      }

      const result = await response.json();
      if (result.success && Array.isArray(result.scores)) {
        // 상위 10명만 표시
        setRankingScores(result.scores.slice(0, 10));
      }
    } catch (error: any) {
      console.error('[AddRecordButton] 순위 조회 중 오류:', error);
    } finally {
      setIsLoadingScores(false);
    }
  };

  // 초기 로드 시 점수 계산 및 순위 조회
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 먼저 현재 DB 데이터 기반으로 점수 계산
      const calculateScores = async () => {
        try {
          const response = await fetch('/api/rankings/scores/calculate', {
            method: 'POST',
            cache: 'no-store',
          });

          if (response.ok) {
            const result = await response.json();
            console.log('[AddRecordButton] 점수 계산 완료:', result);
            // 점수 계산 후 순위 조회
            await fetchRankingScores();
          } else {
            // 점수가 정상적으로 표시되면 에러는 조용히 처리
            const errorData = await response.json().catch(() => ({}));
            console.warn('[AddRecordButton] 점수 계산 실패 (기존 점수 사용):', response.status, errorData);
            // 실패해도 순위 조회는 진행 (기존 점수 사용)
            await fetchRankingScores();
          }
        } catch (error: any) {
          console.error('[AddRecordButton] 점수 계산 중 오류:', error);
          // 오류가 발생해도 순위 조회는 진행
          await fetchRankingScores();
        }
      };

      void calculateScores();

      // Realtime 구독: daily_ranking_scores 테이블의 변경사항 감지
      const supabase = createClient();
      const channel = supabase
        .channel('ranking-scores-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'daily_ranking_scores',
          },
          () => {
            // 점수 업데이트 시 순위 다시 조회
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

  // 한국 시간(KST) 기준으로 오전 10시 기준 날짜 계산
  const getCurrentDateLabel = () => {
    return '오전 10시 기준으로';
  };

  return (
    <>
      <div className={styles.buttonContainer}>
        <div className={styles.leftSection}>
          <div className={styles.updateInfo}>
            <span className={styles.updateLabel}>마지막 업데이트:</span>
            <span className={styles.updateTime}>
              {updateTime ? formatUpdateTime(updateTime) : '대기 중...'}
            </span>
            {rankingScores.length > 0 && (
              <span className={styles.rankingInline}>
                <span className={styles.rankingLabel}>{getCurrentDateLabel()}</span>
                {rankingScores.slice(0, 3).map((score, index) => (
                  <span key={score.author_name} className={styles.rankingItemInline}>
                    <span className={styles.rankingRank}>
                      {score.rank === 1 ? (
                        <img src="/goldmedal.png" alt="금메달" className={styles.rankingMedalImage} />
                      ) : score.rank === 2 ? (
                        <img src="/silvermedal.png" alt="은메달" className={styles.rankingMedalImage} />
                      ) : (
                        <img src="/bronzemedal.png" alt="동메달" className={styles.rankingMedalImage} />
                      )}
                    </span>
                    <span className={styles.rankingScoreInline}>{score.total_score}점</span>
                    <span className={styles.rankingNameInline}>{score.author_name}</span>
                  </span>
                ))}
              </span>
            )}
          </div>
          {isLoadingScores && rankingScores.length === 0 && (
            <div className={styles.rankingLoading}>랭킹 로딩 중...</div>
          )}
        </div>
        <button
          className={styles.addButton}
          onClick={() => setIsModalOpen(true)}
        >
          + 기록 추가
        </button>
      </div>
      <AddRecordForm
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        userRole={userRole}
        userTeamId={userTeamId}
      />
    </>
  );
}

