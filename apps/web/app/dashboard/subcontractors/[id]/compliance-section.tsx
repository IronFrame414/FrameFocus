'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createComplianceDocument,
  softDeleteComplianceDocument,
  uploadComplianceDocument,
} from '@/lib/services/payables-client';
import { getFileSignedUrlClient } from '@/lib/services/files-client';
import type { ComplianceDocWithStatus } from '@/lib/services/payables';
import type { ComplianceDocType, ComplianceStatus } from '@/lib/services/payables-shared';
import { cardStyle, color, font, microLabelStyle, primaryButtonStyle, secondaryButtonStyle } from '@/lib/theme';
import { useConfirm } from '@/components/confirm/confirm-provider';

// 7C §4 screen 6 — compliance documents on the sub record.
//
// Owner/Admin only, enforced in the DATABASE (20260921000000) on all three
// verbs. This component is the friendly surface over that floor, never the
// floor itself: the page does not render it below Admin, and the policies
// refuse the write even if it somehow did.
//
// WARN, NEVER BLOCK (5I §5, architecture P2). An expired COI produces a red
// chip here and an advisory at payment release. Nothing on this screen stops
// anyone paying anyone.

const DOC_TYPE_LABELS: Record<ComplianceDocType, string> = {
  coi: 'Certificate of Insurance',
  license: 'License',
  w9: 'W-9',
  other: 'Other',
};

const STATUS_CHIP: Record<ComplianceStatus, { label: string; bg: string; fg: string }> = {
  current: { label: 'Current', bg: color.successBg, fg: color.successOnBg },
  expiring_soon: { label: 'Expiring soon', bg: color.warningBg, fg: color.warning },
  expired: { label: 'Expired', bg: '#fdecea', fg: color.danger },
  // A W-9 has no expiry and is never alerted on (5I §5). Neutral, not green:
  // "current" would claim a freshness the row cannot have.
  no_expiry: { label: 'No expiry', bg: color.neutralBadgeBg, fg: color.neutralBadgeText },
};

export function ComplianceSection({
  memberId,
  initialDocs,
}: {
  memberId: string;
  initialDocs: ComplianceDocWithStatus[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => startTransition(() => router.refresh());

  async function openDoc(fileId: string) {
    const url = await getFileSignedUrlClient(fileId);
    if (url) window.open(url, '_blank', 'noopener');
  }

  async function remove(id: string) {
    if (!(await confirm('Remove this document from the sub record?'))) return;
    setBusy(true);
    const result = await softDeleteComplianceDocument(id);
    setBusy(false);
    if (!result.success) return setError(result.error ?? 'Could not remove.');
    setError(null);
    refresh();
  }

  return (
    <div style={{ ...cardStyle, padding: '18px 20px', marginTop: '18px', maxWidth: '640px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <p style={{ ...microLabelStyle, margin: 0 }}>Compliance</p>
        {!adding && (
          <button type="button" style={secondaryButtonStyle} onClick={() => setAdding(true)}>
            Add document
          </button>
        )}
      </div>

      {error && (
        <p style={{ color: color.danger, fontSize: '13px', margin: '0 0 12px' }}>{error}</p>
      )}

      {initialDocs.length === 0 && !adding && (
        <p style={{ fontSize: '13px', color: color.muted, margin: 0 }}>
          No compliance documents recorded.
        </p>
      )}

      {initialDocs.map((doc) => {
        const chip = STATUS_CHIP[doc.derivedStatus];
        return (
          <div
            key={doc.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 0',
              borderTop: `1px solid ${color.rowDivider}`,
              fontSize: '13.5px',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: color.navy, fontWeight: 600 }}>
                {DOC_TYPE_LABELS[doc.doc_type]}
              </div>
              <div style={{ color: color.faint, fontSize: '11.5px', marginTop: '2px' }}>
                {doc.expiration_date ? (
                  <>
                    Expires{' '}
                    <span style={{ fontFamily: font.mono }}>{doc.expiration_date}</span>
                    {doc.daysUntilExpiry !== null && doc.derivedStatus !== 'current' && (
                      <>
                        {' '}
                        ·{' '}
                        {doc.daysUntilExpiry < 0
                          ? `${Math.abs(doc.daysUntilExpiry)} days ago`
                          : `in ${doc.daysUntilExpiry} days`}
                      </>
                    )}
                  </>
                ) : (
                  'No expiry date'
                )}
                {!doc.file_id && ' · document missing'}
              </div>
            </div>

            <span
              style={{
                background: chip.bg,
                color: chip.fg,
                borderRadius: '999px',
                padding: '2px 9px',
                fontSize: '11px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {chip.label}
            </span>

            {doc.file_id && (
              <button
                type="button"
                onClick={() => openDoc(doc.file_id as string)}
                style={{ ...secondaryButtonStyle, padding: '4px 10px', fontSize: '12px' }}
              >
                Open
              </button>
            )}
            <button
              type="button"
              disabled={busy || pending}
              onClick={() => remove(doc.id)}
              style={{
                ...secondaryButtonStyle,
                padding: '4px 10px',
                fontSize: '12px',
                color: color.danger,
              }}
            >
              Remove
            </button>
          </div>
        );
      })}

      {adding && (
        <AddDocumentForm
          memberId={memberId}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            setError(null);
            refresh();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function AddDocumentForm({
  memberId,
  onCancel,
  onSaved,
  onError,
}: {
  memberId: string;
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [docType, setDocType] = useState<ComplianceDocType>('coi');
  const [issued, setIssued] = useState('');
  const [expires, setExpires] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const input = {
      member_id: memberId,
      doc_type: docType,
      issued_date: issued || null,
      // A W-9 has no expiry, and 5I's sweep skips NULL rather than treating it
      // as "expires today". An empty box means NULL, not an empty string.
      expiration_date: expires || null,
      notes: notes || null,
    };

    // A row with no file is legal and deliberate (see payables-client): the
    // office often knows the expiry before the PDF arrives.
    const result = file
      ? await uploadComplianceDocument(file, input)
      : await createComplianceDocument(input);

    setSaving(false);
    if (!result.success) return onError(result.error ?? 'Could not save.');
    onSaved();
  }

  const inputStyle: React.CSSProperties = {
    border: `1px solid ${color.inputBorder}`,
    borderRadius: '6px',
    padding: '6px 9px',
    fontSize: '13px',
    fontFamily: font.sans,
    width: '100%',
  };

  return (
    <div style={{ borderTop: `1px solid ${color.rowDivider}`, paddingTop: '14px', marginTop: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        <label style={{ fontSize: '12px', color: color.muted }}>
          Type
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as ComplianceDocType)}
            style={{ ...inputStyle, marginTop: '3px' }}
          >
            {(Object.keys(DOC_TYPE_LABELS) as ComplianceDocType[]).map((t) => (
              <option key={t} value={t}>
                {DOC_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '12px', color: color.muted }}>
          Document (optional)
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ ...inputStyle, marginTop: '3px', padding: '4px' }}
          />
        </label>
        <label style={{ fontSize: '12px', color: color.muted }}>
          Issued
          <input
            type="date"
            value={issued}
            onChange={(e) => setIssued(e.target.value)}
            style={{ ...inputStyle, marginTop: '3px' }}
          />
        </label>
        <label style={{ fontSize: '12px', color: color.muted }}>
          Expires
          <input
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            style={{ ...inputStyle, marginTop: '3px' }}
          />
          <span style={{ display: 'block', fontSize: '11px', color: color.faint, marginTop: '3px' }}>
            Leave blank for a W-9 — no expiry, never alerted.
          </span>
        </label>
      </div>
      <label style={{ fontSize: '12px', color: color.muted }}>
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, marginTop: '3px' }} />
      </label>
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button type="button" style={primaryButtonStyle} disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" style={secondaryButtonStyle} disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// Re-exported so the section and the form agree on one label map.
export { DOC_TYPE_LABELS, STATUS_CHIP };
