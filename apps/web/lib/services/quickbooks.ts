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
  /** M-J: the four GL mappings as QuickBooks Account IDs. The `*Name` values
   *  beside them are cached labels, not the mapping — see M-J's header. */
  glAccountIds: {
    labor: string | null;
    material: string | null;
    subcontractor: string | null;
    other: string | null;
  };
  glAccountNames: {
    labor: string | null;
    material: string | null;
    subcontractor: string | null;
    other: string | null;
  };
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
      'qb_connection_state, qb_realm_id, qb_connected_at, qb_last_refresh_at, qb_refresh_rotated_at, qb_reauth_required_after, qb_payments_enabled, qb_income_item_id, qb_income_item_name, gl_account_labor, gl_account_material, gl_account_subcontractor, gl_account_other, gl_account_labor_id, gl_account_material_id, gl_account_subcontractor_id, gl_account_other_id'
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
    glAccountIds: {
      labor: data.gl_account_labor_id,
      material: data.gl_account_material_id,
      subcontractor: data.gl_account_subcontractor_id,
      other: data.gl_account_other_id,
    },
    glAccountNames: {
      labor: data.gl_account_labor,
      material: data.gl_account_material,
      subcontractor: data.gl_account_subcontractor,
      other: data.gl_account_other,
    },
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

/**
 * The metered-read counter, as the Accounting screen shows it. [F4, S187]
 *
 * ⚠️ THIS COUNT WAS MAINTAINED PERFECTLY AND READ BY NOTHING. `client.ts`
 * incremented `qb_read_budget` on every 2xx CorePlus call from the day it
 * shipped, and no query anywhere selected from the table — the conformance
 * audit found every other reference to be a comment, a doc string, or the
 * trial-deletion walk. A counter that exists to warn about a total outage had
 * no consumer, which is the same as not having the counter.
 *
 * ⚠️ AND WHAT IT WARNS ABOUT IS A CLIFF. Intuit meters CorePlus (data-OUT)
 * **per Workspace, across every connected company** — not per realm — and the
 * Builder tier BLOCKS rather than throttles. Exhausting it stops every
 * customer's sync at once, with no per-tenant degradation and no notice.
 */
export interface ReadBudgetSummary {
  /** 2xx CorePlus calls this company has made in the current UTC month. */
  thisMonth: number;
  /** The same count for the previous month, so the number has a shape. */
  lastMonth: number;
  lastReadAt: string | null;
}

export interface QueueSummary {
  queued: number;
  inFlight: number;
  failedTransient: number;
  failedTerminal: number;
  /** Rows a person has to act on: terminal failures and pending conflicts. */
  needsAttention: QueueItem[];
  /**
   * ⚠️ CARRIED ON THE QUEUE SUMMARY DELIBERATELY, NOT AS A SECOND PROP.
   * `AccountingPanel` has TWO mount points — the Settings tab and the
   * `/dashboard/settings/accounting` route Intuit launches at — and a new prop
   * is precisely how those two drift out of agreement (PARITY [Josh, S122]).
   * One reader feeds the Sync status card, so both surfaces get this or
   * neither does.
   */
  readBudget: ReadBudgetSummary;
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
    readBudget: await readBudgetSummary(supabase),
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

/**
 * The current and previous month's metered-read counts. [F4, S187]
 *
 * ⚠️ NO COMPANY FILTER, AND THAT IS NOT AN OMISSION. This runs as the
 * signed-in user, and `qb_read_budget_select_owner_admin` already scopes the
 * table to `get_my_company_id()` for Owner and Admin and returns nothing to
 * anyone else. A second filter here would be the render-only gate the header
 * of this file says not to add.
 *
 * ⚠️ ABSENT ROW MEANS ZERO, NOT UNKNOWN. The row is created lazily by the
 * first metered read of the month, so "no row" is the honest answer "nothing
 * has been read yet" — not a failure to look.
 */
async function readBudgetSummary(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<ReadBudgetSummary> {
  const now = new Date();
  const period = (offset: number) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
      .toISOString()
      .slice(0, 10);

  const thisPeriod = period(0);
  const lastPeriod = period(-1);

  const { data } = await supabase
    .from('qb_read_budget')
    .select('period_month, coreplus_reads, last_read_at')
    .in('period_month', [thisPeriod, lastPeriod]);

  const rows = data ?? [];
  const current = rows.find((r) => r.period_month === thisPeriod);
  const previous = rows.find((r) => r.period_month === lastPeriod);

  return {
    thisMonth: current?.coreplus_reads ?? 0,
    lastMonth: previous?.coreplus_reads ?? 0,
    lastReadAt: current?.last_read_at ?? null,
  };
}
