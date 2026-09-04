'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  closePurchaseOrder,
  softDeletePurchaseOrder,
  voidPurchaseOrder,
} from '@/lib/services/deliveries-client';
import { setPoTotal } from '@/lib/services/payables-client';
import { getOrCreateMiscBudgetLine } from '@/lib/services/expenses-client';
import { BudgetLineSelect, MISC_SENTINEL } from '@/components/expenses/budget-line-select';
import { useConfirm, useAlert } from '@/components/confirm/confirm-provider';

// 6D §5.1 — manual close (Owner/Admin; closed_reason required) and
// Owner/Admin soft-delete. Reopen is deliberately NOT offered (TECH_DEBT #93
// documents the PM direct-API edge; auto-reopen exists for auto-closed POs).
//
// 7C §2.4 (Q8/2b) — PoTotalControl: entering the total IS the commitment.
// The set_po_total_amount RPC upserts the PO's committed expense row; editing
// the total adjusts it. No line-item pricing (locked). The RPC rejects ≤ 0,
// so a total can be adjusted but never cleared.
//
// S-2 as amended [S95]: the total carries a budget-line target — a real
// line OR Miscellaneous (Miscellaneous is allowed for POs, unlike sub
// stages; Josh, S95). Default = Miscellaneous; the sentinel resolves via
// get_or_create_misc_budget_item at save. On adjust the RPC keeps the
// single allocation in step with the new total (§10b, 20260730010000).

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function PoTotalControl({
  poId,
  projectId,
  totalAmount,
  canEdit,
  hideAmounts,
}: {
  poId: string;
  projectId: string;
  totalAmount: number | null;
  canEdit: boolean;
  /** Floor: budgeted figures in the picker are Owner/Admin only. */
  hideAmounts: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(totalAmount !== null ? String(totalAmount) : '');
  const [budgetLine, setBudgetLine] = useState<string>(MISC_SENTINEL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const parsed = Number(value);
    if (Number.isNaN(parsed) || parsed <= 0) {
      setError('Enter a total greater than zero.');
      return;
    }
    if (!budgetLine) {
      setError('Pick a budget line (or Miscellaneous) for the total.');
      return;
    }
    setBusy(true);
    setError(null);
    let budgetItemId = budgetLine;
    if (budgetItemId === MISC_SENTINEL) {
      const misc = await getOrCreateMiscBudgetLine(projectId);
      if (!misc.success || !misc.id) {
        setBusy(false);
        setError(misc.error ?? 'Could not prepare the Miscellaneous line.');
        return;
      }
      budgetItemId = misc.id;
    }
    const result = await setPoTotal(poId, parsed, budgetItemId);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Failed to set the total.');
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="mb-4 rounded-[13px] border border-[#e6e9ef] bg-white p-[16px]">
      <div className="mb-1 text-[13px] font-bold uppercase text-[#14213d]">
        PO total{' '}
        <span className="text-[11px] font-medium normal-case tracking-normal text-[#9aa1ac]">
          — entering the total commits it to job cost
        </span>
      </div>
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-[140px] rounded-[9px] border border-[#e0e4ea] px-3 py-[7px] text-[13px] text-[#14213d] outline-none focus:border-[#2f49d1]"
          />
          <BudgetLineSelect
            projectId={projectId}
            value={budgetLine}
            onChange={setBudgetLine}
            hideAmounts={hideAmounts}
            disabled={busy}
            style={{
              padding: '7px 12px',
              border: '1px solid #e0e4ea',
              borderRadius: '9px',
              fontSize: '13px',
              color: '#14213d',
              minWidth: '200px',
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSave()}
            className="rounded-[9px] bg-[#2f49d1] px-[13px] py-[7px] text-[13px] font-semibold text-white hover:bg-[#2438a8] disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            className="rounded-[9px] px-[10px] py-[7px] text-[13px] font-semibold text-[#6b7280] hover:text-[#14213d]"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="font-mono text-[17px] font-semibold text-[#14213d]">
            {totalAmount !== null ? fmtUsd(totalAmount) : 'Not set'}
          </span>
          {totalAmount !== null ? (
            <span className="text-[12px] text-[#3d7a4b]">committed</span>
          ) : (
            <span className="text-[12px] text-[#9aa1ac]">no committed cost on the job yet</span>
          )}
          {canEdit ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[12px] font-semibold text-[#2f49d1] hover:underline"
            >
              {totalAmount !== null ? 'Adjust' : 'Set total'}
            </button>
          ) : null}
        </div>
      )}
      {error ? <p className="mt-2 text-[12px] text-[#c0362c]">{error}</p> : null}
    </div>
  );
}

export function ClosePoButton({ poId }: { poId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClose() {
    if (!reason.trim()) {
      setError('A reason is required — an unexplained closed PO looks identical to an open one.');
      return;
    }
    setBusy(true);
    const result = await closePurchaseOrder(poId, reason.trim());
    setBusy(false);
    if (result.success) {
      setOpen(false);
      router.refresh();
    } else {
      setError(result.error ?? 'Close failed');
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-[9px] border border-[#e0e4ea] bg-white px-[15px] py-[9px] text-[13px] font-semibold text-[#374151] transition-colors hover:border-[#c9d2e4]"
      >
        Close PO
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-[420px] rounded-[13px] border border-[#e6e9ef] bg-white p-5">
        <div className="mb-2 text-[15px] font-bold text-[#14213d]">Close this PO by hand</div>
        <p className="mb-3 text-[13px] leading-snug text-[#6b7280]">
          Use this when no further truck is coming — e.g. the vendor credited instead of
          replacing. A reason is required.
        </p>
        <textarea
          className="min-h-[72px] w-full rounded-[9px] border border-[#e0e4ea] px-3 py-[9px] text-[13px] text-[#14213d] outline-none focus:border-[#2f49d1]"
          placeholder={'e.g. "Jones credited us, not replacing."'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {error ? <p className="mt-2 text-[12px] text-[#c0362c]">{error}</p> : null}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-[9px] px-[13px] py-[8px] text-[13px] font-semibold text-[#6b7280] hover:text-[#14213d]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleClose()}
            className="rounded-[9px] bg-[#c0362c] px-[15px] py-[8px] text-[13px] font-semibold text-white hover:bg-[#a52d24] disabled:opacity-50"
          >
            {busy ? 'Closing…' : 'Close PO'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Void an issued/closed PO (§2 [S103]) — the audit-preserving exit that
 * RELEASES the remaining committed dollars (purchased lines keep their cost as
 * actual, untouched). Owner/Admin only, matching the RPC; the page renders this
 * button only for them. A reason is required in EVERY case, so — like the CO
 * void (co-builder.tsx) — voiding is a PANEL, never a window.confirm(): the
 * reason is DATA, frozen permanently by the void_shape CHECK. This mirrors
 * ClosePoButton's shipped reason-required modal rather than inventing a second
 * pattern.
 */
export function VoidPoButton({ poId }: { poId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVoid() {
    if (!reason.trim()) {
      setError('A void needs a reason. It is kept permanently.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await voidPurchaseOrder(poId, reason.trim());
    setBusy(false);
    if (result.success) {
      setOpen(false);
      router.refresh();
    } else {
      setError(result.error ?? 'Void failed');
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-[9px] border border-[#f5c6c0] bg-white px-[15px] py-[9px] text-[13px] font-semibold text-[#c0362c] transition-colors hover:bg-[#fbe4e2]"
      >
        Void PO
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-[440px] rounded-[13px] border border-[#e6e9ef] bg-white p-5">
        <div className="mb-2 text-[15px] font-bold text-[#14213d]">Void this purchase order</div>
        <p className="mb-3 text-[13px] leading-snug text-[#6b7280]">
          Voiding releases the remaining committed dollars off the job. Any lines already marked
          purchased keep their cost — that money was really spent. The PO is then frozen and kept
          for the record; a reason is required.
        </p>
        <textarea
          className="min-h-[72px] w-full rounded-[9px] border border-[#e0e4ea] px-3 py-[9px] text-[13px] text-[#14213d] outline-none focus:border-[#2f49d1]"
          placeholder={'e.g. "Ordered against the wrong project — reissued as PO-2044."'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {error ? <p className="mt-2 text-[12px] text-[#c0362c]">{error}</p> : null}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            className="rounded-[9px] px-[13px] py-[8px] text-[13px] font-semibold text-[#6b7280] hover:text-[#14213d]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !reason.trim()}
            onClick={() => void handleVoid()}
            className="rounded-[9px] bg-[#c0362c] px-[15px] py-[8px] text-[13px] font-semibold text-white hover:bg-[#a52d24] disabled:opacity-50"
          >
            {busy ? 'Voiding…' : 'Void PO'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeletePoButton({ poId, projectId }: { poId: string; projectId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const alert = useAlert();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!(await confirm('Move this purchase order to the trash?'))) return;
    setBusy(true);
    const result = await softDeletePurchaseOrder(poId);
    setBusy(false);
    if (result.success) {
      router.push(`/dashboard/field-ops/${projectId}/deliveries`);
      router.refresh();
    } else {
      void alert(result.error ?? 'Delete failed');
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void handleDelete()}
      className="rounded-[9px] border border-[#f5c6c0] bg-white px-[15px] py-[9px] text-[13px] font-semibold text-[#c0362c] transition-colors hover:bg-[#fbe4e2] disabled:opacity-50"
    >
      Delete
    </button>
  );
}
