import 'server-only';
import { createClient } from '@/lib/supabase-server';
import type { Database } from '@framefocus/shared/types/database';
import type { NotificationType } from '@/lib/notify/notify';

/**
 * Notification reads. Spec: docs/specs/notifications-architecture.md §10.1, §10.3.
 *
 * ---------------------------------------------------------------------------
 * THERE IS NO company_id FILTER ANYWHERE IN THIS FILE, AND THAT IS CORRECT
 * ---------------------------------------------------------------------------
 * `notifications_select_own` is `recipient_profile_id = get_my_profile_id()`,
 * which is strictly narrower than tenant scoping — a profile belongs to exactly
 * one company, so own-rows-only implies own-company-only. Adding `.eq('company_id',
 * …)` would be redundant and would imply the RLS is weaker than it is.
 *
 * ---------------------------------------------------------------------------
 * NO is_deleted FILTER EITHER — THIS TABLE HAS NO SUCH COLUMN
 * ---------------------------------------------------------------------------
 * CLAUDE.md's trash-bin pattern does not apply: notifications are ephemeral by
 * design (30-day expiry, hard delete). See the migration header for why a trash
 * bin for expired notifications would give two independent notions of "gone".
 */

type Row = Database['public']['Tables']['notifications']['Row'];

const LIST_COLUMNS =
  'id, type, title, body, link_key, link_params, project_id, read_at, starred, expires_at, created_at';

/**
 * `type` is CHECK-constrained, and the Supabase generator cannot see CHECK
 * constraints — it emits `string`. CLAUDE.md → Generated Types Workflow:
 * "always preserve string literal unions on CHECK-constrained columns. Restore
 * the union via intersection rather than using the loose `string`."
 */
export type NotificationListItem = Omit<
  Pick<
    Row,
    | 'id'
    | 'type'
    | 'title'
    | 'body'
    | 'link_key'
    | 'link_params'
    | 'project_id'
    | 'read_at'
    | 'starred'
    | 'expires_at'
    | 'created_at'
  >,
  'type'
> & { type: NotificationType };

export type NotificationFilter = 'all' | 'unread' | 'starred';

/**
 * The caller's notifications, newest first.
 *
 * Expired rows are filtered HERE as well as swept by the cron, because the two
 * do different jobs: the cron reclaims storage on its own schedule, and this
 * makes sure a row that expired five minutes ago is not still on screen. A list
 * that showed expired rows until the next cron run would make R2's "30 days"
 * mean "30 days, or up to a day longer, depending".
 */
export async function getNotifications(
  filter: NotificationFilter = 'all',
  limit = 100
): Promise<NotificationListItem[]> {
  const supabase = await createClient();

  let query = supabase
    .from('notifications')
    .select(LIST_COLUMNS)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (filter === 'unread') query = query.is('read_at', null);
  if (filter === 'starred') query = query.eq('starred', true);

  const { data, error } = await query;
  if (error) {
    console.error('[notifications] list failed', { filter, error: error.message });
    return [];
  }
  return (data ?? []) as NotificationListItem[];
}

/**
 * The badge number: unread AND unexpired.
 *
 * Both halves matter. Counting unread alone would keep a badge lit for a row the
 * list no longer shows, which is the worst kind of badge — one you cannot clear
 * by looking.
 */
export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  if (error) {
    // A failed count must not break the shell it renders in. Zero hides the
    // badge, which is the right failure: a wrong number is worse than none.
    console.error('[notifications] unread count failed', { error: error.message });
    return 0;
  }
  return count ?? 0;
}
