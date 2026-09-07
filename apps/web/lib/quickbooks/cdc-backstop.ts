import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { qboRead } from './client';
import type { QboConnection } from './tokens';

/**
 * 7G `#2-7gqb` — the CDC backstop. **The only thing that can notice a payment
 * QuickBooks knows about and we do not.**
 *
 * ----------------------------------------------------------------------------
 * ⚠️ WHY THIS IS THE DATA-INTEGRITY ITEM AND THE OTHER 7G FINDINGS ARE NOT
 * ----------------------------------------------------------------------------
 * The webhook is the ONLY inbound channel. `/api/quickbooks/webhook` writes the
 * event row BEFORE processing — deliberately, because that row means *received*
 * and it protects a metered read — so Intuit's retry is correctly deduped as
 * already-seen. **A failure after the 200 is therefore invisible to Intuit and
 * unrecoverable by it.**
 *
 * M-N (`20261470000000`) closed the transient half: `processed_at` keeps a
 * failed row claimable and the next drain retries it. What it cannot reach:
 *
 *   1. a row that exhausts `MAX_WEBHOOK_ATTEMPTS` and stops being retried;
 *   2. a notification Intuit **never delivered** — no row exists, so nothing
 *      retries anything.
 *
 * ⚠️ THE MISSING RECORD IS OURS, NOT THEIRS. `#2-7gqb` says it plainly: the
 * payment is never lost in QuickBooks — it is the mirror on THIS side that is
 * missing. So the repair is to ASK QuickBooks what changed and re-drive the
 * ordinary path.
 *
 * (The entry's own sentence names the product; it is paraphrased here because
 * `brand-literals.test.ts` forbids the literal outside `lib/brand.ts`, and that
 * test caught this comment.)
 *
 * ----------------------------------------------------------------------------
 * ⚠️ IT DOES NOT APPLY PAYMENTS ITSELF, AND THAT IS THE DESIGN
 * ----------------------------------------------------------------------------
 * A recovered Payment is written into `qb_webhook_events` as though the
 * notification had arrived, and `drainWebhookEvents()` applies it. A second
 * application path would be a second definition of what a payment MEANS —
 * CLAUDE.md's PARITY ruling, which was written after two markup editors quietly
 * disagreed about what a save produces: *"A second implementation that 'does the
 * same thing' is the divergence, written in a form that looks like agreement."*
 *
 * `intuit_event_id` is globally UNIQUE, so re-polling the same window is
 * idempotent by the database rather than by our care.
 */

/** Ruled at S143. The drain runs every 5 minutes; this gates it to hourly. */
const CDC_INTERVAL_MS = 60 * 60 * 1000;

/**
 * ⚠️ THE WINDOW OVERLAPS THE LAST POLL ON PURPOSE. CDC is keyed on Intuit's
 * clock, not ours, and a boundary is exactly where a record goes missing —
 * which is the one failure a backstop may not have. Re-reading ten minutes
 * costs nothing: the unique index discards what we already hold.
 */
const CDC_OVERLAP_MS = 10 * 60 * 1000;

/**
 * ⚠️ A FIRST POLL LOOKS BACK A BOUNDED WINDOW, NOT TO THE BEGINNING OF TIME.
 * CDC is a METERED CorePlus read and Intuit caps the lookback anyway; an
 * unbounded first call on a busy realm is the expensive mistake. Seven days
 * comfortably covers a webhook outage, which is what this is for.
 */
const CDC_FIRST_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export interface CdcOutcome {
  /** The poll actually ran (it was due, and the call succeeded). */
  polled: boolean;
  /** Payments QuickBooks reported as changed in the window. */
  seen: number;
  /** Payments we had no record of, now queued for the ordinary inbound path. */
  recovered: number;
}

export interface CdcResponse {
  CDCResponse?: Array<{
    QueryResponse?: Array<Record<string, unknown>>;
  }>;
}

/**
 * Pull the Payment objects out of a CDC reply.
 *
 * ⚠️ EXPORTED SO IT CAN BE TESTED AGAINST A POPULATED RESPONSE, and that is not
 * fastidiousness. **The sandbox holds ZERO Payments** — measured at S104: a
 * 90-day CDC query returns `HTTP 200` with `QueryResponse: [{}]`, one empty
 * block. So the live test proves the CALL works and proves nothing whatever
 * about the extraction. A parser exercised only by an empty array is a test
 * that passes on zero rows, which this project counts as a failure.
 *
 * ⚠️ THE SHAPE IS NESTED TWICE AND BOTH LEVELS ARE REAL. Intuit returns
 * `CDCResponse: [ { QueryResponse: [ { Payment: [...] }, { Invoice: [...] } ] } ]`
 * — one QueryResponse block PER ENTITY requested, and a block for an entity with
 * no changes is `{}` rather than absent. Indexing `QueryResponse[0].Payment`
 * works only while Payment is the sole entity requested; if a second entity is
 * ever added to the query, that shortcut silently reads the wrong block. Hence
 * the flatMap over every block.
 */
export function paymentsFromCdc(response: CdcResponse): Array<Record<string, unknown>> {
  return (response.CDCResponse?.[0]?.QueryResponse ?? []).flatMap((block) =>
    Array.isArray(block.Payment) ? (block.Payment as Array<Record<string, unknown>>) : []
  );
}

/**
 * The synthetic `intuit_event_id` for a recovered payment.
 *
 * ⚠️ IT CARRIES `LastUpdatedTime`, NOT JUST THE ENTITY ID. `intuit_event_id` is
 * globally UNIQUE, which is what makes re-polling idempotent — but a payment we
 * failed to apply and that then CHANGED in QuickBooks must be re-offered.
 * Keying on the id alone would let the unique index swallow the second, more
 * correct version forever.
 */
export function syntheticEventId(
  realmId: string,
  qbId: string,
  lastUpdated: string | null
): string {
  return `cdc:${realmId}:Payment:${qbId}:${lastUpdated ?? 'unknown'}`;
}

/**
 * Ask QuickBooks what Payments changed since we last looked, and queue anything
 * we are missing.
 *
 * ⚠️ EVERY QUERY IS `company_id`-SCOPED. The worker runs with the service role
 * and bypasses RLS [ruled S143]; `companyId` arrives as a parameter and is never
 * derived from a row we just read.
 */
export async function runCdcBackstop(
  admin: SupabaseClient,
  conn: QboConnection,
  companyId: string
): Promise<CdcOutcome> {
  const outcome: CdcOutcome = { polled: false, seen: 0, recovered: 0 };

  const { data: company, error: readError } = await admin
    .from('companies')
    .select('qb_cdc_polled_at')
    .eq('id', companyId)
    .single();

  if (readError) {
    console.error(`[qb-cdc] could not read the cursor for company=${companyId}:`, readError.message);
    return outcome;
  }

  const now = Date.now();
  const lastPolled = company?.qb_cdc_polled_at
    ? new Date(company.qb_cdc_polled_at as string).getTime()
    : null;

  // Not due yet. The common case, and it costs one cheap DB read.
  if (lastPolled !== null && now - lastPolled < CDC_INTERVAL_MS) return outcome;

  const changedSince = new Date(
    lastPolled === null ? now - CDC_FIRST_LOOKBACK_MS : lastPolled - CDC_OVERLAP_MS
  ).toISOString();

  let response: CdcResponse;
  try {
    response = (await qboRead(
      admin,
      conn,
      `/cdc?entities=Payment&changedSince=${encodeURIComponent(changedSince)}`
    )) as CdcResponse;
  } catch (err) {
    // ⚠️ THE CURSOR IS NOT ADVANCED. A cursor moved past a window we failed to
    // read skips that window forever — the backstop would silently manufacture
    // the gap it exists to close. A failed poll simply retries next hour, and
    // the overlap means nothing is lost by waiting.
    console.error(`[qb-cdc] poll failed for company=${companyId}:`, (err as Error).message);
    return outcome;
  }

  const payments = paymentsFromCdc(response);
  outcome.seen = payments.length;

  for (const payment of payments) {
    const qbId = typeof payment.Id === 'string' ? payment.Id : null;
    if (!qbId) continue;

    // ⚠️ ALREADY MIRRORED? Two questions, not one, and both are needed.
    // A payment we already booked has a `client_payments` row; a payment whose
    // notification is merely still QUEUED has an unprocessed event row. Asking
    // only the first would re-queue everything the drain has not reached yet.
    const { data: mirrored } = await admin
      .from('client_payments')
      .select('id')
      .eq('company_id', companyId)
      .eq('qb_payment_id', qbId)
      // Scoped, not merely limited: `qb_payment_id` identifies at most one row
      // per company, and the caller only asks whether one exists (CLAUDE.md, S165).
      .limit(1);
    if ((mirrored ?? []).length > 0) continue;

    const { data: pending } = await admin
      .from('qb_webhook_events')
      .select('id')
      .eq('company_id', companyId)
      .eq('entity_name', 'Payment')
      .eq('entity_id', qbId)
      .is('processed_at', null)
      // Existence probe only — nothing downstream depends on WHICH row.
      .limit(1);
    if ((pending ?? []).length > 0) continue;

    const lastUpdated =
      (payment.MetaData as { LastUpdatedTime?: string } | undefined)?.LastUpdatedTime ?? null;
    const syntheticId = syntheticEventId(conn.realmId, qbId, lastUpdated);

    const { error: insertError } = await admin.from('qb_webhook_events').insert({
      company_id: companyId,
      realm_id: conn.realmId,
      intuit_event_id: syntheticId,
      entity_name: 'Payment',
      // ⚠️ 'Update', not 'Create'. `handleEntity` reads the entity fresh from
      // QuickBooks either way, and claiming a Create we never saw would be a
      // statement about history we cannot support.
      operation: 'Update',
      entity_id: qbId,
      entity_last_updated: lastUpdated,
    });

    // 23505 — another poll (or the real webhook, arriving late) got there first.
    // Expected, not an error: the unique index is doing its job.
    if (insertError && insertError.code !== '23505') {
      console.error(
        `[qb-cdc] could not queue recovered Payment ${qbId} for company=${companyId}:`,
        insertError.message
      );
      continue;
    }
    if (!insertError) {
      outcome.recovered += 1;
      console.log(
        `[qb-cdc] RECOVERED Payment ${qbId} for company=${companyId} — QuickBooks had it and we did not.`
      );
    }
  }

  // ⚠️ ADVANCED ONLY NOW, AFTER A SUCCESSFUL READ. See the throw path above.
  const { error: cursorError } = await admin
    .from('companies')
    .update({ qb_cdc_polled_at: new Date(now).toISOString() })
    .eq('id', companyId);
  if (cursorError) {
    // Not fatal — the next drain simply re-reads an overlapping window, which
    // the unique index makes harmless. Logged because a cursor that never moves
    // means a metered read every drain instead of every hour.
    console.error(`[qb-cdc] cursor write failed for company=${companyId}:`, cursorError.message);
  }

  outcome.polled = true;
  return outcome;
}
