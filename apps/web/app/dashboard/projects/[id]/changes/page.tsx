import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { redactCo } from '@/lib/co-redaction';
import { getChangeOrders } from '@/lib/services/change-orders';
import { getRevisedContract } from '@/lib/services/contract-value';
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

  const [changeOrders, project, contract] = await Promise.all([
    getChangeOrders(params.id),
    getProject(params.id),
    getRevisedContract(params.id),
  ]);

  const canManage = ['owner', 'admin', 'project_manager'].includes(profile.role);
  const canDelete = ['owner', 'admin'].includes(profile.role);
  // Financial floor (ui-01 §11): CO dollar amounts are Owner/Admin only.
  const canSeeFinancials = ['owner', 'admin'].includes(profile.role);

  // ⚠️ REDACTED AT THE BOUNDARY, NOT AT RENDER [S121]. `canSeeFinancials` used
  // to gate only what the panel DREW, while the rows travelled whole — so
  // net_delta, all three markup percents and tax_rate were in the RSC payload
  // for PM, foreman and crew. #136's shape on a third table. The rows still
  // travel (the Floor makes CO counts and statuses visible to every role); the
  // figures do not.
  return (
    <ChangesPanel
      projectId={params.id}
      projectType={project?.project_type ?? 'fixed_price'}
      changeOrders={changeOrders.map((co) => redactCo(co, canSeeFinancials))}
      // A bare money scalar with no gate of its own — it left the server for
      // every role and was drawn for two.
      signedDelta={canSeeFinancials ? contract.signedDelta : null}
      canManage={canManage}
      canDelete={canDelete}
      canSeeFinancials={canSeeFinancials}
    />
  );
}
