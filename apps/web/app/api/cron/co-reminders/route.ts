import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  buildSenderAddress,
  DEFAULT_CO_REMINDER_BODY,
  DEFAULT_CO_REMINDER_SUBJECT,
  logEmail,
  replaceTemplateVariables,
  sendEmail,
} from '@/lib/services/email-service';
import { ChangeOrderEmail } from '@/lib/email/templates/change-order-email';

// Signed-artifact spec §7.3 — daily Vercel Cron, the change-order equivalent of
// api/cron/estimate-reminders. One pass (reminders only): a CO has no
// expiration lifecycle of its own — the signing session expires, but the CO
// stays `sent`. Fire step N when reminder_count = N AND sent_at +
// schedule[N] days ≤ now AND an active pending co_signing_session exists.
// Effective schedule: CO override ?? company default ?? [3,7,14]. Skips COs
// whose session has no recipient email (nothing to remind). Secured by
// CRON_SECRET (Vercel sends Authorization: Bearer).

export const maxDuration = 300;

const DEFAULT_SCHEDULE = [3, 7, 14];

function asSchedule(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 1)) return null;
  return value as number[];
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const now = new Date();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  const { data: candidates, error: fetchError } = await admin
    .from('change_orders')
    .select(
      'id, company_id, co_number, title, sent_at, reminder_schedule, reminder_count, last_reminder_sent_at'
    )
    .eq('status', 'sent')
    .eq('is_deleted', false);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const changeOrders = candidates ?? [];
  const companyIds = Array.from(new Set(changeOrders.map((c) => c.company_id)));
  const { data: companies } = companyIds.length
    ? await admin
        .from('companies')
        .select('id, name, slug, logo_url, brand_color, default_reminder_schedule')
        .in('id', companyIds)
    : { data: [] };
  const companyById = new Map((companies ?? []).map((c) => [c.id, c]));

  let remindersSent = 0;
  const errors: string[] = [];

  for (const co of changeOrders) {
    const company = companyById.get(co.company_id);
    if (!company) continue;
    if (!co.sent_at) continue;

    const schedule =
      asSchedule(co.reminder_schedule) ??
      asSchedule(company.default_reminder_schedule) ??
      DEFAULT_SCHEDULE;
    if (co.reminder_count >= schedule.length) continue;

    const dueAt = new Date(co.sent_at);
    dueAt.setDate(dueAt.getDate() + schedule[co.reminder_count]);
    if (dueAt.getTime() > now.getTime()) continue;

    // The link to remind about — no active session means nothing to remind.
    const { data: session } = await admin
      .from('co_signing_sessions')
      .select('id, token, recipient_email, recipient_name, expires_at')
      .eq('change_order_id', co.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!session || !session.recipient_email) continue;

    const signingUrl = `${appUrl}/sign-co/${session.token}`;
    const variables: Record<string, string> = {
      company_name: company.name,
      contact_name: session.recipient_name ?? 'there',
      co_number: co.co_number,
      co_title: co.title,
      signing_link: signingUrl,
      expiration_date: fmtDate(session.expires_at),
      sent_date: fmtDate(co.sent_at),
    };

    const subject = replaceTemplateVariables(DEFAULT_CO_REMINDER_SUBJECT, variables);
    const bodyText = replaceTemplateVariables(DEFAULT_CO_REMINDER_BODY, variables);
    const sender = buildSenderAddress(company);

    const { messageId, error: sendError } = await sendEmail({
      from: sender,
      // +REPLY-TO [S97]: a client's reply reaches the COMPANY, not the
      // platform domain. Resolved in sendEmail so senders inherit it.
      replyToCompanyId: company.id,
      to: session.recipient_email,
      subject,
      react: ChangeOrderEmail({
        companyName: company.name,
        logoUrl: company.logo_url,
        brandColor: company.brand_color || '#1a56db',
        bodyText,
        signingUrl,
      }),
    });

    await logEmail(admin, {
      company_id: co.company_id,
      estimate_id: null,
      signing_session_id: null,
      change_order_id: co.id,
      co_signing_session_id: session.id,
      resend_message_id: messageId,
      email_type: 'co_reminder',
      recipient_email: session.recipient_email,
      sender_email: sender,
      subject,
      status: sendError ? 'failed' : 'sent',
      metadata: {
        reminder_step: co.reminder_count + 1,
        ...(sendError ? { error: sendError } : {}),
      },
    });

    if (sendError) {
      errors.push(`co_reminder ${co.co_number}: ${sendError}`);
      continue;
    }

    const { error: countError } = await admin
      .from('change_orders')
      .update({
        reminder_count: co.reminder_count + 1,
        last_reminder_sent_at: now.toISOString(),
      })
      .eq('id', co.id);
    if (countError) {
      errors.push(`co_reminder-count ${co.co_number}: ${countError.message}`);
      continue;
    }
    remindersSent++;
  }

  return NextResponse.json({ checked: changeOrders.length, remindersSent, errors });
}
