import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getSiteVisit, getSiteVisitAccess } from '@/lib/services/site-visits';
import { SiteVisitRecord } from '@/components/site-visits/site-visit-record';
import { SiteVisitOfficeActions } from './office-actions';

// S108 Spec A — a site visit on DESKTOP. The record itself is the SAME component
// the phone renders (PARITY [S122]); for the OFFICE this page adds the two office
// decisions around it: PROMOTE to a draft estimate (ASK-A3 — owner/admin/PM;
// assigns the number) and ABANDON (ASK-A7). Both are RPCs; the database refuses
// anyone else.
//
// [S110 B, RULED Josh Q5 → A] EVERY INTERNAL EMPLOYEE reaches this page from the
// new top-level "Site visits" item — Section A lets foreman and crew read and
// edit every visit, so the desktop no longer sends them away. _Superseded,
// quoted: "A foreman or crew member records and reads visits on /m — the desktop
// Estimates area stays office-only (§4.13), so this page redirects them."_ The
// Estimates area DOES stay office-only; this page moved out of it
// (/dashboard/estimates/site-visits/[id] now redirects here).
// Recording a NEW visit stays on the phone [Q6 → B].

export default async function DesktopSiteVisitPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  // Subcontractors and clients never reach /dashboard (middleware + layout), and
  // RLS gives them no site_visits row either — getSiteVisit() is null → 404.
  const office = !!profile && ['owner', 'admin', 'project_manager'].includes(profile.role);

  const detail = await getSiteVisit(params.id);
  if (!detail) notFound();
  const access = await getSiteVisitAccess(params.id);
  const who = detail.visit.contact
    ? `${detail.visit.contact.first_name} ${detail.visit.contact.last_name}`.trim()
    : null;
  const where = detail.visit.address
    ? `${detail.visit.address.address_line1}, ${detail.visit.address.city}, ${detail.visit.address.state} ${detail.visit.address.zip}`
    : null;

  return (
    <div style={{ maxWidth: '760px' }}>
      <Link href="/dashboard/site-visits" style={{ fontSize: '0.8125rem', color: '#3b4ae0' }}>
        ← Site visits
      </Link>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.5rem 0 0.25rem' }}>{detail.visit.title}</h1>
      <p style={{ color: '#7b8699', fontSize: '0.875rem', marginBottom: '1rem' }}>
        Site visit · {new Date(detail.visit.visited_at).toLocaleDateString()}
        {who ? ` · ${who}` : ''}
        {where ? ` · ${where}` : ''}
        {detail.visit.is_deleted ? ' · ABANDONED' : ''}
      </p>
      {office ? (
        <SiteVisitOfficeActions
          estimateId={params.id}
          promoted={detail.visit.promoted_at != null}
          abandoned={!!detail.visit.is_deleted}
          finishedAt={detail.visit.finished_at}
        />
      ) : null}
      <SiteVisitRecord detail={detail} canWrite={access !== null} viewerUserId={user.id} office={office} />
    </div>
  );
}
