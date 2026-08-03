// Module 7D1 — invoice derivation math (docs/specs/7d1-spec.md §6, §7, §8, §5, §2).
//
// PURE FUNCTIONS ONLY — no supabase, no dates from the clock, no I/O. The
// service layer feeds these the rows it has read and persists what comes back.
// Every figure in §15's acceptance traces (A, B, C, C-1, D, E, G) is produced
// by the functions here and asserted in invoice-derivation.test.ts.
//
// What this file does NOT do, deliberately:
//   * It does not select rates. `rateInForce` (instrument-rates-shared.ts) is
//     THE selector — 7D consumes it and must never restate it (§S S.4). The
//     caller resolves each row's rate and passes it in.
//   * It does not decide WHICH costs or hours are billed. The user ticks them
//     (§6.2 / §7.2 D2); the caller passes the selected set.
//   * It never touches burden. The 7A burden multiplier is cost-side only and
//     never reaches a client bill (§6.4) — nothing here multiplies by it.
//
// ROUNDING — the §8 [VERIFY — CC] question, settled deliberately:
// money rounds with roundMoney PER ROW, not per invoice. §8 and §15-B both
// state "applied per row", and §15-B's real figures are identical either way
// so the trace could not settle it. Per-row is chosen because a client-visible
// line must show the amount it was actually billed at, and a sum of displayed
// lines must equal the displayed total — per-invoice rounding can break that
// by a cent. Asserted in the test suite.

import { roundMoney } from './estimate-totals';

export type CostCategory = 'material' | 'subcontractor' | 'other';
export type RowCategory = CostCategory | 'labor';

/** §11 — chosen per invoice; all three levels are built. */
export type PresentationLevel = 'full_detail' | 'by_section' | 'lump_sum';

export type InvoiceLineType =
  | 'derived_cost'
  | 'derived_labor'
  | 'fixed'
  | 'discount'
  | 'credit_negative_co'
  | 'credit_allowance'
  | 'credit_deposit';

// ── Non-labor: cost × (1 + that category's markup in force at its OWN date) ──

/** One selected, approved cost the user ticked (§6.2). `markupPercent` is the
 *  rate in force for THIS row's category on THIS row's incurred date — the
 *  caller resolves it via rateInForce(rates, `cost_plus_<category>_percent`,
 *  expense_date); on a T&M instrument every non-labor row resolves through the
 *  single `tm_nonlabor_percent` instead (§7). */
export interface SelectedCost {
  allocationId: string;
  description: string;
  category: CostCategory;
  /** Stored tax-INCLUSIVE per money-rep P3 (§6.3 collapses to tax-inclusive —
   *  expenses carry no recoverable tax split). Never burdened (§6.4). */
  cost: number;
  incurredDate: string; // YYYY-MM-DD — expenses.expense_date
  markupPercent: number;
  /** instrument_rates.id — the rate ROW's identity, mandatory per §8 so §10
   *  can find the invoices priced under a rate that is later superseded. */
  rateRowId: string;
}

export interface DerivedCostLine {
  lineType: 'derived_cost';
  description: string;
  category: CostCategory;
  costBasis: number;
  markupPercent: number;
  rateRowId: string;
  amount: number;
  allocationId: string;
}

// ── §6.2 partial billing — how much of a cost this invoice claims [S97] ─────
//
// Josh's ruling: a percentage applies across an instrument's unbilled approved
// costs; each ticked line bills that percentage OF ITS COST; the remainder
// stays available for a later invoice. A lower per-line dollar amount means
// BILLING LESS OF THAT COST — a claim reduction, never a discount (§8 keeps the
// discount line for money actually given up).

/** A cent, as the smallest amount that can be billed or left behind. */
const ONE_CENT = 0.01;

/**
 * The amount of an allocation's REMAINING cost that a claim at `percent` takes.
 *
 * THE LAST CLAIM BILLS THE EXACT REMAINDER, not a recomputed percentage. This
 * is trace G rule (b) — already ruled for draws, reused here rather than
 * invented: multiplying and rounding each part independently leaves a residue
 * that can never be billed (the draws case summed two cents over $14,413.75).
 * Applied here it means partials always SUM TO THE WHOLE with nothing stranded:
 *
 *   $1,000.00 at 33%  →  330.00, remaining 670.00
 *              at 33%  →  221.10, remaining 448.90
 *              at 100% →  448.90  ← exact remainder, not 448.90 recomputed
 *
 * and any claim that would leave less than a cent behind absorbs it instead.
 *
 * `remaining` is DERIVED by the caller (allocation amount − Σ live claims); it
 * is never stored. The DB trigger invoice_cost_claims_within_allocation is the
 * backstop that makes over-claiming impossible even if a caller gets this
 * wrong — this function decides the amount, the trigger enforces the ceiling.
 */
export function partialClaimAmount(remaining: number, percent: number): number {
  const left = roundMoney(remaining);
  if (left <= 0 || !(percent > 0)) return 0;
  if (percent >= 100) return left;

  const take = roundMoney(left * (percent / 100));
  // Never leave a sub-cent residue that could never be claimed later.
  if (roundMoney(left - take) < ONE_CENT) return left;
  return take;
}

/**
 * A per-line DOLLAR edit, expressed as the claim it implies (§8 as amended).
 *
 * The client types a billed amount; what actually changes is HOW MUCH OF THE
 * COST is being billed. The markup rate is fixed by the cost's own incurred
 * date, so the new cost basis is simply the new billed amount scaled back
 * through the same rate:
 *
 *   newCostBasis = currentCostBasis × (newBilled ÷ currentDerived)
 *
 * Returns null when the line carries no derived amount to scale from — a manual
 * or credit line, where the old billed-only behavior still applies.
 */
export function claimForBilledAmount(
  currentCostBasis: number,
  currentDerivedAmount: number,
  newBilledAmount: number
): number | null {
  if (!(currentDerivedAmount > 0) || !(currentCostBasis > 0)) return null;
  if (!(newBilledAmount > 0)) return 0;
  return roundMoney(currentCostBasis * (newBilledAmount / currentDerivedAmount));
}

/** non-labor sell = cost × (1 + markup-in-force-at-expense_date)  (§6.1/§7).
 *
 *  Under partial billing `cost` is the CLAIMED PORTION, not the whole
 *  allocation — which is why this function needed no change: the markup applies
 *  to whatever portion is being billed, at that cost's own rate. The rate is
 *  fixed by the cost's INCURRED date, which does not move, so two partials of
 *  the same cost taken months apart price identically. */
export function deriveCostLine(cost: SelectedCost): DerivedCostLine {
  return {
    lineType: 'derived_cost',
    description: cost.description,
    category: cost.category,
    costBasis: roundMoney(cost.cost),
    markupPercent: cost.markupPercent,
    rateRowId: cost.rateRowId,
    amount: roundMoney(cost.cost * (1 + cost.markupPercent / 100)),
    allocationId: cost.allocationId,
  };
}

// ── Labor: billable hours × the flat rate, per person per day (§7.2) ─────────

/** One selected time segment the user ticked (§7.2). Approval is checked by
 *  the caller (eligibility); selection is what puts it here. */
export interface SelectedSegment {
  segmentId: string;
  memberId: string;
  /** The segment's company-timezone calendar day — the rounding group. */
  workDate: string; // YYYY-MM-DD
  rawHours: number;
  /** Task is CONTEXT for the user's choice, never a filter — an hour with no
   *  task is fully billable (§7.2). Carried only for display. */
  taskId?: string | null;
}

/**
 * §7.2 — round a person's day UP to the half hour. ONE rounding per person
 * per day, never per segment: 3h10m + 4h05m = 7h15m → 7.5, whereas rounding
 * each segment would give 3.5 + 4.5 = 8.0 (trace C-1).
 *
 * Uses an epsilon before ceil so binary float noise cannot round a clean
 * boundary up a whole half hour — 7.5 hours stored as 7.500000000000001 must
 * bill 7.5, not 8.0.
 */
export function roundUpToHalfHour(hours: number): number {
  if (hours <= 0) return 0;
  const halves = hours * 2;
  const EPSILON = 1e-9;
  return Math.ceil(halves - EPSILON) / 2;
}

export interface DayGroup {
  memberId: string;
  workDate: string;
  rawHours: number;
  billableHours: number;
  segmentIds: string[];
}

/**
 * Group selected segments per person per day and round each group (§7.2).
 * This is the ONLY place the rounding rule lives. The result is re-derivable
 * from the stored hour claims, which is why the claim rows record
 * (member_id, work_date, raw_hours) per segment.
 */
export function groupSelectedHours(segments: SelectedSegment[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const seg of segments) {
    const key = `${seg.memberId}|${seg.workDate}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rawHours += seg.rawHours;
      existing.segmentIds.push(seg.segmentId);
    } else {
      groups.set(key, {
        memberId: seg.memberId,
        workDate: seg.workDate,
        rawHours: seg.rawHours,
        billableHours: 0,
        segmentIds: [seg.segmentId],
      });
    }
  }
  const out = [...groups.values()];
  for (const g of out) {
    g.rawHours = Math.round(g.rawHours * 10000) / 10000;
    g.billableHours = roundUpToHalfHour(g.rawHours);
  }
  // Stable order: person, then day — so lines and claims are deterministic.
  out.sort((a, b) => a.memberId.localeCompare(b.memberId) || a.workDate.localeCompare(b.workDate));
  return out;
}

export interface DerivedLaborLine {
  lineType: 'derived_labor';
  description: string;
  category: 'labor';
  quantity: number;
  unitRate: number;
  rateRowId: string;
  amount: number;
  /** Which day groups (and therefore which segments) this line bills. */
  groups: DayGroup[];
}

/** A day group plus the labor rate in force ON THAT WORKED DATE (§6.1/§7). */
export interface RatedDayGroup {
  group: DayGroup;
  hourlyRate: number;
  rateRowId: string;
}

/**
 * §11 layout A renders labor as "42 hrs @ $100/hr" — one line per RATE, not
 * one per person or per day. Groups sharing a rate row merge into a single
 * line whose quantity is the sum of the ALREADY-ROUNDED daily hours (rounding
 * happens per person per day and is never re-applied to the sum).
 *
 * labor sell = billable hours × labor-rate-in-force-at-the-worked-date.
 */
export function deriveLaborLines(rated: RatedDayGroup[]): DerivedLaborLine[] {
  const byRate = new Map<string, RatedDayGroup[]>();
  for (const r of rated) {
    const list = byRate.get(r.rateRowId) ?? [];
    list.push(r);
    byRate.set(r.rateRowId, list);
  }

  const lines: DerivedLaborLine[] = [];
  for (const [rateRowId, members] of byRate) {
    const hours = members.reduce((sum, m) => sum + m.group.billableHours, 0);
    const rate = members[0].hourlyRate;
    const quantity = Math.round(hours * 100) / 100;
    lines.push({
      lineType: 'derived_labor',
      description: `Labor — ${formatHours(quantity)} hrs @ ${formatRate(rate)}/hr`,
      category: 'labor',
      quantity,
      unitRate: rate,
      rateRowId,
      amount: roundMoney(quantity * rate),
      groups: members.map((m) => m.group),
    });
  }
  return lines;
}

function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/\.?0+$/, '');
}

function formatRate(r: number): string {
  return `$${Number.isInteger(r) ? r : r.toFixed(2)}`;
}

// ── Invoice assembly (§8, §5, §3a) ──────────────────────────────────────────

/** A line as the totals math sees it. `amount` is SIGNED — every discount and
 *  credit is negative (§8, §4a as amended). */
export interface InvoiceLineAmount {
  lineType: InvoiceLineType;
  /** What the system computed. Absent on manual/fixed lines. */
  derivedAmount?: number | null;
  /** What the client is actually charged. 7G exports and 7H reports THIS. */
  billedAmount: number;
  /**
   * §5 PER LINE [S97] — may THIS line's money be retained against?
   *
   * Retainage used to be decided once for the whole invoice off one contract
   * type. That was only safe while an invoice could carry exactly one
   * instrument. Now that §2/acceptance #2 is real, a fixed-price contract draw
   * and a T&M change order can share an invoice — and §5 says retainage is
   * NEVER applied to T&M money. Deciding once would withhold against the T&M
   * portion and look like it was working.
   *
   * Undefined means eligible, so every pre-existing caller keeps its behavior.
   */
  retainageEligible?: boolean;
}

export interface InvoiceTotals {
  /** Σ derived amounts — what the system computed (§8). */
  derivedTotal: number;
  /** Σ billed amounts incl. negative discount/credit lines (§8). */
  billedTotal: number;
  /** §5 — withheld, shown separately, OUTSIDE the aging buckets. */
  retainageWithheld: number;
  /** §5 — what the client owes NOW; the only figure that ages in 7E. */
  amountReceivable: number;
  /**
   * §5 [S97] — the positive billed work retainage was actually computed on,
   * i.e. EXCLUDING every line whose instrument is ineligible. Returned so the
   * split is inspectable: on a mixed invoice this is strictly less than the
   * positive billed total, and that difference is the T&M money §5 protects.
   */
  retainageBase: number;
}

export interface RetainagePolicy {
  /** Project default, editable per invoice (§5). */
  percent: number | null | undefined;
  /**
   * INVOICE-LEVEL veto (§5): a DEPOSIT invoice withholds nothing at all,
   * whatever its lines say. The T&M half of §5 moved to the LINE — see
   * InvoiceLineAmount.retainageEligible — because it is a property of the
   * instrument, and one invoice can now carry several.
   */
  eligible: boolean;
}

/**
 * §5/§8 — invoice totals.
 *
 * Retainage is computed on the POSITIVE, RETAINAGE-ELIGIBLE billed work only:
 *
 *   - POSITIVE, because withholding a percentage of a credit line would hand
 *     the client back less than the credit is worth.
 *   - ELIGIBLE, because §5 forbids retainage on T&M money and an invoice may
 *     now mix instruments (§2 / acceptance #2). A fixed-price draw beside a
 *     T&M change order withholds against the draw and NOT against the T&M.
 *
 * Trace A (single fixed-price instrument): $18,000 at 10% → $1,800 withheld,
 * $16,200 receivable — unchanged, because every line is eligible there.
 */
export function computeInvoiceTotals(
  lines: InvoiceLineAmount[],
  retainage: RetainagePolicy
): InvoiceTotals {
  const derivedTotal = roundMoney(
    lines.reduce((sum, l) => sum + (l.derivedAmount ?? 0), 0)
  );
  const billedTotal = roundMoney(lines.reduce((sum, l) => sum + l.billedAmount, 0));

  const retainageBase = roundMoney(
    lines.reduce(
      (sum, l) =>
        l.billedAmount > 0 && l.retainageEligible !== false ? sum + l.billedAmount : sum,
      0
    )
  );

  const pct = retainage.eligible ? retainage.percent ?? 0 : 0;
  const retainageWithheld = roundMoney(retainageBase * (pct / 100));

  return {
    derivedTotal,
    billedTotal,
    retainageWithheld,
    amountReceivable: roundMoney(billedTotal - retainageWithheld),
    retainageBase,
  };
}

// ── Deposit credit balance (§3a) ────────────────────────────────────────────

export interface DepositBalance {
  depositInvoiceId: string;
  /** The deposit invoice's billed total. */
  original: number;
  /** Σ of credit_deposit lines already drawn against it (positive number). */
  applied: number;
  remaining: number;
}

export function depositRemaining(original: number, applied: number): DepositBalance['remaining'] {
  return roundMoney(Math.max(0, original - applied));
}

/**
 * §3a — apply a job's deposit credit balance to a derived invoice. The client
 * always sees the work IN FULL, then the deposit as its own credit line, up to
 * the invoice total — never hidden netting. A smaller invoice settles to zero
 * and the leftover carries forward.
 *
 * Returns the SIGNED credit line amount (negative), or null when there is
 * nothing to apply.
 */
export function computeDepositCreditLine(
  invoiceTotalBeforeCredit: number,
  remainingCredit: number
): number | null {
  if (remainingCredit <= 0 || invoiceTotalBeforeCredit <= 0) return null;
  const applied = Math.min(remainingCredit, invoiceTotalBeforeCredit);
  return -roundMoney(applied);
}

// ── Fixed-price draws (§2, trace G) ─────────────────────────────────────────

export interface DrawInput {
  label: string;
  /** Percentage of the ORIGINAL contract value (rule a). */
  percent?: number | null;
  /** An edited fixed amount instead of a percentage. */
  fixedAmount?: number | null;
  /** Rule b — the FINAL draw bills the REMAINDER, never a fresh percentage. */
  isFinal?: boolean;
}

/**
 * §2 (R2, trace G) — price one draw.
 *
 * Rule (a): a percentage draw is a percentage of the ORIGINAL contract value.
 * A signed CO NEVER re-prices the original contract's draws — a CO bills
 * separately on its own terms (§4, P4). The caller therefore passes
 * `projects.contract_value`, never the 7B revised figure.
 *
 * Rule (b): the FINAL draw is the REMAINDER — contract less everything already
 * billed — not a fresh percentage. Multiplying and rounding each draw
 * independently sums to $14,413.77 on trace G's contract, two cents OVER; the
 * remainder rule makes the schedule sum exactly.
 */
export function computeDrawAmount(
  draw: DrawInput,
  originalContractValue: number,
  alreadyBilled: number
): number {
  if (draw.isFinal) {
    return roundMoney(originalContractValue - alreadyBilled);
  }
  if (draw.fixedAmount != null) {
    return roundMoney(draw.fixedAmount);
  }
  return roundMoney(originalContractValue * ((draw.percent ?? 0) / 100));
}

/** Whole-schedule helper — each draw sees what the ones before it billed. */
export function computeDrawSchedule(
  draws: DrawInput[],
  originalContractValue: number
): Array<{ label: string; amount: number }> {
  const out: Array<{ label: string; amount: number }> = [];
  let billed = 0;
  for (const draw of draws) {
    const amount = computeDrawAmount(draw, originalContractValue, billed);
    billed = roundMoney(billed + amount);
    out.push({ label: draw.label, amount });
  }
  return out;
}

// ── §11 presentation ────────────────────────────────────────────────────────

export interface PresentationLine {
  description: string;
  category: RowCategory | null;
  costBasis: number | null;
  amount: number;
  lineType: InvoiceLineType;
  /** §11 [S97] — which instrument this line bills against, and what to call it.
   *  Omitted collapses to a single unnamed group, i.e. exactly the pre-S97
   *  single-instrument layout. */
  instrumentKey?: string;
  instrumentLabel?: string;
}

/**
 * §11 layout A, PER INSTRUMENT [S97 ruling].
 *
 * Two instruments with different markup rates cannot honestly share one markup
 * line — a single "Markup $X" over a 20% CO and a 12% contract states a rate
 * that applied to neither. So full detail groups by instrument, each group
 * carrying its own subtotal and markup, and labor stays outside the block
 * within its group (the R3 ruling, unchanged).
 */
export interface PresentedGroup {
  key: string;
  label: string;
  laborLines: PresentationLine[];
  nonLaborLines: PresentationLine[];
  nonLaborSubtotal: number;
  nonLaborMarkup: number;
  /** This instrument's work only — adjustments are invoice-level. */
  total: number;
}

export interface PresentedInvoice {
  level: PresentationLevel;
  /** Labor lines — OUTSIDE the subtotal/markup block on cost-plus and T&M. */
  laborLines: PresentationLine[];
  /** Non-labor rows shown at ACTUAL, UNBURDENED cost (§6.4, §11 layout A). */
  nonLaborLines: PresentationLine[];
  /** Credit and discount lines, always shown in full — never netted away.
   *  INVOICE-level: a discount is not an instrument's work, so it is never
   *  pushed into a per-instrument group. */
  adjustmentLines: PresentationLine[];
  /** Non-labor cost subtotal (layout A), whole invoice. */
  nonLaborSubtotal: number;
  /** Markup on non-labor only (layout A), whole invoice. */
  nonLaborMarkup: number;
  total: number;
  /** By-section rollup — labor / materials / subs / other. Deliberately
   *  CATEGORY-only and NOT split by instrument: a section total exposes no
   *  cost and no markup, so nothing about it can misstate a rate. */
  sections: Array<{ label: string; amount: number }>;
  /** §11 full detail [S97]. One entry per instrument, in line order. A
   *  single-instrument invoice yields exactly one group. */
  groups: PresentedGroup[];
}

const SECTION_LABEL: Record<RowCategory, string> = {
  labor: 'Labor',
  material: 'Materials',
  subcontractor: 'Subcontractors',
  other: 'Other',
};

/**
 * §11 — build the three presentation levels from the same lines.
 *
 * Layout A (full detail), per the S97 R3 ruling: labor gets its OWN line as
 * hours @ rate OUTSIDE the block; Subtotal and Markup cover NON-LABOR ONLY;
 * TOTAL sums both. The cost column shown to the client is unburdened (§6.4).
 */
export function presentInvoice(
  lines: PresentationLine[],
  level: PresentationLevel
): PresentedInvoice {
  const laborLines = lines.filter((l) => l.lineType === 'derived_labor');
  const adjustmentLines = lines.filter((l) =>
    ['discount', 'credit_negative_co', 'credit_allowance', 'credit_deposit'].includes(l.lineType)
  );
  const nonLaborLines = lines.filter(
    (l) => !laborLines.includes(l) && !adjustmentLines.includes(l)
  );

  const nonLaborSubtotal = roundMoney(
    nonLaborLines.reduce((sum, l) => sum + (l.costBasis ?? l.amount), 0)
  );
  const nonLaborSell = roundMoney(nonLaborLines.reduce((sum, l) => sum + l.amount, 0));
  const nonLaborMarkup = roundMoney(nonLaborSell - nonLaborSubtotal);
  const total = roundMoney(lines.reduce((sum, l) => sum + l.amount, 0));

  const sectionTotals = new Map<RowCategory, number>();
  for (const l of lines) {
    if (!l.category) continue;
    sectionTotals.set(l.category, roundMoney((sectionTotals.get(l.category) ?? 0) + l.amount));
  }
  const sections = (['labor', 'material', 'subcontractor', 'other'] as RowCategory[])
    .filter((c) => sectionTotals.has(c))
    .map((c) => ({ label: SECTION_LABEL[c], amount: sectionTotals.get(c) as number }));

  // Per-instrument grouping for full detail. Order is FIRST APPEARANCE, which
  // is sort_order, which derivation writes continuously per selection — so the
  // groups come out in the order the instruments were billed.
  const groupOrder: string[] = [];
  const grouped = new Map<string, { label: string; lines: PresentationLine[] }>();
  for (const l of laborLines.concat(nonLaborLines)) {
    const key = l.instrumentKey ?? '';
    if (!grouped.has(key)) {
      grouped.set(key, { label: l.instrumentLabel ?? '', lines: [] });
      groupOrder.push(key);
    }
    grouped.get(key)!.lines.push(l);
  }
  const groups: PresentedGroup[] = groupOrder.map((key) => {
    const { label, lines: own } = grouped.get(key)!;
    const gLabor = own.filter((l) => l.lineType === 'derived_labor');
    const gNonLabor = own.filter((l) => l.lineType !== 'derived_labor');
    const gSubtotal = roundMoney(
      gNonLabor.reduce((sum, l) => sum + (l.costBasis ?? l.amount), 0)
    );
    const gSell = roundMoney(gNonLabor.reduce((sum, l) => sum + l.amount, 0));
    return {
      key,
      label,
      laborLines: gLabor,
      nonLaborLines: gNonLabor,
      nonLaborSubtotal: gSubtotal,
      nonLaborMarkup: roundMoney(gSell - gSubtotal),
      total: roundMoney(own.reduce((sum, l) => sum + l.amount, 0)),
    };
  });

  return {
    level,
    laborLines,
    nonLaborLines,
    adjustmentLines,
    nonLaborSubtotal,
    nonLaborMarkup,
    total,
    sections,
    groups,
  };
}
