import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';

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

const ITEM_JOIN = `*,
  assignee:company_members!punch_list_items_assignee_id_fkey(id, display_name),
  completer:company_members!punch_list_items_completed_by_fkey(id, display_name),
  verifier:company_members!punch_list_items_verified_by_fkey(id, display_name)`;

export async function getPunchLists(projectId: string): Promise<PunchList[]> {
  const supabase = await createClient();

  const { data: lists, error } = await supabase
    .from('punch_lists')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (error || !lists) return [];

  const { data: items } = await supabase
    .from('punch_list_items')
    .select(ITEM_JOIN)
    .eq('project_id', projectId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  const punchItems = (items ?? []) as unknown as PunchItem[];

  return lists.map((list) => ({
    ...list,
    items: punchItems.filter((i) => i.punch_list_id === list.id),
  }));
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
