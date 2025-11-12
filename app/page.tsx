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

  // 팀 그룹별 필터링을 위한 팀 정보 가져오기
  let filteredRecords = recordsData || [];
  
  // owner만 모든 기록 볼 수 있음 (super_admin도 팀 필터링 받음)
  if (profile?.role !== 'owner') {
    if (profile?.team_id) {
      // 사용자의 팀 정보와 그룹 정보 가져오기
      const { data: userTeam } = await supabase
        .from('teams')
        .select('id, name, group_id, groups:group_id(id, name)')
        .eq('id', profile.team_id)
        .single();

      if (userTeam) {
        const teamName = userTeam.name;
        const userGroup = (userTeam as any).groups;
        const userGroupName = userGroup?.name || null;
        
        // 그룹 기반 필터링 (그룹이 있는 경우)
        if (userGroupName) {
          if (userGroupName === '원수사팀') {
            // 원수사팀 그룹: 원수사팀 그룹의 모든 팀 기록 표시
            const { data: wonsusaGroupTeams } = await supabase
              .from('teams')
              .select('id')
              .eq('group_id', userGroup.id);
            
            const wonsusaGroupTeamIds = wonsusaGroupTeams?.map((t) => t.id) || [];
            
            filteredRecords = (recordsData || []).filter(
              (record) => record.team_id && wonsusaGroupTeamIds.includes(record.team_id)
            );
          } else if (userGroupName === '영업단') {
            // 영업단 그룹: 영업단 그룹의 모든 팀 기록 표시 (원수사팀 제외)
            const { data: salesGroupTeams } = await supabase
              .from('teams')
              .select('id')
              .eq('group_id', userGroup.id);
            
            const salesGroupTeamIds = salesGroupTeams?.map((t) => t.id) || [];
            
            // 원수사팀 그룹의 team_id 가져오기 (제외하기 위해)
            const { data: 원수사팀Group } = await supabase
              .from('groups')
              .select('id')
              .eq('name', '원수사팀')
              .single();
            
            const { data: 원수사팀Teams } = 원수사팀Group
              ? await supabase
                  .from('teams')
                  .select('id')
                  .eq('group_id', 원수사팀Group.id)
              : { data: null };
            
            const 원수사팀TeamIds = 원수사팀Teams?.map((t) => t.id) || [];
            
            filteredRecords = (recordsData || []).filter(
              (record) => {
                return record.team_id && 
                       salesGroupTeamIds.includes(record.team_id) &&
                       !원수사팀TeamIds.includes(record.team_id);
              }
            );
          } else {
            // 다른 그룹: 자신의 그룹 기록만 표시
            const { data: sameGroupTeams } = await supabase
              .from('teams')
              .select('id')
              .eq('group_id', userGroup.id);
            
            const sameGroupTeamIds = sameGroupTeams?.map((t) => t.id) || [];
            
            filteredRecords = (recordsData || []).filter(
              (record) => record.team_id && sameGroupTeamIds.includes(record.team_id)
            );
          }
        } else {
          // 그룹이 없는 경우: 기존 로직 (하위 호환성)
          // 원수사팀인 경우: 원수사팀의 기록만 표시
          if (teamName === '원수사팀' || teamName === '원수사') {
            filteredRecords = (recordsData || []).filter(
              (record) => record.team_id === profile.team_id
            );
          } else {
            // 1팀, 1-1팀, 2팀, 3팀 (영업단): 이 그룹의 기록만 표시
            const groupTeamNames = ['1팀', '1-1팀', '2팀', '3팀'];
            
            const { data: allGroupTeams } = await supabase
              .from('teams')
              .select('id, name')
              .in('name', groupTeamNames);
            
            const groupTeamIds = allGroupTeams?.map((t) => t.id) || [];
            const isUserTeamInSalesGroup = groupTeamNames.includes(teamName) || groupTeamIds.includes(profile.team_id);
            
            if (isUserTeamInSalesGroup) {
              const { data: 원수사팀Data } = await supabase
                .from('teams')
                .select('id')
                .in('name', ['원수사팀', '원수사'])
                .limit(1);
              
              const 원수사팀TeamIds = 원수사팀Data?.map((t) => t.id) || [];
              
              filteredRecords = (recordsData || []).filter(
                (record) => {
                  return record.team_id && 
                         groupTeamIds.includes(record.team_id) &&
                         !원수사팀TeamIds.includes(record.team_id);
                }
              );
            } else {
              filteredRecords = (recordsData || []).filter(
                (record) => record.team_id === profile.team_id
              );
            }
          }
        }
      } else {
        // 팀이 존재하지 않는 경우: 빈 결과
        filteredRecords = [];
      }
    } else {
      // team_id가 없는 경우: 빈 결과 (super_admin도 팀이 없으면 아무것도 볼 수 없음)
      filteredRecords = [];
    }
  }

  if (recordsError) {
    console.error('Error fetching records:', recordsError);
  }

  if (profileError) {
    console.error('Error fetching profile:', profileError);
  }

  const records: TableData[] =
    filteredRecords.map((record) => ({
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

  const email = user.email || null;
  const userId = user.id;
  const isAdmin = Boolean(profile?.is_admin);
  const userName = profile?.name || email?.split('@')[0] || null;
  const userRole = profile?.role || 'member';
  const userTeamId = profile?.team_id || null;

  return (
    <div>
      <UserInfo email={email} isAdmin={isAdmin} />
      <AddRecordButton currentUserName={userName} currentUserId={userId} userRole={userRole} userTeamId={userTeamId} />
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
