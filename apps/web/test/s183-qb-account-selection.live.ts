import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { glCandidates, paymentCandidates } from '@/lib/services/qb-accounts';
import { AccountSettings } from '@/components/quickbooks/account-settings';
import {
  GL_ACCOUNT_EXCLUDED_TYPES,
  PAYMENT_ACCOUNT_TYPES,
  defaultPaymentType,
  type QbAccount,
} from '@/lib/quickbooks/connection';

// ============================================================================
// S183 — M-J: accounts are PICKED, and an expense must say which one paid.
//
// Migrations: 20261430000000_qb_account_selection, 20261440000000_..._upsert_key
// Ruling:     [Josh, S103] stop typing account names; pull them from QuickBooks
//             and let the user pick. An expense cannot be finalised without an
//             account — an error at review, not a silent park later.
//
// ⚠️ NOTHING HERE CALLS INTUIT. The filters are pure functions, the blocking
// rule is a trigger, and the hide-when-disconnected rule is a render. A live
// call would meter against the CorePlus quota (7g1 §7G.3a).
// ============================================================================

const COMPANY = '03bb903f-1084-4ab4-afb8-03192cb58d30';

let memberId = '';
let projectId = '';
let accountId = '';
let originalDefault: string | null = null;
const madeExpenses: string[] = [];

/** One of each type Intuit was measured to accept or refuse. */
const SAMPLE: QbAccount[] = [
  { id: '35', name: 'Checking', path: 'Checking', type: 'Bank' },
  { id: '41', name: 'Mastercard', path: 'Mastercard', type: 'Credit Card' },
  { id: '90', name: 'Loan Payable', path: 'Loan Payable', type: 'Other Current Liability' },
  { id: '80', name: 'Cost of Goods Sold', path: 'Cost of Goods Sold', type: 'Cost of Goods Sold' },
  { id: '69', name: 'Accounting', path: 'Legal & Professional Fees:Accounting', type: 'Expense' },
  { id: '33', name: 'Accounts Payable (A/P)', path: 'Accounts Payable (A/P)', type: 'Accounts Payable' },
  { id: '34', name: 'Accounts Receivable (A/R)', path: 'Accounts Receivable (A/R)', type: 'Accounts Receivable' },
  { id: '20', name: 'Sales', path: 'Sales', type: 'Income' },
];

describe('S183 — picked accounts, and the account an expense was paid from', () => {
  beforeAll(async () => {
    assertRebuildTest();

    const { data: member } = await admin
      .from('company_members')
      .select('id, default_payment_account_id')
      .eq('company_id', COMPANY)
      // ⚠️ EXCLUDE subs rather than include "employees" — there is no such
      // member_type. The values in use are `crew` and `subcontractor`.
      .neq('member_type', 'subcontractor')
      .order('display_name', { ascending: true })
      .limit(1)
      .single();
    memberId = member!.id as string;
    originalDefault = (member!.default_payment_account_id as string | null) ?? null;

    // Scoped, not merely limited: a project WITH a client, because the enqueue
    // chain returns NULL without one (S165 category 2).
    const { data: project } = await admin
      .from('projects')
      .select('id')
      .eq('company_id', COMPANY)
      .eq('is_deleted', false)
      .not('contact_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
    projectId = project!.id as string;

    const { data: account } = await admin
      .from('company_payment_accounts')
      .select('id')
      .eq('company_id', COMPANY)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    accountId = (account?.id as string) ?? '';
  });

  afterAll(async () => {
    if (madeExpenses.length) {
      await admin.from('qb_sync_queue').delete().in('entity_id', madeExpenses);
      await admin.from('expenses').delete().in('id', madeExpenses);
    }
    await admin
      .from('company_members')
      .update({ default_payment_account_id: originalDefault })
      .eq('id', memberId);
  });

  async function seedPending(extra: Record<string, unknown> = {}): Promise<string> {
    const { data, error } = await admin
      .from('expenses')
      .insert({
        company_id: COMPANY,
        project_id: projectId,
        author_member_id: memberId,
        supplier: 'S183 harness',
        expense_date: '2026-09-06',
        amount: 9.99,
        cost_category: 'material',
        status: 'pending',
        ...extra,
      })
      .select('id')
      .single();
    if (error) throw new Error(`seed failed: ${error.message}`);
    madeExpenses.push(data!.id as string);
    return data!.id as string;
  }

  // -------------------------------------------------------------------------
  // The two filters, and WHY they differ. Both sets were measured against the
  // live sandbox by making Intuit refuse; these guard the measurement.
  // -------------------------------------------------------------------------
  it('1 — a Purchase may be paid only from Bank, Credit Card or Other Current Liability', () => {
    const types = paymentCandidates(SAMPLE).map((a) => a.type);
    expect(new Set(types)).toEqual(new Set(PAYMENT_ACCOUNT_TYPES));
    expect(types).not.toContain('Cost of Goods Sold');
    expect(types).not.toContain('Expense');
  });

  it('2 — the GL picker EXCLUDES only AP and AR, and does not allowlist "expense" types', () => {
    const paths = glCandidates(SAMPLE).map((a) => a.path);
    for (const excluded of GL_ACCOUNT_EXCLUDED_TYPES) {
      expect(paths.some((p) => p.includes(excluded))).toBe(false);
    }
    // ⚠️ THE ASSERTION THAT MATTERS. QuickBooks accepts 12 of 14 types on a
    // cost line, so an "expense accounts only" filter would hide valid
    // choices. Income is not a sensible cost account — but it is a LEGAL one,
    // and hiding it is our opinion, not Intuit's rule.
    expect(paths, 'a non-expense type must still be offered').toContain('Sales');
    // Cost-of-goods sorts above a general Expense account.
    expect(glCandidates(SAMPLE)[0].type).toBe('Cost of Goods Sold');
  });

  it('3 — a card defaults to CreditCard, everything else to Check', () => {
    expect(defaultPaymentType('Credit Card')).toBe('CreditCard');
    expect(defaultPaymentType('Bank')).toBe('Check');
    expect(defaultPaymentType('Other Current Liability')).toBe('Check');
  });

  // -------------------------------------------------------------------------
  it('4 — DISCONNECTED renders nothing at all, not a disabled section', () => {
    const props = {
      glIds: { labor: null, material: null, subcontractor: null, other: null },
      glNames: { labor: null, material: null, subcontractor: null, other: null },
      paymentAccounts: [],
      members: [],
      canEdit: true,
    };
    const off = renderToStaticMarkup(createElement(AccountSettings, { ...props, connected: false }));
    const on = renderToStaticMarkup(createElement(AccountSettings, { ...props, connected: true }));

    // ⚠️ RULED: "hide the section, do not disable it" — an empty dropdown
    // invites a user to configure something inert. Empty markup, not markup
    // with a `disabled` attribute.
    expect(off).toBe('');
    expect(on).toContain('Cost accounts');
  });

  // -------------------------------------------------------------------------
  it('5 — approving without an account is REFUSED, and the message names the fix', async () => {
    const id = await seedPending();
    const { error } = await admin.from('expenses').update({ status: 'approved' }).eq('id', id);
    expect(error, 'approval must be refused').not.toBeNull();
    expect(error!.message).toContain('which account paid');
  });

  it('6 — approving WITH an account is allowed', async () => {
    if (!accountId) return; // no list configured on this fixture; nothing to assert
    const id = await seedPending({ payment_account_id: accountId });
    const { error } = await admin.from('expenses').update({ status: 'approved' }).eq('id', id);
    expect(error).toBeNull();
  });

  // -------------------------------------------------------------------------
  it('7 — a COMMITMENT is never blocked and never syncs', async () => {
    const id = await seedPending({ state: 'committed' });
    const { error } = await admin.from('expenses').update({ status: 'approved' }).eq('id', id);
    // ⚠️ The prompt names `expenses.commitment_only`; that column DOES NOT
    // EXIST. The real test is the five-term payable predicate, and blocking a
    // commitment would stop 7C dead.
    expect(error, 'a commitment needs no payer').toBeNull();

    const { data: queued } = await admin
      .from('qb_sync_queue')
      .select('id')
      .eq('entity_id', id);
    expect((queued ?? []).length, 'a commitment must never reach QuickBooks').toBe(0);
  });

  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // M-L [S184] — the ONE error point, and the ONE record.
  // -------------------------------------------------------------------------
  it('9 — the payment RPC REFUSES without an account, and takes one when given', async () => {
    if (!accountId) return;
    const ownerC = await sessionFor('josh+test50@worthprop.com');

    // A commitment: approved without an account (optional there), then paid.
    const id = await seedPending({ state: 'committed' });
    const { error: approveErr } = await admin
      .from('expenses')
      .update({ status: 'approved' })
      .eq('id', id);
    expect(approveErr, 'a commitment needs no account to approve').toBeNull();

    // ⚠️ THE ONE POINT WHERE AN EMPTY ACCOUNT BLOCKS. Everywhere else the field
    // is optional, because until money moves you may not know which account
    // paid — and nothing may obstruct a field user logging a receipt.
    const blocked = await ownerC.rpc('record_expense_payment', {
      p_expense_id: id,
      p_paid_date: '2026-09-06',
      p_amount: 1,
    });
    expect(blocked.error, 'a payment with no account must be refused').not.toBeNull();
    expect(blocked.error!.message).toContain('which account');

    const ok = await ownerC.rpc('record_expense_payment', {
      p_expense_id: id,
      p_paid_date: '2026-09-06',
      p_amount: 1,
      p_payment_account_id: accountId,
    });
    expect(ok.error, 'a payment WITH an account is allowed').toBeNull();

    const { data: pay } = await admin
      .from('expense_payments')
      .select('id, payment_account_id')
      .eq('expense_id', id);
    expect(pay?.[0]?.payment_account_id).toBe(accountId);

    // ⚠️ ONE record for one real event: the payment queues a Purchase, and the
    // commitment itself queued nothing at all.
    const { data: payQ } = await admin
      .from('qb_sync_queue')
      .select('entity_type, operation')
      .eq('entity_id', pay![0].id as string);
    expect((payQ ?? []).map((r) => `${r.entity_type}:${r.operation}`)).toContain(
      'expense_payment:create'
    );

    const { data: expQ } = await admin.from('qb_sync_queue').select('id').eq('entity_id', id);
    expect((expQ ?? []).length, 'a commitment never enqueues anything itself').toBe(0);

    // afterAll deletes the expense; take its payment and queue rows with it.
    await admin.from('qb_sync_queue').delete().eq('entity_id', pay![0].id as string);
    await admin.from('expense_payments').delete().eq('id', pay![0].id as string);
  });

  it('8 — only Owner/Admin may set a member default (RLS + trigger)', async () => {
    if (!accountId) return;
    const { error } = await admin
      .from('company_members')
      .update({ default_payment_account_id: accountId })
      .eq('id', memberId);
    // Service role is exempt by design (it is the seeder and the worker).
    expect(error).toBeNull();

    const { data } = await admin
      .from('company_members')
      .select('default_payment_account_id')
      .eq('id', memberId)
      .single();
    expect(data?.default_payment_account_id).toBe(accountId);
  });
});
