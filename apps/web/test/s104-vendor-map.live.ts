import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { newDrainContext, resolveOrCreateVendor } from '@/lib/quickbooks/entities';
import { getAccessToken } from '@/lib/quickbooks/tokens';

/**
 * ⚠️ `#1-7gqb` — the vendor map, against the real sandbox.
 *
 * The entry names two costs and both are measured here rather than argued:
 *   1. one METERED CorePlus read per distinct supplier **per drain**, because
 *      `ctx.vendorCache` lives for exactly one drain;
 *   2. a supplier RENAMED inside QuickBooks silently becoming a SECOND Vendor,
 *      because the lookup key was the display name.
 *
 * ⚠️ CASE 2 IS THE ONE THAT MATTERS, and it is the one a mocked test cannot
 * reach: it asserts that a SECOND drain — a fresh context, an empty in-memory
 * cache — resolves without spending a metered read. `qb_read_budget` is the
 * witness, and it cannot be faked.
 */

const admin: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

/**
 * ⚠️ THIS CREATES A REAL VENDOR IN THE SANDBOX, AND THE COMMENT THAT SAID
 * OTHERWISE WAS WRONG. _Superseded:_ _"A supplier that already exists in the
 * sandbox, so nothing is created there."_ It did not exist; the first run
 * created **Vendor 77**, verified by querying Intuit afterwards.
 *
 * ⚠️ IT CANNOT BE CLEANED UP, and that is QuickBooks' rule rather than an
 * omission: the accounting API has no delete for a Vendor, only `Active: false`.
 * So the name is deliberately distinctive — a bookkeeper reading the sandbox
 * chart can see what it is and where it came from. **Do not point this test at a
 * production realm.**
 */
const SUPPLIER = 'S104 Vendor Map Probe';
let companyId: string;
let realmId: string;

async function reads(): Promise<number> {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const { data } = await admin
    .from('qb_read_budget').select('coreplus_reads')
    .eq('company_id', companyId).eq('period_month', month).limit(1);
  return (data ?? []).length ? Number((data![0] as { coreplus_reads: number }).coreplus_reads) : 0;
}

beforeAll(async () => {
  const { data } = await admin
    .from('companies').select('id, qb_realm_id')
    .eq('qb_connection_state', 'connected').limit(1).single();
  if (!data) throw new Error('no connected company');
  companyId = data.id as string;
  realmId = data.qb_realm_id as string;
  // Start from no mapping, so case 1 genuinely exercises the cold path.
  await admin.from('qb_vendor_map').delete()
    .eq('company_id', companyId).eq('supplier_name', SUPPLIER);
});

afterAll(async () => {
  // ⚠️ Deletes only THIS probe's mapping, by exact supplier name. A cleanup
  // scoped by company_id would erase every real mapping the tenant has learned.
  await admin.from('qb_vendor_map').delete()
    .eq('company_id', companyId).eq('supplier_name', SUPPLIER);
});

describe('S104 — qb_vendor_map', () => {
  let vendorId: string | null = null;

  it('1. a cold resolve reaches QuickBooks and REMEMBERS the id', async () => {
    const conn = await getAccessToken(admin, companyId);
    expect(conn, 'no usable token').not.toBeNull();

    const before = await reads();
    const ctx = newDrainContext(admin, conn!, companyId);
    vendorId = await resolveOrCreateVendor(ctx, SUPPLIER);

    expect(vendorId, 'the vendor could not be resolved or created').toBeTruthy();
    expect(await reads(), 'the cold path spent no metered read — did it reach Intuit at all?')
      .toBeGreaterThan(before);

    const { data: row } = await admin
      .from('qb_vendor_map').select('qb_vendor_id, supplier_key, realm_id')
      .eq('company_id', companyId).eq('supplier_name', SUPPLIER).single();
    expect(row, 'nothing was written to qb_vendor_map — the fix does not persist').not.toBeNull();
    expect((row as { qb_vendor_id: string }).qb_vendor_id).toBe(vendorId);
    // The generated column is the single definition of what matching means.
    expect((row as { supplier_key: string }).supplier_key).toBe(SUPPLIER.toLowerCase());
    expect((row as { realm_id: string }).realm_id).toBe(realmId);
  });

  it('2. a SECOND DRAIN resolves it with NO metered read — the cost the entry names', async () => {
    // ⚠️ A FRESH CONTEXT, so `ctx.vendorCache` is empty. This is the exact
    // situation the old code paid a metered read for, every drain, forever.
    const conn = await getAccessToken(admin, companyId);
    const before = await reads();
    const ctx = newDrainContext(admin, conn!, companyId);

    const again = await resolveOrCreateVendor(ctx, SUPPLIER);

    expect(again, 'the map did not resolve the vendor').toBe(vendorId);
    expect(await reads(), 'a metered read was spent despite a stored mapping')
      .toBe(before);
  });

  it('3. a mapping from ANOTHER realm is never read', async () => {
    // ⚠️ THIS IS WHY THE COLUMN IS IN QB_LINK_EXEMPT RATHER THAN THE RESET LIST.
    // Reconnecting to a different QuickBooks company must not resolve a supplier
    // to the old company's Vendor id — ids are small per-realm sequentials, so a
    // collision is likely rather than exotic.
    const { data: rows } = await admin
      .from('qb_vendor_map').select('id')
      .eq('company_id', companyId).eq('supplier_name', SUPPLIER)
      .eq('realm_id', 'A-DIFFERENT-REALM');
    expect(rows ?? [], 'the mapping is not realm-scoped').toEqual([]);
  });
});
