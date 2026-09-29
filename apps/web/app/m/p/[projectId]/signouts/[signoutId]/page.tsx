import { notFound } from 'next/navigation';
import { SectionHeader } from '../../section-header';
import { getMobileT } from '@/lib/i18n/server';
import { loadSignoutRecord } from '@/lib/services/material-signouts';
import { SignoutDetailView } from '@/components/material-signouts/signout-detail';

// S118 item 11 — one sign-out on the phone: release photos, the receiver's
// signature on this device, return photos, and (office) the close. Same
// component as the desktop record.

export default async function MobileSignoutPage({
  params,
}: {
  params: { projectId: string; signoutId: string };
}) {
  const [data, t] = await Promise.all([loadSignoutRecord(params.signoutId), getMobileT()]);
  if (!data || data.record.project_id !== params.projectId) notFound();
  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SectionHeader projectId={params.projectId} title={t('signout.title')} />
      <SignoutDetailView
        record={data.record}
        photos={data.photos}
        today={data.today}
        timeZone={data.timeZone}
        canClose={data.viewer.canClose}
        pdfUrl={data.pdfUrl}
        defaultSignerName={data.viewer.signerName}
      />
    </div>
  );
}
