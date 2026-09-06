import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { qboEnvironment } from './config';

/**
 * 7G — Intuit webhook signature verification.
 *
 * ⚠️ AN UNVERIFIED WEBHOOK IS AN OPEN WRITE ENDPOINT ON A MONEY PATH. This
 * route books client payments. Without verification, anyone who learns the URL
 * can post a payload that marks invoices paid.
 *
 * The scheme (confirmed against Intuit's docs this run): HMAC-SHA256 over the
 * RAW request body, keyed with the webhook verifier token, compared against the
 * base64 value in the `intuit-signature` header.
 */

export const INTUIT_SIGNATURE_HEADER = 'intuit-signature';

/**
 * Fetch the verifier token from Vault (migration M-B).
 *
 * ⚠️ RETURNS NULL WHEN NO TOKEN IS STORED, AND NULL MEANS REJECT EVERY REQUEST.
 * It must NEVER be read as "verification is not configured, so let it through".
 * That inversion is how a money endpoint ends up open on a fresh deployment.
 */
export async function getVerifierToken(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin.rpc('qb_webhook_verifier_get', {
    p_environment: qboEnvironment(),
  });
  if (error) {
    console.error('[qb-webhook] verifier token read failed:', error.message);
    return null;
  }
  const token = (data as unknown as string | null) ?? null;
  return token && token.length > 0 ? token : null;
}

/**
 * Constant-time comparison of the computed HMAC against the header.
 *
 * ⚠️ `timingSafeEqual` THROWS ON LENGTH MISMATCH, so the lengths are compared
 * first — and that comparison leaks only the LENGTH of a base64 digest, which is
 * a constant for SHA-256 anyway. A plain `===` here would leak the signature a
 * byte at a time to an attacker who can time responses.
 */
export function signatureMatches(
  rawBody: string,
  headerSignature: string | null,
  verifierToken: string
): boolean {
  if (!headerSignature) return false;

  // ⚠️ COMPARE DIGEST BYTES, NOT BASE64 STRINGS [F3, S187].
  //
  // _Superseded: `digest('base64')` compared byte-for-byte against the raw
  // header string._ That is correct only while Intuit's encoding matches Node's
  // exactly — standard base64, padded, same case. It is the same digest either
  // way, so any difference in ENCODING (base64url, dropped `=` padding) would
  // reject every notification while the signatures actually agreed, and nothing
  // would say why.
  //
  // Decoding both sides removes that whole class: two 32-byte SHA-256 digests
  // either match or they do not, however they were spelled.
  const computed = createHmac('sha256', verifierToken).update(rawBody, 'utf8').digest();

  let provided: Buffer;
  try {
    // `base64` decoding in Node accepts base64url and unpadded input too, which
    // is exactly the tolerance we want here.
    provided = Buffer.from(headerSignature, 'base64');
  } catch {
    return false;
  }

  // `timingSafeEqual` THROWS on a length mismatch, so lengths are compared
  // first — and that leaks only the length of a SHA-256 digest, a constant.
  if (computed.length !== provided.length) return false;
  return timingSafeEqual(computed, provided);
}

// ---------------------------------------------------------------------------
// Payload shape
// ---------------------------------------------------------------------------

export interface QbWebhookEntity {
  name: string;
  id: string;
  operation: string;
  lastUpdated?: string;
}

export interface QbWebhookNotification {
  realmId: string;
  entities: QbWebhookEntity[];
}

interface RawPayload {
  eventNotifications?: Array<{
    realmId?: string;
    dataChangeEvent?: { entities?: QbWebhookEntity[] };
  }>;
}

export function parseNotifications(rawBody: string): QbWebhookNotification[] {
  const payload = JSON.parse(rawBody) as RawPayload;
  return (payload.eventNotifications ?? [])
    .filter((n): n is { realmId: string; dataChangeEvent?: { entities?: QbWebhookEntity[] } } =>
      Boolean(n.realmId)
    )
    .map((n) => ({ realmId: n.realmId, entities: n.dataChangeEvent?.entities ?? [] }));
}

/**
 * ⚠️ THE IDEMPOTENCY KEY IS A COMPOSITE, AND THE SCHEMA'S NAME FOR IT IS
 * OPTIMISTIC. READ THIS BEFORE CHANGING IT.
 *
 * `qb_webhook_events.intuit_event_id` is documented in its migration as
 * "INTUIT'S OWN EVENT ID … a locally generated id would dedupe nothing."
 * **Intuit's LEGACY webhook payload contains no such field** (confirmed against
 * Intuit's docs this run): each notification carries only `realmId` and a list
 * of `{name, id, operation, lastUpdated}`. A single event id exists only in the
 * newer CloudEvents payload format.
 *
 * So the key is composed FROM INTUIT'S OWN VALUES, all five of them:
 *
 *     <realmId>:<entityName>:<entityId>:<operation>:<lastUpdated>
 *
 * Nothing in it is locally generated, and it is stable across redeliveries of
 * the same change — which is exactly the property the migration's guarantee
 * needs. `lastUpdated` is what distinguishes two genuinely different updates to
 * the same entity, so it must stay in the key: without it, a second real update
 * to invoice 145 would be silently discarded as a duplicate.
 *
 * ⚠️ If the payload ever carries a top-level notification `id` (the CloudEvents
 * migration), PREFER IT — `eventIdFor` takes it as an optional first argument
 * for exactly that reason.
 */
export function eventIdFor(
  realmId: string,
  entity: QbWebhookEntity,
  providedId?: string | null
): string {
  if (providedId) return providedId;
  return [realmId, entity.name, entity.id, entity.operation, entity.lastUpdated ?? ''].join(':');
}
