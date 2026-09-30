import { canAdmit, HELD_TTL_MS, type HeldShot, type HeldStatus } from './held-shots';

// S107 Part A — THE BATCH RULES. Pure, so every one of them can be asserted
// without a camera, a phone, or a database.
//
// ⚠️ IT LIVES IN `lib/`, NOT `app/m/` [debt-split §2.5, and CLAUDE.md's parity
// rule]. Capture is mobile-only PRESENTATION over a shared mechanism; a helper
// under `app/m/` is a claim that the mobile surface owns the rule, and #129 is
// what happens when two surfaces each own their own version of one.

/** ⚠️ ONE PROJECT PER BATCH [RULED]. Resolved once, at the start, and never
 *  per shot — a user who clocks into a different job mid-run does not get their
 *  photos split across two projects. */
export interface CaptureBatch {
  /** Resolved ONCE when the batch opens. Null means "ask at the end" (A-21). */
  projectId: string | null;
  /** Unfinished shots only. A shot that LANDS leaves the tray. */
  shots: HeldShot[];
  /** ⚠️ Shots that uploaded and left. Counted, not derived: once a shot is gone
   *  from `shots` there is nothing left to infer it from, and the summary line
   *  has to say "6 added · 1 failed" after six of seven have departed. */
  addedCount: number;
}

export function emptyBatch(projectId: string | null = null): CaptureBatch {
  return { projectId, shots: [], addedCount: 0 };
}

/** A shot landed: it leaves the tray and is counted. */
export function shotLanded(batch: CaptureBatch, id: string): CaptureBatch {
  const present = batch.shots.some((s) => s.id === id);
  return {
    ...batch,
    shots: batch.shots.filter((s) => s.id !== id),
    addedCount: batch.addedCount + (present ? 1 : 0),
  };
}

export type AddOutcome =
  | { ok: true; batch: CaptureBatch }
  | { ok: false; reason: string; batch: CaptureBatch };

/**
 * Add one shot. ⚠️ At capacity this REFUSES and leaves the batch untouched —
 * see the cleanup rule in `held-shots.ts`. Evicting to make room would destroy
 * a photo the user still believes they have.
 */
export function addShot(batch: CaptureBatch, shot: HeldShot): AddOutcome {
  const admit = canAdmit(batch.shots.length);
  if (!admit.admitted) return { ok: false, reason: admit.reason, batch };
  return { ok: true, batch: { ...batch, shots: [...batch.shots, shot] } };
}

export function removeShot(batch: CaptureBatch, id: string): CaptureBatch {
  return { ...batch, shots: batch.shots.filter((s) => s.id !== id) };
}

export function setShotStatus(
  batch: CaptureBatch,
  id: string,
  status: HeldStatus,
  error?: string | null
): CaptureBatch {
  return {
    ...batch,
    shots: batch.shots.map((s) => (s.id === id ? { ...s, status, error: error ?? null } : s)),
  };
}

/**
 * ⚠️ THE PROJECT IS RESOLVED ONCE AND THEN PINNED. Once a batch has a project,
 * a later resolution CANNOT change it — that is the whole of the one-project-
 * per-batch ruling, expressed where it cannot be forgotten. A build that
 * re-read the clock per shot would look correct on every single-job test and
 * split the photos the first time someone clocked over at lunch.
 */
export function resolveBatchProject(batch: CaptureBatch, candidate: string | null): CaptureBatch {
  if (batch.projectId) return batch;
  return { ...batch, projectId: candidate };
}

export interface BatchProgress {
  total: number;
  added: number;
  queued: number;
  failed: number;
  pending: number;
  /** ⚠️ The line the user reads. Written here, not in the component, so the
   *  wording cannot drift between surfaces. */
  summary: string;
}

/**
 * ⚠️ PER-PHOTO STATUS, NOT A BATCH VERDICT [RULED]. "Photos 1–3 and 5–7
 * continue; photo 4 is held with a retry." A single banner over a mixed batch is
 * exactly the misreport this exists to prevent — it would say "queued" over a
 * run where six landed and one did not.
 */
export function batchProgress(batch: CaptureBatch): BatchProgress {
  const count = (s: HeldStatus) => batch.shots.filter((x) => x.status === s).length;
  const added = batch.addedCount;
  const queued = count('queued');
  const failed = count('failed');
  const pending = count('held') + count('uploading');
  const total = added + batch.shots.length;

  const parts: string[] = [];
  if (added) parts.push(`${added} added`);
  if (queued) parts.push(`${queued} waiting to upload`);
  if (failed) parts.push(`${failed} failed`);
  if (pending) parts.push(`${pending} to go`);

  return {
    total,
    added,
    queued,
    failed,
    pending,
    summary: parts.length ? parts.join(' · ') : `${total} photo${total === 1 ? '' : 's'}`,
  };
}

/**
 * [S121 Part 2] Shots with NO project yet — never sent anywhere. A `queued`
 * shot is NOT one of them (its queue entry carries the project), and neither is
 * a shot that remembers the project it was sent to.
 *
 * SUPERSEDED [S121]: needsProject used to be `batch.shots.length > 0`, so a
 * queued shot counted as "no project" forever — the strip said "N photos with
 * no project" about photos already filed, and "Save" skipped them. That is the
 * "30 photos that won't land" Josh reported (S121 report §1.3).
 */
export function unfiledShots(batch: CaptureBatch): HeldShot[] {
  return batch.shots.filter((s) => s.status !== 'queued' && !s.projectId);
}

/** Shots that still need a project before anything can be sent (A-21 / §7a). */
export function needsProject(batch: CaptureBatch): boolean {
  return batch.projectId === null && unfiledShots(batch).length > 0;
}

/**
 * [S121 Part 2] Split held shots by whether the server already has them. The
 * shot id IS the `files.id` (uploadFile's idempotency id), so a shot whose id
 * comes back from `files` is on a project — its tray row is a ghost left by a
 * queue upload that nothing cleared. Pure: the lookup is the caller's.
 */
export function splitLanded(
  shots: readonly HeldShot[],
  landedIds: ReadonlySet<string>
): { landed: HeldShot[]; kept: HeldShot[] } {
  return {
    landed: shots.filter((s) => landedIds.has(s.id)),
    kept: shots.filter((s) => !landedIds.has(s.id)),
  };
}

/**
 * [S121 ASK-26] Shots old enough that the tray ASKS whether to delete them.
 * Offered, never taken — nothing calls a delete without the user's yes.
 */
export function oldShots(shots: readonly HeldShot[], now: number = Date.now()): HeldShot[] {
  return shots.filter((s) => now - new Date(s.takenAt).getTime() >= HELD_TTL_MS);
}

/**
 * [S121 Part 2] A shot left `uploading` when the app was killed mid-send is not
 * uploading any more. After the server check has cleared the ones that DID land,
 * the rest read as failed, with a retry — never as a spinner that never ends.
 */
export function settleInterrupted(shots: readonly HeldShot[], message: string): HeldShot[] {
  return shots.map((s) => (s.status === 'uploading' ? { ...s, status: 'failed', error: message } : s));
}

/** Shots the user can retry — failures only, never a whole-batch retry. */
export function retryableShots(batch: CaptureBatch): HeldShot[] {
  return batch.shots.filter((s) => s.status === 'failed');
}
