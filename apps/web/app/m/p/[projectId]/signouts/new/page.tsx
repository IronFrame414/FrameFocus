import { notFound, redirect } from 'next/navigation';
import { SectionHeader } from '../../section-header';
import { getMobileT } from '@/lib/i18n/server';
import { loadNewSignout } from '@/lib/services/material-signouts';
import { SignoutNewForm } from '@/components/material-signouts/signout-new-form';

// S118 item 11 — a new sign-out on the phone. Same form as the desktop.

export default async function MobileNewSignoutPage({ params }: { params: { projectId: string } }) {
  const [data, t] = await Promise.all([loadNewSignout(params.projectId), getMobileT()]);
  if (!data) notFound();
  if (!data.viewer.canCreate) redirect(`/m/p/${params.projectId}/signouts`);
  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SectionHeader projectId={params.projectId} title={t('signout.new')} />
      <SignoutNewForm
        projectId={params.projectId}
        jobs={data.jobs}
        defaultJobAddress={data.defaultJobAddress}
        defaultSignerName={data.viewer.signerName}
        today={data.today}
        surface="m"
      />
    </div>
  );
}
