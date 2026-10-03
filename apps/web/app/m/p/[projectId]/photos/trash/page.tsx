import { redirect } from 'next/navigation';
import { getMyProfile } from '@/lib/services/profiles';
import { getPhotoTrash } from '@/lib/services/photos';
import { canDeletePhoto } from '@/lib/photos/delete-permission';
import { getMobileT } from '@/lib/i18n/server';
import { SetMobileHeader } from '../../../../mobile-header';
import { MobilePhotoTrash } from './mobile-photo-trash';

// S127 item 4a — the /m photo trash, with restore. Before this, a photo deleted
// on /m (grid bulk delete or the viewer) had NO way back on mobile at all. The
// same reader and the same restore as desktop (lib/services/photos.ts,
// lib/photos/use-restore-photo.ts); the same roles (canDeletePhoto).

export default async function MobilePhotoTrashPage({ params }: { params: { projectId: string } }) {
  const [profile, t] = await Promise.all([getMyProfile(), getMobileT()]);
  if (!profile) redirect('/sign-in');
  if (!canDeletePhoto(profile.role)) redirect(`/m/p/${params.projectId}/photos`);

  const trashed = await getPhotoTrash(params.projectId);

  return (
    <div className="px-[18px] pb-[18px] pt-[14px]">
      <SetMobileHeader
        title={t('photos.trash.title')}
        sub={t('photos.trash.sub', { n: trashed.length })}
      />
      <p className="text-[13px] text-m6m-muted">{t('photos.trash.note')}</p>
      {trashed.length === 0 ? (
        <p
          data-testid="m-photos-trash-empty"
          className="mt-[18px] text-center text-[14px] text-m6m-muted"
        >
          {t('photos.trash.empty')}
        </p>
      ) : (
        <MobilePhotoTrash photos={trashed} />
      )}
    </div>
  );
}
