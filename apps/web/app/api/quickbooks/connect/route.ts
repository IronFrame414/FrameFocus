import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase-server';
import {
  QBO_AUTHORIZE_URL,
  QBO_SCOPE,
  QB_STATE_COOKIE,
  qboCredentials,
  qboRedirectUri,
} from '@/lib/quickbooks/config';

/**
 * 7G step 1 — start the OAuth handshake. **Owner-only.**
 *
 * CLAUDE.md owner-only item 4: "Connecting or disconnecting QuickBooks — QB
 * connection is treated as billing-adjacent because it controls financial data
 * flow out of FrameFocus. Owner-only." The DATABASE already enforces this
 * (`enforce_companies_qb_scope`, 20260928000000, which is NARROWER than
 * `companies_update_owner_admin`); this check exists so an Admin gets a 403
 * here rather than a raised exception three hops later.
 *
 * ⚠️ THIS ROUTE IS NOT REGISTERED WITH INTUIT and does not need to be. Only the
 * REDIRECT URI is registered. This is our own launch endpoint.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.role !== 'owner') {
    // 403 with its OWN message. Never fall through to a "not found" path —
    // CLAUDE.md's API rule: a "not found" means auth passed and the record
    // genuinely does not exist.
    console.error(
      `[qb-connect] denied: user=${user.id} role=${profile?.role ?? 'none'} — Owner-only.`
    );
    return NextResponse.redirect(
      new URL('/dashboard/settings/accounting?qb_error=owner_only', request.url)
    );
  }

  try {
    qboCredentials();
  } catch {
    console.error('[qb-connect] QBO_CLIENT_ID / QBO_CLIENT_SECRET are not set on this deployment.');
    return NextResponse.redirect(
      new URL('/dashboard/settings/accounting?qb_error=not_configured', request.url)
    );
  }

  // ⚠️ CSRF: a random nonce goes BOTH into `state` and into an httpOnly cookie,
  // and /callback requires them to match. Without this, an attacker can hand a
  // signed-in Owner a crafted callback URL and bind THEIR QuickBooks realm to
  // this company's books. Intuit echoes `state` back verbatim, which is the
  // whole mechanism.
  const nonce = randomBytes(32).toString('hex');

  const authorizeUrl = new URL(QBO_AUTHORIZE_URL);
  authorizeUrl.searchParams.set('client_id', qboCredentials().clientId);
  authorizeUrl.searchParams.set('response_type', 'code');
  // ⚠️ ACCOUNTING ONLY. See config.ts — the payment scope is not required and
  // cannot be removed once saved.
  authorizeUrl.searchParams.set('scope', QBO_SCOPE);
  authorizeUrl.searchParams.set('redirect_uri', qboRedirectUri());
  authorizeUrl.searchParams.set('state', nonce);

  const response = NextResponse.redirect(authorizeUrl.toString());
  response.cookies.set(QB_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  });
  return response;
}
