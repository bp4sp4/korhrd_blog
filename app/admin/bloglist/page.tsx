import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AdminTable from '@/components/AdminTable/AdminTable';
import { TableData } from '@/components/Table/Table';

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

export default async function AdminBlogListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, team_id, name')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'super_admin' && profile.role !== 'admin')) {
    redirect('/');
  }

  const records = await getRecords();

  return (
    <section>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1.5rem', color: 'black' }}>
        블로그 관리
      </h2>
      <AdminTable
        initialData={records}
        userId={user.id}
        userRole={profile.role}
        userTeamId={profile.team_id}
        userName={profile.name}
      />
    </section>
  );
}

