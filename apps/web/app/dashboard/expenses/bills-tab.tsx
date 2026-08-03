'use client';

// 7C §4.1 — the Bills & Commitments tab. Rows are 7C payables (bills, PO
// commitments, sub stages, retainage accruals) with paid-to-date and
// remaining DERIVED from payments (payables-shared — the one set of
// definitions). Settled rows stay listed with the settlement chip; closed-out
// rows stay with their badge. Visible to Owner/Admin/PM/Foreman (RLS scopes
// rows); entry and money actions gate tighter per role (§4).

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PayableListItem } from '@/lib/services/payables-client';
import { uploadBillDocument } from '@/lib/services/payables-client';
import {
  committedRemaining,
  countsTowardCommitted,
  grossPaid,
} from '@/lib/services/payables-shared';
import type { ExpenseListItem } from '@/lib/services/expenses-client';
import { fmtMoney } from '@/components/expenses/expense-ui';
import { PaymentModal } from '@/components/expenses/payment-modal';
import { CloseoutDialog } from '@/components/expenses/closeout-dialog';
import { badgeStyle, cardStyle, color, font, microLabelStyle, secondaryButtonStyle } from '@/lib/theme';

interface BillsTabProps {
  rows: PayableListItem[];
  role: string;
  projectNames: Record<string, string>;
  activeProjects: { id: string; name: string }[];
  todayYmd: string;
  /** Pending rows review via the shared popup (parent owns it — §4.2). */
  onReview: (expense: ExpenseListItem) => void;
}

const cellStyle: React.CSSProperties = {
  padding: '11px 14px',
  fontSize: '13px',
  color: color.body,
  borderBottom: `1px solid ${color.rowDivider}`,
  verticalAlign: 'top',
};

function Badge({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span style={{ ...badgeStyle, backgroundColor: bg, color: fg, marginRight: '4px' }}>
      {children}
    </span>
  );
}

export function BillsTab({
  rows,
  role,
  projectNames,
  activeProjects,
  todayYmd,
  onReview,
}: BillsTabProps) {
  const router = useRouter();
  const isOwnerAdmin = role === 'owner' || role === 'admin';
  const isOwner = role === 'owner';

  const [projectFilter, setProjectFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [dueSoonOnly, setDueSoonOnly] = useState(false);
  const [paying, setPaying] = useState<PayableListItem | null>(null);
  const [closingOut, setClosingOut] = useState<PayableListItem | null>(null);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const dueSoonCutoff = useMemo(() => {
    const d = new Date(todayYmd + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }, [todayYmd]);

  const filtered = useMemo(() => {
    let list = rows;
    if (projectFilter) list = list.filter((r) => r.project_id === projectFilter);
    if (supplierFilter.trim()) {
      const q = supplierFilter.trim().toLowerCase();
      list = list.filter((r) => r.supplier.toLowerCase().includes(q));
    }
    if (awaitingOnly) list = list.filter((r) => r.awaiting_paper && r.closed_out_at === null);
    if (dueSoonOnly) {
      list = list.filter(
        (r) =>
          r.due_date !== null &&
          r.due_date <= dueSoonCutoff &&
          committedRemaining(r, r.payments) > 0 &&
          r.closed_out_at === null
      );
    }
    return list;
  }, [rows, projectFilter, supplierFilter, awaitingOnly, dueSoonOnly, dueSoonCutoff]);

  async function handleAttachFile(row: PayableListItem, file: File) {
    setAttachingId(row.id);
    setNotice(null);
    const res = await uploadBillDocument(file, row.project_id, row.id);
    setAttachingId(null);
    if (!res.success) {
      setNotice(res.error ?? 'Attach failed.');
      return;
    }
    if (res.warning) setNotice(res.warning);
    router.refresh();
  }

  return (
    <div>
      {/* Filters (§4.1: project, sub/supplier, awaiting-paper, due soon). */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: '9px', border: `1px solid ${color.inputBorder}`, fontSize: '13px', color: color.body }}
        >
          <option value="">All jobs</option>
          {activeProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          placeholder="Supplier / sub…"
          style={{ padding: '8px 10px', borderRadius: '9px', border: `1px solid ${color.inputBorder}`, fontSize: '13px', color: color.body }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: color.body, cursor: 'pointer' }}>
          <input type="checkbox" checked={awaitingOnly} onChange={(e) => setAwaitingOnly(e.target.checked)} />
          Bill expected
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: color.body, cursor: 'pointer' }}>
          <input type="checkbox" checked={dueSoonOnly} onChange={(e) => setDueSoonOnly(e.target.checked)} />
          Due soon
        </label>
      </div>

      {notice && <p style={{ color: color.warningDeep, fontSize: '13px', margin: '0 0 12px' }}>{notice}</p>}

      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <p style={{ padding: '26px 20px', fontSize: '14px', color: color.muted, margin: 0 }}>
            No bills or commitments yet.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Supplier / sub', 'Job', 'Stage', 'Amount', 'Paid', 'Remaining', 'Due', 'Status', ''].map((h) => (
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
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const paid = grossPaid(r.payments);
                  const remaining = committedRemaining(r, r.payments);
                  const settled = remaining <= 0 && r.status === 'approved';
                  const closedOut = r.closed_out_at !== null;
                  const overStage = r.payments.some((p) => p.over_stage && !p.is_deleted);
                  const canPay =
                    countsTowardCommitted(r) &&
                    remaining > 0 &&
                    (r.is_retainage ? isOwner : isOwnerAdmin);
                  return (
                    <tr key={r.id}>
                      <td style={cellStyle}>
                        {r.supplier}
                        {r.description && (
                          <div style={{ fontSize: '12px', color: color.muted }}>{r.description}</div>
                        )}
                      </td>
                      <td style={cellStyle}>{projectNames[r.project_id] ?? '—'}</td>
                      <td style={cellStyle}>{r.stage_label ?? '—'}</td>
                      <td style={{ ...cellStyle, fontFamily: font.mono, whiteSpace: 'nowrap' }}>
                        {fmtMoney(r.amount)}
                      </td>
                      <td style={{ ...cellStyle, fontFamily: font.mono, whiteSpace: 'nowrap' }}>
                        {fmtMoney(paid)}
                      </td>
                      <td style={{ ...cellStyle, fontFamily: font.mono, whiteSpace: 'nowrap' }}>
                        {closedOut ? '—' : fmtMoney(remaining)}
                      </td>
                      <td style={{ ...cellStyle, fontFamily: font.mono, whiteSpace: 'nowrap' }}>
                        {r.due_date ?? '—'}
                      </td>
                      <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
                        {r.status === 'pending' && (
                          <Badge bg={color.warningBg} fg={color.warningDeep}>Pending</Badge>
                        )}
                        {r.status === 'rejected' && (
                          <Badge bg={color.neutralBadgeBg} fg={color.dangerAlt}>Rejected</Badge>
                        )}
                        {closedOut ? (
                          <Badge bg={color.neutralBadgeBg} fg={color.neutralBadgeText}>Closed out</Badge>
                        ) : r.status === 'approved' && (
                          <Badge
                            bg={settled ? color.successBg : color.blueTintAlt}
                            fg={settled ? color.successOnBg : color.primary}
                          >
                            {settled ? 'Settled' : 'Open'}
                          </Badge>
                        )}
                        {r.awaiting_paper && !closedOut && (
                          <Badge bg={color.warningBg} fg={color.warningDeep}>Bill expected</Badge>
                        )}
                        {r.is_retainage && (
                          <Badge bg={color.blueTint} fg={color.primary}>Retainage</Badge>
                        )}
                        {overStage && (
                          <Badge bg={color.warningBg} fg={color.warningDeep}>Over-stage</Badge>
                        )}
                      </td>
                      <td style={{ ...cellStyle, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {isOwnerAdmin && r.status === 'pending' && (
                          <button
                            style={{ ...secondaryButtonStyle, padding: '5px 10px', fontSize: '12px', marginLeft: '4px' }}
                            onClick={() => onReview(r)}
                          >
                            Review
                          </button>
                        )}
                        {canPay && (
                          <button
                            style={{ ...secondaryButtonStyle, padding: '5px 10px', fontSize: '12px', marginLeft: '4px' }}
                            onClick={() => setPaying(r)}
                          >
                            {r.is_retainage ? 'Release' : 'Record payment'}
                          </button>
                        )}
                        {r.awaiting_paper && !closedOut && (
                          <button
                            style={{ ...secondaryButtonStyle, padding: '5px 10px', fontSize: '12px', marginLeft: '4px' }}
                            disabled={attachingId === r.id}
                            onClick={() => {
                              setAttachingId(r.id);
                              fileInputRef.current?.click();
                            }}
                          >
                            {attachingId === r.id ? 'Attaching…' : 'Attach bill'}
                          </button>
                        )}
                        {isOwnerAdmin && !closedOut && remaining > 0 && r.status === 'approved' && !r.is_retainage && (
                          <button
                            style={{ ...secondaryButtonStyle, padding: '5px 10px', fontSize: '12px', marginLeft: '4px', color: color.dangerAlt }}
                            onClick={() => setClosingOut(r)}
                          >
                            Close out
                          </button>
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

      {/* Hidden picker for "Attach bill" — the row id is held in attachingId. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          const row = rows.find((r) => r.id === attachingId);
          e.target.value = '';
          if (file && row) void handleAttachFile(row, file);
          else setAttachingId(null);
        }}
      />

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
            isSubCommitment: closingOut.sub_contract_id !== null,
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
