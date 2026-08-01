'use client';

// Module 7D1 — the invoice builder (docs/specs/7d1-spec.md §2, §5, §6.2, §7.2,
// §8, §9, §11, §12).
//
// ONE PICKER PATTERN, TWO POPULATIONS (§6.2 as amended by D2): unbilled
// approved COSTS and unbilled approved HOURS are ticked the same way, both
// show their age, and anything left unticked stays unbilled and comes back
// next time. Not selecting IS the hold-back — there is no separate mechanism.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addAllowanceCredit,
  addDiscountLine,
  addDrawLine,
  addFixedLine,
  addNegativeCoCredit,
  applyDepositCredit,
  approveInvoice,
  deleteInvoiceLine,
  deriveAndSaveInvoice,
  markInvoiceSent,
  recalculateInvoiceTotals,
  reissueInvoice,
  submitForApproval,
  updateInvoiceSettings,
  voidInvoice,
} from '@/lib/services/invoices-client';
import { findSplitDays } from '@/lib/services/invoices-shared';
import type {
  AvailableCredit,
  ContractType,
  InstrumentRef,
  InvoiceWithLines,
  PickableCost,
  PickableHour,
} from '@/lib/services/invoices-shared';
import {
  groupSelectedHours,
  presentInvoice,
  type PresentationLevel,
  type PresentationLine,
  type SelectedSegment,
} from '@framefocus/shared/utils/invoice-derivation';
import {
  cardStyle,
  color,
  font,
  h2Style,
  microLabelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/lib/theme';

interface RateRow {
  id: string;
  rate_type: string;
  rate: number;
  effective_from: string;
  superseded_at: string | null;
}

interface InvoiceBuilderProps {
  projectId: string;
  invoice: InvoiceWithLines;
  role: string;
  memberId: string | null;
  contractType: ContractType;
  instrument: InstrumentRef | null;
  instrumentLabel: string;
  changeOrderOptions: Array<{ id: string; label: string; coType: ContractType }>;
  rateRows: RateRow[];
  pickableCosts: PickableCost[];
  pickableHours: PickableHour[];
  availableCredits: AvailableCredit[];
  originalContractValue: number | null;
  alreadyBilled: number;
  projectRetainagePercent: number | null;
  /** companies.timezone — the invoice's issue_date is a company-tz calendar
   *  date, not a UTC one [S97]. Read on the server and passed down; a client
   *  component cannot read company settings itself. */
  timeZone: string;
}

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const thStyle: React.CSSProperties = {
  ...microLabelStyle,
  textAlign: 'left',
  padding: '8px 12px',
  backgroundColor: color.tableHeadBg,
  borderBottom: `1px solid ${color.cardBorder}`,
};
const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: '13px',
  borderBottom: `1px solid ${color.rowDivider}`,
};
const inputStyle: React.CSSProperties = {
  padding: '5px 8px',
  border: `1px solid ${color.cardBorder}`,
  borderRadius: '4px',
  fontSize: '13px',
};

export function InvoiceBuilder(props: InvoiceBuilderProps) {
  const {
    projectId,
    invoice,
    role,
    memberId,
    contractType,
    instrument,
    instrumentLabel,
    changeOrderOptions,
    pickableCosts,
    pickableHours,
    availableCredits,
    originalContractValue,
    alreadyBilled,
    timeZone,
  } = props;

  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedCosts, setSelectedCosts] = useState<Set<string>>(new Set());
  const [selectedHours, setSelectedHours] = useState<Set<string>>(new Set());

  const isDraft = invoice.status === 'draft' || invoice.status === 'pending_approval';
  const isDerived = contractType === 'cost_plus' || contractType === 'time_and_materials';
  const canApprove = role === 'owner' || role === 'admin';

  // §5 — retainage never applies to a deposit or a T&M invoice.
  const retainageAllowed =
    invoice.invoice_type !== 'deposit' && contractType !== 'time_and_materials';

  async function run(fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await fn();
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Something went wrong');
      return false;
    }
    if (msg) setNotice(msg);
    router.refresh();
    return true;
  }

  // ── §7.2 — the selected hours, grouped and rounded for preview ────────────
  const selectedSegments: SelectedSegment[] = useMemo(
    () =>
      pickableHours
        .filter((h) => selectedHours.has(h.segmentId))
        .map((h) => ({
          segmentId: h.segmentId,
          memberId: h.memberId,
          workDate: h.workDate,
          rawHours: h.rawHours,
          taskId: h.taskTitle ? h.segmentId : null,
        })),
    [pickableHours, selectedHours]
  );

  const hourGroups = useMemo(() => groupSelectedHours(selectedSegments), [selectedSegments]);
  const totalBillableHours = hourGroups.reduce((sum, g) => sum + g.billableHours, 0);

  // PROVISIONAL P-4 — splitting one person's day across two invoices rounds
  // each part, so the parts can bill more than the whole day would (§7.2).
  const splitDays = useMemo(
    () => findSplitDays(selectedSegments, pickableHours),
    [selectedSegments, pickableHours]
  );

  const selectedCostTotal = pickableCosts
    .filter((c) => selectedCosts.has(c.allocationId))
    .reduce((sum, c) => sum + c.amount, 0);

  async function derive() {
    if (!instrument) {
      setError('This project has no originating estimate, so there is no instrument to bill against.');
      return;
    }
    await run(
      () =>
        deriveAndSaveInvoice({
          invoiceId: invoice.id,
          instrument,
          contractType,
          rateRows: props.rateRows,
          selectedCosts: pickableCosts
            .filter((c) => selectedCosts.has(c.allocationId) && !c.blockedReason)
            .map((c) => ({
              allocationId: c.allocationId,
              description: c.description,
              category: c.category,
              amount: c.amount,
              expenseDate: c.expenseDate,
            })),
          selectedHours: selectedSegments,
          retainagePercent: retainageAllowed ? invoice.retainage_percent : null,
          isDeposit: invoice.invoice_type === 'deposit',
        }),
      'Invoice derived from the selected costs and hours.'
    );
    setSelectedCosts(new Set());
    setSelectedHours(new Set());
  }

  // ── §11 — live presentation preview from the saved lines ──────────────────
  const presented = useMemo(
    () =>
      presentInvoice(
        invoice.lines.map(
          (l): PresentationLine => ({
            description: l.description,
            category: l.category,
            costBasis: l.cost_basis === null ? null : Number(l.cost_basis),
            amount: Number(l.billed_amount),
            lineType: l.line_type,
          })
        ),
        invoice.presentation_level as PresentationLevel
      ),
    [invoice.lines, invoice.presentation_level]
  );

  return (
    <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          {/* §10 (S97) — the number is allocated at SEND, so a draft has none
              and must not pretend otherwise. */}
          <h2 style={h2Style}>
            {invoice.invoice_number ?? 'Draft invoice'}
            {invoice.title ? ` — ${invoice.title}` : ''}
          </h2>
          <div style={{ fontSize: '12px', color: color.faint }}>
            {invoice.status.replace('_', ' ')} · {instrumentLabel} · {contractType.replace(/_/g, ' ')}
            {invoice.invoice_type === 'deposit' ? ' · deposit' : ''}
            {invoice.invoice_number === null ? ' · numbered when sent' : ''}
          </div>
        </div>
        <LifecycleActions
          invoice={invoice}
          role={role}
          memberId={memberId}
          canApprove={canApprove}
          timeZone={timeZone}
          busy={busy}
          run={run}
          projectId={projectId}
        />
      </div>

      {error && (
        <div style={{ ...cardStyle, padding: '10px 14px', backgroundColor: '#fef2f2', color: '#991b1b', fontSize: '13px' }}>
          {error}
        </div>
      )}
      {notice && (
        <div style={{ ...cardStyle, padding: '10px 14px', backgroundColor: '#f0fdf4', color: '#166534', fontSize: '13px' }}>
          {notice}
        </div>
      )}

      {/* Instrument switch — P4: one invoice derives from ONE instrument */}
      {isDraft && changeOrderOptions.length > 0 && (
        <div style={{ ...cardStyle, padding: '12px 16px' }}>
          <span style={microLabelStyle}>Bill against</span>
          <div style={{ marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <a href={`?`} style={pillStyle(!instrument?.change_order_id)}>
              Original Contract
            </a>
            {changeOrderOptions.map((co) => (
              <a key={co.id} href={`?instrument=co:${co.id}`} style={pillStyle(instrument?.change_order_id === co.id)}>
                {co.label}
              </a>
            ))}
          </div>
          <p style={{ fontSize: '11px', color: color.faint, margin: '6px 0 0' }}>
            Each instrument carries its own type and rates (P4) — a change order bills on its own
            terms and never re-prices the original contract&rsquo;s draws (§4).
          </p>
        </div>
      )}

      {/* §2 — fixed-price draws */}
      {isDraft && !isDerived && (
        <DrawPanel
          invoiceId={invoice.id}
          originalContractValue={originalContractValue}
          alreadyBilled={alreadyBilled}
          contractType={contractType}
          busy={busy}
          run={run}
        />
      )}

      {/* §6.2 — COST picker */}
      {isDraft && isDerived && (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${color.cardBorder}` }}>
            <span style={microLabelStyle}>Unbilled approved costs</span>
            <span style={{ fontSize: '11px', color: color.faint, marginLeft: '8px' }}>
              tick what this invoice bills — anything left unticked stays unbilled and comes back
              next time (§6.2)
            </span>
          </div>
          {pickableCosts.length === 0 ? (
            <div style={{ padding: '18px', fontSize: '13px', color: color.faint }}>
              No unbilled approved costs for this instrument.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: '34px' }}></th>
                  <th style={thStyle}>Cost</th>
                  <th style={thStyle}>Category</th>
                  <th style={thStyle}>Incurred</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Age</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {pickableCosts.map((cost) => (
                  <tr key={cost.allocationId} style={cost.blockedReason ? { opacity: 0.6 } : undefined}>
                    <td style={tdStyle}>
                      <input
                        type="checkbox"
                        disabled={!!cost.blockedReason || busy}
                        checked={selectedCosts.has(cost.allocationId)}
                        onChange={(e) => {
                          const next = new Set(selectedCosts);
                          if (e.target.checked) next.add(cost.allocationId);
                          else next.delete(cost.allocationId);
                          setSelectedCosts(next);
                        }}
                      />
                    </td>
                    <td style={tdStyle}>
                      {cost.description}
                      {cost.blockedReason && (
                        <div style={{ fontSize: '11px', color: color.warningDeep }}>
                          {cost.blockedReason}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: color.mutedAlt }}>{cost.category}</td>
                    <td style={{ ...tdStyle, color: color.mutedAlt }}>{cost.expenseDate}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: cost.ageDays > 30 ? color.warningDeep : color.faint }}>
                      {cost.ageDays}d
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: font.mono }}>
                      {money(cost.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* §7.2 — HOURS picker */}
      {isDraft && isDerived && (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${color.cardBorder}` }}>
            <span style={microLabelStyle}>Unbilled approved hours</span>
            <span style={{ fontSize: '11px', color: color.faint, marginLeft: '8px' }}>
              the task is context for your choice — an hour with no task is fully billable (§7.2)
            </span>
          </div>
          {pickableHours.length === 0 ? (
            <div style={{ padding: '18px', fontSize: '13px', color: color.faint }}>
              No approved unbilled hours on this job. Hours must be approved in the timesheet before
              they can be billed — including the Owner&rsquo;s own (§7.2 D1).
            </div>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '34px' }}></th>
                    <th style={thStyle}>Who</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Task</th>
                    <th style={thStyle}>Type</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {pickableHours.map((hour) => (
                    <tr key={hour.segmentId}>
                      <td style={tdStyle}>
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={selectedHours.has(hour.segmentId)}
                          onChange={(e) => {
                            const next = new Set(selectedHours);
                            if (e.target.checked) next.add(hour.segmentId);
                            else next.delete(hour.segmentId);
                            setSelectedHours(next);
                          }}
                        />
                      </td>
                      <td style={tdStyle}>{hour.memberName}</td>
                      <td style={{ ...tdStyle, color: color.mutedAlt }}>{hour.workDate}</td>
                      <td style={{ ...tdStyle, color: hour.taskTitle ? color.body : color.faint }}>
                        {hour.taskTitle ?? 'no task'}
                      </td>
                      <td style={{ ...tdStyle, color: color.mutedAlt }}>{hour.segmentType}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: font.mono }}>
                        {hour.rawHours.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hourGroups.length > 0 && (
                <div style={{ padding: '10px 16px', borderTop: `1px solid ${color.cardBorder}`, fontSize: '12px' }}>
                  <strong>{totalBillableHours}</strong> billable hours from{' '}
                  {hourGroups.length === 1 ? '1 person-day' : `${hourGroups.length} person-days`} —
                  each day is summed first, then rounded UP to the half hour (§7.2).
                  <div style={{ color: color.faint, marginTop: '2px' }}>
                    {hourGroups
                      .map((g) => `${g.workDate}: ${g.rawHours.toFixed(2)}h → ${g.billableHours}h`)
                      .join(' · ')}
                  </div>
                </div>
              )}
              {splitDays.length > 0 && (
                <div style={{ padding: '10px 16px', backgroundColor: '#fffbeb', color: color.warningDeep, fontSize: '12px' }}>
                  You are splitting {splitDays.length === 1 ? 'a person-day' : 'person-days'} across
                  invoices. Rounding applies per person per day, so billing the parts separately can
                  total more than the whole day would. Bill a day in one piece unless you mean to.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {isDraft && isDerived && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={derive} disabled={busy} style={primaryButtonStyle}>
            {busy ? 'Deriving…' : 'Derive invoice from selection'}
          </button>
          <span style={{ fontSize: '12px', color: color.faint }}>
            {selectedCosts.size} costs ({money(selectedCostTotal)}) · {totalBillableHours} billable
            hours
          </span>
        </div>
      )}

      {/* Lines + totals */}
      <LinesPanel invoice={invoice} isDraft={isDraft} contractType={contractType} busy={busy} run={run} presented={presented} />

      {/* Adjustments — §8 discount, §4a/§4b/§3a credits */}
      {isDraft && (
        <AdjustmentsPanel
          invoice={invoice}
          credits={availableCredits}
          canApprove={canApprove}
          contractType={contractType}
          busy={busy}
          run={run}
        />
      )}

      {/* §11 presentation + §5 retainage settings */}
      {isDraft && (
        <SettingsPanel
          invoice={invoice}
          retainageAllowed={retainageAllowed}
          contractType={contractType}
          busy={busy}
          run={run}
        />
      )}
    </div>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: '12px',
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: '12px',
    textDecoration: 'none',
    border: `1px solid ${active ? color.primary : color.cardBorder}`,
    color: active ? '#fff' : color.body,
    backgroundColor: active ? color.primary : 'transparent',
  };
}

// ── §2 / trace G — draws ────────────────────────────────────────────────────

function DrawPanel({
  invoiceId,
  originalContractValue,
  alreadyBilled,
  contractType,
  busy,
  run,
}: {
  invoiceId: string;
  originalContractValue: number | null;
  alreadyBilled: number;
  contractType: ContractType;
  busy: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) => Promise<boolean>;
}) {
  const [label, setLabel] = useState('');
  const [percent, setPercent] = useState('');
  const [amount, setAmount] = useState('');
  const [isFinal, setIsFinal] = useState(false);

  const remaining =
    originalContractValue === null
      ? null
      : Math.round((originalContractValue - alreadyBilled) * 100) / 100;

  return (
    <div style={{ ...cardStyle, padding: '12px 16px' }}>
      <span style={microLabelStyle}>Add a draw</span>
      <div style={{ fontSize: '12px', color: color.faint, margin: '4px 0 8px' }}>
        Percentages apply to the ORIGINAL contract value {money(originalContractValue)} — a signed
        change order never re-prices a draw (§2 rule a). The FINAL draw bills the remainder
        {remaining !== null ? ` (${money(remaining)})` : ''}, not a fresh percentage (rule b).
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Rough-in)" style={inputStyle} />
        <input
          value={percent}
          onChange={(e) => {
            setPercent(e.target.value);
            if (e.target.value) setAmount('');
          }}
          placeholder="%"
          inputMode="decimal"
          disabled={isFinal}
          style={{ ...inputStyle, width: '70px' }}
        />
        <span style={{ fontSize: '12px', color: color.faint }}>or</span>
        <input
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            if (e.target.value) setPercent('');
          }}
          placeholder="fixed $"
          inputMode="decimal"
          disabled={isFinal}
          style={{ ...inputStyle, width: '110px' }}
        />
        <label style={{ fontSize: '12px', color: color.body, display: 'inline-flex', gap: '4px' }}>
          <input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} />
          Final draw (remainder)
        </label>
        <button
          type="button"
          disabled={busy || !label.trim() || originalContractValue === null}
          style={secondaryButtonStyle}
          onClick={async () => {
            const ok = await run(
              () =>
                addDrawLine(
                  invoiceId,
                  {
                    label: label.trim(),
                    percent: percent ? Number(percent) : null,
                    fixedAmount: amount ? Number(amount) : null,
                    isFinal,
                  },
                  originalContractValue ?? 0,
                  alreadyBilled
                ).then(async (r) => {
                  if (!r.success) return r;
                  return recalculateInvoiceTotals(invoiceId, { contractType });
                }),
              'Draw added.'
            );
            if (ok) {
              setLabel('');
              setPercent('');
              setAmount('');
              setIsFinal(false);
            }
          }}
        >
          Add draw
        </button>
      </div>
      {originalContractValue === null && (
        <p style={{ fontSize: '12px', color: color.warningDeep, margin: '6px 0 0' }}>
          This project has no contract value set, so a percentage draw cannot be priced. Enter a
          fixed amount as a manual line instead.
        </p>
      )}
    </div>
  );
}

// ── Lines + the §11 preview ─────────────────────────────────────────────────

function LinesPanel({
  invoice,
  isDraft,
  contractType,
  busy,
  run,
  presented,
}: {
  invoice: InvoiceWithLines;
  isDraft: boolean;
  contractType: ContractType;
  busy: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) => Promise<boolean>;
  presented: ReturnType<typeof presentInvoice>;
}) {
  const [manualLabel, setManualLabel] = useState('');
  const [manualAmount, setManualAmount] = useState('');

  return (
    <div style={{ ...cardStyle, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${color.cardBorder}` }}>
        <span style={microLabelStyle}>Invoice lines</span>
        <span style={{ fontSize: '11px', color: color.faint, marginLeft: '8px' }}>
          presentation: {invoice.presentation_level.replace('_', ' ')}
        </span>
      </div>

      {invoice.lines.length === 0 ? (
        <div style={{ padding: '18px', fontSize: '13px', color: color.faint }}>
          No lines yet.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Line</th>
              <th style={thStyle}>Category</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Cost</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Derived</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Billed</th>
              {isDraft && <th style={{ ...thStyle, width: '40px' }}></th>}
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id}>
                <td style={tdStyle}>
                  {line.description}
                  {line.line_type.startsWith('credit') || line.line_type === 'discount' ? (
                    <span style={{ fontSize: '11px', color: color.warningDeep }}> credit</span>
                  ) : null}
                </td>
                <td style={{ ...tdStyle, color: color.mutedAlt }}>{line.category ?? '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: font.mono, color: color.mutedAlt }}>
                  {line.cost_basis === null ? '—' : money(Number(line.cost_basis))}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: font.mono, color: color.mutedAlt }}>
                  {line.derived_amount === null ? '—' : money(Number(line.derived_amount))}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontFamily: font.mono, fontWeight: 700 }}>
                  {money(Number(line.billed_amount))}
                </td>
                {isDraft && (
                  <td style={tdStyle}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            deleteInvoiceLine(line.id).then(async (r) =>
                              r.success ? recalculateInvoiceTotals(invoice.id, { contractType }) : r
                            ),
                          'Line removed.'
                        )
                      }
                      style={{ ...secondaryButtonStyle, padding: '2px 8px', fontSize: '11px', color: color.danger }}
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* §11 layout A — labor outside the block; Subtotal/Markup cover non-labor only */}
      {invoice.presentation_level === 'full_detail' && invoice.lines.length > 0 && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${color.cardBorder}`, fontSize: '13px' }}>
          <span style={microLabelStyle}>Client sees (full detail — layout A)</span>
          <div style={{ marginTop: '6px', fontFamily: font.mono, fontSize: '12px' }}>
            {presented.laborLines.map((l, i) => (
              <div key={`labor-${i}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{l.description}</span>
                <span>{money(l.amount)}</span>
              </div>
            ))}
            {presented.nonLaborLines.map((l, i) => (
              <div key={`nl-${i}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{l.description}</span>
                <span>{money(l.costBasis ?? l.amount)}</span>
              </div>
            ))}
            {presented.nonLaborLines.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${color.rowDivider}`, marginTop: '4px', paddingTop: '4px' }}>
                  <span>Subtotal (non-labor)</span>
                  <span>{money(presented.nonLaborSubtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Markup</span>
                  <span>{money(presented.nonLaborMarkup)}</span>
                </div>
              </>
            )}
            {presented.adjustmentLines.map((l, i) => (
              <div key={`adj-${i}`} style={{ display: 'flex', justifyContent: 'space-between', color: color.warningDeep }}>
                <span>{l.description}</span>
                <span>{money(l.amount)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: `1px solid ${color.cardBorder}`, marginTop: '4px', paddingTop: '4px' }}>
              <span>TOTAL</span>
              <span>{money(presented.total)}</span>
            </div>
          </div>
          <p style={{ fontSize: '11px', color: color.faint, margin: '6px 0 0' }}>
            Cost shown to the client is actual and UNBURDENED (§6.4). Labor bills as hours × rate
            outside the subtotal/markup block (§11).
          </p>
        </div>
      )}

      {invoice.presentation_level === 'by_section' && presented.sections.length > 0 && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${color.cardBorder}`, fontFamily: font.mono, fontSize: '12px' }}>
          {presented.sections.map((s) => (
            <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{s.label}</span>
              <span>{money(s.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Totals — §5/§8 */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${color.cardBorder}`, backgroundColor: color.tableHeadBg }}>
        <TotalRow label="Derived total" value={Number(invoice.derived_total)} muted />
        <TotalRow label="Billed total" value={Number(invoice.billed_total)} />
        {Number(invoice.retainage_withheld) > 0 && (
          <TotalRow
            label={`Retainage withheld (${invoice.retainage_percent ?? 0}%)`}
            value={-Number(invoice.retainage_withheld)}
            warn
          />
        )}
        <TotalRow label="Due now (receivable)" value={Number(invoice.amount_receivable)} bold />
      </div>

      {isDraft && (
        <div style={{ padding: '10px 16px', borderTop: `1px solid ${color.cardBorder}`, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input value={manualLabel} onChange={(e) => setManualLabel(e.target.value)} placeholder="Manual line" style={inputStyle} />
          <input value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} placeholder="$" inputMode="decimal" style={{ ...inputStyle, width: '110px' }} />
          <button
            type="button"
            disabled={busy || !manualLabel.trim() || !manualAmount}
            style={secondaryButtonStyle}
            onClick={async () => {
              const ok = await run(
                () =>
                  addFixedLine({
                    invoiceId: invoice.id,
                    description: manualLabel.trim(),
                    amount: Number(manualAmount),
                  }).then(async (r) => (r.success ? recalculateInvoiceTotals(invoice.id, { contractType }) : r)),
                'Line added.'
              );
              if (ok) {
                setManualLabel('');
                setManualAmount('');
              }
            }}
          >
            Add line
          </button>
        </div>
      )}
    </div>
  );
}

function TotalRow({ label, value, bold, muted, warn }: { label: string; value: number; bold?: boolean; muted?: boolean; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: bold ? '14px' : '13px', padding: '2px 0' }}>
      <span style={{ color: muted ? color.faint : warn ? color.warningDeep : color.body, fontWeight: bold ? 700 : 400 }}>
        {label}
      </span>
      <span style={{ fontFamily: font.mono, fontWeight: bold ? 700 : 400, color: muted ? color.faint : warn ? color.warningDeep : color.navy }}>
        {money(value)}
      </span>
    </div>
  );
}

// ── §8 discount + §4a/§4b/§3a credits ───────────────────────────────────────

function AdjustmentsPanel({
  invoice,
  credits,
  canApprove,
  contractType,
  busy,
  run,
}: {
  invoice: InvoiceWithLines;
  credits: AvailableCredit[];
  canApprove: boolean;
  contractType: ContractType;
  busy: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) => Promise<boolean>;
}) {
  const [discountLabel, setDiscountLabel] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [allowanceAmount, setAllowanceAmount] = useState('');

  const totalBeforeCredit = Number(invoice.billed_total);

  return (
    <div style={{ ...cardStyle, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <span style={microLabelStyle}>Adjustments</span>

      {/* §8 R1 — a reduction is an explicit, client-visible discount LINE */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={discountLabel} onChange={(e) => setDiscountLabel(e.target.value)} placeholder="Discount description" style={inputStyle} />
        <input value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} placeholder="$" inputMode="decimal" style={{ ...inputStyle, width: '100px' }} />
        <button
          type="button"
          disabled={busy || !discountLabel.trim() || !discountAmount}
          style={secondaryButtonStyle}
          onClick={async () => {
            const ok = await run(
              () =>
                addDiscountLine(invoice.id, discountLabel.trim(), Number(discountAmount)).then(
                  async (r) => (r.success ? recalculateInvoiceTotals(invoice.id, { contractType }) : r)
                ),
              'Discount line added.'
            );
            if (ok) {
              setDiscountLabel('');
              setDiscountAmount('');
            }
          }}
        >
          Add discount
        </button>
        <span style={{ fontSize: '11px', color: color.faint }}>
          A discount is forgiveness — never rebilled (§8).
        </span>
      </div>

      {/* §4a / §3a — place an available credit on THIS invoice (user-chosen) */}
      {credits.map((credit) => (
        <div key={`${credit.kind}-${credit.label}`} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: color.body }}>
            {credit.label} — {money(credit.amount)} available
          </span>
          <button
            type="button"
            disabled={busy}
            style={secondaryButtonStyle}
            onClick={() =>
              run(
                () =>
                  (credit.kind === 'negative_co'
                    ? addNegativeCoCredit(
                        invoice.id,
                        credit.changeOrderId as string,
                        credit.label,
                        credit.amount
                      )
                    : applyDepositCredit(
                        invoice.id,
                        credit.depositInvoiceId as string,
                        credit.amount,
                        totalBeforeCredit,
                        credit.label
                      )
                  ).then(async (r) => (r.success ? recalculateInvoiceTotals(invoice.id, { contractType }) : r)),
                'Credit placed on this invoice.'
              )
            }
          >
            Place on this invoice
          </button>
        </div>
      ))}

      {/* §4b — under-allowance credit: Owner/Admin, FINAL invoice only */}
      {invoice.is_final && canApprove && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={allowanceAmount} onChange={(e) => setAllowanceAmount(e.target.value)} placeholder="Under-allowance $" inputMode="decimal" style={{ ...inputStyle, width: '140px' }} />
          <button
            type="button"
            disabled={busy || !allowanceAmount}
            style={secondaryButtonStyle}
            onClick={async () => {
              const ok = await run(
                () =>
                  addAllowanceCredit(invoice.id, 'Allowance under-run credit', Number(allowanceAmount)).then(
                    async (r) => (r.success ? recalculateInvoiceTotals(invoice.id, { contractType }) : r)
                  ),
                'Allowance credit applied.'
              );
              if (ok) setAllowanceAmount('');
            }}
          >
            Credit under-allowance
          </button>
          <span style={{ fontSize: '11px', color: color.faint }}>
            Offered only on the final invoice, only when the client asks (§4b).
          </span>
        </div>
      )}
    </div>
  );
}

// ── §11 presentation + §5 retainage ─────────────────────────────────────────

function SettingsPanel({
  invoice,
  retainageAllowed,
  contractType,
  busy,
  run,
}: {
  invoice: InvoiceWithLines;
  retainageAllowed: boolean;
  contractType: ContractType;
  busy: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) => Promise<boolean>;
}) {
  const [retainage, setRetainage] = useState(
    invoice.retainage_percent === null ? '' : String(invoice.retainage_percent)
  );

  return (
    <div style={{ ...cardStyle, padding: '12px 16px', display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div>
        <span style={microLabelStyle}>Presentation detail</span>
        <div style={{ marginTop: '4px' }}>
          <select
            value={invoice.presentation_level}
            disabled={busy}
            onChange={(e) =>
              run(
                () =>
                  updateInvoiceSettings(
                    invoice.id,
                    { presentation_level: e.target.value as PresentationLevel },
                    contractType
                  ),
                'Presentation updated.'
              )
            }
            style={inputStyle}
          >
            <option value="full_detail">Full detail</option>
            <option value="by_section">By section</option>
            <option value="lump_sum">Lump sum</option>
          </select>
        </div>
      </div>

      <div>
        <span style={microLabelStyle}>Retainage %</span>
        <div style={{ marginTop: '4px', display: 'flex', gap: '6px' }}>
          <input
            value={retainage}
            onChange={(e) => setRetainage(e.target.value)}
            disabled={!retainageAllowed || busy}
            placeholder={retainageAllowed ? '0' : 'n/a'}
            inputMode="decimal"
            style={{ ...inputStyle, width: '80px' }}
          />
          <button
            type="button"
            disabled={!retainageAllowed || busy}
            style={secondaryButtonStyle}
            onClick={() =>
              run(
                () =>
                  updateInvoiceSettings(
                    invoice.id,
                    { retainage_percent: retainage === '' ? null : Number(retainage) },
                    contractType
                  ),
                'Retainage updated.'
              )
            }
          >
            Apply
          </button>
        </div>
        {!retainageAllowed && (
          <div style={{ fontSize: '11px', color: color.faint, marginTop: '2px' }}>
            Never withheld on {invoice.invoice_type === 'deposit' ? 'a deposit' : 'T&M'} (§5).
          </div>
        )}
      </div>

      <label style={{ fontSize: '13px', color: color.body, display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={invoice.is_final}
          disabled={busy}
          onChange={(e) =>
            run(
              () => updateInvoiceSettings(invoice.id, { is_final: e.target.checked }, contractType),
              'Updated.'
            )
          }
        />
        Final invoice
        <span style={{ fontSize: '11px', color: color.faint }}>(unlocks the §4b allowance credit)</span>
      </label>

      <span style={{ fontSize: '11px', color: color.faint }}>
        {contractType.replace(/_/g, ' ')} instrument
      </span>
    </div>
  );
}

// ── §9 / §12 lifecycle ──────────────────────────────────────────────────────

function LifecycleActions({
  invoice,
  role,
  memberId,
  canApprove,
  timeZone,
  busy,
  run,
  projectId,
}: {
  invoice: InvoiceWithLines;
  role: string;
  memberId: string | null;
  canApprove: boolean;
  timeZone: string;
  busy: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) => Promise<boolean>;
  projectId: string;
}) {
  const router = useRouter();
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState('');

  const isDraft = invoice.status === 'draft';
  const isPending = invoice.status === 'pending_approval';
  const isSent = invoice.status === 'sent' || invoice.status === 'paid';
  const isVoided = invoice.status === 'voided';

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      {/* §12 — a PM submits; Owner/Admin approve and send. */}
      {isDraft && !canApprove && (
        <button type="button" disabled={busy} style={secondaryButtonStyle} onClick={() => run(() => submitForApproval(invoice.id), 'Submitted for approval.')}>
          Submit for approval
        </button>
      )}
      {isPending && canApprove && memberId && (
        <button type="button" disabled={busy} style={secondaryButtonStyle} onClick={() => run(() => approveInvoice(invoice.id, memberId), 'Approved.')}>
          Approve
        </button>
      )}
      {(isDraft || isPending) && canApprove && (
        <button
          type="button"
          disabled={busy || invoice.lines.length === 0}
          style={primaryButtonStyle}
          onClick={() => {
            if (!window.confirm('Mark this invoice sent? A sent invoice is immutable — corrections go through void and reissue.')) return;
            run(() => markInvoiceSent(invoice.id, timeZone), 'Invoice marked sent.');
          }}
        >
          Mark sent
        </button>
      )}

      {/* §9 — void requires a reason; actor narrows once money is applied. */}
      {isSent && canApprove && !voidOpen && (
        <button type="button" disabled={busy} style={{ ...secondaryButtonStyle, color: color.danger }} onClick={() => setVoidOpen(true)}>
          Void
        </button>
      )}
      {voidOpen && (
        <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" autoFocus style={inputStyle} />
          <button
            type="button"
            disabled={busy || !reason.trim() || !memberId}
            style={{ ...primaryButtonStyle, backgroundColor: color.danger }}
            onClick={async () => {
              const ok = await run(
                () =>
                  voidInvoice(invoice.id, reason, memberId as string, {
                    // 7E owns payments and is not built — no payment can exist
                    // yet, so the unpaid arm applies. When 7E lands it passes
                    // the real payment state here (§9).
                    hasPayment: false,
                    paymentSyncedToQuickBooks: false,
                    role,
                  }),
                'Invoice voided. Its costs and hours are available to bill again.'
              );
              if (ok) {
                setVoidOpen(false);
                setReason('');
              }
            }}
          >
            Confirm void
          </button>
          <button type="button" style={secondaryButtonStyle} onClick={() => setVoidOpen(false)}>
            Cancel
          </button>
        </span>
      )}

      {/* §10 — reissue is OFFERED, never required; a terminal void is valid. */}
      {isVoided && canApprove && (
        <button
          type="button"
          disabled={busy}
          style={secondaryButtonStyle}
          onClick={async () => {
            const result = await reissueInvoice(invoice.id);
            if (result.success && result.id) {
              router.push(`/dashboard/projects/${projectId}/invoices/${result.id}`);
            }
          }}
        >
          Reissue as new invoice
        </button>
      )}

      {isVoided && invoice.void_reason && (
        <span style={{ fontSize: '12px', color: color.faint }}>Voided — {invoice.void_reason}</span>
      )}
    </div>
  );
}
