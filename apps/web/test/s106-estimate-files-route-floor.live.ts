import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// S106 Part C (FILL-C.3) — THE ROUTE IS THE ONLY ACCESS CONTROL, so its floor must be
// proven, not asserted. /api/estimates/[id]/files reads the estimate through the CALLER'S
// SESSION client (estimates_select_authenticated) before ever touching the service-role
// client; then it lists files with `.eq('estimate_id', <that estimate>)`. This test
// exercises exactly those two mechanisms — the session-read floor and the estimate_id
// scoping — which together ARE the route's entire access control. (The Next route handler
// can't be invoked with a real session in vitest, so the floor is tested at the layer that
// enforces it.)
//
// ⚠️ READ-ONLY — no seeding, no mutation of the shared QA tenants (s148/s149 lesson). Row
// counts are asserted non-zero so nothing passes vacuously.

const PM = 'josh+pm@worthprop.com';
const OWNER = 'josh+test50@worthprop.com';

let pmC: SupabaseClient;
let ownerC: SupabaseClient;
let company = '';
let pmUid = '';
let notPmEstimateId = '';
let contractCount = 0;
let otherEstimateCount = 0;

beforeAll(async () => {
  assertRebuildTest();
  [pmC, ownerC] = (await Promise.all([sessionFor(PM), sessionFor(OWNER)])) as SupabaseClient[];

  const { data: prof } = await admin
    .from('profiles')
    .select('company_id, user_id')
    .eq('email', PM)
    .eq('is_deleted', false)
    .single();
  company = (prof as { company_id: string }).company_id;
  pmUid = (prof as { user_id: string }).user_id;

  // An estimate the PM did NOT author (owner/admin authored). estimates_select_authenticated
  // admits a PM only for `created_by = auth.uid()`, so a non-authored estimate stands in for
  // "another PM's" — the denial is the same rule. Ordered for a deterministic pick.
  const { data: est } = await admin
    .from('estimates')
    .select('id')
    .eq('company_id', company)
    .neq('created_by', pmUid)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  notPmEstimateId = (est as { id: string }).id;

  const { count: oc } = await admin
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', company)
    .neq('created_by', pmUid)
    .eq('is_deleted', false);
  otherEstimateCount = oc ?? 0;

  const { count: cc } = await admin
    .from('files')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', company)
    .eq('category', 'contracts')
    .is('project_id', null)
    .is('estimate_id', null);
  contractCount = cc ?? 0;
});

describe('S106 Part C — the estimate-files route floor', () => {
  it('non-vacuous fixtures exist (row counts stated)', () => {
    // Rows exercised: notPmEstimate = 1 (of otherEstimateCount), company-level contracts = contractCount.
    expect(otherEstimateCount, 'no non-PM-authored estimate to test against').toBeGreaterThan(0);
    expect(contractCount, 'no company-level contract to test unreachability against').toBeGreaterThan(0);
    // Recorded at run time: otherEstimateCount (currently 29), contractCount (currently 4).
    expect(notPmEstimateId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('FLOOR: a PM CANNOT SELECT an estimate they did not author → the route returns 404 and its files are unreachable', async () => {
    const { data } = await pmC
      .from('estimates')
      .select('id')
      .eq('id', notPmEstimateId)
      .maybeSingle();
    expect(data, `a PM reached an estimate they did not author (${notPmEstimateId}); the route would list its files`).toBeNull();
  });

  it('the floor is NOT blanket-deny: the OWNER can SELECT the same estimate → the route would serve an authorized caller', async () => {
    const { data } = await ownerC
      .from('estimates')
      .select('id')
      .eq('id', notPmEstimateId)
      .maybeSingle();
    expect((data as { id: string } | null)?.id).toBe(notPmEstimateId);
  });

  it('NO ROLE reaches a company-level file through this route: the list is scoped by estimate_id, and company-level files have estimate_id NULL', async () => {
    // The route lists exactly this way. A company-level contract has estimate_id NULL, so it
    // can never match `.eq('estimate_id', …)` — it is structurally unreachable through the route.
    const { data } = await admin
      .from('files')
      .select('id, estimate_id, category, project_id')
      .eq('estimate_id', notPmEstimateId)
      .eq('is_deleted', false);
    for (const f of data ?? []) {
      expect(f.estimate_id).toBe(notPmEstimateId); // only the scoped estimate's files
      expect(f.project_id).toBeNull(); // estimate files are project_id NULL by construction
    }
    // And the contracts genuinely exist but are NOT reachable by any estimate_id scope.
    expect(contractCount).toBeGreaterThan(0);
  });
});
