import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { recalculateChangeOrderTotalsPrivileged } from '@/lib/services/change-order-totals-server';

// TECH_DEBT #140 / M6M D-62 — recalculate a change order's totals, server side.
//
// instrument_rates is floored to Owner/Admin (20260806000000). A PM may author
// change orders and D-51 puts the lifecycle on a phone, so the pricing runs in
// change-order-totals-server.ts under the SERVICE ROLE and no rate value comes
// back. The response is a success flag; the caller re-reads the CO for its
// total, which it can already read (change_orders_select_visible, TECH_DEBT
// #117 — no role floor there).
//
// THE PRIVILEGE IS NOT PROTECTED BY RLS — the privileged path is protected only
// by the checks made here. All three run BEFORE the privileged code:
//
//   1. authenticated                                → 401
//   2. role is owner / admin / project_manager      → 403
//      (the same three change_orders_update_authorized admits, so this route
//      cannot be used to write totals a caller could not otherwise write)
//   3. the CO is visible to THIS caller through the RLS-scoped client, which
//      applies company scoping and can_view_project                → 404
//
// (3) is load-bearing: a real RLS-scoped read, not a hand-rolled company
// comparison, so a cross-tenant or unassigned id 404s here rather than being
// repriced with service-role privileges.
//
// ⚠️ 403 AND 404 ARE DELIBERATELY DISTINCT, and neither falls through to the
// other. CLAUDE.md: "Auth and permission failures return 401/403 with their own
// message — never fall through to a 'not found' path. A 'not found' response
// means auth passed and the record genuinely doesn't exist." Every failure is
// logged server-side with the route and the failing check; the client message
// is plain, the log never is.

const AUTHORS = ['owner', 'admin', 'project_manager'];

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    console.error('CO RECALCULATE 401', { route: 'change-orders/[id]/recalculate', changeOrderId: params.id, check: 'auth.getUser' });
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();

  if (!profile || !AUTHORS.includes(profile.role)) {
    console.error('CO RECALCULATE 403', {
      route: 'change-orders/[id]/recalculate',
      changeOrderId: params.id,
      check: 'role',
      role: profile?.role ?? null,
    });
    return NextResponse.json(
      { error: 'Only an Owner, Admin or Project Manager can change a change order.' },
      { status: 403 }
    );
  }

  // RLS-scoped: company scoping and can_view_project both apply.
  const { data: co } = await supabase
    .from('change_orders')
    .select('id')
    .eq('id', params.id)
    .eq('is_deleted', false)
    .maybeSingle();

  if (!co) {
    console.error('CO RECALCULATE 404', {
      route: 'change-orders/[id]/recalculate',
      changeOrderId: params.id,
      check: 'rls-scoped change_orders read',
      userId: user.id,
    });
    return NextResponse.json({ error: 'Change order not found' }, { status: 404 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient;
  const result = await recalculateChangeOrderTotalsPrivileged(admin, params.id);

  if (!result.success) {
    // The message may be a NoRateInForceError, which names a rate TYPE and
    // never a rate VALUE — safe to return, and the user needs it to know what
    // to fix. After D-62 it also means what it says: the read behind it was
    // privileged, so "no rate in force" is no longer "you cannot see the rate".
    console.error('CO RECALCULATE FAILED', { changeOrderId: params.id, error: result.error });
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({ success: true });
}
