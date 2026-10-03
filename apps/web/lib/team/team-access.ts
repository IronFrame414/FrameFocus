import type { SupabaseClient } from '@supabase/supabase-js';
import { softDeleteTeamMember } from '@/lib/services/team';
import { assertCanEditTeamMember } from '@/lib/team/team-edit-rules';

// ============================================================================
// S127 ITEM 2 — `/m` TEAM'S ACTIVE/INACTIVE GOES THROUGH THE REMOVAL MECHANISM.
//
// ⚠️ THE DEFECT (S127 1.4a, measured on rebuild-test). `/m`'s "Inactive" used to
// write `company_members.is_deleted = true` and nothing else. The tenant gate
// under every RLS policy and storage policy, `get_my_company_id()`, reads
// `profiles` — so the person kept FULL company access at their role, on their
// existing token AND on a fresh sign-in: read 17 projects, wrote a contact,
// downloaded an object, got a signed URL, called a SECURITY DEFINER function.
// Desktop Remove (`softDeleteTeamMember`: profile deleted + ban) cut all of it.
// Filed at S109 as `#1-s109`, as a sync gap; S127 showed it is an access gap.
//
// ⚠️ THE FIX IS ONE MECHANISM, NOT A SECOND ONE. Deactivating a member who has a
// login calls the SAME `softDeleteTeamMember()` desktop Remove calls, under the
// SAME rule (`assertCanEditTeamMember`), and #160's trigger
// (`profiles_sync_member_deleted`) brings the member row along. Restoring
// reverses exactly that: the profile un-deleted (the trigger restores the
// member row) and the ban lifted.
//
// ⚠️ A MEMBER WITH NO LOGIN (`profile_id IS NULL` — directory subs and vendors,
// most of the roster) has nothing to cut: there is no token, so the
// member-only write remains correct for them and this is a no-op.
//
// ⚠️ `get_my_company_id()` IS NOT TOUCHED. A database-layer defence is proposed
// in S127-report, not built: ruling #11 fences that function.
// ============================================================================

export type TeamAccessOutcome = { ok: true; changed: boolean } | { ok: false; error: string };

/**
 * The mechanism, with its clients passed in so the live harness drives exactly
 * this code (`test/s127-member-removal.live.ts`). `supabase` is the CALLER's
 * client — every read and the profile write go through their RLS; `admin` is
 * used for the ban and nothing else.
 */
export async function setTeamMemberLoginActive(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  callerUserId: string,
  memberId: string,
  active: boolean
): Promise<TeamAccessOutcome> {
  const user = { id: callerUserId };

  const { data: caller } = await supabase
    .from('profiles')
    .select('id, role, company_id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!caller) {
    console.error('[team-access] refused: caller profile not found', { userId: user.id });
    return { ok: false, error: 'Profile not found' };
  }

  // Scoped to the caller's company: RLS already does that, and the explicit
  // filter makes a foreign id answer "not on your team" rather than anything else.
  const { data: member } = await supabase
    .from('company_members')
    .select('id, profile_id, company_id')
    .eq('id', memberId)
    .eq('company_id', caller.company_id)
    .maybeSingle();
  if (!member) {
    console.error('[team-access] refused: member not in caller company', { memberId });
    return { ok: false, error: 'That person is not on your team.' };
  }
  if (!member.profile_id) return { ok: true, changed: false };

  const { data: target } = await supabase
    .from('profiles')
    .select('id, role, user_id, is_deleted')
    .eq('id', member.profile_id)
    .eq('company_id', caller.company_id)
    .maybeSingle();
  if (!target || !target.user_id) {
    console.error('[team-access] refused: target profile not readable', { memberId });
    return { ok: false, error: 'That person is not on your team.' };
  }

  try {
    assertCanEditTeamMember(caller.role, caller.id, target.id, target.role);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Insufficient permissions';
    console.error('[team-access] refused by rule', { memberId, callerRole: caller.role, message });
    return { ok: false, error: message };
  }

  if (!active) {
    if (target.is_deleted) return { ok: true, changed: false };
    try {
      await softDeleteTeamMember(supabase, admin, target.id, target.user_id);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not remove access';
      console.error('[team-access] deactivate failed', { memberId, message });
      return { ok: false, error: message };
    }
    return { ok: true, changed: true };
  }

  if (!target.is_deleted) return { ok: true, changed: false };

  // A locked (trial-expired) company keeps its bans: lifting one here would
  // let this person past the lock.
  const { data: locked } = await supabase.rpc('is_my_company_locked');
  if (locked === true) {
    console.error('[team-access] refused: company locked', { memberId });
    return {
      ok: false,
      error: 'This account is locked. Restore access after reactivating the account.',
    };
  }

  // The caller's own client, so `profiles_update_*` decides — and `.select()`
  // so a refusal (0 rows) is reported as one, not as success.
  const { data: restored, error: restoreErr } = await supabase
    .from('profiles')
    .update({ is_deleted: false, deleted_at: null })
    .eq('id', target.id)
    .select('id');
  if (restoreErr || (restored ?? []).length === 0) {
    console.error('[team-access] restore refused', {
      memberId,
      error: restoreErr?.message ?? '0 rows',
    });
    return { ok: false, error: restoreErr?.message ?? 'You cannot restore this person.' };
  }

  const { error: unbanErr } = await admin.auth.admin.updateUserById(target.user_id, {
    ban_duration: 'none',
  });
  if (unbanErr) {
    console.error('[team-access] unban failed', { memberId, error: unbanErr.message });
    return { ok: false, error: unbanErr.message };
  }
  return { ok: true, changed: true };
}
