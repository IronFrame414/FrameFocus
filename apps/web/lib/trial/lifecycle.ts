import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { notify } from '@/lib/notify/notify';
import { getManagerNotifyRecipients } from '@/lib/notify/recipients';

/**
 * S137 — the trial lifecycle: warnings, the lock, and the retention clock.
 *
 * Spec: docs/specs/trial-lifecycle-spec.md
 *
 *   day −7   warning        email + in-app, Owner and Admin
 *   day −3   warning
 *   day  0   trial expires  ACCOUNT LOCKED — auth users banned
 *            14 days retained, recoverable only by paying
 *   day 14   DELETED        (lib/trial/deletion.ts — BUILT AND UNSCHEDULED)
 *
 * ---------------------------------------------------------------------------
 * THE LOOPS LIVE HERE AND THE AUTH GATES LIVE IN route.ts — the house shape
 * ---------------------------------------------------------------------------
 * A Next.js `route.ts` may only export route handlers and a fixed set of config
 * keys, so a loop living there cannot also be driven from a harness with an
 * injected clock. Every cron in `lib/notify/crons/` is split the same way and
 * this follows it: `now` is a parameter, never `new Date()` inside, so a
 * 30-day boundary can be driven exactly instead of waited for.
 */

/** How long after the lock the data is kept. Trial path only — a PAID
 *  cancellation gets 30 days and is a different path that is not built here. */
export const RETENTION_DAYS_TRIAL = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WarningOutcome {
  /** Companies warned at the −7 boundary on this run. */
  warned7: number;
  /** Companies warned at the −3 boundary on this run. */
  warned3: number;
  /** Rows already warned at that boundary — the idempotency guard working. */
  skipped: number;
}

export interface LockOutcome {
  locked: number;
  /** Auth users banned across all locked companies. */
  banned: number;
  /** Companies skipped because a postpone is in force. */
  postponed: number;
}

/** A lifecycle row as these loops read it. */
interface LifecycleRow {
  company_id: string;
  trial_end: string;
  warned_7_at: string | null;
  warned_3_at: string | null;
  locked_at: string | null;
  postponed_until: string | null;
  deleted_at: string | null;
}

/**
 * Is a manual postpone in force?
 *
 * ⚠️ EVERY STEP CONSULTS THIS, not just deletion. Josh sets the flag by hand
 * inside the 14 days; a postponed company that still received "your data will
 * be destroyed in 3 days" would make the flag look broken to the customer even
 * though the deletion was correctly held.
 */
export function isPostponed(row: { postponed_until: string | null }, now: Date): boolean {
  return row.postponed_until !== null && new Date(row.postponed_until) > now;
}

/** Whole days from `now` until `trialEnd`, rounded up: 6.2 days left is "7". */
export function daysUntil(trialEnd: string, now: Date): number {
  return Math.ceil((new Date(trialEnd).getTime() - now.getTime()) / DAY_MS);
}

async function activeLifecycleRows(
  admin: SupabaseClient<Database>
): Promise<LifecycleRow[]> {
  const { data, error } = await admin
    .from('trial_lifecycle')
    .select('company_id, trial_end, warned_7_at, warned_3_at, locked_at, postponed_until, deleted_at')
    .is('deleted_at', null);
  if (error) throw new Error(`trial_lifecycle read: ${error.message}`);
  return (data ?? []) as unknown as LifecycleRow[];
}

/**
 * Day −7 and day −3 warnings, to Owner and Admin, on both channels.
 *
 * ⚠️ `warned_7_at` / `warned_3_at` ARE THE IDEMPOTENCY GUARD, not decoration.
 * A cron that runs twice in a day — a retry, a manual invocation, a deploy that
 * replays it — must not warn twice. The stamp is written in the same step, and
 * the boundary test reads the stamp rather than the date, so a run at day −6
 * that finds `warned_7_at` NULL still warns: a missed cron is worse than a late
 * warning when the alternative is silent permanent deletion.
 *
 * ⚠️ EMAIL IS CURRENTLY UNRELIABLE — mail is accepted by Resend and discarded
 * at Gmail (S136, under separate investigation). Josh's position is that it
 * will be fixed before this matters, and it is recorded here rather than
 * assumed away: the in-app channel is not a nicety, it is the channel that
 * currently works.
 */
export async function runTrialWarnings(
  admin: SupabaseClient<Database>,
  now: Date
): Promise<WarningOutcome> {
  const outcome: WarningOutcome = { warned7: 0, warned3: 0, skipped: 0 };

  for (const row of await activeLifecycleRows(admin)) {
    if (row.locked_at) continue; // already past expiry — the lock owns it now
    if (isPostponed(row, now)) continue;

    const left = daysUntil(row.trial_end, now);
    if (left <= 0) continue; // expiry is the lock's job, not a warning

    // −3 is checked FIRST: a company at 2 days left needs the urgent warning,
    // not the one it should have had a week ago.
    let kind: 'day_3' | 'day_7' | null = null;
    if (left <= 3 && !row.warned_3_at) kind = 'day_3';
    else if (left <= 7 && !row.warned_7_at) kind = 'day_7';

    if (!kind) {
      if (left <= 7) outcome.skipped += 1;
      continue;
    }

    const recipients = await getManagerNotifyRecipients(admin, row.company_id);

    // A company with no reachable Owner or Admin still gets its stamp: without
    // it the loop retries this company on every tick forever, and the absence
    // of a recipient is not something a later run will fix.
    if (recipients.length > 0) {
      await notify({
        admin,
        companyId: row.company_id,
        type: 'trial_warning',
        recipients,
        // ⚠️ NO CUSTOMER-FACING DELETION WORDING HERE. TL-23 is with legal
        // review (Module 7's lien-waiver posture). The title states the fact;
        // the screen the link points at carries the explanation, and its copy
        // is a visible, named gap rather than a placeholder that reads like
        // approved language.
        render: () => ({
          title: kind === 'day_3' ? 'Trial ends in 3 days' : 'Trial ends in 7 days',
          body: null,
        }),
        linkKey: 'trial_warning',
        linkParams: { kind },
        now,
      });
    }

    const stamp = kind === 'day_3' ? { warned_3_at: now.toISOString() } : { warned_7_at: now.toISOString() };
    const { error } = await admin
      .from('trial_lifecycle')
      .update(stamp)
      .eq('company_id', row.company_id);
    if (error) throw new Error(`stamp ${kind} for ${row.company_id}: ${error.message}`);

    if (kind === 'day_3') outcome.warned3 += 1;
    else outcome.warned7 += 1;
  }

  return outcome;
}

/**
 * Expiry: lock the account and start the retention clock.
 *
 * ⚠️ THE LOCK IS A SESSION BAN, NOT A REDIRECT [Josh, S137 Q3]. Routing alone
 * was rejected because S131 already ruled that a redirect protects no data — a
 * locked tenant's own JWT still satisfies every RLS policy through PostgREST,
 * so `/m`, every API route and any direct call would keep working. (Measured
 * while specifying: today's middleware runs its subscription check ONLY for
 * `/dashboard`, so the pre-existing enforcement would not have locked anything.)
 * A data-level gate was rejected because it would have to sit in
 * `get_my_company_id()` — the keystone every policy depends on — where getting
 * it wrong locks out PAYING customers.
 *
 * Banning is literally what was ruled ("no login"), is reversible in one call,
 * and touches nothing a paying customer depends on.
 *
 * `delete_after` is STORED rather than computed at deletion time, so the
 * retention window is a fact on the row instead of arithmetic repeated in a
 * second place that could disagree.
 */
export async function runTrialLock(
  admin: SupabaseClient<Database>,
  now: Date
): Promise<LockOutcome> {
  const outcome: LockOutcome = { locked: 0, banned: 0, postponed: 0 };

  for (const row of await activeLifecycleRows(admin)) {
    if (row.locked_at) continue;
    if (new Date(row.trial_end) > now) continue;

    if (isPostponed(row, now)) {
      outcome.postponed += 1;
      continue;
    }

    // Paying customers are not locked. The lifecycle row exists for every
    // trial, including ones that converted, so this is the test that keeps a
    // converted customer out of the whole mechanism.
    const { data: sub } = await admin
      .from('subscriptions')
      .select('status')
      .eq('company_id', row.company_id)
      .maybeSingle();
    if (sub && (sub as { status: string }).status === 'active') continue;

    outcome.banned += await banCompanyUsers(admin, row.company_id);

    const lockedAt = now;
    const deleteAfter = new Date(lockedAt.getTime() + RETENTION_DAYS_TRIAL * DAY_MS);
    const { error } = await admin
      .from('trial_lifecycle')
      .update({ locked_at: lockedAt.toISOString(), delete_after: deleteAfter.toISOString() })
      .eq('company_id', row.company_id);
    if (error) throw new Error(`lock ${row.company_id}: ${error.message}`);

    outcome.locked += 1;
  }

  return outcome;
}

/** Ban every auth user of a company. Returns how many were banned. */
export async function banCompanyUsers(
  admin: SupabaseClient<Database>,
  companyId: string
): Promise<number> {
  const { data: profiles } = await admin
    .from('profiles')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('is_deleted', false);

  let banned = 0;
  for (const p of (profiles ?? []) as Array<{ user_id: string | null }>) {
    if (!p.user_id) continue;
    // Long enough to outlast retention several times over. The unban on payment
    // is what actually ends it — a duration that expired on its own would
    // silently readmit a company whose data had already been deleted.
    const { error } = await admin.auth.admin.updateUserById(p.user_id, {
      ban_duration: '8760h',
    });
    if (!error) banned += 1;
  }
  return banned;
}

/**
 * Payment landed — undo the lock.
 *
 * ⚠️ THIS IS THE ONLY WAY BACK, so it must clear BOTH the ban and the retention
 * clock. Leaving `delete_after` set on a company that has paid would delete a
 * paying customer, which is the worst outcome this feature can produce.
 */
export async function unlockCompany(
  admin: SupabaseClient<Database>,
  companyId: string
): Promise<{ unbanned: number }> {
  const { data: profiles } = await admin
    .from('profiles')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('is_deleted', false);

  let unbanned = 0;
  for (const p of (profiles ?? []) as Array<{ user_id: string | null }>) {
    if (!p.user_id) continue;
    const { error } = await admin.auth.admin.updateUserById(p.user_id, { ban_duration: 'none' });
    if (!error) unbanned += 1;
  }

  await admin
    .from('trial_lifecycle')
    .update({ locked_at: null, delete_after: null })
    .eq('company_id', companyId);

  return { unbanned };
}
