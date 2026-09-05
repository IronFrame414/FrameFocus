import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { QBO_MINOR_VERSION, qboApiBase } from './config';
import type { QboConnection } from './tokens';

/**
 * 7G — the Intuit accounting-API transport.
 *
 * ⚠️ THE READ/WRITE SPLIT HERE IS A BILLING BOUNDARY, NOT A STYLE CHOICE.
 * Intuit meters "CorePlus" (data-OUT: reads and queries) and leaves "Core"
 * (data-IN: creating invoices, bills, customers) FREE AND UNCAPPED on every
 * tier. So:
 *
 *   `qboWrite()`  — free. Never touches qb_read_budget.
 *   `qboRead()`   — METERED. Increments qb_read_budget ON 2xx ONLY.
 *
 * ⚠️ ONLY SUCCESSFUL CALLS ARE METERED (verified from Intuit, recorded in
 * 20260930000000). Two consequences honoured below: the counter increments only
 * on a 2xx, and RETRIES ARE CHEAP — a failed call costs nothing, so backoff can
 * be generous without burning quota.
 *
 * ⚠️ AND THE CEILING IS A CLIFF. The CorePlus quota is per WORKSPACE across
 * every customer, and the Builder tier BLOCKS rather than throttles: exhaust it
 * and every connected company's sync stops at once. That is why the counter is
 * incremented here, in the one place every read passes through, rather than at
 * call sites that can forget.
 */

/** A QuickBooks failure, classified for the queue. */
export class QboApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Intuit's numeric fault code, e.g. `6240` (Duplicate Name Exists). */
    readonly qbCode: string | null,
    /**
     * `true` -> `failed_transient` (retry with backoff).
     * `false` -> `failed_terminal` (QB will never accept this as it stands;
     * needs a human, and must NOT retry forever — 7g1 §7G.7).
     */
    readonly retryable: boolean
  ) {
    super(message);
    this.name = 'QboApiError';
  }
}

/** Intuit's Duplicate Name Exists fault — the customer-conflict trigger (§5.2). */
export const QB_DUPLICATE_NAME_CODE = '6240';

interface IntuitFault {
  Fault?: {
    Error?: Array<{ Message?: string; Detail?: string; code?: string }>;
    type?: string;
  };
}

/**
 * A 401 here means the access token died between `getAccessToken()` and this
 * call. Retryable: the next drain refreshes it. A 403 is an entitlement or
 * scope problem and no retry fixes it.
 */
function classify(status: number): boolean {
  if (status === 429) return true;
  if (status >= 500) return true;
  if (status === 401) return true;
  return false;
}

async function call(
  conn: QboConnection,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<unknown> {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${qboApiBase()}/v3/company/${conn.realmId}${path}${separator}minorversion=${QBO_MINOR_VERSION}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
  } catch (err) {
    // DNS/TLS/socket. Always retryable — nothing reached QuickBooks, so nothing
    // was created and a retry cannot duplicate.
    throw new QboApiError(
      `Network failure calling QuickBooks: ${(err as Error).message}`,
      0,
      null,
      true
    );
  }

  const text = await response.text();

  if (!response.ok) {
    let qbCode: string | null = null;
    let detail = `HTTP ${response.status}`;
    try {
      const fault = JSON.parse(text) as IntuitFault;
      const first = fault.Fault?.Error?.[0];
      if (first) {
        qbCode = first.code ?? null;
        detail = [first.Message, first.Detail].filter(Boolean).join(' — ') || detail;
      }
    } catch {
      // Non-JSON body (a proxy error page). Keep the status, drop the noise —
      // and do NOT put the raw body in the queue's last_error, since an Intuit
      // error page can echo request headers.
    }
    throw new QboApiError(detail, response.status, qbCode, classify(response.status));
  }

  return text ? JSON.parse(text) : {};
}

/** Data-IN. FREE and uncapped — deliberately does not touch the read budget. */
export async function qboWrite(
  conn: QboConnection,
  path: string,
  body: unknown
): Promise<unknown> {
  return call(conn, 'POST', path, body);
}

/**
 * Data-OUT. METERED. Increments `qb_read_budget` on success only.
 *
 * ⚠️ The counter is advanced AFTER the call returns 2xx and its failure is
 * swallowed: a counter write that fails must not lose a QuickBooks read the
 * caller already paid for and is about to act on. An undercount is a
 * telemetry gap; throwing here would be a money-path defect.
 */
export async function qboRead(
  admin: SupabaseClient,
  conn: QboConnection,
  path: string
): Promise<unknown> {
  const result = await call(conn, 'GET', path);
  try {
    await recordCorePlusRead(admin, conn.companyId);
  } catch (err) {
    console.error(`[qb-client] read-budget increment failed for ${conn.companyId}:`, err);
  }
  return result;
}

/** First day of the current month, UTC — matching `qb_read_budget.period_month`. */
function periodMonth(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

async function recordCorePlusRead(admin: SupabaseClient, companyId: string): Promise<void> {
  const period = periodMonth();
  // Read-modify-write against the (company_id, period_month) unique key. Two
  // workers racing can lose one increment; that is accepted — this is a
  // telemetry counter feeding an alert, and a lock on a money path to protect a
  // count would be the wrong trade. Stated so nobody "fixes" it into a lock.
  const { data: existing } = await admin
    .from('qb_read_budget')
    .select('id, coreplus_reads')
    .eq('company_id', companyId)
    .eq('period_month', period)
    .maybeSingle();

  if (existing) {
    await admin
      .from('qb_read_budget')
      .update({
        coreplus_reads: (existing.coreplus_reads as number) + 1,
        last_read_at: new Date().toISOString(),
      })
      .eq('id', existing.id as string);
    return;
  }

  await admin.from('qb_read_budget').insert({
    company_id: companyId,
    period_month: period,
    coreplus_reads: 1,
    last_read_at: new Date().toISOString(),
  });
}

/**
 * Escape a value for a QuickBooks SQL-ish `query` string.
 *
 * ⚠️ NOT COSMETIC. A client called `O'Brien Builders` breaks the query and,
 * worse, a crafted DisplayName could otherwise alter the WHERE clause of a
 * query that runs against the customer's own books. Single quotes are doubled,
 * backslashes escaped, per Intuit's query grammar.
 */
export function qbQuoteLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Run a QuickBooks query. Metered (it is a read). */
export async function qboQuery(
  admin: SupabaseClient,
  conn: QboConnection,
  query: string
): Promise<unknown> {
  return qboRead(admin, conn, `/query?query=${encodeURIComponent(query)}`);
}
