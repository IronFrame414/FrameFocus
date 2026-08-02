'use client';

// 7A §5.5 — the review popup (Owner/Admin), the heart of the gate. Receipt
// strip (tap = fullscreen tab), editable capture fields (correct-before-
// approve; category offers material|other only — a receipt is never
// recategorized 'subcontractor', that's a 7C bill), project reassign
// (Q7: wrong-job = reassign, not reject), allocation section ALWAYS shown
// (Q4) with live unallocated remainder and inline "+ Add budget line" (Q4b).
//
// S93 A-6/A-7 — ADJUST-MODE, SPLIT REQUIRED: the captured split loads as
// this popup's initial state and approve_expense RECONCILES (the passed set
// replaces the rows). Approval requires ≥1 allocation with Σ = the expense
// amount exactly — zero-allocation approval is illegal (A-7 supersedes 7A
// Option B on the approval path; the retainage accrual row, born approved
// in record_expense_payment, never passes through here). Reassigning the
// job clears the split — the old project's lines no longer apply, and
// reconcile drops their rows.
//
// 7C §4.2 as amended (A-7) — committed rows (bills/commitments/stages)
// share this popup. Under the S93 origin-predicated recomputes their
// allocations feed the COMMITTED rollup — settlement still runs through
// payments — so the allocation section shows for them too. Only the
// category select stays hidden (a bill may legitimately be
// 'subcontractor', which capture never offers).

import { useCallback, useEffect, useState } from 'react';
import {
  approveExpense,
  createAdHocBudgetLine,
  listExpenseAllocations,
  listProjectBudgetLines,
  reassignExpenseProject,
  rejectExpense,
  updateExpense,
  type BudgetLineOption,
  type CaptureCategory,
  type ExpenseListItem,
} from '@/lib/services/expenses-client';
import {
  CAPTURE_CATEGORY_LABELS,
  EXPENSE_CATEGORY_LABELS,
  fmtMoney,
} from '@/components/expenses/expense-ui';
import { overlayStyle, fieldLabelStyle, inputStyle } from '@/components/time/clock-modal';
import {
  cardStyle,
  color,
  font,
  h2Style,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';

interface ReviewPopupProps {
  expense: ExpenseListItem;
  /** Server-signed receipt URLs (page fetch — no client storage reads). */
  receipts: { id: string; name: string; url: string }[];
  /** Active projects — the reassign dropdown. */
  projects: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}

export function ReviewPopup({ expense, receipts, projects, onClose, onDone }: ReviewPopupProps) {
  // 7C: a committed row settles via payments — no allocations, no category
  // select (see header comment).
  const isCommitted = expense.state === 'committed';

  // Editable capture fields (Owner/Admin may correct before approval).
  const [supplier, setSupplier] = useState(expense.supplier);
  const [date, setDate] = useState(expense.expense_date);
  const [amount, setAmount] = useState(String(expense.amount));
  const [description, setDescription] = useState(expense.description ?? '');
  const [category, setCategory] = useState<CaptureCategory>(
    expense.cost_category === 'subcontractor' ? 'material' : expense.cost_category
  );
  const [projectId, setProjectId] = useState(expense.project_id);

  // Allocation state — line id -> input string.
  const [lines, setLines] = useState<BudgetLineOption[] | null>(null);
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  // Inline add-line (Q4b).
  const [addingLine, setAddingLine] = useState(false);
  const [newLineDescription, setNewLineDescription] = useState('');
  const [newLineCostCode, setNewLineCostCode] = useState('');

  // Reject flow.
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLines = useCallback(async (forProject: string) => {
    setLines(null);
    const rows = await listProjectBudgetLines(forProject);
    setLines(rows);
    setAllocations({});
  }, []);

  useEffect(() => {
    void (async () => {
      await loadLines(projectId);
      // Adjust-mode (S93 A-6): the captured split is the starting point —
      // committed rows included (their §4.4 target seeds the section).
      const captured = await listExpenseAllocations(expense.id);
      if (captured.length === 0) return;
      const seeded: Record<string, string> = {};
      for (const row of captured) {
        const prior = Number(seeded[row.budget_item_id] ?? 0);
        seeded[row.budget_item_id] = (prior + row.amount).toFixed(2);
      }
      setAllocations(seeded);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parsedAmount = Number(amount);
  const allocationEntries = Object.entries(allocations)
    .map(([budget_item_id, v]) => ({ budget_item_id, amount: Number(v) }))
    .filter((a) => !Number.isNaN(a.amount) && a.amount > 0);
  const allocatedTotal = allocationEntries.reduce((sum, a) => sum + a.amount, 0);
  const unallocated = (Number.isNaN(parsedAmount) ? 0 : parsedAmount) - allocatedTotal;
  const overAllocated = unallocated < -0.004; // cent-tolerant
  // A-7: every approval carries a full split — ≥1 allocation, Σ = amount
  // exactly. Mirrors the RPC's final-state guard.
  const splitMismatch = allocationEntries.length === 0 || Math.abs(unallocated) > 0.004;

  /** Selecting an empty line pre-fills it with the unallocated remainder —
   *  the first line selected gets the full expense amount. Editable after;
   *  over-allocation blocking and the live remainder are unchanged. */
  function prefillAllocation(lineId: string) {
    if ((allocations[lineId] ?? '').trim() !== '') return;
    const others = Object.entries(allocations)
      .filter(([id]) => id !== lineId)
      .reduce((sum, [, v]) => {
        const n = Number(v);
        return sum + (Number.isNaN(n) || n <= 0 ? 0 : n);
      }, 0);
    const remainder = (Number.isNaN(parsedAmount) ? 0 : parsedAmount) - others;
    if (remainder <= 0) return;
    setAllocations((prev) => ({ ...prev, [lineId]: remainder.toFixed(2) }));
  }

  async function handleReassign(newProjectId: string) {
    if (newProjectId === projectId) return;
    setBusy(true);
    setError(null);
    const res = await reassignExpenseProject(expense.id, newProjectId);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to reassign the expense.');
      return;
    }
    setProjectId(newProjectId);
    await loadLines(newProjectId);
  }

  async function handleAddLine() {
    if (!newLineDescription.trim()) {
      setError('The new budget line needs a description.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createAdHocBudgetLine(projectId, {
      description: newLineDescription,
      row_type: category === 'material' ? 'material' : 'other',
      cost_code: newLineCostCode.trim() || null,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to add the budget line.');
      return;
    }
    setAddingLine(false);
    setNewLineDescription('');
    setNewLineCostCode('');
    const kept = { ...allocations };
    await loadLines(projectId);
    setAllocations(kept); // loadLines clears; keep what was typed
  }

  async function handleApprove() {
    if (!supplier.trim()) {
      setError('Supplier is required.');
      return;
    }
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }
    if (splitMismatch) {
      setError(
        'Approval requires a full split — allocate the entire expense amount across budget lines.'
      );
      return;
    }
    setBusy(true);
    setError(null);

    // Correct-before-approve: persist any edited capture fields first.
    // Committed rows never touch cost_category here (select hidden).
    const dirty =
      supplier.trim() !== expense.supplier ||
      date !== expense.expense_date ||
      parsedAmount !== expense.amount ||
      (description.trim() || null) !== (expense.description ?? null) ||
      (!isCommitted && category !== expense.cost_category);
    if (dirty) {
      const upd = await updateExpense(expense.id, {
        supplier: supplier.trim(),
        expense_date: date,
        amount: parsedAmount,
        description: description.trim() || null,
        ...(isCommitted ? {} : { cost_category: category }),
      });
      if (!upd.success) {
        setBusy(false);
        setError(upd.error ?? 'Failed to save corrections.');
        return;
      }
    }

    const res = await approveExpense(expense.id, allocationEntries);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to approve the expense.');
      return;
    }
    onDone();
  }

  async function handleReject() {
    if (!rejectNote.trim()) {
      setError('A rejection note is required.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await rejectExpense(expense.id, rejectNote);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to reject the expense.');
      return;
    }
    onDone();
  }

  return (
    <div style={overlayStyle} onClick={() => !busy && onClose()}>
      <div
        style={{ ...cardStyle, width: '560px', maxHeight: '88vh', overflowY: 'auto', padding: '24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ ...h2Style, fontSize: '19px', marginBottom: '4px' }}>Review expense</h3>
        <p style={{ fontSize: '12px', color: color.muted, margin: '0 0 16px' }}>
          Logged by {expense.author?.display_name ?? 'unknown'} · nothing counts against the job
          until approved.
        </p>

        {/* Receipt strip — tap opens fullscreen in a new tab. */}
        {receipts.length > 0 ? (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {receipts.map((r) => (
              <a key={r.id} href={r.url} target="_blank" rel="noreferrer" title={r.name}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.url}
                  alt={r.name}
                  style={{
                    width: '86px',
                    height: '86px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    border: `1px solid ${color.cardBorder}`,
                  }}
                />
              </a>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '12px', color: color.faint, margin: '0 0 16px' }}>
            No receipt photo attached.
          </p>
        )}

        {/* Capture fields — editable before approval. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={fieldLabelStyle}>Supplier</label>
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={fieldLabelStyle}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={fieldLabelStyle}>Amount</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={fieldLabelStyle}>Category</label>
            {isCommitted ? (
              <p style={{ fontSize: '13px', color: color.body, margin: '8px 0 0' }}>
                {EXPENSE_CATEGORY_LABELS[expense.cost_category] ?? expense.cost_category}
                <span style={{ color: color.muted }}> · committed</span>
              </p>
            ) : (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CaptureCategory)}
                style={inputStyle}
              >
                {(Object.keys(CAPTURE_CATEGORY_LABELS) as CaptureCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CAPTURE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div style={{ marginBottom: '12px' }}>
          <label style={fieldLabelStyle}>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        {/* Project reassign (Q7) — immediate write, reloads budget lines. */}
        <div style={{ marginBottom: '16px' }}>
          <label style={fieldLabelStyle}>Job (reassign if logged against the wrong one)</label>
          <select
            value={projectId}
            onChange={(e) => void handleReassign(e.target.value)}
            style={inputStyle}
            disabled={busy}
          >
            {projects.every((p) => p.id !== projectId) && (
              <option value={projectId}>Current job (not in active list)</option>
            )}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Allocation — ALWAYS shown (Q4; A-7 extends to committed rows,
            whose allocations feed the committed rollup). budgeted_amount is
            Owner/Admin-only audience here (floor-safe). */}
        {isCommitted && (
          <p style={{ fontSize: '12px', color: color.muted, margin: '0 0 16px' }}>
            Committed — this row settles through recorded payments; the allocation below
            targets the job&rsquo;s committed rollup.
          </p>
        )}
        <div style={{ marginBottom: '16px' }}>
          <p style={{ ...microLabelStyle, marginBottom: '8px' }}>
            Allocate to budget lines (required — the full amount)
          </p>
          {lines === null ? (
            <p style={{ fontSize: '13px', color: color.faint, margin: 0 }}>Loading budget lines…</p>
          ) : lines.length === 0 && !addingLine ? (
            <p style={{ fontSize: '13px', color: color.muted, margin: '0 0 8px' }}>
              This job has no budget lines yet — add one below to approve (approval requires a
              full allocation).
            </p>
          ) : (
            lines.map((l) => (
              <div
                key={l.id}
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: `1px solid ${color.rowDivider}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '13px', color: color.body }}>
                    {l.description ?? 'Untitled line'}
                  </span>
                  {l.cost_code && (
                    <span style={{ fontFamily: font.mono, fontSize: '11px', color: color.faint }}>
                      {' '}
                      · {l.cost_code}
                    </span>
                  )}
                  <div style={{ fontSize: '11px', color: color.muted }}>
                    {/* RULING [S97]: budgeted_amount is NULL when the reader is
                        not permitted. fmtMoney() coerces null to $0.00 — a SIXTH
                        `?? 0`, hidden inside the formatter — so the null case is
                        handled here rather than passed to it. Actual cost is
                        visible to every role and needs no guard. */}
                    budget {l.budgeted_amount === null ? '—' : fmtMoney(l.budgeted_amount)} ·
                    actual {fmtMoney(l.actual_amount)}
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={allocations[l.id] ?? ''}
                  onFocus={() => prefillAllocation(l.id)}
                  onChange={(e) => setAllocations((prev) => ({ ...prev, [l.id]: e.target.value }))}
                  style={{ ...inputStyle, width: '110px' }}
                />
              </div>
            ))
          )}

          {addingLine ? (
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
              <input
                placeholder="Line description"
                value={newLineDescription}
                onChange={(e) => setNewLineDescription(e.target.value)}
                style={{ ...inputStyle, flex: 1, minWidth: '160px' }}
              />
              <input
                placeholder="Cost code (optional)"
                value={newLineCostCode}
                onChange={(e) => setNewLineCostCode(e.target.value)}
                style={{ ...inputStyle, width: '140px' }}
              />
              <button
                style={{ ...secondaryButtonStyle, padding: '7px 12px' }}
                disabled={busy}
                onClick={() => void handleAddLine()}
              >
                Add
              </button>
              <button
                style={{ ...secondaryButtonStyle, padding: '7px 12px' }}
                disabled={busy}
                onClick={() => setAddingLine(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              style={{
                border: 'none',
                background: 'none',
                color: color.primary,
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
                padding: '8px 0 0',
              }}
              onClick={() => setAddingLine(true)}
            >
              + Add budget line
            </button>
          )}

          <p
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: splitMismatch ? color.danger : color.navy,
              margin: '10px 0 0',
            }}
          >
            Unallocated: {fmtMoney(unallocated)}
            {overAllocated
              ? ' — allocations exceed the expense amount'
              : splitMismatch
                ? ' — approval requires the full amount allocated'
                : ''}
          </p>
        </div>

        {error && <p style={{ color: color.danger, fontSize: '13px', margin: '0 0 12px' }}>{error}</p>}

        {rejecting ? (
          <div>
            <label style={fieldLabelStyle}>Rejection note (required)</label>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', marginBottom: '10px' }}
              placeholder="Why is this rejected?"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button style={secondaryButtonStyle} disabled={busy} onClick={() => setRejecting(false)}>
                Back
              </button>
              <button
                style={{
                  ...primaryButtonStyle,
                  backgroundColor: color.danger,
                  opacity: busy || !rejectNote.trim() ? 0.6 : 1,
                }}
                disabled={busy || !rejectNote.trim()}
                onClick={() => void handleReject()}
              >
                {busy ? 'Saving…' : 'Reject expense'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button style={secondaryButtonStyle} disabled={busy} onClick={onClose}>
              Close
            </button>
            <button
              style={{ ...secondaryButtonStyle, color: color.dangerAlt }}
              disabled={busy}
              onClick={() => setRejecting(true)}
            >
              Reject…
            </button>
            <button
              style={{ ...primaryButtonStyle, opacity: busy || splitMismatch ? 0.6 : 1 }}
              disabled={busy || splitMismatch}
              onClick={() => void handleApprove()}
            >
              {busy ? 'Saving…' : 'Approve'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
