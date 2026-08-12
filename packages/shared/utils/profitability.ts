// Module 7H — job profitability. THE MATH, and only the math.
//
// docs/specs/7h1-spec.md §7H.2 (decisions), §7H.3 (per-job report), §7H.5
// (definitions). 7H owns no data and writes nothing: every figure here is
// assembled from numbers 7A, 7B, 7C, 7D and 7E already own.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE HOLDS NO PRICING ARITHMETIC
// ─────────────────────────────────────────────────────────────────────────────
// It would be one line to write `cost * (1 + markup / 100)` here. That line is
// the bug 7H's spec spends a paragraph warning about, and #129 is the precedent
// for why a second implementation which "does the same thing" IS the
// divergence rather than a copy of it.
//
// Sell is derived by `deriveCostLine` / `deriveLaborLines` in
// invoice-derivation.ts — the same functions that price a real invoice — and
// this file only ever RECEIVES their output. If a rate changes, an invoice and
// this report cannot disagree, because there is nothing here to disagree with.
//
// ─────────────────────────────────────────────────────────────────────────────
// AND WHY SELL ARRIVES PER INSTRUMENT
// ─────────────────────────────────────────────────────────────────────────────
// money-rep P4 puts contract type on the INSTRUMENT, and a project may hold a
// fixed-price estimate, a cost-plus CO and a T&M CO at once; P6 has signed COs
// writing their own budget lines. So one "material" row can span three
// differently priced instruments.
//
// `aggregateCategories` therefore takes rows that are ALREADY per instrument
// and sums them into categories. It is structurally incapable of applying one
// blanket markup to a category total — the shape of the input forbids it,
// which is a stronger guarantee than a comment asking the next reader not to.

export type ProfitCategory = 'labor' | 'material' | 'subcontractor' | 'other';

export const PROFIT_CATEGORIES: ProfitCategory[] = [
  'labor',
  'material',
  'subcontractor',
  'other',
];

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sum that keeps NULL meaning "not derivable" rather than collapsing to 0. */
function addNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return roundMoney((a ?? 0) + (b ?? 0));
}

// ─────────────────────────────────────────────────────────────────────────────
// One instrument's contribution to one category
// ─────────────────────────────────────────────────────────────────────────────

export interface InstrumentCategorySlice {
  /** Stable key of the instrument this slice came from (`est:…` / `co:…` /
   *  `adhoc`). Carried so a caller can explain a total, never used in math. */
  instrumentKey: string;
  category: ProfitCategory;
  /** Cost baseline for the category on this instrument. NULL = the reader may
   *  not see budgeted figures (project_budget_amounts is Owner/Admin). */
  budget: number | null;
  /** 7C derived remaining on this instrument's payable rows. */
  committed: number;
  /** 7A approved actual, cash basis, net of retainage. */
  actual: number;
  /**
   * Derived sell for this instrument's costs in this category, priced by
   * invoice-derivation.
   *
   * NULL is MEANINGFUL and is not zero. Three real cases produce it:
   *   - the instrument is FIXED PRICE, where cost carries no markup and sell
   *     is the contract, not a per-category derivation;
   *   - a required rate is not in force on the cost's own date, so nothing
   *     can honestly be quoted;
   *   - the cost is unattributable (see `unattributed` below).
   * A null must render as an em dash, never as $0.00.
   */
  sell: number | null;
}

export interface ProfitCategoryRow {
  category: ProfitCategory;
  budget: number | null;
  committed: number;
  actual: number;
  /** Budget − Actual − Committed. NULL when budget is. */
  remaining: number | null;
  sell: number | null;
  /** Sell − Actual. NULL when sell is — never "0 margin". */
  margin: number | null;
}

/**
 * Fold per-instrument slices into one row per category (§7H.2 #3: "derived per
 * instrument, then aggregated into the category — never computed as one
 * blanket cost × markup").
 */
export function aggregateCategories(
  slices: InstrumentCategorySlice[]
): ProfitCategoryRow[] {
  const byCategory = new Map<ProfitCategory, ProfitCategoryRow>();
  for (const category of PROFIT_CATEGORIES) {
    byCategory.set(category, {
      category,
      budget: null,
      committed: 0,
      actual: 0,
      remaining: null,
      sell: null,
      margin: null,
    });
  }

  for (const slice of slices) {
    const row = byCategory.get(slice.category);
    if (!row) continue;
    row.budget = addNullable(row.budget, slice.budget);
    row.committed = roundMoney(row.committed + slice.committed);
    row.actual = roundMoney(row.actual + slice.actual);
    row.sell = addNullable(row.sell, slice.sell);
  }

  for (const row of byCategory.values()) {
    row.remaining =
      row.budget === null ? null : roundMoney(row.budget - row.actual - row.committed);
    row.margin = row.sell === null ? null : roundMoney(row.sell - row.actual);
  }

  return PROFIT_CATEGORIES.map((c) => byCategory.get(c)!);
}

// ─────────────────────────────────────────────────────────────────────────────
// The job headline
// ─────────────────────────────────────────────────────────────────────────────

/** §7H.2 #1 / §7H.5 — which basis the profit figure is standing on. */
export type ProfitBasis = 'earned' | 'billed';

/**
 * Earned while the job runs, billed once it is complete.
 *
 * `projects.status` is the switch, and 'complete' is the only status that
 * flips it. 'archived' and 'cancelled' are deliberately NOT treated as
 * complete: a cancelled job's billed figure is not a final settlement of what
 * was earned, and presenting it as one would understate a loss.
 */
export function profitBasisFor(projectStatus: string): ProfitBasis {
  return projectStatus === 'complete' ? 'billed' : 'earned';
}

export interface HeadlineInput {
  /**
   * §7H.2 #1 — contract value for fixed-price instruments, 7D's derived
   * revenue for cost-plus and T&M, summed across a mixed project.
   * NULL when no instrument on the job can be priced (see `sell` above).
   */
  earned: number | null;
  /** 7D's BILLED amount, never the derived one — Σ non-voided invoices. */
  billed: number;
  /** 7A approved actual, cash basis, net of retainage. */
  actualCost: number;
  /** §8 discount lines — money forgiven, never billable and never backlog. */
  discounts: number;
  /** 7E Σ applications — money that has actually landed. */
  collected: number;
  projectStatus: string;
}

export interface ProfitHeadline {
  basis: ProfitBasis;
  earned: number | null;
  billed: number;
  actualCost: number;
  /**
   * Earned − Billed − discounts (§7H.3, redefined S97). Work earned but not
   * yet invoiced.
   *
   * MAY BE NEGATIVE, legitimately: a deposit on a cost-plus or T&M instrument
   * (7D §3a) bills ahead of earning by design, so backlog runs negative early
   * and unwinds as the credit draws down. Do not clamp it — a clamp would
   * hide the deposit rather than explain it.
   */
  backlog: number | null;
  /** Earned − Actual while active; Billed − Actual once complete. */
  profit: number | null;
  cash: { collected: number; spent: number; net: number };
}

export function computeHeadline(input: HeadlineInput): ProfitHeadline {
  const basis = profitBasisFor(input.projectStatus);

  const backlog =
    input.earned === null
      ? null
      : roundMoney(input.earned - input.billed - input.discounts);

  const profit =
    basis === 'billed'
      ? roundMoney(input.billed - input.actualCost)
      : input.earned === null
        ? null
        : roundMoney(input.earned - input.actualCost);

  return {
    basis,
    earned: input.earned,
    billed: input.billed,
    actualCost: input.actualCost,
    backlog,
    profit,
    cash: {
      collected: input.collected,
      spent: input.actualCost,
      net: roundMoney(input.collected - input.actualCost),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Caveats — the report says what it cannot know
// ─────────────────────────────────────────────────────────────────────────────
//
// Every one of these is a place where a number would otherwise look complete
// and be quietly wrong. They are part of the report, not developer notes: a
// figure nobody checks because it renders cleanly is the failure mode 7H is
// most exposed to.

export type ProfitCaveatCode =
  /** Unbilled hours were attributed to the originating estimate because
   *  nothing in the schema ties an hour to an instrument [ruling B1, S140]. */
  | 'labor_instrument_assumed'
  /** Costs sit on miscellaneous or source-less budget lines: real actual
   *  cost, no instrument, therefore no sell and no margin [ruling B2]. */
  | 'unattributed_costs'
  /** The Owner's own sessions are written status = NULL by Module 6, so their
   *  hours are not 'approved' and never reach labor [ruling B3]. */
  | 'owner_hours_unapproved'
  /** A rate required to price a cost is not in force on that cost's date. */
  | 'rate_missing'
  /** The earned→billed switch has just moved the profit figure (§7H.2 #1). */
  | 'basis_switched';

export interface ProfitCaveat {
  code: ProfitCaveatCode;
  /** Plain-language sentence rendered in the report. */
  message: string;
  /** How much money or how many rows the caveat covers, when countable. */
  amount?: number;
  count?: number;
}

export function caveatMessage(
  code: ProfitCaveatCode,
  detail: { amount?: number; count?: number } = {}
): string {
  const money = (n: number) =>
    `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  switch (code) {
    case 'labor_instrument_assumed':
      return (
        'Labor revenue assumes unbilled hours belong to the original contract. ' +
        'Hours are not tied to a change order anywhere in the data, so on a job ' +
        'with more than one non-fixed instrument this is an assumption, not a ' +
        'derivation.'
      );
    case 'unattributed_costs':
      return (
        `${detail.count ?? 0} cost${detail.count === 1 ? '' : 's'} totalling ` +
        `${money(detail.amount ?? 0)} are not tied to a contract line, so they ` +
        'have no sell price and no margin. They are counted in actual cost.'
      );
    case 'owner_hours_unapproved':
      return (
        `${detail.count ?? 0} owner time session${detail.count === 1 ? '' : 's'} ` +
        'on this job are not approved, so their hours are excluded from labor ' +
        'cost and labor revenue. Both figures understate until they are approved.'
      );
    case 'rate_missing':
      return (
        'Some costs could not be priced — no rate was in force on the date they ' +
        'were incurred. Their revenue and margin show as —, never as zero.'
      );
    case 'basis_switched':
      return (
        'This job is complete, so profit is now billed minus actual cost rather ' +
        'than earned minus actual cost. Any discount given reduces profit at ' +
        'this point, because earned counted the full value and billed does not.'
      );
  }
}
