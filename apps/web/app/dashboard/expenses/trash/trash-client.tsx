'use client';

// 7A — expense trash rows + restore (files trash-page precedent).

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { restoreExpense, type ExpenseListItem } from '@/lib/services/expenses-client';
import { ExpenseStatusChip, fmtMoney } from '@/components/expenses/expense-ui';
import { cardStyle, color, font, h2Style, secondaryButtonStyle } from '@/lib/theme';

interface ExpensesTrashClientProps {
  expenses: ExpenseListItem[];
  projectNames: Record<string, string>;
}

export function ExpensesTrashClient({ expenses, projectNames }: ExpensesTrashClientProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRestore(id: string) {
    setBusyId(id);
    setError(null);
    const res = await restoreExpense(id);
    setBusyId(null);
    if (!res.success) {
      setError(res.error ?? 'Failed to restore the expense.');
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={h2Style}>Expense trash</h2>
        <p style={{ color: color.muted, fontSize: '14px', margin: '4px 0 0' }}>
          Deleted expenses can be restored here.{' '}
          <Link href="/dashboard/expenses" style={{ color: color.primary }}>
            Back to expenses
          </Link>
        </p>
      </div>

      {error && <p style={{ color: color.danger, fontSize: '13px', margin: '0 0 12px' }}>{error}</p>}

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        {expenses.length === 0 ? (
          <p style={{ padding: '26px 20px', fontSize: '14px', color: color.muted, margin: 0 }}>
            Trash is empty.
          </p>
        ) : (
          expenses.map((e, i) => (
            <div
              key={e.id}
              style={{
                display: 'flex',
                gap: '14px',
                alignItems: 'center',
                padding: '12px 18px',
                borderBottom:
                  i === expenses.length - 1 ? 'none' : `1px solid ${color.rowDivider}`,
              }}
            >
              <span style={{ fontFamily: font.mono, fontSize: '13px', color: color.bodyAlt, width: '96px' }}>
                {e.expense_date}
              </span>
              <span style={{ flex: 1, fontSize: '14px', color: color.body }}>
                {e.supplier}
                <span style={{ fontSize: '12px', color: color.muted }}>
                  {' '}
                  · {projectNames[e.project_id] ?? '—'} · {e.author?.display_name ?? '—'}
                </span>
              </span>
              <span style={{ fontFamily: font.mono, fontSize: '13px', fontWeight: 600, color: color.navy }}>
                {fmtMoney(e.amount)}
              </span>
              <ExpenseStatusChip status={e.status} />
              <button
                style={{ ...secondaryButtonStyle, padding: '5px 12px', fontSize: '12px' }}
                disabled={busyId === e.id}
                onClick={() => void handleRestore(e.id)}
              >
                {busyId === e.id ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
