'use client';

// 7A §5.4 + 7C §3.3 — role-scoped tabs: Receipts (7A point-of-purchase rows) |
// Bills & Commitments (7C payables — Owner/Admin/PM/Foreman) | Review queue
// (Owner/Admin; PM-entered bills appear beside receipts, §4.2). Crew: own
// receipts, edit/soft-delete own PENDING rows (Q8), rejection note visible.
// RLS already scopes the data; this component only shapes it.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  softDeleteExpense,
  type ExpenseListItem,
  type ExpenseStatus,
} from '@/lib/services/expenses-client';
import type { PayableListItem } from '@/lib/services/payables-client';
import { BillsTab } from './bills-tab';
import { BillFormModal } from './bill-form';
import { ExpenseCaptureModal } from '@/components/expenses/expense-capture-form';
import {
  EXPENSE_CATEGORY_LABELS,
  ExpenseStatusChip,
  fmtMoney,
} from '@/components/expenses/expense-ui';
import { ReviewPopup } from './review-popup';
import {
  committedRemaining,
  countsTowardCommitted,
  grossPaid,
} from '@/lib/services/payables-shared';
import { MetricStrip } from '@/components/list-screen/list-screen';
import {
  cardStyle,
  color,
  font,
  h2Style,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';
import { useConfirm } from '@/components/confirm/confirm-provider';

interface ExpensesPageClientProps {
  role: string;
  myMemberId: string | null;
  expenses: ExpenseListItem[];
  /** 7C payable rows with payments joined (may overlap `expenses` by id —
   *  the Receipts tab excludes them). */
  billRows: PayableListItem[];
  /** Active projects — capture + review-time reassign options. */
  activeProjects: { id: string; name: string }[];
  /** All projects — name resolution for rows on non-active jobs. */
  projectNames: Record<string, string>;
  /** Owner/Admin: signed receipt URLs per PENDING expense (server-fetched). */
  pendingReceipts: Record<string, { id: string; name: string; url: string }[]>;
  todayYmd: string;
}

type Tab = 'receipts' | 'bills' | 'queue';

const cellStyle: React.CSSProperties = {
  padding: '11px 14px',
  fontSize: '13px',
  color: color.body,
  borderBottom: `1px solid ${color.rowDivider}`,
  verticalAlign: 'top',
};

export function ExpensesPageClient({
  role,
  myMemberId,
  expenses,
  billRows,
  activeProjects,
  projectNames,
  pendingReceipts,
  todayYmd,
}: ExpensesPageClientProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const isReviewer = role === 'owner' || role === 'admin';
  // §4 roles: Bills tab for Owner/Admin/PM/Foreman (Foreman read-only); Crew
  // has nothing in 7C — receipts only.
  const seesBills = ['owner', 'admin', 'project_manager', 'foreman'].includes(role);
  const canEnterBills = ['owner', 'admin', 'project_manager'].includes(role);

  const [tab, setTab] = useState<Tab>('receipts');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | ExpenseStatus>('');
  const [reviewing, setReviewing] = useState<ExpenseListItem | null>(null);
  const [editing, setEditing] = useState<ExpenseListItem | null>(null);
  const [addingBill, setAddingBill] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ⚠️ #136 [S121] — this set is now BELT to the server's BRACES, not the only
  // guard. The page strips payable rows from `expenses` before they leave the
  // server for a role without Bills access, so for crew this set is empty AND
  // there is nothing for it to hide. For Owner/Admin/PM/Foreman both arrive and
  // this keeps payables off the Receipts tab, which is its original job.
  const payableIds = useMemo(() => new Set(billRows.map((b) => b.id)), [billRows]);

  const pendingCount = useMemo(
    () => expenses.filter((e) => e.status === 'pending').length,
    [expenses]
  );

  const rows = useMemo(() => {
    let list = expenses;
    // Receipts tab: 7A rows only — payables live on their own tab.
    if (tab === 'receipts') list = list.filter((e) => !payableIds.has(e.id));
    // Review queue: receipts AND bills side by side (§4.2).
    if (tab === 'queue') list = list.filter((e) => e.status === 'pending');
    if (projectFilter) list = list.filter((e) => e.project_id === projectFilter);
    if (tab === 'receipts' && statusFilter) list = list.filter((e) => e.status === statusFilter);
    return list;
  }, [expenses, tab, projectFilter, statusFilter, payableIds]);

  // §8.11.3 metric strips — in-memory over the payload already in hand, maths
  // from payables-shared (never restated). "Unbilled to client" is RULED
  // SKIPPED (no expense→invoice link, §6b.6); "not on any job yet" is NOT a
  // real state (project_id is NOT NULL) — neither renders. The month is the
  // COMPANY calendar month (todayYmd arrives company-tz from the server).
  const metrics = useMemo(() => {
    const monthPrefix = todayYmd.slice(0, 7);
    const receiptRows = expenses.filter((e) => !payableIds.has(e.id));
    const spendThisMonth = receiptRows
      .filter((e) => e.status === 'approved' && (e.expense_date ?? '').startsWith(monthPrefix))
      .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
    const awaitingApproval = expenses.filter((e) => e.status === 'pending').length;
    // Missing receipts = pending with no receipt file. `pendingReceipts` is
    // server-populated for reviewers only, so the metric renders only where
    // the answer is known — an unknowable zero would be a false all-clear.
    const missingReceipts = isReviewer
      ? expenses.filter(
          (e) => e.status === 'pending' && (pendingReceipts[e.id] ?? []).length === 0
        ).length
      : null;

    let committedOpen = 0;
    let paidToDate = 0;
    let retainageHeld = 0;
    let missingDueDates = 0;
    for (const row of billRows) {
      paidToDate += grossPaid(row.payments);
      if (countsTowardCommitted(row)) {
        const remaining = committedRemaining(row, row.payments);
        committedOpen += remaining;
        if (row.is_retainage) retainageHeld += remaining;
      }
      if (!row.due_date && row.closed_out_at === null) missingDueDates += 1;
    }
    return {
      spendThisMonth,
      awaitingApproval,
      missingReceipts,
      committedOpen,
      paidToDate,
      retainageHeld,
      missingDueDates,
    };
  }, [expenses, billRows, payableIds, pendingReceipts, isReviewer, todayYmd]);

  async function handleDelete(id: string) {
    if (!(await confirm('Move this expense to trash?'))) return;
    setBusyId(id);
    setError(null);
    const res = await softDeleteExpense(id);
    setBusyId(null);
    if (!res.success) {
      setError(res.error ?? 'Failed to delete the expense.');
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '16px',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={h2Style}>Expenses</h2>
          <p style={{ color: color.muted, fontSize: '14px', margin: '4px 0 0' }}>
            {isReviewer
              ? 'Receipts and job costs — nothing counts against a job until approved.'
              : 'Your logged receipts and their review status.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {isReviewer && (
            <Link
              href="/dashboard/expenses/trash"
              style={{ fontSize: '13px', color: color.muted, textDecoration: 'none' }}
            >
              Trash
            </Link>
          )}
          {tab === 'bills' && canEnterBills ? (
            <button style={primaryButtonStyle} onClick={() => setAddingBill(true)}>
              + New bill / commitment
            </button>
          ) : (
            <Link href="/dashboard/expenses/new" style={primaryButtonStyle}>
              + Log expense
            </Link>
          )}
        </div>
      </div>

      {/* §3.3 tabs — Receipts | Bills & Commitments | Review queue (badge). */}
      {(seesBills || isReviewer) && (
        <div style={{ display: 'flex', gap: '2px', borderBottom: `1px solid ${color.cardBorder}`, marginBottom: '14px' }}>
          {(
            [
              { key: 'receipts', label: 'Receipts' },
              ...(seesBills ? [{ key: 'bills', label: 'Bills & Commitments' }] : []),
              ...(isReviewer
                ? [{ key: 'queue', label: `Review queue${pendingCount > 0 ? ` (${pendingCount})` : ''}` }]
                : []),
            ] as { key: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '10px 14px',
                fontFamily: font.sans,
                fontSize: '13px',
                fontWeight: 600,
                color: tab === t.key ? color.navy : color.mutedAlt,
                boxShadow: tab === t.key ? `inset 0 -2px 0 ${color.primary}` : 'none',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* §8.11.3 metric strips, per tab. The gated role sees fewer cards,
          never empty ones. */}
      {tab === 'bills' ? (
        <MetricStrip
          metrics={[
            { label: 'Committed open', value: fmtMoney(metrics.committedOpen) },
            { label: 'Paid to date', value: fmtMoney(metrics.paidToDate) },
            { label: 'Retainage held', value: fmtMoney(metrics.retainageHeld) },
            { label: 'Missing due dates', value: metrics.missingDueDates },
          ]}
        />
      ) : (
        <MetricStrip
          metrics={[
            { label: 'Spend this month', value: fmtMoney(metrics.spendThisMonth), sub: 'approved receipts' },
            { label: 'Awaiting approval', value: metrics.awaitingApproval },
            ...(metrics.missingReceipts !== null
              ? [{ label: 'Missing receipts', value: metrics.missingReceipts }]
              : []),
          ]}
        />
      )}

      {/* 7C — Bills & Commitments tab (own filters, table, and modals). */}
      {tab === 'bills' ? (
        <BillsTab
          rows={billRows}
          role={role}
          projectNames={projectNames}
          activeProjects={activeProjects}
          todayYmd={todayYmd}
          onReview={(e) => setReviewing(e)}
        />
      ) : (
        <>
      {/* Filters. */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          style={{
            padding: '8px 10px',
            borderRadius: '9px',
            border: `1px solid ${color.inputBorder}`,
            fontSize: '13px',
            color: color.body,
          }}
        >
          <option value="">All jobs</option>
          {activeProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {tab === 'receipts' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | ExpenseStatus)}
            style={{
              padding: '8px 10px',
              borderRadius: '9px',
              border: `1px solid ${color.inputBorder}`,
              fontSize: '13px',
              color: color.body,
            }}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        )}
      </div>

      {error && <p style={{ color: color.danger, fontSize: '13px', margin: '0 0 12px' }}>{error}</p>}

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <p style={{ padding: '26px 20px', fontSize: '14px', color: color.muted, margin: 0 }}>
            {tab === 'queue' ? 'No expenses waiting for review.' : 'No expenses yet.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Date', 'Supplier', 'Amount', 'Category', 'Job', 'Logged by', 'Status', ''].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          ...microLabelStyle,
                          textAlign: 'left',
                          padding: '10px 14px',
                          backgroundColor: color.tableHeadBg,
                          borderBottom: `1px solid ${color.cardBorder}`,
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const ownPending = e.author_member_id === myMemberId && e.status === 'pending';
                  return (
                    <tr key={e.id}>
                      <td style={{ ...cellStyle, fontFamily: font.mono, whiteSpace: 'nowrap' }}>
                        {e.expense_date}
                      </td>
                      <td style={cellStyle}>
                        {e.supplier}
                        {e.description && (
                          <div style={{ fontSize: '12px', color: color.muted }}>{e.description}</div>
                        )}
                        {e.status === 'rejected' && e.rejection_note && (
                          <div style={{ fontSize: '12px', color: color.danger }}>
                            Rejected: {e.rejection_note}
                          </div>
                        )}
                      </td>
                      <td style={{ ...cellStyle, fontFamily: font.mono, whiteSpace: 'nowrap' }}>
                        {fmtMoney(e.amount)}
                      </td>
                      <td style={cellStyle}>{EXPENSE_CATEGORY_LABELS[e.cost_category] ?? e.cost_category}</td>
                      <td style={cellStyle}>{projectNames[e.project_id] ?? '—'}</td>
                      <td style={cellStyle}>{e.author?.display_name ?? '—'}</td>
                      <td style={cellStyle}>
                        <ExpenseStatusChip status={e.status} />
                      </td>
                      <td style={{ ...cellStyle, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {isReviewer && e.status === 'pending' && (
                          <button
                            style={{ ...secondaryButtonStyle, padding: '5px 12px', fontSize: '12px' }}
                            onClick={() => setReviewing(e)}
                          >
                            Review
                          </button>
                        )}
                        {!isReviewer && ownPending && (
                          <>
                            <button
                              style={{
                                border: 'none',
                                background: 'none',
                                color: color.primary,
                                fontWeight: 600,
                                fontSize: '13px',
                                cursor: 'pointer',
                                padding: '4px 6px',
                              }}
                              onClick={() => setEditing(e)}
                            >
                              Edit
                            </button>
                            <button
                              style={{
                                border: 'none',
                                background: 'none',
                                color: color.danger,
                                fontWeight: 600,
                                fontSize: '13px',
                                cursor: busyId === e.id ? 'default' : 'pointer',
                                padding: '4px 6px',
                              }}
                              disabled={busyId === e.id}
                              onClick={() => void handleDelete(e.id)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}

      {/* §5.5 — the review popup (Owner/Admin). */}
      {reviewing && (
        <ReviewPopup
          expense={reviewing}
          receipts={pendingReceipts[reviewing.id] ?? []}
          projects={activeProjects}
          onClose={() => setReviewing(null)}
          onDone={() => {
            setReviewing(null);
            router.refresh();
          }}
        />
      )}

      {/* 7C §4.1 — new bill / commitment (Owner/Admin/PM; PM lands pending). */}
      {addingBill && (
        <BillFormModal
          projects={activeProjects}
          todayYmd={todayYmd}
          onClose={() => setAddingBill(false)}
          onDone={() => {
            setAddingBill(false);
            router.refresh();
          }}
        />
      )}

      {/* Q8 — edit own pending row (shared capture form). */}
      {editing && (
        <ExpenseCaptureModal
          title="Edit expense"
          projects={activeProjects}
          existing={editing}
          callerRole={role}
          todayYmd={todayYmd}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
