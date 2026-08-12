import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

/**
 * ND-41 — the notification expiry cron. Parent R2, A-N39.
 *
 * ===========================================================================
 * THIS IS NOTIFICATIONS-CORE WORK LANDING IN THE CHAT MODULE
 * ===========================================================================
 * Said plainly rather than filed under chat, the same way slice 4 said it for
 * the mention email. Parent **R2** expires unstarred rows at 30 days and parent
 * §5.6 specs this route — and the S125 audit found **six cron routes and none
 * of them it**, with no code anywhere reading `notifications.expires_at`.
 *
 * So R2 described something unbuilt, and **A-C23's second half tested nothing**:
 * "running /api/cron/notification-expiry deletes zero chat messages" cannot
 * fail when the route does not exist. Chat is simply what made it bite.
 *
 * ---------------------------------------------------------------------------
 * THE LOOP IS HERE AND THE AUTH GATE IS IN route.ts — the house shape
 * ---------------------------------------------------------------------------
 * A Next.js `route.ts` may only export route handlers and a fixed set of config
 * keys, so a loop living there cannot also be called from a harness with an
 * injected clock. Every other cron in this directory is split the same way.
 */

export interface ExpiryOutcome {
  /** Rows actually removed. */
  deleted: number;
  /** Rows past expiry that were SPARED because they are starred. */
  spared: number;
}

/**
 * Delete unstarred notifications past `expires_at`.
 *
 * ⚠️ `starred = false` IS THE WHOLE OF A-N39's SECOND HALF, and it is a filter
 * rather than a post-check on purpose. A job that selected expired rows and
 * then decided what to keep would delete everything past the date the moment
 * somebody "simplified" the loop — and starring is the one deliberate act a
 * user performs to keep a notification. The pair is the criterion: a job that
 * deletes everything past the date passes any "expired rows are removed"
 * assertion and quietly destroys exactly the rows a user chose to keep.
 *
 * ⚠️ SCOPED TO `notifications` AND NOTHING ELSE — A-C23. Chat messages have no
 * `expires_at` at all (R2 makes the log permanent), and this job must never
 * grow a second table. The `spared` count is returned so a run that deletes
 * nothing is distinguishable from a run that found nothing.
 *
 * `now` is a parameter, not `new Date()` inside, so the retention boundary can
 * be driven exactly in a test instead of by waiting 30 days.
 */
export async function runNotificationExpiry(
  admin: SupabaseClient<Database>,
  now: Date
): Promise<ExpiryOutcome> {
  const cutoff = now.toISOString();

  // Counted before the delete, because after it they are gone. This is the
  // number that makes the A-N39 pair observable from the outcome alone.
  const { count: spared } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .lt('expires_at', cutoff)
    .eq('starred', true);

  const { data, error } = await admin
    .from('notifications')
    .delete()
    .lt('expires_at', cutoff)
    .eq('starred', false)
    .select('id');

  if (error) {
    // Surfaced rather than swallowed: a cron that silently deletes nothing for
    // a month is indistinguishable from one that had nothing to do.
    console.error('[cron] notification-expiry failed:', error.message);
    return { deleted: 0, spared: spared ?? 0 };
  }

  return { deleted: (data ?? []).length, spared: spared ?? 0 };
}
