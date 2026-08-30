/**
 * The plan catalog — ONE source for what the three plans are, shared by every
 * surface that renders or charges them: the signed-in plan picker
 * (`app/dashboard/billing/plans/plan-selection.tsx`), the signed-in checkout
 * (`/api/stripe/checkout`), and the LOCKED-account resubscribe pair
 * (`/resubscribe` + `/api/resubscribe/checkout`, Q1a).
 *
 * Extracted from plan-selection.tsx when the resubscribe page landed — a
 * second copy of prices and seat limits is exactly the divergence the parity
 * ruling names. Client-safe on purpose (no env reads): Stripe PRICE IDs stay
 * server-side in `price-ids.ts`.
 */

export interface Plan {
  id: 'starter' | 'professional' | 'business';
  name: string;
  /** Display price, USD/month. Stripe's price object is authoritative at charge time. */
  price: number;
  seats: number;
  features: string[];
  highlight?: boolean;
}

export const PLANS: Plan[] = [
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

export function seatLimitFor(planId: string): number | null {
  return PLANS.find((p) => p.id === planId)?.seats ?? null;
}
