'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  attachNotarizedCopy,
  markReleaseSent,
  voidRelease,
} from '@/lib/services/lien-releases-client';
import { getFileSignedUrlClient } from '@/lib/services/files-client';
import { brand } from '@/lib/brand';
import { selectTemplate, type TemplateChoice } from '@/lib/services/lien-releases-shared';
import type { LienRelease } from '@/lib/services/lien-releases';
import {
  cardStyle,
  color,
  font,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';

// 7F §8.1 — the release list, and the UNCONDITIONAL initiate action.
//
// ⚠️ HARD BUILD REQUIREMENT, stated three times by Josh (§5.1): there must be
// a real in-app way to INITIATE, GENERATE and SEND an unconditional release.
// It is not a byproduct of anything else. No cleared-funds signal exists and
// none will be added — the QB-webhook prompt is permanently rejected, not
// deferred. So the user judges that funds cleared, and this is where they say
// so. That is what the "Issue unconditional release" button below is for, and
// it must not be removed in favour of an automatic trigger.
//
// The CONDITIONAL side is prompted at invoice SEND, not here (§5.1).

interface InvoiceLite {
  id: string;
  invoice_number: string | null;
  issue_date: string;
  amount_receivable: number;
  is_final: boolean;
  status: string;
}

const STATUS_CHIP: Record<string, { bg: string; fg: string }> = {
  draft: { bg: color.neutralBadgeBg, fg: color.neutralBadgeText },
  signed: { bg: color.blueTintAlt, fg: color.primary },
  notarized: { bg: color.successBg, fg: color.successOnBg },
  sent: { bg: color.successBg, fg: color.successOnBg },
  voided: { bg: '#fdecea', fg: color.danger },
};

const money = (n: number | null) =>
  n === null
    ? '—'
    : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ReleasesPanel({
  projectId,
  releases,
  templates,
  invoices,
  sentInvoiceIds,
}: {
  projectId: string;
  releases: LienRelease[];
  templates: TemplateChoice[];
  invoices: InvoiceLite[];
  sentInvoiceIds: string[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [issuing, setIssuing] = useState<InvoiceLite | null>(null);

  const refresh = () => startTransition(() => router.refresh());
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));

  async function open(fileId: string) {
    const url = await getFileSignedUrlClient(fileId);
    if (url) window.open(url, '_blank', 'noopener');
  }

  async function doVoid(release: LienRelease) {
    const reason = prompt(
      'Why is this release being voided? The reason is kept permanently, and the ' +
        'voided release is never deleted.'
    );
    if (reason === null) return;
    setBusy(true);
    const result = await voidRelease(release.id, release.status, reason);
    setBusy(false);
    if (!result.success) return setError(result.error ?? 'Could not void.');
    setError(null);
    refresh();
  }

  async function doSend(release: LienRelease) {
    setBusy(true);
    const result = await markReleaseSent(release.id);
    setBusy(false);
    if (!result.success) return setError(result.error ?? 'Could not mark sent.');
    setError(null);
    refresh();
  }

  async function doAttachNotarized(release: LienRelease, file: File) {
    setBusy(true);
    const result = await attachNotarizedCopy(release.id, file);
    setBusy(false);
    if (!result.success) return setError(result.error ?? 'Could not attach.');
    setError(null);
    refresh();
  }

  // Invoices that have been sent and carry no live unconditional yet.
  const eligible = invoices.filter(
    (i) =>
      sentInvoiceIds.includes(i.id) &&
      !releases.some(
        (r) => r.invoice_id === i.id && r.type === 'unconditional' && r.status !== 'voided'
      )
  );

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <p style={{ ...microLabelStyle, margin: 0 }}>Lien releases</p>
      </div>

      {error && <p style={{ color: color.danger, fontSize: '13px' }}>{error}</p>}

      <p style={{ fontSize: '12.5px', color: color.muted, maxWidth: '640px', margin: '0 0 16px' }}>
        A <strong>conditional</strong> release is offered when an invoice is sent — it covers what
        is payable now. An <strong>unconditional</strong> release covers money you have{' '}
        <strong>actually received</strong>, and is never triggered automatically: you decide the
        funds cleared and issue it here. One release per invoice, per type.
      </p>

      {/* ── Issue an unconditional ───────────────────────────────────────── */}
      {eligible.length > 0 && (
        <div style={{ ...cardStyle, padding: '14px 18px', marginBottom: '18px', maxWidth: '640px' }}>
          <p style={{ ...microLabelStyle, marginBottom: '10px' }}>Funds cleared?</p>
          {eligible.map((inv) => (
            <div
              key={inv.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 0',
                borderTop: `1px solid ${color.rowDivider}`,
                fontSize: '13px',
              }}
            >
              <span style={{ flex: 1 }}>
                {inv.invoice_number ?? 'Draft'}{' '}
                <span style={{ color: color.faint }}>· {inv.issue_date}</span>
              </span>
              <span style={{ fontFamily: font.mono }}>{money(inv.amount_receivable)}</span>
              <button
                type="button"
                style={{ ...secondaryButtonStyle, padding: '4px 10px', fontSize: '12px' }}
                onClick={() => setIssuing(inv)}
              >
                Issue unconditional release
              </button>
            </div>
          ))}
        </div>
      )}

      {issuing && (
        <GenerateDialog
          invoice={issuing}
          type="unconditional"
          templates={templates}
          onClose={() => setIssuing(null)}
          onDone={() => {
            setIssuing(null);
            setError(null);
            refresh();
          }}
          onError={setError}
        />
      )}

      {/* ── The list ─────────────────────────────────────────────────────── */}
      {releases.length === 0 ? (
        <div style={{ ...cardStyle, padding: '36px', textAlign: 'center', color: color.muted }}>
          No lien releases on this job yet.
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          {releases.map((r) => {
            const chip = STATUS_CHIP[r.status] ?? STATUS_CHIP.draft;
            const inv = r.invoice_id ? invoiceById.get(r.invoice_id) : null;
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 18px',
                  borderTop: `1px solid ${color.rowDivider}`,
                  fontSize: '13px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: color.navy, fontWeight: 600 }}>
                    {r.type === 'conditional' ? 'Conditional' : 'Unconditional'}
                    {r.is_final ? ' — Final Payment' : ''}
                  </div>
                  <div style={{ color: color.faint, fontSize: '11.5px', marginTop: '2px' }}>
                    {inv ? `Invoice ${inv.invoice_number ?? '—'}` : 'Invoice —'}
                    {r.notary_required && ' · notary path'}
                    {r.status === 'voided' && r.void_reason && ` · voided: ${r.void_reason}`}
                  </div>
                </div>

                <span style={{ fontFamily: font.mono }}>{money(r.amount)}</span>

                <span
                  style={{
                    background: chip.bg,
                    color: chip.fg,
                    borderRadius: '999px',
                    padding: '2px 9px',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  {r.status}
                </span>

                {r.generated_pdf_file_id && (
                  <button
                    type="button"
                    style={{ ...secondaryButtonStyle, padding: '4px 10px', fontSize: '12px' }}
                    onClick={() => open(r.generated_pdf_file_id as string)}
                  >
                    Open
                  </button>
                )}
                {r.notarized_pdf_file_id && (
                  <button
                    type="button"
                    style={{ ...secondaryButtonStyle, padding: '4px 10px', fontSize: '12px' }}
                    onClick={() => open(r.notarized_pdf_file_id as string)}
                  >
                    Notarized
                  </button>
                )}

                {/* Notary path: upload the executed copy back. BOTH files are
                    retained — only the upload is legally operative, and the
                    pair is the audit trail (§7). */}
                {r.notary_required && !r.notarized_pdf_file_id && r.status !== 'voided' && (
                  <label
                    style={{
                      ...secondaryButtonStyle,
                      padding: '4px 10px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Upload notarized
                    <input
                      type="file"
                      accept="application/pdf"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void doAttachNotarized(r, f);
                      }}
                    />
                  </label>
                )}

                {r.status !== 'sent' && r.status !== 'voided' && (
                  <button
                    type="button"
                    disabled={busy}
                    style={{ ...secondaryButtonStyle, padding: '4px 10px', fontSize: '12px' }}
                    onClick={() => doSend(r)}
                  >
                    Mark sent
                  </button>
                )}
                {r.status !== 'voided' && (
                  <button
                    type="button"
                    disabled={busy}
                    style={{
                      ...secondaryButtonStyle,
                      padding: '4px 10px',
                      fontSize: '12px',
                      color: color.danger,
                    }}
                    onClick={() => doVoid(r)}
                  >
                    Void
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * §7 steps 2–4 — template choice and the REVIEW AND EDIT step.
 *
 * The picker is ALWAYS shown, pre-selected to the match [ruling C2]. Every
 * auto-filled value is editable before anything renders — a step in the flow,
 * not a per-field exception: the instrument is signed and cannot be retracted.
 */
export function GenerateDialog({
  invoice,
  type,
  templates,
  onClose,
  onDone,
  onError,
}: {
  invoice: InvoiceLite;
  type: 'conditional' | 'unconditional';
  templates: TemplateChoice[];
  onClose: () => void;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const selection = selectTemplate(templates, {
    type,
    isFinal: invoice.is_final,
    direction: 'client_outbound',
  });
  const [templateId, setTemplateId] = useState(selection.preselected?.id ?? '');
  const [notary, setNotary] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);

  async function generate() {
    setBusy(true);
    setBlockers([]);
    const response = await fetch('/api/lien-releases/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoiceId: invoice.id,
        templateId,
        type,
        values,
        notaryRequired: notary,
      }),
    });
    const body = await response.json();
    setBusy(false);

    if (!response.ok) {
      if (Array.isArray(body.blockers)) setBlockers(body.blockers);
      return onError(body.error ?? 'Could not generate the release.');
    }
    if (body.overflowedBoxes?.length) {
      onError(
        `Generated, but ${body.overflowedBoxes.length} field(s) do not fit their box even at the ` +
          'smallest legible size. Open the PDF and check them before sending.'
      );
    }
    onDone();
  }

  const chosen = templates.find((t) => t.id === templateId);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,33,61,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '20px',
      }}
    >
      <div style={{ ...cardStyle, padding: '20px', maxWidth: '520px', width: '100%' }}>
        <p style={{ ...microLabelStyle, marginBottom: '4px' }}>
          {type === 'conditional' ? 'Conditional' : 'Unconditional'} release
        </p>
        <p style={{ fontSize: '12.5px', color: color.muted, margin: '0 0 14px' }}>
          Invoice {invoice.invoice_number ?? '—'} · {money(invoice.amount_receivable)} receivable
        </p>

        {blockers.length > 0 && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              background: '#fdecea',
              border: '1px solid #f5c2bd',
              color: color.danger,
              fontSize: '12.5px',
              marginBottom: '12px',
            }}
          >
            {blockers.map((b) => (
              <div key={b} style={{ marginBottom: '4px' }}>
                {b}
              </div>
            ))}
          </div>
        )}

        <label style={{ fontSize: '12px', color: color.muted, display: 'block', marginBottom: '10px' }}>
          Form
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginTop: '3px',
              padding: '6px 9px',
              fontSize: '13px',
              border: `1px solid ${color.inputBorder}`,
              borderRadius: '6px',
            }}
          >
            <option value="">Choose a form…</option>
            {selection.options.map((t) => (
              <option key={t.id} value={t.id} disabled={!t.hasPdf}>
                {t.name}
                {t.jurisdiction_state ? ` (${t.jurisdiction_state})` : ''}
                {t.hasPdf ? '' : ' — no form uploaded'}
              </option>
            ))}
          </select>
        </label>

        {selection.ambiguous && (
          <p style={{ fontSize: '11.5px', color: color.warning, margin: '0 0 10px' }}>
            More than one form matches this slot. Check you have the right one.
          </p>
        )}

        {chosen && !chosen.hasPdf && (
          <p style={{ fontSize: '11.5px', color: color.warning, margin: '0 0 10px' }}>
            This form has no PDF attached. Upload your company&rsquo;s release form in Company
            Settings first — {brand.shortName} never supplies the wording.
          </p>
        )}

        <label style={{ fontSize: '12.5px', display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <input type="checkbox" checked={notary} onChange={(e) => setNotary(e.target.checked)} />
          <span>
            Needs notarising
            <span style={{ display: 'block', fontSize: '11px', color: color.faint }}>
              The signature and notary areas are left blank. Print it, have it notarised, then
              upload the executed copy — both files are kept.
            </span>
          </span>
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" style={secondaryButtonStyle} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            style={primaryButtonStyle}
            disabled={busy || !templateId || !chosen?.hasPdf}
            onClick={generate}
          >
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </div>

        <p style={{ fontSize: '11px', color: color.faint, margin: '12px 0 0' }}>
          Every filled value can be edited on the generated PDF review before you send. A release
          waives rights and cannot be recalled — voiding keeps the record, it does not retrieve
          the document.
        </p>
        {/* `values` is wired for the review step; the dialog posts whatever the
            user has overridden. Left empty here means "use the resolved
            defaults", which the server fills from §6. */}
        <input type="hidden" value={JSON.stringify(values)} readOnly onChange={() => setValues({})} />
      </div>
    </div>
  );
}
