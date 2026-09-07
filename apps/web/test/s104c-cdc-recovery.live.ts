import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { reconcileOnePayment, syntheticEventId } from '@/lib/quickbooks/cdc-backstop';
import type { QboConnection } from '@/lib/quickbooks/tokens';

/**
 * ⚠️ R5 [ruled Josh, S104c] — THE CDC RECOVERY LOOP HAD ZERO COVERAGE, AND
 * "11 tests passed" WAS HIDING IT.
 *
 * Measured on the sandbox at S104c: a 90-day CDC query returns **0 Payment
 * objects**, `qb_webhook_events` holds **0 rows**, and **0** `client_payments`
 * carry a `qb_payment_id`. So `s104-cdc-backstop.live.ts` proves the call, the
 * cadence gate and the cursor — and ran **zero rows** through the decision that
 * actually protects the books. By this project's own rule that is a failing
 * test wearing a green tick.
 *
 * ⚠️ THE PAYMENTS HERE ARE SYNTHETIC AND THAT IS THE POINT. Intuit's sandbox has
 * nothing to recover and creating a real Payment would write into the books
 * permanently. What needs testing is OUR decision, against OUR rows — which
 * these are: real `qb_webhook_events` and `client_payments` rows on rebuild-test.
 */

const admin: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

/** Ids high enough not to collide with anything Intuit would mint. */
const QB_ALREADY_MIRRORED = 'S104C-MIRRORED';
const QB_ALREADY_QUEUED = 'S104C-QUEUED';
const QB_MISSING = 'S104C-MISSING';

let companyId: string;
let conn: QboConnection;
const madeEvents: string[] = [];
const madePayments: string[] = [];

function cdcPayment(id: string, lastUpdated = '2026-09-07T12:00:00-07:00') {
  return { Id: id, TotalAmt: 250, MetaData: { LastUpdatedTime: lastUpdated } };
}

beforeAll(async () => {
  const { data: co } = await admin
    .from('companies').select('id, qb_realm_id')
    .eq('qb_connection_state', 'connected').limit(1).single();
  if (!co) throw new Error('no connected company');
  companyId = (co as { id: string }).id;
  // ⚠️ A STUB CONNECTION, NOT A REAL TOKEN. `reconcileOnePayment` never calls
  // QuickBooks — it only reads and writes our own tables — so the test needs no
  // token and cannot touch the live connection.
  conn = { companyId, realmId: (co as { qb_realm_id: string }).qb_realm_id, accessToken: 'unused' } as QboConnection;
});

afterAll(async () => {
  // ⚠️ Deletes ONLY what this file created, by id. A cleanup scoped by
  // company_id would erase the tenant's real inbound history — `s149-A`'s class.
  if (madeEvents.length) await admin.from('qb_webhook_events').delete().in('id', madeEvents);
  if (madePayments.length) await admin.from('client_payments').delete().in('id', madePayments);
});

describe('S104c-D — reconcileOnePayment(), every branch, against real rows', () => {
  it('1. a payment with no Id is ignored', async () => {
    expect(await reconcileOnePayment(admin, conn, companyId, { TotalAmt: 5 })).toBe('no-id');
    expect(await reconcileOnePayment(admin, conn, companyId, { Id: 42 })).toBe('no-id');
  });

  it('2. RECOVERS a payment we have no record of, and writes a real event row', async () => {
    // The branch the whole backstop exists for.
    const decision = await reconcileOnePayment(admin, conn, companyId, cdcPayment(QB_MISSING));
    expect(decision, 'the missing payment was not recovered').toBe('recovered');

    const { data: row } = await admin
      .from('qb_webhook_events')
      .select('id, entity_name, entity_id, operation, intuit_event_id, processed_at, realm_id')
      .eq('company_id', companyId).eq('entity_id', QB_MISSING).single();
    expect(row, 'nothing was written — the recovery does not persist').not.toBeNull();
    madeEvents.push((row as { id: string }).id);

    const r = row as Record<string, unknown>;
    expect(r.entity_name).toBe('Payment');
    // 'Update', never 'Create' — we never saw the creation.
    expect(r.operation).toBe('Update');
    expect(r.processed_at, 'a recovered row must be UNPROCESSED so the drain applies it').toBeNull();
    expect(r.intuit_event_id).toBe(
      syntheticEventId(conn.realmId, QB_MISSING, '2026-09-07T12:00:00-07:00')
    );
  });

  it('3. the SAME payment again is a race, not a duplicate', async () => {
    // ⚠️ Depends on case 2 having written the row. The unique index on
    // intuit_event_id is what makes re-polling a window idempotent.
    expect(await reconcileOnePayment(admin, conn, companyId, cdcPayment(QB_MISSING))).toBe(
      'already-queued'
    );
  });

  it('4. a payment whose event row is already QUEUED is left alone', async () => {
    const { data, error } = await admin.from('qb_webhook_events').insert({
      company_id: companyId, realm_id: conn.realmId,
      intuit_event_id: `s104c-pending-${Date.now()}`,
      entity_name: 'Payment', entity_id: QB_ALREADY_QUEUED, operation: 'Create',
    }).select('id').single();
    expect(error, 'could not seed the pending event').toBeNull();
    madeEvents.push((data as { id: string }).id);

    expect(await reconcileOnePayment(admin, conn, companyId, cdcPayment(QB_ALREADY_QUEUED))).toBe(
      'already-queued'
    );
  });

  it('5. a payment already MIRRORED in client_payments is left alone', async () => {
    // ⚠️ THE CHECK THAT STOPS A DOUBLE-BOOKING. Without it the backstop would
    // re-offer every payment it ever recovered, on every poll, forever.
    const { data: contact } = await admin
      .from('contacts').select('id').eq('company_id', companyId).eq('is_deleted', false)
      .order('created_at', { ascending: true }).limit(1).single();
    const { data, error } = await admin.from('client_payments').insert({
      company_id: companyId,
      contact_id: (contact as { id: string }).id,
      amount: 1,
      payment_date: '2026-09-07',
      method: 'other',
      qb_payment_id: QB_ALREADY_MIRRORED,
    }).select('id').single();
    expect(error && error.message, 'could not seed the mirrored payment').toBeFalsy();
    madePayments.push((data as { id: string }).id);

    expect(await reconcileOnePayment(admin, conn, companyId, cdcPayment(QB_ALREADY_MIRRORED))).toBe(
      'already-mirrored'
    );
  });

  it('6. a raced insert on the SAME version reports raced, not failed', async () => {
    // Same qbId AND same LastUpdatedTime => same synthetic id => 23505. But a
    // NEW version of the same payment must get through, which is why the id
    // carries the timestamp.
    const seeded = `S104C-RACE-${Date.now()}`;
    const V1 = '2026-09-07T09:00:00-07:00';
    expect(await reconcileOnePayment(admin, conn, companyId, cdcPayment(seeded, V1))).toBe(
      'recovered'
    );
    const { data: first } = await admin.from('qb_webhook_events')
      .select('id').eq('company_id', companyId).eq('entity_id', seeded);
    for (const r of first ?? []) madeEvents.push((r as { id: string }).id);

    // Mark it processed so the 'already-queued' guard does not answer first —
    // this case is specifically about the unique index.
    await admin.from('qb_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('company_id', companyId).eq('entity_id', seeded);

    expect(
      await reconcileOnePayment(admin, conn, companyId, cdcPayment(seeded, V1)),
      'the same version was inserted twice'
    ).toBe('raced');

    const { data: v2 } = await admin.from('qb_webhook_events')
      .select('id').eq('company_id', companyId).eq('entity_id', seeded);
    expect((v2 ?? []).length, 'a duplicate event row was written').toBe(1);

    // ⚠️ AND A NEW VERSION OF THE SAME PAYMENT MUST GET THROUGH. That is the
    // entire reason syntheticEventId carries LastUpdatedTime: a payment we
    // failed to apply and that then CHANGED must be re-offered, and keying on
    // the id alone would let the unique index swallow the better version.
    expect(
      await reconcileOnePayment(admin, conn, companyId, cdcPayment(seeded, '2026-09-07T10:30:00-07:00')),
      'a NEWER version of the same payment was swallowed by the unique index'
    ).toBe('recovered');
    const { data: v3 } = await admin.from('qb_webhook_events')
      .select('id').eq('company_id', companyId).eq('entity_id', seeded);
    for (const r of v3 ?? []) if (!madeEvents.includes((r as { id: string }).id)) madeEvents.push((r as { id: string }).id);
    expect((v3 ?? []).length).toBe(2);
  });

  it('7. an insert that genuinely FAILS reports failed — which holds the cursor', async () => {
    // ⚠️ THIS CASE EXISTS BECAUSE I WROTE IT BY ACCIDENT FIRST. Case 6 originally
    // passed 'v1' as a LastUpdatedTime; `entity_last_updated` is `timestamptz`,
    // so Postgres rejected it and the decision came back 'failed'. That was a
    // bad fixture — and it is also the only cheap way to reach this branch, so
    // it is kept deliberately rather than discarded.
    //
    // ⚠️ AND THE BRANCH MATTERS [R4]: 'failed' is what stops `runCdcBackstop`
    // advancing `qb_cdc_polled_at`. Without it a payment we identified as
    // missing and could not queue would fall outside every future window.
    const decision = await reconcileOnePayment(
      admin, conn, companyId,
      { Id: `S104C-BAD-${Date.now()}`, MetaData: { LastUpdatedTime: 'not-a-timestamp' } }
    );
    expect(decision, 'a rejected insert did not report failed').toBe('failed');
  });
});
