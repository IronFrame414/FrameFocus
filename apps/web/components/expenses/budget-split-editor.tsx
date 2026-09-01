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
  listTaggableSelections,
  taggableFor,
  type AllocationInput,
  type BudgetLineOption,
  type TaggableSelection,
} from '@/lib/services/expenses-client';
import { color } from '@/lib/theme';
import { fieldLabelStyle, inputStyle } from '@/components/time/clock-modal';

/** Sentinel option value for the lazily created Miscellaneous line. */
export const MISC_SENTINEL = '__miscellaneous__';

export interface SplitRowDraft {
  key: number;
  budget_item_id: string; // '' = unpicked; MISC_SENTINEL = lazy Miscellaneous
  amount: string; // text input; '' on the only row = "the full amount"
  /** [S175 stage 5] The selection this cost is FOR, or '' for the
   *  allowance's own. Offered only on a line with taggable selections. */
  source_selection_id?: string;
}

export function emptySplit(): SplitRowDraft[] {
  return [{ key: 1, budget_item_id: MISC_SENTINEL, amount: '', source_selection_id: '' }];
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
    source_selection_id: r.source_selection_id?.trim() ? r.source_selection_id : null,
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
  // UNIQUE (expense_id, budget_item_id) key). [S175 stage 5] Two rows on one
  // line naming DIFFERENT selections cannot merge — ONE EXPENSE PER SELECTION
  // is the ruling, so that is two expenses, and the editor says so rather
  // than picking one.
  const merged = new Map<string, { amount: number; source_selection_id: string | null }>();
  for (const d of drafts) {
    const id = d.budget_item_id === MISC_SENTINEL ? (miscId as string) : d.budget_item_id;
    const prior = merged.get(id);
    if (
      prior &&
      prior.source_selection_id &&
      d.source_selection_id &&
      prior.source_selection_id !== d.source_selection_id
    ) {
      return {
        error:
          'Two selections on one budget line: log a separate expense for each selection (one expense per selection).',
      };
    }
    merged.set(id, {
      amount: Math.round(((prior?.amount ?? 0) + d.amount) * 100) / 100,
      source_selection_id: prior?.source_selection_id ?? d.source_selection_id,
    });
  }
  return {
    allocations: Array.from(merged.entries()).map(([budget_item_id, v]) => ({
      budget_item_id,
      amount: v.amount,
      source_selection_id: v.source_selection_id,
    })),
  };
}

/** Instrument-group label for a budget line — shared with the S-2
 *  single-select picker (budget-line-select.tsx). S95 fix: each CO is its
 *  OWN group, labeled from the embedded CO identity — never one lumped
 *  "Change order" bucket. */
export function groupLabel(line: BudgetLineOption): string {
  if (line.source_change_order_id) {
    const co = line.source_change_order;
    return co ? `${co.co_number}${co.title ? ` — ${co.title}` : ''}` : 'Change order';
  }
  if (line.is_miscellaneous) return 'Ad-hoc & Miscellaneous';
  if (line.source_line_item_id) return 'Original Contract';
  return 'Ad-hoc & Miscellaneous';
}

/** Option text for a budget line — one definition for the split editor and
 *  the S-2 single-select. Original-contract lines keep the shipped
 *  "cost_code — description" shape; CO-born lines (cost_code is NULL,
 *  apply_change_order_budget) restore the missing half from row_type:
 *  "description — Cost type". Budgeted figures are Owner/Admin only. */
export function budgetLineOptionLabel(line: BudgetLineOption, showBudgeted: boolean): string {
  const desc = line.description ?? 'Budget line';
  const typeLabel = line.row_type
    ? line.row_type.charAt(0).toUpperCase() + line.row_type.slice(1)
    : null;
  const base = line.cost_code
    ? `${line.cost_code} — ${desc}`
    : typeLabel && !line.is_miscellaneous
      ? `${desc} — ${typeLabel}`
      : desc;
  const budgeted =
    showBudgeted && line.budgeted_amount != null && !line.is_miscellaneous
      ? ` ($${line.budgeted_amount.toFixed(2)} budgeted)`
      : '';
  return base + budgeted;
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
  // [S175 stage 5] Selections a cost may be tagged with, keyed by line below.
  const [taggable, setTaggable] = useState<TaggableSelection[]>([]);

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
    void listTaggableSelections(projectId).then((rows) => {
      if (!cancelled) setTaggable(rows);
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

  // Group options by instrument (Original Contract / one group PER CO /
  // ad-hoc+misc) — CO labels come embedded on the option rows (S95 fix).
  const groups = new Map<string, BudgetLineOption[]>();
  for (const l of lines ?? []) {
    const label = groupLabel(l);
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
        <div key={row.key} style={{ display: 'flex', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
          <select
            value={row.budget_item_id}
            onChange={(e) =>
              // A new line means a new set of taggable selections; the old tag
              // would fail the shape trigger, so it is cleared with the line.
              update(row.key, { budget_item_id: e.target.value, source_selection_id: '' })
            }
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
                    {budgetLineOptionLabel(l, showBudgeted)}
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
          {/* [S175 stage 5] ONE EXPENSE PER SELECTION — offered only when the
              chosen line has selections to tag; the blank option is "the
              allowance's own". The rule itself is the DB trigger; this is
              the affordance. */}
          {row.budget_item_id !== '' &&
            row.budget_item_id !== MISC_SENTINEL &&
            taggableFor(row.budget_item_id, taggable).length > 0 && (
              <select
                value={row.source_selection_id ?? ''}
                onChange={(e) => update(row.key, { source_selection_id: e.target.value })}
                disabled={disabled}
                title="Which selection this cost is for"
                style={{ ...inputStyle, flex: 1, minWidth: '160px' }}
              >
                <option value="">Not for a selection (the allowance&rsquo;s own)</option>
                {taggableFor(row.budget_item_id, taggable).map((s) => (
                  <option key={s.id} value={s.id}>
                    For selection: {s.name}
                    {s.status === 'approved' ? '' : ' (not yet approved)'}
                  </option>
                ))}
              </select>
            )}
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
              color: remainder === 0 ? color.muted : color.warning,
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
