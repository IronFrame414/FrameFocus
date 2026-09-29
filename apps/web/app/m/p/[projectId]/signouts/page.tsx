import Link from 'next/link';
import { SectionHeader } from '../section-header';
import { getMobileT } from '@/lib/i18n/server';
import { getMaterialSignouts, getSignoutViewer, signoutToday } from '@/lib/services/material-signouts';
import { SignoutList } from '@/components/material-signouts/signout-list';

// S118 item 11 — M · Material sign-outs, the /m door (primary: used on a phone
// at a tailgate). The list and the record are the SAME components the desktop
// Field tab renders (PARITY); this file decides only the chrome.

export default async function MobileSignoutsPage({ params }: { params: { projectId: string } }) {
  const [items, viewer, today, t] = await Promise.all([
    getMaterialSignouts(params.projectId),
    getSignoutViewer(),
    signoutToday(),
    getMobileT(),
  ]);
  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SectionHeader projectId={params.projectId} title={t('signout.title')} />
      {viewer.canCreate ? (
        <Link
          href={`/m/p/${params.projectId}/signouts/new`}
          data-testid="signout-new"
          className="mb-[14px] flex min-h-[48px] items-center justify-center rounded-[12px] bg-[#2f49d1] text-[15px] font-semibold text-white"
        >
          {t('signout.new')}
        </Link>
      ) : null}
      <SignoutList items={items} today={today} hrefBase={`/m/p/${params.projectId}/signouts`} />
    </div>
  );
}
