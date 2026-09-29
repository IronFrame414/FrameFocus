'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addOriginalBudgetLine, updateOriginalBudgetLine } from '@/lib/services/budget-client';

// S115 R10 — add and edit ORIGINAL budget lines, until the first invoice is
// issued. Rendered only when the database says the caller may
// (`can_edit_original_budget`: Owner/Admin, or a Project Executive on an
// assigned project, and no invoice issued); the write functions re-check it,
// so a stale page that still shows these controls gets a refusal, not a write.
//
// Desktop only, by nature: /m has no budget screen (m/p/[projectId]/page.tsx
// leaves Budget out deliberately), so there is no second surface to diverge.

type LineDraft = { description: string; costCode: string; amount: string };

function LineForm({
  title,
  initial,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial: LineDraft;
  onCancel: () => void;
  onSubmit: (d: LineDraft) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await onSubmit(draft);
    setBusy(false);
    if (err) setError(err);
  }

  const input: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    fontSize: '13px',
    border: '1px solid #cbd2dc',
    borderRadius: '6px',
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="original-budget-form"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <form
        onSubmit={submit}
        style={{ background: '#fff', borderRadius: '10px', padding: '18px', width: '380px' }}
      >
        <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px' }}>{title}</div>
        <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px' }}>
          Description
          <input
            data-testid="original-budget-description"
            style={input}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </label>
        <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px' }}>
          Cost code (optional)
          <input
            data-testid="original-budget-cost-code"
            style={input}
            value={draft.costCode}
            onChange={(e) => setDraft({ ...draft, costCode: e.target.value })}
          />
        </label>
        <label style={{ display: 'block', fontSize: '12px', marginBottom: '12px' }}>
          Budgeted amount
          <input
            data-testid="original-budget-amount"
            style={input}
            inputMode="decimal"
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
          />
        </label>
        {error && (
          <div role="alert" style={{ color: '#b42318', fontSize: '12px', marginBottom: '10px' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" disabled={busy} data-testid="original-budget-save">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

function parseAmount(s: string): number {
  const n = Number(s.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

const linkButton: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  marginLeft: '8px',
  color: '#2f5bd3',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
};

export function AddOriginalLineButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="original-budget-add"
        onClick={() => setOpen(true)}
        style={{ ...linkButton, marginLeft: 0, fontSize: '13px' }}
      >
        + Add line to original budget
      </button>
      {open && (
        <LineForm
          title="Add a line to the original budget"
          initial={{ description: '', costCode: '', amount: '0' }}
          onCancel={() => setOpen(false)}
          onSubmit={async (d) => {
            const r = await addOriginalBudgetLine(projectId, {
              description: d.description,
              costCode: d.costCode,
              budgetedAmount: parseAmount(d.amount),
            });
            if (!r.success) return r.error;
            setOpen(false);
            router.refresh();
            return null;
          }}
        />
      )}
    </>
  );
}

export function EditOriginalLineButton({
  itemId,
  description,
  costCode,
  budgetedAmount,
}: {
  itemId: string;
  description: string;
  costCode: string | null;
  budgetedAmount: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="original-budget-edit"
        onClick={() => setOpen(true)}
        style={linkButton}
      >
        Edit
      </button>
      {open && (
        <LineForm
          title="Edit original budget line"
          initial={{
            description,
            costCode: costCode ?? '',
            amount: budgetedAmount === null ? '' : String(budgetedAmount),
          }}
          onCancel={() => setOpen(false)}
          onSubmit={async (d) => {
            const r = await updateOriginalBudgetLine(itemId, {
              description: d.description,
              costCode: d.costCode,
              budgetedAmount: parseAmount(d.amount),
            });
            if (!r.success) return r.error;
            setOpen(false);
            router.refresh();
            return null;
          }}
        />
      )}
    </>
  );
}
