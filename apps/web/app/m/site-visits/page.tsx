import Link from 'next/link';
import { DASHBOARD_ROLES } from '@framefocus/shared/constants/roles';
import type { CompanyRole } from '@framefocus/shared';
import { getMyProfile } from '@/lib/services/profiles';
import { listSiteVisits } from '@/lib/services/site-visits';
import { SetMobileHeader } from '../mobile-header';
import { EmptyState, ListRowLink, SectionLabel } from '../mobile-ui';

// S108 Spec A — the site visits list on the phone.
//
// WHO: any INTERNAL role (owner, admin, PM, foreman, crew) — RULED. Not a
// subcontractor, not a client: they are told plainly, and the RPCs and RLS
// refuse them regardless of this screen.
// WHAT: office roles see every visit in the company; a foreman or crew member
// sees the visits THEY recorded (site_visits_select_scoped). No money on this
// screen or in its payload — it never reads `estimates`.

export default async function SiteVisitsPage() {
  const profile = await getMyProfile();
  const internal = !!profile && DASHBOARD_ROLES.includes(profile.role as CompanyRole);

  if (!internal) {
    return (
      <div className="px-[18px] pb-[18px] pt-[14px]">
        <SetMobileHeader title="Site visits" sub={null} />
        <EmptyState>Site visits are recorded by company staff.</EmptyState>
      </div>
    );
  }

  const visits = await listSiteVisits();
  const open = visits.filter((v) => !v.promoted_at);
  const done = visits.filter((v) => v.promoted_at);

  const row = (v: (typeof visits)[number]) => {
    const who = v.contact ? `${v.contact.first_name} ${v.contact.last_name}`.trim() : null;
    const where = v.address ? `${v.address.address_line1}, ${v.address.city}` : null;
    return (
      <ListRowLink
        key={v.id}
        href={`/m/site-visits/${v.estimate_id}`}
        testId="m-site-visit-row"
        dataAttrs={{ 'data-promoted': v.promoted_at ? 'true' : 'false' }}
      >
        <span className="block truncate text-[15px] font-semibold text-m6m-navy">{v.title}</span>
        <span className="block truncate font-mono text-[11px] text-m6m-muted">
          {[who, where, new Date(v.visited_at).toLocaleDateString()].filter(Boolean).join(' · ')}
        </span>
      </ListRowLink>
    );
  };

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="Site visits" sub={null} />
      <Link
        href="/m/site-visits/new"
        data-testid="m-site-visit-new"
        className="flex h-[56px] w-full items-center justify-center rounded-[14px] bg-m6m-blue text-[16px] font-bold text-white"
      >
        Record a site visit
      </Link>

      <SectionLabel>Recording · {open.length}</SectionLabel>
      {open.length === 0 ? <EmptyState>No open site visits.</EmptyState> : <ul>{open.map(row)}</ul>}

      {done.length > 0 ? (
        <>
          <SectionLabel>Became estimates · {done.length}</SectionLabel>
          <ul>{done.map(row)}</ul>
        </>
      ) : null}
    </div>
  );
}
