'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './UserList.module.css';

interface User {
  id: string;
  email: string | null;
  name: string | null;
  is_admin: boolean;
  role: string | null;
  team_id: string | null;
  teams?: {
    id: string;
    name: string;
  } | null;
  created_at: string;
}

interface UserListProps {
  initialUsers: User[];
  isSuperAdmin?: boolean;
}

export default function UserList({ initialUsers, isSuperAdmin = false }: UserListProps) {
  const [users, setUsers] = useState(initialUsers);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
        .select(`
          *,
          teams:team_id (
            id,
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setUsers(data || []);
    } catch (error: any) {
      console.error('Error refreshing users:', error);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`"${userName || '이 사용자'}" 계정을 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }

    setDeletingId(userId);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/admin/delete-user?userId=${userId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '계정 삭제 중 오류가 발생했습니다.');
      }

      setSuccess('계정이 성공적으로 삭제되었습니다.');
      refreshUsers();
      
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err: any) {
      setError(err.message || '계정 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingId(null);
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

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead className={styles.tableHeader}>
            <tr>
              <th>이름</th>
              <th>이메일</th>
              <th>팀</th>
              <th>역할</th>
              <th>생성일</th>
              {isSuperAdmin && <th>작업</th>}
            </tr>
          </thead>
          <tbody className={styles.tableBody}>
            {users.length > 0 ? (
              users.map((user) => {
                const getRoleLabel = (role: string | null) => {
                  if (role === 'super_admin') return '최고관리자';
                  if (role === 'admin') return '관리자';
                  return '팀원';
                };

                const getRoleBadgeClass = (role: string | null) => {
                  if (role === 'super_admin') return styles.superAdmin;
                  if (role === 'admin') return styles.admin;
                  return styles.user;
                };

                return (
                  <tr key={user.id}>
                    <td>{user.name || '(이름 없음)'}</td>
                    <td>{user.email || '(이메일 없음)'}</td>
                    <td>{user.teams?.name || '(팀 없음)'}</td>
                    <td>
                      <span
                        className={`${styles.roleBadge} ${getRoleBadgeClass(user.role)}`}
                      >
                        {getRoleLabel(user.role)}
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
                    {isSuperAdmin && (
                      <td>
                        <div className={styles.actionButtons}>
                          <button
                            className={`${styles.actionButton} ${styles.toggleAdminButton} ${
                              user.is_admin ? styles.danger : ''
                            }`}
                            onClick={() => handleToggleAdmin(user.id, user.is_admin)}
                            disabled={updatingId === user.id || deletingId === user.id}
                          >
                            {updatingId === user.id
                              ? '처리 중...'
                              : user.is_admin
                              ? '관리자 권한 제거'
                              : '관리자 권한 부여'}
                          </button>
                          <button
                            className={`${styles.actionButton} ${styles.deleteUserButton}`}
                            onClick={() => handleDeleteUser(user.id, user.name || user.email || '')}
                            disabled={deletingId === user.id || updatingId === user.id}
                          >
                            {deletingId === user.id ? '삭제 중...' : '삭제'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={isSuperAdmin ? 6 : 5} className={styles.emptyState}>
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

