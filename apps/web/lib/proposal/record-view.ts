import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

// The write half of proposal view tracking — spec §2. Called ONLY from the
// public signing page, with the service-role client: proposal_views has no
// write policies at all (the signing-surface precedent), so this is the one
// door. The caller decides own-view-or-not; this function just records.

export async function recordProposalView(
  admin: SupabaseClient<Database>,
  params: { companyId: string; estimateId: string; userAgent: string | null }
): Promise<void> {
  // A failed log must NEVER break the signing page — the proposal rendering
  // is the product, the row is telemetry.
  try {
    const { error } = await admin.from('proposal_views').insert({
      company_id: params.companyId,
      estimate_id: params.estimateId,
      user_agent: params.userAgent,
    });
    if (error) {
      console.error('[proposal-views] insert failed', { estimateId: params.estimateId, error: error.message });
      return;
    }

    // viewed_at is the denormalised "first counted view" stamp, kept in step
    // by ruling — set once, here, never rewritten. (Status 'viewed' is retired
    // unused: adopting it would force widening every status='sent' check on
    // this surface for nothing the rows don't already answer.)
    const { error: stampError } = await admin
      .from('estimates')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', params.estimateId)
      .is('viewed_at', null);
    if (stampError) {
      console.error('[proposal-views] viewed_at stamp failed', {
        estimateId: params.estimateId,
        error: stampError.message,
      });
    }
  } catch (e) {
    console.error('[proposal-views] record failed', e);
  }
}
