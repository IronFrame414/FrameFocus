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
      rates: [],
    });
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
    .select('id, expense_id, budget_item_id, amount')
    .eq('is_deleted', false)
    .in('budget_item_id', [...instrumentForBudgetItem.keys(), ...unattributedItems]);

  const expenseIds = [...new Set((allocations ?? []).map((a) => a.expense_id))];
  const { data: expenses } = expenseIds.length
    ? await supabase
        .from('expenses')
        .select('id, description, supplier, expense_date, cost_category, status, is_deleted')
        .in('id', expenseIds)
        .eq('status', 'approved') // §7H.2 #7 — approved only, always
        .eq('is_deleted', false)
    : { data: [] };
  const expenseById = new Map((expenses ?? []).map((e) => [e.id, e]));

  // ── Price each cost through ITS OWN instrument ───────────────────────────
  const sellByInstrumentCategory = new Map<string, number>();
  const rateMissing = new Set<string>();
  let unattributedActual = 0;
  let unattributedCount = 0;

  for (const alloc of allocations ?? []) {
    const expense = expenseById.get(alloc.expense_id);
    if (!expense) continue; // unapproved, rejected or deleted

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
  const hasFixed = instruments.some((i) => !isDerivedContract(i.contractType));
  const revised = hasFixed ? await getRevisedContract(projectId) : null;
  const derivedRevenue =
    [...sellByInstrumentCategory.values()].reduce((s, v) => s + v, 0) + (labor.sell ?? 0);

  const anyDerived = instruments.some((i) => isDerivedContract(i.contractType));
  const earned =
    hasFixed && revised?.revised !== null && revised?.revised !== undefined
      ? round2(revised.revised + (anyDerived ? derivedRevenue : 0))
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
        actual += item.actual_amount ?? 0;
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
