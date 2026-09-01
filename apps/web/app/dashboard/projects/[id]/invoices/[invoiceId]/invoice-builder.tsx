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
import { useConfirm } from '@/components/confirm/confirm-provider';
import {
  addAllowanceCredit,
  addDiscountLine,
  addDrawLine,
  addFixedLine,
  billEstimateLines,
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
import {
  DUE_ON_RECEIPT_LABEL,
  findSplitDays,
  isDerivedContract,
  lineInstrumentKey,
} from '@/lib/services/invoices-shared';
import type { InvoiceDelivery } from '@/lib/services/invoice-delivery-shared';
import type { SelectionBilling } from '@/lib/services/contract-value';
import type { EstimateLineBilling } from '@/lib/services/estimate-line-billing';
import { InvoiceDeliveryPanel } from './invoice-delivery-panel';
import type {
  AvailableCredit,
  ContractType,
  InstrumentOption,
  InstrumentTypes,
  InvoiceWithLines,
  PickableCost,
  PickableHour,
} from '@/lib/services/invoices-shared';
import {
  groupSelectedHours,
  partialClaimAmount,
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

interface InvoiceBuilderProps {
  projectId: string;
  invoice: InvoiceWithLines;
  role: string;
  deliveries: InvoiceDelivery[];
  recipientEmail: string | null;
  memberId: string | null;
  /** §2 — every instrument this invoice may bill, estimate first. */
  instruments: InstrumentOption[];
  /** §5 — contract type by instrument, for the per-line retainage split. */
  instrumentTypes: InstrumentTypes;
  /**
   * §9 [S143] — the invoice's REAL payment state, read server-side by
   * getInvoiceVoidState(). Replaces two hardcoded `false`s that made
   * canVoidInvoice() take its unpaid arm on every invoice.
   */
  voidState: { hasPayment: boolean; syncedToQuickBooks: boolean };
  /** Where a person-day's hours go unless reassigned (Josh's ruling): the
   *  ORIGINAL CONTRACT. */
  defaultInstrumentKey: string | null;
  sourceEstimateId: string | null;
  /** §2 [S97] — the contract's estimate line items, with per-line remaining. */
  estimateLines: EstimateLineBilling;
  /** Keyed by instrument key; only DERIVED instruments have an entry. */
  pickableCostsByInstrument: Record<string, PickableCost[]>;
  pickableHours: PickableHour[];
  availableCredits: AvailableCredit[];
  /** [S175 stage 5] Approved selections and what is left to bill on each. */
  selectionBilling: SelectionBilling;
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
    deliveries,
    recipientEmail,
    memberId,
    instruments,
    instrumentTypes,
    voidState,
    defaultInstrumentKey,
    sourceEstimateId,
    estimateLines,
    pickableCostsByInstrument,
    pickableHours,
    availableCredits,
    selectionBilling,
    originalContractValue,
    alreadyBilled,
    timeZone,
  } = props;

  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ── §2 — instrument tabs, and ONE selection that survives switching ────────
  //
  // These were `<a href="?instrument=co:…">` links. Because switching was a
  // page NAVIGATION, the two Sets below (useState) were discarded every time,
  // so a mixed selection could not even be assembled. They are now tabs and the
  // selection is held across all of them.
  //
  // An allocation id belongs to exactly one instrument (attribution is
  // transitive through project_budget_items), so ONE Set of allocation ids is
  // unambiguous across every tab.
  const derivedInstruments = instruments.filter((i) => isDerivedContract(i.contractType));
  const [activeKey, setActiveKey] = useState<string | null>(
    () => derivedInstruments[0]?.key ?? instruments[0]?.key ?? null
  );
  const active = instruments.find((i) => i.key === activeKey) ?? null;
  const activeCosts = active ? pickableCostsByInstrument[active.key] ?? [] : [];

  const [selectedCosts, setSelectedCosts] = useState<Set<string>>(new Set());
  const [selectedHours, setSelectedHours] = useState<Set<string>>(new Set());

  // JOSH'S RULING [S97]: a person-day's hours DEFAULT to the ORIGINAL CONTRACT
  // and can be reassigned to a CO. The assignment is per PERSON-DAY, never per
  // segment — that is what structurally prevents a day being split across two
  // instruments, which would round each part UP to the half hour independently
  // and bill the client more than the whole day (§7.2, the P-4 hazard the
  // split-day warning already exists for).
  const [hourDayInstrument, setHourDayInstrument] = useState<Record<string, string>>({});

  // §6.2 PARTIAL BILLING [S97, Josh] — the percentage lives on the INSTRUMENT
  // TAB, because it differs per instrument: "draw #2 of the contract plus 50%
  // of CO-106-02". Keyed by instrument key; absent means 100%.
  //
  // It applies to COSTS only. §7.2 rounds each person-day UP to the half hour,
  // so a partial hour claim over-bills — hours stay all-or-nothing per
  // person-day and this control never touches them.
  const [billPercentByInstrument, setBillPercentByInstrument] = useState<Record<string, string>>({});
  const percentFor = (key: string): number => {
    const raw = billPercentByInstrument[key];
    if (raw === undefined || raw.trim() === '') return 100;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 && n <= 100 ? n : 100;
  };
  const dayKeyOf = (memberId: string, workDate: string) => `${memberId}|${workDate}`;
  const instrumentForDay = (memberId: string, workDate: string): string | null =>
    hourDayInstrument[dayKeyOf(memberId, workDate)] ?? defaultInstrumentKey;

  const isDraft = invoice.status === 'draft' || invoice.status === 'pending_approval';

  // GENERATE FLOW [S97, Josh — option 1]: same page, no new route. On generate
  // the picker COLLAPSES and the invoice plus its actions become the focus.
  // Default state follows the invoice: an invoice that already carries derived
  // lines opens collapsed on load, so returning to it lands on the document
  // rather than on the selection that produced it. Reopening is one click and
  // re-deriving is non-destructive to discount/credit lines (§8).
  const derivedLineCount = invoice.lines.filter(
    (l) => l.line_type === 'derived_cost' || l.line_type === 'derived_labor'
  ).length;
  const [pickerOpen, setPickerOpen] = useState(() => derivedLineCount === 0);
  const isDerived = derivedInstruments.length > 0;
  const canApprove = role === 'owner' || role === 'admin';

  // The DRAW panel belongs to the originating contract, which is the only
  // instrument a percentage-of-contract draw can price against (§2 rule a).
  const estimateContractType = instrumentTypes.fallback;
  const drawsAvailable = !isDerivedContract(estimateContractType) && sourceEstimateId !== null;

  // §5 — INVOICE-level: a deposit withholds nothing at all. Whether a given
  // LINE is retained against is decided per instrument (lineRetainageEligible),
  // so the control is offered whenever ANY instrument on this job is eligible.
  const retainageAllowed =
    invoice.invoice_type !== 'deposit' &&
    instruments.some((i) => i.contractType !== 'time_and_materials');
  const mixedRetainage =
    retainageAllowed && instruments.some((i) => i.contractType === 'time_and_materials');

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

  /** What this invoice will actually CLAIM across every instrument — each
   *  ticked cost at its own tab's percentage, not its whole remainder (§6.2). */
  const selectedCostTotal = derivedInstruments.reduce(
    (sum, i) =>
      sum +
      (pickableCostsByInstrument[i.key] ?? [])
        .filter((c) => selectedCosts.has(c.allocationId) && !c.blockedReason)
        .reduce((s, c) => s + partialClaimAmount(c.amount, percentFor(i.key)), 0),
    0
  );

  /** §2 — one selection PER INSTRUMENT, from the single held selection. */
  const selections = useMemo(
    () =>
      derivedInstruments
        .map((i) => ({
          instrument: i.ref,
          contractType: i.contractType,
          selectedCosts: (pickableCostsByInstrument[i.key] ?? [])
            .filter((c) => selectedCosts.has(c.allocationId) && !c.blockedReason)
            .map((c) => ({
              allocationId: c.allocationId,
              description: c.description,
              category: c.category,
              amount: c.amount,
              expenseDate: c.expenseDate,
            })),
          selectedHours: selectedSegments.filter(
            (s) => instrumentForDay(s.memberId, s.workDate) === i.key
          ),
          billPercent: percentFor(i.key),
        }))
        .filter((s) => s.selectedCosts.length > 0 || s.selectedHours.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [derivedInstruments, pickableCostsByInstrument, selectedCosts, selectedSegments, hourDayInstrument, defaultInstrumentKey, billPercentByInstrument]
  );

  /**
   * Hours assigned to an instrument that CANNOT derive them. Hours bill through
   * a labor rate, and a fixed-price instrument has none — deriving would fail
   * with a MissingRateError naming a rate type the user never intended to set.
   * Caught here so the message names the real problem: the day is pointed at
   * the wrong instrument.
   */
  const misassignedDays = useMemo(() => {
    const derivedKeys = new Set(derivedInstruments.map((i) => i.key));
    const bad: Array<{ memberId: string; workDate: string }> = [];
    const seen = new Set<string>();
    for (const s of selectedSegments) {
      const key = dayKeyOf(s.memberId, s.workDate);
      if (seen.has(key)) continue;
      seen.add(key);
      const assigned = instrumentForDay(s.memberId, s.workDate);
      if (!assigned || !derivedKeys.has(assigned)) bad.push({ memberId: s.memberId, workDate: s.workDate });
    }
    return bad;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSegments, hourDayInstrument, derivedInstruments, defaultInstrumentKey]);

  async function derive() {
    if (selections.length === 0) {
      setError('Nothing is ticked. Select at least one cost or one day of hours to bill.');
      return;
    }
    if (misassignedDays.length > 0) {
      setError(
        `${misassignedDays.length === 1 ? 'A day of hours is' : `${misassignedDays.length} days of hours are`} assigned to an instrument that bills a fixed price, which has no labor rate. Reassign ${misassignedDays.length === 1 ? 'it' : 'them'} to a cost-plus or T&M instrument, or untick the hours.`
      );
      return;
    }
    const ok = await run(
      () =>
        deriveAndSaveInvoice({
          invoiceId: invoice.id,
          selections,
          instrumentTypes,
          retainagePercent: retainageAllowed ? invoice.retainage_percent : null,
          isDeposit: invoice.invoice_type === 'deposit',
        }),
      selections.length > 1
        ? `Invoice generated from ${selections.length} instruments.`
        : 'Invoice generated from the selected costs and hours.'
    );
    // ONLY on success. A failed derive (a MissingRateError names the rate type
    // and date that need fixing) must leave the selection intact and the picker
    // OPEN — collapsing it, or clearing the ticks, would hide the very rows the
    // error is about and force the user to re-tick everything.
    if (!ok) return;
    setSelectedCosts(new Set());
    setSelectedHours(new Set());
    // Option 1: the picker gets out of the way and the invoice takes focus.
    setPickerOpen(false);
  }

  // ── §11 — live presentation preview from the saved lines ──────────────────
  const labelForKey = useMemo(() => {
    const map = new Map(instruments.map((i) => [i.key, i.label]));
    return (key: string) => map.get(key) ?? 'Other';
  }, [instruments]);

  /** The instruments this invoice's SAVED lines actually bill (§2). */
  const billedInstrumentLabels = useMemo(() => {
    const keys: string[] = [];
    for (const l of invoice.lines) {
      const key = lineInstrumentKey(l);
      if (key !== 'none' && !keys.includes(key)) keys.push(key);
    }
    return keys.map(labelForKey);
  }, [invoice.lines, labelForKey]);

  const presented = useMemo(
    () =>
      presentInvoice(
        invoice.lines.map((l): PresentationLine => {
          const key = lineInstrumentKey(l);
          return {
            description: l.description,
            category: l.category,
            costBasis: l.cost_basis === null ? null : Number(l.cost_basis),
            amount: Number(l.billed_amount),
            lineType: l.line_type,
            instrumentKey: key,
            instrumentLabel: labelForKey(key),
          };
        }),
        invoice.presentation_level as PresentationLevel
      ),
    [invoice.lines, invoice.presentation_level, labelForKey]
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
            {invoice.status.replace('_', ' ')}
            {/* §2 — an invoice may span instruments, so the header names what
                it ACTUALLY bills rather than one selected instrument. */}
            {billedInstrumentLabels.length > 0 && ` · ${billedInstrumentLabels.join(' + ')}`}
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
          voidState={voidState}
        />
      </div>

      {/* §13 — SEND. Owner/Admin only; the route enforces it too.
          [S97] No longer gated on the invoice already being sent: on a draft
          this issues it (allocating the number) and emails it in one action.
          A voided invoice is the only status with nothing to send. */}
      {invoice.status !== 'voided' && (
        <div style={{ ...cardStyle, padding: '10px 14px' }}>
          <InvoiceDeliveryPanel
            invoiceId={invoice.id}
            canSend={role === 'owner' || role === 'admin'}
            recipientEmail={recipientEmail}
            deliveries={deliveries}
            status={invoice.status}
            hasLines={invoice.lines.length > 0}
            /* 7F §5.1 — Owner/Admin only, matching the release role gate
               (§8.2). A PM sees no prompt because a PM cannot generate one;
               offering a link that refuses is worse than offering nothing. */
            lienReleasePrompt={
              role === 'owner' || role === 'admin' ? { projectId } : null
            }
          />
        </div>
      )}

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

      {/* COLLAPSED PICKER [S97] — what the invoice was generated from, and the
          one control that brings the selection back. Shown only once something
          has been derived, so a fresh draft still opens straight into picking. */}
      {isDraft && isDerived && !pickerOpen && (
        <div
          style={{
            ...cardStyle,
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '12px', color: color.faint }}>
            Generated from{' '}
            <strong style={{ color: color.body }}>
              {billedInstrumentLabels.join(' + ') || 'the selected instruments'}
            </strong>{' '}
            —{' '}
            {derivedLineCount === 1 ? '1 derived line' : `${derivedLineCount} derived lines`}.
            Anything you left unticked is still unbilled and comes back next time (§6.2).
          </span>
          <button type="button" style={secondaryButtonStyle} onClick={() => setPickerOpen(true)}>
            Change what&rsquo;s billed
          </button>
        </div>
      )}

      {/* §2 — INSTRUMENT TABS. One invoice may bill the estimate AND several
          change orders together (acceptance #2). These are tabs, not links:
          the selection below is held across all of them, so ticking a cost on
          the contract and another on a CO builds ONE invoice. */}
      {isDraft && pickerOpen && instruments.length > 1 && (
        <div style={{ ...cardStyle, padding: '12px 16px' }}>
          <span style={microLabelStyle}>Bill against</span>
          <div style={{ marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {instruments.map((i) => {
              const ticked = (pickableCostsByInstrument[i.key] ?? []).filter((c) =>
                selectedCosts.has(c.allocationId)
              ).length;
              const days = new Set(
                selectedSegments
                  .filter((s) => instrumentForDay(s.memberId, s.workDate) === i.key)
                  .map((s) => dayKeyOf(s.memberId, s.workDate))
              ).size;
              return (
                <button
                  key={i.key}
                  type="button"
                  onClick={() => setActiveKey(i.key)}
                  style={pillStyle(activeKey === i.key)}
                >
                  {i.label}
                  {ticked + days > 0 && ` · ${ticked + days}`}
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: '11px', color: color.faint, margin: '6px 0 0' }}>
            Each instrument carries its own type and rates (P4) — a change order bills on its own
            terms and never re-prices the original contract&rsquo;s draws (§4). Your ticks are kept
            on every tab; one Generate bills them all together.
          </p>
        </div>
      )}

      {/* §2 [S97] — the CONTRACT'S ESTIMATE LINE ITEMS. Josh's ruling: bring
          them ALL across, ALL SELECTED BY DEFAULT; the user deselects what this
          invoice should not carry. Fixed-price contract only. */}
      {isDraft && pickerOpen && drawsAvailable && estimateLines.lines.length > 0 && (
        <EstimateLinePanel
          invoiceId={invoice.id}
          sourceEstimateId={estimateLines.estimateId as string}
          billing={estimateLines}
          instrumentTypes={instrumentTypes}
          busy={busy}
          run={run}
        />
      )}

      {/* §2 — fixed-price draws, against the ORIGINATING CONTRACT. Shown
          whenever that contract is fixed-price, even if a derived CO also sits
          on this invoice: a mixed invoice can carry a contract draw AND a CO's
          derived lines. */}
      {isDraft && drawsAvailable && (
        <DrawPanel
          invoiceId={invoice.id}
          originalContractValue={originalContractValue}
          alreadyBilled={alreadyBilled}
          sourceEstimateId={sourceEstimateId}
          instrumentTypes={instrumentTypes}
          busy={busy}
          run={run}
        />
      )}

      {/* §6.2 — COST picker */}
      {isDraft && isDerived && pickerOpen && (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${color.cardBorder}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <span style={microLabelStyle}>
                  Unbilled approved costs{active ? ` — ${active.label}` : ''}
                </span>
                <span style={{ fontSize: '11px', color: color.faint, marginLeft: '8px' }}>
                  tick what this invoice bills — anything left unticked, or left unbilled by the
                  percentage, comes back next time (§6.2)
                </span>
              </div>
              {/* §6.2 PARTIAL BILLING — per instrument tab (Josh's ruling). */}
              {active && (
                <label style={{ fontSize: '12px', color: color.body, display: 'inline-flex', gap: '6px', alignItems: 'center', whiteSpace: 'nowrap' }}>
                  Bill
                  <input
                    value={billPercentByInstrument[active.key] ?? ''}
                    onChange={(e) =>
                      setBillPercentByInstrument((prev) => ({ ...prev, [active.key]: e.target.value }))
                    }
                    placeholder="100"
                    inputMode="decimal"
                    disabled={busy}
                    style={{ ...inputStyle, width: '64px', textAlign: 'right' }}
                  />
                  % of each ticked cost
                </label>
              )}
            </div>
            {active && percentFor(active.key) < 100 && (
              <p style={{ fontSize: '11px', color: color.faint, margin: '6px 0 0' }}>
                Each ticked cost bills {percentFor(active.key)}% of what is still unbilled on it; the
                rest stays available for a later invoice. This is not a discount — §8&rsquo;s
                discount line is still the way to give money up.
              </p>
            )}
          </div>
          {activeCosts.length === 0 ? (
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
                  <th style={{ ...thStyle, textAlign: 'right' }}>Unbilled</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>This invoice</th>
                </tr>
              </thead>
              <tbody>
                {activeCosts.map((cost) => (
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
                        <div style={{ fontSize: '11px', color: color.warning }}>
                          {cost.blockedReason}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: color.mutedAlt }}>{cost.category}</td>
                    <td style={{ ...tdStyle, color: color.mutedAlt }}>{cost.expenseDate}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: cost.ageDays > 30 ? color.warning : color.faint }}>
                      {cost.ageDays}d
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: font.mono }}>
                      {money(cost.amount)}
                      {cost.claimedAmount > 0 && (
                        <div style={{ fontSize: '11px', color: color.faint }}>
                          of {money(cost.originalAmount)} — {money(cost.claimedAmount)} already
                          billed
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: font.mono, color: selectedCosts.has(cost.allocationId) ? color.body : color.faint }}>
                      {selectedCosts.has(cost.allocationId) && !cost.blockedReason
                        ? money(partialClaimAmount(cost.amount, active ? percentFor(active.key) : 100))
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* §7.2 — HOURS picker */}
      {isDraft && isDerived && pickerOpen && (
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
                    {/* §2 [S97] — hours carry no instrument of their own, so
                        the user says where each PERSON-DAY bills. */}
                    <th style={thStyle}>Bills to</th>
                  </tr>
                </thead>
                <tbody>
                  {pickableHours.map((hour) => {
                    const dayKey = dayKeyOf(hour.memberId, hour.workDate);
                    const assigned = instrumentForDay(hour.memberId, hour.workDate);
                    const assignedOk = derivedInstruments.some((i) => i.key === assigned);
                    // Only the FIRST row of a person-day carries the control:
                    // the assignment is per day, which is what stops a day
                    // being split across instruments (§7.2 rounding).
                    const firstOfDay =
                      pickableHours.findIndex(
                        (h) => dayKeyOf(h.memberId, h.workDate) === dayKey
                      ) === pickableHours.indexOf(hour);
                    return (
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
                      <td style={tdStyle}>
                        {firstOfDay ? (
                          <>
                            <select
                              disabled={busy}
                              value={assigned ?? ''}
                              onChange={(e) =>
                                setHourDayInstrument((prev) => ({
                                  ...prev,
                                  [dayKey]: e.target.value,
                                }))
                              }
                              style={{ ...inputStyle, padding: '3px 6px', maxWidth: '180px' }}
                            >
                              {instruments.map((i) => (
                                <option key={i.key} value={i.key}>
                                  {i.label}
                                  {isDerivedContract(i.contractType) ? '' : ' (no labor rate)'}
                                </option>
                              ))}
                            </select>
                            {!assignedOk && selectedHours.has(hour.segmentId) && (
                              <div style={{ fontSize: '11px', color: color.warning }}>
                                Fixed-price instruments have no labor rate — reassign this day.
                              </div>
                            )}
                          </>
                        ) : (
                          <span style={{ fontSize: '11px', color: color.faint }}>
                            same day &rarr;
                          </span>
                        )}
                      </td>
                    </tr>
                    );
                  })}
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
                <div style={{ padding: '10px 16px', backgroundColor: '#fffbeb', color: color.warning, fontSize: '12px' }}>
                  You are splitting {splitDays.length === 1 ? 'a person-day' : 'person-days'} across
                  invoices. Rounding applies per person per day, so billing the parts separately can
                  total more than the whole day would. Bill a day in one piece unless you mean to.
                  (A day can never be split across INSTRUMENTS — &quot;Bills to&quot; is set per person-day
                  for exactly this reason.)
                </div>
              )}
            </>
          )}
        </div>
      )}

      {isDraft && isDerived && pickerOpen && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={derive} disabled={busy} style={primaryButtonStyle}>
            {busy ? 'Generating…' : derivedLineCount > 0 ? 'Regenerate invoice' : 'Generate invoice'}
          </button>
          {derivedLineCount > 0 && (
            <button
              type="button"
              style={secondaryButtonStyle}
              disabled={busy}
              onClick={() => setPickerOpen(false)}
            >
              Cancel
            </button>
          )}
          <span style={{ fontSize: '12px', color: color.faint }}>
            {selectedCosts.size} costs ({money(selectedCostTotal)}) · {totalBillableHours} billable
            hours
            {derivedLineCount > 0 &&
              ' — regenerating replaces the derived lines; discounts and credits survive (§8)'}
          </span>
        </div>
      )}

      {/* Lines + totals */}
      <LinesPanel
        invoice={invoice}
        isDraft={isDraft}
        instrumentTypes={instrumentTypes}
        instruments={instruments}
        busy={busy}
        run={run}
        presented={presented}
      />

      {/* [S175 stage 5] Approved SELECTIONS — the overage bills against the
          selection's OWN instrument (Q4), never the estimate's. Only
          fixed-remaining selections are offered: an as-incurred one bills
          through its instrument's cost picker, a credit through Adjustments. */}
      {isDraft && selectionBilling.selections.some((s) => s.kind === 'fixed_remaining') && (
        <SelectionsPanel
          invoiceId={invoice.id}
          billing={selectionBilling}
          instrumentTypes={instrumentTypes}
          busy={busy}
          run={run}
        />
      )}

      {/* Adjustments — §8 discount, §4a/§4b/§3a credits */}
      {isDraft && (
        <AdjustmentsPanel
          invoice={invoice}
          credits={availableCredits}
          canApprove={canApprove}
          instrumentTypes={instrumentTypes}
          busy={busy}
          run={run}
        />
      )}

      {/* §11 presentation + §5 retainage settings */}
      {isDraft && (
        <SettingsPanel
          invoice={invoice}
          retainageAllowed={retainageAllowed}
          mixedRetainage={mixedRetainage}
          instrumentTypes={instrumentTypes}
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

// ── §2 — the contract's ESTIMATE LINE ITEMS [S97] ───────────────────────────

function EstimateLinePanel({
  invoiceId,
  sourceEstimateId,
  billing,
  instrumentTypes,
  busy,
  run,
}: {
  invoiceId: string;
  sourceEstimateId: string;
  billing: EstimateLineBilling;
  instrumentTypes: InstrumentTypes;
  busy: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) => Promise<boolean>;
}) {
  // ALL SELECTED BY DEFAULT — the ruling. The user DESELECTS.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(billing.lines.map((l) => l.lineItemId))
  );
  const [percent, setPercent] = useState('');

  const pct = (() => {
    if (percent.trim() === '') return 100;
    const n = Number(percent);
    return Number.isFinite(n) && n > 0 && n <= 100 ? n : 100;
  })();

  // §6.2a's rule, reused rather than restated: the LAST claim on a line bills
  // the EXACT REMAINDER, so partials sum to the whole with nothing stranded.
  const amountFor = (remaining: number) => partialClaimAmount(remaining, pct);

  const chosen = billing.lines.filter((l) => selected.has(l.lineItemId));
  const total = chosen.reduce((s, l) => s + amountFor(l.remaining), 0);
  // The whole-estimate discount goes across ONCE, with the first billing, so
  // the invoice closes at the contract value rather than the subtotal.
  const discount = billing.undiscounted > 0 && pct >= 100 && selected.size === billing.lines.length
    ? billing.undiscounted
    : 0;

  return (
    <div style={{ ...cardStyle, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${color.cardBorder}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <span style={microLabelStyle}>Contract line items</span>
            <span style={{ fontSize: '11px', color: color.faint, marginLeft: '8px' }}>
              all selected — untick what this invoice should not carry (§2)
            </span>
          </div>
          <label style={{ fontSize: '12px', color: color.body, display: 'inline-flex', gap: '6px', alignItems: 'center', whiteSpace: 'nowrap' }}>
            Bill
            <input
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="100"
              inputMode="decimal"
              disabled={busy}
              style={{ ...inputStyle, width: '64px', textAlign: 'right' }}
            />
            % of each line
          </label>
        </div>
        {pct < 100 && (
          <p style={{ fontSize: '11px', color: color.faint, margin: '6px 0 0' }}>
            Each ticked line bills {pct}% of what is still unbilled on it; the rest stays available
            for a later invoice.
          </p>
        )}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: '34px' }}>
              <input
                type="checkbox"
                disabled={busy}
                checked={selected.size === billing.lines.length}
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? new Set(billing.lines.map((l) => l.lineItemId)) : new Set()
                  )
                }
              />
            </th>
            <th style={thStyle}>Line item</th>
            <th style={thStyle}>Section</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Unbilled</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>This invoice</th>
          </tr>
        </thead>
        <tbody>
          {billing.lines.map((l) => (
            <tr key={l.lineItemId}>
              <td style={tdStyle}>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={selected.has(l.lineItemId)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(l.lineItemId);
                    else next.delete(l.lineItemId);
                    setSelected(next);
                  }}
                />
              </td>
              <td style={tdStyle}>
                {l.name}
                {l.costCode && (
                  <div style={{ fontSize: '11px', color: color.faint }}>{l.costCode}</div>
                )}
              </td>
              <td style={{ ...tdStyle, color: color.mutedAlt }}>{l.category}</td>
              <td style={{ ...tdStyle, textAlign: 'right', fontFamily: font.mono }}>
                {money(l.remaining)}
                {l.billed > 0 && (
                  <div style={{ fontSize: '11px', color: color.faint }}>
                    of {money(l.sell)} — {money(l.billed)} already billed
                  </div>
                )}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontFamily: font.mono, color: selected.has(l.lineItemId) ? color.body : color.faint }}>
                {selected.has(l.lineItemId) ? money(amountFor(l.remaining)) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ padding: '10px 16px', borderTop: `1px solid ${color.cardBorder}`, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={busy || chosen.length === 0}
          style={primaryButtonStyle}
          onClick={() =>
            run(
              () =>
                billEstimateLines({
                  invoiceId,
                  sourceEstimateId,
                  selections: chosen.map((l) => ({
                    lineItemId: l.lineItemId,
                    description: l.name,
                    category: l.category,
                    amount: amountFor(l.remaining),
                  })),
                  discount,
                  discountLabel: 'Contract discount',
                }).then(async (r) =>
                  r.success ? recalculateInvoiceTotals(invoiceId, { instrumentTypes }) : r
                ),
              `${chosen.length} line ${chosen.length === 1 ? 'item' : 'items'} billed.`
            )
          }
        >
          Bill selected lines
        </button>
        <span style={{ fontSize: '12px', color: color.faint }}>
          {chosen.length} of {billing.lines.length} selected · {money(total)}
          {discount > 0 && ` less ${money(discount)} contract discount`}
        </span>
      </div>

      {billing.undiscounted > 0 && discount === 0 && (
        <div style={{ padding: '10px 16px', backgroundColor: '#fffbeb', color: color.warning, fontSize: '12px' }}>
          This estimate carries a {money(billing.undiscounted)} whole-contract discount. The line
          prices above are the pre-discount subtotal, so billing all of them at 100% is what brings
          the discount across and lands exactly on the contract value. Billing a subset now leaves
          the discount to be applied later — add it as a discount line (§8) when you do.
        </div>
      )}
    </div>
  );
}

// ── §2 / trace G — draws ────────────────────────────────────────────────────

function DrawPanel({
  invoiceId,
  originalContractValue,
  alreadyBilled,
  sourceEstimateId,
  instrumentTypes,
  busy,
  run,
}: {
  invoiceId: string;
  originalContractValue: number | null;
  alreadyBilled: number;
  /** §2 — the draw is a percentage of the ORIGINAL contract, so it carries the
   *  originating estimate as its instrument. */
  sourceEstimateId: string | null;
  instrumentTypes: InstrumentTypes;
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
        Percentages apply to the ORIGINAL contract value
        {originalContractValue !== null ? ` ${money(originalContractValue)}` : ''} — a signed
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
            // RULING 2 [S97]: originalContractValue is null both when the job
            // genuinely has none AND when the caller is below Owner/Admin (the
            // figure now lives in project_financials, Owner/Admin RLS). It used
            // to be `?? 0`, which would price a percentage draw at ZERO — a
            // silent, wrong bill. Refuse loudly instead.
            if (originalContractValue === null) {
              await run(
                async () => ({
                  success: false,
                  error:
                    'This invoice cannot price a draw: the contract value is not available to you. ' +
                    'Ask an Owner or Admin to add the draw, or bill a fixed amount instead.',
                }),
              );
              return;
            }
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
                  originalContractValue,
                  alreadyBilled,
                  sourceEstimateId
                ).then(async (r) => {
                  if (!r.success) return r;
                  return recalculateInvoiceTotals(invoiceId, { instrumentTypes });
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
        <p style={{ fontSize: '12px', color: color.warning, margin: '6px 0 0' }}>
          The contract value is not available here, so a percentage draw cannot be priced — either
          this project has none set, or it is an Owner/Admin figure on this job. Enter a fixed
          amount as a manual line instead.
        </p>
      )}
    </div>
  );
}

// ── Lines + the §11 preview ─────────────────────────────────────────────────

function LinesPanel({
  invoice,
  isDraft,
  instrumentTypes,
  instruments,
  busy,
  run,
  presented,
}: {
  invoice: InvoiceWithLines;
  isDraft: boolean;
  instrumentTypes: InstrumentTypes;
  instruments: InstrumentOption[];
  busy: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) => Promise<boolean>;
  presented: ReturnType<typeof presentInvoice>;
}) {
  const [manualLabel, setManualLabel] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  // §11 — the category was never captured, which is what made a manual line
  // vanish from the by-section presentation. It is also §2's "categories post
  // into project finances" half. Defaults to 'other', never null.
  const [manualCategory, setManualCategory] =
    useState<'labor' | 'material' | 'subcontractor' | 'other' | 'allowance'>('other');
  // §2 [S97] — STANDALONE vs a lump-sum billing OF an instrument. Two different
  // things were conflated here: only the STANDALONE kind is new income that
  // posts to project finances, and only an instrument-attributed line is
  // retainage-classified to its own contract (§5, Part A).
  const [manualInstrument, setManualInstrument] = useState<string>('standalone');

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
              {/* §8's `derived_amount` — what the system computed, before any
                  override or discount. Labelled "Calculated" on screen so it
                  pairs with the "Generate invoice" action; the column, the
                  spec and the services all still say derived. */}
              <th style={{ ...thStyle, textAlign: 'right' }}>Calculated</th>
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
                    <span style={{ fontSize: '11px', color: color.warning }}> credit</span>
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
                              r.success ? recalculateInvoiceTotals(invoice.id, { instrumentTypes }) : r
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
            {/* §11 [S97] — one block PER INSTRUMENT, matching the PDF exactly.
                A single-instrument invoice shows no heading, as before. */}
            {presented.groups.map((group, gi) => (
              <div key={group.key || gi} style={{ marginBottom: gi < presented.groups.length - 1 ? '8px' : 0 }}>
                {presented.groups.length > 1 && group.label !== '' && (
                  <div style={{ fontWeight: 700, marginTop: gi > 0 ? '6px' : 0 }}>{group.label}</div>
                )}
                {group.laborLines.map((l, i) => (
                  <div key={`labor-${i}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{l.description}</span>
                    <span>{money(l.amount)}</span>
                  </div>
                ))}
                {group.nonLaborLines.map((l, i) => (
                  <div key={`nl-${i}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{l.description}</span>
                    <span>{money(l.costBasis ?? l.amount)}</span>
                  </div>
                ))}
                {/* [S97] no cost basis = a CHARGE, outside the cost block. */}
                {group.chargeLines.map((l, i) => (
                  <div key={`ch-${i}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{l.description}</span>
                    <span>{money(l.amount)}</span>
                  </div>
                ))}
                {group.nonLaborLines.length > 0 && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${color.rowDivider}`, marginTop: '4px', paddingTop: '4px' }}>
                      <span>Subtotal (non-labor)</span>
                      <span>{money(group.nonLaborSubtotal)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Markup</span>
                      <span>{money(group.nonLaborMarkup)}</span>
                    </div>
                  </>
                )}
              </div>
            ))}
            {presented.adjustmentLines.map((l, i) => (
              <div key={`adj-${i}`} style={{ display: 'flex', justifyContent: 'space-between', color: color.warning }}>
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
            {presented.groups.length > 1 &&
              ' Each instrument gets its own subtotal and markup — two markup rates cannot honestly share one line.'}
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
        <TotalRow label="Calculated total" value={Number(invoice.derived_total)} muted />
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
        <div style={{ padding: '10px 16px', borderTop: `1px solid ${color.cardBorder}` }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={manualLabel} onChange={(e) => setManualLabel(e.target.value)} placeholder="Manual line" style={inputStyle} />
            <select
              value={manualCategory}
              onChange={(e) => setManualCategory(e.target.value as typeof manualCategory)}
              disabled={busy}
              style={{ ...inputStyle, width: '140px' }}
            >
              <option value="labor">Labor</option>
              <option value="material">Material</option>
              <option value="subcontractor">Subcontractor</option>
              <option value="other">Other</option>
              <option value="allowance">Allowance</option>
            </select>
            <select
              value={manualInstrument}
              onChange={(e) => setManualInstrument(e.target.value)}
              disabled={busy}
              style={{ ...inputStyle, width: '190px' }}
            >
              <option value="standalone">Standalone (new income)</option>
              {instruments.map((i) => (
                <option key={i.key} value={i.key}>
                  Billing of {i.label}
                </option>
              ))}
            </select>
            <input value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} placeholder="$" inputMode="decimal" style={{ ...inputStyle, width: '110px' }} />
            <button
              type="button"
              disabled={busy || !manualLabel.trim() || !manualAmount}
              style={secondaryButtonStyle}
              onClick={async () => {
                const chosen = instruments.find((i) => i.key === manualInstrument) ?? null;
                const ok = await run(
                  () =>
                    addFixedLine({
                      invoiceId: invoice.id,
                      description: manualLabel.trim(),
                      amount: Number(manualAmount),
                      category: manualCategory,
                      sourceEstimateId: chosen?.ref.estimate_id ?? null,
                      sourceChangeOrderId: chosen?.ref.change_order_id ?? null,
                    }).then(async (r) => (r.success ? recalculateInvoiceTotals(invoice.id, { instrumentTypes }) : r)),
                  'Line added.'
                );
                if (ok) {
                  setManualLabel('');
                  setManualAmount('');
                  setManualCategory('other');
                  setManualInstrument('standalone');
                }
              }}
            >
              Add line
            </button>
          </div>
          <p style={{ fontSize: '11px', color: color.faint, margin: '6px 0 0' }}>
            {manualInstrument === 'standalone'
              ? 'Standalone: nothing upstream to inherit from, so this posts to the project’s finances as NEW INCOME (§2). It disappears from there if this invoice is voided.'
              : 'A billing OF that instrument — not new income, and retained against that instrument’s own contract type (§5).'}
          </p>
        </div>
      )}
    </div>
  );
}

function TotalRow({ label, value, bold, muted, warn }: { label: string; value: number; bold?: boolean; muted?: boolean; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: bold ? '14px' : '13px', padding: '2px 0' }}>
      <span style={{ color: muted ? color.faint : warn ? color.warning : color.body, fontWeight: bold ? 700 : 400 }}>
        {label}
      </span>
      <span style={{ fontFamily: font.mono, fontWeight: bold ? 700 : 400, color: muted ? color.faint : warn ? color.warning : color.navy }}>
        {money(value)}
      </span>
    </div>
  );
}

// ── §8 discount + §4a/§4b/§3a credits ───────────────────────────────────────

// ── [S175 stage 5] Selections — bill the approved overage ───────────────────
//
// Spec §7.1: an invoice line with source_selection_id, line_type 'fixed',
// category 'allowance'. It ESCAPES the contract ceiling by construction (that
// trigger is scoped to source_estimate_id) and is capped by its own —
// enforce_selection_billing_ceiling(), at signed_variance. The remaining shown
// here is getSelectionBilling()'s READ of the same figure; the DB refuses the
// over-bill regardless of what this panel offers.
function SelectionsPanel({
  invoiceId,
  billing,
  instrumentTypes,
  busy,
  run,
}: {
  invoiceId: string;
  billing: SelectionBilling;
  instrumentTypes: InstrumentTypes;
  busy: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) => Promise<boolean>;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const fixed = billing.selections.filter((s) => s.kind === 'fixed_remaining');
  return (
    <div style={{ ...cardStyle, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <p style={{ ...h2Style, margin: 0 }}>Selections</p>
      <p style={{ fontSize: '12px', color: color.muted, margin: 0 }}>
        The client signed each of these; the added price bills against the selection itself, not
        the original contract, and cannot exceed what was signed.
      </p>
      {fixed.map((s) => {
        const remaining = s.remaining ?? 0;
        const raw = amounts[s.selectionId];
        const amount = raw === undefined || raw.trim() === '' ? remaining : Number(raw);
        return (
          <div key={s.selectionId} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: color.body, minWidth: '220px' }}>
              {s.name} — signed {money(s.signedVariance)}, {money(s.billed)} billed,{' '}
              <strong>{money(remaining)}</strong> remaining
            </span>
            <input
              value={raw ?? ''}
              onChange={(e) => setAmounts((prev) => ({ ...prev, [s.selectionId]: e.target.value }))}
              placeholder={remaining.toFixed(2)}
              inputMode="decimal"
              disabled={busy || remaining <= 0}
              style={{ ...inputStyle, width: '110px' }}
            />
            <button
              type="button"
              disabled={busy || remaining <= 0 || !(amount > 0)}
              style={secondaryButtonStyle}
              onClick={async () => {
                const ok = await run(
                  () =>
                    addFixedLine({
                      invoiceId,
                      description: `Selection — ${s.name}`,
                      amount,
                      category: 'allowance',
                      sourceSelectionId: s.selectionId,
                    }).then(async (r) => (r.success ? recalculateInvoiceTotals(invoiceId, { instrumentTypes }) : r)),
                  'Selection billed.'
                );
                if (ok) setAmounts((prev) => ({ ...prev, [s.selectionId]: '' }));
              }}
            >
              Bill selection
            </button>
          </div>
        );
      })}
    </div>
  );
}

function AdjustmentsPanel({
  invoice,
  credits,
  canApprove,
  instrumentTypes,
  busy,
  run,
}: {
  invoice: InvoiceWithLines;
  credits: AvailableCredit[];
  canApprove: boolean;
  instrumentTypes: InstrumentTypes;
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
                  async (r) => (r.success ? recalculateInvoiceTotals(invoice.id, { instrumentTypes }) : r)
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
                    : credit.kind === 'selection'
                      ? // §7.2 — sourced, so is_final is lifted; any invoice the user chooses.
                        addAllowanceCredit(invoice.id, credit.label, credit.amount, credit.selectionId as string)
                      : applyDepositCredit(
                        invoice.id,
                        credit.depositInvoiceId as string,
                        credit.amount,
                        totalBeforeCredit,
                        credit.label
                      )
                  ).then(async (r) => (r.success ? recalculateInvoiceTotals(invoice.id, { instrumentTypes }) : r)),
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
                    async (r) => (r.success ? recalculateInvoiceTotals(invoice.id, { instrumentTypes }) : r)
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
  mixedRetainage,
  instrumentTypes,
  busy,
  run,
}: {
  invoice: InvoiceWithLines;
  retainageAllowed: boolean;
  /** §5 — this invoice carries BOTH retainable and T&M money. */
  mixedRetainage: boolean;
  instrumentTypes: InstrumentTypes;
  busy: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) => Promise<boolean>;
}) {
  const [retainage, setRetainage] = useState(
    invoice.retainage_percent === null ? '' : String(invoice.retainage_percent)
  );
  // 7D open item #3, RULED S97: the user sets the due date; the default is DUE
  // ON RECEIPT, stored as NULL. An empty field therefore MEANS due on receipt —
  // it is not an unset state, and the caption below says so.
  const [dueDate, setDueDate] = useState(invoice.due_date ?? '');

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
                    instrumentTypes
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
        <span style={microLabelStyle}>Payment terms</span>
        <div style={{ marginTop: '4px', display: 'flex', gap: '6px' }}>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={busy}
            style={{ ...inputStyle, width: '150px' }}
          />
          <button
            type="button"
            disabled={busy}
            style={secondaryButtonStyle}
            onClick={() =>
              run(
                () =>
                  updateInvoiceSettings(
                    invoice.id,
                    { due_date: dueDate === '' ? null : dueDate },
                    instrumentTypes
                  ),
                dueDate === '' ? 'Terms set to due on receipt.' : 'Due date updated.'
              )
            }
          >
            Apply
          </button>
        </div>
        <div style={{ fontSize: '11px', color: color.faint, marginTop: '2px' }}>
          {dueDate === ''
            ? `${DUE_ON_RECEIPT_LABEL} — leave empty for the default. Frozen once sent.`
            : 'Clear the field to go back to due on receipt. Frozen once sent.'}
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
                    instrumentTypes
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
              () => updateInvoiceSettings(invoice.id, { is_final: e.target.checked }, instrumentTypes),
              'Updated.'
            )
          }
        />
        Final invoice
        <span style={{ fontSize: '11px', color: color.faint }}>(unlocks the §4b allowance credit)</span>
      </label>

      {mixedRetainage && (
        <span style={{ fontSize: '11px', color: color.warning }}>
          §5: retainage applies only to the non-T&amp;M lines on this invoice — T&amp;M money is
          never withheld against, even here.
        </span>
      )}
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
  voidState,
}: {
  invoice: InvoiceWithLines;
  role: string;
  memberId: string | null;
  canApprove: boolean;
  timeZone: string;
  busy: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>, msg?: string) => Promise<boolean>;
  projectId: string;
  voidState: { hasPayment: boolean; syncedToQuickBooks: boolean };
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState('');

  const isDraft = invoice.status === 'draft';
  const isPending = invoice.status === 'pending_approval';
  const isSent = invoice.status === 'sent' || invoice.status === 'paid';
  const isVoided = invoice.status === 'voided';

  // §13 — the non-email delivery path, which the Pre-M9 gate does NOT block
  // because nothing leaves the company. Print opens the PDF inline; Download
  // forces a save. A draft gets a clearly watermarked PREVIEW that is not
  // stored; a sent invoice's PDF is saved to the project (files.invoice_id).
  // No email and no pay link here — RESEND and 7G respectively.
  const pdfHref = `/api/invoices/${invoice.id}/pdf`;
  const pdfLinkStyle: React.CSSProperties = {
    ...secondaryButtonStyle,
    textDecoration: 'none',
    display: 'inline-block',
  };

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      <a href={pdfHref} target="_blank" rel="noopener noreferrer" style={pdfLinkStyle}>
        {isDraft || isPending ? 'Preview PDF (draft)' : 'Print'}
      </a>
      <a href={`${pdfHref}?download=1`} style={pdfLinkStyle}>
        Download PDF
      </a>

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
          onClick={async () => {
            if (!(await confirm('Issue this invoice WITHOUT emailing it? It will be numbered and frozen — corrections go through void and reissue. Use "Send to client" if you want it emailed.'))) return;
            run(() => markInvoiceSent(invoice.id, timeZone), 'Invoice issued. Nothing was emailed — print or download it to deliver.');
          }}
        >
          {/* §16 #18 — the PRINT path: issue without email. "Send to client" in
              the delivery panel is the email path and does both. Labelled so
              the two are not mistaken for the same button [S97]. */}
          Issue without emailing
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
                    // [S143] READ, not assumed. These were hardcoded `false`
                    // on the premise that 7E was not built; it shipped at S97.
                    hasPayment: voidState.hasPayment,
                    paymentSyncedToQuickBooks: voidState.syncedToQuickBooks,
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
