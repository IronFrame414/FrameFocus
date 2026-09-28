/**
 * S114 PART A — the Project Executive's OPERATIONAL arms, proven both ways.
 *
 * Migrations 20261940000000 (46 table arms), 20261950000000 (storage upload),
 * 20261960000000 (seven functions) and 20261970000000 (roster + catalog
 * reads). As the real `josh+qa-pe` session:
 *   · ON  its assigned project: each write LANDS (service-role tally +1, or the
 *     column re-read);
 *   · BARE, a project it is not on: the same INSERT is refused and the tally
 *     does not move.
 * Run BEFORE the migrations, the ON half must go red and the BARE half stay
 * green (the negative-first control).
 *
 * ⚠️ NO RETURNING on any write. With RETURNING, Postgres judges the new row
 * against the SELECT policy too, and BARE is unreadable, so a BARE negative
 * would pass whether or not the write arm exists (#2-pe). Every result is read
 * back by the service role.
 *
 * ⚠️ STATED LIMIT: UPDATE and DELETE arms cannot be isolated on BARE through
 * PostgREST — the SELECT policy refuses the existing row first. They are
 * proven ON, and bounded on BARE by the SELECT arm.
 *
 * ⚠️ BARE HOLDS NONE of the one-per-parent rows (selection_notes,
 * selection_threads, selection_amounts: unique(selection_id);
 * project_assignments / project_contacts: unique pairs), so a widened arm's
 * row would LAND where the tally sees it rather than collide on a key.
 *
 * Out of scope, by ruling: timesheets (S114 Q7 C); refunds and contracts
 * (s114-pe-carveouts.live.ts); anything company level.
 *
 *   npx vitest run --config test/live.vitest.config.ts s114-pe-operational
 *
 * RUN ONLY WHILE NO CI IS LIVE (one shared rebuild-test database).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { admin, assertRebuildTest, deleteProjects, sessionFor } from './live-session';

const PE = 'josh+qa-pe@worthprop.com';
const MARKER = 'PEO';

const OUT: Record<string, unknown> = {};
const record = (k: string, v: unknown) => {
  OUT[k] = v;
  if (process.env.PE_OPERATIONAL_OUT)
    writeFileSync(process.env.PE_OPERATIONAL_OUT, JSON.stringify(OUT, null, 2));
};

type Side = 'on' | 'bare';
interface Fixture {
  project: string;
  taskA: string;
  taskB: string;
  selection: string;
  option: string;
  po: string;
  poItem: string;
  subThread: string;
  contact: string;
  crewMember: string;
  budgetItem: string;
  phase: string;
  inspection: string;
  schedule: string;
  area: string;
}
const fx: Record<Side, Fixture> = { on: {} as Fixture, bare: {} as Fixture };

let pe: SupabaseClient;
let companyId = '';
let peMemberId = '';
let peProfileId = '';
let ownerMemberId = '';
let clientContactId = '';
let catalogItemId = '';
const uploaded: string[] = [];

async function sweep() {
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  const ids = (ps ?? []).map((p) => p.id as string);
  if (ids.length) {
    const { data: ex } = await admin.from('expenses').select('id').in('project_id', ids);
    const exIds = (ex ?? []).map((e) => e.id as string);
    if (exIds.length) await admin.from('expense_allocations').delete().in('expense_id', exIds);
    const { data: th } = await admin.from('chat_threads').select('id').in('project_id', ids);
    const thIds = (th ?? []).map((t) => t.id as string);
    if (thIds.length) await admin.from('chat_messages').delete().in('thread_id', thIds);
    await admin.from('chat_threads').delete().in('project_id', ids);
    const { data: pos } = await admin.from('purchase_orders').select('id').in('project_id', ids);
    const poIds = (pos ?? []).map((p) => p.id as string);
    if (poIds.length) {
      const { data: items } = await admin.from('purchase_order_items').select('id').in('purchase_order_id', poIds);
      const itemIds = (items ?? []).map((i) => i.id as string);
      if (itemIds.length) await admin.from('purchase_order_item_assignments').delete().in('po_item_id', itemIds);
      await admin.from('purchase_order_items').delete().in('purchase_order_id', poIds);
    }
    const { data: sels } = await admin.from('selections').select('id').in('project_id', ids);
    const selIds = (sels ?? []).map((s) => s.id as string);
    if (selIds.length) {
      const { data: opts } = await admin.from('selection_options').select('id').in('selection_id', selIds);
      const optIds = (opts ?? []).map((o) => o.id as string);
      if (optIds.length) await admin.from('selection_option_amounts').delete().in('option_id', optIds);
      await admin.from('selection_options').delete().in('selection_id', selIds);
      await admin.from('selection_amounts').delete().in('selection_id', selIds);
      await admin.from('selection_notes').delete().in('selection_id', selIds);
      await admin.from('selection_threads').delete().in('selection_id', selIds);
    }
    const { data: tasks } = await admin.from('tasks').select('id').in('project_id', ids);
    const taskIds = (tasks ?? []).map((t) => t.id as string);
    if (taskIds.length) await admin.from('task_dependencies').delete().in('predecessor_id', taskIds);
    const { data: bis } = await admin.from('project_budget_items').select('id').in('project_id', ids);
    const biIds = (bis ?? []).map((b) => b.id as string);
    if (biIds.length) await admin.from('project_budget_amounts').delete().in('budget_item_id', biIds);
    await deleteProjects(admin, ids);
  }
  await admin.from('company_members').delete().like('display_name', `${MARKER} %`);
  await admin.from('contacts').delete().like('last_name', `${MARKER} %`);
  await admin.from('cost_catalog').delete().like('name', `${MARKER} %`);
  if (uploaded.length) await admin.storage.from('project-files').remove(uploaded);
}

async function one<T = { id: string }>(
  what: string,
  q: PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as T;
}

async function makeSide(side: Side, seq: number): Promise<void> {
  const tag = side.toUpperCase();
  const f = {} as Fixture;
  f.project = (
    await one(`project ${tag}`, admin.from('projects').insert({
      company_id: companyId,
      contact_id: clientContactId,
      project_number: `PRJ-${MARKER}-${tag}`,
      name: `${MARKER} ${tag} project`,
      status: 'active',
      project_internal_seq: seq,
    }).select('id').single())
  ).id;
  f.taskA = (await one('taskA', admin.from('tasks').insert({ company_id: companyId, project_id: f.project, title: `${MARKER} A` }).select('id').single())).id;
  f.taskB = (await one('taskB', admin.from('tasks').insert({ company_id: companyId, project_id: f.project, title: `${MARKER} B` }).select('id').single())).id;
  f.phase = (await one('phase', admin.from('phases').insert({ company_id: companyId, project_id: f.project, name: `${MARKER} phase`, sort_order: 0 }).select('id').single())).id;
  f.inspection = (await one('inspection', admin.from('inspections').insert({ company_id: companyId, project_id: f.project, inspection_type: 'framing' }).select('id').single())).id;
  f.schedule = (await one('schedule', admin.from('schedule_entries').insert({ company_id: companyId, project_id: f.project, member_id: ownerMemberId, entry_date: '2026-10-01', general_kind: 'project' }).select('id').single())).id;
  f.selection = (await one('selection', admin.from('selections').insert({ company_id: companyId, project_id: f.project, name: `${MARKER} selection` }).select('id').single())).id;
  f.area = (await one('area', admin.from('selection_areas').insert({ company_id: companyId, project_id: f.project, name: `${MARKER} area` }).select('id').single())).id;
  f.option = (await one('option', admin.from('selection_options').insert({ company_id: companyId, selection_id: f.selection, name: `${MARKER} option`, source: 'scratch' }).select('id').single())).id;
  f.budgetItem = (await one('budget item', admin.from('project_budget_items').insert({ company_id: companyId, project_id: f.project, description: `${MARKER} line` }).select('id').single())).id;
  f.po = (await one('po', admin.from('purchase_orders').insert({ company_id: companyId, project_id: f.project, vendor_name: `${MARKER} vendor` }).select('id').single())).id;
  f.poItem = (await one('po item', admin.from('purchase_order_items').insert({ company_id: companyId, purchase_order_id: f.po, description: `${MARKER} item`, qty_ordered: 1 }).select('id').single())).id;
  f.subThread = (await one('sub thread', admin.from('chat_threads').insert({ company_id: companyId, project_id: f.project, kind: 'sub' }).select('id').single())).id;
  f.contact = (await one('contact', admin.from('contacts').insert({ company_id: companyId, first_name: tag, last_name: `${MARKER} Contact`, contact_type: 'client' }).select('id').single())).id;
  f.crewMember = (await one('crew member', admin.from('company_members').insert({ company_id: companyId, member_type: 'crew', display_name: `${MARKER} ${tag} crew` }).select('id').single())).id;
  fx[side] = f;
}

beforeAll(async () => {
  assertRebuildTest();
  const prof = await one<{ id: string; company_id: string; role: string }>(
    'pe profile',
    admin.from('profiles').select('id, company_id, role').eq('email', PE).single()
  );
  expect(prof.role).toBe('project_executive');
  companyId = prof.company_id;
  peProfileId = prof.id;
  peMemberId = (await one('pe member', admin.from('company_members').select('id').eq('profile_id', prof.id).single())).id;
  const owner = await one('owner', admin.from('profiles').select('id').eq('company_id', companyId).eq('role', 'owner')
    .order('created_at', { ascending: true }).limit(1).single());
  ownerMemberId = (await one('owner member', admin.from('company_members').select('id').eq('profile_id', owner.id).single())).id;

  await sweep();

  clientContactId = (await one('client', admin.from('contacts').insert({ company_id: companyId, first_name: 'PE', last_name: `${MARKER} Client`, contact_type: 'client' }).select('id').single())).id;
  catalogItemId = (await one('catalog', admin.from('cost_catalog').insert({ company_id: companyId, name: `${MARKER} catalog item`, category: 'material', unit_of_measure: 'ea', unit_cost: 1 }).select('id').single())).id;
  const { data: seqRow } = await admin.from('projects').select('project_internal_seq').eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false }).limit(1).maybeSingle();
  const base = (seqRow?.project_internal_seq ?? 0) + 6000;
  await makeSide('on', base);
  await makeSide('bare', base + 1);
  await one('assign', admin.from('project_assignments').insert({
    company_id: companyId, project_id: fx.on.project, member_id: peMemberId, role_on_project: 'project_executive',
  }).select('id').single());

  pe = await sessionFor(PE);
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin.from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER} %`);
  record('teardown_projects_left', count ?? 0);
  expect(count ?? 0, 'disposable PEO projects survived teardown').toBe(0);
}, 240_000);

async function tally(table: string, column: string, value: string): Promise<number> {
  const { count, error } = await admin.from(table).select('id', { count: 'exact', head: true }).eq(column, value);
  if (error) throw new Error(`tally ${table}: ${error.message}`);
  return count ?? 0;
}

/**
 * One INSERT arm, both ways, no RETURNING. `row(side)` builds the row;
 * `where(side)` names the column/value the service role counts on.
 */
async function insertBothWays(
  key: string,
  table: string,
  where: (s: Side) => [string, string],
  row: (s: Side) => Record<string, unknown>
): Promise<void> {
  const res: Record<string, unknown> = {};
  for (const side of ['on', 'bare'] as Side[]) {
    const [c, v] = where(side);
    const before = await tally(table, c, v);
    const { error } = await pe.from(table).insert(row(side));
    const after = await tally(table, c, v);
    res[side] = { before, after, error: error?.message ?? null };
  }
  record(key, res);
  const on = res.on as { before: number; after: number; error: string | null };
  const bare = res.bare as { before: number; after: number; error: string | null };
  expect(on.error, `${key} ON refused: ${on.error}`).toBeNull();
  expect(on.after).toBe(on.before + 1);
  expect(bare.error ?? '').toMatch(/row-level security/i);
  expect(bare.after).toBe(bare.before);
}

/** One UPDATE arm, ON only (the stated limit), no RETURNING, re-read by the service role. */
async function updateOn(key: string, table: string, id: string, patch: Record<string, unknown>, column: string) {
  const { error } = await pe.from(table).update(patch).eq('id', id);
  const { data } = await admin.from(table).select(column).eq('id', id).single();
  const got = (data as unknown as Record<string, unknown>)[column];
  record(key, { error: error?.message ?? null, got });
  expect(error?.message ?? null).toBeNull();
  expect(got).toEqual(patch[column]);
}

describe('S114 PART A — CONTROL', () => {
  it('the PE is assigned to ON and not to BARE', async () => {
    const onA = await tally('project_assignments', 'project_id', fx.on.project);
    const bareA = await tally('project_assignments', 'project_id', fx.bare.project);
    const { data: seen } = await pe.from('projects').select('id').in('id', [fx.on.project, fx.bare.project]);
    record('control', { onA, bareA, seen: (seen ?? []).length });
    expect(onA).toBe(1);
    expect(bareA).toBe(0);
    expect((seen ?? []).map((p) => p.id)).toEqual([fx.on.project]);
  });
});

describe('S114 PART A — files and storage (the photo upload)', () => {
  it('files INSERT: a photo row lands ON, refused on BARE', async () => {
    await insertBothWays('files_insert', 'files', (s) => ['project_id', fx[s].project], (s) => ({
      company_id: companyId,
      project_id: fx[s].project,
      category: 'photos',
      file_name: `${MARKER}-${s}.jpg`,
      file_path: `${companyId}/${fx[s].project}/${MARKER}-${s}.jpg`,
      file_size: 3,
      mime_type: 'image/jpeg',
    }));
  });

  it('files INSERT: a contracts-category file is refused even ON (carve-out 2)', async () => {
    const before = await tally('files', 'project_id', fx.on.project);
    const { error } = await pe.from('files').insert({
      company_id: companyId, project_id: fx.on.project, category: 'contracts',
      file_name: `${MARKER}-c.pdf`, file_path: `${companyId}/${fx.on.project}/${MARKER}-c.pdf`, file_size: 3, mime_type: 'application/pdf',
    });
    const after = await tally('files', 'project_id', fx.on.project);
    record('files_insert_contracts_on', { before, after, error: error?.message ?? null });
    expect(error?.message ?? '').toMatch(/row-level security/i);
    expect(after).toBe(before);
  });

  it('storage INSERT: upload into ON folder lands; into BARE folder refused', async () => {
    const onPath = `${companyId}/${fx.on.project}/${MARKER}-upload.txt`;
    const barePath = `${companyId}/${fx.bare.project}/${MARKER}-upload.txt`;
    uploaded.push(onPath, barePath);
    const body = new Blob(['s114'], { type: 'text/plain' });
    const onRes = await pe.storage.from('project-files').upload(onPath, body, { upsert: false });
    const bareRes = await pe.storage.from('project-files').upload(barePath, body, { upsert: false });
    const { data: onList } = await admin.storage.from('project-files').list(`${companyId}/${fx.on.project}`);
    const { data: bareList } = await admin.storage.from('project-files').list(`${companyId}/${fx.bare.project}`);
    const onCount = (onList ?? []).filter((o) => o.name === `${MARKER}-upload.txt`).length;
    const bareCount = (bareList ?? []).filter((o) => o.name === `${MARKER}-upload.txt`).length;
    record('storage_upload', { onErr: onRes.error?.message ?? null, bareErr: bareRes.error?.message ?? null, onCount, bareCount });
    expect(onRes.error?.message ?? null).toBeNull();
    expect(onCount).toBe(1);
    expect(bareRes.error?.message ?? '').toMatch(/row-level security|Unauthorized|policy/i);
    expect(bareCount).toBe(0);
  });
});

describe('S114 PART A — tasks, phases, inspections, schedule', () => {
  it('tasks INSERT', async () => {
    await insertBothWays('tasks_insert', 'tasks', (s) => ['project_id', fx[s].project], (s) => ({
      company_id: companyId, project_id: fx[s].project, title: `${MARKER} new ${s}`,
    }));
  });
  it('tasks UPDATE ON', async () => {
    await updateOn('tasks_update', 'tasks', fx.on.taskA, { title: `${MARKER} A edited` }, 'title');
  });
  it('task_dependencies INSERT', async () => {
    await insertBothWays('task_dependencies_insert', 'task_dependencies', (s) => ['predecessor_id', fx[s].taskA], (s) => ({
      company_id: companyId, predecessor_id: fx[s].taskA, successor_id: fx[s].taskB,
    }));
  });
  it('phases INSERT', async () => {
    await insertBothWays('phases_insert', 'phases', (s) => ['project_id', fx[s].project], (s) => ({
      company_id: companyId, project_id: fx[s].project, name: `${MARKER} new phase`, sort_order: 1,
    }));
  });
  it('phases UPDATE ON', async () => {
    await updateOn('phases_update', 'phases', fx.on.phase, { name: `${MARKER} phase edited` }, 'name');
  });
  it('inspections INSERT', async () => {
    await insertBothWays('inspections_insert', 'inspections', (s) => ['project_id', fx[s].project], (s) => ({
      company_id: companyId, project_id: fx[s].project, inspection_type: 'electrical',
    }));
  });
  it('inspections UPDATE ON', async () => {
    await updateOn('inspections_update', 'inspections', fx.on.inspection, { inspection_type: 'plumbing' }, 'inspection_type');
  });
  it('schedule_entries SELECT: ON entry (someone else\'s) visible, BARE not', async () => {
    const { data } = await pe.from('schedule_entries').select('id').in('id', [fx.on.schedule, fx.bare.schedule]);
    record('schedule_select', (data ?? []).map((r) => r.id));
    expect((data ?? []).map((r) => r.id)).toEqual([fx.on.schedule]);
  });
  it('schedule_entries INSERT', async () => {
    await insertBothWays('schedule_insert', 'schedule_entries', (s) => ['project_id', fx[s].project], (s) => ({
      company_id: companyId, project_id: fx[s].project, member_id: fx[s].crewMember, entry_date: '2026-10-02', general_kind: 'project',
    }));
  });
  it('schedule_entries INSERT with NO project (company schedule): refused', async () => {
    const before = await tally('schedule_entries', 'member_id', fx.on.crewMember);
    const { error } = await pe.from('schedule_entries').insert({
      company_id: companyId, project_id: null, member_id: fx.on.crewMember, entry_date: '2026-10-03', general_kind: 'pto',
    });
    const after = await tally('schedule_entries', 'member_id', fx.on.crewMember);
    record('schedule_insert_null_project', { before, after, error: error?.message ?? null });
    expect(error?.message ?? '').toMatch(/row-level security/i);
    expect(after).toBe(before);
  });
  it('schedule_entries UPDATE ON', async () => {
    await updateOn('schedule_update', 'schedule_entries', fx.on.schedule, { notes: `${MARKER} note` }, 'notes');
  });
});

describe('S114 PART A — purchase orders', () => {
  it('purchase_orders INSERT', async () => {
    await insertBothWays('po_insert', 'purchase_orders', (s) => ['project_id', fx[s].project], (s) => ({
      company_id: companyId, project_id: fx[s].project, vendor_name: `${MARKER} new vendor`,
    }));
  });
  it('purchase_orders UPDATE ON', async () => {
    await updateOn('po_update', 'purchase_orders', fx.on.po, { vendor_name: `${MARKER} vendor edited` }, 'vendor_name');
  });
  it('purchase_order_items INSERT', async () => {
    await insertBothWays('poi_insert', 'purchase_order_items', (s) => ['purchase_order_id', fx[s].po], (s) => ({
      company_id: companyId, purchase_order_id: fx[s].po, description: `${MARKER} new item`, qty_ordered: 2,
    }));
  });
  it('purchase_order_items UPDATE ON', async () => {
    await updateOn('poi_update', 'purchase_order_items', fx.on.poItem, { description: `${MARKER} item edited` }, 'description');
  });
  it('purchase_order_item_assignments INSERT', async () => {
    await insertBothWays('poia_insert', 'purchase_order_item_assignments', (s) => ['po_item_id', fx[s].poItem], (s) => ({
      company_id: companyId, po_item_id: fx[s].poItem, member_id: ownerMemberId,
    }));
  });
  it('set_po_total_amount: ON creates the committed expense (Q4 through the PE arm); BARE raises', async () => {
    const onRes = await pe.rpc('set_po_total_amount', { p_po_id: fx.on.po, p_amount: 250, p_budget_item_id: fx.on.budgetItem });
    const bareRes = await pe.rpc('set_po_total_amount', { p_po_id: fx.bare.po, p_amount: 250, p_budget_item_id: fx.bare.budgetItem });
    const onExp = await tally('expenses', 'purchase_order_id', fx.on.po);
    const bareExp = await tally('expenses', 'purchase_order_id', fx.bare.po);
    record('set_po_total_amount', { onErr: onRes.error?.message ?? null, bareErr: bareRes.error?.message ?? null, onExp, bareExp });
    expect(onRes.error?.message ?? null).toBeNull();
    expect(onExp).toBe(1);
    expect(bareRes.error?.message ?? '').toMatch(/not found/);
    expect(bareExp).toBe(0);
  });
  it('issue_po_lines and flag_po_item_missing: BARE raises, nothing changes', async () => {
    const issue = await pe.rpc('issue_po_lines', { p_po_id: fx.bare.po, p_item_ids: [fx.bare.poItem] });
    const flag = await pe.rpc('flag_po_item_missing', { p_item_id: fx.bare.poItem, p_note: 'x' });
    const { data } = await admin.from('purchase_order_items').select('line_status').eq('id', fx.bare.poItem).single();
    record('po_functions_bare', { issue: issue.error?.message ?? null, flag: flag.error?.message ?? null, status: data?.line_status });
    expect(issue.error?.message ?? '').toMatch(/not found/);
    expect(flag.error?.message ?? '').toMatch(/not (found|assigned)|only an issued/);
    expect(data?.line_status).toBe('draft');
  });
});

describe('S114 PART A — selections', () => {
  it('selections INSERT', async () => {
    await insertBothWays('selections_insert', 'selections', (s) => ['project_id', fx[s].project], (s) => ({
      company_id: companyId, project_id: fx[s].project, name: `${MARKER} new selection`,
    }));
  });
  it('selections UPDATE ON', async () => {
    await updateOn('selections_update', 'selections', fx.on.selection, { name: `${MARKER} selection edited` }, 'name');
  });
  it('selection_areas INSERT', async () => {
    await insertBothWays('areas_insert', 'selection_areas', (s) => ['project_id', fx[s].project], (s) => ({
      company_id: companyId, project_id: fx[s].project, name: `${MARKER} new area`,
    }));
  });
  it('selection_options INSERT', async () => {
    await insertBothWays('options_insert', 'selection_options', (s) => ['selection_id', fx[s].selection], (s) => ({
      company_id: companyId, selection_id: fx[s].selection, name: `${MARKER} new option`, source: 'scratch',
    }));
  });
  it('selection_option_amounts INSERT', async () => {
    await insertBothWays('option_amounts_insert', 'selection_option_amounts', (s) => ['option_id', fx[s].option], (s) => ({
      company_id: companyId, option_id: fx[s].option, quantity: 1, unit_cost: 10, markup_percent: 10,
    }));
  });
  it('selection_amounts INSERT', async () => {
    await insertBothWays('amounts_insert', 'selection_amounts', (s) => ['selection_id', fx[s].selection], (s) => ({
      company_id: companyId, selection_id: fx[s].selection,
    }));
  });
  it('selection_notes INSERT', async () => {
    await insertBothWays('notes_insert', 'selection_notes', (s) => ['selection_id', fx[s].selection], (s) => ({
      company_id: companyId, selection_id: fx[s].selection, internal_notes: `${MARKER} note`,
    }));
  });
  it('selection_threads INSERT', async () => {
    await insertBothWays('threads_insert', 'selection_threads', (s) => ['selection_id', fx[s].selection], (s) => ({
      company_id: companyId, selection_id: fx[s].selection,
    }));
  });
  it('selection_option_amounts / selection_amounts / selection_notes are READABLE ON', async () => {
    const oa = await pe.from('selection_option_amounts').select('id').eq('option_id', fx.on.option);
    const a = await pe.from('selection_amounts').select('id').eq('selection_id', fx.on.selection);
    const n = await pe.from('selection_notes').select('id').eq('selection_id', fx.on.selection);
    const bareOa = await pe.from('selection_option_amounts').select('id').eq('option_id', fx.bare.option);
    const counts = { oa: (oa.data ?? []).length, a: (a.data ?? []).length, n: (n.data ?? []).length, bareOa: (bareOa.data ?? []).length };
    record('selection_reads', counts);
    expect(counts).toEqual({ oa: 1, a: 1, n: 1, bareOa: 0 });
  });
});

describe('S114 PART A — the project team, contacts and status', () => {
  it('project_assignments INSERT (S111 Q8: an existing member)', async () => {
    await insertBothWays('assignments_insert', 'project_assignments', (s) => ['project_id', fx[s].project], (s) => ({
      company_id: companyId, project_id: fx[s].project, member_id: fx[s].crewMember,
    }));
  });
  it('project_contacts INSERT', async () => {
    await insertBothWays('project_contacts_insert', 'project_contacts', (s) => ['project_id', fx[s].project], (s) => ({
      company_id: companyId, project_id: fx[s].project, contact_id: fx[s].contact,
    }));
  });
  it('projects UPDATE status on_hold ON lands (Q3 A), then back to active', async () => {
    await updateOn('project_on_hold', 'projects', fx.on.project, { status: 'on_hold' }, 'status');
    await updateOn('project_active', 'projects', fx.on.project, { status: 'active' }, 'status');
  });
  it('projects UPDATE to archived, and to trash, are refused ON (Owner/Admin)', async () => {
    await pe.from('projects').update({ status: 'archived' }).eq('id', fx.on.project);
    await pe.from('projects').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', fx.on.project);
    const { data } = await admin.from('projects').select('status, is_deleted').eq('id', fx.on.project).single();
    record('project_archive_trash', data);
    expect(data).toEqual({ status: 'active', is_deleted: false });
  });
});

describe('S114 PART A — chat and expenses', () => {
  it('chat_messages INSERT in the sub thread', async () => {
    await insertBothWays('chat_insert', 'chat_messages', (s) => ['thread_id', fx[s].subThread], (s) => ({
      company_id: companyId, thread_id: fx[s].subThread, author_profile_id: peProfileId, body: `${MARKER} hello`,
    }));
  });
  it('chat_can_post: ON sub thread true, BARE false; may_enter_client_thread true', async () => {
    const onPost = await pe.rpc('chat_can_post', { p_thread_id: fx.on.subThread });
    const barePost = await pe.rpc('chat_can_post', { p_thread_id: fx.bare.subThread });
    const client = await pe.rpc('may_enter_client_thread');
    record('chat_functions', { on: onPost.data, bare: barePost.data, client: client.data });
    expect(onPost.data).toBe(true);
    expect(barePost.data).toBe(false);
    expect(client.data).toBe(true);
  });
  it('expenses INSERT: committed, subcontractor category, awaiting paper (Q4 A)', async () => {
    await insertBothWays('expenses_insert', 'expenses', (s) => ['project_id', fx[s].project], (s) => ({
      company_id: companyId, project_id: fx[s].project, supplier: `${MARKER} sub`, expense_date: '2026-09-28',
      amount: 75, cost_category: 'subcontractor', state: 'committed', awaiting_paper: true, author_member_id: peMemberId,
    }));
  });
  it('expenses INSERT with is_retainage: refused even ON (Owner/Admin)', async () => {
    const before = await tally('expenses', 'project_id', fx.on.project);
    const { error } = await pe.from('expenses').insert({
      company_id: companyId, project_id: fx.on.project, supplier: `${MARKER} ret`, expense_date: '2026-09-28',
      amount: 5, is_retainage: true, author_member_id: peMemberId,
    });
    const after = await tally('expenses', 'project_id', fx.on.project);
    record('expenses_retainage_on', { before, after, error: error?.message ?? null });
    expect(error?.message ?? '').toMatch(/row-level security/i);
    expect(after).toBe(before);
  });
  it('create_budget_line_at_capture: ON returns a line; BARE raises', async () => {
    const onRes = await pe.rpc('create_budget_line_at_capture', { p_project_id: fx.on.project, p_description: `${MARKER} captured` });
    const bareRes = await pe.rpc('create_budget_line_at_capture', { p_project_id: fx.bare.project, p_description: `${MARKER} captured` });
    record('budget_line_capture', { on: onRes.error?.message ?? 'ok', bare: bareRes.error?.message ?? 'ok' });
    expect(onRes.error?.message ?? null).toBeNull();
    expect(bareRes.error?.message ?? '').toMatch(/not visible/);
  });
});

describe('S114 PART A — the ruled company-level READS (S111 Q2, Q3)', () => {
  it('the whole roster and the cost catalog, row for row with the service role', async () => {
    const svcProfiles = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', companyId);
    const svcMembers = await admin.from('company_members').select('id', { count: 'exact', head: true }).eq('company_id', companyId);
    const svcCatalog = await admin.from('cost_catalog').select('id', { count: 'exact', head: true }).eq('company_id', companyId);
    const peProfiles = await pe.from('profiles').select('id', { count: 'exact', head: true });
    const peMembers = await pe.from('company_members').select('id', { count: 'exact', head: true });
    const peCatalog = await pe.from('cost_catalog').select('id', { count: 'exact', head: true });
    const r = {
      profiles: [peProfiles.count, svcProfiles.count],
      members: [peMembers.count, svcMembers.count],
      catalog: [peCatalog.count, svcCatalog.count],
      catalogItem: catalogItemId,
    };
    record('roster_catalog', r);
    expect(svcProfiles.count ?? 0).toBeGreaterThan(1);
    expect(peProfiles.count).toBe(svcProfiles.count);
    expect(peMembers.count).toBe(svcMembers.count);
    expect(svcCatalog.count ?? 0).toBeGreaterThan(0);
    expect(peCatalog.count).toBe(svcCatalog.count);
  });
  it('and still no catalog WRITE', async () => {
    const before = await tally('cost_catalog', 'company_id', companyId);
    const { error } = await pe.from('cost_catalog').insert({ company_id: companyId, name: `${MARKER} pe item`, category: 'material', unit_of_measure: 'ea', unit_cost: 1 });
    const after = await tally('cost_catalog', 'company_id', companyId);
    record('catalog_write', { before, after, error: error?.message ?? null });
    expect(error?.message ?? '').toMatch(/row-level security/i);
    expect(after).toBe(before);
  });
});
