import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getProjectAssignments } from '@/lib/services/project-assignments';
import { getMembers } from '@/lib/services/members';
import { TeamPanel } from './team-panel';

export default async function ProjectTeamPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) redirect('/dashboard');

  const [assignments, members] = await Promise.all([
    getProjectAssignments(params.id),
    getMembers(),
  ]);

  const canManage = ['owner', 'admin', 'project_manager'].includes(profile.role);

  return (
    <TeamPanel
      projectId={params.id}
      assignments={assignments}
      members={members.map((m) => ({
        id: m.id,
        display_name: m.display_name,
        member_type: m.member_type,
      }))}
      canManage={canManage}
    />
  );
}
