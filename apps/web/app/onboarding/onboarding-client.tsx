'use client';

import { useState } from 'react';
import { PLANS } from '@/lib/billing/plan-catalog';
import { setOnboardingPlan } from './actions';

// Card-at-signup onboarding UI [§S3]. Plan choice + Add payment method. The
// button saves the chosen plan (server action) and then opens the Stripe setup
// checkout; Stripe returns to /onboarding/complete, which verifies the session
// and records the card. Company details live on Company Settings, where the
// completion handler lands the owner.
export function OnboardingClient({
  firstName,
  companyName,
  currentPlan,
}: {
  firstName: string;
  companyName: string;
  currentPlan: string;
}) {
  const [plan, setPlan] = useState(currentPlan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function addCard() {
    setBusy(true);
    setError('');
    // Save the plan first — then hand off to Stripe. A failure here keeps the
    // owner on the page rather than opening checkout for an unsaved plan.
    const saved = await setOnboardingPlan(plan);
    if (!saved.ok) {
      setError(saved.error);
      setBusy(false);
      return;
    }
    try {
      const res = await fetch('/api/stripe/setup-checkout', { method: 'POST' });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Could not start checkout. Please try again.');
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Could not reach the payment system. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Set up <strong>{companyName || 'your company'}</strong>. Choose a plan and add a card to
          start your 30-day free trial. <strong>Nothing is charged today</strong> — the card is on
          file for when your trial ends.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {PLANS.map((p) => {
            const selected = p.id === plan;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlan(p.id)}
                aria-pressed={selected}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  selected
                    ? 'border-brand-500 ring-1 ring-brand-500 bg-white'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="text-sm font-semibold text-gray-900">{p.name}</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">
                  ${p.price}
                  <span className="text-sm font-normal text-gray-500">/mo</span>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-gray-500">
                  {p.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <button
          onClick={addCard}
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-brand-500 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {busy ? 'Opening secure checkout…' : 'Add payment method & start trial'}
        </button>
        <p className="mt-3 text-xs text-gray-400">
          You&apos;ll be taken to Stripe to enter your card securely. A credit card is required to
          start a trial, and nothing is charged without your approval.
        </p>
      </div>
    </div>
  );
}
