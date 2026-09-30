'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  HeldShotStore,
  daysUntilExpiry,
  type HeldShot,
} from '@/lib/offline/held-shots';
import {
  addShot as addToBatch,
  batchProgress,
  emptyBatch,
  needsProject,
  removeShot as removeFromBatch,
  resolveBatchProject,
  setShotStatus,
  settleInterrupted,
  shotLanded,
  splitLanded,
  type BatchProgress,
  type CaptureBatch,
} from '@/lib/offline/capture-batch';
import { findUploadedFiles } from '@/lib/services/files-client';
import { useOfflineSync } from './offline-sync';
import { useT } from '@/components/i18n/language-provider';

// M6M §6 / S107 Part A — WHERE SHOTS LIVE BETWEEN THE SHUTTER AND THE PROJECT.
//
// ===========================================================================
// ⚠️ THIS REPLACES THE SINGLE-SLOT `PendingShot`. THAT WAS A RULING, AND SO IS
// THIS.
// ===========================================================================
// _Superseded design, quoted rather than deleted:_ one `PendingShot | null`,
// each `hold()` overwriting the last, held in memory and **deliberately not
// persisted** — because §7a refuses a project-less `files` INSERT, so a
// persisted blob would be "a queued item that never syncs".
//
// ⚠️ THAT ARGUMENT WAS CORRECT AND IS NOT OVERTURNED. What changed is the cost.
// One lost shot was one retake; **fifteen lost shots is a lost site visit**, and
// the batch ruling puts the project picker at the END of the run, so the whole
// batch is exposed for its whole duration. ASK-A.2 [RULED Josh, Option B]
// resolves it WITHOUT touching §7a: shots persist to a store that is explicitly
// **not the sync queue** (`m6m-held-shots`, a separate database), and are
// ADOPTED into the queue only once a project exists. Nothing project-less is
// ever queued.
//
// What the single slot bought and this gives up is recorded in the spec's
// "THE RECORD OWED" block. The invariant it protected is not among the losses.

export type { HeldShot };

interface CaptureStore {
  batch: CaptureBatch;
  progress: BatchProgress;
  /** True once the store has read IndexedDB — the tray must not flash empty. */
  ready: boolean;
  /** ⚠️ Refusal is returned, never thrown and never silent: at capacity the
   *  caller must SHOW the reason. */
  hold: (file: File, projectId: string | null) => Promise<{ ok: boolean; reason?: string }>;
  setStatus: (id: string, status: HeldShot['status'], error?: string | null) => Promise<void>;
  landed: (id: string) => Promise<void>;
  /** [S121 Part 2] Remember the project a shot is being sent to, ON the shot,
   *  so a failure survives a reload with its retry intact. */
  assign: (id: string, projectId: string) => Promise<void>;
  discard: (id: string) => Promise<void>;
  /** [S121 ASK-26] Delete several — only ever on the user's explicit yes. */
  discardMany: (ids: readonly string[]) => Promise<void>;
  discardAll: () => Promise<void>;
  /** [S121 Part 2] Photos the server check found ALREADY on a project, and
   *  cleared from the tray — reported, never cleared silently. */
  alreadyLanded: { count: number; projects: string[] };
  pinProject: (projectId: string | null) => void;
  /** Days until this shot is swept — for the warning that must precede it. */
  expiresInDays: (shot: HeldShot) => number;
  needsProject: boolean;
}

const Ctx = createContext<CaptureStore | null>(null);

export function useCaptureStore(): CaptureStore | null {
  return useContext(Ctx);
}

export function CaptureStoreProvider({ children }: { children: React.ReactNode }) {
  const [batch, setBatch] = useState<CaptureBatch>(() => emptyBatch());
  const [ready, setReady] = useState(false);
  const [alreadyLanded, setAlreadyLanded] = useState<{ count: number; projects: string[] }>({
    count: 0,
    projects: [],
  });
  const storeRef = useRef<HeldShotStore | null>(null);
  const offlineSync = useOfflineSync();
  const t = useT();
  const tRef = useRef(t);
  tRef.current = t;

  const store = useCallback((): HeldShotStore | null => {
    if (typeof indexedDB === 'undefined') return null;
    if (!storeRef.current) storeRef.current = new HeldShotStore();
    return storeRef.current;
  }, []);

  // ===========================================================================
  // [S121 Part 2] THE SERVER CHECK — clears ghosts, and only ghosts.
  // ===========================================================================
  // A shot queued for later kept its tray row, and NOTHING removed that row when
  // the queue later uploaded it: it sat in the tray for ever as "waiting", the
  // strip counted it as a photo with no project, and "Save" skipped it. The shot
  // id is the `files.id`, so asking the server which ids exist tells us exactly
  // which rows are ghosts. ⚠️ A FAILED lookup (offline) clears NOTHING — "could
  // not ask" is not "not uploaded". Cleared rows are counted and reported.
  const clearLanded = useCallback(
    async (candidates: readonly HeldShot[]): Promise<Set<string>> => {
      const found = await findUploadedFiles(candidates.map((c) => c.id));
      if (!found || found.size === 0) return new Set();
      const { landed } = splitLanded(candidates, new Set(found.keys()));
      for (const l of landed) {
        try {
          await store()?.remove(l.id);
        } catch (err) {
          console.error('[capture-store] could not clear a landed shot', err);
        }
      }
      const ids = new Set(landed.map((l) => l.id));
      setBatch((b) => ({ ...b, shots: b.shots.filter((x) => !ids.has(x.id)) }));
      const names = landed.map((l) => found.get(l.id)?.projectName ?? '').filter(Boolean);
      setAlreadyLanded((prev) => ({
        count: prev.count + landed.length,
        projects: Array.from(new Set([...prev.projects, ...names])),
      }));
      return ids;
    },
    [store]
  );

  // Rehydrate on mount. ⚠️ [S121 ASK-26] `all()` no longer sweeps anything.
  // ⚠️ A failure here must not blank the tray silently; it leaves the batch
  // empty and `ready` true, and the screen says so rather than pretending there
  // was never anything held.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = store();
        const loaded = s ? await s.all() : [];
        // Ghosts out first (a shot killed mid-upload may in fact have landed),
        // then whatever is still `uploading` was interrupted: it is failed,
        // with a retry — never a spinner that never ends.
        let cleared = new Set<string>();
        try {
          cleared = await clearLanded(loaded);
        } catch (err) {
          console.error('[capture-store] server check failed', err);
        }
        const shots = settleInterrupted(
          loaded.filter((x) => !cleared.has(x.id)),
          tRef.current('field.capture.interrupted')
        );
        for (const x of shots) {
          if (x.status === 'failed' && loaded.find((l) => l.id === x.id)?.status === 'uploading') {
            await s?.put(x).catch(() => {});
          }
        }
        if (!cancelled) setBatch((b) => ({ ...b, shots }));
      } catch (err) {
        console.error('[capture-store] could not read held shots', err);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, clearLanded]);

  // [S121 Part 2] Whenever the sync queue shrinks, a queued photo may have just
  // landed: re-check the `queued` rows. This is what stops a ghost forming.
  const queueSize = offlineSync?.entries.length ?? 0;
  const prevQueueSize = useRef(queueSize);
  useEffect(() => {
    const shrank = queueSize < prevQueueSize.current;
    prevQueueSize.current = queueSize;
    if (!ready || !shrank) return;
    const queued = batch.shots.filter((x) => x.status === 'queued');
    if (queued.length) void clearLanded(queued).catch(() => {});
  }, [queueSize, ready, batch.shots, clearLanded]);

  const hold = useCallback(
    async (file: File, projectId: string | null) => {
      const shot: HeldShot = {
        id: crypto.randomUUID(),
        blob: file,
        fileName: file.name || 'photo.jpg',
        takenAt: new Date().toISOString(),
        status: 'held',
      };

      // Capacity is decided against the CURRENT batch before anything is
      // written, so a refusal costs no storage.
      let refusal: string | undefined;
      let next: CaptureBatch | null = null;
      setBatch((b) => {
        const pinned = resolveBatchProject(b, projectId);
        const outcome = addToBatch(pinned, shot);
        if (!outcome.ok) {
          refusal = outcome.reason;
          return pinned;
        }
        next = outcome.batch;
        return outcome.batch;
      });
      if (refusal) return { ok: false, reason: refusal };

      // ⚠️ THE WRITE IS GUARDED. `idb-storage.ts` has no try/catch anywhere, and
      // an unguarded IndexedDB failure (quota exceeded, private mode, storage
      // denied) previously escaped as an unhandled rejection — the "Saving…"
      // spinner stayed up forever with nothing on screen and the photo was lost
      // on navigation (FILL-A.3). It now surfaces on the shot's own row.
      try {
        await store()?.put(shot);
      } catch (err) {
        const reason =
          err instanceof Error && /quota/i.test(err.message)
            ? "Couldn't save to this device — storage full."
            : "Couldn't save this photo to your device.";
        setBatch((b) => setShotStatus(b, shot.id, 'failed', reason));
        return { ok: false, reason };
      }
      void next;
      return { ok: true };
    },
    [store]
  );

  const setStatus = useCallback(
    async (id: string, status: HeldShot['status'], error?: string | null) => {
      let updated: HeldShot | undefined;
      setBatch((b) => {
        const nb = setShotStatus(b, id, status, error);
        updated = nb.shots.find((s) => s.id === id);
        return nb;
      });
      try {
        if (updated) await store()?.put(updated);
      } catch (err) {
        console.error('[capture-store] status write failed', err);
      }
    },
    [store]
  );

  // A shot that LANDED leaves the tray and the device. ⚠️ Removal happens only
  // after the upload/queue succeeded — `capture?.clear()` must never run on a
  // path that did not persist the photo somewhere.
  const landed = useCallback(
    async (id: string) => {
      setBatch((b) => shotLanded(b, id));
      try {
        await store()?.remove(id);
      } catch (err) {
        console.error('[capture-store] could not remove a landed shot', err);
      }
    },
    [store]
  );

  const assign = useCallback(
    async (id: string, projectId: string) => {
      let updated: HeldShot | undefined;
      setBatch((b) => {
        const nb = { ...b, shots: b.shots.map((x) => (x.id === id ? { ...x, projectId } : x)) };
        updated = nb.shots.find((x) => x.id === id);
        return nb;
      });
      try {
        if (updated) await store()?.put(updated);
      } catch (err) {
        console.error('[capture-store] project write failed', err);
      }
    },
    [store]
  );

  const discardMany = useCallback(
    async (ids: readonly string[]) => {
      const drop = new Set(ids);
      setBatch((b) => ({ ...b, shots: b.shots.filter((x) => !drop.has(x.id)) }));
      for (const id of ids) {
        try {
          await store()?.remove(id);
        } catch (err) {
          console.error('[capture-store] discard failed', err);
        }
      }
    },
    [store]
  );

  const discard = useCallback(
    async (id: string) => {
      setBatch((b) => removeFromBatch(b, id));
      try {
        await store()?.remove(id);
      } catch (err) {
        console.error('[capture-store] discard failed', err);
      }
    },
    [store]
  );

  const discardAll = useCallback(async () => {
    setBatch((b) => ({ ...emptyBatch(b.projectId), addedCount: b.addedCount }));
    try {
      await store()?.clear();
    } catch (err) {
      console.error('[capture-store] clear failed', err);
    }
  }, [store]);

  const pinProject = useCallback((projectId: string | null) => {
    setBatch((b) => resolveBatchProject(b, projectId));
  }, []);

  const value = useMemo<CaptureStore>(
    () => ({
      batch,
      progress: batchProgress(batch),
      ready,
      hold,
      setStatus,
      landed,
      assign,
      discard,
      discardMany,
      discardAll,
      alreadyLanded,
      pinProject,
      expiresInDays: (shot: HeldShot) => daysUntilExpiry(shot),
      needsProject: needsProject(batch),
    }),
    [
      batch,
      ready,
      hold,
      setStatus,
      landed,
      assign,
      discard,
      discardMany,
      discardAll,
      alreadyLanded,
      pinProject,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The project the capture applies to, derived from where the user IS.
 *
 * Two sources, because the app has two ways of saying "this project":
 *   · the path — every `/m/p/{id}/**` screen (§4.11's section screens)
 *   · `?project=` — M-7's context row switches with a query param (§4.7)
 *
 * ⚠️ UNCHANGED BY S107, and verified rather than rebuilt (FILL-A.4).
 */
export function projectInContext(pathname: string, search: URLSearchParams): string | null {
  const fromPath = /^\/m\/p\/([0-9a-f-]{36})(\/|$)/.exec(pathname);
  if (fromPath) return fromPath[1];

  const fromQuery = search.get('project');
  return fromQuery && /^[0-9a-f-]{36}$/.test(fromQuery) ? fromQuery : null;
}

/**
 * S105b item 7 (ASK-7.A, RULED [Josh]) — the clock is a THIRD project source.
 *
 * ⚠️ Precedence is fixed and TESTED: URL path > `?project=` > open clock segment
 * > null. Pure on purpose — the caller does the async clock read and passes the
 * result, so the precedence rule can be asserted exhaustively without a database.
 *
 * ⚠️ S107: this now resolves the project for a BATCH, once. `resolveBatchProject`
 * pins the answer, so a user who clocks into a different job mid-run does not
 * split their photos across two jobs.
 */
export function resolveCaptureProjectId(
  contextId: string | null,
  clockProjectId: string | null
): string | null {
  return contextId ?? clockProjectId ?? null;
}
