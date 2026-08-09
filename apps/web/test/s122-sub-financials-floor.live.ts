import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// TECH_DEBT #132 — the sub RATE, MARKUP and TAX ID floor. RULED [S122, Josh].
// ============================================================================
//
// Migration: 20260903000000_subcontractor_financials.sql
//
//   "OWNER AND ADMIN ONLY, for all three: default_hourly_rate,
//    default_markup_percent and ein. Same answer for each."
//
// Before it, all three were COLUMNS ON `subcontractors`, whose SELECT policy
// (`subcontractors_select_authenticated`) is `company_id` + `is_deleted` and
// has NO ROLE ARM. `getSubcontractors()` does `select('*')`. So the company's
// margin on a sub, the sub's cost rate and the sub's tax id were in the RSC
// payload for crew, foreman, PM and subcontractors alike.
//
// ---------------------------------------------------------------------------
// ⚠️ THE ASSERTION THAT ACTUALLY PROVES THE FIX IS THE COLUMN-ABSENCE ONE
// ---------------------------------------------------------------------------
// A floor on the new table proves nothing on its own while the OLD columns
// still exist — `select('*')` would keep shipping them and the side table
// would be decoration. So the first test reads `subcontractors` as a CREW
// MEMBER and asserts the three keys are simply not there. That is the test
// that would have caught a migration which created the table and forgot the
// DROP.
//
// ---------------------------------------------------------------------------
// ⚠️ EVERY NEGATIVE IS PAIRED WITH A POSITIVE
// ---------------------------------------------------------------------------
// A floor's failure mode is REFUSING EVERYBODY, which from outside looks
// identical to the floor working. "Crew cannot read the rate" passes on a
// policy that also refuses the Owner, and on one that broke tenant scoping.
// So each refusal is asserted beside an Owner who MUST succeed.
//
// ⚠️ AND THE POSTGRES TRAP: a refused SELECT returns ZERO ROWS, not an error.
// A refused UPDATE likewise affects zero rows and reports success. So the
// negative assertions check the DATA, and the update negatives re-read with
// the service role to prove the value did not move.
//
// ---------------------------------------------------------------------------
// FAILING-THEN-PASSING, BOTH DIRECTIONS
// ---------------------------------------------------------------------------
// Run against the database BEFORE the migration: `subcontractor_financials`
// does not exist, so every test here errors, and the column-absence test fails
// because `select('*')` still returns all three keys to crew. After
// `supabase db push`:
//   · crew/foreman/PM/sub read the sub row and the three keys are GONE;
//   · crew/foreman/PM/sub read `subcontractor_financials` and get ZERO rows;
//   · the Owner reads the row and gets the real values;
//   · a PM's UPDATE affects nothing and the value is unmoved;
//   · the Owner's UPDATE lands.

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';

const GATED_KEYS = ['default_hourly_rate', 'default_markup_percent', 'ein'] as const;

let ownerC: SupabaseClient;
let pmC: SupabaseClient;
let foremanC: SupabaseClient;
let crewC: SupabaseClient;
let subC: SupabaseClient;

/** A sub of our own making, so the harness never depends on fixture contents. */
let subId = '';
let companyId = '';
const RATE = 137.5;
const MARKUP = 22.5;
const EIN = '99-1234567';

beforeAll(async () => {
  assertRebuildTest();

  [ownerC, pmC, foremanC, crewC, subC] = await Promise.all([
    sessionFor(OWNER),
    sessionFor(PM),
    sessionFor(FOREMAN),
    sessionFor(CREW),
    sessionFor(SUB),
  ]);

  // Company A, resolved from the owner's own profile rather than hard-coded.
  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .maybeSingle();
  companyId = (prof as { company_id: string }).company_id;

  const { data: sub, error } = await admin
    .from('subcontractors')
    .insert({
      company_id: companyId,
      company_name: `S122 Floor Fixture ${Date.now()}`,
      sub_type: 'subcontractor',
      status: 'active',
    })
    .select('id')
    .single();
  if (error) throw new Error(`fixture sub insert failed: ${error.message}`);
  subId = (sub as { id: string }).id;

  const { error: finErr } = await admin.from('subcontractor_financials').insert({
    company_id: companyId,
    subcontractor_id: subId,
    default_hourly_rate: RATE,
    default_markup_percent: MARKUP,
    ein: EIN,
  });
  if (finErr) throw new Error(`fixture financials insert failed: ${finErr.message}`);
}, 60_000);

afterAll(async () => {
  if (subId) {
    // financials cascade with the parent, but delete explicitly so a failed
    // cascade is visible rather than silently leaving a row behind.
    await admin.from('subcontractor_financials').delete().eq('subcontractor_id', subId);
    await admin.from('subcontractors').delete().eq('id', subId);
  }
});

describe('#132 — the three figures are OFF the subcontractors row', () => {
  // THE test. While these columns exist, everything else here is decoration.
  for (const [label, get] of [
    ['crew', () => crewC],
    ['foreman', () => foremanC],
    ['project_manager', () => pmC],
    ['subcontractor', () => subC],
  ] as const) {
    it(`⚠️ a ${label} reading subcontractors with select('*') gets NO rate, markup or ein key`, async () => {
      const { data } = await get().from('subcontractors').select('*').eq('id', subId).maybeSingle();
      expect(data, `${label} should still see the sub itself`).toBeTruthy();
      for (const key of GATED_KEYS) {
        expect(Object.keys(data as object), `${key} still on the row`).not.toContain(key);
      }
    });
  }

  it('the non-change half: the Owner still reads the sub, and its name', async () => {
    const { data } = await ownerC.from('subcontractors').select('*').eq('id', subId).maybeSingle();
    expect(data).toBeTruthy();
    expect((data as { company_name: string }).company_name).toContain('S122 Floor Fixture');
  });
});

describe('#132 — subcontractor_financials SELECT is Owner/Admin', () => {
  it('the OWNER reads all three values — the floor is not refusing everybody', async () => {
    const { data } = await ownerC
      .from('subcontractor_financials')
      .select('default_hourly_rate, default_markup_percent, ein')
      .eq('subcontractor_id', subId)
      .maybeSingle();

    expect(data, 'owner got nothing — the floor over-reached').toBeTruthy();
    expect(Number((data as { default_hourly_rate: number }).default_hourly_rate)).toBe(RATE);
    expect(Number((data as { default_markup_percent: number }).default_markup_percent)).toBe(MARKUP);
    expect((data as { ein: string }).ein).toBe(EIN);
  });

  for (const [label, get] of [
    ['crew', () => crewC],
    ['foreman', () => foremanC],
    ['project_manager', () => pmC],
    ['subcontractor', () => subC],
  ] as const) {
    it(`a ${label} reads ZERO rows`, async () => {
      // RLS FILTERS, it does not error. Assert on the data, never on `error`.
      const { data } = await get()
        .from('subcontractor_financials')
        .select('default_hourly_rate, default_markup_percent, ein')
        .eq('subcontractor_id', subId);
      expect(data ?? []).toHaveLength(0);
    });
  }
});

describe('#132 — UPDATE is Owner/Admin, and a refusal is silent', () => {
  it('a PM UPDATE affects nothing, and the stored value does not move', async () => {
    await pmC
      .from('subcontractor_financials')
      .update({ default_markup_percent: 99 })
      .eq('subcontractor_id', subId);

    // The read-back MUST be with the service role: the PM cannot read the row
    // to check, and asserting on their own refused read would pass vacuously.
    const { data } = await admin
      .from('subcontractor_financials')
      .select('default_markup_percent')
      .eq('subcontractor_id', subId)
      .single();
    expect(Number((data as { default_markup_percent: number }).default_markup_percent)).toBe(MARKUP);
  });

  it('the OWNER UPDATE lands — the positive half of the same verb', async () => {
    const { error } = await ownerC
      .from('subcontractor_financials')
      .update({ default_markup_percent: 31.5 })
      .eq('subcontractor_id', subId);
    expect(error).toBeNull();

    const { data } = await admin
      .from('subcontractor_financials')
      .select('default_markup_percent')
      .eq('subcontractor_id', subId)
      .single();
    expect(Number((data as { default_markup_percent: number }).default_markup_percent)).toBe(31.5);

    await admin
      .from('subcontractor_financials')
      .update({ default_markup_percent: MARKUP })
      .eq('subcontractor_id', subId);
  });

  it('DELETE is denied to EVERY role, the Owner included — there is no policy', async () => {
    await ownerC.from('subcontractor_financials').delete().eq('subcontractor_id', subId);
    const { data } = await admin
      .from('subcontractor_financials')
      .select('id')
      .eq('subcontractor_id', subId);
    expect(data ?? [], 'the row was deleted — a DELETE policy exists that should not').toHaveLength(
      1
    );
  });
});
