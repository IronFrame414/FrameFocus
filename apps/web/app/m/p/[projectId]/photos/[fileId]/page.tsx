import { notFound } from 'next/navigation';
import { getProjectPhotos, getReceiptFile, getUploaderNames } from '@/lib/services/photos';
import { getMyProfile } from '@/lib/services/profiles';
import { PhotoViewer, type ViewerPhoto } from './viewer';
import { getMobileT } from '@/lib/i18n/server';
import type { T } from '@/lib/i18n/messages';

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
  projectId: string,
  t: T
): { label: string | null; href: string | null } {
  switch (photo.source) {
    case 'log':
      // M-6 is the logs list; a per-log mobile route is not in §1's tree, so
      // this lands on the list rather than inventing a destination.
      return { label: t('photos.sourceRow.log'), href: `/m/logs?project=${projectId}` };
    case 'delivery':
      return { label: t('photos.sourceRow.delivery'), href: `/m/p/${projectId}/deliveries` };
    case 'safety':
      return { label: t('photos.sourceRow.safety'), href: `/m/p/${projectId}/safety` };
    case 'punch':
      return { label: t('photos.sourceRow.punch'), href: `/m/p/${projectId}/punch` };
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
  const [gallery, profile, t] = await Promise.all([
    getProjectPhotos(params.projectId, { thumbnails: true }),
    getMyProfile(),
    getMobileT(),
  ]);

  // M-9's SUBJECT IS NOT ONLY THE GALLERY [S107].
  //
  // A receipt is an image a field user needs to look at, and M-26 links here
  // for exactly that. It is NOT a gallery member — §4.8 is the project's photo
  // grid, and a receipt belongs to an expense — so it is resolved on its own
  // and shown as a SET OF ONE. That is what keeps prev/next, `n of m` and the
  // filmstrip honest: a receipt has no neighbours, so it is not given any.
  //
  // Before this, every receipt link 404'd — 100% of them, because M-26 uploads
  // receipts as category 'receipts' and this page resolved only 'photos'.
  const galleryIndex = gallery.findIndex((p) => p.id === params.fileId);
  const receipt =
    galleryIndex === -1 ? await getReceiptFile(params.projectId, params.fileId) : null;
  if (galleryIndex === -1 && !receipt) notFound();

  const photos = receipt ? [receipt] : gallery;
  const index = receipt ? 0 : galleryIndex;

  const names = await getUploaderNames(photos.map((p) => p.created_by ?? '').filter(Boolean));

  const rows: ViewerPhoto[] = photos.map((p) => {
    const link = sourceLink(p, params.projectId, t);
    return {
      id: p.id,
      file_name: p.file_name,
      displayUrl: p.displayUrl,
      // [S111 D] The filmstrip's 52px squares — the stored thumbnail, or the
      // full file when there is none (ruled fallback). The stage keeps displayUrl.
      thumbUrl: p.thumbUrl,
      originalUrl: p.originalUrl,
      hasMarkup: p.hasMarkup,
      // [S112 R1] Save / Share rebuild full resolution from original + this.
      markup: p.markup,
      filePath: p.file_path,
      markupFingerprint: p.markupFingerprint,
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
      // MARKUP IS FOR PHOTOS, NOT RECEIPTS. This hides the entry point; the
      // rule is enforced independently by getPhoto()'s category filter, so a
      // hand-typed /markup URL 404s rather than relying on a hidden control.
      canMarkup={receipt === null}
    />
  );
}
