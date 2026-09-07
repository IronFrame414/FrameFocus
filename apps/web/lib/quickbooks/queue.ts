import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 7G — `qb_sync_queue` operations. The durable, dependency-ordered work list.
 *
 * The TABLE shipped at `20260929000000`; this is the code that drives it.
 * Nothing here invents policy the migration did not already state — read that
 * header for the status model and for why `invalid_grant` is not a row failure.
 *
 * ⚠️ THE WORKER'S PRIVILEGE IS THE DANGER [ruled S143]. Every function takes a
 * `companyId` PARAMETER and filters on it. The service role bypasses RLS
 * entirely, so a query written without `company_id` reads every tenant's work.
 * Never derive the company from a just-read row; take it from the caller, which
 * got it from a scoped context.
 */

export type QbEntityType =
  | 'customer'
  | 'sub_customer'
  | 'invoice'
  | 'payment'
  | 'refund'
  | 'vendor'
  | 'bill'
  | 'time_activity'
  // M-G [S103]: an actual cost is a Purchase, not a Bill. `bill` survives only
  // for the two that already exist in QuickBooks.
  | 'purchase'
  // ⚠️ M-L [S103]: a recorded PAYMENT becomes one Purchase. `bill_payment` and
  // `bill` stay in the union ONLY because nine historical rows carry them —
  // nothing produces either any more, and the dispatch answers both terminally.
  | 'bill_payment'
  | 'expense_payment';

export type QbOperation = 'create' | 'update' | 'void';

export interface QbQueueRow {
  id: string;
  company_id: string;
  realm_id: string | null;
  entity_type: QbEntityType;
  entity_id: string;
  operation: QbOperation;
  depends_on_id: string | null;
  status: string;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  created_at: string | null;
}

/**
 * ⚠️ THE RETRY CEILING. 7g2 §6 leaves this to build; it is set here and stated
 * so it is not re-guessed elsewhere.
 *
 * 8 attempts on the schedule below spans roughly 8 hours before a row is
 * escalated to `failed_terminal` and put in front of a human. Generous on
 * purpose: **a failed Intuit call costs no quota** (only 2xx is metered), so the
 * cost of waiting is latency, while the cost of giving up early is a money
 * record that silently stops trying.
 */
export const MAX_ATTEMPTS = 8;

const STALE_IN_FLIGHT_MS = 10 * 60 * 1000;

/** Exponential, capped, with jitter. Jitter matters: without it every row
 *  queued during one outage retries in the same instant on recovery and
 *  re-triggers the 429 that caused the backoff. */
export function backoffUntil(attempts: number, now: Date = new Date()): string {
  const base = Math.min(30_000 * 2 ** attempts, 6 * 60 * 60 * 1000);
  return new Date(now.getTime() + base + Math.random() * 30_000).toISOString();
}

export interface EnqueueInput {
  companyId: string;
  realmId: string | null;
  entityType: QbEntityType;
  entityId: string;
  operation: QbOperation;
  dependsOnId?: string | null;
}

/**
 * Add work. Returns the row id, or the id of the LIVE row that already covers
 * this (entity, operation).
 *
 * ⚠️ THE DUPLICATE CASE IS NORMAL, NOT AN ERROR. `idx_qb_sync_queue_one_live_
 * per_entity_op` permits ONE live row per (entity_type, entity_id, operation).
 * Queueing the same update twice would push it twice, and **QuickBooks has no
 * PUT — a second POST creates a SECOND OBJECT.** So a unique violation here
 * means the guarantee did its job; we return the existing row rather than
 * throwing, and the caller carries on.
 */
export async function enqueue(
  admin: SupabaseClient,
  input: EnqueueInput
): Promise<string | null> {
  const { data, error } = await admin
    .from('qb_sync_queue')
    .insert({
      company_id: input.companyId,
      realm_id: input.realmId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      operation: input.operation,
      depends_on_id: input.dependsOnId ?? null,
      status: 'queued',
    })
    .select('id')
    .single();

  if (!error) return data!.id as string;

  // 23505 — the one-live-per-(entity,op) index. Expected; find and return it.
  if (error.code === '23505') {
    const { data: existing } = await admin
      .from('qb_sync_queue')
      .select('id')
      .eq('company_id', input.companyId)
      .eq('entity_type', input.entityType)
      .eq('entity_id', input.entityId)
      .eq('operation', input.operation)
      .in('status', ['queued', 'in_flight', 'failed_transient'])
      .eq('is_deleted', false)
      // Scoped, not merely limited: the four `.eq`s plus the status filter are
      // exactly the index's predicate, so at most one row can match. Ordered
      // anyway so a future widening of the predicate cannot make this a
      // heap-order pick (CLAUDE.md, S165).
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return (existing?.id as string) ?? null;
  }

  console.error(
    `[qb-queue] enqueue failed company=${input.companyId} ${input.entityType}:${input.operation}:`,
    error.message
  );
  return null;
}

/**
 * The claim query: what is due for THIS tenant, oldest first, dependencies
 * satisfied.
 *
 * ⚠️ `in_flight` IS RECLAIMED, NOT LOCKED. A worker that crashes mid-row leaves
 * the row `in_flight` forever otherwise. The migration says this explicitly:
 * "a crash leaves this stale, which is why `next_attempt_at` is the reclaim
 * clock and not a lock." A row is reclaimable once it has sat `in_flight`
 * longer than STALE_IN_FLIGHT_MS.
 *
 * ⚠️ A ROW WHOSE DEPENDENCY HAS NOT BEEN `pushed` IS SKIPPED, NOT FAILED. An
 * invoice cannot go before its customer; the customer's row is still in this
 * same drain, and the invoice becomes claimable on the next pass.
 *
 * ⚠️ BUT A DEPENDENCY THAT WILL NEVER BE `pushed` IS PROPAGATED, NOT SKIPPED
 * [RULED Josh, S104]. Before S104 `satisfied` admitted only `pushed`, and
 * everything else was filtered out — so a dependant of a `failed_terminal` row
 * sat at `status='queued'`, `attempts=0`, `last_error=NULL`,
 * `next_attempt_at=NULL` **forever**, byte-identical to a row that had simply
 * not had its turn yet. It never ran and never failed.
 *
 * That is the same reporting collapse `countWaiting()` exists to prevent
 * (S181: a parked queue and an empty queue printed identically, and telling
 * them apart cost a session that started from a false premise). The fix must
 * therefore make a dead row LOOK dead — see `failBlockedDependant()` below, and note
 * that `countWaiting()` does NOT count `failed_terminal`, so a terminated row
 * leaves the live-work count in the same pass.
 */
export async function claimDue(
  admin: SupabaseClient,
  companyId: string,
  limit: number
): Promise<QbQueueRow[]> {
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from('qb_sync_queue')
    .select(
      'id, company_id, realm_id, entity_type, entity_id, operation, depends_on_id, status, attempts, next_attempt_at, last_error, created_at, updated_at'
    )
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .in('status', ['queued', 'failed_transient', 'in_flight'])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(limit * 3);

  if (error) {
    console.error(`[qb-queue] claim query failed for company=${companyId}:`, error.message);
    return [];
  }

  const staleBefore = Date.now() - STALE_IN_FLIGHT_MS;
  const candidates = (data ?? []).filter((r) => {
    if (r.status !== 'in_flight') return true;
    const touched = r.updated_at ? new Date(r.updated_at as string).getTime() : 0;
    return touched < staleBefore;
  });

  if (candidates.length === 0) return [];

  // Resolve dependencies in ONE query rather than per row.
  const dependencyIds = Array.from(
    new Set(candidates.map((r) => r.depends_on_id).filter((v): v is string => Boolean(v)))
  );

  const satisfied = new Set<string>();
  /** dependency id -> why it can never be satisfied. Absent = still possible. */
  const dead = new Map<string, string>();

  if (dependencyIds.length > 0) {
    const { data: deps, error: depError } = await admin
      .from('qb_sync_queue')
      .select('id, status, entity_type, operation, last_error')
      .eq('company_id', companyId)
      .in('id', dependencyIds);

    // ⚠️ A FAILED DEPENDENCY QUERY MUST NOT LOOK LIKE "no dependency is dead".
    // Treating an unknown as satisfiable is the safe direction (the dependant
    // waits one more drain); treating it as DEAD would terminate live work on a
    // transient read failure. So: bail, do not guess.
    if (depError) {
      console.error(
        `[qb-queue] dependency resolution failed for company=${companyId}:`,
        depError.message
      );
      return [];
    }

    const seen = new Set<string>();
    for (const d of deps ?? []) {
      const id = d.id as string;
      seen.add(id);
      if (d.status === 'pushed') {
        satisfied.add(id);
      } else if (d.status === 'failed_terminal') {
        dead.set(
          id,
          `its ${d.entity_type}:${d.operation} step failed permanently` +
            (d.last_error ? ` — ${String(d.last_error).slice(0, 300)}` : '')
        );
      }
    }

    // ⚠️ A MISSING DEPENDENCY ROW — AND THE CORRECTION THAT MEASURING IT FORCED.
    //
    // I filed this as a second forever-wait door, on the reading that
    // `depends_on_id` was a bare uuid with no foreign key. **That was wrong, and
    // the test caught it before the claim reached the report.** The column is:
    //
    //     depends_on_id uuid REFERENCES qb_sync_queue(id) ON DELETE SET NULL
    //
    // so a dependency cannot dangle. Deleting it NULLs the child's
    // `depends_on_id`, and the child becomes unconditionally claimable — the
    // opposite of stranded. A bogus id cannot be inserted either. **This branch
    // is therefore unreachable while that FK stands.**
    //
    // ⚠️ IT IS KEPT ANYWAY, AND NOT AS DECORATION. It is the guard for the day
    // someone changes that FK. And the reachable behaviour is worth stating
    // where it can be found: `ON DELETE SET NULL` silently PROMOTES a blocked
    // dependant to runnable. That is survivable rather than dangerous — an
    // invoice whose customer step was deleted finds `qb_customer_id` null and
    // parks with "Waiting for this client to reach QuickBooks first" — but it is
    // a release, not a block, and nobody should be surprised by it twice.
    //
    // ⚠️ AND IT IS SAFE TO CALL "MISSING" DEAD ONLY BECAUSE NOTHING DELETES QUEUE
    // ROWS — verified at S104 across `lib/`, `app/`, every migration and all 13
    // crons. `markPushed()` sets `status='pushed'` and the row STAYS, so
    // "missing" can never mean "succeeded and was tidied away". **If a purge is
    // ever added, this branch becomes wrong and will terminate work that should
    // have run.**
    for (const id of dependencyIds) {
      if (!seen.has(id)) {
        dead.set(id, 'the step it was waiting for no longer exists in the queue');
      }
    }
  }

  // ⚠️ TERMINATED IN THIS PASS, NOT LEFT FOR THE NEXT ONE. The whole defect was
  // a row that stays claimable-looking forever; deferring the write would keep
  // it that way for one more drain each time the list is truncated by `limit`.
  const blocked = candidates.filter(
    (r) => r.depends_on_id && dead.has(r.depends_on_id as string)
  );
  for (const r of blocked) {
    await failBlockedDependant(admin, r.id as string, dead.get(r.depends_on_id as string)!);
  }

  return candidates
    .filter((r) => !r.depends_on_id || satisfied.has(r.depends_on_id as string))
    .slice(0, limit) as unknown as QbQueueRow[];
}

/**
 * Mark a dependant terminal because its dependency can never be satisfied.
 *
 * ⚠️ `failed_terminal`, NOT A PARK, AND THAT WAS THE RULING [Josh, S104]:
 * *"Option 2 keeps it in queued, which is the defect."* A park stays `queued`
 * and waits on a person; this row is not waiting on anybody, it is dead. It has
 * to leave the live-work bucket or `countWaiting()` keeps counting it as work
 * in progress, which is the S181 collapse rebuilt one level down.
 *
 * ⚠️ `attempts` IS LEFT ALONE ON PURPOSE. Nothing about this row was attempted
 * — incrementing it would claim a push happened that never did, and the
 * Accounting screen renders these strings to a person.
 *
 * ⚠️ `last_error` NAMES THE CAUSE AND CARRIES THE DEPENDENCY'S OWN MESSAGE.
 * "This never ran" is not actionable; "this never ran because its customer step
 * failed permanently — Intuit said X" is.
 */
async function failBlockedDependant(
  admin: SupabaseClient,
  rowId: string,
  because: string
): Promise<void> {
  const { error } = await admin
    .from('qb_sync_queue')
    .update({
      status: 'failed_terminal',
      last_error: `This step never ran: ${because}.`.slice(0, 1000),
      next_attempt_at: null,
    })
    .eq('id', rowId);

  if (error) {
    console.error(`[qb-queue] could not terminate blocked dependant ${rowId}:`, error.message);
  }
}

/**
 * How much LIVE work this tenant has that `claimDue` did not hand back.
 *
 * ⚠️ THIS EXISTS BECAUSE THE DRAIN'S OUTPUT LIED BY OMISSION [S181]. A drain
 * over a parked row returned
 * `{"companiesConsidered":1,"companiesDrained":0, …all zero}` — byte-identical
 * to a drain over an EMPTY queue. Those two are opposite situations: one is
 * "nothing to do", the other is "money work exists and is waiting on a person",
 * and telling them apart cost a debugging session that started from the false
 * premise that the claim query was broken. It was not.
 *
 * Called ONLY on the empty-claim path, so the common case pays nothing. `head`
 * + `count: 'exact'` returns no rows — this is a counter, not a second read.
 */
export async function countWaiting(
  admin: SupabaseClient,
  companyId: string
): Promise<number> {
  const { count, error } = await admin
    .from('qb_sync_queue')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .in('status', ['queued', 'failed_transient', 'in_flight']);

  // Telemetry must never break a drain. An unknown count reads as zero.
  if (error) {
    console.error(`[qb-queue] waiting count failed for company=${companyId}:`, error.message);
    return 0;
  }
  return count ?? 0;
}

export async function markInFlight(admin: SupabaseClient, rowId: string): Promise<void> {
  // ⚠️ `updated_at` IS NOT SET HERE, DELIBERATELY [S182]. The BEFORE UPDATE
  // trigger `qb_sync_queue_updated_at` sets it, and CLAUDE.md's service-layer
  // contract says service code must not write it as well. It matters more than
  // convention here: `updated_at` is the STALE-RECLAIM CLOCK that `claimDue`
  // reads, so two writers of one clock is exactly the thing to avoid.
  await admin.from('qb_sync_queue').update({ status: 'in_flight' }).eq('id', rowId);
}

export async function markPushed(admin: SupabaseClient, rowId: string): Promise<void> {
  await admin
    .from('qb_sync_queue')
    .update({ status: 'pushed', last_error: null, next_attempt_at: null })
    .eq('id', rowId);
}

/**
 * Record a failure and decide whether it retries.
 *
 * ⚠️ `last_error` IS A USER-FACING STRING — it is rendered on the Accounting
 * screen. It carries Intuit's message and nothing of ours: no token, no URL
 * with a query string, no raw response body (an Intuit error page can echo
 * request headers). Truncated so one pathological fault cannot bloat the row.
 */
export async function markFailed(
  admin: SupabaseClient,
  row: QbQueueRow,
  message: string,
  retryable: boolean
): Promise<void> {
  const attempts = row.attempts + 1;
  const exhausted = attempts >= MAX_ATTEMPTS;
  const terminal = !retryable || exhausted;

  await admin
    .from('qb_sync_queue')
    .update({
      status: terminal ? 'failed_terminal' : 'failed_transient',
      attempts,
      last_error: exhausted
        ? `Gave up after ${attempts} attempts. Last error: ${message}`.slice(0, 1000)
        : message.slice(0, 1000),
      next_attempt_at: terminal ? null : backoffUntil(attempts),
    })
    .eq('id', row.id);
}

/**
 * Park a row that cannot proceed yet for a reason that is not a failure — the
 * two ruled cases being "no income Item chosen" (S103 Q10) and "a customer name
 * conflict is awaiting the Owner's answer" (§5.2).
 *
 * ⚠️ IT STAYS `queued`. Not failed, not terminal. Nothing is wrong with the
 * record; a human simply has to answer something first. `last_error` carries
 * the prompt so the Accounting screen can say what is needed. Same reasoning as
 * `invalid_grant` — see the queue migration's header.
 */
export async function parkAwaitingHuman(
  admin: SupabaseClient,
  rowId: string,
  reason: string
): Promise<void> {
  await admin
    .from('qb_sync_queue')
    .update({
      status: 'queued',
      last_error: reason.slice(0, 1000),
      // Re-check in five minutes rather than every drain; the answer comes from
      // a person, not from QuickBooks recovering.
      next_attempt_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    .eq('id', rowId);
}
