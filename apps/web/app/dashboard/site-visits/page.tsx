import Link from 'next/link';
import { listSiteVisits, type SiteVisit } from '@/lib/services/site-visits';
import { groupSiteVisits } from '@/lib/site-visits/groups';

// S110 B [RULED Josh, Q5 → A] — SITE VISITS ON DESKTOP, reachable without
// knowing a URL: a top-level sidebar item for every internal employee.
// _Josh: "there is no path to access site visit on desktop."_
//
// WHO: owner, admin, PM, foreman, crew — Section A's read rule, applied by RLS
// (site_visits_select_internal); this page adds no rule of its own. A
// subcontractor or client never reaches /dashboard.
// WHAT: the same three groups as the phone (lib/site-visits/groups.ts). No money:
// it reads only the money-free site_visits table, never `estimates`.
// NO "record a visit" button [Q6 → B]: recording stays on the phone, on site.

function Row({ v }: { v: SiteVisit }) {
  const who = v.contact ? `${v.contact.first_name} ${v.contact.last_name}`.trim() : null;
  const where = v.address ? `${v.address.address_line1}, ${v.address.city}` : null;
  return (
    <li style={{ borderBottom: '1px solid #eef1f6' }}>
      <Link
        href={`/dashboard/site-visits/${v.estimate_id}`}
        data-testid="desktop-site-visit-row"
        data-finished={v.finished_at ? 'true' : 'false'}
        data-promoted={v.promoted_at ? 'true' : 'false'}
        style={{ display: 'block', padding: '12px 4px', textDecoration: 'none' }}
      >
        <span style={{ display: 'block', fontWeight: 600, color: '#14213d' }}>{v.title}</span>
        <span style={{ display: 'block', fontSize: '12.5px', color: '#7b8699' }}>
          {[who, where, new Date(v.visited_at).toLocaleDateString()].filter(Boolean).join(' · ')}
        </span>
      </Link>
    </li>
  );
}

function Group({ title, visits, testId, empty }: { title: string; visits: SiteVisit[]; testId: string; empty?: string }) {
  if (visits.length === 0 && !empty) return null;
  return (
    <section data-testid={testId} style={{ marginTop: '1.5rem' }}>
      <h2 style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#7b8699' }}>
        {title} · {visits.length}
      </h2>
      {visits.length === 0 ? (
        <p style={{ fontSize: '14px', color: '#7b8699', marginTop: '6px' }}>{empty}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {visits.map((v) => (
            <Row key={v.id} v={v} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function DesktopSiteVisitsPage() {
  const visits = await listSiteVisits();
  const { recording, finished, estimates } = groupSiteVisits(visits);
  return (
    <div style={{ maxWidth: '760px' }} data-testid="desktop-site-visits">
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.25rem' }}>Site visits</h1>
      <p style={{ color: '#7b8699', fontSize: '0.875rem' }}>
        Visits are recorded on a phone, on site. Everyone on the team can read them here and add to them.
      </p>
      <Group title="Recording" visits={recording} testId="desktop-sv-recording" empty="No open site visits." />
      <Group title="Finished · waiting for the office" visits={finished} testId="desktop-sv-finished" />
      <Group title="Became estimates" visits={estimates} testId="desktop-sv-estimates" />
    </div>
  );
}
