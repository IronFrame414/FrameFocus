/**
 * S128 1a — Part B (estimates-and-change-orders-spec.md), live against rebuild-test.
 *
 * [Josh, 2026-10-03] "the number manually entered always wins on estimates and change orders."
 *
 * B-0 defect 2: clone_estimate_line did not copy estimate_line_rows.total_override, so a
 * CLONE or a REISSUE (reissueEstimate → clone_estimate → clone_estimate_line) lost every
 * hand-set total at its next recalculation. Migration 20262136000000 copies it, plus the
 * S128 total_override_basis. This proves it through the real RPC as the Owner, and reads the
 * copy back with the service role.
 *
 * Sabotage: apply docs/sessions/S128-sabotage-originals/clone_estimate_line/original.sql →
 * the copy test goes RED; re-apply the migration's function → green.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { getProposalData } from '@/lib/proposal/proposal-data';
import { formatDocumentPercent } from '@framefocus/shared/utils/estimate-totals';

const MARKER = 'S128MT';
const OWNER = 'josh+test50@worthprop.com';
const stamp = Date.now();

let companyId = '';
let contactId = '';
let owner: SupabaseClient;
let sourceId = '';
let cloneId = '';

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
  await admin.from('estimate_assignments').delete().in('estimate_id', es);
  const { error } = await admin.from('estimates').delete().in('id', es);
  if (error) throw new Error(`sweep estimates: ${error.message}`);
}

type RowRead = {
  name: string;
  total: number;
  markup_percent: number | null;
  total_override: number | null;
  total_override_basis: number | null;
};

async function rowsOf(estimateId: string): Promise<RowRead[]> {
  const { data: lis, error: liErr } = await admin
    .from('estimate_line_items')
    .select('id')
    .eq('estimate_id', estimateId);
  if (liErr) throw new Error(liErr.message);
  const ids = ((lis ?? []) as { id: string }[]).map((l) => l.id);
  if (!ids.length) return [];
  const { data, error } = await admin
    .from('estimate_line_rows')
    .select('name, total, markup_percent, total_override, total_override_basis')
    .in('line_item_id', ids)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as RowRead[];
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: co } = await admin
    .from('companies')
    .select('id')
    .eq('name', 'Sabal Point Construction')
    .single();
  companyId = (co as { id: string }).id;
  const { data: ct } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('id')
    .limit(1)
    .single();
  contactId = (ct as { id: string }).id;
  await sweep();
  owner = await sessionFor(OWNER);

  const { data: est, error: eErr } = await admin
    .from('estimates')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      name: `${MARKER} source ${stamp}`,
      status: 'draft',
      estimate_number: `EST-S128MT-${stamp}`,
      created_by_role: 'owner',
      contract_type: 'fixed_price',
      pricing_mode: 'markup',
      subcontractor_markup_percent: 20,
      tax_rate: 0,
      // B-0 defect 1 is on the open-book Cost Plus document.
      proposal_pricing_level: 'cost_plus_itemized',
    })
    .select('id')
    .single();
  if (eErr) throw new Error(`estimate: ${eErr.message}`);
  sourceId = (est as { id: string }).id;

  const { data: cat, error: cErr } = await admin
    .from('estimate_categories')
    .insert({
      company_id: companyId,
      estimate_id: sourceId,
      name: `${MARKER} category`,
      sort_order: 0,
    })
    .select('id')
    .single();
  if (cErr) throw new Error(`category: ${cErr.message}`);
  const { data: line, error: lErr } = await admin
    .from('estimate_line_items')
    .insert({
      company_id: companyId,
      estimate_id: sourceId,
      category_id: (cat as { id: string }).id,
      name: `${MARKER} Drywall Repair and Trim`,
      sort_order: 0,
      total_price: 1412.98,
    })
    .select('id')
    .single();
  if (lErr) throw new Error(`line: ${lErr.message}`);
  const lineId = (line as { id: string }).id;

  // The spec's own figure: $600.00 cost, $722.98 typed. Plus a control row that was never
  // hand-set (markup typed), so the test also shows nothing else changed shape.
  const { error: rErr } = await admin.from('estimate_line_rows').insert([
    {
      company_id: companyId,
      line_item_id: lineId,
      row_type: 'other',
      name: 'hand-set',
      sort_order: 0,
      amount: 600,
      apply_tax: false,
      markup_percent: null,
      total_override: 722.98,
      total_override_basis: 600,
      total: 722.98,
    },
    {
      company_id: companyId,
      line_item_id: lineId,
      row_type: 'other',
      name: 'markup-typed',
      sort_order: 1,
      amount: 600,
      apply_tax: false,
      markup_percent: 15,
      total: 690,
    },
  ]);
  if (rErr) throw new Error(`rows: ${rErr.message}`);

  // A second section holding ONLY a hand-set line, so the Cost Plus column has one
  // effective markup to print (a mixed section prints none, by design).
  const { data: line2, error: l2Err } = await admin
    .from('estimate_line_items')
    .insert({
      company_id: companyId,
      estimate_id: sourceId,
      category_id: (cat as { id: string }).id,
      name: `${MARKER} Paint`,
      sort_order: 1,
      total_price: 722.98,
    })
    .select('id')
    .single();
  if (l2Err) throw new Error(`line 2: ${l2Err.message}`);
  const { error: r2Err } = await admin.from('estimate_line_rows').insert({
    company_id: companyId,
    line_item_id: (line2 as { id: string }).id,
    row_type: 'other',
    name: 'paint hand-set',
    sort_order: 0,
    amount: 600,
    apply_tax: false,
    markup_percent: null,
    total_override: 722.98,
    total_override_basis: 600,
    total: 722.98,
  });
  if (r2Err) throw new Error(`row 2: ${r2Err.message}`);
});

afterAll(async () => {
  await sweep();
});

describe('S128 1a — a clone (and so a reissue) keeps a typed total', () => {
  it('the source carries exactly the three fixture rows (not a vacuous read)', async () => {
    const rows = await rowsOf(sourceId);
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.total_override != null)).toHaveLength(2);
  });

  it('clone_estimate as the Owner copies total_override AND total_override_basis', async () => {
    const r = await owner.rpc('clone_estimate', {
      p_source_id: sourceId,
      p_contact_id: contactId,
      p_contact_address_id: null,
      p_name: `${MARKER} clone ${stamp}`,
    });
    expect(r.error).toBeNull();
    const row = Array.isArray(r.data) ? r.data[0] : r.data;
    cloneId = (row as { new_estimate_id: string }).new_estimate_id;
    expect(cloneId).toBeTruthy();

    const rows = (await rowsOf(cloneId)).filter((x) => x.name !== 'paint hand-set');
    expect(rows).toHaveLength(2);
    expect(rows.map((x) => x.name)).toEqual(['hand-set', 'markup-typed']);
    // ⚠️ The assertion the defect fails: the typed $722.98 survives the copy as a TYPED
    // total, so no recalculation can turn it into default-markup × cost ($720.00).
    expect(Number(rows[0].total_override)).toBe(722.98);
    expect(Number(rows[0].total_override_basis)).toBe(600);
    expect(rows[0].markup_percent).toBeNull();
    expect(Number(rows[0].total)).toBe(722.98);
    // The control row is unchanged in shape.
    expect(rows[1].total_override).toBeNull();
    expect(rows[1].total_override_basis).toBeNull();
    expect(Number(rows[1].markup_percent)).toBe(15);
  });
});

describe("S128 1a — B-0 defect 1: the Cost Plus proposal prints a hand-set line's REAL markup", () => {
  it('getProposalData (as the Owner) gives the effective markup, and the document prints it at 2 dp', async () => {
    const data = await getProposalData(owner, sourceId);
    expect(data, 'no proposal data').not.toBeNull();
    const lines = data!.categories.flatMap((c) => c.lines);
    const paint = lines.find((l) => l.name === `${MARKER} Paint`);
    expect(paint, 'the Paint section is missing from the proposal').toBeTruthy();
    // ⚠️ Before S128 this was 20 — the estimate DEFAULT — beside a $722.98 price that is
    // 20.4966…% over its $600 cost. The open-book column disagreed with its own row.
    expect(paint!.markupPercent).not.toBeNull();
    expect(paint!.markupPercent as number).toBeCloseTo(20.496666666666673, 9);
    expect(formatDocumentPercent(paint!.markupPercent as number)).toBe('20.50%');
    expect(paint!.total).toBe(722.98);
    expect(paint!.cost).toBe(600);
  });
});
