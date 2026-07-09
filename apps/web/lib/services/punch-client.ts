import { createClient } from '@/lib/supabase-browser';
import type { PunchItem, PunchItemPriority, PunchItemStatus, PunchList } from '@/lib/services/punch';
export type { PunchItem, PunchItemPriority, PunchItemStatus, PunchList };

const FOREMAN_PLUS = ['owner', 'admin', 'project_manager', 'foreman'];

async function myMemberId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) return null;

  const { data: member } = await supabase
    .from('company_members')
    .select('id')
    .eq('profile_id', profile.id)
    .eq('is_deleted', false)
    .maybeSingle();

  return member?.id ?? null;
}

// ── Lists (create: all roles incl. Crew; delete: Foreman+) ──

export async function createPunchList(
  projectId: string,
  name: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('punch_lists')
    .insert({ project_id: projectId, name })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function deletePunchList(
  id: string,
  userRole: string
): Promise<{ success: boolean; error?: string }> {
  if (!FOREMAN_PLUS.includes(userRole)) {
    return { success: false, error: 'Only Foreman and above can delete punch lists.' };
  }
  const supabase = createClient();

  const { error } = await supabase
    .from('punch_lists')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Items ──

export async function createPunchItem(item: {
  punch_list_id: string;
  project_id: string;
  title: string;
  description?: string | null;
  priority?: PunchItemPriority | null;
  location?: string | null;
  trade?: string | null;
  assignee_id?: string | null;
  reference_photo_file_id?: string | null;
  requires_completion_photo?: boolean;
  requires_verification?: boolean;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('punch_list_items')
    .insert(item)
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

/**
 * Edit item FIELDS (title, description, priority, location, trade, assignee,
 * reference photo) — all roles including Crew, on ANY item (5C §7). The
 * requirement toggles are NOT accepted here — use setRequirementToggles
 * (Foreman+); status moves through completePunchItem / verifyPunchItem.
 */
export async function updatePunchItemFields(
  id: string,
  updates: {
    title?: string;
    description?: string | null;
    priority?: PunchItemPriority | null;
    location?: string | null;
    trade?: string | null;
    assignee_id?: string | null;
    reference_photo_file_id?: string | null;
    is_client_visible?: boolean;
    status?: 'open' | 'in_progress';
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // BEFORE UPDATE trigger `punch_list_items_set_updated_by` handles updated_by.
  // updated_at is handled by the existing updated_at trigger.
  const { error } = await supabase.from('punch_list_items').update(updates).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Requirement toggles are Foreman+ only (5C §4/§7). */
export async function setRequirementToggles(
  id: string,
  userRole: string,
  toggles: { requires_completion_photo?: boolean; requires_verification?: boolean }
): Promise<{ success: boolean; error?: string }> {
  if (!FOREMAN_PLUS.includes(userRole)) {
    return { success: false, error: 'Only Foreman and above can change item requirements.' };
  }
  const supabase = createClient();

  const { error } = await supabase.from('punch_list_items').update(toggles).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Mark an item COMPLETE (5C §4). Photo gate: when the item requires a
 * completion photo, the transition is blocked until one is attached — the
 * gate sits BEFORE sign-off, so an item that can't reach complete can't be
 * verified. Sets completed_by/completed_at.
 */
export async function completePunchItem(
  item: Pick<PunchItem, 'id' | 'requires_completion_photo' | 'completion_photo_file_id'>,
  completionPhotoFileId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const photoId = completionPhotoFileId ?? item.completion_photo_file_id;

  if (item.requires_completion_photo && !photoId) {
    return {
      success: false,
      error: 'A completion photo is required before this item can be marked complete.',
    };
  }

  const memberId = await myMemberId();
  if (!memberId) return { success: false, error: 'No member identity for the current user.' };

  const supabase = createClient();
  const { error } = await supabase
    .from('punch_list_items')
    .update({
      status: 'complete',
      completion_photo_file_id: photoId ?? null,
      completed_by: memberId,
      completed_at: new Date().toISOString(),
    })
    .eq('id', item.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * VERIFY sign-off (5C §4): Foreman/PM/Admin/Owner, and never the person who
 * completed the item (separate-eyes rule). Only applies when the item
 * requires verification and is complete.
 */
export async function verifyPunchItem(
  item: Pick<PunchItem, 'id' | 'status' | 'requires_verification' | 'completed_by'>,
  userRole: string
): Promise<{ success: boolean; error?: string }> {
  if (!FOREMAN_PLUS.includes(userRole)) {
    return { success: false, error: 'Only Foreman and above can verify punch items.' };
  }
  if (!item.requires_verification) {
    return { success: false, error: 'This item does not require verification.' };
  }
  if (item.status !== 'complete') {
    return { success: false, error: 'Only complete items can be verified.' };
  }

  const memberId = await myMemberId();
  if (!memberId) return { success: false, error: 'No member identity for the current user.' };
  if (item.completed_by && item.completed_by === memberId) {
    return { success: false, error: 'The person who completed an item cannot verify it.' };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('punch_list_items')
    .update({
      status: 'verified',
      verified_by: memberId,
      verified_at: new Date().toISOString(),
    })
    .eq('id', item.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deletePunchItem(
  id: string,
  userRole: string
): Promise<{ success: boolean; error?: string }> {
  if (!FOREMAN_PLUS.includes(userRole)) {
    return { success: false, error: 'Only Foreman and above can delete punch items.' };
  }
  const supabase = createClient();

  const { error } = await supabase
    .from('punch_list_items')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
