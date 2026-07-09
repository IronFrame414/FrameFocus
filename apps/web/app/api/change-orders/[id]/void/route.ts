import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { invalidateSessionsForChangeOrder } from '@/lib/services/co-signing-service';

// 5D §6 / F-1 — void a CO withdrawn before signature (draft or sent).
// There is no post-send edit path at launch: revising means void + write
// a new CO. Kills any pending signing link (service-role — sessions have
// no client write policies). A signed CO cannot be voided here (F-4:
// reversing a binding CO is unpinned; interview before building it).

export async function POST(
  _request: NextRequest,
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

  // RLS-scoped fetch — cross-tenant ids 404 here.
  const { data: co } = await supabase
    .from('change_orders')
    .select('id, status')
    .eq('id', params.id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!co) return NextResponse.json({ error: 'Change order not found' }, { status: 404 });

  if (co.status !== 'draft' && co.status !== 'sent') {
    return NextResponse.json(
      { error: `Only Draft or Sent change orders can be voided (status: ${co.status})` },
      { status: 409 }
    );
  }

  const { error: updateError } = await supabase
    .from('change_orders')
    .update({ status: 'voided' })
    .eq('id', co.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  await invalidateSessionsForChangeOrder(admin, co.id);

  return NextResponse.json({ success: true });
}
