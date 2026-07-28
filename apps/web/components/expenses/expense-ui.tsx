// Shared 7A expense UI atoms (status chip, money/label helpers) — used by the
// capture form, the list screens, the review popup, and the Job Cost tab.
// Deliberately NOT 'use client': no hooks, so it renders in both server trees
// (Job Cost tab) and client trees (list, popups). Type import is erased at
// runtime — no browser-client module is pulled into server bundles.

import type { ExpenseStatus } from '@/lib/services/expenses';
import { badgeStyle, color } from '@/lib/theme';

export function fmtMoney(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

// ui-03 §4 badge system palette (project badges precedent).
const STATUS_BADGES: Record<ExpenseStatus, { bg: string; fg: string }> = {
  pending: { bg: color.warningBg, fg: color.warningDeep },
  approved: { bg: color.successBg, fg: color.successOnBg },
  rejected: { bg: color.neutralBadgeBg, fg: color.dangerAlt },
};

export function ExpenseStatusChip({ status }: { status: ExpenseStatus }) {
  const badge = STATUS_BADGES[status];
  return (
    <span style={{ ...badgeStyle, backgroundColor: badge.bg, color: badge.fg }}>
      {EXPENSE_STATUS_LABELS[status]}
    </span>
  );
}

export const CAPTURE_CATEGORY_LABELS: Record<'material' | 'other', string> = {
  material: 'Material',
  other: 'Other',
};

/** Display labels for ALL stored categories ('subcontractor' arrives via 7C
 *  writers only — never offered at capture, but rows may carry it). */
export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  material: 'Material',
  subcontractor: 'Subcontractor',
  other: 'Other',
};
