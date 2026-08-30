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
  /**
   * The ENFORCED storage cap [storage-archive-ai-spec §2, RULED]. The feature
   * string below shows this same number — ruled Q1: "a customer who hits it
   * should have seen it advertised." One field, one string, no drift.
   */
  storageGb: number;
  features: string[];
  highlight?: boolean;
}

// Q1 [storage-archive-ai-spec, 2026-08-30]: storage lines carry the RULED caps
// (50/120/500 — the old 10/50/200 were display-only and never enforced), and
// the "N AI estimates per month" lines are REMOVED ENTIRELY: they described a
// feature that was never built and was never enforced; the new pricing has no
// AI estimates, and photo tagging is a separate $20 add-on.
export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 79,
    seats: 2,
    storageGb: 50,
    features: ['Up to 2 team members', '50 GB storage'],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 149,
    seats: 5,
    storageGb: 120,
    highlight: true,
    features: ['Up to 5 team members', '120 GB storage', 'Core workflow automations'],
  },
  {
    id: 'business',
    name: 'Business',
    price: 249,
    seats: 15,
    storageGb: 500,
    features: [
      'Up to 15 team members',
      '500 GB storage',
      'All workflow automations',
      'Client experience portal',
    ],
  },
];

export function seatLimitFor(planId: string): number | null {
  return PLANS.find((p) => p.id === planId)?.seats ?? null;
}

/** The enforced cap in BYTES for a plan tier, or null for an unknown tier. */
export function storageCapBytesFor(planId: string): number | null {
  const gb = PLANS.find((p) => p.id === planId)?.storageGb;
  return gb === undefined ? null : gb * 1024 * 1024 * 1024;
}
