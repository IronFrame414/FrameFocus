/**
 * S97CT-7E — automated click-test for Module 7E1 (Payments & AR).
 *
 * Built to 7D's standard (S97-7D-build.md §4a, commit 0a68ad9): every checkable
 * step is driven through the REAL shipped service functions, against REAL rows
 * on rebuild-test, under GENUINE sessions minted with generateLink + verifyOtp —
 * so RLS, the get_my_company_id()/auth.uid() column defaults, the invoice
 * numbering trigger and every immutability trigger are live.
 *
 * The ONLY thing stubbed is the Supabase client FACTORY (`@/lib/supabase-browser`
 * and `@/lib/supabase-server`), because those wrap next/headers and the browser
 * cookie store and cannot run in node. The client handed back is a real
 * supabase-js client carrying a real user JWT. No service function is mocked, no
 * hand-written SQL stands in for the service layer, and the anon key is used for
 * every assertion so RLS applies exactly as it does in the app.
 *
 * NOT part of the committed vitest suite: the filename ends `.live.ts`, which does
 * not match the `**\/*.{test,spec}.{ts,tsx}` include in vitest.config.ts, so CI
 * never runs it. Run it deliberately:
 *
 *   npx vitest run --config test/s97ct-7e.vitest.config.ts
 *
 * GATE: refuses to run unless the linked project is rebuild-test.
 */
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// S135 — see the call site. This file predates live-session.ts and builds its
// own service-role client; only the identity-adoption helper is borrowed.
import { adoptSignupProfile, upsertContact } from './live-session';

const REQUIRED_PROJECT_REF = 'nmyphyhmfttxkdoposvf';
const MARKER = 'S97CT7E';

// ── the injected client ─────────────────────────────────────────────────────
const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));

vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

// REAL shipped service functions — 7E ...
import {
  applyCredit,
  approveRefund,
  createRefund,
  recordPayment,
  recordSignOffAndGenerateRelease,
  unapplyPayment,
  voidPayment,
} from '@/lib/services/payments-client';
import {
  getClientCreditBalance,
  getClientPayments,
  getInvoiceRemaining,
  getOpenInvoices,
  getProjectAging,
  getProjectPayments,
  getProjectRetainageHeld,
  getRetainageRelease,
} from '@/lib/services/payments';
// ... and 7D, used to build the invoices 7E is paid against.
import {
  addFixedLine,
  createInvoice,
  markInvoiceSent,
  recalculateInvoiceTotals,
} from '@/lib/services/invoices-client';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TZ = 'America/New_York';

const admin = createSupabaseClient(URL_, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** A genuine end-user session: magic link minted by the admin API, redeemed on
 *  an anon client. The resulting JWT is what RLS sees. */
async function sessionFor(email: string): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error(`generateLink(${email}): ${error.message}`);
  const hashed = data.properties?.hashed_token;
  if (!hashed) throw new Error(`generateLink(${email}): no hashed_token`);

  const client = createSupabaseClient(URL_, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: sess, error: vErr } = await client.auth.verifyOtp({
    token_hash: hashed,
    type: 'email',
  });
  if (vErr) throw new Error(`verifyOtp(${email}): ${vErr.message}`);
  if (!sess.session) throw new Error(`verifyOtp(${email}): no session`);
  return client;
}

// ── identities ──────────────────────────────────────────────────────────────
const OWNER_EMAIL = 'josh+test50@worthprop.com';
const PM_EMAIL = 'josh+pm@worthprop.com';
const ADMIN_EMAIL = `josh+${MARKER.toLowerCase()}-admin@worthprop.com`;
const FOREMAN_EMAIL = `josh+${MARKER.toLowerCase()}-foreman@worthprop.com`;

let ownerClient: SupabaseClient;
let adminClient: SupabaseClient;
let pmClient: SupabaseClient;
let foremanClient: SupabaseClient;

const as = (c: SupabaseClient) => {
  state.client = c;
};

// ── fixture ids ─────────────────────────────────────────────────────────────
let companyId: string;
let ownerMemberId: string;
let adminMemberId: string;
let pmMemberId: string;
let foremanMemberId: string;
let adminUserId: string;
let foremanUserId: string;
let contactId: string;
let projectId: string;
const inv: Record<string, string> = {};
const pay: Record<string, string> = {};
let refundAdminId: string;
let releaseInvoiceId: string | undefined;
let seqBefore: number;
/** Company A's invoice count BEFORE this run — the teardown's rewind guard. */
let invoicesBefore: number;

/** Create a sent invoice with one fixed line, through 7D's own services. */
async function sentInvoice(
  key: string,
  amount: number,
  retainagePercent: number | null
): Promise<void> {
  const created = await createInvoice({
    projectId,
    title: `${MARKER} ${key}`,
    retainagePercent,
  });
  if (!created.success || !created.id) throw new Error(`createInvoice ${key}: ${created.error}`);
  inv[key] = created.id;

  const line = await addFixedLine({
    invoiceId: created.id,
    description: `${MARKER} ${key} work`,
    amount,
  });
  if (!line.success) throw new Error(`addFixedLine ${key}: ${line.error}`);

  const recalc = await recalculateInvoiceTotals(created.id, { contractType: 'fixed_price' });
  if (!recalc.success) throw new Error(`recalc ${key}: ${recalc.error}`);

  const sent = await markInvoiceSent(created.id, TZ);
  if (!sent.success) throw new Error(`markInvoiceSent ${key}: ${sent.error}`);
}

async function invoiceRow(id: string) {
  const { data } = await admin
    .from('invoices')
    .select('id, invoice_number, status, billed_total, retainage_withheld, amount_receivable, is_final, is_deleted')
    .eq('id', id)
    .single();
  return data!;
}

beforeAll(async () => {
  // ── GATE ──────────────────────────────────────────────────────────────────
  if (!URL_.includes(REQUIRED_PROJECT_REF)) {
    throw new Error(
      `REFUSING TO RUN: linked project is not ${REQUIRED_PROJECT_REF}. URL=${URL_}`
    );
  }

  ownerClient = await sessionFor(OWNER_EMAIL);
  pmClient = await sessionFor(PM_EMAIL);

  const { data: ownerProfile } = await admin
    .from('profiles')
    .select('id, company_id')
    .eq('email', OWNER_EMAIL)
    .single();
  companyId = ownerProfile!.company_id;

  const { data: company } = await admin
    .from('companies')
    .select('invoice_number_sequence')
    .eq('id', companyId)
    .single();
  seqBefore = company!.invoice_number_sequence;

  // Baseline rather than a magic number: rebuild-test now also carries the
  // persistent isolation fixtures (scripts/seed-test-identities.mjs), so the
  // count is no longer "Josh's 2".
  const { count } = await admin
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);
  invoicesBefore = count ?? 0;

  const { data: ownerMember } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', ownerProfile!.id)
    .single();
  ownerMemberId = ownerMember!.id;

  const { data: pmProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', PM_EMAIL)
    .single();
  const { data: pmMember } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', pmProfile!.id)
    .single();
  pmMemberId = pmMember!.id;

  // ── mint the two identities rebuild-test lacks (GATED.md Gate 2 / #103) ────
  for (const [email, role] of [
    [ADMIN_EMAIL, 'admin'],
    [FOREMAN_EMAIL, 'foreman'],
  ] as const) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: `${MARKER}-${Math.abs(email.length * 7919)}-Aa!`,
    });
    if (error) throw new Error(`createUser(${email}): ${error.message}`);
    const userId = created.user.id;

    // ⚠️ ADOPTED, NOT INSERTED [S135].
    //
    // _Superseded, quoted rather than rewritten:_
    // ```
    // const { data: profile, error: pErr } = await admin
    //   .from('profiles').insert({ user_id: userId, company_id: companyId, ... })
    // ```
    //
    // `20260914000000` brought the `auth.users` trigger into version control.
    // It has always existed on production and never existed here, so this file
    // could INSERT a profile by hand; now the trigger inserts one first and
    // `profiles_user_id_key` refuses the second. `adoptSignupProfile()`
    // repoints the trigger's profile into this company and removes the tenant
    // the owner path created along with it.
    const { profileId, memberId } = await adoptSignupProfile(userId, {
      companyId,
      email,
      role,
      firstName: MARKER,
      lastName: role,
    });
    const profile = { id: profileId };
    if (!memberId) throw new Error(`member(${email}): profiles_create_member did not run`);
    const member = { id: memberId };
    void profile;

    if (role === 'admin') {
      adminUserId = userId;
      adminMemberId = member.id;
    } else {
      foremanUserId = userId;
      foremanMemberId = member.id;
    }
  }

  adminClient = await sessionFor(ADMIN_EMAIL);
  foremanClient = await sessionFor(FOREMAN_EMAIL);

  // ── fixtures, as Owner, through the app's own defaults ────────────────────
  as(ownerClient);

  const contact = await upsertContact({
    contact_type: 'client',
    first_name: MARKER,
    last_name: 'Client',
    email: `${MARKER.toLowerCase()}@example.invalid`,
  }, ownerClient);
  contactId = contact.id;

  const { data: project, error: prErr } = await ownerClient
    .from('projects')
    .insert({
      name: `${MARKER} — Payments harness`,
      contact_id: contactId,
      project_type: 'fixed_price',
      retainage_percent: 10,
    })
    .select('id')
    .single();
  if (prErr) throw new Error(`project: ${prErr.message}`);
  projectId = project.id;

  // RULING 2 step 4: the contract value lives in project_financials now. The
  // Owner session can write it; RLS on the new table is Owner/Admin.
  const { error: pfErr } = await ownerClient
    .from('project_financials')
    .insert({ project_id: projectId, contract_value: 100000 });
  if (pfErr) throw new Error(`project financials: ${pfErr.message}`);

  // The PM must be ASSIGNED to read the job at all (can_view_project).
  const { error: aErr } = await ownerClient
    .from('project_assignments')
    .insert({ project_id: projectId, member_id: pmMemberId, role_on_project: 'project_manager' });
  if (aErr) throw new Error(`assignment: ${aErr.message}`);

  // §9-A's invoice, plus the others each scenario needs.
  await sentInvoice('A', 18000, 10);
  await sentInvoice('B', 4000, null);
  await sentInvoice('C', 1000, null);
  await sentInvoice('D', 2500, null);
  await sentInvoice('E', 500, null);

  // A DRAFT, deliberately never sent — the "cannot pay a draft" guard.
  const draft = await createInvoice({ projectId, title: `${MARKER} F draft`, retainagePercent: null });
  if (!draft.success || !draft.id) throw new Error(`draft: ${draft.error}`);
  inv.F = draft.id;
  await addFixedLine({ invoiceId: draft.id, description: `${MARKER} F work`, amount: 750 });
  await recalculateInvoiceTotals(draft.id, { contractType: 'fixed_price' });
}, 180_000);

describe('S97CT-7E — 7E1 payments, live', () => {
  // ── fixtures / §9-A retainage math ────────────────────────────────────────
  it('1. §9-A — $18,000 at 10% retainage bills 18000, withholds 1800, receivable 16200', async () => {
    const a = await invoiceRow(inv.A);
    expect(Number(a.billed_total)).toBe(18000);
    expect(Number(a.retainage_withheld)).toBe(1800);
    expect(Number(a.amount_receivable)).toBe(16200);
    expect(a.status).toBe('sent');
    expect(a.invoice_number).not.toBeNull();
  });

  it('2. §6 — retainage held is 1800 and sits in NO aging bucket', async () => {
    as(ownerClient);
    const held = await getProjectRetainageHeld(projectId);
    expect(held).toBe(1800);

    const aging = await getProjectAging(projectId, '2026-08-02');
    const bucketSum =
      aging.buckets.current + aging.buckets.d31_60 + aging.buckets.d61_90 + aging.buckets.d90_plus;
    // 16200 + 4000 + 1000 + 2500 + 500
    expect(aging.totalOutstanding).toBe(24200);
    expect(bucketSum).toBe(24200);
    expect(aging.retainageHeld).toBe(1800);
    // the load-bearing rule: withheld money is not in the outstanding total
    expect(aging.totalOutstanding).not.toBe(24200 + 1800);
  });

  // ── partial payment ───────────────────────────────────────────────────────
  it('3. §9-A — a $10,000 payment leaves the invoice open with $6,200 remaining', async () => {
    as(ownerClient);
    const r = await recordPayment({
      contactId,
      amount: 10000,
      applications: [{ invoiceId: inv.A, amount: 10000 }],
      method: 'check',
      note: `${MARKER} partial`,
    });
    expect(r.success).toBe(true);
    pay.P1 = r.id!;

    expect((await invoiceRow(inv.A)).status).toBe('sent');
    expect(await getInvoiceRemaining(inv.A)).toBe(6200);
  });

  it('4. P-4 — an application over the remaining is refused, and nothing is left behind', async () => {
    as(ownerClient);
    const { count: before } = await admin
      .from('client_payments')
      .select('id', { count: 'exact', head: true })
      .eq('contact_id', contactId);

    const r = await recordPayment({
      contactId,
      amount: 9000,
      applications: [{ invoiceId: inv.A, amount: 9000 }],
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('exceeds');
    expect(r.error).toContain('6200.00');
    expect(r.error).toContain('surplus stays on the payment as a credit');

    // the RPC raised, so the whole statement rolled back — no orphan payment
    const { count: after } = await admin
      .from('client_payments')
      .select('id', { count: 'exact', head: true })
      .eq('contact_id', contactId);
    expect(after).toBe(before);
    expect(await getInvoiceRemaining(inv.A)).toBe(6200);
  });

  // ── one check across two invoices ─────────────────────────────────────────
  it('5. §9-B — one $10,200 check settles TWO invoices, via two applications', async () => {
    as(ownerClient);
    const r = await recordPayment({
      contactId,
      amount: 10200,
      applications: [
        { invoiceId: inv.A, amount: 6200 },
        { invoiceId: inv.B, amount: 4000 },
      ],
      method: 'check',
    });
    expect(r.success).toBe(true);
    pay.P2 = r.id!;

    const { data: apps } = await admin
      .from('client_payment_applications')
      .select('invoice_id, amount')
      .eq('payment_id', pay.P2)
      .eq('is_deleted', false);
    expect(apps).toHaveLength(2);

    expect((await invoiceRow(inv.A)).status).toBe('paid');
    expect((await invoiceRow(inv.B)).status).toBe('paid');
    expect(await getInvoiceRemaining(inv.A)).toBe(0);
    expect(await getInvoiceRemaining(inv.B)).toBe(0);
  });

  // ── overpayment → credit → applied later ──────────────────────────────────
  it('6. §9-C — $1,300 against a $1,000 invoice leaves $300 as credit on account', async () => {
    as(ownerClient);
    const r = await recordPayment({
      contactId,
      amount: 1300,
      applications: [{ invoiceId: inv.C, amount: 1000 }],
    });
    expect(r.success).toBe(true);
    pay.P3 = r.id!;

    expect((await invoiceRow(inv.C)).status).toBe('paid');
    expect(await getClientCreditBalance(contactId)).toBe(300);

    const payments = await getClientPayments(contactId);
    expect(payments.find((p) => p.id === pay.P3)!.creditAvailable).toBe(300);
  });

  it('7. §3 — the credit is NEVER auto-applied', async () => {
    as(ownerClient);
    expect(await getInvoiceRemaining(inv.D)).toBe(2500);
  });

  it('8. §3 — applying the credit later reduces the chosen invoice and clears the balance', async () => {
    as(ownerClient);
    const r = await applyCredit(pay.P3, inv.D, 300);
    expect(r.success).toBe(true);
    expect(await getInvoiceRemaining(inv.D)).toBe(2200);
    expect(await getClientCreditBalance(contactId)).toBe(0);
  });

  it('9. §3 — a credit that is spent cannot be applied again', async () => {
    as(ownerClient);
    const r = await applyCredit(pay.P3, inv.D, 1);
    expect(r.success).toBe(false);
    expect(r.error).toContain('remains as credit');
  });

  it('10. P-4 — a settled invoice takes no further payment', async () => {
    as(ownerClient);
    const r = await recordPayment({
      contactId,
      amount: 50,
      applications: [{ invoiceId: inv.C, amount: 50 }],
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('exceeds');
  });

  // ── void / soft-delete with deletion_reason ───────────────────────────────
  it('11. §2 — a removal REQUIRES a reason', async () => {
    as(ownerClient);
    const r0 = await recordPayment({
      contactId,
      amount: 500,
      applications: [{ invoiceId: inv.E, amount: 500 }],
    });
    expect(r0.success).toBe(true);
    pay.P4 = r0.id!;
    expect((await invoiceRow(inv.E)).status).toBe('paid');

    const blank = await voidPayment(pay.P4, '   ');
    expect(blank.success).toBe(false);
    expect(blank.error).toBe('A reason is required to remove a recorded payment.');
  });

  it('12. §2 — removal stores deletion_reason, soft-deletes the applications, reopens the invoice', async () => {
    as(ownerClient);
    const reason = `${MARKER} — wrong amount keyed`;
    const r = await voidPayment(pay.P4, reason);
    expect(r.success).toBe(true);

    const { data: row } = await admin
      .from('client_payments')
      .select('is_deleted, deleted_at, deletion_reason, note, amount')
      .eq('id', pay.P4)
      .single();
    expect(row!.is_deleted).toBe(true);
    expect(row!.deletion_reason).toBe(reason);
    expect(row!.deleted_at).not.toBeNull();
    // the reason did NOT go into the frozen `note` column (the S97 defect)
    expect(row!.note).toBeNull();

    const { data: apps } = await admin
      .from('client_payment_applications')
      .select('is_deleted')
      .eq('payment_id', pay.P4);
    expect(apps!.every((a) => a.is_deleted)).toBe(true);

    // derivation is self-correcting: the invoice owes its money again
    expect(await getInvoiceRemaining(inv.E)).toBe(500);
    expect(await getClientCreditBalance(contactId)).toBe(0);
  });

  it('13. §2 — the reopened invoice is offered again, so remove-and-re-enter actually works', async () => {
    as(ownerClient);
    // P-2's revert half (20260805000000): the settled invoice goes back to
    // `sent` the moment its last live application is withdrawn.
    expect((await invoiceRow(inv.E)).status).toBe('sent');
    const open = await getOpenInvoices(projectId);
    expect(open.map((o) => o.id)).toContain(inv.E);
    expect(open.find((o) => o.id === inv.E)!.remaining).toBe(500);
  });

  it('13a. §2 — and the corrected payment can actually be re-entered', async () => {
    as(ownerClient);
    const r = await recordPayment({
      contactId,
      amount: 500,
      applications: [{ invoiceId: inv.E, amount: 500 }],
      note: `${MARKER} re-entered after correction`,
    });
    expect(r.success).toBe(true);
    pay.P5 = r.id!;
    // and it settles again, so the whole loop closes
    expect((await invoiceRow(inv.E)).status).toBe('paid');
    expect(await getInvoiceRemaining(inv.E)).toBe(0);
  });

  it('13b. P-2 — UNAPPLYING an application reverts the invoice the same way', async () => {
    as(ownerClient);
    const { data: app } = await admin
      .from('client_payment_applications')
      .select('id')
      .eq('payment_id', pay.P5)
      .eq('is_deleted', false)
      .single();

    const r = await unapplyPayment(app!.id);
    expect(r.success).toBe(true);

    // status reverted, the debt is back, and the money returned to credit
    expect((await invoiceRow(inv.E)).status).toBe('sent');
    expect(await getInvoiceRemaining(inv.E)).toBe(500);
    expect(await getClientCreditBalance(contactId)).toBe(500);
    expect((await getOpenInvoices(projectId)).map((o) => o.id)).toContain(inv.E);
  });

  it('13c. P-2 — a PARTIAL withdrawal reverts too, and re-settling still works', async () => {
    as(ownerClient);
    // put the credit back on the invoice, settling it again
    expect((await applyCredit(pay.P5, inv.E, 500)).success).toBe(true);
    expect((await invoiceRow(inv.E)).status).toBe('paid');

    // now remove the whole payment: both its applications go, invoice reopens
    const r = await voidPayment(pay.P5, `${MARKER} — second correction`);
    expect(r.success).toBe(true);
    expect((await invoiceRow(inv.E)).status).toBe('sent');
    expect(await getInvoiceRemaining(inv.E)).toBe(500);
    // the withdrawn payment takes its own credit with it
    expect(await getClientCreditBalance(contactId)).toBe(0);
  });

  it('13d. §9 — a VOIDED invoice is never revived by the revert path', async () => {
    as(ownerClient);
    // settle a fresh invoice, then void it, then withdraw the payment
    const r = await recordPayment({
      contactId,
      amount: 2200,
      applications: [{ invoiceId: inv.D, amount: 2200 }],
    });
    expect(r.success).toBe(true);
    expect((await invoiceRow(inv.D)).status).toBe('paid');

    // void it directly — 7D's own path needs a reason and a member
    const { error: voidErr } = await ownerClient
      .from('invoices')
      .update({ status: 'voided', void_reason: `${MARKER} void`, voided_at: new Date().toISOString() })
      .eq('id', inv.D);
    expect(voidErr).toBeNull();
    expect((await invoiceRow(inv.D)).status).toBe('voided');

    // withdrawing the payment must NOT resurrect it
    expect((await voidPayment(r.id!, `${MARKER} — after void`)).success).toBe(true);
    expect((await invoiceRow(inv.D)).status).toBe('voided');
  });

  // ── immutability ──────────────────────────────────────────────────────────
  it('14. §2 — a recorded payment is immutable', async () => {
    const { error } = await ownerClient
      .from('client_payments')
      .update({ amount: 1 })
      .eq('id', pay.P1);
    expect(error).not.toBeNull();
    expect(error!.message).toContain(
      'A recorded payment is immutable — soft-delete and re-enter to correct it.'
    );
  });

  it('15. §2 — a payment cannot land on a DRAFT invoice', async () => {
    as(ownerClient);
    const r = await recordPayment({
      contactId,
      amount: 750,
      applications: [{ invoiceId: inv.F, amount: 750 }],
    });
    expect(r.success).toBe(false);
    // case-insensitive: the RPC raises lowercase, friendlyPaymentError() rewrites
    // it to a capitalised sentence for the UI. Either is the same refusal.
    expect(r.error).toMatch(/only a sent invoice can take a payment/i);
  });

  // ── §4.1 retainage release ────────────────────────────────────────────────
  it('16. §4.1 — the sign-off generates a DRAFT release invoice for exactly the held amount', async () => {
    as(ownerClient);
    const held = await getProjectRetainageHeld(projectId);
    expect(held).toBe(1800);

    const r = await recordSignOffAndGenerateRelease({
      projectId,
      signedOffOn: '2026-08-02',
      memberId: ownerMemberId,
      amount: held,
      lienReleaseWarned: true,
      title: `${MARKER} retainage release`,
    });
    expect(r.success).toBe(true);
    releaseInvoiceId = r.id;

    const rel = await invoiceRow(r.id!);
    expect(rel.status).toBe('draft');
    expect(rel.invoice_number).toBeNull(); // numbered only at send (7D §10)
    expect(Number(rel.billed_total)).toBe(1800);
    expect(Number(rel.retainage_withheld)).toBe(0); // holds nothing back itself
    expect(Number(rel.amount_receivable)).toBe(1800);
    expect(rel.is_final).toBe(true);
  });

  it('17. §4.1 — the release is recorded with its sign-off date and linked invoice', async () => {
    as(ownerClient);
    const rel = await getRetainageRelease(projectId);
    expect(rel).not.toBeNull();
    expect(rel!.signed_off_on).toBe('2026-08-02');
    expect(Number(rel!.amount)).toBe(1800);
    expect(rel!.release_invoice_id).toBe(releaseInvoiceId);
    expect(rel!.lien_release_warned).toBe(true);
  });

  it('18. §4.1 — a second release on the same job is refused', async () => {
    as(ownerClient);
    const r = await recordSignOffAndGenerateRelease({
      projectId,
      signedOffOn: '2026-08-02',
      memberId: ownerMemberId,
      amount: 1800,
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('A retainage release has already been recorded for this job.');
  });

  // ── §5 refunds, exercised AS ADMIN ────────────────────────────────────────
  it('19. §5 — an ADMIN-initiated refund waits for Owner approval', async () => {
    as(adminClient);
    const r = await createRefund({
      contactId,
      amount: 300,
      refundDate: '2026-08-02',
      source: 'overpayment',
      projectId,
      role: 'admin',
      memberId: adminMemberId,
      reason: `${MARKER} admin-initiated`,
    });
    expect(r.success).toBe(true);
    refundAdminId = r.id!;

    const { data } = await admin
      .from('client_refunds')
      .select('status, approved_by, approved_at')
      .eq('id', refundAdminId)
      .single();
    expect(data!.status).toBe('pending_approval');
    expect(data!.approved_by).toBeNull();
    expect(data!.approved_at).toBeNull();
  });

  it('20. §5 — the Admin cannot approve their own refund', async () => {
    as(adminClient);
    const r = await approveRefund(refundAdminId, adminMemberId, 'admin');
    expect(r.success).toBe(false);
    expect(r.error).toBe('Only the Owner can approve a refund.');

    const { data } = await admin
      .from('client_refunds')
      .select('status')
      .eq('id', refundAdminId)
      .single();
    expect(data!.status).toBe('pending_approval');
  });

  it('21. §5 — the Owner approves it, and the approval is stamped', async () => {
    as(ownerClient);
    const r = await approveRefund(refundAdminId, ownerMemberId, 'owner');
    expect(r.success).toBe(true);

    const { data } = await admin
      .from('client_refunds')
      .select('status, approved_by, approved_at')
      .eq('id', refundAdminId)
      .single();
    expect(data!.status).toBe('approved');
    expect(data!.approved_by).toBe(ownerMemberId);
    expect(data!.approved_at).not.toBeNull();
  });

  it('22. §5 — an OWNER-initiated refund is approved on creation', async () => {
    as(ownerClient);
    const r = await createRefund({
      contactId,
      amount: 25,
      refundDate: '2026-08-02',
      source: 'other',
      projectId,
      role: 'owner',
      memberId: ownerMemberId,
      reason: `${MARKER} owner-initiated`,
    });
    expect(r.success).toBe(true);

    const { data } = await admin
      .from('client_refunds')
      .select('status, approved_by')
      .eq('id', r.id!)
      .single();
    expect(data!.status).toBe('approved');
    expect(data!.approved_by).toBe(ownerMemberId);
  });

  // ── PM gates ──────────────────────────────────────────────────────────────
  it('23. [Fix 4] P-3 SUPERSEDED — a PM reads NONE of the job payments (Owner/Admin)', async () => {
    // Payments are the client's cash position — an AGGREGATE, now Owner/Admin.
    // Counterfactual first, so 0 for the PM is the floor working and not an
    // empty job: the Owner reads the payments this suite recorded.
    as(ownerClient);
    const ownerSees = await getProjectPayments(projectId);
    expect(ownerSees.length, 'no payments exist — the PM probe would be vacuous').toBeGreaterThan(0);

    as(pmClient);
    const pmSees = await getProjectPayments(projectId);
    expect(pmSees.length, 'a PM still reads the job payments after the floor').toBe(0);
  });

  it('24. §8 — a PM cannot RECORD a payment', async () => {
    as(pmClient);
    const r = await recordPayment({
      contactId,
      amount: 100,
      applications: [{ invoiceId: inv.D, amount: 100 }],
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('Only an Owner or Admin can record a payment received.');
  });

  it('25. §3 — a PM cannot apply a credit', async () => {
    as(pmClient);
    const r = await applyCredit(pay.P3, inv.D, 1);
    expect(r.success).toBe(false);
    expect(r.error).toContain('Only an Owner or Admin');
  });

  it('26. §5 — refunds are invisible to a PM (RLS), and they cannot issue one', async () => {
    as(pmClient);
    const { data } = await pmClient.from('client_refunds').select('id');
    expect(data).toHaveLength(0);

    const r = await createRefund({
      contactId,
      amount: 10,
      refundDate: '2026-08-02',
      source: 'other',
      role: 'project_manager',
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('Only an Owner or Admin can issue a refund.');
  });

  it('27. §8 — a PM cannot remove a recorded payment (RLS blocks the write)', async () => {
    as(pmClient);
    await voidPayment(pay.P1, `${MARKER} pm attempt`);

    // RLS makes the UPDATE match zero rows rather than error — so verify the
    // row is genuinely untouched, read back with the service role.
    const { data } = await admin
      .from('client_payments')
      .select('is_deleted, deletion_reason')
      .eq('id', pay.P1)
      .single();
    expect(data!.is_deleted).toBe(false);
    expect(data!.deletion_reason).toBeNull();
  });

  // ── Foreman gates ─────────────────────────────────────────────────────────
  it('28. §8 — a Foreman sees NO payments at all (RLS)', async () => {
    as(foremanClient);
    const { data } = await foremanClient.from('client_payments').select('id');
    expect(data).toHaveLength(0);
  });

  it('29. §8 — a Foreman sees no applications and no retainage releases', async () => {
    as(foremanClient);
    const { data: apps } = await foremanClient.from('client_payment_applications').select('id');
    expect(apps).toHaveLength(0);
    const { data: rel } = await foremanClient.from('retainage_releases').select('id');
    expect(rel).toHaveLength(0);
  });

  it('30. §8 — a Foreman cannot record a payment', async () => {
    as(foremanClient);
    const r = await recordPayment({
      contactId,
      amount: 100,
      applications: [{ invoiceId: inv.D, amount: 100 }],
    });
    expect(r.success).toBe(false);
    expect(r.error).toContain('Only an Owner or Admin can record a payment received.');
  });
});

// ── teardown ────────────────────────────────────────────────────────────────
//
// 7D's harness silently accumulated five runs' fixtures because it never checked
// its delete errors (S97-7D-build.md §4a). Every delete here is checked and the
// final state is dumped.
//
// THE TRAP IS DELETE ORDER, and 7E made it worse. Three FKs reference invoices
// with NO `ON DELETE` action, so each one blocks deleting an invoice until its
// own rows are gone:
//   - invoice_lines.source_deposit_invoice_id          (7D — the one that bit 7D)
//   - client_payment_applications.invoice_id           (7E — NEW)
//   - retainage_releases.release_invoice_id            (7E — NEW)
// Hence: 7E rows first, invoices second, and let the lines CASCADE.
//
// Nothing in the app ever hard-deletes an invoice — drafts soft-delete and voided
// invoices are retained forever — so none of this is a product defect. It is only
// ever an obstacle to a teardown or data-reset script.
afterAll(async () => {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
    return error;
  };

  const { data: invoices } = projectId
    ? await admin.from('invoices').select('id').eq('project_id', projectId)
    : { data: [] };
  const invoiceIds = (invoices ?? []).map((i) => i.id);
  const NONE = ['00000000-0000-0000-0000-000000000000'];

  // 1. 7E rows first — they reference the invoices.
  check(
    'applications',
    (await admin
      .from('client_payment_applications')
      .delete()
      .in('invoice_id', invoiceIds.length ? invoiceIds : NONE)).error
  );
  if (contactId) {
    check('payments', (await admin.from('client_payments').delete().eq('contact_id', contactId)).error);
    check('refunds', (await admin.from('client_refunds').delete().eq('contact_id', contactId)).error);
  }
  if (projectId) {
    check('releases', (await admin.from('retainage_releases').delete().eq('project_id', projectId)).error);
  }

  // 2. Invoices. ORDER IS THE WHOLE TRAP — see the note at the top of this block.
  //    Delete the INVOICE and let `invoice_lines_invoice_id_fkey ON DELETE CASCADE`
  //    take the lines with it. Do NOT delete the lines first: the
  //    `invoice_lines_parent_open` trigger fires on DELETE and refuses while the
  //    parent is still there and sent. It early-returns when the parent is
  //    already gone, which is exactly what the cascade produces — so the cascade
  //    path needs no trigger stood down and no elevated privilege.
  if (invoiceIds.length) {
    check('invoices', (await admin.from('invoices').delete().in('id', invoiceIds)).error);
  }

  // 3. Project, assignments, contact.
  if (projectId) {
    check(
      'assignments',
      (await admin.from('project_assignments').delete().eq('project_id', projectId)).error
    );
    check('project', (await admin.from('projects').delete().eq('id', projectId)).error);
  }
  if (contactId) {
    check('contact', (await admin.from('contacts').delete().eq('id', contactId)).error);
  }

  // 4. The two minted identities. Looked up BY EMAIL, not by a captured id, so a
  //    half-finished setup still cleans up after itself.
  for (const email of [ADMIN_EMAIL, FOREMAN_EMAIL]) {
    const { data: prof } = await admin
      .from('profiles')
      .select('id, user_id')
      .eq('email', email)
      .maybeSingle();
    if (prof) {
      check(`${email}-member`, (await admin.from('company_members').delete().eq('profile_id', prof.id)).error);
      check(`${email}-profile`, (await admin.from('profiles').delete().eq('id', prof.id)).error);
      if (prof.user_id) check(`${email}-user`, (await admin.auth.admin.deleteUser(prof.user_id)).error);
    }
  }
  void adminUserId;
  void foremanUserId;

  // 5. Rewind the invoice number sequence — safe ONLY because every invoice this
  //    run numbered is gone, so no live invoice can ever be renumbered.
  // Scoped to THIS company: numbering is per-company, and rebuild-test now also
  // carries company B's fixtures (scripts/seed-test-identities.mjs, #104).
  const { count: invoicesLeft } = await admin
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);
  if (invoicesLeft === invoicesBefore && seqBefore != null) {
    check(
      'sequence-rewind',
      (await admin.from('companies').update({ invoice_number_sequence: seqBefore }).eq('id', companyId)).error
    );
  } else {
    errors.push(
      `sequence NOT rewound: ${invoicesLeft} invoices remain, expected the pre-run ${invoicesBefore}`
    );
  }

  // 6. Verify — nothing may fail silently the way 7D's teardown did.
  const counts: Record<string, number | null> = {};
  const tally = async (label: string, q: PromiseLike<{ count: number | null }>) => {
    counts[label] = (await q).count;
  };
  // Company-scoped: company B's persistent fixtures must not read as leftovers.
  const own = (table: string) =>
    admin.from(table).select('id', { count: 'exact', head: true }).eq('company_id', companyId);
  await tally('client_payments', own('client_payments'));
  await tally('client_payment_applications', own('client_payment_applications'));
  await tally('client_refunds', own('client_refunds'));
  await tally('retainage_releases', own('retainage_releases'));
  await tally('invoices', own('invoices'));
  await tally('invoice_lines', own('invoice_lines'));
  await tally('projects', own('projects'));
  await tally('contacts', own('contacts'));
  await tally('profiles', own('profiles'));

  const { data: seqNow } = await admin
    .from('companies')
    .select('invoice_number_sequence')
    .eq('id', companyId)
    .single();

  console.log('\n[S97CT-7E TEARDOWN] counts:', JSON.stringify(counts));
  console.log('[S97CT-7E TEARDOWN] invoice_number_sequence:', seqNow?.invoice_number_sequence, '(was', seqBefore, ')');
  console.log('[S97CT-7E TEARDOWN] errors:', errors.length ? JSON.stringify(errors) : 'NONE');
}, 180_000);
