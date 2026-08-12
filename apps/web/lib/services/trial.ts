import 'server-only';
import { createClient } from '@/lib/supabase-server';

/**
 * S138 — server-side reads for the trial screens.
 *
 * Every read here is RLS-scoped to the caller. `trial_lifecycle` and
 * `trial_warning_acknowledgements` are both Owner/Admin SELECT
 * (20260918000000), so a PM, foreman, crew member or subcontractor gets
 * nothing back rather than a filtered view — which is why the pages that use
 * these check the role and redirect instead of rendering an empty state.
 */

export interface TrialLifecycle {
  company_id: string;
  trial_end: string;
  warned_7_at: string | null;
  warned_3_at: string | null;
  locked_at: string | null;
  delete_after: string | null;
  postponed_until: string | null;
  deleted_at: string | null;
}

export interface TrialAcknowledgement {
  id: string;
  profile_id: string;
  warning_kind: 'day_7' | 'day_3';
  created_at: string;
}

export async function getTrialLifecycle(): Promise<TrialLifecycle | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('trial_lifecycle')
    .select(
      'company_id, trial_end, warned_7_at, warned_3_at, locked_at, delete_after, postponed_until, deleted_at'
    )
    .maybeSingle();
  return (data as TrialLifecycle | null) ?? null;
}

export async function getTrialAcknowledgements(): Promise<TrialAcknowledgement[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('trial_warning_acknowledgements')
    .select('id, profile_id, warning_kind, created_at')
    .order('created_at', { ascending: false });
  return (data as TrialAcknowledgement[] | null) ?? [];
}

/**
 * Whole days until the trial ends, rounding UP — mirrors `daysUntil()` in
 * lib/trial/lifecycle.ts.
 *
 * ⚠️ THE TWO MUST AGREE. The cron decides WHICH warning to send from its copy;
 * this decides what the screen SAYS. If they round differently, a customer is
 * emailed "3 days" and shown "2 days" on the same afternoon. Kept as a
 * re-export rather than a second implementation.
 */
export { daysUntil } from '@/lib/trial/lifecycle';
