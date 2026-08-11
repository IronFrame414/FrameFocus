import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * Display names for `punch_lists` ids, resolved through the SERVICE ROLE.
 *
 * Consequence of the S133 subcontractor read floor —
 * `20260912000000_subcontractor_project_read_floor.sql` §1i.
 *
 * ---------------------------------------------------------------------------
 * WHY A CALLER-SIDE READ STOPPED WORKING
 * ---------------------------------------------------------------------------
 * The ruling is that a subcontractor sees their punch ITEMS and not the LIST.
 * `punch_list_items` keeps D-57 (assignee-or-author); `punch_lists` — the
 * container — is now closed to subcontractors entirely.
 *
 * That is correct as a rule and catastrophic as a render, because
 * `getPunchLists()` read the parents FIRST and nested the children inside them,
 * and `app/m/p/[projectId]/punch/page.tsx` then flattens:
 *
 *     const allItems = lists.flatMap((l) => l.items ?? []);
 *
 * Zero lists therefore meant ZERO ITEMS. Measured as the QA sub under the S90
 * harness before this change: 2 punch items readable through RLS, 1 parent list,
 * and after the floor 0 parents — so the page would have rendered "No punch
 * items" over two items RLS was still returning. No error, no empty state that
 * meant anything. That is the #129 shape: divergence surfacing as data quietly
 * wrong somewhere else, and it would also have emptied the list picker on
 * `punch/new/page.tsx` and taken A-59 (sub punch create/complete) with it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A HOLE IN THE FLOOR
 * ---------------------------------------------------------------------------
 * Identical reasoning, and identical shape, to `lib/services/member-names.ts`.
 * The distinction the floor draws is between BROWSING THE CONTAINER and NAMING
 * A PARENT OF A ROW YOU CAN ALREADY SEE. This does only the second:
 *
 *  · it takes ids the caller already holds, off rows **RLS let them read**
 *    (`punch_list_items.punch_list_id` on items D-57 returned);
 *  · it returns `name` and NOTHING else — no project, no counts, no other
 *    list, no id the caller did not already have;
 *  · it cannot enumerate. There is no "list the lists" path through it, so it
 *    answers "what is this list called?" and can never answer "what lists exist
 *    on this job?".
 *
 * A subcontractor therefore still cannot discover a list, including one holding
 * items that are not theirs — which is the whole of what the ruling protects.
 *
 * ⚠️ DO NOT WIDEN THE SELECT, and do not add a `by project` variant. Either
 * would turn a decoration into the container read the floor exists to prevent,
 * in a file whose name suggests it only renders names.
 */
export type PunchListNameResolver = (listIds: string[]) => Promise<Map<string, string>>;

/** The default resolver. Service role, `name` only. */
export function adminPunchListNameResolver(): PunchListNameResolver {
  return async (listIds: string[]): Promise<Map<string, string>> => {
    const ids = Array.from(new Set(listIds.filter(Boolean)));
    if (ids.length === 0) return new Map();

    const { data } = await getSupabaseAdmin()
      .from('punch_lists')
      .select('id, name')
      .in('id', ids);

    return new Map(
      ((data ?? []) as Array<{ id: string; name: string }>).map((l) => [l.id, l.name])
    );
  };
}
