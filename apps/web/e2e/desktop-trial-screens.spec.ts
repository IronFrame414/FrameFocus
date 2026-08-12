import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInAs } from './sign-in-as';
import {
  adminClient,
  assertNoTrace,
  clearSharedCompanyTrial,
  COMPANY_A,
  createThrowawayCompany,
  destroyThrowawayCompany,
  giveSharedCompanyATrial,
  lockThrowaway,
  ADMIN,
  LIMIT_EMAIL,
  LOCKED_EMAIL,
  OWNER,
  PM,
  type Throwaway,
} from './trial-fixture';

// ============================================================================
// S139 — the four trial screens, IN A BROWSER.
// ============================================================================
//
// ⚠️ WHAT THIS FILE IS FOR, AND WHAT IT DELIBERATELY DOES NOT RE-PROVE.
//
// S138 shipped these screens with the server side already proven:
// `s138-trial-unlock.live.ts` (14/14) covers the RLS floors, the lock guard
// RPC and the unlock; the build proves all four routes compile and emit. What
// no test touched was the BROWSER — whether anything renders, whether the
// acknowledgement button writes its row when clicked, and whether the copy gap
// is actually visible rather than merely present in the source.
//
// So there are no RLS assertions here. A redirect is asserted where the
// PRODUCT promises a redirect, and rendering is asserted everywhere, because
// those are the two things only a browser can answer.
//
// ⚠️ THE COPY-GAP ASSERTIONS ARE THE POINT, NOT DECORATION. TL-23 is with
// legal. A placeholder that quietly becomes shipped wording is the failure
// mode these guard: if someone replaces `CopyPendingLegalReview` with prose,
// every one of these goes red.
// ============================================================================

let admin: SupabaseClient;
let locked: Throwaway;
let limited: Throwaway;

const COPY_GAP = '[data-testid="copy-pending-legal-review"]';

test.beforeAll(async () => {
  admin = adminClient();

  await giveSharedCompanyATrial(admin);

  locked = await createThrowawayCompany(admin, LOCKED_EMAIL, 'S139 Locked Co');
  // FOURTH attempt: three prior trials on this address, so `handle_new_user()`
  // takes the `v_trial_count >= 3` branch for real rather than us writing the
  // end state by hand.
  limited = await createThrowawayCompany(admin, LIMIT_EMAIL, 'S139 Limit Co', 3);
});

test.afterAll(async () => {
  await clearSharedCompanyTrial(admin);
  await destroyThrowawayCompany(admin, LOCKED_EMAIL);
  await destroyThrowawayCompany(admin, LIMIT_EMAIL);

  // ⚠️ VERIFY THE TEARDOWN. A leaked banned auth user reads as a broken test
  // somewhere else entirely, and S138 left two company tombstones that needed
  // removing by hand. Failing here is far cheaper than discovering it later.
  for (const email of [LOCKED_EMAIL, LIMIT_EMAIL]) {
    const trace = await assertNoTrace(admin, email);
    expect(trace.users, `${email}: auth user survived teardown`).toBe(0);
    expect(trace.trialEmails, `${email}: trial_emails row survived teardown`).toBe(0);
    expect(trace.companies, 'an S139% company survived teardown').toBe(0);
  }

  const { data: leftoverTrial } = await admin
    .from('trial_lifecycle')
    .select('company_id')
    .eq('company_id', COMPANY_A);
  expect(leftoverTrial ?? [], 'the shared QA company kept a trial_lifecycle row').toHaveLength(0);
});

// ---------------------------------------------------------------------------
// 1. /dashboard/trial — the warning
// ---------------------------------------------------------------------------

test.describe('/dashboard/trial — a data-loss warning, not a price list', () => {
  test('⚠️ the Owner sees it, and is NOT bounced to the plans page', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto('/dashboard/trial');

    // The failure this screen exists to replace: an expiring trial landing on
    // a pricing table, which answers "what does it cost" when the question is
    // "what happens to my work".
    await expect(page).toHaveURL(/\/dashboard\/trial$/);
    await expect(page).not.toHaveURL(/\/dashboard\/billing\/plans/);
  });

  test('it states the trial end DATE, not just a countdown', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto('/dashboard/trial');

    await expect(page.getByText(/Trial end date:/i)).toBeVisible();

    // The fixture set trial_end five days out; the heading must agree with the
    // stored row rather than with a hard-coded number here.
    const { data } = await admin
      .from('trial_lifecycle')
      .select('trial_end')
      .eq('company_id', COMPANY_A)
      .single();
    const endsOn = new Date((data as { trial_end: string }).trial_end).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    await expect(page.getByText(endsOn)).toBeVisible();
  });

  test('⚠️ the COPY PENDING LEGAL REVIEW block is VISIBLE', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto('/dashboard/trial');

    const gap = page.locator(COPY_GAP);
    await expect(gap).toBeVisible();
    await expect(gap).toContainText('COPY PENDING LEGAL REVIEW');
  });

  test('it links to the export, and the export screen renders with its own gap', async ({
    page,
  }) => {
    await signInAs(page, OWNER);
    await page.goto('/dashboard/trial');

    await page.getByRole('link', { name: /export my data/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/trial\/export$/);
    await expect(page.locator(COPY_GAP)).toBeVisible();
    await expect(page.getByTestId('start-export')).toBeVisible();
  });

  test('an Admin sees it too — the warning is Owner AND Admin', async ({ page }) => {
    await signInAs(page, ADMIN);
    await page.goto('/dashboard/trial');

    await expect(page).toHaveURL(/\/dashboard\/trial$/);
    await expect(page.locator(COPY_GAP)).toBeVisible();
  });

  test('⚠️ a PM is redirected away — it is not a company-wide notice', async ({ page }) => {
    await signInAs(page, PM);
    await page.goto('/dashboard/trial');

    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

// ---------------------------------------------------------------------------
// 2. The acknowledgement button
// ---------------------------------------------------------------------------

test.describe('the acknowledgement button — proof of notice, clicked for real', () => {
  test.beforeEach(async () => {
    // Each test starts with nothing acknowledged, so "the button appeared"
    // cannot be confused with "a previous test left a row behind".
    await admin.from('trial_warning_acknowledgements').delete().eq('company_id', COMPANY_A);
  });

  test('⚠️ clicking it WRITES THE ROW — who, when, which warning', async ({ page }) => {
    await signInAs(page, OWNER);
    await page.goto('/dashboard/trial');

    const before = await admin
      .from('trial_warning_acknowledgements')
      .select('id')
      .eq('company_id', COMPANY_A);
    expect(before.data ?? [], 'precondition: nothing acknowledged yet').toHaveLength(0);

    await page.getByTestId('acknowledge-warning').click();
    await expect(page.getByTestId('already-acknowledged')).toBeVisible();

    const { data: rows } = await admin
      .from('trial_warning_acknowledgements')
      .select('profile_id, warning_kind')
      .eq('company_id', COMPANY_A);
    expect(rows ?? [], 'the click did not write an acknowledgement').toHaveLength(1);

    // day_7, because the fixture put trial_end five days out. Asserting the
    // VALUE rather than "a row exists" is what catches the screen and the cron
    // disagreeing about which warning is in force.
    expect((rows as Array<{ warning_kind: string }>)[0].warning_kind).toBe('day_7');

    // First-person: the row belongs to the signed-in Owner, not to whoever the
    // page happened to have a profile id for.
    const { data: ownerProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', OWNER)
      .single();
    expect((rows as Array<{ profile_id: string }>)[0].profile_id).toBe(
      (ownerProfile as { id: string }).id
    );
  });

  test('⚠️ the acknowledged state SURVIVES A RELOAD — the button does not come back', async ({
    page,
  }) => {
    await signInAs(page, OWNER);
    await page.goto('/dashboard/trial');
    await page.getByTestId('acknowledge-warning').click();
    await expect(page.getByTestId('already-acknowledged')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('already-acknowledged')).toBeVisible();
    await expect(page.getByTestId('acknowledge-warning')).toHaveCount(0);
  });

  test("an Admin's acknowledgement is their own, not the Owner's", async ({ page }) => {
    await signInAs(page, ADMIN);
    await page.goto('/dashboard/trial');
    await page.getByTestId('acknowledge-warning').click();
    await expect(page.getByTestId('already-acknowledged')).toBeVisible();

    const { data: adminProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', ADMIN)
      .single();
    const { data: rows } = await admin
      .from('trial_warning_acknowledgements')
      .select('profile_id')
      .eq('company_id', COMPANY_A);

    expect(rows ?? []).toHaveLength(1);
    expect((rows as Array<{ profile_id: string }>)[0].profile_id).toBe(
      (adminProfile as { id: string }).id
    );
  });
});

// ---------------------------------------------------------------------------
// 3. /locked
// ---------------------------------------------------------------------------

test.describe('/locked — the tenant whose trial expired', () => {
  test('⚠️ a session that was ALREADY OPEN when the lock landed is caught', async ({ page }) => {
    // This is the exact hole the guard exists for. Measured in S138: a ban
    // stops sign-in and refresh immediately, but a token issued BEFORE the lock
    // keeps working for the rest of its 3600s life. So: sign in first, lock
    // WITHOUT banning, then navigate.
    await signInAs(page, LOCKED_EMAIL);
    await lockThrowaway(admin, locked.companyId);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/locked$/);
  });

  test('it renders the lock, with the copy gap', async ({ page }) => {
    await lockThrowaway(admin, locked.companyId);
    await signInAs(page, LOCKED_EMAIL, /\/locked/);

    await expect(page.getByRole('heading', { name: /this account is locked/i })).toBeVisible();
    await expect(page.locator(COPY_GAP)).toBeVisible();
  });

  test('⚠️ it offers NO WAY BACK INTO THE APP — only the way out of the lock', async ({ page }) => {
    await lockThrowaway(admin, locked.companyId);
    await signInAs(page, LOCKED_EMAIL, /\/locked/);

    // Billing is the way OUT of the lock and must stay reachable. Anything else
    // under /dashboard would be a door the lock is supposed to have closed.
    const hrefs = await page.locator('a[href]').evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? '')
    );
    const intoTheApp = hrefs.filter(
      (h) => h.startsWith('/dashboard') && !h.startsWith('/dashboard/billing')
    );
    expect(intoTheApp, `locked screen links back into the app: ${intoTheApp.join(', ')}`).toEqual(
      []
    );

    // And no export link: the export window is the PRE-expiry period by ruling,
    // so offering one here would advertise a door that is closed.
    expect(hrefs.filter((h) => h.includes('/trial/export'))).toEqual([]);
  });

  test('⚠️ a locked tenant is refused the API too, not just the pages', async ({ page }) => {
    await lockThrowaway(admin, locked.companyId);
    await signInAs(page, LOCKED_EMAIL, /\/locked/);

    // The guard covers /api as well as /dashboard and /m. A JSON 403 rather
    // than a redirect, because an API caller following a 307 to HTML gets a
    // parse error that points nowhere near the cause.
    const res = await page.request.post('/api/trial/export', {
      data: { categories: ['contacts'], format: 'zip' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe('TRIAL_LOCKED');
  });
});

// ---------------------------------------------------------------------------
// 4. /trial-limit
// ---------------------------------------------------------------------------

test.describe('/trial-limit — the fourth signup from one address', () => {
  test('⚠️ signing in lands on the trial-limit screen, NOT the price list', async ({ page }) => {
    await signInAs(page, LIMIT_EMAIL, /\/trial-limit/);

    await expect(page).toHaveURL(/\/trial-limit$/);
    await expect(page).not.toHaveURL(/\/dashboard\/billing\/plans/);
    await expect(page.getByRole('heading', { name: /no trial on this account/i })).toBeVisible();
  });

  test('⚠️ the copy gap is visible — the words are what is missing', async ({ page }) => {
    await signInAs(page, LIMIT_EMAIL, /\/trial-limit/);

    const gap = page.locator(COPY_GAP);
    await expect(gap).toBeVisible();
    await expect(gap).toContainText('COPY PENDING LEGAL REVIEW');
  });

  test('the fixture really is a 4th attempt — the state, not just the screen', async () => {
    // Guards against the screen passing for the wrong reason: if
    // `handle_new_user()` stopped taking the >= 3 branch, the redirect would
    // vanish and these tests would fail with no explanation of why.
    const { data: sub } = await admin
      .from('subscriptions')
      .select('status, trial_start, stripe_subscription_id')
      .eq('company_id', limited.companyId)
      .single();
    expect((sub as { status: string }).status).toBe('incomplete');
    expect((sub as { trial_start: string | null }).trial_start).toBeNull();
    expect((sub as { stripe_subscription_id: string | null }).stripe_subscription_id).toBeNull();
  });
});
