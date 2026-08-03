'use client';

// Money representation §7.1 S-2 (as amended 2026-07-31, S95) — the shared
// SINGLE-select budget-line picker for the 7C surfaces: sub-contract stage
// setup (Miscellaneous EXCLUDED — S94 force-targets: stages always target a
// real line) and PO total entry (Miscellaneous INCLUDED). Options are
// grouped by instrument via the split editor's groupLabel; Miscellaneous
// renders as MISC_SENTINEL (existing line or not) and the CALLER resolves
// it via getOrCreateMiscBudgetLine at save. Budgeted amounts render only
// when hideAmounts is false (Financial Visibility Floor — UI-gated, §5.4).

import { useEffect, useState } from 'react';
import {
  listProjectBudgetLines,
  type BudgetLineOption,
} from '@/lib/services/expenses-client';
import {
  MISC_SENTINEL,
  budgetLineOptionLabel,
  groupLabel,
} from '@/components/expenses/budget-split-editor';

export { MISC_SENTINEL };

interface BudgetLineSelectProps {
  projectId: string;
  /** '' = unpicked; MISC_SENTINEL = Miscellaneous (when included); else a
   *  project_budget_items id. */
  value: string;
  onChange: (value: string) => void;
  /** S94 force-targets surfaces (sub stages): no Miscellaneous option. */
  excludeMiscellaneous?: boolean;
  /** Floor: budgeted figures are Owner/Admin only. */
  hideAmounts?: boolean;
  disabled?: boolean;
  /** Preloaded options — skips the internal fetch (multi-row parents fetch
   *  once and share). */
  lines?: BudgetLineOption[] | null;
  style?: React.CSSProperties;
}

export function BudgetLineSelect({
  projectId,
  value,
  onChange,
  excludeMiscellaneous,
  hideAmounts,
  disabled,
  lines: linesProp,
  style,
}: BudgetLineSelectProps) {
  const [fetched, setFetched] = useState<BudgetLineOption[] | null>(null);
  const external = linesProp !== undefined;
  const lines = external ? linesProp : fetched;

  useEffect(() => {
    if (external || !projectId) return;
    let cancelled = false;
    void listProjectBudgetLines(projectId).then((rows) => {
      if (!cancelled) setFetched(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, external]);

  const visible = (lines ?? []).filter((l) => !(excludeMiscellaneous && l.is_miscellaneous));
  const hasMiscLine = (lines ?? []).some((l) => l.is_miscellaneous);

  // Group options by instrument (Original Contract / one group PER CO /
  // ad-hoc+misc) — CO labels come embedded on the option rows (S95 fix).
  const groups = new Map<string, BudgetLineOption[]>();
  for (const l of visible) {
    const label = groupLabel(l);
    const list = groups.get(label) ?? [];
    list.push(l);
    groups.set(label, list);
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || !projectId}
      style={style}
    >
      <option value="">
        {lines === null ? 'Loading lines…' : 'Select a budget line…'}
      </option>
      {!excludeMiscellaneous && !hasMiscLine && (
        <option value={MISC_SENTINEL}>Miscellaneous</option>
      )}
      {Array.from(groups.entries()).map(([label, groupLines]) => (
        <optgroup key={label} label={label}>
          {groupLines.map((l) => (
            <option key={l.id} value={l.is_miscellaneous ? MISC_SENTINEL : l.id}>
              {budgetLineOptionLabel(l, !hideAmounts)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
