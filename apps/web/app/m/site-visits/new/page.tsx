import { DASHBOARD_ROLES } from '@framefocus/shared/constants/roles';
import type { CompanyRole } from '@framefocus/shared';
import { getMyProfile } from '@/lib/services/profiles';
import { listContactOptions } from '@/lib/services/site-visits';
import { SetMobileHeader } from '../../mobile-header';
import { EmptyState } from '../../mobile-ui';
import { NewSiteVisitForm } from './new-visit-form';
import { getMobileT } from '@/lib/i18n/server';

// S108 Spec A — record a new site visit. Any internal role (RULED). The
// contact and address may be existing or new; either way the database creates
// them inside create_site_visit(), so no contact policy is widened (FILL-A10).

export default async function NewSiteVisitPage() {
  const t = await getMobileT();
  const profile = await getMyProfile();
  if (!profile || !DASHBOARD_ROLES.includes(profile.role as CompanyRole)) {
    return (
      <div className="px-[18px] pb-[18px] pt-[14px]">
        <SetMobileHeader title={t('photos.sv.newTitle')} sub={null} />
        <EmptyState>{t('photos.sv.staffOnly')}</EmptyState>
      </div>
    );
  }
  const contacts = await listContactOptions();
  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title={t('photos.sv.newTitle')} sub={null} />
      <NewSiteVisitForm contacts={contacts} />
    </div>
  );
}
