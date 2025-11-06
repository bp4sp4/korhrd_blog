import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TableData } from '../components/Table/Table';
import TableClient from '../components/Table/TableClient';
import UserInfo from '../components/UserInfo/UserInfo';
import AddRecordButton from '../components/AddRecordButton/AddRecordButton';

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
  }));
}

async function getUserInfo() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let email: string | null = null;
  let isAdmin = false;
  let userName: string | null = null;

  if (user) {
    email = user.email || null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin, name')
      .eq('id', user.id)
      .single();
    isAdmin = profile?.is_admin || false;
    userName = profile?.name || email?.split('@')[0] || null;
  }

  return { email, isAdmin, userName };
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 로그인하지 않은 사용자는 로그인 페이지로 리다이렉트
  if (!user) {
    redirect('/login');
  }

  const records = await getRecords();
  const { email, isAdmin, userName } = await getUserInfo();

  return (
    <div>
      <UserInfo email={email} isAdmin={isAdmin} />
      <AddRecordButton currentUserName={userName} />
      <TableClient data={records} isAdmin={isAdmin} currentUserName={userName} />
    </div>
  );
}
