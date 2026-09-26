import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { ANON, URL_, admin, assertRebuildTest, sessionFor } from './live-session';
import { GET, POST } from '../app/api/bid/[token]/files/route';

// ============================================================================
// S112 — /bid/{token}: the token proves WHO, the bid's CURRENT state decides
// WHETHER. rebuild-test only.
// ============================================================================
// RULED [Josh, S112], two rounds:
//   status   cancelled / declined → refused at once; submitted → served;
//            expired → refused, as before;
//   action   Cancel and Decline must EXIST (nothing wrote either status);
//   award    awarding a line closes every LOSING bidder's token, immediately;
//            the winner stays live (until expiry, or conversion — see below);
//   estimate converted, voided or deleted → every token on it closed;
//   (f)      every endpoint behind the token: GET files, POST files, and
//            get_sub_bid_request — ~~(`anon` may call it directly)~~ SUPERSEDED by the
//            anon lockdown (20261870000000): the page calls it with the service
//            role, and a direct anon call is refused outright (asserted below).
//
// NEGATIVE FIRST, twice over: the status cases were run against origin/main
// (4 red: a cancelled token listed and fetched the scope, uploaded, and read
// the allowance); this full file was run before 20261860000000 was applied.
//
// Everything on its OWN draft estimate with two line items, created and
// removed here — the estimate-wide states (converted, voided, deleted) are
// applied to it and reverted, and touch nothing shared.
// ============================================================================

const MARKER = 'S112BIDSTATUS';
const OWNER = 'josh+test50@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const BUCKET = 'project-files';

let companyId = '';
let estimateId = '';
let ownerUserId = '';
const lines: Record<'A' | 'B', string> = { A: '', B: '' };
const subs: string[] = [];
const tokens: Record<string, string> = {};
const reqIds: Record<string, string> = {};

const future = () => new Date(Date.now() + 7 * 86_400_000).toISOString();

async function newRequest(
  key: string,
  opts: {
    status?: string;
    line?: 'A' | 'B';
    sub?: number;
    expiresAt?: string;
    estimate?: string;
    lineId?: string;
  } = {}
) {
  const { data, error } = await admin
    .from('estimate_sub_bid_requests')
    .insert({
      company_id: companyId,
      estimate_id: opts.estimate ?? estimateId,
      line_item_id: opts.lineId ?? lines[opts.line ?? 'A'],
      subcontractor_id: subs[opts.sub ?? 0],
      status: opts.status ?? 'sent',
      expires_at: opts.expiresAt ?? future(),
      scope_text: `${MARKER} scope text`,
      message: `${MARKER} message`,
      allowance_amount: 12345,
    })
    .select('id, token')
    .single();
  expect(error, error?.message).toBeNull();
  tokens[key] = (data as { token: string }).token;
  reqIds[key] = (data as { id: string }).id;
}

/** A draft estimate of its own: a category, two line items, one STAFF scope document. */
async function makeEstimate(label: string) {
  const { data: c } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at')
    .order('id')
    .limit(1)
    .single();
  const { data: est, error: eErr } = await admin
    .from('estimates')
    .insert({
      company_id: companyId,
      name: `${MARKER} estimate ${label}`,
      estimate_number: `${MARKER}-${label}`,
      contact_id: (c as { id: string }).id,
      status: 'draft',
      created_by: ownerUserId,
      created_by_role: 'owner',
    })
    .select('id')
    .single();
  expect(eErr, eErr?.message).toBeNull();
  const estimateId = (est as { id: string }).id;
  const { data: cat, error: cErr } = await admin
    .from('estimate_categories')
    .insert({
      company_id: companyId,
      estimate_id: estimateId,
      name: `${MARKER} category`,
      sort_order: 0,
    })
    .select('id')
    .single();
  expect(cErr, cErr?.message).toBeNull();
  const out: Record<'A' | 'B', string> = { A: '', B: '' };
  for (const [k, i] of [
    ['A', 0],
    ['B', 1],
  ] as const) {
    const { data: li, error } = await admin
      .from('estimate_line_items')
      .insert({
        company_id: companyId,
        estimate_id: estimateId,
        name: `${MARKER} line ${k}`,
        sort_order: i,
        category_id: (cat as { id: string }).id,
      })
      .select('id')
      .single();
    expect(error, error?.message).toBeNull();
    out[k] = (li as { id: string }).id;
  }

  const scopePath = `${companyId}/estimates/${estimateId}/${crypto.randomUUID()}-${MARKER}-scope.pdf`;
  expect(
    (
      await admin.storage
        .from(BUCKET)
        .upload(scopePath, Buffer.from('%PDF-1.4 S112 scope'), { contentType: 'application/pdf' })
    ).error
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
    created_by: ownerUserId, // a STAFF upload...
    tags: ['bid-scope'], // ...that staff SHARED WITH BIDDERS [S112] — the only kind served
  });
  expect(ins.error, ins.error?.message).toBeNull();
  // [S112] Two staff files a bidder must NEVER be served: an unshared worksheet
  // and a site-visit photo of the client's property. Every "files.length === 1"
  // below is therefore also the proof that these are excluded.
  for (const [name, mime, capture] of [
    [`${MARKER}-internal-worksheet.pdf`, 'application/pdf', false],
    [`${MARKER}-site-visit-photo.jpg`, 'image/jpeg', true],
  ] as const) {
    const p = `${companyId}/estimates/${estimateId}/${crypto.randomUUID()}-${name}`;
    expect(
      (await admin.storage.from(BUCKET).upload(p, Buffer.from('x'), { contentType: mime })).error
    ).toBeNull();
    const r = await admin.from('files').insert({
      company_id: companyId,
      estimate_id: estimateId,
      project_id: null,
      category: 'other',
      file_name: name,
      file_path: p,
      file_size: 1,
      mime_type: mime,
      site_visit_capture: capture,
      created_by: ownerUserId,
    });
    expect(r.error, r.error?.message).toBeNull();
  }
  return { estimateId, lineA: out.A, lineB: out.B };
}

async function listFiles(token: string) {
  const res = await GET(new Request(`http://x/api/bid/${token}/files`), { params: { token } });
  const body = (await res.json()) as { files?: { url: string | null }[]; error?: string };
  return { status: res.status, files: body.files ?? [], error: body.error };
}

async function served(token: string) {
  const r = await listFiles(token);
  return r.status === 200 && r.files.length > 0;
}

async function sweep() {
  const { data: ests } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  for (const e of (ests ?? []) as { id: string }[]) {
    await admin.from('estimate_sub_bid_requests').delete().eq('estimate_id', e.id);
    await admin.from('estimate_sub_bids').delete().eq('estimate_id', e.id);
    const { data: files } = await admin
      .from('files')
      .select('id, file_path')
      .eq('estimate_id', e.id);
    for (const f of (files ?? []) as { id: string; file_path: string }[]) {
      await admin.storage.from(BUCKET).remove([f.file_path]);
      await admin.from('files').delete().eq('id', f.id);
    }
    await admin.from('estimate_line_items').delete().eq('estimate_id', e.id);
    await admin.from('estimate_categories').delete().eq('estimate_id', e.id);
    await admin.from('estimates').delete().eq('id', e.id);
  }
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  const { data: owner } = await admin
    .from('profiles')
    .select('user_id, company_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  ownerUserId = (owner as { user_id: string }).user_id;
  companyId = (owner as { company_id: string }).company_id;

  // Any contact, any two subs, any line category — ordered so the picks are
  // stable; nothing downstream depends on which.
  const { data: c } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at')
    .order('id')
    .limit(1)
    .single();
  const { data: s } = await admin
    .from('subcontractors')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at')
    .order('id')
    .limit(2);
  subs.push(...((s ?? []) as { id: string }[]).map((r) => r.id));
  expect(subs.length, 'need two subcontractors').toBe(2);

  const main = await makeEstimate('main');
  estimateId = main.estimateId;
  lines.A = main.lineA;
  lines.B = main.lineB;

  for (const st of ['sent', 'viewed', 'submitted', 'cancelled', 'declined'])
    await newRequest(st, { status: st });
  await newRequest('expired', { expiresAt: new Date(Date.now() - 86_400_000).toISOString() });
  await newRequest('toCancel');
  await newRequest('toDecline', { status: 'submitted' });
  await newRequest('crewTry');
  await newRequest('winner', { line: 'B', sub: 0, status: 'submitted' });
  await newRequest('loser', { line: 'B', sub: 1, status: 'submitted' });
}, 180_000);

afterAll(async () => {
  await sweep();
}, 180_000);

describe("1. status — the bid's current status decides", () => {
  for (const s of ['sent', 'viewed', 'submitted'] as const) {
    it(`${s} — SERVED, and the URL fetches (control)`, async () => {
      const r = await listFiles(tokens[s]);
      console.log(`[S112 bid GET ${s}] status ${r.status}, files ${r.files.length}`);
      expect(r.status).toBe(200);
      expect(r.files.length).toBe(1);
      expect((await fetch(r.files[0].url!)).status).toBe(200);
      // [S112] exactly the SHARED document — never the worksheet or the site-visit photo.
      expect((r.files as unknown as { file_name: string }[]).map((x) => x.file_name)).toEqual([
        `${MARKER}-scope.pdf`,
      ]);
    });
  }
  for (const s of ['cancelled', 'declined'] as const) {
    it(`${s} — REFUSED: 0 files, no URL`, async () => {
      const r = await listFiles(tokens[s]);
      console.log(`[S112 bid GET ${s}] status ${r.status}, files ${r.files.length} (ruled: 0)`);
      expect(r.files).toEqual([]);
      expect(r.status).toBe(403);
    });
  }
  it('expired — 410, as before', async () => {
    const r = await listFiles(tokens.expired);
    expect(r.status).toBe(410);
    expect(r.files).toEqual([]);
  });
});

describe('2. the Cancel and Decline actions exist, and bite at once', () => {
  it('owner CANCELS a sent request → its token is refused on the next request', async () => {
    expect(await served(tokens.toCancel), 'control: served before the cancel').toBe(true);
    const owner = await sessionFor(OWNER);
    const { error } = await owner.rpc('close_sub_bid_request', {
      p_request_id: reqIds.toCancel,
      p_status: 'cancelled',
    });
    expect(error, error?.message).toBeNull();
    const r = await listFiles(tokens.toCancel);
    console.log(`[S112 bid cancel] after cancel: status ${r.status}, files ${r.files.length}`);
    expect(r.status).toBe(403);
    expect(r.files).toEqual([]);
  });

  it('owner DECLINES a submitted bid → refused', async () => {
    expect(await served(tokens.toDecline)).toBe(true);
    const owner = await sessionFor(OWNER);
    const { error } = await owner.rpc('close_sub_bid_request', {
      p_request_id: reqIds.toDecline,
      p_status: 'declined',
    });
    expect(error, error?.message).toBeNull();
    expect((await listFiles(tokens.toDecline)).status).toBe(403);
  });

  it('a crew member CANNOT cancel (RLS decides who) — and the token stays served', async () => {
    const crew = await sessionFor(CREW);
    const { error } = await crew.rpc('close_sub_bid_request', {
      p_request_id: reqIds.crewTry,
      p_status: 'cancelled',
    });
    expect(error).not.toBeNull();
    const { data } = await admin
      .from('estimate_sub_bid_requests')
      .select('status')
      .eq('id', reqIds.crewTry)
      .single();
    expect((data as { status: string }).status).toBe('sent');
    expect(await served(tokens.crewTry)).toBe(true);
  });

  it('only cancelled/declined can be written, and decline only from submitted', async () => {
    const owner = await sessionFor(OWNER);
    const bad = await owner.rpc('close_sub_bid_request', {
      p_request_id: reqIds.crewTry,
      p_status: 'submitted',
    });
    expect(bad.error).not.toBeNull();
    const early = await owner.rpc('close_sub_bid_request', {
      p_request_id: reqIds.crewTry,
      p_status: 'declined',
    });
    expect(early.error).not.toBeNull();
    const { data } = await admin
      .from('estimate_sub_bid_requests')
      .select('status')
      .eq('id', reqIds.crewTry)
      .single();
    expect((data as { status: string }).status).toBe('sent');
  });
});

describe('3. award — the LOSING bidder is closed at once; the winner is not', () => {
  it('before the award: both bidders served (control)', async () => {
    expect(await served(tokens.winner)).toBe(true);
    expect(await served(tokens.loser)).toBe(true);
  });
  it('after the award: loser 403, winner 200', async () => {
    const ins = await admin.from('estimate_sub_bids').insert({
      company_id: companyId,
      estimate_id: estimateId,
      line_item_id: lines.B,
      subcontractor_id: subs[0],
      bid_amount: 1000,
      is_winner: true,
    });
    expect(ins.error, ins.error?.message).toBeNull();
    const l = await listFiles(tokens.loser);
    const w = await listFiles(tokens.winner);
    console.log(
      `[S112 bid award] loser ${l.status}/${l.files.length}, winner ${w.status}/${w.files.length}`
    );
    expect(l.status).toBe(403);
    expect(l.files).toEqual([]);
    expect(w.status).toBe(200);
    expect(w.files.length).toBe(1);
  });
  it("an award on ANOTHER line does not touch this line's bidders", async () => {
    expect(await served(tokens.sent)).toBe(true); // line A, no winner
  });
});

describe('4. the estimate converted, voided or deleted closes every token on it', () => {
  // One-way states (a trigger forbids returning a sent estimate to draft), so
  // each case gets an estimate of its own rather than a revert.
  const cases: [string, (id: string) => Record<string, unknown>][] = [
    ['converted', () => ({ status: 'converted' })],
    [
      'voided',
      () => ({
        status: 'voided',
        void_reason: `${MARKER} test`,
        voided_by: ownerUserId,
        voided_at: new Date().toISOString(),
      }),
    ],
    ['deleted', () => ({ is_deleted: true, deleted_at: new Date().toISOString() })],
  ];
  for (const [name, apply] of cases) {
    it(`${name} → 403 (served before: control)`, async () => {
      const e = await makeEstimate(name);
      await newRequest(`est-${name}`, { estimate: e.estimateId, lineId: e.lineA });
      expect(await served(tokens[`est-${name}`]), 'control: served before').toBe(true);
      const u = await admin.from('estimates').update(apply(e.estimateId)).eq('id', e.estimateId);
      expect(u.error, u.error?.message).toBeNull();
      const r = await listFiles(tokens[`est-${name}`]);
      console.log(`[S112 bid estimate ${name}] status ${r.status}, files ${r.files.length}`);
      expect(r.status).toBe(403);
      expect(r.files).toEqual([]);
    });
  }
});

describe("4b. RULED [Josh]: the WINNER's link survives conversion; the loser's does not", () => {
  it('converted with an award on the line → winner 200, loser 403', async () => {
    const e = await makeEstimate('winner-conv');
    await newRequest('conv-winner', {
      estimate: e.estimateId,
      lineId: e.lineA,
      sub: 0,
      status: 'submitted',
    });
    await newRequest('conv-loser', {
      estimate: e.estimateId,
      lineId: e.lineA,
      sub: 1,
      status: 'submitted',
    });
    const ins = await admin.from('estimate_sub_bids').insert({
      company_id: companyId,
      estimate_id: e.estimateId,
      line_item_id: e.lineA,
      subcontractor_id: subs[0],
      bid_amount: 1000,
      is_winner: true,
    });
    expect(ins.error, ins.error?.message).toBeNull();
    const u = await admin.from('estimates').update({ status: 'converted' }).eq('id', e.estimateId);
    expect(u.error, u.error?.message).toBeNull();
    const w = await listFiles(tokens['conv-winner']);
    const l = await listFiles(tokens['conv-loser']);
    console.log(
      `[S112 bid converted+award] winner ${w.status}/${w.files.length}, loser ${l.status}/${l.files.length}`
    );
    expect(w.status).toBe(200);
    expect(w.files.length).toBe(1);
    expect(l.status).toBe(403);
    expect(l.files).toEqual([]);
  });
});

describe("5. the token's OTHER endpoints (ruling f)", () => {
  it("POST files: a cancelled bid's token cannot upload", async () => {
    const form = new FormData();
    form.set(
      'file',
      new File([Buffer.from('%PDF-1.4 x')], `${MARKER}-late.pdf`, { type: 'application/pdf' })
    );
    const res = await POST(
      new Request(`http://x/api/bid/${tokens.cancelled}/files`, { method: 'POST', body: form }),
      {
        params: { token: tokens.cancelled },
      }
    );
    const { count } = await admin
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('estimate_id', estimateId)
      .eq('file_name', `${MARKER}-late.pdf`);
    console.log(`[S112 bid POST cancelled] status ${res.status}, rows written ${count}`);
    expect(count).toBe(0);
    expect(res.status).toBe(403);
  });

  it("POST files CONTROL: a sent bid's token CAN upload", async () => {
    const form = new FormData();
    form.set(
      'file',
      new File([Buffer.from('%PDF-1.4 y')], `${MARKER}-ok.pdf`, { type: 'application/pdf' })
    );
    const res = await POST(
      new Request(`http://x/api/bid/${tokens.sent}/files`, { method: 'POST', body: form }),
      {
        params: { token: tokens.sent },
      }
    );
    expect(res.status).toBe(200);
  });

  // ==========================================================================
  // ⚠️ INVERTED IN PLACE [S112, Josh — merge-order ruling]. The anon lockdown
  // (20261870000000) removed anon's EXECUTE on get_sub_bid_request, so the
  // direct anon call this block used to make is now refused outright. The
  // superseded assertions, QUOTED rather than deleted:
  //
  //   it(`get_sub_bid_request (anon, direct): ${k} returns NO scope, message or allowance`, …
  //     const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  //     const { data } = await anon.rpc('get_sub_bid_request', { p_token: tokens[k] });
  //     expect(d.scope_text ?? null).toBeNull();
  //     expect(d.message ?? null).toBeNull();
  //     expect(d.allowance_amount ?? null).toBeNull();
  //
  //   it('get_sub_bid_request CONTROL: a submitted, open bid still returns its scope', …
  //     const anon = createClient(URL_, ANON, …);
  //     const { data } = await anon.rpc('get_sub_bid_request', { p_token: tokens.submitted });
  //     expect(data.scope_text).toBe(`${MARKER} scope text`);
  //
  // (An intermediate edit, b99c41be, swapped the caller to the service role
  // but rewrote those lines instead of quoting them. Restored here.)
  //
  // WHAT THE REPLACEMENT PROVES — the same claim, made STRONGER, not moved:
  // the ruling is that a closed token gets only status, expiry and company
  // name. The old test checked three named fields were absent, which a NEW
  // leaked field (estimate, line item, the sub's reply) would have passed.
  // This asserts the EXACT key set, so any added key fails it. The caller is
  // the service role because that is how /bid/[token]/page.tsx calls it — the
  // payload under test is the one a sub actually receives.
  // ==========================================================================
  const CLOSED_KEYS = ['company_name', 'expires_at', 'is_expired', 'status', 'token'];

  for (const k of ['cancelled', 'loser'] as const) {
    it(`get_sub_bid_request (as the page calls it): ${k} returns ONLY status, expiry and company name`, async () => {
      const { data, error } = await admin.rpc('get_sub_bid_request', { p_token: tokens[k] });
      expect(error, error?.message).toBeNull();
      const d = (data ?? {}) as Record<string, unknown>;
      console.log(
        `[S112 bid RPC ${k}] keys=${Object.keys(d).sort().join(',')} status=${String(d.status)}`
      );
      expect(Object.keys(d).sort()).toEqual(CLOSED_KEYS);
      expect(d.token).toBe(tokens[k]);
      expect(['cancelled', 'declined', 'expired']).toContain(d.status);
      const { data: co } = await admin
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .single();
      expect(d.company_name).toBe((co as { name: string }).name);
      // The three the old test named, kept as a readable second statement.
      expect(d.scope_text ?? null).toBeNull();
      expect(d.message ?? null).toBeNull();
      expect(d.allowance_amount ?? null).toBeNull();
    });
  }

  it('get_sub_bid_request CONTROL: a submitted, open bid still returns its scope — and MORE than the closed keys', async () => {
    const { data } = await admin.rpc('get_sub_bid_request', { p_token: tokens.submitted });
    const d = data as Record<string, unknown>;
    expect(d.scope_text).toBe(`${MARKER} scope text`);
    // The control that must fire: an OPEN token's payload is not the closed
    // shape, so the key-set assertion above is not passing on every payload.
    expect(Object.keys(d).sort()).not.toEqual(CLOSED_KEYS);
  });

  for (const k of ['cancelled', 'submitted'] as const) {
    it(`get_sub_bid_request is NOT callable by anon at all — ${k} token (S112 lockdown; the page uses the service role)`, async () => {
      const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
      const { data, error } = await anon.rpc('get_sub_bid_request', { p_token: tokens[k] });
      expect(data).toBeNull();
      expect(error?.message ?? '').toMatch(/permission denied|42501/i);
    });
  }

  it('bid_token_state is NOT callable by anon (it would be a token oracle)', async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { error } = await anon.rpc('bid_token_state', { p_token: tokens.sent });
    expect(error).not.toBeNull();
  });
});
