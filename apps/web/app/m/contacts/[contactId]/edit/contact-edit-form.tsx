'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CONTACT_TYPE_LABELS } from '@framefocus/shared/constants';
import { updateContact } from '@/lib/services/contacts-client';
import { SetMobileHeader } from '../../../mobile-header';
import {
  ErrorNotice,
  FieldLabel,
  OfflineNotice,
  OptionStack,
  PrimaryButton,
  TextField,
  useOnline,
} from '../../../write-ui';

// M6M — M-39 · CONTACT EDIT. docs/specs/M6M-edit-surfaces-spec.md §4.
//
// ===========================================================================
// ⚠️ THE ADDRESS IS NOT HERE, AND THAT IS A DECISION — finding 3
// ===========================================================================
// M-36 RENDERS the address, so its absence from this form looks like an
// oversight. It is not.
//
// `contact_addresses` is a DIFFERENT TABLE with a different policy. Until
// 20260829000000 it had no role floor at all — `company_id` and nothing else —
// so every role including crew and subcontractor could rewrite or PERMANENTLY
// delete any contact's address. That migration [S121, Josh] floored the three
// write verbs to owner/admin/project_manager, matching this table.
//
// **The floor landing does not automatically put the field in this form.** Two
// separate reasons it stays out of v1:
//
//   1. `contact-addresses.ts` exports `getPrimaryAddress` and NOTHING ELSE.
//      There is no write function, and §4.11's "every figure bound to a named
//      service function" applies to writes: inventing one inline here would be
//      the page-level query that rule exists to prevent.
//   2. A contact may have MANY addresses (Migration 028 split them off for
//      exactly that cardinality) with an `is_primary` flag. "Edit the address"
//      on a phone therefore has to answer which one, and what happens to
//      `is_primary` — a screen design, not a field.
//
// So: the floor is a security fix that stands on its own, and the editor is
// scoped work that has not been ruled. Recorded so nobody reads the migration
// as authorisation to add the field.
//
// ===========================================================================
// A NAMED FIELD SUBSET, for the same reason M-38 is one
// ===========================================================================
// `getContact()` is `select('*')`, so `notes` and `tags` are in the payload.
// A-49d cuts them from the list and §4.11.16 says the cut "matters MORE" on a
// detail screen — it matters more again on one that can WRITE, because a
// commercially sensitive note on a client contact is exactly the thing a form
// "fills the space" with. One state field per editable column; the payload is
// built by name. `company_id` is never in it (finding 4's mitigation, A-73).
//
// ONLINE-ONLY, in delivery check-in's shape (D-6).

export type ContactEditable = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  contact_type: string;
  phone: string | null;
  mobile: string | null;
  email: string | null;
};

export function ContactEditForm({ contact }: { contact: ContactEditable }) {
  const router = useRouter();
  const online = useOnline();

  const [firstName, setFirstName] = useState(contact.first_name ?? '');
  const [lastName, setLastName] = useState(contact.last_name ?? '');
  const [companyName, setCompanyName] = useState(contact.company_name ?? '');
  const [contactType, setContactType] = useState<string | null>(contact.contact_type);
  const [phone, setPhone] = useState(contact.phone ?? '');
  const [mobile, setMobile] = useState(contact.mobile ?? '');
  const [email, setEmail] = useState(contact.email ?? '');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A-49b's fallback, enforced as a RULE rather than assumed: first, last and
  // company are all nullable, and a company-only contact is a real state — but
  // a contact with none of the three has no name anywhere in the app.
  const ready =
    firstName.trim().length > 0 || lastName.trim().length > 0 || companyName.trim().length > 0;

  async function save() {
    if (!online) return;
    if (!ready) {
      setError('Give the contact a name or a company.');
      return;
    }

    setBusy(true);
    setError(null);

    const result = await updateContact(contact.id, {
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      company_name: companyName.trim() || null,
      contact_type: contactType,
      phone: phone.trim() || null,
      mobile: mobile.trim() || null,
      email: email.trim() || null,
    });

    if (!result.success) {
      setBusy(false);
      setError(result.error ?? 'The changes could not be saved.');
      return;
    }

    setBusy(false);
    router.push(`/m/contacts/${contact.id}`);
    router.refresh();
  }

  // The CHECK-constrained domain, from the shared constants rather than a local
  // literal — A-49c's rule that the label never shows the raw enum, and the
  // same source M-29 and M-36 read.
  const typeOptions = Object.entries(CONTACT_TYPE_LABELS).map(([value, label]) => ({
    value,
    label: String(label),
  }));

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="Edit" sub={null} />

      <h1 className="text-[17px] font-bold leading-tight text-m6m-navy">Edit contact</h1>

      {!online ? (
        <div className="mt-[14px]">
          <OfflineNotice what="Editing a contact" testId="m-contact-edit-offline" />
        </div>
      ) : null}

      <TextField
        label="First name"
        value={firstName}
        onChange={setFirstName}
        testId="m-contact-edit-first"
      />
      <TextField
        label="Last name"
        value={lastName}
        onChange={setLastName}
        testId="m-contact-edit-last"
      />
      <TextField
        label="Company"
        value={companyName}
        onChange={setCompanyName}
        testId="m-contact-edit-company"
      />
      <TextField
        label="Phone"
        value={phone}
        onChange={setPhone}
        testId="m-contact-edit-phone"
      />
      <TextField
        label="Mobile"
        value={mobile}
        onChange={setMobile}
        testId="m-contact-edit-mobile"
      />
      <TextField
        label="Email"
        value={email}
        onChange={setEmail}
        testId="m-contact-edit-email"
      />

      <div className="mt-[14px]">
        <FieldLabel>Type</FieldLabel>
        <OptionStack
          options={typeOptions}
          value={contactType}
          onChange={setContactType}
          testIdPrefix="m-contact-edit-type"
        />
      </div>

      {/* ⛔ NO ADDRESS FIELDS, NO notes, NO tags. See the header — the address
          is a different table with its own screen question, and notes/tags are
          A-49d's cut. */}

      {error ? <ErrorNotice message={error} testId="m-contact-edit-error" /> : null}

      <PrimaryButton
        label="Save changes"
        busyLabel="Saving…"
        onClick={save}
        disabled={!online}
        busy={busy}
        testId="m-contact-edit-save"
      />
      {!ready ? (
        <p className="mt-[8px] text-center text-[12px] text-m6m-muted">
          A name or a company is required.
        </p>
      ) : null}
    </div>
  );
}
