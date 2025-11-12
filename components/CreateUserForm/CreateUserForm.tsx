'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './CreateUserForm.module.css';

interface Team {
  id: string;
  name: string;
  description: string | null;
}

export default function CreateUserForm() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    teamId: '',
    role: 'member' as 'owner' | 'super_admin' | 'admin' | 'member',
  });
  const [teams, setTeams] = useState<Team[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  // 현재 사용자 역할 가져오기
  useEffect(() => {
    const fetchCurrentUserRole = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();
          setCurrentUserRole(profile?.role || null);
        }
      } catch (err) {
        console.error('Failed to fetch current user role:', err);
      }
    };
    fetchCurrentUserRole();
  }, []);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const response = await fetch('/api/admin/teams');
        const result = await response.json();
        if (response.ok) {
          setTeams(result.teams || []);
        }
      } catch (err) {
        console.error('Error fetching teams:', err);
      } finally {
        setLoadingTeams(false);
      }
    };
    fetchTeams();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.email || !formData.password || !formData.name) {
      setError('이메일, 비밀번호, 이름을 모두 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          name: formData.name,
          teamId: formData.teamId || null,
          role: formData.role,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '사용자 생성 중 오류가 발생했습니다.');
      }

      setSuccess(result.message || '사용자가 성공적으로 생성되었습니다.');
      setFormData({
        email: '',
        password: '',
        name: '',
        teamId: '',
        role: 'member',
      });
      
      // 페이지 새로고침하여 계정 목록 업데이트
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      setError(err.message || '사용자 생성 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.createUserForm}>
      <h2 className={styles.formTitle}>계정 생성</h2>
      <form onSubmit={handleSubmit}>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>이메일 *</label>
            <input
              type="email"
              name="email"
              className={styles.input}
              value={formData.email}
              onChange={handleChange}
              placeholder="이메일을 입력하세요"
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>비밀번호 *</label>
            <input
              type="password"
              name="password"
              className={styles.input}
              value={formData.password}
              onChange={handleChange}
              placeholder="비밀번호를 입력하세요"
              required
              minLength={6}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>이름 *</label>
            <input
              type="text"
              name="name"
              className={styles.input}
              value={formData.name}
              onChange={handleChange}
              placeholder="이름을 입력하세요 (한글)"
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>팀</label>
            <select
              name="teamId"
              className={styles.select}
              value={formData.teamId}
              onChange={handleChange}
            >
              <option value="">팀 선택 (선택사항)</option>
              {loadingTeams ? (
                <option disabled>로딩 중...</option>
              ) : (
                teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>역할</label>
            <select
              name="role"
              className={styles.select}
              value={formData.role}
              onChange={handleChange}
            >
              <option value="member">팀원</option>
              <option value="admin">관리자</option>
              <option value="super_admin">최고관리자</option>
              {currentUserRole === 'owner' && (
                <option value="owner">시스템 소유자</option>
              )}
            </select>
          </div>
        </div>
        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}
        <div className={styles.formActions}>
          <button
            type="button"
            className={`${styles.button} ${styles.secondary}`}
            onClick={() => {
              setFormData({
                email: '',
                password: '',
                name: '',
                teamId: '',
                role: 'member',
              });
              setError('');
              setSuccess('');
            }}
          >
            초기화
          </button>
          <button
            type="submit"
            className={`${styles.button} ${styles.primary}`}
            disabled={isSubmitting}
          >
            {isSubmitting ? '생성 중...' : '계정 생성'}
          </button>
        </div>
      </form>
    </div>
  );
}

