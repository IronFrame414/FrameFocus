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
  listPaymentAccounts,
  myDefaultPaymentAccountId,
  type PaymentAccountOption,
} from '@/lib/services/qb-accounts-client';
import {
  approveExpense,
  createAdHocBudgetLine,
  listExpenseAllocations,
  listTaggableSelections,
  taggableFor,
  type TaggableSelection,
  listProjectBudgetLines,
  reassignExpenseProject,
  rejectExpense,
  updateExpense,
  type BudgetLineOption,
  type CaptureCategory,
  type ExpenseListItem,
} from '@/lib/services/expenses-client';
import {
  getReviewPo,
  markPoLinesPurchased,
  type ReviewPo,
} from '@/lib/services/po-lines-client';
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

  // ⚠️ THE SECOND PLACE THE ACCOUNT CAN BE CHOSEN [M-J, RULED Josh, S103]:
  // "The account is chosen ON THE EXPENSE, at entry or at review."
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccountOption[]>([]);
  const [paymentAccountId, setPaymentAccountId] = useState<string>(
    (expense as { payment_account_id?: string | null }).payment_account_id ?? ''
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [list, mine] = await Promise.all([
        listPaymentAccounts(),
        myDefaultPaymentAccountId(),
      ]);
      if (cancelled) return;
      setPaymentAccounts(list);
      // The REVIEWER's default fills a blank — the capture may have come from
      // a crew member who has none. It never overwrites what the row says.
      setPaymentAccountId((current) =>
        current ? current : mine && list.some((a) => a.id === mine) ? mine : ''
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Allocation state — line id -> input string.
  const [lines, setLines] = useState<BudgetLineOption[] | null>(null);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  // [S175 stage 5] line id -> selection id ('' = the allowance's own). Seeded
  // from the captured rows so a tag survives review; approve_expense carries
  // it through its reconcile.
  const [selectionByLine, setSelectionByLine] = useState<Record<string, string>>({});
  const [taggable, setTaggable] = useState<TaggableSelection[]>([]);

  // PO module §S2 — the run's PO context. Loaded when the pending expense
  // carries source_po_id (R-Q2 provenance, never the commitment link). The
  // panel is a CALCULATOR into the allocation editor below — per-line
  // amounts grouped by their (retargetable) budget line become the split;
  // the editor stays the single mechanism approve_expense reads (the #129
  // lesson: share the mechanism, not just the intent).
  const [reviewPo, setReviewPo] = useState<ReviewPo | null>(null);
  const [poAmounts, setPoAmounts] = useState<Record<string, string>>({});
  const [poTargets, setPoTargets] = useState<Record<string, string>>({});
  const [purchasedTicks, setPurchasedTicks] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!expense.source_po_id || isCommitted) return;
    let active = true;
    void getReviewPo(expense.source_po_id).then((po) => {
      if (!active || !po) return;
      setReviewPo(po);
      const amounts: Record<string, string> = {};
      const targets: Record<string, string> = {};
      for (const l of po.lines) {
        amounts[l.id] =
          l.unitCost === null ? '' : (l.qtyOrdered * l.unitCost).toFixed(2);
        targets[l.id] = l.budgetItemId ?? '';
      }
      setPoAmounts(amounts);
      setPoTargets(targets);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const [rows, sels] = await Promise.all([
      listProjectBudgetLines(forProject),
      listTaggableSelections(forProject),
    ]);
    setLines(rows);
    setTaggable(sels);
    setAllocations({});
    setSelectionByLine({});
  }, []);

  useEffect(() => {
    void (async () => {
      await loadLines(projectId);
      // Adjust-mode (S93 A-6): the captured split is the starting point —
      // committed rows included (their §4.4 target seeds the section).
      const captured = await listExpenseAllocations(expense.id);
      if (captured.length === 0) return;
      const seeded: Record<string, string> = {};
      const seededSel: Record<string, string> = {};
      for (const row of captured) {
        const prior = Number(seeded[row.budget_item_id] ?? 0);
        seeded[row.budget_item_id] = (prior + row.amount).toFixed(2);
        if (row.source_selection_id) seededSel[row.budget_item_id] = row.source_selection_id;
      }
      setAllocations(seeded);
      setSelectionByLine(seededSel);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parsedAmount = Number(amount);
  const allocationEntries = Object.entries(allocations)
    .map(([budget_item_id, v]) => ({
      budget_item_id,
      amount: Number(v),
      source_selection_id: selectionByLine[budget_item_id] || null,
    }))
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

  /** §S2 item 3 — per-line amounts grouped by their FINAL budget target
   *  (recategorization included) become the split. Overwrites the allocation
   *  map: applying the breakdown is an explicit act. */
  function applyPoBreakdownToSplit() {
    const grouped: Record<string, number> = {};
    for (const line of reviewPo?.lines ?? []) {
      const n = Number(poAmounts[line.id]);
      const target = poTargets[line.id];
      if (Number.isNaN(n) || n <= 0 || !target) continue;
      grouped[target] = (grouped[target] ?? 0) + n;
    }
    setAllocations(
      Object.fromEntries(Object.entries(grouped).map(([id, n]) => [id, n.toFixed(2)]))
    );
  }

  /** §S2 item 5 — capture auto-stamps with no opt-out (R-B1), so the
   *  counterpart lives here: clear a mis-stamped link and review plain. */
  async function handleClearPoLink() {
    setBusy(true);
    setError(null);
    const res = await updateExpense(expense.id, { source_po_id: null });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Failed to clear the PO link.');
      return;
    }
    setReviewPo(null);
    setPurchasedTicks(new Set());
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
    // ⚠️ FAIL HERE, WHERE THE PERSON HAS THE CONTEXT [RULED Josh, S103].
    // This is the reversal of M-G's "park it and tell them later": the sync
    // used to stall hours afterwards on a settings page nobody was looking at.
    // `enforce_expense_payment_account` (M-J) is the same rule at the database;
    // this is the message that names the missing thing where it can be fixed.
    //
    // ⚠️ ONLY WHEN AN ACCOUNT COULD BE CHOSEN. A commitment never syncs and a
    // company with no accounts configured has nothing to pick, so neither is
    // blocked — the trigger applies exactly the same two exemptions.
    if (!isCommitted && paymentAccounts.length > 0 && !paymentAccountId) {
      setBusy(false);
      setError('Choose which account paid for this expense before approving it.');
      return;
    }

    const dirty =
      supplier.trim() !== expense.supplier ||
      date !== expense.expense_date ||
      parsedAmount !== expense.amount ||
      (description.trim() || null) !== (expense.description ?? null) ||
      (!isCommitted && category !== expense.cost_category) ||
      paymentAccountId !== ((expense as { payment_account_id?: string | null }).payment_account_id ?? '');
    if (dirty) {
      const upd = await updateExpense(expense.id, {
        supplier: supplier.trim(),
        expense_date: date,
        amount: parsedAmount,
        description: description.trim() || null,
        ...(isCommitted ? {} : { cost_category: category }),
        payment_account_id: paymentAccountId || null,
      });
      if (!upd.success) {
        setBusy(false);
        setError(upd.error ?? 'Failed to save corrections.');
        return;
      }
    }

    const res = await approveExpense(expense.id, allocationEntries);
    if (!res.success) {
      setBusy(false);
      setError(res.error ?? 'Failed to approve the expense.');
      return;
    }
    // §S2 item 4 — approval is the money act; purchase-marking is PO
    // bookkeeping. A marking failure is surfaced, never swallowed, and
    // never un-approves: the popup stays open with the recovery path named.
    if (reviewPo && purchasedTicks.size > 0) {
      const marked = await markPoLinesPurchased(reviewPo.id, [...purchasedTicks]);
      if (!marked.success) {
        setBusy(false);
        setError(
          `The expense was approved, but marking the lines purchased failed: ${
            marked.error ?? 'unknown error'
          }. Mark them from the PO record.`
        );
        return;
      }
    }
    setBusy(false);
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

        {/* ⚠️ WHICH ACCOUNT PAID — required to approve [M-J]. A commitment
            never syncs, so it is not asked for one. Hidden when the company has
            configured no accounts: an empty dropdown invites configuring
            something that is not there. */}
        {!isCommitted && paymentAccounts.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <label style={fieldLabelStyle}>Paid from (required to approve)</label>
            <select
              value={paymentAccountId}
              onChange={(e) => setPaymentAccountId(e.target.value)}
              style={inputStyle}
              data-testid="review-payment-account"
            >
              <option value="">Select an account…</option>
              {paymentAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.accountType}
                </option>
              ))}
            </select>
          </div>
        )}

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

        {/* §S2 — the PO panel: breakdown guide + purchase marking. Feeds the
            allocation editor below; never a second write path. */}
        {reviewPo && (
          <div
            data-testid="review-po-panel"
            style={{
              marginBottom: '16px',
              padding: '12px 14px',
              borderRadius: '9px',
              border: '1px solid #dbe0fb',
              backgroundColor: '#f5f7ff',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: '6px',
              }}
            >
              <span style={{ ...microLabelStyle }}>
                Bought against {reviewPo.poNumber ?? 'a PO'}
                {reviewPo.vendorName ? ` · ${reviewPo.vendorName}` : ''}
              </span>
              <button
                style={{
                  border: 'none',
                  background: 'none',
                  color: color.primary,
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: 0,
                }}
                disabled={busy}
                onClick={() => void handleClearPoLink()}
              >
                Not against this PO
              </button>
            </div>
            <p style={{ fontSize: '12px', color: color.muted, margin: '0 0 8px' }}>
              Break the receipt down per line, retarget a line&rsquo;s cost to a different budget
              line if it belongs elsewhere, and tick what was bought — ticked lines are marked
              purchased on approval and leave the open PO.
            </p>
            {reviewPo.lines.length === 0 && (
              <p style={{ fontSize: '12px', color: color.faint, margin: 0 }}>
                No open lines on this PO — everything is already purchased.
              </p>
            )}
            {reviewPo.lines.map((line) => (
              <div
                key={line.id}
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
                  padding: '5px 0',
                  borderBottom: `1px solid ${color.rowDivider}`,
                }}
              >
                <input
                  type="checkbox"
                  title="Bought — mark purchased on approval"
                  checked={purchasedTicks.has(line.id)}
                  onChange={() =>
                    setPurchasedTicks((prev) => {
                      const next = new Set(prev);
                      if (next.has(line.id)) next.delete(line.id);
                      else next.add(line.id);
                      return next;
                    })
                  }
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '13px', color: color.body }}>{line.description}</span>
                  <div style={{ fontSize: '11px', color: color.muted }}>
                    ordered{' '}
                    {line.unitCost === null
                      ? '—'
                      : fmtMoney(line.qtyOrdered * line.unitCost)}
                    {line.lineStatus === 'flagged' && (
                      <span style={{ color: color.warning }}>
                        {' '}
                        · flagged{line.flagNote ? `: ${line.flagNote}` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <select
                  title="Which budget line this cost lands on"
                  value={poTargets[line.id] ?? ''}
                  onChange={(e) =>
                    setPoTargets((prev) => ({ ...prev, [line.id]: e.target.value }))
                  }
                  style={{ ...inputStyle, width: '170px' }}
                >
                  {(lines ?? []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.description ?? 'Untitled line'}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={poAmounts[line.id] ?? ''}
                  onChange={(e) =>
                    setPoAmounts((prev) => ({ ...prev, [line.id]: e.target.value }))
                  }
                  style={{ ...inputStyle, width: '96px' }}
                />
              </div>
            ))}
            {reviewPo.lines.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '8px',
                }}
              >
                <span style={{ fontSize: '12px', color: color.muted }}>
                  Breakdown{' '}
                  {fmtMoney(
                    reviewPo.lines.reduce((sum, l) => {
                      const n = Number(poAmounts[l.id]);
                      return sum + (Number.isNaN(n) || n <= 0 ? 0 : n);
                    }, 0)
                  )}{' '}
                  of {fmtMoney(Number.isNaN(parsedAmount) ? 0 : parsedAmount)} receipt
                </span>
                <button
                  style={{ ...secondaryButtonStyle, padding: '6px 12px', fontSize: '12px' }}
                  disabled={busy}
                  onClick={applyPoBreakdownToSplit}
                >
                  Use as the split
                </button>
              </div>
            )}
          </div>
        )}

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
                {/* [S175 stage 5] ONE EXPENSE PER SELECTION — the tag rides
                    the allocation; the DB trigger is the rule, this is the
                    affordance. Offered only where the line has selections. */}
                {taggableFor(l.id, taggable).length > 0 && (
                  <select
                    value={selectionByLine[l.id] ?? ''}
                    onChange={(e) =>
                      setSelectionByLine((prev) => ({ ...prev, [l.id]: e.target.value }))
                    }
                    title="Which selection this cost is for"
                    style={{ ...inputStyle, width: '200px' }}
                  >
                    <option value="">Not for a selection</option>
                    {taggableFor(l.id, taggable).map((s) => (
                      <option key={s.id} value={s.id}>
                        For: {s.name}
                        {s.status === 'approved' ? '' : ' (not yet approved)'}
                      </option>
                    ))}
                  </select>
                )}
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
              style={{ ...secondaryButtonStyle, color: color.danger }}
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
