/**
 * Card-at-signup — the webhook setup branch [§S3/§S8].
 *
 * ⚠️ MOCK-VERIFIED, NOT ROUND-TRIP-VERIFIED. Stripe's signature and the exact
 * shape of a `mode:'setup'` `checkout.session.completed` are faked here. This
 * proves the ROUTE does the right thing GIVEN the event shape I read from
 * Stripe's docs — it does NOT prove Stripe actually sends that shape. Josh must
 * confirm the real event in Stripe test mode (spec §S8.4).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Captured = { table: string; op?: string; payload?: Record<string, unknown>; eq?: [string, unknown][]; is?: [string, unknown][] };
const calls: Captured[] = [];

// A chainable, awaitable Supabase-admin stub that records what was written.
function adminStub() {
  return {
    from(table: string) {
      const state: Captured = { table };
      const chain: Record<string, unknown> = {
        update(payload: Record<string, unknown>) { state.op = 'update'; state.payload = payload; return chain; },
        eq(c: string, v: unknown) { (state.eq ??= []).push([c, v]); return chain; },
        is(c: string, v: unknown) { (state.is ??= []).push([c, v]); return chain; },
        then(resolve: (r: { error: null }) => void) { calls.push(state); resolve({ error: null }); },
      };
      return chain;
    },
  };
}

// constructEvent is swapped per test to return the event we want to drive.
const constructEvent = vi.fn();
vi.mock('@/lib/stripe', () => ({ getStripe: () => ({ webhooks: { constructEvent } }) }));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => adminStub() }));
vi.mock('@/lib/trial/lifecycle', () => ({ runCancellationLock: vi.fn(), unlockCompany: vi.fn() }));

process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';

// eslint-disable-next-line import/first
import { POST } from '@/app/api/stripe/webhook/route';

function req(body: string, sig: string | null) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (sig !== null) headers.set('stripe-signature', sig);
  return new Request('https://x/api/stripe/webhook', { method: 'POST', body, headers }) as unknown as Parameters<typeof POST>[0];
}

const SETUP_EVENT = {
  type: 'checkout.session.completed',
  data: { object: { mode: 'setup', subscription: null, customer: 'cus_123', setup_intent: 'seti_1', metadata: { company_id: 'co-1' } } },
};

describe('webhook — card-at-signup setup branch', () => {
  beforeEach(() => { calls.length = 0; constructEvent.mockReset(); });

  it('a mode:setup checkout.session.completed sets payment_method_on_file=true for the company', async () => {
    constructEvent.mockReturnValue(SETUP_EVENT);
    const res = await POST(req(JSON.stringify(SETUP_EVENT), 't=1,v1=abc'));
    expect(res.status).toBe(200);

    const flag = calls.find((c) => c.table === 'companies' && c.payload?.payment_method_on_file === true);
    expect(flag, 'payment_method_on_file was not set true').toBeTruthy();
    expect(flag!.eq).toEqual([['id', 'co-1']]);

    const cust = calls.find((c) => c.table === 'companies' && 'stripe_customer_id' in (c.payload ?? {}));
    expect(cust!.payload).toEqual({ stripe_customer_id: 'cus_123' });
    expect(cust!.is).toEqual([['stripe_customer_id', null]]); // captured only if not already set
  });

  it('a setup session with NO metadata.company_id writes nothing', async () => {
    constructEvent.mockReturnValue({ type: 'checkout.session.completed', data: { object: { mode: 'setup', customer: 'cus_x', metadata: {} } } });
    const res = await POST(req('{}', 't=1,v1=abc'));
    expect(res.status).toBe(200);
    expect(calls.length).toBe(0);
  });

  it('rejects a request with NO signature header (400, nothing written)', async () => {
    const res = await POST(req('{}', null));
    expect(res.status).toBe(400);
    expect(constructEvent).not.toHaveBeenCalled();
    expect(calls.length).toBe(0);
  });

  it('rejects an INVALID signature (constructEvent throws → 400, nothing written)', async () => {
    constructEvent.mockImplementation(() => { throw new Error('bad sig'); });
    const res = await POST(req('{}', 'bogus'));
    expect(res.status).toBe(400);
    expect(calls.length).toBe(0);
  });
});
