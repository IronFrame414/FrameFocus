'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadFile } from '@/lib/services/files-client';
import { buildPhotoEntry } from '@/lib/offline/capture';
import { SetMobileHeader } from '../mobile-header';
import { useCaptureStore } from '../capture-store';
import type { HeldShot } from '@/lib/offline/held-shots';
import { useOfflineSync } from '../offline-sync';
import { ErrorNotice, OptionStack, PrimaryButton, SecondaryButton } from '../write-ui';

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

  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    async (shot: HeldShot, projectId: string) => {
      if (!capture) return;
      await capture.setStatus(shot.id, 'uploading', null);

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
              ? "Couldn't save to this device — storage full. Free up space and retry."
              : "Couldn't save this photo for later upload."
          );
          return true; // handled — do not fall through and clear it
        }
        await capture.setStatus(shot.id, 'queued', null);
        return true;
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (await queueForLater()) return;
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
        if (await queueForLater()) return;
        await capture.setStatus(shot.id, 'failed', uploaded.error ?? 'The photo could not be uploaded.');
        return;
      }
      // ⚠️ Removed ONLY here — after it is genuinely somewhere. A clear on a path
      // that did not persist the photo is the loss this screen exists to prevent.
      await capture.landed(shot.id);
    },
    // `uploadFile` is a module import, not reactive state — including it is a
    // lint warning, not a correctness one.
    [capture, offlineSync]
  );

  /** File the whole batch, SERIALLY. */
  const fileAll = useCallback(
    async (projectId: string) => {
      if (!capture) return;
      setBusy(true);
      setError(null);
      capture.pinProject(projectId);
      // Snapshot: `shots` mutates as each one lands.
      const todo = capture.batch.shots.filter((s) => s.status !== 'queued');
      for (const shot of todo) {
        await sendOne(shot, projectId);
      }
      setBusy(false);
    },
    [capture, sendOne]
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
        setError(r.reason ?? 'That photo could not be held.');
        break;
      }
    }
    autoFired.current = false;
  }

  if (!capture?.ready) {
    return (
      <div className="px-[18px] pb-[18px] pt-[14px]">
        <SetMobileHeader title="Capture" />
        <p className="text-[14px] text-m6m-muted">Loading your photos…</p>
      </div>
    );
  }

  const askProject = capture.needsProject && !busy;

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title={askProject ? 'Which project?' : 'Photos'} />

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

      {shots.length === 0 ? (
        <p
          data-testid="m-capture-empty"
          className="rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] py-[12px] text-[14px] text-m6m-navy"
        >
          {progress && progress.added > 0
            ? `${progress.added} photo${progress.added === 1 ? '' : 's'} saved.`
            : 'No photos to file. Tap the camera button to take some.'}
        </p>
      ) : (
        <div data-testid="m-capture-tray" className="flex flex-col gap-[8px]">
          {shots.map((s) => {
            const days = capture.expiresInDays(s);
            return (
              <div
                key={s.id}
                data-testid={`m-capture-shot-${s.status}`}
                className="flex items-center justify-between gap-[10px] rounded-[12px] border border-m6m-border bg-m6m-card px-[12px] py-[10px]"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-m6m-navy">{s.fileName}</p>
                  <p className="text-[12px] text-m6m-muted">
                    {s.status === 'held' && 'Waiting for a project'}
                    {s.status === 'uploading' && 'Uploading…'}
                    {s.status === 'queued' && 'Waiting to upload when you are back online'}
                    {s.status === 'failed' && (s.error ?? 'Failed')}
                  </p>
                  {/* ⚠️ The age warning must PRECEDE the sweep. */}
                  {days <= 2 && (
                    <p className="text-[12px] font-bold text-[#b45309]">
                      {days <= 0 ? 'Expires today' : `Expires in ${days} day${days === 1 ? '' : 's'}`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-[8px]">
                  {s.status === 'failed' && batch?.projectId && (
                    <button
                      type="button"
                      data-testid="m-capture-retry"
                      onClick={() => void sendOne(s, batch.projectId!)}
                      className="text-[13px] font-bold text-m6m-navy underline"
                    >
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="m-capture-discard-one"
                    onClick={() => void capture.discard(s.id)}
                    className="text-[13px] text-m6m-muted underline"
                  >
                    Discard
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error ? <ErrorNotice message={error} testId="m-capture-error" /> : null}

      {/* A-21 — the picker, ONCE, at the end of the batch. */}
      {askProject && (
        <div className="mt-[14px]">
          <p className="mb-[10px] text-[14px] text-m6m-muted">
            These photos are saved on this device until you choose a project. They stay here if you
            close the app.
          </p>
          {projects.length === 0 ? (
            <p
              data-testid="m-capture-no-projects"
              className="rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] py-[12px] text-[14px] text-m6m-navy"
            >
              No active projects to file these against.
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
            label={`Save ${shots.length} photo${shots.length === 1 ? '' : 's'}`}
            busyLabel="Saving…"
            onClick={() => chosen && void fileAll(chosen)}
            disabled={!chosen}
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
          label="Take another"
          testId="m-capture-again"
          onClick={() => cameraRef.current?.click()}
        />
        <SecondaryButton
          label="Add from library"
          testId="m-capture-library"
          onClick={() => libraryRef.current?.click()}
        />
      </div>

      <SecondaryButton label="Done" testId="m-capture-done" onClick={() => router.push('/m')} />
    </div>
  );
}
