/**
 * S160 — the Send Email Hook against the real database.
 *
 * P1 (route Auth email through Resend), P2 (log it), P3 (an invited user is
 * confirmed without an email). Findings:
 * `docs/specs/S159-invite-email-investigation.md` §4 and §8. Rulings: Josh, S160.
 *
 * FAILING-THEN-PASSING: every assertion fails before this session — the module
 * did not exist, and the six `auth_*` rows `logEmail()` needs land in
 * `20261009000000` in the same commit.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ THE NETWORK HOP TO RESEND IS MOCKED. EVERYTHING ELSE IS REAL.
 * ---------------------------------------------------------------------------
 * Real database, real `auth.users` trigger, real invited-signup path, real
 * `logEmail()` against the real FK, real template render. What is faked is the
 * single call `resend.emails.send()`, for two reasons:
 *
 *   1. These are ACCOUNT-SECURITY emails. A harness that really delivers
 *      "reset your password" to a live address, on every run, is a bad idea
 *      regardless of whose address it is.
 *   2. Faking it is what makes the FAILURE path testable at all — B4 forces an
 *      error and proves the row is still logged as `failed`, which is precisely
 *      the case S159 found nobody could see.
 *
 * **Resend's reachability is proven elsewhere and deliberately not re-proven
 * here**: `s160-invite-send.live.ts` performs a real send through the same
 * `sendEmail()` and asserts a real `resend_message_id` comes back. Between the
 * two, every link in the chain is exercised once.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest } from './live-session';

/** What the faked Resend returns. Mutated per test; see B4. */
const state = vi.hoisted(() => ({
  result: { data: { id: 'mock-resend-id' } as { id: string } | null, error: null as { message: string } | null },
  calls: [] as Array<{ from: string; to: string[]; subject: string }>,
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (params: { from: string; to: string[]; subject: string }) => {
        state.calls.push({ from: params.from, to: params.to, subject: params.subject });
        return state.result;
      },
    };
  },
}));

import { handleAuthEmail, invitedCompanyFor, type AuthEmailPayload } from '@/lib/services/auth-email';

const OWNER = 'josh+test50@worthprop.com';
const MARKER = 's160-auth';
const INVITEE = `josh+${MARKER}-invitee@worthprop.com`;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

let companyId: string;
let ownerUserId: string;
let ownerProfileCompany: string;
/** The invited user, created through the REAL trigger. */
let inviteeUserId: string;
let inviteeToken: string;
const madeLogIds: string[] = [];

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

function payloadFor(
  userId: string,
  email: string,
  action: string,
  metadata: Record<string, unknown> | null = null
): AuthEmailPayload {
  return {
    user: { id: userId, email, user_metadata: metadata },
    email_data: {
      token: '87654321',
      token_hash: `hash-${action}`,
      redirect_to: 'https://ezcontractorbinder.com/auth/callback',
      email_action_type: action,
      site_url: 'https://ezcontractorbinder.com',
    },
  };
}

/** Log rows this run wrote, so teardown removes exactly them. */
async function logsFor(recipient: string) {
  const { data } = await admin
    .from('email_logs')
    .select('id, email_type, recipient_email, sender_email, subject, status, metadata, resend_message_id, company_id')
    .eq('recipient_email', recipient)
    .like('email_type', 'auth_%')
    .order('created_at', { ascending: false });
  for (const r of data ?? []) if (!madeLogIds.includes(r.id)) madeLogIds.push(r.id);
  return data ?? [];
}

async function sweep(): Promise<void> {
  const { data: prof } = await admin
    .from('profiles').select('id, user_id').eq('email', INVITEE).maybeSingle();
  if (prof) {
    const p = prof as { id: string; user_id: string };
    const { data: member } = await admin
      .from('company_members').select('id').eq('profile_id', p.id).maybeSingle();
    if (member) {
      must('sweep assignments', (await admin
        .from('project_assignments').delete().eq('member_id', (member as { id: string }).id)).error);
      must('sweep member', (await admin
        .from('company_members').delete().eq('id', (member as { id: string }).id)).error);
    }
    must('sweep profile', (await admin.from('profiles').delete().eq('id', p.id)).error);
    await admin.auth.admin.deleteUser(p.user_id);
  }
  must('sweep invitations', (await admin.from('invitations').delete().eq('email', INVITEE)).error);
  must('sweep logs', (await admin
    .from('email_logs').delete().eq('recipient_email', INVITEE).like('email_type', 'auth_%')).error);
}

beforeAll(async () => {
  assertRebuildTest();
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY must be set — getResend() throws before the mock is reached');
  }

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = (company as { id: string }).id;

  const { data: ownerProf } = await admin
    .from('profiles').select('user_id, company_id').eq('email', OWNER).single();
  ownerUserId = (ownerProf as { user_id: string }).user_id;
  ownerProfileCompany = (ownerProf as { company_id: string }).company_id;

  await sweep();

  // ── the invited user, through the REAL invited path ─────────────────────
  // `admin.auth.admin.createUser` and not `signUp`: `user_metadata` lands in
  // `raw_user_meta_data` exactly the same way, so `handle_new_user()` runs the
  // SAME invited branch — but no confirmation email is sent and Supabase's
  // email rate limit is not touched. The same reasoning s133 records.
  inviteeToken = randomUUID();
  const { error: invErr } = await admin.from('invitations').insert({
    company_id: companyId,
    email: INVITEE,
    role: 'project_manager',
    invited_by: ownerUserId,
    created_by: ownerUserId,
    token: inviteeToken,
  });
  must('invitation', invErr);

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: INVITEE,
    password: 'FrameFocusTest!2026',
    // ⚠️ FALSE ON PURPOSE. P3's whole subject is whether this becomes true
    // without an email being sent. Creating them pre-confirmed would make A1
    // pass no matter what the code did.
    email_confirm: false,
    user_metadata: { first_name: 'S160', last_name: 'Invitee', invitation_token: inviteeToken },
  });
  must('createUser', cErr);
  // Guarded rather than `created!.user!.id`: an admin createUser that reports no
  // error and no user would otherwise crash the whole file with a null-deref
  // instead of naming what went wrong.
  if (!created?.user) throw new Error('createUser returned no user and no error');
  inviteeUserId = created.user.id;

  const { data: prof } = await admin
    .from('profiles').select('id, company_id').eq('email', INVITEE).maybeSingle();
  if (!prof) throw new Error('the invited signup created no profile — is the auth.users trigger installed?');
  expect((prof as { company_id: string }).company_id, 'the invited user landed in the wrong company')
    .toBe(companyId);
}, 240_000);

afterAll(async () => {
  if (madeLogIds.length) {
    must('teardown logs', (await admin.from('email_logs').delete().in('id', madeLogIds)).error);
  }
  await sweep();
}, 240_000);

// ============================================================================
// GROUP A — P3. An invited user is confirmed, and gets NO email.
// ============================================================================

describe('S160-A — P3: invited users do not confirm their email', () => {
  it('A1 — the invitee starts UNCONFIRMED, so A2 is not vacuous', async () => {
    // ⚠️ `?? null`, because GoTrue's JS client OMITS the field when it is unset
    // rather than returning null. Without the coalesce this reads `undefined`
    // — and, worse, A2's `.not.toBeNull()` would then have PASSED on an
    // `undefined` too, i.e. on a user who was never confirmed. Both halves are
    // written against the value, not against its absence.
    const { data } = await admin.auth.admin.getUserById(inviteeUserId);
    expect(data.user?.email_confirmed_at ?? null, 'the fixture was created already confirmed')
      .toBeNull();
  });

  it('A2 — a signup hook for the invitee confirms them and sends NOTHING', async () => {
    state.calls.length = 0;
    const outcome = await handleAuthEmail(
      admin as unknown as SupabaseClient<Database>,
      payloadFor(inviteeUserId, INVITEE, 'signup', { invitation_token: inviteeToken }),
      SUPABASE_URL
    );

    expect(outcome.autoConfirmedInvite, 'the invitee was not recognised as invited').toBe(true);
    expect(outcome.sent, 'an email was sent to an invited user').toBe(false);
    expect(outcome.error).toBeNull();
    expect(state.calls, 'Resend was called for an invited signup').toHaveLength(0);

    // A real timestamp, not merely "not null" — see A1 for why that is the
    // weaker assertion here.
    const { data } = await admin.auth.admin.getUserById(inviteeUserId);
    const confirmedAt = data.user?.email_confirmed_at ?? null;
    expect(confirmedAt, 'the invited user was not confirmed').toBeTypeOf('string');
    expect(Number.isNaN(Date.parse(confirmedAt as string)), 'email_confirmed_at is not a date')
      .toBe(false);
  });

  it('A3 — and NOTHING was logged, because nothing was sent', async () => {
    // The log records sends. A confirmed-and-skipped invite is not a send, and
    // a row here would make `email_logs` claim an email exists that does not.
    expect(await logsFor(INVITEE)).toHaveLength(0);
  });
});

// ============================================================================
// GROUP B — P3's guard. Only a REAL invitation short-circuits.
// ============================================================================

describe('S160-B — the invited check cannot be forged', () => {
  it('B1 — no token at all resolves to nothing', async () => {
    expect(await invitedCompanyFor(admin as never, { id: inviteeUserId, email: INVITEE })).toBeNull();
    expect(
      await invitedCompanyFor(admin as never, {
        id: inviteeUserId, email: INVITEE, user_metadata: {},
      })
    ).toBeNull();
  });

  it('B2 — an unknown token resolves to nothing', async () => {
    expect(
      await invitedCompanyFor(admin as never, {
        id: inviteeUserId, email: INVITEE, user_metadata: { invitation_token: randomUUID() },
      })
    ).toBeNull();
  });

  it('B3 — ⚠️ a REAL token presented for a DIFFERENT address resolves to nothing', async () => {
    // The one that matters. `user_metadata` is user-controlled: a public signup
    // can put any string in it. Without the address check, a token seen
    // anywhere — forwarded, pasted into a chat — would confirm an address of
    // the holder's choosing and skip the only verification there is.
    expect(
      await invitedCompanyFor(admin as never, {
        id: inviteeUserId,
        email: 'someone-else@example.invalid',
        user_metadata: { invitation_token: inviteeToken },
      })
    ).toBeNull();
  });

  it('B4 — and the real pair DOES resolve, so B1–B3 are not passing on a broken lookup', async () => {
    expect(
      await invitedCompanyFor(admin as never, {
        id: inviteeUserId, email: INVITEE, user_metadata: { invitation_token: inviteeToken },
      })
    ).toBe(companyId);
  });
});

// ============================================================================
// GROUP C — P1 + P2. A real send, and a row in email_logs.
// ============================================================================

describe('S160-C — P1/P2: the send goes out branded, and it is logged', () => {
  it('C1 — a recovery hook sends over Resend and writes an auth_recovery row', async () => {
    state.calls.length = 0;
    state.result = { data: { id: 'mock-resend-id-c1' }, error: null };

    const outcome = await handleAuthEmail(
      admin as unknown as SupabaseClient<Database>,
      payloadFor(inviteeUserId, INVITEE, 'recovery'),
      SUPABASE_URL
    );

    expect(outcome.sent, `send failed: ${outcome.error}`).toBe(true);
    expect(outcome.logged, 'the send was not logged — P2 is the point of P1').toBe(true);
    expect(state.calls, 'Resend was not called').toHaveLength(1);

    const rows = await logsFor(INVITEE);
    expect(rows, 'no email_logs row').toHaveLength(1);
    const row = rows[0];
    expect(row.email_type).toBe('auth_recovery');
    expect(row.status).toBe('sent');
    expect(row.resend_message_id).toBe('mock-resend-id-c1');
    expect(row.company_id, 'logged against the wrong company').toBe(companyId);
    expect(row.subject).toContain('EZ Contractor Binder');
    // Metadata is what makes a row diagnosable six months later.
    expect((row.metadata as Record<string, unknown>).email_action_type).toBe('recovery');
    expect((row.metadata as Record<string, unknown>).user_id).toBe(inviteeUserId);
  });

  it('C2 — ⚠️ the From is the TENANT’s aligned address, not a Supabase one', async () => {
    // The deliverability half of P1. `buildSenderAddress` produces
    // "<Company> <slug@ezcontractorbinder.com>" — the domain with the published
    // SPF/DKIM/DMARC that mail-tester scores 10/10.
    expect(state.calls[0].from).toContain('@ezcontractorbinder.com');
    expect(state.calls[0].from, 'the From line lost the tenant name').toMatch(/^.+ <.+@/);
    expect(state.calls[0].to).toEqual([INVITEE]);
  });

  it('C3 — a FAILED send is still logged, as failed', async () => {
    // The case S159 found nobody could see: today a failed confirmation email
    // is invisible everywhere. Forcing the error is the reason the network hop
    // is mocked at all.
    state.calls.length = 0;
    state.result = { data: null, error: { message: 'mock delivery refusal' } };

    const outcome = await handleAuthEmail(
      admin as unknown as SupabaseClient<Database>,
      payloadFor(inviteeUserId, INVITEE, 'magiclink'),
      SUPABASE_URL
    );

    expect(outcome.sent).toBe(false);
    expect(outcome.error).toBe('mock delivery refusal');
    expect(outcome.logged, 'a FAILED send was not logged — the whole point of P2').toBe(true);

    const failed = (await logsFor(INVITEE)).find((r) => r.email_type === 'auth_magic_link');
    expect(failed, 'no auth_magic_link row').toBeDefined();
    expect(failed!.status).toBe('failed');
    expect(failed!.resend_message_id).toBeNull();

    state.result = { data: { id: 'mock-resend-id' }, error: null };
  });

  it('C4 — a user with NO profile still gets the email; only the LOG is skipped', async () => {
    // `email_logs.company_id` is NOT NULL, so there is nothing to log against.
    // The trade is deliberate and one-directional: an unsent email is a
    // user-visible failure, an unlogged one is a bookkeeping gap.
    state.calls.length = 0;
    const orphan = randomUUID();
    const outcome = await handleAuthEmail(
      admin as unknown as SupabaseClient<Database>,
      payloadFor(orphan, 'orphan@example.invalid', 'recovery'),
      SUPABASE_URL
    );

    expect(outcome.sent, 'the email was dropped because it could not be logged').toBe(true);
    expect(outcome.logged).toBe(false);
    expect(state.calls, 'Resend was not called for the orphan').toHaveLength(1);
    // The platform fallback still sends from the ALIGNED domain.
    expect(state.calls[0].from).toContain(`@ezcontractorbinder.com`);

    const { data } = await admin
      .from('email_logs').select('id').eq('recipient_email', 'orphan@example.invalid');
    expect(data ?? [], 'a row was logged with no company').toHaveLength(0);
  });

  it('C5 — an unrecognised action is REFUSED, never silently dropped', async () => {
    // A GoTrue version that grows a new action type must not turn into "no
    // email happened" — that is the S159 defect rebuilt in a new place.
    state.calls.length = 0;
    const outcome = await handleAuthEmail(
      admin as unknown as SupabaseClient<Database>,
      payloadFor(inviteeUserId, INVITEE, 'some_future_action'),
      SUPABASE_URL
    );

    expect(outcome.action).toBe('unknown');
    expect(outcome.sent).toBe(false);
    expect(outcome.error).toContain('some_future_action');
    expect(state.calls).toHaveLength(0);
  });

  it('C6 — the counterfactual: the owner resolves to the same company, so C1 is not luck', async () => {
    expect(ownerProfileCompany).toBe(companyId);
  });
});
