import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { admin, assertRebuildTest } from './live-session';

// ============================================================================
// SLICE 4 — the mention email, against the REAL email_logs table.
// Spec: §5.6a, A-C46, A-C47, A-C48, A-C50. Spec @ spec/chat-s124 4b61b9d.
// ============================================================================
//
// ---------------------------------------------------------------------------
// THE TRANSPORT IS STUBBED. NOTHING IS ACTUALLY SENT.
// ---------------------------------------------------------------------------
// The house precedent is `s97ct-invoice-email.live.ts`, which asserts the
// LOGGING model rather than driving Resend — and it is the right precedent: a
// test that really sent would put mail in a person's inbox on every run, and
// `RESEND_API_KEY` on this box is a live key.
//
// What is NOT stubbed is `logEmail`, and that matters: the `email_logs` insert
// carries an FK to `email_types`, so a row landing at all is what proves slice
// 1's `mention` registry row exists (A-C46's second half).

const { sends } = vi.hoisted(() => ({
  sends: [] as Array<{ to: string; subject: string; react: { props: Record<string, unknown> } }>,
}));

vi.mock('@/lib/services/email-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/email-service')>();
  return {
    ...actual,
    sendEmail: async (params: { to: string; subject: string; react: never }) => {
      sends.push(params as never);
      return { messageId: `stub-${sends.length}`, error: null };
    },
  };
});

const { sendMentionEmails } = await import('@/lib/chat/mention-email');

const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9';
const SUB_EMAIL = 'josh+qa-sub@worthprop.com';
const CREW_EMAIL = 'josh+crew@worthprop.com';
const MESSAGE_ID = '00000000-0000-4000-8000-0000000000ff';

let companyId: string;
let subProfileId: string;
let crewProfileId: string;

async function cleanup() {
  await admin.from('email_logs').delete().eq('email_type', 'mention');
}

beforeAll(async () => {
  assertRebuildTest();
  const { data } = await admin
    .from('profiles')
    .select('id, email, company_id')
    .in('email', [SUB_EMAIL, CREW_EMAIL]);
  const rows = (data ?? []) as Array<{ id: string; email: string; company_id: string }>;
  subProfileId = rows.find((r) => r.email === SUB_EMAIL)!.id;
  crewProfileId = rows.find((r) => r.email === CREW_EMAIL)!.id;
  companyId = rows[0].company_id;
  await cleanup();
  sends.length = 0;
});

afterAll(cleanup);

describe('ND-30 / ND-42 — the sub mention email', () => {
  it('⚠️ emails the SUB and NOT the crew member, from one mention of both', async () => {
    const outcome = await sendMentionEmails({
      admin,
      companyId,
      projectId: PROJECT,
      projectName: 'Alvarez',
      kind: 'sub',
      messageId: MESSAGE_ID,
      authorName: 'Casey Crew',
      body: 'can you get the trim count to me before Thursday?',
      // BOTH are mentioned, and both get an in-app row and a push. Only one
      // gets mail. A-C47 is the criterion, and this is it end to end rather
      // than as a filter in isolation.
      recipients: [
        { profileId: subProfileId, role: 'subcontractor', email: SUB_EMAIL },
        { profileId: crewProfileId, role: 'crew_member', email: CREW_EMAIL },
      ],
      origin: 'https://frame-focus-eight.vercel.app',
    });

    expect(outcome.sent).toBe(1);
    expect(outcome.skipped).toBe(1);
    expect(outcome.errors).toEqual([]);

    expect(sends).toHaveLength(1);
    expect(sends[0].to).toBe(SUB_EMAIL);
    expect(sends.map((s) => s.to)).not.toContain(CREW_EMAIL);
  });

  it('A-C48 — the subject carries the real message text AND the thread name', () => {
    // A "you were mentioned" email passes a naive "an email was sent"
    // assertion and defeats the point: the recipient would still have to open
    // the app to find out what was wanted.
    expect(sends[0].subject).toBe(
      'Casey Crew (Alvarez — subs): can you get the trim count to me before Thursday?'
    );
  });

  // A-C50 is a `[unit]` criterion and lives in s126-chat-email.test.ts. It was
  // attempted here first, against `sends[0].react.props.estimateUrl`, and that
  // was a WRONG TEST rather than a wrong build: the template is invoked as
  // `NotificationEmail({...})` — the house pattern, see incident-notify.ts —
  // which returns the component's rendered output, so the input props are not
  // on the returned element and the read is `undefined`. The URL is now built
  // by a named function that can be asserted directly.

  it('A-C46 — the send is logged with email_type `mention`, for the sub only', async () => {
    const { data } = await admin
      .from('email_logs')
      .select('email_type, recipient_email, status, subject, metadata')
      .eq('email_type', 'mention');

    const rows = (data ?? []) as Array<{
      recipient_email: string;
      status: string;
      subject: string;
      metadata: Record<string, unknown>;
    }>;

    // The row landing at all proves the email_types FK resolves — i.e. that
    // slice 1's registry row exists. Without it this insert fails outright.
    expect(rows).toHaveLength(1);
    expect(rows[0].recipient_email).toBe(SUB_EMAIL);
    expect(rows[0].status).toBe('sent');
    expect(rows[0].subject).toContain('— subs');
    expect(rows[0].metadata.message_id).toBe(MESSAGE_ID);
    expect(rows[0].metadata.thread_kind).toBe('sub');
  });

  it('a mention with no subcontractor in it sends nothing and logs nothing', async () => {
    const before = sends.length;
    const outcome = await sendMentionEmails({
      admin,
      companyId,
      projectId: PROJECT,
      projectName: 'Alvarez',
      kind: 'crew',
      messageId: MESSAGE_ID,
      authorName: 'Casey Crew',
      body: 'morning',
      recipients: [{ profileId: crewProfileId, role: 'crew_member', email: CREW_EMAIL }],
      origin: 'https://frame-focus-eight.vercel.app',
    });

    expect(outcome.sent).toBe(0);
    expect(sends.length).toBe(before);

    // And no stray log row: a build that logged an "attempt" for everyone would
    // make email_logs a misleading record of who was mailed.
    const { count } = await admin
      .from('email_logs')
      .select('id', { count: 'exact', head: true })
      .eq('email_type', 'mention');
    expect(count).toBe(1);
  });
});
