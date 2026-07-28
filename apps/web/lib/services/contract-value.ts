import { createClient } from '@/lib/supabase-server';

// 7B — Contract Value (docs/specs/7B-spec.md §2). projects.contract_value is
// NEVER mutated: it holds the original set at conversion. The revised total is
// DERIVED here and only here — original + Σ(client-signed CO net_delta),
// bidirectional (a negative CO lowers it). Voided/draft/sent COs contribute
// nothing; 'signed' is reachable only through the client token flow
// (co-signing-service.ts). No trigger, no stored revised column, no view.

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
  original: number | null; // projects.contract_value, never mutated
  signedDelta: number; // Σ net_delta of contributing COs (signed values, ±)
  revised: number | null; // original + signedDelta; null when original is null
}

export interface PortfolioRevisedContract {
  originalSum: number; // Σ contract_value over active projects
  signedDeltaSum: number; // Σ net_delta of contributing COs on those projects
  revisedSum: number; // originalSum + signedDeltaSum
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

  const [{ data: project }, { data: cos }] = await Promise.all([
    supabase.from('projects').select('contract_value').eq('id', projectId).single(),
    supabase
      .from('change_orders')
      .select('net_delta')
      .eq('project_id', projectId)
      .match(CONTRACT_CONTRIBUTING_CO_FILTER),
  ]);

  const signedDelta = (cos ?? []).reduce((sum, co) => sum + (co.net_delta ?? 0), 0);
  return toRevised(project?.contract_value ?? null, signedDelta);
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

  const [{ data: projects }, { data: cos }] = await Promise.all([
    supabase.from('projects').select('id, contract_value').in('id', projectIds),
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

  const map: Record<string, RevisedContract> = {};
  for (const p of projects ?? []) {
    map[p.id] = toRevised(p.contract_value ?? null, deltas[p.id] ?? 0);
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
    .select('id, contract_value')
    .eq('status', 'active')
    .eq('is_deleted', false);

  const activeIds = (active ?? []).map((p) => p.id);

  const { data: cos } = activeIds.length
    ? await supabase
        .from('change_orders')
        .select('net_delta')
        .in('project_id', activeIds)
        .match(CONTRACT_CONTRIBUTING_CO_FILTER)
    : { data: [] as { net_delta: number }[] };

  const originalSum = (active ?? []).reduce((sum, p) => sum + (p.contract_value ?? 0), 0);
  const signedDeltaSum = (cos ?? []).reduce((sum, co) => sum + (co.net_delta ?? 0), 0);

  return { originalSum, signedDeltaSum, revisedSum: originalSum + signedDeltaSum };
}
