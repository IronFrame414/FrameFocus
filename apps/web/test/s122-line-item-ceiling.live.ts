/**
 * S122 Part 0-C — the per-line billing ceiling. ⚠️ MONEY.
 * Migration 20262123000000. [RULED Josh, S122 Q7-A.]
 *
 *   PARTIAL    typing $20,000 on a $42,763.00 line bills $20,000; the remaining
 *              (loadEstimateLineBilling, the picker's own function) is then
 *              $22,763.00, and a SECOND invoice can bill exactly that — a
 *              partial bill is not a discount (S97).
 *   CEILING    one cent more on that line is REFUSED by the database, naming
 *              the line — with the CONTRACT ceiling still holding headroom, so
 *              it is the per-line ceiling that refused. Equality is allowed. An
 *              UPDATE past the price is refused too.
 *   THE PM     ⚠️ Q7's reason: a PM sees only invoices they authored, so their
 *              screen's "remaining" is too HIGH. Measured: the PM's picker shows
 *              the line fully unbilled while the Owner's $20,000 sits on it, and
 *              billing what the PM is shown is refused.
 *   VOID       voiding frees the line again, with no cleanup step.
 *   P11        a cost-plus project's line has no ceiling (a projection, not a price).
 *
 * Every write returns no rows to the caller; every outcome is counted with the
 * service role, with row counts and dollar totals stated.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  admin,
  assertRebuildTest,
  deleteProjects,
  sessionFor,
  sweepProjectsNamed,
  upsertContact,
} from './live-session';
import { loadEstimateLineBilling } from '@/lib/services/estimate-line-billing';

const MARKER = 'S122LIC';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';

let companyId = '';
let ownerMember = '';
let pmMember = '';
let contactId = '';
const project: Record<'fixed' | 'cp', string> = { fixed: '', cp: '' };
const estimate: Record<'fixed' | 'cp', string> = { fixed: '', cp: '' };
const line: Record<'big' | 'small' | 'cp', string> = { big: '', small: '', cp: '' };
const invoiceIds: string[] = [];
let pm: SupabaseClient;
let owner: SupabaseClient;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function memberOf(email: string): Promise<string> {
  const { data: p } = await admin.from('profiles').select('id').eq('email', email).single();
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', p!.id)
    .eq('is_deleted', false)
    .single();
  return m!.id as string;
}

async function invoiceAs(
  client: SupabaseClient,
  which: 'fixed' | 'cp',
  author: string,
  title: string
): Promise<string> {
  // Created with the service role (an invoice header is not what is under
  // test); the LINES below are written by the role under test.
  const { data, error } = await admin
    .from('invoices')
    .insert({
      company_id: companyId,
      project_id: project[which],
      author_member_id: author,
      title: `${MARKER} ${title}`,
      presentation_level: 'full_detail',
    })
    .select('id')
    .single();
  must(`invoice ${title}`, error);
  invoiceIds.push(data!.id as string);
  void client;
  return data!.id as string;
}

/** A billed line exactly as billEstimateLines writes it — NO rows returned. */
async function bill(
  client: SupabaseClient,
  invoiceId: string,
  which: 'big' | 'small' | 'cp',
  amount: number
) {
  return (
    await client.from('invoice_lines').insert({
      company_id: companyId,
      invoice_id: invoiceId,
      line_type: 'fixed',
      description: `${MARKER} ${which}`,
      category: 'labor',
      derived_amount: amount,
      billed_amount: amount,
      source_estimate_id: which === 'cp' ? estimate.cp : estimate.fixed,
      source_estimate_line_item_id: line[which],
      sort_order: 0,
    })
  ).error;
}

/** Live lines on a line item, counted with the service role. */
async function billedOn(which: 'big' | 'small' | 'cp') {
  const { data } = await admin
    .from('invoice_lines')
    .select('billed_amount, invoices!inner(is_deleted, status)')
    .eq('source_estimate_line_item_id', line[which])
    .eq('invoices.is_deleted', false)
    .neq('invoices.status', 'voided');
  const rows = (data ?? []) as { billed_amount: number }[];
  return {
    n: rows.length,
    total: Math.round(rows.reduce((s, r) => s + Number(r.billed_amount), 0) * 100) / 100,
  };
}

async function seedEstimate(
  which: 'fixed' | 'cp',
  seq: number,
  internal: number,
  items: [keyof typeof line, number][]
) {
  const contract = which === 'fixed' ? 'fixed_price' : 'cost_plus';
  const { data: e, error } = await admin
    .from('estimates')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      name: `${MARKER} — ${which}`,
      estimate_number: `EST-${String(seq).padStart(4, '0')}`,
      status: 'accepted',
      contract_type: contract,
      created_by_role: 'owner',
      discount_total: 0,
    })
    .select('id')
    .single();
  must(`estimate ${which}`, error);
  estimate[which] = e!.id as string;
  let order = 0;
  for (const [key, price] of items) {
    const { data: li, error: liErr } = await admin
      .from('estimate_line_items')
      .insert({
        company_id: companyId,
        estimate_id: estimate[which],
        name: `${MARKER} ${key}`,
        total_price: price,
        sort_order: order++,
      })
      .select('id')
      .single();
    must(`line ${key}`, liErr);
    line[key] = li!.id as string;
  }
  const { data: p, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      name: `${MARKER} — ${which}`,
      contact_id: contactId,
      project_type: contract,
      source_estimate_id: estimate[which],
      project_number: `PRJ-${MARKER}-${which}`,
      project_internal_seq: internal,
    })
    .select('id')
    .single();
  must(`project ${which}`, pErr);
  project[which] = p!.id as string;
  // A contract with ample headroom (100,000), so a refusal below cannot be the
  // CONTRACT ceiling's.
  must(
    'financials',
    (
      await admin
        .from('project_financials')
        .insert({ company_id: companyId, project_id: project[which], contract_value: 100000 })
    ).error
  );
}

beforeAll(async () => {
  assertRebuildTest();
  await sweepProjectsNamed(MARKER);
  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .single();
  companyId = prof!.company_id as string;
  ownerMember = await memberOf(OWNER);
  pmMember = await memberOf(PM);
  const contact = await upsertContact({
    company_id: companyId,
    contact_type: 'client',
    first_name: MARKER,
    last_name: 'Client',
    email: `${MARKER.toLowerCase()}@example.invalid`,
  });
  contactId = contact.id;
  const { data: counters } = await admin
    .from('companies')
    .select('estimate_number_sequence, project_internal_sequence')
    .eq('id', companyId)
    .single();
  const seq = counters!.estimate_number_sequence as number;
  const internal = counters!.project_internal_sequence as number;
  await seedEstimate('fixed', seq + 1, internal + 1, [
    ['big', 42763.0],
    ['small', 1000.0],
  ]);
  await seedEstimate('cp', seq + 2, internal + 2, [['cp', 1000.0]]);
  must(
    'counters',
    (
      await admin
        .from('companies')
        .update({ estimate_number_sequence: seq + 2, project_internal_sequence: internal + 2 })
        .eq('id', companyId)
    ).error
  );
  // The PM is on the fixed-price project, so RLS lets them bill THEIR invoice.
  must(
    'pm assignment',
    (
      await admin
        .from('project_assignments')
        .insert({
          company_id: companyId,
          project_id: project.fixed,
          member_id: pmMember,
          role_on_project: 'project_manager',
        })
    ).error
  );
  owner = await sessionFor(OWNER);
  pm = await sessionFor(PM);
}, 240_000);

afterAll(async () => {
  for (const id of invoiceIds) await admin.from('invoices').delete().eq('id', id);
  for (const which of ['fixed', 'cp'] as const) {
    if (!project[which]) continue;
    await admin.from('project_assignments').delete().eq('project_id', project[which]);
    await admin.from('project_financials').delete().eq('project_id', project[which]);
    await deleteProjects(admin, [project[which]]);
    await admin.from('estimate_line_items').delete().eq('estimate_id', estimate[which]);
    await admin.from('estimates').delete().eq('id', estimate[which]);
  }
  const { count } = await admin
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .like('name', `${MARKER}%`);
  expect(count ?? 0).toBe(0);
}, 240_000);

describe('PARTIAL — a typed amount bills that amount; the remainder survives', () => {
  let first = '';
  it('Owner bills $20,000 of the $42,763.00 line', async () => {
    first = await invoiceAs(owner, 'fixed', ownerMember, 'first');
    expect(await bill(owner, first, 'big', 20000)).toBeNull();
    expect(await billedOn('big')).toEqual({ n: 1, total: 20000 });
    const b = await loadEstimateLineBilling(admin as unknown as SupabaseClient, project.fixed);
    const big = b.lines.find((l) => l.lineItemId === line.big)!;
    console.log(
      `[S122LIC] after $20,000: sell=${big.sell} billed=${big.billed} remaining=${big.remaining}`
    );
    expect(big.remaining).toBe(22763);
  });

  it('⚠️ one cent past the price is REFUSED by the database — while the contract has headroom', async () => {
    const inv = await invoiceAs(owner, 'fixed', ownerMember, 'over');
    const err = await bill(owner, inv, 'big', 22763.01);
    console.log(`[S122LIC] over by 0.01: ${err?.message}`);
    expect(err?.message).toMatch(/more than the line "S122LIC big" is priced at/);
    expect(err?.message).toMatch(/Bill at most 22763/);
    expect(await billedOn('big'), 'nothing landed').toEqual({ n: 1, total: 20000 });
    // The CONTRACT ceiling was not the one: 20,000 + 22,763.01 = 42,763.01 < 100,000.
  });

  it('a SECOND invoice bills exactly the remaining $22,763.00 — the line sums to its price', async () => {
    const second = await invoiceAs(owner, 'fixed', ownerMember, 'second');
    expect(await bill(owner, second, 'big', 22763)).toBeNull();
    expect(await billedOn('big')).toEqual({ n: 2, total: 42763 });
    const b = await loadEstimateLineBilling(admin as unknown as SupabaseClient, project.fixed);
    expect(
      b.lines.find((l) => l.lineItemId === line.big),
      'fully billed → it drops out of the picker'
    ).toBeUndefined();
  });

  it('an UPDATE past the price is refused too', async () => {
    const { data } = await admin
      .from('invoice_lines')
      .select('id')
      .eq('invoice_id', first)
      .single();
    const { error } = await owner
      .from('invoice_lines')
      .update({ billed_amount: 20000.01 })
      .eq('id', data!.id);
    expect(error?.message).toMatch(/priced at/);
    expect(await billedOn('big')).toEqual({ n: 2, total: 42763 });
  });

  it('VOID frees the line: voiding the first invoice returns $20,000, usable again', async () => {
    must('void', (await admin.from('invoices').update({ status: 'voided' }).eq('id', first)).error);
    expect(await billedOn('big')).toEqual({ n: 1, total: 22763 });
    const again = await invoiceAs(owner, 'fixed', ownerMember, 'again');
    expect(await bill(owner, again, 'big', 20000)).toBeNull();
    expect(await billedOn('big')).toEqual({ n: 2, total: 42763 });
  });
});

describe("⚠️ THE PM — the screen's remaining is too high; the database is what holds", () => {
  it("Owner bills $600 of the $1,000 line; the PM's picker cannot see it; billing what the PM is shown is refused", async () => {
    const ownerInv = await invoiceAs(owner, 'fixed', ownerMember, 'owner small');
    expect(await bill(owner, ownerInv, 'small', 600)).toBeNull();

    const asPm = await loadEstimateLineBilling(pm, project.fixed);
    const asAdmin = await loadEstimateLineBilling(
      admin as unknown as SupabaseClient,
      project.fixed
    );
    const pmView = asPm.lines.find((l) => l.lineItemId === line.small);
    const realView = asAdmin.lines.find((l) => l.lineItemId === line.small)!;
    console.log(
      `[S122LIC] small line — PM sees remaining=${pmView?.remaining}; truth remaining=${realView.remaining}`
    );
    expect(realView.remaining).toBe(400);
    // The measured gap. If this ever reads 400, the PM floor changed and this
    // test's premise must be re-read — it fails loudly rather than passing
    // vacuously.
    expect(pmView?.remaining, 'the PM is shown more than is really left').toBe(1000);

    const pmInv = await invoiceAs(pm, 'fixed', pmMember, 'pm small');
    const err = await bill(pm, pmInv, 'small', pmView!.remaining);
    console.log(`[S122LIC] PM bills ${pmView!.remaining}: ${err?.message}`);
    expect(err?.message).toMatch(/priced at/);
    expect(await billedOn('small'), "only the Owner's $600 is on the line").toEqual({
      n: 1,
      total: 600,
    });

    // Control: the PM CAN bill what is really left — so the refusal above was
    // the ceiling, not a PM who cannot write at all.
    expect(await bill(pm, pmInv, 'small', 400)).toBeNull();
    expect(await billedOn('small')).toEqual({ n: 2, total: 1000 });
  });
});

describe('P11 — no per-line ceiling on a cost-plus project', () => {
  it('a cost-plus line billed past its estimate figure is allowed', async () => {
    const inv = await invoiceAs(owner, 'cp', ownerMember, 'cp');
    expect(await bill(owner, inv, 'cp', 5000)).toBeNull();
    expect(await billedOn('cp')).toEqual({ n: 1, total: 5000 });
  });
});
