import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { forgetTokenBlob, getTokenBlob, revokeToken } from '@/lib/quickbooks/tokens';

/**
 * 7G — disconnect. TWO callers, one mechanism.
 *
 * ⚠️ REGISTERED WITH INTUIT AT EXACTLY `/api/quickbooks/disconnect`. Intuit
 * sends a user here when they disconnect the app from THEIR side (the App Cards
 * page inside QuickBooks).
 *
 *   GET  — Intuit-initiated. The user arrives by browser redirect.
 *   POST — our own UI (§5.3), Owner-only, carrying the keep/clear choice.
 *
 * ⚠️ BOTH REVOKE THE TOKEN WITH INTUIT AND CLEAR THE VAULT ROW. A disconnect
 * that leaves ciphertext behind is a soft delete of a credential, which is not
 * what the word means.
 */

export const dynamic = 'force-dynamic';

type DisconnectMode = 'keep' | 'clear';

/**
 * ⚠️ THE INTUIT-INITIATED GET DELIBERATELY CHANGES NOTHING WITHOUT A SESSION,
 * AND THAT IS NOT A GAP. READ THIS BEFORE "FIXING" IT.
 *
 * Intuit's disconnect redirect is an ordinary, UNSIGNED browser navigation. It
 * carries no secret we can check. Acting on `?realmId=…` from an anonymous
 * caller would make this an unauthenticated endpoint that can sever any
 * tenant's accounting integration by guessing a realm id.
 *
 * Refusing costs nothing, because the disconnect ALREADY SELF-HEALS: Intuit has
 * revoked the grant on their side, so our next refresh returns `invalid_grant`,
 * and `getAccessToken()` sets the connection to `needs_reauth` with the queue
 * untouched — which is exactly the state this route would have set by hand.
 * The user sees the banner either way.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.log('[qb-disconnect] anonymous Intuit-initiated GET — no state change; refresh will self-heal.');
    return NextResponse.redirect(new URL('/sign-in?qb=disconnected', request.url));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.role !== 'owner') {
    // Not an error the user can act on — send them somewhere useful.
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Intuit gives the user no keep/clear choice, so the Intuit-initiated path
  // takes the SAFE variant: keep the entity links (§5.3).
  const outcome = await performDisconnect(profile.company_id as string, 'keep', 'revoked');
  console.log(
    `[qb-disconnect] Intuit-initiated for company=${profile.company_id} revoked=${outcome.revoked}`
  );

  return NextResponse.redirect(
    new URL('/dashboard/settings/accounting?qb_disconnected=1', request.url)
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.role !== 'owner') {
    console.error(
      `[qb-disconnect] denied: user=${user.id} role=${profile?.role ?? 'none'} — Owner-only (CLAUDE.md owner-only #4).`
    );
    return NextResponse.json(
      { error: 'Only the Owner can disconnect QuickBooks.' },
      { status: 403 }
    );
  }

  let mode: DisconnectMode = 'keep';
  try {
    const body = (await request.json()) as { mode?: string };
    if (body.mode === 'clear') mode = 'clear';
  } catch {
    // No body -> the safe default. Clearing links is the destructive option and
    // must never be what an unparseable request falls through to.
  }

  const outcome = await performDisconnect(profile.company_id as string, mode, 'disconnected');
  return NextResponse.json(outcome);
}

interface DisconnectOutcome {
  ok: true;
  revoked: boolean;
  mode: DisconnectMode;
  clearedLinks: number | null;
}

/**
 * ⚠️ ORDER MATTERS. Revoke with Intuit FIRST, then drop our copy. Reversed, a
 * failure between the two would leave a live grant we can no longer address.
 *
 * ⚠️ IN-FLIGHT WORK IS PAUSED, NOT DISCARDED (§6, "user disconnects with
 * records in flight"). Queue rows stay exactly as they are: the queue is
 * partitioned by `realm_id`, so reconnecting to the SAME realm replays them,
 * and reconnecting to a DIFFERENT one is caught in /callback and escalated
 * rather than pushed into a stranger's books.
 */
async function performDisconnect(
  companyId: string,
  mode: DisconnectMode,
  finalState: 'disconnected' | 'revoked'
): Promise<DisconnectOutcome> {
  const admin = getSupabaseAdmin();

  const { data: company } = await admin
    .from('companies')
    .select('qb_token_secret_id')
    .eq('id', companyId)
    .single();

  const secretId = (company?.qb_token_secret_id as string | null) ?? null;

  let revoked = false;
  if (secretId) {
    try {
      const blob = await getTokenBlob(admin, secretId);
      if (blob) revoked = await revokeToken(blob.refresh_token);
    } catch (err) {
      // Best effort: a tenant whose token Intuit already dropped must still be
      // able to clear their own connection.
      console.error(`[qb-disconnect] revoke step failed for company=${companyId}:`, err);
    }
    try {
      await forgetTokenBlob(admin, secretId);
    } catch (err) {
      console.error(`[qb-disconnect] Vault delete failed for company=${companyId}:`, err);
    }
  }

  // ⚠️ `companies_qb_token_required_check` forbids `connected`/`needs_reauth`
  // with a null token id, so the state and the token id must move together, in
  // ONE update. Splitting them violates the constraint mid-way.
  await admin
    .from('companies')
    .update({
      qb_connection_state: finalState,
      qb_token_secret_id: null,
      // `qb_realm_id` is KEPT: `companies_qb_realm_required_check` only demands
      // it for non-disconnected states, and keeping it lets a reconnect to the
      // same realm be recognised as such. It is not a secret.
      qb_payments_enabled: false,
      qb_reauth_required_after: null,
    })
    .eq('id', companyId);

  let clearedLinks: number | null = null;
  if (mode === 'clear') {
    clearedLinks = await clearEntityLinks(admin, companyId);
  }

  return { ok: true, revoked, mode, clearedLinks };
}

/**
 * The "clear it" half of §5.3. Nulls the `qb_*_id` links so a future connection
 * to a different QuickBooks company starts clean.
 *
 * ⚠️ THIS TOUCHES NO MONEY AND DELETES NO ROW. It nulls REMOTE IDENTIFIERS
 * only — every invoice, payment, expense and contact survives untouched. The
 * `qb_push_status` values are reset alongside, because a record marked `pushed`
 * with no id is a lie about where it lives.
 *
 * ⚠️ EVERY QUERY IS SCOPED BY `company_id`. The service role bypasses RLS; a
 * missing filter here would blank every tenant's links [ruled S143].
 */
async function clearEntityLinks(
  admin: ReturnType<typeof getSupabaseAdmin>,
  companyId: string
): Promise<number> {
  let cleared = 0;

  const resets: Array<[string, Record<string, unknown>]> = [
    ['contacts', { qb_customer_id: null }],
    ['projects', { qb_sub_customer_id: null }],
    [
      'invoices',
      { qb_invoice_id: null, qb_invoice_link: null, qb_push_status: 'not_pushed', qb_synced_at: null },
    ],
    ['client_payments', { qb_payment_id: null, qb_push_status: 'not_pushed', qb_synced_at: null }],
    ['client_refunds', { qb_refund_id: null, qb_push_status: 'not_pushed', qb_synced_at: null }],
    ['expenses', { qb_bill_id: null, qb_push_status: 'not_pushed', qb_synced_at: null }],
  ];

  for (const [table, patch] of resets) {
    const { error, count } = await admin
      .from(table)
      .update(patch, { count: 'exact' })
      .eq('company_id', companyId);
    if (error) {
      console.error(`[qb-disconnect] clearing ${table} for company=${companyId} failed:`, error.message);
      continue;
    }
    cleared += count ?? 0;
  }

  return cleared;
}
