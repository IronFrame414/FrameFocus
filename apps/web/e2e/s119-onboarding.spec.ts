import { test, expect } from '@playwright/test';
import { adminClient } from './hub-fixture';
import { deleteCompanies } from '../test-support/company-purge';

// ============================================================================
// S119 ITEM A-1 — both onboarding paths, end to end in a browser, after the
// `profiles` / `companies` client INSERT policies were dropped (20262075000000).
//
// Stop rule 7: "any signup or invite-accept path that stops working". Both
// paths create their rows inside handle_new_user() (SECURITY DEFINER), so the
// drop should not touch them — this is the proof, through the real forms:
//   a) a new Owner signs up at /sign-up → company, owner profile, member row,
//      trial; then signs in.
//   b) an invitee accepts at /invite/accept?token=… → joins the inviting company
//      with the invited role, the invitation reads accepted; then signs in.
// The confirmation email is not clicked: the account is confirmed through the
// service role, which is not the path under test.
// ============================================================================

const admin = adminClient();
const MARKER = 'S119ONB';
const STAMP = Date.now();
// GoTrue refuses `@example.invalid` on a plain sign-up (email_address_invalid, first
// run); the invite path accepts it. The fixture sink domain, never a real inbox.
const OWNER_EMAIL = `disposable-s119-owner-${STAMP}@qa-noreply.ezcontractorbinder.com`;
const INVITEE_EMAIL = `disposable-s119-invitee-${STAMP}@example.invalid`;
const PW = 'FrameFocusTest!2026';
let inviteCompanyId = '';
let inviterUserId = '';

async function userIdOf(email: string): Promise<string | null> {
  const { data } = await admin.from('profiles').select('user_id').eq('email', email).maybeSingle();
  return (data as { user_id: string } | null)?.user_id ?? null;
}

async function sweep(): Promise<void> {
  const { data: cos } = await admin.from('companies').select('id').ilike('name', `${MARKER}%`);
  const ids = ((cos ?? []) as Array<{ id: string }>).map((c) => c.id);
  const users: string[] = [];
  for (const e of [OWNER_EMAIL, INVITEE_EMAIL]) {
    const id = await userIdOf(e);
    if (id) users.push(id);
  }
  await admin.from('invitations').delete().in('email', [OWNER_EMAIL, INVITEE_EMAIL]);
  await deleteCompanies(admin, ids);
  for (const e of [OWNER_EMAIL, INVITEE_EMAIL]) await admin.from('trial_emails').delete().eq('email', e);
  for (const id of users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
}

test.beforeAll(async () => {
  await sweep();
  const { data: o } = await admin
    .from('profiles').select('user_id').eq('email', 'josh+test50@worthprop.com').single();
  inviterUserId = (o as { user_id: string }).user_id;
  const { data: c, error } = await admin
    .from('companies')
    .insert({ name: `${MARKER} inviting ${STAMP}`, slug: `s119onb-${STAMP}`, email: 'fixture-office@qa-noreply.ezcontractorbinder.com' })
    .select('id')
    .single();
  if (error) throw new Error(`company: ${error.message}`);
  inviteCompanyId = (c as { id: string }).id;
});

test.afterAll(async () => {
  await sweep();
  const { data } = await admin.from('companies').select('id').ilike('name', `${MARKER}%`);
  expect(data ?? [], 'S119ONB companies survived teardown').toHaveLength(0);
});

async function signInLeavesSignIn(page: import('@playwright/test').Page, email: string) {
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 30_000 });
  return new URL(page.url()).pathname;
}

test('a — a new Owner signs up at /sign-up and gets a company, an owner profile, a member row and a trial', async ({ page }) => {
  // ⚠️ GATED [S119]: a sign-up through the form always sends a confirmation mail, and
  // rebuild-test's auth mailer rate-limits (over_email_send_rate_limit — CI run
  // 36628474518 went red on exactly that, 637 others green). Run by hand:
  // S119_ONBOARDING=1 npx playwright test e2e/s119-onboarding.spec.ts
  test.skip(process.env.S119_ONBOARDING !== '1', 'S119_ONBOARDING=1 only (auth email rate limit)');
  const companyName = `${MARKER} owner-co ${STAMP}`;
  await page.goto('/sign-up');
  await page.locator('#firstName').fill('S119');
  await page.locator('#lastName').fill('Owner');
  await page.locator('#companyName').fill(companyName);
  await page.locator('#email').fill(OWNER_EMAIL);
  await page.locator('#password').fill(PW);
  const signUp = page.waitForResponse((r) => r.url().includes('/auth/v1/signup'));
  await page.locator('button[type="submit"]').click();
  const res = await signUp;
  expect(res.ok(), await res.text()).toBe(true);
  await expect(page.getByText('Check your email')).toBeVisible();

  const { data: prof } = await admin
    .from('profiles').select('id, user_id, company_id, role').eq('email', OWNER_EMAIL).single();
  const p = prof as { id: string; user_id: string; company_id: string; role: string };
  expect(p.role).toBe('owner');
  const { data: co } = await admin.from('companies').select('name').eq('id', p.company_id).single();
  expect((co as { name: string }).name).toBe(companyName);
  const { count } = await admin
    .from('company_members').select('id', { count: 'exact', head: true }).eq('profile_id', p.id);
  expect(count).toBe(1);
  const { data: sub } = await admin.from('subscriptions').select('status').eq('company_id', p.company_id).single();
  expect((sub as { status: string }).status).toBe('trialing');

  await admin.auth.admin.updateUserById(p.user_id, { email_confirm: true });
  const landed = await signInLeavesSignIn(page, OWNER_EMAIL);
  console.log(`[S119 onboarding] a: owner signed up and signed in → ${landed}`);
});

test('b — an invitee accepts at /invite/accept and joins the inviting company with the invited role', async ({ page }) => {
  const { data: inv, error } = await admin
    .from('invitations')
    .insert({ company_id: inviteCompanyId, email: INVITEE_EMAIL, role: 'crew_member', invited_by: inviterUserId, created_by: inviterUserId })
    .select('id, token')
    .single();
  if (error) throw new Error(`invitation: ${error.message}`);
  const invitation = inv as { id: string; token: string };

  await page.goto(`/invite/accept?token=${invitation.token}`);
  await expect(page.getByText(INVITEE_EMAIL).or(page.locator(`input[value="${INVITEE_EMAIL}"]`))).toBeVisible();
  await page.locator('#firstName').fill('S119');
  await page.locator('#lastName').fill('Invitee');
  await page.locator('#password').fill(PW);
  await page.locator('#confirmPassword').fill(PW);
  const signUp = page.waitForResponse((r) => r.url().includes('/auth/v1/signup'));
  await page.getByRole('button', { name: 'Create Account & Join' }).click();
  const res = await signUp;
  expect(res.ok(), await res.text()).toBe(true);
  await expect(page.getByText('Check your email')).toBeVisible();

  const { data: prof } = await admin
    .from('profiles').select('id, user_id, company_id, role').eq('email', INVITEE_EMAIL).single();
  const p = prof as { id: string; user_id: string; company_id: string; role: string };
  expect(p.company_id).toBe(inviteCompanyId);
  expect(p.role).toBe('crew_member');
  const { count } = await admin
    .from('company_members').select('id', { count: 'exact', head: true }).eq('profile_id', p.id);
  expect(count).toBe(1);
  const { data: invRow } = await admin.from('invitations').select('status').eq('id', invitation.id).single();
  expect((invRow as { status: string }).status).toBe('accepted');

  await admin.auth.admin.updateUserById(p.user_id, { email_confirm: true });
  const landed = await signInLeavesSignIn(page, INVITEE_EMAIL);
  console.log(`[S119 onboarding] b: invitee accepted and signed in → ${landed}`);
});
