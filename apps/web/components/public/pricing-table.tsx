import Link from 'next/link';
import { PLANS } from '@/lib/billing/plan-catalog';
import { AI_ADDON_PRICE_USD, AI_MONTHLY_PHOTO_CAP } from '@/lib/billing/ai-cap';

// The public pricing cards. Presentational and server-safe: the CTA is a link to
// /sign-up (start a trial), NOT the signed-in checkout POST. Reads the ONE
// catalog so the homepage, this table and in-app Billing cannot show different
// numbers (public-site §S1 / the parity ruling). Used by both `/` and
// `/pricing` — one component, two placements.

export function PricingTable() {
  return (
    <div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col rounded-xl border-2 bg-white p-6 ${
              plan.highlight ? 'border-brand-500 shadow-lg' : 'border-gray-200'
            }`}
          >
            {plan.highlight && (
              <span className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-500">
                Most popular
              </span>
            )}
            <h3 className="text-xl font-bold text-brand-900">{plan.name}</h3>
            <div className="mb-4 mt-2">
              <span className="text-4xl font-bold text-brand-900">${plan.price}</span>
              <span className="text-gray-500">/mo</span>
            </div>
            <ul className="mb-6 flex-1 space-y-2">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-0.5 text-brand-500">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              href="/sign-up"
              className={`w-full rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition ${
                plan.highlight
                  ? 'bg-brand-500 text-white hover:bg-brand-600'
                  : 'bg-brand-900 text-white hover:bg-brand-800'
              }`}
            >
              Start free trial
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-sm text-gray-600">
        <span className="font-semibold text-brand-900">Add-on — AI photo tagging:</span> $
        {AI_ADDON_PRICE_USD}/month, up to {AI_MONTHLY_PHOTO_CAP.toLocaleString()} photos (hard cap).
      </p>
    </div>
  );
}
