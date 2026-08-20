'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  deleteChangeOrder,
  reissueChangeOrder,
  sendChangeOrder,
  voidChangeOrder,
} from '@/lib/services/change-orders-client';
import type { ChangeOrderStatus } from '@/lib/services/change-orders-client';
import {
  ErrorNotice,
  OfflineNotice,
  OptionStack,
  PrimaryButton,
  SecondaryButton,
  TextAreaField,
  TextField,
  useOnline,
} from '../../../../write-ui';

// M6M §4.11.11 — M-31's write controls: Edit, Send for signature, Void.
//
// ===========================================================================
// THERE IS NO SECOND AUTHORISATION PATH HERE. THIS IS DELIBERATE.
// ===========================================================================
// Both `sendChangeOrder` and `voidChangeOrder` POST to API routes that read
// `profiles.role` themselves and return **403** for anyone outside
// owner/admin/project_manager:
//
//     app/api/change-orders/[id]/send/route.ts:51
//     app/api/change-orders/[id]/void/route.ts:31
//
// and the underlying UPDATE is DB-floored by `change_orders_update_authorized`
// on top of that. So this component performs NO role check of its own. It is
// only ever rendered for D-51's three roles because M-31 hides it from the
// others — and that hiding is cosmetic, exactly as D-54 intends.
//
// A UI role check here would be a third opinion about the same question, and
// the failure mode of three opinions is that one of them drifts.
//
// ===========================================================================
// ⚠️ SENDING REQUIRES A CONTRACTOR SIGNATURE ON THE FIRST SEND
// ===========================================================================
// Not a mobile invention — the send route enforces it (`:110`), returning
// **400** with "A contractor signature (mode + printed name) is required to
// send this change order." when the CO has no `contractor_signed_at` yet.
// Signed-artifact spec §4.2: sending IS the internal contractor-side
// acceptance (D-4), so the contractor signs at send from an authenticated
// session.
//
// Two modes, and the difference matters on a phone:
//   typed_name   always works — the printed name IS the signature.
//   saved_image  uses the company's stored signature image, and the route
//                returns **422** if none is on file. Offered rather than
//                hidden, because a company that has one should not have to
//                type instead; the route's own message names the fix.
//
// On RE-SEND the existing signature is reused verbatim and these fields are
// omitted — which is why the block only renders when `needsSignature`.
//
// ===========================================================================
// THE RECIPIENT IS OPTIONAL, AND THE FALLBACK IS THE ROUTE'S JOB
// ===========================================================================
// Left blank, the route resolves the project's primary contact, and answers
// 400 if there is none. This screen does NOT pre-resolve that contact to show
// it: doing so would need a second read of `contacts` on a surface D-53 gates,
// and would go stale between render and tap.

const SIGNATURE_MODES = [
  { value: 'typed_name' as const, label: 'Type my name', sub: 'the printed name is the signature' },
  { value: 'saved_image' as const, label: 'Use saved signature', sub: 'from company settings' },
];

export function CoActions({
  projectId,
  coId,
  status,
  needsSignature,
  signedAt,
  voidReason,
  supersededById,
  canDelete,
}: {
  projectId: string;
  coId: string;
  status: ChangeOrderStatus;
  /** True when the CO carries no `contractor_signed_at` — i.e. a first send. */
  needsSignature: boolean;
  /** [S168] `change_orders.signed_at`. The DELETE predicate is the SAME
   *  expression the desktop builder uses, passed rather than re-derived —
   *  CLAUDE.md PARITY: the second implementation is always the divergence. */
  signedAt: string | null;
  /** [S168] Read back on a voided CO. A reason nobody can see is not a record. */
  voidReason: string | null;
  /** [S168] The CO that REPLACED this one, if any. ⚠️ Not this row's own
   *  `supersedes_change_order_id`, which points the other way — see
   *  `getCoSupersession()`. */
  supersededById: string | null;
  /** [S168] Owner/Admin. Narrower than the write gate on purpose. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const online = useOnline();

  const [mode, setMode] = useState<'send' | 'void' | null>(null);
  const [voidReasonInput, setVoidReasonInput] = useState('');
  const [sigMode, setSigMode] = useState<'typed_name' | 'saved_image'>('typed_name');
  const [sigName, setSigName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingUrl, setSigningUrl] = useState<string | null>(null);

  // The route accepts draft OR sent (re-send mints a fresh token). Mirrors the
  // route's own 409, so the control is absent rather than present-and-failing.
  const sendable = status === 'draft' || status === 'sent';
  // [S168] A SIGNED CO IS NOW VOIDABLE. Josh ruled void applies to any sent CO,
  // signed or unsigned, with a reason in every case — and the signed copy is
  // retained (`signed-artifact-spec.md`). Only `voided` is terminal, because
  // `enforce_change_order_immutability()` freezes it forever.
  const voidable = status !== 'voided';
  const editable = status === 'draft';
  // [S168] The reissue path the immutability trigger has always advertised.
  const reissuable = status === 'voided' && supersededById === null;
  // [S168] Same predicate as the desktop builder, character for character.
  const deletable = canDelete && signedAt === null && status !== 'signed';

  // A signed or voided CO is terminal: there is no Edit, no Send, no Void.
  //
  // ⚠️ SAY SO, RATHER THAN RENDERING AN EMPTY BOX. Caught by the Part C suite
  // [S117]: without this the component emitted a literal
  // `<section data-testid="m-co-actions"></section>` — dead markup that reads
  // to a user as "the buttons failed to load" and to a test as `hidden`. An
  // author who reaches a signed CO looking for Edit deserves the reason, which
  // is D-51's: revising means voiding and writing a new one, and neither is
  // available once the client has signed.
  const hasAnyAction = editable || sendable || voidable || reissuable || deletable;

  const signatureReady = !needsSignature || sigName.trim().length > 0;

  async function send() {
    if (!online || !signatureReady) return;
    setBusy(true);
    setError(null);

    const result = await sendChangeOrder(coId, {
      recipient_email: recipientEmail.trim() || undefined,
      ...(needsSignature
        ? { contractor_signature_mode: sigMode, contractor_signature_name: sigName.trim() }
        : {}),
    });

    setBusy(false);
    if (!result.success) {
      // The route's message verbatim — it distinguishes "no recipient email",
      // "no saved signature image" and a role refusal, and this component
      // cannot tell them apart well enough to improve on it.
      setError(result.error ?? 'The change order could not be sent.');
      return;
    }

    // The signing link is shown rather than auto-opened: client delivery is
    // Decision-Gate-gated, and the contractor shares it manually.
    setSigningUrl(result.signingUrl ?? null);
    setMode(null);
    router.refresh();
  }

  async function doVoid() {
    if (!online) return;
    if (!voidReasonInput.trim()) {
      setError('A reason is required to void a change order.');
      return;
    }
    setBusy(true);
    setError(null);

    const result = await voidChangeOrder(coId, voidReasonInput);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'The change order could not be voided.');
      return;
    }
    setMode(null);
    setVoidReasonInput('');
    router.refresh();
  }

  async function doReissue() {
    if (!online) return;
    setBusy(true);
    setError(null);

    const result = await reissueChangeOrder(coId);
    setBusy(false);
    if (!result.success || !result.id) {
      setError(result.error ?? 'The change order could not be reissued.');
      return;
    }
    router.push(`/m/p/${projectId}/changes/${result.id}`);
  }

  async function doDelete() {
    if (!online) return;
    setBusy(true);
    setError(null);

    const result = await deleteChangeOrder(coId);
    if (!result.success) {
      setBusy(false);
      setError(result.error ?? 'The change order could not be deleted.');
      return;
    }
    router.push(`/m/p/${projectId}/changes`);
  }

  return (
    <section data-testid="m-co-actions" className="mt-[20px]">
      {!hasAnyAction ? (
        <p
          data-testid="m-co-terminal"
          role="status"
          className="rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] py-[12px] text-[14px] text-m6m-navy"
        >
          {/* [S168] A signed CO is no longer terminal — it can be voided. The
              only state that reaches this sentence now is a voided CO that has
              already been reissued and that this role cannot delete. */}
          This change order is voided and has already been reissued.
        </p>
      ) : null}

      {!online ? <OfflineNotice what="Sending a change order" testId="m-co-offline" /> : null}

      {signingUrl ? (
        <p
          data-testid="m-co-signing-url"
          role="status"
          className="mb-[12px] break-all rounded-[10px] border border-m6m-border bg-m6m-card px-[12px] py-[10px] font-mono text-[12px] text-m6m-navy"
        >
          {signingUrl}
        </p>
      ) : null}

      {editable ? (
        <Link
          href={`/m/p/${projectId}/changes/new?co=${coId}`}
          data-testid="m-co-edit"
          className="flex h-[52px] w-full items-center justify-center rounded-[14px] border border-m6m-border bg-m6m-card text-[15px] font-semibold text-m6m-navy"
        >
          Edit
        </Link>
      ) : null}

      {/* ── SEND ── */}
      {sendable && mode !== 'void' ? (
        mode === 'send' ? (
          <div className="mt-[12px] rounded-[14px] border border-m6m-border bg-m6m-card p-[14px]">
            <p className="text-[15px] font-bold text-m6m-navy">
              {status === 'sent' ? 'Send again' : 'Send for signature'}
            </p>

            {needsSignature ? (
              <>
                <p className="mt-[6px] text-[13px] text-m6m-muted">
                  Sending is your acceptance of this change order.
                </p>
                <div className="mt-[12px]">
                  <OptionStack
                    options={SIGNATURE_MODES}
                    value={sigMode}
                    onChange={setSigMode}
                    testIdPrefix="m-co-sig-mode"
                  />
                </div>
                <TextField
                  label="Printed name"
                  value={sigName}
                  onChange={setSigName}
                  testId="m-co-sig-name"
                  required
                />
              </>
            ) : (
              <p className="mt-[6px] text-[13px] text-m6m-muted">
                Your signature from the first send is reused.
              </p>
            )}

            <TextField
              label="Recipient email (optional)"
              value={recipientEmail}
              onChange={setRecipientEmail}
              testId="m-co-recipient-email"
              placeholder="Defaults to the project contact"
            />

            <PrimaryButton
              label="Send"
              busyLabel="Sending…"
              onClick={send}
              disabled={!online || !signatureReady}
              busy={busy}
              testId="m-co-send-confirm"
            />
            <SecondaryButton
              label="Cancel"
              testId="m-co-send-cancel"
              disabled={busy}
              onClick={() => {
                setMode(null);
                setError(null);
              }}
            />
          </div>
        ) : (
          <PrimaryButton
            label={status === 'sent' ? 'Send again' : 'Send for signature'}
            busyLabel=""
            onClick={() => {
              setMode('send');
              setError(null);
            }}
            disabled={!online}
            busy={false}
            testId="m-co-send"
          />
        )
      ) : null}

      {/* ── VOID — a second tap, never one. Voiding is how a sent CO is
             revised (D-51), so it is reachable, but it is not adjacent to
             Send by accident. ── */}
      {voidable && mode !== 'send' ? (
        mode === 'void' ? (
          <div className="mt-[12px] rounded-[14px] border border-m6m-danger-border bg-[#fdf1f0] p-[14px]">
            <p className="text-[15px] font-bold text-m6m-danger">Void this change order?</p>
            <p className="mt-[4px] text-[13px] text-m6m-navy">
              {status === 'signed'
                ? 'This change order is signed. Voiding withdraws it — the signed copy stays on file.'
                : 'Voiding withdraws this change order. You can reissue it as a new draft afterwards.'}
            </p>
            {/* [S168] REQUIRED, and required identically on both surfaces —
                Josh ruled against a signed/unsigned split: "user should give
                reason for void." The reason is permanent once written. */}
            <TextAreaField
              label="Reason (required)"
              value={voidReasonInput}
              onChange={setVoidReasonInput}
              testId="m-co-void-reason"
              rows={2}
            />
            <PrimaryButton
              label="Void"
              busyLabel="Voiding…"
              onClick={doVoid}
              disabled={!online || !voidReasonInput.trim()}
              busy={busy}
              testId="m-co-void-confirm"
              tone="danger"
            />
            <SecondaryButton
              label="Cancel"
              testId="m-co-void-cancel"
              disabled={busy}
              onClick={() => {
                setMode(null);
                setError(null);
              }}
            />
          </div>
        ) : (
          <SecondaryButton
            label="Void"
            testId="m-co-void"
            disabled={!online}
            onClick={() => {
              setMode('void');
              setError(null);
            }}
          />
        )
      ) : null}

      {/* ── [S168] REISSUE — the path `enforce_change_order_immutability()`
             has advertised since 2026-08-09 ("void and reissue instead") and
             that did not exist until now. ── */}
      {reissuable && mode === null ? (
        <div className="mt-[12px]">
          <PrimaryButton
            label="Reissue as a new draft"
            busyLabel="Reissuing…"
            onClick={doReissue}
            disabled={!online}
            busy={busy}
            testId="m-co-reissue"
          />
        </div>
      ) : null}

      {/* The void record, read back. */}
      {status === 'voided' && voidReason ? (
        <p
          data-testid="m-co-void-reason-shown"
          className="mt-[12px] rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] py-[12px] text-[13px] text-m6m-navy"
        >
          <span className="font-bold">Voided.</span> {voidReason}
        </p>
      ) : null}

      {/* ── [S168] DELETE — UNSIGNED ONLY, Owner/Admin only. The database is
             the boundary (`enforce_change_order_delete_boundary` has no
             service-role escape); this control merely stays out of the way. ── */}
      {deletable && mode === null ? (
        <div className="mt-[12px]">
          <SecondaryButton
            label="Delete permanently"
            testId="m-co-delete"
            disabled={!online || busy}
            onClick={doDelete}
          />
          <p className="mt-[6px] text-[12px] text-m6m-muted">
            Deleting leaves no record. To keep one, void it instead.
          </p>
        </div>
      ) : null}

      {error ? <ErrorNotice message={error} testId="m-co-action-error" /> : null}
    </section>
  );
}
