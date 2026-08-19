/**
 * S164 — Module 9 stage 1. The client principal, proved in BOTH directions.
 *
 * Migration: `20261016000000_m9_client_identity.sql`.
 * Rulings: Josh, S164 Phase 2 Q1 (identity shape), Q4 (own contact + site
 * address), Q7 (two identities). Findings: `docs/specs/S164-m9-phase1-findings.md`.
 *
 * ============================================================================
 * ⚠️ WHY EVERY ASSERTION HERE COMES IN PAIRS
 * ============================================================================
 * `9-spec.md` §2 is the reason this file is shaped the way it is:
 *
 *   > No client can exercise any client policy arm today, and every existing
 *   > "client reads 0" probe passes VACUOUSLY. A client is refused today by the
 *   > ABSENCE OF A MEMBER ROW, not by any client-specific rule.
 *
 * So `expect(rows).toHaveLength(0)` for a client proves NOTHING on its own — it
 * is true of that identity for every table in the database, under a correct
 * policy and under no policy at all.
 *
 * Every grant below is therefore asserted twice, on the SAME query:
 *
 *   LINKED   (`josh+qa-client-linked@`, `profiles.contact_id` set)  -> reads it
 *   CONTROL  (`josh+qa-client@`,        `profiles.contact_id` NULL) -> reads nothing
 *
 * The linked half proves the grant exists. The control half proves it is a
 * grant and not a hole. **A change that deleted the policies entirely would
 * still pass the control assertions**, which is exactly why they are never
 * written alone. Group A exists to fail loudly if the fixtures ever stop
 * satisfying that premise.
 *
 * ⚠️ AND ONE THAT IS NOT ABOUT CLIENTS AT ALL — D2. The linked client must read
 * the SITE address and must NOT read the HOME address, both hanging off the
 * same contact row. With one address seeded, a policy that wrongly unlocked the
 * whole contact's address list would pass identically. That is the trap
 * `20261006000000` recorded for the S154 sub grant, and it is fixtured against
 * here rather than trusted.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const LINKED = 'josh+qa-client-linked@worthprop.com';
const CONTROL = 'josh+qa-client@worthprop.com';
const OWNER = 'josh+test50@worthprop.com';

/** e2e/m-sections.spec.ts's project — reached ONLY through `project_contacts`. */
const SECTIONS_PROJECT_ID = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

let linked: SupabaseClient;
let control: SupabaseClient;
let owner: SupabaseClient;

let companyId: string;
let linkedContactId: string;
let fixtureProjectId: string;
let unrelatedProjectId: string;
let siteAddressId: string;
let homeAddressId: string;

beforeAll(async () => {
  assertRebuildTest();
  [linked, control, owner] = await Promise.all([
    sessionFor(LINKED),
    sessionFor(CONTROL),
    sessionFor(OWNER),
  ]);

  const { data: prof } = await admin
    .from('profiles')
    .select('company_id, contact_id')
    .eq('email', LINKED)
    .single();
  const p = prof as { company_id: string; contact_id: string | null };
  companyId = p.company_id;
  if (!p.contact_id) {
    throw new Error(
      `${LINKED} has no contact_id — run scripts/seed-test-identities.mjs. ` +
        'Without the link EVERY assertion in this file passes vacuously.'
    );
  }
  linkedContactId = p.contact_id;

  const { data: fx } = await admin
    .from('projects')
    .select('id, contact_address_id')
    .eq('company_id', companyId)
    .eq('name', 'QA A — isolation fixture')
    .single();
  fixtureProjectId = (fx as { id: string }).id;

  const { data: addrs } = await admin
    .from('contact_addresses')
    .select('id, label')
    .eq('contact_id', linkedContactId);
  const rows = (addrs ?? []) as { id: string; label: string | null }[];
  // Named failure rather than `!.id`. Observed at S164: pointing the identity at
  // a contact with no addresses crashed here with
  // "Cannot read properties of undefined", and vitest reported "24 skipped" —
  // technically a non-zero exit, but nothing in the output said which fixture
  // was missing. A fixture harness that dies obscurely is the same problem as a
  // vacuous pass, one step earlier.
  const site = rows.find((r) => r.label === 'Job site');
  const home = rows.find((r) => r.label === 'Home');
  if (!site || !home) {
    throw new Error(
      `contact ${linkedContactId} needs BOTH a 'Job site' and a 'Home' address ` +
        `(found: ${rows.map((r) => r.label ?? 'null').join(', ') || 'none'}). ` +
        'Run scripts/seed-test-identities.mjs — without both, D2 cannot tell a ' +
        'correct grant from one that unlocked the whole address list.'
    );
  }
  siteAddressId = site.id;
  homeAddressId = home.id;

  // A company-A project the linked client is on by NEITHER arm — resolved
  // rather than hard-coded, so it cannot silently become a project she IS on.
  const { data: pcs } = await admin
    .from('project_contacts')
    .select('project_id')
    .eq('contact_id', linkedContactId)
    .eq('is_deleted', false);
  const viaJunction = new Set(((pcs ?? []) as { project_id: string }[]).map((r) => r.project_id));
  const { data: all } = await admin
    .from('projects')
    .select('id, contact_id')
    .eq('company_id', companyId)
    .eq('is_deleted', false);
  const other = ((all ?? []) as { id: string; contact_id: string }[]).find(
    (r) => r.contact_id !== linkedContactId && !viaJunction.has(r.id)
  );
  if (!other) throw new Error('no unrelated company-A project — the refusal cases would be vacuous');
  unrelatedProjectId = other.id;
});

const canSee = async (c: SupabaseClient, projectId: string) => {
  const { data, error } = await c.rpc('is_client_of_project', { p_project_id: projectId });
  if (error) throw new Error(`is_client_of_project: ${error.message}`);
  return data as boolean;
};

// ───────────────────────────────────────────────────────────────────────────
describe('A — the fixture premise, without which nothing below means anything', () => {
  it('A1 — the linked client IS linked and the control client is NOT', async () => {
    const { data } = await admin
      .from('profiles')
      .select('email, contact_id')
      .in('email', [LINKED, CONTROL]);
    const rows = (data ?? []) as { email: string; contact_id: string | null }[];
    expect(rows.find((r) => r.email === LINKED)!.contact_id).toBe(linkedContactId);
    expect(rows.find((r) => r.email === CONTROL)!.contact_id).toBeNull();
  });

  it('A2 — NEITHER client has a company_members row (Q1 rests on this)', async () => {
    const { data } = await admin
      .from('profiles')
      .select('id, email')
      .in('email', [LINKED, CONTROL]);
    for (const r of (data ?? []) as { id: string; email: string }[]) {
      const { count } = await admin
        .from('company_members')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', r.id);
      expect(count, `${r.email} must have no member row`).toBe(0);
    }
  });

  it('A3 — the two addresses hang off ONE contact, so D2 is a real test', async () => {
    expect(siteAddressId).not.toBe(homeAddressId);
    const { data } = await admin
      .from('contact_addresses')
      .select('contact_id')
      .in('id', [siteAddressId, homeAddressId]);
    for (const r of (data ?? []) as { contact_id: string }[]) {
      expect(r.contact_id).toBe(linkedContactId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('B — is_client_of_project(), both arms and every refusal', () => {
  it('B1 — ARM (a) projects.contact_id: linked client sees the fixture project', async () => {
    expect(await canSee(linked, fixtureProjectId)).toBe(true);
  });

  it('B2 — ARM (b) project_contacts: linked client sees the m-sections project', async () => {
    // R3's "several contacts per project". This project's own contact_id is a
    // DIFFERENT contact, so arm (a) cannot be what carries this assertion.
    const { data } = await admin
      .from('projects')
      .select('contact_id')
      .eq('id', SECTIONS_PROJECT_ID)
      .single();
    expect((data as { contact_id: string }).contact_id).not.toBe(linkedContactId);
    expect(await canSee(linked, SECTIONS_PROJECT_ID)).toBe(true);
  });

  it('B3 — linked client does NOT see an unrelated project in her own company', async () => {
    expect(await canSee(linked, unrelatedProjectId)).toBe(false);
  });

  it('B4 — THE COUNTERFACTUAL: the control client sees NONE of the three', async () => {
    // Same three calls that returned true/true/false above. If the helper were
    // wrong — or absent — this identity would still return false everywhere,
    // which is precisely why B1/B2 exist alongside it.
    expect(await canSee(control, fixtureProjectId)).toBe(false);
    expect(await canSee(control, SECTIONS_PROJECT_ID)).toBe(false);
    expect(await canSee(control, unrelatedProjectId)).toBe(false);
  });

  it('B5 — the helper is client-only: an OWNER gets false on his own project', async () => {
    // Self-gating on `role = 'client'`. A policy arm built on this helper
    // therefore cannot widen anything for staff even if it omits a role check.
    expect(await canSee(owner, fixtureProjectId)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('C — contacts: her own record, and nothing else', () => {
  it('C1 — linked client reads EXACTLY ONE contact: her own', async () => {
    const { data, error } = await linked.from('contacts').select('id, first_name, last_name');
    expect(error).toBeNull();
    const rows = (data ?? []) as { id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(linkedContactId);
  });

  it('C2 — CONTROL client reads zero contacts', async () => {
    const { data, error } = await control.from('contacts').select('id');
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('C3 — linked client cannot fetch another contact BY ID', async () => {
    // The company holds many contacts and she reads one. A `select *` returning
    // one row could be a company with one contact; naming the id it must refuse
    // removes that reading.
    const { data: others } = await admin
      .from('contacts')
      .select('id')
      .eq('company_id', companyId)
      .neq('id', linkedContactId)
      .limit(1);
    const otherId = ((others ?? []) as { id: string }[])[0]?.id;
    expect(otherId, 'need a second contact for this to mean anything').toBeTruthy();

    const { data, error } = await linked.from('contacts').select('id').eq('id', otherId!);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('C4 — and the owner still reads the whole list (nothing was narrowed)', async () => {
    const { data } = await owner.from('contacts').select('id');
    expect((data ?? []).length).toBeGreaterThan(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('D — contact_addresses: the SITE address only', () => {
  it('D1 — linked client reads the site address of her project', async () => {
    const { data, error } = await linked.from('contact_addresses').select('id, label');
    expect(error).toBeNull();
    const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
    expect(ids).toContain(siteAddressId);
  });

  it('D2 — ⚠️ and NOT the home address on the same contact', async () => {
    // The grant resolves through `projects.contact_address_id`, not through the
    // contact. If it ever resolves through the contact instead, this is the only
    // assertion in the suite that goes red — D1 would still pass.
    const { data } = await linked.from('contact_addresses').select('id');
    const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
    expect(ids).not.toContain(homeAddressId);
    expect(ids).toHaveLength(1);
  });

  it('D3 — asked for the home address BY ID, she is refused', async () => {
    const { data, error } = await linked
      .from('contact_addresses')
      .select('id')
      .eq('id', homeAddressId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('D4 — CONTROL client reads zero addresses', async () => {
    const { data, error } = await control.from('contact_addresses').select('id');
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('E — stage 1 grants identity and NOTHING ELSE', () => {
  // A regression guard for stages 2 and 3. Each of these becomes a real grant
  // later, deliberately and one at a time; until then a non-zero count here
  // means something opened that nobody decided to open.
  const CLOSED = ['files', 'invoices', 'change_orders', 'projects', 'daily_logs', 'punch_lists'];

  for (const table of CLOSED) {
    it(`E — linked client still reads 0 from ${table}`, async () => {
      const { data, error } = await linked.from(table).select('id');
      expect(error).toBeNull();
      expect(data ?? [], `${table} opened without a ruling`).toHaveLength(0);
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
describe('F — the column constraints', () => {
  it('F1 — contact_id cannot be set on a NON-client profile', async () => {
    const { data: crew } = await admin
      .from('profiles')
      .select('id')
      .eq('email', 'josh+crew@worthprop.com')
      .single();
    const { error } = await admin
      .from('profiles')
      .update({ contact_id: linkedContactId })
      .eq('id', (crew as { id: string }).id);
    expect(error, 'the CHECK must refuse this').not.toBeNull();
    expect(error!.message).toMatch(/profiles_contact_id_client_only|violates check/i);

    // And prove it did not land — the error alone does not say the row is clean.
    const { data: after } = await admin
      .from('profiles')
      .select('contact_id')
      .eq('id', (crew as { id: string }).id)
      .single();
    expect((after as { contact_id: string | null }).contact_id).toBeNull();
  });

  it('F2 — two profiles cannot claim the same contact', async () => {
    const { data: ctrl } = await admin
      .from('profiles')
      .select('id')
      .eq('email', CONTROL)
      .single();
    const { error } = await admin
      .from('profiles')
      .update({ contact_id: linkedContactId })
      .eq('id', (ctrl as { id: string }).id);
    expect(error, 'the UNIQUE index must refuse this').not.toBeNull();
    expect(error!.message).toMatch(/profiles_contact_id_key|duplicate key/i);

    // ⚠️ The control MUST still be unlinked, or every counterfactual above is
    // now vacuous and this file would go on reporting green.
    const { data: after } = await admin
      .from('profiles')
      .select('contact_id')
      .eq('id', (ctrl as { id: string }).id)
      .single();
    expect((after as { contact_id: string | null }).contact_id).toBeNull();
  });
});
