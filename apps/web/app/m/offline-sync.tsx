'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createClient } from '@/lib/supabase-browser';
import { uploadFile } from '@/lib/services/files-client';
import { OfflineQueue, type EnqueueInput, type QueueEntry } from '@/lib/offline/queue';
import { IdbStorage } from '@/lib/offline/idb-storage';
import { makeExecutors } from '@/lib/offline/executors';
import { syncOnce, type SyncEvent } from '@/lib/offline/sync';

// M6M §5 — THE QUEUE'S BROWSER HOST. One queue per tab, IndexedDB-backed,
// exposed to the mobile tree through context so the shell's pill, M-4's list
// and the capture screens all read ONE source of truth.
//
// Auto-retry on reconnect WITH BACKOFF (§5.2.5): the `online` event triggers
// an immediate pass and resets the delay; after that, a pass with failures
// doubles the delay up to a cap, and a clean pass resets it to the base.
// Nothing is scheduled when nothing is queued. "Try again" (A-17b) is
// literally `sync()` — an immediate pass, gated on nothing.

const BACKOFF_BASE_MS = 15_000;
const BACKOFF_MAX_MS = 5 * 60_000;

export interface OfflineSyncApi {
  /** All entries, seq order — M-4's "Waiting to sync" list. */
  entries: QueueEntry[];
  /** A-18 — state:'queued' only; conflicted entries have left the queue. */
  queuedCount: number;
  enqueue: (input: EnqueueInput) => Promise<void>;
  /** An immediate sync pass — the "Try again" hook (A-17b). */
  sync: () => Promise<void>;
}

const Ctx = createContext<OfflineSyncApi | null>(null);

export function useOfflineSync(): OfflineSyncApi | null {
  return useContext(Ctx);
}

async function uploadQueuedPhoto(payload: {
  blob: Blob;
  file_name: string;
  project_id: string;
  id: string;
  daily_log_id: string | null;
}): Promise<{ success: boolean; error?: string }> {
  // §5.5.3 / A-20d — THROUGH uploadFile, never a raw bucket PUT: the HEIC→JPEG
  // conversion lives inside it, and bypassing it silently reopens #94 for
  // exactly the users the PWA is built for.
  const file = new File([payload.blob], payload.file_name, {
    type: payload.blob.type || 'application/octet-stream',
  });
  const uploaded = await uploadFile(file, {
    project_id: payload.project_id,
    category: payload.daily_log_id ? 'daily_logs' : 'photos',
    // §5.3 — the client-generated fileId makes the replay idempotent: N
    // replays land exactly one `files` row for this id.
    id: payload.id,
  });
  if (!uploaded.success || !uploaded.id) return uploaded;

  if (payload.daily_log_id) {
    const supabase = createClient();
    const { error } = await supabase
      .from('files')
      .update({ daily_log_id: payload.daily_log_id } as never)
      .eq('id', uploaded.id);
    if (error) return { success: false, error: error.message };
  }
  return { success: true };
}

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const queueRef = useRef<OfflineQueue | null>(null);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const syncing = useRef(false);
  const delayRef = useRef(BACKOFF_BASE_MS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncRef = useRef<(() => Promise<void>) | null>(null);

  const getQueue = useCallback((): OfflineQueue => {
    if (!queueRef.current) queueRef.current = new OfflineQueue(new IdbStorage());
    return queueRef.current;
  }, []);

  const refresh = useCallback(async () => {
    setEntries(await getQueue().all());
  }, [getQueue]);

  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    let events: SyncEvent[] = [];
    try {
      const supabase = createClient();
      const exec = makeExecutors(supabase, { uploadPhoto: uploadQueuedPhoto });
      events = await syncOnce(getQueue(), exec, () => navigator.onLine);
    } finally {
      syncing.current = false;
      const all = await getQueue().all();
      setEntries(all);

      // §5.2.5 — the backoff schedule. A pass with failures doubles the delay
      // (capped); a clean pass resets it. Offline passes attempt nothing and
      // report no failures, so the timer keeps ticking at the base as a cheap
      // no-op safety net under the `online` event. No queued entries, no timer.
      delayRef.current = events.some((e) => e.outcome === 'failed')
        ? Math.min(delayRef.current * 2, BACKOFF_MAX_MS)
        : BACKOFF_BASE_MS;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = all.some((e) => e.state === 'queued')
        ? setTimeout(() => void syncRef.current?.(), delayRef.current)
        : null;
    }
  }, [getQueue]);

  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  const enqueue = useCallback(
    async (input: EnqueueInput) => {
      await getQueue().enqueue(input);
      await refresh();
      // Captured while online (a transient failure path, or the last moment of
      // signal): try immediately rather than waiting for an event.
      if (navigator.onLine) void sync();
    },
    [getQueue, refresh, sync]
  );

  useEffect(() => {
    // Anything already queued from a previous visit starts syncing (and
    // scheduling) immediately — sync() no-ops harmlessly on an empty queue.
    void refresh().then(() => void sync());
    const onOnline = () => {
      delayRef.current = BACKOFF_BASE_MS; // a reconnect is a fresh start
      void sync();
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [refresh, sync]);

  const value = useMemo<OfflineSyncApi>(
    () => ({
      entries,
      queuedCount: entries.filter((e) => e.state === 'queued').length,
      enqueue,
      sync,
    }),
    [entries, enqueue, sync]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
