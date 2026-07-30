'use client';

// Money representation §7.1 S-2 — the SPLIT-AT-CAPTURE editor, shared by
// every surface that creates an expense/bill (office form, material-run
// sheet, bill modal). Multi-line material orders are routine, not an edge
// case: add budget lines + amounts in the field; one line is the
// single-allocation case; Σ must equal the expense amount before save.
// "Miscellaneous" resolves lazily through get_or_create_misc_budget_item
// (§5.5) at submit time. Budgeted amounts NEVER render here for sub-floor
// roles — line names/cost codes only (§7.1; the floor is UI-gated, §5.4).

import { useEffect, useState } from 'react';
import {
  createBudgetLineAtCapture,
  getOrCreateMiscBudgetLine,
  listProjectBudgetLines,
  type AllocationInput,
  type BudgetLineOption,
} from '@/lib/services/expenses-client';
import { color } from '@/lib/theme';
import { fieldLabelStyle, inputStyle } from '@/components/time/clock-modal';

/** Sentinel option value for the lazily created Miscellaneous line. */
export const MISC_SENTINEL = '__miscellaneous__';

export interface SplitRowDraft {
  key: number;
  budget_item_id: string; // '' = unpicked; MISC_SENTINEL = lazy Miscellaneous
  amount: string; // text input; '' on the only row = "the full amount"
}

export function emptySplit(): SplitRowDraft[] {
  return [{ key: 1, budget_item_id: MISC_SENTINEL, amount: '' }];
}

/** Draft rows → validated allocations. Resolves the Miscellaneous sentinel
 *  (lazy create), defaults a single empty-amount row to the full total, and
 *  enforces Σ = total exactly (service re-validates). */
export async function resolveSplit(
  projectId: string,
  rows: SplitRowDraft[],
  totalAmount: number
): Promise<{ allocations?: AllocationInput[]; error?: string }> {
  if (rows.length === 0) return { error: 'Pick at least one budget line.' };

  const drafts = rows.map((r) => ({
    budget_item_id: r.budget_item_id,
    amount:
      rows.length === 1 && r.amount.trim() === '' ? totalAmount : Number(r.amount),
  }));

  for (const d of drafts) {
    if (!d.budget_item_id) return { error: 'Every split line needs a budget line.' };
    if (Number.isNaN(d.amount) || !(d.amount > 0)) {
      return { error: 'Every split line needs a positive amount.' };
    }
  }
  const sum = Math.round(drafts.reduce((s, d) => s + d.amount, 0) * 100) / 100;
  if (sum !== Math.round(totalAmount * 100) / 100) {
    return {
      error: `The split must add up to the expense amount (split $${sum.toFixed(2)} vs $${totalAmount.toFixed(2)}).`,
    };
  }

  let miscId: string | null = null;
  if (drafts.some((d) => d.budget_item_id === MISC_SENTINEL)) {
    const misc = await getOrCreateMiscBudgetLine(projectId);
    if (!misc.success || !misc.id) {
      return { error: misc.error ?? 'Could not prepare the Miscellaneous line.' };
    }
    miscId = misc.id;
  }

  // Merge duplicate targets (two drafts on one line would violate the
  // UNIQUE (expense_id, budget_item_id) key).
  const merged = new Map<string, number>();
  for (const d of drafts) {
    const id = d.budget_item_id === MISC_SENTINEL ? (miscId as string) : d.budget_item_id;
    merged.set(id, Math.round(((merged.get(id) ?? 0) + d.amount) * 100) / 100);
  }
  return {
    allocations: Array.from(merged.entries()).map(([budget_item_id, amount]) => ({
      budget_item_id,
      amount,
    })),
  };
}

function groupLabel(line: BudgetLineOption, coNumbers: Map<string, string>): string {
  if (line.source_change_order_id) {
    return coNumbers.get(line.source_change_order_id) ?? 'Change order';
  }
  if (line.is_miscellaneous) return 'Ad-hoc & Miscellaneous';
  if (line.source_line_item_id) return 'Original Contract';
  return 'Ad-hoc & Miscellaneous';
}

export function BudgetSplitEditor({
  projectId,
  totalAmount,
  rows,
  onChange,
  callerRole,
  disabled,
}: {
  projectId: string;
  /** Parsed expense amount (NaN/0 while the amount field is empty). */
  totalAmount: number;
  rows: SplitRowDraft[];
  onChange: (rows: SplitRowDraft[]) => void;
  /** Budgeted figures render for Owner/Admin only (floor, UI-gated §5.4). */
  callerRole?: string;
  disabled?: boolean;
}) {
  const [lines, setLines] = useState<BudgetLineOption[] | null>(null);

  // "New budget line" (A-7): Owner/Admin/PM name a bucket in the field —
  // budgeted_amount 0, via the create_budget_line_at_capture RPC (§5.5).
  // Foreman/crew pick existing lines or Miscellaneous.
  const [creatingLine, setCreatingLine] = useState(false);
  const [newLineName, setNewLineName] = useState('');
  const [newLineCostCode, setNewLineCostCode] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setLines(null);
      return;
    }
    let cancelled = false;
    void listProjectBudgetLines(projectId).then((rows) => {
      if (!cancelled) setLines(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const showBudgeted = callerRole === 'owner' || callerRole === 'admin';
  const canCreateLine =
    callerRole === 'owner' || callerRole === 'admin' || callerRole === 'project_manager';

  async function handleCreateLine() {
    if (!newLineName.trim()) {
      setCreateError('The new line needs a name.');
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    const res = await createBudgetLineAtCapture(projectId, newLineName, newLineCostCode || null);
    if (!res.success || !res.id) {
      setCreateBusy(false);
      setCreateError(res.error ?? 'Could not create the budget line.');
      return;
    }
    setLines(await listProjectBudgetLines(projectId));
    // Point the first unpicked row at the new line; else add a row for it.
    const target = rows.find((r) => r.budget_item_id === '');
    if (target) {
      onChange(rows.map((r) => (r.key === target.key ? { ...r, budget_item_id: res.id! } : r)));
    } else {
      onChange([
        ...rows,
        { key: Math.max(...rows.map((r) => r.key)) + 1, budget_item_id: res.id, amount: '' },
      ]);
    }
    setCreateBusy(false);
    setCreatingLine(false);
    setNewLineName('');
    setNewLineCostCode('');
  }
  const hasMiscLine = (lines ?? []).some((l) => l.is_miscellaneous);

  // Group options by instrument (Original Contract / per-CO / ad-hoc+misc).
  const groups = new Map<string, BudgetLineOption[]>();
  const coNumbers = new Map<string, string>(); // filled lazily from ids — label falls back to "Change order"
  for (const l of lines ?? []) {
    const label = groupLabel(l, coNumbers);
    const list = groups.get(label) ?? [];
    list.push(l);
    groups.set(label, list);
  }

  const enteredSum = rows.reduce((s, r) => {
    if (rows.length === 1 && r.amount.trim() === '') return s + (totalAmount || 0);
    const n = Number(r.amount);
    return s + (Number.isNaN(n) ? 0 : n);
  }, 0);
  const remainder = Math.round(((totalAmount || 0) - enteredSum) * 100) / 100;

  const update = (key: number, patch: Partial<SplitRowDraft>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={fieldLabelStyle}>Budget line(s) (required)</label>
      {rows.map((row) => (
        <div key={row.key} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
          <select
            value={row.budget_item_id}
            onChange={(e) => update(row.key, { budget_item_id: e.target.value })}
            disabled={disabled || !projectId}
            style={{ ...inputStyle, flex: 1 }}
          >
            <option value="">
              {!projectId ? 'Pick a job first…' : lines === null ? 'Loading lines…' : 'Select a budget line…'}
            </option>
            {!hasMiscLine && <option value={MISC_SENTINEL}>Miscellaneous</option>}
            {Array.from(groups.entries()).map(([label, groupLines]) => (
              <optgroup key={label} label={label}>
                {groupLines.map((l) => (
                  <option key={l.id} value={l.is_miscellaneous ? MISC_SENTINEL : l.id}>
                    {l.cost_code ? `${l.cost_code} — ` : ''}
                    {l.description ?? 'Budget line'}
                    {showBudgeted && l.budgeted_amount != null && !l.is_miscellaneous
                      ? ` ($${l.budgeted_amount.toFixed(2)} budgeted)`
                      : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={row.amount}
            placeholder={rows.length === 1 ? 'Full amount' : '0.00'}
            onChange={(e) => update(row.key, { amount: e.target.value })}
            disabled={disabled}
            style={{ ...inputStyle, width: '110px' }}
          />
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
              disabled={disabled}
              style={{
                background: 'none',
                border: 'none',
                color: color.danger,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', gap: '14px' }}>
          <button
            type="button"
            onClick={() =>
              onChange([
                ...rows,
                { key: Math.max(...rows.map((r) => r.key)) + 1, budget_item_id: '', amount: '' },
              ])
            }
            disabled={disabled}
            style={{
              background: 'none',
              border: 'none',
              color: color.primary,
              cursor: 'pointer',
              fontSize: '13px',
              padding: 0,
            }}
          >
            + Split across another line
          </button>
          {canCreateLine && !creatingLine && (
            <button
              type="button"
              onClick={() => setCreatingLine(true)}
              disabled={disabled || !projectId}
              style={{
                background: 'none',
                border: 'none',
                color: color.primary,
                cursor: 'pointer',
                fontSize: '13px',
                padding: 0,
              }}
            >
              + New budget line
            </button>
          )}
        </span>
        {rows.length > 1 && (
          <span
            style={{
              fontSize: '12px',
              color: remainder === 0 ? color.muted : color.warningDeep,
            }}
          >
            {remainder === 0
              ? 'Split matches the amount'
              : remainder > 0
                ? `$${remainder.toFixed(2)} left to split`
                : `$${Math.abs(remainder).toFixed(2)} over the amount`}
          </span>
        )}
      </div>

      {creatingLine && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
          <input
            placeholder="Line name"
            value={newLineName}
            onChange={(e) => setNewLineName(e.target.value)}
            disabled={createBusy}
            style={{ ...inputStyle, flex: 1, minWidth: '140px' }}
          />
          <input
            placeholder="Cost code (optional)"
            value={newLineCostCode}
            onChange={(e) => setNewLineCostCode(e.target.value)}
            disabled={createBusy}
            style={{ ...inputStyle, width: '130px' }}
          />
          <button
            type="button"
            onClick={() => void handleCreateLine()}
            disabled={createBusy}
            style={{
              ...inputStyle,
              width: 'auto',
              cursor: 'pointer',
              fontWeight: 600,
              color: color.primary,
            }}
          >
            {createBusy ? 'Adding…' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreatingLine(false);
              setCreateError(null);
            }}
            disabled={createBusy}
            style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )}
      {createError && (
        <p style={{ color: color.danger, fontSize: '12px', margin: '6px 0 0' }}>{createError}</p>
      )}
    </div>
  );
}
