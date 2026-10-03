'use client';

import type { TrashedPhoto } from '@/lib/services/photos';
import { useRestorePhoto } from '@/lib/photos/use-restore-photo';
import { cardStyle, color, secondaryButtonStyle } from '@/lib/theme';

/** S127 item 4a — the desktop photo trash: thumbnail, name, when, Restore. */
export function PhotoTrashGrid({ photos }: { photos: TrashedPhoto[] }) {
  const { restore, busyId, error } = useRestorePhoto();
  return (
    <>
      {error ? (
        <p
          role="alert"
          style={{ color: color.danger, fontSize: '13px' }}
          data-testid="photos-trash-error"
        >
          Restore failed: {error}
        </p>
      ) : null}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '12px',
        }}
      >
        {photos.map((p) => (
          <div
            key={p.id}
            data-testid="photos-trash-item"
            data-file-id={p.id}
            style={{ ...cardStyle, overflow: 'hidden' }}
          >
            {p.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived URL; next/image would proxy it
              <img
                src={p.thumbUrl}
                alt={p.file_name}
                style={{ width: '100%', height: '140px', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div style={{ height: '140px', background: color.pageBg }} />
            )}
            <div style={{ padding: '8px 10px', fontSize: '12px', color: color.bodyAlt }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.file_name}
              </div>
              <div style={{ color: color.faint }}>
                Deleted {p.deleted_at ? new Date(p.deleted_at).toLocaleDateString() : '—'}
              </div>
              <button
                type="button"
                data-testid="photos-trash-restore"
                disabled={busyId !== null}
                onClick={() => void restore(p.id)}
                style={{
                  ...secondaryButtonStyle,
                  marginTop: '6px',
                  padding: '4px 10px',
                  fontSize: '12px',
                }}
              >
                {busyId === p.id ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
