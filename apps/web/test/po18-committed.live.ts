// PO module §9 — the committed lifecycle (R-Q1/R-Q5) and THE R-Q2 PREDICATE
// GUARD: an expense linked to a PO through source_po_id must NEVER move
// committed_amount — that is the whole reason the column exists. Also: the
// legacy guard on set_po_total_amount, per-line issue sums, flag authority,
// purchase → close-out → auto-close.
//
// Non-vacuous throughout: every step asserts exact figures read back via admin.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import type { SupabaseClient } from '@supabase/supabase-js';

const MARKER = 'PO18CMT';

let owner: SupabaseClient;
let companyId: string;
let projectId: string;
let budgetA: string;
let budgetB: string;
let poId: string;
let lineIds: string[] = []; // [A1 $200, A2 $300, B1 $150]
let crewMemberId: string;
let crew: SupabaseClient;

async function sweep() {
  const { data: projects } = await admin
    .from('projects')
    .select('id')
    .like('name', `${MARKER}%`);
  const pids = (projects ?? []).map((p) => p.id);
  if (pids.length === 0) return;
  const { data: pos } = await admin.from('purchase_orders').select('id').in('project_id', pids);
  const poIds = (pos ?? []).map((p) => p.id);
  if (poIds.length) {
    const { data: items } = await admin
      .from('purchase_order_items')
      .select('id')
      .in('purchase_order_id', poIds);
    const itemIds = (items ?? []).map((i) => i.id);
    if (itemIds.length) {
      await admin.from('purchase_order_item_assignments').delete().in('po_item_id', itemIds);
      await admin.from('purchase_order_items').delete().in('id', itemIds);
    }
  }
  const { data: exps } = await admin.from('expenses').select('id').in('project_id', pids);
  const expIds = (exps ?? []).map((e) => e.id);
  if (expIds.length) {
    await admin.from('expense_allocations').delete().in('expense_id', expIds);
    await admin.from('expenses').delete().in('id', expIds);
  }
  if (poIds.length) await admin.from('purchase_orders').delete().in('id', poIds);
  const { data: items } = await admin.from('project_budget_items').select('id').in('project_id', pids);
  const bIds = (items ?? []).map((b) => b.id);
  if (bIds.length) {
    await admin.from('project_budget_amounts').delete().in('budget_item_id', bIds);
    await admin.from('project_budget_items').delete().in('id', bIds);
  }
  await admin.from('project_assignments').delete().in('project_id', pids);
  // ⚠️ THE ERROR IS READ. A pinned project surviving a silent delete is how a
  // fixture poisons the NEXT run (the company-purge module's whole lesson).
  const { error: projErr } = await admin.from('projects').delete().in('id', pids);
  if (projErr) throw new Error(`sweep projects: ${projErr.message}`);
  await admin.from('contacts').delete().like('last_name', `${MARKER}%`);
}

const money = (v: unknown) => Math.round(Number(v) * 100) / 100;

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  owner = await sessionFor('josh+test50@worthprop.com');
  crew = await sessionFor('josh+crew@worthprop.com');

  const { data: company } = await admin
    .from('companies')
    .select('id')
    .eq('name', 'Bishop Contracting')
    .single();
  companyId = company!.id;

  const { data: crewMember } = await admin
    .from('company_members')
    .select('id, profile_id, profiles!inner(role)')
    .eq('company_id', companyId)
    .eq('profiles.role', 'crew_member')
    .limit(1)
    .single();
  crewMemberId = crewMember!.id;

  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId,
      contact_type: 'client',
      first_name: 'QA',
      last_name: `${MARKER} Client`,
      email: `${MARKER.toLowerCase()}@example.invalid`,
    })
    .select('id')
    .single();
  if (cErr) throw new Error(`contact: ${cErr.message}`);

  // project_internal_seq set explicitly — its default resolves the company
  // from get_my_company_id(), and the service role has no caller company
  // (the s175-stage7 / hub-fixture trap).
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contact.id,
      project_number: 'PRJ-9901',
      name: `${MARKER} fixture`,
      status: 'active',
      project_internal_seq: (seqRow?.project_internal_seq ?? 0) + 2000,
    })
    .select('id')
    .single();
  if (pErr) throw new Error(`project: ${pErr.message}`);
  projectId = project.id;

  // A crew member must be able to view the project to flag (RLS + RPC gates).
  await admin.from('project_assignments').insert({
    company_id: companyId,
    project_id: projectId,
    member_id: crewMemberId,
    role_on_project: 'crew',
  });

  const mkBudget = async (code: string) => {
    const { data, error } = await admin
      .from('project_budget_items')
      .insert({ company_id: companyId, project_id: projectId, cost_code: code, description: `${MARKER} ${code}` })
      .select('id')
      .single();
    if (error) throw new Error(`budget ${code}: ${error.message}`);
    return data.id as string;
  };
  budgetA = await mkBudget('06 — Carpentry');
  budgetB = await mkBudget('09 — Drywall');

  const { data: po, error: poErr } = await admin
    .from('purchase_orders')
    .insert({
      company_id: companyId,
      project_id: projectId,
      vendor_name: `${MARKER} Lumber`,
      status: 'draft',
      author_member_id: crewMemberId,
    })
    .select('id')
    .single();
  if (poErr) throw new Error(`po: ${poErr.message}`);
  poId = po.id;

  const lines = [
    { description: `${MARKER} A1`, qty_ordered: 40, unit_cost: 5, budget_item_id: budgetA }, // $200
    { description: `${MARKER} A2`, qty_ordered: 12, unit_cost: 25, budget_item_id: budgetA }, // $300
    { description: `${MARKER} B1`, qty_ordered: 6, unit_cost: 25, budget_item_id: budgetB }, // $150
  ];
  for (const [i, l] of lines.entries()) {
    const { data, error } = await admin
      .from('purchase_order_items')
      .insert({ company_id: companyId, purchase_order_id: poId, sort_order: i, ...l })
      .select('id')
      .single();
    if (error) throw new Error(`line ${i}: ${error.message}`);
    lineIds.push(data.id);
  }
}, 180_000);

afterAll(async () => {
  await sweep();
}, 180_000);

const committedOf = async (budgetItemId: string) => {
  const { data } = await admin
    .from('project_budget_items')
    .select('committed_amount, actual_amount')
    .eq('id', budgetItemId)
    .single();
  return { committed: money(data!.committed_amount), actual: money(data!.actual_amount) };
};

const commitmentRow = async () => {
  const { data } = await admin
    .from('expenses')
    .select('id, amount, status, state, purchase_order_id, closed_out_at, supplier')
    .eq('purchase_order_id', poId)
    .eq('is_deleted', false)
    .maybeSingle();
  return data;
};

describe('PO18 — committed lifecycle', () => {
  it('partial issue commits exactly the issued lines, per budget line, pending review', async () => {
    const { error } = await owner.rpc('issue_po_lines', {
      p_po_id: poId,
      p_item_ids: [lineIds[0], lineIds[2]], // A1 $200 + B1 $150
    });
    expect(error?.message).toBeUndefined();

    const { data: po } = await admin
      .from('purchase_orders')
      .select('status, po_number, total_amount')
      .eq('id', poId)
      .single();
    expect(po!.status).toBe('issued');
    expect(po!.po_number).toBe('PO-9901-01'); // R-L3: allocated at first issue
    expect(money(po!.total_amount)).toBe(350); // Σ issued lines — the total foots (R3)

    const exp = await commitmentRow();
    expect(exp).not.toBeNull();
    expect(money(exp!.amount)).toBe(350);
    expect(exp!.state).toBe('committed');
    expect(exp!.status).toBe('pending'); // the normal review path — spec §4.8

    const { data: allocs } = await admin
      .from('expense_allocations')
      .select('budget_item_id, amount')
      .eq('expense_id', exp!.id)
      .eq('is_deleted', false);
    const byItem = new Map((allocs ?? []).map((a) => [a.budget_item_id, money(a.amount)]));
    expect(byItem.get(budgetA)).toBe(200);
    expect(byItem.get(budgetB)).toBe(150);

    // Not approved yet — committed_amount unmoved.
    expect((await committedOf(budgetA)).committed).toBe(0);
  });

  it('a draft line cannot be issued without cost+budget; a second issue extends the sums', async () => {
    // Strip A2's budget line, prove the guard, restore, then issue it.
    await admin.from('purchase_order_items').update({ budget_item_id: null }).eq('id', lineIds[1]);
    const { error: refuse } = await owner.rpc('issue_po_lines', {
      p_po_id: poId,
      p_item_ids: [lineIds[1]],
    });
    expect(refuse?.message).toMatch(/cost and a budget line/);
    await admin.from('purchase_order_items').update({ budget_item_id: budgetA }).eq('id', lineIds[1]);

    const { error } = await owner.rpc('issue_po_lines', { p_po_id: poId, p_item_ids: [lineIds[1]] });
    expect(error?.message).toBeUndefined();

    const exp = await commitmentRow();
    expect(money(exp!.amount)).toBe(650); // 200+300+150
    const { data: po } = await admin.from('purchase_orders').select('total_amount, po_number').eq('id', poId).single();
    expect(money(po!.total_amount)).toBe(650);
    expect(po!.po_number).toBe('PO-9901-01'); // numbered once, not re-allocated
  });

  it('approval lands committed per budget line', async () => {
    const exp = await commitmentRow();
    const { error } = await owner.rpc('approve_expense', {
      p_expense_id: exp!.id,
      p_allocations: [
        { budget_item_id: budgetA, amount: 500 },
        { budget_item_id: budgetB, amount: 150 },
      ],
    });
    expect(error?.message).toBeUndefined();
    expect((await committedOf(budgetA)).committed).toBe(500);
    expect((await committedOf(budgetB)).committed).toBe(150);
  });

  it('⚠️ R-Q2: a source_po_id expense posts to ACTUAL and never moves committed', async () => {
    const before = await committedOf(budgetA);

    const { data: run, error: insErr } = await admin
      .from('expenses')
      .insert({
        company_id: companyId,
        project_id: projectId,
        supplier: `${MARKER} Lumber`,
        expense_date: '2026-08-29',
        amount: 212.4,
        cost_category: 'material',
        state: 'actual',
        source_po_id: poId, // the run link — NOT purchase_order_id
        author_member_id: crewMemberId,
      })
      .select('id')
      .single();
    expect(insErr?.message).toBeUndefined();

    const { error: apprErr } = await owner.rpc('approve_expense', {
      p_expense_id: run!.id,
      p_allocations: [{ budget_item_id: budgetA, amount: 212.4 }],
    });
    expect(apprErr?.message).toBeUndefined();

    const after = await committedOf(budgetA);
    expect(after.committed).toBe(before.committed); // THE GUARD: unmoved
    expect(after.actual).toBe(money(before.actual + 212.4)); // landed as actual
  });

  it('flagging is for the assigned; the unassigned are refused', async () => {
    const { error: refused } = await crew.rpc('flag_po_item_missing', {
      p_item_id: lineIds[2],
      p_note: 'not mine',
    });
    expect(refused?.message).toMatch(/not assigned/);

    const { error: assignErr } = await owner.from('purchase_order_item_assignments').insert({
      po_item_id: lineIds[2],
      member_id: crewMemberId,
    });
    expect(assignErr?.message).toBeUndefined();

    const { error } = await crew.rpc('flag_po_item_missing', {
      p_item_id: lineIds[2],
      p_note: 'backordered until Tuesday',
    });
    expect(error?.message).toBeUndefined();

    const { data: line } = await admin
      .from('purchase_order_items')
      .select('line_status, flag_note, flagged_by')
      .eq('id', lineIds[2])
      .single();
    expect(line!.line_status).toBe('flagged');
    expect(line!.flag_note).toBe('backordered until Tuesday');
    expect(line!.flagged_by).toBe(crewMemberId);

    // R7: a flagged line stays in the committed sum.
    const exp = await commitmentRow();
    expect(money(exp!.amount)).toBe(650);
  });

  it('purchase shrinks the commitment; the last line closes it out and the PO auto-closes', async () => {
    const { error: e1 } = await owner.rpc('mark_po_lines_purchased', {
      p_po_id: poId,
      p_item_ids: [lineIds[0], lineIds[1]], // both A lines
    });
    expect(e1?.message).toBeUndefined();

    let exp = await commitmentRow();
    expect(money(exp!.amount)).toBe(150); // only flagged B1 outstanding
    expect(exp!.closed_out_at).toBeNull();

    const { error: e2 } = await owner.rpc('mark_po_lines_purchased', {
      p_po_id: poId,
      p_item_ids: [lineIds[2]],
    });
    expect(e2?.message).toBeUndefined();

    exp = await commitmentRow();
    expect(exp!.closed_out_at).not.toBeNull(); // done — countsTowardCommitted drops it

    const { data: po } = await admin.from('purchase_orders').select('status, closed_reason').eq('id', poId).single();
    expect(po!.status).toBe('closed'); // §4.5: no line outstanding
  });

  it('R-L1/R-L2: the legacy total RPC refuses a costed-line PO', async () => {
    const { error } = await owner.rpc('set_po_total_amount', {
      p_po_id: poId,
      p_amount: 999,
    });
    expect(error?.message).toMatch(/derives from them/);
  });

  it('R-B2 (20261048): a costed line without a budget link is refused by the CHECK', async () => {
    // Non-vacuous both ways: the unlinked insert dies on the constraint, and
    // the same row WITH the link lands — proving the probe hit the CHECK,
    // not some earlier failure.
    const { error: refused } = await admin.from('purchase_order_items').insert({
      purchase_order_id: poId,
      description: `${MARKER} costed-unlinked probe`,
      qty_ordered: 1,
      unit_cost: 5,
      sort_order: 99,
    });
    expect(refused?.message).toMatch(/purchase_order_items_costed_budget_link/);

    const { data: ok, error: allowed } = await admin
      .from('purchase_order_items')
      .insert({
        purchase_order_id: poId,
        description: `${MARKER} costed-linked probe`,
        qty_ordered: 1,
        unit_cost: 5,
        budget_item_id: budgetA,
        sort_order: 99,
      })
      .select('id')
      .single();
    expect(allowed?.message).toBeUndefined();
    // Leave nothing behind: a live probe line would hold the closed PO's
    // status hostage on the next recompute.
    await admin.from('purchase_order_items').delete().eq('id', ok!.id);
  });
});
