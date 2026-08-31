import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { handleAuthEmail, type AuthEmailPayload } from '@/lib/services/auth-email';

// P1 [S160] — GoTrue's Send Email Hook endpoint.
//
// Deliberately THIN. Everything that can be reasoned about lives in
// `lib/services/auth-email.ts`, which has no `next/server` import and is
// therefore directly callable from a test with a hand-built payload — the same
// split `s158`/`s159` used for the sheets, and the reason this route needs no
// running server to be covered.
//
// ⚠️ THE FAILURE MODE HERE IS NOT "AN EMAIL IS LOST". GoTrue treats a non-2xx
// from this endpoint as a FAILED AUTH OPERATION: the sign-up or the password
// reset itself errors for the user. So the rule is narrow and absolute —
//
//     an AUTHENTIC payload always gets a 2xx, whatever happened downstream;
//     only an UNAUTHENTIC one gets a 4xx.
//
// `handleAuthEmail()` never throws for that reason, and the `catch` below is for
// what it cannot report (a missing `RESEND_API_KEY` throws out of `getResend()`
// before any request is made). A send failure is reported in the body and
// logged; it does not fail the user's sign-up on top of losing their email.
//
// ⚠️ CONFIGURATION IS ATTENDED AND IS NOT APPLIED BY THIS COMMIT.
// This route is inert until the hook is enabled in the Supabase dashboard.
// Exact steps, both projects, in `docs/specs/S160-auth-email-hook.md` §3.

// Standard Webhooks, the same scheme the Resend webhook already verifies — but
// GoTrue and Resend spell its headers DIFFERENTLY, and both spellings are the
// same signed request:
//
//   · GoTrue posts `webhook-id` / `webhook-timestamp` / `webhook-signature`
//     (supabase/auth `internal/hooks/hookshttp/hookshttp.go:153-155`).
//   · The Resend webhook this route was modelled on posts the `svix-*` spelling.
//
// ⚠️ HARD-REQUIRING `svix-*` HERE WAS THE PRODUCTION AUTH-EMAIL OUTAGE. Every
// real GoTrue call arrives with `webhook-*`, so the old pre-check returned 400
// BEFORE verifying anything — and GoTrue renders a 400 from this endpoint as
// the user-visible "Invalid payload sent to hook" (`hookshttp.go:242-244`),
// failing the whole sign-up / recovery / invite. It shipped because the live
// test drove `handleAuthEmail()` directly and never crossed this check.
//
// svix's own verify() already reads either spelling, so accepting both is the
// honest fix: it costs nothing and survives Supabase changing the spelling.
// Each entry is [svix spelling, webhook spelling] of ONE header.
const SIGNATURE_HEADERS = [
  ['svix-id', 'webhook-id'],
  ['svix-timestamp', 'webhook-timestamp'],
  ['svix-signature', 'webhook-signature'],
] as const;

export async function POST(request: NextRequest) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!secret) {
    // ⚠️ 500 AND NOT 200. A misconfigured secret must be loud: answering 200
    // here would tell GoTrue the email was handled while nothing was sent, and
    // every sign-up on the platform would silently stop delivering — the S159
    // defect, rebuilt.
    console.error('auth email hook: SEND_EMAIL_HOOK_SECRET is not set', {
      route: 'POST /api/auth/send-email',
    });
    return NextResponse.json({ error: 'Hook secret is not configured' }, { status: 500 });
  }

  const body = await request.text();
  const headers: Record<string, string> = {};
  for (const [svixName, webhookName] of SIGNATURE_HEADERS) {
    const v = request.headers.get(svixName) ?? request.headers.get(webhookName);
    if (!v) {
      // A genuinely unsigned request is still refused. The message names the
      // `webhook-*` spelling because that is the one a real GoTrue request would
      // be missing — naming only `svix-*` would misdescribe the production case.
      return NextResponse.json({ error: `Missing ${webhookName}` }, { status: 400 });
    }
    // Hand svix both keys set to the one value it found. verify() reads either,
    // so this is spelling-agnostic regardless of which the caller sent.
    headers[svixName] = v;
    headers[webhookName] = v;
  }

  let payload: AuthEmailPayload;
  try {
    // Supabase stores the secret as `v1,whsec_<base64>`; svix wants the
    // `whsec_…` part. Tolerating both means a secret pasted either way works,
    // rather than failing every send with "invalid signature".
    const normalised = secret.startsWith('v1,') ? secret.slice(3) : secret;
    payload = new Webhook(normalised).verify(body, headers) as AuthEmailPayload;
  } catch {
    // No detail in the response: an unauthenticated caller learns only that it
    // was refused.
    console.error('auth email hook: signature verification failed', {
      route: 'POST /api/auth/send-email',
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  if (!payload?.user?.id || !payload?.user?.email || !payload?.email_data?.email_action_type) {
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    console.error('auth email hook: NEXT_PUBLIC_SUPABASE_URL is not set', {
      route: 'POST /api/auth/send-email',
    });
    return NextResponse.json({ error: 'Supabase URL is not configured' }, { status: 500 });
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;

  try {
    const outcome = await handleAuthEmail(admin, payload, supabaseUrl);

    if (outcome.error) {
      console.error('auth email hook: send failed', {
        route: 'POST /api/auth/send-email',
        email_action_type: payload.email_data.email_action_type,
        user_id: payload.user.id,
        logged: outcome.logged,
        message: outcome.error,
      });
    }

    // 200 even on a send failure — see the header. The user's sign-up must not
    // fail because Resend did.
    return NextResponse.json(outcome);
  } catch (err: unknown) {
    console.error('auth email hook: unexpected failure', {
      route: 'POST /api/auth/send-email',
      email_action_type: payload.email_data.email_action_type,
      message: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json(
      { action: payload.email_data.email_action_type, sent: false, logged: false, error: 'send failed' },
      { status: 200 }
    );
  }
}
