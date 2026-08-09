'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { completePunchItem, verifyPunchItem } from '@/lib/services/punch-client';
import { uploadFile } from '@/lib/services/files-client';
import type { PunchItem } from '@/lib/services/punch-client';
import {
  ErrorNotice,
  OfflineNotice,
  PrimaryButton,
  SecondaryButton,
  useOnline,
} from '../../../../write-ui';

// M6M §4.11.14 — M-34's two write actions.
//
// ===========================================================================
// ⚠️ THE ENFORCEMENT LADDER HERE IS THE WEAKEST IN THIS PASS. SAY IT PLAINLY.
// ===========================================================================
// The change-order writes in this same pass are DB-enforced:
// `change_orders_insert_authorized` / `_update_authorized` carry
// owner/admin/project_manager, so a foreman cannot author a CO no matter what
// the interface does. **Punch is the opposite case and the asymmetry is worth
// stating rather than leaving a reader to assume symmetry.**
//
//   COMPLETE — `punch_list_items_update_authenticated` has NO ROLE ARM, and
//     that is CORRECT: D-52 as corrected [S110] lets every role complete an
//     item, subcontractors included. Nothing is being left unenforced, because
//     nothing is meant to be refused. The only gate is the PHOTO gate, and
//     `completePunchItem` owns it (see below).
//
//   VERIFY — Foreman+ (5C §4, unreversed; D-52's crew grant corrected away).
//     **THIS ONE IS UI-AND-SERVICE-ONLY. RLS ACCEPTS A DIRECT UPDATE SETTING
//     `status='verified'` FROM ANY ROLE.** §4.11.10b: "the floor still lives in
//     `punch-client.ts:182-211` (TypeScript) ... A direct UPDATE setting
//     status='verified' is still accepted by RLS." Open item 7, pre-existing
//     and desktop-wide — RLS cannot express "only these columns, only by
//     not-the-completer" without a trigger.
//
// So for verify the ladder is: hidden control (cosmetic) → `verifyPunchItem`'s
// FOREMAN_PLUS check (the actual gate) → nothing. There is no database rung.
//
// **This is why every action below goes through the service function and never
// touches the table.** A-58 exists precisely for that: "The separate-eyes rule
// is service-layer only — RLS accepts the UPDATE — so a mobile path that calls
// the table directly instead of the function silently defeats it."
//
// ===========================================================================
// THE PHOTO GATE IS NOT DUPLICATED HERE
// ===========================================================================
// `completePunchItem` refuses when `requires_completion_photo` is set and no
// photo id is present, and returns a plain message. This component's job is to
// let the user SATISFY that gate — capture a photo through §6's existing
// `uploadFile` path and hand the resulting file id over — not to re-check it.
// A second copy of the rule is a second thing to keep in sync, and the service
// copy is the one that also protects desktop.
//
// The capture goes through `uploadFile`, never a raw bucket PUT — that is where
// HEIC→JPEG conversion lives (#94), and an iPhone photo uploaded around it is
// stored but never renders.

export function PunchActions({
  projectId,
  item,
  userRole,
  myMemberId,
}: {
  projectId: string;
  item: PunchItem;
  userRole: string;
  /** The viewer's `company_members` id — for the separate-eyes preview only. */
  myMemberId: string | null;
}) {
  const router = useRouter();
  const online = useOnline();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(item.completion_photo_file_id);
  const [uploading, setUploading] = useState(false);

  const isOpen = item.status === 'open' || item.status === 'in_progress';
  const isComplete = item.status === 'complete';

  // Foreman+ — mirrors `verifyPunchItem`'s own FOREMAN_PLUS. Duplicated here
  // ONLY to hide the control; the service function is what refuses. D-54's
  // shape, applied to a button instead of a route.
  const canVerify = ['owner', 'admin', 'project_manager', 'foreman'].includes(userRole);

  const needsPhoto = item.requires_completion_photo && !photoId;

  // The separate-eyes rule, surfaced BEFORE the tap rather than as an error
  // after it — §4.11.14's stated reason for showing who completed the item.
  const wouldBeSelfVerify =
    isComplete && item.completed_by !== null && item.completed_by === myMemberId;

  async function capture(file: File) {
    setUploading(true);
    setError(null);
    const up = await uploadFile(file, { project_id: projectId, category: 'photos' });
    setUploading(false);
    if (!up.success || !up.id) {
      setError(up.error ?? 'The photo could not be uploaded.');
      return;
    }
    setPhotoId(up.id);
  }

  async function complete() {
    if (!online) return;
    setBusy(true);
    setError(null);

    // The gate lives in the service function — this passes the photo it has and
    // lets `completePunchItem` decide.
    const result = await completePunchItem(item, photoId);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'The item could not be completed.');
      return;
    }
    router.refresh();
  }

  async function verify() {
    if (!online) return;
    setBusy(true);
    setError(null);

    // userRole is passed through to the service function, which re-checks it.
    // The hidden button is not the permission.
    const result = await verifyPunchItem(item, userRole);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'The item could not be verified.');
      return;
    }
    router.refresh();
  }

  return (
    <section data-testid="m-punch-actions" className="mt-[20px]">
      {!online ? <OfflineNotice what="Updating a punch item" testId="m-punch-offline" /> : null}

      {/* ── COMPLETE — every role, subcontractors included ── */}
      {isOpen ? (
        <>
          {item.requires_completion_photo ? (
            <div
              data-testid="m-punch-photo-gate"
              className="mb-[10px] rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] py-[12px]"
            >
              <p className="text-[14px] font-semibold text-m6m-navy">
                A completion photo is required
              </p>
              {photoId ? (
                <p
                  data-testid="m-punch-photo-attached"
                  className="mt-[4px] font-mono text-[11px] text-m6m-muted"
                >
                  photo attached
                </p>
              ) : (
                <label className="mt-[8px] flex min-h-[52px] cursor-pointer items-center justify-center rounded-[10px] border border-dashed border-m6m-border text-[14px] font-semibold text-m6m-blue">
                  {uploading ? 'Uploading…' : 'Take photo'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    data-testid="m-punch-photo-input"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void capture(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
          ) : null}

          <PrimaryButton
            label="Mark complete"
            busyLabel="Saving…"
            onClick={complete}
            // Disabled only for offline. The PHOTO gate is left to the service
            // function so its message is what the user sees — a disabled button
            // would explain nothing, and the notice above already says what is
            // needed.
            disabled={!online}
            busy={busy}
            testId="m-punch-complete"
          />
          {needsPhoto ? (
            <p className="mt-[8px] text-center text-[12px] text-m6m-muted">
              Attach the photo first.
            </p>
          ) : null}
        </>
      ) : null}

      {/* ── VERIFY — Foreman+ only, and UI/service-enforced only ── */}
      {isComplete && item.requires_verification ? (
        canVerify ? (
          <>
            <PrimaryButton
              label="Verify"
              busyLabel="Verifying…"
              onClick={verify}
              disabled={!online || wouldBeSelfVerify}
              busy={busy}
              testId="m-punch-verify"
            />
            {wouldBeSelfVerify ? (
              // Shown BEFORE the tap. verifyPunchItem would refuse this anyway
              // — the point is that the user learns why without having to fail.
              <p
                data-testid="m-punch-self-verify"
                className="mt-[8px] text-center text-[12px] text-m6m-muted"
              >
                You completed this item — someone else must verify it.
              </p>
            ) : null}
          </>
        ) : (
          <p
            data-testid="m-punch-verify-denied"
            className="rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] py-[12px] text-[14px] text-m6m-navy"
          >
            This item is waiting on a foreman or above to verify it.
          </p>
        )
      ) : null}

      {/* A verified item is terminal on this screen — delete is CUT
          (§4.11.14: Foreman+ and destructive, no field need stated). */}
      {item.status === 'verified' ? (
        <p
          data-testid="m-punch-done"
          className="rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] py-[12px] text-[14px] text-m6m-navy"
        >
          This item is verified and closed.
        </p>
      ) : null}

      {error ? <ErrorNotice message={error} testId="m-punch-action-error" /> : null}

      <SecondaryButton
        label="Back to punch list"
        testId="m-punch-back"
        onClick={() => router.push(`/m/p/${projectId}/punch`)}
      />
    </section>
  );
}
