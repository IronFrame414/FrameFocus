import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { claimDue, countWaiting } from '@/lib/quickbooks/queue';

// ============================================================================
// S181 — a PARKED sync row must wake when the Owner fixes what it parked on.
//
// Migration: 20261390000000_qb_wake_parked_on_settings.sql (M-F)
// Defect:    an approved expense parked on an unresolvable GL account name.
//            The name was corrected on Settings -> Accounting. Nothing woke the
//            row, and the drain reported
//            `{"companiesConsidered":1,"companiesDrained":0, …all zero}` —
//            byte-identical to a drain over an EMPTY queue.
//
// ⚠️ NOTHING HERE CALLS INTUIT. The claim query, the park clock and the un-park
// trigger are all fully testable without a network, and a live call would meter
// against the Workspace-wide CorePlus quota (7g1 §7G.3a).
//
// ⚠️ THE SETTINGS WRITE RUNS AS A REAL OWNER ON THE ANON KEY, AND THAT IS THE
// WHOLE POINT. `qb_sync_queue` has no UPDATE policy for any client role, so an
// invoker-rights trigger would update zero rows and report success. Running
// this as the service role would bypass RLS and prove nothing about the
// SECURITY DEFINER that makes the fix work. If this file is ever "simplified"
// to use `admin` for the companies UPDATE, it stops testing the defect.
// ============================================================================

const OWNER = 'josh+test50@worthprop.com';
const COMPANY = '03bb903f-1084-4ab4-afb8-03192cb58d30';

/** ⚠️ EACH SEEDED ROW GETS ITS OWN `entity_id`, and it has to.
 *  `idx_qb_sync_queue_one_live_per_entity_op` permits ONE live row per
 *  (entity_type, entity_id, operation) — the guarantee that stops a second POST
 *  becoming a second object in QuickBooks. Rows seeded here stay live for the
 *  file, so sharing one entity_id makes the second seed collide. `entity_id`
 *  carries no foreign key, so a fresh uuid is a legitimate row. Nothing here
 *  drains, so no handler ever dereferences it. */

let ownerC: SupabaseClient;
let originalSubAccount: string | null = null;
let originalNotifyStart: string | null = null;
const madeQueue: string[] = [];

/** Park a row exactly as `parkAwaitingHuman()` does: still `queued`, with the
 *  five-minute re-check clock set. */
async function insertParkedRow(operation: string): Promise<string> {
  const entityId = randomUUID();
  const { data, error } = await admin
    .from('qb_sync_queue')
    .insert({
      company_id: COMPANY,
      realm_id: '9341457813274121',
      entity_type: 'bill',
      entity_id: entityId,
      operation,
      status: 'queued',
      last_error: 'S181 harness — standing in for a GL-account park.',
      next_attempt_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(`could not seed a parked row: ${error.message}`);
  madeQueue.push(data!.id as string);
  return data!.id as string;
}

async function nextAttemptAt(rowId: string): Promise<string | null> {
  const { data } = await admin
    .from('qb_sync_queue')
    .select('next_attempt_at')
    .eq('id', rowId)
    .single();
  return (data?.next_attempt_at as string | null) ?? null;
}

describe('S181 — parked rows wake when the Owner answers', () => {
  beforeAll(async () => {
    assertRebuildTest();
    ownerC = await sessionFor(OWNER);
    const { data } = await admin
      .from('companies')
      .select('gl_account_subcontractor, notify_hours_start')
      .eq('id', COMPANY)
      .single();
    originalSubAccount = (data?.gl_account_subcontractor as string | null) ?? null;
    originalNotifyStart = (data?.notify_hours_start as string | null) ?? null;
  });

  afterAll(async () => {
    if (madeQueue.length > 0) {
      await admin.from('qb_sync_queue').delete().in('id', madeQueue);
    }
    // Restore the real mapping. This tenant is the shared 7G fixture; leaving a
    // harness string in `gl_account_subcontractor` would park every future
    // expense push on it.
    await admin
      .from('companies')
      .update({
        gl_account_subcontractor: originalSubAccount,
        notify_hours_start: originalNotifyStart,
      })
      .eq('id', COMPANY);
  });

  // -------------------------------------------------------------------------
  // 1. The defect itself.
  // -------------------------------------------------------------------------
  it('1 — a GL mapping change un-parks the row, written as a real Owner', async () => {
    const rowId = await insertParkedRow('update');
    expect(await nextAttemptAt(rowId), 'seeded row should be parked').not.toBeNull();

    // A parked row is NOT claimable. This is correct behaviour, and it is also
    // exactly what made the defect look like a broken claim query.
    const beforeClaim = await claimDue(admin, COMPANY, 25);
    expect(beforeClaim.map((r) => r.id)).not.toContain(rowId);

    // The Owner corrects the mapping — the anon key, the same write
    // `updateGLMappingSettings()` performs from the settings form.
    const { error } = await ownerC
      .from('companies')
      .update({ gl_account_subcontractor: 'S181 corrected account name' })
      .eq('id', COMPANY);
    expect(error, 'the Owner must be able to save GL settings').toBeNull();

    // ⚠️ THE ASSERTION THE FIX EXISTS FOR.
    expect(
      await nextAttemptAt(rowId),
      'the park clock must be cleared by the trigger, not waited out'
    ).toBeNull();

    const afterClaim = await claimDue(admin, COMPANY, 25);
    expect(afterClaim.map((r) => r.id)).toContain(rowId);
  });

  // -------------------------------------------------------------------------
  // 2. The blast radius, in both directions.
  // -------------------------------------------------------------------------
  it('2 — a real backoff (failed_transient) is NOT woken', async () => {
    const rowId = await insertParkedRow('void');
    const backoff = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    await admin
      .from('qb_sync_queue')
      .update({ status: 'failed_transient', attempts: 3, next_attempt_at: backoff })
      .eq('id', rowId);

    await ownerC
      .from('companies')
      .update({ gl_account_subcontractor: 'S181 second corrected name' })
      .eq('id', COMPANY);

    // Clearing this would discard the exponential backoff AND its jitter, and
    // re-trigger the 429 the backoff exists to escape.
    expect(
      await nextAttemptAt(rowId),
      'failed_transient carries a real backoff clock and must survive an un-park'
    ).not.toBeNull();
  });

  it('3 — an unrelated companies UPDATE does not touch the queue', async () => {
    const rowId = await insertParkedRow('create');
    const parked = await nextAttemptAt(rowId);
    expect(parked).not.toBeNull();

    // The trigger's WHEN clause is the cost control: `companies` is written on
    // plenty of unrelated paths and none of them should scan the queue.
    // `notify_hours_start` is a `time`, not an integer — an int here fails with
    // 22007 and the test would then pass for the wrong reason (no UPDATE ran at
    // all), which is why the write itself is asserted before the queue is read.
    // ⚠️ THE WRITTEN VALUE MUST DIFFER FROM THE STORED ONE. Every seeded tenant
    // already carries 07:00, and an UPDATE that writes back the same value
    // would let this pass without the column ever changing — a green tick over
    // an untested run. Restored in afterAll.
    const differentHour = originalNotifyStart === '06:00:00' ? '05:00:00' : '06:00:00';
    const { error } = await ownerC
      .from('companies')
      .update({ notify_hours_start: differentHour })
      .eq('id', COMPANY);
    expect(error).toBeNull();

    const { data: check } = await admin
      .from('companies')
      .select('notify_hours_start')
      .eq('id', COMPANY)
      .single();
    expect(check?.notify_hours_start, 'the unrelated write must really have landed').toBe(
      differentHour
    );

    expect(await nextAttemptAt(rowId), 'WHEN clause should have skipped this update').toBe(parked);
  });

  // -------------------------------------------------------------------------
  // 3. The observability half — why the drain's silence was so expensive.
  // -------------------------------------------------------------------------
  it('4 — countWaiting distinguishes "nothing to do" from "parked money work"', async () => {
    const rowId = await insertParkedRow('update');
    const waiting = await countWaiting(admin, COMPANY);
    expect(waiting, 'a parked row must be counted as waiting, not as an empty queue').toBeGreaterThan(0);

    await admin.from('qb_sync_queue').update({ status: 'pushed' }).eq('id', rowId);
    // `pushed` is terminal: it is done, not waiting.
    expect(await countWaiting(admin, COMPANY)).toBe(waiting - 1);
  });
});
