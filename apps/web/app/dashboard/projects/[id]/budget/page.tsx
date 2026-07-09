import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { getBudgetRollup } from '@/lib/services/budget';
import { getSignedChangeOrders } from '@/lib/services/change-orders';
import { getProject } from '@/lib/services/projects';

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * 5E — Project Budget View. Read-only display of project_budget_items grouped
 * by cost_code. Committed/Actual render zero until Module 7 populates them;
 * Variance = Budgeted − Actual (so Variance = Budgeted at launch).
 *
 * 5D §7 — contract summary on top: original contract_value + Σ(signed CO net
 * deltas) = revised contract total, display-only. projects.contract_value is
 * never mutated by CO sign-off (D-6; write-through is Module 7 / #80).
 */
export default async function ProjectBudgetPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [rollup, project, signedCos] = await Promise.all([
    getBudgetRollup(params.id),
    getProject(params.id),
    getSignedChangeOrders(params.id),
  ]);

  const contractValue = project?.contract_value ?? null;
  const signedCoTotal = signedCos.reduce((sum, co) => sum + co.net_delta, 0);

  const headStyle: React.CSSProperties = {
    padding: '0.5rem',
    textAlign: 'right',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
  };
  const cellStyle: React.CSSProperties = {
    padding: '0.5rem',
    textAlign: 'right',
    fontSize: '0.875rem',
  };

  return (
    <div style={{ maxWidth: '900px' }}>
      {/* 5D §7 — display-only contract summary */}
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb',
          padding: '1rem',
          marginBottom: '1rem',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}>
                Original contract value
              </td>
              <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', textAlign: 'right' }}>
                {contractValue != null ? money(contractValue) : '—'}
              </td>
            </tr>
            {signedCos.map((co) => (
              <tr key={co.id}>
                <td
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', color: '#6b7280' }}
                >
                  {co.co_number} — {co.title} (signed{' '}
                  {co.signed_at ? new Date(co.signed_at).toLocaleDateString() : ''})
                </td>
                <td
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.875rem',
                    textAlign: 'right',
                    color: co.net_delta < 0 ? '#166534' : undefined,
                  }}
                >
                  {money(co.net_delta)}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid #e5e7eb', fontWeight: 700 }}>
              <td style={{ padding: '0.375rem 0.5rem', fontSize: '0.875rem' }}>
                Revised contract total
              </td>
              <td style={{ padding: '0.375rem 0.5rem', fontSize: '0.875rem', textAlign: 'right' }}>
                {contractValue != null ? money(contractValue + signedCoTotal) : money(signedCoTotal)}
              </td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0.5rem 0 0' }}>
          Display-only: signed change orders do not modify the headline contract value until
          Module 7.
        </p>
      </div>

      <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '1rem' }}>
        Cost baseline from the estimate (pre-markup, pre-tax). The budget total sits below the
        contract value by the markup — they are not expected to match. Committed and Actual fill
        in with Module 7.
      </p>

      {rollup.groups.length === 0 ? (
        <div
          style={{
            padding: '3rem',
            textAlign: 'center',
            color: '#6b7280',
            backgroundColor: '#fff',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
          }}
        >
          No budget items. The baseline is created when an estimate is converted to this project.
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ ...headStyle, textAlign: 'left' }}>Description</th>
                <th style={headStyle}>Budgeted</th>
                <th style={headStyle}>Committed</th>
                <th style={headStyle}>Actual</th>
                <th style={headStyle}>Variance</th>
              </tr>
            </thead>
            <tbody>
              {rollup.groups.map((group) => (
                <GroupRows key={group.cost_code} group={group} cellStyle={cellStyle} />
              ))}
              <tr style={{ borderTop: '2px solid #e5e7eb', fontWeight: 700 }}>
                <td style={{ ...cellStyle, textAlign: 'left' }}>Project Budget Total</td>
                <td style={cellStyle}>{money(rollup.totalBudgeted)}</td>
                <td style={cellStyle}>{money(rollup.totalCommitted)}</td>
                <td style={cellStyle}>{money(rollup.totalActual)}</td>
                <td style={cellStyle}>{money(rollup.totalBudgeted - rollup.totalActual)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GroupRows({
  group,
  cellStyle,
}: {
  group: Awaited<ReturnType<typeof getBudgetRollup>>['groups'][number];
  cellStyle: React.CSSProperties;
}) {
  return (
    <>
      <tr style={{ backgroundColor: '#f9fafb' }}>
        <td
          colSpan={5}
          style={{
            padding: '0.5rem',
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: '#374151',
          }}
        >
          {group.cost_code}
        </td>
      </tr>
      {group.items.map((item) => (
        <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
          <td style={{ ...cellStyle, textAlign: 'left' }}>
            {item.description}
            {item.row_type && (
              <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}> · {item.row_type}</span>
            )}
          </td>
          <td style={cellStyle}>{money(item.budgeted_amount ?? 0)}</td>
          <td style={cellStyle}>{money(item.committed_amount ?? 0)}</td>
          <td style={cellStyle}>{money(item.actual_amount ?? 0)}</td>
          <td style={cellStyle}>
            {money((item.budgeted_amount ?? 0) - (item.actual_amount ?? 0))}
          </td>
        </tr>
      ))}
      <tr style={{ borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>
        <td style={{ ...cellStyle, textAlign: 'left', color: '#6b7280' }}>
          {group.cost_code} subtotal
        </td>
        <td style={cellStyle}>{money(group.budgeted)}</td>
        <td style={cellStyle}>{money(group.committed)}</td>
        <td style={cellStyle}>{money(group.actual)}</td>
        <td style={cellStyle}>{money(group.budgeted - group.actual)}</td>
      </tr>
    </>
  );
}
