import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getMyProfile } from '@/lib/services/profiles';
import { getSiteVisit, getSiteVisitAccess } from '@/lib/services/site-visits';
import { SiteVisitRecord } from '@/components/site-visits/site-visit-record';
import { SetMobileHeader } from '../../mobile-header';

// S108 Spec A — one site visit on the phone. The record is read ONLY from the
// money-free site_visit_* tables under their SELECT policies, so a crew member
// who recorded it keeps reading it after it becomes an estimate — and never
// receives the estimate row. Whether they may still WRITE comes from
// site_visit_access() in the database, not from anything on this page.

export default async function SiteVisitPage({ params }: { params: { id: string } }) {
  const detail = await getSiteVisit(params.id);
  if (!detail || detail.visit.is_deleted) notFound();

  const [access, profile] = await Promise.all([getSiteVisitAccess(params.id), getMyProfile()]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const who = detail.visit.contact
    ? `${detail.visit.contact.first_name} ${detail.visit.contact.last_name}`.trim()
    : null;
  const where = detail.visit.address
    ? `${detail.visit.address.address_line1}, ${detail.visit.address.city}`
    : null;

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title={detail.visit.title} sub={[who, where].filter(Boolean).join(' · ') || null} />
      <SiteVisitRecord
        detail={detail}
        canWrite={access !== null}
        viewerUserId={user?.id ?? ''}
        office={access === 'office' || ['owner', 'admin', 'project_manager'].includes(profile?.role ?? '')}
      />
    </div>
  );
}
