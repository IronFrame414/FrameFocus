import { createClient } from '@/lib/supabase-server';

export interface Subscription {
  id: string;
  company_id: string;
  stripe_subscription_id: string | null;
  plan_tier: 'starter' | 'professional' | 'business';
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete';
  seat_limit: number;
  trial_start: string | null;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export async function getSubscription(): Promise<Subscription | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', user.id)
    .single();

  if (!profile) return null;

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('company_id', profile.company_id)
    .single();

  return subscription;
}

export function getTrialDaysRemaining(subscription: Subscription): number {
  if (!subscription.trial_end) return 0;
  const now = new Date();
  const trialEnd = new Date(subscription.trial_end);
  const diff = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

export function isTrialExpired(subscription: Subscription): boolean {
  return getTrialDaysRemaining(subscription) === 0 && subscription.status === 'trialing';
}
