'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './UserList.module.css';

interface User {
  id: string;
  email: string | null;
  is_admin: boolean;
  created_at: string;
}

interface UserListProps {
  initialUsers: User[];
}

export default function UserList({ initialUsers }: UserListProps) {
  const [users, setUsers] = useState(initialUsers);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleToggleAdmin = async (userId: string, currentIsAdmin: boolean) => {
    if (!confirm(`정말 ${currentIsAdmin ? '관리자 권한을 제거' : '관리자 권한을 부여'}하시겠습니까?`)) {
      return;
    }

    setUpdatingId(userId);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: !currentIsAdmin })
        .eq('id', userId);

      if (error) throw error;

      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, is_admin: !currentIsAdmin } : user
        )
      );
    } catch (error: any) {
      alert(error.message || '권한 변경 중 오류가 발생했습니다.');
    } finally {
      setUpdatingId(null);
    }
  };

  const refreshUsers = async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setUsers(data || []);
    } catch (error: any) {
      console.error('Error refreshing users:', error);
    }
  };

  return (
    <div className={styles.userListContainer}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className={styles.title}>계정 관리</h2>
        <button
          onClick={refreshUsers}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f3f4f6',
            color: '#374151',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
          }}
        >
          새로고침
        </button>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead className={styles.tableHeader}>
            <tr>
              <th>이메일</th>
              <th>권한</th>
              <th>생성일</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody className={styles.tableBody}>
            {users.length > 0 ? (
              users.map((user) => (
                <tr key={user.id}>
                  <td>{user.email || '(이메일 없음)'}</td>
                  <td>
                    <span
                      className={`${styles.roleBadge} ${
                        user.is_admin ? styles.admin : styles.user
                      }`}
                    >
                      {user.is_admin ? '관리자' : '일반 사용자'}
                    </span>
                  </td>
                  <td>
                    {new Date(user.created_at).toLocaleDateString('ko-KR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>
                    <div className={styles.actionButtons}>
                      <button
                        className={`${styles.actionButton} ${styles.toggleAdminButton} ${
                          user.is_admin ? styles.danger : ''
                        }`}
                        onClick={() => handleToggleAdmin(user.id, user.is_admin)}
                        disabled={updatingId === user.id}
                      >
                        {updatingId === user.id
                          ? '처리 중...'
                          : user.is_admin
                          ? '관리자 권한 제거'
                          : '관리자 권한 부여'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className={styles.emptyState}>
                  <p>등록된 계정이 없습니다.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

