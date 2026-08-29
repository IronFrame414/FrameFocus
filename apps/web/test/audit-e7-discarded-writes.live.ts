// Full-audit 2026-08-29 §E Class 7 — the four writes that reported success
// over an RLS-discarded UPDATE. Each test here proves the FIXED service
// reports a refused write as refused (DISCARDED), and each carries a
// positive control proving the same row IS updatable by the privileged role
// — so a pass cannot be vacuous, and removing the applied() guard turns the
// refused arm red (the service would report success again).
//
// The client factory is mocked to a real signed-in session per test — the
// s146 pattern: ONLY the factory is replaced; RLS is live.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { DISCARDED } from '@/lib/services/mutation-result';

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));

import { updatePoLogistics } from '@/lib/services/po-lines-client';
import { reorderFileCategories } from '@/lib/services/file-categories-client';
import { softDeleteCatalogItem, updateCatalogItem } from '@/lib/services/cost-catalog-client';

const MARKER = 'AUDE7';
const OWNER = 'josh+test50@worthprop.com';

let owner: SupabaseClient;
let pm: SupabaseClient;
let foreman: SupabaseClient;
let crew: SupabaseClient;
let companyId: string;
let projectId: string;
let poId: string;
let catalogId: string;
let categoryId: string;

async function sweep() {
  const { data: pos } = await admin
    .from('purchase_orders')
    .select('id')
    .like('vendor_name', `${MARKER}%`);
  const poIds = (pos ?? []).map((p) => p.id);
  if (poIds.length) await admin.from('purchase_orders').delete().in('id', poIds);
  const { data: projects } = await admin.from('projects').select('id').like('name', `${MARKER}%`);
  const pids = (projects ?? []).map((p) => p.id);
  if (pids.length) {
    await admin.from('project_assignments').delete().in('project_id', pids);
    const { error } = await admin.from('projects').delete().in('id', pids);
    if (error) throw new Error(`sweep projects: ${error.message}`);
  }
  await admin.from('cost_catalog').delete().like('name', `${MARKER}%`);
  await admin.from('file_categories').delete().like('label', `${MARKER}%`);
  await admin.from('contacts').delete().like('last_name', `${MARKER}%`);
}

beforeAll(async () => {
  assertRebuildTest();
  [owner, pm, foreman, crew] = await Promise.all([
    sessionFor(OWNER),
    sessionFor('josh+pm@worthprop.com'),
    sessionFor('josh+qa-foreman@worthprop.com'),
    sessionFor('josh+crew@worthprop.com'),
  ]);
  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  companyId = (prof as { company_id: string }).company_id;

  await sweep(); // self-heal after a crashed run

  // Explicit number + seq: the numbering trigger needs a caller company,
  // which the service role does not have (the po18 fixture's own pattern).
  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId,
      first_name: 'Audit',
      last_name: `${MARKER} Client`,
      contact_type: 'client',
    })
    .select('id')
    .single();
  if (cErr) throw new Error(`contact: ${cErr.message}`);
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: proj, error: projErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contact.id,
      project_number: 'PRJ-AUDE7',
      name: `${MARKER} project`,
      status: 'active',
      project_internal_seq: (seqRow?.project_internal_seq ?? 0) + 3000,
    })
    .select('id')
    .single();
  if (projErr) throw new Error(`project: ${projErr.message}`);
  projectId = proj.id;

  const { data: ownerMember, error: omErr } = await admin
    .from('company_members')
    .select('id, profile:profiles!inner(email)')
    .eq('company_id', companyId)
    .eq('profile.email', OWNER)
    .eq('is_deleted', false)
    .single();
  if (omErr) throw new Error(`owner member: ${omErr.message}`);
  const { data: po, error: poErr } = await admin
    .from('purchase_orders')
    .insert({
      company_id: companyId,
      project_id: projectId,
      vendor_name: `${MARKER} vendor`,
      status: 'draft',
      author_member_id: ownerMember.id,
    })
    .select('id')
    .single();
  if (poErr) throw new Error(`po: ${poErr.message}`);
  poId = po.id;

  const { data: cat, error: catErr } = await admin
    .from('cost_catalog')
    .insert({
      company_id: companyId,
      name: `${MARKER} stud`,
      category: 'lumber',
      unit_of_measure: 'each',
      unit_cost: 4.25,
    })
    .select('id')
    .single();
  if (catErr) throw new Error(`catalog: ${catErr.message}`);
  catalogId = cat.id;

  const { data: fc, error: fcErr } = await admin
    .from('file_categories')
    .insert({
      company_id: companyId,
      key: `aude7-${Date.now()}`,
      label: `${MARKER} custom`,
      sort_order: 90,
    })
    .select('id')
    .single();
  if (fcErr) throw new Error(`file_category: ${fcErr.message}`);
  categoryId = fc.id;
}, 180_000);

afterAll(async () => {
  await sweep();
}, 180_000);

describe('E7 — a refused write is reported as refused, never as saved', () => {
  it('updatePoLogistics: crew is DISCARDED and the date is unchanged; owner applies', async () => {
    state.client = crew; // purchase_orders UPDATE admits O/A/PM only (live arm)
    const refused = await updatePoLogistics(poId, { need_by: '2026-09-01' });
    expect(refused.success).toBe(false);
    expect(refused.error).toBe(DISCARDED);
    const { data: after } = await admin
      .from('purchase_orders')
      .select('need_by')
      .eq('id', poId)
      .single();
    expect(after!.need_by).toBeNull(); // untouched

    state.client = owner; // positive control — the same row IS updatable
    const ok = await updatePoLogistics(poId, { need_by: '2026-09-01' });
    expect(ok.success).toBe(true);
    const { data: applied2 } = await admin
      .from('purchase_orders')
      .select('need_by')
      .eq('id', poId)
      .single();
    expect(applied2!.need_by).toBe('2026-09-01');
  });

  it('updateCatalogItem: foreman is DISCARDED and the cost is unchanged; owner applies', async () => {
    state.client = foreman; // cost_catalog UPDATE admits O/A/PM only (live arm)
    const refused = await updateCatalogItem(catalogId, { unit_cost: 9.99 });
    expect(refused.success).toBe(false);
    expect(refused.error).toBe(DISCARDED);
    const { data: after } = await admin
      .from('cost_catalog')
      .select('unit_cost')
      .eq('id', catalogId)
      .single();
    expect(Number(after!.unit_cost)).toBe(4.25);

    state.client = owner;
    const ok = await updateCatalogItem(catalogId, { unit_cost: 5.5 });
    expect(ok.success).toBe(true);
  });

  it('softDeleteCatalogItem: foreman is DISCARDED and the row stays live; owner applies', async () => {
    state.client = foreman;
    const refused = await softDeleteCatalogItem(catalogId);
    expect(refused.success).toBe(false);
    expect(refused.error).toBe(DISCARDED);
    const { data: after } = await admin
      .from('cost_catalog')
      .select('is_deleted')
      .eq('id', catalogId)
      .single();
    expect(after!.is_deleted).toBe(false);

    state.client = owner;
    const ok = await softDeleteCatalogItem(catalogId);
    expect(ok.success).toBe(true);
  });

  it('reorderFileCategories: PM is DISCARDED with no partial note on row 1; owner applies', async () => {
    state.client = pm; // file_categories UPDATE admits O/A only (live arm)
    const refused = await reorderFileCategories([categoryId]);
    expect(refused.success).toBe(false);
    expect(refused.error).toBe(DISCARDED); // exactly — row 1, so no partial suffix
    const { data: after } = await admin
      .from('file_categories')
      .select('sort_order')
      .eq('id', categoryId)
      .single();
    expect(after!.sort_order).toBe(90);

    state.client = owner;
    const ok = await reorderFileCategories([categoryId]);
    expect(ok.success).toBe(true);
    const { data: moved } = await admin
      .from('file_categories')
      .select('sort_order')
      .eq('id', categoryId)
      .single();
    expect(moved!.sort_order).toBe(0);
  });
});
