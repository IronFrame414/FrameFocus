'use server';

import { createClient } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { setTeamMemberLoginActive, type TeamAccessOutcome } from '@/lib/team/team-access';

/**
 * `/m` Team's Active/Inactive for a member WITH A LOGIN. The mechanism and its
 * rationale live in `lib/team/team-access.ts` [S127 item 2]; this is only the
 * request's caller and the service-role client handed to it.
 */
export async function setTeamMemberLoginActiveAction(
  memberId: string,
  active: boolean
): Promise<TeamAccessOutcome> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    console.error('[team-access] refused: not authenticated', { memberId });
    return { ok: false, error: 'Not authenticated' };
  }
  return setTeamMemberLoginActive(supabase, getSupabaseAdmin(), user.id, memberId, active);
}
