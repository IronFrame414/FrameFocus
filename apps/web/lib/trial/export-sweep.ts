import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { runExportChunk, initialCursor, EXPORT_TTL_HOURS, type ExportJobRow } from './export';

/**
 * S138 — the export worker (spec §4c).
 *
 * ⚠️ A CRON DRIVES THE CONTINUATION, NOT THE BROWSER [Josh, S138]. A large
 * export is ~58 invocations over ~4.8 hours. Driving that from the export
 * screen would strand the job the moment the tab closes, which for a
 * multi-hour export is essentially always.
 *
 * ⚠️ ONE JOB PER INVOCATION, DELIBERATELY. Each chunk already budgets to
 * ~240s of the 300s ceiling, so a second job in the same run would be starved
 * or would push the function past maxDuration and lose the part it was
 * writing. Concurrency here would trade a slow queue for corrupt output.
 */

export interface SweepOutcome {
  advanced: number;
  completed: number;
  failed: number;
  expired: number;
  objectsRemoved: number;
}

/** Attempts before a job is parked as `failed` rather than retried forever. */
const MAX_ATTEMPTS = 5;

export async function runExportSweep(
  admin: SupabaseClient<Database>,
  now: Date
): Promise<SweepOutcome> {
  const outcome: SweepOutcome = {
    advanced: 0,
    completed: 0,
    failed: 0,
    expired: 0,
    objectsRemoved: 0,
  };

  // ---- 1. expire completed exports past their 24 hours ----------------------
  //
  // ⚠️ THE OBJECT GOES, THE ROW STAYS. `export_jobs` is the export AUDIT —
  // "a departing employee exporting everything on their last day is a real
  // scenario" — so the record of who took what survives the download link.
  const { data: stale } = await admin
    .from('export_jobs')
    .select('id, company_id')
    .eq('state', 'complete')
    .lt('expires_at', now.toISOString());

  for (const job of (stale ?? []) as Array<{ id: string; company_id: string }>) {
    const prefix = `${job.company_id}/${job.id}`;
    const { data: objects } = await admin.storage.from('exports').list(prefix, { limit: 1000 });
    const paths = (objects ?? []).map((o) => `${prefix}/${o.name}`);
    if (paths.length > 0) {
      const { error } = await admin.storage.from('exports').remove(paths);
      if (!error) outcome.objectsRemoved += paths.length;
    }
    await admin
      .from('export_jobs')
      .update({ state: 'expired', object_path: null })
      .eq('id', job.id);
    outcome.expired += 1;
  }

  // ---- 2. advance the oldest unfinished job ---------------------------------
  const { data: queued } = await admin
    .from('export_jobs')
    .select('id, company_id, categories, format, state, cursor, bytes_written')
    .in('state', ['pending', 'running'])
    .order('created_at', { ascending: true })
    .limit(1);

  const job = ((queued ?? [])[0] ?? null) as ExportJobRow | null;
  if (!job) return outcome;

  // ⚠️ A LOCKED COMPANY GETS NO EXPORT, even one queued before the lock. The
  // ruling is that the export window is the PRE-EXPIRY period; finishing a job
  // after expiry would hand over data the lock exists to withhold.
  const { data: lifecycle } = await admin
    .from('trial_lifecycle')
    .select('locked_at')
    .eq('company_id', job.company_id)
    .maybeSingle();
  if (lifecycle && (lifecycle as { locked_at: string | null }).locked_at !== null) {
    await admin
      .from('export_jobs')
      .update({ state: 'failed', last_error: 'Trial expired before the export finished' })
      .eq('id', job.id);
    outcome.failed += 1;
    return outcome;
  }

  await admin.from('export_jobs').update({ state: 'running' }).eq('id', job.id);

  try {
    const result = await runExportChunk(admin, job, now);
    const total = (job.bytes_written ?? 0) + result.bytes;

    if (result.done) {
      const expiresAt = new Date(now.getTime() + EXPORT_TTL_HOURS * 3600 * 1000);
      await admin
        .from('export_jobs')
        .update({
          state: 'complete',
          cursor: result.cursor as never,
          bytes_written: total,
          object_path: `${job.company_id}/${job.id}`,
          expires_at: expiresAt.toISOString(),
          last_error: result.notes.length ? result.notes.join('\n').slice(0, 2000) : null,
        })
        .eq('id', job.id);
      outcome.completed += 1;
    } else {
      await admin
        .from('export_jobs')
        .update({ state: 'pending', cursor: result.cursor as never, bytes_written: total })
        .eq('id', job.id);
      outcome.advanced += 1;
    }
  } catch (err) {
    const cursor = { ...initialCursor(), ...(job.cursor ?? {}) };
    const attempts = ((cursor as { attempts?: number }).attempts ?? 0) + 1;
    const message = err instanceof Error ? err.message : 'export chunk failed';
    await admin
      .from('export_jobs')
      .update({
        state: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        cursor: { ...cursor, attempts } as never,
        last_error: message.slice(0, 2000),
      })
      .eq('id', job.id);
    if (attempts >= MAX_ATTEMPTS) outcome.failed += 1;
  }

  return outcome;
}
