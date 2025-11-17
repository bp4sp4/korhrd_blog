'use client';

import { useState, useEffect } from 'react';
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

  // localStorage에서 마지막 업데이트 시간 읽기 및 업데이트 감지
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 초기값 설정
      const stored = localStorage.getItem('rankingLastUpdateTime');
      if (stored) {
        setUpdateTime(stored);
      } else {
        // localStorage에 값이 없으면 현재 시간을 초기값으로 설정 (선택사항)
        // 또는 null로 두고 "대기 중..." 표시
        // setUpdateTime(new Date().toISOString());
      }

      // storage 이벤트 리스너 (다른 탭/창에서 업데이트된 경우)
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === 'rankingLastUpdateTime') {
          if (e.newValue) {
            setUpdateTime(e.newValue);
          } else {
            setUpdateTime(null);
          }
        }
      };

      window.addEventListener('storage', handleStorageChange);

      // 커스텀 이벤트 리스너 (같은 탭에서 업데이트된 경우)
      const handleCustomUpdate = () => {
        const stored = localStorage.getItem('rankingLastUpdateTime');
        if (stored) {
          setUpdateTime(stored);
        }
      };

      window.addEventListener('rankingUpdated', handleCustomUpdate);

      // 주기적으로 localStorage 확인 (다른 컴포넌트에서 업데이트했을 수도 있음)
      const intervalId = setInterval(() => {
        const stored = localStorage.getItem('rankingLastUpdateTime');
        if (stored && stored !== updateTime) {
          setUpdateTime(stored);
        }
      }, 1000); // 1초마다 확인

      return () => {
        window.removeEventListener('storage', handleStorageChange);
        window.removeEventListener('rankingUpdated', handleCustomUpdate);
        clearInterval(intervalId);
      };
    }
  }, [updateTime]);

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

