import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { ANON, URL_, admin, assertRebuildTest } from './live-session';
import { GET, POST } from '../app/api/bid/[token]/files/route';

// ============================================================================
// S112 — /bid/{token}: the token proves WHO, the bid's CURRENT status decides
// WHETHER. rebuild-test only.
// ============================================================================
// RULED [Josh, S112]:
//   a) the files endpoint checks the bid's CURRENT status on every request;
//   b) cancelled (or withdrawn) → refused immediately;
//   c) submitted → still served (until awarded or declined);
//   d) expired → refused, as now;
//   e) NEGATIVE TEST FIRST: a cancelled bid's token fetches a scope document
//      and succeeds today — the proof the defect is real;
//   f) the same gap on the token's OTHER endpoints.
//
// Every endpoint behind the token is exercised here: GET files, POST files,
// and get_sub_bid_request (the page's only read; `anon` may EXECUTE it, so a
// token holder can call it without the page). submit_sub_bid_reply already
// refuses cancelled/declined/submitted/expired and is not changed.
//
// Its own rows on one draft estimate; one staff "scope document".
// ============================================================================

const MARKER = 'S112BIDSTATUS';
const OWNER = 'josh+test50@worthprop.com';
const BUCKET = 'project-files';

let estimateId = '';
let companyId = '';
let lineItemId = '';
let subId = '';
let scopePath = '';
const tokens: Record<string, string> = {};

const future = () => new Date(Date.now() + 7 * 86_400_000).toISOString();

async function newRequest(status: string, expiresAt = future()) {
  const { data, error } = await admin
    .from('estimate_sub_bid_requests')
    .insert({
      company_id: companyId,
      estimate_id: estimateId,
      line_item_id: lineItemId,
      subcontractor_id: subId,
      status,
      expires_at: expiresAt,
      scope_text: `${MARKER} scope text`,
      message: `${MARKER} message`,
      allowance_amount: 12345,
    })
    .select('token')
    .single();
  expect(error, error?.message).toBeNull();
  return (data as { token: string }).token;
}

async function listFiles(token: string) {
  const res = await GET(new Request(`http://x/api/bid/${token}/files`), { params: { token } });
  const body = (await res.json()) as { files?: { url: string | null }[]; error?: string };
  return { status: res.status, files: body.files ?? [], error: body.error };
}

async function sweep() {
  const { data: reqs } = await admin.from('estimate_sub_bid_requests').select('id').like('scope_text', `${MARKER}%`);
  for (const r of (reqs ?? []) as { id: string }[]) {
    await admin.from('estimate_sub_bid_requests').delete().eq('id', r.id);
  }
  const { data: files } = await admin.from('files').select('id, file_path').like('file_name', `${MARKER}%`);
  for (const f of (files ?? []) as { id: string; file_path: string }[]) {
    await admin.storage.from(BUCKET).remove([f.file_path]);
    await admin.from('files').delete().eq('id', f.id);
  }
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  // An existing bid request supplies a real draft estimate, line and sub;
  // ordered so the pick is stable — any live request will do.
  const { data: tmpl } = await admin
    .from('estimate_sub_bid_requests')
    .select('estimate_id, line_item_id, subcontractor_id, company_id')
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  const t = tmpl as { estimate_id: string; line_item_id: string; subcontractor_id: string; company_id: string };
  estimateId = t.estimate_id;
  lineItemId = t.line_item_id;
  subId = t.subcontractor_id;
  companyId = t.company_id;
  const { data: est } = await admin.from('estimates').select('status').eq('id', estimateId).single();
  console.log(`[S112 bid fixture] estimate ${estimateId} status ${(est as { status: string }).status}`);

  const { data: owner } = await admin.from('profiles').select('user_id').eq('email', OWNER).eq('is_deleted', false).single();
  scopePath = `${companyId}/estimates/${estimateId}/${crypto.randomUUID()}-${MARKER}-scope.pdf`;
  expect(
    (await admin.storage.from(BUCKET).upload(scopePath, Buffer.from('%PDF-1.4 S112 scope'), { contentType: 'application/pdf' })).error
  ).toBeNull();
  const ins = await admin.from('files').insert({
    company_id: companyId,
    estimate_id: estimateId,
    project_id: null,
    category: 'other',
    file_name: `${MARKER}-scope.pdf`,
    file_path: scopePath,
    file_size: 19,
    mime_type: 'application/pdf',
    created_by: (owner as { user_id: string }).user_id, // a STAFF upload — what a bidder may see
  });
  expect(ins.error, ins.error?.message).toBeNull();

  for (const s of ['sent', 'viewed', 'submitted', 'cancelled', 'declined']) tokens[s] = await newRequest(s);
  tokens.expired = await newRequest('sent', new Date(Date.now() - 86_400_000).toISOString());
}, 120_000);

afterAll(async () => {
  await sweep();
}, 120_000);

describe('S112 /bid GET files — the bid\'s current status decides', () => {
  for (const s of ['sent', 'viewed', 'submitted'] as const) {
    it(`${s} — SERVED: the scope document, and its URL fetches (control)`, async () => {
      const r = await listFiles(tokens[s]);
      const ours = r.files.length;
      console.log(`[S112 bid GET ${s}] status ${r.status}, files ${ours}`);
      expect(r.status).toBe(200);
      expect(ours).toBeGreaterThanOrEqual(1);
      const bytes = await fetch(r.files[0].url!);
      expect(bytes.status).toBe(200);
    });
  }

  for (const s of ['cancelled', 'declined'] as const) {
    it(`${s} — REFUSED: 0 files, no URL`, async () => {
      const r = await listFiles(tokens[s]);
      let fetched = 0;
      for (const f of r.files) if (f.url && (await fetch(f.url)).status === 200) fetched++;
      console.log(`[S112 bid GET ${s}] status ${r.status}, files ${r.files.length}, fetched ${fetched} (ruled: 0)`);
      expect(r.files, `a ${s} bid's token still lists scope documents`).toEqual([]);
      expect(fetched).toBe(0);
      expect(r.status).toBeGreaterThanOrEqual(400);
    });
  }

  it('expired — refused, as before (410)', async () => {
    const r = await listFiles(tokens.expired);
    console.log(`[S112 bid GET expired] status ${r.status}, files ${r.files.length}`);
    expect(r.status).toBe(410);
    expect(r.files).toEqual([]);
  });
});

describe('S112 /bid — the token\'s OTHER endpoints (ruling f)', () => {
  it('POST files: a cancelled bid\'s token cannot upload', async () => {
    const form = new FormData();
    form.set('file', new File([Buffer.from('%PDF-1.4 x')], `${MARKER}-late.pdf`, { type: 'application/pdf' }));
    const res = await POST(new Request(`http://x/api/bid/${tokens.cancelled}/files`, { method: 'POST', body: form }), {
      params: { token: tokens.cancelled },
    });
    const { count } = await admin
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('estimate_id', estimateId)
      .eq('file_name', `${MARKER}-late.pdf`);
    console.log(`[S112 bid POST cancelled] status ${res.status}, rows written ${count}`);
    expect(count).toBe(0);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('POST files CONTROL: a sent bid\'s token CAN upload (the refusal above is about status)', async () => {
    const form = new FormData();
    form.set('file', new File([Buffer.from('%PDF-1.4 y')], `${MARKER}-ok.pdf`, { type: 'application/pdf' }));
    const res = await POST(new Request(`http://x/api/bid/${tokens.sent}/files`, { method: 'POST', body: form }), {
      params: { token: tokens.sent },
    });
    expect(res.status).toBe(200);
  });

  it('get_sub_bid_request (anon, direct): a cancelled bid returns NO scope, message or allowance', async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { data } = await anon.rpc('get_sub_bid_request', { p_token: tokens.cancelled });
    const d = (data ?? {}) as Record<string, unknown>;
    console.log(`[S112 bid RPC cancelled] status=${String(d.status)} scope=${JSON.stringify(d.scope_text ?? null)} allowance=${JSON.stringify(d.allowance_amount ?? null)}`);
    expect(d.scope_text ?? null).toBeNull();
    expect(d.message ?? null).toBeNull();
    expect(d.allowance_amount ?? null).toBeNull();
  });

  it('get_sub_bid_request CONTROL: a submitted bid still returns its scope', async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { data } = await anon.rpc('get_sub_bid_request', { p_token: tokens.submitted });
    expect((data as Record<string, unknown>).scope_text).toBe(`${MARKER} scope text`);
  });
});
