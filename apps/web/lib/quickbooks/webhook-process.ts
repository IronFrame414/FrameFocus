import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { qboRead } from '@/lib/quickbooks/client';
import { getAccessToken, type QboConnection } from '@/lib/quickbooks/tokens';
import type { QbWebhookEntity } from '@/lib/quickbooks/webhook-verify';

/**
 * 7G — what a recorded webhook notification MEANS, applied off the request path.
 *
 * ⚠️ THIS USED TO RUN INSIDE THE WEBHOOK RESPONSE, AND THAT WAS FINDING F1.
 * Intuit allows **3 seconds** for an HTTP 200, retries at 20/30/50 minutes, and
 * then disables the endpoint. One Payment costs a possible token refresh, a
 * metered QuickBooks read and two DB writes; two or three of them do not fit.
 * The route now records and acknowledges, and this runs in the 5-minute worker.
 *
 * ⚠️ THE RETRY IS OURS NOW, and that is the important half. Before, the event
 * row was written before processing, so Intuit's retry was rejected as
 * already-seen and a failed notification was lost for good. `processed_at`
 * (M-N) separates "received" from "acted on", so a row that failed stays
 * claimable by the next drain.
 */

/** How many times a single notification is retried before it is left alone.
 *
 *  ⚠️ AMENDED [S104] — _superseded: "a failed inbound payment needs the CDC
 *  backstop (#2-7gqb), which is still unbuilt."_ It is built:
 *  `lib/quickbooks/cdc-backstop.ts`, folded into the same drain and gated
 *  hourly. An exhausted row is no longer the end of the line — the backstop
 *  asks QuickBooks what changed and re-offers anything we have no record of.
 *
 *  ⚠️ THE ROW ITSELF IS STILL NOT PARKED OR NOTIFIED, and that is unchanged. The
 *  backstop repairs the DATA; it does not put the failure in front of a person.
 *  A recovered payment logs `[qb-cdc] RECOVERED` and increments
 *  `cdcRecovered` on the drain outcome, which is the signal to act on. */
export const MAX_WEBHOOK_ATTEMPTS = 5;

export interface WebhookDrainOutcome {
  claimed: number;
  processed: number;
  noop: number;
  failed: number;
}

/**
 * Apply every unprocessed notification for one company.
 *
 * ⚠️ `processed_at` IS SET ON A NO-OP TOO. An Invoice or Customer notification
 * is deliberately not acted on (7G is outbound for everything but payments), and
 * leaving those rows unprocessed forever would make the backlog meaningless and
 * re-read them on every drain.
 */
export async function drainWebhookEvents(
  admin: SupabaseClient,
  companyId: string
): Promise<WebhookDrainOutcome> {
  const outcome: WebhookDrainOutcome = { claimed: 0, processed: 0, noop: 0, failed: 0 };

  const { data: events, error } = await admin
    .from('qb_webhook_events')
    .select('id, entity_name, entity_id, operation, entity_last_updated, process_attempts')
    .eq('company_id', companyId)
    .is('processed_at', null)
    .lt('process_attempts', MAX_WEBHOOK_ATTEMPTS)
    // Oldest first: a payment recorded before another should book before it.
    .order('received_at', { ascending: true })
    .limit(25);

  if (error) {
    console.error(`[qb-webhook-worker] claim failed for company=${companyId}:`, error.message);
    return outcome;
  }

  for (const row of events ?? []) {
    outcome.claimed += 1;
    const entity: QbWebhookEntity = {
      name: row.entity_name as string,
      id: row.entity_id as string,
      operation: row.operation as string,
      lastUpdated: (row.entity_last_updated as string | null) ?? undefined,
    };

    try {
      const handled = await handleEntity(admin, companyId, entity);
      await admin
        .from('qb_webhook_events')
        .update({ processed_at: new Date().toISOString(), process_error: null })
        .eq('id', row.id as string);
      if (handled) outcome.processed += 1;
      else outcome.noop += 1;
    } catch (err) {
      outcome.failed += 1;
      // ⚠️ `processed_at` STAYS NULL so the next drain retries it. That is the
      // whole point of the column: a failure must remain owed.
      await admin
        .from('qb_webhook_events')
        .update({
          process_attempts: ((row.process_attempts as number) ?? 0) + 1,
          process_error: String((err as Error).message ?? err).slice(0, 1000),
        })
        .eq('id', row.id as string);
      console.error(
        `[qb-webhook-worker] company=${companyId} ${entity.name}:${entity.id} failed:`,
        err
      );
    }
  }

  return outcome;
}

/** Returns true when the entity produced work. */
async function handleEntity(
  admin: SupabaseClient,
  companyId: string,
  entity: QbWebhookEntity
): Promise<boolean> {
  // ⚠️ ONLY PAYMENTS ARE ACTED ON. 7G is OUTBOUND for everything else (RULED
  // S103 #5 — "sync is TWO-WAY, not three"), so an Invoice or Customer webhook
  // is recorded for diagnosis and deliberately not applied: pulling QuickBooks'
  // version of an invoice back over ours would be the import that does not exist.
  if (entity.name !== 'Payment') return false;
  if (entity.operation === 'Delete' || entity.operation === 'Void') {
    // A payment reversed in QuickBooks needs a human — reversing money here
    // automatically, from an unauthenticated trigger, is not a decision this
    // connector should take on its own.
    console.log(
      `[qb-webhook] Payment ${entity.id} was ${entity.operation}d in QuickBooks for company=${companyId} — not applied automatically.`
    );
    return false;
  }

  const conn = await getAccessToken(admin, companyId);
  if (!conn) {
    throw new Error('No usable QuickBooks token; the payment could not be read.');
  }

  return recordPaymentFromQuickBooks(admin, conn, companyId, entity.id);
}

interface QbPaymentResponse {
  Payment?: {
    Id?: string;
    TotalAmt?: number;
    TxnDate?: string;
    CustomerRef?: { value?: string };
    Line?: Array<{ Amount?: number; LinkedTxn?: Array<{ TxnId?: string; TxnType?: string }> }>;
  };
}

/**
 * The METERED read that a webhook forces, plus the booking.
 *
 * ⚠️ THE WRITE GOES THROUGH `qb_record_inbound_payment()` (migration M-D), NOT
 * through inserts here. 7E's `record_client_payment()` reads the JWT and a
 * webhook has none; putting P-2/P-4 in TypeScript instead would be a second
 * copy of the money invariants, in a second language, free to drift.
 */
async function recordPaymentFromQuickBooks(
  admin: SupabaseClient,
  conn: QboConnection,
  companyId: string,
  qbPaymentId: string
): Promise<boolean> {
  const response = (await qboRead(admin, conn, `/payment/${qbPaymentId}`)) as QbPaymentResponse;
  const payment = response.Payment;
  if (!payment?.Id) throw new Error(`QuickBooks returned no Payment for id ${qbPaymentId}.`);

  const amount = Number(payment.TotalAmt ?? 0);
  if (!(amount > 0)) {
    console.log(`[qb-webhook] Payment ${qbPaymentId} has no positive amount; nothing to book.`);
    return false;
  }

  // Map each LinkedTxn back to OUR invoice. A QuickBooks id we do not know
  // (an invoice raised directly in QuickBooks) is skipped, not guessed at.
  const applications: Array<{ invoice_id: string; amount: number }> = [];
  let contactId: string | null = null;

  for (const line of payment.Line ?? []) {
    for (const linked of line.LinkedTxn ?? []) {
      if (linked.TxnType !== 'Invoice' || !linked.TxnId) continue;

      const { data: invoice } = await admin
        .from('invoices')
        .select('id, project_id')
        .eq('company_id', companyId)
        .eq('qb_invoice_id', linked.TxnId)
        .maybeSingle();

      if (!invoice) continue;

      applications.push({
        invoice_id: invoice.id as string,
        amount: Number(line.Amount ?? 0),
      });

      if (!contactId) {
        const { data: project } = await admin
          .from('projects')
          .select('contact_id')
          .eq('id', invoice.project_id as string)
          .eq('company_id', companyId)
          .maybeSingle();
        contactId = (project?.contact_id as string) ?? null;
      }
    }
  }

  // No linked invoice we recognise -> fall back to the QuickBooks customer.
  if (!contactId && payment.CustomerRef?.value) {
    const { data: contact } = await admin
      .from('contacts')
      .select('id')
      .eq('company_id', companyId)
      .eq('qb_customer_id', payment.CustomerRef.value)
      .maybeSingle();
    contactId = (contact?.id as string) ?? null;

    if (!contactId) {
      // A sub-customer (job) reference — resolve through the project.
      const { data: project } = await admin
        .from('projects')
        .select('contact_id')
        .eq('company_id', companyId)
        .eq('qb_sub_customer_id', payment.CustomerRef.value)
        .maybeSingle();
      contactId = (project?.contact_id as string) ?? null;
    }
  }

  if (!contactId) {
    throw new Error(
      `Payment ${qbPaymentId} could not be matched to a client on this platform; not booked.`
    );
  }

  const { error } = await admin.rpc('qb_record_inbound_payment', {
    p_company_id: companyId,
    p_contact_id: contactId,
    p_amount: amount,
    p_qb_payment_id: payment.Id,
    p_applications: applications,
    p_payment_date: payment.TxnDate ? payment.TxnDate.slice(0, 10) : null,
    p_method: 'quickbooks',
    p_note: null,
  });

  if (error) throw new Error(`Booking payment ${qbPaymentId} failed: ${error.message}`);

  console.log(
    `[qb-webhook] booked QuickBooks payment ${qbPaymentId} for company=${companyId} ` +
      `amount=${amount} applications=${applications.length}`
  );
  return true;
}
