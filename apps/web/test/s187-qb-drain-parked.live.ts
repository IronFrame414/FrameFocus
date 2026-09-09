import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, assertRebuildTest } from './live-session';
import { runQbSync } from '@/lib/quickbooks/worker';

// ============================================================================
// S187 F13 — THE DRAIN REPORTS A NON-ZERO `parked` WHEN A ROW PARKS.
//
// ⚠️ READ THIS BEFORE READING THE TEST: THE FINDING'S PREMISE WAS WRONG, AND
// SAYING SO IS PART OF THE FIX.
//
// The conformance audit recorded F13 as "the drain never reports `parked`".
// It does. `DrainOutcome.parked` has existed since the worker shipped
// (`worker.ts:53`), `worker.ts:217` increments it on every park, and
// `/api/cron/qb-sync` returns the whole outcome object verbatim. Nothing was
// missing and nothing was built to close it.
//
// What WAS missing is this file. The counter was never exercised end to end,
// so "it is wired" rested on reading the code — which is exactly the standard
// the S181 investigation failed against, where a filter that "appeared to
// match" was believed for an hour and was never the problem. A counter nobody
// has watched increment is a claim, not a fact.
//
// ----------------------------------------------------------------------------
// ⚠️ WHY THIS PARK AND NOT ANOTHER: IT REACHES NO NETWORK
// ----------------------------------------------------------------------------
// `handleRefundCreate` checks `qb_object_type` immediately after status and
// BEFORE it looks up the contact, so an approved refund with no QuickBooks type
// parks on a purely local read (`entities.ts:1126-1131`). Nothing is sent to
// Intuit, so this proof costs no CorePlus quota and writes nothing to the
// sandbox company's books.
//
// ⚠️ AND THE ROW IS ENQUEUED BY THE REAL TRIGGER, NOT BY HAND.
// `qb_enqueue_refund` fires on `status` reaching `approved`, so the queue row
// here is produced by the same path a real approval produces — claim query,
// dependency resolution and all. Seeding `qb_sync_queue` directly would prove
// the counter and skip everything that has to work for the counter to matter.
//
// ⚠️ THIS FILE CALLS `runQbSync` FOR THE WHOLE INSTALLATION, deliberately —
// there is no per-company entry point, and inventing one for a test would be
// testing something the cron does not run. It was verified before writing that
// rebuild-test's queue held ONLY `pushed` rows and no unprocessed webhook
// events, so the drain has nothing else to act on. If this file ever starts
// pushing unexpected objects into the sandbox, that precondition has changed:
// check the queue before blaming the test.
// ============================================================================

const COMPANY = '03bb903f-1084-4ab4-afb8-03192cb58d30';
const CONTACT = '8c7c9a6d-287d-4b0e-9a0b-2769adfed704';

let refundId: string | null = null;
/** Rows retired for this file's duration and restored in afterAll. See beforeAll. */
let quietedRowIds: string[] = [];

async function queueRowFor(entityId: string) {
  const { data } = await admin
    .from('qb_sync_queue')
    .select('id, status, attempts, last_error, next_attempt_at')
    .eq('entity_type', 'refund')
    .eq('entity_id', entityId)
    .eq('operation', 'create')
    .maybeSingle();
  return data;
}

describe('S187 F13 — a park is counted, and the drain says so', () => {
  beforeAll(async () => {
    assertRebuildTest();

    // ⚠️ INSERTED PENDING, THEN APPROVED. The enqueue trigger fires on the
    // TRANSITION into `approved`, so an insert that is already approved and an
    // update into approved both work — but doing it in two steps is what a
    // person actually does, and it proves the UPDATE arm of the trigger.
    const { data, error } = await admin
      .from('client_refunds')
      .insert({
        company_id: COMPANY,
        contact_id: CONTACT,
        amount: 12.34,
        refund_date: new Date().toISOString().slice(0, 10),
        source: 'other',
        status: 'pending_approval',
        reason: 'S187 F13 harness — parks on a missing QuickBooks type.',
        // qb_object_type deliberately left NULL: this is the park.
      })
      .select('id')
      .single();
    if (error) throw new Error(`could not seed the refund: ${error.message}`);
    refundId = data!.id as string;

    const { error: approveError } = await admin
      .from('client_refunds')
      .update({ status: 'approved' })
      .eq('id', refundId);
    if (approveError) throw new Error(`could not approve the refund: ${approveError.message}`);

    // ⚠️ BACKDATE THE ROW THE TRIGGER JUST QUEUED, SO THE DRAIN REACHES IT.
    //
    // `claimDue()` orders by `created_at` ASC and takes `limit` rows, so a
    // tenant with more eligible rows than the limit starves every NEW row —
    // and the drain then never examines this one. Measured at S107: 102
    // eligible against a limit of 25, and this file's three failures were all
    // downstream of a row the drain never looked at (`last_error` came back
    // null, which vitest reported as "toMatch() got object").
    //
    // The row is created by the enqueue trigger, so it cannot be backdated at
    // insert the way s104's and s181's fixtures are; it is backdated here
    // instead, immediately after the trigger has run and before any drain.
    const { error: backdateError } = await admin
      .from('qb_sync_queue')
      .update({ created_at: '2020-01-01T00:00:00.000Z' })
      .eq('entity_id', refundId);
    if (backdateError)
      throw new Error(`could not backdate the queue row: ${backdateError.message}`);

    // ⚠️ AND THE TENANT'S QUEUE IS QUIETED FOR THIS FILE'S DURATION [S107].
    //
    // Test 4 asserts `outcome.waiting`, and `countWaiting()` is called ONLY on
    // the EMPTY-CLAIM path (`queue.ts:343` — "so the common case pays
    // nothing"). If ANY other row in this tenant is claimable, the claim is not
    // empty, `waiting` is never computed, and the assertion reads 0. Backdating
    // cannot help: the problem is that other rows EXIST, not where this one
    // sorts.
    //
    // Measured twice: against a restored 102-row backlog, and again in the S107
    // full-suite run, where earlier files enqueue rows before this one runs.
    // It passed in isolation both times — the worst shape available, because it
    // reads as a broken drain counter.
    //
    // So the file makes its own precondition instead of inheriting one. Every
    // OTHER claimable row is soft-deleted (`is_deleted`, which is exactly what
    // `claimDue` and `countWaiting` filter on) and RESTORED in afterAll. This
    // is reversible, it deletes nothing, and it cannot race: the live runner is
    // `fileParallelism: false, sequence.concurrent: false`.
    //
    // ⚠️ NOT a bigger claim limit, and not this file's own row — retiring that
    // would make the test vacuous.
    const { data: others } = await admin
      .from('qb_sync_queue')
      .select('id, entity_id')
      .eq('company_id', COMPANY)
      .eq('is_deleted', false)
      .in('status', ['queued', 'failed_transient', 'in_flight']);
    quietedRowIds = ((others ?? []) as { id: string; entity_id: string }[])
      .filter((r) => r.entity_id !== refundId)
      .map((r) => r.id);
    if (quietedRowIds.length) {
      const { error: quietError } = await admin
        .from('qb_sync_queue')
        .update({ is_deleted: true })
        .in('id', quietedRowIds);
      if (quietError) throw new Error(`could not quiet the queue: ${quietError.message}`);
    }
  });

  afterAll(async () => {
    // Restore FIRST, and unconditionally — a row this file retired must come
    // back even if the fixture never got created or a test threw.
    if (quietedRowIds.length) {
      const { error } = await admin
        .from('qb_sync_queue')
        .update({ is_deleted: false })
        .in('id', quietedRowIds);
      if (error) {
        throw new Error(
          `s187 left ${quietedRowIds.length} queue row(s) retired — restore failed: ${error.message}`
        );
      }
      quietedRowIds = [];
    }
    if (!refundId) return;
    await admin.from('qb_sync_queue').delete().eq('entity_id', refundId);
    await admin.from('client_refunds').delete().eq('id', refundId);
  });

  it('1 — the real trigger queued the refund', async () => {
    const row = await queueRowFor(refundId!);
    expect(row, 'qb_enqueue_refund did not fire on approval').not.toBeNull();
    expect(row!.status).toBe('queued');
  });

  it('2 — ⚠️ THE DRAIN RETURNS parked >= 1, AND THE ROW IS THE ONE WE SEEDED', async () => {
    const outcome = await runQbSync(admin);

    // If the connection has lapsed the drain skips instead of parking, and the
    // failure below would look like a broken counter. Say which it is.
    expect(
      outcome.skippedNotConnected,
      'the company is not connected on rebuild-test, so nothing could be drained — ' +
        'reconnect QuickBooks and re-run; this is an environment failure, not a code one'
    ).toBe(0);
    expect(outcome.companiesDrained).toBeGreaterThanOrEqual(1);

    expect(
      outcome.parked,
      `the drain handled a parking row and reported parked=${outcome.parked}. ` +
        `Full outcome: ${JSON.stringify(outcome)}`
    ).toBeGreaterThanOrEqual(1);

    // Nothing was sent to QuickBooks by this park.
    expect(outcome.pushed).toBe(0);
  });

  it('3 — the park left the row QUEUED with the five-minute clock, not failed', async () => {
    // ⚠️ THE FOURTH OUTCOME. A park is not one of the five queue states: the row
    // stays `queued` and `next_attempt_at` moves forward. If a future change
    // makes a park mark the row `failed_transient`, the counter would still
    // increment and this assertion is what would notice.
    const row = await queueRowFor(refundId!);
    expect(row!.status).toBe('queued');
    expect(row!.last_error).toMatch(/QuickBooks type/i);
    expect(new Date(row!.next_attempt_at as string).getTime()).toBeGreaterThan(Date.now());
  });

  it('4 — a second drain parks it again rather than counting it twice in one pass', async () => {
    // The row is inside its five-minute window, so it is not claimable: the
    // drain must report it as WAITING, not as parked a second time. This is the
    // distinction `waiting` was added for at S181.
    const outcome = await runQbSync(admin);
    expect(outcome.parked).toBe(0);
    // ⚠️ THIS LINE NEEDS A QUIET QUEUE, AND beforeAll MAKES ONE. `waiting` is
    // computed only on the empty-claim path, so any other claimable row in the
    // tenant would leave it 0 — see the quieting block in beforeAll for why
    // that is arranged there rather than assumed here. If this goes red, check
    // that the restore in afterAll is still running before suspecting the drain.
    expect(outcome.waiting).toBeGreaterThanOrEqual(1);
  });
});
