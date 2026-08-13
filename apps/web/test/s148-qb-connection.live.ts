import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// S148 — 7G slice 1: the QuickBooks connection, token store and #1-s143.
//
// Migrations: 20260927000000_time_clock_service_escape.sql
//             20260928000000_qb_connection.sql
// Spec:       docs/specs/7g1-spec.md §S (per company), §7G.4 (#3, #8)
// Scope:      SCHEMA, RLS AND PROBES ONLY [Josh, S148]. No OAuth route, no
//             worker, no UI.
// ============================================================================
//
// ⚠️ NOTHING HERE CALLS INTUIT. Ruled at S148, and it is not a limitation: what
// this slice ships is token STORAGE and a connection state machine, both of
// which are fully testable without a network. The API surface is not reachable
// from a harness without production credentials, and a live call would meter
// against the Workspace-wide CorePlus quota that §7G.3a exists to protect.
//
// ⚠️ EVERY ROLE ASSERTION RUNS AS A REAL USER on an anon-key client carrying a
// real JWT, so RLS and every trigger apply exactly as they do in the app. The
// service role appears only to seed, to restore, and to evaluate
// counterfactuals OUTSIDE the guard under test.
//
// ⚠️ THIS FILE CREATES NO COMPANY, so it needs no `company-purge` (#2-s147). It
// mutates the two existing QA tenants' QB columns and restores every one of
// them in afterAll — those columns are inert, nothing else reads them.

const OWNER = 'josh+test50@worthprop.com';
const ADMIN_USER = 'josh+qa-admin@worthprop.com';
const PM = 'josh+pm@worthprop.com';

const MARKER = 'S148';

/** Every QB column on `companies`, so the restore cannot miss one. */
const QB_COLUMNS = [
  'qb_realm_id',
  'qb_token_secret_id',
  'qb_payments_enabled',
  'qb_income_item_id',
  'qb_income_item_name',
  'qb_connection_state',
  'qb_connected_at',
  'qb_last_refresh_at',
  'qb_refresh_rotated_at',
  'qb_reauth_required_after',
] as const;

let ownerC: SupabaseClient;
let adminC: SupabaseClient;
let pmC: SupabaseClient;

let pmSessionId = '';
let companyA = '';
let companyB = '';
let priorA: Record<string, unknown> = {};
let priorB: Record<string, unknown> = {};
const madeSecretIds: string[] = [];

async function snapshot(companyId: string): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from('companies')
    .select(QB_COLUMNS.join(', '))
    .eq('id', companyId)
    .single();
  if (error) throw new Error(`snapshot: ${error.message}`);
  return data as unknown as Record<string, unknown>;
}

/** Reset to `disconnected` first — the shape CHECKs refuse a partial restore. */
async function restore(companyId: string, prior: Record<string, unknown>): Promise<void> {
  await admin
    .from('companies')
    .update({ qb_connection_state: 'disconnected', qb_realm_id: null, qb_token_secret_id: null })
    .eq('id', companyId);
  const { error } = await admin.from('companies').update(prior).eq('id', companyId);
  if (error) throw new Error(`restore: ${error.message}`);
}

beforeAll(async () => {
  assertRebuildTest();
  [ownerC, adminC, pmC] = (await Promise.all([
    sessionFor(OWNER),
    sessionFor(ADMIN_USER),
    sessionFor(PM),
  ])) as SupabaseClient[];

  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  companyA = (prof as { company_id: string }).company_id;

  const { data: other } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', 'josh+qa-b-owner@worthprop.com')
    .eq('is_deleted', false)
    .single();
  companyB = (other as { company_id: string }).company_id;

  priorA = await snapshot(companyA);
  priorB = await snapshot(companyB);

  // ⚠️ THE PM MUST BE ABLE TO REACH THE ROW, or Q5's refusal proves nothing.
  // `time_clock_sessions_update_authorized` admits a PM only for their OWN open
  // session or one they supervise. Against an unreachable row the write matches
  // ZERO ROWS and returns NO ERROR (#1-s146) — the assertion would then pass
  // because RLS hid the row, not because the trigger guarded the column. So an
  // open session is seeded FOR the PM, service-role, and removed in afterAll.
  const { data: pmProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', PM)
    .eq('is_deleted', false)
    .single();
  const { data: pmMember } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', (pmProfile as { id: string }).id)
    .maybeSingle();

  const { data: sess, error: sessErr } = await admin
    .from('time_clock_sessions')
    .insert({
      company_id: companyA,
      member_id: (pmMember as { id: string }).id,
      clock_in: new Date().toISOString(),
      clock_out: null,
    })
    .select('id')
    .single();
  expect(sessErr, `seed PM session: ${sessErr?.message}`).toBeNull();
  pmSessionId = (sess as { id: string }).id;
});

afterAll(async () => {
  await restore(companyA, priorA);
  await restore(companyB, priorB);
  for (const id of madeSecretIds) await admin.rpc('qb_vault_forget', { p_secret_id: id });
  if (pmSessionId) await admin.from('time_clock_sessions').delete().eq('id', pmSessionId);
});

// ─────────────────────────────────────────────────────────────────────────────

describe('S148-Q1 — the QB connection is OWNER ONLY, narrower than the table policy', () => {
  it('an Owner may connect', async () => {
    const { error } = await ownerC
      .from('companies')
      .update({ qb_realm_id: `${MARKER}-realm-A`, qb_connection_state: 'disconnected' })
      .eq('id', companyA);
    expect(error).toBeNull();

    const { data } = await admin
      .from('companies')
      .select('qb_realm_id')
      .eq('id', companyA)
      .single();
    expect((data as { qb_realm_id: string }).qb_realm_id).toBe(`${MARKER}-realm-A`);
  });

  it('⚠️ an ADMIN IS REFUSED — the ruling nothing enforced before S148', async () => {
    // CLAUDE.md owner-only item 4: connecting QuickBooks is billing-adjacent and
    // Owner-only. `companies_update_owner_admin` admits Admin, and RLS cannot
    // express a per-column rule — so before this trigger an Admin could write
    // every one of these columns through the shipped policy.
    const { error } = await adminC
      .from('companies')
      .update({ qb_realm_id: `${MARKER}-admin-tried` })
      .eq('id', companyA);

    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/Owner-only/i);

    // …and nothing was written.
    const { data } = await admin
      .from('companies')
      .select('qb_realm_id')
      .eq('id', companyA)
      .single();
    expect((data as { qb_realm_id: string }).qb_realm_id).toBe(`${MARKER}-realm-A`);
  });

  it('the guard is NARROW — the same Admin may still edit a non-QB column', async () => {
    // Without this pairing, the refusal above would pass equally against an
    // Admin who simply could not update `companies` at all.
    const { data: before } = await admin
      .from('companies')
      .select('name')
      .eq('id', companyA)
      .single();
    const name = (before as { name: string }).name;

    const { error } = await adminC
      .from('companies')
      .update({ phone: '555-0148' })
      .eq('id', companyA);
    expect(error, 'the Admin session cannot update companies at all').toBeNull();

    await admin.from('companies').update({ name }).eq('id', companyA);
  });

  it('a PM writes nothing — and the row is unchanged, which is the real assertion', async () => {
    // ⚠️ #1-s146: a PM has no UPDATE policy on `companies`, so the write matches
    // ZERO ROWS and Postgres reports NO ERROR. Asserting on `error` here would
    // pass for the wrong reason on any future change. Assert the row.
    await pmC.from('companies').update({ qb_realm_id: `${MARKER}-pm-tried` }).eq('id', companyA);

    const { data } = await admin
      .from('companies')
      .select('qb_realm_id')
      .eq('id', companyA)
      .single();
    expect((data as { qb_realm_id: string }).qb_realm_id).toBe(`${MARKER}-realm-A`);
  });
});

describe('S148-Q2 — the connection state cannot hold a shape nobody can act on', () => {
  it('`connected` without a realm is refused', async () => {
    await admin
      .from('companies')
      .update({ qb_connection_state: 'disconnected', qb_realm_id: null, qb_token_secret_id: null })
      .eq('id', companyB);

    const { error } = await admin
      .from('companies')
      .update({ qb_connection_state: 'connected' })
      .eq('id', companyB);
    expect(error?.message).toMatch(/companies_qb_realm_required_check/);
  });

  it('`connected` with a realm but NO TOKEN is refused', async () => {
    const { error } = await admin
      .from('companies')
      .update({ qb_connection_state: 'connected', qb_realm_id: `${MARKER}-realm-B` })
      .eq('id', companyB);
    expect(error?.message).toMatch(/companies_qb_token_required_check/);
  });

  it('a state outside the four is refused', async () => {
    const { error } = await admin
      .from('companies')
      .update({ qb_connection_state: 'expired' })
      .eq('id', companyB);
    expect(error?.message).toMatch(/companies_qb_connection_state_check/);
  });

  it('`needs_reauth` is a REACHABLE state — it is where the banner lives', async () => {
    // D [Josh, S148]: on invalid_grant the connection goes needs_reauth, work
    // KEEPS QUEUEING, nothing is marked failed. So this state must be settable
    // while the token pointer is still present.
    const { data: secret, error: sErr } = await admin.rpc('qb_vault_put', {
      p_company_id: companyB,
      p_payload: JSON.stringify({ refresh_token: `${MARKER}-rt` }),
    });
    expect(sErr, `qb_vault_put: ${sErr?.message}`).toBeNull();
    madeSecretIds.push(secret as unknown as string);

    const { error } = await admin
      .from('companies')
      .update({
        qb_connection_state: 'needs_reauth',
        qb_realm_id: `${MARKER}-realm-B`,
        qb_token_secret_id: secret as unknown as string,
      })
      .eq('id', companyB);
    expect(error).toBeNull();
  });
});

describe('S148-Q3 — one realm binds to at most one tenant', () => {
  it('⚠️ two companies cannot share a realmId — interleaved books is the worst failure', async () => {
    const { error } = await admin
      .from('companies')
      .update({ qb_realm_id: `${MARKER}-realm-A` })
      .eq('id', companyB);
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/idx_companies_qb_realm_id|duplicate key/i);
  });

  it('but the index is PARTIAL — many companies may hold NULL', async () => {
    // Without `WHERE qb_realm_id IS NOT NULL` the unique index would allow only
    // ONE unconnected company on the whole platform.
    const { error: e1 } = await admin
      .from('companies')
      .update({ qb_connection_state: 'disconnected', qb_realm_id: null, qb_token_secret_id: null })
      .eq('id', companyB);
    expect(e1).toBeNull();

    const { data } = await admin.from('companies').select('id').is('qb_realm_id', null);
    expect((data ?? []).length, 'no company holds a NULL realm — test is vacuous').toBeGreaterThan(0);
  });
});

describe('S148-Q4 — ENCRYPTION: the reason Vault was chosen over an app-layer key', () => {
  it('the service role can write a secret and read it back decrypted', async () => {
    const payload = JSON.stringify({
      access_token: `${MARKER}-at`,
      refresh_token: `${MARKER}-rt`,
      access_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      refresh_issued_at: new Date().toISOString(),
    });

    const { data: id, error } = await admin.rpc('qb_vault_put', {
      p_company_id: companyA,
      p_payload: payload,
    });
    expect(error, `qb_vault_put: ${error?.message}`).toBeNull();
    madeSecretIds.push(id as unknown as string);

    const { data: back, error: rErr } = await admin.rpc('qb_vault_get', {
      p_secret_id: id as unknown as string,
    });
    expect(rErr, `qb_vault_get: ${rErr?.message}`).toBeNull();
    expect(back).toBe(payload);

    // REPLACES, never merges — a rotation must not leave the old token behind.
    const rotated = JSON.stringify({ refresh_token: `${MARKER}-rt-rotated` });
    await admin.rpc('qb_vault_put', {
      p_company_id: companyA,
      p_payload: rotated,
      p_secret_id: id as unknown as string,
    });
    const { data: after } = await admin.rpc('qb_vault_get', {
      p_secret_id: id as unknown as string,
    });
    expect(after).toBe(rotated);
    expect(after as unknown as string).not.toContain(`${MARKER}-at`);
  });

  it('⚠️ AN OWNER CANNOT READ THE VAULT AT ALL — this is the whole property', async () => {
    // `service_role` holds SELECT on vault.decrypted_secrets; `anon` and
    // `authenticated` hold NOTHING. So the refusal below does not depend on an
    // RLS policy we wrote and could get wrong — it is a grant, and it survives
    // any mistake on `companies`.
    // ⚠️ AND THE GRANT TRAP: `REVOKE … FROM PUBLIC` does NOT close a function on
    // Supabase — it grants EXECUTE to `anon` and `authenticated` explicitly, and
    // those survive a revoke from PUBLIC. Revoking both BY NAME is what makes
    // this refusal real, so it is probed rather than assumed.
    const { data: secretId } = await admin
      .from('companies')
      .select('qb_token_secret_id')
      .eq('id', companyB)
      .single();

    const { error: getErr } = await ownerC.rpc('qb_vault_get', {
      p_secret_id: (secretId as { qb_token_secret_id: string }).qb_token_secret_id,
    });
    expect(getErr, 'an Owner session decrypted a token').toBeTruthy();

    const { error: putErr } = await ownerC.rpc('qb_vault_put', {
      p_company_id: companyA,
      p_payload: 'owner-should-not-be-able-to-write-this',
    });
    expect(putErr, 'an Owner session wrote to the vault').toBeTruthy();
  });

  it('…while the same Owner CAN read the pointer — so the refusal is the vault, not the session', async () => {
    const { data, error } = await ownerC
      .from('companies')
      .select('qb_token_secret_id, qb_connection_state')
      .eq('id', companyA)
      .single();
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });
});

describe('S148-Q5 — #1-s143 closed, and the guard did not become a hole', () => {
  it('a service-role write to time_clock_sessions QB columns now SUCCEEDS', async () => {
    const { data: row } = await admin
      .from('time_clock_sessions')
      .select('id, qb_push_status')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    const id = (row as { id: string }).id;
    const prior = (row as { qb_push_status: string }).qb_push_status;

    const { error } = await admin
      .from('time_clock_sessions')
      .update({ qb_push_status: 'queued' })
      .eq('id', id);
    expect(error, 'the sync worker still cannot write its own columns').toBeNull();

    await admin.from('time_clock_sessions').update({ qb_push_status: prior }).eq('id', id);
  });

  it('⚠️ a REAL PM SESSION IS STILL REFUSED — widening the escape did not open the guard', async () => {
    // The escape is reachable only when auth.uid() IS NULL. A real session is
    // never that, so every pre-existing branch must behave exactly as before.
    // Without this the change could have replaced a guard with a hole.
    //
    // The row is the PM's OWN OPEN SESSION, seeded in beforeAll, so RLS admits
    // the write and the TRIGGER is what refuses it.
    const { data: before } = await admin
      .from('time_clock_sessions')
      .select('qb_push_status')
      .eq('id', pmSessionId)
      .single();
    const prior = (before as { qb_push_status: string }).qb_push_status;

    const { error } = await pmC
      .from('time_clock_sessions')
      .update({ qb_push_status: 'pushed' })
      .eq('id', pmSessionId);
    expect(error, 'the PM was not refused — the escape opened the guard').toBeTruthy();
    expect(error?.message).toMatch(/Session system columns are not editable/i);

    const { data: after } = await admin
      .from('time_clock_sessions')
      .select('qb_push_status')
      .eq('id', pmSessionId)
      .single();
    expect((after as { qb_push_status: string }).qb_push_status).toBe(prior);
  });

  it('…and the PM CAN still clock out on that same row — the guard is column-scoped', async () => {
    // Pairs the refusal above: a PM who could not write the row AT ALL would
    // pass it for the wrong reason.
    const { error } = await pmC
      .from('time_clock_sessions')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', pmSessionId);
    expect(error, 'the PM cannot write this row at all — the refusal above is vacuous').toBeNull();
  });
});
