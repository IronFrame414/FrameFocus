/**
 * S97CT-ISO — cross-company isolation proof (GATED.md Gate 2, #104).
 *
 * Until now every role gate and RLS policy in FrameFocus was asserted by READING
 * THE CODE, never demonstrated: there was only one company on rebuild-test, so
 * "company A cannot see company B" had nothing to test against. This is that
 * proof, run against real rows under real sessions.
 *
 * Both directions are asserted for every table that carries money or job data:
 * projects, invoices, invoice lines, client payments, payment applications,
 * expenses, member pay rates, instrument rates and contacts. Reads AND writes.
 *
 * REQUIRES the persistent identities and company B:
 *   node scripts/seed-test-identities.mjs
 *
 * RUN:
 *   cd apps/web && npx vitest run --config test/live.vitest.config.ts s97ct-isolation
 *
 * READ-ONLY by design. The only writes it attempts are the ones that MUST be
 * refused, and each is verified afterwards to have changed nothing. It creates
 * no fixtures and deletes nothing — the seeded rows are persistent on purpose.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const A_OWNER = 'josh+test50@worthprop.com';
const A_ADMIN = 'josh+qa-admin@worthprop.com';
const A_FOREMAN = 'josh+qa-foreman@worthprop.com';
const B_OWNER = 'josh+qa-b-owner@worthprop.com';

const COMPANY_A_NAME = 'Bishop Contracting';
// ⚠️ RESOLVED BY NAME, NOT SLUG [S136]. This pinned `slug = 'ridgeline-test-co-2'`
// until S136's backfill rewrote company slugs to drop their hex suffix
// (20260917000000), at which point this file failed with "Company B not found —
// run seed-test-identities.mjs", which was untrue and pointed at the wrong fix.
// `slug` is the EMAIL LOCAL PART and is now rewritable; the name is what this
// test actually means. Company A on line 67 was already resolved this way.
const COMPANY_B_NAME = 'Ridgeline Builders (TEST CO 2)';

let aOwner: SupabaseClient;
let aAdmin: SupabaseClient;
let aForeman: SupabaseClient;
let bOwner: SupabaseClient;
let companyA: string;
let companyB: string;

/** One seeded row id per table, per company — the by-id probes. */
const aRow: Record<string, string> = {};
const bRow: Record<string, string> = {};

/** Every table the proof covers. */
const TABLES = [
  'projects',
  'invoices',
  'invoice_lines',
  'client_payments',
  'client_payment_applications',
  'expenses',
  'member_pay_rates',
  'instrument_rates',
  'contacts',
] as const;

/** The two tables above with no `is_deleted` column — checked, not assumed. */
const NO_SOFT_DELETE = new Set(['invoice_lines', 'instrument_rates']);

/**
 * ⚠️ LIVE ROWS ONLY, AND IN A DETERMINISTIC ORDER [S146].
 *
 * This was `.limit(1)` with neither filter nor ORDER BY, and both omissions bit.
 * Company A currently has FOUR of its ten invoices soft-deleted, so the pick
 * could hand test 11 a row whose `is_deleted` was ALREADY true — and test 11
 * asserts exactly that field is false after B's owner tries to set it. The
 * result was a cross-company ISOLATION FAILURE reported over a row nobody had
 * breached: B's owner was refused correctly, and the assertion failed anyway.
 *
 * Without an ORDER BY the row is not even stable between runs — Postgres returns
 * heap order, and an UPDATE moves a row — which is why this passed four full
 * suite runs and then failed, with nothing relevant having changed.
 *
 * A fixture that can select a deleted row cannot test soft-delete refusal. Same
 * class as the S140/S145/S146 fixture drift; fourth instance.
 */
async function firstIdFor(table: string, companyId: string): Promise<string | undefined> {
  let query = admin.from(table).select('id').eq('company_id', companyId);
  if (!NO_SOFT_DELETE.has(table)) query = query.eq('is_deleted', false);
  const { data } = await query.order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id;
}

beforeAll(async () => {
  assertRebuildTest();

  const { data: a } = await admin.from('companies').select('id').eq('name', COMPANY_A_NAME).single();
  const { data: b } = await admin.from('companies').select('id').eq('name', COMPANY_B_NAME).maybeSingle();
  if (!b) {
    throw new Error(
      'Company B not found — run `node scripts/seed-test-identities.mjs` first (GATED.md Gate 2 / #104).'
    );
  }
  companyA = a!.id;
  companyB = b.id;

  for (const table of TABLES) {
    const aId = await firstIdFor(table, companyA);
    const bId = await firstIdFor(table, companyB);
    if (aId) aRow[table] = aId;
    if (bId) bRow[table] = bId;
  }

  [aOwner, aAdmin, aForeman, bOwner] = await Promise.all([
    sessionFor(A_OWNER),
    sessionFor(A_ADMIN),
    sessionFor(A_FOREMAN),
    sessionFor(B_OWNER),
  ]);
}, 180_000);

describe('S97CT-ISO — every role exists (Gate 2, #103)', () => {
  it('1. company A carries all five gated roles, each on its own identity', async () => {
    const { data } = await admin
      .from('profiles')
      .select('email, role')
      .eq('company_id', companyA)
      .eq('is_deleted', false);

    const byRole = Object.fromEntries((data ?? []).map((p) => [p.role, p.email]));
    expect(byRole.owner).toBe(A_OWNER);
    expect(byRole.admin).toBe(A_ADMIN);
    expect(byRole.project_manager).toBe('josh+pm@worthprop.com');
    expect(byRole.foreman).toBe(A_FOREMAN);
    expect(byRole.crew_member).toBe('josh+crew@worthprop.com');
  });

  it('2. each identity resolves to its own company and role in the DB helpers', async () => {
    for (const [client, company, role] of [
      [aOwner, companyA, 'owner'],
      [aAdmin, companyA, 'admin'],
      [aForeman, companyA, 'foreman'],
      [bOwner, companyB, 'owner'],
    ] as const) {
      const { data: cid } = await client.rpc('get_my_company_id');
      const { data: r } = await client.rpc('get_my_role');
      expect(cid).toBe(company);
      expect(r).toBe(role);
    }
    expect(companyA).not.toBe(companyB);
  });
});

describe('S97CT-ISO — cross-company READS return nothing (#104)', () => {
  it('3. the proof is not vacuous — both companies hold rows, and each owner CAN see their own', async () => {
    // If B were empty, "A sees none of B" would prove nothing. If neither owner
    // could read anything at all, every assertion below would pass trivially.
    for (const table of [
      'projects', 'invoices', 'client_payments', 'client_payment_applications',
      'expenses', 'member_pay_rates', 'contacts',
    ] as const) {
      expect(aRow[table], `company A has no ${table} to hide`).toBeDefined();
      expect(bRow[table], `company B has no ${table} to hide`).toBeDefined();

      // and each owner genuinely reads their OWN row back
      const { data: aSees } = await aOwner.from(table).select('id').eq('id', aRow[table]);
      expect(aSees ?? [], `A owner cannot even read their own ${table}`).toHaveLength(1);
      const { data: bSees } = await bOwner.from(table).select('id').eq('id', bRow[table]);
      expect(bSees ?? [], `B owner cannot even read their own ${table}`).toHaveLength(1);
    }
  });

  it("4. B's owner cannot read ANY of company A's rows, by id", async () => {
    for (const table of TABLES) {
      if (!aRow[table]) continue;
      const { data } = await bOwner.from(table).select('id').eq('id', aRow[table]);
      expect(data ?? [], `${table} leaked A→B`).toHaveLength(0);
    }
  });

  it("5. A's owner cannot read ANY of company B's rows, by id", async () => {
    for (const table of TABLES) {
      if (!bRow[table]) continue;
      const { data } = await aOwner.from(table).select('id').eq('id', bRow[table]);
      expect(data ?? [], `${table} leaked B→A`).toHaveLength(0);
    }
  });

  it('6. every row each owner CAN list belongs to their own company', async () => {
    for (const [client, own, label] of [
      [aOwner, companyA, 'A owner'],
      [bOwner, companyB, 'B owner'],
    ] as const) {
      for (const table of TABLES) {
        const { data } = await client.from(table).select('company_id').limit(500);
        const foreign = (data ?? []).filter((r) => r.company_id !== own);
        expect(foreign, `${label} saw foreign rows in ${table}`).toHaveLength(0);
      }
    }
  });

  it("7. an unprivileged role leaks nothing either — A's foreman sees no B rows", async () => {
    for (const table of TABLES) {
      if (!bRow[table]) continue;
      const { data } = await aForeman.from(table).select('id').eq('id', bRow[table]);
      expect(data ?? [], `${table} leaked B→A foreman`).toHaveLength(0);
    }
  });

  it("8. A's admin — full rights inside A — still sees nothing of B", async () => {
    for (const table of TABLES) {
      if (!bRow[table]) continue;
      const { data } = await aAdmin.from(table).select('id').eq('id', bRow[table]);
      expect(data ?? [], `${table} leaked B→A admin`).toHaveLength(0);
    }
  });
});

describe('S97CT-ISO — cross-company WRITES are refused (#104)', () => {
  it("9. B's owner cannot UPDATE company A's project", async () => {
    const projectId = aRow.projects;
    const { data: before } = await admin.from('projects').select('name').eq('id', projectId).single();

    await bOwner.from('projects').update({ name: 'ISOLATION BREACH' }).eq('id', projectId);

    const { data: after } = await admin.from('projects').select('name').eq('id', projectId).single();
    expect(after!.name).toBe(before!.name);
    expect(after!.name).not.toBe('ISOLATION BREACH');
  });

  it("10. B's owner cannot INSERT a row into company A", async () => {
    const { data, error } = await bOwner
      .from('contacts')
      .insert({
        company_id: companyA, // explicitly claiming A
        contact_type: 'client',
        first_name: 'ISOLATION',
        last_name: 'BREACH',
      })
      .select('id');

    // Either RLS refuses outright, or it silently writes nothing — never a row in A.
    expect(error ?? data?.length === 0).toBeTruthy();
    const { count } = await admin
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyA)
      .eq('last_name', 'BREACH');
    expect(count).toBe(0);
  });

  it("11. B's owner cannot soft-delete company A's invoice", async () => {
    const invoiceId = aRow.invoices;
    await bOwner.from('invoices').update({ is_deleted: true }).eq('id', invoiceId);

    const { data } = await admin.from('invoices').select('is_deleted').eq('id', invoiceId).single();
    expect(data!.is_deleted).toBe(false);
  });

  it("12. the 7E payment RPC refuses an invoice from another company", async () => {
    // The RPC is SECURITY DEFINER, so RLS does not protect it — its OWN company
    // check has to. This is the assertion that proves that check is real.
    const { data: bContact } = await admin
      .from('contacts').select('id').eq('company_id', companyB).limit(1).single();

    const { error } = await bOwner.rpc('record_client_payment', {
      p_contact_id: bContact!.id,
      p_amount: 100,
      p_applications: [{ invoice_id: aRow.invoices, amount: 100 }],
      p_payment_date: null,
      p_method: null,
      p_note: null,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/belongs to another company|not found/i);

    // and nothing was recorded on either side
    const { count } = await admin
      .from('client_payment_applications')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', aRow.invoices);
    expect(count).toBe(0);
  });

  it("13. A's owner cannot reach into B either — the block is symmetric", async () => {
    const projectId = bRow.projects;
    const { data: before } = await admin.from('projects').select('name').eq('id', projectId).single();

    await aOwner.from('projects').update({ name: 'ISOLATION BREACH' }).eq('id', projectId);

    const { data: after } = await admin.from('projects').select('name').eq('id', projectId).single();
    expect(after!.name).toBe(before!.name);
  });
});

describe('S97CT-ISO — per-company sequences do not collide', () => {
  it('14. both companies independently own an INV-0001', async () => {
    // Numbering is per-company. Two companies each holding INV-0001 is correct,
    // and is a second, incidental proof that the tenant boundary is real.
    const { data } = await admin
      .from('invoices')
      .select('company_id, invoice_number')
      .eq('invoice_number', 'INV-0001');

    const companies = new Set((data ?? []).map((i) => i.company_id));
    expect(companies.has(companyA)).toBe(true);
    expect(companies.has(companyB)).toBe(true);
  });
});
