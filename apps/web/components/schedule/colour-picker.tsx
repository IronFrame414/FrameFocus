'use client';

// S121 5-G — THE SCHEDULE COLOUR PICKER. [RULED Josh, ASK-7] Desktop's team
// profile AND /m's team edit render this one component (PARITY).
//   CREW     auto (a stable per-person colour) or one of the palette swatches.
//   SUB /    NOT editable: the colour is the TRADE's (all electricians share
//   VENDOR   one). No trade → neutral grey, said in words.
// The swatches are the contrast-checked palette only (test/s121-schedule-
// colors.test.ts) — a free hex field could pick an illegible colour.
// SUPERSEDED [/m]: a free-text "Schedule colour (hex)" field.

import { useT } from '@/components/i18n/language-provider';
import {
  SCHEDULE_PALETTE,
  normaliseTrade,
  scheduleColor,
  tradeColor,
} from '@framefocus/shared/utils/schedule-colors';

export function ColourPicker({
  memberId,
  memberType,
  trade,
  value,
  onChange,
  testIdPrefix,
}: {
  memberId: string;
  memberType: string | null;
  trade?: string | null;
  /** company_members.schedule_color; null = auto. */
  value: string | null;
  onChange: (next: string | null) => void;
  testIdPrefix: string;
}) {
  const t = useT();
  if (memberType === 'subcontractor') {
    const c = tradeColor(trade ?? null);
    return (
      <div data-testid={`${testIdPrefix}-trade`} className="flex items-start gap-[10px]">
        <span aria-hidden className="mt-[3px] block h-[22px] w-[22px] shrink-0 rounded-full" style={{ background: c }} />
        <p className="text-[14px] text-[#374151]">
          {t('sched.colour.fromTrade')}
          {normaliseTrade(trade ?? null) ? '' : ` ${t('sched.colour.noTrade')}`}
        </p>
      </div>
    );
  }
  const auto = scheduleColor({ memberId, memberType, explicit: null, trade: null });
  return (
    <div>
      <div className="flex flex-wrap gap-[8px]" role="radiogroup" aria-label={t('sched.colour.label')}>
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          data-testid={`${testIdPrefix}-auto`}
          onClick={() => onChange(null)}
          className="flex h-[44px] items-center gap-[6px] rounded-[10px] border px-[10px] text-[14px] font-semibold"
          style={{ borderColor: value === null ? auto : '#e0e4ea', color: '#14213d' }}
        >
          <span aria-hidden className="block h-[18px] w-[18px] rounded-full" style={{ background: auto }} />
          {t('sched.colour.auto')}
        </button>
        {SCHEDULE_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={c}
            data-testid={`${testIdPrefix}-${c.slice(1)}`}
            onClick={() => onChange(c)}
            className="h-[44px] w-[44px] rounded-[10px] border-[3px]"
            style={{ background: c, borderColor: value === c ? '#14213d' : 'transparent' }}
          />
        ))}
      </div>
      <p className="mt-[6px] text-[12px] text-[#6b7280]">{t('sched.colour.autoHelp')}</p>
    </div>
  );
}
