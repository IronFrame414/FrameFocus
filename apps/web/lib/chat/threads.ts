import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { candidateTokens, type MentionCandidate } from '@/lib/chat/mentions';

/**
 * Thread resolution and the postable set.
 *
 * Spec: chat-spec.md §4.1, §5.2 (on `spec/chat-s124` @ 4b61b9d).
 *
 * ---------------------------------------------------------------------------
 * EVERY FUNCTION HERE TAKES THE CALLER'S CLIENT. NEVER THE SERVICE ROLE.
 * ---------------------------------------------------------------------------
 * ND-18's rule, applied: the write runs as the caller so RLS decides, and only
 * the notification runs as the platform. A `getSupabaseAdmin()` in this file
 * would delete the entire access model — and every test would still pass,
 * because the writes would simply succeed more often.
 */

export type ThreadKind = 'crew' | 'sub';

export interface ChatThread {
  id: string;
  project_id: string;
  kind: ThreadKind;
}

/**
 * Get the thread, creating it on first use (§4.1 — "lazily, on first open or
 * first message. Not backfilled across existing projects").
 *
 * Returns `null` when RLS refuses — which is a real answer, not an error: a
 * subcontractor asking for a crew thread gets nothing, and that is ND-19
 * working rather than a fault to report.
 */
export async function resolveThread(
  supabase: SupabaseClient<Database>,
  projectId: string,
  kind: ThreadKind
): Promise<ChatThread | null> {
  const { data: existing } = await supabase
    .from('chat_threads')
    .select('id, project_id, kind')
    .eq('project_id', projectId)
    .eq('kind', kind)
    .maybeSingle();

  if (existing) return existing as ChatThread;

  // The insert races another opener of the same thread. UNIQUE (project_id,
  // kind) makes that safe rather than duplicating, and the re-select below is
  // how the loser of the race gets the winner's row instead of an error.
  const { data: created, error } = await supabase
    .from('chat_threads')
    .insert({ project_id: projectId, kind })
    .select('id, project_id, kind')
    .maybeSingle();

  if (created) return created as ChatThread;

  if (error?.code === '23505') {
    const { data: raced } = await supabase
      .from('chat_threads')
      .select('id, project_id, kind')
      .eq('project_id', projectId)
      .eq('kind', kind)
      .maybeSingle();
    return (raced as ChatThread) ?? null;
  }

  return null;
}

/**
 * The thread's POSTABLE set — §5.2, and the set the mention picker offers.
 *
 * ⚠️ POSTABLE, NOT READABLE, AND THE DIFFERENCE IS THE FEATURE. Crew can READ a
 * sub thread and cannot post in it (ND-20), so crew must not be mentionable
 * there: §3d — "being mentionable in a thread he cannot reply in is a dead
 * end". Handing the readable set to the parser would produce exactly that.
 *
 * Resolved through `profiles`, because a mention recipient is a profile (ND-2)
 * and because `company_members` carries no role.
 */
export async function postableSet(
  admin: SupabaseClient<Database>,
  thread: ChatThread,
  companyId: string
): Promise<MentionCandidate[]> {
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, first_name, last_name, role')
    .eq('company_id', companyId)
    .eq('is_deleted', false);

  if (!profiles) return [];

  if (thread.kind === 'crew') {
    // Everyone who can view the project except a subcontractor. Assignment is
    // resolved below; role is resolved here.
    const eligible = profiles.filter((p) => p.role !== 'subcontractor' && p.role !== 'client');
    return withAssignment(admin, thread.project_id, eligible);
  }

  // Sub thread: Owner and Admin by role; PM and subcontractor by assignment.
  // Foreman and crew are READERS only and are deliberately absent.
  const byRole = profiles.filter((p) => p.role === 'owner' || p.role === 'admin');
  const byAssignment = profiles.filter(
    (p) => p.role === 'project_manager' || p.role === 'subcontractor'
  );
  const assigned = await withAssignment(admin, thread.project_id, byAssignment);
  return [...byRole.map(toCandidate), ...assigned];
}

function toCandidate(p: { id: string; first_name: string; last_name: string }): MentionCandidate {
  return { profileId: p.id, tokens: candidateTokens(p.first_name, p.last_name) };
}

/** Narrow a profile list to those with a live assignment on the project. */
async function withAssignment(
  admin: SupabaseClient<Database>,
  projectId: string,
  profiles: Array<{ id: string; first_name: string; last_name: string; role: string }>
): Promise<MentionCandidate[]> {
  if (profiles.length === 0) return [];

  // ONE query, not one per profile. The naive shape is an N+1 across the whole
  // company roster every time somebody types `@`.
  const { data: rows } = await admin
    .from('project_assignments')
    .select('member:company_members!inner(profile_id)')
    .eq('project_id', projectId)
    .eq('is_deleted', false);

  const assigned = new Set(
    ((rows ?? []) as unknown as Array<{ member: { profile_id: string | null } | null }>)
      .map((r) => r.member?.profile_id)
      .filter((id): id is string => Boolean(id))
  );

  // Owner and Admin reach every project by role, so they are eligible whether
  // or not an assignment row exists — the same rule can_view_project() applies.
  return profiles
    .filter((p) => p.role === 'owner' || p.role === 'admin' || assigned.has(p.id))
    .map(toCandidate);
}
