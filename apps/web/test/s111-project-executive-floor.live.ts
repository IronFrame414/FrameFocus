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
 * ⚠️ IT ASSIGNS THE PE FOR THE DURATION OF THE RUN, AND REMOVES IT AFTER. A
 * standing assignment on company A's fixture project made the PE a 5th postable
 * person in QA A's crew thread and turned desktop-chat-mentions red on every
 * branch (they all run against this database). So: RUN ONLY WHILE NO CI IS LIVE
 * — check the Actions API first — exactly like the other shared-state harnesses.
 *
 * rebuild-test only (live-session guards). Run:
 *   npx vitest run --config test/live.vitest.config.ts test/s111-project-executive-floor.live.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// The live config does not print console output from PASSING tests, so every
// count is also written here (PE_PROOF_OUT) — a number that is not recorded is
// not a measurement.
const OUT: Record<string, unknown> = {};
const record = (k: string, v: unknown) => {
  OUT[k] = v;
  if (process.env.PE_PROOF_OUT) writeFileSync(process.env.PE_PROOF_OUT, JSON.stringify(OUT, null, 2));
};

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

let peMemberId = '';
let runAssignmentId = '';

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
  peMemberId = member!.id as string;
  // Assign for this run only (see header): company A's fixture project, the one
  // with a row in every money family.
  const { data: fixture } = await admin
    .from('projects').select('id').eq('company_id', companyId).eq('name', 'QA A — isolation fixture').single();
  const { data: row } = await admin
    .from('project_assignments').select('id, is_deleted').eq('project_id', fixture!.id).eq('member_id', peMemberId).maybeSingle();
  if (row) {
    await admin.from('project_assignments').update({ is_deleted: false, deleted_at: null }).eq('id', row.id);
    runAssignmentId = row.id as string;
  } else {
    const { data: ins, error: insErr } = await admin.from('project_assignments')
      .insert({ company_id: companyId, project_id: fixture!.id, member_id: peMemberId, role_on_project: 'project_executive' })
      .select('id').single();
    if (insErr) throw new Error(`assign PE for the run: ${insErr.message}`);
    runAssignmentId = ins.id as string;
  }
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

// Remove the run's assignment again — the seeded state has none (see header).
afterAll(async () => {
  if (runAssignmentId) {
    await admin.from('project_assignments').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', runAssignmentId);
  }
  const { count } = await admin.from('project_assignments').select('id', { count: 'exact', head: true })
    .eq('member_id', peMemberId).eq('is_deleted', false);
  record('assignmentsLeftAfterRun', count);
});

describe('FILL-7.2 — every Floor table: exactly its own projects, zero elsewhere', () => {
  const tally: Array<Record<string, unknown>> = [];

  it('the identity is assigned to at least one project and NOT to at least one other', async () => {
    const { count } = await admin.from('projects').select('id', { count: 'exact', head: true }).eq('company_id', companyId);
    record('assignment', { assigned: assigned.size, companyProjects: count });
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
    record('perTable', tally);
    record('ownerOffTotal', ownerOffTotal);
    // A pass on zero rows is a failure: every money family must be exercised on-project.
    expect(missingMoney, 'money tables with NO row on the PE project — the proof would be vacuous').toEqual([]);
    // The control: the zero off-project is a floor, not an empty company.
    expect(ownerOffTotal, 'the owner reads nothing off the PE projects — the zeros prove nothing').toBeGreaterThan(0);
  }, 180_000);
});

describe('Q9 — payments, the piece this build is judged on', () => {
  // Every payment row this block creates, removed in afterAll, and the status
  // each touched invoice had before, restored there.
  const created: string[] = [];
  const statusBefore = new Map<string, string>();
  let target: { id: string; contact: string; remaining: number } | null = null;
  let offTarget: { id: string; contact: string; remaining: number } | null = null;
  // The NEGATIVE cases, made by the OWNER: without them "the PE reads exactly
  // the rule's set" can pass on a company whose only payment is the PE's
  // (measured: that was the case — 1 payment, on the PE's project).
  let offProjectPayment = '';
  let surplusPayment = '';

  beforeAll(async () => {
    const invs = await all(admin, 'invoices', 'id, project_id, status, amount_receivable, is_deleted, company_id');
    const apps = await all(admin, 'client_payment_applications', 'invoice_id, amount, is_deleted');
    const projs = map(await all(admin, 'projects', 'id, contact_id'), 'id', 'contact_id');
    for (const i of invs.filter((x) => x.company_id === companyId && x.is_deleted === false && x.status === 'sent')) {
      const applied = apps.filter((a) => a.invoice_id === i.id && a.is_deleted === false).reduce((s2, a) => s2 + Number(a.amount), 0);
      const remaining = Math.round((Number(i.amount_receivable) - applied) * 100) / 100;
      const contact = projs.get(i.project_id as string);
      // ≥ 0.05 so the few cents applied below can never settle the invoice.
      if (remaining < 0.05 || !contact) continue;
      const t = { id: i.id as string, contact, remaining };
      if (!target && assigned.has(i.project_id as string)) target = t;
      if (!offTarget && !assigned.has(i.project_id as string)) offTarget = t;
    }
    for (const t of [target, offTarget]) if (t) statusBefore.set(t.id, 'sent');

    if (target && offTarget) {
      const a = await owner.rpc('record_client_payment', {
        p_contact_id: offTarget.contact, p_amount: 0.01,
        p_applications: [{ invoice_id: offTarget.id, amount: 0.01 }], p_method: 'check', p_note: 'S111 Q9 control: off-project',
      });
      if (a.error) throw new Error(`owner off-project payment: ${a.error.message}`);
      offProjectPayment = a.data as string; created.push(offProjectPayment);
      const b = await owner.rpc('record_client_payment', {
        p_contact_id: target.contact, p_amount: 0.02,
        p_applications: [{ invoice_id: target.id, amount: 0.01 }], p_method: 'check', p_note: 'S111 Q9 control: unapplied surplus',
      });
      if (b.error) throw new Error(`owner surplus payment: ${b.error.message}`);
      surplusPayment = b.data as string; created.push(surplusPayment);
    }
  }, 120_000);

  afterAll(async () => {
    if (created.length) {
      await admin.from('client_payment_applications').delete().in('payment_id', created);
      await admin.from('client_payments').delete().in('id', created);
    }
    for (const [id, st] of statusBefore) await admin.from('invoices').update({ status: st }).eq('id', id);
  });

  it('there is a sent invoice on and off its projects to test against (else the proof is untested)', () => {
    expect(target, 'no SENT invoice with receivable left on a PE project').not.toBeNull();
    expect(offTarget, 'no SENT invoice with receivable left OFF the PE projects').not.toBeNull();
  });

  it('the payment headers it reads are EXACTLY the ones the rule admits — and never the two controls', async () => {
    const pays = await all(admin, 'client_payments', 'id, amount, company_id');
    const apps = await all(admin, 'client_payment_applications', 'id, payment_id, invoice_id, amount, is_deleted');
    const live = apps.filter((a) => a.is_deleted === false);
    const expected = new Set<string>();
    for (const p of pays.filter((x) => x.company_id === companyId)) {
      const mine = live.filter((a) => a.payment_id === p.id);
      const projects = mine.map((a) => resolve.inv(a));
      const sum = Math.round(mine.reduce((s2, a) => s2 + Number(a.amount), 0) * 100);
      if (mine.length > 0 && projects.every((pr) => pr !== null && assigned.has(pr)) && sum === Math.round(Number(p.amount) * 100)) {
        expected.add(p.id as string);
      }
    }
    const got = new Set((await all(pe, 'client_payments', 'id')).map((r) => r.id as string));
    const ownerCount = (await all(owner, 'client_payments', 'id')).length;
    // The surplus payment's OWN application is on its project — visible —
    // while the header (whose amount includes the unapplied cent) is not.
    const surplusApps = (await pe.from('client_payment_applications').select('id').eq('payment_id', surplusPayment)).data ?? [];
    const offApps = (await pe.from('client_payment_applications').select('id').eq('payment_id', offProjectPayment)).data ?? [];
    record('q9Headers', { ownerReads: ownerCount, ruleAdmits: expected.size, peReads: got.size,
      offProjectHeaderVisible: got.has(offProjectPayment), surplusHeaderVisible: got.has(surplusPayment),
      surplusOwnApplicationVisible: surplusApps.length, offProjectApplicationVisible: offApps.length });
    expect([...got].sort()).toEqual([...expected].sort());
    expect(got.has(offProjectPayment), 'PE reads a payment applied to ANOTHER project').toBe(false);
    expect(got.has(surplusPayment), 'PE reads a payment carrying an UNAPPLIED balance').toBe(false);
    expect(surplusApps.length, 'PE cannot read its own project\'s application').toBe(1);
    expect(offApps.length, 'PE reads an application to ANOTHER project').toBe(0);
    expect(ownerCount, 'control: the owner reads payments the PE does not').toBeGreaterThan(got.size);
  });

  it('it can record a payment fully applied to its own invoice, and then reads it', async () => {
    const { data, error } = await pe.rpc('record_client_payment', {
      p_contact_id: target!.contact, p_amount: 0.01,
      p_applications: [{ invoice_id: target!.id, amount: 0.01 }], p_method: 'check', p_note: 'S111 Q9 proof',
    });
    expect(error, error?.message).toBeNull();
    created.push(data as string);
    const { data: seen } = await pe.from('client_payments').select('id').eq('id', data as string);
    record('q9Record', { recordedOwn: 1, readsItsHeader: seen?.length ?? 0 });
    expect(seen).toHaveLength(1);
  });

  it('it is REFUSED a payment with an unapplied surplus — and no payment row survives', async () => {
    const before = (await admin.from('client_payments').select('id', { count: 'exact', head: true }).eq('company_id', companyId)).count;
    const { error } = await pe.rpc('record_client_payment', {
      p_contact_id: target!.contact, p_amount: 5,
      p_applications: [{ invoice_id: target!.id, amount: 0.01 }], p_method: 'check', p_note: 'S111 Q9 surplus',
    });
    const after = (await admin.from('client_payments').select('id', { count: 'exact', head: true }).eq('company_id', companyId)).count;
    record('q9RefuseSurplus', { error: error?.message ?? null, rowsBefore: before, rowsAfter: after });
    expect(error?.message ?? '').toMatch(/must apply the whole payment/);
    expect(after).toBe(before);
  });

  it('it is REFUSED an application to an invoice off its projects — and no payment row survives', async () => {
    const before = (await admin.from('client_payments').select('id', { count: 'exact', head: true }).eq('company_id', companyId)).count;
    const { error } = await pe.rpc('record_client_payment', {
      p_contact_id: offTarget!.contact, p_amount: 0.01,
      p_applications: [{ invoice_id: offTarget!.id, amount: 0.01 }], p_method: 'check', p_note: 'S111 Q9 off-project',
    });
    const after = (await admin.from('client_payments').select('id', { count: 'exact', head: true }).eq('company_id', companyId)).count;
    record('q9RefuseOff', { error: error?.message ?? null, rowsBefore: before, rowsAfter: after });
    expect(error?.message ?? '').toMatch(/not on one of your projects/);
    expect(after).toBe(before);
  });
});
