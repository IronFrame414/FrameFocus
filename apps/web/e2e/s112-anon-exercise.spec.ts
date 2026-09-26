import { test, expect, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from './hub-fixture';
import { requireTestEnv } from './env';
import { deleteCompanies } from '../test-support/company-purge';

// ============================================================================
// S112 — the five LOGGED-OUT surfaces, exercised after the anon lockdown.
// Runs only with S112_ANON_EXERCISE=1. rebuild-test only (adminClient guards).
// ============================================================================
// RULED [Josh, S112] as the condition on merging 20261870000000 +
// 20261880000000: "Do not reason about which. PROVE IT, by exercise on
// rebuild-test AFTER both migrations are applied" —
//   a) a live /bid/{token} page, logged out: it renders, with its documents
//   b) a team invite accepted from its emailed link, logged out
//   c) a proposal opened and signed from its emailed link, logged out
//   d) a change order opened and signed from its emailed link, logged out
//   e) a password reset completed from its emailed link
// "If any of the five fails, STOP."
//
// Every link is built exactly as the email builds it (invite-email.ts,
// sub-bid-request-send.ts, proposals/send, change-orders/[id]/send,
// team-reset.ts). The TOKENS are minted with the service role rather than by
// sending mail: rebuild-test has no Send Email Hook and GoTrue's built-in
// mailer delivers only to project team members.
//
// CONTROLS THAT MUST FIRE: the direct anon calls the lockdown refuses are
// asserted refused here too, so a pass cannot come from a database where the
// lockdown was never applied.
//
// ⚠️ STANDING PRACTICE [Josh, S112]: everything is DISPOSABLE — a tenant named
// DISPOSABLE_NAME, logins under EMAIL_PREFIX — created and removed here, and
// the teardown FAILS if anything is left.
// ============================================================================

const RUN = process.env.S112_ANON_EXERCISE === '1';
// S112_ANON_SWEEP=1 runs ONLY the sweep: every tenant named DISPOSABLE_NAME and
// every EMAIL_PREFIX login is removed, and it fails if anything is left.
const SWEEP = process.env.S112_ANON_SWEEP === '1';
const DISPOSABLE_NAME = 'DISPOSABLE S112 ANON EXERCISE — delete me';
const EMAIL_PREFIX = 'disposable-s112-anon-';
const STAMP = Date.now();
const OWNER_EMAIL = `${EMAIL_PREFIX}owner-${STAMP}@example.invalid`;
const INVITEE_EMAIL = `${EMAIL_PREFIX}invitee-${STAMP}@example.invalid`;
const OWNER_PW = `Disposable-${crypto.randomUUID()}!9`;
const NEW_PW = `Disposable-new-${crypto.randomUUID()}!9`;
const INVITEE_PW = `Disposable-inv-${crypto.randomUUID()}!9`;
const BUCKET = 'project-files';

test.describe.configure({ mode: 'serial' });
test.skip(!RUN && !SWEEP, 'S112_ANON_EXERCISE=1 or S112_ANON_SWEEP=1 only');

let admin: SupabaseClient;
let companyId = '';
let ownerUserId = '';
let ownerMemberId = '';
let contactId = '';
let projectId = '';
const paths: string[] = [];

async function one<T>(
  q: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  what: string
): Promise<T> {
  const { data, error } = await q;
  if (error || data === null) throw new Error(`${what}: ${error?.message ?? 'no row'}`);
  return data;
}

async function anonRpc(fn: string, body: Record<string, unknown>) {
  const url = requireTestEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = requireTestEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.text() };
}

async function makeEstimate(label: string, status: string) {
  const est = await one<{ id: string }>(
    admin
      .from('estimates')
      .insert({
        company_id: companyId,
        name: `S112 ANON ${label}`,
        // next_estimate_number() keys on the CALLER's company; the service role has none.
        estimate_number: `S112-ANON-${label}`,
        contact_id: contactId,
        status: 'draft',
        created_by: ownerUserId,
        created_by_role: 'owner',
      })
      .select('id')
      .single(),
    `estimate ${label}`
  );
  const cat = await one<{ id: string }>(
    admin
      .from('estimate_categories')
      .insert({ company_id: companyId, estimate_id: est.id, name: 'Framing', sort_order: 0 })
      .select('id')
      .single(),
    'category'
  );
  const li = await one<{ id: string }>(
    admin
      .from('estimate_line_items')
      .insert({
        company_id: companyId,
        estimate_id: est.id,
        category_id: cat.id,
        name: 'Wall framing',
        sort_order: 0,
      })
      .select('id')
      .single(),
    'line item'
  );
  if (status !== 'draft') {
    const up = await admin.from('estimates').update({ status }).eq('id', est.id);
    if (up.error) throw new Error(`estimate → ${status}: ${up.error.message}`);
  }
  return { estimateId: est.id, lineId: li.id };
}

async function signTyped(page: Page, name: string, button: string) {
  await page.getByPlaceholder('Full name').fill(name);
  await page.getByRole('button', { name: 'Type', exact: true }).click();
  await page.getByPlaceholder('Type your name').fill(name);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: button }).click();
}

test.beforeAll(async () => {
  admin = adminClient();
  if (!RUN) return;
  const u = await admin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: OWNER_PW,
    email_confirm: true,
  });
  if (u.error) throw new Error(`owner: ${u.error.message}`);
  ownerUserId = u.data.user.id;
  const prof = await one<{ id: string; company_id: string }>(
    admin.from('profiles').select('id, company_id').eq('user_id', ownerUserId).single(),
    'owner profile'
  );
  companyId = prof.company_id;
  await admin.from('companies').update({ name: DISPOSABLE_NAME }).eq('id', companyId);
  ownerMemberId = (
    await one<{ id: string }>(
      admin.from('company_members').select('id').eq('profile_id', prof.id).single(),
      'owner member'
    )
  ).id;
  contactId = (
    await one<{ id: string }>(
      admin
        .from('contacts')
        .insert({
          company_id: companyId,
          first_name: 'Disposable',
          last_name: 'Client',
          contact_type: 'client',
          email: `${EMAIL_PREFIX}client-${STAMP}@example.invalid`,
        })
        .select('id')
        .single(),
      'contact'
    )
  ).id;
  projectId = (
    await one<{ id: string }>(
      admin
        .from('projects')
        .insert({
          company_id: companyId,
          name: 'S112 ANON project',
          contact_id: contactId,
          project_type: 'fixed_price',
          project_number: 'PRJ-DISPOSABLE',
          project_internal_seq: 1,
        })
        .select('id')
        .single(),
      'project'
    )
  ).id;
});

// ⚠️ A SIGNED PROPOSAL MAKES THE SHARED PURGE FAIL, so the estimates go first
// (and a signed CO needs its archive gate — see below).
// deleteCompanies() removes `files` before `estimates`; deleting the stamped
// PDF's row sets estimates.signed_proposal_file_id to NULL through its FK, and
// the sent-estimate freeze (20261330000000) refuses that as "A signature stamp
// cannot be rewritten." Found by this file's first teardown. Deleting the
// estimate (and its children) before its files never rewrites the stamp.
async function removeTenant(id: string) {
  const { data: files } = await admin.from('files').select('file_path').eq('company_id', id);
  const all = ((files ?? []) as { file_path: string }[]).map((x) => x.file_path);
  if (all.length) await admin.storage.from(BUCKET).remove(all);
  // A SIGNED change order deletes only once its archived_documents copy exists
  // (enforce_change_order_delete_boundary — the gate tenant deletion passes).
  // Same order as s138-trial-deletion-run: stub-archive → delete the COs →
  // delete the archive rows. Without it a disposable tenant that signed a CO
  // could never be removed, and the harness would only soft-delete.
  const { data: signedCos } = await admin
    .from('change_orders')
    .select('id')
    .eq('company_id', id)
    .not('signed_at', 'is', null);
  for (const co of (signedCos ?? []) as { id: string }[]) {
    const up = await admin
      .from('archived_documents')
      .upsert(
        {
          source_table: 'change_orders',
          source_id: co.id,
          company_id: id,
          company_name: 'S112 anon teardown stub',
          document: {},
        },
        { onConflict: 'source_table,source_id', ignoreDuplicates: true }
      );
    if (up.error) throw new Error(`stub archive: ${up.error.message}`);
  }
  for (const t of [
    'signing_sessions',
    'estimate_sub_bid_requests',
    'estimate_line_items',
    'estimate_categories',
    'estimates',
    'co_signing_sessions',
    'change_orders',
    'archived_documents',
    'subcontractors',
    'invitations',
  ]) {
    const d = await admin.from(t).delete().eq('company_id', id);
    if (d.error) throw new Error(`purge ${t}: ${d.error.message}`);
  }
  await deleteCompanies(admin, [id]);
}

async function sweep() {
  const { data: cos } = await admin.from('companies').select('id').eq('name', DISPOSABLE_NAME);
  for (const c of (cos ?? []) as { id: string }[]) await removeTenant(c.id);
  const { data: profs } = await admin
    .from('profiles')
    .select('company_id')
    .like('email', `${EMAIL_PREFIX}%`);
  for (const p of (profs ?? []) as { company_id: string }[]) await removeTenant(p.company_id);
  await admin.from('trial_emails').delete().like('email', `${EMAIL_PREFIX}%`);
  let users = 0;
  for (let page = 1; ; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const batch = data?.users ?? [];
    for (const usr of batch.filter((x) => x.email?.startsWith(EMAIL_PREFIX))) {
      const d = await admin.auth.admin.deleteUser(usr.id);
      if (d.error) throw new Error(`deleteUser ${usr.email}: ${d.error.message}`);
      users++;
    }
    if (batch.length < 1000) break;
  }
  const left = await Promise.all([
    admin
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('name', DISPOSABLE_NAME),
    admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .like('email', `${EMAIL_PREFIX}%`),
    admin
      .from('trial_emails')
      .select('id', { count: 'exact', head: true })
      .like('email', `${EMAIL_PREFIX}%`),
  ]);
  const counts = left.map((r) => r.count ?? 0);
  console.log(
    `[S112 anon teardown] removed ${(cos ?? []).length} tenant(s), ${users} login(s); company/profile/trial_emails left: ${counts.join('/')}`
  );
  expect(counts, 'the disposable exercise left rows behind').toEqual([0, 0, 0]);
}

test.afterAll(async () => {
  if (!RUN || !admin) return;
  await sweep();
});

test('sweep — nothing disposable is left on rebuild-test', async () => {
  test.skip(!SWEEP, 'S112_ANON_SWEEP=1 only');
  await sweep();
});

test('control — the lockdown IS applied: direct anon calls are refused', async () => {
  test.skip(!RUN, 'S112_ANON_EXERCISE=1 only');
  const bid = await anonRpc('get_sub_bid_request', { p_token: 'x' });
  const money = await anonRpc('apply_change_order_budget', {
    p_change_order_id: '00000000-0000-0000-0000-000000000000',
  });
  console.log(
    `[S112 anon] control: anon get_sub_bid_request ${bid.status}; anon apply_change_order_budget ${money.status}`
  );
  // 42501 = permission denied for function — refused on the GRANT, not on a
  // missing function (PGRST202 / 404) or a bad argument.
  for (const r of [bid, money]) {
    expect([401, 403], r.body).toContain(r.status);
    expect(r.body).toContain('42501');
  }
});

test('a — /bid/{token} logged out: renders, takes a bid, serves its documents', async ({
  page,
  request,
}) => {
  test.skip(!RUN, 'S112_ANON_EXERCISE=1 only');
  const { estimateId, lineId } = await makeEstimate('bid', 'draft');
  const sub = await one<{ id: string }>(
    admin
      .from('subcontractors')
      .insert({ company_id: companyId, company_name: 'DISPOSABLE S112 Sub' })
      .select('id')
      .single(),
    'subcontractor'
  );
  const scopePath = `${companyId}/estimates/${estimateId}/${crypto.randomUUID()}-S112-ANON-scope.pdf`;
  paths.push(scopePath);
  expect(
    (
      await admin.storage.from(BUCKET).upload(scopePath, Buffer.from('%PDF-1.4 S112 anon scope'), {
        contentType: 'application/pdf',
      })
    ).error
  ).toBeNull();
  const f = await admin.from('files').insert({
    company_id: companyId,
    estimate_id: estimateId,
    category: 'other',
    file_name: 'S112-ANON-scope.pdf',
    file_path: scopePath,
    file_size: 24,
    mime_type: 'application/pdf',
    created_by: ownerUserId,
  });
  expect(f.error, f.error?.message).toBeNull();
  const req = await one<{ token: string }>(
    admin
      .from('estimate_sub_bid_requests')
      .insert({
        company_id: companyId,
        estimate_id: estimateId,
        line_item_id: lineId,
        subcontractor_id: sub.id,
        status: 'sent',
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        scope_text: 'S112 ANON scope text',
      })
      .select('token')
      .single(),
    'bid request'
  );

  await page.goto(`/bid/${req.token}`);
  await expect(page.getByText('S112 ANON scope text')).toBeVisible();
  await expect(page.getByText('Link unavailable')).toHaveCount(0);
  const docOnPage = await page.getByText('S112-ANON-scope.pdf').count();

  const list = await request.get(`/api/bid/${req.token}/files`);
  const listed = (await list.json()) as {
    files?: { file_name: string; url?: string; signedUrl?: string }[];
  };
  const doc = (listed.files ?? []).find((x) => x.file_name === 'S112-ANON-scope.pdf');
  const docUrl = doc?.url ?? doc?.signedUrl;
  const fetched = docUrl ? await request.get(docUrl) : null;
  console.log(
    `[S112 anon] a: page rendered; documents route ${list.status()} listing ${(listed.files ?? []).length}; scope PDF fetch ${fetched?.status() ?? 'no url'}; document named ON THE PAGE: ${docOnPage}`
  );
  expect(list.status()).toBe(200);
  expect(doc, JSON.stringify(listed)).toBeTruthy();
  expect(fetched?.status()).toBe(200);

  await page.getByPlaceholder('0.00').fill('1234');
  await page.getByRole('button', { name: 'Submit bid' }).click();
  await expect(page.getByText('Bid submitted')).toBeVisible();
  const row = await one<{ status: string; reply_bid_amount: number }>(
    admin
      .from('estimate_sub_bid_requests')
      .select('status, reply_bid_amount')
      .eq('token', req.token)
      .single(),
    'bid row'
  );
  console.log(
    `[S112 anon] a: bid submitted → row status ${row.status}, amount ${row.reply_bid_amount}`
  );
  expect(row.status).toBe('submitted');
  expect(Number(row.reply_bid_amount)).toBe(1234);
});

test('b — a team invite accepted from its emailed link, logged out', async ({ page }) => {
  test.skip(!RUN, 'S112_ANON_EXERCISE=1 only');
  const inv = await one<{ token: string; id: string }>(
    admin
      .from('invitations')
      .insert({
        company_id: companyId,
        email: INVITEE_EMAIL,
        role: 'crew_member',
        invited_by: ownerUserId,
        created_by: ownerUserId,
      })
      .select('id, token')
      .single(),
    'invitation'
  );
  await page.goto(`/invite/accept?token=${inv.token}`);
  await expect(
    page.getByText(INVITEE_EMAIL).or(page.locator(`input[value="${INVITEE_EMAIL}"]`))
  ).toBeVisible();
  await page.locator('#firstName').fill('Disposable');
  await page.locator('#lastName').fill('Invitee');
  await page.locator('#password').fill(INVITEE_PW);
  await page.locator('#confirmPassword').fill(INVITEE_PW);
  const signUp = page.waitForResponse((r) => r.url().includes('/auth/v1/signup'));
  await page.getByRole('button', { name: 'Create Account & Join' }).click();
  const res = await signUp;
  const resBody = await res.text();
  const ok = await page
    .getByText('Check your email')
    .isVisible()
    .catch(() => false);
  console.log(
    `[S112 anon] b: invite page rendered with the invitee; signUp ${res.status()} ${res.ok() ? '' : resBody.slice(0, 160)}; success screen: ${ok}`
  );

  // The account either exists now or, if rebuild-test's mailer refused the
  // confirmation mail, GoTrue rolled it back. Either way the row must show
  // which — and whether the invitation trigger ran is read from the DB.
  const { data: prof } = await admin
    .from('profiles')
    .select('company_id, role')
    .eq('email', INVITEE_EMAIL)
    .maybeSingle();
  const { data: invRow } = await admin
    .from('invitations')
    .select('status')
    .eq('id', inv.id)
    .single();
  console.log(
    `[S112 anon] b: invitee profile ${prof ? `${(prof as { role: string }).role} in disposable tenant: ${(prof as { company_id: string }).company_id === companyId}` : 'none'}; invitation ${(invRow as { status: string }).status}`
  );
  expect(res.ok(), resBody).toBe(true);
  expect(ok).toBe(true);
  expect((prof as { company_id: string } | null)?.company_id).toBe(companyId);
  expect((invRow as { status: string }).status).toBe('accepted');

  // …and the new account signs in, logged-out browser → dashboard.
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.locator('#email').fill(INVITEE_EMAIL);
  await page.locator('#password').fill(INVITEE_PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 30_000 });
  console.log(`[S112 anon] b: invitee signed in → ${new URL(page.url()).pathname}`);
});

test('c — a proposal opened and signed from its emailed link, logged out', async ({ page }) => {
  test.skip(!RUN, 'S112_ANON_EXERCISE=1 only');
  const { estimateId } = await makeEstimate('proposal', 'sent');
  const token = crypto.randomUUID();
  const s = await admin.from('signing_sessions').insert({
    company_id: companyId,
    estimate_id: estimateId,
    token,
    recipient_email: `${EMAIL_PREFIX}client-${STAMP}@example.invalid`,
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });
  expect(s.error, s.error?.message).toBeNull();
  await page.goto(`/sign/${token}`);
  await expect(page.getByText('Link unavailable')).toHaveCount(0);
  await expect(page.getByText('Accept & Sign')).toBeVisible();
  await signTyped(page, 'Disposable Client', 'Sign Proposal');
  await expect(page.getByText('Thank you!')).toBeVisible({ timeout: 30_000 });
  const sess = await one<{ status: string }>(
    admin.from('signing_sessions').select('status').eq('token', token).single(),
    'session'
  );
  const est = await one<{ status: string }>(
    admin.from('estimates').select('status').eq('id', estimateId).single(),
    'estimate'
  );
  console.log(`[S112 anon] c: signed → session ${sess.status}, estimate ${est.status}`);
  expect(sess.status).toBe('completed');
});

test('d — a change order opened and signed from its emailed link, logged out', async ({ page }) => {
  test.skip(!RUN, 'S112_ANON_EXERCISE=1 only');
  const co = await one<{ id: string }>(
    admin
      .from('change_orders')
      .insert({
        company_id: companyId,
        project_id: projectId,
        co_number: `CO-S112-ANON-${STAMP}`,
        title: 'S112 ANON change order',
        co_type: 'fixed_price',
        author_member_id: ownerMemberId,
        pricing_mode: 'markup',
        status: 'draft',
        net_delta: 500,
      })
      .select('id')
      .single(),
    'change order'
  );
  const up = await admin.from('change_orders').update({ status: 'sent' }).eq('id', co.id);
  expect(up.error, up.error?.message).toBeNull();
  const token = crypto.randomUUID();
  const s = await admin.from('co_signing_sessions').insert({
    company_id: companyId,
    change_order_id: co.id,
    token,
    recipient_email: `${EMAIL_PREFIX}client-${STAMP}@example.invalid`,
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });
  expect(s.error, s.error?.message).toBeNull();
  await page.goto(`/sign-co/${token}`);
  await expect(page.getByText('Link unavailable')).toHaveCount(0);
  await expect(page.getByText('S112 ANON change order')).toBeVisible();
  await signTyped(page, 'Disposable Client', 'Sign Change Order');
  await expect(page.getByText('Thank you!')).toBeVisible({ timeout: 30_000 });
  const sess = await one<{ status: string }>(
    admin.from('co_signing_sessions').select('status').eq('token', token).single(),
    'co session'
  );
  const row = await one<{ status: string }>(
    admin.from('change_orders').select('status').eq('id', co.id).single(),
    'co'
  );
  console.log(`[S112 anon] d: signed → session ${sess.status}, change order ${row.status}`);
  expect(sess.status).toBe('completed');
  expect(row.status).toBe('signed');
});

test('e — a password reset completed from its emailed link', async ({ page }) => {
  test.skip(!RUN, 'S112_ANON_EXERCISE=1 only');
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: OWNER_EMAIL,
  });
  expect(error, error?.message).toBeNull();
  await page.goto(`/auth/confirm?token_hash=${data!.properties!.hashed_token}&type=recovery`);
  await page.waitForURL('**/reset-password');
  await page.locator('#password').fill(NEW_PW);
  await page.locator('#confirm').fill(NEW_PW);
  await page.getByRole('button', { name: 'Update password' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/reset-password'), { timeout: 30_000 });
  console.log(`[S112 anon] e: password updated → ${new URL(page.url()).pathname}`);

  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.locator('#email').fill(OWNER_EMAIL);
  await page.locator('#password').fill(NEW_PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 30_000 });
  console.log(`[S112 anon] e: signed in with the NEW password → ${new URL(page.url()).pathname}`);
});
