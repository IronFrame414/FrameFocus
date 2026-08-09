'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadFile } from '@/lib/services/files-client';
import { buildPhotoEntry } from '@/lib/offline/capture';
import { SetMobileHeader } from '../mobile-header';
import { useCaptureStore } from '../capture-store';
import { useOfflineSync } from '../offline-sync';
import { ErrorNotice, OptionStack, PrimaryButton, SecondaryButton } from '../write-ui';

// M6M §6 — everything after the shutter.
//
// ===========================================================================
// THE SEQUENCE IS THE SPEC, AND IT IS NOT A UX PREFERENCE
// ===========================================================================
// §6: "With no project in context, the app asks which project AFTER the shot is
// taken, never before." The reason is §7a, not taste — a non-owner/admin cannot
// INSERT a `files` row without a `project_id`, so there is nothing valid to
// send until a project exists. **The shot is therefore held client-side until
// one is chosen (A-21c).** A build that uploaded first and patched the project
// afterwards would work for an owner and fail for every field user.
//
// Three paths, and only one of them is visible in the common case:
//
//   project in context + online   → files immediately, no prompt at all (A-21b).
//                                   §6: "the route may be passed through
//                                   without being seen".
//   no project in context         → the prompt, AFTER the shot (A-21).
//   offline                       → the queue, and the user is told in the SAME
//                                   confirmation, "not a separate alert" (§6).
//
// ===========================================================================
// OFFLINE STILL NEEDS A PROJECT FIRST
// ===========================================================================
// Queueing does not dodge §7a — it defers it. `buildPhotoEntry` requires a
// `projectId`, and the replay calls the same `uploadFile` the online path does
// (A-20d), so a project-less entry would fail on every retry forever. So the
// prompt comes first offline too; only the SUBMIT differs.

export type CaptureProjectChoice = { id: string; name: string; projectNumber: string | null };

type Outcome = { projectId: string; queued: boolean };

export function CaptureScreen({ projects }: { projects: CaptureProjectChoice[] }) {
  const router = useRouter();
  const capture = useCaptureStore();
  const offlineSync = useOfflineSync();

  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const pending = capture?.pending ?? null;

  // The auto-submit must fire exactly once even though React may run effects
  // twice in development.
  const autoFired = useRef(false);

  const submit = useCallback(
    async (projectId: string) => {
      if (!pending) return;
      setBusy(true);
      setError(null);

      // OFFLINE — the queue (§5.2). Note this is the same `buildPhotoEntry`
      // the daily log uses, so the replay goes through `uploadFile` and a HEIC
      // capture still lands as JPEG (A-20d).
      if (!navigator.onLine && offlineSync) {
        await offlineSync.enqueue(
          buildPhotoEntry({
            entryId: crypto.randomUUID(),
            fileId: crypto.randomUUID(),
            projectId,
            blob: pending.file,
            fileName: pending.file.name || 'photo.jpg',
            captured_at: pending.takenAt,
          })
        );
        capture?.clear();
        setBusy(false);
        setOutcome({ projectId, queued: true });
        return;
      }

      // ONLINE — straight through `uploadFile`, which owns the HEIC→JPEG
      // conversion (#94) and writes `category: 'photos'` into the
      // `project-files` bucket (A-20c).
      const uploaded = await uploadFile(pending.file, {
        project_id: projectId,
        category: 'photos',
      });

      if (!uploaded.success) {
        setBusy(false);
        setError(uploaded.error ?? 'The photo could not be uploaded.');
        return;
      }

      capture?.clear();
      setBusy(false);
      setOutcome({ projectId, queued: false });
    },
    [pending, offlineSync, capture]
  );

  // A-21b — a project already in context files with NO PROMPT. The screen is
  // still mounted (the file has to be submitted from somewhere), but nothing is
  // asked; §6 calls this passing through without being seen.
  useEffect(() => {
    if (autoFired.current || !pending || outcome || busy) return;
    if (!pending.projectId) return;
    autoFired.current = true;
    void submit(pending.projectId);
  }, [pending, outcome, busy, submit]);

  // ── Nothing held: someone reached /m/capture directly. ──────────────────
  if (!pending && !outcome) {
    return (
      <div className="px-[18px] pb-[18px] pt-[14px]">
        <SetMobileHeader title="Capture" />
        <p
          data-testid="m-capture-empty"
          className="rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] py-[12px] text-[14px] text-m6m-navy"
        >
          No photo to file. Tap the camera button to take one.
        </p>
        <SecondaryButton label="Back" testId="m-capture-back" onClick={() => router.back()} />
      </div>
    );
  }

  // ── Done. ONE confirmation, and the offline case is a line INSIDE it. ────
  if (outcome) {
    const project = projects.find((p) => p.id === outcome.projectId);
    return (
      <div className="px-[18px] pb-[18px] pt-[14px]">
        <SetMobileHeader title="Photo saved" />
        <div
          data-testid="m-capture-confirmation"
          className="rounded-[15px] border border-m6m-border bg-m6m-card px-[14px] py-[14px]"
        >
          <p className="text-[17px] font-bold text-m6m-navy">
            {outcome.queued ? 'Photo saved to this device' : 'Photo added'}
          </p>
          {project ? (
            <p className="mt-[4px] font-mono text-[11px] text-m6m-muted">
              {[project.projectNumber, project.name].filter(Boolean).join(' · ')}
            </p>
          ) : null}

          {/* §6 — "the user is told it will upload later — in the same
              confirmation, not a separate alert." One block, one read. */}
          {outcome.queued ? (
            <p data-testid="m-capture-queued" className="mt-[8px] text-[14px] text-m6m-navy">
              It will upload automatically when you are back online.
            </p>
          ) : null}
        </div>

        <PrimaryButton
          label="Take another"
          busyLabel=""
          onClick={() => {
            setOutcome(null);
            autoFired.current = false;
          }}
          disabled={false}
          busy={false}
          testId="m-capture-again"
        />
        <SecondaryButton label="Done" testId="m-capture-done" onClick={() => router.push('/m')} />
      </div>
    );
  }

  // ── A-21: the prompt, and it exists ONLY because there was no context. ───
  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="Which project?" />

      <p className="mb-[10px] text-[14px] text-m6m-muted">
        The photo is saved on this device until you choose.
      </p>

      {projects.length === 0 ? (
        <p
          data-testid="m-capture-no-projects"
          className="rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] py-[12px] text-[14px] text-m6m-navy"
        >
          No active projects to file this against.
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

      {error ? <ErrorNotice message={error} testId="m-capture-error" /> : null}

      <PrimaryButton
        label="Save photo"
        busyLabel="Saving…"
        onClick={() => chosen && void submit(chosen)}
        disabled={!chosen}
        busy={busy}
        testId="m-capture-save"
      />
      <SecondaryButton
        label="Discard"
        testId="m-capture-discard"
        onClick={() => {
          capture?.clear();
          router.back();
        }}
      />
    </div>
  );
}
