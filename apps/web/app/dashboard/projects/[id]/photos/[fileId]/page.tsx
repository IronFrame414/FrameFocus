import { notFound } from 'next/navigation';
import { getProjectPhotos, getUploaderNames } from '@/lib/services/photos';
import { getMyProfile } from '@/lib/services/profiles';
import { dateLocale } from '@/lib/i18n/dates';
import { formatTakenAt } from '@/lib/photos/format-taken';
import { DesktopPhotoView, type DesktopViewPhoto } from './desktop-photo-view';
import { getProjectCoverFileId } from '@/lib/services/project-covers';
import { canSetProjectCover } from '@/lib/projects/cover-access';

// S127 item 4b — THE DESKTOP SINGLE VIEW (A-2 … A-5).
//
// A-2: a tile used to open straight into the markup editor — viewing and
// annotating are different intentions. This opens in VIEW mode; markup is a
// button. A-3: the photo fits the viewport HEIGHT (a phone portrait used to be
// two screens tall). A-4: date, time and who took it, through the SAME
// formatter /m uses. A-5: previous / next, and the arrow keys.
//
// ⚠️ THE GALLERY IS READ ONCE, HERE. Moving between photos happens in the client
// and only REPLACES the URL — it never re-runs this page. /m's viewer re-reads
// and re-signs the whole gallery on every swipe (S125 finding 3); adding
// next/previous to desktop the same way would have multiplied that defect.
// A deep link (`/photos/{id}`) still works cold: it is this page.

export default async function DesktopPhotoPage({
  params,
}: {
  params: { id: string; fileId: string };
}) {
  const [gallery, profile, coverFileId] = await Promise.all([
    getProjectPhotos(params.id, { photoView: true }),
    getMyProfile(),
    getProjectCoverFileId(params.id),
  ]);
  const index = gallery.findIndex((p) => p.id === params.fileId);
  if (index === -1) notFound();

  const names = await getUploaderNames(gallery.map((p) => p.created_by ?? '').filter(Boolean));
  const locale = dateLocale(profile?.language ?? 'en');

  const photos: DesktopViewPhoto[] = gallery.map((p) => ({
    id: p.id,
    fileName: p.file_name,
    displayUrl: p.displayUrl,
    hasMarkup: p.hasMarkup,
    taken: formatTakenAt(p.created_at, locale),
    by: p.created_by ? (names.get(p.created_by) ?? '—') : '—',
    // [S127 4e] Marked up but no derivative yet: there is no marked-up image to
    // share, and the preview would show the original — so sharing is blocked.
    shareBlocked: p.hasMarkup && p.derivativeMissing,
  }));

  // [S127 4e] Owner/Admin may create a public link (RLS is the real gate).
  const canShare = profile?.role === 'owner' || profile?.role === 'admin';

  return (
    <DesktopPhotoView
      projectId={params.id}
      photos={photos}
      initialIndex={index}
      canShare={canShare}
      canSetCover={canSetProjectCover(profile?.role)}
      coverFileId={coverFileId}
    />
  );
}
