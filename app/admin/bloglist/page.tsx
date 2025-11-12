import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AdminTable from '@/components/AdminTable/AdminTable';
import { TableData } from '@/components/Table/Table';

async function getRecords(userTeamId: string | null, userRole: string | null): Promise<TableData[]> {
  const supabase = await createClient();
  let query = supabase
    .from('blog_records')
    .select('*')
    .order('created_at', { ascending: false });

  // 팀 그룹별 필터링 (owner만 모든 기록 볼 수 있음, super_admin도 팀 필터링 받음)
  // owner 체크는 페이지 레벨에서 이미 했으므로 여기서는 팀 필터링만 수행
  if (userRole !== 'owner' && userTeamId) {
    const { data: userTeam } = await supabase
      .from('teams')
      .select('id, name, group_id, groups:group_id(id, name)')
      .eq('id', userTeamId)
      .single();

    if (userTeam) {
      const teamName = userTeam.name;
      const userGroup = (userTeam as any).groups;
      const userGroupName = userGroup?.name || null;
      
      // 그룹 기반 필터링 (그룹이 있는 경우)
      if (userGroupName) {
        if (userGroupName === '원수사팀') {
          // 원수사팀 그룹: 원수사팀의 기록만 표시
          query = query.eq('team_id', userTeamId);
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
          
          if (salesGroupTeamIds.length > 0) {
            const filteredTeamIds = salesGroupTeamIds.filter(id => !원수사팀TeamIds.includes(id));
            if (filteredTeamIds.length > 0) {
              query = query.in('team_id', filteredTeamIds);
            } else {
              return [];
            }
          } else {
            return [];
          }
        } else {
          // 다른 그룹: 자신의 그룹 기록만 표시
          const { data: sameGroupTeams } = await supabase
            .from('teams')
            .select('id')
            .eq('group_id', userGroup.id);
          
          const sameGroupTeamIds = sameGroupTeams?.map((t) => t.id) || [];
          
          if (sameGroupTeamIds.length > 0) {
            query = query.in('team_id', sameGroupTeamIds);
          } else {
            query = query.eq('team_id', userTeamId);
          }
        }
      } else {
        // 그룹이 없는 경우: 기존 로직 (하위 호환성)
        if (teamName === '원수사팀' || teamName === '원수사') {
          query = query.eq('team_id', userTeamId);
        } else {
          // 1팀, 1-1팀, 2팀, 3팀 (영업단): 이 그룹의 기록만 표시
          const groupTeamNames = ['1팀', '1-1팀', '2팀', '3팀'];
          
          const { data: groupTeams } = await supabase
            .from('teams')
            .select('id, name')
            .in('name', groupTeamNames);
          
          const groupTeamIds = groupTeams?.map((t) => t.id) || [];
          const isInSalesGroup = groupTeamNames.includes(teamName) || groupTeamIds.includes(userTeamId);
          
          if (isInSalesGroup) {
            const { data: 원수사팀Data } = await supabase
              .from('teams')
              .select('id')
              .in('name', ['원수사팀', '원수사'])
              .limit(1);
            
            const 원수사팀TeamIds = 원수사팀Data?.map((t) => t.id) || [];
            
            if (groupTeamIds.length > 0) {
              const filteredTeamIds = groupTeamIds.filter(id => !원수사팀TeamIds.includes(id));
              if (filteredTeamIds.length > 0) {
                query = query.in('team_id', filteredTeamIds);
              } else {
                return [];
              }
            } else {
              return [];
            }
          } else {
            query = query.eq('team_id', userTeamId);
          }
        }
      }
    }
  }

  const { data, error } = await query;

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

  // 블로그 관리는 owner만 접근 가능
  if (!profile || profile.role !== 'owner') {
    redirect('/');
  }

  const records = await getRecords(profile.team_id, profile.role);

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

