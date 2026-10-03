import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMyProfile } from '@/lib/services/profiles';
import { getPhotoTrash, PHOTO_TRASH_LIMIT } from '@/lib/services/photos';
import { canDeletePhoto } from '@/lib/photos/delete-permission';
import { cardStyle, color, microLabelStyle } from '@/lib/theme';
import { PhotoTrashGrid } from './photo-trash-grid';

// S127 item 4a — the Photos tab's Trash, with restore. [A-1a-i: the trash must
// render BEFORE bulk delete ships.] Who may see it is who may trash or restore
// a photo (canDeletePhoto — the same list the database enforces, S118); anyone
// else is sent back to the gallery rather than shown a list they cannot act on.

export default async function ProjectPhotoTrashPage({ params }: { params: { id: string } }) {
  const profile = await getMyProfile();
  if (!profile) redirect('/sign-in');
  if (!canDeletePhoto(profile.role)) redirect(`/dashboard/projects/${params.id}/photos`);

  const trashed = await getPhotoTrash(params.id);

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: '12px',
        }}
      >
        <p style={{ ...microLabelStyle, margin: 0 }} data-testid="photos-trash-count">
          Photo trash · {trashed.length}
          {trashed.length >= PHOTO_TRASH_LIMIT ? ` (most recent ${PHOTO_TRASH_LIMIT})` : ''}
        </p>
        <Link
          href={`/dashboard/projects/${params.id}/photos`}
          style={{ color: color.primary, fontSize: '13px' }}
        >
          ← Back to Photos
        </Link>
      </div>
      <p style={{ color: color.muted, fontSize: '13px', margin: '0 0 14px' }}>
        Deleted photos stay here, full resolution, until restored. Anything in the trash for 6
        months is deleted for good automatically.
      </p>
      {trashed.length === 0 ? (
        <div
          style={{ ...cardStyle, padding: '48px', textAlign: 'center', color: color.muted }}
          data-testid="photos-trash-empty"
        >
          The photo trash is empty.
        </div>
      ) : (
        <PhotoTrashGrid photos={trashed} />
      )}
    </div>
  );
}
