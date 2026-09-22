/**
 * S108 C2 — THE SCHEMA-DRIFT DETECTOR, SEEN TO FIRE.
 *
 * ⚠️ THE WHOLE POINT OF THIS FILE IS THE SABOTAGE. `#1-deliv`'s lesson is that
 * a green test can encode the opposite of what it appears to; the drift
 * equivalent is a detector that has never once reported drift. "Zero drift" is
 * also what a detector returns when it is broken, when the RPC is missing, when
 * the baseline is empty, or when the comparison silently compares `undefined`
 * to `undefined`. So case 2 below CHANGES THE LIVE SCHEMA and requires the
 * detector to notice.
 *
 * ⚠️ THIS FILE RUNS DDL. It is the only harness in the repo that does, and it
 * is fenced three ways:
 *   1. `live-guard-setup` has already proved the SERVICE-ROLE KEY's own `ref`
 *      claim is rebuild-test, before this module was imported.
 *   2. `assertRebuildTest()` runs again in beforeAll.
 *   3. `ddl()` below re-checks the project ref on EVERY call and refuses
 *      anything that is not a CREATE or DROP of its own probe table, by name.
 * The object it creates is a table of its own invention. No existing table,
 * policy, trigger or function is touched, so a crashed run cannot damage a
 * fixture any other harness depends on.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, assertRebuildTest, REQUIRED_PROJECT_REF } from './live-session';
import { compareFingerprints, runSchemaDrift } from '@/lib/services/schema-drift';
import baseline from '@/lib/schema-fingerprint-baseline.json';

/** The only object this file is allowed to create or destroy. */
const PROBE_TABLE = 's108_drift_probe';

/**
 * Run one DDL statement through the Management API.
 *
 * PostgREST cannot run DDL and the Supabase CLI needs a migration file, so the
 * Management API's query endpoint — the same one the dashboard SQL editor uses,
 * and the same one `scripts/live-sql.mjs` reads through — is the only way to
 * make a real schema change from a test. `live-sql.mjs` deliberately REFUSES
 * writes; this is the narrow, named exception, and it re-derives the ref rather
 * than trusting that the earlier guard ran.
 */
async function ddl(sql: string): Promise<void> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(
    /https:\/\/([a-z0-9]+)\.supabase\.co/
  )?.[1];
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set; cannot run the sabotage.');
  if (ref !== REQUIRED_PROJECT_REF) {
    throw new Error(`REFUSING DDL: project is ${ref}, not ${REQUIRED_PROJECT_REF}.`);
  }
  // ⚠️ Belt and braces: the statement must name the probe table and must be a
  // CREATE or DROP of it. A typo that reached for a real table would otherwise
  // be executed with full privileges.
  if (!sql.includes(PROBE_TABLE) || !/^\s*(create table|drop table)\s/i.test(sql)) {
    throw new Error(`REFUSING DDL: only CREATE/DROP TABLE ${PROBE_TABLE} is permitted. Got: ${sql}`);
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`DDL failed ${res.status}: ${await res.text()}`);
}

const dropProbe = () => ddl(`DROP TABLE IF EXISTS public.${PROBE_TABLE};`);

beforeAll(async () => {
  assertRebuildTest();
  // Self-healing on the way in, so a killed run cannot poison the next one.
  await dropProbe();
}, 180_000);

afterAll(async () => {
  await dropProbe();
}, 180_000);

describe('S108 C2 — the detector reports ZERO DRIFT on a clean database', () => {
  it('1 — rebuild-test matches the committed baseline on every dimension', async () => {
    const outcome = await runSchemaDrift(admin as never);
    expect(outcome.errors, `the drift route errored: ${outcome.errors.join('; ')}`).toEqual([]);
    // ⚠️ A test that passes on zero comparisons is a failure. This is the
    // guard against the RPC returning an empty object and everything below
    // being vacuously clean.
    expect(outcome.checked, 'the route compared NOTHING').toBe(4);
    expect(outcome.drift, `unexpected drift: ${JSON.stringify(outcome.drift)}`).toEqual([]);
    expect(outcome.ok).toBe(true);
  });

  it('2 — and the live fingerprint really did come back populated, not empty', async () => {
    // The counterfactual for case 1. Four md5s of the empty string would
    // compare equal to four md5s of the empty string and report perfect health.
    const outcome = await runSchemaDrift(admin as never);
    expect(outcome.liveLatestMigration, 'no migration version came back').toBeTruthy();
    expect(outcome.baselineLatestMigration).toBe(outcome.liveLatestMigration);
    for (const dim of ['policies', 'triggers', 'functions', 'constraints'] as const) {
      const entry = (baseline as unknown as Record<string, { n: number; md5: string }>)[dim];
      expect(entry.n, `${dim} baseline count is zero`).toBeGreaterThan(0);
      expect(entry.md5, `${dim} baseline is the md5 of an empty string`).not.toBe(
        'd41d8cd98f00b204e9800998ecf8427e'
      );
    }
  });
});

describe('S108 C2 — ⚠️ AND IT FIRES, proved by a real schema change', () => {
  it('3 — creating a throwaway CHECK constraint IS reported as drift', async () => {
    const before = await runSchemaDrift(admin as never);
    expect(before.drift, 'the database was already drifted before the sabotage').toEqual([]);

    await ddl(
      `CREATE TABLE public.${PROBE_TABLE} (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         n integer NOT NULL,
         CONSTRAINT ${PROBE_TABLE}_n_positive CHECK (n > 0)
       );`
    );

    const after = await runSchemaDrift(admin as never);
    expect(after.ok, 'THE DETECTOR DID NOT FIRE on a real schema change').toBe(false);
    expect(after.drift.length).toBeGreaterThan(0);

    // It names the DIMENSION, which is what makes a report actionable rather
    // than just alarming.
    const dims = after.drift.map((d) => d.dimension);
    expect(dims, 'drift was reported but not against constraints').toContain('constraints');

    // ⚠️ AND IT IS SPECIFIC. Adding a table must not light up policies,
    // triggers or function bodies — a detector that reports everything on any
    // change tells you nothing about where to look.
    expect(dims, 'a new table moved the POLICY digest, which it should not').not.toContain(
      'policies'
    );
    expect(dims, 'a new table moved the FUNCTION digest, which it should not').not.toContain(
      'functions'
    );

    const constraints = after.drift.find((d) => d.dimension === 'constraints')!;
    expect(constraints.countChanged, 'the constraint COUNT did not move').toBe(true);
    expect(constraints.actual.n).toBeGreaterThan(constraints.expected.n);
  });

  it('4 — and dropping it again returns the detector to zero', async () => {
    await dropProbe();
    const outcome = await runSchemaDrift(admin as never);
    expect(outcome.drift, `drift survived the revert: ${JSON.stringify(outcome.drift)}`).toEqual(
      []
    );
    expect(outcome.ok).toBe(true);
  });

  it('5 — it writes NO notification when no recipient company is configured', async () => {
    // rebuild-test has no Worth Properties, and SCHEMA_DRIFT_COMPANY_ID is
    // unset here. The ruled behaviour is that the route still RUNS and still
    // REPORTS — it must not throw, and it must not silently swallow the drift.
    await ddl(
      `CREATE TABLE public.${PROBE_TABLE} (id uuid PRIMARY KEY DEFAULT gen_random_uuid());`
    );
    const outcome = await runSchemaDrift(admin as never);
    expect(outcome.drift.length, 'drift was not detected in the no-recipient case').toBeGreaterThan(0);
    expect(outcome.notified).toBe(0);
    expect(outcome.notes.join(' ')).toMatch(/SCHEMA_DRIFT_COMPANY_ID|no owner profile/);
    expect(outcome.errors, 'a missing recipient was treated as an error').toEqual([]);
    await dropProbe();
  });
});

describe('S108 C2 — the comparison itself', () => {
  const print = (n: number, md5: string) => ({ n, md5 });
  const fp = (md5s: [string, string, string, string]) => ({
    policies: print(1, md5s[0]),
    triggers: print(1, md5s[1]),
    functions: print(1, md5s[2]),
    constraints: print(1, md5s[3]),
    latest_migration: 'x',
  });

  it('6 — identical fingerprints produce no findings, and still report 4 checks', () => {
    const r = compareFingerprints(fp(['a', 'b', 'c', 'd']), fp(['a', 'b', 'c', 'd']));
    expect(r.drift).toEqual([]);
    expect(r.checked).toBe(4);
  });

  it('7 — ONE changed digest produces exactly one finding, naming that dimension', () => {
    const r = compareFingerprints(fp(['a', 'b', 'c', 'd']), fp(['a', 'b', 'CHANGED', 'd']));
    expect(r.drift).toHaveLength(1);
    expect(r.drift[0].dimension).toBe('functions');
    // Same count, different digest — an object was EDITED, not added. The flag
    // is what tells a reader whether to look for a new object or a changed one.
    expect(r.drift[0].countChanged).toBe(false);
  });

  it('8 — every dimension can fire, so none is silently unwired', () => {
    const r = compareFingerprints(fp(['a', 'b', 'c', 'd']), fp(['1', '2', '3', '4']));
    expect(r.drift.map((d) => d.dimension)).toEqual([
      'policies',
      'triggers',
      'functions',
      'constraints',
    ]);
  });
});
