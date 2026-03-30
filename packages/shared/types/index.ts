// ── User & Auth Types ──

export type CompanyUserRole = 'owner' | 'project_manager' | 'foreman' | 'crew_member' | 'client';

export interface Profile {
  id: string;
  company_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: CompanyUserRole;
  phone?: string;
  avatar_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  trade_type?: string;
  phone?: string;
  email?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  logo_url?: string;
  subscription_tier: SubscriptionTier;
  subscription_status: SubscriptionStatus;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  created_at: string;
  updated_at: string;
}

export type SubscriptionTier = 'starter' | 'professional' | 'business';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';

// ── Platform Admin Types ──

export interface PlatformAdmin {
  id: string;
  user_id: string;
  email: string;
  name: string;
  created_at: string;
}

// ── Base entity with standard columns ──

export interface BaseEntity {
  id: string;
  company_id: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
  is_deleted: boolean;
  deleted_at?: string;
}
