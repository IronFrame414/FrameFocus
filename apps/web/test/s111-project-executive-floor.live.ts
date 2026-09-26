/**
 * S111 Part One — FILL-7.2, THE PROOF THIS BUILD STANDS OR FALLS ON.
 *
 * "The new role reads every money column on its own project, and ZERO rows on a
 * project it is not on — measured against the database with a real session,
 * with row counts stated, not asserted from the UI."
 *
 * HOW, AND WHY IT CANNOT PASS VACUOUSLY. For every Floor table, the OWNER's
 * rows (company-wide by policy) are resolved to a project with the service
 * role. The Project Executive must read EXACTLY the owner's rows whose project
 * it is assigned to — no fewer (a missing arm) and no more (a leak). Then:
 *   · on-project count > 0 for every money family (a pass on zero rows is a
 *     failure — CLAUDE.md);
 *   · the OWNER reads > 0 rows OFF its projects in aggregate — the control
 *     that makes the PE's zero a floor rather than an empty company.
 * Counts are printed per table.
 *
 * Q9 is asserted the same way: the payment headers it reads must equal exactly
 * the set the rule admits (every live application on its projects, and summing
 * to the whole payment), and recording is exercised for real and cleaned up.
 *
 * rebuild-test only (live-session guards). Run:
 *   npx vitest run --config test/live.vitest.config.ts test/s111-project-executive-floor.live.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const OWNER = 'josh+test50@worthprop.com';
const PE = 'josh+qa-pe@worthprop.com';

type Row = Record<string, unknown>;

async function all(client: SupabaseClient, table: string, cols: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) return out;
  }
}

const map = (rows: Row[], k: string, v: string) => new Map(rows.map((r) => [String(r[k]), r[v] as string | null]));

let owner: SupabaseClient;
let pe: SupabaseClient;
let companyId: string;
let assigned: Set<string>;
let resolve: Record<string, (r: Row) => string | null>;

type Dim = { table: string; key: string; cols: string; project: (r: Row) => string | null; money: boolean };
let dims: Dim[];

beforeAll(async () => {
  assertRebuildTest();
  owner = await sessionFor(OWNER);
  pe = await sessionFor(PE);

  const { data: peProfile, error } = await admin
    .from('profiles').select('id, company_id, role').eq('email', PE).single();
  if (error || !peProfile) throw new Error(`no ${PE} — run scripts/seed-test-identities.mjs`);
  expect(peProfile.role).toBe('project_executive');
  companyId = peProfile.company_id as string;
  const { data: member } = await admin.from('company_members').select('id').eq('profile_id', peProfile.id).single();
  const { data: asg } = await admin
    .from('project_assignments').select('project_id').eq('member_id', member!.id).eq('is_deleted', false);
  assigned = new Set((asg ?? []).map((a) => a.project_id as string));

  // Scope maps, read as service role (the thing under test is the PE session).
  const inv = map(await all(admin, 'invoices', 'id, project_id'), 'id', 'project_id');
  const co = map(await all(admin, 'change_orders', 'id, project_id'), 'id', 'project_id');
  const est = map(await all(admin, 'estimates', 'id, project_id'), 'id', 'project_id');
  const bi = map(await all(admin, 'project_budget_items', 'id, project_id'), 'id', 'project_id');
  const cc = map(await all(admin, 'client_contracts', 'id, project_id'), 'id', 'project_id');
  const coli = map(await all(admin, 'change_order_line_items', 'id, change_order_id'), 'id', 'change_order_id');
  const g = (m: Map<string, string | null>, k: unknown) => (k == null ? null : (m.get(String(k)) ?? null));
  resolve = { inv: (r) => g(inv, r.invoice_id) };

  dims = [
    { table: 'project_financials', key: 'project_id', cols: 'project_id', project: (r) => r.project_id as string, money: true },
    { table: 'project_budget_amounts', key: 'budget_item_id', cols: 'budget_item_id', project: (r) => g(bi, r.budget_item_id), money: true },
    {
      table: 'instrument_rates', key: 'id', cols: 'id, estimate_id, change_order_id', money: true,
      project: (r) => (r.estimate_id ? g(est, r.estimate_id) : g(co, r.change_order_id)),
    },
    { table: 'change_orders', key: 'id', cols: 'id, project_id', project: (r) => r.project_id as string, money: true },
    { table: 'change_order_line_items', key: 'id', cols: 'id, change_order_id', project: (r) => g(co, r.change_order_id), money: true },
    { table: 'change_order_line_rows', key: 'id', cols: 'id, line_item_id', project: (r) => g(co, g(coli, r.line_item_id)), money: false },
    { table: 'invoices', key: 'id', cols: 'id, project_id', project: (r) => r.project_id as string, money: true },
    { table: 'invoice_lines', key: 'id', cols: 'id, invoice_id', project: (r) => g(inv, r.invoice_id), money: true },
    // Q7: an estimate with no project is the sales stage — never visible.
    { table: 'estimates', key: 'id', cols: 'id, project_id', project: (r) => (r.project_id as string) ?? null, money: false },
    { table: 'client_contract_amounts', key: 'client_contract_id', cols: 'client_contract_id', project: (r) => g(cc, r.client_contract_id), money: false },
    { table: 'retainage_releases', key: 'id', cols: 'id, project_id', project: (r) => r.project_id as string, money: false },
    { table: 'client_refunds', key: 'id', cols: 'id, project_id', project: (r) => (r.project_id as string) ?? null, money: false },
    { table: 'client_payment_applications', key: 'id', cols: 'id, invoice_id', project: (r) => g(inv, r.invoice_id), money: true },
  ];
}, 120_000);

describe('FILL-7.2 — every Floor table: exactly its own projects, zero elsewhere', () => {
  const tally: Array<Record<string, unknown>> = [];

  it('the identity is assigned to at least one project and NOT to at least one other', async () => {
    const { count } = await admin.from('projects').select('id', { count: 'exact', head: true }).eq('company_id', companyId);
    console.log(`[S111] PE assigned to ${assigned.size} of ${count} company projects`);
    expect(assigned.size).toBeGreaterThan(0);
    expect(count!).toBeGreaterThan(assigned.size);
  });

  it('per table: PE rows == owner rows on assigned projects (none missing, none extra)', async () => {
    let ownerOffTotal = 0;
    const missingMoney: string[] = [];
    for (const d of dims) {
      const ownerRows = await all(owner, d.table, d.cols);
      const peRows = await all(pe, d.table, d.cols);
      const expected = new Set(
        ownerRows.filter((r) => { const p = d.project(r); return p !== null && assigned.has(p); }).map((r) => String(r[d.key]))
      );
      const got = new Set(peRows.map((r) => String(r[d.key])));
      const extra = [...got].filter((k) => !expected.has(k));
      const missing = [...expected].filter((k) => !got.has(k));
      const ownerOff = ownerRows.length - expected.size;
      ownerOffTotal += ownerOff;
      const peOff = peRows.filter((r) => { const p = d.project(r); return p === null || !assigned.has(p); }).length;
      tally.push({ table: d.table, ownerTotal: ownerRows.length, ownerOnPE: expected.size, ownerOffPE: ownerOff, peOn: got.size - peOff, peOff });
      expect(extra, `${d.table}: PE reads ${extra.length} row(s) OFF its projects — a LEAK`).toEqual([]);
      expect(missing, `${d.table}: PE is missing ${missing.length} row(s) on its projects — a missing arm`).toEqual([]);
      expect(peOff, `${d.table}: off-project rows`).toBe(0);
      if (d.money && expected.size === 0) missingMoney.push(d.table);
    }
    console.table(tally);
    // A pass on zero rows is a failure: every money family must be exercised on-project.
    expect(missingMoney, 'money tables with NO row on the PE project — the proof would be vacuous').toEqual([]);
    // The control: the zero off-project is a floor, not an empty company.
    expect(ownerOffTotal, 'the owner reads nothing off the PE projects — the zeros prove nothing').toBeGreaterThan(0);
  }, 180_000);
});

describe('Q9 — payments, the piece this build is judged on', () => {
  it('the payment headers it reads are EXACTLY the ones the rule admits', async () => {
    const pays = await all(admin, 'client_payments', 'id, amount, company_id');
    const apps = await all(admin, 'client_payment_applications', 'id, payment_id, invoice_id, amount, is_deleted');
    const live = apps.filter((a) => a.is_deleted === false);
    const expected = new Set<string>();
    for (const p of pays.filter((x) => x.company_id === companyId)) {
      const mine = live.filter((a) => a.payment_id === p.id);
      const projects = mine.map((a) => resolve.inv(a));
      const sum = Math.round(mine.reduce((s, a) => s + Number(a.amount), 0) * 100);
      if (
        mine.length > 0 &&
        projects.every((pr) => pr !== null && assigned.has(pr)) &&
        sum === Math.round(Number(p.amount) * 100)
      ) expected.add(p.id as string);
    }
    const got = new Set((await all(pe, 'client_payments', 'id')).map((r) => r.id as string));
    const ownerCount = (await all(owner, 'client_payments', 'id')).length;
    console.log(`[S111 Q9] payment headers — owner reads ${ownerCount}, rule admits ${expected.size}, PE reads ${got.size}`);
    expect([...got].sort()).toEqual([...expected].sort());
    expect(ownerCount, 'control: the owner reads payments the PE does not').toBeGreaterThan(got.size);
  });

  // Recording — exercised for real, then removed. Needs a SENT invoice on a PE
  // project with receivable remaining; the test says so rather than skipping
  // silently if there is none.
  const created: string[] = [];
  let target: { id: string; contact: string; remaining: number; project: string } | null = null;
  let offTarget: { id: string; contact: string } | null = null;

  beforeAll(async () => {
    const invs = await all(admin, 'invoices', 'id, project_id, status, amount_receivable, is_deleted, company_id');
    const apps = await all(admin, 'client_payment_applications', 'invoice_id, amount, is_deleted');
    const projs = map(await all(admin, 'projects', 'id, contact_id'), 'id', 'contact_id');
    for (const i of invs.filter((x) => x.company_id === companyId && x.is_deleted === false && x.status === 'sent')) {
      const applied = apps.filter((a) => a.invoice_id === i.id && a.is_deleted === false).reduce((s, a) => s + Number(a.amount), 0);
      const remaining = Math.round((Number(i.amount_receivable) - applied) * 100) / 100;
      const contact = projs.get(i.project_id as string);
      if (remaining < 0.02 || !contact) continue;
      if (!target && assigned.has(i.project_id as string)) target = { id: i.id as string, contact, remaining, project: i.project_id as string };
      if (!offTarget && !assigned.has(i.project_id as string)) offTarget = { id: i.id as string, contact };
    }
  }, 120_000);

  afterAll(async () => {
    if (created.length) {
      await admin.from('client_payment_applications').delete().in('payment_id', created);
      await admin.from('client_payments').delete().in('id', created);
      if (target) await admin.from('invoices').update({ status: 'sent' }).eq('id', target.id).eq('status', 'paid');
    }
  });

  it('it can record a payment fully applied to its own invoice, and then reads it', async () => {
    expect(target, 'no SENT invoice with receivable remaining on a PE project — seed one').not.toBeNull();
    const amount = Math.min(1, target!.remaining);
    const { data, error } = await pe.rpc('record_client_payment', {
      p_contact_id: target!.contact, p_amount: amount,
      p_applications: [{ invoice_id: target!.id, amount }], p_method: 'check', p_note: 'S111 Q9 proof',
    });
    expect(error, error?.message).toBeNull();
    created.push(data as string);
    const { data: seen } = await pe.from('client_payments').select('id, amount').eq('id', data as string);
    console.log(`[S111 Q9] PE recorded ${amount} on its own invoice; reads its header: ${seen?.length}`);
    expect(seen).toHaveLength(1);
  });

  it('it is REFUSED a payment with an unapplied surplus — and no payment row survives', async () => {
    const before = (await admin.from('client_payments').select('id', { count: 'exact', head: true }).eq('company_id', companyId)).count;
    const { error } = await pe.rpc('record_client_payment', {
      p_contact_id: target!.contact, p_amount: 5,
      p_applications: [{ invoice_id: target!.id, amount: 0.01 }], p_method: 'check', p_note: 'S111 Q9 surplus',
    });
    const after = (await admin.from('client_payments').select('id', { count: 'exact', head: true }).eq('company_id', companyId)).count;
    expect(error?.message ?? '').toMatch(/must apply the whole payment/);
    expect(after).toBe(before);
  });

  it('it is REFUSED an application to an invoice off its projects — and no payment row survives', async () => {
    expect(offTarget, 'no SENT invoice off the PE projects to aim at — the refusal would be untested').not.toBeNull();
    const before = (await admin.from('client_payments').select('id', { count: 'exact', head: true }).eq('company_id', companyId)).count;
    const { error } = await pe.rpc('record_client_payment', {
      p_contact_id: offTarget!.contact, p_amount: 0.01,
      p_applications: [{ invoice_id: offTarget!.id, amount: 0.01 }], p_method: 'check', p_note: 'S111 Q9 off-project',
    });
    const after = (await admin.from('client_payments').select('id', { count: 'exact', head: true }).eq('company_id', companyId)).count;
    expect(error?.message ?? '').toMatch(/not on one of your projects/);
    expect(after).toBe(before);
  });
});
