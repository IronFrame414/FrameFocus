import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadSiteVisitMarkup } from '@/lib/site-visits/markup-page';
import { SITE_VISIT_FROZEN_ERROR } from '@/lib/site-visits/markup-access';
import MarkupEditor from '@/app/dashboard/projects/[id]/files/[fileId]/markup/markup-editor';

// [S114 C-8, RULED Josh 2026-09-28] Mark up a SITE-VISIT photo on desktop.
// The SAME editor as a project file (MarkupEditor → saveMarkup) — only the
// save target differs: the site-visit route, behind the shared
// authorizeSiteVisitMarkup() check. /m twin:
// app/m/site-visits/[id]/photos/[fileId]/markup. Both load through
// loadSiteVisitMarkup() (lib/site-visits/markup-page.ts).
//
// A FROZEN photo shows WHY — the same notice its tile carries — never an editor
// that the database would refuse.

export default async function DesktopSiteVisitPhotoMarkupPage({
  params,
}: {
  params: { id: string; fileId: string };
}) {
  const data = await loadSiteVisitMarkup(params.id, params.fileId);
  const back = `/dashboard/site-visits/${params.id}`;

  if (!data.ok) {
    if (data.status === 404) notFound();
    return (
      <div style={{ padding: '2rem' }}>
        <p
          data-testid={data.frozen ? 'sv-markup-frozen' : 'sv-markup-refused'}
          style={{ color: '#a00', marginBottom: '1rem' }}
        >
          {data.frozen ? SITE_VISIT_FROZEN_ERROR : data.error}
        </p>
        <Link href={back} style={{ color: '#06c' }}>
          ← Back to the site visit
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link href={back} style={{ color: '#06c', textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Back to the site visit
        </Link>
      </div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
        Markup: {data.fileName}
      </h1>
      <MarkupEditor
        fileId={data.fileId}
        filePath={data.filePath}
        imageUrl={data.originalUrl}
        initialMarkup={data.markup}
        saveTarget={{ kind: 'site_visit', estimateId: params.id }}
        savedHref={back}
      />
    </div>
  );
}
