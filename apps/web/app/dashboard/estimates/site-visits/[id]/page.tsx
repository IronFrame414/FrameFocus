import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getSiteVisit, getSiteVisitAccess } from '@/lib/services/site-visits';
import { SiteVisitRecord } from '@/components/site-visits/site-visit-record';
import { SiteVisitOfficeActions } from './office-actions';

// S108 Spec A — a site visit on DESKTOP, for the office (owner/admin/PM).
// The record itself is the SAME component the phone renders (PARITY [S122]);
// this page adds only the two office decisions around it: PROMOTE to a draft
// estimate (ASK-A3 — owner/admin/PM; assigns the number) and ABANDON (ASK-A7 —
// soft delete). Both are RPCs; the database refuses anyone else.
// A foreman or crew member records and reads visits on /m — the desktop
// Estimates area stays office-only (§4.13), so this page redirects them.

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
  if (!profile || !['owner', 'admin', 'project_manager'].includes(profile.role)) {
    redirect(`/m/site-visits/${params.id}`);
  }

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
      <Link href="/dashboard/estimates" style={{ fontSize: '0.8125rem', color: '#3b4ae0' }}>
        ← Estimates
      </Link>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.5rem 0 0.25rem' }}>{detail.visit.title}</h1>
      <p style={{ color: '#7b8699', fontSize: '0.875rem', marginBottom: '1rem' }}>
        Site visit · {new Date(detail.visit.visited_at).toLocaleDateString()}
        {who ? ` · ${who}` : ''}
        {where ? ` · ${where}` : ''}
        {detail.visit.is_deleted ? ' · ABANDONED' : ''}
      </p>
      <SiteVisitOfficeActions
        estimateId={params.id}
        promoted={detail.visit.promoted_at != null}
        abandoned={!!detail.visit.is_deleted}
        finishedAt={detail.visit.finished_at}
      />
      <SiteVisitRecord detail={detail} canWrite={access !== null} viewerUserId={user.id} office />
    </div>
  );
}
