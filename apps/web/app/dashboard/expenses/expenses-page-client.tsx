'use client';

// 7A §5.4 — role-scoped expense list. Crew: own rows, edit/soft-delete own
// PENDING rows (Q8), rejection note visible. PM/Foreman: read-only project
// expenses. Owner/Admin: all rows + Review queue tab (pending count badge)
// + trash link. RLS already scopes the data; this component only shapes it.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  softDeleteExpense,
  type ExpenseListItem,
  type ExpenseStatus,
} from '@/lib/services/expenses-client';
import { ExpenseCaptureModal } from '@/components/expenses/expense-capture-form';
import {
  EXPENSE_CATEGORY_LABELS,
  ExpenseStatusChip,
  fmtMoney,
} from '@/components/expenses/expense-ui';
import { ReviewPopup } from './review-popup';
import {
  cardStyle,
  color,
  font,
  h2Style,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';

interface ExpensesPageClientProps {
  role: string;
  myMemberId: string | null;
  expenses: ExpenseListItem[];
  /** Active projects — capture + review-time reassign options. */
  activeProjects: { id: string; name: string }[];
  /** All projects — name resolution for rows on non-active jobs. */
  projectNames: Record<string, string>;
  /** Owner/Admin: signed receipt URLs per PENDING expense (server-fetched). */
  pendingReceipts: Record<string, { id: string; name: string; url: string }[]>;
  todayYmd: string;
}

type Tab = 'all' | 'queue';

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
  activeProjects,
  projectNames,
  pendingReceipts,
  todayYmd,
}: ExpensesPageClientProps) {
  const router = useRouter();
  const isReviewer = role === 'owner' || role === 'admin';

  const [tab, setTab] = useState<Tab>('all');
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | ExpenseStatus>('');
  const [reviewing, setReviewing] = useState<ExpenseListItem | null>(null);
  const [editing, setEditing] = useState<ExpenseListItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => expenses.filter((e) => e.status === 'pending').length,
    [expenses]
  );

  const rows = useMemo(() => {
    let list = expenses;
    if (tab === 'queue') list = list.filter((e) => e.status === 'pending');
    if (projectFilter) list = list.filter((e) => e.project_id === projectFilter);
    if (tab === 'all' && statusFilter) list = list.filter((e) => e.status === statusFilter);
    return list;
  }, [expenses, tab, projectFilter, statusFilter]);

  async function handleDelete(id: string) {
    if (!confirm('Move this expense to trash?')) return;
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
          <Link href="/dashboard/expenses/new" style={primaryButtonStyle}>
            + Log expense
          </Link>
        </div>
      </div>

      {/* Owner/Admin tabs — All | Review queue (badge). */}
      {isReviewer && (
        <div style={{ display: 'flex', gap: '2px', borderBottom: `1px solid ${color.cardBorder}`, marginBottom: '14px' }}>
          {(
            [
              { key: 'all', label: 'All expenses' },
              { key: 'queue', label: `Review queue${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
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
        {tab === 'all' && (
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
                          <div style={{ fontSize: '12px', color: color.dangerAlt }}>
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
                                color: color.dangerAlt,
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
