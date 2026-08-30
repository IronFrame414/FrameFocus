import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

/**
 * The tokenized resubscribe path [Q1a, deletion-sweep-analysis.md].
 *
 * ⚠️ WHY THIS EXISTS: the lock is an AUTH BAN (S137 Q3, deliberately), so the
 * retention warnings' one named action — resubscribe — cannot sit behind
 * sign-in. The token in the warning email is the credential that replaces the
 * session on exactly two surfaces: the /resubscribe page and its checkout
 * route. Everything else stays banned, exactly as ruled.
 *
 * ONE validator for both surfaces — a second copy of "is this token good" is
 * the parity divergence, written where it is hardest to notice.
 */

export interface ResubscribeContext {
  companyId: string;
  companyName: string;
  timezone: string;
  reason: 'trial' | 'cancellation';
  /** ISO — the deletion date the page names, same source as the emails. */
  deleteAfter: string;
  stripeCustomerId: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a resubscribe token to its company, or null.
 *
 * Valid ONLY while the lock it escapes exists: locked, not deleted, and
 * before `delete_after`. After deletion there is nothing to reach; after
 * unlock the token has been rotated by `unlock_trial_company()` and the row
 * no longer matches anyway — both ends of the window are enforced twice.
 *
 * Null on every failure mode alike (bad format, no match, expired): the page
 * shows one neutral message. Naming which check failed would let a guessed
 * token be refined.
 */
export async function getResubscribeContext(
  admin: SupabaseClient<Database>,
  token: string,
  now: Date
): Promise<ResubscribeContext | null> {
  if (!UUID_RE.test(token)) return null;

  const { data, error } = await admin
    .from('trial_lifecycle')
    .select('company_id, locked_at, deleted_at, delete_after, reason')
    .eq('resubscribe_token', token)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as {
    company_id: string;
    locked_at: string | null;
    deleted_at: string | null;
    delete_after: string | null;
    reason: string;
  };
  if (!row.locked_at || row.deleted_at || !row.delete_after) return null;
  if (new Date(row.delete_after) <= now) return null;

  const { data: company } = await admin
    .from('companies')
    .select('name, timezone, stripe_customer_id')
    .eq('id', row.company_id)
    .maybeSingle();
  if (!company) return null;

  return {
    companyId: row.company_id,
    companyName: (company as { name: string }).name,
    timezone: (company as { timezone: string }).timezone ?? 'America/New_York',
    reason: row.reason === 'cancellation' ? 'cancellation' : 'trial',
    deleteAfter: row.delete_after,
    stripeCustomerId: (company as { stripe_customer_id: string | null }).stripe_customer_id,
  };
}

/**
 * `delete_after` formatted long-form in the company's timezone — the SAME
 * rendering the warning emails use ("January 3, 2027"). Ruled: the date is
 * exact and never recomputed in a template.
 */
export function formatDeletionDate(deleteAfterIso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(deleteAfterIso));
}
