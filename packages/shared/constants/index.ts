// ── Role Definitions ──

export const COMPANY_ROLES = ['owner', 'project_manager', 'foreman', 'crew_member', 'client'] as const;

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  project_manager: 'Project Manager',
  foreman: 'Foreman',
  crew_member: 'Crew Member',
  client: 'Client',
};

export const ROLE_HIERARCHY: Record<string, number> = {
  owner: 100,
  project_manager: 80,
  foreman: 60,
  crew_member: 40,
  client: 10,
};

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

// ── Module Status ──

export const MODULE_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETE: 'complete',
} as const;
