import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TableData } from '@/components/Table/Table';
import AdminTable from '@/components/AdminTable/AdminTable';
import CreateUserForm from '@/components/CreateUserForm/CreateUserForm';
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
  }));
}

async function getUsers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
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

  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    redirect('/');
  }

  const records = await getRecords();
  const users = await getUsers();

  return (
    <div>
      <CreateUserForm />
      <UserList initialUsers={users} />
      <AdminTable initialData={records} />
    </div>
  );
}

