import { createClient } from '@/lib/supabase-browser';
import type { Project, ProjectStatus, ProjectType } from '@/lib/services/projects';
import { applied, DISCARDED } from '@/lib/services/mutation-result';
export type { Project, ProjectStatus, ProjectType };

/**
 * Allowed status transitions (5A §2 lifecycle, amended by 7A-spec §2.7/§3.4
 * decision 7): active <-> on_hold (reversible), active -> complete,
 * any -> cancelled, complete -> archived, and complete -> active (REOPEN —
 * Owner/Admin only, enforced in transitionProjectStatus; late cost = reopen,
 * log, re-complete; punch gate re-runs on every re-complete).
 */
const STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  active: ['on_hold', 'complete', 'cancelled'],
  on_hold: ['active', 'cancelled'],
  complete: ['active', 'archived', 'cancelled'],
  archived: ['cancelled'],
  cancelled: [],
};

export function allowedStatusTransitions(from: ProjectStatus): ProjectStatus[] {
  return STATUS_TRANSITIONS[from] ?? [];
}

// Presentation label maps. Kept in this client-safe module (not projects.ts,
// which imports the server Supabase client) so client components can import
// them directly. projects.ts re-exports both for server-side consumers.
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Active',
  on_hold: 'On Hold',
  complete: 'Complete',
  archived: 'Archived',
  cancelled: 'Cancelled',
};

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  fixed_price: 'Fixed Price',
  time_and_materials: 'Time & Materials',
  cost_plus: 'Cost Plus',
};

export async function createProject(project: {
  name: string;
  contact_id: string;
  contact_address_id?: string | null;
  project_type: ProjectType;
  start_date?: string | null;
  target_end_date?: string | null;
  internal_notes?: string | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();

  // Postgres defaults fill in company_id, created_by, updated_by,
  // project_number (next_project_number) and project_internal_seq.
  const { data, error } = await supabase.from('projects').insert(project).select('id').single();

  if (error) return { success: false, error: error.message };

  // Seed the creator's assignment so a PM can see the project they just
  // created (visibility is assignment-based). Owner/Admin see everything,
  // but the row is harmless and keeps team lists honest.
  const { data: profile } = await supabase.auth.getUser().then(async ({ data: { user } }) => {
    if (!user) return { data: null };
    return supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .single();
  });

  if (profile) {
    const { data: member } = await supabase
      .from('company_members')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('is_deleted', false)
      .maybeSingle();

    if (member) {
      await supabase.from('project_assignments').insert({
        project_id: data.id,
        member_id: member.id,
        role_on_project: 'creator',
      });
    }
  }

  return { success: true, id: data.id };
}

export async function updateProject(
  id: string,
  updates: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  if ('status' in updates) {
    return { success: false, error: 'Status changes must go through transitionProjectStatus().' };
  }

  // RULING 2 [S97]: the contract value lives in project_financials (Owner/Admin
  // RLS), not on this row. This refusal exists because `updates` is an untyped
  // bag — without it a future caller could quietly write the retired column
  // while the real figure sat elsewhere, and nothing would complain.
  if ('contract_value' in updates) {
    return {
      success: false,
      error: 'The contract value is not set here — it lives in project_financials (Owner/Admin).',
    };
  }

  // BEFORE UPDATE trigger `projects_set_updated_by` handles updated_by.
  // updated_at is handled by the existing updated_at trigger.
  const { data, error } = await supabase.from('projects').update(updates).eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

/**
 * Status transition with lifecycle validation. The active -> complete punch
 * gate (5A §2, enforced per 5C §6) blocks completion while any punch item is
 * unresolved: an item is closed when verified (if verification required) or
 * complete (if not).
 *
 * 7A additions (§3.4): complete -> active is the REOPEN — Owner/Admin only
 * (opts.userRole, the deleteProject precedent; service-layer per #82's
 * status quo). Re-completing a reopened project (an actual_end_date already
 * exists) requires opts.endDateChoice — the UI prompts keep-original vs
 * update-to-today (locked decision 8; per-case, no rule). First-time
 * completion keeps the auto-stamp. opts is optional so existing 3-arg
 * callers compile; the new paths fail with clear errors until the UI
 * supplies opts.
 */
export async function transitionProjectStatus(
  id: string,
  from: ProjectStatus,
  to: ProjectStatus,
  opts?: { userRole?: string; endDateChoice?: 'keep' | 'today' }
): Promise<{ success: boolean; error?: string }> {
  if (!allowedStatusTransitions(from).includes(to)) {
    return { success: false, error: `Cannot move a ${from} project to ${to}.` };
  }

  const supabase = createClient();

  if (from === 'complete' && to === 'active') {
    if (opts?.userRole !== 'owner' && opts?.userRole !== 'admin') {
      return { success: false, error: 'Only Owner or Admin can reopen a completed project.' };
    }
  }

  if (from === 'active' && to === 'complete') {
    const gate = await checkPunchGate(id);
    if (!gate.ok) return { success: false, error: gate.error };
  }

  const updates: Record<string, unknown> = { status: to };
  if (to === 'complete') {
    // Re-complete detection: a prior actual_end_date means this project was
    // completed before (and reopened). Fail closed on a read error — the
    // date decision must not be silently defaulted.
    const { data: current, error: readError } = await supabase
      .from('projects')
      .select('actual_end_date')
      .eq('id', id)
      .single();
    if (readError || !current) {
      return { success: false, error: 'Could not verify the project end date. Try again.' };
    }

    if (current.actual_end_date === null) {
      // First completion — auto-stamp today (unchanged 5A behavior).
      updates.actual_end_date = new Date().toISOString().slice(0, 10);
    } else if (opts?.endDateChoice === 'today') {
      updates.actual_end_date = new Date().toISOString().slice(0, 10);
    } else if (opts?.endDateChoice === 'keep') {
      // Keep the original date — no write.
    } else {
      return {
        success: false,
        error:
          'This project was completed before. Choose whether to keep the original end date or update it to today.',
      };
    }
  }

  const { data, error } = await supabase.from('projects').update(updates).eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

/**
 * Punch-close gate (5A §2 owns the rule; 5C §6 defines "closed"): the
 * active -> complete transition is blocked unless EVERY punch item is closed —
 * verified when verification is required, complete otherwise. Open and
 * in-progress items block; complete-but-verification-pending items block too.
 */
async function checkPunchGate(projectId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();

  const { count: openCount, error: openError } = await supabase
    .from('punch_list_items')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .in('status', ['open', 'in_progress']);

  const { count: unverifiedCount, error: unverifiedError } = await supabase
    .from('punch_list_items')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .eq('status', 'complete')
    .eq('requires_verification', true);

  // Fail closed: a failed or null count must not be read as "zero open items"
  // and silently permit completion.
  if (openError || unverifiedError || openCount === null || unverifiedCount === null) {
    return { ok: false, error: 'Could not verify punch list status. Try again.' };
  }

  const blocking = (openCount ?? 0) + (unverifiedCount ?? 0);
  if (blocking > 0) {
    return {
      ok: false,
      error: `${blocking} punch list item(s) must be closed (verified where required) before the project can be completed.`,
    };
  }
  return { ok: true };
}

/** Soft delete — Owner/Admin only (enforced here per trash-bin pattern). */
export async function deleteProject(
  id: string,
  userRole: string
): Promise<{ success: boolean; error?: string }> {
  if (userRole !== 'owner' && userRole !== 'admin') {
    return { success: false, error: 'Only Owner or Admin can delete projects.' };
  }
  const supabase = createClient();

  const { data, error } = await supabase
    .from('projects')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

export async function restoreProject(
  id: string,
  userRole: string
): Promise<{ success: boolean; error?: string }> {
  if (userRole !== 'owner' && userRole !== 'admin') {
    return { success: false, error: 'Only Owner or Admin can restore projects.' };
  }
  const supabase = createClient();

  const { data, error } = await supabase
    .from('projects')
    .update({ is_deleted: false, deleted_at: null })
    .eq('id', id)
    .select('id');

  if (error) return { success: false, error: error.message };
  if (!applied(data)) return { success: false, error: DISCARDED };
  return { success: true };
}

/**
 * Estimate -> Project conversion (5A §8). Single atomic RPC; role-gated
 * owner/admin/project_manager in the database. Returns the new project id.
 */
export async function convertEstimateToProject(
  estimateId: string
): Promise<{ success: boolean; projectId?: string; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc('convert_estimate_to_project', {
    p_estimate_id: estimateId,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, projectId: data as string };
}
