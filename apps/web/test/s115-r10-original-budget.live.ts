/**
 * S115 R10 — ORIGINAL BUDGET LINES ARE EDITABLE UNTIL THE FIRST INVOICE IS ISSUED.
 *
 * Migration: `20262020000000_s115_r10_original_budget_edit.sql`.
 * RULED [Josh, 2026-09-28] R10; unattended decisions S115 ASK-19 (A: sent, paid
 * or voided closes the window) and ASK-R10-PM (A: the PM is not admitted — the
 * Financial Visibility Floor withholds budgeted_amount from it).
 *
 * Every refusal is COUNTED WITH THE SERVICE ROLE: the write functions return
 * nothing, and a refused write must leave the row exactly as it was — asserted
 * by reading it back as admin, never by trusting the caller's view.
 *
 * Fresh disposable projects (marker `R10X`), holding none of the one-per-parent
 * rows; swept before and after.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { admin, assertRebuildTest, deleteProjects, sessionFor } from './live-session';

const MARKER = 'R10X';
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

const session = {} as Record<CompanyRole, SupabaseClient>;
let companyId = '';
let contactId = '';
let peMemberId = '';
let ownerMemberId = '';
const proj = { main: '', off: '', gate: '' };
const line = { added: '', converted: '', co: '', adhoc: '', gateLine: '' };

async function sweep() {
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  const ids = (ps ?? []).map((p) => p.id as string);
  if (ids.length) {
    const { data: invs } = await admin.from('invoices').select('id').in('project_id', ids);
    const invIds = (invs ?? []).map((i) => i.id as string);
    if (invIds.length) {
      await admin.from('qb_sync_queue').delete().in('entity_id', invIds);
      await admin.from('invoices').delete().in('id', invIds);
    }
    const { data: items } = await admin
      .from('project_budget_items')
      .select('id')
      .in('project_id', ids);
    const itemIds = (items ?? []).map((i) => i.id as string);
    if (itemIds.length) await admin.from('project_budget_items').delete().in('id', itemIds); // amounts cascade
    await admin.from('project_qb_exclusions').delete().in('project_id', ids);
    await admin.from('project_assignments').delete().in('project_id', ids);
    await deleteProjects(admin, ids);
  }
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

async function memberIdOf(email: string): Promise<string> {
  const { data: p } = await admin.from('profiles').select('id').eq('email', email).single();
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', p!.id)
    .single();
  return m!.id as string;
}

async function makeProject(tag: string, seq: number, assignPe: boolean): Promise<string> {
  const { data, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      project_number: `PRJ-${MARKER}-${tag}`,
      name: `${MARKER} ${tag} project`,
      status: 'active',
      project_internal_seq: seq,
    })
    .select('id')
    .single();
  if (error) throw new Error(`project ${tag}: ${error.message}`);
  if (assignPe) {
    const { error: aErr } = await admin.from('project_assignments').insert({
      company_id: companyId,
      project_id: data!.id,
      member_id: peMemberId,
      role_on_project: 'project_executive',
    });
    if (aErr) throw new Error(`assign PE ${tag}: ${aErr.message}`);
  }
  return data!.id as string;
}

async function adminLine(
  projectId: string,
  description: string,
  extra: Record<string, unknown>,
  amount: number
): Promise<string> {
  const { data, error } = await admin
    .from('project_budget_items')
    .insert({ company_id: companyId, project_id: projectId, description, ...extra })
    .select('id')
    .single();
  if (error) throw new Error(`line ${description}: ${error.message}`);
  const { error: aErr } = await admin
    .from('project_budget_amounts')
    .insert({ company_id: companyId, budget_item_id: data!.id, budgeted_amount: amount });
  if (aErr) throw new Error(`amount ${description}: ${aErr.message}`);
  return data!.id as string;
}

/** The line as the SERVICE ROLE sees it — the only witness a refusal is judged by. */
async function lineState(id: string) {
  const { data } = await admin
    .from('project_budget_items')
    .select('description, cost_code, project_budget_amounts(budgeted_amount)')
    .eq('id', id)
    .single();
  const embed = (data as { project_budget_amounts: unknown }).project_budget_amounts as
    | { budgeted_amount: number }[]
    | { budgeted_amount: number }
    | null;
  const amt = Array.isArray(embed) ? embed[0]?.budgeted_amount : embed?.budgeted_amount;
  return {
    description: data!.description as string,
    cost_code: data!.cost_code as string | null,
    amount: Number(amt),
  };
}

const edit = (who: SupabaseClient, id: string, description: string, amount: number) =>
  who.rpc('update_original_budget_line', {
    p_budget_item_id: id,
    p_description: description,
    p_budgeted_amount: amount,
    p_cost_code: '09-100',
  });

beforeAll(async () => {
  assertRebuildTest();
  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', IDENTITY.owner)
    .single();
  companyId = prof!.company_id as string;
  [ownerMemberId, peMemberId] = await Promise.all([
    memberIdOf(IDENTITY.owner),
    memberIdOf(IDENTITY.project_executive),
  ]);
  await sweep();

  const { data: c, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId,
      first_name: 'R10',
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
  const base = (seqRow?.project_internal_seq ?? 0) + 7100;
  proj.main = await makeProject('MAIN', base, true);
  proj.off = await makeProject('OFF', base + 1, false); // the PE is NOT assigned here
  proj.gate = await makeProject('GATE', base + 2, true);

  // A CO line and a converted line need real FK targets; any in the company will
  // do (the FK is all they exercise). Ordered, so the pick is stable.
  const { data: co } = await admin
    .from('change_orders')
    .select('id')
    .eq('company_id', companyId)
    .order('created_at')
    .limit(1)
    .single();
  const { data: eli } = await admin
    .from('estimate_line_items')
    .select('id')
    .eq('company_id', companyId)
    .order('created_at')
    .limit(1)
    .single();
  if (!co || !eli)
    throw new Error('fixture company needs ≥1 change order and ≥1 estimate line item');
  line.converted = await adminLine(
    proj.main,
    `${MARKER} converted`,
    { source_line_item_id: eli.id },
    500
  );
  line.co = await adminLine(proj.main, `${MARKER} co line`, { source_change_order_id: co.id }, 700);
  line.adhoc = await adminLine(proj.main, `${MARKER} adhoc`, {}, 0);
  line.gateLine = await adminLine(
    proj.gate,
    `${MARKER} gate`,
    { source_line_item_id: eli.id },
    100
  );

  // A DRAFT invoice on MAIN: an unissued invoice must NOT close the window.
  const { error: dErr } = await admin.from('invoices').insert({
    company_id: companyId,
    project_id: proj.main,
    author_member_id: ownerMemberId,
    title: `${MARKER} draft invoice`,
  });
  if (dErr) throw new Error(`draft invoice: ${dErr.message}`);

  for (const role of Object.keys(IDENTITY) as CompanyRole[])
    session[role] = await sessionFor(IDENTITY[role]);
}, 240_000);

afterAll(async () => {
  await sweep();
}, 180_000);

describe('R10 · who may edit the original budget (a TOTAL map, on a project the PE is assigned to)', () => {
  const EXPECTED: Record<CompanyRole, boolean> = {
    owner: true,
    admin: true,
    project_executive: true,
    project_manager: false, // S115 ASK-R10-PM — Financial Visibility Floor; not an oversight
    foreman: false,
    crew_member: false,
    client: false,
    subcontractor: false,
  };
  forEveryRole(EXPECTED, (role, allowed) => {
    it(`${role} → can_edit_original_budget = ${allowed}, and its edit ${allowed ? 'lands' : 'is refused and changes nothing'}`, async () => {
      const { data: can } = await session[role].rpc('can_edit_original_budget', {
        p_project_id: proj.main,
      });
      expect(can === true).toBe(allowed);

      const before = await lineState(line.converted);
      const desc = `${MARKER} converted by ${role}`;
      const { error } = await edit(session[role], line.converted, desc, 510);
      const after = await lineState(line.converted);
      if (allowed) {
        expect(error, error?.message).toBeNull();
        expect(after).toEqual({ description: desc, cost_code: '09-100', amount: 510 });
      } else {
        expect(error, `${role} edit must be refused`).not.toBeNull();
        expect(after, `${role}: the service role must see the line UNCHANGED`).toEqual(before);
      }
    });
  });
});

describe('R10 · add a line to the original budget', () => {
  it('A1 an Owner adds one: it is marked original, carries its amount, and lists with the original', async () => {
    const { data, error } = await session.owner.rpc('add_original_budget_line', {
      p_project_id: proj.main,
      p_description: `${MARKER} added`,
      p_budgeted_amount: 1234.567,
      p_cost_code: '03-300',
    });
    expect(error, error?.message).toBeNull();
    line.added = data as string;
    const { data: row } = await admin
      .from('project_budget_items')
      .select(
        'added_to_original_budget, source_change_order_id, source_line_item_id, source_line_row_id'
      )
      .eq('id', line.added)
      .single();
    expect(row).toEqual({
      added_to_original_budget: true,
      source_change_order_id: null,
      source_line_item_id: null,
      source_line_row_id: null,
    });
    expect((await lineState(line.added)).amount).toBe(1234.57); // rounded to cents
  });

  it('A2 …and the ADDED line is itself editable', async () => {
    const { error } = await edit(session.owner, line.added, `${MARKER} added, renamed`, 99);
    expect(error, error?.message).toBeNull();
    expect(await lineState(line.added)).toEqual({
      description: `${MARKER} added, renamed`,
      cost_code: '09-100',
      amount: 99,
    });
  });

  it('A3 a PM cannot add (counted: no new line on the project)', async () => {
    const count = async () =>
      (
        await admin
          .from('project_budget_items')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', proj.main)
      ).count;
    const before = await count();
    const { error } = await session.project_manager.rpc('add_original_budget_line', {
      p_project_id: proj.main,
      p_description: `${MARKER} pm add`,
      p_budgeted_amount: 1,
    });
    expect(error).not.toBeNull();
    expect(await count()).toBe(before);
  });
});

describe('R10 · only ORIGINAL lines — change-order and ad-hoc lines stay immutable', () => {
  it('O1 a change-order line is refused, unchanged', async () => {
    const before = await lineState(line.co);
    const { error } = await edit(session.owner, line.co, 'nope', 1);
    expect(error?.message).toMatch(/only an original budget line/);
    expect(await lineState(line.co)).toEqual(before);
  });
  it('O2 an ad-hoc (expense-capture) line is refused, unchanged', async () => {
    const before = await lineState(line.adhoc);
    const { error } = await edit(session.owner, line.adhoc, 'nope', 1);
    expect(error?.message).toMatch(/only an original budget line/);
    expect(await lineState(line.adhoc)).toEqual(before);
  });
});

describe('R10 · the PE is scoped to ITS projects (off-project negatives, counted by the service role)', () => {
  it('P1 on a project it is NOT assigned to: can = false; edit and add refused; nothing changed', async () => {
    const offLine = await adminLine(
      proj.off,
      `${MARKER} off`,
      { source_line_item_id: null, added_to_original_budget: true },
      40
    );
    const { data: can } = await session.project_executive.rpc('can_edit_original_budget', {
      p_project_id: proj.off,
    });
    expect(can).toBe(false);
    const before = await lineState(offLine);
    const { error } = await edit(session.project_executive, offLine, 'pe off', 1);
    expect(error).not.toBeNull();
    expect(await lineState(offLine)).toEqual(before);
    const { error: addErr } = await session.project_executive.rpc('add_original_budget_line', {
      p_project_id: proj.off,
      p_description: `${MARKER} pe off add`,
      p_budgeted_amount: 1,
    });
    expect(addErr).not.toBeNull();
    const { count } = await admin
      .from('project_budget_items')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', proj.off);
    expect(count).toBe(1); // only the line seeded above
  });
});

describe('R10 · the window closes when the first invoice is ISSUED (ASK-19 A)', () => {
  let invoiceId = '';
  it('W0 a DRAFT invoice does not close it (MAIN carries one and was edited above); GATE is open', async () => {
    const { data } = await session.owner.rpc('can_edit_original_budget', {
      p_project_id: proj.gate,
    });
    expect(data).toBe(true);
  });

  it('W1 NOT gated on the QuickBooks exclusion flag: an excluded project is still editable', async () => {
    const { error: xErr } = await admin
      .from('project_qb_exclusions')
      .insert({ company_id: companyId, project_id: proj.gate });
    expect(xErr, xErr?.message).toBeNull();
    const { error } = await edit(
      session.owner,
      line.gateLine,
      `${MARKER} gate while excluded`,
      101
    );
    expect(error, error?.message).toBeNull();
    expect((await lineState(line.gateLine)).amount).toBe(101);
  });

  it('W2 once an invoice is SENT: can = false for Owner and PE; edit and add refused; nothing changed', async () => {
    const { data: invRow, error: iErr } = await admin
      .from('invoices')
      .insert({
        company_id: companyId,
        project_id: proj.gate,
        author_member_id: ownerMemberId,
        title: `${MARKER} gate invoice`,
      })
      .select('id')
      .single();
    if (iErr) throw new Error(iErr.message);
    invoiceId = invRow!.id as string;
    const { error: sErr } = await admin
      .from('invoices')
      .update({ status: 'sent' })
      .eq('id', invoiceId);
    expect(sErr, sErr?.message).toBeNull();

    for (const role of ['owner', 'project_executive'] as const) {
      const { data } = await session[role].rpc('can_edit_original_budget', {
        p_project_id: proj.gate,
      });
      expect(data, role).toBe(false);
    }
    const before = await lineState(line.gateLine);
    const { error } = await edit(session.owner, line.gateLine, 'after invoice', 5);
    expect(error?.message).toMatch(/invoice has been issued/);
    expect(await lineState(line.gateLine)).toEqual(before);
    const { error: addErr } = await session.owner.rpc('add_original_budget_line', {
      p_project_id: proj.gate,
      p_description: `${MARKER} after invoice`,
      p_budgeted_amount: 1,
    });
    expect(addErr).not.toBeNull();
  });

  it('W3 a VOID does not reopen it', async () => {
    const { error: vErr } = await admin
      .from('invoices')
      .update({
        status: 'voided',
        voided_at: new Date().toISOString(),
        void_reason: `${MARKER} void`,
      })
      .eq('id', invoiceId);
    expect(vErr, vErr?.message).toBeNull();
    const { data } = await session.owner.rpc('can_edit_original_budget', {
      p_project_id: proj.gate,
    });
    expect(data).toBe(false);
  });
});

describe('R10 · S97 is NOT reopened: the table still has no UPDATE path of its own', () => {
  it('S1 a direct UPDATE by an Owner still changes nothing (the only path is the function)', async () => {
    const before = await lineState(line.converted);
    await session.owner
      .from('project_budget_items')
      .update({ description: 'direct write' })
      .eq('id', line.converted);
    expect(await lineState(line.converted)).toEqual(before);
  });
});
