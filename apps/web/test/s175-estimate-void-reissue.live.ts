import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// S175 #2 / TECH_DEBT `#3-s174` — VOID AND REISSUE, and `#4-s174` CLOSED.
// ============================================================================
//
// Depends on `20261031000000`: a void on a row that can still be edited
// afterwards records nothing, which is why the freeze was built first.
//
// ⚠️ THE ASSERTION THAT CLOSES `#4-s174` IS D1. Until this migration
// `UPDATE estimates SET status = 'draft'` on a sent estimate returned **1 row**
// — unsend was not blocked, it was merely unreachable, and the only thing
// defending that boundary was the absence of a button. D1 is that write,
// refused.
//
// ⚠️ AND THE ONE THAT DIFFERS FROM THE CHANGE ORDER IS B1. S168 ruled that ANY
// sent CO may be voided, signed or unsigned. That does not carry over: a change
// order ADDS to a project, an estimate IS its origin [Josh, S175].
//
// Every refusal is mutation-proved by re-reading through the service role — a
// PostgREST error alone cannot tell a refused WRITE from a refused RETURNING.
// ============================================================================

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));

import { reissueEstimate, voidEstimate } from '@/lib/services/estimates-client';

const MARKER = 'S175VOID';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const ADMIN_U = 'josh+qa-admin@worthprop.com';

type Client = SupabaseClient<Database>;
let ownerC: Client;
let pmC: Client;
let adminC: Client;
let companyId: string;
let contactId: string;
const made: string[] = [];

const must = (l: string, e: { message: string } | null) => { if (e) throw new Error(`${l}: ${e.message}`); };
const row = async (id: string) => (await admin.from('estimates').select('*').eq('id', id).single()).data!;

async function sweep(): Promise<void> {
  const { data: ests } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = (ests ?? []).map((e) => e.id);
  if (!ids.length) return;
  // Reissues point at the voided originals — clear the link before deleting, or
  // the FK refuses and the sweep fails silently into the next run.
  await admin.from('estimates').update({ supersedes_estimate_id: null }).in('id', ids);
  await admin.from('signing_sessions').delete().in('estimate_id', ids);
  await admin.from('email_logs').delete().in('estimate_id', ids);
  const { data: li } = await admin.from('estimate_line_items').select('id').in('estimate_id', ids);
  const lids = (li ?? []).map((l) => l.id);
  if (lids.length) {
    await admin.from('estimate_line_rows').delete().in('line_item_id', lids);
    await admin.from('estimate_line_items').delete().in('id', lids);
  }
  await admin.from('estimate_subcategories').delete().in('estimate_id', ids);
  await admin.from('estimate_categories').delete().in('estimate_id', ids);
  must('sweep estimates', (await admin.from('estimates').delete().in('id', ids)).error);
}

async function makeSent(label: string, as: Client = ownerC): Promise<string> {
  const { data, error } = await as
    .from('estimates')
    .insert({ name: `${MARKER} ${label}`, contact_id: contactId, status: 'draft' })
    .select('id').single();
  must(`create ${label}`, error);
  must(`send ${label}`, (await admin.from('estimates')
    .update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', data!.id)).error);
  made.push(data!.id);
  return data!.id;
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  [ownerC, pmC, adminC] = (await Promise.all([sessionFor(OWNER), sessionFor(PM), sessionFor(ADMIN_U)])) as Client[];
  const { data: co } = await admin.from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = co!.id;
  const { data: c } = await admin.from('contacts').select('id').eq('company_id', companyId).limit(1).single();
  contactId = c!.id;
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin.from('estimates').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  expect(count, 'estimates left behind').toBe(0);
}, 240_000);

// ───────────────────────────────────────────────────────────────────────────
describe('S175-A — the void, and its record', () => {
  it('A1 — an Owner voids a sent estimate with a reason, and the whole record lands', async () => {
    const e = await makeSent('owner-void');
    state.client = ownerC;
    const r = await voidEstimate(e, 'Client changed the scope before signing.');
    expect(r.success, r.error).toBe(true);
    const v = await row(e);
    expect(v.status).toBe('voided');
    expect(v.void_reason).toBe('Client changed the scope before signing.');
    expect(v.voided_at).not.toBeNull();
    // ⚠️ Stamped from auth.uid(), never from the payload — S168's rule, so the
    // record cannot name someone who did not do it.
    expect(v.voided_by).not.toBeNull();
  });

  it('A2 — a reason is REQUIRED, and an empty one is refused before it reaches the row', async () => {
    const e = await makeSent('no-reason');
    state.client = ownerC;
    const r = await voidEstimate(e, '   ');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/needs a reason/i);
    expect((await row(e)).status).toBe('sent'); // mutation-proved
  });

  it('A2b — and the DATABASE refuses it too, not just the service', async () => {
    // The service check exists so an empty box does not cost a round trip. It
    // is not the gate — this is. Without this assertion the service check would
    // be the only thing standing between a blank reason and the record.
    const e = await makeSent('db-reason');
    const { error } = await admin.from('estimates')
      .update({ status: 'voided', voided_at: new Date().toISOString(), voided_by: null }).eq('id', e);
    expect(error).not.toBeNull();
    expect((await row(e)).status).toBe('sent');
  });

  it('A3 — the void record cannot be rewritten afterwards', async () => {
    const e = await makeSent('frozen-record');
    state.client = ownerC;
    must('void', (await voidEstimate(e, 'Original reason.')).error ? { message: 'void failed' } : null);
    const { error } = await admin.from('estimates').update({ void_reason: 'Something else.' }).eq('id', e);
    expect(error, 'the void reason was rewritten').not.toBeNull();
    expect(error!.message).toMatch(/cannot be rewritten/i);
    expect((await row(e)).void_reason).toBe('Original reason.'); // mutation-proved
  });

  it('A4 — a voided estimate is frozen forever and never returns to life', async () => {
    const e = await makeSent('terminal');
    state.client = ownerC;
    await voidEstimate(e, 'Withdrawn.');
    const { error } = await admin.from('estimates').update({ status: 'sent' }).eq('id', e);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/frozen forever/i);
    expect((await row(e)).status).toBe('voided');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-B — ⚠️ a CONVERTED estimate may NOT be voided. This is where the CO ruling does not carry over', () => {
  it('B1 — the refusal fires and NAMES THE PROJECT', async () => {
    // A change order ADDS to a project; an estimate IS its origin. A converted
    // estimate is load-bearing through projects.source_estimate_id,
    // project_financials.contract_value and every budget line derived from it.
    const { data: proj } = await admin
      .from('projects')
      .select('id, name, source_estimate_id')
      .not('source_estimate_id', 'is', null)
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle();
    // Scoped, not merely ordered: the dependency is "this estimate converted
    // into a project", which no ordering can supply (CLAUDE.md .limit(1) rule).
    if (!proj) throw new Error('no converted estimate in the fixture company — B1 cannot run');

    state.client = ownerC;
    const r = await voidEstimate(proj.source_estimate_id!, 'Trying to withdraw a live project.');
    expect(r.success, 'a CONVERTED estimate was voided').toBe(false);
    expect(r.error).toMatch(/converted into the project/i);
    expect(r.error, 'the refusal did not name the project').toContain(proj.name);
    // Mutation-proved on a row this harness does not own — it must be untouched.
    expect((await row(proj.source_estimate_id!)).status).toBe('converted');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-C — authority: Owner, Admin, or the AUTHORING PM', () => {
  it('C1 — an Admin may void', async () => {
    const e = await makeSent('admin-void');
    state.client = adminC;
    const r = await voidEstimate(e, 'Admin withdrawal.');
    expect(r.success, r.error).toBe(true);
    expect((await row(e)).status).toBe('voided');
  });

  it('C2 — a PM may void THEIR OWN estimate', async () => {
    const e = await makeSent('pm-own', pmC);
    state.client = pmC;
    const r = await voidEstimate(e, 'PM withdrawing their own.');
    expect(r.success, r.error).toBe(true);
    expect((await row(e)).status).toBe('voided');
  });

  it('C3 — and a PM may NOT void an estimate they did not write', async () => {
    // The paired negative. Without C2 this passes against a PM who cannot void
    // anything; without C3, C2 proves only that voiding works.
    const e = await makeSent('pm-not-own', ownerC);
    state.client = pmC;
    const r = await voidEstimate(e, 'Not mine to withdraw.');
    expect(r.success, 'a PM voided an estimate they did not author').toBe(false);
    expect((await row(e)).status).toBe('sent'); // mutation-proved
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-D — ⚠️ `#4-s174` CLOSED: unsend is refused by the DATABASE', () => {
  it('D1 — sent → draft is refused. Until now this returned 1 row', async () => {
    const e = await makeSent('unsend');
    const before = await row(e);
    const { error } = await admin.from('estimates').update({ status: 'draft' }).eq('id', e);
    expect(error, 'UNSEND STILL WORKS — #4-s174 is not closed').not.toBeNull();
    expect(error!.message).toMatch(/cannot be returned to draft/i);
    expect((await row(e)).status).toBe(before.status); // mutation-proved
  });

  it('D2 — and sent → review is refused too: the same door, one step along', async () => {
    const e = await makeSent('unreview');
    const { error } = await admin.from('estimates').update({ status: 'review' }).eq('id', e);
    expect(error).not.toBeNull();
    expect((await row(e)).status).toBe('sent');
  });

  it('D3 — forward transitions still work, so the refusal is backwards-only', async () => {
    // The paired positive. A rule that refused every status change would pass
    // D1 and D2 and break acceptance, expiry and conversion.
    const e = await makeSent('forward');
    const { error } = await admin.from('estimates')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', e);
    expect(error, 'the backwards rule caught a FORWARD transition').toBeNull();
    expect((await row(e)).status).toBe('accepted');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-E — reissue', () => {
  it('E1 — a voided estimate reissues as a fresh DRAFT linked to it', async () => {
    const e = await makeSent('reissue-src');
    state.client = ownerC;
    await voidEstimate(e, 'Superseded by a revised scope.');
    const r = await reissueEstimate(e);
    expect(r.success, r.error).toBe(true);
    made.push(r.id!);
    const fresh = await row(r.id!);
    expect(fresh.status).toBe('draft');
    expect(fresh.supersedes_estimate_id).toBe(e);
    expect(fresh.estimate_number).not.toBe((await row(e)).estimate_number);
  });

  it('E2 — ONE reissue per withdrawal, ever', async () => {
    const e = await makeSent('reissue-once');
    state.client = ownerC;
    await voidEstimate(e, 'First withdrawal.');
    const first = await reissueEstimate(e);
    expect(first.success).toBe(true);
    made.push(first.id!);
    const second = await reissueEstimate(e);
    // The clone succeeds and the LINK is refused by estimates_supersedes_once,
    // so the error names the salvage step rather than pretending nothing was
    // created — which is what the second-statement window costs.
    if (second.id) made.push(second.id);
    expect(second.success, 'a second reissue linked to the same withdrawal').toBe(false);
    const { count } = await admin.from('estimates')
      .select('id', { count: 'exact', head: true }).eq('supersedes_estimate_id', e);
    expect(count).toBe(1);
  });

  it('E3 — an estimate may only supersede a VOIDED one', async () => {
    const live = await makeSent('still-live');
    const other = await makeSent('would-be-reissue');
    const { error } = await admin.from('estimates')
      .update({ supersedes_estimate_id: live }).eq('id', other);
    expect(error, 'a live estimate was superseded without being voided').not.toBeNull();
    expect(error!.message).toMatch(/only supersede a VOIDED one/i);
    expect((await row(other)).supersedes_estimate_id).toBeNull(); // mutation-proved
  });

  it('E4 — and it may not supersede itself', async () => {
    const { data: d } = await ownerC.from('estimates')
      .insert({ name: `${MARKER} self`, contact_id: contactId, status: 'draft' })
      .select('id').single();
    made.push(d!.id);
    const { error } = await admin.from('estimates')
      .update({ supersedes_estimate_id: d!.id }).eq('id', d!.id);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/cannot supersede itself/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-F — the retired vocabulary', () => {
  it('F1 — `revised` is gone from the CHECK and cannot be written', async () => {
    // Josh: "a dead `revised` beside a live `voided` is a trap." Verified zero
    // rows carried it before the drop; this stops it coming back.
    const e = await makeSent('revised-gone');
    const { error } = await admin.from('estimates').update({ status: 'revised' }).eq('id', e);
    expect(error, '`revised` is still an accepted status').not.toBeNull();
    expect((await row(e)).status).toBe('sent');
  });

  it('F2 — and the two vestigial COLUMNS still exist, deliberately, carrying their warning', async () => {
    // They are commented, not dropped: dropping a column with an FK and an
    // index is a bigger change than that migration should make, and two live
    // readers (the builder header, the proposal PDF) still render
    // version_number. The assertion is that they were not quietly removed.
    const r = await row(await makeSent('vestigial'));
    expect(r).toHaveProperty('parent_estimate_id');
    expect(r).toHaveProperty('version_number');
    expect(r.parent_estimate_id, 'something started writing parent_estimate_id').toBeNull();
  });
});
