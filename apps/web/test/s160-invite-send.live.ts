/**
 * S160 · P5 — a live harness over `sendInviteEmail()`.
 *
 * Ruling: Josh, S160. Rationale, in his words: *"`sendInviteEmail()` has none,
 * and the S135 defect it fixed was invisible for months because nothing
 * exercised it."*
 *
 * That defect was total — `createInvitation()` inserted a row, the form rendered
 * a copyable link, and **there was no send call anywhere**. Two employees were
 * invited and neither received anything. A harness that reaches
 * `resend.emails.send()` and sees an id come back is the check that was missing.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ THIS HARNESS DELIVERS ONE REAL EMAIL PER RUN, ON PURPOSE.
 * ---------------------------------------------------------------------------
 * To `josh+s160-invite@worthprop.com`, from the rebuild-test company's own
 * slug address. It is the ONLY place in the suite that proves the network hop
 * to Resend actually works end to end — `s160-auth-email.live.ts` mocks it
 * deliberately, so that its failure path can be forced.
 *
 * **What that buys, which a mock cannot.** The Resend API key is live, the
 * sending domain is still verified, the From address the tenant slug produces
 * is still accepted, and a `resend_message_id` really comes back and is really
 * written to `email_logs`. If the domain's verification lapses — the exact
 * failure `email-service.ts`'s `SENDING_DOMAIN` comment warns has "no UI
 * anywhere that would show it" — this is what goes red.
 *
 * If that one email ever becomes unwelcome, change `RECIPIENT` to an address
 * on a domain that refuses mail and drop C1's `emailed === true` assertion —
 * but read what is lost above before doing it.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ AMENDED [Email §1, S157] — IT NO LONGER DELIVERS. The send gate
 * (`email-service.ts`, [Email §1]) refuses every send in a test environment
 * (EMAIL_SEND_ENABLED unset, not a Vercel production deploy) BEFORE getResend().
 * "Delivers one real email per run" was exactly the behaviour the gate exists
 * to stop — this file was a contributor to the 442 fixture sends. Group C is
 * therefore INVERTED below: by default the send is REFUSED and logged `failed`.
 *
 * The real Resend hop — and the domain-verification canary it was ("no UI
 * anywhere that would show" a lapsed verification) — is now OPT-IN, not lost by
 * accident but retired from the default battery by ruling: run with
 * EMAIL_SEND_ENABLED='true' AND a live key present to prove the hop end to end.
 * That the canary leaves the default run is a real, ruled consequence of
 * default-deny-in-test [Josh], recorded rather than hidden.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

import { buildInviteLink, buildInviteSubject, sendInviteEmail } from '@/lib/services/invite-email';
import { buildSenderAddress } from '@/lib/services/email-service';

const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const RECIPIENT = 'josh+s160-invite@worthprop.com';
const ORIGIN = 'https://ezcontractorbinder.com';

let owner: SupabaseClient;
let crew: SupabaseClient;
let companyId: string;
let companyName: string;
let companySlug: string;
let ownerUserId: string;
let invitationId: string;
let invitationToken: string;

// ⚠️ This file's Group C asserts a REFUSED send. The gate MUST be closed here,
// and we force it rather than assume it: the live runner is fileParallelism:false
// and a process can be reused across files, so a prior file that opened the gate
// (s160-auth-email does, for its MOCKED transport) could otherwise leak
// EMAIL_SEND_ENABLED='true' into this process and turn C1 into a REAL send to a
// real inbox — the exact incident [Email §1] exists to prevent. Captured at load,
// forced closed in beforeAll, restored in afterAll.
const savedGate = {
  EMAIL_SEND_ENABLED: process.env.EMAIL_SEND_ENABLED,
  VERCEL_ENV: process.env.VERCEL_ENV,
};

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function inviteLogs() {
  const { data } = await admin
    .from('email_logs')
    .select('id, email_type, status, recipient_email, sender_email, subject, resend_message_id, metadata, company_id')
    .eq('recipient_email', RECIPIENT)
    .eq('email_type', 'invite')
    .order('created_at', { ascending: false });
  return data ?? [];
}

async function sweep(): Promise<void> {
  must('sweep logs', (await admin
    .from('email_logs').delete().eq('recipient_email', RECIPIENT).eq('email_type', 'invite')).error);
  must('sweep invitations', (await admin
    .from('invitations').delete().eq('email', RECIPIENT)).error);
}

beforeAll(async () => {
  assertRebuildTest();
  // Force the gate CLOSED — see savedGate above. No real mail can leave this file.
  delete process.env.EMAIL_SEND_ENABLED;
  delete process.env.VERCEL_ENV;
  [owner, crew] = await Promise.all([sessionFor(OWNER), sessionFor(CREW)]);

  const { data: company } = await admin
    .from('companies').select('id, name, slug').eq('name', 'Sabal Point Construction').single();
  const co = company as { id: string; name: string; slug: string };
  companyId = co.id;
  companyName = co.name;
  companySlug = co.slug;

  const { data: ownerProf } = await admin
    .from('profiles').select('user_id').eq('email', OWNER).single();
  ownerUserId = (ownerProf as { user_id: string }).user_id;

  await sweep();

  invitationToken = randomUUID();
  const { data: inv, error } = await admin
    .from('invitations')
    .insert({
      company_id: companyId,
      email: RECIPIENT,
      role: 'project_manager',
      invited_by: ownerUserId,
      created_by: ownerUserId,
      token: invitationToken,
      expires_at: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString(),
    })
    .select('id').single();
  must('invitation', error);
  invitationId = (inv as { id: string }).id;
}, 240_000);

afterAll(async () => {
  await sweep();
  for (const [k, v] of Object.entries(savedGate)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}, 240_000);

// ============================================================================
// GROUP A — the link. What the recipient is actually asked to click.
// ============================================================================

describe('S160-P5-A — the accept link', () => {
  it('A1 — is the origin plus the invitation token, and nothing else', () => {
    // A pure function, but the thing it builds is the entire point of the
    // email: get this wrong and every invitation in circulation is dead.
    expect(buildInviteLink(invitationToken, ORIGIN)).toBe(
      `${ORIGIN}/invite/accept?token=${invitationToken}`
    );
  });

  it('A2 — a trailing slash on the origin does not double up', () => {
    expect(buildInviteLink(invitationToken, `${ORIGIN}/`)).toBe(
      `${ORIGIN}/invite/accept?token=${invitationToken}`
    );
  });

  it('A3 — the subject names the company and the product', () => {
    // Extracted at S136 precisely so it could be asserted: it was built inline,
    // and that is why a stale product name reached real recipients. The
    // TEMPLATE was always right, and no brand test could see a subject.
    expect(buildInviteSubject(companyName)).toBe(
      `${companyName} invited you to join them on EZ Contractor Binder`
    );
  });
});

// ============================================================================
// GROUP B — the gate. Who may cause an invitation to be mailed.
// ============================================================================

describe('S160-P5-B — the send is gated by the caller’s own RLS', () => {
  it('B1 — a CREW member cannot mail an invitation, and nothing is logged', async () => {
    // `sendInviteEmail` reads the invitation through the CALLER's client, so
    // `invitations_select_owner_admin` is the gate on mailing as well as on
    // reading. A service-role read here would have made anyone who reached the
    // route able to trigger a send.
    state.client = crew;
    const result = await sendInviteEmail(
      crew as unknown as SupabaseClient<Database>,
      invitationId,
      ORIGIN
    );

    expect(result.emailed, 'crew caused an invitation email to be sent').toBe(false);
    expect(result.link, 'crew was handed a working accept link').toBe('');
    expect(await inviteLogs(), 'a refused send was logged as if it happened').toHaveLength(0);
  });

  it('B2 — an invitation that does not exist reports failure and logs nothing', async () => {
    state.client = owner;
    const result = await sendInviteEmail(
      owner as unknown as SupabaseClient<Database>,
      randomUUID(),
      ORIGIN
    );
    expect(result.emailed).toBe(false);
    expect(result.link).toBe('');
    expect(await inviteLogs()).toHaveLength(0);
  });
});

// ============================================================================
// GROUP C — the send itself. The hop nothing else in the suite exercises.
// ============================================================================

describe('S160-P5-C — an Owner’s send is REFUSED BY THE GATE and logged as failed', () => {
  it('C1 — the send is refused by the gate (default-deny in test), not delivered', async () => {
    // ⚠️ INVERTED [Email §1, S157]. Superseded assertions, quoted not rewritten:
    //   "C1 — the send SUCCEEDS and comes back with a real Resend message id"
    //   expect(result.emailed, …).toBe(true); expect(result.error).toBeNull();
    // The send gate refuses in test BEFORE getResend(), so the Owner — who
    // passes the RLS gate of Group B and reaches sendEmail() — is refused at the
    // transport, not the read. This is the ONE real delivery the suite used to
    // perform, and stopping it is the whole point of [Email §1]. The link is
    // still built and returned; only the delivery is refused.
    state.client = owner;
    const result = await sendInviteEmail(
      owner as unknown as SupabaseClient<Database>,
      invitationId,
      ORIGIN
    );

    expect(result.emailed, 'the gate let a real invite send through in test').toBe(false);
    expect(result.error, 'the refusal did not name the send gate').toMatch(/send gate refused/);
    expect(result.link).toBe(`${ORIGIN}/invite/accept?token=${invitationToken}`);
  }, 60_000);

  it('C2 — and it wrote exactly ONE email_logs row, logged FAILED with no Resend id', async () => {
    // ⚠️ INVERTED [Email §1, S157]. Superseded: status was 'sent' and
    // resend_message_id was asserted truthy ("A REAL id from Resend"). The
    // failure-logging discipline (invite-email.ts:167, status: error?'failed':'sent')
    // still writes the row on a refused send — "no email arrived" is exactly the
    // question this table answers — so the shape is unchanged EXCEPT the status
    // and the now-null message id (no Resend hop happened).
    const rows = await inviteLogs();
    expect(rows, 'the refused send was not logged').toHaveLength(1);

    const row = rows[0];
    expect(row.status).toBe('failed');
    expect(row.company_id).toBe(companyId);
    expect(row.recipient_email).toBe(RECIPIENT);
    expect(row.subject).toBe(buildInviteSubject(companyName));

    // ⚠️ No Resend id — the gate refused before getResend(), so nothing was
    // ever handed to Resend. This is the inversion of the old truthy assertion.
    expect(row.resend_message_id, 'a gate-refused send carried a Resend id').toBeNull();

    // The From line and metadata are written regardless of send outcome — the
    // tenant's slug on the verified domain, and the answerable-later fields.
    expect(row.sender_email).toBe(buildSenderAddress({ name: companyName, slug: companySlug }));
    expect(row.sender_email).toContain('@ezcontractorbinder.com');
    const meta = row.metadata as Record<string, unknown>;
    expect(meta.invitation_id).toBe(invitationId);
    expect(meta.role).toBe('project_manager');
  });

  it('C3 — ⚠️ this send is `invite`, NOT `auth_invite`', async () => {
    // The distinction the S159 investigation turned on, pinned where it can be
    // seen. `invite` is OUR invitation — our template, the tenant's From line,
    // `/invite/accept?token=…`. `auth_invite` is GoTrue's dashboard invite, and
    // nothing in this repository triggers it.
    const rows = await inviteLogs();
    expect(rows[0].email_type).toBe('invite');

    const { data: authRows } = await admin
      .from('email_logs')
      .select('id')
      .eq('recipient_email', RECIPIENT)
      .eq('email_type', 'auth_invite');
    expect(authRows ?? [], 'the app invite logged itself as a GoTrue invite').toHaveLength(0);
  });
});
