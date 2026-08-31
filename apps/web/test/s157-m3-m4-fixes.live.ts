/**
 * S157 — proof for the Module 3 and Module 4 fixes.
 *
 * This is the INVERSE of `s155-m3-audit.live.ts` and `s156-m4-audit.live.ts`:
 * where those asserted the defects, these assert the fixes. Each block names
 * the finding it closes and, where the fix could pass vacuously, carries a
 * companion probe proving it did not.
 *
 * ⚠️ NOTHING HERE MUTATES SEEDED DATA. Every destructive probe runs against a
 * fixture this file creates and removes. The first draft of the storage
 * overwrite probe pointed at a real seeded invoice PDF and would have destroyed
 * it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

import {
  permanentDeleteFile,
  toggleFavorite,
  updateFile,
} from '@/lib/services/files-client';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/services/signed-url-ttl';

const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const BUCKET = 'project-files';
const MARKER = 'S157FIX';

let owner: SupabaseClient;
let crew: SupabaseClient;
let companyId = '';
let assignedProjectId = '';

/** A real seeded `invoices` file on a project the crew member IS assigned to. */
let realInvoiceId = '';
let realInvoicePath = '';
/** A real seeded `photos` file on the same project — crew MAY reach this one. */
let realPhotoPath = '';

/** Fixtures this file owns. Removed in afterAll. */
const madeFileIds: string[] = [];
const madePaths: string[] = [];

async function makeFile(
  category: 'invoices' | 'photos',
  name: string,
  body = 'original'
): Promise<{ id: string; path: string }> {
  const path = `${companyId}/${assignedProjectId}/${MARKER}-${name}`;
  const up = await admin.storage
    .from(BUCKET)
    .upload(path, new Blob([body], { type: 'application/pdf' }), { upsert: true });
  if (up.error) throw new Error(`upload ${name}: ${up.error.message}`);
  const { data, error } = await admin
    .from('files')
    .insert({
      company_id: companyId,
      project_id: assignedProjectId,
      category,
      file_name: `${MARKER}-${name}`,
      file_path: path,
      file_size: body.length,
      mime_type: 'application/pdf',
    })
    .select('id')
    .single();
  if (error) throw new Error(`insert ${name}: ${error.message}`);
  madeFileIds.push(data.id);
  madePaths.push(path);
  return { id: data.id, path };
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

  // The crew member's assigned projects, resolved the long way because
  // assignment goes profiles -> company_members -> project_assignments.
  const { data: crewProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('user_id', (await crew.auth.getUser()).data.user!.id)
    .single();
  const { data: members } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', crewProfile!.id)
    .eq('is_deleted', false)
    .order('id', { ascending: true });
  const { data: assigns } = await admin
    .from('project_assignments')
    .select('project_id')
    .in(
      'member_id',
      (members ?? []).map((m) => m.id)
    )
    .eq('is_deleted', false);
  const assigned = new Set((assigns ?? []).map((a) => a.project_id));

  // ORDERED — `.limit(1)` on heap order is the class this repo has hit five
  // times; `id` is the tiebreak because seeded rows share timestamps.
  const { data: invoices } = await admin
    .from('files')
    .select('id, file_path, project_id')
    .eq('category', 'invoices')
    .eq('is_deleted', false)
    .order('id', { ascending: true });
  const inv = (invoices ?? []).find((f) => f.project_id && assigned.has(f.project_id));
  if (!inv) throw new Error('no seeded invoices file on an assigned project — probes would be vacuous');
  realInvoiceId = inv.id;
  realInvoicePath = inv.file_path;
  assignedProjectId = inv.project_id as string;

  const { data: photos } = await admin
    .from('files')
    .select('id, file_path, project_id')
    .eq('category', 'photos')
    .eq('is_deleted', false)
    .order('id', { ascending: true });
  const ph = (photos ?? []).find((f) => f.project_id && assigned.has(f.project_id));
  if (!ph) throw new Error('no seeded photos file on an assigned project — A3 would be vacuous');
  realPhotoPath = ph.file_path;
}, 240_000);

afterAll(async () => {
  if (madeFileIds.length) await admin.from('files').delete().in('id', madeFileIds);
  if (madePaths.length) await admin.storage.from(BUCKET).remove(madePaths);
});

// ---------------------------------------------------------------------------
// M3-01 — the bytes now follow the row.
// ---------------------------------------------------------------------------
describe('M3-01 — storage RLS is aligned to table RLS', () => {
  it('A1 · crew still cannot SELECT the invoice files row (unchanged)', async () => {
    const { data } = await crew.from('files').select('id').eq('id', realInvoiceId).maybeSingle();
    expect(data).toBeNull();
  });

  // ⚠️ A2 IS PAIRED WITH A4 AND MUST STAY THAT WAY. Storage answers a policy
  // refusal and a genuinely absent object with the SAME "Object not found" —
  // that conflation is an anti-enumeration property, not a bug. So A2 alone
  // could pass over a path that simply has no bytes. A4 mints the SAME path as
  // owner and succeeds, which proves the object is there and the difference
  // between them is the policy.
  it('A2 · crew can no longer MINT a signed URL for that object [was F1b/F1c]', async () => {
    const { data, error } = await crew.storage.from(BUCKET).createSignedUrl(realInvoicePath, 60);
    expect(data?.signedUrl, 'crew minted an invoice URL — the delegation is not working').toBeFalsy();
    expect(error).not.toBeNull();
  });

  // ⚠️ USES A FIXTURE, NOT A SEEDED PHOTO, AND THE REASON IS A REAL TRAP.
  // The first version took the lowest-id seeded `photos` row and failed with
  // "Object not found" — because that row points at NO STORAGE OBJECT. There
  // are 108 `files` rows against 105 objects in the bucket [LIVE, S157], so
  // some rows are dangling, and a probe that lands on one reads as a policy
  // refusal. A fixture this file uploads is guaranteed to have bytes, so a
  // failure here can only mean the policy.
  it('A3 · crew CAN still reach a photo on the same project — not a blanket denial', async () => {
    const { path } = await makeFile('photos', 'reachable.pdf');
    const { data, error } = await crew.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(error, 'crew lost a photo it should keep — the policy over-tightened').toBeNull();
    expect(data?.signedUrl).toBeTruthy();
  });

  it('A4 · owner is unaffected and still reaches the invoice object', async () => {
    const { data, error } = await owner.storage.from(BUCKET).createSignedUrl(realInvoicePath, 60);
    expect(error).toBeNull();
    expect(data?.signedUrl).toBeTruthy();
  });

  it('A5 · crew can no longer OVERWRITE invoice bytes [the UPDATE extension]', async () => {
    const { path } = await makeFile('invoices', 'overwrite-target.pdf');
    const { error } = await crew.storage
      .from(BUCKET)
      .update(path, new Blob(['OVERWRITTEN'], { type: 'application/pdf' }));
    expect(error, 'crew overwrote an invoice PDF — storage UPDATE is still unfloored').not.toBeNull();

    const { data: after } = await admin.storage.from(BUCKET).download(path);
    expect(await after!.text(), 'the bytes changed despite the refusal').toBe('original');
  });

  // ⚠️ THE DERIVATIVE CLAUSE — 20261008000000, and the reason it exists.
  // `saveMarkup()` writes the flattened image to `{original}.markup.jpg` and
  // deliberately creates NO `files` row for it (9-spec §6.1: a second
  // `category='photos'` row would make every annotated photo appear twice).
  // So one row legitimately owns TWO objects, and the first version of the
  // delegation could not see the second — which made an annotated photo render
  // as the UNANNOTATED original with no indication the markup existed. That is
  // exactly the silent loss CLAUDE.md's PARITY ruling was written about (#129).
  it('A7 · crew CAN read the DERIVATIVE of a photo it may read', async () => {
    const { path } = await makeFile('photos', 'deriv-src.pdf');
    const derivative = `${path}.markup.jpg`;
    await admin.storage
      .from(BUCKET)
      .upload(derivative, new Blob(['marked'], { type: 'image/jpeg' }), { upsert: true });
    madePaths.push(derivative);

    const { data, error } = await crew.storage.from(BUCKET).createSignedUrl(derivative, 60);
    expect(error, 'crew lost the marked-up image — the derivative clause has regressed').toBeNull();
    expect(data?.signedUrl).toBeTruthy();
  });

  it('A8 · crew CANNOT read the derivative of a file it may NOT read', async () => {
    // The clause grants the derivative exactly when the ORIGINAL is readable —
    // it is not a blanket exemption for anything ending `.markup.jpg`.
    const { path } = await makeFile('invoices', 'deriv-invoice.pdf');
    const derivative = `${path}.markup.jpg`;
    await admin.storage
      .from(BUCKET)
      .upload(derivative, new Blob(['marked'], { type: 'image/jpeg' }), { upsert: true });
    madePaths.push(derivative);

    const { data } = await crew.storage.from(BUCKET).createSignedUrl(derivative, 60);
    expect(
      data?.signedUrl,
      'the suffix alone granted access — the derivative clause is too wide'
    ).toBeFalsy();
  });

  it('A6 · crew CAN still overwrite a photo it owns — A5 is the category, not the verb', async () => {
    const { path } = await makeFile('photos', 'photo-overwrite.pdf');
    const { error } = await crew.storage
      .from(BUCKET)
      .update(path, new Blob(['NEWBYTES'], { type: 'application/pdf' }));
    expect(error, 'crew lost write on a photo — over-tightened').toBeNull();
    const { data: after } = await admin.storage.from(BUCKET).download(path);
    expect(await after!.text()).toBe('NEWBYTES');
  });
});

// ---------------------------------------------------------------------------
// M3-02 / M3-03 — the writers no longer lie.
// ---------------------------------------------------------------------------
describe('M3-02 / M3-03 — row-count guards on the files writers', () => {
  it('B1 · updateFile as crew reports FAILURE, and the row does not move [was F3a]', async () => {
    const { id } = await makeFile('invoices', 'guard-update.pdf');
    state.client = crew;
    const res = await updateFile(id, { file_name: 'CREW-RENAMED' });
    expect(res.success, 'updateFile still reports success over a discarded write').toBe(false);

    const { data } = await admin.from('files').select('file_name').eq('id', id).single();
    expect((data as { file_name: string }).file_name).toBe(`${MARKER}-guard-update.pdf`);
  });

  it('B2 · toggleFavorite as crew reports FAILURE [was F3b]', async () => {
    const { id } = await makeFile('invoices', 'guard-fav.pdf');
    state.client = crew;
    const res = await toggleFavorite(id, true);
    expect(res.success).toBe(false);

    const { data } = await admin.from('files').select('is_favorite').eq('id', id).single();
    expect((data as { is_favorite: boolean }).is_favorite).toBe(false);
  });

  it('B3 · the OWNER’s updateFile still succeeds — B1/B2 are not vacuous [was F3c]', async () => {
    const { id } = await makeFile('photos', 'guard-owner.pdf');
    state.client = owner;
    const res = await updateFile(id, { file_name: 'OWNER-RENAMED' });
    expect(res.success, `owner was refused: ${res.error}`).toBe(true);

    const { data } = await admin.from('files').select('file_name').eq('id', id).single();
    expect((data as { file_name: string }).file_name).toBe('OWNER-RENAMED');
  });

  it('B4 · permanentDeleteFile as crew reports FAILURE and NOTHING is deleted [was F4]', async () => {
    const { id, path } = await makeFile('photos', 'perm-crew.pdf');
    state.client = crew;
    const res = await permanentDeleteFile(id);
    expect(res.success, 'permanentDeleteFile still claims an irreversible delete it did not do').toBe(
      false
    );

    const { data: row } = await admin.from('files').select('id').eq('id', id).maybeSingle();
    expect(row, 'the row is gone after a refused delete').not.toBeNull();
    const { data: blob } = await admin.storage.from(BUCKET).download(path);
    expect(blob, 'the bytes are gone after a refused delete').toBeTruthy();
  });

  it('B5 · permanentDeleteFile as OWNER genuinely deletes BOTH halves', async () => {
    const { id, path } = await makeFile('photos', 'perm-owner.pdf');
    state.client = owner;
    const res = await permanentDeleteFile(id);
    expect(res.success, `owner's permanent delete was refused: ${res.error}`).toBe(true);

    const { data: row } = await admin.from('files').select('id').eq('id', id).maybeSingle();
    expect(row, 'the row survived a reported-successful permanent delete').toBeNull();
    const { data: blob } = await admin.storage.from(BUCKET).download(path);
    expect(blob, 'the bytes survived a reported-successful permanent delete').toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// M3-04 — one home for the TTL.
// ---------------------------------------------------------------------------
describe('M3-04 — the signed-URL TTL', () => {
  it('C1 · is two hours, in one place', () => {
    expect(SIGNED_URL_TTL_SECONDS).toBe(7200);
  });
});

// ---------------------------------------------------------------------------
// M4-02 / M4-03 — the compare-and-swap is read.
// ---------------------------------------------------------------------------
describe('M4-02 / M4-03 — the losing CAS is now observable', () => {
  let sessionId = '';
  let estimateId = '';

  beforeAll(async () => {
    const { data: est } = await admin
      .from('estimates')
      .select('id, company_id')
      .eq('is_deleted', false)
      .order('id', { ascending: true })
      .limit(1)
      .single();
    estimateId = (est as { id: string }).id;

    const { data, error } = await admin
      .from('signing_sessions')
      .insert({
        company_id: (est as { company_id: string }).company_id,
        estimate_id: estimateId,
        token: `${MARKER}-${Date.now()}`,
        recipient_email: 's157@example.invalid',
        recipient_name: 'S157 Probe',
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new Error(`seed signing_session: ${error.message}`);
    sessionId = data.id;
  });

  afterAll(async () => {
    if (sessionId) await admin.from('signing_sessions').delete().eq('id', sessionId);
  });

  it('D1 · the WINNING compare-and-swap returns its row', async () => {
    const { data, error } = await admin
      .from('signing_sessions')
      .update({ status: 'completed' })
      .eq('id', sessionId)
      .eq('status', 'pending')
      .select('id');
    expect(error).toBeNull();
    expect(data, 'the winner matched no rows — the probe is set up wrong').toHaveLength(1);
  });

  it('D2 · the LOSING compare-and-swap returns ZERO rows and NO error', async () => {
    // Exactly what the second of two concurrent completions sees. Before S157
    // this result was discarded, so the loser carried on to overwrite the
    // estimate's signed PDF and send a duplicate notification.
    const { data, error } = await admin
      .from('signing_sessions')
      .update({ status: 'completed' })
      .eq('id', sessionId)
      .eq('status', 'pending')
      .select('id');
    expect(error, 'a losing CAS is not an error, and must not be treated as one').toBeNull();
    expect(data).toHaveLength(0);
  });
});
