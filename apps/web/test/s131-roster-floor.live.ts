import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { resolveThread } from '@/lib/chat/threads';
import { insertMessage, recentMessages } from '@/lib/chat/messages';

// ============================================================================
// RULING B [Josh, S131] — the roster visibility floor, driven against RLS.
// Migration: 20260911000000_roster_visibility_floor.sql
// ============================================================================
//
// | Role          | Team roster            | Contacts | Subs & Vendors |
// | subcontractor | Owner, Admin, PM only  | None     | None           |
// | client        | None                   | None     | None           |
//
// ⚠️ THESE RUN AS REAL USERS, NOT AS `postgres`. Every client below is an
// anon-key client carrying a real user JWT, so RLS applies exactly as it does
// in the app. A probe run as the service role would read everything and prove
// nothing — and the same trap in reverse is why the counterfactuals at the end
// are evaluated with `admin`, OUTSIDE the policy they are testing.

const OWNER = 'josh+test50@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const CLIENT = 'josh+qa-client@worthprop.com';
const PROJECT_QA_A = '4a4f8567-67f8-4394-baae-181229974bd9';

let ownerC: SupabaseClient<Database>;
let subC: SupabaseClient<Database>;
let clientC: SupabaseClient<Database>;

type RosterTable = 'contacts' | 'subcontractors' | 'company_members' | 'profiles';

/**
 * Rows a caller can actually SELECT. `head: true` so nothing is transferred.
 *
 * The client is deliberately the UNTYPED `SupabaseClient` here: a table name
 * that varies at runtime makes the generated `Database` generic resolve every
 * table's row type at once, which is `TS2589: Type instantiation is excessively
 * deep`. What this helper asserts is an RLS outcome, not a column shape, so the
 * generic buys nothing — the typed clients are still used everywhere a row's
 * fields are actually read.
 */
async function count(client: SupabaseClient, table: RosterTable): Promise<number> {
  const { count: n, error } = await client.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}

beforeAll(async () => {
  assertRebuildTest();
  [ownerC, subC, clientC] = (await Promise.all([
    sessionFor(OWNER),
    sessionFor(SUB),
    sessionFor(CLIENT),
  ])) as SupabaseClient<Database>[];
});

afterAll(async () => {
  await admin.from('chat_threads').delete().eq('project_id', PROJECT_QA_A);
});

describe('the subcontractor', () => {
  it('⚠️ reads ZERO contacts and ZERO subcontractors', async () => {
    expect(await count(subC, 'contacts'), 'a sub read a contact').toBe(0);
    expect(await count(subC, 'subcontractors'), 'a sub read a subcontractor record').toBe(0);
  });

  it('reads ONLY Owner, Admin and PM from the team roster — plus their own row', async () => {
    const { data } = await subC.from('profiles').select('email, role');
    const roles = (data ?? []).map((r) => r.role).sort();

    // Named rather than counted. A count passes on the wrong four rows.
    expect(roles).toEqual(['admin', 'owner', 'project_manager', 'subcontractor']);
    expect((data ?? []).some((r) => r.email === SUB), 'own row must stay readable').toBe(true);
    // The floor, stated as the absence it is: nobody below PM, ever.
    expect((data ?? []).filter((r) => ['foreman', 'crew_member', 'client'].includes(r.role))).toEqual([]);
  });

  it('the OPERATIONAL roster is floored too — /m/team reads a different table', async () => {
    // company_members, not profiles. Flooring one closes one surface, and this
    // is the one a sub actually reaches on a phone.
    const { data } = await subC.from('company_members').select('id, profile_id');
    expect((data ?? []).length).toBeGreaterThan(0); // their own row at minimum
    expect((data ?? []).length).toBeLessThan(45); // the Owner's view, asserted below
  });

  it('keeps their OWN member row — punch authoring depends on it', async () => {
    // `punch-client.ts:getMyMemberId()` reads company_members directly rather
    // than through the SECURITY DEFINER helper. Without this row a sub cannot
    // create or complete a punch item at all.
    const { data: me } = await subC.from('profiles').select('id').eq('email', SUB).single();
    const { data: member } = await subC
      .from('company_members')
      .select('id')
      .eq('profile_id', (me as { id: string }).id)
      .maybeSingle();
    expect(member, 'the sub lost their own member row').not.toBeNull();
  });
});

describe('the client', () => {
  it('⚠️ reads NOTHING from any of the three, and still sees itself', async () => {
    expect(await count(clientC, 'contacts')).toBe(0);
    expect(await count(clientC, 'subcontractors')).toBe(0);
    expect(await count(clientC, 'company_members')).toBe(0);

    const { data } = await clientC.from('profiles').select('email, role');
    expect(data ?? []).toHaveLength(1);
    expect((data ?? [])[0].email).toBe(CLIENT);
  });

  it('own row is NOT a softening of the ruling — it is what makes it survivable', async () => {
    // Both layouts read `profiles` keyed on the caller. A client who cannot
    // read their own row cannot load the placeholder Ruling A redirects them
    // to: the layout finds no profile, redirects to /sign-in, and loops.
    const { data } = await clientC.from('profiles').select('id, role, company_id').single();
    expect(data!.role).toBe('client');
    expect(data!.company_id).not.toBeNull();
  });
});

describe('the Owner is untouched — the paired positive', () => {
  it('still reads all four tables in full', async () => {
    // Without this, a policy that denied EVERYONE would pass every test above.
    expect(await count(ownerC, 'contacts')).toBeGreaterThan(0);
    expect(await count(ownerC, 'subcontractors')).toBeGreaterThan(0);
    expect(await count(ownerC, 'company_members')).toBeGreaterThan(10);

    const { data } = await ownerC.from('profiles').select('role');
    const roles = new Set((data ?? []).map((r) => r.role));
    // Explicitly the roles a SUB cannot see — proof the floor is role-scoped
    // rather than a blanket narrowing of the table.
    expect(roles.has('crew_member')).toBe(true);
    expect(roles.has('client')).toBe(true);
  });
});

describe('⚠️ the counterfactual, evaluated OUTSIDE the policy it tests', () => {
  it('the rows the sub cannot see DO exist — the zeroes are refusals, not an empty table', async () => {
    // A count of 0 read through the policy is worthless on its own: an empty
    // table gives the same answer as a working floor. The service role is the
    // only witness that can tell them apart, and it is the same mistake ND-19
    // caught when a counterfactual was evaluated under the policy it was
    // trying to bypass.
    const { data: me } = await admin.from('profiles').select('company_id').eq('email', SUB).single();
    const companyId = (me as { company_id: string }).company_id;

    const { count: realContacts } = await admin
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_deleted', false);
    const { count: realSubs } = await admin
      .from('subcontractors')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('is_deleted', false);

    expect(realContacts ?? 0, 'fixture has no contacts — the test proves nothing').toBeGreaterThan(0);
    expect(realSubs ?? 0, 'fixture has no subs — the test proves nothing').toBeGreaterThan(0);
    expect(await count(subC, 'contacts')).toBe(0);
    expect(await count(subC, 'subcontractors')).toBe(0);
  });
});

describe("slice 4's sub thread still works — the ruling must not have broken chat", () => {
  it('a subcontractor still reads AND posts in their own project sub thread', async () => {
    // The named constraint. `postableSet()` runs as admin by design, so the
    // mention picker was never at risk — but posting and reading run as the
    // CALLER, and they are what would break if the floor reached too far.
    const thread = await resolveThread(subC, PROJECT_QA_A, 'sub');
    expect(thread, 'the sub lost their own sub thread').not.toBeNull();

    // The author is a PROFILE id, not a user id, and the sub reads their own
    // profile row to get it — which the own-row carve-out is what preserves.
    const { data: mine } = await subC.from('profiles').select('id').eq('email', SUB).single();

    const body = `s131 roster floor ${Date.now()}`;
    const sent = await insertMessage(subC, {
      threadId: thread!.id,
      authorProfileId: (mine as { id: string }).id,
      body,
    });
    expect(sent.success, `sub could not post: ${sent.error ?? ''}`).toBe(true);

    const rows = await recentMessages(subC, thread!.id, 25);
    expect(rows.some((m) => m.body === body), 'the sub cannot read what they just posted').toBe(true);
  });
});
