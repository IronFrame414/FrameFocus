/**
 * S181b FILL-R-1 — a Project Executive's retainage-release WRITES are
 * project-scoped.
 *
 * RULED [Josh, 2026-09-27]: 20261910000000 grants the PE INSERT/UPDATE on
 * `retainage_releases` (`pe_on_project(project_id)`), while the Payments panel
 * is gated Owner/Admin. The database arm is KEPT; this file proves it cannot
 * reach past the PE's own project. The UI gap is filed separately (FILL-R-2).
 *
 * Three disposable projects, as the real `josh+qa-pe` session:
 *   · ON        — its own company, PE assigned: INSERT and UPDATE land;
 *   · UNASSIGNED — its own company, no assignment: refused, touches 0;
 *   · FOREIGN   — TEST CO 2's company, WITH a forged PE assignment row
 *                 (the harsh case: the company check, not the assignment,
 *                 must be what refuses it): refused, touches 0.
 *
 * ⚠️ ORDER MATTERS. `retainage_releases_one_per_project_key` is UNIQUE
 * (project_id), so the refused INSERTs run BEFORE the service role puts a row
 * on UNASSIGNED / FOREIGN. Otherwise a unique violation could pose as an RLS
 * refusal. The service-role rows then prove the payload shape is valid (the
 * control beside every zero) and are the targets of the UPDATE negatives.
 *
 * ⚠️ NO RETURNING ON A NEGATIVE WRITE. `.insert().select()` / `.update().select()`
 * make Postgres check the row against the PE's SELECT arm too, and that
 * refusal rolls the whole statement back — so a negative written that way
 * measures the READ arm, not the write arm. Proven the hard way: with both
 * write arms widened on rebuild-test, the first version of this file stayed
 * 10/10 green. A caller sending `return=minimal` skips the SELECT check, and
 * the app's own insert (`payments-client.ts` createRetainageRelease) sends no
 * `.select()`. So every negative INSERT below writes WITHOUT RETURNING and is
 * judged by the service role's count.
 *
 * ⚠️ AN UPDATE CANNOT BE ISOLATED THIS WAY. A PostgREST UPDATE always has a
 * WHERE, so Postgres applies the SELECT arm to the EXISTING row and to the NEW
 * row, RETURNING or not. Measured: with the UPDATE arm widened (USING and WITH
 * CHECK both `company_id AND role`), both Y3 moves were still refused ("new row
 * violates row-level security"). So N4 and Y3 are refused by the SELECT arm
 * and the UPDATE arm TOGETHER. They are kept as floor checks, and are not
 * evidence that the UPDATE arm alone is scoped. That arm is bounded by the
 * SELECT arm on every reachable path.
 *
 * DISPOSABLE FIXTURES, swept by marker on the way in and out. RUN ONLY WHILE
 * NO CI IS LIVE.
 *
 *   npx vitest run --config test/live.vitest.config.ts s181-project-executive-retainage
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, deleteProjects, sessionFor } from './live-session';

const PE = 'josh+qa-pe@worthprop.com';
const FOREIGN_OWNER = 'josh+qa-b-owner@worthprop.com';
const MARKER = 'PER';
const RLS = /row-level security/i;

let pe: SupabaseClient;
let companyId = '';
let foreignCompanyId = '';
let peMemberId = '';
let foreignMemberId = '';
const contact = { own: '', foreign: '' };
const proj = { on: '', unassigned: '', foreign: '' };
const ctl = { unassigned: '', foreign: '' };
let onRelease = '';

async function sweep() {
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  // deleteProjects clears retainage_releases and project_assignments first.
  await deleteProjects(
    admin,
    (ps ?? []).map((p) => p.id as string)
  );
  await admin.from('contacts').delete().eq('last_name', `${MARKER} Client`);
}

async function memberFor(email: string): Promise<{ companyId: string; memberId: string }> {
  const { data: prof, error } = await admin
    .from('profiles')
    .select('id, company_id')
    .eq('email', email)
    .single();
  if (error || !prof) throw new Error(`no ${email} — run scripts/seed-test-identities.mjs`);
  const { data: m, error: mErr } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', prof.id)
    .single();
  if (mErr || !m) throw new Error(`no member row for ${email}`);
  return { companyId: prof.company_id as string, memberId: m.id as string };
}

async function makeContact(company: string): Promise<string> {
  const { data, error } = await admin
    .from('contacts')
    .insert({
      company_id: company,
      first_name: 'PE',
      last_name: `${MARKER} Client`,
      contact_type: 'client',
    })
    .select('id')
    .single();
  if (error) throw new Error(`contact: ${error.message}`);
  return data!.id as string;
}

async function makeProject(company: string, contactId: string, tag: string): Promise<string> {
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', company)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await admin
    .from('projects')
    .insert({
      company_id: company,
      contact_id: contactId,
      project_number: `PRJ-${MARKER}-${tag}`,
      name: `${MARKER} ${tag} project`,
      status: 'active',
      project_internal_seq: (seqRow?.project_internal_seq ?? 0) + 5000,
    })
    .select('id')
    .single();
  if (error) throw new Error(`project ${tag}: ${error.message}`);
  return data!.id as string;
}

/** A release payload as the PE would send it — company_id left to its default. */
const payload = (projectId: string, amount: number) => ({
  project_id: projectId,
  signed_off_on: '2026-09-27',
  recorded_by: peMemberId,
  amount,
});

/** Service-role count of releases on a project — the independent tally. */
async function releasesOn(projectId: string): Promise<number> {
  const { count, error } = await admin
    .from('retainage_releases')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (error) throw new Error(`count: ${error.message}`);
  return count ?? 0;
}

// No .select() on a negative write: RETURNING makes the SELECT policy judge the row, not the write policy.
/** A PE write with NO RETURNING — only the write policy judges it. The error, or null. */
async function quietly(
  write: PromiseLike<{ error: { message: string } | null }>
): Promise<string | null> {
  const { error } = await write;
  return error?.message ?? null;
}

/** Rows an UPDATE touched, as the PE sees it: RLS turns a refusal into 0. */
async function touched(patch: Record<string, unknown>, id: string): Promise<number> {
  const { data, error } = await pe
    .from('retainage_releases')
    .update(patch)
    .eq('id', id)
    .select('id');
  if (error) return -1;
  return (data ?? []).length;
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: prof } = await admin.from('profiles').select('role').eq('email', PE).single();
  expect(prof?.role).toBe('project_executive');
  ({ companyId, memberId: peMemberId } = await memberFor(PE));
  ({ companyId: foreignCompanyId, memberId: foreignMemberId } = await memberFor(FOREIGN_OWNER));
  expect(foreignCompanyId).not.toBe(companyId);

  await sweep();

  contact.own = await makeContact(companyId);
  contact.foreign = await makeContact(foreignCompanyId);
  proj.on = await makeProject(companyId, contact.own, 'ON');
  proj.unassigned = await makeProject(companyId, contact.own, 'UNASSIGNED');
  proj.foreign = await makeProject(foreignCompanyId, contact.foreign, 'FOREIGN');

  const assign = (projectId: string, company: string) =>
    admin.from('project_assignments').insert({
      company_id: company,
      project_id: projectId,
      member_id: peMemberId,
      role_on_project: 'project_executive',
    });
  const { error: aOn } = await assign(proj.on, companyId);
  if (aOn) throw new Error(`assign ON: ${aOn.message}`);
  // The forged cross-company assignment: is_assigned_to_project() is TRUE for
  // the PE here, so only pe_on_project()'s company check can refuse it.
  const { error: aFor } = await assign(proj.foreign, foreignCompanyId);
  if (aFor) throw new Error(`assign FOREIGN: ${aFor.message}`);

  pe = await sessionFor(PE);
}, 180_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .like('name', `${MARKER} %`);
  expect(count ?? 0, 'disposable PER projects survived teardown').toBe(0);
}, 180_000);

describe('FILL-R-1 — CONTROL: the fixtures are what they claim', () => {
  it('no release exists on any of the three projects yet (service role: 0/0/0)', async () => {
    expect([
      await releasesOn(proj.on),
      await releasesOn(proj.unassigned),
      await releasesOn(proj.foreign),
    ]).toEqual([0, 0, 0]);
  });

  it('the forged FOREIGN assignment exists (so the refusal below is the company check)', async () => {
    const { count } = await admin
      .from('project_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', proj.foreign)
      .eq('member_id', peMemberId);
    expect(count).toBe(1);
  });
});

describe('FILL-R-1 — INSERT is refused off its project (run before any row exists there)', () => {
  it('N1 UNASSIGNED project in its own company: refused by RLS, 0 rows land', async () => {
    const err = await quietly(pe.from('retainage_releases').insert(payload(proj.unassigned, 100)));
    expect(err ?? '').toMatch(RLS);
    expect(await releasesOn(proj.unassigned)).toBe(0);
  });

  it('N2 FOREIGN company project, default company_id AND explicit foreign company_id: both refused', async () => {
    const byDefault = await quietly(
      pe.from('retainage_releases').insert(payload(proj.foreign, 100))
    );
    const explicit = await quietly(
      pe
        .from('retainage_releases')
        .insert({ ...payload(proj.foreign, 100), company_id: foreignCompanyId })
    );
    expect(byDefault ?? '').toMatch(RLS);
    expect(explicit ?? '').toMatch(RLS);
    expect(await releasesOn(proj.foreign)).toBe(0);
  });
});

describe('FILL-R-1 — ON its own project, INSERT and UPDATE land', () => {
  it('Y1 INSERT lands (1 row; the service role counts 1)', async () => {
    const { data, error } = await pe
      .from('retainage_releases')
      .insert(payload(proj.on, 250))
      .select('id, company_id');
    expect(error?.message ?? null).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].company_id).toBe(companyId);
    onRelease = data![0].id as string;
    expect(await releasesOn(proj.on)).toBe(1);
  });

  it('Y2 UPDATE lands (touches 1; the service role reads the new amount)', async () => {
    expect(await touched({ amount: 275, lien_release_warned: true }, onRelease)).toBe(1);
    const { data } = await admin
      .from('retainage_releases')
      .select('amount, lien_release_warned')
      .eq('id', onRelease)
      .single();
    expect({ amount: Number(data!.amount), warned: data!.lien_release_warned }).toEqual({
      amount: 275,
      warned: true,
    });
  });

  it('Y3 ⚠️ cannot MOVE its release onto UNASSIGNED or FOREIGN (SELECT + UPDATE arms together, see header); the row stays on ON', async () => {
    const move = (projectId: string) =>
      quietly(pe.from('retainage_releases').update({ project_id: projectId }).eq('id', onRelease));
    expect((await move(proj.unassigned)) ?? '').toMatch(RLS);
    expect((await move(proj.foreign)) ?? '').toMatch(RLS);
    const { data } = await admin
      .from('retainage_releases')
      .select('project_id')
      .eq('id', onRelease)
      .single();
    expect(data?.project_id).toBe(proj.on);
    expect([await releasesOn(proj.unassigned), await releasesOn(proj.foreign)]).toEqual([0, 0]);
  });
});

describe('FILL-R-1 — existing rows off its project: invisible and untouchable', () => {
  beforeAll(async () => {
    // The control: the same shape the PE was refused is a VALID row for the
    // service role — so N1/N2 were the policy, not a bad payload.
    const { data: u, error: uErr } = await admin
      .from('retainage_releases')
      .insert({ ...payload(proj.unassigned, 100), company_id: companyId })
      .select('id')
      .single();
    if (uErr) throw new Error(`control UNASSIGNED: ${uErr.message}`);
    ctl.unassigned = u!.id as string;
    const { data: f, error: fErr } = await admin
      .from('retainage_releases')
      .insert({
        ...payload(proj.foreign, 100),
        company_id: foreignCompanyId,
        recorded_by: foreignMemberId,
      })
      .select('id')
      .single();
    if (fErr) throw new Error(`control FOREIGN: ${fErr.message}`);
    ctl.foreign = f!.id as string;
  });

  it('C the service role landed 1 row on each (control for N1/N2)', async () => {
    expect([await releasesOn(proj.unassigned), await releasesOn(proj.foreign)]).toEqual([1, 1]);
  });

  it('N3 the PE reads 0 of the 2 (service role: 2), and still reads its own (1)', async () => {
    const { data: off } = await pe
      .from('retainage_releases')
      .select('id')
      .in('id', [ctl.unassigned, ctl.foreign]);
    const { data: own } = await pe.from('retainage_releases').select('id').eq('id', onRelease);
    const { count: control } = await admin
      .from('retainage_releases')
      .select('id', { count: 'exact', head: true })
      .in('id', [ctl.unassigned, ctl.foreign]);
    expect(control).toBe(2);
    expect(off?.length ?? 0).toBe(0);
    expect(own).toHaveLength(1);
  });

  // The SELECT arm and the UPDATE arm's USING refuse this TOGETHER (see header).
  it('N4 UPDATE touches 0 on each; the service role reads both rows unchanged', async () => {
    expect(await touched({ amount: 1 }, ctl.unassigned)).toBeLessThanOrEqual(0);
    expect(await touched({ amount: 1 }, ctl.foreign)).toBeLessThanOrEqual(0);
    const { data } = await admin
      .from('retainage_releases')
      .select('id, amount')
      .in('id', [ctl.unassigned, ctl.foreign]);
    expect((data ?? []).map((r) => Number(r.amount))).toEqual([100, 100]);
  });
});
