import { canAdmit, type HeldShot, type HeldStatus } from './held-shots';

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

/** Shots that still need a project before anything can be sent (A-21 / §7a). */
export function needsProject(batch: CaptureBatch): boolean {
  return batch.projectId === null && batch.shots.length > 0;
}

/** Shots the user can retry — failures only, never a whole-batch retry. */
export function retryableShots(batch: CaptureBatch): HeldShot[] {
  return batch.shots.filter((s) => s.status === 'failed');
}
