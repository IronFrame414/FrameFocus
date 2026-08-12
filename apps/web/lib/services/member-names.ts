import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * Display names for `company_members` ids, resolved through the SERVICE ROLE.
 *
 * Consequence of Ruling B [S131] — `20260911000000_roster_visibility_floor.sql`.
 *
 * ---------------------------------------------------------------------------
 * WHY A CALLER-SIDE JOIN STOPPED WORKING
 * ---------------------------------------------------------------------------
 * Ruling B floors `company_members`: a subcontractor reads their own row and
 * the Owner/Admin/PM rows, and nothing else. **39 of 46 rows on rebuild-test
 * have no `profile_id` at all** — the operational roster is mostly people
 * without accounts — so a sub sees almost none of it. That is the ruling
 * working as written.
 *
 * The casualty was an embedded join. `punch_list_items` carries three FKs to
 * `company_members` (assignee, completer, verifier) and the service read them
 * with `assignee:company_members(...)` under the CALLER's own RLS. Measured as
 * the QA sub before this change: 2 punch items visible, 2 with an assignee, and
 * **1 assignee row readable** — the invisible one being the item the sub
 * AUTHORED and assigned to a crew member. The item was there, the assignment
 * was there, the name was blank. No error. That is the #129 shape: divergence
 * that surfaces as data quietly wrong somewhere else.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT A HOLE IN THE FLOOR
 * ---------------------------------------------------------------------------
 * The floor's distinction is between BROWSING THE ROSTER and NAMING A ROW YOU
 * CAN ALREADY SEE. This does only the second, and is narrow by construction:
 *
 *  · it takes ids the caller already holds, off rows **RLS let them read**;
 *  · it returns `display_name` and NOTHING else — no profile, no role, no
 *    email, no member_type, no id the caller did not already have;
 *  · it cannot enumerate. There is no "list the members" path through it, so it
 *    answers "who is this id?" and can never answer "who works here?".
 *
 * Same separation `lib/chat/authors.ts` makes for message authors, and the one
 * `app/api/chat/mentions/route.ts` already made deliberately for
 * `postableSet()` — "working out who MAY be mentioned is not the same act as
 * reading the thread".
 *
 * ⚠️ DO NOT WIDEN THE SELECT. Adding `profile_id`, `member_type` or a role
 * would turn a decoration into the roster read the floor exists to prevent, in
 * a file whose name suggests it only renders names.
 *
 * ---------------------------------------------------------------------------
 * DELIBERATELY SHARED, THOUGH ONLY `punch.ts` USES IT TODAY
 * ---------------------------------------------------------------------------
 * `company_members(display_name)` is joined the same way by `daily-logs.ts`,
 * `deliveries.ts`, `contracts.ts`, `payables.ts` and `project-assignments.ts`.
 * Those surfaces have not been audited for subcontractor reach and are NOT
 * changed here. When one of them needs this, it reuses this resolver rather
 * than growing a second implementation — CLAUDE.md's PARITY rule: a second
 * implementation that "does the same thing" IS the divergence, written in a
 * form that looks like agreement.
 */
export type MemberNameResolver = (memberIds: string[]) => Promise<Map<string, string>>;

/** The default resolver. Service role, `display_name` only. */
export function adminMemberNameResolver(): MemberNameResolver {
  return async (memberIds: string[]): Promise<Map<string, string>> => {
    const ids = Array.from(new Set(memberIds.filter(Boolean)));
    if (ids.length === 0) return new Map();

    const { data } = await getSupabaseAdmin()
      .from('company_members')
      .select('id, display_name')
      .in('id', ids);

    return new Map(
      ((data ?? []) as Array<{ id: string; display_name: string }>).map((m) => [
        m.id,
        m.display_name,
      ])
    );
  };
}
