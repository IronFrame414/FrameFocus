'use client';

import Link from 'next/link';
import { useT } from '@/components/i18n/language-provider';
import { STATUS_KEY, isActive, isOverdue } from '@/lib/material-signouts/signout';
import type { SignoutListItem } from '@/lib/services/material-signouts';

// S118 item 11 — a project's sign-outs, desktop and /m (PARITY: one list, one
// overdue rule). Active records (awaiting signature, or out) sort first, because
// a record nobody is shown is a record nobody closes.

const pill = 'rounded-full px-[8px] py-[2px] text-[11px] font-semibold';

export function statusTone(status: SignoutListItem['status'], overdue: boolean): string {
  if (overdue) return 'bg-[#fbe4e2] text-[#c0362c]';
  if (status === 'pending_receipt') return 'bg-[#fdf1dc] text-[#8a5a00]';
  if (status === 'open') return 'bg-[#e8edfb] text-[#2f49d1]';
  if (status === 'returned') return 'bg-[#e4f0e6] text-[#3d7a4b]';
  return 'bg-[#fbe4e2] text-[#c0362c]';
}

export function SignoutList({
  items,
  today,
  hrefBase,
}: {
  items: SignoutListItem[];
  today: string;
  /** The record route without the id — a string, since a server page renders this. */
  hrefBase: string;
}) {
  const t = useT();
  if (items.length === 0) {
    return (
      <div className="rounded-[13px] border border-[#e6e9ef] bg-white p-6 text-sm text-[#6b7280]">
        {t('signout.empty')}
      </div>
    );
  }
  // Stable: active first, then the order the read gave (newest first).
  const sorted = [...items].sort((a, b) => Number(isActive(b)) - Number(isActive(a)));
  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((s) => {
        const overdue = isOverdue(s, today);
        return (
          <li key={s.id}>
            <Link
              href={`${hrefBase}/${s.id}`}
              data-testid="signout-row"
              data-status={s.status}
              data-overdue={overdue ? 'true' : 'false'}
              className="flex items-center justify-between gap-3 rounded-[13px] border border-[#e6e9ef] bg-white px-4 py-[12px] transition-colors hover:border-[#c9d2e4]"
            >
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold text-[#14213d]">
                  {s.material_type} · {s.quantity}
                </p>
                <p className="mt-[2px] truncate text-[13px] text-[#6b7280]">
                  {s.receiver_company} ·{' '}
                  <span className="font-mono text-[12px]">
                    {t('signout.dueBack', { date: s.expected_return_date })}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`${pill} ${statusTone(s.status, false)}`}>{t(STATUS_KEY[s.status])}</span>
                {overdue ? (
                  <span data-testid="signout-overdue" className={`${pill} ${statusTone(s.status, true)}`}>
                    {t('signout.overdue')}
                  </span>
                ) : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
