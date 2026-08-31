'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { seatLimitFor } from '@/lib/billing/plan-catalog';

// Onboarding plan choice [§S3.5]. `subscriptions` has ONLY a SELECT policy — no
// UPDATE — so the write goes through the service role. That is safe here because
// we verify the caller is the OWNER of the company whose subscription we touch,
// and `seatLimitFor` rejects any tier not in the catalog (plan_tier is also
// CHECK-constrained in the DB). The plan is NOT gated — the card is (Q1); this
// just records the choice so the trial and later conversion price it correctly.
export async function setOnboardingPlan(
  plan: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const seatLimit = seatLimitFor(plan);
  if (seatLimit === null) return { ok: false, error: 'Unknown plan.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You are not signed in.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('user_id', user.id)
    .single();
  if (!profile || profile.role !== 'owner') {
    return { ok: false, error: 'Only the Owner can choose a plan.' };
  }

  const admin = getSupabaseAdmin() as SupabaseClient<Database>;
  const { error } = await admin
    .from('subscriptions')
    .update({ plan_tier: plan, seat_limit: seatLimit })
    .eq('company_id', profile.company_id);
  if (error) return { ok: false, error: 'Could not save your plan. Please try again.' };
  return { ok: true };
}
