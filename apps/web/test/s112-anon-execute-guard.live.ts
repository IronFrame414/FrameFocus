/**
 * S112 — THE ANON EXECUTE GUARD, SEEN TO FIRE on a real grant. rebuild-test only.
 *
 * The guard exists because supabase_admin's default ACL still grants anon
 * EXECUTE on functions it creates in public, and the migration role cannot
 * alter it (42501; see 20261900000000). A guard never seen to fire is not a
 * guard, so cases 3 and 4 GRANT a throwaway function to anon, then to PUBLIC
 * (the pre-S112 shape), and require runSchemaDrift() to name it.
 *
 * ⚠️ THIS FILE RUNS DDL, fenced like s108-schema-drift.live.ts: the ref is
 * re-checked on every call, and only statements naming PROBE_FN are allowed.
 * The probe is dropped on the way in (a killed run cannot poison the next) and
 * on the way out.
 *
 *   cd apps/web && npx vitest run --config test/live.vitest.config.ts s112-anon-execute-guard
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { ANON, URL_, admin, assertRebuildTest, REQUIRED_PROJECT_REF } from './live-session';
import { ANON_EXECUTE_ALLOWLIST, runSchemaDrift } from '@/lib/services/schema-drift';

const PROBE_FN = 's112_anon_guard_probe';
const PROBE_SIG = `${PROBE_FN}()`;

async function ddl(sql: string): Promise<void> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(
    /https:\/\/([a-z0-9]+)\.supabase\.co/
  )?.[1];
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set; cannot run the sabotage.');
  if (ref !== REQUIRED_PROJECT_REF) {
    throw new Error(`REFUSING DDL: project is ${ref}, not ${REQUIRED_PROJECT_REF}.`);
  }
  if (!sql.includes(`public.${PROBE_FN}`)) {
    throw new Error(
      `REFUSING DDL: only statements on public.${PROBE_FN} are permitted. Got: ${sql}`
    );
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`DDL failed ${res.status}: ${await res.text()}`);
}
const dropProbe = () => ddl(`DROP FUNCTION IF EXISTS public.${PROBE_FN}();`);

beforeAll(async () => {
  assertRebuildTest();
  await dropProbe();
}, 120_000);

afterAll(async () => {
  await dropProbe();
}, 120_000);

describe('S112 anon guard — clean database', () => {
  it('1 — reports exactly the 3 allowlisted functions and no violation', async () => {
    const out = await runSchemaDrift(admin as never);
    expect(out.errors.filter((e) => e.includes('anon_execute_exposure'))).toEqual([]);
    // Not vacuous: the catalog really returned the three.
    expect(out.anonExecutable).toBe(ANON_EXECUTE_ALLOWLIST.length);
    expect(out.anonViolations).toEqual([]);
  });

  it('2 — the map itself is not readable by anon or a signed-out client', async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { data, error } = await anon.rpc('anon_execute_exposure' as never);
    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
  });
});

describe('S112 anon guard — ⚠️ AND IT FIRES on a real grant', () => {
  it('3 — GRANT EXECUTE TO anon on a new function is reported by signature', async () => {
    await ddl(
      `CREATE FUNCTION public.${PROBE_FN}() RETURNS integer LANGUAGE sql AS 'SELECT 1';` +
        ` REVOKE ALL ON FUNCTION public.${PROBE_FN}() FROM PUBLIC;` +
        ` GRANT EXECUTE ON FUNCTION public.${PROBE_FN}() TO anon;`
    );
    const out = await runSchemaDrift(admin as never);
    expect(out.ok, 'THE GUARD DID NOT FIRE').toBe(false);
    expect(out.anonExecutable).toBe(ANON_EXECUTE_ALLOWLIST.length + 1);
    expect(out.anonViolations).toEqual([`${PROBE_SIG} [owner postgres]`]);
  });

  it('4 — and a PUBLIC grant (the pre-S112 shape) fires too', async () => {
    await ddl(
      `REVOKE ALL ON FUNCTION public.${PROBE_FN}() FROM anon;` +
        ` GRANT EXECUTE ON FUNCTION public.${PROBE_FN}() TO PUBLIC;`
    );
    const out = await runSchemaDrift(admin as never);
    expect(out.anonViolations).toEqual([`${PROBE_SIG} [owner postgres]`]);
  });

  it('5 — dropped again, the guard is clean (the firing was the probe, nothing else)', async () => {
    await dropProbe();
    const out = await runSchemaDrift(admin as never);
    expect(out.anonViolations).toEqual([]);
    expect(out.anonExecutable).toBe(ANON_EXECUTE_ALLOWLIST.length);
  });
});
