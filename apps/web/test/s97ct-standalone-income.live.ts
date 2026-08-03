/**
 * S97CT-INCOME — §2 STANDALONE INVOICE INCOME against live rows [S97].
 *
 * Josh's ruling: manual invoice items are NEW INCOME LINES and must appear on
 * the project financial page as their own independent section; VOIDING THE
 * INVOICE MUST REMOVE THEM.
 *
 * Proves, against real rows and through the SAME function the page calls:
 *
 *   1. A standalone manual line appears as income, in its own CATEGORY group.
 *   2. Voiding the invoice removes it with NO RESIDUE and no cleanup step —
 *      while the invoice's lines are still retained (§9).
 *   3. An INSTRUMENT-ATTRIBUTED fixed line (a lump-sum billing of a CO) is NOT
 *      income, and IS retainage-classified to its own instrument (§5, Part A).
 *   4. A by-section invoice's sections sum EXACTLY to what the client is
 *      charged — the reconciliation bug the missing category caused.
 *   5. Discounts and credits are not swept in as income.
 *
 * RUN: cd apps/web && npx vitest run --config test/live.vitest.config.ts s97ct-standalone-income
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest } from './live-session';
import { loadProjectIncome } from '@/lib/services/project-income';
import { lineRetainageEligible, type InstrumentTypes } from '@/lib/services/invoices-shared';
import { presentInvoice, type PresentationLine } from '@framefocus/shared/utils/invoice-derivation';

const MARKER = 'S97INCOME';

let companyId: string;
let ownerMemberId: string;
let contactId: string;
let projectId: string;
let estimateId: string;
let coTmId: string;
let incomeInvoiceId: string;
let voidInvoiceId: string;
let sectionInvoiceId: string;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};
const money = (n: number) => Math.round(n * 100) / 100;

async function draftInvoice(title: string): Promise<string> {
  const { data, error } = await admin
    .from('invoices')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      title: `${MARKER} ${title}`, presentation_level: 'by_section',
    })
    .select('id').single();
  must(`invoice ${title}`, error);
  return data!.id;
}

async function fixedLine(
  invoiceId: string,
  description: string,
  amount: number,
  category: string | null,
  opts: { estimateId?: string; changeOrderId?: string; lineType?: string; sortOrder?: number } = {}
): Promise<string> {
  const { data, error } = await admin
    .from('invoice_lines')
    .insert({
      company_id: companyId, invoice_id: invoiceId,
      line_type: opts.lineType ?? 'fixed',
      description, category,
      derived_amount: amount, billed_amount: amount,
      source_estimate_id: opts.estimateId ?? null,
      source_change_order_id: opts.changeOrderId ?? null,
      sort_order: opts.sortOrder ?? 0,
    })
    .select('id').single();
  must(`line ${description}`, error);
  return data!.id;
}

beforeAll(async () => {
  assertRebuildTest();

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
  const seq = counters!.estimate_number_sequence + 1;
  const internal = counters!.project_internal_sequence + 1;

  const { data: estimate, error: eErr } = await admin
    .from('estimates')
    .insert({
      company_id: companyId, contact_id: contactId,
      name: `${MARKER} — contract`, estimate_number: `EST-${String(seq).padStart(4, '0')}`,
      status: 'accepted', contract_type: 'fixed_price', created_by_role: 'owner',
    })
    .select('id').single();
  must('estimate', eErr);
  estimateId = estimate!.id;

  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId, name: `${MARKER} — standalone income`, contact_id: contactId,
      project_type: 'fixed_price', source_estimate_id: estimateId, retainage_percent: 10,
      project_number: `PRJ-${String(seq).padStart(3, '0')}`, project_internal_seq: internal,
    })
    .select('id').single();
  must('project', pErr);
  projectId = project!.id;

  must('counters', (await admin.from('companies').update({
    estimate_number_sequence: seq, project_internal_sequence: internal,
  }).eq('id', companyId)).error);

  const { data: co, error: coErr } = await admin
    .from('change_orders')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      co_number: `${MARKER}-TM`, title: 'T&M work',
      co_type: 'time_and_materials', status: 'signed',
    })
    .select('id').single();
  must('change order', coErr);
  coTmId = co!.id;

  incomeInvoiceId = await draftInvoice('income');
  voidInvoiceId = await draftInvoice('to void');
  sectionInvoiceId = await draftInvoice('sections');
}, 240_000);

describe('S97CT-INCOME — 1. a standalone manual line IS income', () => {
  it('appears in the income section, grouped by its own category', async () => {
    await fixedLine(incomeInvoiceId, 'Permit expediting', 450, 'other', { sortOrder: 0 });
    await fixedLine(incomeInvoiceId, 'Site cleanup crew', 800, 'labor', { sortOrder: 1 });

    const income = await loadProjectIncome(admin as unknown as SupabaseClient, projectId);
    expect(income.total).toBe(1250);
    expect(income.groups.map((g) => g.label)).toEqual(['Labor', 'Other']);
    expect(income.groups.find((g) => g.label === 'Labor')?.amount).toBe(800);
    expect(income.groups.find((g) => g.label === 'Other')?.amount).toBe(450);

    // Not yet sent, so it is counted but flagged rather than read as billed.
    expect(income.draftTotal).toBe(1250);
  });
});

describe('S97CT-INCOME — 2. VOIDING REMOVES IT, with no residue', () => {
  it('the line contributes while the invoice is live', async () => {
    await fixedLine(voidInvoiceId, 'Temporary fencing', 1200, 'other', { sortOrder: 0 });
    const income = await loadProjectIncome(admin as unknown as SupabaseClient, projectId);
    expect(income.total).toBe(2450); // 1250 + 1200
  });

  it('voiding drops it to zero contribution — no cleanup step ran', async () => {
    // A void must be reached from an ISSUED invoice (§9), so it is sent first;
    // the assign-number trigger stamps the number inside that same UPDATE.
    must('send', (await admin
      .from('invoices')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', voidInvoiceId)).error);

    must('void', (await admin
      .from('invoices')
      .update({
        status: 'voided',
        voided_at: new Date().toISOString(),
        void_reason: `${MARKER} test void`,
      })
      .eq('id', voidInvoiceId)).error);

    const income = await loadProjectIncome(admin as unknown as SupabaseClient, projectId);
    expect(income.total).toBe(1250); // back to the live invoice only
    expect(
      income.groups.flatMap((g) => g.lines).some((l) => l.description === 'Temporary fencing')
    ).toBe(false);
  });

  it('and the invoice LINE is still retained (§9) — nothing was deleted', async () => {
    const { count } = await admin
      .from('invoice_lines')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', voidInvoiceId);
    expect(count).toBe(1);
    // THE POINT: removal happened because the derivation stopped matching, not
    // because anything was cleaned up. A stored budget row could not have done
    // this — project_budget_items has no DELETE policy at all.
  });
});

describe('S97CT-INCOME — 3. an instrument-attributed line is NOT income', () => {
  it('a lump-sum billing of a CO is excluded, and retains to ITS instrument', async () => {
    const before = await loadProjectIncome(admin as unknown as SupabaseClient, projectId);

    await fixedLine(incomeInvoiceId, 'CO lump sum', 5000, 'other', {
      changeOrderId: coTmId,
      sortOrder: 2,
    });
    await fixedLine(incomeInvoiceId, 'Contract draw #1', 10000, null, {
      estimateId,
      sortOrder: 3,
    });

    const after = await loadProjectIncome(admin as unknown as SupabaseClient, projectId);
    // NEITHER is new income — both bill something that already exists upstream.
    expect(after.total).toBe(before.total);
    expect(after.groups.flatMap((g) => g.lines).some((l) => l.description === 'CO lump sum')).toBe(false);
    expect(
      after.groups.flatMap((g) => g.lines).some((l) => l.description === 'Contract draw #1')
    ).toBe(false);

    // §5 / Part A — each is classified by ITS OWN instrument, not by fallback.
    const types: InstrumentTypes = {
      byKey: {
        [`est:${estimateId}`]: 'fixed_price',
        [`co:${coTmId}`]: 'time_and_materials',
      },
      fallback: 'fixed_price',
    };
    const { data: lines } = await admin
      .from('invoice_lines')
      .select('description, source_estimate_id, source_change_order_id')
      .eq('invoice_id', incomeInvoiceId);

    const coLine = lines!.find((l) => l.description === 'CO lump sum')!;
    const drawLine = lines!.find((l) => l.description === 'Contract draw #1')!;
    // The T&M CO's money is NEVER retained against.
    expect(lineRetainageEligible(coLine, types)).toBe(false);
    // The fixed-price contract draw IS.
    expect(lineRetainageEligible(drawLine, types)).toBe(true);
    // Had the draw kept the old NULL/NULL, it would have fallen to fallback —
    // right by luck here, wrong the moment the originating contract is T&M.
    expect(drawLine.source_estimate_id).toBe(estimateId);
  });
});

describe('S97CT-INCOME — 4. by-section sections RECONCILE', () => {
  it('Σ sections + Σ adjustments === the total the client is charged', async () => {
    await fixedLine(sectionInvoiceId, 'Manual — permits', 450, 'other', { sortOrder: 0 });
    await fixedLine(sectionInvoiceId, 'Draw #2', 5000, null, { estimateId, sortOrder: 1 });
    await fixedLine(sectionInvoiceId, 'Goodwill', -100, null, {
      lineType: 'discount',
      sortOrder: 2,
    });

    const { data: rows } = await admin
      .from('invoice_lines')
      .select('description, category, cost_basis, billed_amount, line_type')
      .eq('invoice_id', sectionInvoiceId)
      .order('sort_order', { ascending: true });

    const lines: PresentationLine[] = (rows ?? []).map((r) => ({
      description: r.description,
      category: r.category as PresentationLine['category'],
      costBasis: r.cost_basis === null ? null : Number(r.cost_basis),
      amount: Number(r.billed_amount),
      lineType: r.line_type as PresentationLine['lineType'],
    }));

    const p = presentInvoice(lines, 'by_section');
    const sections = money(p.sections.reduce((s, x) => s + x.amount, 0));
    const adjustments = money(p.adjustmentLines.reduce((s, x) => s + x.amount, 0));

    expect(p.total).toBe(5350); // 450 + 5000 - 100
    expect(money(sections + adjustments)).toBe(p.total); // THE IDENTITY
    // The manual line is in its own category; the draw falls to Other.
    expect(p.sections.find((x) => x.label === 'Other')?.amount).toBe(5450);
  });
});

describe('S97CT-INCOME — 5. adjustments are not income', () => {
  it('a discount carries no instrument but is excluded by the line_type test', async () => {
    const income = await loadProjectIncome(admin as unknown as SupabaseClient, projectId);
    expect(income.groups.flatMap((g) => g.lines).some((l) => l.description === 'Goodwill')).toBe(
      false
    );
    // The by-section invoice's own manual line IS income, so the discount being
    // excluded is a real filter and not an empty assertion.
    expect(
      income.groups.flatMap((g) => g.lines).some((l) => l.description === 'Manual — permits')
    ).toBe(true);
  });
});

afterAll(async () => {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  for (const id of [incomeInvoiceId, voidInvoiceId, sectionInvoiceId]) {
    if (!id) continue;
    check('lines', (await admin.from('invoice_lines').delete().eq('invoice_id', id)).error);
    check('invoice', (await admin.from('invoices').delete().eq('id', id)).error);
  }
  if (coTmId) check('change order', (await admin.from('change_orders').delete().eq('id', coTmId)).error);
  if (projectId) check('project', (await admin.from('projects').delete().eq('id', projectId)).error);
  if (estimateId) check('estimate', (await admin.from('estimates').delete().eq('id', estimateId)).error);
  if (contactId) check('contact', (await admin.from('contacts').delete().eq('id', contactId)).error);

  const { count } = await admin
    .from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  console.log(`\n[${MARKER} TEARDOWN] projects left: ${count}; errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`);
}, 240_000);
