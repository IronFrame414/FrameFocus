import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getResubscribeContext, formatDeletionDate } from '@/lib/trial/resubscribe';
import { brand } from '@/lib/brand';
import { ResubscribePlans } from './resubscribe-plans';

// The LOCKED-account resubscribe page [Q1a, deletion-sweep-analysis.md].
//
// ⚠️ UNAUTHENTICATED BY DESIGN, and deliberately outside the middleware
// matcher (the invite / sign-co / reset-password precedent: token-based, holds
// no session). Its audience is banned from sign-in — that is the entire reason
// it exists. The token in the URL is the credential; lib/trial/resubscribe.ts
// is the one validator, shared with the checkout route.
//
// Platform surface: the product's own identity, not the tenant's — the
// same ruled boundary as the warning emails that link here.

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResubscribePage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const ctx = token ? await getResubscribeContext(admin, token, new Date()) : null;

  if (!ctx || !token) {
    // One neutral message for every failure mode (bad token, expired, already
    // unlocked) — see the validator's note on not refining guesses. The
    // already-paid case genuinely ends here too: the token rotates on unlock.
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900">This link is no longer valid</h1>
          <p className="mt-3 text-sm text-gray-600">
            It may have expired, or the account it belonged to has already been restored or
            deleted. If you have an active account, sign in as usual. Otherwise, reply to the
            email that brought you here and we&apos;ll help.
          </p>
        </div>
      </main>
    );
  }

  const deletionDate = formatDeletionDate(ctx.deleteAfter, ctx.timezone);

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-6">
      <div className="max-w-4xl mx-auto">
        <p className="text-sm font-semibold text-gray-500">{brand.name}</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">
          Restore access for {ctx.companyName}
        </h1>
        <p className="mt-3 text-sm text-gray-700 max-w-2xl">
          This account is locked
          {ctx.reason === 'cancellation'
            ? ' because its subscription was cancelled'
            : ' because its free trial ended'}
          . Everything is exactly where you left it —{' '}
          <strong>
            until {deletionDate}, when the data is permanently deleted and cannot be recovered.
          </strong>{' '}
          Subscribing before that date unlocks the account immediately.
        </p>
        <div className="mt-8">
          <ResubscribePlans token={token} />
        </div>
        <p className="mt-8 text-xs text-gray-500">
          Payment is handled by Stripe. The account unlocks automatically as soon as the payment
          completes.
        </p>
      </div>
    </main>
  );
}
