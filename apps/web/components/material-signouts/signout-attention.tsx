'use client';

import Link from 'next/link';
import { useT } from '@/components/i18n/language-provider';

// S118 item 11 — "a record nobody is shown is a record nobody closes": the
// desktop Field tab's landing (daily logs) names the project's ACTIVE sign-outs
// and how many are overdue. Renders nothing when none is active.

export function SignoutAttention({ projectId, active, overdue }: { projectId: string; active: number; overdue: number }) {
  const t = useT();
  if (active === 0) return null;
  return (
    <Link
      href={`/dashboard/field-ops/${projectId}/signouts`}
      data-testid="signout-attention"
      className={`mb-4 flex items-center justify-between rounded-[11px] border px-4 py-[10px] text-[13px] font-semibold ${
        overdue > 0 ? 'border-[#f5c6c0] bg-[#fbe4e2] text-[#c0362c]' : 'border-[#f3dfb5] bg-[#fdf1dc] text-[#8a5a00]'
      }`}
    >
      <span>
        {overdue > 0 ? t('signout.attention', { active, overdue }) : t('signout.attentionNone', { active })}
      </span>
      <span>{t('signout.viewAll')} ›</span>
    </Link>
  );
}
