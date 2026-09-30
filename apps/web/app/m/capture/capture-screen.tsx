'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadFile } from '@/lib/services/files-client';
import { buildPhotoEntry } from '@/lib/offline/capture';
import { SetMobileHeader } from '../mobile-header';
import { useCaptureStore } from '../capture-store';
import type { HeldShot } from '@/lib/offline/held-shots';
import { oldShots } from '@/lib/offline/capture-batch';
import { BlobThumb, capturedWhen } from '@/components/offline/blob-thumb';
import { useOfflineSync } from '../offline-sync';
import { ErrorNotice, OptionStack, PrimaryButton, SecondaryButton } from '../write-ui';
import { useT } from '@/components/i18n/language-provider';

// M6M §6 / S107 Part A — THE TRAY. Everything after the shutter, for a BATCH.
//
// ===========================================================================
// WHAT THIS SCREEN IS FOR, AND WHY EVERY FAILURE IS ON IT
// ===========================================================================
// Part A ships to production UNVERIFIED by ruling — Josh tests it in the field.
// ⚠️ So VISIBILITY IS THE SAFETY NET: "a failure the user cannot see is a photo
// that silently does not exist." Every row of FILL-A.8's failure table has to
// be readable HERE, on the phone, not in a log line:
//
//   one photo fails      → that row says Failed, with Retry. The others finish.
//   all fail             → every row says Failed. NOTHING is cleared.
//   signal drops         → the affected rows say "waiting to upload", per shot
//   backgrounded         → the tray is still here on reopen (persisted store)
//   storage full         → that row says so. The spinner does not hang.
//   tray full            → the camera refuses the 26th. Nothing is evicted.
//   near TTL             → an age warning, before the sweep may take it
//
// ===========================================================================
// SERIAL, BY RULING (ASK-A.3 → A + C at 25)
// ===========================================================================
// One conversion at a time. A HEIC frame decodes to ~48 MB of bitmap ON THE
// MAIN THREAD (`heic2any`, no worker), so two or three at once is what actually
// reloads the tab on an older iPhone — and a reload is a lost batch. Serial is
// slower and keeps the app usable; the cap of 25 is only a backstop so a runaway
// batch fails with a message instead of a reload.

export type CaptureProjectChoice = { id: string; name: string; projectNumber: string | null };

export function CaptureScreen({ projects }: { projects: CaptureProjectChoice[] }) {
  const router = useRouter();
  const capture = useCaptureStore();
  const offlineSync = useOfflineSync();
  const t = useT();

  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // [S121 Part 2] SELECT → ASSIGN → UPLOAD. Empty selection = every shot that
  // can be sent (the original "file the whole batch" behaviour).
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // The result of the LAST run, per photo, counted from each shot's own
  // outcome — never inferred from the run finishing.
  const [result, setResult] = useState<{ ok: number; queued: number; bad: number } | null>(null);
  const [keepOld, setKeepOld] = useState(false);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const libraryRef = useRef<HTMLInputElement | null>(null);

  const batch = capture?.batch;
  const shots = batch?.shots ?? [];
  const progress = capture?.progress;

  /**
   * Send ONE shot. Returns when it has landed, queued, or failed — the caller
   * awaits it, which is what makes the run serial.
   *
   * ⚠️ THE FALLBACK ORDER IS THE S105b ASK-7.B RULING AND IS UNCHANGED: any
   * upload failure — not just `!navigator.onLine` — falls back to the SAME
   * idempotent queue, because a weak signal reads as ONLINE and fails. Measured
   * this session: supabase RESOLVES with `{error}` on a dead network rather than
   * throwing, so this branch is genuinely reached.
   */
  const sendOne = useCallback(
    async (shot: HeldShot, projectId: string): Promise<'landed' | 'queued' | 'failed'> => {
      if (!capture) return 'failed';
      // [S121 Part 2] The project goes ON the shot before anything is tried, so
      // a failure keeps its retry across a reload.
      await capture.assign(shot.id, projectId);
      await capture.setStatus(shot.id, 'uploading', null);

      let queuedOk = false;
      const queueForLater = async (): Promise<boolean> => {
        if (!offlineSync) return false;
        try {
          await offlineSync.enqueue(
            buildPhotoEntry({
              entryId: crypto.randomUUID(),
              // ⚠️ The shot's own id is the file id, so a replay UPSERTs onto the
              // same `files` row. A retry can never produce a second photo.
              fileId: shot.id,
              projectId,
              blob: shot.blob,
              fileName: shot.fileName,
              captured_at: shot.takenAt,
            })
          );
        } catch (err) {
          // ⚠️ FILL-A.3's REAL GAP. `idb-storage.ts` has no try/catch, so a quota
          // failure here used to escape as an unhandled rejection: the spinner
          // stayed up forever, nothing appeared on screen, and the photo was lost
          // on navigation. It is now a visible per-shot failure and the shot STAYS.
          const quota = err instanceof Error && /quota/i.test(err.message);
          await capture.setStatus(
            shot.id,
            'failed',
            quota
              ? t('field.capture.storageFull')
              : t('field.capture.saveLaterFailed')
          );
          return true; // handled — do not fall through and clear it
        }
        await capture.setStatus(shot.id, 'queued', null);
        queuedOk = true;
        return true;
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (await queueForLater()) return queuedOk ? 'queued' : 'failed';
      }

      const file =
        shot.blob instanceof File
          ? shot.blob
          : new File([shot.blob], shot.fileName, { type: shot.blob.type || 'image/jpeg' });

      const uploaded = await uploadFile(file, {
        project_id: projectId,
        category: 'photos',
        id: shot.id,
      });

      if (!uploaded.success) {
        if (await queueForLater()) return queuedOk ? 'queued' : 'failed';
        await capture.setStatus(shot.id, 'failed', uploaded.error ?? t('field.capture.uploadFailed'));
        return 'failed';
      }
      // ⚠️ Removed ONLY here — after it is genuinely somewhere. A clear on a path
      // that did not persist the photo is the loss this screen exists to prevent.
      await capture.landed(shot.id);
      return 'landed';
    },
    // `uploadFile` is a module import, not reactive state — including it is a
    // lint warning, not a correctness one.
    [capture, offlineSync, t]
  );

  /** Send these shots to one project, SERIALLY, counting each one's outcome. */
  const fileShots = useCallback(
    async (todo: HeldShot[], projectId: string) => {
      if (!capture) return;
      setBusy(true);
      setError(null);
      setResult(null);
      const tally = { ok: 0, queued: 0, bad: 0 };
      for (const shot of todo) {
        const outcome = await sendOne(shot, projectId);
        if (outcome === 'landed') tally.ok++;
        else if (outcome === 'queued') tally.queued++;
        else tally.bad++;
      }
      setResult(tally);
      setSelected(new Set());
      setBusy(false);
    },
    [capture, sendOne]
  );

  /** File the whole batch, SERIALLY. */
  const fileAll = useCallback(
    async (projectId: string) => {
      if (!capture) return;
      capture.pinProject(projectId);
      // Snapshot: `shots` mutates as each one lands.
      await fileShots(
        capture.batch.shots.filter((s) => s.status !== 'queued'),
        projectId
      );
    },
    [capture, fileShots]
  );

  // A-21b — a project already in context files with NO PROMPT. Fires once per
  // batch, not once per photo.
  const autoFired = useRef(false);
  useEffect(() => {
    if (!capture || !capture.ready || autoFired.current || busy) return;
    if (!batch?.projectId || shots.length === 0) return;
    if (!shots.some((s) => s.status === 'held')) return;
    autoFired.current = true;
    void fileAll(batch.projectId);
  }, [capture, batch, shots, busy, fileAll]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!capture) return;
    for (const f of files) {
      const r = await capture.hold(f, batch?.projectId ?? null);
      // ⚠️ A refusal is SHOWN. At capacity nothing is evicted to make room.
      if (!r.ok) {
        setError(r.reason ?? t('field.capture.holdFailed'));
        break;
      }
    }
    autoFired.current = false;
  }

  if (!capture?.ready) {
    return (
      <div className="px-[18px] pb-[18px] pt-[14px]">
        <SetMobileHeader title={t('field.capture.title')} />
        <p className="text-[14px] text-m6m-muted">{t('field.capture.loading')}</p>
      </div>
    );
  }

  // [S121 Part 2] What the assign panel can send: anything not already queued
  // (queued shots belong to the sync queue) and not mid-upload.
  const sendable = shots.filter((s) => s.status === 'held' || s.status === 'failed');
  const picked = selected.size > 0 ? sendable.filter((s) => selected.has(s.id)) : sendable;
  const askProject = (capture.needsProject || sendable.length > 0) && !busy;
  const aged = oldShots(shots);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader
        title={askProject ? t('field.capture.whichProject') : t('field.capture.photos')}
      />

      {/* ⚠️ THE COUNT IS ALWAYS ON SCREEN. The cleanup rule's last line: nothing
          may expire that was not visible first. */}
      {shots.length > 0 && (
        <p
          data-testid="m-capture-progress"
          className="mb-[10px] text-[14px] font-bold text-m6m-navy"
        >
          {progress?.summary}
        </p>
      )}

      {/* [S121 Part 2] Ghost rows the server check cleared — SAID, not silent. */}
      {capture.alreadyLanded.count > 0 && (
        <p
          data-testid="m-capture-already-landed"
          role="status"
          className="mb-[10px] rounded-[12px] border border-m6m-border bg-[#f0f7f1] px-[14px] py-[10px] text-[14px] text-m6m-navy"
        >
          {t(
            capture.alreadyLanded.count === 1
              ? 'field.capture.alreadyOnOne'
              : 'field.capture.alreadyOnMany',
            { n: capture.alreadyLanded.count, p: capture.alreadyLanded.projects.join(', ') || '—' }
          )}
        </p>
      )}

      {/* [S121 ASK-26] Old photos are OFFERED for deletion — never taken. */}
      {aged.length > 0 && !keepOld && !busy && (
        <div
          data-testid="m-capture-old-ask"
          className="mb-[10px] rounded-[12px] border border-[#f5c77e] bg-[#fff8eb] px-[14px] py-[10px]"
        >
          <p className="text-[14px] text-m6m-navy">{t('field.capture.oldAsk', { n: aged.length })}</p>
          <div className="mt-[8px] flex gap-[14px]">
            <button
              type="button"
              data-testid="m-capture-old-delete"
              onClick={() => void capture.discardMany(aged.map((a) => a.id))}
              className="text-[14px] font-bold text-m6m-danger underline"
            >
              {t('field.capture.oldDelete', { n: aged.length })}
            </button>
            <button
              type="button"
              data-testid="m-capture-old-keep"
              onClick={() => setKeepOld(true)}
              className="text-[14px] font-bold text-m6m-navy underline"
            >
              {t('field.capture.oldKeep')}
            </button>
          </div>
        </div>
      )}

      {result && (
        <p
          data-testid="m-capture-result"
          role="status"
          className="mb-[10px] text-[14px] font-bold text-m6m-navy"
        >
          {t('field.capture.resultLine', { ok: result.ok, bad: result.bad })}
          {result.queued > 0 ? ` · ${result.queued} ${t('field.capture.waitingOnline')}` : ''}
        </p>
      )}

      {shots.length === 0 ? (
        <p
          data-testid="m-capture-empty"
          className="rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] py-[12px] text-[14px] text-m6m-navy"
        >
          {progress && progress.added > 0
            ? t(progress.added === 1 ? 'field.capture.savedOne' : 'field.capture.savedMany', {
                n: progress.added,
              })
            : t('field.capture.empty')}
        </p>
      ) : (
        <div data-testid="m-capture-tray" className="flex flex-col gap-[8px]">
          {shots.map((s) => {
            const ageDays = Math.floor((Date.now() - new Date(s.takenAt).getTime()) / 86_400_000);
            const selectable = s.status === 'held' || s.status === 'failed';
            return (
              <div
                key={s.id}
                data-testid={`m-capture-shot-${s.status}`}
                className="flex items-center justify-between gap-[10px] rounded-[12px] border border-m6m-border bg-m6m-card px-[12px] py-[10px]"
              >
                {selectable && (
                  <input
                    type="checkbox"
                    data-testid="m-capture-select"
                    aria-label={t('field.capture.select')}
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="h-[22px] w-[22px] shrink-0 accent-m6m-blue"
                  />
                )}
                {/* S120 2-C — the photo itself and when it was taken: a file name
                    cannot tell you which of 300 camera-roll shots this is. */}
                <BlobThumb blob={s.blob} testId="m-capture-thumb" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-m6m-navy">{s.fileName}</p>
                  <p data-testid="m-capture-taken" className="font-mono text-[11px] text-m6m-muted">
                    {capturedWhen(s.takenAt)}
                  </p>
                  <p className="text-[12px] text-m6m-muted">
                    {s.status === 'held' && t('field.capture.waitingProject')}
                    {s.status === 'uploading' && t('field.capture.uploading')}
                    {s.status === 'queued' && t('field.capture.waitingOnline')}
                    {s.status === 'failed' && (s.error ?? t('field.capture.failed'))}
                  </p>
                  {/* [S121 ASK-26] Age, not an expiry — nothing expires any more.
                      SUPERSEDED: "Expires in N days", shown within 2 days of
                      the silent sweep. */}
                  {ageDays >= 1 && (
                    <p
                      data-testid="m-capture-age"
                      className={`text-[12px] ${ageDays >= 7 ? 'font-bold text-[#b45309]' : 'text-m6m-muted'}`}
                    >
                      {t('field.capture.age', { d: ageDays })}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-[8px]">
                  {s.status === 'failed' && (s.projectId ?? batch?.projectId) && (
                    <button
                      type="button"
                      data-testid="m-capture-retry"
                      onClick={() => void fileShots([s], (s.projectId ?? batch?.projectId)!)}
                      className="text-[13px] font-bold text-m6m-navy underline"
                    >
                      {t('field.capture.retry')}
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="m-capture-discard-one"
                    onClick={() => void capture.discard(s.id)}
                    className="text-[13px] text-m6m-muted underline"
                  >
                    {t('field.capture.discard')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error ? <ErrorNotice message={error} testId="m-capture-error" /> : null}

      {/* A-21 — the picker, ONCE, at the end of the batch.
          [S121 Part 2] It now also sends a SELECTION, to any project — the
          path for photos that are held or failed. */}
      {askProject && (
        <div className="mt-[14px]" data-testid="m-capture-assign">
          {sendable.length > 1 && (
            <div className="mb-[8px] flex items-center justify-between">
              <span data-testid="m-capture-selected-count" className="text-[13px] text-m6m-muted">
                {t('field.capture.selectedCount', { n: selected.size })}
              </span>
              <button
                type="button"
                data-testid="m-capture-select-all"
                onClick={() => setSelected(new Set(sendable.map((x) => x.id)))}
                className="text-[13px] font-bold text-m6m-navy underline"
              >
                {t('field.capture.selectAll')}
              </button>
            </div>
          )}
          <p className="mb-[6px] text-[14px] font-bold text-m6m-navy">
            {t('field.capture.assignTitle')}
          </p>
          <p className="mb-[10px] text-[14px] text-m6m-muted">
            {t('field.capture.heldNotice')}
          </p>
          {projects.length === 0 ? (
            <p
              data-testid="m-capture-no-projects"
              className="rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] py-[12px] text-[14px] text-m6m-navy"
            >
              {t('field.capture.noProjects')}
            </p>
          ) : (
            <div data-testid="m-capture-project-prompt">
              <OptionStack
                options={projects.map((p) => ({
                  value: p.id,
                  label: p.name,
                  sub: p.projectNumber ?? undefined,
                }))}
                value={chosen}
                onChange={setChosen}
                testIdPrefix="m-capture-project"
              />
            </div>
          )}
          <PrimaryButton
            label={t(
              picked.length === 1
                ? 'field.capture.uploadSelectedOne'
                : 'field.capture.uploadSelectedMany',
              { n: picked.length }
            )}
            busyLabel={t('field.capture.saving')}
            onClick={() => {
              if (!chosen) return;
              // No selection and nothing pinned yet = the original whole-batch
              // filing, which pins the project. A selection sends just those.
              if (selected.size === 0 && capture.needsProject) void fileAll(chosen);
              else void fileShots(picked, chosen);
            }}
            disabled={!chosen || picked.length === 0}
            busy={busy}
            testId="m-capture-save"
          />
        </div>
      )}

      {/* ⚠️ MANUAL RE-TAP [RULED A.4 → B + C]. Auto-reopening the camera was
          rejected: a programmatic .click() on a file input without a user gesture
          is blocked in some Safari versions, and if it breaks in the field the
          feature is dead with no fallback. A tap always works.
          The LIBRARY input carries `multiple`, which is the only way to get a
          true native burst — taken in the phone's own camera app, selected here
          in one go. */}
      <div className="mt-[16px] flex gap-[8px]">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          data-testid="m-capture-more-camera"
          className="hidden"
          onChange={(e) => void onPick(e)}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          multiple
          data-testid="m-capture-more-library"
          className="hidden"
          onChange={(e) => void onPick(e)}
        />
        <SecondaryButton
          label={t('field.capture.takeAnother')}
          testId="m-capture-again"
          onClick={() => cameraRef.current?.click()}
        />
        <SecondaryButton
          label={t('field.capture.addLibrary')}
          testId="m-capture-library"
          onClick={() => libraryRef.current?.click()}
        />
      </div>

      <SecondaryButton
        label={t('field.done')}
        testId="m-capture-done"
        onClick={() => router.push('/m')}
      />
    </div>
  );
}
