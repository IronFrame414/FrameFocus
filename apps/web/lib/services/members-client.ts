import { createClient } from '@/lib/supabase-browser';

// EDITING A TEAM MEMBER — TWO TABLES, TWO POLICIES, ONE SCREEN. [S121, Josh]
//
// RULED: "editing a team member means BOTH `company_members` (member type,
// schedule color, active status) and `profiles` (name, email, phone)." That
// resolves the blocker docs/specs/M6M-edit-surfaces-spec.md finding 2 recorded:
// it is not one table or the other.
//
// ===========================================================================
// ⚠️ WHAT THE COMBINED PERMISSION ACTUALLY IS — IT IS NOT "OWNER/ADMIN"
// ===========================================================================
// The two tables do not agree, and the difference is not cosmetic. Read from
// the migrations:
//
//   company_members_update_authorized   (20260704210000:92)
//     company_id = get_my_company_id() AND get_my_role() = ANY (owner, admin)
//
//   profiles_update_owner               (baseline:3710)
//     USING      company + role = 'owner'
//     WITH CHECK company + role = 'owner'
//                AND (user_id <> auth.uid() OR role = 'owner')
//
//   profiles_update_admin               (baseline:3703)
//     company + role = 'admin'
//     AND user_id <> auth.uid()
//     AND target.role <> ALL (owner, admin)
//
// So, stated plainly:
//
//   OWNER  edits both halves for anyone. (The WITH CHECK only stops an owner
//          demoting themselves, and this screen never writes `role`.)
//   ADMIN  edits the company_members half for anyone, and the profiles half
//          only for a member whose profile role is NOT owner and NOT admin,
//          and never their own.
//
// **An Admin editing another Admin, or the Owner, or themselves, gets the
// company_members half and NOT the profiles half.** That is a live, ordinary
// case — not an edge — and it is the reason the partial-failure handling below
// exists rather than being defensive boilerplate.
//
// ===========================================================================
// ⚠️ A REFUSED UPDATE DOES NOT ERROR. IT AFFECTS ZERO ROWS.
// ===========================================================================
// Postgres RLS filters UPDATE through `USING`, so a write the policy refuses
// returns success with nothing changed. `.select()` is therefore not decoration
// here — **it is the only way to tell a refusal from a success**, and without
// it this screen would report "Saved" while half the form was silently dropped.
// Both functions below return the row count for that reason.
//
// ===========================================================================
// ⚠️ A-47's TRAP: 32 OF 33 ROSTER MEMBERS HAVE NO PROFILE
// ===========================================================================
// `company_members.profile_id` is NULLABLE, and on rebuild-test **32 of 33
// subcontractor members are null** — they are directory rows minted by
// `create_member_for_new_subcontractor()`, not people who can sign in. The
// desktop `updateTeamMember` (team.ts:44) writes `profiles` BY PROFILE ID and
// would resolve nothing for every one of them.
//
// So a member without a profile can only have the company_members half edited.
// That is handled as a FIRST-CLASS STATE — the caller is told there is no
// profile rather than being handed an error — because for most of the roster it
// is the normal case, not a failure.

export interface MemberUpdate {
  display_name?: string;
  member_type?: 'crew' | 'subcontractor';
  schedule_color?: string | null;
  /** The trash-bin flag. `true` deactivates. */
  is_deleted?: boolean;
}

export interface ProfileUpdate {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string | null;
}

export type WriteOutcome =
  | { status: 'ok' }
  | { status: 'refused' }
  | { status: 'error'; error: string }
  | { status: 'no-profile' };

/**
 * The `company_members` half. Owner/Admin, for any member.
 *
 * `updated_by` / `updated_at` are left to the table's BEFORE UPDATE triggers —
 * the service-layer contract in CLAUDE.md.
 */
export async function updateMember(id: string, updates: MemberUpdate): Promise<WriteOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('company_members')
    .update(updates)
    .eq('id', id)
    .select('id');

  if (error) return { status: 'error', error: error.message };
  // Zero rows means RLS refused it — see the header. Not an error, and it must
  // not be reported as a success either.
  return (data ?? []).length > 0 ? { status: 'ok' } : { status: 'refused' };
}

/**
 * The `profiles` half, BY PROFILE ID.
 *
 * ⚠️ `email` HERE IS NOT THE SIGN-IN ADDRESS. `profiles.email` is the display
 * and correspondence copy; the credential lives in `auth.users.email` and is
 * changed through Supabase Auth, which this does not touch. Editing it changes
 * who mail is addressed to and **not** who can sign in. Ruled in scope [Josh,
 * S121]; the divergence is stated here and on the form so nobody discovers it
 * by locking a user out of their own account.
 *
 * `role` is deliberately absent: A-47c cut every management control from the
 * mobile surface, and `profiles_update_admin`'s WITH CHECK would refuse an
 * admin setting it anyway.
 */
export async function updateMemberProfile(
  profileId: string | null,
  updates: ProfileUpdate
): Promise<WriteOutcome> {
  if (!profileId) return { status: 'no-profile' };

  const supabase = createClient();
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', profileId)
    .select('id');

  if (error) return { status: 'error', error: error.message };
  return (data ?? []).length > 0 ? { status: 'ok' } : { status: 'refused' };
}
