/**
 * S97CT-ESTLINES — §2 ESTIMATE LINE ITEMS on a fixed-price invoice [S97].
 *
 * Calls loadEstimateLineBilling — the SAME function the picker renders — so
 * this proves the one definition rather than a copy of its query.
 *
 *   1. All the estimate's line items are available, with per-line remaining.
 *   2. Billing a line at 50% leaves the remainder available; billing the rest
 *      sums EXACTLY to the line's price.
 *   3. Deselecting simply omits a line — it stays fully unbilled.
 *   4. THE CONSTRAINT: a DRAW and LINE ITEMS share ONE contract remaining and
 *      cannot jointly over-bill. 30% draw + 80% of lines is refused by the DB.
 *   5. Voiding restores everything — per-line remaining AND contract headroom —
 *      with no cleanup step.
 *   6. Remaining-to-bill (§3) reflects line-item billing, not just draws.
 *   7. The ceiling does NOT apply on a cost-plus project (P11).
 *   8. §11 renders: full detail, by section (reconciling) and lump sum.
 *
 * RUN: cd apps/web && npx vitest run --config test/live.vitest.config.ts s97ct-estimate-lines
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, disposeChangeOrdersError, disposeProjectChangeOrdersError, sweepChangeOrders } from './live-session';
import { loadEstimateLineBilling } from '@/lib/services/estimate-line-billing';
import { presentInvoice, type PresentationLine } from '@framefocus/shared/utils/invoice-derivation';

const MARKER = 'S97ESTLINES';

let companyId: string;
let ownerMemberId: string;
let contactId: string;
let projectId: string;
let estimateId: string;
let categoryId: string;
const item: Record<string, string> = {};
const invoiceIds: string[] = [];
/** cost-plus control project for the P11 assertion */
let cpProjectId: string;
let cpEstimateId: string;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};
const money = (n: number) => Math.round(n * 100) / 100;

const billing = () => loadEstimateLineBilling(admin as unknown as SupabaseClient, projectId);

/** §3 remaining-to-bill, in getContractBilling's shape. */
async function remainingToBill(): Promise<number> {
  const { data: fin } = await admin
    .from('project_financials').select('contract_value').eq('project_id', projectId).maybeSingle();
  const original = Number(fin!.contract_value);
  const { data: invoices } = await admin
    .from('invoices').select('id, status').eq('project_id', projectId)
    .eq('is_deleted', false).neq('status', 'voided');
  const issued = (invoices ?? [])
    .filter((i) => i.status === 'sent' || i.status === 'paid').map((i) => i.id);
  if (issued.length === 0) return original;
  const { data: lines } = await admin
    .from('invoice_lines').select('billed_amount')
    .in('invoice_id', issued).eq('source_estimate_id', estimateId);
  return money(original - (lines ?? []).reduce((s, l) => s + Number(l.billed_amount), 0));
}

async function invoice(title: string): Promise<string> {
  const { data, error } = await admin
    .from('invoices')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      title: `${MARKER} ${title}`, presentation_level: 'full_detail',
    })
    .select('id').single();
  must(`invoice ${title}`, error);
  invoiceIds.push(data!.id);
  return data!.id;
}

/** A billed estimate line, exactly as billEstimateLines writes it. */
async function billLine(
  invoiceId: string, lineItemId: string, description: string,
  category: string, amount: number, sortOrder = 0
): Promise<{ message: string } | null> {
  return (await admin.from('invoice_lines').insert({
    company_id: companyId, invoice_id: invoiceId, line_type: 'fixed',
    description, category, derived_amount: amount, billed_amount: amount,
    source_estimate_id: estimateId, source_estimate_line_item_id: lineItemId,
    sort_order: sortOrder,
  })).error;
}

/** A draw — contract instrument, no line item. */
async function billDraw(invoiceId: string, label: string, amount: number, sortOrder = 100) {
  return (await admin.from('invoice_lines').insert({
    company_id: companyId, invoice_id: invoiceId, line_type: 'fixed',
    description: label, derived_amount: amount, billed_amount: amount,
    source_estimate_id: estimateId, sort_order: sortOrder,
  })).error;
}

const send = async (id: string) =>
  must('send', (await admin.from('invoices').update({
    status: 'sent', sent_at: new Date().toISOString(),
  }).eq('id', id)).error);

beforeAll(async () => {
  assertRebuildTest();
  // ⚠️ [S168] START FROM A DIRTY DATABASE. `afterAll` does not run when a run
  // is interrupted, and this suite's `co_number`s are FIXED — so one killed run
  // used to brick every later one on `change_orders_company_co_number_key`,
  // permanently, until somebody cleaned the table by hand. Sweeping first makes
  // the suite runnable twice in a row from ANY starting state, which is the
  // property that was actually missing and the one a single green run cannot
  // demonstrate.
  await sweepChangeOrders(MARKER);

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = company!.id;
  const { data: ownerProfile } = await admin
    .from('profiles').select('id').eq('email', 'josh+test50@worthprop.com').single();
  const { data: member } = await admin
    .from('company_members').select('id').eq('profile_id', ownerProfile!.id).single();
  ownerMemberId = member!.id;

  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId, contact_type: 'client',
      first_name: MARKER, last_name: 'Client', email: `${MARKER.toLowerCase()}@example.invalid`,
    })
    .select('id').single();
  must('contact', cErr);
  contactId = contact!.id;

  const { data: counters } = await admin
    .from('companies')
    .select('estimate_number_sequence, project_internal_sequence').eq('id', companyId).single();
  let seq = counters!.estimate_number_sequence;
  let internal = counters!.project_internal_sequence;

  // ── the fixed-price contract: 3 line items totalling exactly 10,000 ──
  seq += 1; internal += 1;
  const { data: estimate, error: eErr } = await admin
    .from('estimates')
    .insert({
      company_id: companyId, contact_id: contactId, name: `${MARKER} — contract`,
      estimate_number: `EST-${String(seq).padStart(4, '0')}`,
      status: 'accepted', contract_type: 'fixed_price', created_by_role: 'owner',
      subtotal: 10000, grand_total: 10000, discount_total: 0,
    })
    .select('id').single();
  must('estimate', eErr);
  estimateId = estimate!.id;

  const { data: category, error: catErr } = await admin
    .from('estimate_categories')
    .insert({ company_id: companyId, estimate_id: estimateId, name: `${MARKER} Shell`, sort_order: 0 })
    .select('id').single();
  must('category', catErr);
  categoryId = category!.id;

  const seed: Array<[string, string, number, string]> = [
    ['framing', 'Framing', 5000, 'labor'],
    ['lumber', 'Lumber package', 3000, 'material'],
    ['roofing', 'Roofing sub', 2000, 'subcontractor'],
  ];
  let order = 0;
  for (const [key, name, price, rowType] of seed) {
    const { data: li, error: liErr } = await admin
      .from('estimate_line_items')
      .insert({
        company_id: companyId, estimate_id: estimateId, category_id: categoryId,
        name: `${MARKER} ${name}`, total_price: price, sort_order: order++,
      })
      .select('id').single();
    must(`line item ${key}`, liErr);
    item[key] = li!.id;
    must(`row ${key}`, (await admin.from('estimate_line_rows').insert({
      company_id: companyId, line_item_id: li!.id, row_type: rowType,
      name: `${MARKER} ${name} row`, sort_order: 0, apply_tax: false, total: price,
    })).error);
  }

  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId, name: `${MARKER} — estimate lines`, contact_id: contactId,
      project_type: 'fixed_price', source_estimate_id: estimateId,
      project_number: `PRJ-${String(seq).padStart(3, '0')}`, project_internal_seq: internal,
    })
    .select('id').single();
  must('project', pErr);
  projectId = project!.id;
  must('financials', (await admin.from('project_financials').insert({
    company_id: companyId, project_id: projectId, contract_value: 10000,
  })).error);

  // ── the cost-plus control, for the P11 assertion ──
  seq += 1; internal += 1;
  const { data: cpEstimate, error: cpEErr } = await admin
    .from('estimates')
    .insert({
      company_id: companyId, contact_id: contactId, name: `${MARKER} — cost-plus`,
      estimate_number: `EST-${String(seq).padStart(4, '0')}`,
      status: 'accepted', contract_type: 'cost_plus', created_by_role: 'owner',
    })
    .select('id').single();
  must('cp estimate', cpEErr);
  cpEstimateId = cpEstimate!.id;

  const { data: cpProject, error: cpPErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId, name: `${MARKER} — cost-plus control`, contact_id: contactId,
      project_type: 'cost_plus', source_estimate_id: cpEstimateId,
      project_number: `PRJ-${String(seq).padStart(3, '0')}`, project_internal_seq: internal,
    })
    .select('id').single();
  must('cp project', cpPErr);
  cpProjectId = cpProject!.id;
  must('cp financials', (await admin.from('project_financials').insert({
    company_id: companyId, project_id: cpProjectId, contract_value: 1000,
  })).error);

  must('counters', (await admin.from('companies').update({
    estimate_number_sequence: seq, project_internal_sequence: internal,
  }).eq('id', companyId)).error);
}, 240_000);

describe('S97CT-ESTLINES — 1. every line item is available, all selectable', () => {
  it('three lines, full remaining, categories from their rows', async () => {
    const b = await billing();
    expect(b.estimateId).toBe(estimateId);
    expect(b.lines).toHaveLength(3);
    expect(money(b.lines.reduce((s, l) => s + l.remaining, 0))).toBe(10000);

    const framing = b.lines.find((l) => l.name.includes('Framing'))!;
    expect(framing.sell).toBe(5000);
    expect(framing.billed).toBe(0);
    expect(framing.remaining).toBe(5000);
    expect(framing.category).toBe('labor');
    expect(b.lines.find((l) => l.name.includes('Lumber'))!.category).toBe('material');
    expect(b.lines.find((l) => l.name.includes('Roofing'))!.category).toBe('subcontractor');
    // The picker defaults every one of these to selected — the ruling.
    expect(b.undiscounted).toBe(0);
  });
});

describe('S97CT-ESTLINES — 2/3. partial billing, and deselecting', () => {
  it('50% of framing leaves 2,500 available; the other lines are untouched', async () => {
    const inv = await invoice('half framing');
    expect(await billLine(inv, item.framing, 'Framing', 'labor', 2500)).toBeNull();
    await send(inv);

    const b = await billing();
    const framing = b.lines.find((l) => l.name.includes('Framing'))!;
    expect(framing.billed).toBe(2500);
    expect(framing.remaining).toBe(2500);
    // DESELECTED lines were simply not written — still fully unbilled.
    expect(b.lines.find((l) => l.name.includes('Lumber'))!.remaining).toBe(3000);
    expect(b.lines.find((l) => l.name.includes('Roofing'))!.remaining).toBe(2000);
  });

  it('billing the remainder sums EXACTLY to the line price, and it drops out', async () => {
    const inv = await invoice('rest of framing');
    expect(await billLine(inv, item.framing, 'Framing', 'labor', 2500)).toBeNull();
    await send(inv);

    const b = await billing();
    expect(b.lines.some((l) => l.name.includes('Framing'))).toBe(false); // fully billed
    const { data: lines } = await admin
      .from('invoice_lines').select('billed_amount')
      .eq('source_estimate_line_item_id', item.framing);
    expect(money((lines ?? []).reduce((s, l) => s + Number(l.billed_amount), 0))).toBe(5000);
  });
});

describe('S97CT-ESTLINES — 4. THE CONSTRAINT: draws and lines share one remaining', () => {
  it('a 30% draw is fine on its own — 5,000 of the contract is already billed', async () => {
    expect(await remainingToBill()).toBe(5000); // framing billed in full
    const inv = await invoice('draw 30%');
    expect(await billDraw(inv, 'Draw — 30% of contract', 3000)).toBeNull();
    await send(inv);
    expect(await remainingToBill()).toBe(2000);
  });

  it('THE JOINT OVER-BILL: a line legal on its OWN remaining is refused', async () => {
    // 8,000 of 10,000 is billed (5,000 framing + a 3,000 draw), so 2,000 of
    // CONTRACT headroom is left. Lumber's OWN remaining is 3,000 — billing it
    // in full is perfectly legal per line, and the per-line derivation cannot
    // see a problem. The draw claims no particular line, so no per-line ceiling
    // can see it either. Only the CONTRACT ceiling catches this.
    const b = await billing();
    expect(b.lines.find((l) => l.name.includes('Lumber'))!.remaining).toBe(3000);
    expect(await remainingToBill()).toBe(2000);

    const inv = await invoice('over-bill attempt');
    const err = await billLine(inv, item.lumber, 'Lumber package', 'material', 3000);
    expect(err).not.toBeNull();
    expect(err!.message).toContain('more than the contract');
    expect(err!.message).toContain('11000.00');

    // Nothing was written, and the contract is not breached.
    const { count } = await admin
      .from('invoice_lines').select('id', { count: 'exact', head: true }).eq('invoice_id', inv);
    expect(count).toBe(0);
    expect(await remainingToBill()).toBe(2000);
  });

  it('billing exactly the remaining 2,000 is ALLOWED — the ceiling permits equality', async () => {
    const inv = await invoice('exact remainder');
    expect(await billLine(inv, item.roofing, 'Roofing sub', 'subcontractor', 2000)).toBeNull();
    await send(inv);
    expect(await remainingToBill()).toBe(0);
  });
});

describe('S97CT-ESTLINES — 5. VOID restores per-line AND contract headroom', () => {
  it('voiding the roofing invoice returns both, with no cleanup step', async () => {
    const roofingInvoice = invoiceIds[invoiceIds.length - 1];
    must('void', (await admin.from('invoices').update({
      status: 'voided', voided_at: new Date().toISOString(),
      void_reason: `${MARKER} test void`,
    }).eq('id', roofingInvoice)).error);

    // Per-line remaining is back…
    const b = await billing();
    expect(b.lines.find((l) => l.name.includes('Roofing'))!.remaining).toBe(2000);
    // …and so is the contract headroom.
    expect(await remainingToBill()).toBe(2000);

    // Nothing was deleted — the frozen line is retained (§9).
    const { count } = await admin
      .from('invoice_lines').select('id', { count: 'exact', head: true })
      .eq('invoice_id', roofingInvoice);
    expect(count).toBe(1);
  });

  it('and the freed headroom is usable again', async () => {
    const inv = await invoice('rebill roofing');
    expect(await billLine(inv, item.roofing, 'Roofing sub', 'subcontractor', 2000)).toBeNull();

    // Note the ceiling counts DRAFTS too — otherwise two drafts could each bill
    // the whole contract and both become sendable. Removed here so the
    // presentation checks below have headroom to write a line.
    must('release', (await admin.from('invoices').delete().eq('id', inv)).error);
    invoiceIds.splice(invoiceIds.indexOf(inv), 1);
    expect(await remainingToBill()).toBe(2000);
  });
});

describe('S97CT-ESTLINES — 6/7. scope of the ceiling', () => {
  it('a CO-instrument line is not constrained by the contract ceiling', async () => {
    const { data: co, error } = await admin
      .from('change_orders')
      .insert({
        company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
        co_number: `${MARKER}-CO`, title: 'extra scope',
        co_type: 'fixed_price', status: 'signed',
      })
      .select('id').single();
    must('change order', error);

    const inv = await invoice('CO billing');
    const coErr = (await admin.from('invoice_lines').insert({
      company_id: companyId, invoice_id: inv, line_type: 'fixed',
      description: 'CO lump sum', category: 'other',
      derived_amount: 9999, billed_amount: 9999,
      source_change_order_id: co!.id, sort_order: 0,
    })).error;
    // The contract is fully billed, yet this passes: it is a different scope.
    expect(coErr).toBeNull();
    must('co cleanup', (await admin.from('invoices').delete().eq('id', inv)).error);
    invoiceIds.splice(invoiceIds.indexOf(inv), 1);
    must('co delete', await disposeChangeOrdersError([co!.id]));
  });

  it('P11 — the ceiling does NOT apply on a cost-plus project', async () => {
    // contract_value there is the user-entered PROJECTION (1,000), which P11
    // forbids from billing math. Billing far past it must be allowed.
    const { data: inv, error } = await admin
      .from('invoices')
      .insert({
        company_id: companyId, project_id: cpProjectId, author_member_id: ownerMemberId,
        title: `${MARKER} cost-plus`, presentation_level: 'lump_sum',
      })
      .select('id').single();
    must('cp invoice', error);

    const cpErr = (await admin.from('invoice_lines').insert({
      company_id: companyId, invoice_id: inv!.id, line_type: 'fixed',
      description: 'well past the projection', category: 'other',
      derived_amount: 50000, billed_amount: 50000,
      source_estimate_id: cpEstimateId, sort_order: 0,
    })).error;
    expect(cpErr).toBeNull();
    must('cp cleanup', (await admin.from('invoices').delete().eq('id', inv!.id)).error);
  });
});

describe('S97CT-ESTLINES — 8. §11 renders real content on fixed-price', () => {
  it('full detail, by section (reconciling) and lump sum all have content', async () => {
    const inv = await invoice('presentation');
    expect(await billLine(inv, item.lumber, 'Lumber package', 'material', 1000, 0)).toBeNull();

    const { data: rows } = await admin
      .from('invoice_lines')
      .select('description, category, cost_basis, billed_amount, line_type')
      .eq('invoice_id', inv)
      .order('sort_order', { ascending: true });
    const lines: PresentationLine[] = (rows ?? []).map((r) => ({
      description: r.description,
      category: r.category as PresentationLine['category'],
      costBasis: r.cost_basis === null ? null : Number(r.cost_basis),
      amount: Number(r.billed_amount),
      lineType: r.line_type as PresentationLine['lineType'],
    }));

    // FULL DETAIL — a real line, not an empty block. It has no cost basis, so
    // it renders as a CHARGE outside the subtotal/markup block, which is
    // exactly right on fixed-price: the client agreed a price, not a cost.
    const full = presentInvoice(lines, 'full_detail');
    expect(full.chargeLines).toHaveLength(1);
    expect(full.nonLaborLines).toHaveLength(0);
    expect(full.nonLaborSubtotal).toBe(0);
    expect(full.nonLaborMarkup).toBe(0);
    expect(full.total).toBe(1000);

    // BY SECTION — content, in the right section, reconciling.
    const bySection = presentInvoice(lines, 'by_section');
    expect(bySection.sections).toEqual([{ label: 'Materials', amount: 1000 }]);
    const sections = money(bySection.sections.reduce((s, x) => s + x.amount, 0));
    const adjustments = money(bySection.adjustmentLines.reduce((s, x) => s + x.amount, 0));
    expect(money(sections + adjustments)).toBe(bySection.total);

    // LUMP SUM — one number covering the charge lines.
    const lump = presentInvoice(lines, 'lump_sum');
    expect(
      money(
        lump.laborLines
          .concat(lump.nonLaborLines, lump.chargeLines)
          .reduce((s, l) => s + l.amount, 0)
      )
    ).toBe(1000);
  });
});

afterAll(async () => {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  // Delete the INVOICE; its ON DELETE CASCADE takes the lines.
  // invoice_lines_parent_open refuses a direct line delete on a sent or voided
  // invoice (§8/§9) and early-returns during the cascade.
  for (const id of invoiceIds) check('invoice', (await admin.from('invoices').delete().eq('id', id)).error);
  for (const pid of [projectId, cpProjectId]) {
    if (!pid) continue;
    const { data: invs } = await admin.from('invoices').select('id').eq('project_id', pid);
    for (const i of invs ?? []) check('extra invoice', (await admin.from('invoices').delete().eq('id', i.id)).error);
    check('change orders', await disposeProjectChangeOrdersError(pid));
    check('financials', (await admin.from('project_financials').delete().eq('project_id', pid)).error);
    check('project', (await admin.from('projects').delete().eq('id', pid)).error);
  }
  for (const eid of [estimateId, cpEstimateId]) {
    if (!eid) continue;
    const { data: items } = await admin.from('estimate_line_items').select('id').eq('estimate_id', eid);
    for (const li of items ?? []) {
      check('rows', (await admin.from('estimate_line_rows').delete().eq('line_item_id', li.id)).error);
    }
    check('line items', (await admin.from('estimate_line_items').delete().eq('estimate_id', eid)).error);
    check('categories', (await admin.from('estimate_categories').delete().eq('estimate_id', eid)).error);
    check('estimate', (await admin.from('estimates').delete().eq('id', eid)).error);
  }
  if (contactId) check('contact', (await admin.from('contacts').delete().eq('id', contactId)).error);

  const { count } = await admin
    .from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  console.log(`\n[${MARKER} TEARDOWN] projects left: ${count}; errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`);
  // ⚠️ [S168] THIS THROW IS THE POINT. The teardown has always collected
  // `errors` and only PRINTED them, so when the S168 delete boundary began
  // refusing this suite's signed change order the cleanup failed in silence,
  // the project FK-blocked behind it, and the NEXT run died on a duplicate
  // `co_number` in `beforeAll` — a failure reported by a different suite, one
  // run later, with no trace of the cause. A cleanup that cannot fail its own
  // run is not a cleanup.
  if (errors.length) throw new Error(`[${MARKER}] teardown failed: ${JSON.stringify(errors)}`);
}, 240_000);
