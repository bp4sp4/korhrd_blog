'use client';

import { useState, useEffect } from 'react';
import styles from './GroupList.module.css';

interface Group {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  team_count?: number;
}

interface GroupListProps {
  isSuperAdmin?: boolean;
}

export default function GroupList({ isSuperAdmin = false }: GroupListProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/groups');
      const result = await response.json();
      if (response.ok) {
        setGroups(result.groups || []);
      } else {
        setError(result.error || '그룹 목록을 불러오는 중 오류가 발생했습니다.');
      }
    } catch (err: any) {
      setError('그룹 목록을 불러오는 중 오류가 발생했습니다.');
      console.error('Error fetching groups:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchGroups();
    }
  }, [isSuperAdmin]);

  const handleDelete = async (groupId: string, groupName: string) => {
    if (!confirm(`"${groupName}" 그룹을 정말 삭제하시겠습니까? 이 그룹에 속한 모든 팀의 그룹 연결이 해제됩니다.`)) {
      return;
    }

    setDeletingId(groupId);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/admin/delete-group?groupId=${groupId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '그룹 삭제 중 오류가 발생했습니다.');
      }

      setSuccess('그룹이 성공적으로 삭제되었습니다.');
      fetchGroups();
      
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err: any) {
      setError(err.message || '그룹 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (group: Group) => {
    setEditingId(group.id);
    setError('');
    setSuccess('');
  };

  const handleSaveEdit = async (groupId: string, name: string, description: string) => {
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/admin/update-group', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: groupId,
          name,
          description: description || null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '그룹 수정 중 오류가 발생했습니다.');
      }

      setSuccess('그룹이 성공적으로 수정되었습니다.');
      setEditingId(null);
      fetchGroups();
      
      setTimeout(() => {
        setSuccess('');
      }, 3000);
    } catch (err: any) {
      setError(err.message || '그룹 수정 중 오류가 발생했습니다.');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setError('');
    setSuccess('');
  };

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className={styles.groupListContainer}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 className={styles.title}>그룹 관리</h2>
        <button
          onClick={fetchGroups}
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
                <th>그룹 이름</th>
                <th>설명</th>
                <th>소속 팀 수</th>
                <th>생성일</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {groups.length > 0 ? (
                groups.map((group) => (
                  <GroupRow
                    key={group.id}
                    group={group}
                    isEditing={editingId === group.id}
                    onEdit={() => handleEdit(group)}
                    onSave={handleSaveEdit}
                    onCancel={handleCancelEdit}
                    onDelete={handleDelete}
                    deletingId={deletingId}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={5} className={styles.emptyState}>
                    <p>등록된 그룹이 없습니다.</p>
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

interface GroupRowProps {
  group: Group;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (id: string, name: string, description: string) => void;
  onCancel: () => void;
  onDelete: (id: string, name: string) => void;
  deletingId: string | null;
}

function GroupRow({ group, isEditing, onEdit, onSave, onCancel, onDelete, deletingId }: GroupRowProps) {
  const [editName, setEditName] = useState(group.name);
  const [editDescription, setEditDescription] = useState(group.description || '');

  useEffect(() => {
    if (isEditing) {
      setEditName(group.name);
      setEditDescription(group.description || '');
    }
  }, [isEditing, group.name, group.description]);

  if (isEditing) {
    return (
      <tr>
        <td>
          <input
            type="text"
            className={styles.editInput}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
        </td>
        <td>
          <input
            type="text"
            className={styles.editInput}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="설명 (선택사항)"
          />
        </td>
        <td>{group.team_count || 0}</td>
        <td>
          {new Date(group.created_at).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </td>
        <td>
          <div className={styles.editActions}>
            <button
              className={styles.saveButton}
              onClick={() => onSave(group.id, editName, editDescription)}
            >
              저장
            </button>
            <button
              className={styles.cancelButton}
              onClick={onCancel}
            >
              취소
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{group.name}</td>
      <td>{group.description || '-'}</td>
      <td>{group.team_count || 0}</td>
      <td>
        {new Date(group.created_at).toLocaleDateString('ko-KR', {
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
            className={styles.editButton}
            onClick={onEdit}
          >
            수정
          </button>
          <button
            className={`${styles.deleteButton} ${deletingId === group.id ? styles.deleting : ''}`}
            onClick={() => onDelete(group.id, group.name)}
            disabled={deletingId === group.id}
          >
            {deletingId === group.id ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </td>
    </tr>
  );
}

