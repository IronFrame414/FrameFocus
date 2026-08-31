import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { Webhook } from 'svix';
import { randomBytes, randomUUID } from 'node:crypto';
import { admin, assertRebuildTest } from './live-session';
import { POST } from '@/app/api/webhooks/resend/route';

// ============================================================================
// Email §2 — the Resend delivery webhook, exercised for the first time.
//
// The route (app/api/webhooks/resend/route.ts) has existed with correct svix
// verification, idempotency and status precedence — and had NEVER fired:
// delivered_at / opened_at / bounced_at were 0 across all 1,105 email_logs
// rows (docs/specs/email-deliverability-diagnosis.md §1b), because no webhook
// is configured on the Resend side. The code was never the gap; nothing had
// ever proven that, which is this file's job. Signed events are minted with
// the same svix implementation Resend uses, against a test secret set for the
// duration of the file — no Resend account is touched and no mail moves.
//
// "A test that passes on zero rows is a failure": every assertion here reads
// back the ONE row this file inserted, by its unique resend_message_id.
// ============================================================================

const SECRET = `whsec_${randomBytes(24).toString('base64')}`;
const MESSAGE_ID = `wh-live-${randomUUID()}`;

let savedSecret: string | undefined;
let logId = '';
let companyId = '';

function signedRequest(event: { type: string; created_at: string; data: { email_id?: string } }) {
  const payload = JSON.stringify(event);
  const msgId = `msg_${randomUUID()}`;
  const now = new Date();
  const signature = new Webhook(SECRET).sign(msgId, now, payload);
  return new NextRequest('http://localhost/api/webhooks/resend', {
    method: 'POST',
    body: payload,
    headers: {
      'svix-id': msgId,
      'svix-timestamp': String(Math.floor(now.getTime() / 1000)),
      'svix-signature': signature,
    },
  });
}

async function readRow() {
  const { data } = await admin
    .from('email_logs')
    .select('id, status, delivered_at, opened_at, bounced_at, metadata')
    .eq('resend_message_id', MESSAGE_ID)
    .single();
  return data as {
    id: string;
    status: string;
    delivered_at: string | null;
    opened_at: string | null;
    bounced_at: string | null;
    metadata: Record<string, unknown>;
  };
}

beforeAll(async () => {
  await assertRebuildTest();
  savedSecret = process.env.RESEND_SIGNING_SECRET;
  process.env.RESEND_SIGNING_SECRET = SECRET;

  // The fixture tenant, by NAME — scoped, not a heap-order pick (S165).
  const { data: company } = await admin
    .from('companies')
    .select('id')
    .eq('name', 'Sabal Point Construction')
    .single();
  companyId = (company as { id: string }).id;

  const { data: log, error } = await admin
    .from('email_logs')
    .insert({
      company_id: companyId,
      estimate_id: null,
      signing_session_id: null,
      resend_message_id: MESSAGE_ID,
      email_type: 'invoice',
      recipient_email: 'qa-webhook-probe@example.invalid',
      sender_email: 'Sabal Point Construction <bishop-contracting@ezcontractorbinder.com>',
      subject: 'webhook-resend.live probe',
      status: 'sent',
      metadata: { probe: 'webhook-resend.live' },
    })
    .select('id')
    .single();
  expect(error, `probe row insert failed: ${error?.message}`).toBeNull();
  logId = (log as { id: string }).id;
});

afterAll(async () => {
  if (savedSecret === undefined) delete process.env.RESEND_SIGNING_SECRET;
  else process.env.RESEND_SIGNING_SECRET = savedSecret;
  if (logId) await admin.from('email_logs').delete().eq('id', logId);
});

describe('the Resend webhook, end to end against a real row', () => {
  it('1 — email.delivered stamps delivered_at and advances the status', async () => {
    const at = new Date().toISOString();
    const res = await POST(
      signedRequest({ type: 'email.delivered', created_at: at, data: { email_id: MESSAGE_ID } })
    );
    expect(res.status).toBe(200);

    const row = await readRow();
    expect(row.status).toBe('delivered');
    expect(row.delivered_at).not.toBeNull();
  });

  it('2 — email.opened stamps opened_at above delivered', async () => {
    const res = await POST(
      signedRequest({
        type: 'email.opened',
        created_at: new Date().toISOString(),
        data: { email_id: MESSAGE_ID },
      })
    );
    expect(res.status).toBe(200);

    const row = await readRow();
    expect(row.status).toBe('opened');
    expect(row.opened_at).not.toBeNull();
    // The earlier stamp survives — timestamps accumulate, they do not replace.
    expect(row.delivered_at).not.toBeNull();
  });

  it('3 — a REGRESSIVE event never downgrades: email.sent after opened', async () => {
    const res = await POST(
      signedRequest({
        type: 'email.sent',
        created_at: new Date().toISOString(),
        data: { email_id: MESSAGE_ID },
      })
    );
    expect(res.status).toBe(200);

    const row = await readRow();
    expect(row.status).toBe('opened');
  });

  it('4 — email.bounced stamps bounced_at and takes the top rank', async () => {
    const res = await POST(
      signedRequest({
        type: 'email.bounced',
        created_at: new Date().toISOString(),
        data: { email_id: MESSAGE_ID },
      })
    );
    expect(res.status).toBe(200);

    const row = await readRow();
    expect(row.status).toBe('bounced');
    expect(row.bounced_at).not.toBeNull();
    // The metadata trail keeps every webhook event it saw.
    expect(row.metadata['webhook_email.bounced']).toBeTruthy();
  });

  it('5 — ⚠️ a BAD SIGNATURE is 401 and writes nothing', async () => {
    const before = await readRow();

    const payload = JSON.stringify({
      type: 'email.opened',
      created_at: new Date().toISOString(),
      data: { email_id: MESSAGE_ID },
    });
    const res = await POST(
      new NextRequest('http://localhost/api/webhooks/resend', {
        method: 'POST',
        body: payload,
        headers: {
          'svix-id': `msg_${randomUUID()}`,
          'svix-timestamp': String(Math.floor(Date.now() / 1000)),
          'svix-signature': 'v1,forged-signature-that-verifies-nothing',
        },
      })
    );
    expect(res.status).toBe(401);

    const after = await readRow();
    expect(after.status).toBe(before.status);
    expect(after.metadata).toEqual(before.metadata);
  });

  it('6 — an unknown email_id is acknowledged (200) so Resend stops retrying', async () => {
    const res = await POST(
      signedRequest({
        type: 'email.delivered',
        created_at: new Date().toISOString(),
        data: { email_id: `wh-unknown-${randomUUID()}` },
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });
});
