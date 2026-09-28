// ===========================================================================
// S112 queue 2b — ONE way to upload several files at once.
// ===========================================================================
// Every multi-file upload control uses this, so "which files failed" and
// "retry just those" mean the same thing everywhere (PARITY: lib/, not a
// surface's folder).
//
// ⚠️ CONCURRENCY IS BOUNDED, ON PURPOSE. Unbounded parallel work per file is
// the shape that exhausted Storage twice in S111 (per-photo signing: "Too many
// connections issued to the database", which also failed uploads). One file =
// one Storage PUT + one `files` INSERT + (images) one auto-tag request, so N
// files at once is up to 3N requests in flight. The default of 3 keeps a
// 10-file batch at ≤ 3 uploads in flight — measured, see the S112 overnight-2
// report — while still overlapping the network waits that dominate a single
// upload.
//
// ⚠️ A STORAGE-LIMIT REFUSAL STOPS THE QUEUE. The company is over its storage
// cap; every later file would be refused the same way. They are marked
// `skipped` (never attempted), not `failed`, so the message can say so and a
// retry after freeing space picks them up.
// ===========================================================================

export const DEFAULT_UPLOAD_CONCURRENCY = 3;

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'skipped';

export interface UploadItem {
  /** Stable per batch entry — survives a retry, so the UI row does not jump. */
  key: string;
  file: File;
  status: UploadStatus;
  /** The worker's message on `failed`; the reason on `skipped`. */
  error?: string;
  /** The created `files.id` on `done`. */
  fileId?: string;
}

export interface UploadOutcome {
  success: boolean;
  id?: string;
  error?: string;
  /** The storage cap refused it: stop the queue (see header). */
  storageLimited?: boolean;
}

export function toUploadItems(files: File[], prefix = 'u'): UploadItem[] {
  return files.map((file, i) => ({ key: `${prefix}${i}-${file.name}`, file, status: 'queued' }));
}

/**
 * Upload every `queued` item with at most `concurrency` in flight. Items in any
 * other state are left exactly as they are, which is what makes a retry of
 * "just the failed ones" a call with those reset to `queued`.
 *
 * Never throws: a worker that throws is a `failed` item with its message.
 * `onChange` receives a fresh array after every state change (render from it).
 */
export async function runUploadBatch(
  items: UploadItem[],
  worker: (file: File) => Promise<UploadOutcome>,
  opts: { concurrency?: number; onChange?: (items: UploadItem[]) => void } = {}
): Promise<UploadItem[]> {
  const concurrency = Math.max(1, Math.floor(opts.concurrency ?? DEFAULT_UPLOAD_CONCURRENCY));
  const state = items.map((it) => ({ ...it }));
  const emit = () => opts.onChange?.(state.map((it) => ({ ...it })));
  let stopped: string | null = null;
  let next = 0;

  const pending = state.map((it, i) => (it.status === 'queued' ? i : -1)).filter((i) => i >= 0);

  async function lane(): Promise<void> {
    while (next < pending.length) {
      const idx = pending[next++];
      const item = state[idx];
      if (stopped) {
        item.status = 'skipped';
        item.error = stopped;
        emit();
        continue;
      }
      item.status = 'uploading';
      item.error = undefined;
      emit();
      let out: UploadOutcome;
      try {
        out = await worker(item.file);
      } catch (e) {
        out = { success: false, error: e instanceof Error ? e.message : String(e) };
      }
      if (out.success) {
        item.status = 'done';
        item.fileId = out.id;
      } else if (out.storageLimited) {
        stopped = out.error ?? 'Storage limit reached.';
        item.status = 'skipped';
        item.error = stopped;
      } else {
        item.status = 'failed';
        item.error = out.error ?? 'Upload failed.';
      }
      emit();
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, () => lane()));
  return state;
}

/** Reset only the failed and skipped items to `queued`; done items stay done. */
export function requeueUnfinished(items: UploadItem[]): UploadItem[] {
  return items.map((it) =>
    it.status === 'failed' || it.status === 'skipped'
      ? { ...it, status: 'queued', error: undefined }
      : it
  );
}

/** "2 of 10 could not be uploaded: a.pdf, b.jpg" — names them, never just a count. */
export function summarizeBatch(items: UploadItem[]): {
  done: number;
  failed: UploadItem[];
  skipped: UploadItem[];
  message: string | null;
} {
  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'failed');
  const skipped = items.filter((i) => i.status === 'skipped');
  const parts: string[] = [];
  if (failed.length)
    parts.push(
      `${failed.length} of ${items.length} could not be uploaded: ${failed.map((f) => f.file.name).join(', ')}.`
    );
  if (skipped.length)
    parts.push(
      `${skipped.length} not attempted (${skipped[0].error ?? 'stopped'}): ${skipped.map((f) => f.file.name).join(', ')}.`
    );
  return { done, failed, skipped, message: parts.length ? parts.join(' ') : null };
}

/**
 * [S114 C-5, RULED Josh 2026-09-28] Upload every file NOT already in `done`
 * (File → created `files.id`), through `runUploadBatch` — bounded, named
 * failures — and record each success in `done`. Calling it again with the SAME
 * map retries ONLY what is still missing, so a form's own submit (or a Retry
 * button) is the retry, and a photo that already landed is never uploaded
 * twice. The map lives in the form (a `useRef`), for as long as the record
 * being attached to does.
 *
 * Used by every record-attached multi-photo control that used to loop
 * serially: /m daily log, incident and delivery check-in; desktop daily log,
 * incident, check-in, delivery edit, expense receipts, selection thread,
 * estimate attachments. Files and Add Photos keep their own batch UI (the same
 * runner).
 */
export async function uploadRemaining(
  files: File[],
  done: Map<File, string | undefined>,
  worker: (file: File) => Promise<UploadOutcome>,
  opts: { concurrency?: number; onChange?: (items: UploadItem[]) => void } = {}
): Promise<{
  items: UploadItem[];
  message: string | null;
  unfinished: number;
  unfinishedNames: string[];
}> {
  const todo = files.filter((f) => !done.has(f));
  const items = await runUploadBatch(toUploadItems(todo), worker, opts);
  for (const it of items) if (it.status === 'done') done.set(it.file, it.fileId);
  const s = summarizeBatch(items);
  const unfinished = [...s.failed, ...s.skipped];
  // `message` is English (desktop); /m words its own EN/ES text around the names.
  return {
    items,
    message: s.message,
    unfinished: unfinished.length,
    unfinishedNames: unfinished.map((i) => i.file.name),
  };
}
