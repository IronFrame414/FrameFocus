import { createClient } from '@/lib/supabase-server';
import { loadApprovedSelectionMoney } from '@/lib/services/selection-money';

// 7B — Contract Value (docs/specs/7B-spec.md §2). The original contract value
// is NEVER mutated: it holds the figure set at conversion. The revised total is
// DERIVED here and only here — original + Σ(client-signed CO net_delta),
// bidirectional (a negative CO lowers it). Voided/draft/sent COs contribute
// nothing; 'signed' is reachable only through the client token flow
// (co-signing-service.ts). No trigger, no stored revised column, no view.
//
// RULING 2 [S97, 2026-08-02] — WHERE THE ORIGINAL NOW LIVES. It moved from
// projects.contract_value to project_financials.contract_value, a table whose
// RLS is floored at Owner/Admin. Postgres RLS is row-level and has no column
// equivalent, so a column that only Owner/Admin may read has to be its own row.
//
// The consequence every caller must handle: for a PM, Foreman or Crew member
// these functions now return `original: null` — not zero, and not an error. RLS
// filters the row out, which is the intended outcome. `revised` is null with
// it. Anything that PRICES off these figures must refuse to price when they are
// null rather than treating null as 0 (see 7D's percentage draw).

/**
 * The ONE filter that defines "contributes to contract value" (7B §2.2, P3).
 * Every consumer — the three functions below and any future 7D/7G/7H read —
 * derives from THIS constant, never re-states it. (dashboard.ts also applies
 * it to its attention-feed row query so the feed and the KPI can never
 * disagree on what "signed" means.)
 */
export const CONTRACT_CONTRIBUTING_CO_FILTER = {
  status: 'signed', // client-signed only — the sole writer is completeCoSignature
  is_deleted: false,
} as const;

/**
 * [S175 stage 5] The selection twin of the constant above, and it exists for
 * the same reason: every consumer derives from THIS, never re-states it.
 *
 * `approved` is reachable only through `completeSelectionSignature` — the one
 * write path, portal-only, no token arm — so this is the selection's exact
 * equivalent of "client-signed only". `signed_variance` is NULL on a
 * client-supplied selection by CHECK, and those rows contribute nothing.
 */
export const CONTRACT_CONTRIBUTING_SELECTION_FILTER = {
  status: 'approved',
  is_deleted: false,
} as const;

export interface RevisedContract {
  /** project_financials.contract_value — never mutated. NULL for a project
   *  with no value set AND for any caller below Owner/Admin (RLS). */
  original: number | null;
  signedDelta: number; // Σ net_delta of contributing COs (signed values, ±)
  /**
   * [S175 stage 5, Q4] Σ `signed_variance` over APPROVED selections — the
   * client's signature on a selection is the binding instrument and no change
   * order is generated, so this is a third term rather than a CO.
   *
   * **FIXED-PRICE ONLY** [Josh, S175 Q2]. Zero on cost-plus/T&M, where
   * `contract_value` holds the user-entered PROJECTION that money-rep P11
   * forbids from feeding billing math — the same reason
   * `enforce_contract_billing_ceiling` and `getContractBilling` both skip
   * non-fixed projects.
   */
  selectionDelta: number;
  /**
   * ⚠️ TRUE when selection variances EXIST on this project but were excluded
   * because it is not fixed-price.
   *
   * It is a value a screen must render rather than an omission it can
   * overlook — Josh's `final_hold` argument: a silent absence is accepted by
   * the schema, acted on nowhere, and invisible to anyone reading the screen.
   * FALSE means "no exclusion happened", which is different from "no
   * selections".
   */
  selectionDeltaExcluded: boolean;
  revised: number | null; // original + signedDelta + selectionDelta; null when original is null
}

export interface PortfolioRevisedContract {
  /** Σ contract_value over active projects the caller can READ. Below
   *  Owner/Admin that is zero rows, so the sum is 0 — see visibleCount. */
  originalSum: number;
  signedDeltaSum: number; // Σ net_delta of contributing COs on those projects
  /** [S175 stage 5] Σ signed_variance of approved selections — FIXED-PRICE
   *  projects only. A projected project's variances are not in this figure. */
  selectionDeltaSum: number;
  revisedSum: number; // originalSum + signedDeltaSum + selectionDeltaSum
  /** How many projects actually contributed a value. Zero below Owner/Admin,
   *  which lets a caller tell "no contracts" apart from "not permitted". */
  visibleCount: number;

  // ── THE SPLIT [S97, 2026-08-03] ────────────────────────────────────────────
  //
  // revisedSum above mixes two incompatible quantities and always did: on a
  // FIXED-PRICE project contract_value is a BINDING obligation, and on a
  // cost-plus/T&M one it is the USER-ENTERED PROJECTION that P11 forbids from
  // billing math. Adding them produced a headline that is neither — the same
  // category error as calling a projection "Revised Contract", one level up.
  //
  // Both figures are kept: revisedSum stays for any caller that genuinely wants
  // the gross, and the two halves below let a surface show them apart. The
  // dashboard KPI shows them apart.

  /** Revised contract across active FIXED-PRICE projects — binding. */
  fixedRevisedSum: number;
  fixedCount: number;
  /** Revised PROJECTION across active cost-plus / T&M projects — non-binding,
   *  and never to be summed with the figure above in a single headline. */
  projectedRevisedSum: number;
  projectedCount: number;
}

function toRevised(
  original: number | null,
  signedDelta: number,
  // Defaulted so the two callers that predate stage 5 keep their shape; a
  // project with no selections is indistinguishable from one on an old path,
  // which is correct — both contribute nothing.
  selectionDelta = 0,
  selectionDeltaExcluded = false
): RevisedContract {
  return {
    original,
    signedDelta,
    selectionDelta,
    selectionDeltaExcluded,
    revised: original !== null ? original + signedDelta + selectionDelta : null,
  };
}

/** Σ signed_variance, rounded once at the end — the same money discipline as
 *  the CO sum above. Nulls (client-supplied selections) contribute nothing. */
function sumVariance(rows: { signed_variance: number | null }[] | null): number {
  return Math.round((rows ?? []).reduce((n, r) => n + (r.signed_variance ?? 0), 0) * 100) / 100;
}

/** Per-project derivation — the only legal read of revised contract value. */
export async function getRevisedContract(projectId: string): Promise<RevisedContract> {
  const supabase = await createClient();

  const [{ data: financials }, { data: cos }, { data: project }, { data: sels }] = await Promise.all([
    // maybeSingle, not single: below Owner/Admin RLS returns NO row, and that
    // is a legitimate answer rather than an error.
    supabase
      .from('project_financials')
      .select('contract_value')
      .eq('project_id', projectId)
      .maybeSingle(),
    supabase
      .from('change_orders')
      .select('net_delta')
      .eq('project_id', projectId)
      .match(CONTRACT_CONTRIBUTING_CO_FILTER),
    supabase.from('projects').select('project_type').eq('id', projectId).maybeSingle(),
    // [S175 stage 5] Fetched for EVERY project type, not only fixed-price —
    // otherwise `selectionDeltaExcluded` could never be true and the exclusion
    // would be exactly the silent absence it exists to make visible.
    supabase
      .from('selections')
      .select('signed_variance')
      .eq('project_id', projectId)
      .match(CONTRACT_CONTRIBUTING_SELECTION_FILTER),
  ]);

  const signedDelta = (cos ?? []).reduce((sum, co) => sum + (co.net_delta ?? 0), 0);
  const variance = sumVariance(sels);
  const isFixed = project?.project_type === 'fixed_price';
  return toRevised(
    financials?.contract_value ?? null,
    signedDelta,
    isFixed ? variance : 0,
    !isFixed && variance !== 0
  );
}

// ── §3 / acceptance #4 — REMAINING TO BILL on the contract [S97, 2026-08-03] ─
//
// JOSH'S RULING: on a FIXED-PRICE job a deposit is money against the contract
// and reduces what remains to bill. $5,000 deposit on a $50,000 contract leaves
// $45,000 to invoice. Void or refund it and the figure returns to $50,000.
//
// DERIVED HERE, AT THE 7B LAYER, AND NOTHING IS STORED. No write to
// project_budget_amounts.budgeted_amount, no write to project_financials, no
// flag anywhere. That is what makes void and refund self-correcting: nothing
// was copied, so nothing has to be undone. The same doctrine as the revised
// contract above, §2's income section, §3a's deposit balance, §4a availability
// and §6.2a's remaining-unbilled.
//
// 7D STILL NEVER WRITES CONTRACT VALUE (§4). This function only READS — it is
// a derivation on top of project_financials, exactly like getRevisedContract.
// Nothing in 7D gained a write path to a contract figure.
//
// ═══ THE TWO DEPOSIT PATHS ARE SEPARATE AND MUST STAY SEPARATE ═══
//
//   FIXED-PRICE  → THIS function. A deposit is billed against the contract
//                  instrument, so it lands in `issuedAgainstContract` and
//                  reduces remainingToBill. There is no credit balance and no
//                  credit line.
//
//   COST-PLUS /  → §3a's CREDIT BALANCE, which is already built and is NOT
//   T&M            touched here: the deposit is held as a job credit and drawn
//                  down across derived invoices as `credit_deposit` lines
//                  (getAvailableCredits / applyDepositCredit).
//
//   THEY CANNOT DOUBLE-COUNT, structurally: this function sums only lines
//   carrying the ORIGINATING ESTIMATE as their instrument. A cost-plus or T&M
//   deposit is billed on a CO instrument (or is standalone), so its lines never
//   match the filter below. A future reader tempted to "unify" the two paths
//   should read §3a first — Josh ruled the credit-balance mechanism for derived
//   instruments precisely because "credited against the budgeted amount"
//   assumes a fixed contract value and does not carry to derived billing.

export interface ContractBilling {
  /** project_financials.contract_value. NULL below Owner/Admin (RLS). */
  original: number | null;
  /** Σ billed on ISSUED (sent/paid), non-voided invoices, counting only lines
   *  billed against the ORIGINATING ESTIMATE. Includes a deposit invoice's
   *  line when that deposit is billed against the contract. */
  issuedAgainstContract: number;
  /** The same sum over invoices that are still draft/pending_approval. Kept
   *  SEPARATE because a draft has billed nothing — but the draw math must
   *  still count it, or two drafts open at once each bill the same remainder. */
  draftAgainstContract: number;
  /** Σ ISSUED refunds with source='deposit' whose payment was applied to an
   *  invoice still in the issued set. Scoped that way so voiding AND refunding
   *  the same deposit cannot subtract it twice. */
  depositRefunded: number;
  /** original − (issuedAgainstContract − depositRefunded). NULL when original
   *  is null — never 0, which would read as "nothing left to bill". */
  remainingToBill: number | null;
}

/**
 * §3 / acceptance #4 — what is left to invoice on the ORIGINAL contract.
 *
 * ORIGINAL, not revised, and deliberately: a signed CO bills separately on its
 * own terms (§4, P4) and carries its own remaining. Mixing them would hand back
 * a single number that belongs to no instrument — the same reasoning that keeps
 * a percentage draw priced off the original (trace G rule (a)).
 */
export async function getContractBilling(
  projectId: string,
  /** The invoice being BUILT, excluded from the sums so its own draft lines do
   *  not count as already billed while the user is still editing them. */
  excludeInvoiceId?: string
): Promise<ContractBilling> {
  const supabase = await createClient();

  const [{ data: project }, { data: financials }] = await Promise.all([
    supabase.from('projects').select('source_estimate_id').eq('id', projectId).maybeSingle(),
    supabase
      .from('project_financials')
      .select('contract_value')
      .eq('project_id', projectId)
      .maybeSingle(),
  ]);

  const original = financials?.contract_value ?? null;
  const estimateId = project?.source_estimate_id ?? null;

  const empty: ContractBilling = {
    original,
    issuedAgainstContract: 0,
    draftAgainstContract: 0,
    depositRefunded: 0,
    remainingToBill: original,
  };
  if (!estimateId) return empty;

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    // A VOIDED invoice billed nothing. This one predicate is the whole of
    // "voiding restores the figure" — there is no cleanup step.
    .neq('status', 'voided');

  const considered = (invoices ?? []).filter((i) => i.id !== excludeInvoiceId);

  const issuedIds = considered
    .filter((i) => i.status === 'sent' || i.status === 'paid')
    .map((i) => i.id);
  const draftIds = considered
    .filter((i) => i.status === 'draft' || i.status === 'pending_approval')
    .map((i) => i.id);
  if (issuedIds.length + draftIds.length === 0) return empty;

  // ONLY lines billed against the CONTRACT instrument. A CO's lines, and a
  // standalone income line, are other instruments' money and must not reduce
  // what remains on this one.
  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('invoice_id, billed_amount')
    .in('invoice_id', [...issuedIds, ...draftIds])
    .eq('source_estimate_id', estimateId);

  const issuedSet = new Set(issuedIds);
  let issuedAgainstContract = 0;
  let draftAgainstContract = 0;
  for (const l of lines ?? []) {
    const amount = Number(l.billed_amount);
    if (issuedSet.has(l.invoice_id)) {
      issuedAgainstContract = Math.round((issuedAgainstContract + amount) * 100) / 100;
    } else {
      draftAgainstContract = Math.round((draftAgainstContract + amount) * 100) / 100;
    }
  }

  // Refunds. Scoped through the payment that was applied to a still-issued
  // invoice, so a deposit that was BOTH voided and refunded is subtracted once
  // (the void already removed its line) rather than twice.
  //
  // DEPOSIT refunds only [S97]. Josh's ruling is about the deposit; an
  // overpayment refund does not un-bill anything, and nothing has ruled on the
  // other sources — they are deliberately out of scope rather than assumed.
  let depositRefunded = 0;
  if (issuedIds.length > 0) {
    const { data: refunds } = await supabase
      .from('client_refunds')
      .select('amount, source_payment_id')
      .eq('project_id', projectId)
      .eq('source', 'deposit')
      .eq('status', 'issued')
      .eq('is_deleted', false);

    const paymentIds = (refunds ?? [])
      .map((r) => r.source_payment_id)
      .filter((id): id is string => Boolean(id));

    if (paymentIds.length > 0) {
      const { data: applications } = await supabase
        .from('client_payment_applications')
        .select('payment_id, invoice_id')
        .in('payment_id', paymentIds)
        .eq('is_deleted', false);
      const paymentsOnLiveInvoices = new Set(
        (applications ?? [])
          .filter((a) => issuedSet.has(a.invoice_id))
          .map((a) => a.payment_id)
      );
      for (const r of refunds ?? []) {
        if (r.source_payment_id && paymentsOnLiveInvoices.has(r.source_payment_id)) {
          depositRefunded = Math.round((depositRefunded + Number(r.amount)) * 100) / 100;
        }
      }
    }
  }

  // Clamped at zero: a refund can only give back what was billed, so net
  // contract billing can never go negative and remaining can never exceed the
  // contract. (Over-billing IS representable — remainingToBill goes negative —
  // because that is a real condition worth surfacing.)
  const netBilled = Math.max(0, Math.round((issuedAgainstContract - depositRefunded) * 100) / 100);

  return {
    original,
    issuedAgainstContract,
    draftAgainstContract,
    depositRefunded,
    remainingToBill:
      original === null ? null : Math.round((original - netBilled) * 100) / 100,
  };
}

// ── §4 — REMAINING ON CHANGE ORDERS [S97, 2026-08-03] ───────────────────────
//
// Budget & Cost showed what the COs are WORTH ("Signed COs") and what is left
// on the CONTRACT, and omitted the figure connecting them: how much of the CO
// book has been billed. That omission is what let "Remaining to bill" read as
// the job's remaining while covering only the contract.
//
// A SINGLE "remaining including COs" NUMBER WOULD BE A LIE, because only one of
// the three kinds of CO has a remaining at all:
//
//   FIXED-PRICE, positive   remaining = net_delta − billed against it.
//                           Well defined; same shape as the contract's.
//   COST-PLUS / T&M         UNDEFINED BY CONSTRUCTION. There is no fixed amount
//                           to remain — that is precisely why derived billing
//                           (§6/§7) and §3a exist. No number is printed.
//   NEGATIVE (§4a)          EXCLUDED ENTIRELY. Its money is a credit to GIVE,
//                           not scope to bill, and adding it to a
//                           remaining-to-bill sum would understate what is
//                           still owed by the size of the credit.
//
// DERIVED, never stored — void self-corrects with no cleanup, like everything
// else in this module.

export type ChangeOrderRemainingKind = 'fixed_remaining' | 'as_incurred' | 'credit';

export interface ChangeOrderRemaining {
  changeOrderId: string;
  coNumber: string;
  title: string;
  kind: ChangeOrderRemainingKind;
  /** Signed net_delta — negative on a credit CO. */
  netDelta: number;
  /** Σ billed on ISSUED (sent/paid), non-voided invoices. */
  billed: number;
  /** net_delta − billed, and ONLY on a fixed-price positive CO. NULL on the
   *  other two kinds, which have no remaining to state. Never 0-as-unknown. */
  remaining: number | null;
}

export interface ChangeOrderBilling {
  orders: ChangeOrderRemaining[];
  /** Σ remaining over FIXED-PRICE POSITIVE COs only. */
  fixedRemaining: number;
  fixedCount: number;
  /** COs billed as work happens — counted, never totalled. */
  asIncurredCount: number;
  /** Negative COs, excluded from every sum above. */
  creditCount: number;
}

/**
 * §4 — what is left to bill on each signed change order.
 *
 * ISSUED invoices only, matching getContractBilling: a draft has billed
 * nothing. A VOIDED invoice's lines are retained (§9) but bill nothing, so
 * voiding returns the remaining with no cleanup step.
 */
export async function getChangeOrderBilling(projectId: string): Promise<ChangeOrderBilling> {
  const supabase = await createClient();

  const empty: ChangeOrderBilling = {
    orders: [],
    fixedRemaining: 0,
    fixedCount: 0,
    asIncurredCount: 0,
    creditCount: 0,
  };

  const { data: cos } = await supabase
    .from('change_orders')
    .select('id, co_number, title, co_type, net_delta')
    .eq('project_id', projectId)
    .match(CONTRACT_CONTRIBUTING_CO_FILTER)
    .order('co_number', { ascending: true });
  if (!cos || cos.length === 0) return empty;

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .neq('status', 'voided');
  const issuedIds = (invoices ?? [])
    .filter((i) => i.status === 'sent' || i.status === 'paid')
    .map((i) => i.id);

  const billedByCo = new Map<string, number>();
  if (issuedIds.length > 0) {
    const { data: lines } = await supabase
      .from('invoice_lines')
      .select('source_change_order_id, billed_amount')
      .in('invoice_id', issuedIds)
      .in(
        'source_change_order_id',
        cos.map((co) => co.id)
      );
    for (const l of lines ?? []) {
      if (!l.source_change_order_id) continue;
      billedByCo.set(
        l.source_change_order_id,
        Math.round(
          ((billedByCo.get(l.source_change_order_id) ?? 0) + Number(l.billed_amount)) * 100
        ) / 100
      );
    }
  }

  const orders: ChangeOrderRemaining[] = [];
  let fixedRemaining = 0;
  let fixedCount = 0;
  let asIncurredCount = 0;
  let creditCount = 0;

  for (const co of cos) {
    const netDelta = Number(co.net_delta ?? 0);
    const billed = billedByCo.get(co.id) ?? 0;

    // ORDER MATTERS: a negative CO is a credit whatever its type. Checking the
    // type first would give a negative cost-plus CO an "as incurred" caption
    // and hide that it is money owed BACK.
    let kind: ChangeOrderRemainingKind;
    if (netDelta < 0) kind = 'credit';
    else if (co.co_type !== 'fixed_price') kind = 'as_incurred';
    else kind = 'fixed_remaining';

    let remaining: number | null = null;
    if (kind === 'fixed_remaining') {
      remaining = Math.round((netDelta - billed) * 100) / 100;
      fixedRemaining = Math.round((fixedRemaining + remaining) * 100) / 100;
      fixedCount += 1;
    } else if (kind === 'as_incurred') {
      asIncurredCount += 1;
    } else {
      creditCount += 1;
    }

    orders.push({
      changeOrderId: co.id,
      coNumber: co.co_number,
      title: co.title ?? '',
      kind,
      netDelta,
      billed,
      remaining,
    });
  }

  return { orders, fixedRemaining, fixedCount, asIncurredCount, creditCount };
}

/**
 * Batch derivation for list surfaces (7B §3 row 6) — one grouped query, no
 * N+1. Returns an entry for every id the caller can see (RLS-scoped).
 */
export async function getRevisedContractMap(
  projectIds: string[]
): Promise<Record<string, RevisedContract>> {
  if (projectIds.length === 0) return {};
  const supabase = await createClient();

  const [{ data: financials }, { data: cos }, { data: projects }, { data: sels }] = await Promise.all([
    supabase
      .from('project_financials')
      .select('project_id, contract_value')
      .in('project_id', projectIds),
    supabase
      .from('change_orders')
      .select('project_id, net_delta')
      .in('project_id', projectIds)
      .match(CONTRACT_CONTRIBUTING_CO_FILTER),
    supabase.from('projects').select('id, project_type').in('id', projectIds),
    supabase
      .from('selections')
      .select('project_id, signed_variance')
      .in('project_id', projectIds)
      .match(CONTRACT_CONTRIBUTING_SELECTION_FILTER),
  ]);

  const deltas: Record<string, number> = {};
  for (const co of cos ?? []) {
    deltas[co.project_id] = (deltas[co.project_id] ?? 0) + (co.net_delta ?? 0);
  }
  const isFixedById = new Map((projects ?? []).map((p) => [p.id, p.project_type === 'fixed_price']));
  const variances: Record<string, number> = {};
  for (const sel of sels ?? []) {
    variances[sel.project_id] =
      Math.round(((variances[sel.project_id] ?? 0) + (sel.signed_variance ?? 0)) * 100) / 100;
  }

  // Key off the REQUESTED ids, not the rows returned: below Owner/Admin there
  // are no rows, and a caller asking about a project it can see must still get
  // an entry (with a null original) rather than a missing key.
  const byProject: Record<string, number | null> = {};
  for (const f of financials ?? []) byProject[f.project_id] = f.contract_value;

  const map: Record<string, RevisedContract> = {};
  for (const id of projectIds) {
    const variance = variances[id] ?? 0;
    const isFixed = isFixedById.get(id) === true;
    map[id] = toRevised(
      byProject[id] ?? null,
      deltas[id] ?? 0,
      isFixed ? variance : 0,
      !isFixed && variance !== 0
    );
  }
  return map;
}

/**
 * Portfolio derivation for the dashboard KPI: active projects only, RLS-scoped
 * (Owner/Admin see all; PM/Foreman/Crew see assigned — matching dashboard.ts).
 */
export async function getPortfolioRevisedContract(): Promise<PortfolioRevisedContract> {
  const supabase = await createClient();

  const { data: active } = await supabase
    .from('projects')
    .select('id, project_type')
    .eq('status', 'active')
    .eq('is_deleted', false);

  const activeIds = (active ?? []).map((p) => p.id);
  const isFixedById = new Map(
    (active ?? []).map((p) => [p.id, p.project_type === 'fixed_price'])
  );

  // RLS on project_financials does the gating: Owner/Admin get rows, everyone
  // else gets none, so the sum is 0 and visibleCount is 0.
  const { data: financials } = activeIds.length
    ? await supabase
        .from('project_financials')
        .select('project_id, contract_value')
        .in('project_id', activeIds)
    : { data: [] as { project_id: string; contract_value: number | null }[] };

  const { data: cos } = activeIds.length
    ? await supabase
        .from('change_orders')
        .select('project_id, net_delta')
        .in('project_id', activeIds)
        .match(CONTRACT_CONTRIBUTING_CO_FILTER)
    : { data: [] as { project_id: string; net_delta: number }[] };

  // [S175 stage 5] Approved selection variances — FIXED-PRICE ONLY, per the
  // same split the CO deltas already respect below. On a projected project the
  // variance is neither added nor summed: the portfolio KPI is the one place a
  // single number would silently absorb it, which is precisely what the
  // fixed/projected split was introduced to stop.
  const { data: sels } = activeIds.length
    ? await supabase
        .from('selections')
        .select('project_id, signed_variance')
        .in('project_id', activeIds)
        .match(CONTRACT_CONTRIBUTING_SELECTION_FILTER)
    : { data: [] as { project_id: string; signed_variance: number | null }[] };

  let originalSum = 0;
  let fixedRevisedSum = 0;
  let projectedRevisedSum = 0;
  let fixedCount = 0;
  let projectedCount = 0;
  for (const f of financials ?? []) {
    const value = f.contract_value ?? 0;
    originalSum += value;
    if (isFixedById.get(f.project_id)) {
      fixedRevisedSum += value;
      fixedCount += 1;
    } else {
      projectedRevisedSum += value;
      projectedCount += 1;
    }
  }

  let signedDeltaSum = 0;
  for (const co of cos ?? []) {
    const delta = co.net_delta ?? 0;
    signedDeltaSum += delta;
    // A CO's delta belongs to whichever side its PROJECT is on, so each half
    // stays internally consistent rather than mixing at the delta level.
    if (isFixedById.get(co.project_id)) fixedRevisedSum += delta;
    else projectedRevisedSum += delta;
  }

  let selectionDeltaSum = 0;
  for (const sel of sels ?? []) {
    // Only the FIXED side. A projected project's variance is dropped here and
    // reported as excluded by the per-project derivers — the KPI headline has
    // no caveat channel of its own, so the exclusion is made visible one level
    // down rather than hidden one level up.
    if (!isFixedById.get(sel.project_id)) continue;
    const v = sel.signed_variance ?? 0;
    selectionDeltaSum += v;
    fixedRevisedSum += v;
  }

  return {
    originalSum,
    signedDeltaSum,
    selectionDeltaSum: Math.round(selectionDeltaSum * 100) / 100,
    revisedSum: originalSum + signedDeltaSum + selectionDeltaSum,
    visibleCount: (financials ?? []).length,
    fixedRevisedSum: Math.round(fixedRevisedSum * 100) / 100,
    fixedCount,
    projectedRevisedSum: Math.round(projectedRevisedSum * 100) / 100,
    projectedCount,
  };
}

// ── [S175 stage 5] REMAINING ON SELECTIONS — the §7.1 sibling of the CO read ─
//
// §7.1 proposed `getSelectionBilling()` as billed-vs-signed → remaining. It is
// exactly that and nothing more: a READ. The thing that actually stops a $400
// variance being billed five times is `enforce_selection_billing_ceiling()`
// (20261034000000), because a read does not constrain a write [Josh, S175
// Q3.3]. This function exists so the Budget page and the invoice builder can
// SHOW the figure the trigger enforces, from the same definition.
//
// THREE KINDS, mirroring ChangeOrderRemainingKind, and for the same reason —
// only one of them has a remaining at all:
//
//   fixed_remaining  the allowance's instrument is FIXED-PRICE: the overage
//                    bills as a fixed line; remaining = signed_variance − billed.
//   as_incurred      the allowance's instrument is COST-PLUS / T&M: the
//                    selection's cost bills as incurred through that
//                    instrument's rates (getPickableCosts already offers the
//                    tagged allocation), so a fixed "overage" line on top would
//                    bill the same money twice. No line is offered; no number.
//   credit           signed_variance < 0 (§7.2): money to GIVE, placed as a
//                    sourced credit_allowance line. `billed` here is the
//                    APPLIED magnitude; remaining is null.
//
// The kind comes from selection-money.ts, which is also what profitability
// reads — one answer to "fixed or as-incurred", not two.


export type SelectionRemainingKind = 'fixed_remaining' | 'as_incurred' | 'credit';

export interface SelectionRemaining {
  selectionId: string;
  name: string;
  kind: SelectionRemainingKind;
  /** Signed variance — negative on a credit. */
  signedVariance: number;
  /** fixed_remaining: Σ billed on ISSUED (sent/paid), non-voided invoices.
   *  credit: Σ |credit_allowance| applied on LIVE (non-voided) invoices, drafts
   *  included — a credit placed on a draft is already spoken for (§4a's shape). */
  billed: number;
  /** signed_variance − billed, ONLY on fixed_remaining. NULL otherwise — never
   *  0-as-unknown. */
  remaining: number | null;
}

export interface SelectionBilling {
  selections: SelectionRemaining[];
  /** Σ remaining over fixed_remaining selections only. */
  fixedRemaining: number;
  fixedCount: number;
  asIncurredCount: number;
  creditCount: number;
}

export async function getSelectionBilling(
  projectId: string,
  /** The invoice being BUILT — its own draft lines are excluded from `billed`
   *  on the fixed side so the builder does not count what it is editing. */
  excludeInvoiceId?: string
): Promise<SelectionBilling> {
  const supabase = await createClient();
  const empty: SelectionBilling = {
    selections: [],
    fixedRemaining: 0,
    fixedCount: 0,
    asIncurredCount: 0,
    creditCount: 0,
  };

  const approved = await loadApprovedSelectionMoney(supabase, projectId);
  if (approved.length === 0) return empty;

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .neq('status', 'voided');
  const live = (invoices ?? []).filter((i) => i.id !== excludeInvoiceId);
  const liveIds = live.map((i) => i.id);
  const issued = new Set(live.filter((i) => i.status === 'sent' || i.status === 'paid').map((i) => i.id));

  const billedById = new Map<string, number>();
  const appliedById = new Map<string, number>();
  if (liveIds.length > 0) {
    const { data: lines } = await supabase
      .from('invoice_lines')
      .select('invoice_id, source_selection_id, billed_amount, line_type')
      .in('invoice_id', liveIds)
      .in('source_selection_id', approved.map((s) => s.id));
    for (const l of lines ?? []) {
      if (!l.source_selection_id) continue;
      const amount = Number(l.billed_amount);
      if (l.line_type === 'credit_allowance') {
        // Applied credit — live invoices, drafts included.
        appliedById.set(
          l.source_selection_id,
          Math.round(((appliedById.get(l.source_selection_id) ?? 0) + Math.abs(amount)) * 100) / 100
        );
      } else if (issued.has(l.invoice_id)) {
        billedById.set(
          l.source_selection_id,
          Math.round(((billedById.get(l.source_selection_id) ?? 0) + amount) * 100) / 100
        );
      }
    }
  }

  const selections: SelectionRemaining[] = approved.map((s) => {
    if (s.signedVariance < 0) {
      return {
        selectionId: s.id,
        name: s.name,
        kind: 'credit',
        signedVariance: s.signedVariance,
        billed: appliedById.get(s.id) ?? 0,
        remaining: null,
      };
    }
    if (s.asIncurred) {
      return {
        selectionId: s.id,
        name: s.name,
        kind: 'as_incurred',
        signedVariance: s.signedVariance,
        billed: billedById.get(s.id) ?? 0,
        remaining: null,
      };
    }
    const billed = billedById.get(s.id) ?? 0;
    return {
      selectionId: s.id,
      name: s.name,
      kind: 'fixed_remaining',
      signedVariance: s.signedVariance,
      billed,
      remaining: Math.round((s.signedVariance - billed) * 100) / 100,
    };
  });

  const fixed = selections.filter((s) => s.kind === 'fixed_remaining');
  return {
    selections,
    fixedRemaining: Math.round(fixed.reduce((n, s) => n + (s.remaining ?? 0), 0) * 100) / 100,
    fixedCount: fixed.length,
    asIncurredCount: selections.filter((s) => s.kind === 'as_incurred').length,
    creditCount: selections.filter((s) => s.kind === 'credit').length,
  };
}
