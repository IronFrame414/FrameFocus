import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { CompanyRole } from '@framefocus/shared';
import {
  isOverrideType,
  shouldPushNow,
  type NotifyWindow,
} from '@framefocus/shared/utils/notify-hours';
import { sendPushToProfile } from '@/lib/notify/push';
import type { LinkParams } from '@/lib/notify/links';

/**
 * notify() — THE SINGLE ENTRY POINT.
 *
 * Spec: docs/specs/notifications-architecture.md §4.6.
 *
 * ===========================================================================
 * NO MODULE WRITES NOTIFICATION ROWS DIRECTLY. EVER.
 * ===========================================================================
 * Consumers call this. The reason is not tidiness — it is that three separate
 * rules are enforced HERE and nowhere else, and a module that inserts its own
 * row silently opts out of all three:
 *
 *   R7  the Financial Visibility Floor, applied per recipient at WRITE time
 *   R4  notify-hours, evaluated in the company's timezone
 *   ND-5 the incident override
 *
 * ===========================================================================
 * WHY `render` IS A FUNCTION AND NOT A STRING
 * ===========================================================================
 * This is R7's enforcement point, expressed in the type system. A single
 * `title: string` would let one rendering reach every recipient, and the
 * Financial Visibility Floor would then have to be applied by whoever remembered
 * — which is precisely the UI-layer enforcement TECH_DEBT #117 exists to record
 * as insufficient.
 *
 * By making the caller supply `render(recipient)`, producing different bytes for
 * an Owner and a PM is the DEFAULT SHAPE of the call rather than an extra step.
 * §3e is the canonical case: the Owner's row says "Alvarez CO #3 signed by
 * Ruiz — $4,200" and the PM's says "Alvarez CO #3 signed by Ruiz", and they are
 * different rows with different stored text.
 *
 * ===========================================================================
 * WHAT THIS NEVER DOES
 * ===========================================================================
 * · It never throws for a delivery failure. The business event that triggered
 *   the notification has already happened; failing to tell somebody about it
 *   must not roll it back. incident-notify.ts already states this rule for
 *   email ("Send failure NEVER rolls back") and this extends it to push.
 * · It never queues. Outside notify-hours the row is written and no push is
 *   sent — and nothing is scheduled to send it later (R4, A-N7).
 */

export interface NotifyRecipient {
  /** profiles.id — ND-2. Never a company_members.id. */
  profileId: string;
  role: CompanyRole;
  email?: string | null;
  firstName?: string | null;
}

export interface NotifyRendered {
  title: string;
  /** Null renders a title-only notification, not an empty body. */
  body?: string | null;
  /**
   * Per-recipient link override. ND-8: a non-author PM gets a CO notification
   * with NO link, because the S121 read floor makes the row unreadable to them
   * and a link would 404. Returning `null` here is how a renderer says that.
   * `undefined` means "use the call-level linkKey".
   */
  linkKey?: string | null;
}

export type NotificationType =
  | 'mention'
  | 'assignment'
  | 'incident'
  | 'signed'
  | 'reminders_exhausted'
  | 'discrepancy'
  | 'timesheet_ready'
  | 'daily_log_missing'
  | 'still_clocked_in'
  | 'contract_signed'
  | 'punch_assigned'
  | 'low_stock';

export interface NotifyParams {
  admin: SupabaseClient<Database>;
  companyId: string;
  type: NotificationType;
  recipients: NotifyRecipient[];
  /** R7's enforcement point. Called once PER RECIPIENT. */
  render: (recipient: NotifyRecipient) => NotifyRendered;
  linkKey?: string | null;
  linkParams?: LinkParams;
  projectId?: string | null;
  source?: { table: string; id: string } | null;
  /** Collapses OS-level repeats of the same source. */
  tag?: string;
  /** Test seam only. Production always uses the real clock. */
  now?: Date;
}

export interface NotifyOutcome {
  written: number;
  pushed: number;
  pruned: number;
  /** Recipients skipped because they had no profile to write a row for (§13). */
  unreachable: number;
}

/**
 * Read the company's notify-hours window.
 *
 * Reads through the SERVICE-ROLE client on purpose: notify() runs from crons and
 * webhook handlers where there is no signed-in user, so a request-scoped client
 * would return no row and the window would silently fall back.
 */
async function loadWindow(
  admin: SupabaseClient<Database>,
  companyId: string
): Promise<NotifyWindow> {
  const { data } = await admin
    .from('companies')
    .select('timezone, notify_hours_start, notify_hours_end')
    .eq('id', companyId)
    .single();

  return {
    // The columns are NOT NULL with defaults, so these fallbacks are
    // unreachable in practice. They exist so a missing company row degrades to
    // "notify normally" instead of throwing inside a cron.
    timeZone: data?.timezone ?? 'America/New_York',
    start: data?.notify_hours_start ?? '07:00',
    end: data?.notify_hours_end ?? '18:00',
  };
}

export async function notify(params: NotifyParams): Promise<NotifyOutcome> {
  const {
    admin,
    companyId,
    type,
    recipients,
    render,
    linkKey = null,
    linkParams = {},
    projectId = null,
    source = null,
    tag,
    now = new Date(),
  } = params;

  const outcome: NotifyOutcome = { written: 0, pushed: 0, pruned: 0, unreachable: 0 };
  if (recipients.length === 0) return outcome;

  const window = await loadWindow(admin, companyId);
  // ND-5: every incident type overrides. There is no severity column and none is
  // added, so this is a type test and never a field test.
  const push = shouldPushNow(now, window, isOverrideType(type));

  // De-duplicate by profile. A recipient set assembled from two overlapping
  // rules (say "everyone above the filer" plus "the project's PM") would
  // otherwise deliver the same event twice to the same person.
  const seen = new Set<string>();
  const unique = recipients.filter((r) => {
    if (!r.profileId) {
      // §13: a subcontractor with an email but no profile is reachable by email
      // only. Counted, never silently dropped, and never a throw.
      outcome.unreachable += 1;
      return false;
    }
    if (seen.has(r.profileId)) return false;
    seen.add(r.profileId);
    return true;
  });

  for (const recipient of unique) {
    // R7 — rendered HERE, per recipient, before anything is stored.
    const rendered = render(recipient);
    const effectiveLinkKey =
      rendered.linkKey === undefined ? linkKey : rendered.linkKey;

    const { data: row, error } = await admin
      .from('notifications')
      .insert({
        company_id: companyId,
        recipient_profile_id: recipient.profileId,
        type,
        title: rendered.title,
        body: rendered.body ?? null,
        link_key: effectiveLinkKey,
        link_params: linkParams as never,
        project_id: projectId,
        source_table: source?.table ?? null,
        source_id: source?.id ?? null,
      })
      .select('id')
      .single();

    if (error || !row) {
      // A failed row write is logged and stepped over — one recipient's storage
      // failure must not deny the rest of the set their notification.
      console.error('[notify] row insert failed', {
        type,
        companyId,
        recipientProfileId: recipient.profileId,
        error: error?.message,
      });
      continue;
    }

    outcome.written += 1;

    if (!push) continue;

    const result = await sendPushToProfile(admin, recipient.profileId, {
      title: rendered.title,
      body: rendered.body ?? null,
      notificationId: row.id,
      linkKey: effectiveLinkKey,
      linkParams,
      tag,
    });
    outcome.pushed += result.sent;
    outcome.pruned += result.pruned;
  }

  return outcome;
}
