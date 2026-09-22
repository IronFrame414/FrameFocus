// S108 Spec B — the database half of the line-items work, proven live.
//
//   A. sq_ft is a labor unit on estimate AND change-order rows (20261630000000),
//      and an unknown unit is still refused — the CHECK widened, it did not open.
//   B. The containment trigger (20261640000000): a line cannot be pointed at a
//      category or subcategory outside its own estimate, nor moved to another
//      estimate — and an unrelated edit is NOT refused (future writes only).
//   C. reorder_estimate_lines(): one transaction; refused AT THE DATABASE for a
//      SENT estimate and for another PM's draft (FILL-B6), and a refused move
//      rolls back the whole call.
//   D. FILL-B3: foreman and crew receive ZERO estimate rows — so no role can
//      reach the Line Items tab and be shown a false Profit. Non-vacuous: the
//      owner reads the same fixtures.
//
// Fixtures: three MARKER estimates built through admin with explicit
// created_by (so "the PM's own draft" is real) and an explicit estimate_number
// (so the company's client-visible sequence is NOT burned). Swept both ends.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const MARKER = 'S108B-LINES';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';

let ownerC: SupabaseClient;
let pmC: SupabaseClient;
let foremanC: SupabaseClient;
let crewC: SupabaseClient;
let companyId = '';
let ownerUid = '';
let pmUid = '';

// Fixture ids
const E = { ownerDraft: '', pmDraft: '', sent: '' };
const C = { a: '', b: '', pmCat: '', sentCat: '' };
let subOfB = '';
const L = { a1: '', a2: '', a3: '', b1: '', pm1: '', pm2: '', sent1: '', sent2: '' };

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
  await admin.from('estimate_subcategories').delete().in('estimate_id', ids);
  await admin.from('estimate_categories').delete().in('estimate_id', ids);
  const del = await admin.from('estimates').delete().in('id', ids);
  if (del.error) throw new Error(`sweep estimates: ${del.error.message}`);
}

async function uidOf(email: string): Promise<{ uid: string; company: string }> {
  const p = must(
    `profile ${email}`,
    await admin
      .from('profiles')
      .select('user_id, company_id')
      .eq('email', email)
      .eq('is_deleted', false)
      .single()
  ) as { user_id: string; company_id: string };
  return { uid: p.user_id, company: p.company_id };
}

async function estimate(label: string, status: string, createdBy: string, role: string, seq: number, contactId: string) {
  const row = must(
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
        // get_my_role() is NULL for the service role, and the column is NOT NULL.
        created_by_role: role,
      })
      .select('id')
      .single()
  ) as { id: string };
  return row.id;
}

async function category(estimateId: string, name: string, sort: number) {
  return (must(
    `category ${name}`,
    await admin
      .from('estimate_categories')
      .insert({ company_id: companyId, estimate_id: estimateId, name: `${MARKER} ${name}`, sort_order: sort })
      .select('id')
      .single()
  ) as { id: string }).id;
}

async function line(estimateId: string, categoryId: string, name: string, sort: number, sub: string | null = null) {
  return (must(
    `line ${name}`,
    await admin
      .from('estimate_line_items')
      .insert({
        company_id: companyId,
        estimate_id: estimateId,
        category_id: categoryId,
        subcategory_id: sub,
        name: `${MARKER} ${name}`,
        sort_order: sort,
      })
      .select('id')
      .single()
  ) as { id: string }).id;
}

async function lineState(id: string) {
  return must(
    `read ${id}`,
    await admin
      .from('estimate_line_items')
      .select('category_id, subcategory_id, sort_order, estimate_id, name')
      .eq('id', id)
      .single()
  ) as { category_id: string; subcategory_id: string | null; sort_order: number; estimate_id: string; name: string };
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  [ownerC, pmC, foremanC, crewC] = await Promise.all([
    sessionFor(OWNER),
    sessionFor(PM),
    sessionFor(FOREMAN),
    sessionFor(CREW),
  ]);
  const o = await uidOf(OWNER);
  const p = await uidOf(PM);
  ownerUid = o.uid;
  pmUid = p.uid;
  companyId = o.company;
  expect(p.company, 'owner and PM must share a company').toBe(companyId);

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

  E.ownerDraft = await estimate('owner draft', 'draft', ownerUid, 'owner', 1, contact.id);
  E.pmDraft = await estimate('pm draft', 'draft', pmUid, 'project_manager', 2, contact.id);
  E.sent = await estimate('sent', 'sent', ownerUid, 'owner', 3, contact.id);

  C.a = await category(E.ownerDraft, 'A', 1);
  C.b = await category(E.ownerDraft, 'B', 2);
  C.pmCat = await category(E.pmDraft, 'PM', 1);
  C.sentCat = await category(E.sent, 'SENT', 1);
  subOfB = (must(
    'subcategory',
    await admin
      .from('estimate_subcategories')
      .insert({ company_id: companyId, estimate_id: E.ownerDraft, category_id: C.b, name: `${MARKER} B-sub`, sort_order: 1 })
      .select('id')
      .single()
  ) as { id: string }).id;

  L.a1 = await line(E.ownerDraft, C.a, 'a1', 1);
  L.a2 = await line(E.ownerDraft, C.a, 'a2', 2);
  L.a3 = await line(E.ownerDraft, C.a, 'a3', 3);
  L.b1 = await line(E.ownerDraft, C.b, 'b1', 4);
  L.pm1 = await line(E.pmDraft, C.pmCat, 'pm1', 1);
  L.pm2 = await line(E.pmDraft, C.pmCat, 'pm2', 2);
  L.sent1 = await line(E.sent, C.sentCat, 'sent1', 1);
  L.sent2 = await line(E.sent, C.sentCat, 'sent2', 2);
}, 120_000);

afterAll(async () => {
  await sweep();
}, 120_000);

describe('S108 B — A. square foot is a labor unit on BOTH row tables', () => {
  it('A1 — an estimate labor row accepts sq_ft; total math is rate × quantity', async () => {
    const r = await admin
      .from('estimate_line_rows')
      .insert({
        company_id: companyId,
        line_item_id: L.a1,
        row_type: 'labor',
        name: `${MARKER} demo tile`,
        sort_order: 0,
        rate: 3,
        quantity: 2365,
        labor_unit: 'sq_ft',
        apply_tax: false,
      })
      .select('labor_unit, rate, quantity')
      .single();
    expect(r.error, r.error?.message).toBeNull();
    expect(r.data).toMatchObject({ labor_unit: 'sq_ft' });
    expect(Number(r.data!.rate) * Number(r.data!.quantity)).toBe(7095);
  });

  it('A2 — …and an unknown unit is STILL refused: the CHECK widened, it did not open', async () => {
    const r = await admin.from('estimate_line_rows').insert({
      company_id: companyId,
      line_item_id: L.a1,
      row_type: 'labor',
      name: `${MARKER} bad unit`,
      sort_order: 1,
      rate: 1,
      quantity: 1,
      labor_unit: 'weeks',
      apply_tax: false,
    });
    expect(r.error?.message ?? '').toMatch(/estimate_line_rows_labor_unit_check/);
  });

  it('A3 — PARITY: a change-order labor row accepts sq_ft, and still refuses an unknown unit', async () => {
    // ⚠️ SCOPED, not merely ordered (CLAUDE.md's .limit(1) rule, category 2):
    // the insert depends on the parent CO being a DRAFT — a sent CO's lines
    // are immutable, and the first version of this test took an arbitrary
    // line and hit exactly that trigger instead of the CHECK under test.
    const coLine = must(
      'a DRAFT change-order line item on rebuild-test',
      await admin
        .from('change_order_line_items')
        .select('id, company_id, change_orders!inner(status)')
        .eq('change_orders.status', 'draft')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(1)
        .single()
    ) as { id: string; company_id: string };
    const ok = await admin
      .from('change_order_line_rows')
      .insert({
        company_id: coLine.company_id,
        line_item_id: coLine.id,
        row_type: 'labor',
        name: `${MARKER} co sq ft`,
        sort_order: 999,
        rate: 3,
        quantity: 100,
        labor_unit: 'sq_ft',
        apply_tax: false,
      })
      .select('id, labor_unit')
      .single();
    expect(ok.error, ok.error?.message).toBeNull();
    expect(ok.data!.labor_unit).toBe('sq_ft');
    await admin.from('change_order_line_rows').delete().eq('id', ok.data!.id);

    const bad = await admin.from('change_order_line_rows').insert({
      company_id: coLine.company_id,
      line_item_id: coLine.id,
      row_type: 'labor',
      name: `${MARKER} co bad`,
      sort_order: 999,
      rate: 1,
      quantity: 1,
      labor_unit: 'weeks',
      apply_tax: false,
    });
    expect(bad.error?.message ?? '').toMatch(/change_order_line_rows_labor_unit_check/);
  });
});

describe('S108 B — B. the containment trigger (future writes only)', () => {
  it('B1 — REFUSED: pointing a line at a category of ANOTHER estimate', async () => {
    const r = await ownerC.from('estimate_line_items').update({ category_id: C.pmCat }).eq('id', L.a1).select('id');
    expect(r.error?.message ?? '').toMatch(/different estimate/);
    expect((await lineState(L.a1)).category_id).toBe(C.a);
  });

  it('B2 — REFUSED: a subcategory that is not part of the line\'s category', async () => {
    // subOfB belongs to category B; L.a1 is in category A.
    const r = await ownerC.from('estimate_line_items').update({ subcategory_id: subOfB }).eq('id', L.a1).select('id');
    expect(r.error?.message ?? '').toMatch(/not part of this line/);
  });

  it('B3 — REFUSED: moving a line to a different estimate', async () => {
    const r = await ownerC
      .from('estimate_line_items')
      .update({ estimate_id: E.pmDraft, category_id: C.pmCat })
      .eq('id', L.a1)
      .select('id');
    expect(r.error?.message ?? '').toMatch(/different estimate/);
    expect((await lineState(L.a1)).estimate_id).toBe(E.ownerDraft);
  });

  it('B4 — ALLOWED: a real move into category B\'s subcategory (category + subcategory together)', async () => {
    const r = await ownerC
      .from('estimate_line_items')
      .update({ category_id: C.b, subcategory_id: subOfB })
      .eq('id', L.a3)
      .select('id');
    expect(r.error, r.error?.message).toBeNull();
    expect(r.data?.length).toBe(1);
    const s = await lineState(L.a3);
    expect(s.category_id).toBe(C.b);
    expect(s.subcategory_id).toBe(subOfB);
  });

  it('B5 — NOT refused: an unrelated edit (rename) — the guard governs containment writes only', async () => {
    const r = await ownerC
      .from('estimate_line_items')
      .update({ name: `${MARKER} a2 renamed` })
      .eq('id', L.a2)
      .select('id');
    expect(r.error, r.error?.message).toBeNull();
    expect(r.data?.length).toBe(1);
  });
});

describe('S108 B — C. reorder_estimate_lines (atomic; refused at the database)', () => {
  it('C1 — the owner reorders a draft ACROSS categories in one call', async () => {
    const r = await ownerC.rpc('reorder_estimate_lines', {
      p_estimate_id: E.ownerDraft,
      p_moves: [
        { id: L.b1, category_id: C.a, subcategory_id: null, sort_order: 1 },
        { id: L.a1, category_id: C.a, subcategory_id: null, sort_order: 2 },
        { id: L.a2, category_id: C.a, subcategory_id: null, sort_order: 3 },
      ],
    });
    expect(r.error, r.error?.message).toBeNull();
    expect(r.data).toBe(3);
    expect(await lineState(L.b1)).toMatchObject({ category_id: C.a, sort_order: 1 });
    expect(await lineState(L.a2)).toMatchObject({ sort_order: 3 });
  });

  it('C2 — the authoring PM reorders their OWN draft', async () => {
    const r = await pmC.rpc('reorder_estimate_lines', {
      p_estimate_id: E.pmDraft,
      p_moves: [
        { id: L.pm2, category_id: C.pmCat, subcategory_id: null, sort_order: 1 },
        { id: L.pm1, category_id: C.pmCat, subcategory_id: null, sort_order: 2 },
      ],
    });
    expect(r.error, r.error?.message).toBeNull();
    expect((await lineState(L.pm2)).sort_order).toBe(1);
  });

  it('C3 — REFUSED at the database: a reorder of a SENT estimate — and nothing changed', async () => {
    const before = await lineState(L.sent1);
    const r = await ownerC.rpc('reorder_estimate_lines', {
      p_estimate_id: E.sent,
      p_moves: [
        { id: L.sent2, category_id: C.sentCat, subcategory_id: null, sort_order: 1 },
        { id: L.sent1, category_id: C.sentCat, subcategory_id: null, sort_order: 2 },
      ],
    });
    expect(r.error?.message ?? '').toMatch(/Reorder refused/);
    expect(r.error?.code).toBe('42501');
    expect((await lineState(L.sent1)).sort_order).toBe(before.sort_order);
  });

  it("C4 — REFUSED at the database: a PM reordering ANOTHER user's draft", async () => {
    const before = await lineState(L.a2);
    const r = await pmC.rpc('reorder_estimate_lines', {
      p_estimate_id: E.ownerDraft,
      p_moves: [{ id: L.a2, category_id: C.a, subcategory_id: null, sort_order: 99 }],
    });
    expect(r.error?.message ?? '').toMatch(/Reorder refused/);
    expect((await lineState(L.a2)).sort_order).toBe(before.sort_order);
  });

  it('C5 — ATOMIC: a refused move (category of another estimate) rolls back the moves before it', async () => {
    const before = await lineState(L.a1);
    const r = await ownerC.rpc('reorder_estimate_lines', {
      p_estimate_id: E.ownerDraft,
      p_moves: [
        { id: L.a1, category_id: C.a, subcategory_id: null, sort_order: 50 },
        { id: L.a2, category_id: C.pmCat, subcategory_id: null, sort_order: 51 },
      ],
    });
    expect(r.error?.message ?? '').toMatch(/different estimate/);
    expect((await lineState(L.a1)).sort_order, 'the first move survived a failed call').toBe(before.sort_order);
  });

  it('C6 — anon cannot execute it at all', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const r = await anon.rpc('reorder_estimate_lines', { p_estimate_id: E.ownerDraft, p_moves: [] });
    expect(r.error, 'anon executed reorder_estimate_lines').not.toBeNull();
  });
});

describe('S108 B — D. FILL-B3: no role reaches the Line Items tab and sees a false Profit', () => {
  const ids = () => [E.ownerDraft, E.pmDraft, E.sent];

  it('D0 — non-vacuous: the OWNER reads all 3 fixture estimates and their 8 lines', async () => {
    const e = await ownerC.from('estimates').select('id, grand_total').in('id', ids());
    expect(e.error).toBeNull();
    expect(e.data?.length).toBe(3);
    const l = await ownerC.from('estimate_line_items').select('id').in('estimate_id', ids());
    expect(l.data?.length).toBe(8);
  });

  it('D1 — the FOREMAN receives ZERO estimate rows and ZERO line items', async () => {
    const e = await foremanC.from('estimates').select('id, grand_total, subtotal').in('id', ids());
    expect(e.error).toBeNull();
    expect(e.data ?? []).toHaveLength(0);
    const l = await foremanC.from('estimate_line_items').select('id, total_price').in('estimate_id', ids());
    expect(l.data ?? []).toHaveLength(0);
  });

  it('D2 — the CREW MEMBER receives ZERO estimate rows and ZERO line items', async () => {
    const e = await crewC.from('estimates').select('id, grand_total, subtotal').in('id', ids());
    expect(e.error).toBeNull();
    expect(e.data ?? []).toHaveLength(0);
    const l = await crewC.from('estimate_line_items').select('id, total_price').in('estimate_id', ids());
    expect(l.data ?? []).toHaveLength(0);
  });
});
