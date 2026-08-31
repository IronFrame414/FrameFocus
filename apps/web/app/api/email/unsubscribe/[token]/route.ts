import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  recordEmailUnsubscribe,
  verifyUnsubscribeToken,
} from '@/lib/services/email-unsubscribe';

// ============================================================================
// Email §3 — the class-scoped unsubscribe endpoint. SESSION-FREE BY DESIGN:
// the audience is a counterparty (a client chased by reminders) who may hold
// no account, a locked account, or a banned one — the Q1a lesson
// (lock-guard.ts:78-83) is that an unauthenticated route in this app is
// exactly where a session assumption bites. The route validates its own
// HMAC token and nothing else; it is also in LOCK_EXEMPT_API_PREFIXES so a
// session-holding user of a locked tenant is not 403'd out of a consent
// action.
//
//   GET  — the human path (a body link, or a mail client previewing the
//          header URL). Follows the /api/sign/unsubscribe locked decision:
//          email links are GETs, and the GET performs the action. Renders a
//          small confirmation page either way.
//   POST — RFC 8058 one-click: Gmail/Yahoo POST `List-Unsubscribe=One-Click`
//          to the List-Unsubscribe URL with no session and no cookie. 200 on
//          success. Idempotent: the store upserts onto its unique key, so a
//          replay records nothing new.
//
// An invalid token answers 200 with a "not recognized" page (GET) or 400
// (POST) and writes NOTHING — never an error page that invites retrying a
// forged token into a different shape.
// ============================================================================

function htmlPage(title: string, message: string): NextResponse {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: Helvetica, Arial, sans-serif; background: #f3f4f6; margin: 0;
           display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 8px; padding: 40px; max-width: 420px;
            text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { font-size: 20px; color: #111827; margin: 0 0 12px; }
    p { font-size: 14px; color: #6b7280; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

async function unsubscribe(token: string, source: string) {
  const claim = verifyUnsubscribeToken(token);
  if (!claim) return { claim: null, recorded: false };
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const { success, error } = await recordEmailUnsubscribe(admin, claim, source);
  if (!success) {
    // The real cause server-side, always; the recipient never needs it.
    console.error('[email-unsubscribe] record failed:', error);
  }
  return { claim, recorded: success };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { claim, recorded } = await unsubscribe(params.token, 'link');

  if (!claim || !recorded) {
    return htmlPage(
      'Link not recognized',
      'This unsubscribe link is not valid. No changes were made.'
    );
  }

  return htmlPage(
    'You are unsubscribed',
    'You will no longer receive reminder emails from this company. ' +
      'Documents sent to you directly — invoices, contracts, signature requests — are unaffected.'
  );
}

export async function POST(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { claim, recorded } = await unsubscribe(params.token, 'one-click');

  if (!claim) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }
  if (!recorded) {
    // Signal the mail client to retry its one-click later rather than
    // reporting success for a write that did not land.
    return NextResponse.json({ error: 'Could not record unsubscribe' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
