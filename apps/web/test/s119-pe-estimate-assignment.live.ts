/**
 * S119 ITEM D-2 — a Project Executive sees an estimate ONLY when it is assigned to it.
 *
 * Migration: `20262100000000_s119_pe_estimate_assignment.sql`. RULED [Josh,
 * 2026-09-29]: "I want to be able to assign an estimate to a PE and that is the
 * only one that PE can view." Both paths: "PE can create. I also want to be able
 * to add access to a PE for an estimate I started."
 *
 * ⚠️ THE PE-TO-PE NEGATIVE IS THE LOAD-BEARING ONE: a second PE of the same
 * company reads and writes ZERO of the first's. A second PE is made here through
 * a real invitation (handle_new_user), so no fixture tenant is reshaped.
 *
 * Creation runs the REAL shipped `createEstimate()` (the browser client is mocked
 * to carry the PE's session, as s152 does) — it inserts with `.select()`, so this
 * proves the creator can read its own new estimate back in the same statement.
 * Every NEGATIVE write is made WITHOUT returning rows and counted with the
 * service role [S181c].
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor, TEST_PASSWORD } from './live-session';

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));

import { createEstimate } from '@/lib/services/estimates-client';
import { setEstimatePeAccess } from '@/lib/services/estimate-assignments-client';

const MARKER = 'S119PEA';
const OWNER = 'josh+test50@worthprop.com';
const PE_A = 'josh+qa-pe@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const OTHERS = {
  foreman: 'josh+qa-foreman@worthprop.com',
  crew_member: 'josh+crew@worthprop.com',
  subcontractor: 'josh+qa-sub@worthprop.com',
  client: 'josh+qa-client@worthprop.com',
} as const;
const stamp = Date.now();
const PE_B = `s119pea-pe-b-${stamp}@example.invalid`;

let companyId = '';
let contactId = '';
let owner: SupabaseClient;
let peA: SupabaseClient;
let peB: SupabaseClient;
let pm: SupabaseClient;
let peAMember = '';
let peBMember = '';
let peBUser = '';
let peBInvitation = '';
/** Created by PE A through the real service. */
let estA = '';
/** Started by the Owner; access granted to PE B by the Owner. */
let estOwnerToB = '';
/** Started by the Owner; assigned to nobody. */
let estUnassigned = '';
/** A converted estimate on a project PE A is assigned to (path 2), and that assignment. */
let estOnProject = '';
let projAssignment = '';

async function sweep(): Promise<void> {
  const { data } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const es = ((data ?? []) as { id: string }[]).map((e) => e.id);
  if (es.length) {
    await admin.from('estimate_assignments').delete().in('estimate_id', es);
    const { data: lis } = await admin.from('estimate_line_items').select('id').in('estimate_id', es);
    const li = ((lis ?? []) as { id: string }[]).map((l) => l.id);
    if (li.length) await admin.from('estimate_line_rows').delete().in('line_item_id', li);
    await admin.from('estimate_line_items').delete().in('estimate_id', es);
    await admin.from('estimate_subcategories').delete().in('estimate_id', es);
    await admin.from('estimate_categories').delete().in('estimate_id', es);
    await admin.from('estimate_events').delete().in('estimate_id', es);
    const { error } = await admin.from('estimates').delete().in('id', es);
    if (error) throw new Error(`sweep estimates: ${error.message}`);
  }
}

async function draft(label: string, extra: Record<string, unknown> = {}): Promise<string> {
  const { data: o } = await admin.from('profiles').select('user_id').eq('email', OWNER).single();
  const { data, error } = await admin
    .from('estimates')
    .insert({
      company_id: companyId,
      name: `${MARKER} ${label}`,
      estimate_number: `${MARKER}-${label}-${stamp}`,
      contact_id: contactId,
      status: 'draft',
      created_by: (o as { user_id: string }).user_id,
      created_by_role: 'owner',
      ...extra,
    })
    .select('id')
    .single();
  if (error) throw new Error(`draft ${label}: ${error.message}`);
  return (data as { id: string }).id;
}

async function readCount(c: SupabaseClient, estimateId: string): Promise<number> {
  const { data } = await c.from('estimates').select('id').eq('id', estimateId);
  return (data ?? []).length;
}
async function nameOf(estimateId: string): Promise<string> {
  const { data } = await admin.from('estimates').select('name').eq('id', estimateId).single();
  return (data as { name: string }).name;
}
async function liveAssignee(estimateId: string): Promise<string[]> {
  const { data } = await admin
    .from('estimate_assignments').select('member_id').eq('estimate_id', estimateId).eq('is_deleted', false);
  return ((data ?? []) as { member_id: string }[]).map((r) => r.member_id);
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: co } = await admin.from('companies').select('id').eq('name', 'Sabal Point Construction').single();
  companyId = (co as { id: string }).id;
  const { data: ct } = await admin
    .from('contacts').select('id').eq('company_id', companyId).eq('is_deleted', false).order('id').limit(1).single();
  contactId = (ct as { id: string }).id;
  await sweep();

  owner = await sessionFor(OWNER);
  peA = await sessionFor(PE_A);
  pm = await sessionFor(PM);
  const { data: pa } = await admin.from('profiles').select('id').eq('email', PE_A).single();
  const { data: ma } = await admin.from('company_members').select('id').eq('profile_id', (pa as { id: string }).id).single();
  peAMember = (ma as { id: string }).id;

  // A second PE of the same company, through a real invitation.
  const { data: o } = await admin.from('profiles').select('user_id').eq('email', OWNER).single();
  const ownerUser = (o as { user_id: string }).user_id;
  const token = randomUUID();
  const { data: inv, error: iErr } = await admin
    .from('invitations')
    .insert({ company_id: companyId, email: PE_B, role: 'project_executive', invited_by: ownerUser, created_by: ownerUser, token })
    .select('id')
    .single();
  if (iErr) throw new Error(`invite PE B: ${iErr.message}`);
  peBInvitation = (inv as { id: string }).id;
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email: PE_B, password: TEST_PASSWORD, email_confirm: true,
    user_metadata: { first_name: 'S119', last_name: 'PE B', invitation_token: token },
  });
  if (uErr) throw new Error(`PE B signup: ${uErr.message}`);
  peBUser = u.user!.id;
  const { data: pb } = await admin.from('profiles').select('id, role').eq('user_id', peBUser).single();
  expect((pb as { role: string }).role).toBe('project_executive');
  const { data: mb } = await admin.from('company_members').select('id').eq('profile_id', (pb as { id: string }).id).single();
  peBMember = (mb as { id: string }).id;
  peB = await sessionFor(PE_B);

  estOwnerToB = await draft('owner-to-b');
  estUnassigned = await draft('unassigned');

  // Path 2: a CONVERTED estimate on a project PE A is assigned to.
  const { data: proj } = await admin
    .from('projects').select('id').eq('company_id', companyId).eq('name', 'QA A — isolation fixture').single();
  const projectId = (proj as { id: string }).id;
  estOnProject = await draft('on-project', { status: 'converted', project_id: projectId });
  const { data: existing } = await admin
    .from('project_assignments').select('id, is_deleted').eq('project_id', projectId).eq('member_id', peAMember).maybeSingle();
  if (existing && !(existing as { is_deleted: boolean }).is_deleted) {
    projAssignment = '';
  } else {
    const { data: ins, error } = await admin
      .from('project_assignments')
      .insert({ company_id: companyId, project_id: projectId, member_id: peAMember, role_on_project: 'project_executive' })
      .select('id')
      .single();
    if (error) throw new Error(`assign PE A to project: ${error.message}`);
    projAssignment = (ins as { id: string }).id;
  }
}, 240_000);

afterAll(async () => {
  await sweep();
  if (projAssignment) await admin.from('project_assignments').delete().eq('id', projAssignment);
  if (peBInvitation) await admin.from('invitations').delete().eq('id', peBInvitation);
  if (peBUser) {
    const { data: pb } = await admin.from('profiles').select('id').eq('user_id', peBUser).maybeSingle();
    if (pb) {
      await admin.from('company_members').delete().eq('profile_id', (pb as { id: string }).id);
      await admin.from('profiles').delete().eq('id', (pb as { id: string }).id);
    }
    await admin.auth.admin.deleteUser(peBUser).catch(() => undefined);
  }
  const { data } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  expect(data ?? [], 'S119PEA estimates survived teardown').toHaveLength(0);
}, 240_000);

describe('path 1 — the PE creates its own estimate, and creating assigns it', () => {
  it('the REAL createEstimate() as PE A returns the new id (insert … select: it reads its own row back)', async () => {
    state.client = peA;
    const r = await createEstimate({ name: `${MARKER} by-pe-a ${stamp}`, contact_id: contactId });
    expect(r.error ?? null).toBeNull();
    expect(r.success).toBe(true);
    estA = r.id!;
    expect(await liveAssignee(estA)).toEqual([peAMember]);
    expect(await readCount(peA, estA)).toBe(1);
  });

  it('PE A builds on it: a category and a line land (service-role count), pricing mode switches', async () => {
    const name = `${MARKER} cat ${Date.now()}`;
    await peA.from('estimate_categories').insert({ estimate_id: estA, name, sort_order: 0 });
    const { data: cat } = await admin.from('estimate_categories').select('id').eq('estimate_id', estA).eq('name', name);
    expect(cat ?? []).toHaveLength(1);
    await peA.from('estimate_line_items').insert({
      estimate_id: estA, category_id: (cat as { id: string }[])[0].id, name: `${MARKER} line`, sort_order: 0,
    });
    const { count } = await admin.from('estimate_line_items').select('id', { count: 'exact', head: true }).eq('estimate_id', estA);
    expect(count).toBe(1);
    const sw = await peA.rpc('switch_pricing_mode', { p_estimate_id: estA, p_new_mode: 'margin' });
    expect(sw.error).toBeNull();
  });
});

describe('path 2 — the Owner grants a PE access to an estimate the Owner started', () => {
  it('before: PE B reads 0 of it', async () => {
    expect(await readCount(peB, estOwnerToB)).toBe(0);
  });
  it('the REAL setEstimatePeAccess() as the Owner assigns PE B', async () => {
    state.client = owner;
    const r = await setEstimatePeAccess(estOwnerToB, peBMember);
    expect(r.error ?? null).toBeNull();
    expect(await liveAssignee(estOwnerToB)).toEqual([peBMember]);
  });
  it('after: PE B reads it (1) and builds on it — exactly as on one it created', async () => {
    expect(await readCount(peB, estOwnerToB)).toBe(1);
    const name = `${MARKER} b renamed ${Date.now()}`;
    await peB.from('estimates').update({ name }).eq('id', estOwnerToB);
    expect(await nameOf(estOwnerToB)).toBe(name);
  });
});

describe('⚠️ PE-to-PE — each PE reads and writes ZERO of the other\'s (the load-bearing negative)', () => {
  it('PE B reads 0 of PE A\'s estimate; PE A reads 0 of PE B\'s', async () => {
    expect(await readCount(peB, estA)).toBe(0);
    expect(await readCount(peA, estOwnerToB)).toBe(0);
  });
  it('PE A cannot rename PE B\'s estimate (service-role count: unchanged)', async () => {
    const before = await nameOf(estOwnerToB);
    await peA.from('estimates').update({ name: `${MARKER} hijack` }).eq('id', estOwnerToB);
    expect(await nameOf(estOwnerToB)).toBe(before);
  });
  it('PE B cannot add a category to PE A\'s estimate (0 rows)', async () => {
    const name = `${MARKER} intrude ${Date.now()}`;
    await peB.from('estimate_categories').insert({ estimate_id: estA, name, sort_order: 5 });
    const { count } = await admin.from('estimate_categories').select('id', { count: 'exact', head: true }).eq('name', name);
    expect(count).toBe(0);
  });
  it('PE B cannot delete PE A\'s line (still 1)', async () => {
    await peB.from('estimate_line_items').delete().eq('estimate_id', estA);
    const { count } = await admin.from('estimate_line_items').select('id', { count: 'exact', head: true }).eq('estimate_id', estA);
    expect(count).toBe(1);
  });
  it('PE B is refused the builder functions on PE A\'s estimate', async () => {
    const sw = await peB.rpc('switch_pricing_mode', { p_estimate_id: estA, p_new_mode: 'markup' });
    expect(sw.error?.message ?? '').toMatch(/not found/i);
    const { data: li } = await admin.from('estimate_line_items').select('id').eq('estimate_id', estA).limit(1).single();
    // Flat-priced, so the function reaches its assignment check (not "not a flat-priced line").
    await admin.from('estimate_line_items').update({ total_price_override: 100 }).eq('id', (li as { id: string }).id);
    const oc = await peB.rpc('set_line_override_cost', { p_line_id: (li as { id: string }).id, p_cost: 1 });
    expect(oc.error?.message ?? '').toMatch(/not found/i);
  });
});

describe('an UNASSIGNED estimate in the same company — zero for every PE', () => {
  it('PE A and PE B each read 0', async () => {
    expect(await readCount(peA, estUnassigned)).toBe(0);
    expect(await readCount(peB, estUnassigned)).toBe(0);
  });
  it('PE A cannot rename it', async () => {
    const before = await nameOf(estUnassigned);
    await peA.from('estimates').update({ name: `${MARKER} hijack` }).eq('id', estUnassigned);
    expect(await nameOf(estUnassigned)).toBe(before);
  });
});

describe('assigning is Owner/Admin only', () => {
  it('PE A cannot assign itself an estimate (0 rows)', async () => {
    await peA.from('estimate_assignments').insert({ estimate_id: estUnassigned, member_id: peAMember });
    expect(await liveAssignee(estUnassigned)).toEqual([]);
  });
  it('PE A cannot re-point PE B\'s assignment to itself', async () => {
    await peA.from('estimate_assignments').update({ member_id: peAMember }).eq('estimate_id', estOwnerToB);
    expect(await liveAssignee(estOwnerToB)).toEqual([peBMember]);
  });
  it('the PM cannot assign either (0 rows)', async () => {
    await pm.from('estimate_assignments').insert({ estimate_id: estUnassigned, member_id: peAMember });
    expect(await liveAssignee(estUnassigned)).toEqual([]);
  });
  it('an estimate cannot be assigned to someone who is not a PE (shape trigger)', async () => {
    const { data: pmProf } = await admin.from('profiles').select('id').eq('email', PM).single();
    const { data: pmMember } = await admin.from('company_members').select('id').eq('profile_id', (pmProf as { id: string }).id).single();
    state.client = owner;
    const r = await setEstimatePeAccess(estUnassigned, (pmMember as { id: string }).id);
    expect(r.success).toBe(false);
    expect(await liveAssignee(estUnassigned)).toEqual([]);
  });
});

describe('the PE does not send, submit, void, convert or clone', () => {
  it('PE A cannot move its own estimate out of draft (sent / review): still draft', async () => {
    for (const status of ['sent', 'review']) {
      await peA.from('estimates').update({ status }).eq('id', estA);
      const { data } = await admin.from('estimates').select('status').eq('id', estA).single();
      expect((data as { status: string }).status).toBe('draft');
    }
  });
  it('PE A cannot soft-delete its own estimate', async () => {
    await peA.from('estimates').update({ is_deleted: true }).eq('id', estA);
    const { data } = await admin.from('estimates').select('is_deleted').eq('id', estA).single();
    expect((data as { is_deleted: boolean }).is_deleted).toBe(false);
  });
  it('convert_estimate_to_project refuses PE A, and no project row appears', async () => {
    const r = await peA.rpc('convert_estimate_to_project', { p_estimate_id: estA });
    expect(r.error).not.toBeNull();
    const { data } = await admin.from('estimates').select('project_id, status').eq('id', estA).single();
    expect(data).toEqual({ project_id: null, status: 'draft' });
  });
  it('clone_estimate refuses PE A (no new estimate)', async () => {
    const { count: before } = await admin.from('estimates').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
    const r = await peA.rpc('clone_estimate', { p_estimate_id: estA });
    expect(r.error).not.toBeNull();
    const { count: after } = await admin.from('estimates').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
    expect(after).toBe(before);
  });
});

describe('two read paths, stated — and the pair does not over-grant', () => {
  it('path 2 (project arm, unchanged): PE A reads the CONVERTED estimate on its project without any estimate assignment', async () => {
    expect(await liveAssignee(estOnProject)).toEqual([]);
    expect(await readCount(peA, estOnProject)).toBe(1);
  });
  it('…read-only: PE A cannot rename it', async () => {
    const before = await nameOf(estOnProject);
    await peA.from('estimates').update({ name: `${MARKER} hijack` }).eq('id', estOnProject);
    expect(await nameOf(estOnProject)).toBe(before);
  });
  it('…and PE B (not on that project, not assigned) reads 0 of it', async () => {
    expect(await readCount(peB, estOnProject)).toBe(0);
  });
});

describe('every other role unchanged on the new PE estimate', () => {
  it('the PM reads 0 of PE A\'s estimate and cannot rename it', async () => {
    expect(await readCount(pm, estA)).toBe(0);
    const before = await nameOf(estA);
    await pm.from('estimates').update({ name: `${MARKER} hijack` }).eq('id', estA);
    expect(await nameOf(estA)).toBe(before);
  });
  for (const [role, email] of Object.entries(OTHERS)) {
    it(`${role} reads 0 of PE A's and PE B's estimates and 0 assignment rows`, async () => {
      const c = await sessionFor(email);
      expect(await readCount(c, estA)).toBe(0);
      expect(await readCount(c, estOwnerToB)).toBe(0);
      const { data } = await c.from('estimate_assignments').select('id');
      expect(data ?? []).toHaveLength(0);
    });
  }
  it('Owner reads both and every assignment row; PE A reads only its own assignment row', async () => {
    expect(await readCount(owner, estA)).toBe(1);
    expect(await readCount(owner, estOwnerToB)).toBe(1);
    const { data: mine } = await peA.from('estimate_assignments').select('member_id');
    expect(((mine ?? []) as { member_id: string }[]).every((r) => r.member_id === peAMember)).toBe(true);
    expect((mine ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
