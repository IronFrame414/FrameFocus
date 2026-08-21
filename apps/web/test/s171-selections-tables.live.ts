import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// S171 — Allowances & Selections STAGE 2: the tables and their policies.
// Migration 20261026000000_selections_tables.sql. Spec §3, §4.
// ============================================================================
//
// THE TWO FLOORS ARE THE POINT OF THIS FILE. selection_option_amounts (cost
// basis: owner/admin/PM) and selection_notes (owner/admin/PM/foreman) are the
// side-table splits that make "the project Selections tab carries no costs"
// a DATABASE fact for a subcontractor, not a renderer's omission. Every "reads
// ZERO" probe below is paired with an owner read of the SAME rows (> 0) and a
// working-session check, so no floor passes vacuously.
//
// CLIENT COUNTERFACTUAL (M9's load-bearing lesson): two real client
// identities — LINKED reaches the fixture project, CONTROL reaches none. A
// client arm that let CONTROL read would be a hole; a client arm that stopped
// LINKED reading would be a dead portal. Both directions are asserted.
//
// Every refusal is MUTATION-PROVED (re-read service-role). The fixture key is
// FIXED (MARKER) and swept by name in beforeAll — a harness that cannot collide
// with itself cannot tell you it leaked (S168).

const MARKER = 'S171SEL';
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9'; // QA A — isolation fixture
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const LINKED = 'josh+qa-client-linked@worthprop.com';
const CONTROL = 'josh+qa-client@worthprop.com';

type Client = SupabaseClient<Database>;
type Role = 'owner' | 'pm' | 'foreman' | 'crew' | 'sub' | 'linked' | 'control';
const S: Partial<Record<Role, Client>> = {};
const profileId: Partial<Record<Role, string>> = {};

let companyId: string;
let areaId: string;
let draftId: string; // stays draft — the client must NOT see it
let liveId: string; // in_discussion — the client sees it
let optionId: string;
let threadId: string;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

async function sweep(): Promise<void> {
  const { data: sels } = await admin.from('selections').select('id').like('name', `${MARKER}%`);
  const ids = (sels ?? []).map((s) => s.id);
  if (ids.length) {
    await admin.from('selections').update({ signed_session_id: null }).in('id', ids);
    await admin.from('selection_signing_sessions').delete().in('selection_id', ids);
    const { data: threads } = await admin.from('selection_threads').select('id').in('selection_id', ids);
    const tids = (threads ?? []).map((t) => t.id);
    if (tids.length) {
      const { data: msgs } = await admin.from('selection_messages').select('id').in('thread_id', tids);
      const mids = (msgs ?? []).map((m) => m.id);
      if (mids.length) await admin.from('selection_message_photos').delete().in('message_id', mids);
      await admin.from('selection_messages').delete().in('thread_id', tids);
      await admin.from('selection_threads').delete().in('id', tids);
    }
    const { data: opts } = await admin.from('selection_options').select('id').in('selection_id', ids);
    const oids = (opts ?? []).map((o) => o.id);
    if (oids.length) {
      await admin.from('selection_option_amounts').delete().in('option_id', oids);
      await admin.from('selection_options').delete().in('id', oids);
    }
    await admin.from('selection_notes').delete().in('selection_id', ids);
    await admin.from('selections').delete().in('id', ids);
  }
  await admin.from('selection_areas').delete().like('name', `${MARKER}%`);
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  const { data: company } = await admin.from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = company!.id;
  for (const [k, email] of [
    ['owner', OWNER], ['pm', PM], ['foreman', FOREMAN], ['crew', CREW], ['sub', SUB], ['linked', LINKED], ['control', CONTROL],
  ] as const) {
    S[k] = (await sessionFor(email)) as Client;
    const { data: p } = await admin.from('profiles').select('id, contact_id').eq('email', email).single();
    profileId[k] = p!.id;
    if (k === 'linked' && !p!.contact_id) throw new Error(`${LINKED} is unlinked — run the seed; every client probe would be vacuous.`);
  }

  // Fixtures, service-role, all MARKER-named.
  const { data: area, error: aErr } = await admin
    .from('selection_areas').insert({ company_id: companyId, project_id: PROJECT, name: `${MARKER} Kitchen`, sort_order: 0 }).select('id').single();
  must('area', aErr);
  areaId = area!.id;
  const { data: d, error: dErr } = await admin
    .from('selections').insert({ company_id: companyId, project_id: PROJECT, area_id: areaId, name: `${MARKER} draft tile`, status: 'draft' }).select('id').single();
  must('draft', dErr);
  draftId = d!.id;
  const { data: l, error: lErr } = await admin
    .from('selections').insert({ company_id: companyId, project_id: PROJECT, area_id: areaId, name: `${MARKER} live faucet`, status: 'in_discussion', mode: 'options' }).select('id').single();
  must('live', lErr);
  liveId = l!.id;
  const { data: o, error: oErr } = await admin
    .from('selection_options').insert({ company_id: companyId, selection_id: liveId, name: `${MARKER} brushed nickel`, spec_detail: 'Model X', sort_order: 0 }).select('id').single();
  must('option', oErr);
  optionId = o!.id;
  must('amounts', (await admin.from('selection_option_amounts').insert({ company_id: companyId, option_id: optionId, quantity: 1, unit_cost: 420, markup_percent: 25 })).error);
  must('notes', (await admin.from('selection_notes').insert({ company_id: companyId, selection_id: liveId, internal_notes: 'margin is thin here' })).error);
  const { data: t, error: tErr } = await admin
    .from('selection_threads').insert({ company_id: companyId, selection_id: liveId }).select('id').single();
  must('thread', tErr);
  threadId = t!.id;
  must('message', (await admin.from('selection_messages').insert({ company_id: companyId, thread_id: threadId, author_profile_id: profileId.owner!, body: 'Which finish?' })).error);
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin.from('selections').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  const { count: ac } = await admin.from('selection_areas').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  expect(count, 'selections left behind').toBe(0);
  expect(ac, 'areas left behind').toBe(0);
}, 240_000);

const read = async (c: Client, table: keyof Database['public']['Tables'], col: string, val: string, sel = 'id') =>
  (await c.from(table).select(sel).eq(col, val)).data ?? [];

// ───────────────────────────────────────────────────────────────────────────
describe('S171-2A — selections + options + areas: staff read (incl. SUB), client reads non-draft only', () => {
  it('A1 — NON-VACUITY: owner reads both selections, the option and the area', async () => {
    expect(await read(S.owner!, 'selections', 'project_id', PROJECT)).not.toHaveLength(0);
    expect(await read(S.owner!, 'selection_options', 'id', optionId)).toHaveLength(1);
    expect(await read(S.owner!, 'selection_areas', 'id', areaId)).toHaveLength(1);
  });

  for (const role of ['pm', 'foreman', 'crew', 'sub'] as const) {
    it(`A2-${role} — reads the selection, its option and its area (Q10: the tab is for everyone)`, async () => {
      expect(await read(S[role]!, 'selections', 'id', liveId)).toHaveLength(1);
      expect(await read(S[role]!, 'selections', 'id', draftId), 'staff see drafts').toHaveLength(1);
      expect(await read(S[role]!, 'selection_options', 'id', optionId)).toHaveLength(1);
      expect(await read(S[role]!, 'selection_areas', 'id', areaId)).toHaveLength(1);
    });
  }

  it('A3 — LINKED client reads the in_discussion selection, its option and area — and NOT the draft', async () => {
    expect(await read(S.linked!, 'selections', 'id', liveId), 'dead portal — linked client sees nothing').toHaveLength(1);
    expect(await read(S.linked!, 'selection_options', 'id', optionId)).toHaveLength(1);
    expect(await read(S.linked!, 'selection_areas', 'id', areaId)).toHaveLength(1);
    expect(await read(S.linked!, 'selections', 'id', draftId), 'a client saw a DRAFT').toHaveLength(0);
  });

  it('A4 — CONTROL client (no project) reads ZERO of everything — and is not simply a broken session', async () => {
    const { data: me } = await S.control!.from('profiles').select('id').limit(1); // own row only, by RLS
    expect(me?.length).toBe(1);
    expect(await read(S.control!, 'selections', 'project_id', PROJECT)).toHaveLength(0);
    expect(await read(S.control!, 'selection_options', 'id', optionId)).toHaveLength(0);
    expect(await read(S.control!, 'selection_areas', 'id', areaId)).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S171-2B — THE FIRST FLOOR: selection_option_amounts is owner/admin/PM only', () => {
  it('B1 — NON-VACUITY: owner and PM read the amounts row', async () => {
    expect(await read(S.owner!, 'selection_option_amounts', 'option_id', optionId, 'id, unit_cost')).toHaveLength(1);
    expect(await read(S.pm!, 'selection_option_amounts', 'option_id', optionId)).toHaveLength(1);
  });
  for (const role of ['foreman', 'crew', 'sub', 'linked', 'control'] as const) {
    it(`B2-${role} — reads ZERO amounts rows, though ${role === 'control' ? 'it reads nothing anyway' : 'it CAN read the option'}`, async () => {
      if (role !== 'control') expect(await read(S[role]!, 'selection_options', 'id', optionId), 'session/option unreadable — probe vacuous').toHaveLength(1);
      const { data, error } = await S[role]!.from('selection_option_amounts').select('id, unit_cost, markup_percent').eq('option_id', optionId);
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    });
  }
  it('B3 — a SUB cannot write an amounts row either (mutation-proved)', async () => {
    const { error } = await S.sub!.from('selection_option_amounts').insert({ option_id: optionId, quantity: 9, unit_cost: 1, markup_percent: 0 });
    expect(error).not.toBeNull();
    const { data } = await admin.from('selection_option_amounts').select('quantity').eq('option_id', optionId).single();
    expect(Number(data!.quantity), 'the refused write LANDED').toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S171-2C — THE SECOND FLOOR: selection_notes is owner/admin/PM/FOREMAN', () => {
  it('C1 — NON-VACUITY: owner, PM and FOREMAN read the note', async () => {
    for (const r of ['owner', 'pm', 'foreman'] as const) {
      expect(await read(S[r]!, 'selection_notes', 'selection_id', liveId, 'id, internal_notes'), `${r} cannot read notes`).toHaveLength(1);
    }
  });
  for (const role of ['crew', 'sub', 'linked', 'control'] as const) {
    it(`C2-${role} — reads ZERO notes ("margin is thin here" must not reach a ${role})`, async () => {
      const { data, error } = await S[role]!.from('selection_notes').select('internal_notes').eq('selection_id', liveId);
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    });
  }
  it('C3 — a SUB cannot UPDATE the note: zero rows, and the row is unchanged', async () => {
    const { data, error } = await S.sub!.from('selection_notes').update({ internal_notes: 'pwned' }).eq('selection_id', liveId).select('id');
    expect(error).toBeNull(); // a zero-row UPDATE is not an error — mutation-result.ts
    expect(data ?? []).toHaveLength(0);
    const { data: row } = await admin.from('selection_notes').select('internal_notes').eq('selection_id', liveId).single();
    expect(row!.internal_notes).toBe('margin is thin here');
  });
  it('C4 — a FOREMAN CAN update the note (the floor admits them)', async () => {
    const { data, error } = await S.foreman!.from('selection_notes').update({ internal_notes: 'foreman edit' }).eq('selection_id', liveId).select('id');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    await admin.from('selection_notes').update({ internal_notes: 'margin is thin here' }).eq('selection_id', liveId);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S171-2D — writes: owner/admin/PM create; others are refused, mutation-proved', () => {
  it('D1 — a PM creates a selection and an option on an assigned project', async () => {
    const { data, error } = await S.pm!.from('selections').insert({ project_id: PROJECT, area_id: areaId, name: `${MARKER} pm-made` }).select('id').single();
    expect(error, error?.message).toBeNull();
    const { error: oErr } = await S.pm!.from('selection_options').insert({ selection_id: data!.id, name: `${MARKER} pm option` });
    expect(oErr).toBeNull();
  });
  for (const role of ['foreman', 'crew', 'sub', 'linked'] as const) {
    it(`D2-${role} — cannot create a selection (refused, and no row exists)`, async () => {
      const { error } = await S[role]!.from('selections').insert({ project_id: PROJECT, name: `${MARKER} by-${role}` });
      expect(error).not.toBeNull();
      const { data } = await admin.from('selections').select('id').eq('name', `${MARKER} by-${role}`);
      expect(data ?? []).toHaveLength(0);
    });
  }
  it('D3 — a SUB cannot UPDATE a selection: zero rows, row unchanged', async () => {
    const { data } = await S.sub!.from('selections').update({ name: `${MARKER} renamed` }).eq('id', liveId).select('id');
    expect(data ?? []).toHaveLength(0);
    const { data: row } = await admin.from('selections').select('name').eq('id', liveId).single();
    expect(row!.name).toBe(`${MARKER} live faucet`);
  });
  it('D4 — nobody can DELETE a selection (no policy): owner gets zero rows, row survives', async () => {
    const { data } = await S.owner!.from('selections').delete().eq('id', draftId).select('id');
    expect(data ?? []).toHaveLength(0);
    expect(await read(S.owner!, 'selections', 'id', draftId)).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S171-2E — the CHECKs that make the rulings structural', () => {
  it('E1 — client_supplied ⇒ no money: a stamp on a client-supplied selection is refused', async () => {
    const { error } = await admin.from('selections').insert({
      company_id: companyId, project_id: PROJECT, name: `${MARKER} bad-supplied`, client_supplied: true,
      offered_sell_amount: 100, offered_allowance_deduction: 0, offered_variance: 100, offered_at: new Date().toISOString(),
    });
    expect(error?.message).toMatch(/client_supplied_no_money/);
    expect((await admin.from('selections').select('id').eq('name', `${MARKER} bad-supplied`)).data ?? []).toHaveLength(0);
  });
  it('E2 — stamps travel together: a lone offered_sell_amount is refused', async () => {
    const { error } = await admin.from('selections').insert({ company_id: companyId, project_id: PROJECT, name: `${MARKER} bad-lone`, offered_sell_amount: 100 });
    expect(error?.message).toMatch(/offered_stamps_together/);
  });
  it('E3 — approved ⇔ signed on a money selection: approved with no signature is refused', async () => {
    const { error } = await admin.from('selections').insert({ company_id: companyId, project_id: PROJECT, name: `${MARKER} bad-approved`, status: 'approved' });
    expect(error?.message).toMatch(/approved_is_signed/);
  });
  it('E4 — option source columns: a catalog option needs catalog_item_id; scratch forbids it', async () => {
    const { error } = await admin.from('selection_options').insert({ company_id: companyId, selection_id: liveId, name: `${MARKER} bad-src`, source: 'catalog' });
    expect(error?.message).toMatch(/source_columns/);
  });
  it('E5 — one thread per selection: a second thread is refused', async () => {
    const { error } = await admin.from('selection_threads').insert({ company_id: companyId, selection_id: liveId });
    expect(error?.message).toMatch(/selection_threads_selection_id_key|unique/i);
  });
  it('E6 — at most ONE current completed signing session per selection (partial unique)', async () => {
    const base = {
      company_id: companyId, selection_id: liveId, status: 'completed', signer_profile_id: profileId.linked!,
      signed_at: new Date().toISOString(), signature_type: 'draw', signature_data: 'x', consent_given: true,
      consent_text: 'binding', snapshot: { t: 1 },
    };
    const first = await admin.from('selection_signing_sessions').insert(base).select('id').single();
    expect(first.error, first.error?.message).toBeNull();
    const second = await admin.from('selection_signing_sessions').insert(base);
    expect(second.error?.message).toMatch(/one_current/);
    // Superseding the first frees the slot — the revision path (Q9).
    must('supersede', (await admin.from('selection_signing_sessions').update({ superseded_at: new Date().toISOString() }).eq('id', first.data!.id)).error);
    const third = await admin.from('selection_signing_sessions').insert(base).select('id').single();
    expect(third.error).toBeNull();
    const { count } = await admin.from('selection_signing_sessions').select('id', { count: 'exact', head: true }).eq('selection_id', liveId);
    expect(count, 'the superseded session was destroyed').toBe(2);
  });
  it('E7 — a completed session without consent/snapshot is refused (completed_shape)', async () => {
    const { error } = await admin.from('selection_signing_sessions').insert({ company_id: companyId, selection_id: draftId, status: 'completed', signer_profile_id: profileId.linked!, signed_at: new Date().toISOString(), signature_data: 'x' });
    expect(error?.message).toMatch(/completed_shape/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S171-2F — signing sessions: owner/admin/PM read; the client reads HER OWN only', () => {
  it('F1 — owner and PM read the sessions; LINKED reads her own; CONTROL and SUB read none', async () => {
    expect((await read(S.owner!, 'selection_signing_sessions', 'selection_id', liveId)).length).toBeGreaterThan(0);
    expect((await read(S.pm!, 'selection_signing_sessions', 'selection_id', liveId)).length).toBeGreaterThan(0);
    expect((await read(S.linked!, 'selection_signing_sessions', 'selection_id', liveId)).length, 'client cannot read her own signature').toBeGreaterThan(0);
    expect(await read(S.control!, 'selection_signing_sessions', 'selection_id', liveId)).toHaveLength(0);
    expect(await read(S.sub!, 'selection_signing_sessions', 'selection_id', liveId)).toHaveLength(0);
    expect(await read(S.foreman!, 'selection_signing_sessions', 'selection_id', liveId)).toHaveLength(0);
  });
  it('F2 — no authenticated role can INSERT a session (service only) — owner refused, count unchanged', async () => {
    const { count: before } = await admin.from('selection_signing_sessions').select('id', { count: 'exact', head: true }).eq('selection_id', liveId);
    const { error } = await S.owner!.from('selection_signing_sessions').insert({ selection_id: liveId, signer_profile_id: profileId.linked! });
    expect(error).not.toBeNull();
    const { count: after } = await admin.from('selection_signing_sessions').select('id', { count: 'exact', head: true }).eq('selection_id', liveId);
    expect(after).toBe(before);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S171-2G — the thread follows the selection: sub reads, client reads non-draft, authors post', () => {
  it('G1 — owner, SUB and LINKED read the thread and its message; CONTROL reads none', async () => {
    for (const r of ['owner', 'sub', 'linked'] as const) {
      expect(await read(S[r]!, 'selection_threads', 'id', threadId), `${r} thread`).toHaveLength(1);
      expect((await read(S[r]!, 'selection_messages', 'thread_id', threadId)).length, `${r} messages`).toBeGreaterThan(0);
    }
    expect(await read(S.control!, 'selection_threads', 'id', threadId)).toHaveLength(0);
  });
  it('G2 — LINKED client posts a message (body + link) as herself; CONTROL cannot', async () => {
    const { error } = await S.linked!.from('selection_messages').insert({ thread_id: threadId, author_profile_id: profileId.linked!, body: 'This one please', link_url: 'https://example.invalid/faucet' });
    expect(error, error?.message).toBeNull();
    const { error: cErr } = await S.control!.from('selection_messages').insert({ thread_id: threadId, author_profile_id: profileId.control!, body: 'intruder' });
    expect(cErr).not.toBeNull();
    const { data } = await admin.from('selection_messages').select('id').eq('thread_id', threadId).eq('body', 'intruder');
    expect(data ?? []).toHaveLength(0);
  });
  it('G3 — a SUB cannot post as the OWNER (author must be self)', async () => {
    const { error } = await S.sub!.from('selection_messages').insert({ thread_id: threadId, author_profile_id: profileId.owner!, body: 'spoof' });
    expect(error).not.toBeNull();
    expect((await admin.from('selection_messages').select('id').eq('body', 'spoof')).data ?? []).toHaveLength(0);
  });
  it('G4 — a thread on the DRAFT selection is invisible to the client (follows selection status)', async () => {
    const { data: dt, error } = await admin.from('selection_threads').insert({ company_id: companyId, selection_id: draftId }).select('id').single();
    must('draft thread', error);
    expect(await read(S.linked!, 'selection_threads', 'id', dt!.id)).toHaveLength(0);
    expect(await read(S.sub!, 'selection_threads', 'id', dt!.id), 'staff see draft threads').toHaveLength(1);
  });
});
