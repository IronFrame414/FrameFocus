/**
 * S153 — Module 2 (Contacts & CRM) audit probes. Pass 2 of the eleven-pass
 * system audit.
 *
 * ⚠️ WRITTEN TO ASSERT OPEN DEFECTS; INVERTED AT S154 AS THEY WERE FIXED.
 *
 * Pass 2 committed the evidence and not the fixes, so these tests asserted the
 * CURRENT (wrong) behaviour on purpose, each naming what a fix would look like.
 * Precedent: `s146-contract-services.live.ts` S146-C4, and pass 1's
 * `s151-m1-audit.live.ts` F2, duly inverted at S152.
 *
 * STATUS AT S154 — all four findings fixed:
 *   F1 ✅ INVERTED. M2-01: the roster floor now covers contact_addresses, and an
 *        ASSIGNED sub additionally sees the one site address their project
 *        points at (`20261006000000`). Fuller coverage: `s154-m2-fixes.live.ts`
 *        B1/B2.
 *   F2 ✅ INVERTED. M2-02: soft delete works and the row is restorable
 *        (`20261005000000`). Fuller coverage: S154 A1-A4.
 *   F3 ✅ INVERTED. M2-03: the row-count guard reached M2. S154 C1-C3.
 *   F4    unchanged — M2-04 was RULED no-constraint [Josh, S154]; a contact with
 *        no email must still save. The requirement moved to M9's invite path.
 *
 * Nothing here changes application code, a service, or the schema.
 *
 * ⚠️ Some tests run the REAL shipped services under real JWTs, because a probe
 * against PostgREST cannot see a service-layer defect — pass 1's lesson, paid
 * for once already.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

// REAL shipped M2 services.
import { deleteContact, updateContact } from '@/lib/services/contacts-client';

const MARKER = 'S153M2';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const CLIENT = 'josh+qa-client@worthprop.com';

let owner: SupabaseClient;
let pm: SupabaseClient;
let crew: SupabaseClient;
let sub: SupabaseClient;
let client: SupabaseClient;
let companyId: string;
let contactId: string;
let addressId: string;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function sweep(): Promise<void> {
  const { data: rows } = await admin
    .from('contacts').select('id').eq('first_name', MARKER);
  const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
  if (!ids.length) return;
  // contact_addresses.contact_id is ON DELETE CASCADE, but delete explicitly and
  // ERROR-CHECK it: an unchecked delete that quietly does nothing has cost this
  // audit real time three times now.
  const a = await admin.from('contact_addresses').delete().in('contact_id', ids);
  if (a.error) throw new Error(`sweep addresses: ${a.error.message}`);
  const c = await admin.from('contacts').delete().in('id', ids);
  if (c.error) throw new Error(`sweep contacts: ${c.error.message}`);
}

beforeAll(async () => {
  assertRebuildTest();
  [owner, pm, crew, sub, client] = await Promise.all([
    sessionFor(OWNER), sessionFor(PM), sessionFor(CREW), sessionFor(SUB), sessionFor(CLIENT),
  ]);

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Sabal Point Construction').single();
  companyId = company!.id;

  await sweep();

  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId, contact_type: 'client', status: 'active',
      first_name: MARKER, last_name: 'Probe',
      email: `${MARKER.toLowerCase()}@example.invalid`,
    })
    .select('id').single();
  must('contact', cErr);
  contactId = contact!.id;

  const { data: address, error: aErr } = await admin
    .from('contact_addresses')
    .insert({
      company_id: companyId, contact_id: contactId, is_primary: true,
      address_line1: `${MARKER} 1 Secret Lane`, city: 'Ridgefield', state: 'CT', zip: '06877',
    })
    .select('id').single();
  must('address', aErr);
  addressId = address!.id;
}, 240_000);

afterAll(async () => {
  await sweep();
}, 240_000);

// ============================================================================
// F1 — the S131 roster floor is applied to `contacts` and NOT to
//      `contact_addresses`.
// ============================================================================

describe('S153-F1 — the roster floor stops at the contact and not at its address', () => {
  it('F1a — a SUBCONTRACTOR is correctly floored out of `contacts`', async () => {
    // The S131 Roster Visibility Floor, working as ruled. Establishes the
    // baseline the next test departs from — without it, F1b could be explained
    // as "subs can read everything anyway".
    const { data } = await sub.from('contacts').select('id').eq('id', contactId);
    expect(data, 'a subcontractor can read contacts — the S131 floor has regressed').toEqual([]);
  });

  it('F1b — ⚠️ but the SAME subcontractor CAN read that contact\'s street address', async () => {
    // `contact_addresses_select_authenticated` is `company_id = get_my_company_id()`
    // with NO role floor, while `contacts_select_authenticated` excludes
    // subcontractor and client. The name is withheld and the address is not.
    //
    // ✅ INVERTED [S154]. The fixture contact has no project, so this sub has no
    // assignment reaching it — the B2 grant does not apply and the floor bites.
    const { data } = await sub
      .from('contact_addresses')
      .select('address_line1, city, state, zip')
      .eq('id', addressId);

    expect(
      data,
      'the subcontractor can still read an unassigned address — M2-01 has regressed'
    ).toEqual([]);
  });

  it('F1c — and so can a CLIENT, who is floored out of contacts entirely', async () => {
    // S131 gives `client` NO contacts at all. Addresses are a wider grant to the
    // role the floor was strictest about.
    const { data: contacts } = await client.from('contacts').select('id').eq('id', contactId);
    expect(contacts, 'a client can read contacts — the S131 floor has regressed').toEqual([]);

    // ✅ INVERTED [S154]. A client gets NO addresses under any circumstance —
    // the B2 grant is assignment-scoped and clients hold no assignments.
    const { data: addrs } = await client
      .from('contact_addresses').select('address_line1').eq('id', addressId);
    expect(addrs, 'a client can still read contact addresses — M2-01 has regressed').toEqual([]);
  });

  it('F1d — the exposure is COMPANY-WIDE, not one row: a sub reads every address', async () => {
    // Scopes the finding. One readable row could be an artefact of the fixture;
    // the whole table is the actual shape.
    // ✅ INVERTED [S154]. Was "the sub sees every company address". Now the sub
    // sees only addresses reached by an assignment — strictly fewer than all,
    // and this fixture creates none for them.
    const { data } = await sub.from('contact_addresses').select('id');
    const { data: all } = await admin
      .from('contact_addresses').select('id').eq('company_id', companyId);
    expect(
      (data ?? []).length,
      'the subcontractor still sees every company address — M2-01 has regressed'
    ).toBeLessThan((all ?? []).length);
  });
});

// ============================================================================
// F2 — SOFT DELETE IS IMPOSSIBLE on `contacts` and `subcontractors`.
//      Not "irreversible" — impossible. The write is refused for every role.
// ============================================================================

describe('S153-F2 — a contact cannot be deleted at all', () => {
  it('F2a — deleteContact() FAILS for the OWNER with a raw RLS error', async () => {
    // ⚠️ THIS IS NOT THE FINDING I SET OUT TO WRITE. The hypothesis was that a
    // soft-deleted contact becomes unreadable and therefore unrestorable.
    // Probing it showed something worse: the soft delete never happens.
    //
    // MECHANISM. `contacts_select_authenticated` carries `AND is_deleted = false`,
    // against CLAUDE.md's trash-bin rule ("RLS policies do not filter on
    // is_deleted … a restore-from-trash flow must be able to read soft-deleted
    // rows"). PostgREST's UPDATE returns rows, so the NEW row must still satisfy
    // the SELECT policy — and a row with `is_deleted = true` cannot. Postgres
    // answers "new row violates row-level security policy".
    //
    // Isolated column by column: as Owner, `last_name`, `status` and even
    // `deleted_at` all write fine. ONLY `is_deleted = true` is refused.
    //
    // ⚠️ ASSERTS THE DEFECT. When fixed, invert to expect success.
    const { data: probe, error: pErr } = await admin
      .from('contacts')
      .insert({
        company_id: companyId, contact_type: 'client', status: 'active',
        first_name: MARKER, last_name: 'Deletable',
      })
      .select('id').single();
    must('probe contact', pErr);

    state.client = owner;
    const result = await deleteContact(probe!.id);

    // ✅ INVERTED [S154]. Was: refused with a raw RLS error for every role.
    expect(result.success, `deleteContact still fails: ${result.error}`).toBe(true);

    const { data: after } = await admin
      .from('contacts').select('is_deleted').eq('id', probe!.id).single();
    expect(after!.is_deleted, 'the soft delete did not happen').toBe(true);
  });

  it('F2b — deleteSubcontractor() is broken the SAME way, so this is a pattern', async () => {
    // `subcontractors_select_authenticated` also filters `is_deleted = false`,
    // and `subcontractors-client.ts` soft-deletes identically. Two tables, one
    // cause — which is what makes this a convention violation rather than a
    // one-off.
    const { data: sc, error: sErr } = await admin
      .from('subcontractors')
      .insert({ company_id: companyId, company_name: `${MARKER} Subco`, sub_type: 'subcontractor' })
      .select('id').single();
    must('probe subcontractor', sErr);

    const { error } = await owner
      .from('subcontractors')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', sc!.id);

    // ✅ INVERTED [S154]. Was: refused identically to contacts.
    expect(error, `subcontractor soft delete still fails: ${error?.message}`).toBeNull();

    await admin.from('subcontractors').delete().eq('id', sc!.id);
  });

  it('F2c — `contact_addresses` does it CORRECTLY, so this is inconsistency', async () => {
    // Its SELECT policy is `company_id = get_my_company_id()` with NO is_deleted
    // filter — exactly what the convention requires. Same module, opposite
    // answer. That is what rules out "deliberate design".
    const { error } = await owner
      .from('contact_addresses')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', addressId);
    expect(error, 'contact_addresses now refuses soft delete too — re-read F2').toBeNull();

    // And the soft-deleted address is still READABLE, so a restore is possible.
    const { data } = await owner
      .from('contact_addresses').select('id, is_deleted').eq('id', addressId);
    expect(data, 'the soft-deleted address is unreadable — the convention broke here too')
      .toHaveLength(1);

    must('restore address', (await admin
      .from('contact_addresses')
      .update({ is_deleted: false, deleted_at: null })
      .eq('id', addressId)).error);
  });

  it('F2d — ✅ INVERTED [S154]: a soft-deleted contact now EXISTS', async () => {
    // ⚠️ THIS TEST'S PREMISE IS OBSOLETE, AND THAT IS THE POINT. It was
    // corroboration FOR the defect: a count, not a code path — if the feature had
    // ever worked, some row would carry is_deleted = true, and 0 of 22 did.
    //
    // It is inverted rather than deleted because the count is still the honest
    // check. F2a above just soft-deleted one through the shipped service, so at
    // least one must be here. If this returns empty again, the delete silently
    // stopped working and F2a is passing on something other than a real write.
    const { data } = await admin.from('contacts').select('id').eq('is_deleted', true);
    expect(
      (data ?? []).length,
      'no soft-deleted contact exists — F2a did not actually delete anything'
    ).toBeGreaterThan(0);
  });
});

// ============================================================================
// F3 — M2's UPDATE-shaped writers carry no row-count guard. M1-01, one module on.
// ============================================================================

describe('S153-F3 — a discarded write is reported as success', () => {
  it('F3a — updateContact() returns success for a caller RLS refuses', async () => {
    // `contacts_update_authorized` admits owner/admin/project_manager only, so a
    // crew member is refused — and `updateContact` checks `error` and nothing
    // else. Identical to M1-01, which S152 fixed in company-client.ts; the same
    // helper was never brought here.
    //
    // ⚠️ ASSERTS THE DEFECT. When guarded, invert to expect success === false.
    state.client = crew;
    const result = await updateContact(contactId, { last_name: 'Overwritten' });

    // ✅ INVERTED [S154]. Was: reported success over a write RLS discarded.
    expect(result.success, 'updateContact still reports success for crew').toBe(false);

    // And nothing moved, which is what makes the report a lie.
    const { data } = await admin
      .from('contacts').select('last_name').eq('id', contactId).single();
    expect(data!.last_name).toBe('Probe');
  });

  it('F3b — deleteContact() likewise: "deleted" over a contact that is still there', async () => {
    // The worse of the two. The user believes the contact is in the trash.
    state.client = crew;
    const result = await deleteContact(contactId);

    // ✅ INVERTED [S154]. Was the perverse half: crew told "deleted", Owner
    // given a raw RLS error. Both are correct now.
    expect(result.success, 'deleteContact still reports success for crew').toBe(false);

    const { data } = await admin
      .from('contacts').select('is_deleted').eq('id', contactId).single();
    expect(data!.is_deleted, 'the contact really was deleted — re-read F3b').toBe(false);
  });

  it('F3c — the same calls SUCCEED for an Owner, so F3a/F3b are not vacuous', async () => {
    // Without this, F3a/F3b pass on a service that fails for everybody — the
    // vacuous-pass shape the M9 audit found and pass 1 was told to hunt.
    state.client = owner;
    const result = await updateContact(contactId, { last_name: 'OwnerWrote' });
    expect(result.success).toBe(true);

    const { data } = await admin
      .from('contacts').select('last_name').eq('id', contactId).single();
    expect(data!.last_name, 'the Owner could not write either — F3c proves nothing').toBe('OwnerWrote');

    must('restore', (await admin
      .from('contacts').update({ last_name: 'Probe' }).eq('id', contactId)).error);
  });
});

// ============================================================================
// F4 — contacts.email is nullable and required nowhere.
// ============================================================================

describe('S153-F4 — a contact with no email is accepted by every layer', () => {
  it('F4a — the database accepts a client contact with a NULL email', async () => {
    // No NOT NULL, no CHECK. 22 of 22 live rows happen to have one, which is the
    // "true by luck" shape: theoretical today, load-bearing the moment a send
    // path or M9 depends on it.
    const { data, error } = await admin
      .from('contacts')
      .insert({
        company_id: companyId, contact_type: 'client', status: 'active',
        first_name: MARKER, last_name: 'NoEmail', email: null,
      })
      .select('id, email').single();

    expect(error, 'a NULL email was refused — F4 may be fixed; if so, invert this').toBeNull();
    expect(data!.email).toBeNull();
  });

  it('F4b — and so does the OWNER through RLS, not just the service role', async () => {
    // The service role bypasses RLS, so F4a alone does not establish that a real
    // user can create one. This does.
    const { error } = await owner
      .from('contacts')
      .insert({
        company_id: companyId, contact_type: 'client', status: 'active',
        first_name: MARKER, last_name: 'NoEmailOwner', email: null,
      });
    expect(error, 'RLS or a constraint refused it — F4 may be fixed').toBeNull();
  });
});
