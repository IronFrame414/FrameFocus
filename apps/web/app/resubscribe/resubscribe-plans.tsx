'use client';

import { useState } from 'react';
import { PLANS } from '@/lib/billing/plan-catalog';

// The locked-account plan picker. Same catalog as the signed-in picker
// (plan-selection.tsx) — one source of plans, two presentations; only the
// checkout endpoint differs, because this one authenticates with the
// resubscribe token instead of a session.

export function ResubscribePlans({ token }: { token: string }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelectPlan(planId: string) {
    setLoading(planId);
    setError(null);
    try {
      const res = await fetch('/api/resubscribe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, plan: planId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        setLoading(null);
        return;
      }
      window.location.href = data.url;
    } catch {
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
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-xl border-2 p-6 flex flex-col bg-white ${
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
              disabled={loading !== null}
              className={`w-full py-2 px-4 rounded-lg font-medium text-sm transition ${
                plan.highlight
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
              } ${loading === plan.id ? 'opacity-50' : ''}`}
            >
              {loading === plan.id ? 'Redirecting...' : 'Subscribe'}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
