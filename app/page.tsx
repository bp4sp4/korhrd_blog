import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TableData } from '../components/Table/Table';
import TableClient from '../components/Table/TableClient';
import UserInfo from '../components/UserInfo/UserInfo';
import AddRecordButton from '../components/AddRecordButton/AddRecordButton';

type ProfileInfo = {
  is_admin: boolean | null;
  name: string | null;
  role: string | null;
  team_id: string | null;
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 로그인하지 않은 사용자는 로그인 페이지로 리다이렉트
  if (!user) {
    redirect('/login');
  }

  const [
    { data: recordsData, error: recordsError },
    { data: profile, error: profileError },
  ] = await Promise.all([
    supabase
      .from('blog_records')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('is_admin, name, role, team_id')
      .eq('id', user.id)
      .maybeSingle<ProfileInfo>(),
  ]);

  if (recordsError) {
    console.error('Error fetching records:', recordsError);
  }

  if (profileError) {
    console.error('Error fetching profile:', profileError);
  }

  const records: TableData[] =
    recordsData?.map((record) => ({
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
    })) ?? [];

  const email = user.email || null;
  const userId = user.id;
  const isAdmin = Boolean(profile?.is_admin);
  const userName = profile?.name || email?.split('@')[0] || null;
  const userRole = profile?.role || 'member';
  const userTeamId = profile?.team_id || null;

  return (
    <div>
      <UserInfo email={email} isAdmin={isAdmin} />
      <AddRecordButton currentUserName={userName} currentUserId={userId} userRole={userRole} />
      <TableClient
        data={records}
        isAdmin={isAdmin}
        currentUserName={userName}
        userRole={userRole}
        userTeamId={userTeamId}
        currentUserId={userId}
      />
    </div>
  );
}
