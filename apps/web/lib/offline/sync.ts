import type { OfflineQueue, QueueEntry } from './queue';

// M6M §5.3 / §5.5 / §5.6 — THE REPLAY ENGINE.
//
// Pure over injected executors, so the unit suite drives it with fakes and the
// [live] harness drives it with REAL supabase clients against rebuild-test —
// one engine, no test double of the logic itself.
//
// ---------------------------------------------------------------------------
// §5.6 — CONFLICT IS DECIDED ON base_updated_at, WITH `IS DISTINCT FROM`.
// ---------------------------------------------------------------------------
// The corrected rule, and the spec records why the first formulation was
// unsound: comparing the server's updated_at against `captured_at` answers
// "did the phone write after the desktop?", which is a question nobody asked —
// walk the 08:00/08:30/09:00 sequence and the desktop edit is destroyed
// silently, precisely in the ordinary case this feature exists for. The client
// is not asking "is the server newer?"; it is asking "IS THE SERVER STILL WHAT
// I SAW?". Hence base_updated_at (the value the client READ), and hence
// IS DISTINCT FROM rather than `>` — a backwards-moving updated_at (a restore,
// clock skew between writers, a manual correction) also invalidates the basis,
// and those are exactly the cases where a blind overwrite does the most damage.

export interface Executors {
  /**
   * Idempotent UPSERT ON THE PRIMARY KEY (§5.3) — replaying the same entry N
   * times produces exactly one row for its target_id (A-16). Returns the
   * row's updated_at so the engine can re-base dependent updates.
   */
  insert(entry: QueueEntry): Promise<{ updated_at: string | null }>;
  /** Plain update of the target row. Runs only after the conflict check. */
  update(entry: QueueEntry): Promise<void>;
  /** The target row's CURRENT updated_at, or null when the row is absent. */
  readUpdatedAt(entry: QueueEntry): Promise<string | null>;
  /**
   * Durably record the losing copy in sync_conflicts (§5.7). MUST NOT chain a
   * returning-representation read onto the insert: the author can INSERT but
   * cannot SELECT the row back (A-19j) — and Postgres refuses INSERT …
   * RETURNING outright when the new row fails the SELECT policy, ROLLING THE
   * WRITE BACK (observed on rebuild-test, S105). A chained `.select()` does
   * not hide a success; it destroys the write.
   */
  recordConflict(entry: QueueEntry, serverUpdatedAt: string | null): Promise<void>;
  /**
   * §5.5.3 — a queued photo uploads THROUGH uploadFile, never straight to
   * storage: the HEIC→JPEG conversion lives inside uploadFile, and a raw
   * bucket PUT would silently reopen #94 for exactly the users the PWA is
   * built for (A-20d).
   */
  uploadPhoto(entry: QueueEntry): Promise<void>;
}

export interface SyncEvent {
  entry: QueueEntry;
  outcome: 'succeeded' | 'failed' | 'conflicted' | 'skipped_dependency';
  error?: string;
}

/**
 * One replay pass over every eligible entry, in `seq` order. Entries whose
 * `depends_on` parent is still in the queue are not attempted at all
 * (A-16d) — the queue's eligible() encodes that; entries whose parent fails
 * DURING this pass are likewise skipped, because a success would have removed
 * the parent.
 */
export async function syncOnce(
  queue: OfflineQueue,
  exec: Executors,
  online: () => boolean
): Promise<SyncEvent[]> {
  const events: SyncEvent[] = [];
  if (!online()) return events;

  // Re-read eligibility as we go: each success removes its entry, which can
  // unlock a dependent later in the same pass.
  let progressed = true;
  const attempted = new Set<string>();

  while (progressed) {
    progressed = false;
    const eligible = (await queue.eligible()).filter((e) => !attempted.has(e.entry_id));

    for (const entry of eligible) {
      attempted.add(entry.entry_id);
      const event = await replayOne(queue, exec, entry);
      events.push(event);
      if (event.outcome === 'succeeded') progressed = true;
    }
  }

  return events;
}

async function replayOne(
  queue: OfflineQueue,
  exec: Executors,
  entry: QueueEntry
): Promise<SyncEvent> {
  try {
    if (entry.entity === 'photo') {
      await exec.uploadPhoto(entry);
      await queue.succeed(entry.entry_id);
      return { entry, outcome: 'succeeded' };
    }

    if (entry.op === 'insert') {
      // A-19f — AN INSERT IS NEVER A CONFLICT. base_updated_at is null (there
      // was no row to have loaded), and it takes the idempotent-upsert path
      // however long it has been queued. No conflict check runs here at all.
      const { updated_at } = await exec.insert(entry);
      if (updated_at) {
        // The client has now "seen" this row: its own insert produced it.
        // Dependent updates (the offline shift's clock-out) re-base on it so
        // §5.6's comparison asks a question that has an answer.
        await queue.rebase(entry.target_id, updated_at);
      }
      await queue.succeed(entry.entry_id);
      return { entry, outcome: 'succeeded' };
    }

    // op === 'update' — the conflict check, BEFORE any write.
    const current = await exec.readUpdatedAt(entry);

    // IS DISTINCT FROM, in JS: null-safe inequality. (SQL's IS DISTINCT FROM
    // treats two NULLs as not distinct; `!==` over `string | null` matches.)
    const distinct = current !== entry.base_updated_at;

    if (distinct) {
      // CONFLICT — the server version stands (D-17). Order is load-bearing
      // (A-19h): the sync_conflicts row is DURABLY WRITTEN FIRST; only then
      // does the entry leave the queue. If recordConflict throws, the catch
      // below leaves the entry queued and retryable — a conflict that could
      // not be recorded has not been handled.
      await exec.recordConflict(entry, current);
      await queue.markConflicted(
        entry.entry_id,
        'Someone edited this record after you loaded it. Your copy was kept and sent for review.'
      );
      return { entry, outcome: 'conflicted' };
    }

    await exec.update(entry);
    await queue.succeed(entry.entry_id);
    return { entry, outcome: 'succeeded' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await queue.fail(entry.entry_id, message);
    return { entry, outcome: 'failed', error: message };
  }
}
