// S108 Spec A — the FLOOR, on the wire (audit 6), and the rest of the site-visit
// rules at the database.
//
// ⚠️ THE CLAIM UNDER TEST: a crew member who records a visit receives NO money
// column — before AND after promotion — and keeps READ of what they captured.
// Every assertion runs on the crew member's REAL session (RLS + RPC grants), and
// every "zero rows" is paired with a count that proves the rows exist, because a
// test that passes on zero rows proves nothing.
//
// Fixtures are created by the RPCs themselves (that is part of what is tested)
// and swept by MARKER at both ends.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveEstimateFileAccess } from '@/lib/site-visits/access';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const MARKER = 'S108A-VISIT';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';

// Every money-bearing column on `estimates` (FILL-A1). None may appear on any
// row a recorder can read.
const MONEY = [
  'subtotal', 'tax_total', 'discount_total', 'grand_total', 'tax_rate',
  'subcontractor_markup_percent', 'material_markup_percent', 'labor_markup_percent',
  'discount_type', 'discount_amount', 'retainage_percent', 'deposit_percent',
  'projected_value', 'pricing_mode', 'contract_type', 'proposal_pricing_level',
  'total_price', 'amount', 'rate', 'unit_cost', 'net_delta', 'contract_value',
];

let ownerC: SupabaseClient;
let pmC: SupabaseClient;
let crewC: SupabaseClient;
let foremanC: SupabaseClient;
let subC: SupabaseClient;
let crewUid = '';
let companyId = '';
let contactId = '';
let visitId = ''; // = the estimate id
let seqBefore = 0;

async function sweep() {
  const { data: ests } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = (ests ?? []).map((e) => e.id);
  if (ids.length) {
    await admin.from('files').delete().in('estimate_id', ids);
    await admin.from('estimates').delete().in('id', ids); // cascades site_visit_* rows
  }
  await admin.from('contacts').delete().like('first_name', `${MARKER}%`);
}

function moneyKeys(row: Record<string, unknown>): string[] {
  return Object.keys(row).filter((k) => MONEY.includes(k));
}

async function sequence(): Promise<number> {
  const { data } = await admin.from('companies').select('estimate_number_sequence').eq('id', companyId).single();
  return Number((data as { estimate_number_sequence: number }).estimate_number_sequence);
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  [ownerC, pmC, crewC, foremanC, subC] = await Promise.all([
    sessionFor(OWNER),
    sessionFor(PM),
    sessionFor(CREW),
    sessionFor(FOREMAN),
    sessionFor(SUB),
  ]);
  const { data: p } = await admin
    .from('profiles')
    .select('user_id, company_id')
    .eq('email', CREW)
    .eq('is_deleted', false)
    .single();
  crewUid = (p as { user_id: string }).user_id;
  companyId = (p as { company_id: string }).company_id;
  // Any existing contact will do for the "existing contact" arm; nothing below
  // depends on which one. Ordered so the pick is stable.
  const { data: c } = await admin
    .from('contacts')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single();
  contactId = (c as { id: string }).id;
  seqBefore = await sequence();
}, 120_000);

afterAll(async () => {
  await sweep();
}, 120_000);

describe('S108 A — 1. a CREW member records a visit, through the RPC only', () => {
  it('1a — create_site_visit on the crew session, with a NEW contact and address', async () => {
    const { data, error } = await crewC.rpc('create_site_visit', {
      p_title: `${MARKER} kitchen`,
      p_new_contact: { first_name: `${MARKER} Pat`, last_name: 'Homeowner', phone: '555-0100' },
      p_new_address: { address_line1: '1 Test St', city: 'Testville', state: 'NC', zip: '27000' },
    });
    expect(error, error?.message).toBeNull();
    expect(data).toMatch(/^[0-9a-f-]{36}$/);
    visitId = data as string;
  });

  it('1b — the estimate row exists, is a site_visit, and has NO number — and the sequence was not burned', async () => {
    const { data } = await admin.from('estimates').select('status, estimate_number, created_by').eq('id', visitId).single();
    expect(data).toMatchObject({ status: 'site_visit', estimate_number: null, created_by: crewUid });
    expect(await sequence(), 'creating a visit consumed a client-visible estimate number').toBe(seqBefore);
  });

  it('1c — the crew member captures: 1 condition, 1 scope, 1 blocker, 1 measurement (computed sq ft)', async () => {
    for (const [kind, body] of [
      ['condition', 'Tile is cracked, subfloor may be soft'],
      ['scope', 'Demo tile, level, install LVP'],
      ['blocker', 'Need crawlspace access'],
    ] as const) {
      const r = await crewC.rpc('save_site_visit_note', { p_estimate_id: visitId, p_note_id: null, p_kind: kind, p_body: body, p_resolved: false });
      expect(r.error, r.error?.message).toBeNull();
    }
    const m = await crewC.rpc('save_site_visit_measurement', {
      p_estimate_id: visitId, p_measurement_id: null, p_area_name: 'Kitchen', p_length_ft: 12, p_width_ft: 14, p_notes: null,
    });
    expect(m.error, m.error?.message).toBeNull();
    const { data } = await admin.from('site_visit_measurements').select('square_feet').eq('estimate_id', visitId).single();
    expect(Number((data as { square_feet: number }).square_feet)).toBe(168);
  });

  // [ASK-A4 AMENDED, Josh 2026-09-23, ruling 1] Superseded case, quoted:
  // "1d — the office is told: a site_visit_recorded notification exists" — at
  // CREATION. The office is now told at FINISH, and the notifier is exercised
  // in 1.5b-ii. That creation writes NO notification through the real create
  // route is asserted in e2e/m-site-visit.spec.ts (the RPC used here cannot
  // notify either way, so a live assertion on it would pass vacuously).
});

// [S108 follow-up] FINISH is not PROMOTE. Josh's production visit became a
// numbered draft because the only "done"-shaped control was the office's
// promote button. finish_site_visit() is the recorder's "done": it stamps the
// money-free site_visits row and changes NOTHING on `estimates`.
describe('S108 A — 1.5 FINISH — the recorder\'s "done", which is NOT promotion', () => {
  let finishedAt = '';

  it('1.5a — someone who did not record it cannot finish it: the foreman and a sub are refused (42501)', async () => {
    const f = await foremanC.rpc('finish_site_visit', { p_estimate_id: visitId });
    expect(f.error?.code).toBe('42501');
    const s = await subC.rpc('finish_site_visit', { p_estimate_id: visitId });
    expect(s.error?.code).toBe('42501');
    const { data } = await admin.from('site_visits').select('finished_at').eq('estimate_id', visitId).single();
    expect((data as { finished_at: string | null }).finished_at, 'a refused finish still stamped the row').toBeNull();
  });

  it('1.5b — the CREW recorder finishes: stamped on site_visits; status STILL site_visit, NO number, sequence untouched', async () => {
    const { data, error } = await crewC.rpc('finish_site_visit', { p_estimate_id: visitId });
    expect(error, error?.message).toBeNull();
    finishedAt = data as string;
    expect(finishedAt).toBeTruthy();
    const { data: sv } = await admin.from('site_visits').select('finished_at, finished_by, promoted_at').eq('estimate_id', visitId).single();
    expect(sv).toMatchObject({ finished_by: crewUid, promoted_at: null });
    const { data: e } = await admin.from('estimates').select('status, estimate_number').eq('id', visitId).single();
    expect(e, 'FINISHING PROMOTED THE VISIT').toMatchObject({ status: 'site_visit', estimate_number: null });
    expect(await sequence(), 'finishing consumed an estimate number').toBe(seqBefore);
  });

  it('1.5b-ii — the office is told at FINISH: "ready to price", same site_visit_recorded type, finisher excluded', async () => {
    // The finish ROUTE calls this after finish_site_visit succeeds on the
    // session (an RPC cannot call app code); here the same notifier directly.
    const { notifySiteVisitReadyToPrice } = await import('@/lib/notify/site-visit-notify');
    await notifySiteVisitReadyToPrice(admin as never, visitId, crewUid);
    const { data: rows } = await admin
      .from('notifications')
      .select('title, recipient_profile_id')
      .eq('type', 'site_visit_recorded')
      .eq('source_id', visitId);
    expect((rows ?? []).length, 'no office notification was written').toBeGreaterThan(0);
    for (const r of rows ?? []) expect((r as { title: string }).title).toMatch(/^Site visit ready to price: /);
    await admin.from('notifications').delete().eq('type', 'site_visit_recorded').eq('source_id', visitId);
  });

  it('1.5c — finishing is idempotent: a second tap keeps the FIRST stamp', async () => {
    const { data, error } = await crewC.rpc('finish_site_visit', { p_estimate_id: visitId });
    expect(error, error?.message).toBeNull();
    expect(new Date(data as string).getTime()).toBe(new Date(finishedAt).getTime());
  });

  it('1.5d — after finishing, the crew member reads the stamp on their own row — and still ZERO estimate rows, no money key', async () => {
    const reads = await assertCrewSeesNoMoney('finished');
    expect(reads.site_visits).toBe(1);
    const { data } = await crewC.from('site_visits').select('*').eq('estimate_id', visitId).single();
    expect((data as { finished_at: string | null }).finished_at).not.toBeNull();
  });

  it('1.5e — finishing is a signal, not a lock (ASK-A8): the recorder can STILL correct a note until promotion', async () => {
    const { data: n } = await crewC
      .from('site_visit_notes')
      .select('id, body')
      .eq('estimate_id', visitId)
      .eq('kind', 'condition')
      .single();
    const note = n as { id: string; body: string };
    const r = await crewC.rpc('save_site_visit_note', {
      p_estimate_id: visitId, p_note_id: note.id, p_kind: 'condition', p_body: `${note.body} (checked)`, p_resolved: false,
    });
    expect(r.error, r.error?.message).toBeNull();
  });
});

async function assertCrewSeesNoMoney(phase: string) {
  // The estimate row — ZERO rows, on the crew session …
  const e = await crewC.from('estimates').select('*').eq('id', visitId);
  expect(e.error).toBeNull();
  expect(e.data ?? [], `${phase}: the crew member received the estimate row`).toHaveLength(0);
  // … while it DOES exist (non-vacuous).
  const { count } = await admin.from('estimates').select('id', { count: 'exact', head: true }).eq('id', visitId);
  expect(count).toBe(1);

  // Everything they CAN read: stated counts, and not one money key on any row.
  const reads: Record<string, number> = {};
  for (const t of ['site_visits', 'site_visit_notes', 'site_visit_measurements', 'site_visit_voice_notes']) {
    const r = await crewC.from(t).select('*').eq('estimate_id', visitId);
    expect(r.error, `${phase}: ${t}: ${r.error?.message}`).toBeNull();
    reads[t] = (r.data ?? []).length;
    for (const row of r.data ?? []) {
      expect(moneyKeys(row as Record<string, unknown>), `${phase}: ${t} carries money`).toEqual([]);
    }
  }
  return reads;
}

describe('S108 A — 2. the FLOOR, BEFORE promotion', () => {
  it('2a — crew: ZERO estimate rows; reads 1 visit, 3 notes, 1 measurement, 0 voice — no money key anywhere', async () => {
    const reads = await assertCrewSeesNoMoney('before');
    expect(reads).toEqual({ site_visits: 1, site_visit_notes: 3, site_visit_measurements: 1, site_visit_voice_notes: 0 });
  });

  it('2b — the files-route floor admits the recorder: READ own files, UPLOAD allowed (still a visit)', async () => {
    const a = await resolveEstimateFileAccess(crewC, crewUid, visitId);
    expect(a).toMatchObject({ ok: true, mode: 'recorder', canUpload: true, ownFilesOnly: true });
  });

  it('2c — a DIFFERENT crew-level user (the foreman) reads nothing and may not write', async () => {
    const r = await foremanC.from('site_visit_notes').select('id').eq('estimate_id', visitId);
    expect(r.data ?? []).toHaveLength(0);
    const w = await foremanC.rpc('save_site_visit_note', { p_estimate_id: visitId, p_note_id: null, p_kind: 'scope', p_body: 'x', p_resolved: false });
    expect(w.error?.code).toBe('42501');
    const { data: foremanUid } = await admin.from('profiles').select('user_id').eq('email', FOREMAN).eq('is_deleted', false).single();
    const a = await resolveEstimateFileAccess(foremanC, (foremanUid as { user_id: string }).user_id, visitId);
    expect(a).toMatchObject({ ok: false, status: 404 });
  });

  it('2d — a SUBCONTRACTOR cannot record a visit at all', async () => {
    const r = await subC.rpc('create_site_visit', {
      p_title: `${MARKER} sub attempt`,
      p_contact_id: contactId,
    });
    expect(r.error?.code).toBe('42501');
  });

  it('2e — the crew member may NOT promote their own visit (ASK-A3: owner/admin/PM only)', async () => {
    const r = await crewC.rpc('promote_site_visit', { p_estimate_id: visitId });
    expect(r.error?.code).toBe('42501');
  });

  it('2f — the office (PM) reads the whole visit, including the crew member\'s notes', async () => {
    const r = await pmC.from('site_visit_notes').select('id').eq('estimate_id', visitId);
    expect((r.data ?? []).length).toBe(3);
  });
});

describe('S108 A — 3. PROMOTION', () => {
  it('3a — the OWNER promotes: status draft, a real number, the sequence advanced by exactly one', async () => {
    const { data, error } = await ownerC.rpc('promote_site_visit', { p_estimate_id: visitId });
    expect(error, error?.message).toBeNull();
    expect(data).toMatch(/-\d{3,}$/);
    const { data: e } = await admin.from('estimates').select('status, estimate_number').eq('id', visitId).single();
    expect(e).toMatchObject({ status: 'draft', estimate_number: data });
    expect(await sequence()).toBe(seqBefore + 1);
  });

  it('3b — a second promotion is refused (a visit becomes a draft exactly once)', async () => {
    const r = await ownerC.rpc('promote_site_visit', { p_estimate_id: visitId });
    expect(r.error).not.toBeNull();
  });
});

describe('S108 A — 4. the FLOOR, AFTER promotion', () => {
  it('4a — crew: STILL zero estimate rows; STILL reads their 3 notes and 1 measurement; no money key', async () => {
    const reads = await assertCrewSeesNoMoney('after');
    expect(reads.site_visit_notes).toBe(3);
    expect(reads.site_visit_measurements).toBe(1);
    expect(reads.site_visits).toBe(1);
  });

  it('4b — …and has LOST every write (Q3 condition 1): note, measurement, upload', async () => {
    const n = await crewC.rpc('save_site_visit_note', { p_estimate_id: visitId, p_note_id: null, p_kind: 'scope', p_body: 'late', p_resolved: false });
    expect(n.error?.code).toBe('42501');
    const m = await crewC.rpc('save_site_visit_measurement', {
      p_estimate_id: visitId, p_measurement_id: null, p_area_name: 'Late', p_length_ft: 1, p_width_ft: 1, p_notes: null,
    });
    expect(m.error?.code).toBe('42501');
    const a = await resolveEstimateFileAccess(crewC, crewUid, visitId);
    expect(a).toMatchObject({ ok: true, mode: 'recorder', canUpload: false, ownFilesOnly: true });
  });

  it('4b-ii — after promotion the recorder cannot finish (42501) and the office cannot either (already an estimate)', async () => {
    const c = await crewC.rpc('finish_site_visit', { p_estimate_id: visitId });
    expect(c.error?.code).toBe('42501');
    const o = await ownerC.rpc('finish_site_visit', { p_estimate_id: visitId });
    expect(o.error?.code).toBe('22023');
  });

  it('4c — nothing can turn the estimate back into a site visit', async () => {
    const r = await admin.from('estimates').update({ status: 'site_visit' }).eq('id', visitId);
    expect(r.error?.message ?? '').toMatch(/cannot be turned back into a site visit/);
  });
});

// [Josh, 2026-09-23, ruling 3] The record FREEZES when the estimate is SENT —
// in the database: site_visit_access() stops admitting the office, and a
// trigger refuses every INSERT/UPDATE, including the service role's.
describe('S108 A — 4.5 FREEZE at send', () => {
  let blockerId = '';

  it('4.5a — CONTROL, still a draft: the office CAN write (so the refusals below are the send, not the office)', async () => {
    const r = await ownerC.rpc('save_site_visit_note', {
      p_estimate_id: visitId, p_note_id: null, p_kind: 'scope', p_body: 'Office addition before send', p_resolved: false,
    });
    expect(r.error, r.error?.message).toBeNull();
    const { data: acc } = await ownerC.rpc('site_visit_access', { p_estimate_id: visitId });
    expect(acc).toBe('office');
    const { data: b } = await admin
      .from('site_visit_notes')
      .select('id, resolved')
      .eq('estimate_id', visitId)
      .eq('kind', 'blocker')
      .single();
    blockerId = (b as { id: string }).id;
    expect((b as { resolved: boolean }).resolved).toBe(false);
  });

  it('4.5b — the estimate is SENT', async () => {
    const r = await admin.from('estimates').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', visitId);
    expect(r.error, r.error?.message).toBeNull();
  });

  it('4.5c — the OFFICE is refused every write (42501) and site_visit_access() no longer says office', async () => {
    const { data: acc } = await ownerC.rpc('site_visit_access', { p_estimate_id: visitId });
    expect(acc).toBeNull();
    const n = await ownerC.rpc('save_site_visit_note', {
      p_estimate_id: visitId, p_note_id: null, p_kind: 'scope', p_body: 'after send', p_resolved: false,
    });
    expect(n.error?.code).toBe('42501');
    const m = await pmC.rpc('save_site_visit_measurement', {
      p_estimate_id: visitId, p_measurement_id: null, p_area_name: 'Late', p_length_ft: 1, p_width_ft: 1, p_notes: null,
    });
    expect(m.error?.code).toBe('42501');
    // An open blocker cannot be resolved after send (ruling 3 — frozen as it stands).
    const b = await ownerC.rpc('save_site_visit_note', {
      p_estimate_id: visitId, p_note_id: blockerId, p_kind: 'blocker', p_body: 'Need crawlspace access', p_resolved: true,
    });
    expect(b.error?.code).toBe('42501');
  });

  it('4.5d — the SERVICE ROLE is refused too: the trigger, not only the RPC gate', async () => {
    const ins = await admin.from('site_visit_notes').insert({
      company_id: companyId, estimate_id: visitId, kind: 'condition', body: 'service-role insert after send',
    });
    expect(ins.error?.message ?? '').toMatch(/frozen/);
    const upd = await admin.from('site_visit_notes').update({ resolved: true }).eq('id', blockerId);
    expect(upd.error?.message ?? '').toMatch(/frozen/);
    const title = await admin.from('site_visits').update({ title: 'rewritten' }).eq('estimate_id', visitId);
    expect(title.error?.message ?? '').toMatch(/frozen/);
    const { data: still } = await admin.from('site_visit_notes').select('resolved').eq('id', blockerId).single();
    expect((still as { resolved: boolean }).resolved, 'an open blocker was resolved after send').toBe(false);
  });

  it('4.5e — the ONE admitted shape: an FK nulled (ON DELETE SET NULL of a deleted address) still succeeds', async () => {
    const { data: before } = await admin.from('site_visits').select('contact_address_id').eq('estimate_id', visitId).single();
    expect((before as { contact_address_id: string | null }).contact_address_id, 'fixture has no address').not.toBeNull();
    const r = await admin.from('site_visits').update({ contact_address_id: null }).eq('estimate_id', visitId);
    expect(r.error, r.error?.message).toBeNull();
  });

  it('4.5f — the crew recorder STILL reads their record after send: 0 estimate rows, 3 notes, no money key', async () => {
    const reads = await assertCrewSeesNoMoney('sent');
    expect(reads.site_visit_notes).toBe(3);
    expect(reads.site_visits).toBe(1);
  });
});

describe('S108 A — 5. abandon, and the list', () => {
  let second = '';
  it('5a — a second visit (existing contact), abandoned by its recorder, is soft-deleted with no number', async () => {
    const c = await crewC.rpc('create_site_visit', { p_title: `${MARKER} abandon me`, p_contact_id: contactId });
    expect(c.error, c.error?.message).toBeNull();
    second = c.data as string;
    const a = await crewC.rpc('abandon_site_visit', { p_estimate_id: second });
    expect(a.error, a.error?.message).toBeNull();
    const { data } = await admin.from('estimates').select('is_deleted, estimate_number, status').eq('id', second).single();
    expect(data).toMatchObject({ is_deleted: true, estimate_number: null, status: 'site_visit' });
    // …and an abandoned visit cannot be finished.
    const f = await crewC.rpc('finish_site_visit', { p_estimate_id: second });
    expect(f.error?.code).toBe('42501');
  });

  it('5b — a site visit never appears in the ESTIMATES list query (getEstimates excludes the status)', async () => {
    // Owner session, the same filter getEstimates() applies.
    const { data } = await ownerC
      .from('estimates')
      .select('id, status')
      .eq('is_deleted', false)
      .neq('status', 'site_visit')
      .like('name', `${MARKER}%`);
    expect((data ?? []).every((r) => r.status !== 'site_visit')).toBe(true);
    // Non-vacuous: the promoted one (now a draft) IS listed.
    expect((data ?? []).map((r) => r.id)).toContain(visitId);
  });
});
