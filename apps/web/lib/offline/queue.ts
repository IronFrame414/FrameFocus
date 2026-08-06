// M6M §5.2 — THE OFFLINE QUEUE, as a pure module.
//
// No IndexedDB import, no Supabase import, no navigator: storage arrives as an
// injected adapter and "online" as an injected predicate (§10a's [unit]
// harness is built on exactly that seam). The browser wiring lives in
// idb-storage.ts and sync.ts; this file is the CONTRACT.
//
// ---------------------------------------------------------------------------
// THE ENTRY SHAPE — §5.2, respecced [S98]. entry_id and target_id are SEPARATE.
// ---------------------------------------------------------------------------
// The old flat shape defined `id` AS the target row's primary key, which holds
// only while one entry equals one row. §5.5.1's shift is THREE entries against
// TWO rows — insert session, insert segment(s), update the same session with
// clock_out — so the session's insert and its clock-out update would have
// collided on one id and the clock-out would have silently replaced the
// insert. A-16c asserts the three-entry shape; A-16 is stated on target_id.

export type QueueOp = 'insert' | 'update';
export type QueueEntity = 'time_clock_session' | 'time_segment' | 'daily_log' | 'photo';
export type QueueState = 'queued' | 'conflicted';

export interface QueueEntry {
  /** The QUEUE ENTRY's own key. Not the row's. */
  entry_id: string;
  /** The target ROW's primary key — client-generated at capture (D-7). */
  target_id: string;
  op: QueueOp;
  /** A segment is its OWN entity, never folded into a clock event (A-16e). */
  entity: QueueEntity;
  /** Exactly what the online path would have sent. */
  payload: Record<string, unknown>;
  /** When the user ACTED — the business timestamp (§5.2.1), NOT the conflict basis. */
  captured_at: string;
  /**
   * The target row's `updated_at` AS LOADED by the client — §5.6's conflict
   * basis. Null on insert: there was no row to have loaded.
   */
  base_updated_at: string | null;
  /** entry_id that must succeed first (§5.2.4). */
  depends_on: string | null;
  /** Monotonic capture order; the replay order. */
  seq: number;
  state: QueueState;
  attempts: number;
  last_error: string | null;
}

/** The injected storage seam. IndexedDB in the app; a Map in the unit suite. */
export interface QueueStorage {
  all(): Promise<QueueEntry[]>;
  put(entry: QueueEntry): Promise<void>;
  remove(entryId: string): Promise<void>;
}

export interface EnqueueInput {
  entry_id: string;
  target_id: string;
  op: QueueOp;
  entity: QueueEntity;
  payload: Record<string, unknown>;
  captured_at: string;
  base_updated_at?: string | null;
  depends_on?: string | null;
}

export class OfflineQueue {
  constructor(private storage: QueueStorage) {}

  private async nextSeq(): Promise<number> {
    const entries = await this.storage.all();
    return entries.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
  }

  /**
   * Enqueue a mutation, applying §5.2.3's COALESCING rule:
   *
   * A second edit to a row that already has a queued entry MERGES into that
   * entry — the payload is replaced, `captured_at` advances, and
   * `base_updated_at` STAYS at the originally loaded value (A-19b4).
   * Re-basing on the phone's own unsynced write would tell the detector the
   * client had seen a server state it never saw — the same class of error as
   * comparing against captured_at.
   *
   * An update to a row whose INSERT is still queued folds into the insert
   * (the row does not exist server-side; the insert simply carries the newer
   * fields, and `op` stays 'insert' with a null base) — WITH ONE EXCEPTION:
   *
   * §5.5.1 — a `time_clock_session` clock-out is NEVER folded into the
   * session's insert. `owns_open_session()` requires `clock_out IS NULL` for
   * every segment insert, so an insert that already carried clock_out would
   * make RLS reject every segment and the shift would sync with no
   * attribution. The clock-out stays its own `op:'update'` entry, gated by
   * `depends_on`.
   */
  async enqueue(input: EnqueueInput): Promise<QueueEntry> {
    const entries = await this.storage.all();

    if (input.op === 'update') {
      const foldForbidden =
        input.entity === 'time_clock_session' && 'clock_out' in input.payload;

      const existing = entries
        .filter((e) => e.target_id === input.target_id && e.state === 'queued')
        .sort((a, b) => a.seq - b.seq);

      const insertEntry = existing.find((e) => e.op === 'insert');
      if (insertEntry && !foldForbidden) {
        const merged: QueueEntry = {
          ...insertEntry,
          payload: { ...insertEntry.payload, ...input.payload },
          captured_at: input.captured_at,
          // op stays 'insert'; base stays null — a first write is never a
          // conflict however many times it was touched offline (A-19f).
        };
        await this.storage.put(merged);
        return merged;
      }

      const updateEntry = existing.find((e) => e.op === 'update');
      if (updateEntry) {
        const merged: QueueEntry = {
          ...updateEntry,
          payload: { ...updateEntry.payload, ...input.payload },
          captured_at: input.captured_at,
          // A-19b4 — base_updated_at DOES NOT ADVANCE.
        };
        await this.storage.put(merged);
        return merged;
      }
    }

    const entry: QueueEntry = {
      entry_id: input.entry_id,
      target_id: input.target_id,
      op: input.op,
      entity: input.entity,
      payload: input.payload,
      captured_at: input.captured_at,
      base_updated_at: input.op === 'insert' ? null : (input.base_updated_at ?? null),
      depends_on: input.depends_on ?? null,
      seq: await this.nextSeq(),
      state: 'queued',
      attempts: 0,
      last_error: null,
    };
    await this.storage.put(entry);
    return entry;
  }

  async all(): Promise<QueueEntry[]> {
    const entries = await this.storage.all();
    return entries.sort((a, b) => a.seq - b.seq);
  }

  /**
   * §5.2.7 / A-18 — the queued-count pill counts `state: 'queued'` ONLY.
   * A conflicted entry has left the queue and will never upload; counting it
   * would make the pill lie about what a reconnect will do.
   */
  async queuedCount(): Promise<number> {
    const entries = await this.storage.all();
    return entries.filter((e) => e.state === 'queued').length;
  }

  /**
   * The entries eligible for a replay attempt, in `seq` order, gated by
   * `depends_on` (§5.2.4): an entry whose parent has not SUCCEEDED — still
   * present in the queue, in any state — is not attempted. Ordering alone is
   * not enough (A-16d): a failed parent must gate the child rather than
   * letting the child fail on its own and burn a retry.
   */
  async eligible(): Promise<QueueEntry[]> {
    const entries = await this.all();
    const present = new Set(entries.map((e) => e.entry_id));
    return entries.filter(
      (e) => e.state === 'queued' && (e.depends_on === null || !present.has(e.depends_on))
    );
  }

  /** Success: the entry leaves the queue. */
  async succeed(entryId: string): Promise<void> {
    await this.storage.remove(entryId);
  }

  /**
   * A failed attempt: stays queued, attempts advance, the error is surfaced
   * (§5.2.6 — never silently discarded).
   */
  async fail(entryId: string, error: string): Promise<void> {
    const entries = await this.storage.all();
    const entry = entries.find((e) => e.entry_id === entryId);
    if (!entry) return;
    await this.storage.put({ ...entry, attempts: entry.attempts + 1, last_error: error });
  }

  /**
   * §5.6 — the entry becomes `conflicted`: it LEAVES the sync queue (no
   * backoff, no retries, out of the pill count) but its payload and
   * captured_at SURVIVE (A-19c) — the whole point of D-17 is that offline work
   * is never destroyed to protect a server row.
   *
   * The caller (sync.ts) only invokes this AFTER the sync_conflicts row is
   * durably written (A-19h) — a conflict that could not be recorded has not
   * been handled, and the entry must stay queued and retryable.
   */
  async markConflicted(entryId: string, error: string): Promise<void> {
    const entries = await this.storage.all();
    const entry = entries.find((e) => e.entry_id === entryId);
    if (!entry) return;
    await this.storage.put({ ...entry, state: 'conflicted', last_error: error });
  }

  /**
   * Re-base a queued update whose base is null onto the server state its own
   * parent insert just produced. §5.6's question is "is the server still what
   * I saw?" — after the client's OWN insert replays, what it "saw" is what
   * that insert returned. Without this, the clock-out update of a fully
   * offline shift would compare a null base against the freshly-inserted
   * row's updated_at and manufacture a conflict out of the client's own write.
   */
  async rebase(targetId: string, serverUpdatedAt: string): Promise<void> {
    const entries = await this.storage.all();
    for (const e of entries) {
      if (
        e.target_id === targetId &&
        e.state === 'queued' &&
        e.op === 'update' &&
        e.base_updated_at === null
      ) {
        await this.storage.put({ ...e, base_updated_at: serverUpdatedAt });
      }
    }
  }
}

/** The unit harness's storage — and nothing else's. */
export class MemoryStorage implements QueueStorage {
  private map = new Map<string, QueueEntry>();
  async all(): Promise<QueueEntry[]> {
    return [...this.map.values()];
  }
  async put(entry: QueueEntry): Promise<void> {
    this.map.set(entry.entry_id, { ...entry });
  }
  async remove(entryId: string): Promise<void> {
    this.map.delete(entryId);
  }
}
