/**
 * S155 — Module 3 (Document & File Management) audit probes. Pass 3 of 11.
 *
 * ⚠️ ASSERTS DEFECTS THAT ARE STILL OPEN. Tests that describe current wrong
 * behaviour say so and name what a fix looks like, so they are INVERTED rather
 * than deleted when Josh rules. Precedent: `s151` F2 (inverted at S152),
 * `s153` F1-F3 (inverted at S154).
 *
 * No application code, service or schema is changed by this pass.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

import { toggleFavorite, updateFile } from '@/lib/services/files-client';

const MARKER = 'S155M3';
const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const BUCKET = 'project-files';

let owner: SupabaseClient;
let crew: SupabaseClient;
let companyId: string;

/** An existing `invoices` file on a project the crew member IS assigned to. */
let invoiceFileId: string;
let invoiceFilePath: string;
/** A `photos` file on the same project — crew may see this one. */
let photoFileId: string;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

beforeAll(async () => {
  assertRebuildTest();
  [owner, crew] = await Promise.all([sessionFor(OWNER), sessionFor(CREW)]);

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Sabal Point Construction').single();
  companyId = company!.id;

  // An `invoices` file whose project the crew member is assigned to. Chosen from
  // EXISTING seeded data rather than fabricated: the point of M3-01 is that it is
  // reachable today, and a fixture built to order would not establish that.
  //
  // ORDERED — `.limit(1)` on heap order is the class this repo has hit five
  // times; `id` is the tiebreak because seeded rows share timestamps.
  const { data: inv } = await admin
    .from('files')
    .select('id, file_path, project_id')
    .eq('category', 'invoices').eq('is_deleted', false)
    .order('id', { ascending: true });

  const { data: crewProfile } = await admin
    .from('profiles').select('id').eq('email', CREW).single();
  const { data: crewMember } = await admin
    .from('company_members').select('id').eq('profile_id', crewProfile!.id)
    .order('id', { ascending: true }).limit(1).single();

  let chosen: { id: string; file_path: string; project_id: string } | null = null;
  for (const f of (inv ?? []) as { id: string; file_path: string; project_id: string }[]) {
    const { data: a } = await admin
      .from('project_assignments').select('id')
      .eq('project_id', f.project_id).eq('member_id', crewMember!.id).eq('is_deleted', false);
    if ((a ?? []).length) { chosen = f; break; }
  }
  if (!chosen) {
    throw new Error(
      'No `invoices` file exists on a project this crew member is assigned to. ' +
      'M3-01 needs one to be reachable; re-scope the finding rather than fabricating it.'
    );
  }
  invoiceFileId = chosen.id;
  invoiceFilePath = chosen.file_path;

  const { data: photo } = await admin
    .from('files').select('id')
    .eq('project_id', chosen.project_id).eq('category', 'photos').eq('is_deleted', false)
    .order('id', { ascending: true }).limit(1).maybeSingle();
  photoFileId = photo?.id ?? '';
}, 240_000);

afterAll(async () => {
  // This pass creates no rows — it reads existing seeded data on purpose. The
  // only mutation is F2c's Owner write, which restores itself.
}, 240_000);

// ============================================================================
// M3-01 — the table and the bucket are two enforcement surfaces, and they
//         disagree about categories.
// ============================================================================

describe('S155-F1 — a crew member cannot SEE an invoice file row but CAN download its PDF', () => {
  it('F1a — the TABLE refuses the row, as the Financial Visibility Floor intends', async () => {
    // `files_select_non_client` excludes `contracts`, `change_orders` and
    // `invoices` from everyone below owner/admin — except a PM for invoices.
    const { data } = await crew.from('files').select('id').eq('id', invoiceFileId);
    expect(data, 'crew can read the invoice FILE ROW — the table floor has regressed').toEqual([]);
  });

  // ✅ INVERTED AT S157 — M3-01 IS FIXED. The originals asked for exactly this
  // ("when storage gains the category floor, invert to expect an error / null").
  // `20261007000000_m3_storage_alignment.sql` made the storage policy delegate
  // to `files` RLS via an EXISTS, so the category floor is stated once, on the
  // table, and the bytes follow the row.
  it('F1b — ✅ STORAGE now REFUSES the same crew member a signed URL [inverted]', async () => {
    const { data, error } = await crew.storage.from(BUCKET).createSignedUrl(invoiceFilePath, 60);

    expect(data?.signedUrl, 'crew minted an invoice URL — M3-01 has regressed').toBeFalsy();
    expect(error, 'storage allowed the mint').not.toBeNull();
  });

  it('F1c — ✅ there is no URL to serve, and the OWNER still gets one [inverted]', async () => {
    // ⚠️ NON-VACUITY. Storage answers "you may not" and "it is not there" with
    // the same error on purpose (anti-enumeration). So the refusal above is only
    // meaningful next to a caller who DOES get the bytes: the owner, on the very
    // same path.
    const { data: crewUrl } = await crew.storage.from(BUCKET).createSignedUrl(invoiceFilePath, 60);
    expect(crewUrl?.signedUrl).toBeFalsy();

    const { data: ownerUrl, error: ownerErr } = await owner.storage
      .from(BUCKET)
      .createSignedUrl(invoiceFilePath, 60);
    expect(ownerErr, 'the owner lost the invoice too — this over-tightened').toBeNull();
    const res = await fetch(ownerUrl!.signedUrl);
    expect(res.status, "the owner's signed URL did not serve the file").toBe(200);
    expect(Number(res.headers.get('content-length') ?? '0')).toBeGreaterThan(0);
  });

  it('F1d — the divergence is CATEGORY-shaped: the same crew member may see a photo row', async () => {
    // Scopes the finding. Crew is not blanket-denied files on this project —
    // `photos` is not in the excluded set, so the table returns it. What differs
    // between the two surfaces is the CATEGORY floor and nothing else.
    if (!photoFileId) return; // no photo on this project; nothing to compare.
    const { data } = await crew.from('files').select('id').eq('id', photoFileId);
    expect(data, 'crew cannot read a photo row either — re-scope M3-01').toHaveLength(1);
  });

  it('F1e — non-project-scoped paths fail CLOSED, which is why this is narrow', async () => {
    // `contracts`, `change_orders` and `lien_releases` store under
    // `{company}/contracts/…`, `{company}/change-orders/…` etc. Segment 2 is not
    // a uuid, the storage policy's regex fails and the CASE returns false. So the
    // leak does NOT extend to those categories — worth pinning, because a future
    // path change would silently widen it.
    const { data: co } = await admin
      .from('files').select('file_path')
      .eq('category', 'change_orders').eq('is_deleted', false)
      .order('id', { ascending: true }).limit(1).maybeSingle();
    if (!co) return;

    const { data, error } = await crew.storage.from(BUCKET).createSignedUrl(co.file_path, 60);
    expect(
      error ?? (data ? null : new Error('no url')),
      'crew signed a change-order path — the leak is wider than M3-01 records'
    ).not.toBeNull();
  });
});

// ============================================================================
// M3-02 — a signed URL is a bearer token and outlives the grant that minted it.
// ============================================================================

describe('S155-F2 — a signed URL keeps working after the access that minted it is revoked', () => {
  it('F2a — mint as crew, revoke the assignment, and the URL still serves', async () => {
    // Inherent to signed URLs rather than a coding error. RULED AT S157: two
    // hours, and accept the window (`SIGNED_URL_TTL_SECONDS`). Explicitly NOT
    // re-checking authorisation on use — that is a round trip on every photo
    // thumbnail to close a narrow risk. This test therefore still asserts
    // CURRENT, ACCEPTED behaviour and must keep passing.
    //
    // ⚠️ REPOINTED AT S157, AND THE REASON MATTERS. It used to mint the INVOICE
    // path. Since M3-01 the crew member cannot mint that at all, so the test
    // would have failed on its setup and looked like the TTL finding had
    // changed. It has not. The finding is about any file the caller COULD
    // legitimately open, so it now uses a `photos` row — the category crew is
    // still entitled to.
    //
    // ⚠️ A FIXTURE, BECAUSE THE SEEDED PHOTOS CANNOT CARRY THIS PROBE.
    // The crew member's assigned project holds 4 `photos` rows and ZERO storage
    // objects — dangling rows (105 objects against 108 rows overall, LIVE S157).
    // `createSignedUrl` fails on those with the SAME error as a policy refusal,
    // so a seeded photo would make this probe fail on its setup and look like
    // the TTL finding had changed. It has not.
    const { data: invFile } = await admin
      .from('files').select('project_id').eq('id', invoiceFileId).single();
    const projectId = (invFile as { project_id: string }).project_id;
    const fixturePath = `${companyId}/${projectId}/${MARKER}-f2a-ttl.pdf`;
    await admin.storage
      .from(BUCKET)
      .upload(fixturePath, new Blob(['ttl'], { type: 'application/pdf' }), { upsert: true });
    const { data: fixtureRow } = await admin
      .from('files')
      .insert({
        company_id: companyId,
        project_id: projectId,
        category: 'photos',
        file_name: `${MARKER}-f2a-ttl.pdf`,
        file_path: fixturePath,
        file_size: 3,
        mime_type: 'application/pdf',
      })
      .select('id')
      .single();

    const { data: signed } = await crew.storage.from(BUCKET).createSignedUrl(fixturePath, 60);
    expect(
      signed?.signedUrl,
      'crew cannot open a photo on its own project — this probe would be vacuous'
    ).toBeTruthy();

    const { data: crewProfile } = await admin
      .from('profiles').select('id').eq('email', CREW).single();
    const { data: crewMember } = await admin
      .from('company_members').select('id').eq('profile_id', crewProfile!.id)
      .order('id', { ascending: true }).limit(1).single();
    const file = { project_id: projectId };

    const { data: assignments } = await admin
      .from('project_assignments').select('id')
      .eq('project_id', file!.project_id).eq('member_id', crewMember!.id).eq('is_deleted', false);
    const ids = ((assignments ?? []) as { id: string }[]).map((a) => a.id);

    must('revoke', (await admin
      .from('project_assignments').update({ is_deleted: true }).in('id', ids)).error);
    try {
      // The grant is gone...
      const { error: nowRefused } = await crew.storage
        .from(BUCKET).createSignedUrl(fixturePath, 60);
      expect(nowRefused, 'the revoked crew member can still MINT a URL').not.toBeNull();

      // ...but the URL minted a moment ago still works.
      const res = await fetch(signed!.signedUrl);
      expect(
        res.status,
        'the pre-minted URL stopped working — signed URLs are revocable after all'
      ).toBe(200);
    } finally {
      must('restore assignment', (await admin
        .from('project_assignments').update({ is_deleted: false }).in('id', ids)).error);
      if (fixtureRow?.id) await admin.from('files').delete().eq('id', fixtureRow.id);
      await admin.storage.from(BUCKET).remove([fixturePath]);
    }
  });
});

// ============================================================================
// M3-03 — M3's UPDATE-shaped writers do not use the shared row-count guard.
// ============================================================================

describe('S155-F3 — a discarded file write is reported as success', () => {
  it('F3a — updateFile() reports success for a caller RLS discards', async () => {
    // `mutation-result.ts` exists as of S154 and `files-client.ts` does not
    // import it. Four UPDATE-shaped writers (updateFile, softDeleteFile,
    // restoreFile, toggleFavorite) check `error` and nothing else — M1-01's and
    // M2-03's shape, third module.
    //
    // ✅ INVERTED AT S157 — M3-03 IS FIXED. The original asked for exactly this
    // ("when guarded, invert to expect success === false"). All four writers now
    // end `.select('id')` and go through `applied()`/`DISCARDED`.
    state.client = crew;
    const result = await updateFile(invoiceFileId, { file_name: `${MARKER}-overwritten.pdf` });

    expect(
      result.success,
      'updateFile reported success over a write RLS discarded — M3-03 has regressed'
    ).toBe(false);

    const { data } = await admin
      .from('files').select('file_name').eq('id', invoiceFileId).single();
    expect(data!.file_name).not.toBe(`${MARKER}-overwritten.pdf`);
  });

  it('F3b — toggleFavorite() likewise', async () => {
    state.client = crew;
    const before = await admin
      .from('files').select('is_favorite').eq('id', invoiceFileId).single();

    // ✅ INVERTED AT S157 alongside F3a.
    const result = await toggleFavorite(invoiceFileId, !before.data!.is_favorite);
    expect(
      result.success,
      'toggleFavorite reported success over a discarded write — M3-03 has regressed'
    ).toBe(false);

    const after = await admin
      .from('files').select('is_favorite').eq('id', invoiceFileId).single();
    expect(after.data!.is_favorite).toBe(before.data!.is_favorite);
  });

  it('F3c — the same call SUCCEEDS for an Owner, so F3a/F3b are not vacuous', async () => {
    state.client = owner;
    const before = await admin
      .from('files').select('is_favorite').eq('id', invoiceFileId).single();

    const result = await toggleFavorite(invoiceFileId, !before.data!.is_favorite);
    expect(result.success).toBe(true);

    const after = await admin
      .from('files').select('is_favorite').eq('id', invoiceFileId).single();
    expect(after.data!.is_favorite, 'the Owner could not write either — F3c proves nothing')
      .toBe(!before.data!.is_favorite);

    must('restore', (await admin
      .from('files').update({ is_favorite: before.data!.is_favorite })
      .eq('id', invoiceFileId)).error);
  });
});

// ============================================================================
// M3-04 — permanentDeleteFile() can report success having deleted NOTHING.
// ============================================================================

// ✅ RETITLED AT S157 — M3-02 IS FIXED IN THE SERVICE, AND THESE PRIMITIVES ARE
// UNCHANGED ON PURPOSE.
//
// The old title, "a refused permanent delete reports success", is no longer true
// of `permanentDeleteFile()`: it now row-counts BOTH halves and returns a
// failure. What this block probes is one layer below that — the raw storage and
// PostgREST calls — and their behaviour has NOT changed and never will: an
// RLS-refused `storage.remove()` returns an EMPTY LIST rather than an error, and
// a zero-row DELETE is not an error in Postgres.
//
// That is precisely WHY the service has to count. Keeping this block green
// documents the primitive the guard is defending against; if either line ever
// starts erroring on its own, the guard's rationale changed and someone should
// know. The service-level proof that the guard works lives in
// `s157-m3-m4-fixes.live.ts` B4/B5.
describe('S155-F4 — the primitives a refused permanent delete returns [retitled S157]', () => {
  it('F4a — as crew, BOTH the storage remove and the row delete are silent no-ops', async () => {
    // `permanentDeleteFile()` (files-client.ts:340) checks `storageError` then
    // `deleteError` and returns `{ success: true }`. Neither call errors when RLS
    // refuses: `storage.remove()` returns an empty removed-list, and a
    // zero-row DELETE is not an error in Postgres. So a caller who may delete
    // nothing is told the file is permanently gone — on the one operation in M3
    // that is genuinely irreversible.
    //
    // ⚠️ STILL CURRENT after S157: this is the DATABASE's behaviour, not the
    // service's. `permanentDeleteFile()` now checks both results; see B4/B5 in
    // s157-m3-m4-fixes.live.ts.
    const { data: f } = await admin
      .from('files').select('id, file_path')
      .eq('category', 'photos').eq('is_deleted', false)
      .order('id', { ascending: true }).limit(1).single();

    const rm = await crew.storage.from('project-files').remove([f!.file_path]);
    expect(rm.error, 'storage.remove now errors for crew — F4 may be fixed').toBeNull();
    expect((rm.data ?? []).length, 'crew actually removed an object').toBe(0);

    const del = await crew.from('files').delete().eq('id', f!.id).select('id');
    expect(del.error, 'the row DELETE now errors for crew — F4 may be fixed').toBeNull();
    expect((del.data ?? []).length, 'crew actually deleted the row').toBe(0);

    // Nothing happened, and nothing said so.
    const { data: still } = await admin.from('files').select('id').eq('id', f!.id);
    expect(still, 'the row is gone — the probe destroyed real data').toHaveLength(1);
  });
});

// ============================================================================
// Verified SOUND — recorded so pass 4+ does not re-derive it.
// ============================================================================

describe('S155-V — M3 properties checked and found correct', () => {
  it('V1 — a file with NULL project_id is owner/admin only', async () => {
    // Both `files_select_non_client` and the storage policy require a project
    // for anyone below owner/admin, and they agree here.
    const { data: orphan } = await admin
      .from('files').select('id').is('project_id', null).eq('is_deleted', false)
      .order('id', { ascending: true }).limit(1).maybeSingle();
    if (!orphan) return; // none on this database — unverified rather than assumed.

    const { data: asCrew } = await crew.from('files').select('id').eq('id', orphan.id);
    expect(asCrew, 'crew can read a project-less file').toEqual([]);
    const { data: asOwner } = await owner.from('files').select('id').eq('id', orphan.id);
    expect(asOwner, 'the Owner cannot read it either — V1 is vacuous').toHaveLength(1);
  });

  it('V2 — the trash/restore flow reads soft-deleted rows, unlike M2 before S154', async () => {
    // CLAUDE.md names `files.ts` the reference implementation of the trash-bin
    // pattern. `files_select_non_client` carries NO is_deleted clause, so the
    // M2-02 defect does not exist here — asserted rather than assumed.
    const { data: probe, error } = await admin
      .from('files')
      .select('id, is_deleted').eq('is_deleted', false)
      .order('id', { ascending: true }).limit(1).single();
    must('probe', error);

    must('soft delete', (await admin
      .from('files').update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', probe!.id)).error);
    try {
      const { data } = await owner.from('files').select('id').eq('id', probe!.id);
      expect(data, 'a soft-deleted file is unreadable — M2-02 exists in M3 too').toHaveLength(1);
    } finally {
      must('restore', (await admin
        .from('files').update({ is_deleted: false, deleted_at: null }).eq('id', probe!.id)).error);
    }
  });
});
