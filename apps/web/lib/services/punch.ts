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
