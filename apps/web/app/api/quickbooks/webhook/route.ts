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

  // ⚠️ RECORD AND ACKNOWLEDGE. NOTHING ELSE HAPPENS ON THIS PATH [F1, M-N].
  //
  // Intuit requires an HTTP 200 within **3 seconds**, retries at 20/30/50
  // minutes, and then DISABLES the endpoint. The old code called
  // `handleEntity()` here — a token refresh, a metered QuickBooks read and two
  // DB writes per Payment, on a possibly cold serverless function — and could
  // not make that budget.
  //
  // ⚠️ AND ITS DEDUPE MADE THE FAILURE PERMANENT: the row was written before
  // processing, so Intuit's retry was rejected as already-seen and the work was
  // lost for good. `processed_at` now separates "received" from "acted on", and
  // the 5-minute worker owns the retry — where the backoff, the parking and the
  // notification surface already live.
  let recorded = 0;
  let duplicates = 0;

  for (const notification of notifications) {
    // realmId -> tenant. `idx_companies_qb_realm_id` is UNIQUE, so this is
    // one-to-one and there is no ambiguity to resolve.
    const { data: company } = await admin
      .from('companies')
      .select('id')
      .eq('qb_realm_id', notification.realmId)
      .maybeSingle();

    const companyId = (company?.id as string) ?? null;

    for (const entity of notification.entities) {
      // ⚠️ DEDUPE BY INSERTING. The UNIQUE index IS the check — a select-then-
      // insert has a race window two concurrent deliveries will find.
      const { error: insertError } = await admin.from('qb_webhook_events').insert({
        company_id: companyId,
        realm_id: notification.realmId,
        intuit_event_id: eventIdFor(notification.realmId, entity),
        entity_name: entity.name,
        entity_id: entity.id,
        operation: entity.operation,
        entity_last_updated: entity.lastUpdated ?? null,
      });

      if (insertError) {
        // ⚠️ A DUPLICATE IS NOT "ALREADY HANDLED" ANY MORE. If the existing row
        // is still unprocessed the worker will pick it up, because the worker
        // keys on `processed_at IS NULL` — not on whether Intuit resent it.
        if (insertError.code === '23505') {
          duplicates += 1;
          continue;
        }
        console.error('[qb-webhook] could not record event:', insertError.message);
        continue;
      }
      recorded += 1;
    }
  }

  // ⚠️ ALWAYS 200 ONCE THE SIGNATURE PASSED AND THE ROWS ARE WRITTEN. A non-2xx
  // here would make Intuit retry a delivery we have already durably recorded,
  // which can only burn their attempts toward disabling the endpoint.
  return NextResponse.json({ ok: true, recorded, duplicates });
}
