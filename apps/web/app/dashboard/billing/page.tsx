import { createClient } from '@/lib/supabase-server';
import { getSubscription, getTrialDaysRemaining } from '@/lib/services/billing';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ManageSubscriptionButton } from './manage-subscription-button';
import { getAddOns } from '@/lib/services/add-ons';
import { AddOnsSection } from './add-ons-section';

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

  if (!subscription) {
    redirect('/dashboard');
  }

  const trialDays = getTrialDaysRemaining(subscription);
  const planLabels: Record<string, string> = {
    starter: 'Starter — $79/mo',
    professional: 'Professional — $149/mo',
    business: 'Business — $249/mo',
  };

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

        {/* Seats */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Team Seats</span>
          <span className="text-sm font-medium text-gray-900">
            {subscription.seat_limit} included
          </span>
        </div>

        {/* Trial info */}
        {subscription.status === 'trialing' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              {trialDays > 0
                ? `Your free trial ends in ${trialDays} day${trialDays === 1 ? '' : 's'}. Choose a plan before it expires to keep using FrameFocus.`
                : 'Your free trial has expired. Choose a plan to continue using FrameFocus.'}
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

        {/* Canceled info */}
        {subscription.cancel_at_period_end && subscription.status === 'active' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">
              Your subscription will cancel at the end of the current billing period
              {subscription.current_period_end
                ? ` on ${new Date(subscription.current_period_end).toLocaleDateString()}`
                : ''}
              .
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
        </div>
      </div>
      {addOns && <AddOnsSection initialEnabled={addOns.ai_tagging_enabled} />}
    </div>
  );
}
