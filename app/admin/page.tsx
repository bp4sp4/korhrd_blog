import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import CreateUserForm from '@/components/CreateUserForm/CreateUserForm';
import CreateTeamForm from '@/components/CreateTeamForm/CreateTeamForm';
import TeamList from '@/components/TeamList/TeamList';
import UserList from '@/components/UserList/UserList';
import styles from './admin.module.css';

async function getUsers() {
  const supabase = await createClient();
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

  if (error) {
    console.error('Error fetching users:', error);
    return [];
  }

  return data || [];
}

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Check if user is super_admin only
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_admin, team_id, name')
    .eq('id', user.id)
    .single();

  // Only super_admin can access admin page
  if (!profile || profile.role !== 'super_admin') {
    redirect('/');
  }

  const isSuperAdmin = true;

  const users = await getUsers();
  return (
    <div className={styles.container}>
      <nav className={styles.tabs} aria-label="관리자 기능 바로가기">
        <a className={styles.tabLink} href="#team-management">
          팀 관리
        </a>
        <a className={styles.tabLink} href="#user-management">
          계정 관리
        </a>
      </nav>

      <section id="team-management" className={styles.section}>
        <CreateTeamForm />
        <TeamList isSuperAdmin={isSuperAdmin} />
      </section>

      <section id="user-management" className={styles.section}>
        <CreateUserForm />
        <UserList initialUsers={users} isSuperAdmin={isSuperAdmin} />
      </section>

    </div>
  );
}

