import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// contact_addresses — the WRITE role floor. RULED [S121, Josh].
// ============================================================================
//
// Migration: 20260829000000_contact_addresses_role_floor.sql
//
//   "CREW AND SUBS CANNOT EDIT, CREATE OR DELETE CONTACT ADDRESSES."
//
// Before it, all three verbs were `company_id = get_my_company_id()` and
// NOTHING else — every role in the company could rewrite or permanently delete
// any contact's address, a client's included.
//
// ---------------------------------------------------------------------------
// WHY THIS RUNS AGAINST THE REAL DATABASE
// ---------------------------------------------------------------------------
// The rule IS the policy. A unit test with a stubbed client would assert my own
// reimplementation of the predicate, which is the one thing that cannot go
// wrong; what can go wrong is the SQL. These sessions are real supabase-js
// clients on the ANON key carrying real user JWTs, so RLS applies exactly as it
// does in the app — never `postgres`, which bypasses RLS and would prove
// nothing.
//
// ---------------------------------------------------------------------------
// ⚠️ THE FAILURE MODE THIS IS SHAPED AROUND — read before editing
// ---------------------------------------------------------------------------
// A floor's failure mode is REFUSING EVERYBODY, which from the outside is
// indistinguishable from the floor working. An absence assertion alone ("crew
// cannot delete") passes on a policy that refuses the owner too, and on one
// that silently broke the tenant scope.
//
// So every verb is asserted as a PAIR: a role that MUST be refused, and a role
// that MUST succeed. A migration that over-reaches fails the positive half.
//
// ⚠️ AND THE SECOND TRAP, WHICH IS SPECIFIC TO POSTGRES RLS:
// **A refused UPDATE or DELETE does not error. It affects zero rows.**
// `USING` filters the rows the statement can see, so a crew member's DELETE
// returns success with nothing deleted. Asserting `error !== null` would fail
// on a correct policy. Every negative assertion below therefore VERIFIES THE
// ROW WITH THE SERVICE ROLE afterwards — the address is still there, and still
// says what it said. INSERT is the exception: `WITH CHECK` genuinely raises.
//
// ---------------------------------------------------------------------------
// FAILING-THEN-PASSING EVIDENCE
// ---------------------------------------------------------------------------
// Run against the database BEFORE the migration, the four `refuses` tests FAIL
// — crew and sub can insert, update and delete. After `supabase db push` they
// pass and the `permits` tests still pass. That transcript is the evidence the
// ruling asked for and is recorded in the commit message.
//
// Fixtures are created and destroyed by this file with the SERVICE ROLE, so it
// depends on no seeded contact and leaves nothing behind.

const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';

const STAMP = 'S121-floor';

let companyId: string;
let contactId: string;
let sessions: Record<string, SupabaseClient>;

/** A fresh address row on the fixture contact. Service role — bypasses RLS. */
async function seedAddress(label: string): Promise<string> {
  const { data, error } = await admin
    .from('contact_addresses')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      address_line1: label,
      city: 'Testville',
      state: 'TX',
      zip: '75001',
    })
    .select('id')
    .single();
  if (error) throw new Error(`seedAddress: ${error.message}`);
  return data.id;
}

async function readAddress(id: string) {
  const { data } = await admin
    .from('contact_addresses')
    .select('id, address_line1')
    .eq('id', id)
    .maybeSingle();
  return data;
}

beforeAll(async () => {
  assertRebuildTest();

  const owner = await sessionFor(OWNER);
  const { data: profile } = await owner
    .from('profiles')
    .select('company_id')
    .eq('user_id', (await owner.auth.getUser()).data.user!.id)
    .single();
  companyId = profile!.company_id;

  const { data: contact, error } = await admin
    .from('contacts')
    .insert({
      company_id: companyId,
      first_name: STAMP,
      last_name: 'Fixture',
      contact_type: 'client',
    })
    .select('id')
    .single();
  if (error) throw new Error(`fixture contact: ${error.message}`);
  contactId = contact.id;

  sessions = {
    owner,
    project_manager: await sessionFor(PM),
    foreman: await sessionFor(FOREMAN),
    crew_member: await sessionFor(CREW),
    subcontractor: await sessionFor(SUB),
  };
}, 240_000);

afterAll(async () => {
  if (!contactId) return;
  await admin.from('contact_addresses').delete().eq('contact_id', contactId);
  await admin.from('contacts').delete().eq('id', contactId);
});

// ---------------------------------------------------------------------------
// INSERT — WITH CHECK, so a refusal genuinely RAISES.
// ---------------------------------------------------------------------------
describe('contact_addresses INSERT', () => {
  for (const role of ['crew_member', 'subcontractor', 'foreman'] as const) {
    it(`refuses ${role}`, async () => {
      // ⚠️ EVERY NOT NULL COLUMN IS SUPPLIED — `state` and `zip` are NOT
      // NULL on this table, and omitting them made the FIRST draft of this
      // harness "pass" for crew and sub against the UNFLOORED policy: the
      // insert was failing on a CHECK, not on a permission. The paired
      // `permits owner` test is what exposed it, which is the entire reason
      // every verb here is a pair rather than an absence assertion.
      const { error } = await sessions[role].from('contact_addresses').insert({
        contact_id: contactId,
        address_line1: `${STAMP} ${role} insert`,
        city: 'Testville',
        state: 'TX',
        zip: '75001',
      });
      expect(error, `${role} was allowed to INSERT an address`).not.toBeNull();

      // Belt and braces: nothing landed under any code path.
      const { data } = await admin
        .from('contact_addresses')
        .select('id')
        .eq('address_line1', `${STAMP} ${role} insert`);
      expect(data ?? []).toHaveLength(0);
    });
  }

  for (const role of ['owner', 'project_manager'] as const) {
    it(`permits ${role} — the floor must not refuse everybody`, async () => {
      const line = `${STAMP} ${role} insert ok`;
      const { data, error } = await sessions[role]
        .from('contact_addresses')
        .insert({
          contact_id: contactId,
          address_line1: line,
          city: 'Testville',
          state: 'TX',
          zip: '75001',
        })
        .select('id')
        .single();
      expect(error, `${role} was refused: ${error?.message}`).toBeNull();
      expect(data?.id).toBeTruthy();
    });
  }
});

// ---------------------------------------------------------------------------
// UPDATE — a refusal affects ZERO ROWS and returns no error. Verify the row.
// ---------------------------------------------------------------------------
describe('contact_addresses UPDATE', () => {
  for (const role of ['crew_member', 'subcontractor', 'foreman'] as const) {
    it(`refuses ${role}`, async () => {
      const original = `${STAMP} ${role} update target`;
      const id = await seedAddress(original);

      await sessions[role]
        .from('contact_addresses')
        .update({ address_line1: 'REWRITTEN BY A FIELD ROLE' })
        .eq('id', id);

      // THE ASSERTION IS ON THE ROW, not on the error — see the header.
      const row = await readAddress(id);
      expect(row?.address_line1, `${role} rewrote an address`).toBe(original);
    });
  }

  for (const role of ['owner', 'project_manager'] as const) {
    it(`permits ${role}`, async () => {
      const id = await seedAddress(`${STAMP} ${role} update ok`);
      const changed = `${STAMP} ${role} updated`;

      const { error } = await sessions[role]
        .from('contact_addresses')
        .update({ address_line1: changed })
        .eq('id', id);
      expect(error, `${role} was refused: ${error?.message}`).toBeNull();

      const row = await readAddress(id);
      expect(row?.address_line1, `${role}'s UPDATE matched zero rows`).toBe(changed);
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE — same zero-rows trap. This is the sharpest verb: contact_addresses
// has no is_deleted column, so a DELETE here is PERMANENT.
// ---------------------------------------------------------------------------
describe('contact_addresses DELETE', () => {
  for (const role of ['crew_member', 'subcontractor', 'foreman'] as const) {
    it(`refuses ${role}`, async () => {
      const id = await seedAddress(`${STAMP} ${role} delete target`);

      await sessions[role].from('contact_addresses').delete().eq('id', id);

      const row = await readAddress(id);
      expect(row, `${role} permanently deleted an address`).not.toBeNull();
    });
  }

  for (const role of ['owner', 'project_manager'] as const) {
    it(`permits ${role}`, async () => {
      const id = await seedAddress(`${STAMP} ${role} delete ok`);

      const { error } = await sessions[role].from('contact_addresses').delete().eq('id', id);
      expect(error, `${role} was refused: ${error?.message}`).toBeNull();

      const row = await readAddress(id);
      expect(row, `${role}'s DELETE matched zero rows`).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// SELECT — DELIBERATELY UNCHANGED. Asserted so a later "tidy-up" that floors
// SELECT by symmetry fails here rather than on M-36 in the field.
// ---------------------------------------------------------------------------
describe('contact_addresses SELECT is NOT floored', () => {
  for (const role of ['crew_member', 'subcontractor', 'foreman'] as const) {
    it(`${role} can still READ an address — M-36 renders it`, async () => {
      const id = await seedAddress(`${STAMP} ${role} read`);
      const { data, error } = await sessions[role]
        .from('contact_addresses')
        .select('id, address_line1')
        .eq('id', id)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.id, `${role} lost READ access — the ruling was about writes`).toBe(id);
    });
  }
});
