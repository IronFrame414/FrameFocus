import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ===========================================================================
// S114 C-8 [RULED Josh 2026-09-28, Q10 A + Q11 A] — MARKUP ON A SITE-VISIT
// PHOTO, through the shared check and the real route, on rebuild-test.
//
// Q11's three conditions, each a test here:
//   1. the access check is ONE shared function — authorizeSiteVisitMarkup(),
//      called by the route below and by both markup pages;
//   2. an UNASSIGNED caller is refused — a subcontractor of the same company
//      and the owner of ANOTHER company (site_visit_access() → NULL for both),
//      and the service-role client is never even obtained for them;
//   3. the FREEZE TRIGGER still fires behind the route — a direct service-role
//      write of markup_data on a frozen capture is refused by the database.
// Plus Q10 A (per photo): the capture taken BEFORE the send is frozen (409,
// with the reason); the one added AFTER it is editable.
// ===========================================================================

let routeSession: SupabaseClient | null = null;
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => {
    if (!routeSession) throw new Error('test did not set a session for the route');
    return routeSession;
  },
}));

const MARKER = `S114SVM-${Date.now()}`;
const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const OTHER_CO_OWNER = 'josh+qa-b-owner@worthprop.com';
const BUCKET = 'project-files';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2P8z8Dwn4GKgIlqJo0aOGrgqIHDwEAAaSgDBaMLcOgAAAAASUVORK5CYII=',
  'base64'
);

let ownerC: SupabaseClient;
let crewC: SupabaseClient;
let subC: SupabaseClient;
let otherC: SupabaseClient;
let crewId = '';
let subId = '';
let otherId = '';
let companyId = '';
let estimateId = '';
let frozenId = '';
let openId = '';
const paths: string[] = [];

type Authorize = typeof import('@/lib/site-visits/markup-access').authorizeSiteVisitMarkup;
let authorize: Authorize;
let POST: (req: Request, ctx: { params: { id: string; fileId: string } }) => Promise<Response>;

async function uid(c: SupabaseClient) {
  const { data } = await c.auth.getUser();
  return data.user!.id;
}

async function seedCapture(key: string): Promise<string> {
  const id = crypto.randomUUID();
  const path = `${companyId}/estimates/${estimateId}/${id}-${MARKER}-${key}.png`;
  const up = await admin.storage.from(BUCKET).upload(path, PNG, { contentType: 'image/png' });
  expect(up.error, up.error?.message).toBeNull();
  paths.push(path);
  const ins = await admin.from('files').insert({
    id,
    company_id: companyId,
    project_id: null,
    estimate_id: estimateId,
    category: 'photos',
    site_visit_capture: true,
    file_name: `${MARKER}-${key}.png`,
    file_path: path,
    file_size: PNG.length,
    mime_type: 'image/png',
  });
  expect(ins.error, ins.error?.message).toBeNull();
  return id;
}

async function sweep() {
  const { data: files } = await admin
    .from('files')
    .select('id, file_path')
    .like('file_name', `${MARKER}%`);
  const rows = (files ?? []) as { id: string; file_path: string }[];
  if (rows.length) {
    const { removeThumbnails } = await import('@/lib/photos/thumbnail-server');
    for (const r of rows) await removeThumbnails(admin, r.file_path);
    await admin.storage
      .from(BUCKET)
      .remove(rows.flatMap((r) => [r.file_path, `${r.file_path}.markup.jpg`]));
    await admin
      .from('files')
      .delete()
      .in(
        'id',
        rows.map((r) => r.id)
      );
  }
  const { data: ests } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = ((ests ?? []) as { id: string }[]).map((e) => e.id);
  if (ids.length) {
    await admin.from('site_visits').delete().in('estimate_id', ids);
    await admin.from('estimates').delete().in('id', ids);
  }
}

function markupForm() {
  const form = new FormData();
  form.set(
    'markup',
    JSON.stringify({
      version: 2,
      imageWidth: 8,
      imageHeight: 8,
      shapes: [{ id: 'p1', type: 'pin', x: 4, y: 4, color: '#f2453d', number: 1 }],
    })
  );
  form.set('derivative', new Blob([new Uint8Array(PNG)], { type: 'image/jpeg' }), 'markup.jpg');
  return form;
}

beforeAll(async () => {
  assertRebuildTest();
  ({ authorizeSiteVisitMarkup: authorize } = await import('@/lib/site-visits/markup-access'));
  ({ POST } = (await import('@/app/api/estimates/[id]/files/[fileId]/markup/route')) as never);
  [ownerC, crewC, subC, otherC] = await Promise.all([
    sessionFor(OWNER),
    sessionFor(CREW),
    sessionFor(SUB),
    sessionFor(OTHER_CO_OWNER),
  ]);
  [crewId, subId, otherId] = await Promise.all([uid(crewC), uid(subC), uid(otherC)]);

  const { data: p } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  companyId = (p as { company_id: string }).company_id;
  // Any contact will do; ordered so the pick is stable (CLAUDE.md, .limit(1)).
  const { data: c } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();

  const { data: est, error } = await ownerC.rpc('create_site_visit', {
    p_title: `${MARKER} porch`,
    p_contact_id: (c as { id: string }).id,
  });
  expect(error, error?.message).toBeNull();
  estimateId = est as string;
  await admin
    .from('estimates')
    .update({ name: `${MARKER} porch` })
    .eq('id', estimateId);

  // The photo captured BEFORE the send …
  frozenId = await seedCapture('before');
  const promoted = await ownerC.rpc('promote_site_visit', { p_estimate_id: estimateId });
  expect(promoted.error, promoted.error?.message).toBeNull();
  const sent = await admin.from('estimates').update({ status: 'sent' }).eq('id', estimateId);
  expect(sent.error, sent.error?.message).toBeNull();
  // … and one added AFTER it.
  await new Promise((r) => setTimeout(r, 50));
  openId = await seedCapture('after');
}, 120_000);

afterAll(async () => {
  await sweep();
}, 120_000);

describe('S114 C-8 — the fixture is real (not vacuous)', () => {
  it('the send stamped frozen_at between the two captures', async () => {
    const { data: sv } = await admin
      .from('site_visits')
      .select('frozen_at')
      .eq('estimate_id', estimateId)
      .single();
    const frozenAt = (sv as { frozen_at: string | null }).frozen_at;
    expect(frozenAt, 'sending did not stamp frozen_at').not.toBeNull();
    const { data: fs } = await admin
      .from('files')
      .select('id, created_at')
      .in('id', [frozenId, openId]);
    const at = Object.fromEntries(
      ((fs ?? []) as { id: string; created_at: string }[]).map((f) => [f.id, f.created_at])
    );
    expect(new Date(at[frozenId]) <= new Date(frozenAt!)).toBe(true);
    expect(new Date(at[openId]) > new Date(frozenAt!)).toBe(true);
  });
});

describe('S114 C-8 — condition 2: an unassigned caller is refused, before the service role exists', () => {
  it('a SUBCONTRACTOR of the same company is refused, and getAdmin is never called', async () => {
    const getAdmin = vi.fn(() => admin as unknown as SupabaseClient);
    const r = await authorize(subC, getAdmin, subId, estimateId, openId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect([403, 404]).toContain(r.status);
    expect(getAdmin).not.toHaveBeenCalled();
  });

  it('the owner of ANOTHER company is refused, and getAdmin is never called', async () => {
    const getAdmin = vi.fn(() => admin as unknown as SupabaseClient);
    const r = await authorize(otherC, getAdmin, otherId, estimateId, openId);
    expect(r.ok).toBe(false);
    if (!r.ok) expect([403, 404]).toContain(r.status);
    expect(getAdmin).not.toHaveBeenCalled();
  });

  it('through the ROUTE: the subcontractor’s save is refused and markup_data is unchanged (service-role count)', async () => {
    routeSession = subC;
    const res = await POST(new Request('http://t/', { method: 'POST', body: markupForm() }), {
      params: { id: estimateId, fileId: openId },
    });
    expect([403, 404]).toContain(res.status);
    const { data } = await admin.from('files').select('markup_data').eq('id', openId).single();
    expect((data as { markup_data: unknown }).markup_data).toBeNull();
  });
});

describe('S114 C-8 — Q10 A, per photo', () => {
  it('CONTROL — the crew member (captures on this visit) is admitted to the photo added after the send', async () => {
    const r = await authorize(
      crewC,
      () => admin as unknown as SupabaseClient,
      crewId,
      estimateId,
      openId
    );
    expect(r.ok, r.ok ? '' : r.error).toBe(true);
  });

  it('the photo captured before the send is FROZEN: 409 with the reason, never an editor', async () => {
    const r = await authorize(
      crewC,
      () => admin as unknown as SupabaseClient,
      crewId,
      estimateId,
      frozenId
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.frozen).toBe(true);
      expect(r.error).toMatch(/sent estimate/i);
    }
  });

  it('through the ROUTE: the crew member’s save on the open photo lands — markup_data AND the derivative', async () => {
    routeSession = crewC;
    const res = await POST(new Request('http://t/', { method: 'POST', body: markupForm() }), {
      params: { id: estimateId, fileId: openId },
    });
    const body = (await res.json()) as { status?: string; error?: string };
    expect(res.status, body.error).toBe(200);
    expect(body.status).toBe('saved');
    const { data } = await admin
      .from('files')
      .select('file_path, markup_data')
      .eq('id', openId)
      .single();
    const row = data as { file_path: string; markup_data: { shapes?: unknown[] } | null };
    expect(row.markup_data?.shapes).toHaveLength(1);
    const { data: blob } = await admin.storage.from(BUCKET).download(`${row.file_path}.markup.jpg`);
    expect(blob, 'the derivative was not written').toBeTruthy();
  });

  it('through the ROUTE: the crew member’s save on the frozen photo is 409 and changes nothing', async () => {
    routeSession = crewC;
    const res = await POST(new Request('http://t/', { method: 'POST', body: markupForm() }), {
      params: { id: estimateId, fileId: frozenId },
    });
    expect(res.status).toBe(409);
    const { data } = await admin.from('files').select('markup_data').eq('id', frozenId).single();
    expect((data as { markup_data: unknown }).markup_data).toBeNull();
  });
});

describe('S114 C-8 — condition 3: the freeze trigger still fires BEHIND the route', () => {
  it('a direct service-role write of markup_data on the frozen capture is refused by the database (42501)', async () => {
    const { error } = await admin
      .from('files')
      .update({ markup_data: { version: 2, imageWidth: 8, imageHeight: 8, shapes: [] } })
      .eq('id', frozenId);
    expect(error, 'the freeze trigger did not fire').not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('CONTROL — the same write on the open capture is accepted (the refusal above is the freeze, not the write)', async () => {
    const { error } = await admin
      .from('files')
      .update({ markup_data: { version: 2, imageWidth: 8, imageHeight: 8, shapes: [] } })
      .eq('id', openId);
    expect(error, error?.message).toBeNull();
  });
});
