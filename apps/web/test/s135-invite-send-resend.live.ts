import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { buildInviteLink } from '@/lib/services/invite-email';

// ============================================================================
// D2 / D3.1 / D4 [S135] — the invite email, the dead-link guard, and resend.
//
// Migrations: 20260915000000_invite_email_type.sql
//             20260916000000_email_has_account.sql
// ============================================================================
//
// These assert the DATABASE-side contracts the three defects depend on, under
// real user sessions. What is deliberately NOT asserted here is that Resend
// delivered anything: the harness must not send live mail to real addresses on
// every run, and a green test that depended on a third party being up would be
// worse than no test. `sendInviteEmail()` is exercised for its bookkeeping —
// see the note on the email_logs test.

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';

const stamp = Date.now();
const FRESH = `josh+s135-fresh-${stamp}@worthprop.com`;

let ownerC: SupabaseClient;
let pmC: SupabaseClient;
let subC: SupabaseClient;
let companyId = '';
let ownerUserId = '';
const invitationIds: string[] = [];

async function makeInvitation(email: string, expiresAt?: string): Promise<string> {
  const { data, error } = await admin
    .from('invitations')
    .insert({
      company_id: companyId,
      email,
      role: 'crew_member',
      invited_by: ownerUserId,
      created_by: ownerUserId,
      token: randomUUID(),
      ...(expiresAt ? { expires_at: expiresAt } : {}),
    })
    .select('id')
    .single();
  if (error) throw new Error(`invitation: ${error.message}`);
  const id = (data as { id: string }).id;
  invitationIds.push(id);
  return id;
}

beforeAll(async () => {
  assertRebuildTest();
  [ownerC, pmC, subC] = (await Promise.all([
    sessionFor(OWNER),
    sessionFor(PM),
    sessionFor(SUB),
  ])) as SupabaseClient[];

  const { data: o } = await admin
    .from('profiles')
    .select('user_id, company_id')
    .eq('email', OWNER)
    .single();
  ownerUserId = (o as { user_id: string }).user_id;
  companyId = (o as { company_id: string }).company_id;
}, 240_000);

afterAll(async () => {
  for (const id of invitationIds) await admin.from('invitations').delete().eq('id', id);
  await admin.from('email_logs').delete().eq('recipient_email', FRESH);
});

// ============================================================================
describe('D2 — `invite` is a real email type', () => {
  it('the email_types row exists, so an invite email can be logged at all', async () => {
    const { data } = await admin
      .from('email_types')
      .select('email_type')
      .eq('email_type', 'invite')
      .maybeSingle();
    expect(data, 'no email_types row — logEmail would violate the FK').not.toBeNull();
  });

  it('⚠️ and email_logs ACCEPTS it — the FK is the live constraint, not a CHECK', async () => {
    // The S135 diagnosis cited `email_logs_email_type_check` over five values.
    // That was the BASELINE; 20260720000000 dropped it for an FK to
    // email_types. This writes a row to prove which constraint is actually in
    // force — a passing INSERT here would have been impossible under either the
    // old CHECK or a missing lookup row.
    const { data, error } = await admin
      .from('email_logs')
      .insert({
        company_id: companyId,
        estimate_id: null,
        signing_session_id: null,
        resend_message_id: null,
        email_type: 'invite',
        recipient_email: FRESH,
        sender_email: 'probe@example.com',
        subject: 'S135 probe',
        status: 'sent',
      })
      .select('id')
      .single();

    expect(error?.message ?? null, 'email_logs refused email_type=invite').toBeNull();
    expect(data).not.toBeNull();
    await admin.from('email_logs').delete().eq('id', (data as { id: string }).id);
  });
});

// ============================================================================
describe('D3.1 — email_has_account: a boolean, for Owner/Admin only', () => {
  it('true for an address that already has an account — the josh+test2 case', async () => {
    const { data, error } = await ownerC.rpc('email_has_account', { p_email: OWNER });
    expect(error?.message ?? null).toBeNull();
    expect(data, 'an existing account reported as free').toBe(true);
  });

  it('is case- and whitespace-insensitive — a typed address is not normalised', async () => {
    const { data } = await ownerC.rpc('email_has_account', {
      p_email: `  ${OWNER.toUpperCase()}  `,
    });
    expect(data, 'casing or padding defeated the check').toBe(true);
  });

  it('false for an address nobody holds', async () => {
    const { data } = await ownerC.rpc('email_has_account', { p_email: FRESH });
    expect(data).toBe(false);
  });

  it('⚠️ REFUSES a PM and a subcontractor — it is not an open oracle', async () => {
    // The disclosure is small but real, so it is fenced to the two roles that
    // could issue the invitation anyway.
    for (const [label, client] of [
      ['project_manager', pmC],
      ['subcontractor', subC],
    ] as const) {
      const { error } = await client.rpc('email_has_account', { p_email: OWNER });
      expect(error, `${label} was allowed to probe addresses`).not.toBeNull();
    }
  });

  it('⚠️ and it never says WHICH company — the whole return is a boolean', async () => {
    const { data } = await ownerC.rpc('email_has_account', { p_email: OWNER });
    expect(typeof data, 'the function returned a shape, not a boolean').toBe('boolean');
  });
});

// ============================================================================
describe('D4 — the link is retrievable, and resend resets the clock', () => {
  it('⚠️ an Owner can read `token` off a pending invitation — no policy change needed', async () => {
    const id = await makeInvitation(FRESH);
    const { data, error } = await ownerC
      .from('invitations')
      .select('id, token, expires_at')
      .eq('id', id)
      .single();

    expect(error?.message ?? null, 'the Owner cannot read the token').toBeNull();
    const row = data as { token: string };
    expect(row.token, 'no token returned — Copy link would produce a dead URL').toBeTruthy();
    expect(buildInviteLink(row.token, 'https://example.com')).toBe(
      `https://example.com/invite/accept?token=${row.token}`
    );
  });

  it('⚠️ resetting expires_at REVIVES an expired STAFF invitation — the token is reused', async () => {
    // The D4 requirement in one assertion: a resend that hands back an expired
    // link solves nothing. Driven through get_invitation_status() because that
    // is what the accept screen and the D1 trigger both consult.
    //
    // ⚠️ TITLE QUALIFIED AT S164, and the fixture is why it still passes:
    // `makeInvitation()` uses `role: 'crew_member'`. For a **client**
    // invitation this is NO LONGER TRUE — M9's R2 rules that there is "no
    // separate invite-expiry clock", so `get_invitation_status()` ignores
    // `expires_at` entirely and reads the project's 45-day window instead.
    // Resetting `expires_at` on a client invite revives nothing.
    // See `20261017000000_m9_client_lifecycle.sql` §1 and
    // `s164-m9-client-lifecycle.live.ts` group E, which asserts both halves.
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const id = await makeInvitation(`josh+s135-revive-${stamp}@worthprop.com`, past);

    const { data: before } = await ownerC
      .from('invitations')
      .select('token')
      .eq('id', id)
      .single();
    const token = (before as { token: string }).token;

    const { data: expiredReason } = await admin.rpc('get_invitation_status', {
      invite_token: token,
    });
    expect(expiredReason, 'the fixture is not actually expired').toBe('expired');

    // What the resend route does.
    const { error: updErr } = await ownerC
      .from('invitations')
      .update({ expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString() })
      .eq('id', id);
    expect(updErr?.message ?? null, 'the Owner cannot extend an invitation').toBeNull();

    const { data: afterReason } = await admin.rpc('get_invitation_status', {
      invite_token: token,
    });
    expect(afterReason, 'the invitation is still unusable after a resend').toBe('valid');

    // REUSED, not reissued [Q6]: a copy already circulating keeps working.
    const { data: after } = await ownerC.from('invitations').select('token').eq('id', id).single();
    expect((after as { token: string }).token, 'the token was rotated — old copies now dead').toBe(
      token
    );
  });

  it('a PM cannot read or extend invitations at all', async () => {
    // invitations_{select,update}_owner_admin. Without this, "Copy link" would
    // be a control the wrong roles could reach through the API.
    const id = await makeInvitation(`josh+s135-pmcheck-${stamp}@worthprop.com`);
    const { data } = await pmC.from('invitations').select('id, token').eq('id', id);
    expect(data ?? [], 'a PM read an invitation token').toEqual([]);
  });
});
