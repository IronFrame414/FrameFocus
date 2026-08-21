'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { RedactedCoDetail } from '@/lib/co-redaction';
import {
  CO_STATUS_LABELS,
  createCoLineItem,
  createCoLineRow,
  deleteCoLineItem,
  deleteCoLineRow,
  recalculateChangeOrderTotals,
  sendChangeOrder,
  updateChangeOrder,
  deleteChangeOrder,
  reissueChangeOrder,
  updateCoLineRow,
  voidChangeOrder,
  type ChangeOrderLineRow,
  type ChangeOrderStatus,
  type ChangeOrderWithChildren,
  type CoRowType,
  type UpdateCoLineRowInput,
} from '@/lib/services/change-orders-client';
import { CoRateSection } from './co-rate-section';

// 5D — estimate-style CO builder (D-1). Typed rows carry SIGNED values:
// enter a negative rate / unit cost / amount for a credit and put the
// "credit" meaning in the row name (D-2). §4.4a tax-then-markup applies
// to credits unchanged (D-3) — a −$8,000 cost surfaces as −$10,272 at
// 7% tax + 20% markup. Editing is Draft-only; revising after send means
// void + write a new CO (F-1/F-4).

const STATUS_COLORS: Record<ChangeOrderStatus, { bg: string; fg: string }> = {
  draft: { bg: '#f3f4f6', fg: '#374151' },
  sent: { bg: '#fef3c7', fg: '#92400e' },
  signed: { bg: '#dcfce7', fg: '#166534' },
  voided: { bg: '#fee2e2', fg: '#991b1b' },
};

const ROW_TYPE_LABELS: Record<CoRowType, string> = {
  labor: 'Labor',
  material: 'Material',
  subcontractor: 'Subcontractor',
  other: 'Other',
};

const UNIT_OF_MEASURE_OPTIONS = [
  'each',
  'sq_ft',
  'linear_ft',
  'box',
  'bundle',
  'bag',
  'gallon',
  'pair',
  'set',
  'allowance',
  'other',
] as const;

/**
 * A figure the caller may not be permitted to see renders as an em-dash.
 *
 * ⚠️ THE CO TOTAL WAS UNGATED ON THIS SCREEN. `canSeeRates` covers the line-level
 * rates and never covered `net_delta`, so the CO total was DRAWN — not merely
 * shipped — to every role that could reach the page, foreman and crew included.
 * Redaction nulls it, and null renders as '—' rather than crashing `money()` or
 * printing "$0.00", which would be a different lie. [S121]
 */
function moneyOrDash(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : money(value);
}

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function parseNum(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const inputStyle: React.CSSProperties = {
  padding: '0.375rem 0.5rem',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  fontSize: '0.8125rem',
  boxSizing: 'border-box',
};

const smallLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.6875rem',
  fontWeight: 600,
  color: '#6b7280',
  marginBottom: '0.125rem',
};

const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '0.5rem 1rem',
  fontSize: '0.875rem',
  fontWeight: 600,
  color: '#fff',
  backgroundColor: disabled ? '#9ca3af' : '#1a56db',
  border: 'none',
  borderRadius: '0.375rem',
  cursor: disabled ? 'not-allowed' : 'pointer',
});

const subtleButtonStyle: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  fontSize: '0.8125rem',
  backgroundColor: '#f3f4f6',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  cursor: 'pointer',
};

const dangerButtonStyle: React.CSSProperties = {
  padding: '0.25rem 0.625rem',
  fontSize: '0.75rem',
  color: '#991b1b',
  backgroundColor: '#fff',
  border: '1px solid #fecaca',
  borderRadius: '0.375rem',
  cursor: 'pointer',
};

// Signature mode toggle pill (matches the add-row type pills).
const sigPillStyle = (active: boolean, disabled: boolean): React.CSSProperties => ({
  padding: '0.25rem 0.75rem',
  fontSize: '0.75rem',
  fontWeight: 600,
  borderRadius: '9999px',
  border: `1px solid ${active ? '#1a56db' : '#d1d5db'}`,
  backgroundColor: disabled ? '#f3f4f6' : active ? '#1a56db' : '#fff',
  color: disabled ? '#9ca3af' : active ? '#fff' : '#374151',
  cursor: disabled ? 'not-allowed' : 'pointer',
});

interface CoBuilderProps {
  projectId: string;
  /** Money nullable — redacted at the page boundary (lib/co-redaction.ts). */
  changeOrder: RedactedCoDetail;
  subcontractors: Array<{ id: string; name: string }>;
  canManage: boolean;
  /** Owner/Admin only. RULING A [S97]: a PM sees NO rate values anywhere, so
   *  the rate section is not mounted at all below Owner/Admin — it is not
   *  rendered read-only and not rendered empty. §7.3 S-5 amended. */
  canSeeRates: boolean;
  /** projects.source_estimate_id — the CO rate section prefills first rates
   *  from the source estimate's rates in force (S97 ruling). Null for a
   *  no-estimate project: no prefill. */
  sourceEstimateId: string | null;
  pendingSigningToken: string | null;
  companyName: string;
  hasSavedSignature: boolean;
  /** Owner/Admin only [S168]. DELETE is narrower than void on purpose — it is
   *  destructive and unrecoverable, so it does not inherit `canManage`'s PM. */
  canDelete: boolean;
  /** [S168] The CO this one REPLACES, and the CO that replaced IT. Two
   *  directions, resolved server-side by `getCoSupersession()` — the row's own
   *  `supersedes_change_order_id` only answers the first question, and reading
   *  it for the second is the trap that function's docstring names. */
  supersedes: { id: string; co_number: string } | null;
  supersededBy: { id: string; co_number: string } | null;
}

export function CoBuilder({
  projectId,
  changeOrder: co,
  subcontractors,
  canManage,
  canSeeRates,
  sourceEstimateId,
  pendingSigningToken,
  companyName,
  hasSavedSignature,
  canDelete,
  supersedes,
  supersededBy,
}: CoBuilderProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  // [S168] The void REASON is required in every case, so voiding is a panel and
  // no longer a window.confirm(). Josh ruled against a signed/unsigned split:
  // "user should give reason for void."
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [signingUrl, setSigningUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Contractor signature (signed-artifact spec §4.2). Required only on the FIRST
  // send — once contractor_signed_at is set the route reuses it verbatim, so the
  // signature step is hidden on re-send. Default to the saved image when one is
  // on file, else typed name; printed name prefilled with the company name.
  // (contractor_signed_at is a new column — cast until database.ts regenerates.)
  const contractorSignedAt =
    (co as { contractor_signed_at?: string | null }).contractor_signed_at ?? null;
  const needsSignature = contractorSignedAt == null;
  const [sigMode, setSigMode] = useState<'saved_image' | 'typed_name'>(
    hasSavedSignature ? 'saved_image' : 'typed_name'
  );
  const [sigName, setSigName] = useState(companyName);

  // window.origin is client-only — resolve the pending link after mount.
  useEffect(() => {
    if (pendingSigningToken) {
      setSigningUrl(`${window.location.origin}/sign-co/${pendingSigningToken}`);
    }
  }, [pendingSigningToken]);

  const editable = canManage && co.status === 'draft';
  const colors = STATUS_COLORS[co.status];

  async function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    if (!result.success) {
      setError(result.error ?? 'Something went wrong');
      setBusy(false);
      return false;
    }
    const recalc = await recalculateChangeOrderTotals(co.id);
    setBusy(false);
    if (!recalc.success) {
      setError(recalc.error ?? 'Totals recompute failed');
      return false;
    }
    router.refresh();
    return true;
  }

  async function handleSend() {
    setError(null);

    const payload: Parameters<typeof sendChangeOrder>[1] = {
      recipient_name: recipientName.trim() || undefined,
      recipient_email: recipientEmail.trim() || undefined,
    };

    // First send: the route requires a contractor signature (mode + printed
    // name). Guard client-side so the failure is legible before the round-trip.
    if (needsSignature) {
      const name = sigName.trim();
      if (!name) {
        setError('Enter the printed name for the contractor signature.');
        return;
      }
      if (sigMode === 'saved_image' && !hasSavedSignature) {
        setError('No saved signature image on file. Add one in Company Settings, or type your name.');
        return;
      }
      payload.contractor_signature_mode = sigMode;
      payload.contractor_signature_name = name;
    }

    setBusy(true);
    const result = await sendChangeOrder(co.id, payload);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Send failed');
      return;
    }
    setSigningUrl(result.signingUrl ?? null);
    setSendOpen(false);
    router.refresh();
  }

  async function handleVoid() {
    if (!voidReason.trim()) {
      setError('A reason is required to void a change order.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await voidChangeOrder(co.id, voidReason);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Void failed');
      return;
    }
    setSigningUrl(null);
    setVoidOpen(false);
    setVoidReason('');
    router.refresh();
  }

  // [S168] `enforce_change_order_immutability()` has said "void and reissue
  // instead" since 2026-08-09 and there was no reissue — the user had to retype
  // the document. This is that path: a fresh draft carrying the lines forward.
  async function handleReissue() {
    setBusy(true);
    setError(null);
    const result = await reissueChangeOrder(co.id);
    setBusy(false);
    if (!result.success || !result.id) {
      setError(result.error ?? 'Reissue failed');
      return;
    }
    router.push(`/dashboard/projects/${projectId}/changes/${result.id}`);
  }

  // [S168] UNSIGNED only, and the database says so — this button not being
  // rendered is a courtesy, not the boundary.
  async function handleDelete() {
    if (
      !window.confirm(
        `Delete ${co.co_number} permanently? This cannot be undone. ` +
          'To keep a record of the withdrawal, void it instead.'
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await deleteChangeOrder(co.id);
    if (!result.success) {
      setBusy(false);
      setError(result.error ?? 'Delete failed');
      return;
    }
    router.push(`/dashboard/projects/${projectId}/changes`);
  }

  async function copyLink() {
    if (!signingUrl) return;
    try {
      await navigator.clipboard.writeText(signingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy — select the link text and copy it manually.');
    }
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <Link
          href={`/dashboard/projects/${projectId}/changes`}
          style={{ fontSize: '0.8125rem', color: '#1a56db', textDecoration: 'none' }}
        >
          ← All change orders
        </Link>
      </div>

      {/* Header card */}
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          padding: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: '1 1 320px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <h2 style={{ fontSize: '1.125rem', margin: 0 }}>{co.co_number}</h2>
              <span
                style={{
                  display: 'inline-block',
                  padding: '0.125rem 0.5rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: colors.bg,
                  color: colors.fg,
                }}
              >
                {CO_STATUS_LABELS[co.status]}
              </span>
            </div>
            {editable ? (
              <HeaderDetails co={co} onSave={(input) => run(() => updateChangeOrder(co.id, input))} />
            ) : (
              <div style={{ marginTop: '0.5rem' }}>
                <p style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.25rem' }}>
                  {co.title}
                </p>
                {co.description && (
                  <p style={{ fontSize: '0.875rem', color: '#374151', margin: '0 0 0.25rem' }}>
                    {co.description}
                  </p>
                )}
                <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: 0 }}>
                  {co.schedule_impact_days != null &&
                    `Schedule impact: ${co.schedule_impact_days} day${co.schedule_impact_days === 1 ? '' : 's'} · `}
                  {co.sent_at && `Sent ${new Date(co.sent_at).toLocaleDateString()} · `}
                  {co.signed_at && `Signed ${new Date(co.signed_at).toLocaleDateString()}`}
                </p>
              </div>
            )}
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase' }}>
              Net delta
            </div>
            <div
              style={{
                fontSize: '1.375rem',
                fontWeight: 700,
                color: (co.net_delta ?? 0) < 0 ? '#166534' : '#111827',
              }}
            >
              {moneyOrDash(co.net_delta)}
            </div>
            {canManage && (
              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginTop: '0.5rem',
                  justifyContent: 'flex-end',
                }}
              >
                {co.status === 'draft' && (
                  <button
                    type="button"
                    onClick={() => setSendOpen((v) => !v)}
                    disabled={busy || co.line_items.length === 0}
                    style={primaryButtonStyle(busy || co.line_items.length === 0)}
                  >
                    Send for Signature
                  </button>
                )}
                {/* [S168] Void is now available on a SIGNED CO too. The
                    signed copy is retained — signed-artifact-spec.md: a
                    document the client actually saw is never destroyed. */}
                {co.status !== 'voided' && (
                  <button
                    type="button"
                    onClick={() => setVoidOpen((v) => !v)}
                    disabled={busy}
                    style={subtleButtonStyle}
                  >
                    Void
                  </button>
                )}
                {co.status === 'voided' && supersededBy === null && (
                  <button
                    type="button"
                    onClick={handleReissue}
                    disabled={busy}
                    style={primaryButtonStyle(busy)}
                  >
                    Reissue as a new draft
                  </button>
                )}
                {canDelete && co.signed_at === null && co.status !== 'signed' && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={busy}
                    style={{ ...subtleButtonStyle, color: '#991b1b', borderColor: '#fecaca' }}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* §7.1 S-5 — non-fixed COs carry their own instrument rate(s); a
            rateless CO cannot price (the recompute refuses 0% margin). */}
        {canSeeRates && (co.co_type === 'cost_plus' || co.co_type === 'time_and_materials') && (
          <CoRateSection
            changeOrderId={co.id}
            coType={co.co_type}
            isDraft={co.status === 'draft'}
            sourceEstimateId={sourceEstimateId}
          />
        )}

        {/* ── [S168] THE VOID REASON. Required in every case, signed or not. ──
            Josh ruled against the split: "user should give reason for void."
            A textarea rather than a confirm(), because a reason is a record —
            it is frozen the moment it is written (`enforce_change_order_
            immutability`) and read back below for the life of the document. */}
        {voidOpen && co.status !== 'voided' && (
          <div
            style={{
              marginTop: '0.75rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid #e5e7eb',
            }}
          >
            <label style={smallLabelStyle} htmlFor="co-void-reason">
              Why is {co.co_number} being voided? (required)
            </label>
            <textarea
              id="co-void-reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              rows={2}
              placeholder="e.g. Sent to the wrong client — replaced by a corrected change order."
              style={{
                width: '100%',
                maxWidth: '520px',
                display: 'block',
                marginTop: '0.25rem',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
              }}
            />
            <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.375rem 0 0' }}>
              {co.status === 'signed'
                ? 'This change order is signed. Voiding withdraws it — the signed copy stays on file.'
                : 'Voiding withdraws this change order. You can reissue it as a new draft afterwards.'}
              {' The reason is permanent and cannot be edited later.'}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={handleVoid}
                disabled={busy || !voidReason.trim()}
                style={primaryButtonStyle(busy || !voidReason.trim())}
              >
                Void {co.co_number}
              </button>
              <button
                type="button"
                onClick={() => {
                  setVoidOpen(false);
                  setVoidReason('');
                }}
                disabled={busy}
                style={subtleButtonStyle}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* The supersession pair, both directions, wherever it exists. */}
        {(supersedes || supersededBy) && (
          <div
            style={{
              marginTop: '0.75rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid #e5e7eb',
              fontSize: '0.8125rem',
            }}
          >
            {supersedes && (
              <div>
                Replaces{' '}
                <Link
                  href={`/dashboard/projects/${projectId}/changes/${supersedes.id}`}
                  style={{ color: '#1a56db', textDecoration: 'none' }}
                >
                  {supersedes.co_number}
                </Link>
              </div>
            )}
            {supersededBy && (
              <div>
                Replaced by{' '}
                <Link
                  href={`/dashboard/projects/${projectId}/changes/${supersededBy.id}`}
                  style={{ color: '#1a56db', textDecoration: 'none' }}
                >
                  {supersededBy.co_number}
                </Link>
              </div>
            )}
          </div>
        )}

        {/* The void record, read back. A reason nobody can see afterwards is
            not a record of anything. */}
        {co.status === 'voided' && co.void_reason && (
          <div
            style={{
              marginTop: '0.75rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid #e5e7eb',
            }}
          >
            <div style={smallLabelStyle}>Voided</div>
            <p style={{ fontSize: '0.875rem', color: '#374151', margin: '0.25rem 0 0' }}>
              {co.void_reason}
            </p>
          </div>
        )}

        {sendOpen && co.status === 'draft' && (
          <div
            style={{
              marginTop: '0.75rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              gap: '0.75rem',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
            }}
          >
            <div>
              <label style={smallLabelStyle}>Client name (optional)</label>
              <input
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                style={{ ...inputStyle, width: '200px' }}
              />
            </div>
            <div>
              <label style={smallLabelStyle}>Client email (optional)</label>
              <input
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="Leave blank to use the project's primary contact"
                style={{ ...inputStyle, width: '260px' }}
              />
            </div>

            {needsSignature ? (
              <div
                style={{
                  flexBasis: '100%',
                  borderTop: '1px dashed #e5e7eb',
                  paddingTop: '0.625rem',
                }}
              >
                <label style={smallLabelStyle}>Contractor signature</label>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.375rem',
                    marginBottom: '0.5rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => hasSavedSignature && setSigMode('saved_image')}
                    disabled={!hasSavedSignature}
                    style={sigPillStyle(sigMode === 'saved_image', !hasSavedSignature)}
                  >
                    Use saved signature image
                  </button>
                  <button
                    type="button"
                    onClick={() => setSigMode('typed_name')}
                    style={sigPillStyle(sigMode === 'typed_name', false)}
                  >
                    Type my name
                  </button>
                </div>
                {!hasSavedSignature && (
                  <p style={{ fontSize: '0.6875rem', color: '#6b7280', margin: '0 0 0.5rem' }}>
                    No saved signature image on file — add one in Company Settings to use it, or type
                    your name below.
                  </p>
                )}
                <div>
                  <label style={smallLabelStyle}>Printed name (required)</label>
                  <input
                    value={sigName}
                    onChange={(e) => setSigName(e.target.value)}
                    placeholder="Full name as it should appear"
                    style={{ ...inputStyle, width: '260px' }}
                  />
                </div>
                <p style={{ fontSize: '0.6875rem', color: '#6b7280', margin: '0.375rem 0 0' }}>
                  {sigMode === 'saved_image'
                    ? 'Your saved signature image will be applied to this change order.'
                    : 'Your typed name will be applied as your signature.'}
                </p>
              </div>
            ) : (
              <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0, flexBasis: '100%' }}>
                Re-sending reuses your existing signature on {co.co_number} and mints a fresh signing
                link.
              </p>
            )}

            <button type="button" onClick={handleSend} disabled={busy} style={primaryButtonStyle(busy)}>
              {busy ? 'Sending…' : 'Confirm Send'}
            </button>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0, flexBasis: '100%' }}>
              On send, a signed PDF is emailed to the client with a link to review and sign. The
              signing link also appears here so you can share it manually.
            </p>
          </div>
        )}

        {signingUrl && co.status !== 'signed' && co.status !== 'voided' && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.625rem 0.75rem',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '0.375rem',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1e40af' }}>
              Signing link:
            </span>
            <code style={{ fontSize: '0.75rem', wordBreak: 'break-all', flex: '1 1 300px' }}>
              {signingUrl}
            </code>
            <button type="button" onClick={copyLink} style={subtleButtonStyle}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            marginBottom: '1rem',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {editable && (
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: '0 0 0.75rem' }}>
          Credits: enter a negative rate, unit cost, or amount and name the row so the credit is
          clear (e.g. &ldquo;CREDIT — remove stock cabinets&rdquo;). Tax and markup apply to
          credits like any other row.
        </p>
      )}

      {/* Line items */}
      {co.line_items.map((item) => (
        <div
          key={item.id}
          style={{
            backgroundColor: '#fff',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            padding: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
              marginBottom: '0.5rem',
            }}
          >
            <span style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{item.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span
                style={{
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  color: item.total_price < 0 ? '#166534' : undefined,
                }}
              >
                {moneyOrDash(item.total_price)}
              </span>
              {editable && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Remove line item "${item.name}" and its rows?`)) {
                      void run(() => deleteCoLineItem(item.id));
                    }
                  }}
                  style={dangerButtonStyle}
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {item.rows.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    {['Row', 'Type', 'Entry', 'Markup %', 'Tax', 'Total', ''].map((label, i) => (
                      <th
                        key={label || 'actions'}
                        style={{
                          padding: '0.375rem 0.5rem',
                          textAlign: i === 5 ? 'right' : 'left',
                          fontSize: '0.6875rem',
                          fontWeight: 600,
                          color: '#6b7280',
                          textTransform: 'uppercase',
                        }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {item.rows.map((row) => (
                    <RowLine
                      key={row.id}
                      row={row}
                      editable={editable}
                      busy={busy}
                      subcontractors={subcontractors}
                      onSave={(input) => run(() => updateCoLineRow(row.id, input))}
                      onDelete={() => run(() => deleteCoLineRow(row.id))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editable && (
            <AddRowForm
              lineItemId={item.id}
              nextSortOrder={item.rows.length}
              busy={busy}
              subcontractors={subcontractors}
              onAdd={(input) => run(() => createCoLineRow(input))}
            />
          )}
        </div>
      ))}

      {editable && (
        <AddLineItemForm
          changeOrderId={co.id}
          nextSortOrder={co.line_items.length}
          busy={busy}
          onAdd={(input) => run(() => createCoLineItem(input))}
        />
      )}

      {co.line_items.length === 0 && !editable && (
        <div
          style={{
            padding: '2rem',
            textAlign: 'center',
            color: '#6b7280',
            backgroundColor: '#fff',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
          }}
        >
          This change order has no line items.
        </div>
      )}
    </div>
  );
}

// ── Header details (draft-editable title / description / impact) ──

function HeaderDetails({
  co,
  onSave,
}: {
  // Redacted shape — this sub-form edits title/description/dates and reads no
  // figure, so widening it costs nothing and keeps one type through the tree.
  co: RedactedCoDetail;
  onSave: (input: {
    title?: string;
    description?: string | null;
    schedule_impact_days?: number | null;
  }) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(co.title);
  const [description, setDescription] = useState(co.description ?? '');
  const [impact, setImpact] = useState(
    co.schedule_impact_days != null ? String(co.schedule_impact_days) : ''
  );

  const dirty =
    title.trim() !== co.title ||
    description.trim() !== (co.description ?? '') ||
    (parseNum(impact) ?? null) !== (co.schedule_impact_days ?? null);

  return (
    <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ ...inputStyle, fontWeight: 600, maxWidth: '420px' }}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="Description (optional)"
        style={{ ...inputStyle, maxWidth: '420px', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
        <div>
          <label style={smallLabelStyle}>Schedule impact (days)</label>
          <input
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
            type="number"
            style={{ ...inputStyle, width: '120px' }}
          />
        </div>
        {dirty && (
          <button
            type="button"
            onClick={() =>
              void onSave({
                title: title.trim() || co.title,
                description: description.trim() || null,
                schedule_impact_days:
                  parseNum(impact) != null ? Math.trunc(parseNum(impact)!) : null,
              })
            }
            style={primaryButtonStyle(false)}
          >
            Save Details
          </button>
        )}
      </div>
    </div>
  );
}

// ── One row: read-only line or draft editor ──

function RowLine({
  row,
  editable,
  busy,
  subcontractors,
  onSave,
  onDelete,
}: {
  row: ChangeOrderLineRow;
  editable: boolean;
  busy: boolean;
  subcontractors: Array<{ id: string; name: string }>;
  onSave: (input: UpdateCoLineRowInput) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing && editable) {
    return (
      <tr>
        <td colSpan={7} style={{ padding: '0.5rem' }}>
          <RowFields
            rowType={row.row_type}
            initial={row}
            busy={busy}
            subcontractors={subcontractors}
            submitLabel="Save Row"
            onSubmit={async (fields) => {
              const ok = await onSave(fields);
              if (ok) setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
      <td style={{ padding: '0.375rem 0.5rem', fontSize: '0.8125rem' }}>{row.name}</td>
      <td style={{ padding: '0.375rem 0.5rem', fontSize: '0.8125rem', color: '#6b7280' }}>
        {ROW_TYPE_LABELS[row.row_type]}
      </td>
      <td style={{ padding: '0.375rem 0.5rem', fontSize: '0.8125rem', color: '#6b7280' }}>
        <RowEntrySummary row={row} />
      </td>
      <td style={{ padding: '0.375rem 0.5rem', fontSize: '0.8125rem', color: '#6b7280' }}>
        {row.markup_percent != null ? `${row.markup_percent}%` : 'default'}
      </td>
      <td style={{ padding: '0.375rem 0.5rem', fontSize: '0.8125rem', color: '#6b7280' }}>
        {row.row_type === 'labor' ? '—' : row.apply_tax ? 'Yes' : 'No'}
      </td>
      <td
        style={{
          padding: '0.375rem 0.5rem',
          fontSize: '0.8125rem',
          textAlign: 'right',
          color: row.total < 0 ? '#166534' : undefined,
          fontWeight: 600,
        }}
      >
        {moneyOrDash(row.total)}
      </td>
      <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {editable && (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              style={{ ...subtleButtonStyle, marginRight: '0.375rem' }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Remove row "${row.name}"?`)) void onDelete();
              }}
              style={dangerButtonStyle}
            >
              ✕
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

function RowEntrySummary({ row }: { row: ChangeOrderLineRow }) {
  switch (row.row_type) {
    case 'labor':
      return (
        <>
          {money(row.rate ?? 0)} × {row.quantity ?? 0} {row.labor_unit ?? 'hours'}
        </>
      );
    case 'material':
      if (row.unit_of_measure === 'allowance') return <>allowance {money(row.unit_cost ?? 0)}</>;
      return (
        <>
          {money(row.unit_cost ?? 0)} × {row.quantity ?? 0} {row.unit_of_measure ?? 'each'}
        </>
      );
    case 'subcontractor':
    case 'other':
    default:
      return <>{money(row.amount ?? 0)}</>;
  }
}

// ── Shared field editor for add + edit ──

interface RowFieldValues {
  name: string;
  rate?: number | null;
  quantity?: number | null;
  labor_unit?: 'hours' | 'days' | null;
  unit_of_measure?: string | null;
  unit_cost?: number | null;
  amount?: number | null;
  subcontractor_id?: string | null;
  markup_percent?: number | null;
  apply_tax?: boolean;
}

function RowFields({
  rowType,
  initial,
  busy,
  subcontractors,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  rowType: CoRowType;
  initial: Partial<ChangeOrderLineRow> | null;
  busy: boolean;
  subcontractors: Array<{ id: string; name: string }>;
  submitLabel: string;
  onSubmit: (fields: RowFieldValues) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [rate, setRate] = useState(initial?.rate != null ? String(initial.rate) : '');
  const [quantity, setQuantity] = useState(
    initial?.quantity != null ? String(initial.quantity) : ''
  );
  const [laborUnit, setLaborUnit] = useState<'hours' | 'days'>(initial?.labor_unit ?? 'hours');
  const [uom, setUom] = useState(initial?.unit_of_measure ?? 'each');
  const [unitCost, setUnitCost] = useState(
    initial?.unit_cost != null ? String(initial.unit_cost) : ''
  );
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '');
  const [subId, setSubId] = useState(initial?.subcontractor_id ?? '');
  const [markup, setMarkup] = useState(
    initial?.markup_percent != null ? String(initial.markup_percent) : ''
  );
  const [applyTax, setApplyTax] = useState(initial?.apply_tax ?? rowType === 'material');

  function buildFields(): RowFieldValues {
    const shared = {
      name: name.trim(),
      markup_percent: parseNum(markup),
    };
    switch (rowType) {
      case 'labor':
        return { ...shared, rate: parseNum(rate), quantity: parseNum(quantity), labor_unit: laborUnit };
      case 'material':
        return {
          ...shared,
          unit_of_measure: uom,
          unit_cost: parseNum(unitCost),
          quantity: parseNum(quantity),
          apply_tax: applyTax,
        };
      case 'subcontractor':
        return {
          ...shared,
          amount: parseNum(amount),
          subcontractor_id: subId || null,
          apply_tax: applyTax,
        };
      case 'other':
      default:
        return { ...shared, amount: parseNum(amount), apply_tax: applyTax };
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.625rem',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        padding: '0.5rem',
        backgroundColor: '#f9fafb',
        borderRadius: '0.375rem',
      }}
    >
      <div style={{ flex: '1 1 180px' }}>
        <label style={smallLabelStyle}>Row name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={rowType === 'material' ? 'e.g. CREDIT — remove stock cabinets' : 'Row name'}
          style={{ ...inputStyle, width: '100%' }}
        />
      </div>

      {rowType === 'labor' && (
        <>
          <div>
            <label style={smallLabelStyle}>Rate ($)</label>
            <input value={rate} onChange={(e) => setRate(e.target.value)} type="number" step="any" style={{ ...inputStyle, width: '100px' }} />
          </div>
          <div>
            <label style={smallLabelStyle}>Qty</label>
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" step="any" style={{ ...inputStyle, width: '80px' }} />
          </div>
          <div>
            <label style={smallLabelStyle}>Unit</label>
            <select value={laborUnit} onChange={(e) => setLaborUnit(e.target.value as 'hours' | 'days')} style={inputStyle}>
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
          </div>
        </>
      )}

      {rowType === 'material' && (
        <>
          <div>
            <label style={smallLabelStyle}>Unit cost ($)</label>
            <input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} type="number" step="any" style={{ ...inputStyle, width: '110px' }} />
          </div>
          <div>
            <label style={smallLabelStyle}>Qty</label>
            <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" step="any" style={{ ...inputStyle, width: '80px' }} />
          </div>
          <div>
            <label style={smallLabelStyle}>Unit</label>
            <select value={uom} onChange={(e) => setUom(e.target.value)} style={inputStyle}>
              {UNIT_OF_MEASURE_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {(rowType === 'subcontractor' || rowType === 'other') && (
        <div>
          <label style={smallLabelStyle}>Amount ($)</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="any" style={{ ...inputStyle, width: '110px' }} />
        </div>
      )}

      {rowType === 'subcontractor' && (
        <div>
          <label style={smallLabelStyle}>Subcontractor</label>
          <select value={subId} onChange={(e) => setSubId(e.target.value)} style={{ ...inputStyle, maxWidth: '180px' }}>
            <option value="">— none —</option>
            {subcontractors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label style={smallLabelStyle}>Markup %</label>
        <input
          value={markup}
          onChange={(e) => setMarkup(e.target.value)}
          type="number"
          step="any"
          placeholder="default"
          style={{ ...inputStyle, width: '90px' }}
        />
      </div>

      {rowType !== 'labor' && (
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            fontSize: '0.8125rem',
            paddingBottom: '0.375rem',
            cursor: 'pointer',
          }}
        >
          <input type="checkbox" checked={applyTax} onChange={(e) => setApplyTax(e.target.checked)} />
          Tax
        </label>
      )}

      <button
        type="button"
        disabled={busy || !name.trim()}
        onClick={() => void onSubmit(buildFields())}
        style={primaryButtonStyle(busy || !name.trim())}
      >
        {submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} style={subtleButtonStyle}>
          Cancel
        </button>
      )}
    </div>
  );
}

// ── Add-row form (type picker + fields) ──

function AddRowForm({
  lineItemId,
  nextSortOrder,
  busy,
  subcontractors,
  onAdd,
}: {
  lineItemId: string;
  nextSortOrder: number;
  busy: boolean;
  subcontractors: Array<{ id: string; name: string }>;
  onAdd: (input: {
    line_item_id: string;
    row_type: CoRowType;
    sort_order: number;
  } & RowFieldValues) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [rowType, setRowType] = useState<CoRowType>('material');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ ...subtleButtonStyle, marginTop: '0.5rem' }}
      >
        + Add Row
      </button>
    );
  }

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.5rem' }}>
        {(Object.keys(ROW_TYPE_LABELS) as CoRowType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setRowType(t)}
            style={{
              padding: '0.25rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: '9999px',
              border: `1px solid ${rowType === t ? '#1a56db' : '#d1d5db'}`,
              backgroundColor: rowType === t ? '#1a56db' : '#fff',
              color: rowType === t ? '#fff' : '#374151',
              cursor: 'pointer',
            }}
          >
            {ROW_TYPE_LABELS[t]}
          </button>
        ))}
      </div>
      <RowFields
        key={rowType}
        rowType={rowType}
        initial={null}
        busy={busy}
        subcontractors={subcontractors}
        submitLabel="Add Row"
        onSubmit={async (fields) => {
          const ok = await onAdd({
            line_item_id: lineItemId,
            row_type: rowType,
            sort_order: nextSortOrder,
            ...fields,
          });
          if (ok) setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

// ── Add line item ──

function AddLineItemForm({
  changeOrderId,
  nextSortOrder,
  busy,
  onAdd,
}: {
  changeOrderId: string;
  nextSortOrder: number;
  busy: boolean;
  onAdd: (input: {
    change_order_id: string;
    name: string;
    sort_order: number;
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        void onAdd({
          change_order_id: changeOrderId,
          name: name.trim(),
          sort_order: nextSortOrder,
        }).then((ok) => {
          if (ok) setName('');
        });
      }}
      style={{
        backgroundColor: '#fff',
        borderRadius: '0.5rem',
        border: '1px dashed #d1d5db',
        padding: '0.75rem 1rem',
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New line item name (e.g. Kitchen cabinet upgrade)"
        style={{ ...inputStyle, flex: '1 1 240px' }}
      />
      <button type="submit" disabled={busy || !name.trim()} style={primaryButtonStyle(busy || !name.trim())}>
        Add Line Item
      </button>
    </form>
  );
}
