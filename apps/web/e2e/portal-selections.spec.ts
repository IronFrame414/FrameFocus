import { test, expect } from '@playwright/test';
import { PROJECT_QA_A, signIn } from './chat-fixture';
import { adminClient, COMPANY_A } from './hub-fixture';

// ============================================================================
// S175 stage 7 — THE CLIENT PICKS, IN A REAL BROWSER. Spec §9.3. [item 5]
// ============================================================================
//
// ⚠️ WHY THIS FILE EXISTS ALONGSIDE `s175-stage7-portal-selections.live.ts`.
// The live harness proves the definer functions, the floor, the route and the
// figures — everything except THE AFFORDANCE. The green box is a tap, and the
// only thing that can prove a tap lands on a card, flips it green, moves the
// totals and enables the signature is a browser.
//
// ⚠️ AND IT IS THE PART THE MODULE EXISTS FOR. Every stage before this one has
// been the company's half. This is the first browser test in the repo where the
// client actually chooses something.
//
// FIXTURE: service-role, MARKER-named, swept in beforeAll AND afterAll, on the
// shared QA A project — the same arrangement `desktop-selections.spec.ts` uses,
// with a different marker, so the two cannot collide.
//
// ⚠️ THE SIGNING SESSION IS CREATED DIRECTLY rather than by driving the
// company's Release button. That button sends an EMAIL (S174 #1 put the send in
// the release path), and a browser test of the client's page has no business
// paying for, or waiting on, an outbound message. The session's shape is the
// one `offerSelection()` writes: pending, portal_session, no signer yet.
//
// ⚠️ WHAT IS DELIBERATELY NOT ASSERTED: how any of it LOOKS. The green-box feel,
// the tap-target sizing and how a single-choice selection communicates that
// picking B un-picks A are Josh's (§Y). This proves the mechanism.

const MARKER = 'E2EPSEL';
const LINKED = 'josh+qa-client-linked@worthprop.com';

/** 6,000 at 20% and 4,000 at 20% — chosen so the two totals cannot be confused. */
const COST_A = 6000;
const COST_B = 4000;
const MARKUP = 20;
const ALLOWANCE = 5000;

let selectionId = '';
let optionAId = '';
let optionBId = '';

async function sweep(): Promise<string[]> {
  const admin = adminClient();
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };
  const { data: sels } = await admin.from('selections').select('id').like('name', `${MARKER}%`);
  const ids = (sels ?? []).map((s: { id: string }) => s.id);
  if (ids.length) {
    await admin.from('notifications').delete().in('source_id', ids).eq('source_table', 'selections');
    // The four `signed_*` stamps travel together by CHECK and the session FK
    // runs both ways, so status and stamps clear in ONE statement — the S175
    // stage-5 sweep found this the hard way.
    check('unstamp', (await admin.from('selections').update({
      status: 'draft', signed_session_id: null, signed_sell_amount: null,
      signed_allowance_deduction: null, signed_variance: null, signed_at: null,
    }).in('id', ids)).error);
    check('sessions', (await admin.from('selection_signing_sessions').delete().in('selection_id', ids)).error);
    const { data: opts } = await admin.from('selection_options').select('id').in('selection_id', ids);
    const oids = (opts ?? []).map((o: { id: string }) => o.id);
    if (oids.length) {
      await admin.from('selection_option_amounts').delete().in('option_id', oids);
      await admin.from('selection_options').delete().in('id', oids);
    }
    await admin.from('selection_amounts').delete().in('selection_id', ids);
    await admin.from('selection_notes').delete().in('selection_id', ids);
    await admin.from('selection_threads').delete().in('selection_id', ids);
    check('selections', (await admin.from('selections').delete().in('id', ids)).error);
  }
  await admin.from('selection_areas').delete().like('name', `${MARKER}%`);
  const { data: items } = await admin
    .from('project_budget_items').select('id')
    .eq('project_id', PROJECT_QA_A).like('description', `${MARKER}%`);
  const iids = (items ?? []).map((i: { id: string }) => i.id);
  if (iids.length) {
    await admin.from('project_budget_amounts').delete().in('budget_item_id', iids);
    check('budget items', (await admin.from('project_budget_items').delete().in('id', iids)).error);
  }
  return errors;
}

test.beforeAll(async () => {
  const errors = await sweep();
  if (errors.length) throw new Error(`[${MARKER}] beforeAll sweep failed: ${errors.join('; ')}`);
  const admin = adminClient();

  const { data: item, error: bErr } = await admin
    .from('project_budget_items')
    .insert({
      company_id: COMPANY_A, project_id: PROJECT_QA_A, row_type: 'allowance',
      description: `${MARKER} tile allowance`, created_by: null,
    })
    .select('id').single();
  if (bErr) throw new Error(`budget line: ${bErr.message}`);
  const { error: aErr } = await admin.from('project_budget_amounts').insert({
    company_id: COMPANY_A, budget_item_id: item!.id, budgeted_amount: ALLOWANCE,
  });
  if (aErr) throw new Error(`budget amount: ${aErr.message}`);

  const { data: area, error: arErr } = await admin
    .from('selection_areas')
    .insert({ company_id: COMPANY_A, project_id: PROJECT_QA_A, name: `${MARKER} Kitchen`, sort_order: 900 })
    .select('id').single();
  if (arErr) throw new Error(`area: ${arErr.message}`);

  const { data: sel, error: sErr } = await admin
    .from('selections')
    .insert({
      company_id: COMPANY_A, project_id: PROJECT_QA_A, area_id: area!.id,
      name: `${MARKER} countertop`, allowance_budget_item_id: item!.id,
      allow_multiple: false, status: 'awaiting_approval',
    })
    .select('id').single();
  if (sErr) throw new Error(`selection: ${sErr.message}`);
  selectionId = sel!.id;

  for (const [i, o] of [
    { name: 'calacatta quartz', cost: COST_A },
    { name: 'granite', cost: COST_B },
  ].entries()) {
    const { data: opt, error: oErr } = await admin
      .from('selection_options')
      .insert({
        company_id: COMPANY_A, selection_id: selectionId,
        name: `${MARKER} ${o.name}`, spec_detail: `${o.name} spec`,
        is_chosen: false, sort_order: i,
      })
      .select('id').single();
    if (oErr) throw new Error(`option ${o.name}: ${oErr.message}`);
    if (i === 0) optionAId = opt!.id;
    else optionBId = opt!.id;
    const { error: amErr } = await admin.from('selection_option_amounts').insert({
      company_id: COMPANY_A, option_id: opt!.id,
      quantity: 1, unit_cost: o.cost, markup_percent: MARKUP,
    });
    if (amErr) throw new Error(`amounts ${o.name}: ${amErr.message}`);
  }

  // The shape `offerSelection()` writes when it releases.
  const { error: ssErr } = await admin.from('selection_signing_sessions').insert({
    company_id: COMPANY_A, selection_id: selectionId, status: 'pending',
  });
  if (ssErr) throw new Error(`signing session: ${ssErr.message}`);
});

test.afterAll(async () => {
  const errors = await sweep();
  if (errors.length) throw new Error(`[${MARKER}] afterAll sweep failed: ${errors.join('; ')}`);
});

test.describe('S175 stage 7 · the client picks and signs, in the browser', () => {
  test('the green box, the totals and the signature', async ({ page }) => {
    test.setTimeout(150_000);
    const admin = adminClient();
    await signIn(page, LINKED, /\/portal/);
    await page.goto(`/portal/${PROJECT_QA_A}/selections`);

    const card = page.getByTestId(`portal-selection-${selectionId}`);
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card).toHaveAttribute('data-status', 'awaiting_approval');

    const optA = page.getByTestId(`portal-option-${optionAId}`);
    const optB = page.getByTestId(`portal-option-${optionBId}`);

    // Nothing picked yet: no green box, no totals, and the signature refused
    // with a reason rather than silently.
    await expect(optA).toHaveAttribute('data-chosen', 'false');
    await expect(optB).toHaveAttribute('data-chosen', 'false');
    await expect(card.getByTestId('portal-selection-totals')).toHaveCount(0);
    await expect(card.getByTestId('portal-selection-sign-open')).toBeDisabled();

    // ⚠️ THE PER-OPTION SELL IS ON THE PAGE, and it came through
    // `selection_client_option_sell()` — she can read neither `unit_cost` nor
    // `markup_percent`, so this figure is the whole of Q5.1 working.
    await expect(optA).toContainText('$7,200.00'); // 6,000 × 1.20
    await expect(optB).toContainText('$4,800.00'); // 4,000 × 1.20

    // ── the green box ──────────────────────────────────────────────────────
    await optA.click();
    await expect(optA).toHaveAttribute('data-chosen', 'true');
    const totals = card.getByTestId('portal-selection-totals');
    await expect(totals).toBeVisible();
    await expect(totals).toContainText('$7,200.00'); // selections price
    await expect(totals).toContainText('$6,000.00'); // allowance sell: 5,000 × 1.20
    await expect(totals).toContainText('$1,200.00'); // added price
    await expect(card.getByTestId('portal-selection-sign-open')).toBeEnabled();

    // ⚠️ SINGLE CHOICE: picking B UN-PICKS A. The RPC refuses the two-pick
    // state as a backstop; this is the affordance that stops her reaching it.
    await optB.click();
    await expect(optB).toHaveAttribute('data-chosen', 'true');
    await expect(optA).toHaveAttribute('data-chosen', 'false');
    await expect(totals).toContainText('$4,800.00');
    await expect(totals).toContainText('-$6,000.00');
    await expect(totals).toContainText('$1,200.00'); // a CREDIT of 1,200 now
    await expect(totals).toContainText('Credit');

    // ...and it really wrote, not just re-coloured.
    await expect
      .poll(async () => {
        const { data } = await admin
          .from('selection_options').select('id').eq('selection_id', selectionId).eq('is_chosen', true);
        return (data ?? []).map((o: { id: string }) => o.id);
      }, { timeout: 15_000 })
      .toEqual([optionBId]);

    // ── the signature ──────────────────────────────────────────────────────
    await card.getByTestId('portal-selection-sign-open').click();
    // The binding wording, over the figures directly above it, and it is the
    // SERVER's sentence — `selectionConsentTextFor()`, shared.
    const consent = card.getByTestId('portal-selection-sign-consent-text');
    await expect(consent).toContainText('accept the stated price of $4,800.00');
    await expect(consent).toContainText('less my allowance of $6,000.00');
    await expect(consent).toContainText('a credit of $1,200.00');

    await card.getByTestId('portal-selection-sign-typed').fill('QA Client Linked');
    await card.getByTestId('portal-selection-sign-consent').check();
    await card.getByTestId('portal-selection-sign-submit').click();

    // ── approved, read-only, and the stamps agree with what she was shown ───
    await expect(card).toHaveAttribute('data-status', 'approved', { timeout: 30_000 });
    await expect(card.getByTestId('portal-selection-signed')).toBeVisible();
    await expect(card.getByTestId('portal-selection-sign-open')).toHaveCount(0);
    await expect(card.getByTestId('portal-selection-signed')).toContainText('Approved on');

    const { data: row } = await admin
      .from('selections')
      .select('status, signed_sell_amount, signed_allowance_deduction, signed_variance')
      .eq('id', selectionId).single();
    expect(row!.status).toBe('approved');
    expect(Number(row!.signed_sell_amount)).toBe(4800);
    expect(Number(row!.signed_allowance_deduction)).toBe(6000);
    expect(Number(row!.signed_variance)).toBe(-1200);
  });
});
