import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadSiteVisitMarkup } from '@/lib/site-visits/markup-page';
import { getMobileT } from '@/lib/i18n/server';
import { MeasureThenEdit } from '@/app/m/p/[projectId]/photos/[fileId]/markup/measure-then-edit';

// [S114 C-8, RULED Josh 2026-09-28] Mark up a SITE-VISIT photo on the phone.
// The SAME canvas as a project photo (MeasureThenEdit → MarkupCanvas →
// saveMarkup) — only the save target differs: the site-visit route, which runs
// the shared authorizeSiteVisitMarkup() check (lib/site-visits/markup-access.ts).
// Desktop twin: app/dashboard/site-visits/[id]/photos/[fileId]/markup.
//
// A FROZEN photo (captured at or before the send — per photo, Q10 A) never
// opens the editor: it shows WHY, the same notice its tile carries.

export default async function SiteVisitPhotoMarkupPage({
  params,
}: {
  params: { id: string; fileId: string };
}) {
  const data = await loadSiteVisitMarkup(params.id, params.fileId);
  const back = `/m/site-visits/${params.id}`;

  if (!data.ok) {
    if (data.status === 404) notFound();
    const t = await getMobileT();
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-[14px] bg-m6m-canvas px-[18px]">
        <p
          data-testid={data.frozen ? 'sv-markup-frozen' : 'sv-markup-refused'}
          className="text-center text-[15px] text-white"
        >
          {data.frozen ? t('visit.photos.frozenNotice') : data.error}
        </p>
        <Link href={back} className="text-[15px] font-semibold text-m6m-muted-navy underline">
          {t('visit.photos.backToVisit')}
        </Link>
      </div>
    );
  }

  const dims =
    data.markup && data.markup.imageWidth > 0 && data.markup.imageHeight > 0
      ? { w: data.markup.imageWidth, h: data.markup.imageHeight }
      : null;

  return (
    <MeasureThenEdit
      fileId={data.fileId}
      filePath={data.filePath}
      fileName={data.fileName}
      originalUrl={data.originalUrl}
      initialShapes={data.markup?.shapes ?? []}
      dims={dims}
      returnHref={back}
      saveTarget={{ kind: 'site_visit', estimateId: params.id }}
    />
  );
}
