'use client';
import { createClient } from '@/lib/supabase-browser';
import type { TrialLifecycle, TrialAcknowledgement } from '@/lib/services/trial';

export type { TrialLifecycle, TrialAcknowledgement };

/**
 * S138 — write the proof-of-notice row.
 *
 * ⚠️ FIRST-PERSON BY RLS, NOT BY THIS FUNCTION. `trial_ack_insert_self`
 * (20260918000000) requires `profile_id = get_my_profile_id()`, so an Admin
 * cannot acknowledge on the Owner's behalf even if this code passed someone
 * else's id. The profile id is still resolved here rather than accepted as an
 * argument, so there is no parameter for a caller to get wrong.
 *
 * ⚠️ NOT `notifications.read_at` [Josh, S137 Q6] — that only proves a list
 * rendered. This row is written by a button press and by nothing else.
 */
export async function acknowledgeTrialWarning(
  warningKind: 'day_7' | 'day_3'
): Promise<TrialAcknowledgement> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (profileError || !profile) throw new Error('No profile for the signed-in user');

  const { data, error } = await supabase
    .from('trial_warning_acknowledgements')
    .insert({
      company_id: (profile as { company_id: string }).company_id,
      profile_id: (profile as { id: string }).id,
      warning_kind: warningKind,
    })
    .select('id, profile_id, warning_kind, created_at')
    .single();
  if (error) throw new Error(error.message);

  return data as TrialAcknowledgement;
}
