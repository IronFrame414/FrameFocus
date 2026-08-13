import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// S143 — 7D §9 void authority, enforced in the DATABASE.
//
// Migration: 20260923000000_invoice_void_authority.sql
// Ruling:    [Josh, S143] PM cannot void a paid invoice; Owner can, with a
//            warning; a client credit is created. Admin excluded (A1).
//            Both arms closed in one trigger (A4).
// ============================================================================
//
// ⚠️ WHY A LIVE HARNESS AND NOT A UNIT TEST. `canVoidInvoice()` already had 5
// unit tests and they all passed while the defect was live, because the bug
// was never in the pure function — it was in the caller passing a constant,
// and in the DATABASE having no opinion at all. A test that exercises the
// function cannot see either. These probes drive real sessions against real
// policies, which is the only place the hole was visible.
//
// ⚠️ EVERY ROLE ACTION RUNS AS A REAL USER. `admin` (service role) appears
// only to seed and to evaluate counterfactuals OUTSIDE the trigger under test.

const OWNER = 'josh+test50@worthprop.com';
const ADMIN_USER = 'josh+qa-admin@worthprop.com';
const PM = 'josh+pm@worthprop.com';

let ownerC: SupabaseClient;
let adminC: SupabaseClient;
let pmC: SupabaseClient;

let companyId = '';
let projectId = '';
let contactId = '';
/** invoices.author_member_id is NOT NULL and defaults to get_my_member_id(),
 *  which is NULL under the service role — so the fixture must supply it. */
let authorMemberId = '';
const madeInvoices: string[] = [];
const madePayments: string[] = [];

/** A fresh SENT invoice, service-role so its existence never depends on RLS. */
async function makeInvoice(opts: { applied?: number } = {}): Promise<string> {
  const { data: inv } = await admin
    .from('invoices')
    .insert({
      company_id: companyId,
      project_id: projectId,
      title: 'S143 harness fixture',
      author_member_id: authorMemberId,
      status: 'sent',
      issue_date: '2026-08-01',
      billed_total: 1000,
      derived_total: 1000,
      amount_receivable: 1000,
    })
    .select('id')
    .single();
  const invoiceId = (inv as { id: string }).id;
  madeInvoices.push(invoiceId);

  if (opts.applied && opts.applied > 0) {
    const { data: pay } = await admin
      .from('client_payments')
      .insert({
        company_id: companyId,
        contact_id: contactId,
        payment_date: '2026-08-02',
        amount: opts.applied,
        method: 'check',
      })
      .select('id')
      .single();
    const paymentId = (pay as { id: string }).id;
    madePayments.push(paymentId);

    await admin.from('client_payment_applications').insert({
      company_id: companyId,
      payment_id: paymentId,
      invoice_id: invoiceId,
      amount: opts.applied,
    });
  }
  return invoiceId;
}

/** Attempt the void the way a direct API call would — no service layer. */
async function tryVoid(client: SupabaseClient, invoiceId: string) {
  return client
    .from('invoices')
    .update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      void_reason: 'S143 harness',
    })
    .eq('id', invoiceId);
}

async function statusOf(invoiceId: string): Promise<string> {
  const { data } = await admin.from('invoices').select('status').eq('id', invoiceId).single();
  return (data as { status: string }).status;
}

beforeAll(async () => {
  assertRebuildTest();
  [ownerC, adminC, pmC] = (await Promise.all([
    sessionFor(OWNER),
    sessionFor(ADMIN_USER),
    sessionFor(PM),
  ])) as SupabaseClient[];

  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  companyId = (prof as { company_id: string }).company_id;

  const { data: member } = await admin
    .from('company_members')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .limit(1)
    .single();
  authorMemberId = (member as { id: string }).id;

  // A project the PM is ASSIGNED to — otherwise can_view_project() refuses and
  // the probe would pass for the wrong reason (no visibility, not no
  // authority). That distinction is the whole point of the PM cases.
  const { data: assignment } = await admin
    .from('project_assignments')
    .select('project_id, projects!inner(company_id, contact_id, is_deleted)')
    .eq('projects.company_id', companyId)
    .eq('projects.is_deleted', false)
    .limit(1)
    .single();
  projectId = (assignment as unknown as { project_id: string }).project_id;
  contactId = (assignment as unknown as { projects: { contact_id: string } }).projects.contact_id;
});

afterAll(async () => {
  if (madeInvoices.length) {
    await admin.from('client_payment_applications').delete().in('invoice_id', madeInvoices);
    await admin.from('invoices').delete().in('id', madeInvoices);
  }
  if (madePayments.length) await admin.from('client_payments').delete().in('id', madePayments);
});

describe('S143-V0 — the PM really can reach these invoices', () => {
  it('a PM can SELECT and UPDATE the fixture project’s invoices', async () => {
    // NON-VACUITY, and it is load-bearing for every PM case below. If the PM
    // simply could not see the row, the refusals would prove nothing.
    const id = await makeInvoice();
    const { data: readable } = await pmC.from('invoices').select('id').eq('id', id);
    expect(readable, 'PM cannot see the fixture invoice — probe is vacuous').toHaveLength(1);

    // And a harmless UPDATE succeeds, proving invoices_update_authorized
    // genuinely admits this PM. The void refusals below are therefore the
    // trigger talking, not the policy.
    const { error } = await pmC.from('invoices').update({ title: 'PM touched' }).eq('id', id);
    expect(error, 'PM cannot update at all — refusals below would be ambiguous').toBeNull();
    const { data: after } = await admin.from('invoices').select('title').eq('id', id).single();
    expect((after as { title: string }).title).toBe('PM touched');
  });
});

describe('S143-V1 — UNPAID invoice (A4, the arm the ruling did not name)', () => {
  it('Owner may void', async () => {
    const id = await makeInvoice();
    const { error } = await tryVoid(ownerC, id);
    expect(error).toBeNull();
    expect(await statusOf(id)).toBe('voided');
  });

  it('Admin may void', async () => {
    const id = await makeInvoice();
    const { error } = await tryVoid(adminC, id);
    expect(error).toBeNull();
    expect(await statusOf(id)).toBe('voided');
  });

  it('PM is REFUSED BY THE DATABASE, and the invoice survives', async () => {
    const id = await makeInvoice();
    const { error } = await tryVoid(pmC, id);
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/Only Owner or Admin can void/i);
    // Counterfactual OUTSIDE the trigger: the row is untouched.
    expect(await statusOf(id)).toBe('sent');
  });
});

describe('S143-V2 — PAID invoice: OWNER ONLY (the ruling)', () => {
  it('PM is refused', async () => {
    const id = await makeInvoice({ applied: 300 });
    const { error } = await tryVoid(pmC, id);
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/only the Owner can void/i);
    expect(await statusOf(id)).toBe('sent');
  });

  it('ADMIN is refused too — A1', async () => {
    // The half the ruling did not name and the shipped matrix already implied.
    // Admin can void an UNPAID invoice (V1) and cannot void this one, so the
    // refusal is about the payment, not about Admin generally.
    const id = await makeInvoice({ applied: 300 });
    const { error } = await tryVoid(adminC, id);
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/only the Owner can void/i);
    expect(await statusOf(id)).toBe('sent');
  });

  it('Owner may void', async () => {
    const id = await makeInvoice({ applied: 300 });
    const { error } = await tryVoid(ownerC, id);
    expect(error).toBeNull();
    expect(await statusOf(id)).toBe('voided');
  });
});

describe('S143-V3 — the credit effect (A3)', () => {
  it('voiding retires the applications, so the payment becomes client credit', async () => {
    const id = await makeInvoice({ applied: 400 });

    const before = await admin
      .from('client_payment_applications')
      .select('id, amount')
      .eq('invoice_id', id)
      .eq('is_deleted', false);
    expect(before.data, 'fixture has no live application').toHaveLength(1);

    const { error } = await tryVoid(ownerC, id);
    expect(error).toBeNull();

    const after = await admin
      .from('client_payment_applications')
      .select('id, is_deleted, deleted_at')
      .eq('invoice_id', id);
    expect(after.data).toHaveLength(1);
    expect((after.data as { is_deleted: boolean }[])[0].is_deleted).toBe(true);
    expect((after.data as { deleted_at: string | null }[])[0].deleted_at).toBeTruthy();

    // The credit is DERIVED, so retiring the application is the whole effect:
    // payment.amount - Σ live applications = the client's credit.
    const paymentId = madePayments[madePayments.length - 1];
    const { data: payment } = await admin
      .from('client_payments')
      .select('amount')
      .eq('id', paymentId)
      .single();
    const { data: liveApps } = await admin
      .from('client_payment_applications')
      .select('amount')
      .eq('payment_id', paymentId)
      .eq('is_deleted', false);
    const applied = (liveApps ?? []).reduce((s, a) => s + Number(a.amount), 0);
    const credit = Number((payment as { amount: number }).amount) - applied;
    expect(credit).toBe(400);
  });

  it('the voided invoice is NOT flipped back to sent by the settlement revert', async () => {
    // Retiring an application fires client_payment_applications_revert_settlement
    // -> revert_invoice_settlement(), which un-settles a 'paid' invoice. It must
    // early-return here: a voided invoice is frozen forever (7D §9).
    const id = await makeInvoice({ applied: 1000 });
    await admin.from('invoices').update({ status: 'paid' }).eq('id', id);

    const { error } = await tryVoid(ownerC, id);
    expect(error).toBeNull();
    expect(await statusOf(id), 'a voided invoice was resurrected').toBe('voided');
  });
});

describe('S143-V4 — the trigger is narrow', () => {
  it('an ordinary non-void update by a PM still works', async () => {
    // The guard must fire ONLY on a transition into voided. A PM editing a
    // draft is legitimate and must be unaffected — the reason the fix is not
    // a narrowing of invoices_update_authorized.
    const id = await makeInvoice();
    const { error } = await pmC.from('invoices').update({ notes: 'PM note' }).eq('id', id);
    expect(error).toBeNull();
    const { data } = await admin.from('invoices').select('notes').eq('id', id).single();
    expect((data as { notes: string }).notes).toBe('PM note');
  });

  it('a service-role void is not role-gated', async () => {
    // auth.uid() IS NULL — a background job has no role. The enforce_expenses_
    // column_scope precedent.
    const id = await makeInvoice({ applied: 100 });
    const { error } = await admin
      .from('invoices')
      .update({ status: 'voided', voided_at: new Date().toISOString(), void_reason: 'system' })
      .eq('id', id);
    expect(error).toBeNull();
    expect(await statusOf(id)).toBe('voided');
  });
});
