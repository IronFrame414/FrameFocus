/**
 * S114 PART B [RULED Josh 2026-09-28, R3 + Q16–Q18] — exclude a project from
 * QuickBooks. Migration 20262010000000. rebuild-test's Sabal Point carries a
 * qb_realm_id, so qb_enqueue() really queues there (no cron drains rebuild-test;
 * every queue row made here is removed in afterAll).
 *
 * AUTHORITY (FILL-B-3): the flag is a DATABASE policy, not a hidden button.
 *   Owner inserts / re-includes; Admin READS but cannot write; PM, PE cannot
 *   read or write. ⚠️ NO RETURNING on any negative write; tallies by service role.
 * ENTRY GATE: an invoice sent on an excluded project queues NOTHING (no
 *   invoice row, no customer row); the same on a control project queues both.
 * RESOLVER: qb_entity_excluded() per entity type, incl. Q17 (d) — a client
 *   payment is excluded if ANY invoice it covers is on an excluded project.
 * EXIT GATE: queueRowExcluded() — what the worker checks at pickup.
 *
 * ⚠️ Q17 (a)–(e) are BUILT TO RULING, UNPROVEN AGAINST LIVE QUICKBOOKS DATA:
 * production has no connection, no pushed record and no queue (P5). This file
 * proves the database behaviour on rebuild-test; nothing here talks to Intuit.
 *
 *   npx vitest run --config test/live.vitest.config.ts s114-qb-exclusion
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, deleteProjects, sessionFor } from './live-session';
import { queueRowExcluded } from '@/lib/quickbooks/worker';

const OWNER = 'josh+test50@worthprop.com';
const ADMIN = 'josh+qa-admin@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const PE = 'josh+qa-pe@worthprop.com';
const MARKER = 'QBX';

let owner: SupabaseClient;
let adminU: SupabaseClient;
let pm: SupabaseClient;
let pe: SupabaseClient;
let companyId = '';
let ownerMemberId = '';
let peMemberId = '';
let contactId = '';
const proj = { exc: '', inc: '' };
const inv = { exc: '', inc: '', exc2: '' };
let expenseExc = '';
let refundExc = '';
const pay = { mixed: '', clean: '' };

async function sweep() {
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  const ids = (ps ?? []).map((p) => p.id as string);
  if (ids.length) {
    const { data: invs } = await admin.from('invoices').select('id').in('project_id', ids);
    const invIds = (invs ?? []).map((i) => i.id as string);
    const { data: pays } = await admin
      .from('client_payments')
      .select('id')
      .eq('note', `${MARKER} payment`);
    const payIds = (pays ?? []).map((p) => p.id as string);
    const { data: exps } = await admin.from('expenses').select('id').in('project_id', ids);
    const expIds = (exps ?? []).map((e) => e.id as string);
    const { data: refs } = await admin.from('client_refunds').select('id').in('project_id', ids);
    const refIds = (refs ?? []).map((r) => r.id as string);
    const entityIds = [...invIds, ...payIds, ...expIds, ...refIds];
    if (entityIds.length) await admin.from('qb_sync_queue').delete().in('entity_id', entityIds);
    if (payIds.length) {
      await admin.from('client_payment_applications').delete().in('payment_id', payIds);
      await admin.from('client_payments').delete().in('id', payIds);
    }
    if (refIds.length) await admin.from('client_refunds').delete().in('id', refIds);
    if (expIds.length) await admin.from('expenses').delete().in('id', expIds);
    if (invIds.length) await admin.from('invoices').delete().in('id', invIds);
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

async function makeProject(tag: string, seq: number): Promise<string> {
  const { data, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      project_number: `PRJ-QBX-${tag}`,
      name: `${MARKER} ${tag} project`,
      status: 'active',
      project_internal_seq: seq,
    })
    .select('id')
    .single();
  if (error) throw new Error(`project ${tag}: ${error.message}`);
  // The PE is ASSIGNED — so a refusal below is the policy, not a project floor.
  await admin.from('project_assignments').insert({
    company_id: companyId,
    project_id: data!.id,
    member_id: peMemberId,
    role_on_project: 'project_executive',
  });
  return data!.id as string;
}

async function makeInvoice(projectId: string, title: string): Promise<string> {
  const { data, error } = await admin
    .from('invoices')
    .insert({
      company_id: companyId,
      project_id: projectId,
      author_member_id: ownerMemberId,
      title,
    })
    .select('id')
    .single();
  if (error) throw new Error(`invoice ${title}: ${error.message}`);
  return data!.id as string;
}

const liveExclusions = async (projectId: string) => {
  const { count } = await admin
    .from('project_qb_exclusions')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('is_deleted', false);
  return count ?? 0;
};
const queued = async (entityId: string) => {
  const { data } = await admin
    .from('qb_sync_queue')
    .select('entity_type, operation')
    .eq('entity_id', entityId);
  return (data ?? []) as { entity_type: string; operation: string }[];
};
const excluded = async (type: string, id: string) => {
  const { data, error } = await admin.rpc('qb_entity_excluded', {
    p_entity_type: type,
    p_entity_id: id,
  });
  if (error) throw new Error(`qb_entity_excluded: ${error.message}`);
  return data as boolean;
};

beforeAll(async () => {
  assertRebuildTest();
  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .single();
  companyId = prof!.company_id as string;
  const { data: co } = await admin
    .from('companies')
    .select('qb_realm_id')
    .eq('id', companyId)
    .single();
  if (!co?.qb_realm_id)
    throw new Error('fixture company has no qb_realm_id — qb_enqueue would queue nothing');
  [ownerMemberId, peMemberId] = await Promise.all([memberIdOf(OWNER), memberIdOf(PE)]);
  await sweep();

  const { data: c, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId,
      first_name: 'QBX',
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
  const base = (seqRow?.project_internal_seq ?? 0) + 7000;
  proj.exc = await makeProject('EXC', base);
  proj.inc = await makeProject('INC', base + 1);
  inv.exc = await makeInvoice(proj.exc, `${MARKER} exc invoice`);
  inv.exc2 = await makeInvoice(proj.exc, `${MARKER} exc invoice 2`);
  inv.inc = await makeInvoice(proj.inc, `${MARKER} inc invoice`);

  [owner, adminU, pm, pe] = await Promise.all([
    sessionFor(OWNER),
    sessionFor(ADMIN),
    sessionFor(PM),
    sessionFor(PE),
  ]);
}, 180_000);

afterAll(async () => {
  await sweep();
}, 180_000);

describe('S114 PART B — FILL-B-3: the flag is Owner-only IN THE DATABASE', () => {
  it('B0 fixture: nothing excluded yet (non-vacuous)', async () => {
    expect(await liveExclusions(proj.exc)).toBe(0);
    expect(await liveExclusions(proj.inc)).toBe(0);
  });

  it('B1 the ADMIN cannot exclude — no RETURNING, service-role tally 0 → 0', async () => {
    const { error } = await adminU.from('project_qb_exclusions').insert({ project_id: proj.exc });
    expect(error?.message ?? '').toMatch(/row-level security/i);
    expect(await liveExclusions(proj.exc)).toBe(0);
  });

  it('B2 the PM and the (assigned) PROJECT EXECUTIVE cannot exclude either', async () => {
    const a = await pm.from('project_qb_exclusions').insert({ project_id: proj.exc });
    const b = await pe.from('project_qb_exclusions').insert({ project_id: proj.exc });
    expect(a.error?.message ?? '').toMatch(/row-level security/i);
    expect(b.error?.message ?? '').toMatch(/row-level security/i);
    expect(await liveExclusions(proj.exc)).toBe(0);
  });

  it('B3 the OWNER excludes — tally 0 → 1', async () => {
    const { error } = await owner.from('project_qb_exclusions').insert({ project_id: proj.exc });
    expect(error, error?.message).toBeNull();
    expect(await liveExclusions(proj.exc)).toBe(1);
  });

  it('B4 READ: Owner and Admin see it; the PE (assigned) and the PM see NOTHING', async () => {
    const rows = async (c: SupabaseClient) =>
      ((await c.from('project_qb_exclusions').select('id').eq('project_id', proj.exc)).data ?? [])
        .length;
    expect(await rows(owner)).toBe(1);
    expect(await rows(adminU)).toBe(1);
    expect(await rows(pe)).toBe(0);
    expect(await rows(pm)).toBe(0);
  });

  it('B5 the ADMIN cannot re-include (UPDATE is_deleted) — the row stays live', async () => {
    await adminU
      .from('project_qb_exclusions')
      .update({ is_deleted: true })
      .eq('project_id', proj.exc);
    expect(await liveExclusions(proj.exc)).toBe(1);
  });
});

describe('S114 PART B — the ENTRY gate (qb_enqueue / qb_enqueue_job_chain)', () => {
  it('G1 an invoice SENT on the excluded project queues nothing — no invoice row, no customer row', async () => {
    const { error } = await admin.from('invoices').update({ status: 'sent' }).eq('id', inv.exc);
    expect(error, error?.message).toBeNull();
    expect(await queued(inv.exc)).toEqual([]);
    expect(await queued(contactId)).toEqual([]);
  });

  it('G2 CONTROL — the same on the included project queues invoice:create (and its customer)', async () => {
    const { error } = await admin.from('invoices').update({ status: 'sent' }).eq('id', inv.inc);
    expect(error, error?.message).toBeNull();
    expect(await queued(inv.inc)).toEqual([{ entity_type: 'invoice', operation: 'create' }]);
    expect(await queued(contactId)).toEqual([{ entity_type: 'customer', operation: 'create' }]);
  });
});

describe('S114 PART B — qb_entity_excluded, per entity type', () => {
  beforeAll(async () => {
    const { data: e, error: eErr } = await admin
      .from('expenses')
      .insert({
        company_id: companyId,
        project_id: proj.exc,
        author_member_id: ownerMemberId,
        supplier: `${MARKER} vendor`,
        amount: 10,
        expense_date: '2026-09-28',
        cost_category: 'material',
        status: 'pending',
      })
      .select('id')
      .single();
    if (eErr) throw new Error(`expense: ${eErr.message}`);
    expenseExc = e!.id as string;
    const { data: r, error: rErr } = await admin
      .from('client_refunds')
      .insert({
        company_id: companyId,
        contact_id: contactId,
        project_id: proj.exc,
        refund_date: '2026-09-28',
        amount: 1,
        source: 'other',
      })
      .select('id')
      .single();
    if (rErr) throw new Error(`refund: ${rErr.message}`);
    refundExc = r!.id as string;
    for (const k of ['mixed', 'clean'] as const) {
      const { data: p, error: pErr } = await admin
        .from('client_payments')
        .insert({
          company_id: companyId,
          contact_id: contactId,
          payment_date: '2026-09-28',
          amount: 2,
          method: 'check',
          note: `${MARKER} payment`,
        })
        .select('id')
        .single();
      if (pErr) throw new Error(`payment: ${pErr.message}`);
      pay[k] = p!.id as string;
    }
    const apps = [
      { payment_id: pay.mixed, invoice_id: inv.inc, amount: 1 },
      { payment_id: pay.mixed, invoice_id: inv.exc2, amount: 1 },
      { payment_id: pay.clean, invoice_id: inv.inc, amount: 2 },
    ];
    for (const a of apps) {
      const { error } = await admin
        .from('client_payment_applications')
        .insert({ company_id: companyId, ...a });
      if (error) throw new Error(`application: ${error.message}`);
    }
  }, 60_000);

  it('R1 invoice / purchase / refund on the excluded project → true; control invoice → false', async () => {
    expect(await excluded('invoice', inv.exc)).toBe(true);
    expect(await excluded('purchase', expenseExc)).toBe(true);
    expect(await excluded('refund', refundExc)).toBe(true);
    expect(await excluded('invoice', inv.inc)).toBe(false);
  });

  it('R2 Q17 (d): a payment covering an excluded AND an included invoice → true; covering only included → false', async () => {
    expect(await excluded('payment', pay.mixed)).toBe(true);
    expect(await excluded('payment', pay.clean)).toBe(false);
  });

  it('R3 a customer is never excluded by itself (it is per client, not per project)', async () => {
    expect(await excluded('customer', contactId)).toBe(false);
  });

  it('R4 the resolvers are NOT callable by a signed-in user (service_role only)', async () => {
    const { error } = await owner.rpc('qb_entity_excluded', {
      p_entity_type: 'invoice',
      p_entity_id: inv.exc,
    });
    expect(error, 'an authenticated user could call qb_entity_excluded').not.toBeNull();
  });
});

describe('S114 PART B — the EXIT gate (what the worker checks at pickup)', () => {
  it('X1 a row for the excluded project’s payment is refused; the clean one passes', async () => {
    expect(await queueRowExcluded(admin, { entity_type: 'payment', entity_id: pay.mixed })).toBe(
      true
    );
    expect(await queueRowExcluded(admin, { entity_type: 'payment', entity_id: pay.clean })).toBe(
      false
    );
  });
});

describe('S114 PART B — re-including stops excluding (future records only)', () => {
  it('I1 the OWNER re-includes (soft delete); the invoice resolves as included again', async () => {
    const { error } = await owner
      .from('project_qb_exclusions')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('project_id', proj.exc)
      .eq('is_deleted', false);
    expect(error, error?.message).toBeNull();
    expect(await liveExclusions(proj.exc)).toBe(0);
    expect(await excluded('invoice', inv.exc)).toBe(false);
    // (b): the invoice SENT while excluded is NOT queued retroactively.
    expect(await queued(inv.exc)).toEqual([]);
  });
});
