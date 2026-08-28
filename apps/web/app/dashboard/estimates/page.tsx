import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { EstimatesList } from './estimates-list';

/**
 * 14b Estimates (desktop-redesign §8.2).
 *
 * ⚠️ Proposal VIEW TRACKING IS NOT BUILT (prerequisite P3) and is NOT built
 * here — it is its own item, and the write path is the whole security
 * question (public, logged-out link). Until it lands, the Client activity
 * column renders from what exists — "sent <date>" / "not sent" — and upgrades
 * to real open-tracking without a layout change. `estimates.viewed_at` and
 * status 'viewed' are waiting for their writer.
 */
export default async function EstimatesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();

  // §4.13: Foreman/Crew have no estimates access (RLS also blocks).
  if (!profile || !['owner', 'admin', 'project_manager'].includes(profile.role)) {
    redirect('/dashboard');
  }

  // ── Metric inputs — one grouped read, caller-RLS-scoped (a PM's win rate
  //    is over the estimates they can see; that is the floor, not a bug) ────
  const { data: rows } = await supabase
    .from('estimates')
    .select('status, sent_at, expires_at')
    .eq('is_deleted', false);

  const now = Date.now();
  // Win rate — RULED: a 12-MONTH window, not the mockup's 90 days. Cohort =
  // estimates SENT in the window; won = accepted OR converted (conversion
  // flips 'accepted' to 'converted', so counting 'accepted' alone would make
  // the rate fall every time a job is won hard enough to convert).
  const twelveMonthsAgo = now - 365 * 86_400_000;
  const cohort = (rows ?? []).filter(
    (r) => r.sent_at && new Date(r.sent_at).getTime() >= twelveMonthsAgo
  );
  const won = cohort.filter((r) => r.status === 'accepted' || r.status === 'converted').length;
  const winRate = cohort.length > 0 ? Math.round((won / cohort.length) * 100) : null;

  // Expiring soon — sent estimates whose stored expiry falls in the next
  // 7 days (the window is a recorded decision; the mockup names none).
  const sevenDaysOut = now + 7 * 86_400_000;
  const expiringSoon = (rows ?? []).filter((r) => {
    if (r.status !== 'sent' || !r.expires_at) return false;
    const t = new Date(r.expires_at).getTime();
    return t > now && t <= sevenDaysOut;
  }).length;

  return (
    <EstimatesList
      metrics={{ winRate, cohortSize: cohort.length, expiringSoon }}
    />
  );
}
