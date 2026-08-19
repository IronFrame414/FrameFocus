'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Contact } from '@/lib/services/contacts';
import { CONTACT_TYPE_LABELS } from '@framefocus/shared/constants';
import { deleteContact } from '@/lib/services/contacts-client';
import {
  listAddressesForContact,
  type ContactAddressOption,
} from '@/lib/services/contact-addresses-client';
import { color, font, microLabelStyle } from '@/lib/theme';

// ===========================================================================
// CONTACT DETAIL — A SHEET, NOT A PAGE. [S158 · Finding 1, RULED Josh]
// ===========================================================================
//
// WHAT THIS REPLACES. The contacts list was a dead end: the only things a row
// offered were `Edit` and `Delete`, so the only way to LOOK at a contact was to
// open the form that changes them. That is TECH_DEBT #13 / #108(c) — the same
// defect S140 fixed for subs by giving them a read-only profile page at
// `/dashboard/subcontractors/[id]`.
//
// ⚠️ AND IT IS DELIBERATELY NOT FIXED THE SAME WAY HERE. Josh ruled a SHEET
// explicitly, and the reason is the list: a page navigates away from the search
// and the filters the user just set, a sheet does not. Contacts is a lookup
// surface in a way the sub roster is not. The two surfaces therefore differ ON
// PURPOSE, and this comment is where that is recorded so a later pass does not
// "harmonise" them.
//
// ⚠️ THERE WAS NO DESKTOP CONTACT DETAIL TO DUPLICATE — checked before building
// [S158]. `app/dashboard/contacts/` had exactly `new/` and `[id]/edit/`; there
// is no `[id]/page.tsx`. The only contact detail anywhere was the MOBILE one,
// `/m/contacts/[contactId]` (M6M M-36).
//
// PARITY WITH THAT MOBILE SCREEN [CLAUDE.md, S122]. Same fields, same order,
// same omissions:
//
//   · The same five rows — Company, Phone, Mobile, Email, Address — and the
//     same rule that Company is suppressed when it is already standing in as
//     the display name.
//   · `notes` and `tags` ARE CUT HERE TOO. Both are in `Contact` (the list's
//     `select('*')` carries them), and M-36 cut them because a detail screen is
//     exactly where a build fills empty space, and notes on a client contact can
//     be commercially sensitive. Rendering them on desktop while hiding them on
//     mobile would be a behaviour difference in what the same feature shows.
//   · The address is READ-ONLY here as it is there, and for the same reason: it
//     is a different table with a `is_primary` flag and several rows possible,
//     and "edit which address" is a screen question nobody has ruled.
//
// Presentation legitimately differs — a phone gets a full route and tap-to-call
// circles, a desktop gets a sheet over the list. What must not differ is what a
// save produces, and this surface saves nothing except through the SHARED
// `deleteContact()` — the same function the mobile surfaces would call. #129's
// lesson: share the mechanism, not just the intent.

interface ContactDetailSheetProps {
  contact: Contact;
  /** owner / admin / project_manager — mirrors `contacts_update_authorized`. */
  canEdit: boolean;
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
  // The sheet is the full height of the viewport, so its BODY scrolls rather
  // than the page behind it — the Finding 3 mistake in miniature.
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

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  // An absent value renders an em-dash rather than nothing: a missing row would
  // make "this contact has no phone number" and "this build forgot the phone
  // number" look identical.
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

export function ContactDetailSheet({ contact, canEdit, onClose }: ContactDetailSheetProps) {
  const router = useRouter();
  const [addresses, setAddresses] = useState<ContactAddressOption[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The address is the ONE thing the list row does not already carry — it lives
  // on `contact_addresses`. Fetched when the sheet opens rather than joined into
  // the list, so opening the page stays one query no matter how many contacts
  // it renders.
  useEffect(() => {
    let live = true;
    setAddresses(null);
    listAddressesForContact(contact.id).then((result) => {
      if (!live) return;
      // The service already logs the real cause. An address that failed to load
      // must not render as "no address" — that is the M2-07 shape — so a
      // failure leaves the row at its em-dash and says so above.
      if (result.error) setError('The address could not be loaded.');
      setAddresses(result.addresses);
    });
    return () => {
      live = false;
    };
  }, [contact.id]);

  // Escape closes. A sheet that can only be dismissed by finding the × is a
  // modal wearing a panel's clothes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim();
  const displayName = name || contact.company_name?.trim() || 'Unnamed contact';

  // `is_primary` first — `listAddressesForContact` already orders that way.
  const primary = addresses?.[0] ?? null;
  const addressText = primary
    ? [
        primary.address_line1,
        primary.address_line2,
        [primary.city, primary.state].filter(Boolean).join(', '),
        primary.zip,
      ]
        .filter((part) => part && String(part).trim())
        .join('\n')
    : '';

  async function handleDelete() {
    if (
      !confirm(
        `Delete ${displayName}?\n\nThe contact moves to Trash and can be restored from there. ` +
          `Estimates, projects, invoices and contracts that reference it are not affected.`
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    const result = await deleteContact(contact.id);
    if (!result.success) {
      setDeleting(false);
      setError(result.error ?? 'Failed to delete contact');
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div
      style={overlayStyle}
      onClick={onClose}
      data-testid="contact-detail-overlay"
      role="presentation"
    >
      <div
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${displayName} — contact detail`}
        data-testid="contact-detail-sheet"
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
              {displayName}
            </h2>
            <p style={{ ...microLabelStyle, marginTop: '0.25rem' }}>
              {CONTACT_TYPE_LABELS[contact.contact_type] ?? contact.contact_type} ·{' '}
              {contact.status.charAt(0).toUpperCase() + contact.status.slice(1)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid="contact-detail-close"
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
                color: color.warningDeep,
                fontSize: '0.8125rem',
              }}
              data-testid="contact-detail-error"
            >
              {error}
            </p>
          )}

          <Field
            label="Company"
            // Suppressed when it is already the heading — otherwise the header
            // and the first row say the same thing. M-36's rule, kept.
            value={
              contact.company_name && displayName !== contact.company_name.trim()
                ? contact.company_name
                : null
            }
          />
          <Field label="Phone" value={contact.phone} mono />
          <Field label="Mobile" value={contact.mobile} mono />
          <Field label="Email" value={contact.email} />
          <Field label="Address" value={addressText} />
        </div>

        {/* ⚠️ EDIT AND DELETE LIVE HERE AND NOWHERE ELSE [RULED Josh, S158].
            They were removed from the list rows in the same change.

            DELETE BEING TWO STEPS IS THE FEATURE, not a cost of the move. A
            contact carries FKs from estimates, projects, invoices, payments,
            refunds and contracts, and one stray click on a table row used to be
            the whole ceremony.

            EDIT NAVIGATES to the existing form rather than re-implementing it
            inline. `/dashboard/contacts/[id]/edit` already exists, already
            enforces the same owner/admin/PM gate on the ROUTE, and already
            handles the address. A second editor in a sheet would be #129's
            defect exactly — one feature, two implementations, free to drift. */}
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
              href={`/dashboard/contacts/${contact.id}/edit`}
              data-testid="contact-detail-edit"
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
              data-testid="contact-detail-delete"
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
