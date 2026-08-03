import { createClient } from '@/lib/supabase-server';

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

export interface RevisedContract {
  /** project_financials.contract_value — never mutated. NULL for a project
   *  with no value set AND for any caller below Owner/Admin (RLS). */
  original: number | null;
  signedDelta: number; // Σ net_delta of contributing COs (signed values, ±)
  revised: number | null; // original + signedDelta; null when original is null
}

export interface PortfolioRevisedContract {
  /** Σ contract_value over active projects the caller can READ. Below
   *  Owner/Admin that is zero rows, so the sum is 0 — see visibleCount. */
  originalSum: number;
  signedDeltaSum: number; // Σ net_delta of contributing COs on those projects
  revisedSum: number; // originalSum + signedDeltaSum
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

function toRevised(original: number | null, signedDelta: number): RevisedContract {
  return {
    original,
    signedDelta,
    revised: original !== null ? original + signedDelta : null,
  };
}

/** Per-project derivation — the only legal read of revised contract value. */
export async function getRevisedContract(projectId: string): Promise<RevisedContract> {
  const supabase = await createClient();

  const [{ data: financials }, { data: cos }] = await Promise.all([
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
  ]);

  const signedDelta = (cos ?? []).reduce((sum, co) => sum + (co.net_delta ?? 0), 0);
  return toRevised(financials?.contract_value ?? null, signedDelta);
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

  const [{ data: financials }, { data: cos }] = await Promise.all([
    supabase
      .from('project_financials')
      .select('project_id, contract_value')
      .in('project_id', projectIds),
    supabase
      .from('change_orders')
      .select('project_id, net_delta')
      .in('project_id', projectIds)
      .match(CONTRACT_CONTRIBUTING_CO_FILTER),
  ]);

  const deltas: Record<string, number> = {};
  for (const co of cos ?? []) {
    deltas[co.project_id] = (deltas[co.project_id] ?? 0) + (co.net_delta ?? 0);
  }

  // Key off the REQUESTED ids, not the rows returned: below Owner/Admin there
  // are no rows, and a caller asking about a project it can see must still get
  // an entry (with a null original) rather than a missing key.
  const byProject: Record<string, number | null> = {};
  for (const f of financials ?? []) byProject[f.project_id] = f.contract_value;

  const map: Record<string, RevisedContract> = {};
  for (const id of projectIds) {
    map[id] = toRevised(byProject[id] ?? null, deltas[id] ?? 0);
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

  return {
    originalSum,
    signedDeltaSum,
    revisedSum: originalSum + signedDeltaSum,
    visibleCount: (financials ?? []).length,
    fixedRevisedSum: Math.round(fixedRevisedSum * 100) / 100,
    fixedCount,
    projectedRevisedSum: Math.round(projectedRevisedSum * 100) / 100,
    projectedCount,
  };
}
