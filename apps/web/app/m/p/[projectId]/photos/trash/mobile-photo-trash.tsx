'use client';

import type { TrashedPhoto } from '@/lib/services/photos';
import { useRestorePhoto } from '@/lib/photos/use-restore-photo';
import { useT } from '@/components/i18n/language-provider';

/** S127 item 4a — the /m photo trash rows: thumbnail, name, when, Restore (52px). */
export function MobilePhotoTrash({ photos }: { photos: TrashedPhoto[] }) {
  const t = useT();
  const { restore, busyId, error } = useRestorePhoto();
  return (
    <div className="mt-[14px]">
      {error ? (
        <p
          role="alert"
          data-testid="m-photos-trash-error"
          className="mb-[10px] text-[13px] text-m6m-danger"
        >
          {t('photos.trash.restoreFailed', { error })}
        </p>
      ) : null}
      {photos.map((p) => (
        <div
          key={p.id}
          data-testid="m-photos-trash-item"
          data-file-id={p.id}
          className="mb-[10px] flex items-center gap-[12px] rounded-[14px] border border-m6m-border bg-m6m-card p-[10px]"
        >
          {p.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived URL
            <img
              src={p.thumbUrl}
              alt={p.file_name}
              className="h-[64px] w-[64px] shrink-0 rounded-[10px] object-cover"
            />
          ) : (
            <div className="h-[64px] w-[64px] shrink-0 rounded-[10px] bg-m6m-border" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-m6m-navy">{p.file_name}</p>
            <p className="text-[12px] text-m6m-muted">
              {t('photos.trash.deleted', {
                date: p.deleted_at ? new Date(p.deleted_at).toLocaleDateString() : '—',
              })}
            </p>
          </div>
          <button
            type="button"
            data-testid="m-photos-trash-restore"
            disabled={busyId !== null}
            onClick={() => void restore(p.id)}
            className="min-h-[52px] shrink-0 rounded-[12px] border border-m6m-blue px-[14px] text-[14px] font-bold text-m6m-blue"
          >
            {busyId === p.id ? t('photos.trash.restoring') : t('photos.trash.restore')}
          </button>
        </div>
      ))}
    </div>
  );
}
