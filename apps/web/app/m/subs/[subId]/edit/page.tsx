import { notFound } from 'next/navigation';
import { getSubcontractor } from '@/lib/services/subcontractors';
import { requireEditAccess } from '@/app/m/detail-access';
import { SubEditForm, type SubEditable } from './sub-edit-form';

// M6M — M-38 · `/m/subs/[subId]/edit`. Owner / Admin / PM.
//
// THE GUARD MIRRORS THE POLICY RATHER THAN GUESSING AT IT.
// `subcontractors_update_authorized` is
//   company_id = <caller's> AND role = ANY (owner, admin, project_manager)
// (20260101000000:3758). So unlike the READ guards in detail-access.ts, this
// one is not the enforcement — the database refuses these roles on its own.
// It exists so the refusal arrives as a screen that explains itself (A-66)
// instead of an RLS error under a Save button. `requireCoWriteAccess`'s case,
// and the file says so at length.
//
// ⚠️ THE PROPS ARE A NAMED SUBSET, and that starts HERE, not in the form.
// `getSubcontractor()` is `select('*')` over a table with no role floor, so the
// row in hand carries default_hourly_rate, default_markup_percent and ein.
// Passing `sub` wholesale would put all three into the client bundle's props —
// visible in the page source to a crew member who typed the URL — even if the
// form never rendered them. The projection below is the boundary.

export default async function SubEditPage({ params }: { params: { subId: string } }) {
  await requireEditAccess('sub', `/m/subs/${params.subId}`);

  const sub = await getSubcontractor(params.subId);
  if (!sub) notFound();

  // Field-by-field. Not a spread, not a rest-destructure of the excluded three:
  // an allow-list stays correct when the table gains a column, a deny-list does
  // not, and this table is exactly the one where a new money column would be
  // the likeliest addition.
  const editable: SubEditable = {
    id: sub.id,
    company_name: sub.company_name,
    contact_first_name: sub.contact_first_name,
    contact_last_name: sub.contact_last_name,
    phone: sub.phone,
    mobile: sub.mobile,
    email: sub.email,
    trade_type: sub.trade_type,
    license_number: sub.license_number,
    insurance_expiry: sub.insurance_expiry,
    status: sub.status,
    sub_type: sub.sub_type,
  };

  return <SubEditForm sub={editable} />;
}
