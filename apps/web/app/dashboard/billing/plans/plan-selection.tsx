'use client';

import { useState } from 'react';

interface Plan {
  id: string;
  name: string;
  price: number;
  features: string[];
  seats: number;
  highlight?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 79,
    seats: 2,
    features: ['Up to 2 team members', '10 GB storage', '5 AI estimates per month'],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 149,
    seats: 5,
    highlight: true,
    features: [
      'Up to 5 team members',
      '50 GB storage',
      '25 AI estimates per month',
      'Core workflow automations',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: 249,
    seats: 15,
    features: [
      'Up to 15 team members',
      '200 GB storage',
      'Unlimited AI estimates',
      'All workflow automations',
      'Client experience portal',
    ],
  },
];

interface PlanSelectionProps {
  currentPlan: string;
  status: string;
}

export function PlanSelection({ currentPlan, status }: PlanSelectionProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelectPlan(planId: string) {
    setLoading(planId);
    setError(null);

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setLoading(null);
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (err) {
      setError('Failed to start checkout. Please try again.');
      setLoading(null);
    }
  }

  return (
    <>
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-center">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan && status === 'active';

          return (
            <div
              key={plan.id}
              className={`rounded-xl border-2 p-6 flex flex-col ${
                plan.highlight ? 'border-blue-600 shadow-lg' : 'border-gray-200'
              }`}
            >
              {plan.highlight && (
                <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
                  Most Popular
                </span>
              )}
              <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
              <div className="mt-2 mb-4">
                <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
                <span className="text-gray-500">/mo</span>
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-green-500 mt-0.5">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleSelectPlan(plan.id)}
                disabled={isCurrent || loading !== null}
                className={`w-full py-2 px-4 rounded-lg font-medium text-sm transition ${
                  isCurrent
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : plan.highlight
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                } ${loading === plan.id ? 'opacity-50' : ''}`}
              >
                {isCurrent
                  ? 'Current Plan'
                  : loading === plan.id
                    ? 'Redirecting...'
                    : 'Select Plan'}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
