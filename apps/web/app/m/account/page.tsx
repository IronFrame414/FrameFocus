import { redirect } from 'next/navigation';
import { getMyProfile } from '@/lib/services/profiles';
import { getCompany } from '@/lib/services/company';
import { NameForm } from '@/components/account/name-form';
import { SetMobileHeader } from '../mobile-header';

// Personal name edit on mobile — reachable by every /m role (linked from
// Settings, which stays READ-ONLY per §4.13.7 / A-48). Shares the ONE NameForm
// + updateMyName mechanism with the desktop page (parity S122). Name only.
export default async function MobileAccountPage() {
  const [profile, company] = await Promise.all([getMyProfile(), getCompany()]);
  if (!profile) redirect('/sign-in');

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title="Your name" sub={company?.name ?? null} />
      <section className="mt-[14px] rounded-[15px] border border-m6m-border bg-m6m-card p-[16px]">
        <NameForm
          initialFirstName={profile.first_name ?? ''}
          initialLastName={profile.last_name ?? ''}
        />
      </section>
    </div>
  );
}
