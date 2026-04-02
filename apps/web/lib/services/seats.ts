import { createClient } from '@/lib/supabase-server';

export interface SeatUsage {
  used: number;
  limit: number;
  remaining: number;
  canInvite: boolean;
}

export async function getSeatUsage(): Promise<SeatUsage | null> {
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

  // Count active team members (exclude clients — they don't count toward seats)
  const { count: memberCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', profile.company_id)
    .eq('is_deleted', false)
    .neq('role', 'client');

  // Count pending invitations (exclude client invites)
  const { count: pendingCount } = await supabase
    .from('invitations')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', profile.company_id)
    .eq('status', 'pending')
    .neq('role', 'client');

  // Get seat limit from subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('seat_limit')
    .eq('company_id', profile.company_id)
    .single();

  const limit = subscription?.seat_limit || 2;
  const used = (memberCount || 0) + (pendingCount || 0);
  const remaining = Math.max(0, limit - used);

  return {
    used,
    limit,
    remaining,
    canInvite: used < limit,
  };
}
