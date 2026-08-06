import { notFound } from 'next/navigation';
import { getProjectPhotos, getUploaderNames } from '@/lib/services/photos';
import { getMyProfile } from '@/lib/services/profiles';
import { PhotoViewer, type ViewerPhoto } from './viewer';

// M6M §4.9 — M-9 · Photo viewer.
//
// The shell renders NO app bar and NO tab bar here (mobile-shell.tsx's
// isDarkCanvasScreen): §4.9 gives this screen its own header and its own 4-up
// action row, and §3.2 says the tab bar is REPLACED by that row, not merely
// hidden (A-1, A-1b).
//
// THE WHOLE GALLERY IS LOADED, not just this file. The viewer needs prev/next,
// `n of m`, and the filmstrip — all three are properties of the SET. Loading
// the set here also means the filmstrip renders each photo's `displayUrl`, so
// the derivative rule holds on the third surface too (A-23g) rather than only
// where it is most obvious.

/** §4.9's Source row — the record the photo belongs to (A-25c). */
function sourceLink(
  photo: { source: string | null; sourceId: string | null },
  projectId: string
): { label: string | null; href: string | null } {
  switch (photo.source) {
    case 'log':
      // M-6 is the logs list; a per-log mobile route is not in §1's tree, so
      // this lands on the list rather than inventing a destination.
      return { label: 'Daily log', href: `/m/logs?project=${projectId}` };
    case 'delivery':
      return { label: 'Delivery', href: `/m/p/${projectId}/deliveries` };
    case 'safety':
      return { label: 'Safety incident', href: `/m/p/${projectId}/safety` };
    case 'punch':
      return { label: 'Punch item', href: `/m/p/${projectId}/punch` };
    default:
      // §4.8: a photo's badge is its provenance — never invent one. A photo
      // with no link column has no source, and the row says so.
      return { label: null, href: null };
  }
}

export default async function PhotoViewerPage({
  params,
}: {
  params: { projectId: string; fileId: string };
}) {
  const [photos, profile] = await Promise.all([
    getProjectPhotos(params.projectId),
    getMyProfile(),
  ]);

  const index = photos.findIndex((p) => p.id === params.fileId);
  if (index === -1) notFound();

  const names = await getUploaderNames(photos.map((p) => p.created_by ?? '').filter(Boolean));

  const rows: ViewerPhoto[] = photos.map((p) => {
    const link = sourceLink(p, params.projectId);
    return {
      id: p.id,
      file_name: p.file_name,
      displayUrl: p.displayUrl,
      originalUrl: p.originalUrl,
      hasMarkup: p.hasMarkup,
      derivativeMissing: p.derivativeMissing,
      source: p.source,
      sourceId: p.sourceId,
      sourceLabel: link.label,
      sourceHref: link.href,
      takenAt: p.created_at,
      by: p.created_by ? (names.get(p.created_by) ?? null) : null,
      tags: [...(p.tags ?? []), ...(p.ai_tags ?? [])],
    };
  });

  // A-25d — `files_delete_owner_admin` restricts DELETE to Owner/Admin. The UI
  // must not offer an action the DB will reject, so the tile is absent rather
  // than present-and-failing for every other role.
  const canDelete = profile?.role === 'owner' || profile?.role === 'admin';

  return (
    <PhotoViewer
      photos={rows}
      index={index}
      projectId={params.projectId}
      canDelete={canDelete}
    />
  );
}
