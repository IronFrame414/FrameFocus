import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Spec 2 — Resend delivery webhook. Signature verified with svix
// (locked decision Q3) against RESEND_SIGNING_SECRET. Correlates via
// data.email_id ↔ email_logs.resend_message_id and advances the log
// row's status + timestamps. Idempotent: replays write the same
// values; a regressive event (e.g. `sent` after `opened`) never
// downgrades the status.

// Status precedence — higher never moves back to lower.
const STATUS_RANK: Record<string, number> = {
  sent: 1,
  delivered: 2,
  opened: 3,
  bounced: 4,
  complained: 4,
  failed: 4,
};

const EVENT_MAP: Record<string, { status: string; timestampColumn: string | null }> = {
  'email.sent': { status: 'sent', timestampColumn: null },
  'email.delivered': { status: 'delivered', timestampColumn: 'delivered_at' },
  'email.opened': { status: 'opened', timestampColumn: 'opened_at' },
  'email.bounced': { status: 'bounced', timestampColumn: 'bounced_at' },
  'email.complained': { status: 'complained', timestampColumn: null },
  'email.failed': { status: 'failed', timestampColumn: null },
};

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_SIGNING_SECRET;
  if (!secret) {
    // Configured after the Resend dashboard webhook is created.
    return NextResponse.json(
      { error: 'RESEND_SIGNING_SECRET is not configured' },
      { status: 500 }
    );
  }

  const payload = await request.text();
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 });
  }

  let event: { type: string; created_at: string; data: { email_id?: string } };
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as typeof event;
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const mapping = EVENT_MAP[event.type];
  const emailId = event.data?.email_id;
  if (!mapping || !emailId) {
    // Unknown event types are acknowledged so Resend stops retrying.
    return NextResponse.json({ received: true });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  const { data: log } = await admin
    .from('email_logs')
    .select('id, status, metadata')
    .eq('resend_message_id', emailId)
    .maybeSingle();
  if (!log) {
    // Not one of ours (or logged under a different id) — acknowledge.
    return NextResponse.json({ received: true });
  }

  const updates: Record<string, unknown> = {
    metadata: {
      ...((log.metadata as Record<string, unknown>) ?? {}),
      [`webhook_${event.type}`]: event.created_at,
    },
  };
  if ((STATUS_RANK[mapping.status] ?? 0) >= (STATUS_RANK[log.status] ?? 0)) {
    updates.status = mapping.status;
  }
  if (mapping.timestampColumn) {
    updates[mapping.timestampColumn] = event.created_at;
  }

  const { error } = await admin.from('email_logs').update(updates).eq('id', log.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
