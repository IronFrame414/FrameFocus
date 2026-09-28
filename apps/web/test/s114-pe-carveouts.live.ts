/**
 * S114 PART A, FILL-A-4 — the Project Executive's two carve-outs, proven
 * NEGATIVELY on its OWN project.
 *
 * R1 [Josh, 2026-09-27]: complete access to its projects EXCEPT (1) no refunds,
 * neither issue nor approve; (2) no contract authority — client contracts,
 * contract documents, subcontracts. S114 Q2 B: nor a client contract's VALUE
 * (client_contract_amounts). S114 Q5 A: nor setup_payment_schedule().
 *
 * WHY ITS OWN PROJECT: there the READ arm admits the row, so what refuses is
 * the WRITE arm. Off-project, the read arm refuses first and the test measures
 * nothing about the write.
 *
 * ⚠️ NO RETURNING on any negative write. `.insert().select()` makes Postgres
 * check the new row against the SELECT policy, so an insert negative goes
 * green whether or not a write arm exists. Every INSERT probe is judged by a
 * service-role tally before and after; every UPDATE probe by the service
 * role re-reading the column.
 *
 * ⚠️ FRESH DISPOSABLE PROJECT (`PEC ON`) holding none of the one-per-parent
 * rows a widened arm would collide with: a second client contract (N9i) has no
 * amount row, so an amount INSERT that a widened arm admitted would LAND where
 * the tally sees it instead of failing on client_contract_amounts'
 * unique(client_contract_id).
 *
 * SABOTAGE PROTOCOL (run by hand through MCP on rebuild-test, recorded in
 * docs/sessions/S114-report.md): for each probe, a temporary
 * `CREATE POLICY <table>_<cmd>_s114_sabotage … pe_on_project(project_id)` (or a
 * function replaced with the PE in its role list), then this file, which must
 * go RED on that probe; then DROP / restore, with pg_policies (or
 * md5(prosrc)) read back identical to the pre-sabotage snapshot.
 *
 *   npx vitest run --config test/live.vitest.config.ts s114-pe-carveouts
 *
 * RUN ONLY WHILE NO CI IS LIVE (one shared rebuild-test database).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { admin, assertRebuildTest, deleteProjects, sessionFor } from './live-session';

const PE = 'josh+qa-pe@worthprop.com';
const MARKER = 'PEC';

const OUT: Record<string, unknown> = {};
const record = (k: string, v: unknown) => {
  OUT[k] = v;
  if (process.env.PE_CARVEOUTS_OUT)
    writeFileSync(process.env.PE_CARVEOUTS_OUT, JSON.stringify(OUT, null, 2));
};

let pe: SupabaseClient;
let companyId = '';
let peMemberId = '';
let contactId = '';
let subMemberId = '';
let subTemplateId = '';
const on = {
  project: '',
  refund: '',
  contract: '',
  contractBare: '',
  amount: '',
  subContract: '',
};

async function sweep() {
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  const ids = (ps ?? []).map((p) => p.id as string);
  if (ids.length) {
    const { data: ccs } = await admin.from('client_contracts').select('id').in('project_id', ids);
    const ccIds = (ccs ?? []).map((c) => c.id as string);
    if (ccIds.length) await admin.from('client_contract_amounts').delete().in('client_contract_id', ccIds);
    await admin.from('contract_documents').delete().in('project_id', ids);
    const { data: scs } = await admin.from('subcontractor_contracts').select('id').in('project_id', ids);
    const scIds = (scs ?? []).map((c) => c.id as string);
    if (scIds.length) {
      await admin.from('contract_documents').delete().in('sub_contract_id', scIds);
      await admin.from('expenses').delete().in('sub_contract_id', scIds);
    }
    await admin.from('subcontractor_contracts').delete().in('project_id', ids);
    await admin.from('client_refunds').delete().in('project_id', ids);
    await admin.from('client_contracts').delete().in('project_id', ids);
    await admin.from('project_assignments').delete().in('project_id', ids);
    await deleteProjects(admin, ids);
  }
  await admin.from('company_members').delete().eq('display_name', `${MARKER} Sub`);
  await admin.from('contacts').delete().eq('last_name', `${MARKER} Client`);
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: prof, error } = await admin
    .from('profiles')
    .select('id, company_id, role')
    .eq('email', PE)
    .single();
  if (error || !prof) throw new Error(`no ${PE} — run scripts/seed-test-identities.mjs`);
  expect(prof.role).toBe('project_executive');
  companyId = prof.company_id as string;
  const { data: m } = await admin.from('company_members').select('id').eq('profile_id', prof.id).single();
  peMemberId = m!.id as string;

  await sweep();

  const { data: c, error: cErr } = await admin
    .from('contacts')
    .insert({ company_id: companyId, first_name: 'PE', last_name: `${MARKER} Client`, contact_type: 'client' })
    .select('id')
    .single();
  if (cErr) throw new Error(`contact: ${cErr.message}`);
  contactId = c!.id as string;

  const { data: sm, error: smErr } = await admin
    .from('company_members')
    .insert({ company_id: companyId, member_type: 'subcontractor', display_name: `${MARKER} Sub` })
    .select('id')
    .single();
  if (smErr) throw new Error(`sub member: ${smErr.message}`);
  subMemberId = sm!.id as string;

  const { data: tpl } = await admin
    .from('contract_templates')
    .select('id')
    .eq('company_id', companyId)
    .eq('document_kind', 'sub_contract')
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  subTemplateId = tpl!.id as string;

  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: p, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      project_number: 'PRJ-PEC-ON',
      name: `${MARKER} ON project`,
      status: 'active',
      project_internal_seq: (seqRow?.project_internal_seq ?? 0) + 5000,
    })
    .select('id')
    .single();
  if (pErr) throw new Error(`project: ${pErr.message}`);
  on.project = p!.id as string;

  const { error: aErr } = await admin.from('project_assignments').insert({
    company_id: companyId,
    project_id: on.project,
    member_id: peMemberId,
    role_on_project: 'project_executive',
  });
  if (aErr) throw new Error(`assign: ${aErr.message}`);

  const { data: r, error: rErr } = await admin
    .from('client_refunds')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      project_id: on.project,
      refund_date: '2026-09-28',
      amount: 10,
      source: 'other',
    })
    .select('id')
    .single();
  if (rErr) throw new Error(`refund: ${rErr.message}`);
  on.refund = r!.id as string;

  const { data: cc, error: ccErr } = await admin
    .from('client_contracts')
    .insert({ company_id: companyId, project_id: on.project, status: 'sent', notes: 'fixture' })
    .select('id')
    .single();
  if (ccErr) throw new Error(`contract: ${ccErr.message}`);
  on.contract = cc!.id as string;
  const { data: amt, error: amtErr } = await admin
    .from('client_contract_amounts')
    .insert({ company_id: companyId, client_contract_id: on.contract, contract_value: 50000 })
    .select('id')
    .single();
  if (amtErr) throw new Error(`amount: ${amtErr.message}`);
  on.amount = amt!.id as string;
  // A second contract with NO amount row: N9i's landing place (unique key).
  const { data: cb, error: cbErr } = await admin
    .from('client_contracts')
    .insert({ company_id: companyId, project_id: on.project, status: 'draft' })
    .select('id')
    .single();
  if (cbErr) throw new Error(`bare contract: ${cbErr.message}`);
  on.contractBare = cb!.id as string;

  const { data: sc, error: scErr } = await admin
    .from('subcontractor_contracts')
    .insert({
      company_id: companyId,
      project_id: on.project,
      member_id: subMemberId,
      status: 'draft',
      contract_value: 1000,
      scope_of_work: 'fixture',
    })
    .select('id')
    .single();
  if (scErr) throw new Error(`subcontract: ${scErr.message}`);
  on.subContract = sc!.id as string;

  pe = await sessionFor(PE);
}, 180_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .like('name', `${MARKER} %`);
  record('teardown_projects_left', count ?? 0);
  expect(count ?? 0, 'disposable PEC projects survived teardown').toBe(0);
}, 180_000);

/** Service-role count of rows where `col = id`. */
async function tally(table: string, col: string, id: string): Promise<number> {
  const { count, error } = await admin.from(table).select('id', { count: 'exact', head: true }).eq(col, id);
  if (error) throw new Error(`tally ${table}: ${error.message}`);
  return count ?? 0;
}

/** No RETURNING: the write policy alone judges an INSERT. */
async function quietInsert(table: string, row: Record<string, unknown>): Promise<string | null> {
  const { error } = await pe.from(table).insert(row);
  return error?.message ?? null;
}

/** No RETURNING: an UPDATE as the PE; the service role reads the result. */
async function quietUpdate(table: string, patch: Record<string, unknown>, id: string): Promise<string | null> {
  const { error } = await pe.from(table).update(patch).eq('id', id);
  return error?.message ?? null;
}

async function col(table: string, column: string, id: string): Promise<unknown> {
  const { data, error } = await admin.from(table).select(column).eq('id', id).single();
  if (error) throw new Error(`read ${table}.${column}: ${error.message}`);
  return (data as unknown as Record<string, unknown>)[column];
}

async function peSees(table: string, id: string): Promise<number> {
  const { data } = await pe.from(table).select('id').eq('id', id);
  return (data ?? []).length;
}

describe('S114 FILL-A-4 — CONTROL: the fixtures are what they claim', () => {
  it('the PE is on PEC ON and READS the refund, both contracts, the amount and the subcontract', async () => {
    const seen = {
      refund: await peSees('client_refunds', on.refund),
      contract: await peSees('client_contracts', on.contract),
      amount: await peSees('client_contract_amounts', on.amount),
      subContract: await peSees('subcontractor_contracts', on.subContract),
    };
    record('control_reads', seen);
    // Each read arm admits the row, so every refusal below is the WRITE arm.
    expect(seen).toEqual({ refund: 1, contract: 1, amount: 1, subContract: 1 });
  });

  it('the PE does NOT read contract_documents (N7 UPDATE cannot be isolated — stated limit)', async () => {
    const { data } = await pe.from('contract_documents').select('id').eq('project_id', on.project);
    record('control_contract_documents_read', (data ?? []).length);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('S114 FILL-A-4 carve-out 1 — no refunds, neither issue nor approve', () => {
  it('N1 client_refunds INSERT (issue) on its own project: refused, tally unchanged', async () => {
    const before = await tally('client_refunds', 'project_id', on.project);
    const err = await quietInsert('client_refunds', {
      company_id: companyId,
      contact_id: contactId,
      project_id: on.project,
      refund_date: '2026-09-28',
      amount: 11,
      source: 'other',
    });
    const after = await tally('client_refunds', 'project_id', on.project);
    record('N1', { before, after, err });
    expect(before).toBe(1);
    expect(err ?? '').toMatch(/row-level security/i);
    expect(after).toBe(before);
  });

  it('N2 client_refunds UPDATE to approved (approve) on its own project: unchanged', async () => {
    const err = await quietUpdate(
      'client_refunds',
      { status: 'approved', approved_at: new Date().toISOString(), approved_by: peMemberId },
      on.refund
    );
    const status = await col('client_refunds', 'status', on.refund);
    const approvedAt = await col('client_refunds', 'approved_at', on.refund);
    record('N2', { err, status, approvedAt });
    expect(status).toBe('pending_approval');
    expect(approvedAt).toBeNull();
  });
});

describe('S114 FILL-A-4 carve-out 2 — no contract authority', () => {
  it('N3 client_contracts INSERT on its own project: refused, tally unchanged', async () => {
    const before = await tally('client_contracts', 'project_id', on.project);
    const err = await quietInsert('client_contracts', {
      company_id: companyId,
      project_id: on.project,
      status: 'draft',
    });
    const after = await tally('client_contracts', 'project_id', on.project);
    record('N3', { before, after, err });
    expect(before).toBe(2);
    expect(err ?? '').toMatch(/row-level security/i);
    expect(after).toBe(before);
  });

  it('N4 client_contracts UPDATE notes (manage) on its own project: unchanged', async () => {
    const err = await quietUpdate('client_contracts', { notes: 'changed by PE' }, on.contract);
    const notes = await col('client_contracts', 'notes', on.contract);
    record('N4', { err, notes });
    expect(notes).toBe('fixture');
  });

  it('N4v client_contracts UPDATE status=void on its own project: unchanged', async () => {
    const err = await quietUpdate('client_contracts', { status: 'void' }, on.contract);
    const status = await col('client_contracts', 'status', on.contract);
    record('N4v', { err, status });
    expect(status).toBe('sent');
  });

  it('N5 subcontractor_contracts INSERT on its own project: refused, tally unchanged', async () => {
    const before = await tally('subcontractor_contracts', 'project_id', on.project);
    const err = await quietInsert('subcontractor_contracts', {
      company_id: companyId,
      project_id: on.project,
      member_id: subMemberId,
      status: 'draft',
      contract_value: 5,
    });
    const after = await tally('subcontractor_contracts', 'project_id', on.project);
    record('N5', { before, after, err });
    expect(before).toBe(1);
    expect(err ?? '').toMatch(/row-level security/i);
    expect(after).toBe(before);
  });

  // N6 measures the RLS UPDATE arm with a column no trigger guards. [S114
  // sabotage round A: the first draft updated contract_value, which
  // enforce_subcontractor_contracts_column_scope refuses for any non-O/A role
  // ("The financial terms of a subcontract are Owner/Admin only") — so it
  // stayed green with the RLS arm widened and measured the TRIGGER, not RLS.
  // That probe is kept, renamed N6f, as the second line.]
  it('N6 subcontractor_contracts UPDATE scope_of_work (manage) on its own project: unchanged', async () => {
    const err = await quietUpdate('subcontractor_contracts', { scope_of_work: 'changed by PE' }, on.subContract);
    const scope = await col('subcontractor_contracts', 'scope_of_work', on.subContract);
    record('N6', { err, scope });
    expect(scope).toBe('fixture');
  });

  it('N6f subcontractor_contracts UPDATE contract_value (second line: column-scope trigger): unchanged', async () => {
    const err = await quietUpdate('subcontractor_contracts', { contract_value: 999999 }, on.subContract);
    const value = await col('subcontractor_contracts', 'contract_value', on.subContract);
    record('N6f', { err, value });
    expect(Number(value)).toBe(1000);
  });

  it('N6v subcontractor_contracts UPDATE status=void (second line: void trigger): unchanged', async () => {
    const err = await quietUpdate('subcontractor_contracts', { status: 'void' }, on.subContract);
    const status = await col('subcontractor_contracts', 'status', on.subContract);
    record('N6v', { err, status });
    expect(status).toBe('draft');
  });

  it('N7 contract_documents INSERT on its own subcontract: refused, tally unchanged', async () => {
    const before = await tally('contract_documents', 'sub_contract_id', on.subContract);
    const err = await quietInsert('contract_documents', {
      company_id: companyId,
      template_id: subTemplateId,
      document_kind: 'sub_contract',
      sub_contract_id: on.subContract,
      project_id: on.project,
      status: 'draft',
      delivery_mode: 'esignature',
    });
    const after = await tally('contract_documents', 'sub_contract_id', on.subContract);
    record('N7', { before, after, err });
    expect(before).toBe(0);
    expect(err ?? '').toMatch(/row-level security/i);
    expect(after).toBe(0);
  });

  it('N8 setup_payment_schedule() on its own subcontract: raises, no stage expense created', async () => {
    const before = await tally('expenses', 'sub_contract_id', on.subContract);
    const { error } = await pe.rpc('setup_payment_schedule', {
      p_sub_contract_id: on.subContract,
      p_stages: [{ label: 'PEC stage', amount: 100 }],
      p_retainage_shape: null,
      p_retainage_percent: null,
    });
    const after = await tally('expenses', 'sub_contract_id', on.subContract);
    const shape = await col('subcontractor_contracts', 'retainage_shape', on.subContract);
    record('N8', { before, after, err: error?.message ?? null, shape });
    expect(error?.message ?? '').toMatch(/Only Owner\/Admin\/PM may set up a payment schedule/);
    expect(after).toBe(before);
  });

  it('N9i client_contract_amounts INSERT on its own bare contract (S114 Q2 B): refused, tally 0', async () => {
    const before = await tally('client_contract_amounts', 'client_contract_id', on.contractBare);
    const err = await quietInsert('client_contract_amounts', {
      company_id: companyId,
      client_contract_id: on.contractBare,
      contract_value: 1,
    });
    const after = await tally('client_contract_amounts', 'client_contract_id', on.contractBare);
    record('N9i', { before, after, err });
    expect(before).toBe(0);
    expect(err ?? '').toMatch(/row-level security/i);
    expect(after).toBe(0);
  });

  it('N9u client_contract_amounts UPDATE contract_value (S114 Q2 B): unchanged', async () => {
    const err = await quietUpdate('client_contract_amounts', { contract_value: 1 }, on.amount);
    const value = await col('client_contract_amounts', 'contract_value', on.amount);
    record('N9u', { err, value });
    expect(Number(value)).toBe(50000);
  });
});
