import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { CompanyRole } from '@framefocus/shared';
import { notify, type NotifyRecipient } from '@/lib/notify/notify';

/**
 * §3b — assignment notifications, and §13.2's three-state reachability.
 *
 * Spec: docs/specs/notifications-architecture.md §3b, §13.2, §13.3, ND-18.
 *
 * ===========================================================================
 * THE ONE PLACE company_members IS THE CORRECT KEY
 * ===========================================================================
 * ND-2 says notification recipients are PROFILES. Assignment is the documented
 * exception (§13.3): both `punch_list_items.assignee_id` and
 * `project_assignments.member_id` point at `company_members`, because that is
 * where subcontractors live and a sub may have no login at all. So assignment
 * resolves MEMBER → PROFILE, and the resolution genuinely fails for most rows:
 * 34 of 41 member rows have no `profile_id`.
 *
 * A failed resolution is NOT an error. It is §13.2 state 2 or 3, and the caller
 * is told which so the surface can say so.
 */

/** §13.2 — what channels are available for one assignee. */
export type Reachability =
  | { state: 'profile'; recipient: NotifyRecipient; displayName: string }
  /** Email on file but no login: no notification row (ND-2 forbids one). */
  | { state: 'email-only'; email: string; displayName: string }
  /** Neither. Recorded, never a throw, never a silent drop. */
  | { state: 'unreachable'; displayName: string };

/**
 * Resolve one `company_members.id` to the channels that can actually reach it.
 *
 * Reads through the SERVICE-ROLE client deliberately. The caller doing the
 * assigning may be a PM or a foreman, and `profiles` is company-scoped but the
 * subcontractor lookup is not something every assigner can necessarily read.
 * Resolving the AUDIENCE is not the same act as performing the WRITE — the
 * write already happened, under the caller's own RLS, in the route. See ND-18.
 */
export async function resolveMemberReachability(
  admin: SupabaseClient<Database>,
  memberId: string
): Promise<Reachability> {
  const { data: member } = await admin
    .from('company_members')
    .select('id, display_name, profile_id')
    .eq('id', memberId)
    .maybeSingle();

  if (!member) return { state: 'unreachable', displayName: 'Unknown member' };

  if (member.profile_id) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, first_name, role')
      .eq('id', member.profile_id)
      .eq('is_deleted', false)
      .maybeSingle();

    if (profile) {
      return {
        state: 'profile',
        displayName: member.display_name,
        recipient: {
          profileId: profile.id,
          role: profile.role as CompanyRole,
          email: profile.email,
          firstName: profile.first_name,
        },
      };
    }
    // A profile_id pointing at a soft-deleted profile falls through to the
    // email states rather than being treated as reachable. A row addressed to a
    // deleted profile is a row nobody will ever read.
  }

  const { data: sub } = await admin
    .from('subcontractors')
    .select('email')
    .eq('member_id', memberId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (sub?.email) {
    return { state: 'email-only', email: sub.email, displayName: member.display_name };
  }
  return { state: 'unreachable', displayName: member.display_name };
}

/** What a caller reports back to its surface (§13.2's non-blocking notice). */
export interface AssignmentNotifyOutcome {
  notified: boolean;
  /** §13.2 state 2 — reachable by email only; no in-app row was written. */
  emailOnly: string | null;
  /** §13.2 state 3 — no channel at all. The surface says so, non-blocking. */
  unreachableName: string | null;
}

const UNNOTIFIED = (r: Reachability): AssignmentNotifyOutcome => ({
  notified: false,
  emailOnly: r.state === 'email-only' ? r.email : null,
  unreachableName: r.state === 'unreachable' ? r.displayName : null,
});

/**
 * §3b — "Josh assigned you to Alvarez", for a project membership.
 *
 * Self-assignment writes nothing. A PM who adds themselves to a project does
 * not need telling, and `project_assignments_insert_authorized` explicitly
 * permits that case (`member_id = get_my_member_id() AND
 * is_project_creator(project_id)`), so it is a NORMAL path rather than an edge
 * one — without this check it would be the most common notification the system
 * sends, and every one of them useless.
 */
export async function notifyProjectAssigned(
  admin: SupabaseClient<Database>,
  params: {
    companyId: string;
    projectId: string;
    projectName: string;
    memberId: string;
    assignerName: string;
    /** The assigner's own profile id, so self-assignment stays silent. */
    assignerProfileId: string | null;
  }
): Promise<AssignmentNotifyOutcome> {
  const reach = await resolveMemberReachability(admin, params.memberId);
  if (reach.state !== 'profile') return UNNOTIFIED(reach);

  if (reach.recipient.profileId === params.assignerProfileId) {
    return { notified: false, emailOnly: null, unreachableName: null };
  }

  await notify({
    admin,
    companyId: params.companyId,
    type: 'assignment',
    recipients: [reach.recipient],
    render: () => ({
      title: `${params.assignerName} assigned you to ${params.projectName}`,
    }),
    linkKey: 'project',
    linkParams: { projectId: params.projectId },
    projectId: params.projectId,
    source: { table: 'project_assignments', id: params.projectId },
    tag: `project-assigned-${params.projectId}`,
  });

  return { notified: true, emailOnly: null, unreachableName: null };
}

/**
 * §3b / §13.3 — a punch item assigned to a member.
 *
 * Typed `punch_assigned` rather than `assignment` because the two have
 * different destinations and different lifetimes, and a single type would make
 * "you have been assigned something" unanswerable without opening it.
 */
export async function notifyPunchAssigned(
  admin: SupabaseClient<Database>,
  params: {
    companyId: string;
    projectId: string;
    punchItemId: string;
    punchTitle: string;
    memberId: string;
    assignerName: string;
    assignerProfileId: string | null;
  }
): Promise<AssignmentNotifyOutcome> {
  const reach = await resolveMemberReachability(admin, params.memberId);
  if (reach.state !== 'profile') return UNNOTIFIED(reach);

  // Assigning a punch item to yourself is a to-do, not news. Common on mobile,
  // where the crew member filing the defect is often the one fixing it.
  if (reach.recipient.profileId === params.assignerProfileId) {
    return { notified: false, emailOnly: null, unreachableName: null };
  }

  await notify({
    admin,
    companyId: params.companyId,
    type: 'punch_assigned',
    recipients: [reach.recipient],
    render: () => ({
      title: `${params.assignerName} assigned you a punch item`,
      body: params.punchTitle,
    }),
    // The `punch` key resolves to the project's punch LIST on both surfaces —
    // there is a mobile item detail route but no desktop one, and a key that
    // resolved to different DEPTHS per surface would make "open it" mean two
    // things. The list is where both surfaces can show the item.
    linkKey: 'punch',
    linkParams: { projectId: params.projectId, id: params.punchItemId },
    projectId: params.projectId,
    source: { table: 'punch_list_items', id: params.punchItemId },
    tag: `punch-assigned-${params.punchItemId}`,
  });

  return { notified: true, emailOnly: null, unreachableName: null };
}
