'use client';

import { useCallback, useRef, useState } from 'react';
import {
  requeueUnfinished,
  runUploadBatch,
  toUploadItems,
  type UploadItem,
  type UploadOutcome,
} from '@/lib/uploads/upload-batch';

// [S116 F-12, #2-s180u step 1] The state half of `runUploadBatch`, for a
// component with one OR SEVERAL upload targets (a delivery check-in has one per
// line plus the delivery itself). Each batch is keyed; each keeps the worker it
// was started with, so "Retry" re-runs ONLY that batch's failed and skipped
// files against the SAME target — never a new record, never a done file again.
// Render each batch with `<UploadBatchList>`.
//
// In lib/, not a surface's folder: every multi-file upload control on every
// surface reads it [PARITY, S122].

type Worker = (file: File) => Promise<UploadOutcome>;

export interface UploadBatches {
  /** The batch's rows (empty when none has run). */
  items: (key: string) => UploadItem[];
  busy: (key: string) => boolean;
  anyBusy: boolean;
  /** Upload `files` as a new batch under `key`; resolves to the final rows. */
  start: (key: string, files: File[], worker: Worker) => Promise<UploadItem[]>;
  /** Re-run only the failed and skipped rows of `key`, with its own worker. */
  retry: (key: string) => Promise<UploadItem[]>;
  /** Forget a batch (or all of them). */
  clear: (key?: string) => void;
}

export function useUploadBatches(): UploadBatches {
  const [batches, setBatches] = useState<Record<string, UploadItem[]>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const workers = useRef(new Map<string, Worker>());
  const latest = useRef<Record<string, UploadItem[]>>({});

  const run = useCallback(async (key: string, batch: UploadItem[], worker: Worker) => {
    workers.current.set(key, worker);
    setRunning((r) => ({ ...r, [key]: true }));
    const out = await runUploadBatch(batch, worker, {
      onChange: (rows) => {
        latest.current[key] = rows;
        setBatches((b) => ({ ...b, [key]: rows }));
      },
    });
    latest.current[key] = out;
    setBatches((b) => ({ ...b, [key]: out }));
    setRunning((r) => ({ ...r, [key]: false }));
    return out;
  }, []);

  const start = useCallback(
    (key: string, files: File[], worker: Worker) => run(key, toUploadItems(files, key), worker),
    [run]
  );

  const retry = useCallback(
    async (key: string) => {
      const worker = workers.current.get(key);
      const rows = latest.current[key] ?? [];
      if (!worker) return rows;
      return run(key, requeueUnfinished(rows), worker);
    },
    [run]
  );

  const clear = useCallback((key?: string) => {
    if (key === undefined) {
      workers.current.clear();
      latest.current = {};
      setBatches({});
      return;
    }
    workers.current.delete(key);
    delete latest.current[key];
    setBatches((b) => {
      const next = { ...b };
      delete next[key];
      return next;
    });
  }, []);

  return {
    items: (key) => batches[key] ?? [],
    busy: (key) => Boolean(running[key]),
    anyBusy: Object.values(running).some(Boolean),
    start,
    retry,
    clear,
  };
}

/** The `files.id` of every row that landed, in pick order. */
export function doneIds(items: UploadItem[]): string[] {
  return items.flatMap((i) => (i.status === 'done' && i.fileId ? [i.fileId] : []));
}

/** True when a batch has rows that did not land (failed or not attempted). */
export function hasUnfinished(items: UploadItem[]): boolean {
  return items.some((i) => i.status === 'failed' || i.status === 'skipped');
}

/**
 * Add every landed row to a list of `{ id, name }` photos, once each (a retry
 * returns the earlier done rows again; they are not added twice).
 */
export function mergeLanded(
  existing: { id: string; name: string }[],
  rows: UploadItem[]
): { id: string; name: string }[] {
  const have = new Set(existing.map((p) => p.id));
  const added = rows.flatMap((r) =>
    r.status === 'done' && r.fileId && !have.has(r.fileId)
      ? [{ id: r.fileId, name: r.file.name }]
      : []
  );
  return added.length ? [...existing, ...added] : existing;
}
