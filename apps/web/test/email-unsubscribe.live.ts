import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, assertRebuildTest } from './live-session';
import {
  buildUnsubscribeHeaders,
  isEmailUnsubscribed,
  mintUnsubscribeToken,
  verifyUnsubscribeToken,
} from '@/lib/services/email-unsubscribe';
import { sendEmail } from '@/lib/services/email-service';
import { GET, POST } from '@/app/api/email/unsubscribe/[token]/route';

// ============================================================================
// Email §3 — the class-scoped unsubscribe, end to end: token → session-free
// endpoint → store → the cron pre-check's primitive → sendEmail's backstop.
// No mail moves in this file: the send gate is closed (or opened keyless), and
// the only recipient is an @example.invalid probe that exists as DB rows only.
// ============================================================================

const PROBE_EMAIL = `QA-Unsub-Probe-${randomUUID()}@example.invalid`; // mixed case ON PURPOSE
const SECRET = `unsub-test-${randomUUID()}`;

let companyId = '';
const savedEnv: Record<string, string | undefined> = {};

function saveEnv(keys: string[]) {
  for (const k of keys) savedEnv[k] = process.env[k];
}
function restoreEnv() {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeAll(async () => {
  await assertRebuildTest();
  saveEnv([
    'UNSUBSCRIBE_TOKEN_SECRET',
    'NEXT_PUBLIC_APP_URL',
    'EMAIL_SEND_ENABLED',
    'RESEND_API_KEY',
  ]);
  process.env.UNSUBSCRIBE_TOKEN_SECRET = SECRET;
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

  // The fixture tenant, by NAME — scoped, not a heap-order pick (S165).
  const { data: company } = await admin
    .from('companies')
    .select('id')
    .eq('name', 'Bishop Contracting')
    .single();
  companyId = (company as { id: string }).id;
});

afterAll(async () => {
  await admin
    .from('email_unsubscribes')
    .delete()
    .eq('company_id', companyId)
    .eq('email', PROBE_EMAIL.toLowerCase());
  restoreEnv();
});

describe('1 · the stateless token', () => {
  it('roundtrips, lowercasing the email', () => {
    const token = mintUnsubscribeToken({
      companyId,
      email: PROBE_EMAIL,
      scope: 'reminders',
    });
    expect(token).not.toBeNull();
    const claim = verifyUnsubscribeToken(token!);
    expect(claim).toEqual({
      companyId,
      email: PROBE_EMAIL.toLowerCase(),
      scope: 'reminders',
    });
  });

  it('⚠️ a tampered token verifies as NOTHING', () => {
    const token = mintUnsubscribeToken({
      companyId,
      email: PROBE_EMAIL,
      scope: 'reminders',
    })!;
    // Flip the payload without re-signing.
    const [payload, mac] = token.split('.');
    const other = Buffer.from(
      Buffer.from(payload, 'base64url')
        .toString('utf8')
        .replace(PROBE_EMAIL.toLowerCase(), 'victim@example.com')
    ).toString('base64url');
    expect(verifyUnsubscribeToken(`${other}.${mac}`)).toBeNull();
    expect(verifyUnsubscribeToken('garbage')).toBeNull();
  });

  it('header pair is the RFC 8058 shape', () => {
    const headers = buildUnsubscribeHeaders({
      companyId,
      email: PROBE_EMAIL,
      scope: 'reminders',
    });
    expect(headers).not.toBeNull();
    expect(headers!['List-Unsubscribe']).toMatch(
      /^<http:\/\/localhost:3000\/api\/email\/unsubscribe\/.+>$/
    );
    expect(headers!['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});

describe('2 · the session-free endpoint writes the store', () => {
  it('GET with a valid token records the opt-out, lowercased', async () => {
    const token = mintUnsubscribeToken({
      companyId,
      email: PROBE_EMAIL,
      scope: 'reminders',
    })!;
    const res = await GET(undefined as never, { params: { token } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('You are unsubscribed');

    const { data } = await admin
      .from('email_unsubscribes')
      .select('email, scope, source')
      .eq('company_id', companyId)
      .eq('email', PROBE_EMAIL.toLowerCase());
    expect(data).toHaveLength(1);
    expect((data![0] as { scope: string }).scope).toBe('reminders');
  });

  it('POST one-click is idempotent — a replay leaves ONE row', async () => {
    const token = mintUnsubscribeToken({
      companyId,
      email: PROBE_EMAIL,
      scope: 'reminders',
    })!;
    const res1 = await POST(undefined as never, { params: { token } });
    const res2 = await POST(undefined as never, { params: { token } });
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const { data } = await admin
      .from('email_unsubscribes')
      .select('id')
      .eq('company_id', companyId)
      .eq('email', PROBE_EMAIL.toLowerCase());
    expect(data).toHaveLength(1);
  });

  it('⚠️ a forged token writes NOTHING: GET renders not-recognized, POST is 400', async () => {
    const before = await admin
      .from('email_unsubscribes')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId);

    const resGet = await GET(undefined as never, { params: { token: 'forged.token' } });
    expect(await resGet.text()).toContain('Link not recognized');
    const resPost = await POST(undefined as never, { params: { token: 'forged.token' } });
    expect(resPost.status).toBe(400);

    const after = await admin
      .from('email_unsubscribes')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId);
    expect(after.count).toBe(before.count);
  });
});

describe('3 · the check the crons and sendEmail share', () => {
  it('isEmailUnsubscribed answers casefold-true for the probe, false for a stranger', async () => {
    expect(await isEmailUnsubscribed(admin, companyId, PROBE_EMAIL, 'reminders')).toBe(true);
    expect(
      await isEmailUnsubscribed(admin, companyId, `never-${randomUUID()}@example.invalid`, 'reminders')
    ).toBe(false);
  });

  it('⚠️ sendEmail BACKSTOP: refuses the suppressed recipient BEFORE touching a key', async () => {
    // Gate open, key ABSENT: if the consent check ran after getResend() this
    // would throw 'RESEND_API_KEY is not set' instead of returning the refusal.
    process.env.EMAIL_SEND_ENABLED = 'true';
    delete process.env.RESEND_API_KEY;

    const result = await sendEmail({
      from: 'Bishop Contracting <bishop-contracting@ezcontractorbinder.com>',
      to: PROBE_EMAIL,
      subject: 'suppressed probe',
      react: null as never,
      unsubscribe: { companyId, scope: 'reminders' },
    });
    expect(result.messageId).toBeNull();
    expect(result.error).toMatch(/recipient has unsubscribed \(reminders\)/);
  });
});
