import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { invalidateSessionsForChangeOrder } from '@/lib/services/co-signing-service';
import { DISCARDED, applied } from '@/lib/services/mutation-result';

// 5D §6 / F-1 — withdraw a change order.
//
// ============================================================================
// ⚠️ [S168] TWO THINGS CHANGED HERE, AND BOTH WERE RULED
// ============================================================================
//
// 1. A REASON IS NOW REQUIRED, on every void, signed or unsigned. Josh ruled
//    against distinguishing the two: *"user should give reason for void."*
//
// 2. A SIGNED CO CAN NOW BE VOIDED. The previous version of this file refused
//    anything but draft/sent, citing F-4 (*"reversing a binding CO is unpinned;
//    interview before building it"*). That interview happened at S168 and the
//    answer is yes — void, with a reason, and **the signed artifact is
//    retained** (`signed-artifact-spec.md`: a document the client actually saw
//    is never destroyed). Voiding retires it; nothing here deletes a PDF, a
//    signature image or a `co_signing_sessions` row.
//
// ⚠️ AND THE GATE IS NOT IN THIS FILE. `enforce_change_order_void_authority`
// (`20261023000000`) enforces the reason and the authority in the database,
// because a route-only gate leaves every direct PostgREST call open — the
// defect class behind #117, the S97 financial-floor failures, and #1-s146.
// The checks below produce good sentences; the trigger produces the guarantee.

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile || !['owner', 'admin', 'project_manager'].includes(profile.role)) {
    return NextResponse.json(
      { error: 'Only Owner, Admin, or Project Manager can void change orders' },
      { status: 403 }
    );
  }

  let reason = '';
  try {
    const body = (await request.json()) as { reason?: unknown };
    reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  } catch {
    reason = '';
  }
  if (!reason) {
    return NextResponse.json(
      { error: 'A reason is required to void a change order.' },
      { status: 400 }
    );
  }

  // RLS-scoped fetch — cross-tenant ids 404 here.
  const { data: co } = await supabase
    .from('change_orders')
    .select('id, status')
    .eq('id', params.id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!co) return NextResponse.json({ error: 'Change order not found' }, { status: 404 });

  // The one lifecycle refusal left: a voided CO is frozen forever
  // (`enforce_change_order_immutability`). Draft, sent and signed all void.
  if (co.status === 'voided') {
    return NextResponse.json(
      { error: 'This change order is already voided.' },
      { status: 409 }
    );
  }

  // ⚠️ `.select('id')` + `applied()` — mutation-result.ts, no exceptions. A
  // zero-row UPDATE is not an error in Postgres, so without this a PM whose
  // write the void-authority trigger never saw would be told a legal document
  // had been withdrawn. That is #1-s146, verbatim.
  //
  // `voided_by` / `voided_at` are NOT sent: the trigger stamps them from
  // `auth.uid()` and `now()`, so a forged payload cannot claim somebody else
  // withdrew the document.
  const { data: updated, error: updateError } = await supabase
    .from('change_orders')
    .update({ status: 'voided', void_reason: reason })
    .eq('id', co.id)
    .select('id');

  if (updateError) {
    console.error('[co/void] update refused', {
      changeOrderId: co.id,
      status: co.status,
      role: profile.role,
      message: updateError.message,
    });
    return NextResponse.json({ error: updateError.message }, { status: 403 });
  }
  if (!applied(updated)) {
    console.error('[co/void] update affected zero rows', {
      changeOrderId: co.id,
      status: co.status,
      role: profile.role,
    });
    return NextResponse.json({ error: DISCARDED }, { status: 403 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  await invalidateSessionsForChangeOrder(admin, co.id);

  return NextResponse.json({ success: true });
}
