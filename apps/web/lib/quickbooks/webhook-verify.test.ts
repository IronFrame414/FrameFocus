import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  eventIdFor,
  parseNotifications,
  signatureMatches,
  type QbWebhookEntity,
} from './webhook-verify';

/**
 * 7G — the ONE part of the webhook path that is fully testable without Intuit.
 *
 * ⚠️ THESE ARE REAL HMACs, NOT FIXTURES. Each expectation below signs a payload
 * with `crypto` exactly as Intuit does and asserts the verifier's answer, so a
 * regression in the algorithm, the encoding or the comparison fails here rather
 * than silently accepting forged webhooks in production.
 */

const TOKEN = 'a-test-verifier-token-9341457813274121';

const PAYLOAD = JSON.stringify({
  eventNotifications: [
    {
      realmId: '9341457813274121',
      dataChangeEvent: {
        entities: [
          { name: 'Payment', id: '201', operation: 'Create', lastUpdated: '2026-09-05T13:22:50.092Z' },
        ],
      },
    },
  ],
});

function sign(body: string, token: string): string {
  return createHmac('sha256', token).update(body, 'utf8').digest('base64');
}

describe('Intuit webhook signature verification', () => {
  it('accepts a correctly signed payload', () => {
    expect(signatureMatches(PAYLOAD, sign(PAYLOAD, TOKEN), TOKEN)).toBe(true);
  });

  it('REJECTS a payload signed with the wrong verifier token', () => {
    expect(signatureMatches(PAYLOAD, sign(PAYLOAD, 'not-the-token'), TOKEN)).toBe(false);
  });

  it('REJECTS a payload whose body was altered after signing — the forgery case', () => {
    const signature = sign(PAYLOAD, TOKEN);
    const tampered = PAYLOAD.replace('"201"', '"999"');
    expect(tampered).not.toBe(PAYLOAD);
    expect(signatureMatches(tampered, signature, TOKEN)).toBe(false);
  });

  it('REJECTS a missing signature header rather than treating absence as valid', () => {
    expect(signatureMatches(PAYLOAD, null, TOKEN)).toBe(false);
    expect(signatureMatches(PAYLOAD, '', TOKEN)).toBe(false);
  });

  it('REJECTS a truncated signature without throwing (timingSafeEqual length guard)', () => {
    const signature = sign(PAYLOAD, TOKEN);
    expect(() => signatureMatches(PAYLOAD, signature.slice(0, 10), TOKEN)).not.toThrow();
    expect(signatureMatches(PAYLOAD, signature.slice(0, 10), TOKEN)).toBe(false);
  });

  it('is byte-exact: re-serialising the JSON breaks the signature', () => {
    // Why the route reads request.text() and never request.json(). Re-encoding
    // changes the bytes Intuit signed, so this MUST fail.
    const signature = sign(PAYLOAD, TOKEN);
    const reserialised = JSON.stringify(JSON.parse(PAYLOAD), null, 2);
    expect(signatureMatches(reserialised, signature, TOKEN)).toBe(false);
  });
});

describe('payload parsing', () => {
  it('extracts realm and entities from the legacy shape', () => {
    const notifications = parseNotifications(PAYLOAD);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].realmId).toBe('9341457813274121');
    expect(notifications[0].entities).toHaveLength(1);
    expect(notifications[0].entities[0]).toMatchObject({ name: 'Payment', id: '201' });
  });

  it('tolerates a notification with no entities rather than throwing', () => {
    const body = JSON.stringify({ eventNotifications: [{ realmId: '1', dataChangeEvent: {} }] });
    expect(parseNotifications(body)[0].entities).toEqual([]);
  });

  it('drops a notification with no realmId — it cannot be attributed to a tenant', () => {
    const body = JSON.stringify({ eventNotifications: [{ dataChangeEvent: { entities: [] } }] });
    expect(parseNotifications(body)).toEqual([]);
  });
});

describe('idempotency key', () => {
  const entity: QbWebhookEntity = {
    name: 'Payment',
    id: '201',
    operation: 'Create',
    lastUpdated: '2026-09-05T13:22:50.092Z',
  };

  it('is stable across redeliveries of the SAME change', () => {
    expect(eventIdFor('realm-1', entity)).toBe(eventIdFor('realm-1', { ...entity }));
  });

  it('DISTINGUISHES two different updates to the same entity', () => {
    // The reason lastUpdated is in the key. Without it, a second genuine update
    // to payment 201 would be discarded as a duplicate and never applied.
    const later = { ...entity, operation: 'Update', lastUpdated: '2026-09-06T09:00:00.000Z' };
    expect(eventIdFor('realm-1', later)).not.toBe(eventIdFor('realm-1', entity));
  });

  it('separates the same entity id in two different realms', () => {
    expect(eventIdFor('realm-1', entity)).not.toBe(eventIdFor('realm-2', entity));
  });

  it('prefers a provided notification id (the CloudEvents migration path)', () => {
    expect(eventIdFor('realm-1', entity, '88cd52aa-33b6-4351-9aa4-47572edbd068')).toBe(
      '88cd52aa-33b6-4351-9aa4-47572edbd068'
    );
  });
});
