import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { CopyPendingLegalReview } from '@/components/trial/copy-pending-legal-review';

/**
 * S138 — where the middleware sends a locked tenant.
 *
 * ⚠️ MOST PEOPLE WILL NEVER SEE THIS PAGE, and that is expected. The lock bans
 * the auth users, so anyone signing in fresh is refused at sign-in. This
 * catches the ≤60-minute window where a token issued before the lock is still
 * live — measured in S138 as the one real hole in Q3(c)'s session revocation.
 *
 * Deliberately NOT `/dashboard/billing/plans`. The existing expired-trial
 * redirect goes to a price list, which answers "what does it cost" when the
 * question is "what happened to my account".
 */
export default async function LockedPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  // If the company is NOT locked, this page is a dead end — send them home.
  // Uses the same one-bit RPC the middleware guard uses, so the two cannot
  // disagree about what "locked" means.
  const { data: locked } = await supabase.rpc('is_my_company_locked');
  if (locked !== true) redirect('/dashboard');

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold text-gray-900">This account is locked</h1>

      <p className="mt-3 text-sm text-gray-700">The free trial for this company has ended.</p>

      <CopyPendingLegalReview topic="what happens to the account and its data after the trial ends" />

      <div className="mt-6 flex flex-col gap-3">
        <Link
          href="/dashboard/billing/plans"
          className="rounded-md bg-gray-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-gray-800"
        >
          Choose a plan
        </Link>
        <Link href="/sign-in" className="text-center text-sm text-gray-500 underline">
          Sign in as someone else
        </Link>
      </div>

      {/*
        No export link here, deliberately. Q-ruled: the export window is the
        PRE-EXPIRY period, and once locked there is no export. Offering one
        here would advertise a door that is closed.
      */}
    </main>
  );
}
