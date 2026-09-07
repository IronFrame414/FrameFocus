import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { forgetTokenBlob, getTokenBlob, revokeToken } from '@/lib/quickbooks/tokens';
import { QB_LINK_RESETS } from '@/lib/quickbooks/disconnect-resets';

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
      // ⚠️ THE CDC CURSOR IS CONNECTION STATE, NOT A LINK [#2-7gqb, S104]. Left
      // standing, a reconnect to a DIFFERENT QuickBooks company would treat the
      // old realm's timestamp as "when we last looked at this one" and skip
      // everything before it — the backstop would start life with a blind spot
      // exactly as wide as the gap between the two connections. Nulling it makes
      // the first poll after any reconnect a bounded first look-back.
      qb_cdc_polled_at: null,
    })
    .eq('id', companyId);

  // ⚠️ THE ACCOUNT CACHE GOES ON EVERY DISCONNECT, `keep` INCLUDED [M-J]. It
  // mirrors ONE realm's chart of accounts, and account ids are realm-local — a
  // reconnect to a different QuickBooks company would otherwise offer the old
  // company's accounts, and picking one would post real money to an id that
  // means something else entirely. Serving nothing is strictly safer than
  // serving another business's chart.
  //
  // ⚠️ NOTE THIS IS NOT PART OF `mode === 'clear'`. That choice is about
  // KEEPING THE LINKS between our records and QuickBooks objects, which is
  // exactly what makes a reconnect to the SAME realm work. A cache is not a
  // link — it is a copy of someone else's list, and it costs one metered read
  // to rebuild.
  const { error: cacheError } = await admin
    .from('qb_account_cache')
    .delete()
    .eq('company_id', companyId);
  if (cacheError) {
    console.error(`[qb-disconnect] could not clear the account cache:`, cacheError.message);
  }

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

  // ⚠️ THE LIST LIVES IN `lib/quickbooks/disconnect-resets.ts`, NOT HERE. A
  // route module cannot export it (Next.js rejects unrecognised route exports
  // at build time while `tsc` says nothing), and `s187-qb-link-census.test.ts`
  // has to import it — a list nothing can read is a list nothing can guard.
  // Read that file's header before adding a `qb_*_id` column anywhere.
  const resets = QB_LINK_RESETS;

  for (const [table, patch] of resets) {
    // ⚠️ ONLY ROWS THAT ACTUALLY CARRY A LINK. A blanket update over the table
    // is not merely wasteful — it is fragile in a way that DEFEATS THIS
    // FUNCTION [found by running it, S187]:
    //
    // `expense_payments` carries `expense_payments_retainage_rate_recorded_check`
    // as a **NOT VALID** constraint, so legacy rows are allowed to violate it —
    // until something UPDATES them, at which point the row is re-checked and
    // the write fails. One such row exists on rebuild-test
    // (`retainage_withheld = 60.00`, `retainage_percent_applied = null`).
    //
    // ⚠️ AND THE FAILURE WOULD HAVE BEEN SILENT. The handler below logs and
    // `continue`s, so a single unrelated legacy row would make the ENTIRE
    // table's links survive "clear the links" — reintroducing the exact
    // corruption this list was extended to prevent, by a different door.
    //
    // Scoping to rows with a non-null id fixes it: a row with nothing to forget
    // is never touched, so its unrelated constraint is never re-evaluated.
    const idColumns = Object.keys(patch).filter((c) => /^qb_\w+_id$/.test(c));
    const linkFilter = idColumns.map((c) => `${c}.not.is.null`).join(',');

    const { error, count } = await admin
      .from(table)
      .update(patch, { count: 'exact' })
      .eq('company_id', companyId)
      .or(linkFilter);
    if (error) {
      console.error(`[qb-disconnect] clearing ${table} for company=${companyId} failed:`, error.message);
      continue;
    }
    cleared += count ?? 0;
  }

  return cleared;
}
