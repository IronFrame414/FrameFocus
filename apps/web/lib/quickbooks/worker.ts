import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { QboApiError } from './client';
import { handleQueueRow, newDrainContext } from './entities';
import {
  claimDue,
  countWaiting,
  markFailed,
  markInFlight,
  markPushed,
  parkAwaitingHuman,
  type QbQueueRow,
} from './queue';
import { notifyParked } from './park-notify';
import { getAccessToken } from './tokens';

/**
 * 7G — the sync worker. Drains `qb_sync_queue`, one tenant at a time.
 *
 * ⚠️ SERVICE ROLE + AN EXPLICIT `company_id` ON EVERY QUERY [ruled S143, the
 * `invoice-derivation-server.ts` pattern]. "It is protected only by its own
 * discipline — take `company_id` as a parameter, never derive it from a
 * just-read row, never query without it."
 *
 * ⚠️ THE MOST DANGEROUS PATH IN 7G IS A HALF-SYNCED CREATE: QuickBooks accepts
 * the object and the write-back of `qb_*_id` fails. The record then re-queues,
 * and a naive retry would create a SECOND invoice — QuickBooks has no PUT, so a
 * second POST is a second object. Two shipped guarantees stop that, and neither
 * is optional:
 *
 *   1. `idx_qb_sync_queue_one_live_per_entity_op` — only one live row per
 *      (entity, operation) can exist at a time.
 *   2. Every handler's FIRST act is to check whether the local row already
 *      carries its `qb_*_id` and return `pushed` if so.
 *
 * The residual window is narrow and worth naming: QB accepted, our write-back
 * failed, so the id is NOT stored and check (2) cannot see it. The retry then
 * duplicates. Closing that fully needs an idempotency key Intuit does not offer
 * for all entity types; what limits it today is that the write-back is a single
 * statement immediately after the call, and that the queue row stays
 * `in_flight` until it completes. **Recorded, not hidden.**
 */

/** Rows per tenant per invocation. Small on purpose: the cron runs every five
 *  minutes, and a long single-tenant drain would starve the others. */
const ROWS_PER_COMPANY = 25;

export interface DrainOutcome {
  companiesConsidered: number;
  companiesDrained: number;
  pushed: number;
  parked: number;
  failedTransient: number;
  failedTerminal: number;
  skippedNotConnected: number;
  /**
   * Live rows that existed but were NOT claimable this pass — parked awaiting a
   * person, backing off after a transient failure, or held behind an
   * unsatisfied `depends_on_id`.
   *
   * ⚠️ WITHOUT THIS FIELD A DRAIN CANNOT SAY WHY IT DID NOTHING [S181]. An
   * empty queue and a queue full of parked money work produced the identical
   * all-zero response. `waiting > 0` alongside `companiesDrained: 0` is the
   * signal that says "look at `last_error` on the queue", and its absence is
   * what sent an investigation at the claim query, which was never at fault.
   */
  waiting: number;
}

export async function runQbSync(admin: SupabaseClient): Promise<DrainOutcome> {
  const outcome: DrainOutcome = {
    companiesConsidered: 0,
    companiesDrained: 0,
    pushed: 0,
    parked: 0,
    failedTransient: 0,
    failedTerminal: 0,
    skippedNotConnected: 0,
    waiting: 0,
  };

  // Only tenants that are actually connected. A `needs_reauth` company is
  // skipped and its rows are LEFT `queued` — [Josh, S148] nothing is marked
  // failed, because nothing is wrong with the records.
  const { data: companies, error } = await admin
    .from('companies')
    .select('id, qb_realm_id, qb_connection_state')
    .eq('qb_connection_state', 'connected');

  if (error) {
    console.error('[qb-worker] could not list connected companies:', error.message);
    return outcome;
  }

  for (const company of companies ?? []) {
    outcome.companiesConsidered += 1;
    const companyId = company.id as string;

    let rows = await claimDue(admin, companyId, ROWS_PER_COMPANY);
    if (rows.length === 0) {
      // Nothing claimable. Say whether that is because there is nothing to do,
      // or because there IS work and it is waiting on something. See `waiting`.
      outcome.waiting += await countWaiting(admin, companyId);
      continue;
    }

    const conn = await getAccessToken(admin, companyId);
    if (!conn) {
      // Not connected, needs_reauth, or a transient refresh failure. The rows
      // stay exactly as they are and flow on the next pass.
      outcome.skippedNotConnected += 1;
      continue;
    }

    outcome.companiesDrained += 1;
    const ctx = newDrainContext(admin, conn, companyId);
    let budget = ROWS_PER_COMPANY;
    let passes = 0;

    // ⚠️ CASCADE THE DEPENDENCY CHAIN WITHIN ONE DRAIN [§2.6, S182].
    //
    // `claimDue` resolves `depends_on_id` ONCE, at claim time, so a customer
    // pushed in this pass does not release its sub-customer until the NEXT
    // invocation. customer -> sub_customer -> invoice therefore took THREE
    // drains, and at a five-minute cron that is **fifteen minutes** before an
    // invoice reaches QuickBooks. Measured, not assumed: the Purchase proof in
    // Unit 14 needed exactly three.
    //
    // ⚠️ IT IS SAFE BECAUSE EVERY OUTCOME REMOVES THE ROW FROM CONTENTION, so
    // the loop cannot re-claim what it just handled and cannot spin:
    //   pushed           -> terminal status
    //   failed_terminal  -> terminal status
    //   failed_transient -> `next_attempt_at` moves into the future (backoff)
    //   parked           -> stays `queued`, `next_attempt_at` +5 minutes
    // Each is excluded by the claim query's own filters on the next pass.
    //
    // ⚠️ AND IT DOES NOT RAISE THE PER-TENANT BUDGET. `budget` spans the whole
    // drain, not each pass. ROWS_PER_COMPANY exists so a long single-tenant
    // drain cannot starve the others; cascading is about LATENCY within that
    // allowance, never about throughput. A pass that pushes nothing ends the
    // loop, so a queue of independent rows still costs exactly one pass.
    while (rows.length > 0 && budget > 0) {
      passes += 1;
      const pushedBefore = outcome.pushed;

      for (const row of rows) {
        // ⚠️ A ROW QUEUED FOR A DIFFERENT REALM IS NEVER PUSHED. The queue is
        // partitioned by realm precisely so a reconnect to another QuickBooks
        // company cannot silently retarget old work into a stranger's books.
        // /callback escalates these on reconnect; this is the belt to that braces.
        if (row.realm_id && row.realm_id !== conn.realmId) {
          await markFailed(
            admin,
            row,
            'Queued for a different QuickBooks company than the one now connected.',
            false
          );
          outcome.failedTerminal += 1;
          continue;
        }

        await markInFlight(admin, row.id);

        try {
          const result = await handleQueueRow(ctx, row);
          if (result.kind === 'pushed') {
            await markPushed(admin, row.id);
            outcome.pushed += 1;
          } else if (result.kind === 'park') {
            await parkAwaitingHuman(admin, row.id, result.reason);
            // §2.3 — a park has to reach a person, not just a settings screen.
            // Deduped on (row, reason) inside; never throws.
            await notifyParked(admin, companyId, row, result.reason);
            outcome.parked += 1;
          } else {
            await markFailed(admin, row, result.reason, false);
            outcome.failedTerminal += 1;
            await markRecordFailed(admin, companyId, row);
          }
        } catch (err) {
          const retryable = err instanceof QboApiError ? err.retryable : true;
          const message =
            err instanceof QboApiError
              ? err.message
              : `Unexpected error: ${(err as Error).message}`;
          await markFailed(admin, row, message, retryable);
          if (retryable) {
            outcome.failedTransient += 1;
          } else {
            outcome.failedTerminal += 1;
            await markRecordFailed(admin, companyId, row);
          }
          console.error(
            `[qb-worker] company=${companyId} row=${row.id} ${row.entity_type}:${row.operation} failed (retryable=${retryable}):`,
            message
          );
        }
      }

      budget -= rows.length;
      // Only a PUSH can have released a dependant. A pass that parked or failed
      // everything has changed nothing for anyone waiting, so stop.
      if (outcome.pushed === pushedBefore || budget <= 0) break;
      rows = await claimDue(admin, companyId, budget);
    }

    if (passes > 1) {
      console.log(`[qb-worker] company=${companyId} drained in ${passes} dependency passes.`);
    }
  }

  return outcome;
}

/** Table + id column for each entity type that carries a `qb_push_status`. */
const RECORD_TABLE_FOR_ENTITY: Record<string, string> = {
  invoice: 'invoices',
  bill: 'expenses',
  purchase: 'expenses',
  bill_payment: 'expense_payments',
  expense_payment: 'expense_payments',
  payment: 'client_payments',
  refund: 'client_refunds',
};

/**
 * Mirror a TERMINAL failure onto the record itself.
 *
 * ⚠️ WHY ONLY TERMINAL. `qb_push_status` is what the invoice, expense and
 * payment screens read. Flipping it to `failed` on a transient error would show
 * every user an alarming state during a routine Intuit blip that the queue is
 * about to retry on its own. A terminal failure is different: nothing more will
 * happen without a person, so the record should say so.
 *
 * ⚠️ THE VALUE MUST BE ONE OF THE FOUR THE CHECK CONSTRAINT ALLOWS —
 * `not_pushed | queued | pushed | failed`. The QUEUE's vocabulary
 * (`failed_transient` / `failed_terminal`) is a different, wider enum and
 * writing one of those here raises a constraint violation.
 */
async function markRecordFailed(
  admin: SupabaseClient,
  companyId: string,
  row: QbQueueRow
): Promise<void> {
  const table = RECORD_TABLE_FOR_ENTITY[row.entity_type];
  if (!table) return;
  const { error } = await admin
    .from(table)
    .update({ qb_push_status: 'failed' })
    .eq('id', row.entity_id)
    .eq('company_id', companyId);
  if (error) {
    console.error(`[qb-worker] could not mark ${table} ${row.entity_id} failed:`, error.message);
  }
}
