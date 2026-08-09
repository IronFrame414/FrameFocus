import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest } from './live-session';
import type { SendEmailParams } from '@/lib/services/email-service';
import { runEstimateReminders } from '@/lib/notify/crons/estimate-reminders';

// ============================================================================
// COVERAGE PASS — §3f's LOOP, driven with an injected sender. No migration.
// Spec: §3f. See ReminderDeps in the loop module for the isolation rationale.
// ============================================================================
//
// ---------------------------------------------------------------------------
// NOTHING LEAVES THIS PROCESS
// ---------------------------------------------------------------------------
// `deps.send` is a recorder. It never touches Resend, so the whole cron —
// including the reminder email itself — runs end to end with no network.
//
// WHAT THIS PROVES: the loop selected the right estimate, emailed the right
// address, advanced the count, fired §3f exactly once, and addressed it to
// Owner and Admin.
//
// WHAT IT DOES NOT PROVE, and no amount of assertion here will: that Resend
// accepts the payload, that ReminderEmail renders, or that anything is
// delivered. Those need a real key and a reserved address, and they are a
// different test.
//
// ⚠️ The reason nothing escapes today is NOT that this file is careful — it is
// that the environment's Resend key is invalid (161 of the email_logs failure
// rows say so). That is accidental, it is a property of the environment rather
// than of the tests, and it stops being true the day somebody fixes the key.
// The injected recorder is the actual isolation.

const OWNER = 'josh+test50@worthprop.com';
const ADMIN_EMAIL = 'josh+qa-admin@worthprop.com';
const CLIENT = 'nobody@example.invalid'; // RFC 6761 — cannot resolve, cannot receive

const TAG = 's123-reminders-loop';

let companyId: string;
let ownerProfileId: string;
let adminProfileId: string;
let contactId: string;
let estimateId: string;
let sessionId: string;

const madeNotifications: string[] = [];
const runStart = new Date().toISOString();

/** The injected sender: records, never sends. */
function recorder() {
  const calls: SendEmailParams[] = [];
  return {
    calls,
    send: async (params: SendEmailParams) => {
      calls.push(params);
      return { messageId: `${TAG}-fake`, error: null };
    },
  };
}

async function exhaustedRows(since: string) {
  const { data } = await admin
    .from('notifications')
    .select('id, recipient_profile_id, title, body, link_key, link_params')
    .eq('company_id', companyId)
    .eq('type', 'reminders_exhausted')
    .gte('created_at', since);
  for (const r of data ?? []) if (!madeNotifications.includes(r.id)) madeNotifications.push(r.id);
  return data ?? [];
}

beforeAll(async () => {
  assertRebuildTest();

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, email, company_id')
    .in('email', [OWNER, ADMIN_EMAIL]);
  ownerProfileId = profiles!.find((p) => p.email === OWNER)!.id;
  adminProfileId = profiles!.find((p) => p.email === ADMIN_EMAIL)!.id;
  companyId = profiles!.find((p) => p.email === OWNER)!.company_id;

  const { data: contact } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .limit(1)
    .single();
  contactId = contact!.id;

  // An estimate on the LAST step of a [3,7,14] schedule: two reminders already
  // sent, sent_at far enough back that step three is due. isFinalReminderStep
  // (2, 3) is true, so this run both sends the last reminder AND fires §3f.
  const sentAt = new Date(Date.now() - 40 * 24 * 3_600_000);
  const { data: estimate, error: estError } = await admin
    .from('estimates')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      name: `${TAG} estimate`,
      // BOTH SUPPLIED EXPLICITLY. Their column defaults are
      // `next_estimate_number()` and `get_my_role()`, which resolve through
      // get_my_company_id() / auth.uid() — null for the service role, so the
      // insert fails with "no company for caller". A caller-scoped default is
      // not a default at all from a cron or a harness.
      estimate_number: `${TAG}-1`,
      created_by_role: 'owner',
      status: 'sent',
      sent_at: sentAt.toISOString(),
      // Deliberately far in the FUTURE: the expiration pass calls
      // notifyManagers(), whose sender is NOT injected (see the coverage note
      // at the bottom of this file). Keeping this estimate un-expired keeps
      // this harness on the reminder pass only, with nothing able to send.
      expires_at: new Date(Date.now() + 90 * 24 * 3_600_000).toISOString(),
      reminder_schedule: [3, 7, 14],
      reminder_count: 2,
    })
    .select('id')
    .single();
  if (estError) throw new Error(`fixture estimate: ${estError.message}`);
  estimateId = estimate!.id;

  const { data: session, error: sessError } = await admin
    .from('signing_sessions')
    .insert({
      company_id: companyId,
      estimate_id: estimateId,
      token: `${TAG}-${estimateId.slice(0, 8)}`,
      status: 'pending',
      recipient_email: CLIENT,
      recipient_name: 'Test Client',
      expires_at: new Date(Date.now() + 30 * 24 * 3_600_000).toISOString(),
    })
    .select('id')
    .single();
  if (sessError) throw new Error(`fixture signing_session: ${sessError.message}`);
  sessionId = session!.id;
});


/**
 * A run-window sweep, in ADDITION to the id list.
 *
 * The id list only contains rows a test managed to READ BACK before it
 * asserted. A test that fails mid-way — which is exactly what the
 * break-and-restore proofs do on purpose — aborts before registering the rows
 * it just caused, and those rows survive teardown. Twenty-four of them did.
 *
 * So teardown also deletes, by TYPE and by this run's start time, everything
 * these harnesses can possibly have written. Scoped to the types this file
 * produces so it can never touch anything else.
 */
afterAll(async () => {
  if (madeNotifications.length) {
    await admin.from('notifications').delete().in('id', madeNotifications);
  }
  await admin
    .from('notifications')
    .delete()
    .eq('type', 'reminders_exhausted')
    .gte('created_at', runStart);
  await admin.from('email_logs').delete().eq('estimate_id', estimateId);
  if (sessionId) await admin.from('signing_sessions').delete().eq('id', sessionId);
  if (estimateId) await admin.from('estimates').delete().eq('id', estimateId);
});

describe('§3f — the loop, end to end, with nothing sent', () => {
  const rec = recorder();
  let since: string;

  it('sends the final reminder to the CLIENT and fires §3f to Owner + Admin', async () => {
    since = new Date().toISOString();
    const outcome = await runEstimateReminders(admin as SupabaseClient<Database>, new Date(), {
      send: rec.send,
      appUrl: 'https://example.test',
    });

    // THE POSITIVE, FIRST. A loop that examined nothing satisfies "no error".
    expect(outcome.errors).toEqual([]);
    expect(outcome.remindersSent).toBe(1);

    // ONE email, to the client — not to Owner, not to Admin. This is the
    // assertion the reserved-address approach could not make, because it would
    // have rewritten the address it is checking.
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0].to).toBe(CLIENT);
    expect(rec.calls[0].to).not.toBe(OWNER);
    expect(rec.calls[0].subject.length).toBeGreaterThan(0);

    // …and §3f went to the managers instead, which is the split that matters:
    // the client is chased, the company is told the chasing has run out.
    const rows = await exhaustedRows(since);
    const recipients = new Set(rows.map((r) => r.recipient_profile_id));
    expect(recipients.has(ownerProfileId)).toBe(true);
    expect(recipients.has(adminProfileId)).toBe(true);

    expect(rows[0].title).toBe(`${TAG} estimate: all reminders sent, still unsigned.`);
    expect(rows[0].body).toContain('3 reminders sent');
    expect(rows[0].link_key).toBe('estimate');
    expect(rows[0].link_params).toMatchObject({ id: estimateId });
  });

  it('the count advanced, so the row was written against a committed send', async () => {
    // §3f fires AFTER the count is committed. If the order were reversed the
    // cron would re-send this reminder next run while the Owner had already
    // been told the reminders were exhausted.
    const { data } = await admin
      .from('estimates')
      .select('reminder_count')
      .eq('id', estimateId)
      .single();
    expect(data!.reminder_count).toBe(3);
  });

  it('ONE ROW, NOT ONE PER SEND — a second run adds nothing', async () => {
    // Option B, founder-decided S89, asserted as behaviour rather than as the
    // arithmetic that implements it. The count is now 3 of 3, so the loop
    // `continue`s past this estimate entirely.
    const second = recorder();
    const since2 = new Date().toISOString();

    const outcome = await runEstimateReminders(admin as SupabaseClient<Database>, new Date(), {
      send: second.send,
      appUrl: 'https://example.test',
    });

    expect(outcome.remindersSent).toBe(0);
    expect(second.calls).toHaveLength(0);
    expect(await exhaustedRows(since2)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// STILL NOT COVERED HERE, ON PURPOSE
// ---------------------------------------------------------------------------
// · The EXPIRATION pass. It calls `notifyManagers()` (signing-service), which
//   owns its own `sendEmail` and takes no injected sender, so driving it would
//   attempt a real send. The fixture keeps `expires_at` in the future so that
//   branch never runs. Injecting notifyManagers' sender is the follow-up.
// · Anything about Resend itself — acceptance, rendering, delivery.
