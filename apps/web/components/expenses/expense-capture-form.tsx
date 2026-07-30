'use client';

// 7A §5.3 — shared expense capture form (S90 Q2: one component behind every
// capture surface). Parking-lot simple, one column, camera-first. Hosts:
//   1. /dashboard/expenses/new (full page, job picker from server props)
//   2. the material-run sheet (ExpenseCaptureModal — job locked from the
//      segment, category pre-set 'material', source_segment_id stamped)
//   3. edit-own-pending from the expense list (Q8 — existing row, same fields)
// Capture offers material | other ONLY (S89 7C boundary — never
// subcontractor). Submit lands pending; the confirmation shows a status chip
// and no financial context beyond the member's own entry (§5.3).

import { useEffect, useState } from 'react';
import {
  createExpense,
  updateExpense,
  uploadExpenseReceipt,
  type CaptureCategory,
  type ExpenseListItem,
} from '@/lib/services/expenses-client';
import { listActiveProjects } from '@/lib/services/time-tracking-client';
import {
  BudgetSplitEditor,
  emptySplit,
  resolveSplit,
  type SplitRowDraft,
} from '@/components/expenses/budget-split-editor';
import {
  cardStyle,
  color,
  h2Style,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';
import { overlayStyle, fieldLabelStyle, inputStyle } from '@/components/time/clock-modal';
import { CAPTURE_CATEGORY_LABELS, ExpenseStatusChip } from './expense-ui';

export interface ExpenseCaptureFormProps {
  /** Job picker options. Omit to have the form fetch active projects itself
   *  (the self-contained-modal pattern, clock-modal precedent). */
  projects?: { id: string; name: string }[];
  /** Pre-selected job (from a segment or the Job Cost tab entry point). */
  initialProjectId?: string;
  /** Material-run sheet: job comes from the segment and cannot be changed. */
  lockProject?: boolean;
  /** Set when born from a material-run prompt (§5.1). */
  sourceSegmentId?: string | null;
  /** Company-tz calendar day (6B log_date convention) — server-computed where
   *  available; hosts without a server fetch pass a client-derived value. */
  todayYmd: string;
  /** Edit mode (author-pending or Owner/Admin): loads the row's fields,
   *  submit updates instead of creating. */
  existing?: ExpenseListItem;
  /** Caller's role — Owner/Admin are exempt from the receipt-photo
   *  requirement (S90 decision). PRESENTATION-ONLY: no service or RLS
   *  change; the DB accepts photo-less expenses from any role. */
  callerRole?: string;
  onDone: () => void;
  onCancel: () => void;
}

export function ExpenseCaptureForm({
  projects: projectsProp,
  initialProjectId,
  lockProject,
  sourceSegmentId,
  todayYmd,
  existing,
  callerRole,
  onDone,
  onCancel,
}: ExpenseCaptureFormProps) {
  const [projects, setProjects] = useState<{ id: string; name: string }[] | null>(
    projectsProp ?? null
  );
  const [projectId, setProjectId] = useState(existing?.project_id ?? initialProjectId ?? '');
  const [supplier, setSupplier] = useState(existing?.supplier ?? '');
  const [date, setDate] = useState(existing?.expense_date ?? todayYmd);
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [category, setCategory] = useState<CaptureCategory>(
    existing && existing.cost_category !== 'subcontractor' ? existing.cost_category : 'material'
  );
  const [photos, setPhotos] = useState<File[]>([]);
  // SPLIT AT CAPTURE (money representation §4.4/P7) — one prefilled row is
  // the single-allocation case; "Miscellaneous" is the default target and
  // resolves lazily at submit. Edit mode leaves the captured split alone
  // (adjusting a split is the review popup's job).
  const [split, setSplit] = useState<SplitRowDraft[]>(emptySplit());

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Self-contained job list when the host didn't provide one (modal hosts).
  useEffect(() => {
    if (projectsProp) return;
    let cancelled = false;
    void listActiveProjects().then((rows) => {
      if (!cancelled) setProjects(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [projectsProp]);

  async function uploadPhotos(expenseId: string, targetProjectId: string): Promise<string | null> {
    const failures: string[] = [];
    for (const photo of photos) {
      const res = await uploadExpenseReceipt(photo, targetProjectId, expenseId);
      if (!res.success) failures.push(`${photo.name}: ${res.error ?? 'upload failed'}`);
    }
    return failures.length > 0 ? `Some receipt photos failed: ${failures.join('; ')}` : null;
  }

  // Receipt photo required at capture (S90). Exemptions, presentation-only:
  // Owner/Admin may submit without a photo; edit mode never forces a
  // re-upload (the row already passed capture — its receipt, if any, is
  // linked to the expense, not re-attached through this form).
  const photoExempt = callerRole === 'owner' || callerRole === 'admin' || Boolean(existing);
  const photoMissing = !photoExempt && photos.length === 0;

  async function handleSubmit() {
    if (photoMissing) {
      setError('Receipt photo required.');
      return;
    }
    if (!projectId) {
      setError('A job is required.');
      return;
    }
    const parsedAmount = Number(amount);
    if (!amount.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    setBusy(true);
    setError(null);

    if (existing) {
      const res = await updateExpense(existing.id, {
        project_id: projectId,
        supplier: supplier.trim(),
        expense_date: date,
        amount: parsedAmount,
        description: description.trim() || null,
        cost_category: category,
      });
      if (!res.success) {
        setBusy(false);
        setError(res.error ?? 'Failed to save the expense.');
        return;
      }
      setPhotoWarning(await uploadPhotos(existing.id, projectId));
    } else {
      const resolved = await resolveSplit(projectId, split, parsedAmount);
      if (!resolved.allocations) {
        setBusy(false);
        setError(resolved.error ?? 'Fix the budget split before submitting.');
        return;
      }
      const res = await createExpense({
        project_id: projectId,
        supplier,
        expense_date: date,
        amount: parsedAmount,
        description: description.trim() || null,
        cost_category: category,
        source_segment_id: sourceSegmentId ?? null,
        allocations: resolved.allocations,
      });
      if (!res.success || !res.id) {
        setBusy(false);
        setError(res.error ?? 'Failed to log the expense.');
        return;
      }
      setPhotoWarning(await uploadPhotos(res.id, projectId));
    }

    setBusy(false);
    setSubmitted(true);
  }

  // §5.3 — confirmation with a status chip, no financial context beyond the
  // member's own entry.
  if (submitted) {
    return (
      <div>
        <p style={{ fontSize: '14px', color: color.body, margin: '0 0 10px' }}>
          {existing ? 'Expense updated.' : 'Expense logged.'}{' '}
          <ExpenseStatusChip status={existing?.status ?? 'pending'} />
        </p>
        <p style={{ fontSize: '12px', color: color.muted, margin: '0 0 16px' }}>
          Nothing counts against the job until it is reviewed and approved.
        </p>
        {photoWarning && (
          <p style={{ fontSize: '12px', color: color.warningDeep, margin: '0 0 12px' }}>
            {photoWarning}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button style={primaryButtonStyle} onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '12px' }}>
        <label style={fieldLabelStyle}>
          Receipt photo(s){!photoExempt && ' (required)'}
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
          style={{ fontSize: '13px', color: color.body }}
        />
        {photoMissing && (
          <p style={{ fontSize: '12px', color: color.warningDeep, margin: '6px 0 0' }}>
            Receipt photo required.
          </p>
        )}
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={fieldLabelStyle}>Supplier (required)</label>
        <input
          type="text"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="e.g. Home Depot"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={fieldLabelStyle}>Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={fieldLabelStyle}>Amount (required)</label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={fieldLabelStyle}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What was purchased?"
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={fieldLabelStyle}>Job (required)</label>
        {lockProject ? (
          <p style={{ fontSize: '13px', color: color.bodyAlt, margin: 0 }}>
            {(projects ?? []).find((p) => p.id === projectId)?.name ??
              'Pre-filled from your material run'}
          </p>
        ) : (
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            style={inputStyle}
          >
            <option value="">{projects === null ? 'Loading jobs…' : 'Select a job…'}</option>
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Split editor — new captures only; the review popup adjusts existing
          splits. Budgeted figures render for Owner/Admin only (§7.1). */}
      {!existing && (
        <BudgetSplitEditor
          projectId={projectId}
          totalAmount={Number(amount) || 0}
          rows={split}
          onChange={setSplit}
          callerRole={callerRole}
          disabled={busy}
        />
      )}

      <div style={{ marginBottom: '14px' }}>
        <label style={fieldLabelStyle}>Category</label>
        <div style={{ display: 'flex', gap: '14px', fontSize: '14px', color: color.body }}>
          {(Object.keys(CAPTURE_CATEGORY_LABELS) as CaptureCategory[]).map((c) => (
            <label key={c} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input type="radio" checked={category === c} onChange={() => setCategory(c)} />
              {CAPTURE_CATEGORY_LABELS[c]}
            </label>
          ))}
        </div>
      </div>

      {error && <p style={{ color: color.danger, fontSize: '13px', margin: '0 0 12px' }}>{error}</p>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button style={secondaryButtonStyle} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button
          style={{ ...primaryButtonStyle, opacity: busy || photoMissing ? 0.6 : 1 }}
          disabled={busy || photoMissing}
          onClick={() => void handleSubmit()}
        >
          {busy ? 'Saving…' : existing ? 'Save' : 'Submit expense'}
        </button>
      </div>
    </div>
  );
}

/** Overlay-hosted capture form — the material-run sheet (§5.1) and list-page
 *  edit modal. Same shell geometry as ClockModal. */
export function ExpenseCaptureModal(
  props: Omit<ExpenseCaptureFormProps, 'onCancel'> & { title?: string; onClose: () => void }
) {
  const { title, onClose, ...form } = props;
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={{ ...cardStyle, width: '460px', maxHeight: '86vh', overflowY: 'auto', padding: '24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ ...h2Style, fontSize: '19px', marginBottom: '16px' }}>
          {title ?? 'Log expense'}
        </h3>
        <ExpenseCaptureForm {...form} onCancel={onClose} />
      </div>
    </div>
  );
}
