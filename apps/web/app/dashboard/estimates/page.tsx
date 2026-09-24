import { createClient } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import { EstimatesList } from './estimates-list';
import Link from 'next/link';
import { listSiteVisits, type SiteVisit } from '@/lib/services/site-visits';

// [S108 Spec A] Open site visits — recorded, not yet estimates. Shown ABOVE
// the list and never inside it: no number, $0 totals, and excluded from the
// win-rate / expiring metrics by construction (FILL-A11).
function SiteVisitsPanel({ visits }: { visits: SiteVisit[] }) {
  if (visits.length === 0) return null;
  return (
    <section data-testid="site-visits-panel" style={{ border: '1px solid #e4e8ef', borderRadius: '14px', padding: '1rem 1.25rem', marginBottom: '1rem', background: '#fff' }}>
      <h2 style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8792a8', margin: '0 0 0.5rem' }}>
        Site visits waiting to be priced · {visits.length}
      </h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {visits.map((v) => (
          <li key={v.id} style={{ padding: '0.4rem 0', borderTop: '1px solid #f4f6fa' }}>
            <Link href={`/dashboard/site-visits/${v.estimate_id}`} style={{ color: '#3b4ae0', fontWeight: 600 }}>
              {v.title}
            </Link>
            <span
              data-testid="site-visit-panel-state"
              style={{ marginLeft: '0.5rem', fontSize: '0.6875rem', fontWeight: 700, padding: '1px 7px', borderRadius: '999px', ...(v.finished_at ? { background: '#ecfdf5', color: '#065f46' } : { background: '#f4f6fa', color: '#7b8699' }) }}
            >
              {v.finished_at ? 'Finished' : 'Still recording'}
            </span>
            <span style={{ color: '#7b8699', fontSize: '0.8125rem' }}>
              {' · '}
              {[v.contact ? `${v.contact.first_name} ${v.contact.last_name}` : null, v.address ? `${v.address.address_line1}, ${v.address.city}` : null, new Date(v.visited_at).toLocaleDateString()].filter(Boolean).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 14b Estimates (desktop-redesign §8.2).
 *
 * Proposal view tracking (P3) is BUILT — proposal-view-tracking-spec. The
 * Client activity column upgraded in place: "opened N× · last <date>" from
 * proposal_views rows, falling back to "sent <date>" / "not sent". The write
 * path lives on the signing page (service role); `estimates.viewed_at` is the
 * first-counted-view stamp; status 'viewed' is retired unused.
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

  const openVisits = await listSiteVisits({ openOnly: true });

  return (
    <>
      <SiteVisitsPanel visits={openVisits} />
      <EstimatesList
        metrics={{ winRate, cohortSize: cohort.length, expiringSoon }}
      />
    </>
  );
}
