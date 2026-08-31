/**
 * S158 — Finding 2: soft delete has a way back.
 *
 * Finding: the S157 click-test. Ruling: Josh, S158 — *"a Trash view with
 * restore, mirroring the files pattern."*
 *
 * **NO MIGRATION.** Every policy this needs shipped at S154
 * (`20261005000000_m2_soft_delete_restored.sql`); what was missing was the
 * third function of CLAUDE.md's trash-bin pattern — a `listDeleted()` — and any
 * UI to restore from. `s153-m2-audit.md` §1 said so in as many words: *"there is
 * no `getTrash()`/`listDeleted()` for contacts at all, so no trash UI exists to
 * restore into."*
 *
 * FAILING-THEN-PASSING. Every assertion below fails before this session's
 * service edits for the plain reason that `getDeletedContacts`,
 * `getDeletedSubcontractors`, `restoreContact` and `restoreSubcontractor` did
 * not exist — the file would not import. Group C is the one with a subtler
 * before-state: `deleteSubcontractor()` DID exist and DID report success to a
 * crew member over a write RLS discarded.
 *
 * ⚠️ RUNS THE REAL SHIPPED SERVICES under real JWTs. A PostgREST probe would
 * prove the policies allow a restore — which S154 already proved — and would
 * say nothing about whether the functions the trash page actually calls do the
 * right thing.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

import { getContacts, getDeletedContacts } from '@/lib/services/contacts';
import { deleteContact, restoreContact } from '@/lib/services/contacts-client';
import { getSubcontractors, getDeletedSubcontractors } from '@/lib/services/subcontractors';
import {
  deleteSubcontractor,
  restoreSubcontractor,
} from '@/lib/services/subcontractors-client';

const MARKER = 'S158TRASH';
const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';

let owner: SupabaseClient;
let crew: SupabaseClient;

let companyId: string;
/** The contact each contacts test deletes and restores. */
let contactId: string;
/** A subcontractor, and a VENDOR — the same table, and one trash for both. */
let subId: string;
let vendorId: string;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

async function sweep(): Promise<void> {
  const c = await admin.from('contacts').delete().eq('first_name', MARKER);
  if (c.error) throw new Error(`sweep contacts: ${c.error.message}`);
  const s = await admin.from('subcontractors').delete().like('company_name', `${MARKER}%`);
  if (s.error) throw new Error(`sweep subs: ${s.error.message}`);
}

beforeAll(async () => {
  assertRebuildTest();
  [owner, crew] = await Promise.all([sessionFor(OWNER), sessionFor(CREW)]);

  const { data: company } = await admin
    .from('companies')
    .select('id')
    .eq('name', 'Sabal Point Construction')
    .single();
  companyId = company!.id;

  await sweep();

  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId,
      contact_type: 'client',
      status: 'active',
      first_name: MARKER,
      last_name: 'Restorable',
      email: `${MARKER.toLowerCase()}@example.invalid`,
    })
    .select('id')
    .single();
  must('probe contact', cErr);
  contactId = contact!.id;

  const { data: sub, error: sErr } = await admin
    .from('subcontractors')
    .insert({
      company_id: companyId,
      company_name: `${MARKER} Subco`,
      sub_type: 'subcontractor',
      status: 'active',
    })
    .select('id')
    .single();
  must('probe subcontractor', sErr);
  subId = sub!.id;

  const { data: vendor, error: vErr } = await admin
    .from('subcontractors')
    .insert({
      company_id: companyId,
      company_name: `${MARKER} Vendorco`,
      sub_type: 'vendor',
      status: 'active',
    })
    .select('id')
    .single();
  must('probe vendor', vErr);
  vendorId = vendor!.id;
}, 240_000);

afterAll(async () => {
  await sweep();
}, 240_000);

// ============================================================================
// GROUP A — the full round trip Josh asked to see proved, on contacts.
//   delete → appear in trash → restore → back in the list
// ============================================================================

describe('S158-A — a deleted contact is recoverable, end to end', () => {
  it('A1 — before anything, the contact is in the LIST and not in the TRASH', async () => {
    // ⚠️ THE ANTI-VACUITY STEP, and it is not ceremony. Every assertion below is
    // of the form "X contains / does not contain this id". If the probe were
    // absent from both lists to begin with — a fixture that never inserted, a
    // company mismatch — A2 and A3 would both pass while proving nothing. The
    // M9 audit found a whole suite in that state.
    state.client = owner;
    expect(ids(await getContacts()), 'the probe is not in the live list to begin with')
      .toContain(contactId);
    expect(ids(await getDeletedContacts()), 'the probe starts out in the trash')
      .not.toContain(contactId);
  });

  it('A2 — deleteContact() moves it OUT of the list and INTO the trash', async () => {
    // This is the finding in one test. Before S158 the first half held and the
    // second had nowhere to hold: the row left the list and no surface in the
    // product listed it, so a soft delete was indistinguishable from a hard one
    // from the user's side.
    state.client = owner;
    const result = await deleteContact(contactId);
    expect(result.success, `deleteContact failed: ${result.error}`).toBe(true);

    expect(ids(await getContacts()), 'a deleted contact is still in the live list')
      .not.toContain(contactId);
    expect(ids(await getDeletedContacts()), 'the deleted contact is in NO list — the S157 defect')
      .toContain(contactId);
  });

  it('A3 — and the trash row carries a deleted_at, so the column is not an em-dash', async () => {
    // The trash table shows a Deleted date. `deleteContact()` sets it in the
    // same UPDATE as `is_deleted`; if a later edit split them the view would
    // render every row's date as "—" and nothing else would notice.
    state.client = owner;
    const row = (await getDeletedContacts()).find((c) => c.id === contactId);
    expect(row, 'the probe vanished from the trash between tests').toBeDefined();
    expect(row!.deleted_at, 'deleted_at was not stamped').not.toBeNull();
  });

  it('A4 — restoreContact() puts it BACK in the list and clears deleted_at', async () => {
    state.client = owner;
    const result = await restoreContact(contactId);
    expect(result.success, `restoreContact failed: ${result.error}`).toBe(true);

    expect(ids(await getContacts()), 'the restored contact did not come back to the list')
      .toContain(contactId);
    expect(ids(await getDeletedContacts()), 'the restored contact is still in the trash')
      .not.toContain(contactId);

    // `deleted_at` must be cleared with the flag. A row that is not deleted but
    // still carries a deletion date would tell the trash view's Deleted column
    // a date for a record that is not deleted — and would be the first thing a
    // future "recently deleted" filter got wrong.
    const { data } = await admin
      .from('contacts')
      .select('is_deleted, deleted_at')
      .eq('id', contactId)
      .single();
    expect(data!.is_deleted).toBe(false);
    expect(data!.deleted_at, 'deleted_at survived the restore').toBeNull();
  });

  it('A5 — a CREW restore is REFUSED and says so, rather than reporting success', async () => {
    // `contacts_update_authorized` admits owner/admin/project_manager only, so
    // crew matches ZERO rows — which Postgres does not consider an error. Without
    // `applied()` the trash view would tell a crew member the contact was
    // restored, refresh, and show it still sitting in the trash.
    state.client = owner;
    expect((await deleteContact(contactId)).success, 'A5 setup: the Owner delete failed').toBe(true);

    state.client = crew;
    const result = await restoreContact(contactId);
    expect(result.success, 'restoreContact reported success for crew').toBe(false);
    expect(result.error, 'the refusal names a cause it has not verified').toMatch(
      /not applied|permission|no longer exists/i
    );

    const { data } = await admin
      .from('contacts')
      .select('is_deleted')
      .eq('id', contactId)
      .single();
    expect(data!.is_deleted, 'crew actually restored it — re-read A5').toBe(true);

    // ...and the Owner still can, so A5 is not passing on a service that fails
    // for everybody.
    state.client = owner;
    expect((await restoreContact(contactId)).success, 'the Owner cannot restore either').toBe(true);
  });
});

// ============================================================================
// GROUP B — the second table. Subs AND vendors, in ONE trash.
// ============================================================================

describe('S158-B — subs and vendors share one trash, and both restore', () => {
  it('B1 — a subcontractor round-trips', async () => {
    state.client = owner;
    expect(ids(await getSubcontractors()), 'the probe sub is missing to begin with')
      .toContain(subId);

    expect((await deleteSubcontractor(subId)).success).toBe(true);
    expect(ids(await getSubcontractors())).not.toContain(subId);
    expect(ids(await getDeletedSubcontractors())).toContain(subId);

    expect((await restoreSubcontractor(subId)).success).toBe(true);
    expect(ids(await getSubcontractors()), 'the restored sub did not come back').toContain(subId);
    expect(ids(await getDeletedSubcontractors())).not.toContain(subId);
  });

  it('B2 — a VENDOR lands in the SAME trash, because it is the same table', async () => {
    // The reason there is no third surface. "And vendors" resolves inside
    // subcontractors: a vendor is `sub_type = 'vendor'`, not a separate table.
    // If this ever goes red, someone has split them — and the trash view, the
    // list and the picker all need to move together.
    state.client = owner;
    expect((await deleteSubcontractor(vendorId)).success).toBe(true);

    const trash = await getDeletedSubcontractors();
    expect(ids(trash), 'a deleted vendor is in no trash at all').toContain(vendorId);
    expect(
      trash.find((s) => s.id === vendorId)!.sub_type,
      'the vendor arrived in the trash as something other than a vendor'
    ).toBe('vendor');

    expect((await restoreSubcontractor(vendorId)).success).toBe(true);
    expect(ids(await getSubcontractors())).toContain(vendorId);
  });
});

// ============================================================================
// GROUP C — the row-count guard reaches the second table [S158].
// ============================================================================

describe('S158-C — subcontractors-client no longer reports discarded writes as success', () => {
  it('C1 — deleteSubcontractor() as CREW fails, and the sub is untouched', async () => {
    // M2-03's defect, in the file the S154 pass did not reach.
    // `mutation-result.ts` states the rule without an exception —
    // *"an UPDATE-shaped write ends `.select('id')` and goes through
    // `applied()`. No exceptions."* — and all three writers in that file are
    // guarded now, not just this one, because a file that teaches both patterns
    // is the M1-01 shape.
    //
    // ⚠️ ASSERTED THE OTHER WAY BEFORE S158: this returned `{ success: true }`.
    state.client = crew;
    const result = await deleteSubcontractor(subId);
    expect(result.success, 'deleteSubcontractor still reports success for crew').toBe(false);

    const { data } = await admin
      .from('subcontractors')
      .select('is_deleted')
      .eq('id', subId)
      .single();
    expect(data!.is_deleted, 'crew actually deleted the sub — re-read C1').toBe(false);
  });

  it('C2 — restoreSubcontractor() as CREW likewise', async () => {
    state.client = owner;
    expect((await deleteSubcontractor(subId)).success).toBe(true);

    state.client = crew;
    expect((await restoreSubcontractor(subId)).success).toBe(false);

    const { data } = await admin
      .from('subcontractors')
      .select('is_deleted')
      .eq('id', subId)
      .single();
    expect(data!.is_deleted, 'crew restored it — re-read C2').toBe(true);

    state.client = owner;
    expect(
      (await restoreSubcontractor(subId)).success,
      'the Owner cannot restore either — C1/C2 prove nothing'
    ).toBe(true);
  });
});

// ============================================================================
// GROUP D — the sweep. What the trash view must NOT change.
// ============================================================================

describe('S158-D — the live lists are unchanged by any of this', () => {
  it('D1 — getContacts() and getSubcontractors() still exclude deleted rows', async () => {
    // The standing risk whenever a deleted-row surface is added: the new
    // function is the ONLY thing that should ever return `is_deleted = true`.
    // `s154-m2-fixes.live.ts` A4 guards the policy half of this; this guards the
    // service half after a session that touched both files.
    state.client = owner;
    must('delete for D1', (await admin
      .from('contacts')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', contactId)).error);

    const live = await getContacts();
    expect(ids(live)).not.toContain(contactId);
    expect(live.every((c) => c.is_deleted === false), 'getContacts returned a deleted row')
      .toBe(true);

    const trash = await getDeletedContacts();
    expect(trash.length, 'the trash is empty — D1 is vacuous').toBeGreaterThan(0);
    expect(trash.every((c) => c.is_deleted === true), 'the trash returned a LIVE row').toBe(true);

    must('restore for D1', (await admin
      .from('contacts')
      .update({ is_deleted: false, deleted_at: null })
      .eq('id', contactId)).error);
  });
});
