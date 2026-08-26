import { createClient } from '@/lib/supabase-server';
import {
  deriveCostLine,
  deriveLaborLines,
  groupSelectedHours,
  type RatedDayGroup,
  type SelectedCost,
  type SelectedSegment,
} from '@framefocus/shared/utils/invoice-derivation';
import {
  aggregateCategories,
  caveatMessage,
  computeHeadline,
  type InstrumentCategorySlice,
  type ProfitCaveat,
  type ProfitCategory,
  type ProfitCategoryRow,
  type ProfitHeadline,
} from '@framefocus/shared/utils/profitability';
import {
  companyDay,
  isDerivedContract,
  laborRateType,
  nonLaborRateType,
  rateRowInForce,
  type ContractType,
  type RateRow,
} from '@/lib/services/invoices-shared';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { getJobCostRollup } from '@/lib/services/expenses';
import { getBudgetRollup } from '@/lib/services/budget';
import { getRevisedContract } from '@/lib/services/contract-value';
import { loadApprovedSelectionMoney, selectionInstrumentKey } from '@/lib/services/selection-money';
import { isPayableRow } from '@/lib/services/payables-shared';

// Module 7H — the per-job profitability report. READ-ONLY. Writes nothing,
// enforces nothing, owns no table and ships no migration.
//
// docs/specs/7h1-spec.md §7H.3 (the report), §7H.7 (what it reads).
//
// ─────────────────────────────────────────────────────────────────────────────
// 7H SHIPS NO MIGRATION [confirmed ruling B4, S140]
// ─────────────────────────────────────────────────────────────────────────────
// §7H.2 #10 batched FINANCIAL-RLS-FLOOR into this build. That floor SHIPPED
// INDEPENDENTLY at S97 — 20260806000000 / …08…part2 / …09…part3 /
// …10…tier2, plus the two column moves (20260811000000 project_financials,
// 20260816000000 project_budget_amounts) and their drops. 7H's largest
// deliverable left the module before the module was built. Nothing here
// creates, alters or policies anything.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS RUNS UNDER THE CALLER'S SESSION AND NOT THE SERVICE ROLE
// ─────────────────────────────────────────────────────────────────────────────
// 7D's derivation is privileged (invoice-derivation-server.ts) because a PM
// must be able to invoice while `instrument_rates` stays Owner/Admin. 7H has
// no such tension: the report is Owner/Admin only (§7H.6), and Owner/Admin can
// read rates, budgeted amounts and contract value directly. So this uses the
// ORDINARY RLS-scoped client, and every figure it produces is one the caller
// was already entitled to. No service role, no bypass, nothing to get wrong.
//
// ─────────────────────────────────────────────────────────────────────────────
// PER INSTRUMENT, THEN AGGREGATED — the trap §7H.2 #3 names
// ─────────────────────────────────────────────────────────────────────────────
// A project may hold a fixed-price estimate and cost-plus and T&M change
// orders simultaneously (money-rep P4), and signed COs write their own budget
// lines (P6). One "material" row can therefore span three differently priced
// instruments. Every cost below is priced through ITS OWN instrument's rates
// at ITS OWN incurred date, and only the priced results are summed.

export interface ProfitabilityReport {
  projectId: string;
  projectName: string;
  projectStatus: string;
  headline: ProfitHeadline;
  categories: ProfitCategoryRow[];
  /**
   * §7H.3 — sub-held retainage, the COST side: money withheld and not yet paid
   * out. Its own row because the four categories otherwise fail to reconcile
   * to the job total by exactly this amount (money-rep §4.5 — retainage
   * accrual rows are line-less in v1).
   *
   * NOT to be confused with client-held retainage (revenue withheld), which
   * lives in the headline. Same word, opposite direction.
   */
  retainageHeld: number;
  /**
   * [Ruling B2, S140] Costs on miscellaneous or source-less budget lines. Real
   * actual cost, no instrument, therefore NO sell and NO margin. Rendered as
   * its own row rather than folded into a category — folding it would let a
   * category show cost with no revenue behind it and read as a margin
   * collapse.
   */
  unattributed: { actual: number; count: number };
  caveats: ProfitCaveat[];
}

/** One instrument on the job, with its rate rows already loaded. */
interface LoadedInstrument {
  key: string;
  label: string;
  contractType: ContractType;
  /** estimate_id or change_order_id — how instrument_rates is keyed. */
  estimateId: string | null;
  changeOrderId: string | null;
  /**
   * [S175 stage 5] The THIRD KIND. Set on a `sel:<id>` instrument — an
   * approved selection whose allowance sits on a FIXED-PRICE instrument (Q4:
   * the signature is the binding instrument; no CO is generated). It carries
   * no rate rows: its sell is the SIGNED figure, not a per-cost derivation.
   */
  selectionId: string | null;
  /** signed_sell_amount / signed_variance, on a selection instrument only. */
  selectionSell: number | null;
  selectionVariance: number | null;
  rates: RateRow[];
}

export async function getProfitabilityReport(
  projectId: string
): Promise<ProfitabilityReport | null> {
  const supabase = await createClient();

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, status, project_type, source_estimate_id')
    .eq('id', projectId)
    .eq('is_deleted', false)
    .single();
  if (!project) return null;

  const { timezone } = await getCompanyTimeSettings();

  // ── The instruments ──────────────────────────────────────────────────────
  // Enumerated exactly as the invoice builder does
  // (invoices/[invoiceId]/page.tsx): the originating estimate, then every
  // SIGNED change order, each carrying its own contract type. Not restated as
  // a second rule — the same two sources, read the same way.
  const { data: signedCos } = await supabase
    .from('change_orders')
    .select('id, co_number, title, co_type')
    .eq('project_id', projectId)
    .eq('status', 'signed')
    .eq('is_deleted', false);

  const projectType = (project.project_type ?? 'fixed_price') as ContractType;
  const instruments: LoadedInstrument[] = [];

  if (project.source_estimate_id) {
    instruments.push({
      key: `est:${project.source_estimate_id}`,
      label: 'Original Contract',
      contractType: projectType,
      estimateId: project.source_estimate_id,
      changeOrderId: null,
      selectionId: null,
      selectionSell: null,
      selectionVariance: null,
      rates: [],
    });
  }
  for (const co of signedCos ?? []) {
    instruments.push({
      key: `co:${co.id}`,
      label: `${co.co_number}${co.title ? ` — ${co.title}` : ''}`,
      contractType: (co.co_type ?? 'fixed_price') as ContractType,
      estimateId: null,
      changeOrderId: co.id,
      selectionId: null,
      selectionSell: null,
      selectionVariance: null,
      rates: [],
    });
  }

  // ── [S175 stage 5] THE THIRD INSTRUMENT KIND: an approved SELECTION ──────
  // Spec §7.1: "profitability.ts gains the selection as a third instrument
  // kind in its cost loop or margin is overstated." Without it a selection's
  // cost sat on its ALLOWANCE line and was attributed TRANSITIVELY to the
  // estimate (or, on a source-less line, to nothing), while its sell — the
  // figure the client signed — reached no slice at all.
  //
  // Only a selection whose allowance sits on a FIXED-PRICE instrument becomes
  // an instrument here. On a cost-plus / T&M parent the tagged cost bills AS
  // INCURRED through the parent's rates (getPickableCosts offers it that way),
  // so it stays transitive below and is priced by deriveCostLine like any
  // other cost — selection-money.ts is the one place that decides which.
  const approvedSelections = await loadApprovedSelectionMoney(supabase, projectId);
  const selectionInstrumentById = new Map<string, LoadedInstrument>();
  for (const sel of approvedSelections) {
    if (sel.asIncurred) continue;
    const inst: LoadedInstrument = {
      key: selectionInstrumentKey(sel.id),
      label: `Selection — ${sel.name}`,
      // Fixed BY CONSTRUCTION: the sell is signed, never derived per cost.
      contractType: 'fixed_price',
      estimateId: null,
      changeOrderId: null,
      selectionId: sel.id,
      selectionSell: sel.signedSellAmount,
      selectionVariance: sel.signedVariance,
      rates: [],
    };
    instruments.push(inst);
    selectionInstrumentById.set(sel.id, inst);
  }

  // Rate rows, read under the caller's session. Owner/Admin passes
  // instrument_rates_select_owner_admin; nobody else reaches this report.
  const { data: allRates } = await supabase
    .from('instrument_rates')
    .select('id, rate_type, rate, effective_from, superseded_at, estimate_id, change_order_id');
  for (const inst of instruments) {
    inst.rates = ((allRates ?? []) as (RateRow & {
      estimate_id: string | null;
      change_order_id: string | null;
    })[]).filter((r) =>
      inst.estimateId ? r.estimate_id === inst.estimateId : r.change_order_id === inst.changeOrderId
    );
  }

  // ── Which budget line belongs to which instrument ────────────────────────
  // Attribution is TRANSITIVE and there is no tag on a cost row — the same
  // chain getPickableCosts walks: expense_allocations -> project_budget_items
  // -> (source_line_* = the estimate | source_change_order_id = that CO |
  // is_miscellaneous / no source = NOTHING).
  const { data: budgetItems } = await supabase
    .from('project_budget_items')
    .select('id, source_line_row_id, source_line_item_id, source_change_order_id, is_miscellaneous')
    .eq('project_id', projectId)
    .eq('is_deleted', false);

  const instrumentForBudgetItem = new Map<string, string>();
  const unattributedItems = new Set<string>();
  for (const b of budgetItems ?? []) {
    if (b.source_change_order_id) {
      instrumentForBudgetItem.set(b.id, `co:${b.source_change_order_id}`);
    } else if (
      !b.is_miscellaneous &&
      (b.source_line_row_id !== null || b.source_line_item_id !== null) &&
      project.source_estimate_id
    ) {
      instrumentForBudgetItem.set(b.id, `est:${project.source_estimate_id}`);
    } else {
      unattributedItems.add(b.id);
    }
  }

  // ── Approved costs, per allocation ───────────────────────────────────────
  const { data: allocations } = await supabase
    .from('expense_allocations')
    .select('id, expense_id, budget_item_id, amount, source_selection_id')
    .eq('is_deleted', false)
    .in('budget_item_id', [...instrumentForBudgetItem.keys(), ...unattributedItems]);

  const expenseIds = [...new Set((allocations ?? []).map((a) => a.expense_id))];
  const { data: expenses } = expenseIds.length
    ? await supabase
        .from('expenses')
        .select(
          'id, description, supplier, expense_date, cost_category, status, is_deleted, amount, state, sub_contract_id, purchase_order_id, is_retainage'
        )
        .in('id', expenseIds)
        .eq('status', 'approved') // §7H.2 #7 — approved only, always
        .eq('is_deleted', false)
    : { data: [] };
  const expenseById = new Map((expenses ?? []).map((e) => [e.id, e]));

  // [S175 stage 5] The ACTUAL a tagged allocation contributed to its allowance
  // line — recompute_budget_item_actual()'s rule, per allocation: a plain
  // actual counts its amount; a commitment (PO / sub-contract / retainage /
  // state=committed / anything paid) counts only what has been PAID, net of
  // retainage, prorated by the allocation's share. The selection's slice
  // carries this figure and the allowance line's slice is reduced by it, so
  // the category total counts each dollar once. Payments are read only for
  // the tagged expenses, which are few.
  const taggedExpenseIds = [
    ...new Set(
      (allocations ?? [])
        .filter((a) => a.source_selection_id && selectionInstrumentById.has(a.source_selection_id))
        .map((a) => a.expense_id)
    ),
  ];
  const { data: taggedPayments } = taggedExpenseIds.length
    ? await supabase
        .from('expense_payments')
        .select('expense_id, amount, retainage_withheld, is_deleted')
        .in('expense_id', taggedExpenseIds)
        .eq('is_deleted', false)
    : { data: [] as { expense_id: string; amount: number; retainage_withheld: number | null; is_deleted: boolean }[] };
  const paidByExpense = new Map<string, number>();
  for (const p of taggedPayments ?? []) {
    paidByExpense.set(
      p.expense_id,
      round2((paidByExpense.get(p.expense_id) ?? 0) + Number(p.amount) - Number(p.retainage_withheld ?? 0))
    );
  }
  const allocationActual = (alloc: { expense_id: string; amount: number }): number => {
    const e = expenseById.get(alloc.expense_id);
    if (!e) return 0;
    const paid = paidByExpense.has(e.id);
    if (!isPayableRow(e, paid)) return round2(Number(alloc.amount));
    const share = Number(e.amount) ? Number(alloc.amount) / Number(e.amount) : 0;
    return round2((paidByExpense.get(e.id) ?? 0) * share);
  };
  /** Per selection instrument and per allowance line: the tagged actual. */
  const selectionActual = new Map<string, number>();
  const taggedActualByItem = new Map<string, number>();

  // ── Price each cost through ITS OWN instrument ───────────────────────────
  const sellByInstrumentCategory = new Map<string, number>();
  const rateMissing = new Set<string>();
  let unattributedActual = 0;
  let unattributedCount = 0;

  for (const alloc of allocations ?? []) {
    const expense = expenseById.get(alloc.expense_id);
    if (!expense) continue; // unapproved, rejected or deleted

    // [S175 stage 5] THE THIRD ARM, at the ALLOCATION — the cost row is where
    // the person booking it knew the answer (Q3.1). A cost tagged with a
    // fixed-parent selection belongs to that selection, wherever its allowance
    // line would otherwise have sent it — including out of `unattributed`.
    const selInst = alloc.source_selection_id
      ? selectionInstrumentById.get(alloc.source_selection_id)
      : undefined;
    if (selInst) {
      const contributed = allocationActual(alloc);
      selectionActual.set(selInst.key, round2((selectionActual.get(selInst.key) ?? 0) + contributed));
      taggedActualByItem.set(
        alloc.budget_item_id,
        round2((taggedActualByItem.get(alloc.budget_item_id) ?? 0) + contributed)
      );
      // A selection instrument is FIXED: its sell is the signed figure, and
      // pricing its cost through a rate would be the double count the parent
      // arm below avoids for the contract.
      continue;
    }

    if (unattributedItems.has(alloc.budget_item_id)) {
      unattributedActual = round2(unattributedActual + Number(alloc.amount));
      unattributedCount += 1;
      continue;
    }

    const key = instrumentForBudgetItem.get(alloc.budget_item_id);
    const inst = instruments.find((i) => i.key === key);
    if (!inst) continue;

    // A FIXED-PRICE instrument has no per-cost sell: the client pays the
    // contract, not cost-plus-a-markup. Its revenue is 7B's contract value and
    // is added to `earned` below — pricing it here would double-count.
    if (!isDerivedContract(inst.contractType)) continue;

    // `expenses_cost_category_check` permits material | subcontractor | other
    // and NOTHING else — labor cost comes from time sessions and frozen rate
    // snapshots (7A §2.6), never from an expense row. So this cast is exact
    // rather than hopeful, and there is no 'labor' case to skip here.
    const category = expense.cost_category as SelectedCost['category'];
    if (!category) continue;

    const rateType = nonLaborRateType(inst.contractType, category);
    const row = rateRowInForce(inst.rates, rateType, expense.expense_date);
    if (!row) {
      rateMissing.add(inst.key);
      continue;
    }

    // THE SAME FUNCTION AN INVOICE USES. Not a re-derivation of it.
    const line = deriveCostLine({
      allocationId: alloc.id,
      description: expense.description || expense.supplier,
      category,
      cost: Number(alloc.amount),
      incurredDate: expense.expense_date,
      markupPercent: row.rate,
      rateRowId: row.id,
    });

    const bucket = `${inst.key}|${category}`;
    sellByInstrumentCategory.set(
      bucket,
      round2((sellByInstrumentCategory.get(bucket) ?? 0) + line.amount)
    );
  }

  // ── Labor revenue ────────────────────────────────────────────────────────
  const labor = await deriveLaborRevenue(supabase, projectId, instruments, timezone);
  if (labor.rateMissing) rateMissing.add('labor');

  // ── Cost, committed and budget, per instrument and category ──────────────
  const rollup = await getJobCostRollup(projectId);
  const budget = await getBudgetRollup(projectId);

  const slices = buildSlices({
    instruments,
    budget,
    rollup,
    sellByInstrumentCategory,
    laborSell: labor.sell,
    selectionActual,
    taggedActualByItem,
  });
  const categories = aggregateCategories(slices);

  // ── The headline ─────────────────────────────────────────────────────────
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, billed_total, status, is_deleted')
    .eq('project_id', projectId)
    .eq('is_deleted', false);
  const liveInvoices = (invoices ?? []).filter((i) => i.status !== 'voided');
  const billed = round2(
    liveInvoices.reduce((sum, i) => sum + Number(i.billed_total ?? 0), 0)
  );

  const discounts = await sumDiscountLines(
    supabase,
    liveInvoices.map((i) => i.id)
  );
  const collected = await sumCollected(supabase, liveInvoices.map((i) => i.id));

  // Earned: contract value for the fixed-price side (7B derives it — never
  // re-derived here), plus the derived revenue of every non-fixed instrument.
  //
  // [S175 stage 5] A selection instrument is fixed but is NOT what decides
  // `hasFixed`: on a fixed-price job its variance is already INSIDE
  // revised.revised (contract-value.ts, Q3.2), and on a cost-plus / T&M job a
  // fixed-parent selection can only exist under a fixed-price CO — which has
  // made hasFixed true already. Counting the selection here would pull the
  // P11 projection into earned on a job that had no fixed instrument at all.
  const contractInstruments = instruments.filter((i) => i.selectionId === null);
  const hasFixed = contractInstruments.some((i) => !isDerivedContract(i.contractType));
  const revised = hasFixed ? await getRevisedContract(projectId) : null;
  const derivedRevenue =
    [...sellByInstrumentCategory.values()].reduce((s, v) => s + v, 0) + (labor.sell ?? 0);

  // [S175 stage 5, Q3.2] On a non-fixed job the selection term is EXCLUDED
  // from contract value — but a fixed-parent selection there (an allowance on
  // a fixed-price CO) is still signed, earned revenue. It is added here, and
  // SAID, so the exclusion is a value on this screen too rather than a figure
  // that quietly went missing between two derivations.
  const selectionSellOutsideContract =
    revised?.selectionDeltaExcluded === true
      ? round2(
          instruments
            .filter((i) => i.selectionId !== null)
            .reduce((s, i) => s + (i.selectionVariance ?? 0), 0)
        )
      : 0;

  const anyDerived = contractInstruments.some((i) => isDerivedContract(i.contractType));
  const earned =
    hasFixed && revised?.revised !== null && revised?.revised !== undefined
      ? round2(revised.revised + (anyDerived ? derivedRevenue : 0) + selectionSellOutsideContract)
      : anyDerived
        ? round2(derivedRevenue)
        : null;

  const headline = computeHeadline({
    earned,
    billed,
    actualCost: round2(rollup.expenses.totalApproved + (rollup.labor.totalCost ?? 0)),
    discounts,
    collected,
    projectStatus: project.status,
  });

  // ── Caveats ──────────────────────────────────────────────────────────────
  const caveats: ProfitCaveat[] = [];

  if (labor.assumedInstrument) {
    caveats.push({
      code: 'labor_instrument_assumed',
      message: caveatMessage('labor_instrument_assumed'),
    });
  }
  if (unattributedCount > 0) {
    caveats.push({
      code: 'unattributed_costs',
      message: caveatMessage('unattributed_costs', {
        count: unattributedCount,
        amount: unattributedActual,
      }),
      amount: unattributedActual,
      count: unattributedCount,
    });
  }
  if (labor.unapprovedOwnerSessions > 0) {
    caveats.push({
      code: 'owner_hours_unapproved',
      message: caveatMessage('owner_hours_unapproved', {
        count: labor.unapprovedOwnerSessions,
      }),
      count: labor.unapprovedOwnerSessions,
    });
  }
  if (rateMissing.size > 0) {
    caveats.push({ code: 'rate_missing', message: caveatMessage('rate_missing') });
  }
  if (selectionSellOutsideContract !== 0) {
    caveats.push({
      code: 'selection_variance_outside_contract',
      message: caveatMessage('selection_variance_outside_contract', {
        amount: selectionSellOutsideContract,
      }),
      amount: selectionSellOutsideContract,
    });
  }
  if (headline.basis === 'billed') {
    caveats.push({ code: 'basis_switched', message: caveatMessage('basis_switched') });
  }

  return {
    projectId,
    projectName: project.name,
    projectStatus: project.status,
    headline,
    categories,
    retainageHeld: rollup.payables.retainageHeld,
    unattributed: { actual: unattributedActual, count: unattributedCount },
    caveats,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Labor revenue — and the assumption it rests on
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ [RULING B1, S140] NOTHING IN THE SCHEMA TIES AN HOUR TO AN INSTRUMENT.
//
// `time_segments` carries project_id and task_id. There is no estimate_id and
// no change_order_id, anywhere on the chain. 7D does not need one because D2
// ruled billable hours are USER-SELECTED — a human picks which invoice, and
// therefore which instrument, the hours go on.
//
// A report has no human in the loop. So on a job holding a cost-plus estimate
// AND a T&M change order, there is no derivable answer to "which instrument
// do these unbilled hours belong to", and the two carry different rates.
//
// Josh ruled: attribute unbilled hours to the ORIGINATING ESTIMATE — the same
// `fallback` instrument 7D uses for un-attributed lines — and SAY SO ON SCREEN.
// The caveat is emitted whenever the job has more than one non-fixed
// instrument, because that is exactly when the assumption can be wrong.
//
// This is an ASSUMPTION, not a derivation, and the report calls it one.
async function deriveLaborRevenue(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  instruments: LoadedInstrument[],
  timezone: string
): Promise<{
  sell: number | null;
  assumedInstrument: boolean;
  rateMissing: boolean;
  unapprovedOwnerSessions: number;
}> {
  const derived = instruments.filter((i) => isDerivedContract(i.contractType));
  if (derived.length === 0) {
    return { sell: null, assumedInstrument: false, rateMissing: false, unapprovedOwnerSessions: 0 };
  }

  // The originating estimate if it is itself non-fixed, else the first
  // non-fixed instrument on the job.
  const target = derived.find((i) => i.estimateId !== null) ?? derived[0];

  const { data: segments } = await supabase
    .from('time_segments')
    .select('id, session_id, segment_start, segment_end, project_id, is_deleted')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .not('segment_end', 'is', null);
  if (!segments || segments.length === 0) {
    return {
      sell: 0,
      assumedInstrument: derived.length > 1,
      rateMissing: false,
      unapprovedOwnerSessions: 0,
    };
  }

  const sessionIds = [...new Set(segments.map((s) => s.session_id))];
  const { data: sessions } = await supabase
    .from('time_clock_sessions')
    .select('id, member_id, status, is_deleted')
    .in('id', sessionIds)
    .eq('is_deleted', false);

  const approved = new Map(
    (sessions ?? []).filter((s) => s.status === 'approved').map((s) => [s.id, s])
  );

  // [RULING B3, S140] Module 6 writes the Owner's own sessions status = NULL
  // (time-tracking-client.ts), so they never satisfy `status = 'approved'` and
  // their hours reach neither labor cost nor labor revenue. 7D D1 ruled they
  // SHOULD count and deliberately built no special case, calling it a Module 6
  // change. 7H inherits the gap and REPORTS it rather than creeping into
  // Module 6 to fix it — both figures understate on any job the Owner worked,
  // and silently understating profit is worse than saying so.
  const unapprovedOwnerSessions = (sessions ?? []).filter((s) => s.status === null).length;

  const selected: SelectedSegment[] = [];
  for (const seg of segments) {
    const session = approved.get(seg.session_id);
    if (!session || !seg.segment_end) continue;
    selected.push({
      segmentId: seg.id,
      memberId: session.member_id,
      workDate: companyDay(seg.segment_start, timezone),
      rawHours: hoursBetween(seg.segment_start, seg.segment_end),
    });
  }

  if (selected.length === 0) {
    return {
      sell: 0,
      assumedInstrument: derived.length > 1,
      rateMissing: false,
      unapprovedOwnerSessions,
    };
  }

  // Per person per day, rounded UP to the half hour — groupSelectedHours is
  // the ONLY place that rule lives and it is not restated here.
  const groups = groupSelectedHours(selected);
  const rateType = laborRateType(target.contractType);

  const rated: RatedDayGroup[] = [];
  let missing = false;
  for (const group of groups) {
    const row = rateRowInForce(target.rates, rateType, group.workDate);
    if (!row) {
      missing = true;
      continue;
    }
    rated.push({ group, hourlyRate: row.rate, rateRowId: row.id });
  }

  const lines = deriveLaborLines(rated);
  return {
    sell: round2(lines.reduce((sum, l) => sum + l.amount, 0)),
    assumedInstrument: derived.length > 1,
    rateMissing: missing,
    unapprovedOwnerSessions,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

function buildSlices(input: {
  instruments: LoadedInstrument[];
  budget: Awaited<ReturnType<typeof getBudgetRollup>>;
  rollup: Awaited<ReturnType<typeof getJobCostRollup>>;
  sellByInstrumentCategory: Map<string, number>;
  laborSell: number | null;
  /** [S175 stage 5] Tagged actual per selection instrument key, and the same
   *  money keyed by the allowance line it was booked to — see below. */
  selectionActual: Map<string, number>;
  taggedActualByItem: Map<string, number>;
}): InstrumentCategorySlice[] {
  const slices: InstrumentCategorySlice[] = [];

  // Budget and committed come from the shipped instrument-grouped rollup,
  // which already splits by instrument (money-rep §7.1 S-1 / P6). The report
  // does not re-derive that grouping; it reads it.
  for (const group of input.budget.instruments) {
    const key =
      group.kind === 'change_order' && group.changeOrder
        ? `co:${group.changeOrder.id}`
        : group.kind === 'original'
          ? (input.instruments.find((i) => i.estimateId)?.key ?? 'est:unknown')
          : 'adhoc';

    // [S170] 'allowance' enumerated explicitly — a category missing from this
    // list is OMITTED from the report, not bucketed anywhere.
    for (const category of [
      'labor',
      'material',
      'subcontractor',
      'other',
      'allowance',
    ] as ProfitCategory[]) {
      const items = group.groups.flatMap((g) => g.items).filter((i) => i.row_type === category);
      if (items.length === 0) continue;

      let budgetSum: number | null = null;
      let committed = 0;
      let actual = 0;
      for (const item of items) {
        if (item.budgeted_amount !== null && item.budgeted_amount !== undefined) {
          budgetSum = (budgetSum ?? 0) + item.budgeted_amount;
        }
        committed += item.committed_remaining;
        // [S175 stage 5] A cost tagged with a selection is carried by the
        // SELECTION's slice below; the allowance line it was booked to gives it
        // up here so the category counts it once. Clamped at zero because the
        // stored actual and the per-allocation rule can disagree by a rounding
        // cent, and a negative allowance actual would be a new lie.
        actual += Math.max(0, (item.actual_amount ?? 0) - (input.taggedActualByItem.get(item.id) ?? 0));
      }

      slices.push({
        instrumentKey: key,
        category,
        budget: budgetSum === null ? null : round2(budgetSum),
        committed: round2(committed),
        actual: round2(actual),
        sell:
          category === 'labor'
            ? key === (input.instruments.find((i) => i.estimateId)?.key ?? '')
              ? input.laborSell
              : null
            : (input.sellByInstrumentCategory.get(`${key}|${category}`) ?? null),
      });
    }
  }

  // [S175 stage 5] One slice per SELECTION instrument: its tagged cost and its
  // SIGNED sell. Budget stays on the allowance line (§5.4 shows the selection
  // re-budgeting it there); committed stays on the allowance line too, because
  // 7C's remaining is derived per budget line and has no selection grain.
  // Sell is signed_sell_amount, NOT the variance: the variance is what the
  // selection ADDS to the contract, the sell is what the client is paying for
  // the chosen options — and actual is what they cost, so margin = sell − actual
  // is the selection's own margin. On a fixed-price job the allowance's own
  // contract sell is not sliced (fixed instruments carry null sell), so this
  // is the one category where a fixed job shows a per-category sell; it is
  // the signed figure, which is why it can.
  for (const inst of input.instruments) {
    if (inst.selectionId === null) continue;
    slices.push({
      instrumentKey: inst.key,
      category: 'allowance',
      budget: null,
      committed: 0,
      actual: round2(input.selectionActual.get(inst.key) ?? 0),
      sell: inst.selectionSell,
    });
  }

  // Labor COST is not on the budget lines — it is derived from frozen rate
  // snapshots (7A §2.6) and lives on the rollup. Added as its own slice so the
  // labor row's actual is real rather than zero.
  if (input.rollup.labor.available && input.rollup.labor.totalCost > 0) {
    slices.push({
      instrumentKey: input.instruments.find((i) => i.estimateId)?.key ?? 'est:unknown',
      category: 'labor',
      budget: null,
      committed: 0,
      actual: round2(input.rollup.labor.totalCost),
      sell: null, // already carried by the budget-derived labor slice above
    });
  }

  return slices;
}

async function sumDiscountLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceIds: string[]
): Promise<number> {
  if (invoiceIds.length === 0) return 0;
  const { data } = await supabase
    .from('invoice_lines')
    .select('billed_amount, derived_amount, line_type')
    .in('invoice_id', invoiceIds)
    .eq('line_type', 'discount');
  // Discount lines are stored SIGNED NEGATIVE (§8). `discounts` in the
  // headline is a positive magnitude to subtract, so the sign is flipped once,
  // here, rather than at each use.
  const total = (data ?? []).reduce(
    (sum, l) => sum + Number(l.billed_amount ?? l.derived_amount ?? 0),
    0
  );
  return round2(Math.abs(total));
}

async function sumCollected(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceIds: string[]
): Promise<number> {
  if (invoiceIds.length === 0) return 0;
  const { data } = await supabase
    .from('client_payment_applications')
    .select('amount')
    .in('invoice_id', invoiceIds)
    .eq('is_deleted', false);
  return round2((data ?? []).reduce((sum, a) => sum + Number(a.amount), 0));
}

function hoursBetween(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
