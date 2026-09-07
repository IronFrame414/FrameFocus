import { describe, it, expect } from 'vitest';
import { paymentsFromCdc, syntheticEventId, type CdcResponse } from '@/lib/quickbooks/cdc-backstop';

/**
 * ⚠️ THIS EXISTS BECAUSE THE LIVE TEST CANNOT COVER IT, AND SAYING SO MATTERS.
 *
 * Measured at S104 against the real sandbox: a 90-day CDC query for Payments
 * returns `HTTP 200` with `CDCResponse: [{ QueryResponse: [{}] }]` — **the
 * sandbox holds zero Payments.** So `s104-cdc-backstop.live.ts` proves the call
 * is well-formed and Intuit answers it, and proves nothing at all about the
 * extraction. A parser exercised only by an empty array is a test that passes on
 * zero rows.
 *
 * The fixtures below are Intuit's documented CDC shape, populated.
 */
describe('S104-D — paymentsFromCdc()', () => {
  it('reads Payments out of the doubly-nested CDC shape', () => {
    const response: CdcResponse = {
      CDCResponse: [
        {
          QueryResponse: [
            {
              Payment: [
                { Id: '303', TotalAmt: 1500, MetaData: { LastUpdatedTime: '2026-09-06T12:00:00-07:00' } },
                { Id: '304', TotalAmt: 250.5, MetaData: { LastUpdatedTime: '2026-09-06T13:00:00-07:00' } },
              ],
              startPosition: 1,
              maxResults: 2,
            },
          ],
        },
      ],
    };
    const found = paymentsFromCdc(response);
    expect(found.map((p) => p.Id)).toEqual(['303', '304']);
  });

  it('finds Payments in a LATER block when several entities were requested', () => {
    // ⚠️ Intuit returns one QueryResponse block PER ENTITY, in request order.
    // `QueryResponse[0].Payment` would read the Invoice block and find nothing —
    // silently, and only once someone adds a second entity to the query.
    const response: CdcResponse = {
      CDCResponse: [
        {
          QueryResponse: [
            { Invoice: [{ Id: '145' }] },
            { Payment: [{ Id: '303' }] },
          ],
        },
      ],
    };
    expect(paymentsFromCdc(response).map((p) => p.Id)).toEqual(['303']);
  });

  it('survives the EMPTY block Intuit actually returns today', () => {
    // The exact shape measured against the sandbox at S104.
    expect(paymentsFromCdc({ CDCResponse: [{ QueryResponse: [{}] }] })).toEqual([]);
    expect(paymentsFromCdc({ CDCResponse: [{}] })).toEqual([]);
    expect(paymentsFromCdc({})).toEqual([]);
  });

  it('ignores a Payment key that is not an array rather than throwing', () => {
    // A drain must not die on an unexpected reply shape — it has other tenants.
    expect(paymentsFromCdc({ CDCResponse: [{ QueryResponse: [{ Payment: 'nope' }] }] })).toEqual([]);
  });
});

describe('S104-E — syntheticEventId()', () => {
  it('distinguishes two versions of the SAME payment', () => {
    // ⚠️ THE WHOLE POINT. `intuit_event_id` is globally UNIQUE. If the id did
    // not move with LastUpdatedTime, a payment that failed and was then
    // corrected in QuickBooks could never be re-offered — the unique index would
    // swallow the better version forever.
    const a = syntheticEventId('9341457813274121', '303', '2026-09-06T12:00:00-07:00');
    const b = syntheticEventId('9341457813274121', '303', '2026-09-06T13:00:00-07:00');
    expect(a).not.toBe(b);
  });

  it('is stable for the same payment at the same version, so re-polling is idempotent', () => {
    const a = syntheticEventId('9341457813274121', '303', '2026-09-06T12:00:00-07:00');
    const b = syntheticEventId('9341457813274121', '303', '2026-09-06T12:00:00-07:00');
    expect(a).toBe(b);
  });

  it('is scoped by realm, so two QuickBooks companies cannot collide on one id', () => {
    // `intuit_event_id` is unique GLOBALLY, not per tenant. Without the realm,
    // company A's Payment 303 would block company B's Payment 303.
    expect(syntheticEventId('realmA', '303', null)).not.toBe(syntheticEventId('realmB', '303', null));
  });

  it('names the missing timestamp rather than producing a colliding id', () => {
    expect(syntheticEventId('r', '303', null)).toMatch(/unknown$/);
  });
});
