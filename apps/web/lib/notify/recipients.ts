import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { CompanyRole } from '@framefocus/shared';
import type { NotifyRecipient } from '@/lib/notify/notify';

/**
 * Recipient resolvers shared by notify() consumers.
 *
 * Spec: docs/specs/notifications-architecture.md §3e, §3f, §3g, ND-2.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE ARE HERE AND NOT COPIED INTO EACH CONSUMER
 * ---------------------------------------------------------------------------
 * §3e, §3f and §3g all name `getManagerRecipients()` as their Owner/Admin
 * source. That function returns `{ email, first_name }` — the shape an EMAIL
 * needs — and notify() needs a profile id and a role (ND-2, R7). Resolving that
 * inside each consumer would put three copies of "who is a manager" in the tree,
 * which is the divergence CLAUDE.md's parity rule describes: a second
 * implementation that does the same thing, written in a form that looks like
 * agreement.
 *
 * `getManagerRecipients()` is deliberately LEFT ALONE. It has four callers on
 * the email side and none of them want a role or an id; widening its return
 * type to serve a second consumer would make every one of those call sites
 * carry fields they do not use.
 */

/** Owner + Admin, as notify() recipients. The §3e/§3f/§3g manager audience. */
export async function getManagerNotifyRecipients(
  admin: SupabaseClient<Database>,
  companyId: string
): Promise<NotifyRecipient[]> {
  const { data } = await admin
    .from('profiles')
    .select('id, email, first_name, role')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .in('role', ['owner', 'admin']);

  return (data ?? []).map((p) => ({
    profileId: p.id,
    role: p.role as CompanyRole,
    email: p.email,
    firstName: p.first_name,
  }));
}

/**
 * Project managers ASSIGNED TO one project.
 *
 * The hop is `project_assignments.member_id → company_members.profile_id →
 * profiles`, because assignment is keyed on members and notification identity is
 * keyed on profiles (ND-2). The join is where the two meet, and it is also where
 * recipients legitimately disappear: 34 of 41 member rows have no `profile_id`,
 * so an assigned member with no login yields NO recipient. That is correct — a
 * notification row addressed to nobody cannot be read by anybody — and it is why
 * this returns fewer recipients than the project has assignees.
 */
export async function getProjectPmNotifyRecipients(
  admin: SupabaseClient<Database>,
  projectId: string
): Promise<NotifyRecipient[]> {
  const { data } = await admin
    .from('project_assignments')
    .select('member:company_members!inner(profile:profiles!inner(id, email, first_name, role, is_deleted))')
    .eq('project_id', projectId)
    .eq('is_deleted', false);

  const rows = (data ?? []) as unknown as Array<{
    member: {
      profile: {
        id: string;
        email: string;
        first_name: string;
        role: string;
        is_deleted: boolean | null;
      } | null;
    } | null;
  }>;

  return rows
    .map((r) => r.member?.profile)
    .filter(
      (p): p is NonNullable<typeof p> =>
        Boolean(p) && p!.role === 'project_manager' && p!.is_deleted !== true
    )
    .map((p) => ({
      profileId: p.id,
      role: p.role as CompanyRole,
      email: p.email,
      firstName: p.first_name,
    }));
}

/**
 * The profile behind an `auth.users` id — the shape `created_by` columns store.
 *
 * `change_orders.created_by` is a USER id, and every recipient identity in this
 * module is a PROFILE id. §3e's author audience is unreachable without this hop,
 * and doing it by hand at the call site is how a `created_by` ends up compared
 * against a `profiles.id` — a comparison that is always false and silently
 * demotes the author into the no-amount audience.
 */
export async function profileForUserId(
  admin: SupabaseClient<Database>,
  userId: string | null | undefined
): Promise<NotifyRecipient | null> {
  if (!userId) return null;

  const { data } = await admin
    .from('profiles')
    .select('id, email, first_name, role')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (!data) return null;
  return {
    profileId: data.id,
    role: data.role as CompanyRole,
    email: data.email,
    firstName: data.first_name,
  };
}
