import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, assertRebuildTest, purgeCompaniesNamed } from './live-session';
import {
  runRetentionWarnings,
  type RetentionWarningDeps,
} from '@/lib/trial/retention-warnings';
import { getResubscribeContext } from '@/lib/trial/resubscribe';
import type { SendEmailParams } from '@/lib/services/email-service';

// ============================================================================
// S176 — the retention warnings, driven against the real loop with an
// injected clock and a CAPTURED sender. No real mail moves in this file.
//
// Migration: 20261053000000_retention_warnings.sql
// Copy:      docs/specs/retention-warning-emails.md (ruled)
// Analysis:  docs/specs/deletion-sweep-analysis.md §8, rulings Q1/Q5/Q9
//
// Two companies, deliberately:
//   * a PROBE with no users — stamp mechanics, idempotency, boundaries. The
//     no-recipient rule (stamp anyway) makes every assertion clockwork.
//   * the FIXTURE tenant — real Owner/Admin profiles, so the send path runs
//     for real against the capture. Its lifecycle row is seeded and removed
//     by this file; the loop bans nobody and the sender is injected, so the
//     tenant is untouched beyond the row.
// ============================================================================

const FIXTURE_OWNER = 'josh+test50@worthprop.com';
const MARKERS = ['S176'] as const;
const DAY = 86_400_000;

let probeCompanyId = '';
let fixtureCompanyId = '';

/** A capturing sender: records every send, succeeds unless told otherwise. */
function captureSender(fail = false) {
  const sent: SendEmailParams[] = [];
  const deps: RetentionWarningDeps = {
    send: async (params) => {
      sent.push(params);
      return fail
        ? { messageId: null, error: 'capture: simulated outage' }
        : { messageId: `cap-${sent.length}`, error: null };
    },
    stripeCustomerEmail: async () => null,
  };
  return { sent, deps };
}

async function seedProbe(
  reason: 'trial' | 'cancellation',
  daysLeft: number,
  now: Date,
  extra: Record<string, unknown> = {}
) {
  await admin.from('trial_lifecycle').delete().eq('company_id', probeCompanyId);
  await admin.from('trial_lifecycle').insert({
    company_id: probeCompanyId,
    trial_end: new Date(now.getTime() - 30 * DAY).toISOString(),
    locked_at: new Date(now.getTime() - 5 * DAY).toISOString(),
    delete_after: new Date(now.getTime() + daysLeft * DAY).toISOString(),
    reason,
    ...extra,
  });
}

async function probeStamps() {
  const { data } = await admin
    .from('trial_lifecycle')
    .select('retention_warned_1_at, retention_warned_2_at')
    .eq('company_id', probeCompanyId)
    .single();
  return data as { retention_warned_1_at: string | null; retention_warned_2_at: string | null };
}

beforeAll(async () => {
  assertRebuildTest();
  await purgeCompaniesNamed(admin, MARKERS);

  const { data: co, error } = await admin
    .from('companies')
    .insert({ name: `S176 Probe ${Date.now()}`, slug: `s176-probe-${Date.now()}` })
    .select('id')
    .single();
  if (error) throw new Error(`probe company: ${error.message}`);
  probeCompanyId = (co as { id: string }).id;

  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', FIXTURE_OWNER)
    .single();
  fixtureCompanyId = (prof as { company_id: string }).company_id;
  await admin.from('trial_lifecycle').delete().eq('company_id', fixtureCompanyId);
}, 240_000);

afterAll(async () => {
  await admin.from('trial_lifecycle').delete().eq('company_id', fixtureCompanyId);
  await admin
    .from('email_logs')
    .delete()
    .eq('company_id', fixtureCompanyId)
    .eq('email_type', 'retention_warning');
  await purgeCompaniesNamed(admin, MARKERS);
  const { data } = await admin.from('companies').select('id').ilike('name', 'S176%');
  expect(data ?? [], 'S176 companies survived teardown').toHaveLength(0);
});

// ============================================================================
describe('cancellation boundaries and idempotency (probe, no recipients)', () => {
  it('60 days left fires warning 1 once — the second run is blocked by the stamp', async () => {
    const now = new Date();
    await seedProbe('cancellation', 60, now);

    const first = await runRetentionWarnings(admin as never, now, captureSender().deps);
    expect(first.sent1, 'the 60-day boundary did not fire').toBeGreaterThan(0);
    expect((await probeStamps()).retention_warned_1_at).not.toBeNull();

    const second = await runRetentionWarnings(admin as never, now, captureSender().deps);
    expect(second.sent1, 'the same company was warned twice').toBe(0);
    expect(second.skipped, 'the guard did not report itself').toBeGreaterThan(0);
  });

  it('⚠️ a missed cron day does not skip — 58 days left, no stamp, still fires', async () => {
    const now = new Date();
    await seedProbe('cancellation', 58, now);
    const out = await runRetentionWarnings(admin as never, now, captureSender().deps);
    expect(out.sent1, 'the late warning was silently skipped').toBeGreaterThan(0);
  });

  it('30 days left fires warning 2 after warning 1', async () => {
    const now = new Date();
    await seedProbe('cancellation', 30, now, {
      retention_warned_1_at: new Date(now.getTime() - 30 * DAY).toISOString(),
    });
    const out = await runRetentionWarnings(admin as never, now, captureSender().deps);
    expect(out.sent2).toBeGreaterThan(0);
    expect((await probeStamps()).retention_warned_2_at).not.toBeNull();
  });

  it('⚠️ first seen INSIDE 30 days: the urgent warning subsumes — one send, both stamps, then silence', async () => {
    const now = new Date();
    await seedProbe('cancellation', 25, now);
    const out = await runRetentionWarnings(admin as never, now, captureSender().deps);
    expect(out.sent2).toBeGreaterThan(0);
    expect(out.sent1, 'the stale 60-day warning fired alongside the urgent one').toBe(0);

    const stamps = await probeStamps();
    expect(stamps.retention_warned_1_at, 'subsumption did not stamp warning 1').not.toBeNull();
    expect(stamps.retention_warned_2_at).not.toBeNull();

    const next = await runRetentionWarnings(admin as never, now, captureSender().deps);
    expect(next.sent1 + next.sent2, 'something fired after both stamps').toBe(0);
  });
});

// ============================================================================
describe('the trial path and the exclusions (probe)', () => {
  it('trial: 4 days left fires, 5 does not', async () => {
    const now = new Date();
    await seedProbe('trial', 5, now);
    const early = await runRetentionWarnings(admin as never, now, captureSender().deps);
    expect(early.sent1).toBe(0);

    await seedProbe('trial', 4, now);
    const due = await runRetentionWarnings(admin as never, now, captureSender().deps);
    expect(due.sent1).toBeGreaterThan(0);
  });

  it('a postponed company is not warned — every step consults the postpone', async () => {
    const now = new Date();
    await seedProbe('cancellation', 40, now, {
      postponed_until: new Date(now.getTime() + 30 * DAY).toISOString(),
    });
    const out = await runRetentionWarnings(admin as never, now, captureSender().deps);
    expect(out.sent1 + out.sent2).toBe(0);
    expect((await probeStamps()).retention_warned_1_at).toBeNull();
  });

  it('⚠️ past delete_after warns NOBODY — those rows belong to the sweep', async () => {
    const now = new Date();
    await seedProbe('cancellation', -1, now);
    const out = await runRetentionWarnings(admin as never, now, captureSender().deps);
    expect(out.sent1 + out.sent2).toBe(0);
    expect((await probeStamps()).retention_warned_1_at).toBeNull();
  });

  it('a deleted company is not selected at all', async () => {
    const now = new Date();
    await seedProbe('cancellation', 40, now, { deleted_at: now.toISOString() });
    const out = await runRetentionWarnings(admin as never, now, captureSender().deps);
    expect(out.sent1 + out.sent2).toBe(0);
  });
});

// ============================================================================
describe('the send path (fixture tenant, captured sender)', () => {
  async function seedFixture(now: Date, extra: Record<string, unknown> = {}) {
    await admin.from('trial_lifecycle').delete().eq('company_id', fixtureCompanyId);
    await admin.from('trial_lifecycle').insert({
      company_id: fixtureCompanyId,
      trial_end: new Date(now.getTime() - 100 * DAY).toISOString(),
      locked_at: new Date(now.getTime() - 30 * DAY).toISOString(),
      delete_after: new Date(now.getTime() + 60 * DAY).toISOString(),
      reason: 'cancellation',
      ...extra,
    });
    // Neutralise the probe so captures belong to the fixture alone.
    await admin.from('trial_lifecycle').delete().eq('company_id', probeCompanyId);
  }

  it('sends to every Owner/Admin, names the exact date, links the token', async () => {
    const now = new Date();
    await seedFixture(now);
    const { sent, deps } = captureSender();

    const out = await runRetentionWarnings(admin as never, now, deps);
    expect(out.sent1).toBe(1);
    expect(sent.length, 'no email captured').toBeGreaterThan(0);

    const { data: managers } = await admin
      .from('profiles')
      .select('email')
      .eq('company_id', fixtureCompanyId)
      .eq('is_deleted', false)
      .in('role', ['owner', 'admin']);
    const managerEmails = new Set(
      ((managers ?? []) as Array<{ email: string }>).map((m) => m.email.toLowerCase())
    );
    for (const s of sent) {
      expect(managerEmails.has(s.to.toLowerCase()), `${s.to} is not an Owner/Admin`).toBe(true);
    }

    const { data: lc } = await admin
      .from('trial_lifecycle')
      .select('resubscribe_token, delete_after')
      .eq('company_id', fixtureCompanyId)
      .single();
    const row = lc as { resubscribe_token: string; delete_after: string };

    const props = (sent[0].react as { props: Record<string, unknown> }).props;
    expect(props.kind).toBe('cancellation_60');
    expect(String(props.billingUrl)).toContain(row.resubscribe_token);
    // The subject names the stored date — long-form, so at minimum the year.
    expect(sent[0].subject).toMatch(/deleted on .*\d{4}/);

    const { data: logs } = await admin
      .from('email_logs')
      .select('status, metadata')
      .eq('company_id', fixtureCompanyId)
      .eq('email_type', 'retention_warning');
    expect((logs ?? []).length, 'no email_logs audit row').toBeGreaterThan(0);
  });

  it('⚠️ an all-fail send leaves the stamp NULL so the next run retries', async () => {
    const now = new Date();
    await seedFixture(now);

    const failing = captureSender(true);
    const out = await runRetentionWarnings(admin as never, now, failing.deps);
    expect(failing.sent.length).toBeGreaterThan(0);
    expect(out.sent1, 'an undelivered warning was counted as sent').toBe(0);
    expect(out.errors.length).toBeGreaterThan(0);

    const { data } = await admin
      .from('trial_lifecycle')
      .select('retention_warned_1_at')
      .eq('company_id', fixtureCompanyId)
      .single();
    expect(
      (data as { retention_warned_1_at: string | null }).retention_warned_1_at,
      'a failed send was stamped — the warning is lost'
    ).toBeNull();

    const retry = await runRetentionWarnings(admin as never, now, captureSender().deps);
    expect(retry.sent1, 'the retry after an outage did not send').toBe(1);
  });

  it('⚠️ unlock rotates the resubscribe token and kills the emailed link', async () => {
    const now = new Date();
    await seedFixture(now);
    const { data: before } = await admin
      .from('trial_lifecycle')
      .select('resubscribe_token')
      .eq('company_id', fixtureCompanyId)
      .single();
    const oldToken = (before as { resubscribe_token: string }).resubscribe_token;

    const ctx = await getResubscribeContext(admin as never, oldToken, now);
    expect(ctx?.companyId, 'a locked row did not resolve its own token').toBe(fixtureCompanyId);

    const { error } = await admin.rpc('unlock_trial_company', {
      p_company_id: fixtureCompanyId,
    });
    expect(error?.message ?? null).toBeNull();

    const { data: after } = await admin
      .from('trial_lifecycle')
      .select('resubscribe_token, locked_at, delete_after')
      .eq('company_id', fixtureCompanyId)
      .single();
    const rotated = after as {
      resubscribe_token: string;
      locked_at: string | null;
      delete_after: string | null;
    };
    expect(rotated.resubscribe_token, 'unlock did not rotate the token').not.toBe(oldToken);
    expect(rotated.delete_after, 'unlock left the deletion clock running').toBeNull();
    expect(await getResubscribeContext(admin as never, oldToken, now)).toBeNull();
  });
});
