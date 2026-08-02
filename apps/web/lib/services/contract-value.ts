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
    .select('id')
    .eq('status', 'active')
    .eq('is_deleted', false);

  const activeIds = (active ?? []).map((p) => p.id);

  // RLS on project_financials does the gating: Owner/Admin get rows, everyone
  // else gets none, so the sum is 0 and visibleCount is 0.
  const { data: financials } = activeIds.length
    ? await supabase
        .from('project_financials')
        .select('contract_value')
        .in('project_id', activeIds)
    : { data: [] as { contract_value: number | null }[] };

  const { data: cos } = activeIds.length
    ? await supabase
        .from('change_orders')
        .select('net_delta')
        .in('project_id', activeIds)
        .match(CONTRACT_CONTRIBUTING_CO_FILTER)
    : { data: [] as { net_delta: number }[] };

  const originalSum = (financials ?? []).reduce((sum, f) => sum + (f.contract_value ?? 0), 0);
  const signedDeltaSum = (cos ?? []).reduce((sum, co) => sum + (co.net_delta ?? 0), 0);

  return {
    originalSum,
    signedDeltaSum,
    revisedSum: originalSum + signedDeltaSum,
    visibleCount: (financials ?? []).length,
  };
}
