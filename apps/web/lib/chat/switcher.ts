import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';

/**
 * ND-34 — the switcher's project list, and per-thread unread.
 *
 * Spec: chat-spec.md §7.1a-i. Both were named as NEW work with no precedent to
 * copy; the approach and its rejected alternative are recorded in the migration
 * header (20260907000000_chat_switcher.sql).
 *
 * ---------------------------------------------------------------------------
 * ONE ROUND TRIP, BY RPC, AND THAT IS THE WHOLE POINT
 * ---------------------------------------------------------------------------
 * The naive shape is one count query per thread. The shape that LOOKS like the
 * fix — bulk-fetch and count in JS — cannot express a per-thread cutoff through
 * PostgREST, because every thread has its own `last_read_at`; the nearest
 * expressible query is "everything since my oldest watermark", bounded by
 * whichever thread the user has ignored longest.
 *
 * `chat_switcher_threads()` is SECURITY INVOKER, so the caller's RLS decides
 * what comes back — a subcontractor gets no crew rows here for the same reason
 * they get none anywhere else.
 */

export interface SwitcherThread {
  projectId: string;
  projectName: string;
  threadId: string;
  kind: 'crew' | 'sub';
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface SwitcherProject {
  projectId: string;
  projectName: string;
  threads: SwitcherThread[];
  /** Sum across the project's threads — what the project row in the list shows. */
  unreadCount: number;
  lastMessageAt: string | null;
}

type Row = {
  project_id: string;
  project_name: string;
  thread_id: string;
  kind: 'crew' | 'sub';
  last_message_at: string | null;
  unread_count: number;
};

type UntypedRpc = (
  fn: string,
  args?: Record<string, unknown>
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Flat thread list, already ordered by the project's most recent activity. */
export async function switcherThreads(
  supabase: SupabaseClient<Database>
): Promise<SwitcherThread[]> {
  // chat_switcher_threads is not in database.ts until the next type regen.
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  const { data, error } = await rpc('chat_switcher_threads');

  if (error || !Array.isArray(data)) return [];

  return (data as Row[]).map((r) => ({
    projectId: r.project_id,
    projectName: r.project_name,
    threadId: r.thread_id,
    kind: r.kind,
    lastMessageAt: r.last_message_at,
    unreadCount: r.unread_count,
  }));
}

/**
 * The same data grouped for the switcher's project list.
 *
 * Grouping happens here rather than in SQL because the ORDER BY already put a
 * project's threads adjacent — so this is a single pass over an ordered list,
 * not a re-sort, and the SQL stays one statement.
 */
export function groupByProject(threads: SwitcherThread[]): SwitcherProject[] {
  const out: SwitcherProject[] = [];
  for (const t of threads) {
    let project = out[out.length - 1];
    if (!project || project.projectId !== t.projectId) {
      project = {
        projectId: t.projectId,
        projectName: t.projectName,
        threads: [],
        unreadCount: 0,
        lastMessageAt: null,
      };
      out.push(project);
    }
    project.threads.push(t);
    project.unreadCount += t.unreadCount;
    if (t.lastMessageAt && (!project.lastMessageAt || t.lastMessageAt > project.lastMessageAt)) {
      project.lastMessageAt = t.lastMessageAt;
    }
  }
  return out;
}
