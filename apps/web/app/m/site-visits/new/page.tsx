import { DASHBOARD_ROLES } from '@framefocus/shared/constants/roles';
import type { CompanyRole } from '@framefocus/shared';
import { getMyProfile } from '@/lib/services/profiles';
import { listContactOptions } from '@/lib/services/site-visits';
import { SetMobileHeader } from '../../mobile-header';
import { EmptyState } from '../../mobile-ui';
import { NewSiteVisitForm } from './new-visit-form';

// S108 Spec A — record a new site visit. Any internal role (RULED). The
// contact and address may be existing or new; either way the database creates
// them inside create_site_visit(), so no contact policy is widened (FILL-A10).

export default async function NewSiteVisitPage() {
  const profile = await getMyProfile();
  if (!profile || !DASHBOARD_ROLES.includes(profile.role as CompanyRole)) {
    return (
      <div className="px-[18px] pb-[18px] pt-[14px]">
        <SetMobileHeader title="New site visit" sub={null} />
        <EmptyState>Site visits are recorded by company staff.</EmptyState>
      </div>
    );
  }
  const contacts = await listContactOptions();
  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="New site visit" sub={null} />
      <NewSiteVisitForm contacts={contacts} />
    </div>
  );
}
