import { redirect } from 'next/navigation';
import { getMyProfile } from '@/lib/services/profiles';
import { getCompany } from '@/lib/services/company';
import { NameForm } from '@/components/account/name-form';
import { PasswordForm } from '@/components/account/password-form';
import { LanguageForm } from '@/components/account/language-form';
import { getMobileT } from '@/lib/i18n/server';
import { SetMobileHeader } from '../mobile-header';

// Personal account on mobile — reachable by every /m role, subcontractors
// included (linked from Settings, which stays READ-ONLY per §4.13.7 / A-48).
// Shares the ONE NameForm + updateMyName and, since S109 #162, the ONE
// PasswordForm + changeMyPassword with the desktop page (parity S122).
export default async function MobileAccountPage() {
  const [profile, company, t] = await Promise.all([getMyProfile(), getCompany(), getMobileT()]);
  if (!profile) redirect('/sign-in');

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader title={t('account.title')} sub={company?.name ?? null} />
      <section className="mt-[14px] rounded-[15px] border border-m6m-border bg-m6m-card p-[16px]">
        <NameForm
          initialFirstName={profile.first_name ?? ''}
          initialLastName={profile.last_name ?? ''}
        />
      </section>
      <section className="mt-[14px] rounded-[15px] border border-m6m-border bg-m6m-card p-[16px]">
        <h2 className="mb-[12px] text-[15px] font-semibold text-m6m-navy">
          {t('account.password')}
        </h2>
        <PasswordForm />
      </section>
      {/* S110 H, ruling 1 — the language toggle, same form as the desktop page. */}
      <section className="mt-[14px] rounded-[15px] border border-m6m-border bg-m6m-card p-[16px]">
        <LanguageForm initial={profile.language} />
      </section>
    </div>
  );
}
