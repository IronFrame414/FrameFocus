import 'server-only';
import { createElement } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { isPostponed } from '@/lib/trial/lifecycle';
import { formatDeletionDate } from '@/lib/trial/resubscribe';
import {
  RetentionWarningEmail,
  retentionWarningSubject,
  type RetentionWarningKind,
} from '@/lib/email/templates/retention-warning-email';
import {
  sendEmail,
  logEmail,
  SENDING_DOMAIN,
  type SendEmailParams,
} from '@/lib/services/email-service';
import { getManagerNotifyRecipients } from '@/lib/notify/recipients';
import { brand } from '@/lib/brand';

/**
 * The retention warnings that precede permanent deletion [R3; rulings on
 * deletion-sweep-analysis.md Q5/Q8/Q9; copy ruled in
 * docs/specs/retention-warning-emails.md].
 *
 *   cancellation (90-day window): warning 1 at <= 60 days remaining,
 *                                 warning 2 at <= 30 days remaining
 *   trial        (14-day window): warning 1 at <=  4 days remaining
 *
 * ⚠️ DAYS ARE COUNTED BACK FROM `delete_after` [Q9], never forward from
 * `locked_at`: `delete_after` is the stored fact the email NAMES and the sweep
 * ENFORCES. A row whose date is ever moved re-times its warnings from the same
 * fact — counting from `locked_at` would name one date and time itself
 * against another.
 *
 * ⚠️ EMAIL ONLY. A locked user cannot see an in-app notification, so no
 * notify() call — the channel that reaches them is the only one used.
 *
 * The stamps are the idempotency guard (the warned_7_at doctrine): written in
 * the same step as the send, read instead of the calendar. A missed cron day
 * sends LATE, never silently skips. Unlike the notify() path, a send that
 * FAILS for every recipient leaves the stamp NULL so tomorrow retries — a
 * Resend outage must not eat the only notice a customer gets. A partial
 * success stamps: the company was warned, and re-sending to the recipients
 * that succeeded would double-warn them.
 */

export interface RetentionWarningOutcome {
  checked: number;
  sent1: number;
  sent2: number;
  /** Rows inside a warning window whose stamp already blocks a resend. */
  skipped: number;
  errors: string[];
}

interface RetentionRow {
  company_id: string;
  reason: string;
  locked_at: string;
  delete_after: string;
  postponed_until: string | null;
  retention_warned_1_at: string | null;
  retention_warned_2_at: string | null;
  resubscribe_token: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `now` until `deleteAfter`, rounded up (6.2 left is "7"). */
export function daysUntilDeletion(deleteAfter: string, now: Date): number {
  return Math.ceil((new Date(deleteAfter).getTime() - now.getTime()) / DAY_MS);
}

/**
 * Which warning, if any, does this row get right now? Pure — the unit tests
 * drive the boundaries through this.
 *
 * The urgent warning is checked FIRST (the day −3 precedent), and — unlike
 * that precedent — firing it SUBSUMES the earlier one: `stampsFor()` marks
 * both, so a company that enters the window late gets one urgent warning, not
 * an urgent one today and a stale "60 days left" tomorrow. (runTrialWarnings
 * has exactly that latent stale-send; fixed alongside this, same doctrine.)
 */
export function decideRetentionWarning(
  row: Pick<
    RetentionRow,
    'reason' | 'delete_after' | 'retention_warned_1_at' | 'retention_warned_2_at'
  >,
  now: Date
): RetentionWarningKind | null {
  const left = daysUntilDeletion(row.delete_after, now);
  if (left <= 0) return null; // past due belongs to the sweep — never warn a past date

  if (row.reason === 'cancellation') {
    if (left <= 30 && !row.retention_warned_2_at) return 'cancellation_30';
    if (left <= 60 && !row.retention_warned_1_at) return 'cancellation_60';
    return null;
  }
  // trial
  if (left <= 4 && !row.retention_warned_1_at) return 'trial_4';
  return null;
}

/** The stamp update a fired warning writes — the urgent one subsumes both. */
export function stampsFor(
  kind: RetentionWarningKind,
  row: Pick<RetentionRow, 'retention_warned_1_at'>,
  now: Date
): { retention_warned_1_at?: string; retention_warned_2_at?: string } {
  const iso = now.toISOString();
  if (kind === 'cancellation_30') {
    return row.retention_warned_1_at
      ? { retention_warned_2_at: iso }
      : { retention_warned_1_at: iso, retention_warned_2_at: iso };
  }
  return { retention_warned_1_at: iso };
}

export interface RetentionWarningDeps {
  /** Injectable sender so tests capture instead of calling Resend. */
  send: (params: SendEmailParams) => Promise<{ messageId: string | null; error: string | null }>;
  /** The Stripe customer's email, or null — injectable so tests skip Stripe. */
  stripeCustomerEmail: (stripeCustomerId: string) => Promise<string | null>;
}

async function defaultStripeCustomerEmail(stripeCustomerId: string): Promise<string | null> {
  const { getStripe } = await import('@/lib/stripe');
  const customer = await getStripe().customers.retrieve(stripeCustomerId);
  if (typeof customer === 'object' && !('deleted' in customer && customer.deleted)) {
    return (customer as { email?: string | null }).email ?? null;
  }
  return null;
}

/**
 * Reply-To: the first platform admin [§S1 — "a real reply address"]. These
 * are PLATFORM emails; a reply is a support request to us, not mail to the
 * tenant (the tenant IS the recipient). Ordered — the S165 .limit(1) rule.
 */
async function platformReplyTo(admin: SupabaseClient<Database>): Promise<string | null> {
  const { data } = await admin
    .from('platform_admins')
    .select('email')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { email: string } | null)?.email ?? null;
}

export async function runRetentionWarnings(
  admin: SupabaseClient<Database>,
  now: Date,
  deps: RetentionWarningDeps = { send: sendEmail, stripeCustomerEmail: defaultStripeCustomerEmail }
): Promise<RetentionWarningOutcome> {
  const outcome: RetentionWarningOutcome = {
    checked: 0,
    sent1: 0,
    sent2: 0,
    skipped: 0,
    errors: [],
  };

  const { data, error } = await admin
    .from('trial_lifecycle')
    .select(
      'company_id, reason, locked_at, delete_after, postponed_until, retention_warned_1_at, retention_warned_2_at, resubscribe_token'
    )
    .not('locked_at', 'is', null)
    .is('deleted_at', null)
    .not('delete_after', 'is', null)
    .gt('delete_after', now.toISOString());
  if (error) throw new Error(`retention warnings read: ${error.message}`);

  const rows = (data ?? []) as unknown as RetentionRow[];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://frame-focus-eight.vercel.app';
  const from = `${brand.name} <notices@${SENDING_DOMAIN}>`;
  const replyTo = await platformReplyTo(admin);

  for (const row of rows) {
    outcome.checked += 1;
    if (isPostponed(row, now)) continue; // every step consults the postpone [S137]

    const kind = decideRetentionWarning(row, now);
    if (!kind) {
      const left = daysUntilDeletion(row.delete_after, now);
      const inWindow = row.reason === 'cancellation' ? left <= 60 : left <= 4;
      if (inWindow) outcome.skipped += 1; // the guard working, counted like WarningOutcome.skipped
      continue;
    }

    const { data: companyData } = await admin
      .from('companies')
      .select('timezone, stripe_customer_id')
      .eq('id', row.company_id)
      .maybeSingle();
    const company = companyData as { timezone: string | null; stripe_customer_id: string | null } | null;
    const timezone = company?.timezone ?? 'America/New_York';
    const deletionDate = formatDeletionDate(row.delete_after, timezone);
    const lockDate = formatDeletionDate(row.locked_at, timezone);
    const billingUrl = `${baseUrl}/resubscribe?token=${row.resubscribe_token}`;
    const subject = retentionWarningSubject(kind, deletionDate);

    // Recipients: every non-deleted Owner and Admin, PLUS the Stripe customer
    // email [Q5 — the address that actually pays, and possibly the only live
    // one]. Deduped case-insensitively.
    const managers = await getManagerNotifyRecipients(admin, row.company_id);
    const recipients: Array<{ email: string; firstName: string }> = [];
    const seen = new Set<string>();
    for (const m of managers) {
      if (!m.email) continue;
      const key = m.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      recipients.push({ email: m.email, firstName: m.firstName || 'there' });
    }
    if (company?.stripe_customer_id) {
      try {
        const stripeEmail = await deps.stripeCustomerEmail(company.stripe_customer_id);
        if (stripeEmail && !seen.has(stripeEmail.toLowerCase())) {
          seen.add(stripeEmail.toLowerCase());
          recipients.push({ email: stripeEmail, firstName: 'there' });
        }
      } catch (err) {
        // Stripe being down must not block the warning to the profile
        // addresses — recorded, not fatal.
        outcome.errors.push(
          `stripe email ${row.company_id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    let succeeded = 0;
    for (const r of recipients) {
      const { messageId, error: sendError } = await deps.send({
        from,
        to: r.email,
        subject,
        // createElement, not a direct call: the element keeps the INPUT props
        // (kind, billingUrl…) inspectable by the capture tests, and defers
        // rendering to Resend's react pipeline.
        react: createElement(RetentionWarningEmail, {
          kind,
          firstName: r.firstName,
          deletionDate,
          lockDate,
          billingUrl,
        }),
        // Platform mail: replies are support requests to us, never the tenant.
        replyTo,
      });
      if (!sendError) succeeded += 1;
      else outcome.errors.push(`send ${row.company_id} → ${r.email}: ${sendError}`);

      await logEmail(admin, {
        company_id: row.company_id,
        estimate_id: null,
        signing_session_id: null,
        email_type: 'retention_warning',
        recipient_email: r.email,
        sender_email: from,
        subject,
        status: sendError ? 'failed' : 'sent',
        resend_message_id: messageId,
        metadata: { kind, delete_after: row.delete_after },
      });
    }

    // Stamp when the company was warned (>=1 delivery) or when there is no
    // one to warn (an absent recipient is not something tomorrow fixes —
    // the runTrialWarnings precedent). All-fail leaves the stamp NULL so the
    // next run retries.
    if (succeeded > 0 || recipients.length === 0) {
      const { error: stampError } = await admin
        .from('trial_lifecycle')
        .update(stampsFor(kind, row, now))
        .eq('company_id', row.company_id);
      if (stampError) {
        throw new Error(`stamp ${kind} for ${row.company_id}: ${stampError.message}`);
      }
      if (kind === 'cancellation_30') outcome.sent2 += 1;
      else outcome.sent1 += 1;
    }
  }

  return outcome;
}
