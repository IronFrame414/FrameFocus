import { getSubcontractors } from '@/lib/services/subcontractors';
import { getCompanyTimeSettings } from '@/lib/services/company';
// [S106] was a local copy of the company-tz calendar-date rule.
import { companyToday } from '@framefocus/shared/utils/dates';
import { getMobileT } from '@/lib/i18n/server';
import type { MsgKey, T } from '@/lib/i18n/messages';
import { SetMobileHeader } from '../mobile-header';
import {
  ContactActions,
  EmptyState,
  FilterChips,
  ListRowLink,
  StatusPill,
  type Chip,
} from '../mobile-ui';

// M6M §4.13.4 — M-27 · Subs & Vendors.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ THREE COLUMNS ARE DELIBERATELY NOT RENDERED, AND THE CUT IS UI-ONLY.
// ─────────────────────────────────────────────────────────────────────────────
// `getSubcontractors()` does `select('*')` and `subcontractors_select_authenticated`
// is `company_id = <caller's> AND is_deleted = false` — NO ROLE FLOOR. So
// `default_hourly_rate`, `default_markup_percent` and `ein` are in the payload
// for every role including crew, and nothing but this file stops them reaching a
// screen. `default_markup_percent` is the sharpest: it is the company's margin on
// that sub, which the Financial Visibility Floor keeps from PM, foreman and crew
// everywhere else.
//
// This is the same class of exposure as TECH_DEBT #117, and it is filed as #132.
// A-46 asserts the absence under EVERY role including Owner — a build that adds
// a role gate "because owners may as well see it" reintroduces a UI-only gate.
// DO NOT render them, and do not add a role check instead.

// S110 H — labels are message keys, resolved with t() at render time.
function chips(t: T): readonly Chip[] {
  return [
    { value: null, label: t('directory.chip.all'), testKey: 'All' },
    // `subcontractors_sub_type_check` permits exactly these two, so the chip row
    // covers the domain and All = Subs ∪ Vendors (A-46d).
    { value: 'subcontractor', label: t('directory.subs.chip.subs'), testKey: 'Subs' },
    { value: 'vendor', label: t('directory.subs.chip.vendors'), testKey: 'Vendors' },
  ];
}

// S110 H — message keys, resolved with t() at render time.
const STATUS_KEY: Record<string, MsgKey> = {
  active: 'directory.status.active',
  inactive: 'directory.status.inactive',
  archived: 'directory.status.archived',
};

export default async function MobileSubsPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  // The chip is a search param the SERVICE FUNCTION filters on (§4.13.4's
  // "bound to getSubcontractors({ sub_type })"), not a client-side filter over a
  // full fetch. Anything unrecognised falls back to unfiltered rather than
  // returning nothing, so a hand-typed URL cannot produce a silently empty list.
  const raw = searchParams.type;
  const active = raw === 'subcontractor' || raw === 'vendor' ? raw : null;

  const [subs, timeSettings, t] = await Promise.all([
    getSubcontractors(active ? { sub_type: active } : undefined),
    getCompanyTimeSettings(),
    getMobileT(),
  ]);

  const today = companyToday(timeSettings.timezone);

  // §4.13.4's empty-state copy, per-chip.
  const emptyCopy =
    active === 'subcontractor'
      ? t('directory.subs.emptySubs')
      : active === 'vendor'
        ? t('directory.subs.emptyVendors')
        : t('directory.subs.empty');

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title={t('directory.subs.title')} sub={t('directory.companyDirectory')} />

      <FilterChips chips={chips(t)} active={active} basePath="/m/subs" param="type" t={t} />

      {subs.length === 0 ? (
        <div className="pt-[18px]">
          <EmptyState>{emptyCopy}</EmptyState>
        </div>
      ) : (
        <ul className="mt-[14px] rounded-[15px] border border-m6m-border bg-m6m-card px-[12px]">
          {subs.map((s) => {
            const expired = s.insurance_expiry != null && s.insurance_expiry < today;
            const name = s.company_name ?? t('directory.subs.unnamed');
            return (
              // D-55 — THE WHOLE ROW OPENS THE SUB [S121]. `ListRowLink`, the
              // same component M-36 uses, and for the same structural reason:
              // the tap-to-act circles must stay SIBLINGS of the link, never
              // nested inside it. Nesting is invalid HTML — the browser closes
              // the outer anchor early and what ships is a call button that
              // navigates to the detail instead of dialling.
              <ListRowLink
                key={s.id}
                href={`/m/subs/${s.id}`}
                testId="m-sub-row"
                label={name}
                trailing={
                  <ContactActions
                    phone={s.phone}
                    mobile={s.mobile}
                    email={s.email}
                    name={name}
                    t={t}
                  />
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-bold leading-tight text-m6m-navy">
                    {name}
                  </p>
                  <p className="mt-[3px] flex flex-wrap items-center gap-[6px]">
                    <StatusPill label={STATUS_KEY[s.status] ? t(STATUS_KEY[s.status]) : s.status} />
                    <span className="font-mono text-[11px] font-semibold text-m6m-muted">
                      {s.sub_type === 'vendor'
                        ? t('directory.subs.vendor')
                        : t('directory.subs.sub')}
                    </span>
                    {/* §4.13.4 puts trade_type in mono. Rendered only where set —
                        the column is nullable, and A-46e checks there is no empty
                        slot left behind. */}
                    {s.trade_type ? (
                      <span className="truncate font-mono text-[11px] text-m6m-muted">
                        {s.trade_type}
                      </span>
                    ) : null}
                  </p>

                  {/* The one genuinely field-relevant fact on this table:
                      whether this sub may be on site today. Expired carries the
                      danger treatment AND a text label — never colour alone
                      (A-46b, the A-10b accessibility class). */}
                  {s.insurance_expiry ? (
                    <p
                      data-testid="m-insurance"
                      data-expired={expired ? 'true' : 'false'}
                      className={`mt-[3px] font-mono text-[11px] ${
                        expired ? 'font-semibold text-m6m-danger' : 'text-m6m-muted'
                      }`}
                    >
                      {expired
                        ? t('directory.subs.insuranceExpired')
                        : t('directory.subs.insuranceTo')}
                      {s.insurance_expiry}
                    </p>
                  ) : null}

                  {s.license_number ? (
                    <p
                      data-testid="m-license"
                      className="mt-[2px] font-mono text-[11px] text-m6m-muted"
                    >
                      {t('directory.subs.lic')} {s.license_number}
                    </p>
                  ) : null}
                </div>
              </ListRowLink>
            );
          })}
        </ul>
      )}
    </div>
  );
}
