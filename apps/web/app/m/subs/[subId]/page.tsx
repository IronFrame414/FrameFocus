import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSubcontractor } from '@/lib/services/subcontractors';
import { getMyProfile } from '@/lib/services/profiles';
import { canEdit } from '@/app/m/detail-access';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { companyToday } from '@framefocus/shared/utils/dates';
import { SetMobileHeader } from '../../mobile-header';
import { ContactActions, DeniedNotice, DetailCard, DetailField, StatusPill } from '../../mobile-ui';

// M6M §4.13.4 — M-27 · SUB & VENDOR DETAIL · `/m/subs/[subId]`. Read-only.
//
// The same D-55 instance as M-37: "every list row opens its own page with its
// own route". M-27's rows already carried more than a 58px row can hold
// comfortably — status, type, trade, insurance, licence and three tap-to-act
// circles — and had nowhere to send a tap. This is where the rest goes.
//
// ===========================================================================
// ⚠️ THE THREE CUT COLUMNS ARE CUT HERE TOO, AND THIS SCREEN IS THE RISK
// ===========================================================================
// `getSubcontractor()` does `select('*')` and `subcontractors_select_authenticated`
// is `company_id = <caller's> AND is_deleted = false` and NOTHING ELSE — no role
// floor (20260101000000:3745-3750, read for this change). So
// `default_hourly_rate`, `default_markup_percent` and `ein` are in this
// component's props for EVERY role including crew, and only this file stops them
// reaching a screen.
//
// **A detail view is exactly where a build "fills the space" with them** — the
// same argument §4.11.16 makes for `notes` on M-36, and it is sharper here:
// `default_markup_percent` is the company's margin on that sub, which the
// Financial Visibility Floor keeps from PM, foreman and crew on every other
// surface. This is the TECH_DEBT #117 class, filed for this table as #132.
//
// DO NOT render them, and DO NOT "fix" it by adding a role check that shows them
// to Owner/Admin: A-46 asserts their absence under every role including Owner,
// precisely so the gate cannot quietly become UI-only-but-role-aware. If they
// are wanted on mobile, the answer is a column-level or side-table floor on
// `subcontractors`, not a conditional render.
//
// ===========================================================================
// NO ROLE GUARD — AND THAT IS THE REUSE, NOT AN OMISSION
// ===========================================================================
// `detail-access.ts` is the right file to consult and the answer it gives is
// "nothing to refuse". Its `GatedSurface` union is `co | member | contact |
// file | co-write`, and those five are D-53/D-51's NAMED surfaces. Subs and
// vendors are in neither ruling, and §4.13.4 is explicit that "RLS is
// company-wide with NO role floor ... Every role reads every row."
//
// Adding a sixth surface would gate a screen no ruling gates — the exact move
// detail-access.ts forecloses at length for punch ("a build that gates a further
// surface 'because there is a pattern now' has exceeded D-54"). So the reuse
// here is the DECISION PROCEDURE and the cut list, not a call to the guard.
//
// ⚠️ "CUT: every write" IS SUPERSEDED IN PART [S121]. Quoted, not deleted:
//   _"CUT: every write — no create, edit or rate. §4.13.4's cut; `rating` and
//    `rating_notes` are a management judgement recorded on desktop"_
// EDIT now exists (M-38, `/m/subs/[subId]/edit`), Owner/Admin/PM, mirroring
// `subcontractors_update_authorized`. CREATE and RATE are still cut, and for
// their original reasons: create needs required columns a mobile form does not
// collect, and rating stays a desktop management judgement.
//
// NOT CUT: the address. §4.13.4 cuts it from the ROW and gives the reason —
// "a directory row does not need it and D-4's geometry has no room ... a layout
// decision". A detail screen has the room, and the reason does not survive the
// move, so the columns render here. Recorded because the list's cut looks like
// a data ruling and is not one.

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  archived: 'Archived',
};

export default async function SubDetailPage({
  params,
  searchParams,
}: {
  params: { subId: string };
  // A-66 — `requireEditAccess` bounces here with `?denied=sub-edit`, so this
  // screen has to be able to EXPLAIN itself. The existing read guards bounce to
  // the LIST and the list hosts the notice; the edit guard bounces to the
  // DETAIL, because that is the screen the user tapped Edit on and returning
  // them to the list would lose their place as well as refusing them. The cost
  // is that the notice needs a second host, which is here.
  searchParams: { denied?: string };
}) {
  const [sub, timeSettings, profile] = await Promise.all([
    getSubcontractor(params.subId),
    getCompanyTimeSettings(),
    getMyProfile(),
  ]);

  // `getSubcontractor` already filters is_deleted, so a soft-deleted row
  // arrives as null and this is the only check needed.
  if (!sub) notFound();

  // A CALENDAR comparison, so it must be the company's day rather than UTC's —
  // the same trap §4.12.5 hit. An insurance certificate that expires today is
  // not expired, and getting the zone wrong moves that boundary by hours.
  const today = companyToday(timeSettings.timezone);
  const expired = sub.insurance_expiry != null && sub.insurance_expiry < today;

  const name = sub.company_name ?? 'Unnamed';
  const contactName =
    [sub.contact_first_name, sub.contact_last_name].filter(Boolean).join(' ').trim() || null;

  const address =
    [
      sub.address_line1,
      sub.address_line2,
      [sub.city, sub.state].filter(Boolean).join(', '),
      sub.zip,
    ]
      .filter(Boolean)
      .join('\n') || null;

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title={name} sub={sub.sub_type === 'vendor' ? 'Vendor' : 'Sub'} />

      <DeniedNotice kind={searchParams.denied} />

      <header className="mb-[14px]">
        <h1
          data-testid="m-sub-name"
          className="text-[17px] font-bold leading-tight text-m6m-navy"
        >
          {name}
        </h1>
        <p className="mt-[4px] flex flex-wrap items-center gap-[6px]">
          <StatusPill label={STATUS_LABEL[sub.status] ?? sub.status} />
          <span className="font-mono text-[11px] font-semibold text-m6m-muted">
            {sub.sub_type === 'vendor' ? 'Vendor' : 'Sub'}
          </span>
          {sub.trade_type ? (
            <span className="truncate font-mono text-[11px] text-m6m-muted">{sub.trade_type}</span>
          ) : null}
        </p>
      </header>

      {/* THE ONE GENUINELY FIELD-RELEVANT FACT: may this sub be on site today.
          Danger treatment AND the word "expired" — never colour alone (A-46b,
          the A-10b accessibility class). Rendered above the fold rather than as
          a field row, because it is the question the screen gets opened to
          answer. */}
      {sub.insurance_expiry ? (
        <p
          data-testid="m-insurance"
          data-expired={expired ? 'true' : 'false'}
          className={`mb-[14px] rounded-[14px] border px-[14px] py-[10px] font-mono text-[12px] ${
            expired
              ? 'border-m6m-danger-border bg-[#fdf1f0] font-semibold text-m6m-danger'
              : 'border-m6m-border bg-m6m-card text-m6m-muted'
          }`}
        >
          {expired ? 'Insurance expired ' : 'Insurance to '}
          {sub.insurance_expiry}
        </p>
      ) : null}

      {/* §4.13.4 — "the screen's reason to exist on a phone" (A-46c). On the
          list these sit beside the row; here they get their own block, and the
          44px floor applies to all three exactly as it does there. */}
      <div className="mb-[14px] flex items-center gap-[10px]">
        <ContactActions phone={sub.phone} mobile={sub.mobile} email={sub.email} name={name} />
      </div>

      {/* D-54 step 1 — HIDE the affordance. Step 2 (refusing the ROUTE) lives
          in the edit page's `requireEditAccess`, and both are required: a
          hidden button is not a permission, because the URL survives a shared
          screenshot, a bookmark and a stale PWA cache. A build with only this
          link-hiding has shipped no permission at all. */}
      {canEdit('sub', profile?.role) ? (
        <Link
          href={`/m/subs/${sub.id}/edit`}
          data-testid="m-sub-edit"
          className="mb-[14px] flex min-h-[52px] w-full items-center justify-center rounded-[14px] border border-m6m-blue text-[15px] font-bold text-m6m-blue"
        >
          Edit
        </Link>
      ) : null}

      <DetailCard testId="m-sub-detail">
        <DetailField label="Company" value={name} />
        <DetailField label="Contact" value={contactName} />
        <DetailField label="Type" value={sub.sub_type === 'vendor' ? 'Vendor' : 'Subcontractor'} />
        <DetailField label="Trade" value={sub.trade_type} mono />
        <DetailField label="Phone" value={sub.phone} mono />
        <DetailField label="Mobile" value={sub.mobile} mono />
        <DetailField label="Email" value={sub.email} />
        <DetailField label="Licence" value={sub.license_number} mono />
        <DetailField
          label="Address"
          value={
            address ? <span className="whitespace-pre-line">{address}</span> : null
          }
        />
        {/* NOTHING BELOW THIS LINE. See the header: default_hourly_rate,
            default_markup_percent and ein are all in `sub` and all stay out of
            the DOM. */}
      </DetailCard>
    </div>
  );
}
