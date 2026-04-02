import { getSubscription } from '@/lib/services/billing';
import { redirect } from 'next/navigation';
import { PlanSelection } from './plan-selection';

export default async function PlansPage() {
  const subscription = await getSubscription();

  if (!subscription) {
    redirect('/sign-in');
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">Choose Your Plan</h1>
          <p className="mt-2 text-gray-600">
            {subscription.status === 'trialing'
              ? "Select a plan to continue after your trial ends. You won't be charged until your trial expires."
              : 'Select a plan to continue using FrameFocus.'}
          </p>
        </div>
        <PlanSelection currentPlan={subscription.plan_tier} status={subscription.status} />
      </div>
    </div>
  );
}
