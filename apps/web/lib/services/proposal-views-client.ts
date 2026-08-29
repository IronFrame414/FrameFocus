import { createClient } from '@/lib/supabase-browser';
import { deriveViewStats, type ProposalViewStats } from '@/lib/proposal/view-filter';

export type { ProposalViewStats };

/**
 * Per-estimate open stats, derived from proposal_views rows at read time
 * (spec §5). RLS does the role work: the SELECT policy contains on the
 * estimate's own floor, so an Owner/Admin sees every estimate's activity, the
 * authoring PM their own, and everyone else zero rows — this function never
 * filters by role itself.
 */
export async function getProposalViewStats(
  estimateIds: string[]
): Promise<Record<string, ProposalViewStats>> {
  if (estimateIds.length === 0) return {};
  const supabase = createClient();

  const { data, error } = await supabase
    .from('proposal_views')
    .select('estimate_id, created_at, user_agent')
    .in('estimate_id', estimateIds);

  if (error) return {};
  return deriveViewStats(data ?? []);
}
