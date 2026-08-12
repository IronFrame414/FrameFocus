import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';
import { adminMemberNameResolver, type MemberNameResolver } from '@/lib/services/member-names';
import {
  adminPunchListNameResolver,
  type PunchListNameResolver,
} from '@/lib/services/punch-list-names';

type PunchListRow = Database['public']['Tables']['punch_lists']['Row'];
type PunchItemRow = Database['public']['Tables']['punch_list_items']['Row'];

export type PunchItemStatus = 'open' | 'in_progress' | 'complete' | 'verified';
export type PunchItemPriority = 'low' | 'medium' | 'high' | 'urgent';

type MemberRef = { id: string; display_name: string } | null;

export type PunchItem = Omit<PunchItemRow, 'status' | 'priority'> & {
  status: PunchItemStatus;
  priority: PunchItemPriority | null;
  assignee: MemberRef;
  completer: MemberRef;
  verifier: MemberRef;
};

export type PunchList = PunchListRow & {
  items: PunchItem[];
};

export const PUNCH_STATUS_LABELS: Record<PunchItemStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  complete: 'Complete',
  verified: 'Verified',
};

/**
 * An item is CLOSED (5C §6 — the authoritative definition, used by the
 * project-complete gate) when verified (if verification is required) or
 * complete (if verification was unchecked).
 */
export function isItemClosed(item: {
  status: PunchItemStatus;
  requires_verification: boolean;
}): boolean {
  return item.requires_verification ? item.status === 'verified' : item.status === 'complete';
}

// ⚠️ NO EMBEDDED `company_members` JOINS HERE ANY MORE — RULING B [S131].
//
// _Superseded, quoted rather than rewritten:_
// ```
// const ITEM_JOIN = `*,
//   assignee:company_members!punch_list_items_assignee_id_fkey(id, display_name),
//   completer:company_members!punch_list_items_completed_by_fkey(id, display_name),
//   verifier:company_members!punch_list_items_verified_by_fkey(id, display_name)`;
// ```
//
// These reads run as the CALLER, so each embedded join was filtered by the
// caller's own RLS. Ruling B floors `company_members` for subcontractors to
// Owner/Admin/PM plus their own row, and 39 of 46 rows have no account at all —
// so a sub kept the item and lost the name. Measured before the change: 2 items
// visible, 2 with an assignee, 1 assignee row readable. The invisible one was
// the item the sub AUTHORED and assigned to a crew member.
//
// D-57 STILL DECIDES WHICH ITEMS ARE VISIBLE, and it is untouched: a sub reads
// items assigned to them or authored by them and no others
// (`20260828000000_punch_subcontractor_visibility.sql`). What changed is only
// how the three ids on a visible row become names — see
// `lib/services/member-names.ts` for why a decoration is not a hole in the
// floor.
const ITEM_SELECT = '*';

/** A punch item as the database stores it, before names are attached. */
type RawPunchItem = Omit<PunchItemRow, 'status' | 'priority'> & {
  status: PunchItemStatus;
  priority: PunchItemPriority | null;
};

/**
 * Attach assignee / completer / verifier names — ONE query for the whole set,
 * never one per item.
 *
 * The resolver is a DEFAULTED parameter rather than a required one, and that is
 * deliberate. Chat injects the equivalent from its route because it has a route
 * to inject from; punch is called straight from five page components, and a
 * required parameter there would be five chances to forget — and forgetting
 * reintroduces exactly the blank name this exists to fix, silently. Defaulted,
 * no caller changes and no caller can get it wrong; still injectable, so a test
 * can drive it without the service role.
 *
 * An id that resolves to nothing keeps `null`, which every consumer already
 * renders around. A deleted member is not the same as a member called "".
 */
export async function withMemberNames(
  rows: RawPunchItem[],
  resolve: MemberNameResolver = adminMemberNameResolver()
): Promise<PunchItem[]> {
  if (rows.length === 0) return [];

  const ids = rows.flatMap((r) =>
    [r.assignee_id, r.completed_by, r.verified_by].filter((v): v is string => Boolean(v))
  );
  const names = await resolve(ids);

  const ref = (id: string | null): MemberRef => {
    if (!id) return null;
    const display_name = names.get(id);
    return display_name ? { id, display_name } : null;
  };

  return rows.map((r) => ({
    ...r,
    assignee: ref(r.assignee_id),
    completer: ref(r.completed_by),
    verifier: ref(r.verified_by),
  }));
}

/**
 * ⚠️ ITEM-FIRST, NOT LIST-FIRST — S133 subcontractor read floor.
 *
 * _Superseded, quoted rather than rewritten:_
 * ```
 * if (error || !lists) return [];
 * ...
 * return lists.map((list) => ({
 *   ...list,
 *   items: punchItems.filter((i) => i.punch_list_id === list.id),
 * }));
 * ```
 *
 * The old shape read the PARENTS first and nested the children inside them, so
 * the parent read silently bounded the child read. `punch_lists` is now closed
 * to subcontractors (`20260912000000` §1i) while `punch_list_items` keeps D-57,
 * which under the old shape meant a sub's two visible items rendered as none —
 * `app/m/p/[projectId]/punch/page.tsx` does `lists.flatMap((l) => l.items)`.
 *
 * Now the ITEMS decide. Any item whose parent RLS refused still appears, under a
 * list entry whose NAME is resolved through the service role
 * (`punch-list-names.ts` — takes ids off rows RLS already returned, cannot
 * enumerate). The return shape is unchanged, so all five call sites, the
 * flatMap, the `listNameByItemId` map and the picker's `listOptions` keep
 * working untouched.
 *
 * FOR EVERY NON-SUBCONTRACTOR ROLE THIS IS A NO-OP: they read every list on the
 * project, so there are no orphans and the synthesised branch never runs.
 */
export async function getPunchLists(
  projectId: string,
  resolveListNames: PunchListNameResolver = adminPunchListNameResolver()
): Promise<PunchList[]> {
  const supabase = await createClient();

  const { data: lists, error } = await supabase
    .from('punch_lists')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  // A refused parent read is no longer fatal — the items below stand on their
  // own. `lists` stays whatever RLS allowed, which for a sub is nothing.
  const readable = (error ? [] : (lists ?? [])) as PunchListRow[];

  const { data: items } = await supabase
    .from('punch_list_items')
    .select(ITEM_SELECT)
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  // Names come from the service role; WHICH items came back is still RLS's
  // answer alone (D-57 for subcontractors).
  const punchItems = await withMemberNames((items ?? []) as unknown as RawPunchItem[]);

  const readableIds = new Set(readable.map((l) => l.id));
  const orphanIds = Array.from(
    new Set(
      punchItems
        .map((i) => i.punch_list_id)
        .filter((id): id is string => Boolean(id) && !readableIds.has(id))
    )
  );

  // A PROJECTION OF A LIST, NOT A ROW. Only `id` and `name` are real; the rest
  // is carried off the item that reached us, or null. Nothing renders these
  // fields — the name is the only thing a caller wants from a parent it is not
  // allowed to read — and inventing plausible-looking `created_by` / audit
  // values would be worse than nulls, which are visibly absent.
  const orphanNames = await resolveListNames(orphanIds);
  const synthesised: PunchListRow[] = orphanIds.map((id) => {
    const first = punchItems.find((i) => i.punch_list_id === id)!;
    return {
      id,
      name: orphanNames.get(id) ?? 'Punch list',
      project_id: projectId,
      company_id: first.company_id,
      created_at: first.created_at,
      updated_at: first.created_at,
      created_by: null,
      updated_by: null,
      is_deleted: false,
      deleted_at: null,
    };
  });

  return [...readable, ...synthesised].map((list) => ({
    ...list,
    items: punchItems.filter((i) => i.punch_list_id === list.id),
  }));
}

/**
 * ONE punch item by id — M6M §4.11.14's owed function, written S116 (D-55).
 *
 * WHY THIS EXISTS RATHER THAN PASSING THE ITEM THROUGH FROM M-14. D-55 makes
 * every detail screen a real, deep-linkable page. Handing M-34 an item out of
 * M-14's already-loaded set would make the route un-deep-linkable — a shared
 * link, a bookmark or a PWA cold start would have nothing to render — and D-55
 * forbids that outcome, not merely the bottom-sheet alternative it replaced.
 *
 * READS THROUGH RLS, WHICH IS THE GATE. `punch_list_items_select_visible` is
 * narrowed for subcontractors by D-57 (assignee or author only,
 * `20260828000000_punch_subcontractor_visibility.sql`), so a sub who deep-links
 * to an item that is neither theirs to do nor theirs to have written gets NULL
 * here and the page 404s. That is real enforcement, not a UI check — and it is
 * why M-34 needs no role guard of its own while M-31/M-35/M-36 do.
 *
 * Returns null rather than throwing, so the page renders notFound() instead of
 * a 500 — the same contract getMember() and getContact() already use.
 */
export async function getPunchItem(id: string): Promise<PunchItem | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('punch_list_items')
    .select(ITEM_SELECT)
    .eq('id', id)
    .eq('is_deleted', false)
    .maybeSingle();

  // Still NULL for an item D-57 hides, so the page still 404s — the gate is
  // unchanged and only the naming moved.
  if (!data) return null;
  const [item] = await withMemberNames([data as unknown as RawPunchItem]);
  return item ?? null;
}

/** D-16's two figures for one project: items assigned to me, and the project total. */
export interface PunchOpenCounts {
  mine: number;
  total: number;
}

/**
 * M6M D-16 — the open punch counts behind M-3's stat strip, M-3's Punch List
 * tile badge and M-2's card callout. One query for any number of projects.
 *
 * "OPEN" IS `status IN ('open','in_progress')` — not `complete`, not `verified`
 * (D-16). This deliberately does NOT use isItemClosed(): the two are not
 * complements, and an item at `complete` awaiting verification is in neither
 * set. That divergence is inherited on purpose (M6M §4.3) so this figure agrees
 * with the two existing surfaces — dashboard.ts:78-85 and
 * app/dashboard/projects/[id]/page.tsx:71-76 — which both use these two states.
 *
 * "MINE" IS A MEMBER COMPARISON, NEVER A USER ID. `punch_list_items.assignee_id`
 * is FK-constrained to `company_members(id)`, so the comparison is against
 * `get_my_member_id()` — reached by rpc, the call already in use at
 * time-tracking.ts:56. Comparing it to `auth.uid()` or a `profiles.id` would
 * silently return 0 for every user rather than erroring, which is exactly the
 * failure M6M §4.3 calls out (GAP-1b).
 *
 * A caller with no member row gets `mine: 0` and a correct `total` — a
 * platform-admin-shaped identity should not blank the whole strip.
 */
export async function getOpenPunchCounts(
  projectIds: string[]
): Promise<Map<string, PunchOpenCounts>> {
  const counts = new Map<string, PunchOpenCounts>();
  for (const id of projectIds) counts.set(id, { mine: 0, total: 0 });
  if (projectIds.length === 0) return counts;

  const supabase = await createClient();

  const [{ data: myMemberId }, { data, error }] = await Promise.all([
    supabase.rpc('get_my_member_id'),
    supabase
      .from('punch_list_items')
      .select('project_id, assignee_id')
      .in('project_id', projectIds)
      .eq('is_deleted', false)
      .in('status', ['open', 'in_progress']),
  ]);

  if (error || !data) return counts;

  for (const row of data) {
    if (!row.project_id) continue;
    const entry = counts.get(row.project_id);
    if (!entry) continue;
    entry.total += 1;
    if (myMemberId && row.assignee_id === myMemberId) entry.mine += 1;
  }

  return counts;
}
