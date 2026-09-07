import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runCdcBackstop } from '@/lib/quickbooks/cdc-backstop';
import { getAccessToken } from '@/lib/quickbooks/tokens';

/**
 * ⚠️ `#2-7gqb` — THE CDC BACKSTOP, AGAINST THE REAL INTUIT SANDBOX.
 *
 * ⚠️ THIS IS A LIVE TEST ON PURPOSE. The whole finding is "the webhook is the
 * only inbound channel, so a post-200 failure is lost with nothing to reconcile
 * against". A mocked CDC response would assert that our parser reads our own
 * fixture — it would prove nothing about whether Intuit answers this query, in
 * this shape, on this realm. The one thing worth testing here is the wire.
 *
 * ⚠️ IT MUST NOT TOUCH THE CONNECTION. Read-only against QuickBooks; the only
 * writes are the company's own CDC cursor (restored afterwards) and any
 * recovered `qb_webhook_events` rows, which are the intended product.
 */

const admin: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

let companyId: string;
let originalCursor: string | null = null;

beforeAll(async () => {
  const { data } = await admin
    .from('companies')
    .select('id, qb_cdc_polled_at')
    .eq('qb_connection_state', 'connected')
    .limit(1)
    .single();
  if (!data) throw new Error('no connected company — this test needs the sandbox link');
  companyId = data.id as string;
  originalCursor = (data.qb_cdc_polled_at as string | null) ?? null;
});

afterAll(async () => {
  // ⚠️ RESTORED, NOT NULLED. Leaving the cursor advanced would give the next
  // real drain a blind spot; leaving it null would make it re-poll a 7-day
  // window. Put back exactly what was there — `s149-A`'s lesson is that a test
  // which "cleans up" by destroying real state passes on the second run.
  await admin
    .from('companies')
    .update({ qb_cdc_polled_at: originalCursor })
    .eq('id', companyId);
});

describe('S104 — CDC backstop', () => {
  it('1. is SKIPPED when the hourly gate has not elapsed, and says so', async () => {
    // ⚠️ `polled: false` MUST NOT READ AS "checked, nothing wrong". That is the
    // S181 collapse — a drain reporting a check it never performed as a pass.
    await admin
      .from('companies')
      .update({ qb_cdc_polled_at: new Date().toISOString() })
      .eq('id', companyId);

    const conn = await getAccessToken(admin, companyId);
    expect(conn, 'no usable token — cannot exercise the backstop').not.toBeNull();

    const out = await runCdcBackstop(admin, conn!, companyId);
    expect(out.polled, 'the gate did not hold — this would poll every 5 minutes').toBe(false);
    expect(out.seen).toBe(0);
    expect(out.recovered).toBe(0);
  });

  it('2. polls Intuit when due, and Intuit answers the CDC query', async () => {
    // The wire test. A 7-day first look-back: cursor null => bounded window.
    await admin.from('companies').update({ qb_cdc_polled_at: null }).eq('id', companyId);

    const conn = await getAccessToken(admin, companyId);
    const out = await runCdcBackstop(admin, conn!, companyId);

    expect(
      out.polled,
      'the CDC call did not succeed — check the [qb-cdc] log line for Intuit’s message'
    ).toBe(true);
    // `seen` may legitimately be 0 on a quiet sandbox. What must be true is that
    // the call HAPPENED and the cursor moved.
    expect(out.seen).toBeGreaterThanOrEqual(0);

    const { data: after } = await admin
      .from('companies').select('qb_cdc_polled_at').eq('id', companyId).single();
    expect(
      (after as { qb_cdc_polled_at: string | null }).qb_cdc_polled_at,
      'the cursor did not advance after a successful poll'
    ).not.toBeNull();
  });

  it('3. the metered read was recorded against the budget', async () => {
    // ⚠️ CDC IS A METERED CorePlus READ. `qb_read_budget` exists so this is
    // affordable; a backstop that spent quota without recording it would make
    // that budget a lie.
    const period = new Date();
    const month = `${period.getUTCFullYear()}-${String(period.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const { data } = await admin
      .from('qb_read_budget')
      .select('coreplus_reads')
      .eq('company_id', companyId)
      .eq('period_month', month)
      .limit(1);
    expect((data ?? []).length, 'no read-budget row for this month').toBeGreaterThan(0);
    expect(Number((data![0] as { coreplus_reads: number }).coreplus_reads)).toBeGreaterThan(0);
  });
});
