import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getProject } from '@/lib/services/projects';
import {
  getAvailableCredits,
  getInvoices,
  getInvoicesFlaggedBySupersededRates,
} from '@/lib/services/invoices';
import { cardStyle, color, font, h2Style, microLabelStyle } from '@/lib/theme';
import { NewInvoiceButton } from './new-invoice-button';

// Module 7D1 — the project's invoice list (docs/specs/7d1-spec.md §2, §9, §10).
// Owner/Admin/PM only (§12); the invoices RLS policies enforce the same set,
// so this page never renders for Foreman/Crew.

const STATUS_BADGES: Record<string, { bg: string; fg: string; label: string }> = {
  draft: { bg: '#eef1f6', fg: '#5b6472', label: 'Draft' },
  pending_approval: { bg: '#fdece0', fg: '#b45309', label: 'Pending approval' },
  sent: { bg: '#e0e9fd', fg: '#2f49d1', label: 'Sent' },
  paid: { bg: '#e4f0e6', fg: '#3d7a4b', label: 'Paid' },
  voided: { bg: '#f3f4f6', fg: '#8a919c', label: 'Voided' },
};

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

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
  borderBottom: `1px solid ${color.rowDivider}`,
};

function Figure({
  label,
  value,
  bold,
  muted,
  warn,
}: {
  label: string;
  value: number;
  bold?: boolean;
  muted?: boolean;
  warn?: boolean;
}) {
  return (
    <div>
      <span style={microLabelStyle}>{label}</span>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: bold ? '18px' : '15px',
          fontWeight: bold ? 700 : 600,
          color: muted ? color.faint : warn ? color.warningDeep : color.navy,
          marginTop: '2px',
        }}
      >
        {money(value)}
      </div>
    </div>
  );
}

export default async function InvoicesPage({ params }: { params: { id: string } }) {
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
  if (!profile) redirect('/dashboard');

  // §12 — client billing is Owner/Admin/PM. Foreman/Crew are sent back to the
  // project overview rather than shown an empty screen.
  if (!['owner', 'admin', 'project_manager'].includes(profile.role)) {
    redirect(`/dashboard/projects/${params.id}`);
  }

  const project = await getProject(params.id);
  if (!project || project.is_deleted) notFound();

  const [invoices, flagged, credits] = await Promise.all([
    getInvoices(params.id),
    getInvoicesFlaggedBySupersededRates(params.id),
    getAvailableCredits(params.id),
  ]);

  const flaggedIds = new Set(flagged.map((f) => f.invoiceId));
  const base = `/dashboard/projects/${params.id}/invoices`;

  // §5 job position. A voided invoice billed nothing, so it is excluded.
  const live = invoices.filter((i) => i.status !== 'voided');
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const billedToDate = round2(live.reduce((sum, i) => sum + Number(i.billed_total ?? 0), 0));
  const retainageHeld = round2(live.reduce((sum, i) => sum + Number(i.retainage_withheld ?? 0), 0));
  const receivable = round2(live.reduce((sum, i) => sum + Number(i.amount_receivable ?? 0), 0));
  const contractValue = project.contract_value === null ? null : Number(project.contract_value);
  // §12a (S97) — the PM carve-out covers amounts ON an invoice, not the job's
  // contract value (CLAUDE.md Financial Visibility Floor keeps that Owner/Admin).
  const canSeeContractValue = profile.role === 'owner' || profile.role === 'admin';

  return (
    <div style={{ padding: '20px 0' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <h2 style={h2Style}>Invoices</h2>
        <NewInvoiceButton
          projectId={params.id}
          projectRetainagePercent={project.retainage_percent}
        />
      </div>

      {/* §10 — a superseded rate flags the SENT invoices priced under it for
          the user to void and reissue. Nothing is repriced silently and no
          catch-up invoice is generated. */}
      {flagged.length > 0 && (
        <div
          style={{
            ...cardStyle,
            padding: '12px 16px',
            marginBottom: '14px',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 700, color: color.warningDeep }}>
            {flagged.length === 1 ? '1 sent invoice was' : `${flagged.length} sent invoices were`}{' '}
            priced under a rate that has since been superseded
          </div>
          <div style={{ fontSize: '12px', color: color.body, marginTop: '4px' }}>
            {flagged.map((f) => f.invoiceNumber).join(', ')} — a sent invoice keeps the amount it was
            sent at. Void and reissue to bill at the corrected rate (§10).
          </div>
        </div>
      )}

      {/* §4a / §3a — credits that exist but have not been placed on an invoice
          yet. The user chooses which invoice carries each one. */}
      {credits.length > 0 && (
        <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: '14px' }}>
          <span style={microLabelStyle}>Available credits</span>
          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {credits.map((credit) => (
              <div key={`${credit.kind}-${credit.label}`} style={{ fontSize: '13px', color: color.body }}>
                <span style={{ fontFamily: font.mono, fontWeight: 700, color: color.navy }}>
                  {money(credit.amount)}
                </span>{' '}
                — {credit.label}{' '}
                <span style={{ color: color.faint }}>
                  ({credit.kind === 'deposit' ? 'deposit balance, draws down §3a' : 'signed negative CO, §4a'})
                </span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '11px', color: color.faint, margin: '6px 0 0' }}>
            Open a draft invoice to place a credit on it — credits are never applied automatically.
          </p>
        </div>
      )}

      {/* §5 — the job's billing position. Retainage held is shown SEPARATELY
          and deliberately sits OUTSIDE the receivable: it is not overdue,
          because it is not yet owed. Voided invoices contribute nothing. */}
      {live.length > 0 && (
        <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: '14px', display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
          <Figure label="Billed to date" value={billedToDate} />
          <Figure label="Retainage held" value={retainageHeld} warn />
          <Figure label="Receivable (ages in collections)" value={receivable} bold />
          {/* §12a (S97) — the contract value is a figure ABOUT the job, not an
              amount on an invoice being created, so it stays Owner/Admin.
              A PM sees the billed/retainage/receivable figures beside it. */}
          {contractValue !== null && canSeeContractValue && (
            <Figure label="Original contract" value={contractValue} muted />
          )}
        </div>
      )}

      {invoices.length === 0 ? (
        <div style={{ ...cardStyle, padding: '28px', textAlign: 'center', color: color.faint }}>
          No invoices yet. Every dollar of income ties to an invoice (§1).
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Invoice</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Issued</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Billed</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Retainage</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Receivable</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const badge = STATUS_BADGES[invoice.status] ?? STATUS_BADGES.draft;
                return (
                  <tr key={invoice.id}>
                    <td style={tdStyle}>
                      <Link
                        href={`${base}/${invoice.id}`}
                        style={{ color: color.primary, fontWeight: 600, textDecoration: 'none' }}
                      >
                        {/* §10 (S97) — a draft is unnumbered until it is sent,
                            so the series has no gaps. Show what it IS. */}
                        {invoice.invoice_number ?? 'Draft'}
                      </Link>
                      {invoice.title ? (
                        <span style={{ color: color.faint }}> — {invoice.title}</span>
                      ) : null}
                      {invoice.invoice_type === 'deposit' && (
                        <span style={{ fontSize: '11px', color: color.warningDeep }}> deposit</span>
                      )}
                      {flaggedIds.has(invoice.id) && (
                        <span
                          style={{ fontSize: '11px', color: color.warningDeep, fontWeight: 700 }}
                        >
                          {' '}
                          · rate superseded
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '10px',
                          backgroundColor: badge.bg,
                          color: badge.fg,
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: color.mutedAlt }}>{invoice.issue_date}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: font.mono }}>
                      {money(invoice.billed_total)}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        fontFamily: font.mono,
                        color: Number(invoice.retainage_withheld) > 0 ? color.warningDeep : color.faint,
                      }}
                    >
                      {Number(invoice.retainage_withheld) > 0
                        ? money(invoice.retainage_withheld)
                        : '—'}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: 'right',
                        fontFamily: font.mono,
                        fontWeight: 700,
                        color: color.navy,
                      }}
                    >
                      {money(invoice.amount_receivable)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: '11px', color: color.faint, marginTop: '10px' }}>
        Retainage is withheld from the receivable and shown separately — it does not age in
        collections until released (§5). A sent invoice is immutable; correct it by voiding and
        reissuing (§9/§10).
      </p>
    </div>
  );
}
