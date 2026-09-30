// S107 Part A [RULED Josh, ASK-A.2 → Option B] — WHERE A SHOT LIVES BEFORE IT
// HAS A PROJECT.
//
// ===========================================================================
// WHY THIS STORE EXISTS, AND WHY IT IS NOT THE SYNC QUEUE
// ===========================================================================
// `capture-store.tsx` held ONE shot in a React `useState`, deliberately: §7a
// means a non-owner/admin `files` INSERT without a `project_id` is refused by
// RLS, so a project-less photo cannot legally be queued, and
// `capture-store.tsx:24-32` argued that persisting one would leave
//
//   "a persisted blob nothing can ever legally insert, which would sit in
//    storage looking like a queued item that never syncs."
//
// That argument is CORRECT and is preserved here. The resolution is that this
// is **not the queue**: a different IndexedDB database entirely, holding shots
// that are explicitly NOT syncable. Nothing project-less ever reaches the queue,
// so §7a stands untouched; a held shot is ADOPTED into the queue at the moment a
// project is chosen, and only then.
//
// What changed is the cost of the old trade-off. One lost shot was one retake.
// ⚠️ Fifteen lost shots is a lost site visit — and the batch ruling puts the
// project picker at the END of the run, so the whole batch is exposed for its
// whole duration.
//
// ===========================================================================
// THE CLEANUP RULE [Josh's condition on the ruling]
// ===========================================================================
//   TTL          7 days from takenAt
//   swept        ⚠️ NEVER AUTOMATICALLY — see S121 below
//   removed by   (1) adoption  (2) explicit discard  (3) the TTL sweep
//   at capacity  ⚠️ REFUSE THE NEW SHOT. NEVER EVICT AN OLD ONE.
//   capacity     25 — the same number as the batch cap; a full tray and a full
//                batch are one condition, not two
//   visibility   the caller must always show the held count; nothing may expire
//                without having been on screen first
//
// ⚠️ Eviction-to-make-room is a SILENT PHOTO LOSS, which is the single failure
// this whole part exists to prevent. Refusing the new shot is loud, recoverable,
// and puts the choice with the user.

// ===========================================================================
// ⚠️ S121 [RULED Josh, ASK-26, 2026-09-30] — NO SILENT SWEEP. REVERSES S114.
// ===========================================================================
// SUPERSEDED: "swept at store open (app start) and after every successful
// adoption" and `all()`'s "Sweeps expired shots as a side effect". The sweep
// deleted EVERY shot past 7 days on app open — failed, uploading and queued
// ones too, with or without a project — before anything was on screen.
// Josh: "Deleting a user's jobsite photos with no prompt is silent data loss."
// Now a shot past the TTL is only ever OFFERED for deletion (the tray asks
// "Delete N photos older than 7 days?"), and removed only on that yes.
// HELD_TTL_MS is kept as the age at which the tray starts asking.

export const HELD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const HELD_CAPACITY = 25;

export type HeldStatus = 'held' | 'uploading' | 'queued' | 'failed';

export interface HeldShot {
  /** Client-generated. Doubles as `uploadFile`'s idempotency id, so a retry
   *  cannot produce a second `files` row. */
  id: string;
  blob: Blob;
  fileName: string;
  /** ISO. The TTL clock and the capture time both read from this. */
  takenAt: string;
  status: HeldStatus;
  /** Why it failed, shown on the shot's own row. Never only logged. */
  error?: string | null;
  /** [S121 Part 2] The project this shot was last SENT to. Persisted on the
   *  shot so a failed shot can be retried after a reload (the batch's pinned
   *  project is memory-only and resets on every app load). Absent on shots
   *  held before S121 and on shots never sent. */
  projectId?: string | null;
}

/** Shots whose TTL has elapsed at `now`. */
export function expiredShots(shots: readonly HeldShot[], now: number = Date.now()): HeldShot[] {
  return shots.filter((s) => now - new Date(s.takenAt).getTime() >= HELD_TTL_MS);
}

/** Shots still within TTL — what a sweep keeps. */
export function liveShots(shots: readonly HeldShot[], now: number = Date.now()): HeldShot[] {
  return shots.filter((s) => now - new Date(s.takenAt).getTime() < HELD_TTL_MS);
}

/**
 * Whole days until a shot expires, floored — for the age warning that must
 * appear BEFORE the sweep can take it. Negative once it is already expired.
 */
export function daysUntilExpiry(shot: HeldShot, now: number = Date.now()): number {
  return Math.floor((new Date(shot.takenAt).getTime() + HELD_TTL_MS - now) / (24 * 60 * 60 * 1000));
}

/**
 * [S114 C-4, RULED Josh] What the app-wide deletion warning says: how many
 * unfiled shots there are and the whole days until the SOONEST is swept
 * (0 = today). Null when there is nothing to warn about. The warning, not the
 * per-shot label, is the headline — see HeldPhotosStrip in app/m/mobile-shell.tsx.
 */
export function soonestDeletion(
  shots: readonly HeldShot[],
  now: number = Date.now()
): { count: number; days: number } | null {
  if (shots.length === 0) return null;
  const days = Math.min(...shots.map((s) => daysUntilExpiry(s, now)));
  return { count: shots.length, days: Math.max(0, days) };
}

export type AdmitResult = { admitted: true } | { admitted: false; reason: string };

/**
 * May another shot be held? ⚠️ At capacity this REFUSES rather than making
 * room. See the cleanup rule above — evicting the oldest would silently destroy
 * a photo the user still believes they have.
 */
export function canAdmit(currentCount: number): AdmitResult {
  if (currentCount >= HELD_CAPACITY) {
    return {
      admitted: false,
      reason: `Tray full (${HELD_CAPACITY} photos). File or discard these before taking more.`,
    };
  }
  return { admitted: true };
}

// ── The IndexedDB adapter ──────────────────────────────────────────────────
//
// ⚠️ A SEPARATE DATABASE, not a second object store in `m6m-offline`. Two
// reasons and both matter: bumping that DB's version to add a store would touch
// the live queue's upgrade path for no benefit, and — more importantly — the
// separation is the *statement* that these shots are not queue entries. A future
// reader looking at `m6m-offline` finds only things that can legally sync.

const DB_NAME = 'm6m-held-shots';
const STORE = 'held';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

export class HeldShotStore {
  private db: Promise<IDBDatabase> | null = null;

  private getDb(): Promise<IDBDatabase> {
    if (!this.db) this.db = openDb();
    return this.db;
  }

  private tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return this.getDb().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const t = db.transaction(STORE, mode);
          const req = run(t.objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
        })
    );
  }

  /** Everything held, oldest first. ⚠️ [S121 ASK-26] NO LONGER SWEEPS — an
   *  old shot is returned like any other and the tray asks before deleting. */
  async all(): Promise<HeldShot[]> {
    const rows = (await this.tx<HeldShot[]>('readonly', (s) => s.getAll())) ?? [];
    return rows.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  }

  async put(shot: HeldShot): Promise<void> {
    await this.tx('readwrite', (s) => s.put(shot));
  }

  async remove(id: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(id));
  }

  async clear(): Promise<void> {
    await this.tx('readwrite', (s) => s.clear());
  }
}
