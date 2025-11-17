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

export default function AddRecordButton({ currentUserId, currentUserName, userRole = 'member', userTeamId = null, lastUpdateTime = null }: AddRecordButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [updateTime, setUpdateTime] = useState<string | null>(lastUpdateTime || null);

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

        if (!error && logs?.created_at) {
          const updateTime = new Date(logs.created_at).toISOString();
          console.log('[AddRecordButton] 초기 업데이트 시간:', updateTime);
          setUpdateTime(updateTime);
          localStorage.setItem('rankingLastUpdateTime', updateTime);
        } else {
          // DB에 값이 없으면 localStorage 확인
          const stored = localStorage.getItem('rankingLastUpdateTime');
          if (stored) {
            setUpdateTime(stored);
          }
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

      return () => {
        void supabase.removeChannel(channel);
        window.removeEventListener('rankingUpdated', handleCustomUpdate);
      };
    }
  }, []); // 의존성 배열 비움 - 마운트 시 한 번만 실행

  // props로 전달된 lastUpdateTime이 변경되면 업데이트
  useEffect(() => {
    if (lastUpdateTime) {
      setUpdateTime(lastUpdateTime);
    }
  }, [lastUpdateTime]);

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

  return (
    <>
      <div className={styles.buttonContainer}>
        <div className={styles.updateInfo}>
          <span className={styles.updateLabel}>마지막 업데이트:</span>
          <span className={styles.updateTime}>
            {updateTime ? formatUpdateTime(updateTime) : '대기 중...'}
          </span>
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

