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

/**
 * ⚠️ `client` ADDED BY M9 R11 [S164]. Three kinds, not two.
 *
 * The CHECK on `chat_threads.kind` is the authority and this follows it. Read
 * `20261021000000` §2 before adding a fourth: the pre-existing SELECT policies
 * are shaped `kind = 'sub' OR role IS DISTINCT FROM 'subcontractor'`, so any
 * new kind is admitted to every non-subcontractor role by default — which is
 * how a fourth kind would silently reach foreman and crew, with nothing
 * failing and no policy edited.
 */
export type ThreadKind = 'crew' | 'sub' | 'client';

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

type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * May the caller post in this thread? — §7.4, M6M D-54. [Slice 4]
 *
 * ⚠️ THE DATABASE ANSWERS, NOT TYPESCRIPT. The crew-reading-a-sub-thread case
 * needs a composer that is ABSENT rather than disabled, and D-54 is explicit
 * that the absence must be a policy rather than CSS. Re-stating
 * `chat_messages_insert_authorized`'s predicate here in TypeScript would be a
 * second definition of who may post, drifting the first time either changed.
 *
 * `chat_can_post` (20260909000000) is SECURITY INVOKER and mirrors that policy;
 * `s126-chat-sub.live.ts` asserts the function and a real INSERT agree for
 * every role, which is what keeps the mirror honest.
 *
 * Defaults to FALSE on any error. A failure to establish permission is not
 * permission — the wrong direction here renders a composer whose every send is
 * refused.
 */
export async function canPostInThread(
  supabase: SupabaseClient<Database>,
  threadId: string
): Promise<boolean> {
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  const { data, error } = await rpc('chat_can_post', { p_thread_id: threadId });
  if (error) return false;
  return data === true;
}

/**
 * ND-25 — the projects whose sub thread should render at all. [Slice 4]
 *
 * "Where a project has no assigned sub with a profile, the sub thread does not
 * render." Threads are created lazily, so this cannot be answered by looking
 * for a `chat_threads` row: the question is asked before the first one exists.
 *
 * One round trip for the whole switcher (`chat_sub_thread_projects`), not one
 * call per project — the N+1 §7.1a-i names.
 */
export async function subThreadProjects(
  supabase: SupabaseClient<Database>
): Promise<Set<string>> {
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  const { data, error } = await rpc('chat_sub_thread_projects');
  if (error || !Array.isArray(data)) return new Set();
  return new Set((data as Array<{ project_id: string }>).map((r) => r.project_id));
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
