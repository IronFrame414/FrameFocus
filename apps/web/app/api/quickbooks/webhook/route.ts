import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { qboRead } from '@/lib/quickbooks/client';
import { getAccessToken, type QboConnection } from '@/lib/quickbooks/tokens';
import {
  INTUIT_SIGNATURE_HEADER,
  eventIdFor,
  getVerifierToken,
  parseNotifications,
  signatureMatches,
  type QbWebhookEntity,
} from '@/lib/quickbooks/webhook-verify';

/**
 * 7G — Intuit's webhook. **Flow 2: the payment comes BACK.**
 *
 * ⚠️ THIS IS AN UNAUTHENTICATED, INTERNET-FACING ENDPOINT THAT BOOKS MONEY.
 * Every request is signature-verified before anything is read, parsed for
 * meaning, or written. There is no bypass and no "development mode" that skips
 * it — a flag like that is how the check ends up off in production.
 *
 * ⚠️ INTUIT SENDS A REFERENCE PAYLOAD ONLY — entity name, id, operation,
 * lastUpdated. It does NOT carry the changed record. Acting on one therefore
 * costs a METERED CorePlus read, which is why `qb_webhook_events` dedupes
 * BEFORE the read rather than after it: the table protects a paid call, not
 * just a duplicate write.
 *
 * ⚠️ THIS ROUTE CANNOT BE EXERCISED FROM A CODESPACE OR FROM `localhost`.
 * Intuit posts to a public URL. See the build log's handshake checklist for
 * what verifying it actually takes.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const admin = getSupabaseAdmin();

  // ⚠️ RAW BODY FIRST, AND ONLY ONCE. The HMAC is computed over the exact bytes
  // Intuit signed; `request.json()` would re-serialise and change them (key
  // order, whitespace), and the body stream can only be consumed once.
  const rawBody = await request.text();

  const verifierToken = await getVerifierToken(admin);
  if (!verifierToken) {
    // FAIL CLOSED. No token stored -> reject everything. 401 rather than 500 so
    // Intuit's dashboard shows a rejection rather than an app fault, and so a
    // misconfiguration is visible instead of silently accepting forged posts.
    console.error(
      '[qb-webhook] REJECTED: no verifier token in Vault for this environment. ' +
        'Set it with qb_webhook_verifier_put() before enabling webhooks.'
    );
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 401 });
  }

  const signature = request.headers.get(INTUIT_SIGNATURE_HEADER);
  if (!signatureMatches(rawBody, signature, verifierToken)) {
    console.error(
      `[qb-webhook] REJECTED: signature mismatch (header ${signature ? 'present' : 'ABSENT'}).`
    );
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let notifications;
  try {
    notifications = parseNotifications(rawBody);
  } catch (err) {
    console.error('[qb-webhook] signed payload was not valid JSON:', err);
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
  }

  let processed = 0;
  let duplicates = 0;
  let unprocessed = 0;

  for (const notification of notifications) {
    // realmId -> tenant. `idx_companies_qb_realm_id` is UNIQUE, so this is
    // one-to-one and there is no ambiguity to resolve.
    const { data: company } = await admin
      .from('companies')
      .select('id, qb_connection_state')
      .eq('qb_realm_id', notification.realmId)
      .maybeSingle();

    const companyId = (company?.id as string) ?? null;

    for (const entity of notification.entities) {
      const eventId = eventIdFor(notification.realmId, entity);

      // ⚠️ DEDUPE BY INSERTING. The UNIQUE index IS the check — a select-then-
      // insert has a race window that two concurrent deliveries will find, and
      // the cost of losing that race is a duplicate PAID read plus a possible
      // double-booked payment.
      const { error: insertError } = await admin.from('qb_webhook_events').insert({
        company_id: companyId,
        realm_id: notification.realmId,
        intuit_event_id: eventId,
        entity_name: entity.name,
        entity_id: entity.id,
        operation: entity.operation,
        entity_last_updated: entity.lastUpdated ?? null,
      });

      if (insertError) {
        if (insertError.code === '23505') {
          duplicates += 1;
          continue;
        }
        console.error('[qb-webhook] could not record event:', insertError.message);
        continue;
      }

      // ⚠️ A REALM WE DO NOT KNOW IS RECORDED AND NOT ACTED ON. `company_id` is
      // nullable on that table precisely so a stale grant is DIAGNOSABLE rather
      // than dropped on the floor.
      if (!companyId || company?.qb_connection_state !== 'connected') continue;

      try {
        const handled = await handleEntity(admin, companyId, entity);
        if (handled) processed += 1;
      } catch (err) {
        // ⚠️ THE HONEST GAP, NAMED. The event row is already written, so
        // Intuit's own retry will be deduped — by design, because that row means
        // "received" and the metered read it protects has been paid for. A
        // failure here therefore needs OUR recovery, not Intuit's. Today that is
        // this log line plus a manual re-sync; the CDC backstop poll (7g2 §9
        // item 9) is the designed automatic recovery and is not built.
        // Filed as #2-7gqb.
        unprocessed += 1;
        console.error(
          `[qb-webhook] UNPROCESSED company=${companyId} ${entity.name}:${entity.id} ` +
            `op=${entity.operation} event=${eventId}:`,
          err
        );
      }
    }
  }

  // Always 200 once the signature passed and the events are recorded. A non-2xx
  // makes Intuit retry a delivery we have already deduped, which can only waste
  // their attempts — it cannot re-drive our processing.
  return NextResponse.json({ ok: true, processed, duplicates, unprocessed });
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
