/**
 * S152 — Module 1 audit fixes, Groups A and B.
 *
 * Findings: `docs/specs/S151-m1-audit.md` §1 (M1-01, M1-02, M1-06).
 * Migration: `20261004000000_m1_companies_writer_pass.sql`.
 *
 * ⚠️ THIS FILE RUNS THE REAL SHIPPED SERVICES, unmodified, under real user JWTs.
 * `@/lib/supabase-browser` is mocked to hand back a client carrying a genuine
 * session, so every policy that applies in the browser applies here. Same
 * technique as `s146-contract-services.live.ts:31` and `s97ct-7e-clicktest.live.ts:37`.
 * That is the whole point: M1-01 is a defect in the SERVICE layer's reading of a
 * database result, and a probe that talks to PostgREST directly cannot see it.
 *
 * FAILING-THEN-PASSING: every Group A assertion fails before this session's
 * service edits (the seven writers returned `{ success: true }` over a discarded
 * write), and the Group B assertions fail before `20261004000000`.
 *
 * ⚠️ THIS FILE SUPERSEDES `s151-m1-audit.live.ts` F2/F2b, which asserted the OLD
 * behaviour (crew CAN insert a company) and said in its own message to invert it
 * once fixed. That inversion is B1/B2 below; F2/F2b are updated in place.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, deleteCompanies, sessionFor } from './live-session';

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

// REAL shipped M1 services.
import {
  clearContractorSignature,
  updateCompany,
  updateEstimatingSettings,
  updateGLMappingSettings,
  updateProposalSettings,
  updateTimeTrackingSettings,
} from '@/lib/services/company-client';

const MARKER = 'S152M1';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const CREW = 'josh+crew@worthprop.com';

let owner: SupabaseClient;
let pm: SupabaseClient;
let crew: SupabaseClient;
let companyId: string;

/** Auth users this file creates, for teardown. */
const createdUsers: string[] = [];

beforeAll(async () => {
  assertRebuildTest();
  [owner, pm, crew] = await Promise.all([sessionFor(OWNER), sessionFor(PM), sessionFor(CREW)]);

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = company!.id;

  // Pre-clean via the repo's purge helper, which walks COMPANY_CHILDREN and
  // THROWS. A bare `companies` delete is refused on FK and says nothing — S151
  // leaked seven rows that way.
  const { data: stray } = await admin.from('companies').select('id').ilike('name', `${MARKER}%`);
  await deleteCompanies(admin, ((stray ?? []) as { id: string }[]).map((c) => c.id));
}, 240_000);

afterAll(async () => {
  const { data: stray } = await admin.from('companies').select('id').ilike('name', `${MARKER}%`);
  await deleteCompanies(admin, ((stray ?? []) as { id: string }[]).map((c) => c.id));
  for (const id of createdUsers) {
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
}, 240_000);

// ============================================================================
// GROUP B — M1-02. INSERT restricted to callers with no company.
// ============================================================================

describe('S152-B — companies INSERT is restricted to unaffiliated callers', () => {
  it('B1 — an existing member is REFUSED, and the refusal is a ZERO ROW COUNT', async () => {
    // ⚠️ THE TRAP THIS AVOIDS, recorded in pass 1: `.select()` after an INSERT
    // compiles to `INSERT … RETURNING`, and a 42501 there means RLS refused the
    // READ, not the insert. S151's first probe read that as "the INSERT was
    // refused" when the row had actually landed. So: insert with NO `.select()`,
    // then count through the service role. The row count is the fact; the error
    // code is not.
    const name = `${MARKER} crew-tried ${Date.now()}`;
    await crew
      .from('companies')
      .insert({ name, slug: `${MARKER.toLowerCase()}-crew-${Date.now()}` });

    const { data: landed } = await admin.from('companies').select('id').eq('name', name);
    expect(
      landed,
      'a crew member created a company — companies_insert_unaffiliated is not in force'
    ).toEqual([]);
  });

  it('B1b — an OWNER is refused too: the gate is affiliation, not privilege', async () => {
    // One login, one company. The Owner of Bishop Contracting has the highest
    // role in the tenant and still cannot mint a second company, because
    // get_my_company_id() resolves. Without this, B1 could pass on a policy that
    // merely floors by role — which is NOT what was ruled.
    const name = `${MARKER} owner-tried ${Date.now()}`;
    await owner
      .from('companies')
      .insert({ name, slug: `${MARKER.toLowerCase()}-owner-${Date.now()}` });

    const { data: landed } = await admin.from('companies').select('id').eq('name', name);
    expect(landed, 'an affiliated Owner minted a second company').toEqual([]);
  });

  it('B2 — a brand-new authenticated user with NO profile CAN still insert', async () => {
    // The other arm, and the one that proves the policy did not simply close the
    // door. Without it, B1/B1b pass on `WITH CHECK (false)`, which would break
    // any future company-less flow and would look identical from B1 alone.
    //
    // ⚠️ Built WITHOUT the signup trigger: `createUser` fires
    // `on_auth_user_created`, which would give this user a company and a profile
    // and defeat the test. The profile it creates is removed first, so the user
    // is genuinely unaffiliated — which is the state the policy is about.
    const email = `s152-unaffiliated-${Date.now()}@example.invalid`;
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password: 'FrameFocusTest!2026',
      email_confirm: true,
      user_metadata: { company_name: `${MARKER} signup`, first_name: 'S152', last_name: 'New' },
    });
    if (cErr) throw new Error(`createUser: ${cErr.message}`);
    createdUsers.push(created.user!.id);

    // Strip everything the signup trigger provisioned, so the user resolves to
    // NO company. The company itself is swept in afterAll by its MARKER name.
    //
    // ⚠️ ERROR-CHECKED AND ROW-COUNTED. The first version fired the delete and
    // read neither, and B2's own guard caught it — which is the third time this
    // session that an unchecked delete quietly did nothing. `company_members`
    // holds an FK to `profiles`, so the member row goes first.
    const { data: prof } = await admin
      .from('profiles').select('id').eq('user_id', created.user!.id).single();
    const memberDel = await admin
      .from('company_members').delete().eq('profile_id', prof!.id).select('id');
    if (memberDel.error) throw new Error(`company_members: ${memberDel.error.message}`);
    const profDel = await admin
      .from('profiles').delete().eq('user_id', created.user!.id).select('id');
    if (profDel.error) throw new Error(`profiles: ${profDel.error.message}`);
    expect(profDel.data, 'the fixture profile was not removed').toHaveLength(1);

    const fresh = await sessionFor(email);
    const { data: check } = await fresh.rpc('get_my_company_id');
    expect(check, 'the fixture user still resolves to a company — B2 proves nothing').toBeNull();

    const name = `${MARKER} unaffiliated-made ${Date.now()}`;
    await fresh
      .from('companies')
      .insert({ name, slug: `${MARKER.toLowerCase()}-new-${Date.now()}` });

    const { data: landed } = await admin.from('companies').select('id').eq('name', name);
    expect(
      landed,
      'an unaffiliated caller was refused — the policy is tighter than ruled and would break signup'
    ).toHaveLength(1);
  });
});

// ============================================================================
// GROUP A — M1-01 (row-count guard) and M1-06 (the updated_by trigger).
// ============================================================================

describe('S152-A — every companies writer reports a discarded write as a failure', () => {
  // One case per writer. A PM passes the page gate nowhere, but that is the
  // point: this is the state an Admin lands in when demoted while the Settings
  // tab is open, which is the reachable path M1-01 named.
  const writers: { name: string; run: () => Promise<{ success: boolean; error?: string }> }[] = [
    { name: 'updateCompany', run: () => updateCompany(companyId, { phone: `${MARKER}-x` }) },
    {
      name: 'updateTimeTrackingSettings',
      run: () => updateTimeTrackingSettings(companyId, { week_starts_on: 0 }),
    },
    {
      name: 'updateGLMappingSettings',
      run: () => updateGLMappingSettings(companyId, { gl_account_labor: `${MARKER}-x` }),
    },
    {
      name: 'updateEstimatingSettings',
      run: () => updateEstimatingSettings(companyId, { default_tax_rate: 1.25 }),
    },
    {
      name: 'updateProposalSettings',
      run: () => updateProposalSettings(companyId, { default_expiration_days: 45 }),
    },
    { name: 'clearContractorSignature', run: () => clearContractorSignature(companyId) },
  ];

  for (const w of writers) {
    it(`A1 — ${w.name}() refuses, and says so, for a caller RLS discards`, async () => {
      state.client = pm;
      const result = await w.run();

      expect(
        result.success,
        `${w.name}() reported success over a write RLS discarded — M1-01 is back`
      ).toBe(false);
      expect(result.error).toMatch(/not applied|permission|no longer exists/i);
    });
  }

  it('A2 — the same writers SUCCEED for an Owner, so A1 is not vacuous', async () => {
    // Without this, A1 passes on a service that fails for everybody. This is the
    // vacuous-pass shape the M9 interview audit found and pass 1 was told to
    // hunt for.
    state.client = owner;
    const { data: before } = await admin
      .from('companies').select('phone, week_starts_on').eq('id', companyId).single();

    expect((await updateCompany(companyId, { phone: `${MARKER}-owner-ok` })).success).toBe(true);
    expect(
      (await updateTimeTrackingSettings(companyId, { week_starts_on: 0 })).success
    ).toBe(true);

    await admin
      .from('companies')
      .update({ phone: before!.phone, week_starts_on: before!.week_starts_on })
      .eq('id', companyId);
  });

  it('A3 — the triggers stamp BOTH updated_at and updated_by, with no payload help', async () => {
    // M1-06. The services no longer send `updated_at`; if the triggers are not
    // installed, the column stops advancing entirely and this goes red.
    //
    // ⚠️ CORRECTION TO S151's M1-06: `companies_updated_at` ALREADY existed and
    // always stamped `updated_at`. What was genuinely missing is
    // `companies_set_updated_by` — and the `updated_by` COLUMN it needs, which
    // did not exist either. Asserted together because a passing `updated_at` was
    // what made the missing half invisible.
    state.client = owner;

    const { data: ownerProfile } = await admin
      .from('profiles').select('user_id').eq('email', OWNER).single();

    const { data: before } = await admin
      .from('companies').select('phone, updated_at, updated_by').eq('id', companyId).single();

    // A distinct value, so the UPDATE genuinely changes the row.
    const stamp = `${MARKER}-${Date.now()}`;
    expect((await updateCompany(companyId, { phone: stamp })).success).toBe(true);

    const { data: after } = await admin
      .from('companies').select('phone, updated_at, updated_by').eq('id', companyId).single();

    expect(after!.phone).toBe(stamp);
    expect(
      new Date(after!.updated_at as string).getTime(),
      'updated_at did not advance — companies_updated_at is missing'
    ).toBeGreaterThan(new Date(before!.updated_at as string).getTime());
    expect(
      after!.updated_by,
      'updated_by was not stamped — companies_set_updated_by is missing'
    ).toBe(ownerProfile!.user_id);

    await admin
      .from('companies').update({ phone: before!.phone }).eq('id', companyId);
  });
});
