'use client';

import { useT } from '@/components/i18n/language-provider';
import { CLIENT_PHOTO_SKIP_REASONS, type ClientPhotoSkipReason } from '@/lib/daily-logs/closeout';

/**
 * S127 item 5a — BOX C IS NOW THE CLIENT-FACING PHOTO. [RULED Josh: a dedicated
 * slot (#4); more than one, no cap (#6); a photo OR a one-tap reason (option B).]
 *
 * ⚠️ A DEDICATED SLOT, not a tick on one of the log's photos: a crew member must
 * never be unsure which pictures the client can see. Photos added HERE are
 * shared (files.client_visible); the log's other photos stay internal.
 *
 * ⚠️ TWO THINGS THE SCREEN SAYS, so nobody discovers them later:
 *   1. a client with documents-only portal access sees NO photos — the flag is
 *      necessary, not sufficient (`client_has_full_access()`);
 *   2. a photo that gets marked up is shown to the client MARKED UP.
 *
 * Shared by /m and desktop through DailyLogCloseoutFields (PARITY).
 */
export function DailyLogClientPhoto({
  files,
  onFilesChange,
  reason,
  onReasonChange,
}: {
  files: File[];
  onFilesChange: (next: File[]) => void;
  reason: ClientPhotoSkipReason | null;
  onReasonChange: (next: ClientPhotoSkipReason | null) => void;
}) {
  const t = useT();
  const satisfied = files.length > 0 || reason !== null;
  return (
    <section
      className="rounded-[12px] border border-gray-200 bg-white p-4"
      data-testid="log-closeout-c"
    >
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-gray-500">
        {t('field.clientPhoto.title')}
      </h3>
      <p className="text-[13px] text-gray-700">{t('field.clientPhoto.help')}</p>
      <ul className="mt-2 list-disc pl-5 text-[12px] text-gray-500">
        <li>{t('field.clientPhoto.docsOnly')}</li>
        <li>{t('field.clientPhoto.markup')}</li>
      </ul>

      <label
        className="mt-3 flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-[10px] border border-blue-600 text-[15px] font-semibold text-blue-700"
        data-testid="client-photo-add"
      >
        {t('field.clientPhoto.add')}
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          data-testid="client-photo-input"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length > 0) {
              onFilesChange([...files, ...picked]);
              onReasonChange(null); // a photo answers the question; no reason is stored
            }
            e.target.value = '';
          }}
        />
      </label>

      {files.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1" data-testid="client-photo-list">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between text-[13px] text-gray-800"
            >
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                className="ml-2 text-[13px] text-red-700"
                onClick={() => onFilesChange(files.filter((_, j) => j !== i))}
              >
                {t('field.clientPhoto.remove')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3" data-testid="client-photo-reasons">
          <p className="mb-1 text-[13px] text-gray-700">{t('field.clientPhoto.noneTitle')}</p>
          <div className="flex flex-wrap gap-2">
            {CLIENT_PHOTO_SKIP_REASONS.map((r) => {
              const on = reason === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  data-testid={`client-photo-reason-${r.value}`}
                  aria-pressed={on}
                  onClick={() => onReasonChange(on ? null : r.value)}
                  className={`min-h-[44px] rounded-[10px] border px-3 text-[14px] ${
                    on
                      ? 'border-blue-700 bg-blue-700 text-white'
                      : 'border-gray-300 bg-white text-gray-800'
                  }`}
                >
                  {t(r.labelKey)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!satisfied ? (
        <p
          className="mt-2 text-[12px] font-semibold text-amber-700"
          data-testid="client-photo-required"
        >
          {t('field.clientPhoto.required')}
        </p>
      ) : null}
    </section>
  );
}
