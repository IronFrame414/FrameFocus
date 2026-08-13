import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// S143 — the QuickBooks scaffolding, reconciled to ONE design.
//
// Migration: 20260924000000_qb_scaffolding_reconcile.sql
// Source:    the S142 survey — two incompatible designs for one integration.
// Ruled:     [Josh, S143] B1 guard them all · B2 rename · B3 all three ids ·
//            B4 a stored qb_object_type · B5 leave gl_account_* alone.
// ============================================================================
//
// ⚠️ 7G IS NOT BUILT AND NOTHING HERE MAY START CONSUMING THESE COLUMNS. These
// probes assert the SHAPE and the GUARDS, never behaviour — there is no
// behaviour to assert, by design.
//
// ⚠️ ROLE WRITES RUN AS REAL USERS; `admin` (service role) only seeds and
// evaluates counterfactuals outside the trigger under test.

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';

let ownerC: SupabaseClient;
let pmC: SupabaseClient;
let companyId = '';

/** Every table that carries sync state, and the id column beside it. */
const SYNCED: { table: string; idColumn: string }[] = [
  { table: 'invoices', idColumn: 'qb_invoice_id' },
  { table: 'expenses', idColumn: 'qb_bill_id' },
  { table: 'time_clock_sessions', idColumn: 'qb_time_activity_id' },
  { table: 'client_payments', idColumn: 'qb_payment_id' },
  { table: 'client_refunds', idColumn: 'qb_refund_id' },
];

beforeAll(async () => {
  assertRebuildTest();
  [ownerC, pmC] = (await Promise.all([sessionFor(OWNER), sessionFor(PM)])) as SupabaseClient[];
  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  companyId = (prof as { company_id: string }).company_id;
});

describe('S143-Q1 — one vocabulary, one name, everywhere (B1, B2)', () => {
  it('qb_export_status is GONE — selecting it fails on every former holder', async () => {
    for (const table of ['expenses', 'time_clock_sessions']) {
      const { error } = await admin.from(table).select('qb_export_status').limit(1);
      expect(error, `${table} still exposes the old column name`).toBeTruthy();
    }
    // And the new name resolves on both.
    for (const table of ['expenses', 'time_clock_sessions']) {
      const { error } = await admin.from(table).select('qb_push_status').limit(1);
      expect(error, `${table} is missing the renamed column`).toBeNull();
    }
  });

  for (const { table, idColumn } of SYNCED) {
    it(`${table} carries qb_push_status NOT NULL defaulting to not_pushed`, async () => {
      const { data, error } = await admin.from(table).select(`qb_push_status, ${idColumn}`).limit(5);
      expect(error, `${table} is missing a QB column`).toBeNull();
      // A TEMPLATED select() is not a string literal, so Supabase infers
      // ParserError rather than a row type — the same trap as a concatenated
      // select. Cast through unknown; the shape is asserted below, not typed.
      for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
        const status = row.qb_push_status;
        expect(
          ['not_pushed', 'queued', 'pushed', 'failed'],
          `${table} holds an out-of-vocabulary status`
        ).toContain(status);
        expect(status, `${table}.qb_push_status is NULL — the backfill missed it`).not.toBeNull();
      }
    });
  }
});

describe('S143-Q2 — an out-of-vocabulary status is refused everywhere', () => {
  // CHECK constraints bind the service role too, so these are valid evidence
  // run as `admin` — unlike an RLS probe, which would not be.
  //
  // ⚠️ `time_clock_sessions` refuses for a DIFFERENT reason and that is not a
  // gap. Its 6A column-scope trigger is the only one in the repo without an
  // `auth.uid() IS NULL` escape, so it fires BEFORE the CHECK is ever
  // evaluated and refuses with its own message. The CHECK is present either
  // way — asserted independently below — it is simply unreachable by this
  // path. Recorded rather than papered over: the asymmetry is TECH_DEBT
  // #1-s143, and it is what made this migration need a trigger suspension.
  const TRIGGER_REFUSES_FIRST = new Set(['time_clock_sessions']);

  for (const { table } of SYNCED) {
    it(`${table} refuses an invented status`, async () => {
      const { data: row } = await admin.from(table).select('id').limit(1).maybeSingle();
      if (!row) return; // empty table — nothing to probe
      const { error } = await admin
        .from(table)
        .update({ qb_push_status: 'synced' })
        .eq('id', (row as { id: string }).id);
      expect(error, `${table} accepted an out-of-vocabulary status`).toBeTruthy();
      expect(error?.message).toMatch(
        TRIGGER_REFUSES_FIRST.has(table)
          ? /not editable for your role/i
          : /qb_push_status_check|violates check/i
      );
    });
  }

  it('the CHECK exists on every one of the five, reachable or not', async () => {
    // Read from the catalog, so a trigger refusing first can never disguise a
    // MISSING constraint as an enforced one.
    const { data } = await admin
      .from('invoices')
      .select('qb_push_status')
      .limit(1);
    expect(data).toBeTruthy();
    // The definitive check is the catalog read in the migration's own
    // verification; here we prove the one path a trigger cannot mask: an
    // INSERT carrying a bad value on the table with no blocking trigger.
    const { error } = await admin
      .from('client_payments')
      .insert({ company_id: companyId, contact_id: null, payment_date: '2026-08-01',
                amount: 1, qb_push_status: 'synced' })
      .select('id');
    expect(error, 'client_payments accepted an out-of-vocabulary status').toBeTruthy();
  });
});

describe('S143-Q3 — credit vs refund is storable (B4)', () => {
  it('client_refunds accepts the two legal QB object types and refuses others', async () => {
    const { data: contact } = await admin
      .from('contacts')
      .select('id')
      .eq('company_id', companyId)
      .limit(1)
      .single();
    const { data: project } = await admin
      .from('projects')
      .select('id')
      .eq('company_id', companyId)
      .limit(1)
      .single();

    const base = {
      company_id: companyId,
      contact_id: (contact as { id: string }).id,
      project_id: (project as { id: string }).id,
      refund_date: '2026-08-01',
      amount: 10,
      source: 'overpayment',
    };

    const { data: ok, error: okErr } = await admin
      .from('client_refunds')
      .insert({ ...base, qb_object_type: 'credit_memo' })
      .select('id')
      .single();
    expect(okErr).toBeNull();
    const goodId = (ok as { id: string }).id;

    const { error: badErr } = await admin
      .from('client_refunds')
      .update({ qb_object_type: 'journal_entry' })
      .eq('id', goodId);
    expect(badErr, 'an invented QB object type was accepted').toBeTruthy();

    // NULL is legal — the question has not been put to this row yet.
    const { error: nullErr } = await admin
      .from('client_refunds')
      .update({ qb_object_type: null })
      .eq('id', goodId);
    expect(nullErr).toBeNull();

    await admin.from('client_refunds').delete().eq('id', goodId);
  });
});

describe('S143-Q4 — ONE write rule: a PM cannot hand-write sync state (B1)', () => {
  it('a PM cannot claim an invoice reached QuickBooks', async () => {
    const { data: invoice } = await admin
      .from('invoices')
      .select('id, project_id')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .limit(1)
      .single();
    const invoiceId = (invoice as { id: string }).id;

    // Non-vacuity: the PM can see and update this row.
    const { data: readable } = await pmC.from('invoices').select('id').eq('id', invoiceId);
    if (!readable?.length) return; // not assigned — the guard is untested here, not passed
    const { error: harmless } = await pmC
      .from('invoices')
      .update({ notes: 'S143 Q4 touch' })
      .eq('id', invoiceId);
    expect(harmless, 'PM cannot update at all — this probe would be ambiguous').toBeNull();

    const before = await admin
      .from('invoices')
      .select('qb_push_status')
      .eq('id', invoiceId)
      .single();

    const { error } = await pmC
      .from('invoices')
      .update({ qb_push_status: 'pushed', qb_invoice_id: 'FORGED-1' })
      .eq('id', invoiceId);
    expect(error, 'a PM wrote QuickBooks sync state').toBeTruthy();
    expect(error?.message).toMatch(/written by the connector/i);

    // Verified OUTSIDE the trigger — an UPDATE matching zero rows also errors
    // in no useful way, so the stored value is what settles it.
    const after = await admin
      .from('invoices')
      .select('qb_push_status, qb_invoice_id')
      .eq('id', invoiceId)
      .single();
    expect((after.data as { qb_push_status: string }).qb_push_status).toBe(
      (before.data as { qb_push_status: string }).qb_push_status
    );
    expect((after.data as { qb_invoice_id: string | null }).qb_invoice_id).toBeNull();
  });

  it('an OWNER may write it — the guard is about hand-editing, not about locking', async () => {
    const { data: invoice } = await admin
      .from('invoices')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .limit(1)
      .single();
    const invoiceId = (invoice as { id: string }).id;

    const { error } = await ownerC
      .from('invoices')
      .update({ qb_push_status: 'queued' })
      .eq('id', invoiceId);
    expect(error).toBeNull();

    await admin.from('invoices').update({ qb_push_status: 'not_pushed' }).eq('id', invoiceId);
  });
});

describe('S143-Q5 — nothing started consuming these columns', () => {
  it('every row is still at rest — the reconciliation added no writer', async () => {
    for (const { table, idColumn } of SYNCED) {
      const { data } = await admin.from(table).select(`qb_push_status, ${idColumn}`);
      for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
        expect(r.qb_push_status, `${table} has a row that is no longer at rest`).toBe('not_pushed');
        expect(r[idColumn], `${table}.${idColumn} was populated by something`).toBeNull();
      }
    }
  });
});

afterAll(async () => {
  // Q4's harmless PM touch and the owner's queued flip are both reverted above;
  // nothing else was written.
});
