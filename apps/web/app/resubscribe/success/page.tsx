import Link from 'next/link';
import { brand } from '@/lib/brand';

// Landing after a tokenized resubscribe checkout completes. The unlock itself
// is the webhook's job (checkout.session.completed → releaseTrialLock →
// unlock_trial_company) — this page only says what happened and points at
// sign-in. If the webhook is a few seconds behind, the reconcile cron closes
// the gap the same day; the copy hedges with "a moment" rather than promising
// instant.

export default function ResubscribeSuccessPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-sm font-semibold text-gray-500">{brand.name}</p>
        <h1 className="mt-1 text-xl font-bold text-gray-900">Payment received</h1>
        <p className="mt-3 text-sm text-gray-600">
          Your account is being unlocked — this usually takes a moment. Your data is exactly
          where you left it.
        </p>
        <Link
          href="/sign-in"
          className="mt-6 inline-block bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
