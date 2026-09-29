/**
 * S118 item 7 — THE THREE RULED FIXES, each proved on rebuild-test.
 *
 *   A. #171 20262030000000 — moving a file to or from Trash is Owner/Admin/PM/PE only.
 *   B. #172 20262040000000 — no direct write of a budget figure on project_budget_amounts.
 *   C. #167 20262050000000 — a hand-entered expense on a subcontract no longer locks
 *      setup_payment_schedule(), and revise never trashes it.
 *
 * ⚠️ EVERY NEGATIVE IS WRITTEN WITHOUT RETURNING ROWS and judged by the SERVICE ROLE.
 * With `.select()` the read policy would judge the row and the test could not fail.
 * Positive controls run first where a negative could pass vacuously (a crew UPDATE
 * that RLS never admitted would also leave `is_deleted` false).
 *
 * Fresh disposable project (marker `S118F`), swept before and after.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { admin, assertRebuildTest, deleteProjects, sessionFor } from './live-session';

const MARKER = 'S118F';
const IDENTITY: Record<CompanyRole, string> = {
  owner: 'josh+test50@worthprop.com',
  admin: 'josh+qa-admin@worthprop.com',
  project_executive: 'josh+qa-pe@worthprop.com',
  project_manager: 'josh+pm@worthprop.com',
  foreman: 'josh+qa-foreman@worthprop.com',
  crew_member: 'josh+crew@worthprop.com',
  client: 'josh+qa-client@worthprop.com',
  subcontractor: 'josh+qa-sub@worthprop.com',
};
const ASSIGN: Partial<Record<CompanyRole, string>> = {
  project_executive: 'project_executive',
  project_manager: 'project_manager',
  foreman: 'crew',
  crew_member: 'crew',
  subcontractor: 'crew',
};

const session = {} as Record<CompanyRole, SupabaseClient>;
let companyId = '';
let contactId = '';
let projectId = '';
let subMemberId = '';

async function memberIdOf(email: string): Promise<string> {
  const { data: p } = await admin.from('profiles').select('id').eq('email', email).single();
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', p!.id)
    .single();
  return m!.id as string;
}

async function sweep() {
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  const ids = (ps ?? []).map((p) => p.id as string);
  if (ids.length) {
    await admin.from('files').delete().in('project_id', ids);
    const { data: ex } = await admin.from('expenses').select('id').in('project_id', ids);
    const exIds = (ex ?? []).map((e) => e.id as string);
    if (exIds.length) {
      await admin.from('expense_allocations').delete().in('expense_id', exIds);
      await admin.from('qb_sync_queue').delete().in('entity_id', exIds);
      await admin.from('expenses').delete().in('id', exIds);
    }
    await admin.from('subcontractor_contracts').delete().in('project_id', ids);
    const { data: items } = await admin
      .from('project_budget_items')
      .select('id')
      .in('project_id', ids);
    const itemIds = (items ?? []).map((i) => i.id as string);
    if (itemIds.length) await admin.from('project_budget_items').delete().in('id', itemIds);
    await admin.from('project_assignments').delete().in('project_id', ids);
    await deleteProjects(admin, ids);
  }
  await admin.from('company_members').delete().eq('display_name', `${MARKER} Sub`);
  const { data: cs } = await admin
    .from('contacts')
    .select('id')
    .eq('last_name', `${MARKER} Client`);
  const cIds = (cs ?? []).map((c) => c.id as string);
  if (cIds.length) {
    await admin.from('qb_sync_queue').delete().in('entity_id', cIds);
    await admin.from('contacts').delete().in('id', cIds);
  }
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', IDENTITY.owner)
    .single();
  companyId = prof!.company_id as string;
  await sweep();

  const { data: c, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId,
      first_name: 'Fix',
      last_name: `${MARKER} Client`,
      contact_type: 'client',
    })
    .select('id')
    .single();
  if (cErr) throw new Error(`contact: ${cErr.message}`);
  contactId = c!.id as string;

  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: p, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      project_number: `PRJ-${MARKER}`,
      name: `${MARKER} fixes project`,
      status: 'active',
      project_internal_seq: (seqRow?.project_internal_seq ?? 0) + 7000,
    })
    .select('id')
    .single();
  if (pErr) throw new Error(`project: ${pErr.message}`);
  projectId = p!.id as string;

  for (const [role, onProject] of Object.entries(ASSIGN) as [CompanyRole, string][]) {
    const { error } = await admin.from('project_assignments').insert({
      company_id: companyId,
      project_id: projectId,
      member_id: await memberIdOf(IDENTITY[role]),
      role_on_project: onProject,
    });
    if (error) throw new Error(`assign ${role}: ${error.message}`);
  }

  const { data: sm, error: smErr } = await admin
    .from('company_members')
    .insert({ company_id: companyId, member_type: 'subcontractor', display_name: `${MARKER} Sub` })
    .select('id')
    .single();
  if (smErr) throw new Error(`sub member: ${smErr.message}`);
  subMemberId = sm!.id as string;

  for (const role of Object.keys(IDENTITY) as CompanyRole[])
    session[role] = await sessionFor(IDENTITY[role]);
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .like('name', `${MARKER} %`);
  expect(count ?? 0, 'disposable S118F projects survived teardown').toBe(0);
}, 180_000);

// ─── A. #171 ─────────────────────────────────────────────────────────────────
let fileSeq = 0;
async function seedFile(extra: Record<string, unknown> = {}): Promise<string> {
  fileSeq += 1;
  const { data, error } = await admin
    .from('files')
    .insert({
      company_id: companyId,
      project_id: projectId,
      category: 'photos',
      file_name: `${MARKER}-${fileSeq}.png`,
      file_path: `${companyId}/${projectId}/${MARKER}-${fileSeq}.png`,
      file_size: 1,
      mime_type: 'image/png',
      tags: [],
      ...extra,
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed file: ${error.message}`);
  return data!.id as string;
}
async function fileRow(id: string) {
  const { data } = await admin
    .from('files')
    .select('is_deleted, deleted_at, tags, category, markup_data')
    .eq('id', id)
    .single();
  return data as {
    is_deleted: boolean;
    deleted_at: string | null;
    tags: string[];
    category: string;
    markup_data: unknown;
  };
}

const MAY_TRASH: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true,
  project_manager: true,
  foreman: false,
  crew_member: false,
  subcontractor: false,
  client: false,
};
// Roles RLS admits to UPDATE a photo on a project they can view — the control.
const RLS_UPDATES: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true,
  project_manager: true,
  foreman: true,
  crew_member: true,
  subcontractor: true,
  client: false,
};

describe('A · #171 — Trash is Owner/Admin/PM/PE (total role map)', () => {
  forEveryRole(MAY_TRASH, (role, allowed) => {
    it(`${role}: control tag write ${RLS_UPDATES[role] ? 'lands' : 'refused'}; soft delete ${allowed ? 'lands' : 'REFUSED'}`, async () => {
      const id = await seedFile();
      // CONTROL: the same identity CAN update this row (so a refused delete is the floor, not RLS).
      await session[role]
        .from('files')
        .update({ tags: [`${MARKER}-control`] })
        .eq('id', id);
      expect((await fileRow(id)).tags.includes(`${MARKER}-control`), `${role} control`).toBe(
        RLS_UPDATES[role]
      );
      // THE WRITE, no returning.
      await session[role]
        .from('files')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', id);
      const after = await fileRow(id);
      expect(after.is_deleted, `${role} soft delete`).toBe(allowed);
      expect(after.deleted_at !== null, `${role} deleted_at`).toBe(allowed);
    });
  });

  it('crew cannot walk around it by recategorising in the same statement', async () => {
    const id = await seedFile();
    await session.crew_member
      .from('files')
      .update({ category: 'other', is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id);
    const after = await fileRow(id);
    expect(after.is_deleted).toBe(false);
    expect(after.category).toBe('photos');
  });

  it('crew cannot RESTORE a file a manager trashed', async () => {
    const id = await seedFile({ is_deleted: true, deleted_at: new Date().toISOString() });
    await session.crew_member
      .from('files')
      .update({ is_deleted: false, deleted_at: null })
      .eq('id', id);
    expect((await fileRow(id)).is_deleted).toBe(true);
  });

  it('a PM CAN restore (positive)', async () => {
    const id = await seedFile({ is_deleted: true, deleted_at: new Date().toISOString() });
    await session.project_manager
      .from('files')
      .update({ is_deleted: false, deleted_at: null })
      .eq('id', id);
    expect((await fileRow(id)).is_deleted).toBe(false);
  });

  it('crew still saves markup on a photo (the legitimate write is untouched)', async () => {
    const id = await seedFile();
    await session.crew_member
      .from('files')
      .update({ markup_data: { shapes: [], v: MARKER } })
      .eq('id', id);
    expect((await fileRow(id)).markup_data).toEqual({ shapes: [], v: MARKER });
  });

  it('the service role (no auth context) still soft-deletes', async () => {
    const id = await seedFile();
    await admin
      .from('files')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id);
    expect((await fileRow(id)).is_deleted).toBe(true);
  });
});

// ─── B. #172 ─────────────────────────────────────────────────────────────────
async function amountOf(itemId: string): Promise<number | null> {
  const { data } = await admin
    .from('project_budget_amounts')
    .select('budgeted_amount')
    .eq('budget_item_id', itemId)
    .maybeSingle();
  return data ? Number(data.budgeted_amount) : null;
}
async function lineWithAmount(desc: string, amount: number | null): Promise<string> {
  const { data, error } = await admin
    .from('project_budget_items')
    .insert({ company_id: companyId, project_id: projectId, description: `${MARKER} ${desc}` })
    .select('id')
    .single();
  if (error) throw new Error(`line: ${error.message}`);
  if (amount !== null) {
    const { error: aErr } = await admin
      .from('project_budget_amounts')
      .insert({ company_id: companyId, budget_item_id: data!.id, budgeted_amount: amount });
    if (aErr) throw new Error(`amount: ${aErr.message}`);
  }
  return data!.id as string;
}

describe('B · #172 — no direct write of a budget figure', () => {
  forEveryRole(
    {
      owner: false,
      admin: false,
      project_executive: false,
      project_manager: false,
      foreman: false,
      crew_member: false,
      subcontractor: false,
      client: false,
    } as Record<CompanyRole, boolean>,
    (role, lands) => {
      it(`${role}: direct UPDATE of budgeted_amount → ${lands ? 'lands' : 'unchanged'}`, async () => {
        const id = await lineWithAmount(`upd ${role}`, 1000);
        await session[role]
          .from('project_budget_amounts')
          .update({ budgeted_amount: 999 })
          .eq('budget_item_id', id);
        expect(await amountOf(id)).toBe(lands ? 999 : 1000);
      });
    }
  );

  for (const role of ['owner', 'admin', 'project_executive'] as const) {
    it(`${role}: an UPSERT that would overwrite (ON CONFLICT DO UPDATE) → unchanged`, async () => {
      const id = await lineWithAmount(`ups ${role}`, 1000);
      await session[role]
        .from('project_budget_amounts')
        .upsert(
          { company_id: companyId, budget_item_id: id, budgeted_amount: 999 },
          { onConflict: 'budget_item_id' }
        );
      expect(await amountOf(id)).toBe(1000);
    });

    it(`${role}: INSERT of a real figure on a line with no amount row → refused (no row)`, async () => {
      const id = await lineWithAmount(`insN ${role}`, null);
      await session[role]
        .from('project_budget_amounts')
        .insert({ company_id: companyId, budget_item_id: id, budgeted_amount: 500 });
      expect(await amountOf(id)).toBeNull();
    });

    it(`${role}: INSERT of 0 (the ad-hoc line path) → lands`, async () => {
      const id = await lineWithAmount(`ins0 ${role}`, null);
      await session[role]
        .from('project_budget_amounts')
        .insert({ company_id: companyId, budget_item_id: id, budgeted_amount: 0 });
      expect(await amountOf(id)).toBe(0);
    });
  }

  it("POSITIVE CONTROL — R10's lock-checked function still sets the figure (owner, no invoice)", async () => {
    const { data, error } = await session.owner.rpc('add_original_budget_line', {
      p_project_id: projectId,
      p_description: `${MARKER} r10 added`,
      p_budgeted_amount: 100,
      p_cost_code: '09-100',
    });
    expect(error, error?.message).toBeNull();
    const id = data as unknown as string;
    const { error: uErr } = await session.owner.rpc('update_original_budget_line', {
      p_budget_item_id: id,
      p_description: `${MARKER} r10 added`,
      p_budgeted_amount: 250,
      p_cost_code: '09-100',
    });
    expect(uErr, uErr?.message).toBeNull();
    expect(await amountOf(id)).toBe(250);
  });
});

// ─── C. #167 ─────────────────────────────────────────────────────────────────
async function newContract(tag: string): Promise<string> {
  const { data, error } = await admin
    .from('subcontractor_contracts')
    .insert({
      company_id: companyId,
      project_id: projectId,
      member_id: subMemberId,
      status: 'draft',
      contract_value: 3000,
      scope_of_work: `${MARKER} ${tag}`,
    })
    .select('id')
    .single();
  if (error) throw new Error(`subcontract: ${error.message}`);
  return data!.id as string;
}
async function liveRows(contractId: string) {
  const { data } = await admin
    .from('expenses')
    .select('id, stage_label, is_deleted, supplier')
    .eq('sub_contract_id', contractId)
    .eq('is_retainage', false);
  const rows = (data ?? []) as {
    id: string;
    stage_label: string | null;
    is_deleted: boolean;
    supplier: string;
  }[];
  return {
    stages: rows.filter((r) => r.stage_label !== null && !r.is_deleted),
    hand: rows.filter((r) => r.stage_label === null),
  };
}
async function handEntered(contractId: string) {
  // As the OWNER, the way expenses_insert_authorized allows — no returning.
  const { error } = await session.owner.from('expenses').insert({
    project_id: projectId,
    supplier: `${MARKER} hand bill`,
    expense_date: '2026-09-29',
    amount: 42,
    cost_category: 'subcontractor',
    state: 'committed',
    sub_contract_id: contractId,
  });
  if (error) throw new Error(`hand-entered expense: ${error.message}`);
}

describe('C · #167 — a hand-entered bill never locks the payment schedule', () => {
  it('owner: hand bill on the contract, THEN setup succeeds — 2 stages, the hand bill intact', async () => {
    const contract = await newContract('coexist');
    await handEntered(contract);
    expect((await liveRows(contract)).hand).toHaveLength(1);
    const { error } = await session.owner.rpc('setup_payment_schedule', {
      p_sub_contract_id: contract,
      p_stages: [
        { label: 'Rough', amount: 1000 },
        { label: 'Finish', amount: 2000 },
      ],
    });
    expect(error, error?.message).toBeNull();
    const rows = await liveRows(contract);
    expect(rows.stages).toHaveLength(2);
    expect(rows.hand).toHaveLength(1);
    expect(rows.hand[0].is_deleted).toBe(false);
  });

  it('a SECOND setup on a contract that has a schedule is still refused (owner, admin, PM) — rows unchanged', async () => {
    const contract = await newContract('second');
    const { error } = await session.owner.rpc('setup_payment_schedule', {
      p_sub_contract_id: contract,
      p_stages: [{ label: 'Only', amount: 500 }],
    });
    expect(error, error?.message).toBeNull();
    for (const role of ['owner', 'admin', 'project_manager'] as const) {
      const { error: e2 } = await session[role].rpc('setup_payment_schedule', {
        p_sub_contract_id: contract,
        p_stages: [{ label: 'Again', amount: 1 }],
      });
      expect(e2?.message ?? '', role).toContain('a schedule already exists');
      expect((await liveRows(contract)).stages, role).toHaveLength(1);
    }
  });

  it('revise keeps the hand bill: Pass 2 trashes only stages', async () => {
    const contract = await newContract('revise');
    await handEntered(contract);
    const { error } = await session.owner.rpc('setup_payment_schedule', {
      p_sub_contract_id: contract,
      p_stages: [
        { label: 'A', amount: 1000 },
        { label: 'B', amount: 2000 },
      ],
    });
    expect(error, error?.message).toBeNull();
    const { error: rErr } = await session.owner.rpc('revise_sub_contract_schedule', {
      p_sub_contract_id: contract,
      // Unpaid stages are REPLACED, not edited (the function's own rule): resend without id.
      p_stages: [{ label: 'A2', amount: 1500 }],
    });
    expect(rErr, rErr?.message).toBeNull();
    const after = await liveRows(contract);
    expect(after.stages.map((s) => s.stage_label)).toEqual(['A2']);
    expect(after.hand).toHaveLength(1);
    expect(after.hand[0].is_deleted, 'the hand bill was trashed as a stage').toBe(false);
  });
});
