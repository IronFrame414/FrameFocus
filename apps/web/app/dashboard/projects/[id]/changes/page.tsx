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
  // ── Financial floor, AS RULED [Josh, S121] — PM SCOPE IS AUTHORED-BY ──────
  //
  // _Superseded, quoted:_ _"Financial floor (ui-01 §11): CO dollar amounts are
  // Owner/Admin only."_ — that denied a PM the figures on change orders they
  // wrote themselves, which was NARROWER than the S97 ruling it cited.
  //
  // **This is a deliberate WIDENING alongside the floor, not only a
  // tightening.** A desktop PM gains access they did not have. It mirrors
  // `change_orders_select_visible` (20260830000000) exactly, which is the
  // point: the UI and the policy now answer the same question the same way, so
  // a PM's own CO does not render as an em-dash on a row the database happily
  // returned.
  //
  // Per-ROW, not per-user, so `canSeeFinancials` is a function now. Owner and
  // Admin see everything; a PM sees what they created; nobody else reaches this
  // list at all, because RLS returns them no rows.
  const isFinanceRole = ['owner', 'admin'].includes(profile.role);
  const canSeeCoMoney = (createdBy: string | null) =>
    isFinanceRole || (profile.role === 'project_manager' && createdBy === user.id);

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
      changeOrders={changeOrders.map((co) => redactCo(co, canSeeCoMoney(co.created_by)))}
      // A bare money scalar with no gate of its own — it left the server for
      // every role and was drawn for two.
      // The SUM stays Owner/Admin. It aggregates across authors, so a PM who
      // may see one CO's value must not receive a total that encodes the
      // others' — the authored-by ruling is per change order, not per project.
      signedDelta={isFinanceRole ? contract.signedDelta : null}
      canManage={canManage}
      canDelete={canDelete}
      // THE COLUMN, for anyone who might see a figure in it — a PM's own CO
      // renders, others' render as blank because the value is null.
      canSeeFinancials={isFinanceRole || profile.role === 'project_manager'}
      // THE SUMS, Owner/Admin only. See `signedDelta` above: a total across
      // authors is not a figure the authored-by ruling grants a PM, and a
      // PARTIAL total labelled "pending" would be worse than none.
      canSeeSums={isFinanceRole}
    />
  );
}
