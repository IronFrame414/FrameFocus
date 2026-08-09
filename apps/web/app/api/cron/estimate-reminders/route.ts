import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  buildSenderAddress,
  DEFAULT_REMINDER_BODY,
  DEFAULT_REMINDER_SUBJECT,
  logEmail,
  replaceTemplateVariables,
  sendEmail,
  type TemplateVariables,
} from '@/lib/services/email-service';
import { notifyManagers } from '@/lib/services/signing-service';
import { ReminderEmail } from '@/lib/email/templates/reminder-email';
import { notify } from '@/lib/notify/notify';
import { getManagerNotifyRecipients } from '@/lib/notify/recipients';
import { isFinalReminderStep } from '@framefocus/shared/utils/reminders';

// Spec 2 (4J) — daily Vercel Cron. Two passes:
//   1. Reminders: fire step N when reminder_count = N-1 AND
//      sent_at + schedule[N-1] days ≤ now AND status still `sent`
//      (J6 double-send prevention). Effective schedule: estimate
//      override ?? company default ?? [3,7,14]; [] = opted out.
//      Skips unsubscribed clients (J5) and estimates without an
//      active signing session (hand-delivered via Mark as Sent —
//      there is no link to remind about).
//   2. Expiration: status `sent` AND expires_at < now → `expired`,
//      pending sessions expired, Owner/Admin notified. Data is
//      preserved — nothing is deleted (J7).
// Secured by CRON_SECRET (Vercel sends Authorization: Bearer).

export const maxDuration = 300;

const DEFAULT_SCHEDULE = [3, 7, 14];

function asSchedule(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 1)) return null;
  return value as number[];
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
    .from('estimates')
    .select(
      'id, company_id, contact_id, name, estimate_number, status, sent_at, expires_at, reminder_schedule, reminder_count, last_reminder_sent_at, client_unsubscribed_at'
    )
    .eq('status', 'sent')
    .eq('is_deleted', false);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const estimates = candidates ?? [];
  const companyIds = Array.from(new Set(estimates.map((e) => e.company_id)));
  const { data: companies } = companyIds.length
    ? await admin
        .from('companies')
        .select(
          'id, name, slug, logo_url, brand_color, default_reminder_schedule, default_reminder_email_subject, default_reminder_email_body'
        )
        .in('id', companyIds)
    : { data: [] };
  const companyById = new Map((companies ?? []).map((c) => [c.id, c]));

  let remindersSent = 0;
  let expired = 0;
  const errors: string[] = [];

  for (const estimate of estimates) {
    const company = companyById.get(estimate.company_id);
    if (!company) continue;

    // ── Pass 2 candidate: expiration wins over reminders ──
    if (estimate.expires_at && new Date(estimate.expires_at).getTime() < now.getTime()) {
      const { error: expireError } = await admin
        .from('estimates')
        .update({ status: 'expired' })
        .eq('id', estimate.id)
        .eq('status', 'sent');
      if (expireError) {
        errors.push(`expire ${estimate.estimate_number}: ${expireError.message}`);
        continue;
      }
      await admin
        .from('signing_sessions')
        .update({ status: 'expired' })
        .eq('estimate_id', estimate.id)
        .eq('status', 'pending');
      await notifyManagers(admin, {
        companyId: estimate.company_id,
        estimateId: estimate.id,
        emailType: 'estimate_expired',
        heading: `Estimate expired: ${estimate.estimate_number}`,
        message: `"${estimate.name}" (${estimate.estimate_number}) passed its expiration date without a response and has been marked Expired.\nAll data is preserved — create a new version to revive it.`,
      });
      expired++;
      continue;
    }

    // ── Pass 1: reminders ──
    if (!estimate.sent_at) continue;
    if (estimate.client_unsubscribed_at) continue;

    const schedule =
      asSchedule(estimate.reminder_schedule) ??
      asSchedule(company.default_reminder_schedule) ??
      DEFAULT_SCHEDULE;
    if (estimate.reminder_count >= schedule.length) continue;

    const dueAt = new Date(estimate.sent_at);
    dueAt.setDate(dueAt.getDate() + schedule[estimate.reminder_count]);
    if (dueAt.getTime() > now.getTime()) continue;

    // The link to remind about — hand-delivered estimates have none.
    const { data: session } = await admin
      .from('signing_sessions')
      .select('id, token, recipient_email, recipient_name')
      .eq('estimate_id', estimate.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!session) continue;

    const signingUrl = `${appUrl}/sign/${session.token}`;
    const variables: TemplateVariables = {
      company_name: company.name,
      contact_name: session.recipient_name ?? 'there',
      estimate_number: estimate.estimate_number,
      estimate_name: estimate.name,
      signing_link: signingUrl,
      expiration_date: estimate.expires_at
        ? new Date(estimate.expires_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : '—',
      sent_date: new Date(estimate.sent_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    };

    const subject = replaceTemplateVariables(
      company.default_reminder_email_subject || DEFAULT_REMINDER_SUBJECT,
      variables
    );
    const bodyText = replaceTemplateVariables(
      company.default_reminder_email_body || DEFAULT_REMINDER_BODY,
      variables
    );
    const sender = buildSenderAddress(company);

    const { messageId, error: sendError } = await sendEmail({
      from: sender,
      // +REPLY-TO [S97]: a client's reply reaches the COMPANY, not the
      // platform domain. Resolved in sendEmail so senders inherit it.
      replyToCompanyId: company.id,
      to: session.recipient_email,
      subject,
      react: ReminderEmail({
        companyName: company.name,
        logoUrl: company.logo_url,
        brandColor: company.brand_color || '#1a56db',
        bodyText,
        signingUrl,
        unsubscribeUrl: `${appUrl}/api/sign/unsubscribe/${session.token}`,
      }),
    });

    await logEmail(admin, {
      company_id: estimate.company_id,
      estimate_id: estimate.id,
      signing_session_id: session.id,
      resend_message_id: messageId,
      email_type: 'reminder',
      recipient_email: session.recipient_email,
      sender_email: sender,
      subject,
      status: sendError ? 'failed' : 'sent',
      metadata: { reminder_step: estimate.reminder_count + 1, ...(sendError ? { error: sendError } : {}) },
    });

    if (sendError) {
      errors.push(`reminder ${estimate.estimate_number}: ${sendError}`);
      continue;
    }

    const { error: countError } = await admin
      .from('estimates')
      .update({
        reminder_count: estimate.reminder_count + 1,
        last_reminder_sent_at: now.toISOString(),
      })
      .eq('id', estimate.id);
    if (countError) {
      errors.push(`reminder-count ${estimate.estimate_number}: ${countError.message}`);
      continue;
    }
    remindersSent++;

    // ── §3f — reminders exhausted [S123 slice 5] ──
    //
    // ONE ROW WHEN THE LAST REMINDER GOES OUT, NOT ONE PER REMINDER. Option B,
    // founder-decided at S89: the useful signal is "we have run out of
    // reminders and they still have not signed", which happens exactly once.
    // A row per send would put three notifications in front of an Owner for one
    // estimate and train them to ignore the fourth.
    //
    // The count was just advanced, so `reminder_count + 1` is the number of
    // reminders now sent. The predicate lives in the shared package because
    // this route cannot be driven from a test without mailing a fabricated
    // client through Resend — see reminders.ts for the two off-by-ones it
    // exists to pin. Re-entry for the same estimate is separately impossible:
    // line ~117 (`reminder_count >= schedule.length`) already `continue`s past
    // any estimate that is out of steps.
    if (isFinalReminderStep(estimate.reminder_count, schedule.length)) {
      try {
        const managers = await getManagerNotifyRecipients(admin, estimate.company_id);
        await notify({
          admin,
          companyId: estimate.company_id,
          type: 'reminders_exhausted',
          recipients: managers,
          // No money in this text, so every manager gets the same bytes — but
          // the estimate's VALUE is deliberately absent rather than incidental:
          // R7 would have to gate it, and the notification's job is to say the
          // client has gone quiet, not to restate the number.
          render: () => ({
            title: `${estimate.name}: all reminders sent, still unsigned.`,
            body: `${estimate.estimate_number} — ${schedule.length} reminder${
              schedule.length === 1 ? '' : 's'
            } sent since ${new Date(estimate.sent_at!).toLocaleDateString('en-US')}.`,
          }),
          linkKey: 'estimate',
          linkParams: { id: estimate.id },
          source: { table: 'estimates', id: estimate.id },
          tag: `reminders-exhausted-${estimate.id}`,
        });
      } catch (err) {
        // A cron that throws here would abandon every estimate after this one
        // in the loop. The reminder itself already went out and its count is
        // committed; the notification is the least important thing in scope.
        errors.push(
          `reminders-exhausted ${estimate.estimate_number}: ${
            err instanceof Error ? err.message : 'unknown'
          }`
        );
      }
    }
  }

  return NextResponse.json({
    checked: estimates.length,
    remindersSent,
    expired,
    errors,
  });
}
