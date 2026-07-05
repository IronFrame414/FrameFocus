import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { coSendSchema } from '@framefocus/shared/validation/co-signing';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  createCoSigningSession,
  invalidateSessionsForChangeOrder,
} from '@/lib/services/co-signing-service';

// 5D §6 — "Send" a change order. Sending IS the internal contractor-side
// acceptance (D-4): there is no separate approval gate. Owner/Admin/PM
// all send (D-5). Flips draft → sent, mints a tokenized signing link the
// contractor shares manually — NO email goes out at launch (client
// delivery is gated by the Pre-Module 9 Decision Gate, F-3). Re-sending
// a sent CO invalidates the old link and mints a fresh one.

const DEFAULT_EXPIRES_IN_DAYS = 30;

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
      { error: 'Only Owner, Admin, or Project Manager can send change orders' },
      { status: 403 }
    );
  }

  let parsed;
  try {
    parsed = coSendSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }
  const input = parsed.data;

  // RLS-scoped fetch — cross-tenant ids 404 here.
  const { data: co } = await supabase
    .from('change_orders')
    .select('id, status, co_number, company_id')
    .eq('id', params.id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!co) return NextResponse.json({ error: 'Change order not found' }, { status: 404 });

  if (co.status !== 'draft' && co.status !== 'sent') {
    return NextResponse.json(
      { error: `Only Draft or Sent change orders can be sent (status: ${co.status})` },
      { status: 409 }
    );
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  const sentAt = new Date();
  const expiresAt = new Date(sentAt);
  expiresAt.setDate(expiresAt.getDate() + (input.expires_in_days ?? DEFAULT_EXPIRES_IN_DAYS));

  // Only one active signing link per CO, ever.
  await invalidateSessionsForChangeOrder(admin, co.id);

  const session = await createCoSigningSession(admin, {
    companyId: co.company_id,
    changeOrderId: co.id,
    recipientEmail: input.recipient_email ?? null,
    recipientName: input.recipient_name ?? null,
    expiresAt: expiresAt.toISOString(),
  });
  if (!session.token) {
    return NextResponse.json(
      { error: session.error ?? 'Could not create a signing session' },
      { status: 500 }
    );
  }

  // Freeze the CO on first send. RLS-scoped client — Owner/Admin/PM UPDATE path.
  if (co.status === 'draft') {
    const { error: updateError } = await supabase
      .from('change_orders')
      .update({ status: 'sent', sent_at: sentAt.toISOString() })
      .eq('id', co.id);
    if (updateError) {
      await invalidateSessionsForChangeOrder(admin, co.id);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return NextResponse.json({
    success: true,
    signingUrl: `${appUrl}/sign-co/${session.token}`,
  });
}
