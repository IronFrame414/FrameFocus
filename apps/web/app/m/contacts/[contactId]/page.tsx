import { notFound } from 'next/navigation';
import { CONTACT_TYPE_LABELS } from '@framefocus/shared/constants';
import { getContact } from '@/lib/services/contacts';
import { getPrimaryAddress } from '@/lib/services/contact-addresses';
import { requireDetailAccess } from '@/app/m/detail-access';
import { ContactActions, DetailCard, DetailField } from '../../mobile-ui';

// M6M §4.11.16 — M-36 · Contact detail. Everyone except subcontractors.
//
// ONE ROUTE, TWO ENTRY POINTS — M-17 (project contacts) and M-29 (company
// directory). getProjectContacts joins the Module 2 contact, so both hold a
// `contacts.id` and neither needs its own destination.
//
// ⚠️ THE GUARD IS THE WHOLE ENFORCEMENT. contacts_select_authenticated is
// company + is_deleted = false with NO ROLE ARM (20260101000000:3267). A
// subcontractor's session reads every contact in the company from the database,
// including client contact details. See detail-access.ts.
//
// CUT: notes and tags — A-49d's cut, and §4.11.16 says it matters MORE here.
// getContacts() and getContact() both select('*'), so `notes` and `tags` are in
// this component's props for every caller. The cut is UI-only on the list and
// it is UI-only here. A detail screen is exactly where a build "fills the
// space" with notes, which on a client contact can be commercially sensitive.
//
// CUT: every write. No edit, no create, no delete. D-53 grants detail VIEWS.

export default async function ContactDetailPage({
  params,
}: {
  params: { contactId: string };
}) {
  await requireDetailAccess('contact', '/m/contacts');

  // TWO FETCHES, DELIBERATELY. §4.11.16 lists "address where set" among what
  // M-36 renders, but `contacts` carries NO address columns — addresses live in
  // `contact_addresses` (Migration 028). A NAMED service function already
  // exists, `getPrimaryAddress(contactId)` (contact-addresses.ts:17), so this
  // is not §4.11.15's derive-or-cut case: nothing is being reconstructed from
  // an approximate source. M-31's "one call, no second fetch" rule is that
  // screen's, and it is about `getChangeOrder` already returning its children.
  const [contact, address] = await Promise.all([
    getContact(params.contactId),
    getPrimaryAddress(params.contactId),
  ]);
  if (!contact) notFound();

  // A-49b's fallback: first/last/company are all nullable and a company-only
  // contact is a real state, not a defensive check.
  const name =
    [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() ||
    contact.company_name?.trim() ||
    'Unnamed contact';

  // `zip`, not `postal_code` — the column is named zip on contact_addresses.
  const addressText = address
    ? [
        address.address_line1,
        address.address_line2,
        [address.city, address.state].filter(Boolean).join(', '),
        address.zip,
      ]
        .filter((part) => part && String(part).trim())
        .join('\n')
    : '';

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <header className="mb-[14px] flex items-start gap-[10px]">
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] font-bold leading-tight text-m6m-navy">{name}</h1>
          {contact.contact_type ? (
            <p className="mt-[2px] font-mono text-[11px] font-semibold text-m6m-muted">
              {CONTACT_TYPE_LABELS[contact.contact_type as keyof typeof CONTACT_TYPE_LABELS] ??
                contact.contact_type}
            </p>
          ) : null}
        </div>
        {/* The tap-to-act circles are the screen's reason to exist on a phone —
            A-37's rule, carried onto the detail view. */}
        <ContactActions
          phone={contact.phone}
          mobile={contact.mobile}
          email={contact.email}
          name={name}
        />
      </header>

      <DetailCard testId="m-contact-detail">
        {/* Company name renders as its own field only when it is NOT already
            standing in as the display name — otherwise the header and the first
            row say the same thing. */}
        <DetailField
          label="Company"
          value={
            contact.company_name && name !== contact.company_name.trim()
              ? contact.company_name
              : null
          }
        />
        <DetailField label="Phone" value={contact.phone} mono />
        <DetailField label="Mobile" value={contact.mobile} mono />
        <DetailField label="Email" value={contact.email} />
        <DetailField
          label="Address"
          value={addressText ? <span className="whitespace-pre-line">{addressText}</span> : null}
        />
      </DetailCard>
    </div>
  );
}
