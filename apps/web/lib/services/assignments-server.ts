import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type {
  ProjectAssignmentCreateInput,
  PunchItemCreateInput,
} from '@framefocus/shared/validation/assignments';

/**
 * ND-18 — the WRITE half of the two assignment routes.
 *
 * ===========================================================================
 * ⚠️ THESE FUNCTIONS DO NOT NOTIFY. THE ROUTES DO.
 * ===========================================================================
 * That split is the answer to "which callers must not notify" (ND-18):
 * fixtures, harnesses and any future bulk import call THESE, and never reach a
 * route, so they cannot generate notifications. There is deliberately NO
 * `notify: false` parameter on the routes — a public endpoint that accepts
 * "do not tell anyone" is a suppression switch, and §3b is precisely where a
 * missed notification means somebody does not know they have work.
 *
 * The cost of the split is that a NEW UI path calling these directly would
 * silently lose its notification. That is why the names say `AsCaller` and this
 * banner exists: if you are writing UI, you want the route.
 *
 * ===========================================================================
 * EVERY ONE OF THESE TAKES THE CALLER'S CLIENT. NEVER THE SERVICE ROLE.
 * ===========================================================================
 * `supabase` here is the REQUEST-SCOPED client from `@/lib/supabase-server`,
 * carrying the signed-in user's JWT. The write therefore runs under exactly the
 * policies it ran under when it was a client-direct call — moving it to a
 * server route changed the transport and nothing about the authorisation.
 *
 * Reaching for `getSupabaseAdmin()` here would silently delete that floor and
 * the tests would all still pass, which is why it is called out rather than
 * assumed.
 */

export interface WriteResult {
  success: boolean;
  id?: string;
  error?: string;
  /** Distinguishes "RLS said no" from "the row was malformed" for the route. */
  denied?: boolean;
}

/** Postgres codes that mean the policy refused, not that the data was bad. */
function isDenial(code: string | undefined): boolean {
  // 42501 insufficient_privilege — what an RLS refusal surfaces as on INSERT
  // with a failing WITH CHECK.
  return code === '42501';
}

export async function insertPunchItemAsCaller(
  supabase: SupabaseClient<Database>,
  input: PunchItemCreateInput
): Promise<WriteResult> {
  const { data, error } = await supabase
    .from('punch_list_items')
    .insert(input)
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message, denied: isDenial(error.code) };
  }
  return { success: true, id: data.id };
}

/**
 * Assign a member, reviving a soft-deleted row rather than inserting a
 * duplicate.
 *
 * The UNIQUE (project_id, member_id) constraint means an unassign-then-reassign
 * cycle MUST go through the un-delete branch; a plain insert returns 23505 and
 * the member appears un-assignable forever. This is the same logic
 * `reassignMember()` had client-side, moved server-side unchanged.
 */
export async function upsertProjectAssignmentAsCaller(
  supabase: SupabaseClient<Database>,
  input: ProjectAssignmentCreateInput
): Promise<WriteResult> {
  const { data: existing } = await supabase
    .from('project_assignments')
    .select('id, is_deleted')
    .eq('project_id', input.project_id)
    .eq('member_id', input.member_id)
    .maybeSingle();

  if (existing) {
    if (!existing.is_deleted) {
      return { success: false, error: 'This member is already assigned to the project.' };
    }
    const { error } = await supabase
      .from('project_assignments')
      .update({ is_deleted: false, deleted_at: null })
      .eq('id', existing.id);
    if (error) {
      return { success: false, error: error.message, denied: isDenial(error.code) };
    }
    return { success: true, id: existing.id };
  }

  const { data, error } = await supabase
    .from('project_assignments')
    .insert({
      project_id: input.project_id,
      member_id: input.member_id,
      role_on_project: input.role_on_project ?? null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'This member is already assigned to the project.' };
    }
    return { success: false, error: error.message, denied: isDenial(error.code) };
  }
  return { success: true, id: data.id };
}
