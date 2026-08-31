import { test, expect } from '@playwright/test';
import { adminClient } from './hub-fixture';
import { signIn, OWNER } from './chat-fixture';

// ============================================================================
// Register backlog §2 — the RULED SIX [Josh, Phase 2 Q5].
// ============================================================================
// Of 54 useConfirm sites exactly ONE was clicked by an e2e before this file.
// These six cover every money-irreversible confirm: send-invoice (numbering +
// freeze), project cancel→reopen (one round-trip, four confirms' mechanism),
// void contract, delete payment, delete change order, delete estimate.
//
// Each test: assert the PRE-state via admin (a pass cannot be vacuous), click
// the trigger, click `confirm-accept` (the overlay's fixed testid), then
// assert the POST-state via admin — the DB, not the render, is the proof the
// guarded action actually fired.
//
// Serial on purpose: the payment-delete test must run before the contract
// void (voiding auto-closes the contract's committed rows).

test.describe.configure({ mode: 'serial' });

const MARKER = 'E2ECONFIRM';
const AFTER_POST = { timeout: 20_000 };

let companyId: string;
let projectId: string;
let statusProjectId: string;
let invoiceId: string;
let estimateId: string;
let coId: string;
let subContractId: string;
let paymentId: string;

async function sweep(): Promise<string[]> {
  const admin = adminClient();
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  const { data: projects } = await admin
    .from('projects')
    .select('id')
    .like('name', `${MARKER}%`);
  const pids = (projects ?? []).map((p) => p.id);
  if (pids.length) {
    const { data: exps } = await admin.from('expenses').select('id').in('project_id', pids);
    const eids = (exps ?? []).map((e) => e.id);
    if (eids.length) {
      check('expense_payments', (await admin.from('expense_payments').delete().in('expense_id', eids)).error);
      check('expense_allocations', (await admin.from('expense_allocations').delete().in('expense_id', eids)).error);
      check('expenses', (await admin.from('expenses').delete().in('id', eids)).error);
    }
    // Invoices FIRST: lines of a SENT invoice are immutable by trigger, but
    // the trigger's own CASCADE branch admits lines whose parent is already
    // gone — so deleting the invoice takes its lines legally.
    check('invoices', (await admin.from('invoices').delete().in('project_id', pids)).error);
    // The send test stores the issued invoice's PDF as a `files` row, which
    // pins the project (FK) — found the hard way on run 2's pre-sweep.
    check('files', (await admin.from('files').delete().in('project_id', pids)).error);
    check('subcontractor_contracts', (await admin.from('subcontractor_contracts').delete().in('project_id', pids)).error);
    check('change_orders', (await admin.from('change_orders').delete().in('project_id', pids)).error);
    check('project_assignments', (await admin.from('project_assignments').delete().in('project_id', pids)).error);
    check('projects', (await admin.from('projects').delete().in('id', pids)).error);
  }
  const { data: ests } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const estIds = (ests ?? []).map((e) => e.id);
  if (estIds.length) check('estimates', (await admin.from('estimates').delete().in('id', estIds)).error);
  check('company_members', (await admin.from('company_members').delete().like('display_name', `${MARKER}%`)).error);
  check('contacts', (await admin.from('contacts').delete().like('last_name', `${MARKER}%`)).error);
  return errors;
}

test.beforeAll(async () => {
  const admin = adminClient();
  const pre = await sweep();
  expect(pre, 'pre-run sweep met refusals').toEqual([]);

  const { data: company } = await admin
    .from('companies')
    .select('id')
    .eq('name', 'Sabal Point Construction')
    .single();
  companyId = company!.id;

  const { data: ownerMember } = await admin
    .from('company_members')
    .select('id, profile:profiles!inner(email)')
    .eq('company_id', companyId)
    .eq('profile.email', OWNER)
    .eq('is_deleted', false)
    .single();
  const ownerMemberId = ownerMember!.id;

  const { data: contact } = await admin
    .from('contacts')
    .insert({
      company_id: companyId,
      first_name: 'Confirm',
      last_name: `${MARKER} Client`,
      contact_type: 'client',
      email: 'josh+e2econfirm@worthprop.com',
    })
    .select('id')
    .single();

  // Explicit number + seq — the numbering triggers need a caller company,
  // which the service role does not have (the established fixture pattern).
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: project } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contact!.id,
      project_number: 'PRJ-E2ECNF',
      name: `${MARKER} project`,
      status: 'active',
      project_internal_seq: (seqRow?.project_internal_seq ?? 0) + 4000,
    })
    .select('id')
    .single();
  projectId = project!.id;

  // Test 2's own project — `cancelled` is TERMINAL (STATUS_TRANSITIONS), so
  // the status round-trip ends in a state the other fixtures must not share.
  const { data: statusProject, error: spErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contact!.id,
      project_number: 'PRJ-E2ECNF2',
      name: `${MARKER} status project`,
      status: 'active',
      project_internal_seq: (seqRow?.project_internal_seq ?? 0) + 4001,
    })
    .select('id')
    .single();
  if (spErr) throw new Error(`status project: ${spErr.message}`);
  statusProjectId = statusProject!.id;

  const { data: invoice, error: invErr } = await admin
    .from('invoices')
    .insert({
      company_id: companyId,
      project_id: projectId,
      status: 'draft',
      title: `${MARKER} invoice`,
      author_member_id: ownerMemberId,
    })
    .select('id')
    .single();
  if (invErr) throw new Error(`invoice: ${invErr.message}`);
  invoiceId = invoice!.id;
  const { error: lineErr } = await admin.from('invoice_lines').insert({
    company_id: companyId,
    invoice_id: invoiceId,
    description: `${MARKER} line`,
    line_type: 'fixed',
    billed_amount: 250,
    sort_order: 0,
  });
  if (lineErr) throw new Error(`invoice line: ${lineErr.message}`);

  // Explicit number + role: the numbering trigger needs a caller company,
  // and created_by_role is NOT NULL (stamped by the app's own insert path).
  const { data: estimate, error: estErr } = await admin
    .from('estimates')
    .insert({
      company_id: companyId,
      contact_id: contact!.id,
      name: `${MARKER} estimate`,
      status: 'draft',
      estimate_number: 'EST-E2ECNF-1',
      created_by_role: 'owner',
    })
    .select('id')
    .single();
  if (estErr) throw new Error(`estimate: ${estErr.message}`);
  estimateId = estimate!.id;

  const { data: co, error: coErr } = await admin
    .from('change_orders')
    .insert({
      company_id: companyId,
      project_id: projectId,
      co_number: 'CO-E2ECNF-01',
      title: `${MARKER} change order`,
      status: 'draft',
      author_member_id: ownerMemberId,
    })
    .select('id')
    .single();
  if (coErr) throw new Error(`change order: ${coErr.message}`);
  coId = co!.id;

  const { data: subMember, error: smErr } = await admin
    .from('company_members')
    .insert({
      company_id: companyId,
      member_type: 'subcontractor',
      display_name: `${MARKER} Sub Co`,
    })
    .select('id')
    .single();

  if (smErr) throw new Error(`sub member: ${smErr.message}`);
  const { data: contract, error: scErr } = await admin
    .from('subcontractor_contracts')
    .insert({
      company_id: companyId,
      project_id: projectId,
      member_id: subMember!.id,
      status: 'signed',
      contract_value: 5000,
    })
    .select('id')
    .single();
  if (scErr) throw new Error(`sub contract: ${scErr.message}`);
  subContractId = contract!.id;

  const { data: expense, error: expErr } = await admin
    .from('expenses')
    .insert({
      company_id: companyId,
      project_id: projectId,
      supplier: `${MARKER} Sub Co`,
      expense_date: '2026-08-01',
      amount: 1000,
      state: 'committed',
      status: 'approved',
      sub_contract_id: subContractId,
      author_member_id: ownerMemberId,
    })
    .select('id')
    .single();
  if (expErr) throw new Error(`expense: ${expErr.message}`);
  const { data: payment, error: payErr } = await admin
    .from('expense_payments')
    .insert({
      company_id: companyId,
      expense_id: expense!.id,
      amount: 400,
      paid_date: '2026-08-15',
    })
    .select('id')
    .single();
  if (payErr) throw new Error(`payment: ${payErr.message}`);
  paymentId = payment!.id;
});

test.afterAll(async () => {
  const errors = await sweep();
  expect(errors, 'teardown met refusals').toEqual([]);
});

test('1 · send invoice — the confirm issues it: number allocated, frozen', async ({ page }) => {
  const admin = adminClient();
  const { data: before } = await admin
    .from('invoices')
    .select('status, invoice_number')
    .eq('id', invoiceId)
    .single();
  expect(before!.status).toBe('draft'); // pre-state guard
  expect(before!.invoice_number).toBeNull();

  await signIn(page, OWNER);
  await page.goto(`/dashboard/projects/${projectId}/invoices/${invoiceId}`);
  await page.getByRole('button', { name: /send/i }).first().click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.getByTestId('confirm-accept').click();

  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from('invoices')
          .select('status, invoice_number')
          .eq('id', invoiceId)
          .single();
        return data!.invoice_number !== null && data!.status !== 'draft';
      },
      AFTER_POST
    )
    .toBe(true);
});

test('2 · complete, reopen, cancel — the :67 and :62 confirms, on their own project', async ({ page }) => {
  const admin = adminClient();
  await signIn(page, OWNER);
  await page.goto(`/dashboard/projects/${statusProjectId}`);

  const status = async () => {
    const { data } = await admin
      .from('projects')
      .select('status')
      .eq('id', statusProjectId)
      .single();
    return data!.status;
  };

  // Complete first (no confirm: no open bills on this fixture)…
  await page.getByRole('button', { name: /mark complete/i }).click();
  await expect.poll(status, AFTER_POST).toBe('complete');

  // …the :67 confirm — reopen a completed project…
  await page.getByRole('button', { name: /reopen project/i }).click();
  await page.getByTestId('confirm-accept').click();
  await expect.poll(status, AFTER_POST).toBe('active');

  // …and the :62 confirm — cancel. Terminal, which is why this project is
  // nobody else's fixture.
  await page.getByRole('button', { name: /mark cancelled/i }).click();
  await page.getByTestId('confirm-accept').click();
  await expect.poll(status, AFTER_POST).toBe('cancelled');
});

test('3 · delete payment — the confirm soft-deletes the recorded payment', async ({ page }) => {
  const admin = adminClient();
  const { data: before } = await admin
    .from('expense_payments')
    .select('is_deleted')
    .eq('id', paymentId)
    .single();
  expect(before!.is_deleted).toBe(false);

  await signIn(page, OWNER);
  await page.goto(`/dashboard/projects/${projectId}/contracts`);
  await page.getByRole('button', { name: /^delete$/i }).first().click();
  await page.getByTestId('confirm-accept').click();

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('expense_payments')
        .select('is_deleted')
        .eq('id', paymentId)
        .single();
      return data!.is_deleted;
    }, AFTER_POST)
    .toBe(true);
});

test('4 · void contract — the confirm voids it and closes its committed rows', async ({ page }) => {
  const admin = adminClient();
  const { data: before } = await admin
    .from('subcontractor_contracts')
    .select('status')
    .eq('id', subContractId)
    .single();
  expect(before!.status).toBe('signed');

  await signIn(page, OWNER);
  await page.goto(`/dashboard/projects/${projectId}/contracts`);
  await page.getByRole('button', { name: /void/i }).first().click();
  await page.getByTestId('confirm-accept').click();

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('subcontractor_contracts')
        .select('status')
        .eq('id', subContractId)
        .single();
      return data!.status;
    }, AFTER_POST)
    .toBe('void');
});

test('5 · delete change order — the confirm removes the draft CO', async ({ page }) => {
  const admin = adminClient();
  const { data: before } = await admin
    .from('change_orders')
    .select('id, is_deleted')
    .eq('id', coId)
    .maybeSingle();
  expect(before?.is_deleted).toBe(false);

  await signIn(page, OWNER);
  await page.goto(`/dashboard/projects/${projectId}/changes/${coId}`);
  await page.getByRole('button', { name: /delete/i }).first().click();
  await page.getByTestId('confirm-accept').click();

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('change_orders')
        .select('id, is_deleted')
        .eq('id', coId)
        .maybeSingle();
      return data === null || data.is_deleted === true;
    }, AFTER_POST)
    .toBe(true);
});

test('6 · delete estimate — the confirm soft-deletes the draft', async ({ page }) => {
  const admin = adminClient();
  const { data: before } = await admin
    .from('estimates')
    .select('is_deleted')
    .eq('id', estimateId)
    .single();
  expect(before!.is_deleted).toBe(false);

  await signIn(page, OWNER);
  await page.goto(`/dashboard/estimates/${estimateId}`);
  // The control lives on the Details tab, inside the "⋯ More actions" menu.
  await page.getByRole('button', { name: /more actions/i }).click();
  // The menu carries an outside-click closer, so pointer movement toward the
  // item closes it mid-click. dispatchEvent fires the React onClick without
  // moving the mouse; the confirm dialog + DB poll below are the assertions.
  await page.getByRole('button', { name: /delete estimate/i }).dispatchEvent('click');
  await page.getByTestId('confirm-accept').click();

  await expect
    .poll(async () => {
      const { data } = await admin
        .from('estimates')
        .select('is_deleted')
        .eq('id', estimateId)
        .single();
      return data!.is_deleted;
    }, AFTER_POST)
    .toBe(true);
});
