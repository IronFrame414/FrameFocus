import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getClientContracts, getSubcontractorContracts } from '@/lib/services/contracts';
import { getMembers } from '@/lib/services/members';
import { ContractsPanel } from './contracts-panel';

export default async function ProjectContractsPage({ params }: { params: { id: string } }) {
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

  const [clientContracts, subContracts, subMembers] = await Promise.all([
    getClientContracts(params.id),
    getSubcontractorContracts(params.id),
    getMembers({ member_type: 'subcontractor' }),
  ]);

  const canManage = ['owner', 'admin', 'project_manager'].includes(profile.role);

  return (
    <ContractsPanel
      projectId={params.id}
      clientContracts={clientContracts}
      subContracts={subContracts}
      subMembers={subMembers.map((m) => ({ id: m.id, display_name: m.display_name }))}
      canManage={canManage}
    />
  );
}
