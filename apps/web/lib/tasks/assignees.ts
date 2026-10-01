// S121 5-C — a task's assignees, read the ONE way. Pure (client + server).
//
// ⚠️ This is where "is this member on this task" is decided for every reader
// that used to compare `tasks.assignee_id` to a member id (S121 report §1.5,
// A1–A14). A reader that compares assignee_id again is the silent
// disappearance stop rule 8 exists for — tasks.assignee_id is now only the
// EARLIEST assignee, kept for old readers, and says nothing about the rest.

export interface TaskAssignee {
  id: string; // company_members.id
  display_name: string;
  schedule_color: string | null;
  member_type: string | null;
  /** subcontractors.trade_type for a sub/vendor (null for crew, or unreadable). */
  trade: string | null;
  /** [S122 ruling 11, Q13-A] Notify this person when this task's schedule changes. Off by default. */
  notify_changes: boolean;
}

/** The embed every task read uses (PostgREST select fragment). */
export const TASK_ASSIGNEES_EMBED =
  'assignees:task_assignees(member_id, is_deleted, created_at, notify_changes, member:company_members(id, display_name, schedule_color, member_type, sub:subcontractors!subcontractors_member_id_fkey(trade_type)))';

type RawAssignee = {
  member_id: string;
  is_deleted: boolean;
  created_at: string;
  notify_changes?: boolean | null;
  member: {
    id: string;
    display_name: string;
    schedule_color: string | null;
    member_type: string | null;
    sub: { trade_type: string | null }[] | { trade_type: string | null } | null;
  } | null;
};

/** Live assignees, earliest first (the same order the DB uses for assignee_id). */
export function liveAssignees(raw: unknown): TaskAssignee[] {
  const rows = (Array.isArray(raw) ? raw : []) as RawAssignee[];
  return rows
    .filter((r) => !r.is_deleted && r.member)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.member_id.localeCompare(b.member_id))
    .map((r) => {
      const sub = Array.isArray(r.member!.sub) ? r.member!.sub[0] : r.member!.sub;
      return {
        id: r.member!.id,
        display_name: r.member!.display_name,
        schedule_color: r.member!.schedule_color,
        member_type: r.member!.member_type,
        trade: sub?.trade_type ?? null,
        notify_changes: r.notify_changes === true,
      };
    });
}

/** Is `memberId` among the task's assignees? */
export function isAssignee(assigneeIds: readonly string[], memberId: string | null | undefined): boolean {
  return !!memberId && assigneeIds.includes(memberId);
}

/**
 * The clock-in/switch task picker's rule: a task with NO assignees is open to
 * anyone on the job; an assigned task is open to its assignees. [S121 Q29 —
 * one filter for desktop AND /m; the /m switch screen used to show every task.]
 */
export function taskOpenToMember(assigneeIds: readonly string[], memberId: string | null | undefined): boolean {
  return assigneeIds.length === 0 || isAssignee(assigneeIds, memberId);
}
