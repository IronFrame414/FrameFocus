import { notFound } from 'next/navigation';
import { getContact } from '@/lib/services/contacts';
import { requireEditAccess } from '@/app/m/detail-access';
import { ContactEditForm, type ContactEditable } from './contact-edit-form';

// M6M — M-39 · `/m/contacts/[contactId]/edit`. Owner / Admin / PM.
//
// TWO GUARDS ON THIS ROUTE, AND THEY ARE DIFFERENT SHAPES. Worth stating,
// because "contacts already have a guard" would otherwise look like a reason to
// skip one:
//
//   requireDetailAccess('contact', …)  — the READ gate (D-53). Excludes
//     subcontractors ONLY, and it IS the entire enforcement:
//     `contacts_select_authenticated` is company + is_deleted with no role arm.
//   requireEditAccess('contact', …)    — the WRITE gate. Excludes foreman, crew
//     AND subcontractor, and it is NOT the enforcement:
//     `contacts_update_authorized` already refuses all three
//     (20260101000000:3277).
//
// Only the write gate is called here, and that is deliberate rather than an
// omission — it is strictly narrower than the read gate, so a caller who passes
// it has passed both. A second call would be dead code that reads as a
// belt-and-braces safety net and is not one.
//
// ⚠️ THE PROPS ARE A NAMED SUBSET. `getContact()` is `select('*')`, so `notes`
// and `tags` are in the row — A-49d's cut, which §4.11.16 says matters more on
// a detail screen and which matters more again on one that can write. The
// projection below is where they stop; passing `contact` wholesale would put a
// client contact's commercial notes into the client bundle's props whether or
// not the form rendered them.

export default async function ContactEditPage({
  params,
}: {
  params: { contactId: string };
}) {
  await requireEditAccess('contact', `/m/contacts/${params.contactId}`);

  const contact = await getContact(params.contactId);
  if (!contact) notFound();

  // Allow-list, field by field — correct when the table gains a column, which a
  // rest-destructure deny-list would not be.
  const editable: ContactEditable = {
    id: contact.id,
    first_name: contact.first_name,
    last_name: contact.last_name,
    company_name: contact.company_name,
    contact_type: contact.contact_type,
    phone: contact.phone,
    mobile: contact.mobile,
    email: contact.email,
  };

  return <ContactEditForm contact={editable} />;
}
