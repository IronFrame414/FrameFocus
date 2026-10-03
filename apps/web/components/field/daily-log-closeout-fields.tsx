'use client';

import { useT } from '@/components/i18n/language-provider';
import { DailyLogClientPhoto } from '@/components/field/daily-log-client-photo';
import {
  CLOSEOUT_ITEMS,
  type CloseoutFields,
  type CloseoutKey,
  type MaterialNeedInput,
} from '@/lib/daily-logs/closeout';

// S118 item 12 — the paper close-out form's sections A, C (the dated second
// half), D and E, as ONE component for the desktop form and the /m form
// (PARITY: one mechanism, both surfaces). Section B ("completed today") and C's
// "tomorrow" text stay the existing work_performed / tasks_tomorrow fields of
// each form — nothing is removed. System text through t(): /m renders this.

const box = 'rounded-[12px] border border-gray-200 bg-white p-4';
const head = 'mb-2 text-[12px] font-semibold uppercase tracking-wide text-gray-500';
const field =
  'w-full rounded-[8px] border border-gray-300 px-2 py-[7px] text-[16px] text-gray-900 outline-none focus:border-blue-600';

/** Local "now" in the <input type="datetime-local"> format. */
function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** ISO (with zone) → the datetime-local value the input shows. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function DailyLogCloseoutFields({
  value,
  onChange,
  needs,
  onNeedsChange,
  clientPhotos,
  onClientPhotosChange,
}: {
  value: CloseoutFields;
  onChange: (next: CloseoutFields) => void;
  needs: MaterialNeedInput[];
  onNeedsChange: (next: MaterialNeedInput[]) => void;
  /** [S127 5a] The dedicated client-facing photo slot (box C). */
  clientPhotos?: File[];
  onClientPhotosChange?: (next: File[]) => void;
}) {
  const t = useT();
  const set = <K extends keyof CloseoutFields>(k: K, v: CloseoutFields[K]) =>
    onChange({ ...value, [k]: v });
  const setNeed = (i: number, patch: Partial<MaterialNeedInput>) =>
    onNeedsChange(needs.map((n, j) => (j === i ? { ...n, ...patch } : n)));

  return (
    <div className="flex flex-col gap-4" data-testid="log-closeout">
      {/* A — close-out checklist + photos sent, with the time sent */}
      <section className={box} data-testid="log-closeout-a">
        <h3 className={head}>{t('field.closeout.title')}</h3>
        <ul className="flex flex-col gap-[6px]">
          {CLOSEOUT_ITEMS.map((item) => (
            <li key={item.key}>
              <label className="flex items-center gap-2 text-[14px]">
                <input
                  type="checkbox"
                  data-testid={`closeout-${item.key}`}
                  checked={value[item.key as CloseoutKey] === true}
                  onChange={(e) => set(item.key as CloseoutKey, e.target.checked)}
                />
                {t(item.labelKey)}
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <p className="mb-1 text-[13px] text-gray-700">{t('field.closeout.photosSent')}</p>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="photos-sent-at">
              {t('field.closeout.photosSentAt')}
            </label>
            <input
              id="photos-sent-at"
              type="datetime-local"
              data-testid="closeout-photos-sent-at"
              className={field}
              value={isoToLocalInput(value.photos_sent_at)}
              onChange={(e) =>
                set(
                  'photos_sent_at',
                  e.target.value ? new Date(e.target.value).toISOString() : null
                )
              }
            />
            <button
              type="button"
              className="rounded-[8px] border border-gray-300 px-3 py-[7px] text-[13px]"
              onClick={() => set('photos_sent_at', new Date(nowLocal()).toISOString())}
            >
              {t('field.closeout.now')}
            </button>
          </div>
        </div>
      </section>

      {/* C — [S127 5a, RULED Josh] THE CLIENT-FACING PHOTO, or a reason.
          SUPERSEDED: "C — Next two days" — Tomorrow date (tasks_tomorrow_date),
          Day after (tasks_day_after) and its date (tasks_day_after_date). Josh:
          "the current contents are redundant or useless" — and on iOS an EMPTY
          date input draws today's date, so both read as today (S127 1.4d). The
          columns are KEPT (live data): existing values still show and print. */}
      {clientPhotos && onClientPhotosChange ? (
        <DailyLogClientPhoto
          files={clientPhotos}
          onFilesChange={onClientPhotosChange}
          reason={value.client_photo_skip_reason}
          onReasonChange={(r) => set('client_photo_skip_reason', r)}
        />
      ) : null}

      {/* D — needed on site, not here now (the 48-hour rule) */}
      <section className={box} data-testid="log-closeout-d">
        <h3 className={head}>{t('field.needs.title')}</h3>
        {needs.map((n, i) => (
          <div
            key={n.id ?? `new-${i}`}
            className="mb-3 grid grid-cols-2 gap-2"
            data-testid="need-row"
          >
            <input
              className={`${field} col-span-2`}
              placeholder={t('field.needs.item')}
              aria-label={t('field.needs.item')}
              data-testid="need-item"
              value={n.item}
              onChange={(e) => setNeed(i, { item: e.target.value })}
            />
            <input
              className={field}
              type="number"
              min="0"
              step="any"
              placeholder={t('field.needs.qty')}
              aria-label={t('field.needs.qty')}
              data-testid="need-qty"
              value={n.qty ?? ''}
              onChange={(e) =>
                setNeed(i, { qty: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
            <input
              className={field}
              placeholder={t('field.needs.unit')}
              aria-label={t('field.needs.unit')}
              data-testid="need-unit"
              value={n.unit ?? ''}
              onChange={(e) => setNeed(i, { unit: e.target.value })}
            />
            <input
              className={field}
              type="date"
              aria-label={t('field.needs.neededBy')}
              data-testid="need-needed-by"
              value={n.needed_by ?? ''}
              onChange={(e) => setNeed(i, { needed_by: e.target.value || null })}
            />
            <input
              className={field}
              placeholder={t('field.needs.vendor')}
              aria-label={t('field.needs.vendor')}
              data-testid="need-vendor"
              value={n.vendor_source ?? ''}
              onChange={(e) => setNeed(i, { vendor_source: e.target.value })}
            />
            <button
              type="button"
              className="col-span-2 justify-self-start text-[13px] text-red-700"
              onClick={() => onNeedsChange(needs.filter((_, j) => j !== i))}
            >
              {t('field.needs.remove')}
            </button>
          </div>
        ))}
        <button
          type="button"
          data-testid="need-add"
          className="text-[13px] font-semibold text-blue-700"
          onClick={() =>
            onNeedsChange([
              ...needs,
              { item: '', qty: null, unit: null, needed_by: null, vendor_source: null },
            ])
          }
        >
          + {t('field.needs.add')}
        </button>
      </section>

      {/* E — blockers */}
      <section className={box} data-testid="log-closeout-e">
        <h3 className={head}>{t('field.blockers.title')}</h3>
        <textarea
          data-testid="log-blockers"
          className={field}
          rows={2}
          placeholder={t('field.blockers.hint')}
          aria-label={t('field.blockers.title')}
          value={value.blockers ?? ''}
          onChange={(e) => set('blockers', e.target.value || null)}
        />
      </section>
    </div>
  );
}
