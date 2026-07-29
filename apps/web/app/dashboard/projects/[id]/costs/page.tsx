import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { notFound, redirect } from 'next/navigation';
import { getProject } from '@/lib/services/projects';
import { getExpenses, getJobCostRollup } from '@/lib/services/expenses';
import { getPayablesSummary } from '@/lib/services/payables';
import { getBudgetRollup } from '@/lib/services/budget';
import { getMembers } from '@/lib/services/members';
import {
  EXPENSE_CATEGORY_LABELS,
  ExpenseStatusChip,
  fmtMoney,
} from '@/components/expenses/expense-ui';
import { cardStyle, color, font, h2Style, microLabelStyle, primaryButtonStyle } from '@/lib/theme';

const thStyle: React.CSSProperties = {
  ...microLabelStyle,
  textAlign: 'left',
  padding: '10px 14px',
  backgroundColor: color.tableHeadBg,
  borderBottom: `1px solid ${color.cardBorder}`,
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: '13px',
  color: color.body,
  borderBottom: `1px solid ${color.rowDivider}`,
};

const moneyTd: React.CSSProperties = {
  ...tdStyle,
  fontFamily: font.mono,
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

/**
 * 7A §5.6 / §4 — Job Cost tab. Owner/Admin: labor (derived, frozen burdened
 * snapshots) + expenses + per-line budget vs actual, labeled "labor +
 * expenses to date" (NOT total job cost — sub bills are 7C). PM/Foreman:
 * expense totals + list ONLY (Financial Visibility Floor, UI-gated per
 * ui-01 §11 until FINANCIAL-RLS-FLOOR lands). Crew: no entry (tab hidden;
 * direct URL redirects).
 */
export default async function JobCostPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  const role = profile?.role ?? '';

  // Crew has no rollup access (Q3) — own expense rows live on /dashboard/expenses.
  if (!['owner', 'admin', 'project_manager', 'foreman'].includes(role)) {
    redirect(`/dashboard/projects/${params.id}`);
  }
  const isOwnerAdmin = role === 'owner' || role === 'admin';

  const project = await getProject(params.id);
  if (!project) notFound();

  // Payables section (7C §4.5): Owner/Admin + PM — foreman sees the expenses
  // side only (no Payables money summary beyond expenses, §4 roles).
  const seesPayables = isOwnerAdmin || role === 'project_manager';

  const [rollup, expenses, payables] = await Promise.all([
    getJobCostRollup(params.id),
    getExpenses({ project_id: params.id }),
    seesPayables ? getPayablesSummary(params.id) : Promise.resolve(null),
  ]);

  // Owner/Admin extras: per-line budget vs actual + member names for labor.
  const [budget, members] = isOwnerAdmin
    ? await Promise.all([getBudgetRollup(params.id), getMembers()])
    : [null, []];
  const memberNames: Record<string, string> = Object.fromEntries(
    members.map((m) => [m.id, m.display_name])
  );

  const showLabor = isOwnerAdmin && rollup.labor.available;
  const combined = rollup.expenses.totalApproved + (showLabor ? rollup.labor.totalCost : 0);

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
          <h2 style={{ ...h2Style, fontSize: '19px' }}>Job cost</h2>
          <p style={{ color: color.muted, fontSize: '13px', margin: '4px 0 0' }}>
            {isOwnerAdmin
              ? 'Labor + actual expenses to date — receipts plus bill payments. Committed (unpaid) costs show under Payables below.'
              : 'Approved expenses to date on this job.'}
          </p>
        </div>
        <Link href={`/dashboard/expenses/new?project=${project.id}`} style={primaryButtonStyle}>
          + Log expense
        </Link>
      </div>

      {/* Summary tiles. */}
      <div style={{ display: 'flex', gap: '14px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {showLabor && (
          <div style={{ ...cardStyle, padding: '16px 20px', minWidth: '180px' }}>
            <p style={microLabelStyle}>Labor to date</p>
            <p style={{ fontFamily: font.mono, fontSize: '22px', fontWeight: 600, color: color.navy, margin: '6px 0 0' }}>
              {fmtMoney(rollup.labor.totalCost)}
            </p>
            <p style={{ fontSize: '11px', color: color.faint, margin: '4px 0 0' }}>
              {rollup.labor.totalHours.toFixed(1)} hrs · approved time at frozen burdened rates
            </p>
          </div>
        )}
        <div style={{ ...cardStyle, padding: '16px 20px', minWidth: '180px' }}>
          <p style={microLabelStyle}>Expenses to date</p>
          <p style={{ fontFamily: font.mono, fontSize: '22px', fontWeight: 600, color: color.navy, margin: '6px 0 0' }}>
            {fmtMoney(rollup.expenses.totalApproved)}
          </p>
          <p style={{ fontSize: '11px', color: color.faint, margin: '4px 0 0' }}>
            approved receipts + bill payments
            {rollup.expenses.pendingCount > 0 && ` · ${rollup.expenses.pendingCount} pending review`}
          </p>
        </div>
        {showLabor && (
          <div style={{ ...cardStyle, padding: '16px 20px', minWidth: '180px' }}>
            <p style={microLabelStyle}>Labor + expenses to date</p>
            <p style={{ fontFamily: font.mono, fontSize: '22px', fontWeight: 600, color: color.navy, margin: '6px 0 0' }}>
              {fmtMoney(combined)}
            </p>
            <p style={{ fontSize: '11px', color: color.faint, margin: '4px 0 0' }}>
              actual to date — committed costs are separate (Payables)
            </p>
          </div>
        )}
      </div>

      {/* 7C §4.5 — Payables (Owner/Admin + PM): committed remaining, retainage
          held, awaiting-paper list, still-owed headline ("THE NUMBER"). */}
      {payables && (
        <div style={{ ...cardStyle, padding: '16px 20px', marginBottom: '18px', maxWidth: '560px' }}>
          <p style={{ ...microLabelStyle, marginBottom: '10px' }}>Payables</p>
          <div style={{ display: 'flex', gap: '26px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <div>
              <p style={{ fontSize: '11px', color: color.faint, margin: 0 }}>Still owed</p>
              <p style={{ fontFamily: font.mono, fontSize: '20px', fontWeight: 600, color: color.navy, margin: '2px 0 0' }}>
                {fmtMoney(payables.stillOwed)}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '11px', color: color.faint, margin: 0 }}>Retainage held</p>
              <p style={{ fontFamily: font.mono, fontSize: '20px', fontWeight: 600, color: color.navy, margin: '2px 0 0' }}>
                {fmtMoney(payables.retainageHeld)}
              </p>
            </div>
          </div>
          {payables.awaitingPaper.length > 0 && (
            <div style={{ borderTop: `1px solid ${color.rowDivider}`, paddingTop: '8px' }}>
              <p style={{ fontSize: '11px', color: color.faint, margin: '0 0 4px' }}>
                Bill expected — committed with no document yet
              </p>
              {payables.awaitingPaper.map((a) => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '2px 0' }}>
                  <span style={{ color: color.body }}>{a.supplier}</span>
                  <span style={{ fontFamily: font.mono, color: color.navy }}>{fmtMoney(a.amount)}</span>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: '11px', color: color.faint, margin: '8px 0 0' }}>
            Still owed = committed − paid. Manage rows on the{' '}
            <Link href="/dashboard/expenses" style={{ color: color.primary }}>
              Bills &amp; Commitments
            </Link>{' '}
            tab.
          </p>
        </div>
      )}

      {/* Expenses by category (all §5.6 audiences). */}
      <div style={{ ...cardStyle, padding: '16px 20px', marginBottom: '18px', maxWidth: '420px' }}>
        <p style={{ ...microLabelStyle, marginBottom: '8px' }}>Approved expenses by category</p>
        {(Object.entries(rollup.expenses.byCategory) as [string, number][]).map(([cat, total]) => (
          <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
            <span style={{ color: color.body }}>{EXPENSE_CATEGORY_LABELS[cat] ?? cat}</span>
            <span style={{ fontFamily: font.mono, color: color.navy }}>{fmtMoney(total)}</span>
          </div>
        ))}
        {isOwnerAdmin && (
          <div style={{ borderTop: `1px solid ${color.rowDivider}`, marginTop: '6px', paddingTop: '6px', fontSize: '12px', color: color.muted }}>
            Allocated to budget lines: {fmtMoney(rollup.expenses.allocated)} · unallocated:{' '}
            {fmtMoney(rollup.expenses.unallocated)}
          </div>
        )}
      </div>

      {/* Owner/Admin — labor by member (derived, never persisted). */}
      {showLabor && rollup.labor.byMember.length > 0 && (
        <div style={{ ...cardStyle, overflow: 'hidden', marginBottom: '18px', maxWidth: '560px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Labor by member</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Hours</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {rollup.labor.byMember.map((m) => (
                  <tr key={m.member_id}>
                    <td style={tdStyle}>{memberNames[m.member_id] ?? 'Member'}</td>
                    <td style={moneyTd}>{m.hours.toFixed(1)}</td>
                    <td style={moneyTd}>{fmtMoney(m.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Owner/Admin — per-line budget vs actual (§2.3 trigger-maintained). */}
      {isOwnerAdmin && budget && budget.groups.length > 0 && (
        <div style={{ ...cardStyle, overflow: 'hidden', marginBottom: '18px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Budget line</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Budgeted</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actual (allocated)</th>
                </tr>
              </thead>
              <tbody>
                {budget.groups.flatMap((g) =>
                  g.items.map((item) => (
                    <tr key={item.id}>
                      <td style={tdStyle}>
                        {item.description ?? 'Untitled line'}
                        {item.cost_code && (
                          <span style={{ fontFamily: font.mono, fontSize: '11px', color: color.faint }}>
                            {' '}
                            · {item.cost_code}
                          </span>
                        )}
                      </td>
                      <td style={moneyTd}>{fmtMoney(item.budgeted_amount)}</td>
                      <td style={moneyTd}>{fmtMoney(item.actual_amount)}</td>
                    </tr>
                  ))
                )}
                <tr>
                  <td style={{ ...tdStyle, fontWeight: 700, borderBottom: 'none' }}>Total</td>
                  <td style={{ ...moneyTd, fontWeight: 700, borderBottom: 'none' }}>
                    {fmtMoney(budget.totalBudgeted)}
                  </td>
                  <td style={{ ...moneyTd, fontWeight: 700, borderBottom: 'none' }}>
                    {fmtMoney(budget.totalActual)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expense list (role-scoped audiences; RLS scopes rows). */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        {expenses.length === 0 ? (
          <p style={{ padding: '22px 20px', fontSize: '14px', color: color.muted, margin: 0 }}>
            No expenses logged on this job yet.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Supplier</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Logged by</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td style={{ ...tdStyle, fontFamily: font.mono, whiteSpace: 'nowrap' }}>
                      {e.expense_date}
                    </td>
                    <td style={tdStyle}>
                      {e.supplier}
                      {e.description && (
                        <div style={{ fontSize: '12px', color: color.muted }}>{e.description}</div>
                      )}
                    </td>
                    <td style={tdStyle}>{EXPENSE_CATEGORY_LABELS[e.cost_category] ?? e.cost_category}</td>
                    <td style={tdStyle}>{e.author?.display_name ?? '—'}</td>
                    <td style={moneyTd}>{fmtMoney(e.amount)}</td>
                    <td style={tdStyle}>
                      <ExpenseStatusChip status={e.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
