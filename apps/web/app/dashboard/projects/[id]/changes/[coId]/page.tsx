import { createClient } from '@/lib/supabase-server';
import { notFound, redirect } from 'next/navigation';
import {
  getChangeOrder,
  getCoSigningSessions,
  getCoSupersession,
} from '@/lib/services/change-orders';
import { getSubcontractors } from '@/lib/services/subcontractors';
import { redactCoDetail } from '@/lib/co-redaction';
import { CoBuilder } from './co-builder';

// 5D — CO detail / builder. Written identically to an estimate (D-1):
// line items → typed rows, edited while Draft only. Send/void/sign
// drive the lifecycle (§6); the pending signing link re-displays here
// for manual sharing (client delivery is Decision-Gate-gated, F-3).

export default async function ChangeOrderPage({
  params,
}: {
  params: { id: string; coId: string };
}) {
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

  const changeOrder = await getChangeOrder(params.coId);
  if (!changeOrder || changeOrder.project_id !== params.id || changeOrder.is_deleted) {
    notFound();
  }

  const canManage = ['owner', 'admin', 'project_manager'].includes(profile.role);
  // [S168] DELETE is Owner/Admin, narrower than `canManage`. Josh's ruling
  // names the signed/unsigned boundary and is silent on authority; a permanent,
  // unrecoverable removal of a legal document takes the conservative default.
  // The real gate is `change_orders_delete_unsigned` + the BEFORE DELETE
  // trigger (`20261023000000` §5) — this only decides whether to draw a button.
  const canDelete = ['owner', 'admin'].includes(profile.role);
  // §7.3 S-5 as amended by RULING A [S97, 2026-08-02]: CO instrument rates are
  // Owner/Admin only and a PM sees NO rate values — the section is not mounted
  // below Owner/Admin rather than rendered read-only.
  // AUTHORED-BY [Josh, S121] — the same widening as the list, and the same
  // mirror of `change_orders_select_visible`. A PM reaching this page at all
  // means RLS returned them the row, which after 20260830000000 means they
  // authored it; the check is restated rather than assumed so the UI does not
  // depend on a policy staying exactly as it is.
  const canSeeRates =
    ['owner', 'admin'].includes(profile.role) ||
    (profile.role === 'project_manager' && changeOrder.created_by === user.id);

  // Company name (printed-name prefill) + whether a saved signature image is on
  // file (gates the 'saved_image' send mode). contractor_signature_path is a new
  // column — expected type errors vs. un-regenerated database.ts until applied.
  const { data: company } = await supabase
    .from('companies')
    .select('name, contractor_signature_path')
    .eq('id', changeOrder.company_id)
    .maybeSingle();
  const companyName = company?.name ?? '';
  const hasSavedSignature = Boolean(
    (company as { contractor_signature_path?: string | null } | null)?.contractor_signature_path
  );

  // S97 ruling: a new non-fixed CO DEFAULTS to the source estimate's
  // negotiated rates — the rate section prefills from them (the CO still
  // writes its own rate rows). NULL for a no-estimate project: no prefill.
  const { data: project } = await supabase
    .from('projects')
    .select('source_estimate_id')
    .eq('id', params.id)
    .maybeSingle();

  const [subcontractors, sessions, supersession] = await Promise.all([
    getSubcontractors({ status: 'active' }),
    canManage && changeOrder.status === 'sent'
      ? getCoSigningSessions(params.coId)
      : Promise.resolve([]),
    getCoSupersession(params.coId),
  ]);

  const pendingSession =
    sessions.find(
      (s) => s.status === 'pending' && new Date(s.expires_at).getTime() > Date.now()
    ) ?? null;

  return (
    <CoBuilder
      projectId={params.id}
      // Redacted at the boundary — the CO plus every line item and line row.
      // `canSeeRates` gated rendering only, so unit_cost, rate, markup_percent,
      // total and amount rode the payload for every role that reached the page.
      changeOrder={redactCoDetail(changeOrder, canSeeRates)}
      subcontractors={subcontractors.map((s) => ({ id: s.id, name: s.company_name }))}
      canManage={canManage}
      canSeeRates={canSeeRates}
      sourceEstimateId={project?.source_estimate_id ?? null}
      pendingSigningToken={pendingSession?.token ?? null}
      companyName={companyName}
      hasSavedSignature={hasSavedSignature}
      canDelete={canDelete}
      supersedes={supersession.supersedes}
      supersededBy={supersession.supersededBy}
    />
  );
}
