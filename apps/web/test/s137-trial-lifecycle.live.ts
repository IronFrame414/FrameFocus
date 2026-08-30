import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, purgeCompaniesNamed, sessionFor } from './live-session';
import { daysUntil, isPostponed, runTrialWarnings, runTrialLock } from '@/lib/trial/lifecycle';
import { SURVIVES, COMPANY_TABLES } from '@/lib/trial/deletion';

// ============================================================================
// S137 — the trial lifecycle, driven against RLS and against the real loops.
//
// Migration: 20260918000000_trial_lifecycle.sql
// Spec:      docs/specs/trial-lifecycle-spec.md
// ============================================================================
//
// ⚠️ EVERY ROLE-SCOPED READ BELOW RUNS AS A REAL USER, not as `postgres`. The
// clients are anon-key clients carrying real user JWTs, so RLS applies exactly
// as it does in the app. `admin` appears only to seed and to evaluate
// counterfactuals OUTSIDE the policy under test.
//
// ⚠️ NOTHING HERE RUNS THE DELETION JOB AGAINST REAL DATA. It is asserted
// structurally (what it excludes, what it would walk) because it is built and
// deliberately unscheduled while TL-24 is with legal.

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';

let ownerC: SupabaseClient;
let pmC: SupabaseClient;
let subC: SupabaseClient;
let companyId = '';
let ownerProfileId = '';
/** A throwaway company so the loops never touch the fixture tenant. */
let probeCompanyId = '';

/**
 * [#2-s147] `S137 Probe …` and `S137 Null …`. The Null company at the bottom of
 * this file was never deleted at all; the Probe one was deleted by id with no
 * error read, which since 20260922000000 could not succeed. 2 leaked per run.
 */
const MARKERS = ['S137'] as const;

beforeAll(async () => {
  assertRebuildTest();
  await purgeCompaniesNamed(admin, MARKERS);
  [ownerC, pmC, subC] = (await Promise.all([
    sessionFor(OWNER),
    sessionFor(PM),
    sessionFor(SUB),
  ])) as SupabaseClient[];

  const { data: prof } = await admin
    .from('profiles')
    .select('id, company_id')
    .eq('email', OWNER)
    .single();
  ownerProfileId = (prof as { id: string }).id;
  companyId = (prof as { company_id: string }).company_id;

  // ⚠️ A SEPARATE COMPANY WITH NO USERS. runTrialLock() BANS the auth users of
  // every company it locks — pointed at the fixture tenant it would lock the
  // QA identities out of every other harness in this suite.
  const { data: co } = await admin
    .from('companies')
    .insert({ name: `S137 Probe ${Date.now()}`, slug: `s137-probe-${Date.now()}` })
    .select('id')
    .single();
  probeCompanyId = (co as { id: string }).id;
}, 240_000);

afterAll(async () => {
  await admin.from('trial_lifecycle').delete().eq('company_id', probeCompanyId);
  await admin.from('trial_lifecycle').delete().eq('company_id', companyId);
  await admin.from('trial_warning_acknowledgements').delete().eq('company_id', companyId);
  await admin.from('export_jobs').delete().eq('company_id', companyId);
  await purgeCompaniesNamed(admin, MARKERS);

  // A cleanup that cannot fail its own run is not a cleanup.
  const { data } = await admin.from('companies').select('id').ilike('name', 'S137%');
  expect(data ?? [], 'S137 companies survived teardown').toHaveLength(0);
});

// ============================================================================
describe('trial_lifecycle — readable by Owner/Admin, writable by NOBODY', () => {
  beforeAll(async () => {
    await admin
      .from('trial_lifecycle')
      .upsert({ company_id: companyId, trial_end: new Date(Date.now() + 20 * 86400000).toISOString() });
  });

  it('the Owner can read their own row', async () => {
    const { data, error } = await ownerC
      .from('trial_lifecycle')
      .select('company_id, trial_end')
      .eq('company_id', companyId)
      .maybeSingle();
    expect(error?.message ?? null).toBeNull();
    expect(data, 'the Owner cannot see their own trial state').not.toBeNull();
  });

  it('⚠️ a PM and a subcontractor read NOTHING', async () => {
    for (const [label, c] of [['project_manager', pmC], ['subcontractor', subC]] as const) {
      const { data } = await c.from('trial_lifecycle').select('company_id');
      expect(data ?? [], `${label} read the trial lifecycle`).toEqual([]);
    }
  });

  it('⚠️ the counterfactual: the row EXISTS — the zeroes are refusals', async () => {
    const { count } = await admin
      .from('trial_lifecycle')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId);
    expect(count ?? 0, 'no row seeded — the refusals above prove nothing').toBeGreaterThan(0);
  });

  it('⚠️ THE OWNER CANNOT MOVE THEIR OWN DELETION DATE', async () => {
    // The whole security model of this table: SELECT only, no write policy of
    // any kind, every write service-role. A tenant who could UPDATE this row
    // could postpone their own deletion indefinitely.
    const far = new Date(Date.now() + 999 * 86400000).toISOString();
    const { error } = await ownerC
      .from('trial_lifecycle')
      .update({ trial_end: far })
      .eq('company_id', companyId);

    // RLS refuses an UPDATE by matching no rows rather than erroring, so the
    // absence of an error is NOT the assertion — the unchanged value is.
    void error;
    const { data: after } = await admin
      .from('trial_lifecycle')
      .select('trial_end')
      .eq('company_id', companyId)
      .single();
    expect((after as { trial_end: string }).trial_end, 'the Owner moved their own trial_end').not.toBe(far);
  });

  it('an Owner cannot INSERT a lifecycle row either', async () => {
    const { error } = await ownerC
      .from('trial_lifecycle')
      .insert({ company_id: probeCompanyId, trial_end: new Date().toISOString() });
    expect(error, 'an Owner created a lifecycle row').not.toBeNull();
  });
});

// ============================================================================
describe('trial_warning_acknowledgements — an acknowledgement is first-person', () => {
  it('the Owner can acknowledge AS THEMSELVES', async () => {
    const { error } = await ownerC.from('trial_warning_acknowledgements').insert({
      company_id: companyId,
      profile_id: ownerProfileId,
      warning_kind: 'day_7',
    });
    expect(error?.message ?? null, 'the Owner could not acknowledge').toBeNull();
  });

  it('⚠️ and CANNOT acknowledge on somebody else\'s behalf', async () => {
    // The point of the table. If an Admin could write the Owner's
    // acknowledgement, the row stops being evidence of anything.
    const { data: other } = await admin
      .from('profiles')
      .select('id')
      .eq('email', PM)
      .single();

    const { error } = await ownerC.from('trial_warning_acknowledgements').insert({
      company_id: companyId,
      profile_id: (other as { id: string }).id,
      warning_kind: 'day_3',
    });
    expect(error, 'one user acknowledged for another').not.toBeNull();
  });

  it('a subcontractor cannot acknowledge at all', async () => {
    const { error } = await subC.from('trial_warning_acknowledgements').insert({
      company_id: companyId,
      profile_id: ownerProfileId,
      warning_kind: 'day_7',
    });
    expect(error).not.toBeNull();
  });
});

// ============================================================================
describe('the warning loop', () => {
  async function seedProbe(daysLeft: number, extra: Record<string, unknown> = {}) {
    await admin.from('trial_lifecycle').delete().eq('company_id', probeCompanyId);
    await admin.from('trial_lifecycle').insert({
      company_id: probeCompanyId,
      trial_end: new Date(Date.now() + daysLeft * 86400000).toISOString(),
      ...extra,
    });
  }

  it('day −7 warns once, and the SECOND run does not warn again', async () => {
    await seedProbe(7);
    const first = await runTrialWarnings(admin as never, new Date());
    expect(first.warned7, 'the −7 boundary did not warn').toBeGreaterThan(0);

    // ⚠️ THE IDEMPOTENCY GUARD, asserted rather than assumed. A cron that runs
    // twice in a day — a retry, a manual call, a replayed deploy — must not
    // warn twice.
    const second = await runTrialWarnings(admin as never, new Date());
    expect(second.warned7, 'the same company was warned twice').toBe(0);

    const { data } = await admin
      .from('trial_lifecycle')
      .select('warned_7_at')
      .eq('company_id', probeCompanyId)
      .single();
    expect((data as { warned_7_at: string | null }).warned_7_at).not.toBeNull();
  });

  it('⚠️ at 2 days left it sends the −3 warning, not the −7 one', async () => {
    // Order matters: a company inside 3 days needs the urgent warning, not the
    // one it should have had a week ago.
    await seedProbe(2);
    const out = await runTrialWarnings(admin as never, new Date());
    expect(out.warned3).toBeGreaterThan(0);
    expect(out.warned7).toBe(0);

    // The urgent warning SUBSUMES the −7 stamp [deletion-sweep session]: the
    // NEXT run must not send "Trial ends in 7 days" at 2 days left. This was
    // a live stale-send until the fix — warned_7_at stayed NULL after day_3
    // fired, and the following day's run matched the −7 branch.
    const second = await runTrialWarnings(admin as never, new Date());
    expect(second.warned7, 'stale −7 warning sent after the −3 one').toBe(0);
    expect(second.warned3).toBe(0);
  });

  it('a postponed company is not warned', async () => {
    await seedProbe(2, { postponed_until: new Date(Date.now() + 30 * 86400000).toISOString() });
    const out = await runTrialWarnings(admin as never, new Date());
    expect(out.warned3).toBe(0);
    expect(out.warned7).toBe(0);
  });

  it('a company 20 days out is not warned at all', async () => {
    await seedProbe(20);
    const out = await runTrialWarnings(admin as never, new Date());
    expect(out.warned7).toBe(0);
    expect(out.warned3).toBe(0);
  });
});

// ============================================================================
describe('the lock loop', () => {
  it('⚠️ expiry sets locked_at AND delete_after — the retention clock is stored', async () => {
    await admin.from('trial_lifecycle').delete().eq('company_id', probeCompanyId);
    await admin.from('trial_lifecycle').insert({
      company_id: probeCompanyId,
      trial_end: new Date(Date.now() - 86400000).toISOString(),
    });

    const out = await runTrialLock(admin as never, new Date());
    expect(out.locked, 'an expired trial was not locked').toBeGreaterThan(0);

    const { data } = await admin
      .from('trial_lifecycle')
      .select('locked_at, delete_after')
      .eq('company_id', probeCompanyId)
      .single();
    const row = data as { locked_at: string | null; delete_after: string | null };
    expect(row.locked_at, 'no lock stamp').not.toBeNull();
    expect(row.delete_after, 'no retention clock — deletion would never fire').not.toBeNull();

    // 14 days, not 30: a PAID cancellation gets 30 and is a different path.
    const gapDays = Math.round(
      (new Date(row.delete_after!).getTime() - new Date(row.locked_at!).getTime()) / 86400000
    );
    expect(gapDays, 'retention window is not 14 days').toBe(14);
  });

  it('a postponed company is not locked', async () => {
    await admin.from('trial_lifecycle').delete().eq('company_id', probeCompanyId);
    await admin.from('trial_lifecycle').insert({
      company_id: probeCompanyId,
      trial_end: new Date(Date.now() - 86400000).toISOString(),
      postponed_until: new Date(Date.now() + 30 * 86400000).toISOString(),
    });
    const out = await runTrialLock(admin as never, new Date());
    expect(out.postponed).toBeGreaterThan(0);

    const { data } = await admin
      .from('trial_lifecycle')
      .select('locked_at')
      .eq('company_id', probeCompanyId)
      .single();
    expect((data as { locked_at: string | null }).locked_at, 'a postponed company was locked').toBeNull();
  });
});

// ============================================================================
describe('pure helpers', () => {
  it('daysUntil rounds UP — 6.2 days left is still "7"', () => {
    const now = new Date('2026-08-12T00:00:00Z');
    expect(daysUntil('2026-08-19T00:00:00Z', now)).toBe(7);
    expect(daysUntil('2026-08-18T05:00:00Z', now)).toBe(7);
    expect(daysUntil('2026-08-11T00:00:00Z', now)).toBe(-1);
  });

  it('isPostponed is false for a PAST postponement', () => {
    const now = new Date('2026-08-12T00:00:00Z');
    expect(isPostponed({ postponed_until: '2026-08-01T00:00:00Z' }, now)).toBe(false);
    expect(isPostponed({ postponed_until: '2026-09-01T00:00:00Z' }, now)).toBe(true);
    expect(isPostponed({ postponed_until: null }, now)).toBe(false);
  });
});

// ============================================================================
describe('⚠️ the deletion job — what it must NOT touch', () => {
  it('the survivors are excluded from the walk, by name', async () => {
    for (const t of ['trial_emails', 'email_logs', 'ai_tag_logs']) {
      expect(SURVIVES[t], `${t} is not marked as surviving`).toBeTruthy();
      expect(COMPANY_TABLES, `${t} is in the deletion walk`).not.toContain(t);
    }
  });

  it('⚠️ signed-document tables are IN the walk, and the ARCHIVE survives [Q3 — INVERTED, not deleted]', async () => {
    // The superseded assertion, quoted rather than erased: these three tables
    // were "excluded WHOLESALE while the mechanism is unruled". Q3 ruled the
    // mechanism (archive, not detach — deletion-sweep-analysis.md), so the
    // originals now DELETE and the copies live in archived_documents. A test
    // asserting the old exclusion would be a green test encoding a dead rule.
    for (const t of [
      'client_contracts',
      'change_orders',
      'subcontractor_contracts',
      'contract_documents',
      'lien_releases',
    ]) {
      expect(COMPANY_TABLES, `${t} left the walk — signed originals would survive raw`).toContain(t);
      expect(SURVIVES[t]).toBeUndefined();
    }
    expect(
      SURVIVES['archived_documents'],
      'the archive itself must survive, or the mechanism deletes its own output'
    ).toBeTruthy();
  });

  it('ai_tag_logs.company_id is NULLABLE, or the ruling is unbuildable', async () => {
    // "Survives with company_id nulled" needs the column to accept NULL. It was
    // NOT NULL until 20260918000000 and the type-checker is what caught it.
    const { data: co } = await admin
      .from('companies')
      .insert({ name: `S137 Null ${Date.now()}`, slug: `s137-null-${Date.now()}` })
      .select('id')
      .single();
    const cid = (co as { id: string }).id;
    // `model` is NOT NULL with no default — the first version of this test
    // omitted it, the insert returned null, and the failure read as "the column
    // is still NOT NULL" when it was the fixture that was wrong. The test was
    // wrong, not the migration.
    const { data: row, error: insErr } = await admin
      .from('ai_tag_logs')
      .insert({ company_id: cid, model: 's137-probe', success: true })
      .select('id')
      .single();
    expect(insErr?.message ?? null, 'could not seed an ai_tag_logs row').toBeNull();

    const { error } = await admin
      .from('ai_tag_logs')
      .update({ company_id: null as unknown as string })
      .eq('id', (row as { id: string }).id);
    expect(error?.message ?? null, 'ai_tag_logs.company_id is still NOT NULL').toBeNull();

    await admin.from('ai_tag_logs').delete().eq('id', (row as { id: string }).id);
    await admin.from('companies').delete().eq('id', cid);
  });

  it('⚠️ THE DELETION CRON IS NOT SCHEDULED — asserted, not trusted', async () => {
    // The single most consequential fact in this build. If someone adds the
    // schedule entry without legal returning on TL-24, this goes red.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const vercel = readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8');

    expect(vercel).toContain('/api/cron/trial-warnings');
    expect(vercel).toContain('/api/cron/trial-lock');
    expect(
      vercel.includes('/api/cron/trial-deletion'),
      'THE DELETION CRON HAS BEEN SCHEDULED. TL-24 is with legal; this is Josh\'s line to add, not a build\'s.'
    ).toBe(false);
  });
});
