import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, assertRebuildTest } from './live-session';

// S107 Part B — LINK → UPLOAD → LANDS, end to end, through the REAL routes.
//
// ===========================================================================
// WHAT THIS PROVES, AND WHAT IT DELIBERATELY DOES NOT
// ===========================================================================
// RULED [Josh]: the real email send is his, from a machine that has the key —
// the live Resend key does not come back to this Codespace. So this harness
// covers the half CC can prove and stops at the transport:
//
//   ✅ the token resolves to exactly this request  (get_sub_bid_request)
//   ✅ a sub uploads through the anonymous route   (real POST handler)
//   ✅ the file LANDS on the estimate              (files row + storage object)
//   ✅ the sub can read the estimator's scope docs (real GET handler)
//   ⚠️ the sub CANNOT read another sub's upload    (the leak this could cause)
//   ❌ the email itself — not here, by ruling
//
// It imports and invokes the ACTUAL route modules, the same way
// `s164-m9-client-writes.live.ts` drives the sign-co route. A test that
// re-implemented the insert would prove the test works, not the route.
//
// ⚠️ READ-ONLY on shared fixtures: every row it creates is its own and is
// removed in afterAll, including the storage objects (#144's lesson).

const MARK = 'S107E2E';
const BUCKET = 'project-files';

// A real 8x8 PNG — the route enforces a MIME allow-list, so the bytes and the
// type must actually agree.
const PNG_8 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAHElEQVQoz2P8z8Dwn4GKgIlqJo0aOGrgqIHDwEAAaSgDBaMLcOgAAAAASUVORK5CYII=',
  'base64'
);

let POST: (req: Request, ctx: { params: { token: string } }) => Promise<Response>;
let GET: (req: Request, ctx: { params: { token: string } }) => Promise<Response>;

let companyId = '';
let estimateId = '';
let categoryId = '';
let lineItemId = '';
let subId = '';
let requestId = '';
let token = '';
let staffFileId = '';
const createdFileIds: string[] = [];
const createdPaths: string[] = [];

// Row counts, asserted non-zero so nothing here can pass vacuously.
let counts = { estimatesSeen: 0, filesOnEstimateAfterUpload: 0, visibleToBidder: 0 };

beforeAll(async () => {
  assertRebuildTest();
  ({ POST, GET } = (await import('@/app/api/bid/[token]/files/route')) as never);

  // A real draft estimate on a real company — its OWN, created here, so teardown
  // cannot touch anything a person curated.
  // ⚠️ THE ERROR IS CAPTURED, NOT DISCARDED. A blocked read and an empty table
  // both give `data: null`, so `if (!seed)` alone reports "no draft estimate"
  // for a credential problem — the same false-negative shape that made `dig`
  // report "no DNS records" when `dig` was simply absent.
  const { data: seed, error: seedErr } = await admin
    .from('estimates')
    .select('company_id, contact_id, created_by')
    .eq('status', 'draft')
    .eq('is_deleted', false)
    .not('contact_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (seedErr) throw new Error(`fixture read FAILED (not "no rows"): ${seedErr.message}`);
  if (!seed) throw new Error('no draft estimate on rebuild-test to model the fixture on');
  companyId = seed.company_id as string;

  const { count } = await admin
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_deleted', false);
  counts.estimatesSeen = count ?? 0;

  const { data: est, error: estErr } = await admin
    .from('estimates')
    .insert({
      company_id: companyId,
      contact_id: seed.contact_id,
      name: `${MARK} estimate`,
      status: 'draft',
      estimate_number: `EST-${MARK}-${Date.now()}`,
      created_by_role: 'owner',
      created_by: seed.created_by,
    })
    .select('id')
    .single();
  if (estErr) throw new Error(`estimate: ${estErr.message}`);
  estimateId = est.id;

  const { data: cat } = await admin
    .from('estimate_categories')
    .insert({ company_id: companyId, estimate_id: estimateId, name: `${MARK} cat`, sort_order: 0 })
    .select('id')
    .single();
  categoryId = cat!.id;

  const { data: line } = await admin
    .from('estimate_line_items')
    .insert({
      company_id: companyId,
      estimate_id: estimateId,
      category_id: categoryId,
      name: `${MARK} framing`,
      sort_order: 0,
      total_price: 0,
    })
    .select('id')
    .single();
  lineItemId = line!.id;

  // RULED [Josh, ASK-B.1]: create the sub on rebuild-test with this address.
  const { data: sub } = await admin
    .from('subcontractors')
    .insert({
      company_id: companyId,
      company_name: `${MARK} Bidder`,
      sub_type: 'subcontractor',
      status: 'active',
      email: 'JSBishop14@gmail.com',
    })
    .select('id')
    .single();
  subId = sub!.id;

  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + 14);
  const { data: reqRow, error: reqErr } = await admin
    .from('estimate_sub_bid_requests')
    .insert({
      company_id: companyId,
      estimate_id: estimateId,
      line_item_id: lineItemId,
      subcontractor_id: subId,
      scope_text: 'Frame the second floor.',
      expires_at: expires.toISOString(),
    })
    .select('id, token')
    .single();
  if (reqErr) throw new Error(`bid request: ${reqErr.message}`);
  requestId = reqRow.id;
  token = reqRow.token;

  // A STAFF-uploaded scope document — created_by set, no sub tag. This is the
  // positive control: without it, "the bidder sees no sub uploads" would pass
  // just as well on an empty list.
  const staffPath = `${companyId}/estimates/${estimateId}/${MARK}-plans.png`;
  await admin.storage.from(BUCKET).upload(staffPath, PNG_8, { contentType: 'image/png', upsert: true });
  createdPaths.push(staffPath);
  const { data: staffFile } = await admin
    .from('files')
    .insert({
      company_id: companyId,
      project_id: null,
      estimate_id: estimateId,
      category: 'plans',
      file_name: `${MARK}-plans.png`,
      file_path: staffPath,
      file_size: PNG_8.length,
      mime_type: 'image/png',
      created_by: seed.created_by,
    })
    .select('id')
    .single();
  staffFileId = staffFile!.id;
  createdFileIds.push(staffFileId);
});

afterAll(async () => {
  if (createdFileIds.length) await admin.from('files').delete().in('id', createdFileIds);
  if (createdPaths.length) await admin.storage.from(BUCKET).remove(createdPaths);
  if (requestId) await admin.from('estimate_sub_bid_requests').delete().eq('id', requestId);
  if (estimateId) await admin.from('estimates').delete().eq('id', estimateId); // cascades line/category
  if (subId) await admin.from('subcontractors').delete().eq('id', subId);
  console.log(`[s107 cleanup] files=${createdFileIds.length} paths=${createdPaths.length}`);
});

describe('S107 Part B — the link resolves, the upload lands, the bidder sees only scope', () => {
  it('the fixture is non-vacuous (row counts stated)', () => {
    expect(counts.estimatesSeen, 'no estimates on the fixture company').toBeGreaterThan(0);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(estimateId).toMatch(/^[0-9a-f-]{36}$/);
    expect(staffFileId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('LINK: the token resolves to exactly this request, and to no money', async () => {
    const { data } = await admin.rpc('get_sub_bid_request', { p_token: token });
    const view = data as unknown as Record<string, unknown>;
    expect(view, 'the token did not resolve').toBeTruthy();
    expect(view.line_item_name).toBe(`${MARK} framing`);
    expect(view.estimate_name).toBe(`${MARK} estimate`);
    // The payload is a fixed 23-key allow-list; these are the money keys that
    // must NOT be in it whatever else changes.
    for (const forbidden of ['grand_total', 'subtotal', 'total_price', 'markup_percent', 'margin']) {
      expect(view, `payload leaked ${forbidden}`).not.toHaveProperty(forbidden);
    }
  });

  it('UPLOAD → LANDS: the sub posts a file through the real route and it is on the estimate', async () => {
    const form = new FormData();
    form.set('file', new File([new Uint8Array(PNG_8)], 'bid-quote.png', { type: 'image/png' }));
    const res = await POST(new Request('http://t/', { method: 'POST', body: form }), {
      params: { token },
    });
    expect(res.status, await res.text().catch(() => '')).toBe(200);

    const { data: rows } = await admin
      .from('files')
      .select('id, file_path, estimate_id, project_id, created_by, tags')
      .eq('estimate_id', estimateId)
      .eq('is_deleted', false);
    counts.filesOnEstimateAfterUpload = (rows ?? []).length;
    expect(counts.filesOnEstimateAfterUpload, 'the upload did not land').toBe(2); // staff doc + sub upload

    const subRow = (rows ?? []).find((r) => r.id !== staffFileId)!;
    createdFileIds.push(subRow.id);
    createdPaths.push(subRow.file_path as string);

    expect(subRow.estimate_id).toBe(estimateId);
    expect(subRow.project_id, 'an estimate file must not carry a project').toBeNull();
    expect(subRow.created_by, 'an anonymous upload must have no author').toBeNull();
    expect(subRow.tags, 'the sub-upload marker was not stamped').toContain('sub-bid-upload');

    // The bytes are really in storage, not just a row claiming they are.
    const { data: blob } = await admin.storage.from(BUCKET).download(subRow.file_path as string);
    expect(blob, 'the files row exists but the object does not').toBeTruthy();
  });

  it('⚠️ the bidder sees the scope document and NOT the other upload', async () => {
    const res = await GET(new Request('http://t/'), { params: { token } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { files: Array<{ id: string; file_name: string }> };
    counts.visibleToBidder = body.files.length;

    // Positive control first: the list is not empty, so the exclusion below is real.
    expect(counts.visibleToBidder, 'the bidder saw nothing — the exclusion proves nothing').toBe(1);
    expect(body.files[0].id).toBe(staffFileId);
    expect(body.files.map((f) => f.file_name)).not.toContain('bid-quote.png');
    // The payload must not carry internal fields either (#136).
    expect(body.files[0]).not.toHaveProperty('file_path');
    expect(body.files[0]).not.toHaveProperty('created_by');
  });

  it('an unknown token is refused with 404, and an expired one with 410', async () => {
    const bad = await GET(new Request('http://t/'), { params: { token: 'f'.repeat(64) } });
    expect(bad.status).toBe(404);

    await admin
      .from('estimate_sub_bid_requests')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', requestId);
    const expired = await GET(new Request('http://t/'), { params: { token } });
    expect(expired.status).toBe(410);
  });
});
