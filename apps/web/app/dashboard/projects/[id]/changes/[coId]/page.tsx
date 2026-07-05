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
      pendingSigningToken={pendingSession?.token ?? null}
    />
  );
}
