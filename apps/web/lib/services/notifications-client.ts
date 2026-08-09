'use client';

import { createClient } from '@/lib/supabase-browser';
import type {
  NotificationFilter,
  NotificationListItem,
} from '@/lib/services/notifications';

// Client files re-export, never redefine (CLAUDE.md → Generated Types Workflow).
export type { NotificationFilter, NotificationListItem };

/**
 * Notification writes. Spec §10.1, §10.3.
 *
 * Every function here relies on `notifications_update_own` /
 * `notifications_delete_own`, both `recipient_profile_id = get_my_profile_id()`.
 * No function passes a recipient id — the policy is the authority on whose rows
 * these are, and a client that supplied one would be stating something it is not
 * entitled to decide.
 *
 * ⚠️ NOTHING HERE SETS expires_at. R2's retention rule lives in the
 * `notifications_set_expiry` trigger: starring clears the expiry, unstarring
 * restores 30 days from now. The star toggle is deliberately a single-column
 * UPDATE so the UI cannot drift from the rule — a client that also wrote
 * expires_at would be a second implementation of the retention policy, and
 * TECH_DEBT #129 is what two implementations of one rule cost.
 *
 * Also nothing here sets updated_at: the `notifications_updated_at` trigger
 * handles it (CLAUDE.md → service-layer contract).
 */

export async function markRead(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null); // Idempotent: re-reading must not move the timestamp.

  if (error) throw new Error(`markRead: ${error.message}`);
}

export async function markAllRead(): Promise<void> {
  const supabase = createClient();
  // No recipient filter — RLS scopes this to the caller's own rows. A client-side
  // "and only mine" clause would be decoration over the real control.
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);

  if (error) throw new Error(`markAllRead: ${error.message}`);
}

export async function setStarred(id: string, starred: boolean): Promise<void> {
  const supabase = createClient();
  // One column. The trigger does the rest — see the header.
  const { error } = await supabase.from('notifications').update({ starred }).eq('id', id);

  if (error) throw new Error(`setStarred: ${error.message}`);
}

/**
 * Dismiss. A real DELETE, not a soft one — this table has no `is_deleted`
 * column, because it already expires on its own (migration header).
 */
export async function dismiss(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('notifications').delete().eq('id', id);

  if (error) throw new Error(`dismiss: ${error.message}`);
}
