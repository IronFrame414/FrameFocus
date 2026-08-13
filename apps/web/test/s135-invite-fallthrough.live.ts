import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, assertRebuildTest, purgeCompaniesNamed, TEST_PASSWORD } from './live-session';

// ============================================================================
// D1 [S135] — AN UNRESOLVABLE INVITE TOKEN FAILS LOUDLY AND LEAVES NOTHING.
//
// Migration: 20260914000000_invite_no_silent_fallthrough.sql
// ============================================================================
//
// Found on PRODUCTION. `handle_new_user()` fell through from the invited path
// to the OWNER path whenever the token did not resolve, silently provisioning a
// company, a 30-day trial subscription, a `trial_emails` row and a default tag
// set. Measured on rebuild-test BEFORE the fix (the trigger did not exist here
// at all, which is its own finding — see the migration header):
//
//     signUp error: NONE      profile: null      trial_emails row: []
//
// ⚠️ USES admin.createUser, NOT signUp, AND THAT IS NOT A SHORTCUT.
// `user_metadata` lands in `raw_user_meta_data` exactly as signUp's
// `options.data` does, so the SAME trigger runs the SAME branch. What it avoids
// is Supabase's email rate limit, which live-session.ts documents and which bit
// this suite on its second run of the session. The path under test is identical;
// only the confirmation email is skipped.

const OWNER = 'josh+test50@worthprop.com';
const stamp = Date.now();
const EMAIL_BOGUS = `josh+s135-bogus-${stamp}@worthprop.com`;
const EMAIL_EXPIRED = `josh+s135-expired-${stamp}@worthprop.com`;
const EMAIL_OWNER = `josh+s135-owner-${stamp}@worthprop.com`;

let companyId = '';
let ownerUserId = '';
const invitationIds: string[] = [];

/** Everything a signup can leave behind, removed by email. */
async function purge(email: string): Promise<void> {
  const { data: p } = await admin
    .from('profiles')
    .select('id, company_id')
    .eq('email', email)
    .maybeSingle();
  if (p) {
    const row = p as { id: string; company_id: string };
    await admin.from('company_members').delete().eq('profile_id', row.id);
    await admin.from('profiles').delete().eq('id', row.id);
    await admin.from('tag_options').delete().eq('company_id', row.company_id);
    await admin.from('subscriptions').delete().eq('company_id', row.company_id);
    await admin.from('companies').delete().eq('id', row.company_id);
  }
  await admin.from('trial_emails').delete().eq('email', email.toLowerCase());
  await admin.from('invitations').delete().eq('email', email);
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const u = (list?.users ?? []).find((x) => x.email === email);
  if (u) await admin.auth.admin.deleteUser(u.id);
}

/** What a signup carrying this token leaves behind. All of it. */
async function residue(email: string) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const user = (list?.users ?? []).find((x) => x.email === email) ?? null;
  const { data: profile } = await admin
    .from('profiles')
    .select('id, company_id, role')
    .eq('email', email)
    .maybeSingle();
  const { data: trial } = await admin
    .from('trial_emails')
    .select('email')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  const company = profile
    ? (
        await admin
          .from('companies')
          .select('id')
          .eq('id', (profile as { company_id: string }).company_id)
          .maybeSingle()
      ).data
    : null;
  return { user, profile, trial, company };
}

async function createInvitation(email: string, opts: { expiresAt?: string; status?: string }) {
  const token = randomUUID();
  const { data, error } = await admin
    .from('invitations')
    .insert({
      company_id: companyId,
      email,
      role: 'crew_member',
      invited_by: ownerUserId,
      created_by: ownerUserId,
      token,
      ...(opts.expiresAt ? { expires_at: opts.expiresAt } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    })
    .select('id')
    .single();
  if (error) throw new Error(`invitation: ${error.message}`);
  invitationIds.push((data as { id: string }).id);
  return token;
}

/**
 * [#2-s147] Only the OWNER signup makes a company (`S135 Owner Co`) — the other
 * two carry an `invitation_token`, so `handle_new_user()` joins an existing
 * tenant instead of building one. 1 leaked per run.
 */
const MARKERS = ['S135'] as const;

beforeAll(async () => {
  assertRebuildTest();
  const { data: o } = await admin
    .from('profiles')
    .select('user_id, company_id')
    .eq('email', OWNER)
    .single();
  ownerUserId = (o as { user_id: string }).user_id;
  companyId = (o as { company_id: string }).company_id;

  for (const e of [EMAIL_BOGUS, EMAIL_EXPIRED, EMAIL_OWNER]) await purge(e);
  await purgeCompaniesNamed(admin, MARKERS);
}, 240_000);

afterAll(async () => {
  for (const e of [EMAIL_BOGUS, EMAIL_EXPIRED, EMAIL_OWNER]) await purge(e);
  for (const id of invitationIds) await admin.from('invitations').delete().eq('id', id);
  await purgeCompaniesNamed(admin, MARKERS);

  // A cleanup that cannot fail its own run is not a cleanup.
  const { data } = await admin.from('companies').select('id').ilike('name', 'S135%');
  expect(data ?? [], 'S135 companies survived teardown').toHaveLength(0);
});

describe('⚠️ the fallthrough is closed', () => {
  it('a token that matches NO invitation is refused, and leaves NOTHING', async () => {
    const { error } = await admin.auth.admin.createUser({
      email: EMAIL_BOGUS,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: 'S135', last_name: 'Bogus', invitation_token: randomUUID() },
    });

    expect(error, 'the signup SUCCEEDED — the fallthrough is still open').not.toBeNull();

    const r = await residue(EMAIL_BOGUS);
    // Each asserted separately: "no company" and "no trial row" are different
    // failures, and the trial row is the one that cannot be undone.
    expect(r.user, 'an auth user survived a refused signup').toBeNull();
    expect(r.profile, 'a profile was created for a refused signup').toBeNull();
    expect(r.company, 'A COMPANY WAS PROVISIONED — this is the production defect').toBeNull();
    expect(r.trial, 'trial eligibility was burnt by a refused signup').toBeNull();
  });

  it('an EXPIRED invitation is refused too — the case Josh actually hit', async () => {
    const token = await createInvitation(EMAIL_EXPIRED, {
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    });

    // Counterfactual, evaluated OUTSIDE the trigger: the invitation is real,
    // is pending, and is expired. Without this the refusal below could just be
    // "no such invitation" again, which the previous test already covers.
    const { data: inv } = await admin
      .from('invitations')
      .select('status, expires_at')
      .eq('token', token)
      .single();
    expect((inv as { status: string }).status).toBe('pending');
    expect(new Date((inv as { expires_at: string }).expires_at).getTime()).toBeLessThan(Date.now());

    const { error } = await admin.auth.admin.createUser({
      email: EMAIL_EXPIRED,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: 'S135', last_name: 'Expired', invitation_token: token },
    });
    expect(error, 'an expired invite still provisioned an account').not.toBeNull();

    const r = await residue(EMAIL_EXPIRED);
    expect(r.user).toBeNull();
    expect(r.company).toBeNull();
    expect(r.trial).toBeNull();
  });
});

describe('⚠️ the path D1 SHARES must be unaffected — a genuine owner signup', () => {
  it('no token at all still provisions a company, a trial and a tag set', async () => {
    // The whole risk of D1's fix is over-reach: the refusal sits inside the same
    // function as the owner path. If this goes red, the fix broke signup.
    const { error } = await admin.auth.admin.createUser({
      email: EMAIL_OWNER,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: 'S135', last_name: 'Owner', company_name: 'S135 Owner Co' },
    });
    expect(error, `a genuine owner signup was refused: ${error?.message ?? ''}`).toBeNull();

    const r = await residue(EMAIL_OWNER);
    expect(r.user, 'no auth user').not.toBeNull();
    expect(r.profile, 'no profile').not.toBeNull();
    expect((r.profile as { role: string }).role).toBe('owner');
    expect(r.company, 'no company was created for a real owner signup').not.toBeNull();
    expect(r.trial, 'trial_emails row missing — the trial was not granted').not.toBeNull();

    const { data: sub } = await admin
      .from('subscriptions')
      .select('status, trial_end')
      .eq('company_id', (r.profile as { company_id: string }).company_id)
      .single();
    expect((sub as { status: string }).status).toBe('trialing');
    expect((sub as { trial_end: string | null }).trial_end).not.toBeNull();

    const { count: tags } = await admin
      .from('tag_options')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', (r.profile as { company_id: string }).company_id);
    expect(tags ?? 0, 'seed_default_tags did not run').toBeGreaterThan(0);
  });
});

describe('get_invitation_status — the four reasons the UI can now distinguish', () => {
  it('reports valid / expired / already_used / cancelled / unknown', async () => {
    const reason = async (token: string) => {
      const { data } = await admin.rpc('get_invitation_status', { invite_token: token });
      return data as string;
    };

    const valid = await createInvitation(`josh+s135-r-valid-${stamp}@worthprop.com`, {});
    expect(await reason(valid)).toBe('valid');

    const expired = await createInvitation(`josh+s135-r-exp-${stamp}@worthprop.com`, {
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    expect(await reason(expired)).toBe('expired');

    const used = await createInvitation(`josh+s135-r-used-${stamp}@worthprop.com`, {
      status: 'accepted',
    });
    expect(await reason(used)).toBe('already_used');

    const cancelled = await createInvitation(`josh+s135-r-canc-${stamp}@worthprop.com`, {
      status: 'cancelled',
    });
    expect(await reason(cancelled)).toBe('cancelled');

    expect(await reason(randomUUID()), 'an unknown token must not be distinguishable').toBe('unknown');
  });

  it('is reachable by an ANON caller — the accept screen has no session', async () => {
    // The accept page runs before the user exists. If this were authenticated-
    // only, every reason would read as a failure to the person who needs it.
    const { createClient } = await import('@supabase/supabase-js');
    const { URL_, ANON } = await import('./live-session');
    const anonC = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { data, error } = await anonC.rpc('get_invitation_status', { invite_token: randomUUID() });
    expect(error?.message ?? null, 'anon cannot call get_invitation_status').toBeNull();
    expect(data).toBe('unknown');
  });
});
