import { createClient } from '@/lib/supabase-server';
import { notFound, redirect } from 'next/navigation';
import { getChangeOrder, getCoSigningSessions } from '@/lib/services/change-orders';
import { getSubcontractors } from '@/lib/services/subcontractors';
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
  // §7.3 S-5: CO instrument rates are Owner/Admin only; PM sees read-only.
  const canEditRates = ['owner', 'admin'].includes(profile.role);

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

  const [subcontractors, sessions] = await Promise.all([
    getSubcontractors({ status: 'active' }),
    canManage && changeOrder.status === 'sent'
      ? getCoSigningSessions(params.coId)
      : Promise.resolve([]),
  ]);

  const pendingSession =
    sessions.find(
      (s) => s.status === 'pending' && new Date(s.expires_at).getTime() > Date.now()
    ) ?? null;

  return (
    <CoBuilder
      projectId={params.id}
      changeOrder={changeOrder}
      subcontractors={subcontractors.map((s) => ({ id: s.id, name: s.company_name }))}
      canManage={canManage}
      canEditRates={canEditRates}
      pendingSigningToken={pendingSession?.token ?? null}
      companyName={companyName}
      hasSavedSignature={hasSavedSignature}
    />
  );
}
