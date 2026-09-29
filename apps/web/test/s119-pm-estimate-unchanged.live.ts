/**
 * S119 ITEM D-1 — the Project Manager's estimate access, as a TOTAL role map,
 * run BEFORE and AFTER `20262100000000_s119_pe_estimate_assignment.sql`.
 *
 * RULED [Josh, 2026-09-29]: "Leave PM as it was before all of this started.
 * Nothing we are doing should touch PM." This file uses NO object the migration
 * creates, so it runs unchanged on both sides; the two runs must be identical.
 *
 * Every role, two drafts: one the Owner wrote, one the PM wrote. Reads are row
 * counts through each session; writes are made WITHOUT returning rows and
 * counted through the service role [S181c].
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const MARKER = 'S119PMU';
const EMAIL: Record<CompanyRole, string> = {
  owner: 'josh+test50@worthprop.com',
  admin: 'josh+qa-admin@worthprop.com',
  project_executive: 'josh+qa-pe@worthprop.com',
  project_manager: 'josh+pm@worthprop.com',
  foreman: 'josh+qa-foreman@worthprop.com',
  crew_member: 'josh+crew@worthprop.com',
  client: 'josh+qa-client@worthprop.com',
  subcontractor: 'josh+qa-sub@worthprop.com',
};
const S: Partial<Record<CompanyRole, SupabaseClient>> = {};
let companyId = '';
let contactId = '';
let ownerDraft = '';
let pmDraft = '';
const ids = { ownerLine: '', pmLine: '' };

async function sweep(): Promise<void> {
  const { data } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const es = ((data ?? []) as { id: string }[]).map((e) => e.id);
  if (!es.length) return;
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

async function makeDraft(authorEmail: string, label: string): Promise<string> {
  const { data: p } = await admin.from('profiles').select('user_id, role').eq('email', authorEmail).single();
  const author = p as { user_id: string; role: string };
  const { data, error } = await admin
    .from('estimates')
    .insert({
      company_id: companyId,
      name: `${MARKER} ${label}`,
      estimate_number: `${MARKER}-${label}-${Date.now()}`,
      contact_id: contactId,
      status: 'draft',
      created_by: author.user_id,
      created_by_role: author.role,
    })
    .select('id')
    .single();
  if (error) throw new Error(`draft ${label}: ${error.message}`);
  return (data as { id: string }).id;
}

async function line(estimateId: string): Promise<string> {
  const { data: cat } = await admin
    .from('estimate_categories')
    .insert({ company_id: companyId, estimate_id: estimateId, name: 'Framing', sort_order: 0 })
    .select('id')
    .single();
  const { data, error } = await admin
    .from('estimate_line_items')
    .insert({ company_id: companyId, estimate_id: estimateId, category_id: (cat as { id: string }).id, name: 'Studs', sort_order: 0,
      // Flat-priced, so set_line_override_cost reaches its author check (a line
      // without an override stops at "not a flat-priced line" first — first run).
      total_price_override: 100 })
    .select('id')
    .single();
  if (error) throw new Error(`line: ${error.message}`);
  return (data as { id: string }).id;
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: co } = await admin.from('companies').select('id').eq('name', 'Sabal Point Construction').single();
  companyId = (co as { id: string }).id;
  const { data: ct } = await admin
    .from('contacts').select('id').eq('company_id', companyId).eq('is_deleted', false).order('id').limit(1).single();
  contactId = (ct as { id: string }).id;
  await sweep();
  ownerDraft = await makeDraft(EMAIL.owner, 'owner');
  pmDraft = await makeDraft(EMAIL.project_manager, 'pm');
  ids.ownerLine = await line(ownerDraft);
  ids.pmLine = await line(pmDraft);
  for (const r of Object.keys(EMAIL) as CompanyRole[]) S[r] = await sessionFor(EMAIL[r]);
}, 240_000);

afterAll(async () => {
  await sweep();
}, 120_000);

async function reads(role: CompanyRole, estimateId: string): Promise<number> {
  const { data } = await S[role]!.from('estimates').select('id').eq('id', estimateId);
  return (data ?? []).length;
}

const READ_OWNER_DRAFT: Record<CompanyRole, boolean> = {
  owner: true, admin: true, project_executive: false, project_manager: false,
  foreman: false, crew_member: false, client: false, subcontractor: false,
};
const READ_PM_DRAFT: Record<CompanyRole, boolean> = {
  owner: true, admin: true, project_executive: false, project_manager: true,
  foreman: false, crew_member: false, client: false, subcontractor: false,
};

describe('D-1 — who reads a draft (total map; PE unassigned)', () => {
  forEveryRole(READ_OWNER_DRAFT, (role, allowed) => {
    it(`the Owner's draft: ${role} → ${allowed}`, async () => {
      expect(await reads(role, ownerDraft)).toBe(allowed ? 1 : 0);
    });
  });
  forEveryRole(READ_PM_DRAFT, (role, allowed) => {
    it(`the PM's draft: ${role} → ${allowed}`, async () => {
      expect(await reads(role, pmDraft)).toBe(allowed ? 1 : 0);
    });
  });
});

describe('D-1 — what the PM writes (unchanged)', () => {
  it('renames ITS OWN draft (counted with the service role)', async () => {
    const name = `${MARKER} pm renamed ${Date.now()}`;
    await S.project_manager!.from('estimates').update({ name }).eq('id', pmDraft);
    const { data } = await admin.from('estimates').select('name').eq('id', pmDraft).single();
    expect((data as { name: string }).name).toBe(name);
  });
  it('does NOT rename the Owner\'s draft', async () => {
    const { data: before } = await admin.from('estimates').select('name').eq('id', ownerDraft).single();
    await S.project_manager!.from('estimates').update({ name: `${MARKER} hijack` }).eq('id', ownerDraft);
    const { data: after } = await admin.from('estimates').select('name').eq('id', ownerDraft).single();
    expect(after).toEqual(before);
  });
  it('adds a category to its own draft (1) and not to the Owner\'s (0)', async () => {
    for (const [est, want] of [[pmDraft, 1], [ownerDraft, 0]] as const) {
      const name = `${MARKER} cat ${Date.now()}`;
      await S.project_manager!.from('estimate_categories').insert({ estimate_id: est, name, sort_order: 9 });
      const { count } = await admin
        .from('estimate_categories').select('id', { count: 'exact', head: true }).eq('estimate_id', est).eq('name', name);
      expect(count).toBe(want);
    }
  });
  it('switch_pricing_mode: its own draft succeeds, the Owner\'s is refused', async () => {
    const own = await S.project_manager!.rpc('switch_pricing_mode', { p_estimate_id: pmDraft, p_new_mode: 'margin' });
    expect(own.error).toBeNull();
    const other = await S.project_manager!.rpc('switch_pricing_mode', { p_estimate_id: ownerDraft, p_new_mode: 'margin' });
    expect(other.error?.message ?? '').toMatch(/own estimates/);
  });
  it('set_line_override_cost: its own draft is admitted past the role check, the Owner\'s reads "not found"', async () => {
    const own = await S.project_manager!.rpc('set_line_override_cost', { p_line_id: ids.pmLine, p_cost: 12 });
    expect(own.error?.message ?? '').not.toMatch(/Only Owner|not found/);
    const other = await S.project_manager!.rpc('set_line_override_cost', { p_line_id: ids.ownerLine, p_cost: 12 });
    expect(other.error?.message ?? '').toMatch(/not found/);
  });
});
