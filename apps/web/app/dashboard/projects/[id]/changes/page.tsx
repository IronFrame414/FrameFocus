import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getChangeOrders } from '@/lib/services/change-orders';
import { getProject } from '@/lib/services/projects';
import { ChangesPanel } from './changes-panel';

// 5D — Change Orders tab. Owner/Admin/PM create + send (D-5); everyone
// with project visibility can view (§8 — RLS enforces assignment
// scoping for PM/Foreman/Crew). Soft delete is Owner/Admin only (§8).

export default async function ProjectChangesPage({ params }: { params: { id: string } }) {
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

  const [changeOrders, project] = await Promise.all([
    getChangeOrders(params.id),
    getProject(params.id),
  ]);

  const canManage = ['owner', 'admin', 'project_manager'].includes(profile.role);
  const canDelete = ['owner', 'admin'].includes(profile.role);

  return (
    <ChangesPanel
      projectId={params.id}
      projectType={project?.project_type ?? 'fixed_price'}
      changeOrders={changeOrders}
      canManage={canManage}
      canDelete={canDelete}
    />
  );
}
