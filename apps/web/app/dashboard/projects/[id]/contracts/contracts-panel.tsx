'use client';

// 7C §4.3/§4.4 — the sub-contract payment-schedule setup and stage/payment
// panel live here (§3.3: no new routes; the contract panel grows). Money
// derivations come from payables-shared — never re-stated.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ClientContract,
  SubcontractorContract,
} from '@/lib/services/contracts-client';
import {
  createSubcontractorContract,
  updateClientContract,
  updateSubcontractorContract,
} from '@/lib/services/contracts-client';
import type {
  AwardBudgetLine,
  PayableListItem,
  ScheduleStageInput,
} from '@/lib/services/payables-client';
import {
  deriveAwardBudgetLines,
  reviseSubContractSchedule,
  setupPaymentSchedule,
  softDeletePayment,
  voidContractWithCloseout,
} from '@/lib/services/payables-client';
import { committedRemaining, grossPaid } from '@/lib/services/payables-shared';
import {
  approveExpense,
  listExpenseAllocations,
  listProjectBudgetLines,
  type BudgetLineOption,
} from '@/lib/services/expenses-client';
import { BudgetLineSelect } from '@/components/expenses/budget-line-select';
import { fmtMoney } from '@/components/expenses/expense-ui';
import { PaymentModal } from '@/components/expenses/payment-modal';
import { CloseoutDialog } from '@/components/expenses/closeout-dialog';

interface ContractsPanelProps {
  projectId: string;
  clientContracts: ClientContract[];
  subContracts: SubcontractorContract[];
  subMembers: { id: string; display_name: string }[];
  canManage: boolean;
  role: string;
  /** 7C payable rows (stages + retainage accrual) keyed by sub contract id. */
  schedules: Record<string, PayableListItem[]>;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  draft: { bg: '#f3f4f6', fg: '#374151' },
  sent: { bg: '#fef3c7', fg: '#92400e' },
  signed: { bg: '#dcfce7', fg: '#166534' },
  void: { bg: '#fee2e2', fg: '#991b1b' },
};

function money(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function ContractsPanel({
  projectId,
  clientContracts,
  subContracts,
  subMembers,
  canManage,
  role,
  schedules,
}: ContractsPanelProps) {
  const router = useRouter();
  const isOwnerAdmin = role === 'owner' || role === 'admin';
  const [memberId, setMemberId] = useState('');
  const [scope, setScope] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddSubContract() {
    if (!memberId) {
      setError('Select a subcontractor.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createSubcontractorContract({
      project_id: projectId,
      member_id: memberId,
      scope_of_work: scope.trim() || null,
      contract_value: value ? Number(value) : null,
    });
    if (result.success) {
      setMemberId('');
      setScope('');
      setValue('');
      router.refresh();
    } else {
      setError(result.error || 'Failed to add contract');
    }
    setBusy(false);
  }

  async function handleVoid(kind: 'client' | 'sub', id: string) {
    // 7C Q7i — voiding a sub contract auto-closes its open committed rows
    // (system reason 'contract voided'; NO did-not-finish flag). The closeout
    // columns are Owner/Admin-only, so a PM may void only a contract with no
    // open committed rows.
    if (kind === 'sub') {
      const rows = schedules[id] ?? [];
      const hasOpenCommitted = rows.some(
        (r) => r.closed_out_at === null && !r.is_deleted && committedRemaining(r, r.payments) > 0
      );
      if (hasOpenCommitted && !isOwnerAdmin) {
        setError('This contract has committed rows — voiding it is Owner/Admin.');
        return;
      }
      const msg = hasOpenCommitted
        ? 'Void this contract? Its open committed rows will be closed out ("contract voided") and drop from the job’s committed total. Dollars already paid stay actual.'
        : 'Void this contract?';
      if (!confirm(msg)) return;
      setBusy(true);
      const result = hasOpenCommitted
        ? await voidContractWithCloseout(id)
        : await updateSubcontractorContract(id, { status: 'void' });
      if (result.success) {
        const warning = 'warning' in result ? (result as { warning?: string }).warning : undefined;
        if (warning) setError(warning);
        router.refresh();
      } else {
        setError(result.error || 'Void failed');
      }
      setBusy(false);
      return;
    }

    if (!confirm('Void this contract?')) return;
    setBusy(true);
    const result = await updateClientContract(id, { status: 'void' });
    if (result.success) router.refresh();
    else setError(result.error || 'Void failed');
    setBusy(false);
  }

  const cardStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '0.5rem',
    padding: '1.25rem',
    marginBottom: '1rem',
  };
  const titleStyle: React.CSSProperties = {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: '0.75rem',
  };
  const inputStyle: React.CSSProperties = {
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
  };

  function statusBadge(status: string) {
    const colors = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
    return (
      <span
        style={{
          padding: '0.125rem 0.5rem',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 500,
          backgroundColor: colors.bg,
          color: colors.fg,
        }}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  }

  return (
    <div style={{ maxWidth: '840px' }}>
      <div style={cardStyle}>
        <div style={titleStyle}>Client Contract</div>
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.75rem' }}>
          The signed proposal from conversion auto-attaches here. Re-issued or amended contracts
          are new rows — the most recent signed row is the active contract.
        </p>
        {clientContracts.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>No client contract on record.</p>
        ) : (
          clientContracts.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: '1px solid #f3f4f6',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {statusBadge(c.status)}
                <span style={{ fontWeight: 600 }}>{money(c.contract_value)}</span>
                {c.executed_date && (
                  <span style={{ color: '#6b7280' }}>
                    executed{' '}
                    {new Date(c.executed_date + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                )}
                {c.notes && <span style={{ color: '#6b7280' }}>· {c.notes}</span>}
              </div>
              {canManage && c.status !== 'void' && (
                <button
                  onClick={() => handleVoid('client', c.id)}
                  disabled={busy}
                  style={{
                    padding: '0.25rem 0.625rem',
                    fontSize: '0.75rem',
                    color: '#991b1b',
                    backgroundColor: '#fff',
                    border: '1px solid #fecaca',
                    borderRadius: '0.375rem',
                    cursor: busy ? 'default' : 'pointer',
                  }}
                >
                  Void
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <div style={cardStyle}>
        <div style={titleStyle}>Subcontractor Contracts ({subContracts.length})</div>
        <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.75rem' }}>
          Payment schedules commit the contract to job cost; payments settle stages as they are
          released.
        </p>

        {canManage && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 3fr 1fr auto',
              gap: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select a sub…</option>
              {subMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
            <input
              placeholder="Scope of work"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="Value"
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              style={inputStyle}
            />
            <button
              onClick={handleAddSubContract}
              disabled={busy}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#fff',
                backgroundColor: busy ? '#93c5fd' : '#2563eb',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: busy ? 'default' : 'pointer',
              }}
            >
              Add
            </button>
          </div>
        )}

        {subContracts.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>No subcontractor contracts yet.</p>
        ) : (
          subContracts.map((c) => (
            <div key={c.id} style={{ borderBottom: '1px solid #f3f4f6', padding: '0.5rem 0' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.875rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {statusBadge(c.status)}
                  <span style={{ fontWeight: 500 }}>{c.member?.display_name ?? 'Unknown sub'}</span>
                  <span style={{ fontWeight: 600 }}>{money(c.contract_value)}</span>
                  {c.scope_of_work && (
                    <span style={{ color: '#6b7280' }}>· {c.scope_of_work}</span>
                  )}
                </div>
                {canManage && c.status !== 'void' && (
                  <button
                    onClick={() => handleVoid('sub', c.id)}
                    disabled={busy}
                    style={{
                      padding: '0.25rem 0.625rem',
                      fontSize: '0.75rem',
                      color: '#991b1b',
                      backgroundColor: '#fff',
                      border: '1px solid #fecaca',
                      borderRadius: '0.375rem',
                      cursor: busy ? 'default' : 'pointer',
                    }}
                  >
                    Void
                  </button>
                )}
              </div>
              {/* 7C §4.3/§4.4 — payment schedule + stage/payment panel. */}
              {c.status !== 'void' && (
                <SubSchedulePanel
                  contract={c}
                  rows={schedules[c.id] ?? []}
                  canManage={canManage}
                  role={role}
                />
              )}
            </div>
          ))
        )}
        {error && (
          <div
            style={{
              padding: '0.5rem',
              marginTop: '0.5rem',
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              borderRadius: '0.375rem',
              fontSize: '0.8125rem',
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 7C §4.3 — payment-schedule setup, and §4.4 — the stage & payment panel.
// ----------------------------------------------------------------------------

const smallButton: React.CSSProperties = {
  padding: '0.25rem 0.625rem',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: '#374151',
  backgroundColor: '#fff',
  border: '1px solid #d1d5db',
  borderRadius: '0.375rem',
  cursor: 'pointer',
};

function SubSchedulePanel({
  contract,
  rows,
  canManage,
  role,
}: {
  contract: SubcontractorContract;
  rows: PayableListItem[];
  canManage: boolean;
  role: string;
}) {
  const router = useRouter();
  const isOwnerAdmin = role === 'owner' || role === 'admin';
  const isOwner = role === 'owner';

  const stages = rows.filter((r) => !r.is_retainage && !r.is_deleted);
  const retainageRow = rows.find((r) => r.is_retainage && !r.is_deleted) ?? null;

  const [settingUp, setSettingUp] = useState(false);
  const [paying, setPaying] = useState<PayableListItem | null>(null);
  const [closingOut, setClosingOut] = useState<PayableListItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // S-2 as amended [S95]: legacy targetless stages prompt for a REAL line at
  // approve — the Miscellaneous fallback is gone (S94 force-targets).
  const [needsTarget, setNeedsTarget] = useState<PayableListItem[]>([]);
  const [targetPicks, setTargetPicks] = useState<Record<string, string>>({});
  // 113c stage 4: the §3.3 award tie, re-derived when the review opens —
  // exactly one candidate prefills the schedule; several defer to the picker.
  const [awardLines, setAwardLines] = useState<AwardBudgetLine[] | null>(null);
  // 113c stage 5: revise-while-unsigned — the editor reopens seeded with the
  // CURRENT stages (labels/amounts/targets fetched at open).
  const [revising, setRevising] = useState(false);
  const [reviseInitial, setReviseInitial] = useState<
    { label: string; amount: string; budget_item_id: string }[] | null
  >(null);

  async function openReview() {
    setBusy(true);
    setAwardLines(await deriveAwardBudgetLines(contract.project_id, contract.member_id));
    setBusy(false);
    setSettingUp(true);
  }

  // 113c §0.4/§5 — the per-draft toggle. Committed still counts on approval;
  // the toggle only decides whether it renders as awaiting the sub's
  // signature (italic on Budget & Cost) until status='signed'.
  async function handleToggleFormal(next: boolean) {
    setBusy(true);
    const res = await updateSubcontractorContract(contract.id, { requires_formal_contract: next });
    setBusy(false);
    if (!res.success) setNotice(res.error ?? 'Could not update the contract.');
    else router.refresh();
  }

  const formalToggle =
    canManage && contract.status !== 'signed' && contract.status !== 'void' ? (
      <label
        style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: '#374151', margin: '0.25rem 0' }}
      >
        <input
          type="checkbox"
          checked={contract.requires_formal_contract}
          disabled={busy}
          onChange={(e) => void handleToggleFormal(e.target.checked)}
        />
        Needs formal contract — committed counts on approval but shows as
        &ldquo;awaiting signature&rdquo; until the sub signs
      </label>
    ) : null;

  async function handleDeletePayment(paymentId: string) {
    if (!confirm('Delete this payment? A recorded payment is immutable — delete and re-enter to correct it.')) return;
    setBusy(true);
    const res = await softDeletePayment(paymentId);
    setBusy(false);
    if (!res.success) setNotice(res.error ?? 'Delete failed.');
    else router.refresh();
  }

  async function handleApproveAll() {
    setBusy(true);
    setNotice(null);
    const untargeted: PayableListItem[] = [];
    for (const s of stages.filter((x) => x.status === 'pending')) {
      // A-7: approval requires a full split. A stage keeps its captured
      // budget-line target (§4.4). S-2 as amended [S95]: an untargeted
      // (legacy) stage is NOT approved onto Miscellaneous — it is skipped
      // and prompts for a real line below (S94 force-targets).
      const captured = await listExpenseAllocations(s.id);
      const allocations = captured.map((a) => ({
        budget_item_id: a.budget_item_id,
        amount: a.amount,
      }));
      if (allocations.length === 0) {
        untargeted.push(s);
        continue;
      }
      const res = await approveExpense(s.id, allocations);
      if (!res.success) {
        setNotice(res.error ?? 'Approval failed.');
        break;
      }
    }
    setNeedsTarget(untargeted);
    if (untargeted.length > 0) {
      setNotice(
        `${untargeted.length} stage${untargeted.length === 1 ? ' has' : 's have'} no budget-line target — pick a real line for each below (stages never land on Miscellaneous).`
      );
    }
    setBusy(false);
    router.refresh();
  }

  async function handleApproveWithTarget(s: PayableListItem) {
    const picked = targetPicks[s.id];
    if (!picked) {
      setNotice('Pick a budget line for the stage first.');
      return;
    }
    setBusy(true);
    setNotice(null);
    const res = await approveExpense(s.id, [{ budget_item_id: picked, amount: s.amount }]);
    setBusy(false);
    if (!res.success) {
      setNotice(res.error ?? 'Approval failed.');
      return;
    }
    setNeedsTarget((prev) => prev.filter((x) => x.id !== s.id));
    router.refresh();
  }

  if (stages.length === 0) {
    if (!canManage) return null;
    // 113c stage 4 (§4) — the Review & confirm flow on a draft: contract
    // details + the formal-contract toggle + Ruling-B plan-vs-contract
    // variance, over the shipped 7C schedule editor. Confirm = schedule
    // setup (pending) + the Owner/Admin batch-approve below.
    const single = awardLines?.length === 1 ? awardLines[0] : null;
    return (
      <div style={{ marginTop: '0.5rem' }}>
        {formalToggle}
        {settingUp ? (
          <>
            {single && single.budgeted_amount !== null && contract.contract_value !== null && (
              <p style={{ fontSize: '0.75rem', color: single.budgeted_amount === contract.contract_value ? '#6b7280' : '#92400e', margin: '0.25rem 0' }}>
                Budget line plan {money(single.budgeted_amount)} · contract{' '}
                {money(contract.contract_value)}
                {single.budgeted_amount !== contract.contract_value &&
                  ` · variance ${money(contract.contract_value - single.budgeted_amount)} — budgeted stays the plan; the difference shows as budgeted-vs-committed variance once confirmed`}
              </p>
            )}
            {awardLines !== null && awardLines.length > 1 && (
              <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.25rem 0' }}>
                This sub won {awardLines.length} lines — pick each stage&rsquo;s budget line
                explicitly.
              </p>
            )}
            <ScheduleSetupEditor
              contract={contract}
              hideAmounts={!isOwnerAdmin}
              prefillBudgetItemId={single?.budget_item_id ?? null}
              onCancel={() => setSettingUp(false)}
              onDone={(warning) => {
                setSettingUp(false);
                if (warning) setNotice(warning);
                router.refresh();
              }}
            />
          </>
        ) : (
          <button style={smallButton} disabled={busy} onClick={() => void openReview()}>
            {contract.status === 'draft' ? 'Review & confirm' : 'Set up payment schedule'}
          </button>
        )}
        {notice && (
          <p style={{ fontSize: '0.75rem', color: '#92400e', margin: '0.5rem 0 0' }}>{notice}</p>
        )}
      </div>
    );
  }

  const pendingStages = stages.filter((s) => s.status === 'pending');

  // 113c §5 — revise is open only while formal-and-unsigned with NO payments
  // (the RPC re-checks; signing or paying closes the path for good).
  const hasPayments = rows.some((r) => r.payments.some((p) => !p.is_deleted));
  const canRevise =
    isOwnerAdmin &&
    contract.requires_formal_contract &&
    contract.status !== 'signed' &&
    contract.status !== 'void' &&
    !hasPayments;

  async function openRevise() {
    setBusy(true);
    const seeded = await Promise.all(
      stages.map(async (s) => {
        const allocs = await listExpenseAllocations(s.id);
        return {
          label: s.stage_label ?? '',
          amount: String(s.amount),
          budget_item_id: allocs[0]?.budget_item_id ?? '',
        };
      })
    );
    setReviseInitial(seeded);
    setBusy(false);
    setRevising(true);
  }

  return (
    <div style={{ marginTop: '0.5rem', paddingLeft: '0.75rem', borderLeft: '2px solid #eef1f6' }}>
      {formalToggle}
      {canRevise && !revising && (
        <button style={smallButton} disabled={busy} onClick={() => void openRevise()}>
          Revise schedule
        </button>
      )}
      {revising && reviseInitial && (
        <ScheduleSetupEditor
          contract={contract}
          hideAmounts={!isOwnerAdmin}
          initialStages={reviseInitial}
          reviseMode
          onCancel={() => setRevising(false)}
          onDone={(warning) => {
            setRevising(false);
            setReviseInitial(null);
            if (warning) setNotice(warning);
            router.refresh();
          }}
        />
      )}
      {pendingStages.length > 0 && isOwnerAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#92400e' }}>
            {pendingStages.length} stage{pendingStages.length === 1 ? '' : 's'} awaiting approval —
            nothing counts against the job until approved.
          </span>
          <button style={smallButton} disabled={busy} onClick={() => void handleApproveAll()}>
            Approve all
          </button>
        </div>
      )}

      {stages.map((s) => {
        const paid = grossPaid(s.payments);
        const remaining = committedRemaining(s, s.payments);
        const closedOut = s.closed_out_at !== null;
        const payments = s.payments.filter((p) => !p.is_deleted);
        return (
          <div key={s.id} style={{ padding: '0.375rem 0', fontSize: '0.8125rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>{s.stage_label ?? 'Stage'}</span>
              <span>{fmtMoney(s.amount)}</span>
              <span style={{ color: '#6b7280' }}>
                {fmtMoney(paid)} paid · {closedOut ? 'closed out' : `${fmtMoney(remaining)} remaining`}
              </span>
              {s.status === 'pending' && <span style={{ color: '#92400e' }}>pending</span>}
              {s.status === 'rejected' && <span style={{ color: '#991b1b' }}>rejected</span>}
              {!closedOut && s.status === 'approved' && remaining <= 0 && (
                <span style={{ color: '#166534' }}>settled</span>
              )}
              {isOwnerAdmin && !closedOut && s.status === 'approved' && remaining > 0 && (
                <>
                  <button style={smallButton} disabled={busy} onClick={() => setPaying(s)}>
                    Record payment
                  </button>
                  <button
                    style={{ ...smallButton, color: '#991b1b', borderColor: '#fecaca' }}
                    disabled={busy}
                    onClick={() => setClosingOut(s)}
                  >
                    Close out
                  </button>
                </>
              )}
            </div>
            {payments.length > 0 && (
              <div style={{ marginTop: '0.25rem', paddingLeft: '0.75rem' }}>
                {payments.map((p) => (
                  <div key={p.id} style={{ fontSize: '0.75rem', color: '#6b7280', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span>
                      {p.paid_date} · {fmtMoney(p.amount)}
                      {p.retainage_withheld > 0 &&
                        ` (check ${fmtMoney(p.amount - p.retainage_withheld)} · ${fmtMoney(p.retainage_withheld)} retainage)`}
                      {p.method && ` · ${p.method}`}
                      {p.over_stage && ' · over-stage'}
                      {p.note && ` · "${p.note}"`}
                    </span>
                    {isOwnerAdmin && (
                      <button
                        style={{ border: 'none', background: 'none', color: '#991b1b', fontSize: '0.6875rem', cursor: 'pointer', padding: 0 }}
                        disabled={busy}
                        onClick={() => void handleDeletePayment(p.id)}
                      >
                        delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {retainageRow && (
        <div style={{ padding: '0.375rem 0', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span style={{ fontWeight: 600, color: '#374151' }}>Retainage held</span>
          <span>{fmtMoney(committedRemaining(retainageRow, retainageRow.payments))}</span>
          {contract.retainage_percent !== null && (
            <span style={{ color: '#6b7280' }}>({Number(contract.retainage_percent)}% across payments)</span>
          )}
          {/* Release is Owner-ONLY (CLAUDE.md owner-only #5) — rendered so. */}
          {isOwner &&
            retainageRow.status === 'approved' &&
            retainageRow.closed_out_at === null &&
            committedRemaining(retainageRow, retainageRow.payments) > 0 && (
              <button style={smallButton} disabled={busy} onClick={() => setPaying(retainageRow)}>
                Release retainage
              </button>
            )}
        </div>
      )}

      {notice && (
        <p style={{ fontSize: '0.75rem', color: '#92400e', margin: '0.25rem 0 0' }}>{notice}</p>
      )}

      {/* S-2 [S95]: legacy targetless stages — inline picker at approve;
          Miscellaneous excluded (S94 force-targets). */}
      {needsTarget.length > 0 && isOwnerAdmin && (
        <div style={{ border: '1px solid #fde68a', borderRadius: '0.375rem', padding: '0.5rem 0.625rem', margin: '0.375rem 0 0', backgroundColor: '#fffbeb' }}>
          {needsTarget.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', fontSize: '0.8125rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>{s.stage_label ?? 'Stage'}</span>
              <span>{fmtMoney(s.amount)}</span>
              <BudgetLineSelect
                projectId={contract.project_id}
                value={targetPicks[s.id] ?? ''}
                onChange={(v) => setTargetPicks((prev) => ({ ...prev, [s.id]: v }))}
                excludeMiscellaneous
                hideAmounts={!isOwnerAdmin}
                disabled={busy}
                style={{ padding: '0.25rem 0.375rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.75rem', flex: 1, minWidth: '180px' }}
              />
              <button style={smallButton} disabled={busy} onClick={() => void handleApproveWithTarget(s)}>
                Approve
              </button>
            </div>
          ))}
        </div>
      )}

      {paying && (
        <PaymentModal
          expense={{
            id: paying.id,
            supplier: paying.supplier,
            stage_label: paying.stage_label,
            amount: paying.amount,
            paidToDate: grossPaid(paying.payments),
            is_retainage: paying.is_retainage,
          }}
          subContractId={paying.sub_contract_id}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            router.refresh();
          }}
        />
      )}

      {closingOut && (
        <CloseoutDialog
          expense={{
            id: closingOut.id,
            supplier: closingOut.supplier,
            stage_label: closingOut.stage_label,
            remaining: committedRemaining(closingOut, closingOut.payments),
            isSubCommitment: true,
          }}
          onClose={() => setClosingOut(null)}
          onDone={(warning) => {
            setClosingOut(null);
            if (warning) setNotice(warning);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ScheduleSetupEditor({
  contract,
  hideAmounts,
  prefillBudgetItemId,
  initialStages,
  reviseMode,
  onCancel,
  onDone,
}: {
  contract: SubcontractorContract;
  /** Floor: budgeted figures in the picker are Owner/Admin only. */
  hideAmounts: boolean;
  /** 113c §4 — the §3.3 award tie when it is UNAMBIGUOUS (exactly one
   *  candidate line); null defers entirely to the picker. */
  prefillBudgetItemId?: string | null;
  /** 113c §5 — revise mode seeds the editor with the CURRENT stages. */
  initialStages?: { label: string; amount: string; budget_item_id: string }[];
  /** 113c §5 — revise-while-unsigned: adds the contract-value input and
   *  routes save through revise_sub_contract_schedule (tear down +
   *  re-setup, one transaction; stages land pending → re-approve). */
  reviseMode?: boolean;
  onCancel: () => void;
  /** Called on success; receives the RPC's advisory warning, if any. */
  onDone: (warning?: string) => void;
}) {
  // S-2 as amended [S95]: every stage REQUIRES a real budget-line target —
  // Miscellaneous excluded, save blocked until each stage has one (S94
  // force-targets). One fetch, shared across the per-stage pickers.
  // 113c stage 4: a draft's first stage prefills from the contract — full
  // contract_value on the derived award line (single-stage confirm is the
  // common case; the user reshapes freely before save).
  const [stages, setStages] = useState<{ label: string; amount: string; budget_item_id: string }[]>(
    initialStages && initialStages.length > 0
      ? initialStages
      : [
          {
            label: '',
            amount: contract.contract_value !== null ? String(contract.contract_value) : '',
            budget_item_id: prefillBudgetItemId ?? '',
          },
        ]
  );
  const [lines, setLines] = useState<BudgetLineOption[] | null>(null);
  const [retainageShape, setRetainageShape] = useState<'' | 'percent_across' | 'final_hold'>(
    (contract.retainage_shape as '' | 'percent_across' | 'final_hold' | null) ?? ''
  );
  const [retainagePercent, setRetainagePercent] = useState(
    contract.retainage_percent !== null ? String(contract.retainage_percent) : ''
  );
  const [reviseValue, setReviseValue] = useState(
    contract.contract_value !== null ? String(contract.contract_value) : ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listProjectBudgetLines(contract.project_id).then((rows) => {
      if (!cancelled) setLines(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [contract.project_id]);

  const stageTotal = stages.reduce((sum, s) => {
    const n = Number(s.amount);
    return sum + (Number.isNaN(n) ? 0 : n);
  }, 0);
  // Live Σ-vs-contract_value check — advisory in the editor AND returned by
  // the RPC post-save (P2: warn, never block).
  const mismatch =
    contract.contract_value !== null && stageTotal > 0 && stageTotal !== contract.contract_value;

  async function handleSave() {
    const included = stages.filter((s) => s.label.trim() || s.amount.trim() || s.budget_item_id);
    if (included.some((s) => !s.budget_item_id)) {
      setError('Every stage needs a budget line — stages always target a real line (never Miscellaneous).');
      return;
    }
    const revisedValue = reviseMode && reviseValue.trim() !== '' ? Number(reviseValue) : null;
    if (reviseMode && revisedValue !== null && !(revisedValue > 0)) {
      setError('The contract value must be greater than zero.');
      return;
    }
    setBusy(true);
    setError(null);
    const parsed: ScheduleStageInput[] = included.map((s) => ({
      label: s.label,
      amount: Number(s.amount),
      budget_item_id: s.budget_item_id,
    }));
    const retainage = retainageShape
      ? { shape: retainageShape, percent: retainageShape === 'percent_across' ? Number(retainagePercent) : undefined }
      : undefined;
    const res = reviseMode
      ? await reviseSubContractSchedule(contract.id, parsed, retainage, revisedValue)
      : await setupPaymentSchedule(contract.id, parsed, retainage);
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? (reviseMode ? 'Revision failed.' : 'Setup failed.'));
      return;
    }
    onDone(res.warning);
  }

  const input: React.CSSProperties = {
    padding: '0.375rem 0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    fontSize: '0.8125rem',
  };

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.75rem', marginTop: '0.25rem' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
        {reviseMode ? 'Revise schedule (unsigned — not locked in)' : 'Payment schedule'}
      </div>
      {reviseMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.8125rem', color: '#374151' }}>Contract value:</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={reviseValue}
            onChange={(e) => setReviseValue(e.target.value)}
            style={{ padding: '0.375rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.8125rem', width: '130px' }}
          />
          <span style={{ fontSize: '0.6875rem', color: '#6b7280' }}>
            Saving replaces the current stages — the new stages land pending and need re-approval.
          </span>
        </div>
      )}
      {stages.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.375rem' }}>
          <input
            placeholder={`Stage ${i + 1} label (e.g. Rough-in)`}
            value={s.label}
            onChange={(e) =>
              setStages((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
            }
            style={{ ...input, flex: 1 }}
          />
          <input
            placeholder="Amount"
            type="number"
            min="0.01"
            step="0.01"
            value={s.amount}
            onChange={(e) =>
              setStages((prev) => prev.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
            }
            style={{ ...input, width: '110px' }}
          />
          <BudgetLineSelect
            projectId={contract.project_id}
            lines={lines}
            value={s.budget_item_id}
            onChange={(v) =>
              setStages((prev) => prev.map((x, j) => (j === i ? { ...x, budget_item_id: v } : x)))
            }
            excludeMiscellaneous
            hideAmounts={hideAmounts}
            disabled={busy}
            style={{ ...input, flex: 1, minWidth: '160px' }}
          />
          {stages.length > 1 && (
            <button
              style={{ ...smallButton, color: '#991b1b' }}
              onClick={() => setStages((prev) => prev.filter((_, j) => j !== i))}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        style={{ ...smallButton, marginBottom: '0.5rem' }}
        onClick={() =>
          setStages((prev) => [
            ...prev,
            {
              label: '',
              amount: '',
              // A new stage inherits the preceding stage's budget line (which
              // itself defaults to the derived award tie) — stages on one
              // sub-contract overwhelmingly target one line. Editable per
              // stage; the every-stage-needs-a-real-line save gate stands.
              budget_item_id: prev[prev.length - 1]?.budget_item_id ?? '',
            },
          ])
        }
      >
        + Add stage
      </button>

      <div style={{ fontSize: '0.8125rem', marginBottom: '0.5rem', color: mismatch ? '#92400e' : '#374151' }}>
        Stages total {money(stageTotal)}
        {contract.contract_value !== null && ` of ${money(contract.contract_value)} contract`}
        {mismatch && ' — totals differ (saving is allowed; this is a warning)'}
        {contract.contract_value === null && ' — no contract value on record to check against'}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.625rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8125rem', color: '#374151' }}>Retainage:</span>
        <select
          value={retainageShape}
          onChange={(e) => setRetainageShape(e.target.value as typeof retainageShape)}
          style={input}
        >
          <option value="">None</option>
          <option value="percent_across">% across payments</option>
          <option value="final_hold">Hold final stage</option>
        </select>
        {retainageShape === 'percent_across' && (
          <input
            placeholder="%"
            type="number"
            min="0"
            step="0.01"
            value={retainagePercent}
            onChange={(e) => setRetainagePercent(e.target.value)}
            style={{ ...input, width: '70px' }}
          />
        )}
      </div>

      {error && <p style={{ fontSize: '0.75rem', color: '#991b1b', margin: '0 0 0.5rem' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          style={{ ...smallButton, backgroundColor: busy ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none' }}
          disabled={busy}
          onClick={() => void handleSave()}
        >
          {busy ? 'Saving…' : 'Save — commits the schedule'}
        </button>
        <button style={smallButton} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
