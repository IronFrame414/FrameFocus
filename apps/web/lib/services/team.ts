import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type InvitationRow = Database['public']['Tables']['invitations']['Row'];

export type TeamMember = Pick<
  ProfileRow,
  'id' | 'first_name' | 'last_name' | 'role' | 'created_at'
>;

export type Invitation = Pick<
  InvitationRow,
  'id' | 'email' | 'role' | 'status' | 'created_at' | 'expires_at'
> & { token?: string };
export type TeamMemberDetail = Pick<
  ProfileRow,
  | 'id'
  | 'user_id'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'role'
  | 'notes'
  | 'is_deleted'
  | 'created_at'
>;

export type CompanyAdmin = Pick<ProfileRow, 'id' | 'email' | 'first_name' | 'last_name'>;

// ===========================================================================
// ⚠️ A CLIENT IS NOT A TEAM MEMBER. ONE RULE, TWO SURFACES. [#1-s168, S175 #6]
// ===========================================================================
//
// Josh, from a click-test: *"client should be removed from team side."* A client
// has no seat, no dashboard, no `company_members` row and no rate — nothing on
// the Team side applies to them. They were listed there because the Team page
// predates the portal, and the invite it offered them was a dead end.
//
// ⚠️ THE LIST AND THE DETAIL ROUTE MUST READ THE **SAME** RULE, WHICH IS WHY IT
// IS A CONSTANT AND NOT TWO `.neq()` CALLS. `TECH_DEBT` #1-s168's fifth limb is
// the one that matters: *"The detail route is reachable by URL for a client's
// profile id whether or not the list shows it. Dropping the row from the list is
// cosmetic on its own."* `getTeamMember()` below therefore applies the same
// filter, so `/dashboard/team/[id]` inherits it — as does every other caller,
// present and future, without anyone remembering to.
//
// ⚠️ `subcontractor` IS NOT IN THIS LIST, AND THAT IS A RULING, NOT AN
// OVERSIGHT. [Josh, S175 Q6.1] The brief is "clients off the Team side". Subs
// DO hold `company_members` rows and dashboard-adjacent access, and they have
// their own area at `/dashboard/subcontractors`; removing them is a second,
// unruled change that would silently drop rows nobody asked about.
// **`DASHBOARD_ROLES` is the tempting reach and it is wrong here** — it excludes
// `subcontractor` as well, and `TECH_DEBT` #1-s168 flags that in its own words
// as *"a scope decision, not a freebie"*.
//
// Measured on rebuild-test before the change: the Owner's Team list was 9 rows —
// owner, admin, project_manager, foreman, crew_member, subcontractor and THREE
// clients. After it: 6, with the subcontractor still present.
export const NON_TEAM_ROLES: readonly string[] = ['client'];

/** Whether a profile role belongs on the Team side at all. */
export function isTeamRole(role: string | null | undefined): boolean {
  return !!role && !NON_TEAM_ROLES.includes(role);
}

/**
 * Fetch a single team member by profile id (for edit page).
 *
 * ⚠️ RETURNS NULL FOR A ROLE THE TEAM SIDE DOES NOT REPRESENT, rather than the
 * row. That is limb 4 of #1-s168 and it is the substance of the fix: filtering
 * the LIST is cosmetic while `/dashboard/team/<client-profile-id>` still renders
 * the staff editor for them. The gate lives here, in the same file and off the
 * same constant as the list's filter, so the two cannot drift.
 *
 * `.eq('role', …)` would have been the alternative and is worse: it would send a
 * second query's worth of rule to the database and leave the page free to ignore
 * the answer. The caller already redirects on a falsy return.
 */
export async function getTeamMember(
  supabase: SupabaseClient,
  id: string
): Promise<TeamMemberDetail | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, user_id, first_name, last_name, email, phone, role, notes, is_deleted, created_at')
    .eq('id', id)
    .single();
  if (error) throw error;
  const row = data as TeamMemberDetail;
  return isTeamRole(row.role) ? row : null;
}

/** Update editable fields on a team member's profile. RLS enforces who can change what. */
export async function updateTeamMember(
  supabase: SupabaseClient,
  id: string,
  updates: {
    first_name?: string;
    last_name?: string;
    phone?: string | null;
    role?: string;
    notes?: string | null;
  }
) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select('id, user_id, first_name, last_name, email, phone, role, notes, is_deleted, created_at')
    .single();
  if (error) throw error;
  return data as TeamMemberDetail;
}

/** Soft-delete a team member: mark profile is_deleted and ban the auth user so they cannot log in. */
export async function softDeleteTeamMember(
  supabase: SupabaseClient,
  supabaseAdmin: SupabaseClient,
  profileId: string,
  userId: string
) {
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', profileId);
  if (profileError) throw profileError;

  const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: '876000h',
  });
  if (banError) throw banError;
}

/** Send a password recovery email to a team member. Caller authorization must be checked before calling. */
export async function resetTeamMemberPassword(
  supabase: SupabaseClient,
  email: string,
  redirectTo: string
) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) throw error;
}

/**
 * Fetch all active team members for the current user's company.
 *
 * ⚠️ CLIENTS ARE EXCLUDED — limb 3 of #1-s168. The filter is `NON_TEAM_ROLES`,
 * the same constant `getTeamMember()` gates the detail route on, expressed as a
 * `.not(… 'in' …)` so the DATABASE drops the rows rather than this process
 * fetching and discarding them.
 *
 * ⚠️ AND IT IS A DENY-LIST, NOT AN ALLOW-LIST, ON PURPOSE. `.in('role',
 * DASHBOARD_ROLES)` or `.in('role', TEAM_ROLES)` would read as tidier and would
 * silently drop SUBCONTRACTORS too — the change Q6.1 rules out. A deny-list of
 * exactly the roles that were ruled out cannot over-reach: a role added to
 * `profiles` in future appears on the Team side until somebody decides
 * otherwise, which is the safe direction for a roster to fail in.
 *
 * RLS is unchanged and is still the tenant gate: this narrows a projection, it
 * grants nothing. A subcontractor calling this still reads only Owner/Admin/PM
 * plus their own row (the S131 roster floor), because that is a policy.
 */
export async function getTeamMembers(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, role, created_at')
    .eq('is_deleted', false)
    .not('role', 'in', `(${NON_TEAM_ROLES.join(',')})`)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as TeamMember[];
}

/**
 * Fetch all pending invitations for the current user's company.
 *
 * D4 [S135] — `token` is now selected, so the Team page can show the link
 * again. Before this there was no way to retrieve an invite link after
 * creation: the only control on a pending row was Cancel, so a lost link meant
 * cancel-and-re-invite.
 *
 * ⚠️ NO POLICY CHANGE WAS NEEDED, AND THAT IS THE POINT.
 * `invitations_select_owner_admin` has always granted Owner/Admin SELECT on the
 * whole row, `token` included, and `Invitation` already declared `token?:
 * string`. The column was simply never asked for. Anyone reviewing this should
 * confirm the same — the reach is unchanged, only the projection.
 */
export async function getPendingInvitations(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('invitations')
    .select('id, email, role, status, created_at, expires_at, token')
    .eq('status', 'pending')
    .eq('is_deleted', false)
    // S175 #1-s168 — clients are off the Team side, and that includes their
    // INVITATIONS. The invite form stopped offering Client, but a pending
    // client invitation can still exist (legacy, or the portal flow), and once
    // step-4's redesign rendered pending invites as rows of the one team
    // table, such a row put a "Client" chip back on the surface the ruling
    // cleared (caught live by desktop-team.spec.ts:48 against a real pending
    // client invite). Client-portal invitation state renders on CONTACTS —
    // its own column — not here. This function is Team's only reader.
    .neq('role', 'client')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as Invitation[];
}

/** Cancel a pending invitation */
export async function cancelInvitation(supabase: SupabaseClient, invitationId: string) {
  const { error } = await supabase
    .from('invitations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', invitationId);

  if (error) throw error;
}

/** Fetch all active Admins for a company. Used by the ownership-transfer form. */
export async function getCompanyAdmins(
  supabase: SupabaseClient,
  companyId: string,
  excludeProfileId?: string
): Promise<CompanyAdmin[]> {
  let q = supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .eq('company_id', companyId)
    .eq('role', 'admin')
    .eq('is_deleted', false)
    .order('first_name', { ascending: true });
  if (excludeProfileId) q = q.neq('id', excludeProfileId);
  const { data, error } = await q;
  if (error) throw error;
  return data as CompanyAdmin[];
}

/** Create a new invitation and return the record (including token) */
export async function createInvitation(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    email: string;
    role: string;
    invitedBy: string;
  }
) {
  const { data, error } = await supabase
    .from('invitations')
    .insert({
      company_id: params.companyId,
      email: params.email,
      role: params.role,
      invited_by: params.invitedBy,
      created_by: params.invitedBy,
    })
    .select('id, email, role, token, expires_at')
    .single();

  if (error) throw error;
  return data as Invitation;
}
