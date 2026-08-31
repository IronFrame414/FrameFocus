import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildVerifyUrl, subjectFor, type AuthEmailPayload } from '@/lib/services/auth-email';
import { AuthEmail, AUTH_EMAIL_COPY, type AuthEmailKind } from '@/lib/email/templates/auth-email';

// ============================================================================
// S160 — the Send Email Hook, decided offline.
// ============================================================================
//
// What can be settled with no database and no network: the verify URL, the
// subjects, the template, and — the one that has bitten this repo twice — that
// the TS union, the runtime map and the migration all declare the same set.
//
// The DB half (P2's log row, P3's confirmation) is `s160-auth-email.live.ts`.

const KINDS: AuthEmailKind[] = [
  'confirm_signup',
  'recover_password',
  'magic_link',
  'change_email',
  'reauthenticate',
  'auth_invite',
];

function payload(overrides: Partial<AuthEmailPayload['email_data']> = {}) {
  return {
    token: '12345678',
    token_hash: 'HASHED_TOKEN_VALUE',
    redirect_to: 'https://ezcontractorbinder.com/auth/callback',
    email_action_type: 'signup',
    site_url: 'https://ezcontractorbinder.com',
    ...overrides,
  } as AuthEmailPayload['email_data'];
}

// ============================================================================
// THE VERIFY URL — the one that fails on somebody else's screen
// ============================================================================

describe('S160 — buildVerifyUrl', () => {
  it('⚠️ uses token_hash and NEVER the typeable token', () => {
    // GoTrue sends both. `token` is the 8-digit OTP a human types
    // (`mailer_otp_length: 8` on production); `token_hash` is what
    // `/auth/v1/verify` accepts in a link. Swapping them yields a link that
    // always fails — at the far end, on the recipient's screen, with no error
    // anywhere near our code. That is why this is the first assertion.
    const url = buildVerifyUrl('https://ref.supabase.co', payload());
    expect(url).toContain('token=HASHED_TOKEN_VALUE');
    expect(url, 'the typeable OTP leaked into the verification link').not.toContain('12345678');
  });

  it('passes GoTrue’s own redirect_to through unchanged', () => {
    // It has ALREADY been checked against the project's `uri_allow_list`.
    // Composing a destination here instead would route around that check.
    const url = buildVerifyUrl('https://ref.supabase.co', payload());
    expect(url).toContain(
      `redirect_to=${encodeURIComponent('https://ezcontractorbinder.com/auth/callback')}`
    );
  });

  it('carries the action type, and omits redirect_to when there is none', () => {
    expect(buildVerifyUrl('https://ref.supabase.co', payload({ email_action_type: 'recovery' })))
      .toContain('type=recovery');
    expect(
      buildVerifyUrl('https://ref.supabase.co', payload({ redirect_to: '' }))
    ).not.toContain('redirect_to');
  });

  it('the email_change_new half verifies with the NEW address’s hash', () => {
    // `mailer_secure_email_change_enabled` is true on production, so ONE change
    // sends TWO emails and they must not both verify the old address.
    const data = payload({
      email_action_type: 'email_change_new',
      token_hash_new: 'NEW_ADDRESS_HASH',
    });
    expect(buildVerifyUrl('https://ref.supabase.co', data, true)).toContain(
      'token=NEW_ADDRESS_HASH'
    );
    expect(buildVerifyUrl('https://ref.supabase.co', data, false)).toContain(
      'token=HASHED_TOKEN_VALUE'
    );
  });

  it('tolerates a trailing slash on the Supabase URL', () => {
    expect(buildVerifyUrl('https://ref.supabase.co/', payload())).toContain(
      'https://ref.supabase.co/auth/v1/verify?'
    );
  });
});

// ============================================================================
// THE TEMPLATE
// ============================================================================

const ACTION_URL = 'https://ref.supabase.co/auth/v1/verify?token=X';

// A block body, not a concise arrow returning JSX: the transform rejects
// `(k: T) => fn(<C … />)` at the `<` — the same class of parse trap as
// CLAUDE.md's heredoc note, and it costs one function shape to avoid.
function render(kind: AuthEmailKind): string {
  const el = <AuthEmail kind={kind} actionUrl={ACTION_URL} token="87654321" />;
  return renderToStaticMarkup(el);
}

describe('S160 — the auth email template', () => {
  it('every kind has copy, and every copy field is filled', () => {
    // `AUTH_EMAIL_COPY` is a plain object precisely so this can iterate it. Six
    // near-identical template FILES is how S135's subject-line defect happened:
    // the copy that mattered sat where no test rendered it.
    for (const kind of KINDS) {
      const copy = AUTH_EMAIL_COPY[kind];
      expect(copy, `${kind} has no copy`).toBeDefined();
      expect(copy.heading.length, `${kind} heading`).toBeGreaterThan(0);
      expect(copy.body.length, `${kind} body`).toBeGreaterThan(0);
      expect(copy.ignore.length, `${kind} ignore line`).toBeGreaterThan(0);
    }
  });

  it('⚠️ the typeable code is rendered ONLY for reauthentication', () => {
    // Showing an OTP next to a button on a confirmation email trains people to
    // read codes out of email, which is the behaviour phishing depends on.
    // Reauthentication has no link — typing the code IS the flow.
    for (const kind of KINDS) {
      const html = render(kind);
      if (kind === 'reauthenticate') {
        expect(html, 'the reauth code is missing').toContain('87654321');
      } else {
        expect(html, `${kind} rendered the typeable OTP`).not.toContain('87654321');
      }
    }
  });

  it('link kinds carry BOTH a button and the URL in full', () => {
    // A button is not clickable in every client, and a security email must not
    // become unusable in the one place someone reads it carefully.
    for (const kind of KINDS.filter((k) => k !== 'reauthenticate')) {
      const html = render(kind);
      expect(html, `${kind} has no link`).toContain(ACTION_URL);
      expect(html, `${kind} has no call to action`).toContain(AUTH_EMAIL_COPY[kind].cta);
    }
  });

  it('every kind says what happens if you ignore it', () => {
    for (const kind of KINDS) {
      expect(render(kind), `${kind} has no reassurance line`).toContain(
        AUTH_EMAIL_COPY[kind].ignore.slice(0, 40)
      );
    }
  });

  it('⚠️ carries NO tenant brand colour — these are platform messages', () => {
    // Every other template here dresses itself as the contractor, because those
    // emails are FROM the contractor TO their client. A "reset your password"
    // mail in a contractor's colours invites the reader to believe the
    // contractor can see or set their password.
    const src = readFileSync(
      fileURLToPath(new URL('../lib/email/templates/auth-email.tsx', import.meta.url)),
      'utf8'
    );
    expect(src, 'the auth template grew a brandColor prop').not.toMatch(
      /brandColor\s*[:?]/
    );
  });

  it('every subject names the product', () => {
    for (const kind of KINDS) {
      expect(subjectFor(kind), `${kind} subject`).toContain('EZ Contractor Binder');
    }
  });
});

// ============================================================================
// ⚠️ THE THREE-WAY REGISTRY CHECK — the defect this repo has hit twice
// ============================================================================

describe('S160 — the union, the runtime map and the migration agree', () => {
  const service = readFileSync(
    fileURLToPath(new URL('../lib/services/auth-email.ts', import.meta.url)),
    'utf8'
  );
  const emailService = readFileSync(
    fileURLToPath(new URL('../lib/services/email-service.ts', import.meta.url)),
    'utf8'
  );
  const migration = readFileSync(
    fileURLToPath(
      new URL('../../../supabase/migrations/20261009000000_auth_email_types.sql', import.meta.url)
    ),
    'utf8'
  );

  /** The `auth_*` values `ACTIONS` actually logs under. */
  const usedTypes = new Set(
    Array.from(service.matchAll(/emailType:\s*'(auth_[a-z_]+)'/g)).map((m) => m[1])
  );
  /** The `auth_*` rows the migration declares. */
  const declaredRows = new Set(
    Array.from(migration.matchAll(/\('(auth_[a-z_]+)'\)/g)).map((m) => m[1])
  );
  /** The `auth_*` members of the hand-maintained TS union. */
  const unionMembers = new Set(
    Array.from(emailService.matchAll(/\|\s*'(auth_[a-z_]+)'/g)).map((m) => m[1])
  );

  it('every type the hook logs under is declared in the migration', () => {
    // ⚠️ THE RUNTIME HALF. `email_logs.email_type` is NOT NULL with an FK to
    // `email_types ON DELETE RESTRICT`, so a type the migration never declared
    // makes `logEmail()` fail — at send time, in production, on a password
    // reset. `mention` shipped in the table without the union at S126; this is
    // the same seam from the other side.
    expect(usedTypes.size, 'no auth_* types found in ACTIONS — the regex went stale')
      .toBeGreaterThan(0);
    for (const t of usedTypes) {
      expect(declaredRows.has(t), `${t} is logged but not declared in 20261009000000`).toBe(true);
    }
  });

  it('every type the hook logs under is in the EmailType union', () => {
    // The COMPILE half. Missing here and `logEmail({ email_type })` does not
    // type-check — which is the failure mode you WANT, and is why both halves
    // must land in one commit.
    for (const t of usedTypes) {
      expect(unionMembers.has(t), `${t} is logged but missing from EmailType`).toBe(true);
    }
  });

  it('the migration declares nothing the union has not heard of', () => {
    // The other direction. A row nobody can log under is dead weight that reads
    // like coverage.
    for (const t of declaredRows) {
      expect(unionMembers.has(t), `${t} is declared in SQL but missing from EmailType`).toBe(true);
    }
  });

  it('⚠️ auth_invite and invite are DIFFERENT types, and both exist', () => {
    // The entire subject of the S159 investigation, pinned. `invite` is OUR
    // invitation from `sendInviteEmail()`; `auth_invite` is GoTrue's, which only
    // fires from the Supabase dashboard's Invite button.
    expect(unionMembers.has('auth_invite')).toBe(true);
    expect(declaredRows.has('auth_invite')).toBe(true);
    expect(emailService, "the app's own `invite` type was removed").toMatch(/\|\s*'invite'/);
  });
});

// ============================================================================
// THE ROUTE — the signature layer, which no other test reaches
// ============================================================================
//
// ⚠️ THIS EXISTS BECAUSE IT WAS ALMOST LEFT "OWED TO THE ATTENDED STEP". The
// hook cannot be enabled from a Codespace, so it was tempting to declare the
// whole route unverifiable until Josh throws the switch. It is not: `svix` can
// SIGN a payload exactly as Supabase does, so everything except "GoTrue really
// calls this URL" is decidable right here, in CI, with no server running.
//
// Verified against a live server too, once, at S160: unsigned → 400, bad
// signature → 401, correctly signed → 200. This is that, made permanent.

vi.mock('@/lib/supabase-admin', () => ({
  // Never reached by these three cases — the 400 and 401 refuse before the
  // handler, and `some_future_action` is rejected before any query. Mocked so
  // the committed suite needs no database and no service-role key.
  getSupabaseAdmin: () => ({}),
}));

const HOOK_SECRET = 'whsec_c2lnbmluZ3NlY3JldGZvcnRlc3Rpbmc=';

async function callRoute(
  headers: Record<string, string>,
  bodyText: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  process.env.SEND_EMAIL_HOOK_SECRET = HOOK_SECRET;
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://ref.supabase.co';
  const { POST } = await import('@/app/api/auth/send-email/route');
  const { NextRequest } = await import('next/server');
  const req = new NextRequest('http://localhost:3000/api/auth/send-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: bodyText,
  });
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const HOOK_BODY = JSON.stringify({
  user: { id: '00000000-0000-0000-0000-0000000000ff', email: 'smoke@example.invalid', user_metadata: {} },
  email_data: {
    token: '87654321',
    token_hash: 'route-hash',
    redirect_to: 'https://ezcontractorbinder.com/auth/callback',
    // Deliberately unrecognised: it is refused BEFORE any database work, so the
    // route can be exercised end to end without a Supabase client.
    email_action_type: 'some_future_action',
    site_url: 'https://ezcontractorbinder.com',
  },
});

describe('S160 — POST /api/auth/send-email', () => {
  it('refuses a request with no signature headers', async () => {
    // A genuinely unsigned request is still refused with 400. The message now
    // names the `webhook-*` spelling — GoTrue posts `webhook-id/-timestamp/
    // -signature`, so that is the header a real (if unsigned) GoTrue request
    // would be missing. The route accepts EITHER spelling now; that both are
    // verified is proven in `auth-email-hook-signature-headers.test.ts`.
    // _Superseded, quoted not rewritten:_ `expect(body.error).toContain('svix-id')`.
    const { status, body } = await callRoute({}, HOOK_BODY);
    expect(status).toBe(400);
    expect(body.error).toContain('webhook-id');
  });

  it('refuses a WRONG signature, and says nothing about why', async () => {
    // An unauthenticated caller learns only that it was refused.
    const { status, body } = await callRoute(
      {
        'svix-id': 'msg_test',
        'svix-timestamp': String(Math.floor(Date.now() / 1000)),
        'svix-signature': 'v1,ZGVhZGJlZWY=',
      },
      HOOK_BODY
    );
    expect(status).toBe(401);
    expect(body.error).toBe('Invalid signature');
  });

  it('⚠️ accepts a correctly signed payload — and answers 200 even when the send did not happen', async () => {
    // THE RULE THIS PINS. GoTrue treats a non-2xx as a FAILED AUTH OPERATION:
    // a 500 here does not lose an email, it fails the user's sign-up. So an
    // authentic payload always gets a 2xx, whatever happened downstream, and
    // the outcome is reported in the body instead.
    const { Webhook } = await import('svix');
    const id = 'msg_test_ok';
    const ts = new Date();
    const signature = new Webhook(HOOK_SECRET).sign(id, ts, HOOK_BODY);

    const { status, body } = await callRoute(
      {
        'svix-id': id,
        'svix-timestamp': String(Math.floor(ts.getTime() / 1000)),
        'svix-signature': signature,
      },
      HOOK_BODY
    );

    expect(status, 'an authentic payload was answered with a non-2xx').toBe(200);
    expect(body.action).toBe('unknown');
    expect(body.sent).toBe(false);
    expect(body.error).toContain('some_future_action');
  });

  it('tolerates the secret with or without Supabase’s `v1,` prefix', async () => {
    // The dashboard shows `v1,whsec_…`; svix wants the `whsec_…`. Accepting
    // both means a secret pasted either way works, rather than failing EVERY
    // send with "invalid signature" — which would present as the platform
    // silently not delivering anything.
    const { Webhook } = await import('svix');
    const id = 'msg_test_prefix';
    const ts = new Date();
    const signature = new Webhook(HOOK_SECRET).sign(id, ts, HOOK_BODY);

    process.env.SEND_EMAIL_HOOK_SECRET = `v1,${HOOK_SECRET}`;
    const { POST } = await import('@/app/api/auth/send-email/route');
    const { NextRequest } = await import('next/server');
    const res = await POST(
      new NextRequest('http://localhost:3000/api/auth/send-email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'svix-id': id,
          'svix-timestamp': String(Math.floor(ts.getTime() / 1000)),
          'svix-signature': signature,
        },
        body: HOOK_BODY,
      })
    );
    expect(res.status, 'the `v1,` prefix broke verification').toBe(200);
  });
});
