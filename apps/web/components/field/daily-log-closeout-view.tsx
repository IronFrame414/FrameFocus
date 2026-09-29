'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/i18n/language-provider';
import { CLOSEOUT_ITEMS, type CloseoutFields, type CloseoutKey } from '@/lib/daily-logs/closeout';
import { markDailyLogReviewed, setMaterialNeedOrdered } from '@/lib/services/daily-logs-client';
import type { DailyLogMaterialNeedRow } from '@/lib/services/daily-logs';

// S118 item 12 — the paper close-out form on a daily log's DETAIL page, desktop
// and /m (PARITY: one component). Read-only for the field; the OFFICE
// (Owner/Admin/PM/PE — `canOffice`) also gets "mark reviewed" and, per section-D
// line, "mark ordered" (RULED actionable: the office marks it, the field sees
// it). The database decides every mark (mark_daily_log_reviewed /
// set_daily_log_material_ordered re-check role and project); `canOffice` only
// decides which buttons render.

const box = 'rounded-[12px] border border-gray-200 bg-white p-4';
const head = 'mb-2 text-[12px] font-semibold uppercase tracking-wide text-gray-500';

export function DailyLogCloseoutView({
  logId,
  closeout,
  needs,
  reviewedAt,
  reviewerName,
  canOffice,
}: {
  logId: string;
  closeout: CloseoutFields;
  needs: DailyLogMaterialNeedRow[];
  reviewedAt: string | null;
  reviewerName: string | null;
  canOffice: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(key: string, fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    const r = await fn();
    setBusy(null);
    if (!r.success) setError(r.error ?? null);
    router.refresh();
  }

  const answered = CLOSEOUT_ITEMS.some((i) => closeout[i.key as CloseoutKey] !== null);

  return (
    <div className="flex flex-col gap-4" data-testid="log-closeout-view">
      {/* Footer: office reviewed / actioned */}
      <section className={box} data-testid="log-review">
        {reviewedAt ? (
          <p className="text-[14px]" data-testid="log-reviewed">
            {t('field.review.reviewedBy', { name: reviewerName ?? '—' })} ·{' '}
            {new Date(reviewedAt).toLocaleString()}
          </p>
        ) : (
          <p className="text-[14px] text-amber-800" data-testid="log-not-reviewed">
            {t('field.review.notReviewed')}
          </p>
        )}
        {canOffice ? (
          <button
            type="button"
            data-testid="log-review-toggle"
            disabled={busy !== null}
            onClick={() => void act('review', () => markDailyLogReviewed(logId, !reviewedAt))}
            className="mt-2 rounded-[8px] border border-gray-300 px-3 py-[6px] text-[13px] font-semibold disabled:opacity-50"
          >
            {reviewedAt ? t('field.review.unmark') : t('field.review.mark')}
          </button>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-[13px] text-red-700">
            {error}
          </p>
        ) : null}
      </section>

      {/* A */}
      {answered || closeout.photos_sent_at ? (
        <section className={box} data-testid="log-view-a">
          <h3 className={head}>{t('field.closeout.title')}</h3>
          <ul className="flex flex-col gap-[4px] text-[14px]">
            {CLOSEOUT_ITEMS.map((i) => {
              const v = closeout[i.key as CloseoutKey];
              return (
                <li key={i.key} data-testid={`view-${i.key}`} data-value={String(v)}>
                  {v === true ? '✓' : v === false ? '✗' : '·'} {t(i.labelKey)}
                </li>
              );
            })}
          </ul>
          {closeout.photos_sent_at ? (
            <p className="mt-2 text-[13px]" data-testid="view-photos-sent-at">
              {t('field.closeout.photosSentAt')}:{' '}
              {new Date(closeout.photos_sent_at).toLocaleString()}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* C — the dates and the day after (tomorrow's text renders with the log's own fields) */}
      {closeout.tasks_tomorrow_date || closeout.tasks_day_after || closeout.tasks_day_after_date ? (
        <section className={box} data-testid="log-view-c">
          <h3 className={head}>{t('field.lookahead.title')}</h3>
          {closeout.tasks_tomorrow_date ? (
            <p className="text-[14px]">
              {t('field.lookahead.tomorrow')}: {closeout.tasks_tomorrow_date}
            </p>
          ) : null}
          {closeout.tasks_day_after || closeout.tasks_day_after_date ? (
            <p className="text-[14px]" data-testid="view-day-after">
              {t('field.lookahead.dayAfter')}
              {closeout.tasks_day_after_date ? ` (${closeout.tasks_day_after_date})` : ''}:{' '}
              {closeout.tasks_day_after ?? ''}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* D — with the office's ordered state */}
      <section className={box} data-testid="log-view-d">
        <h3 className={head}>{t('field.needs.title')}</h3>
        {needs.length === 0 ? (
          <p className="text-[14px] text-gray-500">{t('field.needs.none')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {needs.map((n) => (
              <li
                key={n.id}
                className="text-[14px]"
                data-testid="view-need"
                data-ordered={n.ordered_at ? 'true' : 'false'}
              >
                <span className="font-semibold">{n.item}</span>
                {n.qty != null ? ` · ${n.qty}${n.unit ? ` ${n.unit}` : ''}` : ''}
                {n.needed_by ? ` · ${t('field.needs.neededBy')} ${n.needed_by}` : ''}
                {n.vendor_source ? ` · ${n.vendor_source}` : ''}
                <span className={`ml-2 ${n.ordered_at ? 'text-green-700' : 'text-amber-800'}`}>
                  {n.ordered_at
                    ? t('field.needs.orderedBy', { name: n.orderer?.display_name ?? '—' })
                    : t('field.needs.notOrdered')}
                </span>
                {canOffice ? (
                  <button
                    type="button"
                    data-testid="need-order-toggle"
                    disabled={busy !== null}
                    onClick={() =>
                      void act(n.id, () => setMaterialNeedOrdered(n.id, !n.ordered_at))
                    }
                    className="ml-2 rounded-[8px] border border-gray-300 px-2 py-[2px] text-[12px] font-semibold disabled:opacity-50"
                  >
                    {n.ordered_at ? t('field.needs.unmarkOrdered') : t('field.needs.markOrdered')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* E */}
      {closeout.blockers ? (
        <section className={box} data-testid="log-view-e">
          <h3 className={head}>{t('field.blockers.title')}</h3>
          <p className="whitespace-pre-wrap text-[14px]">{closeout.blockers}</p>
        </section>
      ) : null}
    </div>
  );
}
