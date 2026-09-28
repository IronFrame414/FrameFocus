/**
 * S114 Q14 A [RULED Josh 2026-09-28] — the Project Executive may READ its
 * project's `project_financials` row but may no longer WRITE it.
 * Migration 20262000000000 drops `project_financials_insert_project_executive`
 * and `project_financials_update_project_executive` (from 20261910000000).
 *
 * WHY: on a fixed-price project `project_financials.contract_value` IS the
 * billing ceiling the database enforces (`enforce_contract_billing_ceiling`
 * locks and reads it; no value = no ceiling). A PE that can raise, or null,
 * its own cap is exactly the authority R1 carve-out 2 withholds. No app code
 * writes the table (only `convert_estimate_to_project()`), and no client reads
 * it (the portal reads `client_contract_amounts`).
 *
 * WHY ITS OWN PROJECT: the PE's SELECT arm admits the row there, so what
 * refuses is the WRITE arm alone. ⚠️ NO RETURNING on any negative write; INSERT
 * is judged by a service-role tally, UPDATE by the service role re-reading the
 * column.
 *
 * ⚠️ FRESH DISPOSABLE PROJECTS: `PFD INS` holds NO financials row (UNIQUE
 * project_id — a widened arm's row must LAND where the tally sees it, not
 * collide); `PFD UPD` holds one at 50000.
 *
 * NEGATIVE FIRST: run before the migration → F1 and F2 RED (the arms exist);
 * after → green. Sabotage: re-create one arm as it was in 1910 → that probe red.
 *
 *   npx vitest run --config test/live.vitest.config.ts s114-pe-financials-drop
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, deleteProjects, sessionFor } from './live-session';

const PE = 'josh+qa-pe@worthprop.com';
const MARKER = 'PFD';

let pe: SupabaseClient;
let companyId = '';
let peMemberId = '';
let contactId = '';
const proj = { ins: '', upd: '' };

async function sweep() {
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  const ids = (ps ?? []).map((p) => p.id as string);
  if (ids.length) {
    await admin.from('project_financials').delete().in('project_id', ids);
    await admin.from('project_assignments').delete().in('project_id', ids);
    await deleteProjects(admin, ids);
  }
  await admin.from('contacts').delete().eq('last_name', `${MARKER} Client`);
}

async function makeProject(tag: string, seq: number): Promise<string> {
  const { data: p, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      project_number: `PRJ-PFD-${tag}`,
      name: `${MARKER} ${tag} project`,
      status: 'active',
      project_internal_seq: seq,
    })
    .select('id')
    .single();
  if (error) throw new Error(`project ${tag}: ${error.message}`);
  const { error: aErr } = await admin.from('project_assignments').insert({
    company_id: companyId,
    project_id: p!.id,
    member_id: peMemberId,
    role_on_project: 'project_executive',
  });
  if (aErr) throw new Error(`assign ${tag}: ${aErr.message}`);
  return p!.id as string;
}

const tally = async (projectId: string) => {
  const { count, error } = await admin
    .from('project_financials')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  if (error) throw new Error(`tally: ${error.message}`);
  return count ?? 0;
};
const valueOf = async (projectId: string) => {
  const { data } = await admin
    .from('project_financials')
    .select('contract_value')
    .eq('project_id', projectId)
    .single();
  return data ? Number(data.contract_value) : null;
};

beforeAll(async () => {
  assertRebuildTest();
  const { data: prof, error } = await admin
    .from('profiles')
    .select('id, company_id, role')
    .eq('email', PE)
    .single();
  if (error || !prof) throw new Error(`no ${PE} — run scripts/seed-test-identities.mjs`);
  expect(prof.role).toBe('project_executive');
  companyId = prof.company_id as string;
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', prof.id)
    .single();
  peMemberId = m!.id as string;

  await sweep();
  const { data: c, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId,
      first_name: 'PFD',
      last_name: `${MARKER} Client`,
      contact_type: 'client',
    })
    .select('id')
    .single();
  if (cErr) throw new Error(`contact: ${cErr.message}`);
  contactId = c!.id as string;

  // Ordered: the highest seq, so the fixture's sequence cannot collide.
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  const base = (seqRow?.project_internal_seq ?? 0) + 6000;
  proj.ins = await makeProject('INS', base);
  proj.upd = await makeProject('UPD', base + 1);
  const { error: fErr } = await admin
    .from('project_financials')
    .insert({ company_id: companyId, project_id: proj.upd, contract_value: 50000 });
  if (fErr) throw new Error(`financials: ${fErr.message}`);

  pe = await sessionFor(PE);
}, 120_000);

afterAll(async () => {
  await sweep();
}, 120_000);

describe('S114 Q14 A — the PE reads its project_financials row but cannot write it', () => {
  it('F0 fixture: INS holds no row, UPD holds one at 50000 (non-vacuous)', async () => {
    expect(await tally(proj.ins)).toBe(0);
    expect(await tally(proj.upd)).toBe(1);
    expect(await valueOf(proj.upd)).toBe(50000);
  });

  it('F3 CONTROL — the PE still READS its own project’s row (SELECT arm kept)', async () => {
    const { data, error } = await pe
      .from('project_financials')
      .select('contract_value')
      .eq('project_id', proj.upd);
    expect(error, error?.message).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect(Number(data![0].contract_value)).toBe(50000);
  });

  it('F1 INSERT on its OWN project is refused — no RETURNING, service-role tally 0 → 0', async () => {
    const before = await tally(proj.ins);
    const { error } = await pe
      .from('project_financials')
      .insert({ project_id: proj.ins, contract_value: 1 });
    const after = await tally(proj.ins);
    expect(before).toBe(0);
    expect(error?.message ?? '', 'the insert was not refused').toMatch(/row-level security/i);
    expect(after).toBe(0);
  });

  it('F2 UPDATE of contract_value on its OWN project changes nothing — service-role read 50000 → 50000', async () => {
    const before = await valueOf(proj.upd);
    await pe
      .from('project_financials')
      .update({ contract_value: 999999 })
      .eq('project_id', proj.upd);
    const after = await valueOf(proj.upd);
    expect(before).toBe(50000);
    expect(after, 'the PE raised its own billing ceiling').toBe(50000);
  });

  it('F2b nor can it NULL the ceiling (no value = no ceiling on fixed price)', async () => {
    await pe.from('project_financials').update({ contract_value: null }).eq('project_id', proj.upd);
    expect(await valueOf(proj.upd)).toBe(50000);
  });
});
