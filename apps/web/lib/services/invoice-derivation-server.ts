import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deriveCostLine,
  deriveLaborLines,
  groupSelectedHours,
  partialClaimAmount,
  type RatedDayGroup,
  type SelectedCost,
  type SelectedSegment,
} from '@framefocus/shared/utils/invoice-derivation';
import {
  laborRateType,
  nonLaborRateType,
  rateRowInForce,
} from '@/lib/services/invoices-shared';
import type { ContractType, InstrumentRef, RateRow } from '@/lib/services/invoices-shared';

// Module 7D1 — PRIVILEGED server-side derivation (RULING B, S97 2026-08-02).
//
// WHY THIS EXISTS. RULING A puts an Owner/Admin floor on instrument_rates
// reads. Derivation needs those rates; a PM must keep full invoicing (7D §12a).
// Both hold only if the pricing happens somewhere the rates ARE readable and
// the rate values never travel back to the caller. That is this module: it runs
// with the SERVICE ROLE, reads the rates itself, and returns lines and totals.
//
// NOTHING HERE RETURNS A RATE. Not the rows, not a rate value, not a unit_rate
// a caller could read back off the response. The derived lines are persisted to
// invoice_lines (where the Owner/Admin-gated surfaces read them as before) and
// the caller gets only a success flag. `instrument_rate_id` is written to the
// line for the §10 supersede trace, exactly as the previous path did.
//
// THE PRIVILEGE IS THE POINT AND THE DANGER. The service role bypasses RLS
// entirely — the same trap as record_client_payment (S97 isolation proof #12):
// a SECURITY DEFINER-equivalent path is protected ONLY by the checks it makes
// itself. The caller-facing route does company + role + project scoping before
// this function is ever reached; do not call it from anywhere that skips them.
//
// THE MATH IS NOT RESTATED. deriveCostLine / groupSelectedHours /
// deriveLaborLines come from packages/shared, and rate selection is
// invoices-shared's rateRowInForce — the same functions the previous
// caller-side path used, so the figures are identical by construction rather
// than by coincidence. §15-B and §15-C are asserted against this path in the
// live harness.

export class MissingRateError extends Error {
  constructor(readonly rateType: string, readonly onDate: string) {
    super(
      `No ${rateType.replace(/_/g, ' ')} in force on ${onDate} — set the rate on the instrument before billing.`
    );
    this.name = 'MissingRateError';
  }
}

/** One instrument's contribution to an invoice (§2 — an invoice may pull from
 *  the estimate AND several COs at once). */
export interface DeriveSelection {
  instrument: InstrumentRef;
  contractType: ContractType;
  selectedCosts: Array<{
    allocationId: string;
    description: string;
    category: 'material' | 'subcontractor' | 'other';
    amount: number;
    expenseDate: string;
  }>;
  selectedHours: SelectedSegment[];
  /**
   * §6.2 partial billing [S97] — what percentage of each ticked cost's
   * REMAINING amount this invoice bills. Lives per instrument because the
   * percentage differs per instrument (Josh's example: draw #2 of the contract
   * plus 50% of CO-106-02). Absent or >= 100 bills the whole remainder.
   *
   * HOURS ARE NOT AFFECTED. §7.2 rounds each person-day UP to the half hour,
   * so a partial hour claim over-bills; hours stay all-or-nothing per
   * person-day and this percentage never touches them.
   */
  billPercent?: number;
}

export interface DeriveServerInput {
  invoiceId: string;
  /**
   * §2 / acceptance #2 [S97] — ONE ENTRY PER INSTRUMENT. This was a singular
   * `instrument` + `contractType`, which is what made acceptance #2 ("a single
   * invoice can pull from the estimate AND ≥2 COs at once") structurally
   * impossible rather than merely unexposed.
   *
   * Each selection carries its OWN contract type, so each prices through its
   * own rate types — a cost-plus contract and a T&M change order on one invoice
   * each bill at their own instrument's rate in force on their own dates.
   */
  selections: DeriveSelection[];
}

/**
 * Rate rows for the instrument, read with the PRIVILEGED client so the
 * Owner/Admin floor does not apply. These rows never leave this module.
 */
async function loadRatesPrivileged(
  admin: SupabaseClient,
  instrument: InstrumentRef
): Promise<RateRow[]> {
  let query = admin
    .from('instrument_rates')
    .select('id, rate_type, rate, effective_from, superseded_at');
  query = instrument.estimate_id
    ? query.eq('estimate_id', instrument.estimate_id)
    : query.eq('change_order_id', instrument.change_order_id as string);
  const { data } = await query;
  return (data ?? []) as RateRow[];
}

/**
 * §6.2 [S97] — REMAINING UNBILLED per allocation, DERIVED and never stored:
 *
 *     remaining = expense_allocations.amount − Σ (live claims)
 *
 * No column on expense_allocations and no is_billed flag: a stored figure would
 * need its own sync trigger and would drift, and deriving it makes VOID-RESTORE
 * free — claims already CASCADE from the invoice, so voiding hands the
 * remainder straight back with no compensating write.
 *
 * `excludeInvoiceId` drops the caller's own claims, so a re-derive replaces
 * this invoice's claim instead of stacking on top of it.
 */
async function loadRemaining(
  admin: SupabaseClient,
  excludeInvoiceId: string,
  allocationIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (allocationIds.length === 0) return out;

  const { data: allocations } = await admin
    .from('expense_allocations')
    .select('id, amount')
    .in('id', allocationIds);
  for (const a of allocations ?? []) out.set(a.id, Number(a.amount));

  const { data: claims } = await admin
    .from('invoice_cost_claims')
    .select('expense_allocation_id, claimed_amount, invoice_id')
    .in('expense_allocation_id', allocationIds);
  for (const c of claims ?? []) {
    if (c.invoice_id === excludeInvoiceId) continue;
    const left = out.get(c.expense_allocation_id);
    if (left === undefined) continue;
    out.set(
      c.expense_allocation_id,
      Math.round((left - Number(c.claimed_amount)) * 100) / 100
    );
  }
  return out;
}

/** Everything one selection produced, priced but not yet written. */
interface PricedSelection {
  selection: DeriveSelection;
  costLines: ReturnType<typeof deriveCostLine>[];
  laborLines: ReturnType<typeof deriveLaborLines>;
}

/**
 * PRICE one instrument's selection. Reads that instrument's OWN rate rows, so
 * every line prices through its own instrument's rates — the whole point of
 * §2 being real. Writes nothing.
 */
async function priceSelection(
  admin: SupabaseClient,
  invoiceId: string,
  selection: DeriveSelection
): Promise<{ priced?: PricedSelection; error?: string }> {
  const rateRows = await loadRatesPrivileged(admin, selection.instrument);

  // §6.2 [S97] — how much of each ticked cost is still unbilled. Computed HERE,
  // from the authoritative rows, never taken from the caller: the amount the
  // browser last saw can be stale, and the ceiling on a claim is a money rule.
  //
  // Claims belonging to THIS invoice are excluded, because step 2 is about to
  // delete them — a re-derive REPLACES this invoice's own claim rather than
  // stacking on it. (This is also why remaining can be computed before the
  // destructive clear, which keeps the price-first ordering intact.)
  const remainingByAllocation = await loadRemaining(
    admin,
    invoiceId,
    selection.selectedCosts.map((c) => c.allocationId)
  );

  // Costs. A missing rate for a category actually in use is a hard stop —
  // never price at 0% (§6.1).
  const costLines: ReturnType<typeof deriveCostLine>[] = [];
  for (const cost of selection.selectedCosts) {
    const rateType = nonLaborRateType(selection.contractType, cost.category);
    const row = rateRowInForce(rateRows, rateType, cost.expenseDate);
    if (!row) return { error: new MissingRateError(rateType, cost.expenseDate).message };

    // The portion this invoice bills. The markup then applies to THAT portion,
    // at this cost's own rate in force on its own incurred date — which does
    // not move, so partials taken months apart price identically.
    const remaining = remainingByAllocation.get(cost.allocationId) ?? 0;
    const claimed = partialClaimAmount(remaining, selection.billPercent ?? 100);
    // Fully billed already, or a percentage that rounds to nothing: write no
    // line and no claim rather than a zero-value one (the trigger rejects a
    // non-positive claim, and a $0 line on a client's bill is noise).
    if (claimed <= 0) continue;

    const selected: SelectedCost = {
      allocationId: cost.allocationId,
      description: cost.description,
      category: cost.category,
      cost: claimed,
      incurredDate: cost.expenseDate,
      markupPercent: row.rate,
      rateRowId: row.id,
    };
    costLines.push(deriveCostLine(selected));
  }

  // Hours: group per person per day, round each group UP to the half hour
  // (§7.2), then attach the labor rate in force on that worked date.
  const groups = groupSelectedHours(selection.selectedHours);
  const rated: RatedDayGroup[] = [];
  for (const group of groups) {
    const rateType = laborRateType(selection.contractType);
    const row = rateRowInForce(rateRows, rateType, group.workDate);
    if (!row) return { error: new MissingRateError(rateType, group.workDate).message };
    rated.push({ group, hourlyRate: row.rate, rateRowId: row.id });
  }

  return { priced: { selection, costLines, laborLines: deriveLaborLines(rated) } };
}

/**
 * Prices every selection's SELECTED costs and hours and persists the derived
 * lines and their claims. Returns nothing about rates — the caller re-reads the
 * invoice for totals.
 */
export async function deriveInvoiceLines(
  admin: SupabaseClient,
  input: DeriveServerInput
): Promise<{ success: boolean; error?: string }> {
  // 1. PRICE EVERY SELECTION FIRST, writing nothing.
  //
  //    This ordering is load-bearing and was preserved deliberately from the
  //    single-instrument version: pricing can HARD STOP on a MissingRateError,
  //    and the clear in step 2 is destructive. Pricing first means a rateless
  //    instrument leaves the invoice exactly as it was instead of wiping the
  //    lines it already had. With several selections it matters more, not less
  //    — one bad instrument must not destroy three good ones' work.
  const priced: PricedSelection[] = [];
  for (const selection of input.selections) {
    const result = await priceSelection(admin, input.invoiceId, selection);
    if (result.error) return { success: false, error: result.error };
    priced.push(result.priced as PricedSelection);
  }

  // 2. Clear previous derived lines + claims (re-derive a draft), across the
  //    WHOLE invoice — then rewrite from the full submission. Discount and
  //    credit lines are NOT touched: they survive a re-derivation (§8).
  const { data: existing } = await admin
    .from('invoice_lines')
    .select('id, line_type')
    .eq('invoice_id', input.invoiceId);
  const derivedIds = (existing ?? [])
    .filter((l) => l.line_type === 'derived_cost' || l.line_type === 'derived_labor')
    .map((l) => l.id);
  if (derivedIds.length > 0) {
    // Claims cascade from the line, returning those costs/hours to the picker.
    const { error: delError } = await admin.from('invoice_lines').delete().in('id', derivedIds);
    if (delError) return { success: false, error: delError.message };
  }

  // 3. Write the derived lines, then their claims (the billed markers).
  //    company_id has no usable default under the service role
  //    (get_my_company_id() is NULL), so it is set explicitly from the invoice.
  const { data: invoiceRow } = await admin
    .from('invoices')
    .select('company_id')
    .eq('id', input.invoiceId)
    .single();
  const companyId = invoiceRow?.company_id as string | undefined;
  if (!companyId) return { success: false, error: 'Invoice not found' };

  // sort_order runs CONTINUOUSLY across selections, so an invoice's lines stay
  // grouped by instrument in submission order — which is the order §11's
  // per-instrument presentation renders them in.
  let sortOrder = 0;

  for (const { selection, costLines, laborLines } of priced) {
    const sourceEstimateId = selection.instrument.estimate_id ?? null;
    const sourceChangeOrderId = selection.instrument.change_order_id ?? null;

    for (const line of costLines) {
      const { data: created, error } = await admin
        .from('invoice_lines')
        .insert({
          company_id: companyId,
          invoice_id: input.invoiceId,
          line_type: 'derived_cost',
          description: line.description,
          category: line.category,
          cost_basis: line.costBasis,
          derived_amount: line.amount,
          billed_amount: line.amount,
          instrument_rate_id: line.rateRowId,
          source_estimate_id: sourceEstimateId,
          source_change_order_id: sourceChangeOrderId,
          sort_order: sortOrder++,
        })
        .select('id')
        .single();
      if (error) return { success: false, error: error.message };

      const { error: claimError } = await admin.from('invoice_cost_claims').insert({
        company_id: companyId,
        invoice_id: input.invoiceId,
        invoice_line_id: created.id,
        expense_allocation_id: line.allocationId,
        // §6.2 — the PORTION billed, not the whole allocation. costBasis IS
        // that portion (priceSelection passed the claimed amount into
        // deriveCostLine), so claim and line can never disagree.
        claimed_amount: line.costBasis,
        expense_date: selection.selectedCosts.find((c) => c.allocationId === line.allocationId)!
          .expenseDate,
        cost_category: line.category,
      });
      if (claimError) return { success: false, error: claimError.message };
    }

    for (const line of laborLines) {
      const { data: created, error } = await admin
        .from('invoice_lines')
        .insert({
          company_id: companyId,
          invoice_id: input.invoiceId,
          line_type: 'derived_labor',
          description: line.description,
          category: 'labor',
          quantity: line.quantity,
          unit_rate: line.unitRate,
          derived_amount: line.amount,
          billed_amount: line.amount,
          instrument_rate_id: line.rateRowId,
          source_estimate_id: sourceEstimateId,
          source_change_order_id: sourceChangeOrderId,
          sort_order: sortOrder++,
        })
        .select('id')
        .single();
      if (error) return { success: false, error: error.message };

      const claims = line.groups.flatMap((group) =>
        group.segmentIds.map((segmentId) => {
          const seg = selection.selectedHours.find((s) => s.segmentId === segmentId)!;
          return {
            company_id: companyId,
            invoice_id: input.invoiceId,
            invoice_line_id: created.id,
            time_segment_id: segmentId,
            member_id: group.memberId,
            work_date: group.workDate,
            raw_hours: seg.rawHours,
          };
        })
      );
      if (claims.length > 0) {
        const { error: claimError } = await admin.from('invoice_hour_claims').insert(claims);
        if (claimError) return { success: false, error: claimError.message };
      }
    }
  }

  return { success: true };
}
