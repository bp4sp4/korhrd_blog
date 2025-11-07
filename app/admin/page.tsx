import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TableData } from '@/components/Table/Table';
import AdminTable from '@/components/AdminTable/AdminTable';
import CreateUserForm from '@/components/CreateUserForm/CreateUserForm';
import CreateTeamForm from '@/components/CreateTeamForm/CreateTeamForm';
import TeamList from '@/components/TeamList/TeamList';
import UserList from '@/components/UserList/UserList';

async function getRecords(): Promise<TableData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('blog_records')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching records:', error);
    return [];
  }

  return (data || []).map((record) => ({
    id: record.id,
    field: record.field,
    keyword: record.keyword,
    ranking: record.ranking || 0,
    searchVolume: record.search_volume || 0,
    title: record.title,
    link: record.link,
    author: record.author || '',
    specialNote: record.special_note || '',
    teamId: record.team_id || null,
  }));
}

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

  const records = await getRecords();
  const users = await getUsers();

  return (
    <div>
      <CreateTeamForm />
      <TeamList isSuperAdmin={isSuperAdmin} />
      <CreateUserForm />
      <UserList initialUsers={users} isSuperAdmin={isSuperAdmin} />
      <AdminTable 
        initialData={records} 
        userRole={profile.role || 'member'}
        userTeamId={profile.team_id}
        userName={profile.name}
      />
    </div>
  );
}

