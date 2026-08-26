import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { isDerivedContract, type ContractType } from '@/lib/services/invoices-shared';

// ============================================================================
// [S175 stage 5] AN APPROVED SELECTION AS A MONEY INSTRUMENT — the one read
// that both getSelectionBilling() (7B/7D) and profitability.ts (7H) share.
// ============================================================================
//
// WHY THIS IS ONE FILE AND NOT A QUERY IN EACH CALLER. The question "does this
// selection bill as a FIXED figure or AS INCURRED?" has one answer, and it is
// decided by the instrument the selection's ALLOWANCE belongs to — not by the
// project's type alone. Q3.2 [Josh, S175] rules the CONTRACT-VALUE side on
// project type (fixed-price only), but a fixed-price CO on a cost-plus job can
// carry an allowance, and a selection against it has a signed, fixed sell
// while the rest of the job bills as incurred. Two callers each deciding this
// for themselves is the #129 divergence written as agreement.
//
// THE RULE, per instrument (money-rep P4 — contract type lives on the
// instrument):
//
//   FIXED parent   the selection is its OWN instrument (`sel:<id>`): its sell
//                  is signed_sell_amount, its overage bills as a fixed line
//                  capped at signed_variance (enforce_selection_billing_ceiling),
//                  and its cost is the allocations tagged with it.
//   DERIVED parent (cost-plus / T&M) the selection is NOT a separate revenue
//                  instrument. Its cost bills AS INCURRED through the parent's
//                  rates — getPickableCosts already offers a tagged allocation
//                  that way, transitively through the allowance line — so a
//                  fixed line for the "overage" on top would bill the same
//                  money twice. signed_variance is informational there.
//
// The parent instrument: the allowance line's source_change_order_id → that
// CO's co_type; otherwise the originating estimate → projects.project_type.
// An UNLINKED selection (Q8) has no allowance line and takes the project's
// type, which is the originating estimate's.
// ============================================================================

export interface ApprovedSelectionMoney {
  id: string;
  name: string;
  /** Σ chosen options' sell at the signature (§5.3). */
  signedSellAmount: number;
  /** signed_sell_amount − the allowance's sell; negative on a credit (§7.2). */
  signedVariance: number;
  allowanceBudgetItemId: string | null;
  /** The PARENT instrument's contract type — see the header. */
  parentContractType: ContractType;
  /** `co:<id>` or `est:<id>` — the parent's key, or null when the project has
   *  no originating estimate (a manual project). */
  parentInstrumentKey: string | null;
  /** True when the selection bills as incurred through its parent's rates. */
  asIncurred: boolean;
}

/** The exact filter contract-value.ts applies — restated here by IMPORT in
 *  that file, not by a second literal. `approved` is reachable only through
 *  completeSelectionSignature; a client-supplied selection is approved with
 *  NULL stamps and is excluded by the `not is null` below. */
export async function loadApprovedSelectionMoney(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<ApprovedSelectionMoney[]> {
  const [{ data: project }, { data: sels }] = await Promise.all([
    supabase
      .from('projects')
      .select('project_type, source_estimate_id')
      .eq('id', projectId)
      .maybeSingle(),
    supabase
      .from('selections')
      .select('id, name, signed_sell_amount, signed_variance, allowance_budget_item_id')
      .eq('project_id', projectId)
      .eq('status', 'approved')
      .eq('is_deleted', false)
      .not('signed_variance', 'is', null)
      .order('created_at', { ascending: true }),
  ]);
  if (!sels || sels.length === 0) return [];

  const projectType = (project?.project_type ?? 'fixed_price') as ContractType;
  const estimateKey = project?.source_estimate_id ? `est:${project.source_estimate_id}` : null;

  // The allowance lines these selections draw on, and the CO (if any) each
  // belongs to. One query per table, not one per selection.
  const itemIds = [
    ...new Set(sels.map((s) => s.allowance_budget_item_id).filter((v): v is string => Boolean(v))),
  ];
  const { data: items } = itemIds.length
    ? await supabase
        .from('project_budget_items')
        .select('id, source_change_order_id')
        .in('id', itemIds)
    : { data: [] as { id: string; source_change_order_id: string | null }[] };
  const coIds = [
    ...new Set((items ?? []).map((i) => i.source_change_order_id).filter((v): v is string => Boolean(v))),
  ];
  const { data: cos } = coIds.length
    ? await supabase.from('change_orders').select('id, co_type').in('id', coIds)
    : { data: [] as { id: string; co_type: string | null }[] };

  const coByItem = new Map((items ?? []).map((i) => [i.id, i.source_change_order_id]));
  const coType = new Map((cos ?? []).map((c) => [c.id, (c.co_type ?? 'fixed_price') as ContractType]));

  return sels.map((s) => {
    const coId = s.allowance_budget_item_id ? coByItem.get(s.allowance_budget_item_id) ?? null : null;
    const parentContractType = coId ? coType.get(coId) ?? 'fixed_price' : projectType;
    return {
      id: s.id,
      name: s.name,
      signedSellAmount: Number(s.signed_sell_amount ?? 0),
      signedVariance: Number(s.signed_variance),
      allowanceBudgetItemId: s.allowance_budget_item_id,
      parentContractType,
      parentInstrumentKey: coId ? `co:${coId}` : estimateKey,
      asIncurred: isDerivedContract(parentContractType),
    };
  });
}

/** The instrument key a selection carries when it IS its own instrument. */
export function selectionInstrumentKey(selectionId: string): string {
  return `sel:${selectionId}`;
}
