import Link from 'next/link';
import { getTrialDaysRemaining, type Subscription } from '@/lib/services/billing';
import type { AddOns } from '@/lib/services/add-ons';
import type { SeatUsage } from '@/lib/services/seats';
import { storageStatus, formatBytes } from '@/lib/billing/storage-cap';
import { PLANS } from '@/lib/billing/plan-catalog';
import { brand } from '@/lib/brand';
import { ManageSubscriptionButton } from '../billing/manage-subscription-button';
import { AddOnsSection } from '../billing/add-ons-section';

// Billing, as the eighth Settings tab — Owner-only [Josh, "move Billing into
// Settings"]. This is the SAME overview that lived at /dashboard/billing; it is
// a MOVE, not a redesign, so the card markup below is unchanged from that page.
// Two things are deliberately different because it is now a tab, not a route:
//
//  1. No page wrapper / big <h1>. The Settings page owns the "Company Settings"
//     h1 and the tab strip already names this "Billing"; a second h1 here would
//     be two page titles. Demoted to an <h2> section heading.
//  2. The data is fetched by settings/page.tsx and passed in, matching every
//     other tab (server fetch → props). ⚠️ That fetch is OWNER-GATED there, and
//     this component is only added to the tabs array for an owner — an admin
//     never renders it and never receives its data. Hiding a mounted panel is
//     NOT the gate (settings-tabs keeps every panel in the DOM); exclusion from
//     the array is, and the server owner-check behind it is the real one.
export function BillingSettingsTab({
  subscription,
  addOns,
  seatUsage,
  usedBytes,
}: {
  subscription: Subscription;
  addOns: AddOns | null;
  seatUsage: SeatUsage | null;
  usedBytes: number;
}) {
  const trialDays = getTrialDaysRemaining(subscription);
  const storage = storageStatus(usedBytes, subscription.plan_tier);
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
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Billing & Subscription</h2>

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
            The measured number this page once faked and then removed — now real:
            trashed files count, uploads pause at 100%, nothing else stops. */}
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
