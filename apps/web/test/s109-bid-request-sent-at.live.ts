import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, assertRebuildTest } from './live-session';

// S109 #159 — `estimate_sub_bid_requests.sent_at` MEANS SENT.
//
// Before 20261700000000 the column was `DEFAULT now()`, so a request was
// "sent" the moment it was created and the Send label was dead code. This
// harness creates a request the way `createSubBidRequest` does (no sent_at in
// the payload) and asserts the column is NULL.
//
// ⚠️ THE PROBE MUST BE ABLE TO FIRE. Before the migration this exact insert
// returned a timestamp (rebuild-test's column_default read `now()`, measured
// S109 Phase 1). The CONTROL row sets sent_at explicitly — what the send route
// does — and must come back stamped; without it, "NULL" could equally mean
// the column is simply never written.
//
// Every row here is its own and is removed in afterAll.

const MARK = 'S109SENTAT';

let companyId = '';
let estimateId = '';
let subId = '';
const requestIds: string[] = [];
let estimatesSeen = 0;

beforeAll(async () => {
  assertRebuildTest();

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
  companyId = seed.company_id as string;

  const { count } = await admin
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_deleted', false);
  estimatesSeen = count ?? 0;

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

  const { data: sub, error: subErr } = await admin
    .from('subcontractors')
    .insert({ company_id: companyId, company_name: `${MARK} Sub`, sub_type: 'subcontractor', status: 'active' })
    .select('id')
    .single();
  if (subErr) throw new Error(`sub: ${subErr.message}`);
  subId = sub.id;
});

afterAll(async () => {
  if (requestIds.length) await admin.from('estimate_sub_bid_requests').delete().in('id', requestIds);
  if (estimateId) await admin.from('estimates').delete().eq('id', estimateId);
  if (subId) await admin.from('subcontractors').delete().eq('id', subId);
});

async function insertLine(n: number): Promise<string> {
  const { data: cat } = await admin
    .from('estimate_categories')
    .insert({ company_id: companyId, estimate_id: estimateId, name: `${MARK} cat ${n}`, sort_order: n })
    .select('id')
    .single();
  const { data: line, error } = await admin
    .from('estimate_line_items')
    .insert({
      company_id: companyId,
      estimate_id: estimateId,
      category_id: cat!.id,
      name: `${MARK} line ${n}`,
      sort_order: 0,
      total_price: 0,
    })
    .select('id')
    .single();
  if (error) throw new Error(`line: ${error.message}`);
  return line.id;
}

async function insertRequest(lineItemId: string, extra: Record<string, unknown> = {}) {
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + 14);
  const { data, error } = await admin
    .from('estimate_sub_bid_requests')
    .insert({
      company_id: companyId,
      estimate_id: estimateId,
      line_item_id: lineItemId,
      subcontractor_id: subId,
      expires_at: expires.toISOString(),
      ...extra,
    })
    .select('id, sent_at, status')
    .single();
  if (error) throw new Error(`request: ${error.message}`);
  requestIds.push(data.id);
  return data;
}

describe('S109 #159 — a bid request is not "sent" until it is sent', () => {
  it('the fixture is non-vacuous (row counts stated)', () => {
    expect(estimatesSeen, 'no estimates on the fixture company').toBeGreaterThan(0);
    expect(estimateId).toMatch(/^[0-9a-f-]{36}$/);
    expect(subId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('a newly created request has sent_at NULL (the dead "Send" branch is reachable)', async () => {
    const row = await insertRequest(await insertLine(1));
    expect(row.sent_at, 'sent_at was stamped at INSERT — the DEFAULT is back').toBeNull();
    // ASK-159.B — status keeps its 'sent' default by ruling; the UI reads sent_at.
    expect(row.status).toBe('sent');
  });

  it('CONTROL: an explicit stamp (what the send route writes) is kept', async () => {
    const stamp = new Date().toISOString();
    const row = await insertRequest(await insertLine(2), { sent_at: stamp });
    expect(row.sent_at, 'the control could not fire — sent_at is never written').not.toBeNull();
    expect(new Date(row.sent_at as string).getTime()).toBe(new Date(stamp).getTime());
  });
});
