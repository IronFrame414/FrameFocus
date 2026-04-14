// ── Subscription Tiers ──

export const SUBSCRIPTION_TIERS = {
  starter: {
    name: 'Starter',
    price: 79,
    maxUsers: 2,
    additionalUserPrice: 15,
    storageGB: 10,
    aiEstimatesPerMonth: 5,
    clientPortal: false,
    workflows: false,
    aiMarketing: false,
  },
  professional: {
    name: 'Professional',
    price: 149,
    maxUsers: 5,
    additionalUserPrice: 15,
    storageGB: 50,
    aiEstimatesPerMonth: 25,
    clientPortal: false,
    workflows: 'core',
    aiMarketing: false,
  },
  business: {
    name: 'Business',
    price: 249,
    maxUsers: 15,
    additionalUserPrice: 12,
    storageGB: 200,
    aiEstimatesPerMonth: Infinity,
    clientPortal: true,
    workflows: 'all',
    aiMarketing: 'addon',
  },
} as const;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;
