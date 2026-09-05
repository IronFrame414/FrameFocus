import 'server-only';
import { createClient } from '@/lib/supabase-server';
import { parseCustomerConflict } from '@/lib/quickbooks/entities';

/**
 * 7G — the Accounting screen's reads. Server-side, caller-scoped.
 *
 * ⚠️ EVERY READ HERE RUNS AS THE SIGNED-IN USER, NOT THE SERVICE ROLE, AND
 * THAT IS THE POINT. `qb_sync_queue` and `qb_read_budget` carry
 * `..._select_owner_admin` policies, and `companies_select_own` scopes the
 * connection columns. So the Financial Visibility Floor is enforced by RLS on
 * the way in — this module adds no second, render-only gate (#136's class).
 * A PM calling these gets empty results from the database itself.
 */

export interface QuickBooksConnection {
  state: 'disconnected' | 'connected' | 'needs_reauth' | 'revoked';
  realmId: string | null;
  connectedAt: string | null;
  lastRefreshAt: string | null;
  refreshRotatedAt: string | null;
  reauthRequiredAfter: string | null;
  paymentsEnabled: boolean;
  incomeItemId: string | null;
  incomeItemName: string | null;
}

export async function getQuickBooksConnection(): Promise<QuickBooksConnection | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', user.id)
    .single();
  if (!profile) return null;

  const { data } = await supabase
    .from('companies')
    .select(
      'qb_connection_state, qb_realm_id, qb_connected_at, qb_last_refresh_at, qb_refresh_rotated_at, qb_reauth_required_after, qb_payments_enabled, qb_income_item_id, qb_income_item_name'
    )
    .eq('id', profile.company_id)
    .single();
  if (!data) return null;

  return {
    state: data.qb_connection_state as QuickBooksConnection['state'],
    realmId: data.qb_realm_id,
    connectedAt: data.qb_connected_at,
    lastRefreshAt: data.qb_last_refresh_at,
    refreshRotatedAt: data.qb_refresh_rotated_at,
    reauthRequiredAfter: data.qb_reauth_required_after,
    paymentsEnabled: Boolean(data.qb_payments_enabled),
    incomeItemId: data.qb_income_item_id,
    incomeItemName: data.qb_income_item_name,
  };
}

export interface QueueItem {
  id: string;
  entityType: string;
  operation: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string | null;
  /** Present only when `lastError` carries the customer-conflict marker. */
  conflict: { qbCustomerId: string; displayName: string; sentence: string } | null;
}

export interface QueueSummary {
  queued: number;
  inFlight: number;
  failedTransient: number;
  failedTerminal: number;
  /** Rows a person has to act on: terminal failures and pending conflicts. */
  needsAttention: QueueItem[];
}

/**
 * The queue as the Accounting screen shows it.
 *
 * ⚠️ `pushed` ROWS ARE DELIBERATELY EXCLUDED. They are terminal successes and
 * accumulate forever; showing them would bury the handful of rows that need a
 * person under thousands that do not.
 */
export async function getQuickBooksQueueSummary(): Promise<QueueSummary> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('qb_sync_queue')
    .select('id, entity_type, operation, status, attempts, last_error, created_at')
    .eq('is_deleted', false)
    .in('status', ['queued', 'in_flight', 'failed_transient', 'failed_terminal'])
    .order('created_at', { ascending: true })
    .limit(200);

  const rows = data ?? [];
  const summary: QueueSummary = {
    queued: 0,
    inFlight: 0,
    failedTransient: 0,
    failedTerminal: 0,
    needsAttention: [],
  };

  for (const row of rows) {
    if (row.status === 'queued') summary.queued += 1;
    else if (row.status === 'in_flight') summary.inFlight += 1;
    else if (row.status === 'failed_transient') summary.failedTransient += 1;
    else if (row.status === 'failed_terminal') summary.failedTerminal += 1;

    const conflict = parseCustomerConflict(row.last_error);

    // Needs a human: a terminal failure, or a row parked on a question.
    if (row.status === 'failed_terminal' || conflict || (row.status === 'queued' && row.last_error)) {
      summary.needsAttention.push({
        id: row.id,
        entityType: row.entity_type,
        operation: row.operation,
        status: row.status,
        attempts: row.attempts,
        lastError: row.last_error,
        createdAt: row.created_at,
        conflict,
      });
    }
  }

  return summary;
}
