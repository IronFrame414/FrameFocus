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
// S106 — the award-prompt fixture (tests 7 & 8), on its own estimate: test 6
// soft-deletes `estimateId`, and an awarded line must not share a fixture with it.
let awardEstimateId: string;
let awardLineId: string;
let awardBidId: string;
let awardSubId: string;

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
  // S106 — the award fixture's bidder. estimate_sub_bids.subcontractor_id has no
  // cascade back to here, so the estimates delete above must run FIRST (it does).
  check('subcontractors', (await admin.from('subcontractors').delete().like('company_name', `${MARKER}%`)).error);
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

  // ── S106 award-prompt fixture ────────────────────────────────────────────
  // Every pricing input is PINNED so $Y is a fixed number the test can assert
  // as a string, not a figure recomputed by the test (which would pass against
  // its own bug). fixed_price + markup mode + 20% sub default + 0% tax means
  // the $10,000 bid must project to exactly $12,000; the manual total is $4,200,
  // a value the default could never produce.
  const { data: sub, error: subErr } = await admin
    .from('subcontractors')
    .insert({
      company_id: companyId,
      company_name: `${MARKER} Bidder`,
      sub_type: 'subcontractor',
      status: 'active',
    })
    .select('id')
    .single();
  if (subErr) throw new Error(`subcontractor: ${subErr.message}`);
  awardSubId = sub!.id;

  const { data: awardEstimate, error: aeErr } = await admin
    .from('estimates')
    .insert({
      company_id: companyId,
      contact_id: contact!.id,
      name: `${MARKER} award estimate`,
      status: 'draft',
      estimate_number: 'EST-E2ECNF-2',
      created_by_role: 'owner',
      contract_type: 'fixed_price',
      pricing_mode: 'markup',
      subcontractor_markup_percent: 20,
      tax_rate: 0,
    })
    .select('id')
    .single();
  if (aeErr) throw new Error(`award estimate: ${aeErr.message}`);
  awardEstimateId = awardEstimate!.id;

  const { data: awardCategory, error: acErr } = await admin
    .from('estimate_categories')
    .insert({
      company_id: companyId,
      estimate_id: awardEstimateId,
      name: `${MARKER} category`,
      sort_order: 0,
    })
    .select('id')
    .single();
  if (acErr) throw new Error(`award category: ${acErr.message}`);

  // NO estimate_line_rows on this line — the total_price_override invariant
  // (20261560000000) refuses an override on a line that has any, and the award
  // prompt only fires on the zero-row branch.
  const { data: awardLine, error: alErr } = await admin
    .from('estimate_line_items')
    .insert({
      company_id: companyId,
      estimate_id: awardEstimateId,
      category_id: awardCategory!.id,
      name: `${MARKER} overridden line`,
      sort_order: 0,
      total_price: 4200,
      total_price_override: 4200,
    })
    .select('id')
    .single();
  if (alErr) throw new Error(`award line: ${alErr.message}`);
  awardLineId = awardLine!.id;

  const { data: awardBid, error: abErr } = await admin
    .from('estimate_sub_bids')
    .insert({
      company_id: companyId,
      estimate_id: awardEstimateId,
      line_item_id: awardLineId,
      subcontractor_id: awardSubId,
      bid_amount: 10000,
      is_winner: false,
    })
    .select('id')
    .single();
  if (abErr) throw new Error(`award bid: ${abErr.message}`);
  awardBidId = awardBid!.id;
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

// ============================================================================
// S106 — the award prompt [RULED Josh].
// ============================================================================
// Awarding a bid ITEMIZES a line, and `set_winning_bid` CLEARS that line's
// manual total (`total_price_override`, migration 20261560000000) so a cost can
// never outlive its rows. The prompt announces the clear before it happens.
//
// ⚠️ THESE TWO RUN IN ORDER AND THE ORDER IS THE POINT. Test 7 cancels, and
// test 8 then awards THE SAME LINE — so 8 passing is itself proof that 7 left
// the fixture pristine. Cancel is claimed to be a no-op by ORDERING (every
// statement above the confirm is a SELECT; the RPC that writes sits below the
// early return). Until this file existed that claim was proven only by reading
// the code.
//
// Pricing is pinned in the fixture, so the expected figures are LITERALS here.
// A test that recomputed $Y with the same formula the app uses would pass
// against a shared bug — the whole failure mode the prompt exists to prevent.
const AWARD_MANUAL_TOTAL = '$4,200.00'; // the line's total_price_override
const AWARD_PROJECTED = '$12,000.00'; // 10,000 bid × 1.20 sub default, untaxed

test('7 · award prompt — CANCEL is a true no-op: no winner, no row, override intact', async ({
  page,
}) => {
  const admin = adminClient();

  await signIn(page, OWNER);
  await page.goto(`/dashboard/estimates/${awardEstimateId}`);
  await page.getByTestId('est-tab-bidding').click();

  await page.locator(`input[name="winner-${awardLineId}"]`).click();

  // The dialog says all three ruled lines. `pre-line` renders the \n breaks, so
  // the DOM text runs them together — assert each independently.
  const dialog = page.getByTestId('confirm-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Replace your manual total?');
  await expect(dialog).toContainText(`Your total: ${AWARD_MANUAL_TOTAL}`);
  await expect(dialog).toContainText(`After awarding: ${AWARD_PROJECTED} (bid + markup)`);
  await expect(dialog).toContainText(
    'Awarding itemizes this line, so your manual total no longer applies.'
  );
  await expect(page.getByTestId('confirm-accept')).toHaveText('Replace');
  await expect(page.getByTestId('confirm-cancel')).toHaveText('Cancel');

  await page.getByTestId('confirm-cancel').click();
  await expect(dialog).toBeHidden();

  // ⚠️ THE ASSERTION THAT MATTERS. A no-op cannot be proven by waiting — there
  // is nothing to wait FOR. Give the RPC every chance to have fired (the whole
  // AFTER_POST budget the other tests poll for a change within), then read the
  // three things an award would have touched. All three must be untouched.
  await page.waitForTimeout(AFTER_POST.timeout / 4);

  const { data: line } = await admin
    .from('estimate_line_items')
    .select('total_price_override, total_price')
    .eq('id', awardLineId)
    .single();
  expect(line!.total_price_override, 'CANCEL cleared the manual total').toBe(4200);
  expect(Number(line!.total_price), 'CANCEL repriced the line').toBe(4200);

  const { data: bid } = await admin
    .from('estimate_sub_bids')
    .select('is_winner')
    .eq('id', awardBidId)
    .single();
  expect(bid!.is_winner, 'CANCEL set the winner').toBe(false);

  const { data: rows } = await admin
    .from('estimate_line_rows')
    .select('id')
    .eq('line_item_id', awardLineId);
  expect(rows ?? [], 'CANCEL inserted the subcontractor row').toHaveLength(0);

  // Still unchecked — the radio is controlled by is_winner, so a stuck check
  // would mean the UI is showing an award the database never took.
  await expect(page.locator(`input[name="winner-${awardLineId}"]`)).not.toBeChecked();
});

test('8 · award prompt — REPLACE awards: override cleared, row inserted, line repriced', async ({
  page,
}) => {
  const admin = adminClient();

  // Test 7 must have left this pristine. Asserted, not assumed: if 7 leaked, 8
  // would otherwise "pass" against a line that was already awarded.
  const { data: before } = await admin
    .from('estimate_line_items')
    .select('total_price_override')
    .eq('id', awardLineId)
    .single();
  expect(before!.total_price_override, 'test 7 did not leave the line pristine').toBe(4200);

  await signIn(page, OWNER);
  await page.goto(`/dashboard/estimates/${awardEstimateId}`);
  await page.getByTestId('est-tab-bidding').click();

  await page.locator(`input[name="winner-${awardLineId}"]`).click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.getByTestId('confirm-accept').click();

  // The override is gone AND the line carries the projected total. Both, because
  // a cleared override with a stale total_price is the silent-wrong-money case.
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('estimate_line_items')
        .select('total_price_override, total_price')
        .eq('id', awardLineId)
        .single();
      return `${data!.total_price_override}/${Number(data!.total_price)}`;
    }, AFTER_POST)
    .toBe('null/12000');

  const { data: bid } = await admin
    .from('estimate_sub_bids')
    .select('is_winner')
    .eq('id', awardBidId)
    .single();
  expect(bid!.is_winner).toBe(true);

  // The row the RPC inserts: cost = the bid, no per-row markup (it inherits the
  // estimate default), untaxed, priced to the same figure the prompt quoted.
  const { data: rows } = await admin
    .from('estimate_line_rows')
    .select('row_type, amount, total, markup_percent, apply_tax, subcontractor_id')
    .eq('line_item_id', awardLineId);
  expect(rows ?? []).toHaveLength(1);
  expect(rows![0].row_type).toBe('subcontractor');
  expect(Number(rows![0].amount)).toBe(10000);
  expect(Number(rows![0].total)).toBe(12000);
  expect(rows![0].markup_percent).toBeNull();
  expect(rows![0].apply_tax).toBe(false);
  expect(rows![0].subcontractor_id).toBe(awardSubId);

  // ⚠️ THE PROMPT'S OWN CLAIM, CHECKED. $12,000 is what the dialog said in test
  // 7 and what the line actually became. If these ever diverge, the second
  // dialog ("The awarded total is not what the prompt showed") should be on
  // screen — so its ABSENCE here is part of the assertion.
  await expect(page.getByTestId('alert-dialog')).toBeHidden();
});
