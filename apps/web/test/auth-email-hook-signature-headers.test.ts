/**
 * Send Email Hook — signature-header spelling.
 *
 * ⚠️ THIS REPRODUCES THE PRODUCTION AUTH-EMAIL OUTAGE and is proven against the
 * REAL request GoTrue sends, NOT a fixture trimmed to our own validator — which
 * is exactly how the original defect shipped (`s160-auth-email.live.ts` calls
 * `handleAuthEmail()` directly and never exercises the route's header check).
 *
 * Ground truth, from `supabase/auth` at the versions running in production:
 *
 *   · GoTrue posts Standard Webhooks headers — `webhook-id`,
 *     `webhook-timestamp`, `webhook-signature`
 *     (`internal/hooks/hookshttp/hookshttp.go:153-155`).
 *   · When the hook endpoint answers HTTP 400, GoTrue fails the auth operation
 *     with the user-visible string "Invalid payload sent to hook"
 *     (`hookshttp.go:242-244`) — 400 ONLY; 401 is "Hook requires authorization
 *     token", 500 is "Unexpected status code".
 *
 * The route used to hard-require the `svix-*` spelling and returned 400 before
 * verifying anything, so EVERY real GoTrue call 400'd → the outage. svix's own
 * `verify()` reads either spelling (`node_modules/svix/dist/webhook.js:17-21`),
 * so the only thing that was wrong was the route's pre-check.
 *
 * The payload below is the official Send Email Hook example (superset shape:
 * full user object, full email_data), signed with svix the way GoTrue signs it.
 */
import { describe, it, expect, vi } from 'vitest';
import { Webhook } from 'svix';
import type { NextRequest } from 'next/server';

// Stubbed so the test exercises ONLY the route's signature-header + verify +
// payload-shape path — the layer the 400 lived in. The handler and admin client
// are proven against the real DB in `s160-auth-email.live.ts`.
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({}) }));
const handleAuthEmail = vi.fn(async (..._args: unknown[]) => ({
  action: 'signup' as const,
  autoConfirmedInvite: false,
  sent: true,
  logged: true,
  error: null,
}));
vi.mock('@/lib/services/auth-email', () => ({
  handleAuthEmail: (...args: unknown[]) => handleAuthEmail(...args),
}));

// svix strips the `whsec_`; our route strips the `v1,`. Using the `v1,whsec_…`
// form here exercises both. The base64 body is svix's own example secret.
const SECRET_BODY = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
process.env.SEND_EMAIL_HOOK_SECRET = `v1,${SECRET_BODY}`;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';

// eslint-disable-next-line import/first -- must follow the env + mocks above
import { POST } from '@/app/api/auth/send-email/route';

/** The official Send Email Hook payload — full shape, not a trimmed fixture. */
const REAL_PAYLOAD = {
  user: {
    id: '8484b834-f29e-4af2-bf42-80644d154f76',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'valid.email@supabase.io',
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {
      email: 'valid.email@supabase.io',
      email_verified: false,
      phone_verified: false,
      sub: '8484b834-f29e-4af2-bf42-80644d154f76',
    },
    identities: [
      {
        identity_id: 'bc26d70b-517d-4826-bce4-413a5ff257e7',
        id: '8484b834-f29e-4af2-bf42-80644d154f76',
        user_id: '8484b834-f29e-4af2-bf42-80644d154f76',
        identity_data: { email: 'valid.email@supabase.io', sub: '8484b834-f29e-4af2-bf42-80644d154f76' },
        provider: 'email',
        created_at: '2024-05-14T12:56:33.824261Z',
        updated_at: '2024-05-14T12:56:33.824261Z',
        email: 'valid.email@supabase.io',
      },
    ],
    created_at: '2024-05-14T12:56:33.821567Z',
    updated_at: '2024-05-14T12:56:33.825595Z',
    is_anonymous: false,
  },
  email_data: {
    token: '305805',
    token_hash: '7d5b7b1964cf5d388340a7f04f1dbb5eeb6c7b52ef8270e1737a58d0',
    redirect_to: 'https://ezcontractorbinder.com/auth/callback',
    email_action_type: 'signup',
    site_url: 'https://ezcontractorbinder.com',
    token_new: '',
    token_hash_new: '',
    old_email: '',
    old_phone: '',
    provider: '',
    factor_type: '',
  },
};

type HeaderStyle = 'webhook' | 'svix' | 'none';

function signedRequest(style: HeaderStyle): NextRequest {
  const body = JSON.stringify(REAL_PAYLOAD);
  const msgId = 'msg_2abcDEF';
  const now = new Date();
  const timestamp = Math.floor(now.getTime() / 1000).toString();
  const signature = new Webhook(SECRET_BODY).sign(msgId, now, body);

  const headers = new Headers({ 'content-type': 'application/json' });
  if (style === 'webhook') {
    headers.set('webhook-id', msgId);
    headers.set('webhook-timestamp', timestamp);
    headers.set('webhook-signature', signature);
  } else if (style === 'svix') {
    headers.set('svix-id', msgId);
    headers.set('svix-timestamp', timestamp);
    headers.set('svix-signature', signature);
  }

  return new Request('https://ezcontractorbinder.com/api/auth/send-email', {
    method: 'POST',
    body,
    headers,
  }) as unknown as NextRequest;
}

describe('Send Email Hook — accepts both webhook-* and svix-* signatures', () => {
  it('GoTrue’s real webhook-* headers (the production case) → 200, not 400', async () => {
    const res = await POST(signedRequest('webhook'));
    expect(res.status).toBe(200);
    expect(handleAuthEmail).toHaveBeenCalled();
  });

  it('svix-* headers (the Resend-webhook spelling) still verify → 200', async () => {
    const res = await POST(signedRequest('svix'));
    expect(res.status).toBe(200);
  });

  it('neither spelling present → 400 (a genuinely unsigned request is still refused)', async () => {
    const res = await POST(signedRequest('none'));
    expect(res.status).toBe(400);
  });
});
