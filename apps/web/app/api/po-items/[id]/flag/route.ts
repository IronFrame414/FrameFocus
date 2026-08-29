import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notifyPoItemMissing } from '@/lib/notify/po-missing-notify';

// PO module R6.3/R7 — flag a PO line missing on a material run.
//
// The WRITE runs as the caller's session: flag_po_item_missing is SECURITY
// DEFINER but does its own gating (assigned member, or O/A/PM) off the
// caller's identity — the route adds no authority. The NOTIFICATION runs on
// the admin client after the write succeeds (notify() pushes through the
// service role; the incident-notify shape). Notify failure never unflags —
// the flag is the record, the ping is delivery.
//
// Errors: the RPC's refusal sentences are shown verbatim (they name the real
// cause); nothing here falls through to a generic "not found".

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  let note = '';
  try {
    const body = (await request.json()) as { note?: string };
    note = typeof body.note === 'string' ? body.note : '';
  } catch {
    // A body-less POST flags with no note — the RPC accepts that.
  }

  const { error } = await supabase.rpc('flag_po_item_missing', {
    p_item_id: params.id,
    p_note: note,
  });
  if (error) {
    console.error(`[po-items/flag] ${params.id}: ${error.message}`);
    const status = /not assigned/.test(error.message) ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  try {
    await notifyPoItemMissing(getSupabaseAdmin() as never, params.id);
  } catch (notifyError) {
    // Logged, not surfaced: the flag stood; only the ping failed.
    console.error(`[po-items/flag] notify failed for ${params.id}:`, notifyError);
  }

  return NextResponse.json({ ok: true });
}
