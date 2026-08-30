import 'server-only';

/**
 * Stripe price ids for the plan catalog — the server-side half of
 * `plan-catalog.ts`. Env-read at call time, not module load (lazy-init rule:
 * a missing var must not crash the build).
 */
export function getPriceId(planId: string): string | null {
  const ids: Record<string, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER,
    professional: process.env.STRIPE_PRICE_PROFESSIONAL,
    business: process.env.STRIPE_PRICE_BUSINESS,
  };
  return ids[planId] ?? null;
}
