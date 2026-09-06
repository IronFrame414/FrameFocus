import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { notify } from '@/lib/notify/notify';
import { getManagerNotifyRecipients } from '@/lib/notify/recipients';
import type { QbQueueRow } from './queue';

/**
 * 7G §2.3 [S182] — tell a person that a sync row is waiting on them.
 *
 * ⚠️ THE DEFECT THIS CLOSES. A park surfaced on ONE screen, Settings →
 * Accounting. Josh hit the customer-name conflict while **sending an invoice**
 * and saw nothing: the send succeeded, the sync silently stopped, and the
 * prompt that would unblock it sat on a page he had no reason to open.
 *
 * ⚠️ ONE PRODUCER, EVERY PARK REASON — INCLUDING ONES NOT WRITTEN YET. This is
 * called from the worker wherever `parkAwaitingHuman()` is, so a new park
 * reason is announced without anyone remembering to add a notification. Same
 * argument M-E makes for triggers over call sites, applied to the queue.
 *
 * ⚠️ OWNER + ADMIN ONLY, AND THAT IS A FLOOR DECISION. `last_error` is stored
 * VERBATIM in the notification body and can contain money — the invoice
 * line-sum guard puts dollar figures in its park text. R7 puts the Financial
 * Visibility Floor in the STORED text, so the audience must be the roles
 * allowed to read those figures.
 *
 * ⚠️ IT NEVER THROWS. A drain must not fail because a notification could not be
 * written; the row is already parked and the Accounting screen still shows it.
 */
export async function notifyParked(
  admin: SupabaseClient,
  companyId: string,
  row: QbQueueRow,
  reason: string
): Promise<void> {
  try {
    // ⚠️ DEDUPE ON (queue row, reason) — NOT ON THE ROW ALONE.
    //
    // A parked row re-checks every five minutes, so keying on the row alone is
    // the difference between one notification and twelve an hour. But keying on
    // the row ONLY would also swallow a genuinely NEW blocker: the S182 bill
    // parked twice for different reasons (vendor unmapped, then an unresolvable
    // GL account), and the second is news. Comparing the body distinguishes
    // "still stuck on the same thing" from "stuck on something else now".
    const { data: existing } = await admin
      .from('notifications')
      .select('id, body')
      .eq('company_id', companyId)
      .eq('source_table', 'qb_sync_queue')
      .eq('source_id', row.id)
      .eq('body', reason)
      .limit(1);

    if ((existing ?? []).length > 0) return;

    const recipients = await getManagerNotifyRecipients(
      admin as SupabaseClient<Database>,
      companyId
    );
    if (recipients.length === 0) return;

    await notify({
      admin: admin as SupabaseClient<Database>,
      companyId,
      type: 'qb_sync_blocked',
      recipients,
      // R7 demands a per-recipient render. Owner and Admin both see everything
      // in scope here, so every recipient legitimately gets the same bytes —
      // the function is what keeps a per-recipient split a change of body
      // rather than a change of call.
      render: () => ({
        title: `QuickBooks sync needs you — ${labelFor(row)}`,
        body: reason,
      }),
      linkKey: 'qb',
      linkParams: {},
      source: { table: 'qb_sync_queue', id: row.id },
      // Collapses an OS-level repeat for the same queue row.
      tag: `qb-park-${row.id}`,
    });
  } catch (err) {
    console.error(`[qb-worker] could not raise a park notification for row ${row.id}:`, err);
  }
}

/** Plain English for the notification title. The queue's vocabulary
 *  (`sub_customer`, `bill_payment`) is ours, not the reader's. */
function labelFor(row: QbQueueRow): string {
  const nouns: Record<string, string> = {
    customer: 'a client',
    sub_customer: 'a project',
    invoice: 'an invoice',
    payment: 'a payment',
    refund: 'a refund',
    vendor: 'a supplier',
    bill: 'a bill',
    purchase: 'an expense',
    bill_payment: 'a bill payment',
    time_activity: 'a time entry',
  };
  return nouns[row.entity_type] ?? 'a record';
}
