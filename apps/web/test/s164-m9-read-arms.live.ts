/**
 * S164 — Module 9 stage 3. The client READ surface, non-financial.
 *
 * Migration: `20261019000000_m9_client_read_arms.sql`.
 * Spec: `9-spec.md` §5 (R14), §6 (R9/R15).
 *
 * ============================================================================
 * ⚠️ EVERY ARM GETS A PAIR. THAT IS THE WHOLE DESIGN OF THIS FILE.
 * ============================================================================
 * `9-spec.md` §2: a client is refused today by the ABSENCE of a member row, not
 * by any rule, so `toHaveLength(0)` for a client is true of every table under a
 * correct policy and under no policy at all.
 *
 * So each arm is asserted twice on the same query — and wherever the arm has an
 * internal boundary, a third time from inside:
 *
 *   LINKED   reads the row                  the arm grants
 *   CONTROL  reads nothing                  the arm is scoped to a real client
 *   LINKED   does NOT read the excluded row  the arm is a filter, not a door
 *
 * The third is the one that catches a policy which accidentally grants the whole
 * table: draft documents, non-client-visible files, another client's anything.
 * A pair without it would pass against `USING (true)`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const LINKED = 'josh+qa-client-linked@worthprop.com';
const CONTROL = 'josh+qa-client@worthprop.com';
const CLOSED = 'josh+qa-client-closed@worthprop.com';
const OWNER = 'josh+test50@worthprop.com';

let linked: SupabaseClient;
let control: SupabaseClient;
let closed: SupabaseClient;
let owner: SupabaseClient;

let companyId: string;
let linkedProfileId: string;
let fixtureProjectId: string;
let sectionsProjectId: string;
let visiblePath: string;
let hiddenPath: string;

const setState = async (state: string) => {
  await admin.from('profiles').update({ client_access_state: state }).eq('id', linkedProfileId);
};

beforeAll(async () => {
  assertRebuildTest();
  [linked, control, closed, owner] = await Promise.all([
    sessionFor(LINKED),
    sessionFor(CONTROL),
    sessionFor(CLOSED),
    sessionFor(OWNER),
  ]);

  const { data: lp } = await admin
    .from('profiles').select('id, company_id, contact_id').eq('email', LINKED).single();
  const l = lp as { id: string; company_id: string; contact_id: string | null };
  if (!l.contact_id) throw new Error(`${LINKED} is unlinked — run the seed; every assertion here would be vacuous.`);
  linkedProfileId = l.id;
  companyId = l.company_id;

  const { data: fx } = await admin
    .from('projects').select('id')
    .eq('company_id', companyId).eq('name', 'QA A — isolation fixture').single();
  fixtureProjectId = (fx as { id: string }).id;
  sectionsProjectId = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

  const { data: vis } = await admin
    .from('files').select('file_path').eq('company_id', companyId)
    .eq('file_name', 'qa-m9-visible.jpg').single();
  visiblePath = (vis as { file_path: string }).file_path;
  const { data: hid } = await admin
    .from('files').select('file_path').eq('company_id', companyId)
    .eq('file_name', 'qa-m9-hidden.jpg').single();
  hiddenPath = (hid as { file_path: string }).file_path;
});

afterAll(async () => {
  await setState('active');
});

const ids = async (c: SupabaseClient, table: string, select = 'id') => {
  const { data, error } = await c.from(table).select(select);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as unknown as Record<string, string>[];
};

// ───────────────────────────────────────────────────────────────────────────
describe('ARM 1 — projects: the row everything else hangs off', () => {
  it('1a — LINKED reads her projects', async () => {
    const rows = await ids(linked, 'projects');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('1b — CONTROL reads none', async () => {
    expect(await ids(control, 'projects')).toHaveLength(0);
  });

  it('1c — LINKED reads ONLY her projects, not the company list', async () => {
    // The company holds 9+ projects. Without this an arm of `USING (company_id
    // = mine)` would pass 1a and 1b both.
    const mine = (await ids(linked, 'projects')).map((r) => r.id);
    const { count: all } = await admin
      .from('projects').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).eq('is_deleted', false);
    expect(all!).toBeGreaterThan(mine.length);

    const { data: notHers } = await admin
      .from('projects').select('id')
      .eq('company_id', companyId).eq('is_deleted', false)
      .not('id', 'in', `(${mine.join(',')})`)
      .limit(1);
    const strangerId = ((notHers ?? []) as { id: string }[])[0]?.id;
    expect(strangerId, 'need a project she is not on').toBeTruthy();
    const { data } = await linked.from('projects').select('id').eq('id', strangerId!);
    expect(data ?? []).toHaveLength(0);
  });

  it('1d — the CLOSED client (window shut) reads none', async () => {
    expect(await ids(closed, 'projects')).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('ARM 2 — client_contracts: sent and signed, never drafts', () => {
  it('2a — LINKED reads a non-draft contract', async () => {
    const rows = await ids(linked, 'client_contracts', 'id, status');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.status).not.toBe('draft');
  });

  it('2b — CONTROL reads none', async () => {
    expect(await ids(control, 'client_contracts')).toHaveLength(0);
  });

  it('2c — ⚠️ the DRAFT contract is invisible, and one exists', async () => {
    const { data: drafts } = await admin
      .from('client_contracts').select('id')
      .eq('company_id', companyId).eq('status', 'draft');
    expect((drafts ?? []).length, 'no draft fixture — 2c proves nothing').toBeGreaterThan(0);
    const draftId = ((drafts ?? []) as { id: string }[])[0].id;
    const { data } = await linked.from('client_contracts').select('id').eq('id', draftId);
    expect(data ?? []).toHaveLength(0);
  });

  // 2d/2e [blocking-items] — client_contract_amounts (20261051). The value
  // moved off the row onto an Owner/Admin side table whose CLIENT arm restates
  // this arm's predicate (is_client_of_project + client_document_visible)
  // rather than containing the parent — containment would have admitted every
  // staff role. Her counterparty view (portal.ts) rides on these.
  it('2d — LINKED reads the amount of her non-draft contract', async () => {
    const rows = await ids(linked, 'client_contracts', 'id, status');
    expect(rows.length, 'no visible contract — 2d proves nothing').toBeGreaterThan(0);
    const contractId = rows[0].id;

    // Seed-if-missing via admin so the read below is never vacuous.
    const { data: existing } = await admin
      .from('client_contract_amounts').select('id')
      .eq('client_contract_id', contractId);
    let seededHere = false;
    if (!(existing ?? []).length) {
      const { error } = await admin
        .from('client_contract_amounts')
        .insert({ company_id: companyId, client_contract_id: contractId, contract_value: 48750 });
      expect(error).toBeNull();
      seededHere = true;
    }

    const { data: hers, error } = await linked
      .from('client_contract_amounts')
      .select('contract_value').eq('client_contract_id', contractId);
    expect(error).toBeNull();
    expect((hers ?? []).length, 'the client arm refused her own contract value').toBe(1);

    const { data: strangers } = await control
      .from('client_contract_amounts').select('id');
    expect(strangers ?? [], 'CONTROL read a contract amount').toHaveLength(0);

    if (seededHere) {
      await admin.from('client_contract_amounts').delete().eq('client_contract_id', contractId);
    }
  });

  it('2e — ⚠️ a DRAFT contract\'s amount is invisible to her, and one exists', async () => {
    const { data: drafts } = await admin
      .from('client_contracts').select('id')
      .eq('company_id', companyId).eq('status', 'draft');
    expect((drafts ?? []).length, 'no draft fixture — 2e proves nothing').toBeGreaterThan(0);
    const draftId = ((drafts ?? []) as { id: string }[])[0].id;

    const { data: existing } = await admin
      .from('client_contract_amounts').select('id')
      .eq('client_contract_id', draftId);
    let seededHere = false;
    if (!(existing ?? []).length) {
      const { error } = await admin
        .from('client_contract_amounts')
        .insert({ company_id: companyId, client_contract_id: draftId, contract_value: 11111 });
      expect(error).toBeNull();
      seededHere = true;
    }

    const { data } = await linked
      .from('client_contract_amounts').select('id').eq('client_contract_id', draftId);
    expect(data ?? [], 'client_document_visible is not gating the amounts arm').toHaveLength(0);

    if (seededHere) {
      await admin.from('client_contract_amounts').delete().eq('client_contract_id', draftId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('ARM 3 — contract_documents', () => {
  it('3a — LINKED reads the sent document', async () => {
    const rows = await ids(linked, 'contract_documents', 'id, status, sub_contract_id');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.status).not.toBe('draft');
  });

  it('3b — CONTROL reads none', async () => {
    expect(await ids(control, 'contract_documents')).toHaveLength(0);
  });

  it('3c — a SUB contract is never the client\'s document', async () => {
    const rows = await ids(linked, 'contract_documents', 'id, sub_contract_id');
    for (const r of rows) expect(r.sub_contract_id).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('ARM 4 — change_orders', () => {
  it('4a — LINKED reads sent/signed COs', async () => {
    const rows = await ids(linked, 'change_orders', 'id, status, net_delta');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.status).not.toBe('draft');
  });

  it('4b — CONTROL reads none', async () => {
    expect(await ids(control, 'change_orders')).toHaveLength(0);
  });

  it('4c — ⚠️ the DRAFT CO is invisible, and one exists', async () => {
    const { data: d } = await admin
      .from('change_orders').select('id')
      .eq('company_id', companyId).eq('title', 'QA M9 — draft CO').single();
    const draftId = (d as { id: string }).id;
    const { data } = await linked.from('change_orders').select('id').eq('id', draftId);
    expect(data ?? []).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('ARM 5 — change_order_line_items follow their parent', () => {
  it('5a — LINKED reads the line on the SENT co', async () => {
    const rows = await ids(linked, 'change_order_line_items', 'id, name');
    expect(rows.map((r) => r.name)).toContain('QA M9 line on the SENT co');
  });

  it('5b — ⚠️ and NOT the line on the draft co', async () => {
    // [S167] RE-POINTED FROM THE NAME TO THE PARENT ID. The assertion is the
    // same one — a line of a DRAFT change order must not reach the client —
    // but the string is no longer a safe handle for it.
    //
    // The S165 click-test signed the seeded draft CO by accident, and that row
    // can be neither reverted nor deleted — the trigger refuses to clear a
    // signature stamp, and `enforce_change_order_delete_boundary()` refuses to
    // delete a SIGNED change order for any caller [S168]. (The FK/trigger
    // deadlock that made even an UNSIGNED one undeletable was #1-s167fx and is
    // CLOSED; a signed row is refused on purpose, not by accident. See the S167
    // repair block in scripts/seed-test-identities.mjs.) The seed renames the stuck row out of the way and rebuilds
    // the draft, but the stuck row KEEPS its line — a row still called
    // 'QA M9 line on the DRAFT co' whose parent is now SIGNED, and therefore
    // one the client is *supposed* to see. Asserting on the name would fail on
    // correct behaviour.
    const { data: d } = await admin
      .from('change_orders').select('id')
      .eq('company_id', companyId).eq('title', 'QA M9 — draft CO').single();
    const draftId = (d as { id: string }).id;

    const { count: onDraft } = await admin
      .from('change_order_line_items').select('id', { count: 'exact', head: true })
      .eq('change_order_id', draftId);
    expect(onDraft, 'the draft CO carries no line — 5b would be vacuous').toBeGreaterThan(0);

    const rows = await ids(linked, 'change_order_line_items', 'id, name, change_order_id');
    expect(rows.map((r) => r.change_order_id)).not.toContain(draftId);
  });

  it('5c — CONTROL reads none', async () => {
    expect(await ids(control, 'change_order_line_items')).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('ARM 6 — files: the flag is the gate', () => {
  it('6a — LINKED reads the client-visible photo', async () => {
    const rows = await ids(linked, 'files', 'id, file_name, client_visible');
    expect(rows.map((r) => r.file_name)).toContain('qa-m9-visible.jpg');
  });

  it('6b — ⚠️ and NOT the one whose flag is false', async () => {
    const rows = await ids(linked, 'files', 'id, file_name, client_visible');
    expect(rows.map((r) => r.file_name)).not.toContain('qa-m9-hidden.jpg');
    for (const r of rows) expect(r.client_visible).toBe(true);
  });

  it('6c — CONTROL reads none', async () => {
    expect(await ids(control, 'files')).toHaveLength(0);
  });

  it('6d — and the owner still sees both (nothing was narrowed)', async () => {
    const names = (await ids(owner, 'files', 'id, file_name')).map((r) => r.file_name);
    expect(names).toContain('qa-m9-visible.jpg');
    expect(names).toContain('qa-m9-hidden.jpg');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('ARM 7 — storage, INCLUDING the markup derivative', () => {
  const sign = async (c: SupabaseClient, path: string) => {
    const { data, error } = await c.storage.from('project-files').createSignedUrl(path, 60);
    return { ok: !error && !!data?.signedUrl, error: error?.message ?? null };
  };

  it('7a — LINKED can sign the visible photo', async () => {
    expect((await sign(linked, visiblePath)).ok).toBe(true);
  });

  it('7b — ⚠️ AND its .markup.jpg derivative, which has NO files row', async () => {
    // §6.1: an annotated photo is one `files` row plus a derivative object with
    // no row of its own. Without the second branch of the storage policy the
    // row reads fine and the IMAGE 403s — a broken image, not a policy error,
    // on exactly the photos somebody annotated for her.
    const markupPath = `${visiblePath}.markup.jpg`;
    const { data: noRow } = await admin
      .from('files').select('id').eq('file_path', markupPath);
    expect(noRow ?? [], 'the derivative must NOT have its own files row').toHaveLength(0);

    const { data: obj } = await admin.storage
      .from('project-files')
      .list(markupPath.split('/').slice(0, -1).join('/'), { search: 'qa-m9-visible.jpg.markup.jpg' });
    expect((obj ?? []).length, 'no derivative object — 7b would be vacuous').toBeGreaterThan(0);

    expect((await sign(linked, markupPath)).ok).toBe(true);
  });

  it('7c — ⚠️ and CANNOT sign the hidden photo', async () => {
    expect((await sign(linked, hiddenPath)).ok).toBe(false);
  });

  it('7d — CONTROL can sign neither', async () => {
    expect((await sign(control, visiblePath)).ok).toBe(false);
    expect((await sign(control, `${visiblePath}.markup.jpg`)).ok).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('ARM 8 — the schedule is titles and dates, and tasks stays closed', () => {
  const schedule = async (c: SupabaseClient, projectId: string) => {
    const { data, error } = await c.rpc('client_schedule', { p_project_id: projectId });
    if (error) throw new Error(`client_schedule: ${error.message}`);
    return (data ?? []) as Record<string, unknown>[];
  };

  it('8a — LINKED gets her project\'s tasks as titles and dates', async () => {
    const rows = await schedule(linked, sectionsProjectId);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(typeof r.title).toBe('string');
  });

  it('8b — ⚠️ and the shape carries NO description and NO assignee', async () => {
    // RLS is row-level and cannot hide a column. This is why the schedule is a
    // projecting function and `tasks` has no client policy at all.
    const rows = await schedule(linked, sectionsProjectId);
    for (const r of rows) {
      expect(Object.keys(r)).not.toContain('description');
      expect(Object.keys(r)).not.toContain('assignee_id');
    }
  });

  it('8c — ⚠️ and the tasks TABLE is still closed to her', async () => {
    expect(await ids(linked, 'tasks')).toHaveLength(0);
  });

  it('8d — CONTROL gets nothing from the function', async () => {
    expect(await schedule(control, sectionsProjectId)).toHaveLength(0);
  });

  it('8e — schedule_entries (crew scheduling) is closed to her — R14', async () => {
    // "No assignments, no crew." schedule_entries is member_id + date + kind.
    expect(await ids(linked, 'schedule_entries')).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('ARM 9 — R17 narrows these arms, and it is enforced here not in the UI', () => {
  it('9a — signed_documents_only hides a SENT change order', async () => {
    try {
      await setState('signed_documents_only');
      const rows = await ids(linked, 'change_orders', 'id, status');
      for (const r of rows) expect(r.status).toBe('signed');
      // ...and the content surfaces go entirely.
      expect(await ids(linked, 'files')).toHaveLength(0);
    } finally {
      await setState('active');
    }
  });

  it('9b — documents_for_signature keeps documents and drops content', async () => {
    try {
      await setState('documents_for_signature');
      const cos = await ids(linked, 'change_orders', 'id, status');
      expect(cos.length, 'documents must remain').toBeGreaterThan(0);
      expect(await ids(linked, 'files'), 'content must not').toHaveLength(0);
      const { data: sched } = await linked.rpc('client_schedule', { p_project_id: sectionsProjectId });
      expect(sched ?? []).toHaveLength(0);
    } finally {
      await setState('active');
    }
  });

  it('9c — deactivated closes every arm at once', async () => {
    try {
      await setState('deactivated');
      for (const t of ['projects', 'client_contracts', 'contract_documents', 'change_orders', 'change_order_line_items', 'files']) {
        expect(await ids(linked, t), `${t} still readable when deactivated`).toHaveLength(0);
      }
    } finally {
      await setState('active');
    }
  });

  it('9d — and everything comes back (a switch, not a shredder)', async () => {
    expect((await ids(linked, 'projects')).length).toBeGreaterThan(0);
    expect((await ids(linked, 'files')).length).toBeGreaterThan(0);
  });
});
