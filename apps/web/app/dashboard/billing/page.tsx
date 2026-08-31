import { createClient } from '@/lib/supabase-server';
import { getSubscription, getTrialDaysRemaining } from '@/lib/services/billing';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ManageSubscriptionButton } from './manage-subscription-button';
import { getAddOns } from '@/lib/services/add-ons';
import { getSeatUsage } from '@/lib/services/seats';
import { AddOnsSection } from './add-ons-section';
import { brand } from '@/lib/brand';
import { storageStatus, formatBytes } from '@/lib/billing/storage-cap';
import { PLANS } from '@/lib/billing/plan-catalog';

// Step 10 (desktop redesign §8.12.4) — Billing, Owner-only (NOT Owner/Admin;
// the redirect below stands). The mockup's rows that are NOT built, and why:
//   · File storage "2.4 GB of 100 GB" — storage is never measured anywhere;
//     a meter would be display-only fiction.
//   · QuickBooks sync "Included" — 7G is a stub; no sync exists to include.
//   · Add-on "Client portal branding $19" — RULED [Josh]: NO CHARGE, removed.
//     No gate exists and the portal logo renders unconditionally; the toggle
//     would sell something the customer already has.
//   · Add-on "Extra storage $15" — does not exist, and storage is unmeasured.
//   · In-app invoice history — invoices and PDFs live in the STRIPE customer
//     portal (Manage Subscription); stated in copy instead of duplicated.
// The 90-day cancellation copy below is COPY ONLY — the paid-cancellation
// lock/retention/unban path is a separate feature, deliberately not built
// here (the trial path is the precedent and its comment warns the way back
// must clear both the ban and the retention clock).

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!profile || profile.role !== 'owner') {
    redirect('/dashboard');
  }

  const subscription = await getSubscription();
  const addOns = await getAddOns();
  const seatUsage = await getSeatUsage();

  if (!subscription) {
    redirect('/dashboard');
  }

  const trialDays = getTrialDaysRemaining(subscription);

  // Storage: the caller-scoped RPC (§1 sum, trashed rows included) against
  // the plan's ruled cap. Runs as the signed-in owner, not the admin client.
  const { data: usedBytes } = await supabase.rpc('company_storage_used_bytes');
  const storage = storageStatus(Number(usedBytes ?? 0), subscription.plan_tier);
  // Derived from the ONE catalog so Billing, /pricing and the homepage cannot
  // drift (public-site §S1). Never hardcode the numbers here again.
  const planLabels: Record<string, string> = Object.fromEntries(
    PLANS.map((p) => [p.id, `${p.name} — $${p.price}/mo`])
  );

  const statusLabels: Record<string, string> = {
    trialing: 'Free Trial',
    active: 'Active',
    past_due: 'Past Due',
    canceled: 'Canceled',
    unpaid: 'Unpaid',
    incomplete: 'Incomplete',
  };

  const statusColors: Record<string, string> = {
    trialing: 'bg-blue-100 text-blue-800',
    active: 'bg-green-100 text-green-800',
    past_due: 'bg-yellow-100 text-yellow-800',
    canceled: 'bg-red-100 text-red-800',
    unpaid: 'bg-red-100 text-red-800',
    incomplete: 'bg-gray-100 text-gray-800',
  };

  const hasStripeSubscription = !!subscription.stripe_subscription_id;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Billing & Subscription</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Status</span>
          <span
            className={`text-sm font-medium px-3 py-1 rounded-full ${statusColors[subscription.status] || 'bg-gray-100 text-gray-800'}`}
          >
            {statusLabels[subscription.status] || subscription.status}
          </span>
        </div>

        {/* Plan */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Current Plan</span>
          <span className="text-sm font-medium text-gray-900">
            {planLabels[subscription.plan_tier] || subscription.plan_tier}
          </span>
        </div>

        {/* Seats — usage against the limit (enforced by getSeatUsage; active
            members + pending invites, clients and subs excluded) */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Team Seats</span>
          <span className="text-sm font-medium text-gray-900">
            {seatUsage
              ? `${seatUsage.used} of ${seatUsage.limit} used`
              : `${subscription.seat_limit} included`}
          </span>
        </div>

        {/* Storage — the §1 sum against the ruled cap [storage-archive-ai-spec].
            The measured number this page once faked and then removed (see the
            header comment) — now real: trashed files count, uploads pause at
            100%, nothing else stops. */}
        {storage.capBytes !== null && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">File Storage</span>
            <span
              className={`text-sm font-medium ${
                storage.level === 'blocked'
                  ? 'text-red-700'
                  : storage.level === 'warn95'
                    ? 'text-red-600'
                    : storage.level === 'warn80'
                      ? 'text-amber-600'
                      : 'text-gray-900'
              }`}
            >
              {formatBytes(storage.usedBytes)} of {formatBytes(storage.capBytes)} used
              {storage.level === 'blocked' && ' — uploads paused'}
              {storage.level === 'warn95' && ' (95%+)'}
              {storage.level === 'warn80' && ' (80%+)'}
            </span>
          </div>
        )}

        {/* Trial info */}
        {subscription.status === 'trialing' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              {trialDays > 0
                ? `Your free trial ends in ${trialDays} day${trialDays === 1 ? '' : 's'}. Choose a plan before it expires to keep using ${brand.name}.`
                : `Your free trial has expired. Choose a plan to continue using ${brand.name}.`}
            </p>
          </div>
        )}

        {/* Past due warning */}
        {subscription.status === 'past_due' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              Your last payment failed. Please update your payment method to avoid losing access.
            </p>
          </div>
        )}

        {/* Canceled info. ⚠️ The retention sentence is the RULED copy — locked,
            not "read-only"; access requires an active subscription. */}
        {subscription.cancel_at_period_end && subscription.status === 'active' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">
              Your subscription will cancel at the end of the current billing period
              {subscription.current_period_end
                ? ` on ${new Date(subscription.current_period_end).toLocaleDateString()}`
                : ''}
              . Your data is kept for 90 days after cancelling. You&rsquo;ll need an active
              subscription to access it.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="pt-4 border-t border-gray-100 flex flex-col gap-3">
          <Link
            href="/dashboard/billing/plans"
            className="w-full text-center bg-blue-600 text-white py-2 px-4 rounded-lg font-medium text-sm hover:bg-blue-700 transition"
          >
            {subscription.status === 'trialing' || subscription.status === 'canceled'
              ? 'Choose a Plan'
              : 'Change Plan'}
          </Link>
          {hasStripeSubscription && <ManageSubscriptionButton />}
          {hasStripeSubscription && (
            <p className="text-xs text-gray-500 text-center">
              Payment method, invoice history and PDFs live in the Stripe billing portal — Manage
              Subscription opens it.
            </p>
          )}
        </div>
      </div>
      {addOns && <AddOnsSection initialEnabled={addOns.ai_tagging_enabled} />}
    </div>
  );
}
