'use client';

import type { Completion } from '@/lib/services/time-tracking-client';
import { useT } from '@/components/i18n/language-provider';

/**
 * S120 2-A — "Is the task finished?", asked whenever a TASK-BOUND segment ends on
 * /m: at clock-out and at a switch.
 *
 * `time_segments_completion_gate_check` requires `completion` once a segment
 * with a `task_id` is ended. The mobile clock-out never asked, so it wrote NULL
 * and the database refused the clock-out; the mobile switch asked only "mark
 * complete", so leaving it unticked wrote NULL too. Desktop's clock modal
 * always required the choice (radio buttons) — this is the same rule on /m.
 *
 * ⚠️ NO DEFAULT. Neither option is pre-selected and nothing is inferred: a
 * completion value is a statement about whether the work got done, and only
 * the person who did it can make it. Both targets are 52px (the 44px floor).
 */
export function CompletionChoice({
  value,
  onChange,
  testIdPrefix,
}: {
  value: Completion | null;
  onChange: (value: Completion) => void;
  testIdPrefix: string;
}) {
  const t = useT();
  const options: { id: Completion; label: string }[] = [
    { id: 'complete', label: t('field.task.complete') },
    { id: 'incomplete', label: t('field.task.incomplete') },
  ];
  return (
    <div role="radiogroup" aria-labelledby={`${testIdPrefix}-label`} data-testid={testIdPrefix}>
      <p
        id={`${testIdPrefix}-label`}
        className="mb-[6px] block text-[14px] font-semibold text-m6m-navy"
      >
        {t('field.task.outcome')} <span className="text-m6m-danger">{t('field.required')}</span>
      </p>
      <div className="flex gap-[8px]">
        {options.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-testid={`${testIdPrefix}-${o.id}`}
              onClick={() => onChange(o.id)}
              className={`flex min-h-[52px] flex-1 items-center justify-center rounded-[12px] border px-[10px] text-[15px] font-bold ${
                on
                  ? 'border-m6m-blue bg-m6m-blue text-white'
                  : 'border-m6m-border bg-m6m-card text-m6m-navy'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
