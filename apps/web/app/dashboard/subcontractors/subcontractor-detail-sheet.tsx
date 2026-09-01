'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Subcontractor } from '@/lib/services/subcontractors';
import { deleteSubcontractor } from '@/lib/services/subcontractors-client';
import { color, font, microLabelStyle } from '@/lib/theme';
import { useConfirm } from '@/components/confirm/confirm-provider';

// ===========================================================================
// SUBS MATCH CONTACTS. [S159 · RULED Josh — "subs should match contacts with a
// panel."]
// ===========================================================================
//
// WHAT THIS CLOSES. After S158, Contacts and Subs & Vendors sat next to each
// other in the Reference nav group with two different interaction models: a
// contact row opened a sheet, a sub row had an `Edit` link, a `Delete` button
// and a name that navigated to a page. **Two interaction models under one nav
// group is the defect**, and it is the same reasoning as the PARITY ruling one
// level up — a user should not have to remember which list they are in.
//
// ---------------------------------------------------------------------------
// ⚠️ THE COMPLIANCE SECTION STAYS ON THE PAGE. THE SHEET LINKS OUT TO IT.
// ---------------------------------------------------------------------------
// The one real difference from Contacts, decided here and reported rather than
// made silently. `/dashboard/subcontractors/[id]` (S140 ruling A1) holds
// exactly three things, established by reading it rather than assuming:
//
//   1. a header — company name, type · trade · status, and Edit;
//   2. a CONTACT CARD — Contact, Email, Phone, Mobile, Address, License #;
//   3. `ComplianceSection` — Owner/Admin only, DB-enforced by 20260921000000.
//
// **(1) and (2) are reproduced in this sheet in full, field for field.** Nothing
// the page shows about the sub itself is lost by opening the sheet instead —
// and the sheet adds Rating, which the page never had.
//
// **(3) is a 304-line working surface, not a card of facts**: file upload,
// signed-URL open in a new tab, expiry dates, an add form and a soft delete. It
// belongs where it is, for three reasons and not merely for room:
//
//   · `getComplianceStatus()` is a SERVER service (`payables.ts`). A sheet is a
//     client component, so mounting the section here would require a
//     client-side read of compliance documents that does not exist — **a second
//     implementation of one read**, which is #129's defect exactly. The page
//     fetches it server-side and hands it down.
//   · The page's role logic is subtle and worth not copying: it does not merely
//     hide the section from a PM, it **declines to run the query**, because "RLS
//     returned nothing" and "this sub has no documents" render identically and
//     only one of them is true. Two copies of that reasoning is one too many.
//   · A document manager inside a 420px panel over a list is a worse home than
//     the one it has.
//
// So the sheet carries a labelled link, and it is shown to **Owner/Admin only**
// — the roles the page actually has something extra for. A PM's sheet has no
// link because for a PM the sheet IS the full record: the page renders them the
// contact card and nothing else. **The route is unchanged and still guarded for
// owner/admin/PM**, so a PM who holds the URL still reaches it; what they no
// longer get is a link to a page identical to the panel they are looking at,
// which is the dead end S158's Finding 1 was about.
//
// CONTRACTS AND BIDS ARE NOT ON THAT PAGE and are not dropped here. Checked at
// S159: `subcontractor_contracts` render on the PROJECT contracts panel, and
// bids on the ESTIMATE (`estimates/[id]/bidding-tab.tsx`). Neither has ever had
// a sub-scoped surface. Recorded so the next reader does not go looking.

interface SubcontractorDetailSheetProps {
  subcontractor: Subcontractor;
  /** owner / admin / project_manager — mirrors `subcontractors_update_authorized`. */
  canEdit: boolean;
  /** owner / admin — the roles the detail page has a compliance section for. */
  canSeeCompliance: boolean;
  onClose: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(20, 33, 61, 0.45)',
  display: 'flex',
  justifyContent: 'flex-end',
  zIndex: 50,
};

const sheetStyle: React.CSSProperties = {
  width: 'min(420px, 100%)',
  height: '100%',
  backgroundColor: color.cardBg,
  borderLeft: `1px solid ${color.cardBorder}`,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '1rem',
  padding: '0.625rem 0',
  borderBottom: `1px solid ${color.rowDivider}`,
  fontSize: '0.875rem',
};

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={rowStyle}>
      <span style={{ ...microLabelStyle, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: value ? color.body : color.faint,
          fontFamily: mono && value ? font.mono : font.sans,
          textAlign: 'right',
          whiteSpace: 'pre-line',
          wordBreak: 'break-word',
        }}
      >
        {value || '—'}
      </span>
    </div>
  );
}

export function SubcontractorDetailSheet({
  subcontractor,
  canEdit,
  canSeeCompliance,
  onClose,
}: SubcontractorDetailSheetProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const contactName = [subcontractor.contact_first_name, subcontractor.contact_last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  // The page's own join, kept identical so the two surfaces cannot disagree
  // about what an address looks like.
  const address = [
    subcontractor.address_line1,
    subcontractor.address_line2,
    [subcontractor.city, subcontractor.state].filter(Boolean).join(', '),
    subcontractor.zip,
  ]
    .filter((part) => part && String(part).trim())
    .join('\n');

  const typeLabel = subcontractor.sub_type === 'subcontractor' ? 'Subcontractor' : 'Vendor';
  const subtitle = [typeLabel, subcontractor.trade_type, subcontractor.status]
    .filter(Boolean)
    .join(' · ');

  const rating = subcontractor.rating
    ? '★'.repeat(subcontractor.rating) + '☆'.repeat(5 - subcontractor.rating)
    : null;

  async function handleDelete() {
    if (
      !(await confirm(
        `Delete ${subcontractor.company_name}?\n\nThe record moves to Trash and can be restored ` +
          `from there. Contracts, purchase orders and payments that reference it are not affected.`
      ))
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    const result = await deleteSubcontractor(subcontractor.id);
    if (!result.success) {
      setDeleting(false);
      setError(result.error ?? 'Failed to delete');
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div
      style={overlayStyle}
      onClick={onClose}
      data-testid="sub-detail-overlay"
      role="presentation"
    >
      <div
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${subcontractor.company_name} — record`}
        data-testid="sub-detail-sheet"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            padding: '1.25rem 1.25rem 1rem',
            borderBottom: `1px solid ${color.cardBorder}`,
          }}
        >
          <div style={{ minWidth: 0, flexGrow: 1 }}>
            <h2
              style={{
                margin: 0,
                fontSize: '1.125rem',
                fontWeight: 700,
                color: color.navy,
                wordBreak: 'break-word',
              }}
            >
              {subcontractor.company_name}
            </h2>
            <p style={{ ...microLabelStyle, marginTop: '0.25rem' }}>{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="sub-detail-close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
              lineHeight: 1,
              color: color.muted,
              padding: '0.25rem',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flexGrow: 1, overflowY: 'auto', padding: '0.5rem 1.25rem 1.25rem' }}>
          {error && (
            <p
              style={{
                margin: '0.75rem 0',
                padding: '0.5rem 0.75rem',
                borderRadius: '9px',
                backgroundColor: color.warningBg,
                color: color.warning,
                fontSize: '0.8125rem',
              }}
              data-testid="sub-detail-error"
            >
              {error}
            </p>
          )}

          {/* The detail page's contact card, field for field and in its order —
              plus Rating, which the page never carried and the list row did. */}
          <Field label="Contact" value={contactName} />
          <Field label="Email" value={subcontractor.email} />
          <Field label="Phone" value={subcontractor.phone} mono />
          <Field label="Mobile" value={subcontractor.mobile} mono />
          <Field label="Address" value={address} />
          <Field label="License #" value={subcontractor.license_number} mono />
          <Field
            label="Rating"
            value={rating ? <span style={{ color: color.amber }}>{rating}</span> : null}
          />

          {/* ⚠️ NOT the compliance section itself — see the header. Owner/Admin
              only, because they are the only roles the page has anything extra
              for; a PM's link would land them on the panel they are reading. */}
          {canSeeCompliance && (
            <a
              href={`/dashboard/subcontractors/${subcontractor.id}`}
              data-testid="sub-detail-compliance-link"
              style={{
                display: 'block',
                marginTop: '1rem',
                padding: '0.625rem 0.75rem',
                borderRadius: '9px',
                border: `1px solid ${color.cardBorder}`,
                backgroundColor: color.blueTint,
                color: color.primary,
                fontSize: '0.875rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Compliance documents →
            </a>
          )}
        </div>

        {canEdit && (
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              padding: '1rem 1.25rem',
              borderTop: `1px solid ${color.cardBorder}`,
            }}
          >
            <a
              href={`/dashboard/subcontractors/${subcontractor.id}/edit`}
              data-testid="sub-detail-edit"
              style={{
                flexGrow: 1,
                padding: '0.5rem 1rem',
                textAlign: 'center',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#fff',
                backgroundColor: color.primary,
                borderRadius: '0.375rem',
                textDecoration: 'none',
              }}
            >
              Edit
            </a>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              data-testid="sub-detail-delete"
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: color.danger,
                backgroundColor: '#fff',
                border: `1px solid ${color.danger}`,
                borderRadius: '0.375rem',
                cursor: deleting ? 'wait' : 'pointer',
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
