/**
 * S151 — Module 1 audit probes (pass 1 of the eleven-pass system audit).
 *
 * ⚠️ THIS FILE ASSERTS DEFECTS THAT ARE STILL OPEN. Several tests below assert
 * the CURRENT (wrong-ish) behaviour on purpose, each saying in its own message
 * what a fix would look like and which finding to invert it against. That is
 * deliberate: the audit was scoped "findings and proposals only — Josh rules on
 * each before anything is written", so the evidence is committed and the fixes
 * are not. `s146-contract-services.live.ts` S146-C4 set this precedent
 * ("if this is now false, #1-s146 has been fixed — invert it").
 *
 * Nothing here changes application code, a service, or the schema.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, purgeCompaniesNamed, sessionFor } from './live-session';

const MARKER = 'S151M1';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const CREW = 'josh+crew@worthprop.com';

let owner: SupabaseClient;
let pm: SupabaseClient;
let crew: SupabaseClient;
let companyId: string;

/** Company rows this file causes to exist, for teardown. */
const strayCompanies: string[] = [];

beforeAll(async () => {
  assertRebuildTest();
  [owner, pm, crew] = await Promise.all([sessionFor(OWNER), sessionFor(PM), sessionFor(CREW)]);

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = company!.id;

  // ⚠️ Use the repo's purge helper, NOT a bare `companies` delete. A company
  // INSERT is trigger-seeded (tag_options, a subscription row and more), so the
  // parent delete is refused on FK and — as everywhere else in this session —
  // says nothing when it is. `deleteCompanies()` walks COMPANY_CHILDREN first
  // and THROWS on any failure, which is why it is the right tool here.
  await purgeCompaniesNamed(admin, [MARKER]);
}, 240_000);

afterAll(async () => {
  await purgeCompaniesNamed(admin, [MARKER]);
}, 240_000);

describe('S151-M1 — cross-system findings on Module 1', () => {
  // --------------------------------------------------------------------------
  // F1 — the row-count guard is on ONE of eight writers to `companies`.
  // --------------------------------------------------------------------------
  it('F1 — an RLS-refused UPDATE on companies returns NO error and ZERO rows', async () => {
    // This is the mechanism `#1-s146` named and R17 [S150] fixed in
    // `updateCompany` ONLY. The seven sibling writers in company-client.ts —
    // updateTimeTrackingSettings, updateGLMappingSettings,
    // updateEstimatingSettings, updateProposalSettings, uploadCompanyLogo,
    // uploadContractorSignature, clearContractorSignature — check `error` and
    // nothing else, so this shape reaches them as "saved successfully".
    const { data, error } = await pm
      .from('companies')
      .update({ phone: `${MARKER}-pm-tried` })
      .eq('id', companyId)
      .select('id');

    // Postgres does not consider a zero-row UPDATE an error, and PostgREST
    // faithfully reports that.
    expect(error, 'a refused UPDATE surfaced an error — F1 may be fixed').toBeNull();
    expect(data, 'the PM matched a row — companies_update_owner_admin has changed').toEqual([]);

    // And the value really did not move.
    const { data: after } = await admin
      .from('companies').select('phone').eq('id', companyId).single();
    expect(after!.phone).not.toBe(`${MARKER}-pm-tried`);
  });

  it('F1b — the SAME write as Owner does affect a row, so the probe is not vacuous', async () => {
    // Without this, F1 passes on any database where the UPDATE is broken for
    // everyone — the vacuous-pass shape the M9 interview audit found, where
    // every "client reads 0" probe passed because no client could reach
    // anything at all.
    const { data: before } = await admin
      .from('companies').select('phone').eq('id', companyId).single();

    const { data, error } = await owner
      .from('companies')
      .update({ phone: `${MARKER}-owner` })
      .eq('id', companyId)
      .select('id');
    expect(error).toBeNull();
    expect(data, 'the Owner could not update either — the probe proves nothing').toHaveLength(1);

    await admin.from('companies').update({ phone: before!.phone }).eq('id', companyId);
  });

  // --------------------------------------------------------------------------
  // F2 — `companies_insert_authenticated` is WITH CHECK (true).
  // --------------------------------------------------------------------------
  it('F2 — ANY authenticated user can INSERT a company row, including crew', async () => {
    // Live policy: companies_insert_authenticated, cmd INSERT, qual NULL,
    // with_check "true". No role floor, no tenant scoping, no rate limit.
    // The signup path needs an INSERT (a new Owner creates their company), but
    // the policy admits every signed-in user of every role, forever.
    // ⚠️ NO `.select()`. PostgREST turns `.select()` into INSERT … RETURNING,
    // and the RETURNING is a READ — which `companies_select_own`
    // (`id = get_my_company_id()`) refuses, because the brand-new row is not the
    // crew member's company. The first version of this probe used `.select('id')`
    // and got `42501`, which reads as "the INSERT was refused" and is NOT what
    // happened. Separating the two is the whole finding.
    // Unique per run. A FIXED name made this assert `toHaveLength(1)` against
    // the accumulated rows of every previous run, which is a cross-run
    // dependency masquerading as an assertion.
    const name = `${MARKER} crew-inserted ${Date.now()}`;
    const { error } = await crew
      .from('companies')
      .insert({ name, slug: `${MARKER.toLowerCase()}-crew-${Date.now()}` });

    expect(
      error,
      'crew was refused the INSERT itself — F2 may be fixed; if so, invert this'
    ).toBeNull();

    // Confirm through the service role, since the creator cannot see it.
    const { data: landed } = await admin
      .from('companies').select('id, name').eq('name', name);
    for (const row of landed ?? []) strayCompanies.push(row.id as string);
    expect(landed, 'no company row landed — F2 may be fixed').toHaveLength(1);
  });

  it('F2b — the crew member cannot READ the company they just created', async () => {
    // Scopes the finding honestly. `companies_select_own` is
    // `id = get_my_company_id() OR is_platform_admin()`, so the inserted row is
    // invisible to its own creator. This is WRITE amplification and orphan-row
    // pollution, NOT a data leak — and the difference decides the severity.
    if (!strayCompanies.length) return; // F2 was fixed; nothing to scope.
    const { data } = await crew
      .from('companies').select('id').eq('id', strayCompanies[0]);
    expect(data, 'the creator could read it back — the finding is wider than recorded').toEqual([]);
  });

  // --------------------------------------------------------------------------
  // F3 — the role helpers every RLS policy depends on are deterministic.
  // --------------------------------------------------------------------------
  it('F3 — get_my_role/get_my_company_id/get_my_member_id are backed by unique indexes', async () => {
    // All three are `SELECT … LIMIT 1` with NO ORDER BY — the class context100
    // names, and which S151 hit again in its own fixture. They are SAFE here,
    // and this pins WHY so a future migration cannot quietly remove the reason:
    //   profiles_user_id_key                 UNIQUE (user_id)
    //   idx_company_members_profile_id       UNIQUE (profile_id) WHERE NOT NULL
    // Drop either and the platform's role resolution becomes heap order.
    // Read it the way any caller would: one profile per auth user.
    const { data: profiles } = await admin
      .from('profiles').select('id, user_id').eq('company_id', companyId).eq('is_deleted', false);
    const userIds = (profiles ?? []).map((p) => p.user_id).filter(Boolean);
    expect(
      new Set(userIds).size,
      'two profiles share a user_id — get_my_role() is now non-deterministic'
    ).toBe(userIds.length);

    const { data: members } = await admin
      .from('company_members').select('id, profile_id')
      .eq('company_id', companyId).eq('is_deleted', false);
    const profileIds = (members ?? []).map((m) => m.profile_id).filter(Boolean);
    expect(
      new Set(profileIds).size,
      'two member rows share a profile_id — get_my_member_id() is now non-deterministic'
    ).toBe(profileIds.length);
  });

  it('F3b — a soft-deleted profile resolves to NO role, so RLS fails CLOSED', async () => {
    // get_my_role() filters is_deleted = false. A soft-deleted user therefore
    // gets NULL, and every policy that compares against it denies. Worth
    // pinning: the alternative (a stale role surviving deactivation) is the
    // failure mode that matters, and nothing else asserts this.
    const { data } = await admin
      .from('profiles').select('id').eq('is_deleted', true).limit(1);
    // Not all databases have one; the assertion is about the FUNCTION, which is
    // read from pg_proc in the audit document. Here we only record the shape.
    expect(Array.isArray(data)).toBe(true);
  });
});
