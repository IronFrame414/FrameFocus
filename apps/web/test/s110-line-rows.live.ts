// S110 Section D — the database half of row reorder and row containment, live.
//
//   1. reorder_estimate_line_rows(): the owner reorders a line's rows; the order
//      is renumbered 1..n and persists — INCLUDING a line whose rows share a
//      sort_order (the duplicate case measured on rebuild-test).
//   2. A stale or partial id list is refused (22023) and nothing moves.
//   3. Refused AT THE DATABASE (42501) for a SENT estimate and for ANOTHER PM's
//      draft — each beside a control the same caller/shape passes, so no refusal
//      is vacuous.
//   4. #1-s110 — a row cannot be re-parented by a direct UPDATE (23514), not
//      even by the owner on their own draft — and an unrelated edit on the same
//      row still succeeds (the trigger is scoped to line_item_id).
//
// Fixtures built through admin with explicit created_by and estimate_number (no
// sequence burned), marker-named, swept both ends.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const MARKER = 'S110D-ROWS';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';

let ownerC: SupabaseClient;
let pmC: SupabaseClient;
let companyId = '';

const E = { ownerDraft: '', pmDraft: '', sent: '', ownerDraft2: '' };
const L = { own: '', pm: '', sent: '', other: '' };
const R: Record<string, string> = {};

function must<T>(label: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error || r.data == null) throw new Error(`${label}: ${r.error?.message ?? 'no data'}`);
  return r.data;
}

async function sweep() {
  const { data: ests } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = (ests ?? []).map((e) => e.id);
  if (!ids.length) return;
  const { data: lines } = await admin.from('estimate_line_items').select('id').in('estimate_id', ids);
  const lineIds = (lines ?? []).map((l) => l.id);
  if (lineIds.length) await admin.from('estimate_line_rows').delete().in('line_item_id', lineIds);
  await admin.from('estimate_line_items').delete().in('estimate_id', ids);
  await admin.from('estimate_categories').delete().in('estimate_id', ids);
  const del = await admin.from('estimates').delete().in('id', ids);
  if (del.error) throw new Error(`sweep estimates: ${del.error.message}`);
}

async function uidOf(email: string) {
  return must(
    `profile ${email}`,
    await admin.from('profiles').select('user_id, company_id').eq('email', email).eq('is_deleted', false).single()
  ) as { user_id: string; company_id: string };
}

async function estimateWithLine(label: string, status: string, createdBy: string, role: string, seq: number, contactId: string) {
  const est = (must(
    `estimate ${label}`,
    await admin
      .from('estimates')
      .insert({
        company_id: companyId,
        contact_id: contactId,
        name: `${MARKER} ${label}`,
        estimate_number: `${MARKER}-${seq}`,
        status,
        created_by: createdBy,
        updated_by: createdBy,
        created_by_role: role,
      })
      .select('id')
      .single()
  ) as { id: string }).id;
  const cat = (must(
    `category ${label}`,
    await admin
      .from('estimate_categories')
      .insert({ company_id: companyId, estimate_id: est, name: `${MARKER} ${label}`, sort_order: 1 })
      .select('id')
      .single()
  ) as { id: string }).id;
  const line = (must(
    `line ${label}`,
    await admin
      .from('estimate_line_items')
      .insert({ company_id: companyId, estimate_id: est, category_id: cat, name: `${MARKER} ${label}`, sort_order: 1 })
      .select('id')
      .single()
  ) as { id: string }).id;
  return { est, line };
}

async function row(lineId: string, key: string, sort: number) {
  R[key] = (must(
    `row ${key}`,
    await admin
      .from('estimate_line_rows')
      .insert({
        company_id: companyId,
        line_item_id: lineId,
        row_type: 'labor',
        name: `${MARKER} ${key}`,
        sort_order: sort,
        rate: 1,
        quantity: 1,
        apply_tax: false,
      })
      .select('id')
      .single()
  ) as { id: string }).id;
}

async function order(lineId: string): Promise<string[]> {
  const rows = must(
    `order ${lineId}`,
    await admin
      .from('estimate_line_rows')
      .select('id, sort_order')
      .eq('line_item_id', lineId)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
  ) as { id: string; sort_order: number }[];
  return rows.map((r) => r.id);
}

async function sortOrders(lineId: string): Promise<number[]> {
  const rows = must(
    `sorts ${lineId}`,
    await admin
      .from('estimate_line_rows')
      .select('sort_order')
      .eq('line_item_id', lineId)
      .order('sort_order', { ascending: true })
  ) as { sort_order: number }[];
  return rows.map((r) => r.sort_order);
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  [ownerC, pmC] = await Promise.all([sessionFor(OWNER), sessionFor(PM)]);
  const o = await uidOf(OWNER);
  const p = await uidOf(PM);
  companyId = o.company_id;
  expect(p.company_id, 'owner and PM must share a company').toBe(companyId);
  // Ordered: any stable contact will do; nothing downstream depends on which.
  const contact = must(
    'contact',
    await admin
      .from('contacts')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1)
      .single()
  ) as { id: string };

  const a = await estimateWithLine('owner draft', 'draft', o.user_id, 'owner', 1, contact.id);
  const b = await estimateWithLine('owner draft 2', 'draft', o.user_id, 'owner', 2, contact.id);
  const c = await estimateWithLine('pm draft', 'draft', p.user_id, 'project_manager', 3, contact.id);
  const d = await estimateWithLine('sent', 'sent', o.user_id, 'owner', 4, contact.id);
  E.ownerDraft = a.est;
  E.ownerDraft2 = b.est;
  E.pmDraft = c.est;
  E.sent = d.est;
  L.own = a.line;
  L.other = b.line;
  L.pm = c.line;
  L.sent = d.line;
  await row(L.own, 'o1', 1);
  await row(L.own, 'o2', 2);
  await row(L.own, 'o3', 3);
  await row(L.other, 'x1', 0);
  await row(L.other, 'x2', 0); // the duplicate-sort_order shape
  await row(L.pm, 'p1', 1);
  await row(L.pm, 'p2', 2);
  await row(L.sent, 's1', 1);
  await row(L.sent, 's2', 2);
}, 120_000);

afterAll(async () => {
  await sweep();
}, 120_000);

describe('S110 D — 1. reorder_estimate_line_rows renumbers and persists', () => {
  it('1a — the owner moves o3 to the top: order o3,o1,o2 and sort_order 1,2,3', async () => {
    const r = await ownerC.rpc('reorder_estimate_line_rows', {
      p_line_item_id: L.own,
      p_ordered_ids: [R.o3, R.o1, R.o2],
    });
    expect(r.error).toBeNull();
    expect(r.data).toBe(3);
    expect(await order(L.own)).toEqual([R.o3, R.o1, R.o2]);
    expect(await sortOrders(L.own)).toEqual([1, 2, 3]);
  });

  it('1b — two rows sharing sort_order 0 are separated by a renumber (a swap would be a no-op)', async () => {
    expect(await sortOrders(L.other)).toEqual([0, 0]);
    const r = await ownerC.rpc('reorder_estimate_line_rows', {
      p_line_item_id: L.other,
      p_ordered_ids: [R.x2, R.x1],
    });
    expect(r.error).toBeNull();
    expect(await order(L.other)).toEqual([R.x2, R.x1]);
    expect(await sortOrders(L.other)).toEqual([1, 2]);
  });
});

describe('S110 D — 2. a stale or partial list is refused, and nothing moves', () => {
  it('2a — a list missing a row → 22023; order unchanged', async () => {
    const before = await order(L.own);
    const r = await ownerC.rpc('reorder_estimate_line_rows', {
      p_line_item_id: L.own,
      p_ordered_ids: [R.o1, R.o2],
    });
    expect(r.error?.code).toBe('22023');
    expect(await order(L.own)).toEqual(before);
  });

  it('2b — a list naming another line\'s row → 22023; order unchanged', async () => {
    const before = await order(L.own);
    const r = await ownerC.rpc('reorder_estimate_line_rows', {
      p_line_item_id: L.own,
      p_ordered_ids: [R.o1, R.o2, R.x1],
    });
    expect(r.error?.code).toBe('22023');
    expect(await order(L.own)).toEqual(before);
  });
});

describe('S110 D — 3. refused AT THE DATABASE, each beside a control that passes', () => {
  it('3a — CONTROL: the PM reorders their OWN draft\'s rows', async () => {
    const r = await pmC.rpc('reorder_estimate_line_rows', {
      p_line_item_id: L.pm,
      p_ordered_ids: [R.p2, R.p1],
    });
    expect(r.error).toBeNull();
    expect(await order(L.pm)).toEqual([R.p2, R.p1]);
  });

  // 22023, not 42501, and that is the STRONGER refusal: the PM cannot even
  // SELECT the owner's rows (estimate_line_rows_select_authenticated requires
  // the parent line to be visible, and a PM sees only their own estimates), so
  // the RPC's list check refuses before a single UPDATE is attempted. The 42501
  // path — rows visible, UPDATE filtered by RLS — is 3c.
  it('3b — the PM on the OWNER\'s draft → refused (22023: the rows are not even visible); order unchanged', async () => {
    const before = await order(L.own);
    const r = await pmC.rpc('reorder_estimate_line_rows', {
      p_line_item_id: L.own,
      p_ordered_ids: [...before].reverse(),
    });
    expect(r.error?.code).toBe('22023');
    expect(await order(L.own)).toEqual(before);
  });

  it('3c — the OWNER on a SENT estimate → 42501; order unchanged', async () => {
    const before = await order(L.sent);
    const r = await ownerC.rpc('reorder_estimate_line_rows', {
      p_line_item_id: L.sent,
      p_ordered_ids: [...before].reverse(),
    });
    expect(r.error?.code).toBe('42501');
    expect(await order(L.sent)).toEqual(before);
  });
});

describe('S110 D — 4. #1-s110: a row never leaves its line', () => {
  it('4a — CONTROL: the owner renames a row on their own draft (the trigger is scoped to line_item_id)', async () => {
    const r = await ownerC
      .from('estimate_line_rows')
      .update({ name: `${MARKER} o1 renamed` })
      .eq('id', R.o1)
      .select('id');
    expect(r.error).toBeNull();
    expect(r.data?.length).toBe(1);
  });

  it('4b — the owner re-parents a row onto another of their OWN drafts → 23514; it stays put', async () => {
    const r = await ownerC
      .from('estimate_line_rows')
      .update({ line_item_id: L.other })
      .eq('id', R.o1)
      .select('id');
    expect(r.error?.code).toBe('23514');
    const now = must('o1', await admin.from('estimate_line_rows').select('line_item_id').eq('id', R.o1).single()) as {
      line_item_id: string;
    };
    expect(now.line_item_id).toBe(L.own);
  });

  it('4c — THE HOLE: the PM points their own row at a line on a SENT estimate → 23514; it stays put', async () => {
    // Before S110 this passed: USING checked the SOURCE (the PM's own draft),
    // WITH CHECK only company + role, so the SENT destination was accepted.
    const r = await pmC
      .from('estimate_line_rows')
      .update({ line_item_id: L.sent })
      .eq('id', R.p1)
      .select('id');
    expect(r.error?.code).toBe('23514');
    const now = must('p1', await admin.from('estimate_line_rows').select('line_item_id').eq('id', R.p1).single()) as {
      line_item_id: string;
    };
    expect(now.line_item_id).toBe(L.pm);
  });

  it('4d — even the SERVICE ROLE cannot re-parent a row (a trigger, not a policy)', async () => {
    const r = await admin.from('estimate_line_rows').update({ line_item_id: L.other }).eq('id', R.o2).select('id');
    expect(r.error?.code).toBe('23514');
  });
});
