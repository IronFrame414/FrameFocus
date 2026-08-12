import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { CopyPendingLegalReview } from '@/components/trial/copy-pending-legal-review';

/**
 * S138 — the 4th-attempt screen (Part 3.4).
 *
 * ⚠️ ITS OWN SCREEN, NOT THE PRICE LIST. `handle_new_user()` gives a fourth
 * signup from the same email address a subscription with `status =
 * 'incomplete'` and no trial dates (20260918000000). Until now the middleware
 * sent that straight to `/dashboard/billing/plans`, so someone who had used
 * three trials was shown a pricing table with no explanation of why the fourth
 * one did not start — indistinguishable from a billing failure.
 *
 * ⚠️ IT LIVES OUTSIDE `/dashboard` ON PURPOSE. The subscription block in
 * middleware.ts redirects every non-billing `/dashboard` path when
 * `status = 'incomplete'`. A `/dashboard/trial-limit` page would redirect to
 * plans, and routing plans here would loop.
 *
 * ⚠️ THE WORDING IS THE PART THAT IS MISSING, AND VISIBLY SO. Telling someone
 * they may not have a fourth trial is a policy statement about a paid product.
 * That is Q5's ruling: build the screen, leave a named gap where the words go.
 *
 * The known limit of the mechanism, accepted [Josh, S137]: the identity is an
 * email address and `josh+1@` defeats it. Do not "fix" that with a regex.
 */
export default async function TrialLimitPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) redirect('/sign-in');

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status, trial_start, stripe_subscription_id')
    .eq('company_id', (profile as { company_id: string }).company_id)
    .maybeSingle();

  // Same three-part test the middleware uses. A company that is NOT in the
  // trial-limit state has no business on this screen — send it to the normal
  // billing flow rather than explaining a limit it has not hit.
  const isTrialLimited =
    subscription !== null &&
    (subscription as { status: string }).status === 'incomplete' &&
    (subscription as { trial_start: string | null }).trial_start === null &&
    (subscription as { stripe_subscription_id: string | null }).stripe_subscription_id === null;

  if (!isTrialLimited) redirect('/dashboard');

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold text-gray-900">No trial on this account</h1>

      {/* A count is a fact. What it MEANS for the customer is the part legal owns. */}
      <p className="mt-3 text-sm text-gray-700">
        This email address has already been used for the maximum number of free trials.
      </p>

      <CopyPendingLegalReview topic="the free-trial limit — what it is, why it applies, and what the customer's options are" />

      <div className="mt-6 flex flex-col gap-3">
        <Link
          href="/dashboard/billing/plans"
          className="rounded-md bg-gray-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-gray-800"
        >
          Choose a plan
        </Link>
        <Link href="/sign-in" className="text-center text-sm text-gray-500 underline">
          Sign in with a different account
        </Link>
      </div>
    </main>
  );
}
