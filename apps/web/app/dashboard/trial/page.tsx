import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getTrialLifecycle, getTrialAcknowledgements, daysUntil } from '@/lib/services/trial';
import { CopyPendingLegalReview } from '@/components/trial/copy-pending-legal-review';
import { AcknowledgeButton } from './acknowledge-button';

/**
 * S138 — the in-app trial warning (Part 3.1).
 *
 * ⚠️ A DATA-LOSS NOTICE, NOT A PRICE LIST. Today an expiring trial is
 * redirected to `/dashboard/billing/plans`, which answers "what does it cost"
 * when the question is "what happens to my work". This screen carries the
 * date, the acknowledgement, and the way to get the data out — and links to
 * plans rather than being them.
 *
 * Owner and Admin only, enforced twice: the role check below, and the
 * Owner/Admin SELECT policy on both tables. The redirect is the courtesy; the
 * policy is the gate.
 */
export default async function TrialWarningPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile || !['owner', 'admin'].includes((profile as { role: string }).role)) {
    redirect('/dashboard');
  }

  const lifecycle = await getTrialLifecycle();
  if (!lifecycle) {
    // No lifecycle row means this company is not on the trial mechanism at all
    // — every company that existed before 20260918000000, since there is
    // deliberately no backfill. Nothing to warn about.
    redirect('/dashboard');
  }

  const left = daysUntil(lifecycle.trial_end, new Date());
  const warningKind: 'day_7' | 'day_3' = left <= 3 ? 'day_3' : 'day_7';

  const acks = await getTrialAcknowledgements();
  const mine = acks.some(
    (a) => a.profile_id === (profile as { id: string }).id && a.warning_kind === warningKind
  );

  const endsOn = new Date(lifecycle.trial_end).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">
        {left <= 0 ? 'Your trial has ended' : `Your trial ends in ${left} ${left === 1 ? 'day' : 'days'}`}
      </h1>

      {/* The DATE is a fact, not copy, so it is safe to state plainly. */}
      <p className="mt-2 text-sm text-gray-700">
        Trial end date: <span className="font-medium">{endsOn}</span>
      </p>

      <CopyPendingLegalReview topic="what happens to your data when the trial ends, and the retention period" />

      <section className="mt-6 rounded-md border border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-900">Take your data with you</h2>
        <p className="mt-1 text-sm text-gray-600">
          Exports can only be prepared while the trial is active.
        </p>
        <Link
          href="/dashboard/trial/export"
          className="mt-3 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Export my data
        </Link>
      </section>

      <section className="mt-6">
        <AcknowledgeButton warningKind={warningKind} alreadyAcknowledged={mine} />
      </section>

      <section className="mt-8">
        <Link href="/dashboard/billing/plans" className="text-sm text-gray-600 underline">
          See plans
        </Link>
      </section>

      {acks.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-gray-900">Acknowledgements</h2>
          <ul className="mt-2 space-y-1 text-sm text-gray-600">
            {acks.map((a) => (
              <li key={a.id}>
                {a.warning_kind === 'day_3' ? '3-day notice' : '7-day notice'} —{' '}
                {new Date(a.created_at).toLocaleString()}
                {a.profile_id === (profile as { id: string }).id ? ' (you)' : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
