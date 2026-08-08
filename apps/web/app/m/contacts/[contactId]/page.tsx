import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CONTACT_TYPE_LABELS } from '@framefocus/shared/constants';
import { getContact } from '@/lib/services/contacts';
import { getPrimaryAddress } from '@/lib/services/contact-addresses';
import { getMyProfile } from '@/lib/services/profiles';
import { canEdit, requireDetailAccess } from '@/app/m/detail-access';
import { ContactActions, DeniedNotice, DetailCard, DetailField } from '../../mobile-ui';

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
// ⚠️ "CUT: every write" IS SUPERSEDED IN PART [S121]. Quoted, not deleted:
//   _"CUT: every write. No edit, no create, no delete. D-53 grants detail VIEWS."_
// EDIT now exists (M-39, `/m/contacts/[contactId]/edit`), Owner/Admin/PM,
// mirroring `contacts_update_authorized`. Create and delete are still cut.
//
// THE ADDRESS IS NOT EDITABLE, even though this screen renders it — it is a
// different table (`contact_addresses`), it has no write service function, and
// a contact may have many addresses with an `is_primary` flag, so "edit the
// address" is a screen question that has not been ruled. Its WRITE role floor
// landed separately (20260829000000) because it was a live hole regardless:
// every role could rewrite or permanently delete any address.

export default async function ContactDetailPage({
  params,
  searchParams,
}: {
  params: { contactId: string };
  // A-66 — `requireEditAccess` bounces here with `?denied=contact-edit`. The
  // READ guard above still bounces to the LIST (D-54's original destination);
  // the EDIT guard bounces here, because the user tapped Edit on this screen
  // and sending them to the list would lose their place as well as refuse them.
  searchParams: { denied?: string };
}) {
  await requireDetailAccess('contact', '/m/contacts');

  // TWO FETCHES, DELIBERATELY. §4.11.16 lists "address where set" among what
  // M-36 renders, but `contacts` carries NO address columns — addresses live in
  // `contact_addresses` (Migration 028). A NAMED service function already
  // exists, `getPrimaryAddress(contactId)` (contact-addresses.ts:17), so this
  // is not §4.11.15's derive-or-cut case: nothing is being reconstructed from
  // an approximate source. M-31's "one call, no second fetch" rule is that
  // screen's, and it is about `getChangeOrder` already returning its children.
  const [contact, address, profile] = await Promise.all([
    getContact(params.contactId),
    getPrimaryAddress(params.contactId),
    getMyProfile(),
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

      <DeniedNotice kind={searchParams.denied} />

      {/* D-54 step 1 — hide the affordance; step 2 refuses the ROUTE in the
          edit page. Both, because a hidden link is not a permission. Note this
          is a NARROWER test than the read guard above: `requireDetailAccess`
          excludes subcontractors only, `canEdit` also excludes foreman and
          crew. */}
      {canEdit('contact', profile?.role) ? (
        <Link
          href={`/m/contacts/${contact.id}/edit`}
          data-testid="m-contact-edit"
          className="mb-[14px] flex min-h-[52px] w-full items-center justify-center rounded-[14px] border border-m6m-blue text-[15px] font-bold text-m6m-blue"
        >
          Edit
        </Link>
      ) : null}

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
