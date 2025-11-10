'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './TeamList.module.css';

interface Team {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface TeamListProps {
  isSuperAdmin?: boolean;
}

export default function TeamList({ isSuperAdmin = false }: TeamListProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchTeams = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/teams');
      const result = await response.json();
      if (response.ok) {
        setTeams(result.teams || []);
      } else {
        setError(result.error || '팀 목록을 불러오는 중 오류가 발생했습니다.');
      }
    } catch (err: any) {
      setError('팀 목록을 불러오는 중 오류가 발생했습니다.');
      console.error('Error fetching teams:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchTeams();
    }
  }, [isSuperAdmin]);

  const handleDelete = async (teamId: string, teamName: string) => {
    if (!confirm(`"${teamName}" 팀을 정말 삭제하시겠습니까?`)) {
      return;
    }

    setDeletingId(teamId);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/admin/delete-team?teamId=${teamId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '팀 삭제 중 오류가 발생했습니다.');
      }

      setSuccess('팀이 성공적으로 삭제되었습니다.');
      fetchTeams();
      
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err: any) {
      setError(err.message || '팀 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className={styles.teamListContainer}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className={styles.title}>팀 관리</h2>
        <button
          onClick={fetchTeams}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f3f4f6',
            color: '#374151',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '700',
            cursor: 'pointer',
            
          }}
        >
          새로고침
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      {loading ? (
        <div className={styles.loading}>로딩 중...</div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th>팀 이름</th>
                <th>설명</th>
                <th>생성일</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {teams.length > 0 ? (
                teams.map((team) => (
                  <tr key={team.id}>
                    <td>{team.name}</td>
                    <td>{team.description || '-'}</td>
                    <td>
                      {new Date(team.created_at).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <button
                        className={`${styles.deleteButton} ${deletingId === team.id ? styles.deleting : ''}`}
                        onClick={() => handleDelete(team.id, team.name)}
                        disabled={deletingId === team.id}
                      >
                        {deletingId === team.id ? '삭제 중...' : '삭제'}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className={styles.emptyState}>
                    <p>등록된 팀이 없습니다.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

