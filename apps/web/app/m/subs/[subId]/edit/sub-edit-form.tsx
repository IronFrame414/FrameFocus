'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { updateSubcontractor } from '@/lib/services/subcontractors-client';
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

// M6M — M-38 · SUB & VENDOR EDIT. docs/specs/M6M-edit-surfaces-spec.md §4.
//
// ONE FORM FOR BOTH, because subs and vendors are ONE TABLE:
// `subcontractors.sub_type` is CHECK-constrained to two values, M-27's chips
// filter on it, and `subcontractors_update_authorized` is one policy over both.
// The spec's §0 records this — the ask said four surfaces and the honest number
// is three.
//
// ===========================================================================
// ⚠️⚠️ A NAMED FIELD SUBSET. NEVER THE ROW. THIS IS THE RULE THAT MATTERS HERE.
// ===========================================================================
// Finding 5, and an edit form is the easiest way in the whole app to undo A-46:
//
//   `getSubcontractor()` is `select('*')` and
//   `subcontractors_select_authenticated` is `company_id = <caller's> AND
//   is_deleted = false` — NO ROLE FLOOR. So `default_hourly_rate`,
//   `default_markup_percent` and `ein` reach this component's props for every
//   role, and nothing but this file keeps them out of the DOM and out of the
//   update payload.
//
// `default_markup_percent` is the company's MARGIN on that sub, which the
// Financial Visibility Floor withholds from PM, foreman and crew on every other
// surface. TECH_DEBT #117's class, filed for this table as #132.
//
// So the form holds ONE STATE FIELD PER EDITABLE COLUMN and builds its payload
// from those fields BY NAME. A build that kept the row in state and spread it
// back would ship markup to the server on every save while looking identical on
// screen. **A-71 asserts the PAYLOAD, not the DOM**, because a hidden input or
// a spread object is invisible to a DOM assertion.
//
// Also excluded, each for its own reason:
//   `rating`, `rating_notes`  §4.13.4's cut — a management judgement recorded
//                             on desktop, not a field edit.
//   `notes`, `tags`           not rendered on M-27 or its detail; an edit form
//                             is not where they get reintroduced.
//   `company_id`              finding 4's mitigation. The three UPDATE policies
//                             carry USING with no WITH CHECK, so an authorised
//                             caller could move a row to another tenant. Never
//                             putting it in a payload is a SERVICE-LAYER
//                             mitigation of a DATABASE gap — a real mitigation,
//                             not a fix. A-73 pins it.
//
// ONLINE-ONLY, in delivery check-in's shape (D-6). §5.2's offline entity set is
// closed at four and this is not one of them, so the write is disabled with a
// plain message rather than silently queued.

const STATUSES = [
  { value: 'active' as const, label: 'Active' },
  { value: 'inactive' as const, label: 'Inactive' },
  { value: 'archived' as const, label: 'Archived' },
];

const TYPES = [
  { value: 'subcontractor' as const, label: 'Subcontractor' },
  { value: 'vendor' as const, label: 'Vendor' },
];

export type SubEditable = {
  id: string;
  company_name: string;
  contact_first_name: string | null;
  contact_last_name: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  trade_type: string | null;
  license_number: string | null;
  insurance_expiry: string | null;
  status: string;
  sub_type: string;
};

export function SubEditForm({ sub }: { sub: SubEditable }) {
  const router = useRouter();
  const online = useOnline();

  // ONE PIECE OF STATE PER EDITABLE COLUMN — see the header. There is
  // deliberately no `const [row, setRow] = useState(sub)`.
  const [companyName, setCompanyName] = useState(sub.company_name ?? '');
  const [firstName, setFirstName] = useState(sub.contact_first_name ?? '');
  const [lastName, setLastName] = useState(sub.contact_last_name ?? '');
  const [phone, setPhone] = useState(sub.phone ?? '');
  const [mobile, setMobile] = useState(sub.mobile ?? '');
  const [email, setEmail] = useState(sub.email ?? '');
  const [tradeType, setTradeType] = useState(sub.trade_type ?? '');
  const [licenseNumber, setLicenseNumber] = useState(sub.license_number ?? '');
  // §2 [S103] — no insurance_expiry state: it is a derived cache of the COI
  // expiry (migration 20261280000000) and cannot be hand-edited. The detail
  // screen (m/subs/[subId]) still displays it read-only.
  const [status, setStatus] = useState<string | null>(sub.status);
  const [subType, setSubType] = useState<string | null>(sub.sub_type);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = companyName.trim().length > 0;

  async function save() {
    if (!online) return;
    if (!ready) {
      setError('A company name is required.');
      return;
    }

    setBusy(true);
    setError(null);

    // THE PAYLOAD IS BUILT BY NAME. Every key here is one of §4's listed
    // fields. Empty strings become null so a cleared optional field clears the
    // column rather than storing '' — M-27 and the detail both branch on null
    // to decide whether to render a row at all.
    const result = await updateSubcontractor(sub.id, {
      company_name: companyName.trim(),
      contact_first_name: firstName.trim() || null,
      contact_last_name: lastName.trim() || null,
      phone: phone.trim() || null,
      mobile: mobile.trim() || null,
      email: email.trim() || null,
      trade_type: tradeType.trim() || null,
      license_number: licenseNumber.trim() || null,
      // insurance_expiry intentionally omitted — derived cache, pinned by trigger.
      status,
      sub_type: subType,
    });

    if (!result.success) {
      setBusy(false);
      // The RLS refusal surfaces here for anyone who got past the route guard —
      // which should be nobody, since the guard mirrors the policy. If this
      // message is ever seen, the guard and the policy have diverged.
      setError(result.error ?? 'The changes could not be saved.');
      return;
    }

    setBusy(false);
    // Back to the DETAIL, not the list: it is the screen the user came from and
    // the one that shows what they just wrote. `refresh()` so it re-renders on
    // the server rather than serving the pre-edit payload.
    router.push(`/m/subs/${sub.id}`);
    router.refresh();
  }

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="Edit" sub={sub.company_name} />

      <h1 className="text-[17px] font-bold leading-tight text-m6m-navy">
        Edit {sub.sub_type === 'vendor' ? 'vendor' : 'sub'}
      </h1>

      {!online ? (
        <div className="mt-[14px]">
          <OfflineNotice what="Editing a sub or vendor" testId="m-sub-edit-offline" />
        </div>
      ) : null}

      <TextField
        label="Company"
        value={companyName}
        onChange={setCompanyName}
        testId="m-sub-edit-company"
        required
      />
      <TextField
        label="Contact first name"
        value={firstName}
        onChange={setFirstName}
        testId="m-sub-edit-first"
      />
      <TextField
        label="Contact last name"
        value={lastName}
        onChange={setLastName}
        testId="m-sub-edit-last"
      />
      <TextField label="Phone" value={phone} onChange={setPhone} testId="m-sub-edit-phone" />
      <TextField label="Mobile" value={mobile} onChange={setMobile} testId="m-sub-edit-mobile" />
      <TextField label="Email" value={email} onChange={setEmail} testId="m-sub-edit-email" />
      <TextField label="Trade" value={tradeType} onChange={setTradeType} testId="m-sub-edit-trade" />
      <TextField
        label="Licence"
        value={licenseNumber}
        onChange={setLicenseNumber}
        testId="m-sub-edit-licence"
      />
      {/* §2 [S103] — the insurance-expiry input was removed. It is a derived
          cache of the COI expiry; the pin trigger silently discarded whatever
          was typed here. The value is shown read-only on the detail screen. */}

      <div className="mt-[14px]">
        <FieldLabel>Type</FieldLabel>
        <OptionStack
          options={TYPES}
          value={subType}
          onChange={setSubType}
          testIdPrefix="m-sub-edit-type"
        />
      </div>

      <div className="mt-[14px]">
        <FieldLabel>Status</FieldLabel>
        <OptionStack
          options={STATUSES}
          value={status}
          onChange={setStatus}
          testIdPrefix="m-sub-edit-status"
        />
      </div>

      {/* ⛔ NOTHING BELOW THIS LINE. default_hourly_rate,
          default_markup_percent and ein are NOT props of this component and
          must not become props of it. See the header. */}

      {error ? <ErrorNotice message={error} testId="m-sub-edit-error" /> : null}

      <PrimaryButton
        label="Save changes"
        busyLabel="Saving…"
        onClick={save}
        disabled={!online}
        busy={busy}
        testId="m-sub-edit-save"
      />
      {!ready ? (
        <p className="mt-[8px] text-center text-[12px] text-m6m-muted">
          A company name is required.
        </p>
      ) : null}
    </div>
  );
}
