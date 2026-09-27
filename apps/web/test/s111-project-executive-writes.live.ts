/**
 * S111 Part One, step 3 — the Project Executive's WRITES, proven both ways.
 *
 * 20261910000000 gives the role write arms and approve/void authority on ITS
 * projects. This proves, as the real `josh+qa-pe` session:
 *   · ON  its project: every write lands (row counts stated);
 *   · OFF its project: the same write is refused or touches ZERO rows.
 * The OFF half is the floor; the ON half is the point of the build. Neither is
 * worth anything alone: run BEFORE the migration, the ON half must go red and
 * the OFF half stay green (the negative-first control, S112 bid-token pattern).
 *
 * ⚠️ DISPOSABLE FIXTURES, never shared rows. Two projects of its own
 * (`PEW-ON`, `PEW-OFF`) in the PE's company, a PE assignment on ON only, and
 * every row below lives on one of them. A no-op UPDATE of a shared fixture
 * would still re-stamp its updated_by/updated_at forever. Swept by marker on
 * the way in (a killed run) and on the way out. RUN ONLY WHILE NO CI IS LIVE.
 *
 *   npx vitest run --config test/live.vitest.config.ts s111-project-executive-writes
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { admin, assertRebuildTest, deleteProjects, sessionFor } from './live-session';

const PE = 'josh+qa-pe@worthprop.com';
const MARKER = 'PEW';

const OUT: Record<string, unknown> = {};
const record = (k: string, v: unknown) => {
  OUT[k] = v;
  if (process.env.PE_WRITES_OUT)
    writeFileSync(process.env.PE_WRITES_OUT, JSON.stringify(OUT, null, 2));
};

let pe: SupabaseClient;
let companyId = '';
let peMemberId = '';
let contactId = '';
const proj = { on: '', off: '' };
const co = { on: '', off: '' };
const inv = { on: '', off: '' };
const bi = { on: '', off: '' };

async function sweep() {
  const { data: ps } = await admin.from('projects').select('id').like('name', `${MARKER} %`);
  const ids = (ps ?? []).map((p) => p.id as string);
  if (ids.length) {
    await admin
      .from('change_order_line_items')
      .delete()
      .in(
        'change_order_id',
        ((await admin.from('change_orders').select('id').in('project_id', ids)).data ?? []).map(
          (c) => c.id
        )
      );
    await admin.from('change_orders').delete().in('project_id', ids);
    await admin.from('invoices').delete().in('project_id', ids);
    // [S181] Q1 / Q2 fixtures.
    await admin.from('client_refunds').delete().in('project_id', ids);
    await admin.from('client_contracts').delete().in('project_id', ids);
    await admin
      .from('project_budget_amounts')
      .delete()
      .in(
        'budget_item_id',
        (
          (await admin.from('project_budget_items').select('id').in('project_id', ids)).data ?? []
        ).map((b) => b.id)
      );
    await admin.from('project_budget_items').delete().in('project_id', ids);
    await admin.from('project_financials').delete().in('project_id', ids);
    await admin.from('project_assignments').delete().in('project_id', ids);
    await deleteProjects(admin, ids);
  }
  await admin.from('contacts').delete().eq('last_name', `${MARKER} Client`);
}

async function makeProject(tag: 'ON' | 'OFF', seq: number): Promise<string> {
  const { data, error } = await admin
    .from('projects')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      project_number: `PRJ-PEW-${tag}`,
      name: `${MARKER} ${tag} project`,
      status: 'active',
      project_internal_seq: seq,
    })
    .select('id')
    .single();
  if (error) throw new Error(`project ${tag}: ${error.message}`);
  const id = data!.id as string;
  await admin
    .from('project_financials')
    .insert({ company_id: companyId, project_id: id, contract_value: 50000 });
  const { data: item, error: biErr } = await admin
    .from('project_budget_items')
    .insert({ company_id: companyId, project_id: id, description: `${MARKER} line` })
    .select('id')
    .single();
  if (biErr) throw new Error(`budget item ${tag}: ${biErr.message}`);
  await admin
    .from('project_budget_amounts')
    .insert({ company_id: companyId, budget_item_id: item!.id, budgeted_amount: 1000 });
  bi[tag === 'ON' ? 'on' : 'off'] = item!.id as string;
  return id;
}

async function makeCo(projectId: string, n: number): Promise<string> {
  const { data, error } = await admin
    .from('change_orders')
    .insert({
      company_id: companyId,
      project_id: projectId,
      co_number: `${MARKER}-${n}`,
      title: `${MARKER} CO ${n}`,
      co_type: 'fixed_price',
      status: 'draft',
      author_member_id: peMemberId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`CO: ${error.message}`);
  return data!.id as string;
}

async function makeInvoice(projectId: string): Promise<string> {
  const { data, error } = await admin
    .from('invoices')
    .insert({
      company_id: companyId,
      project_id: projectId,
      author_member_id: peMemberId,
      title: `${MARKER} invoice`,
      presentation_level: 'full_detail',
    })
    .select('id')
    .single();
  if (error) throw new Error(`invoice: ${error.message}`);
  return data!.id as string;
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
  const { data: m } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', prof.id)
    .single();
  peMemberId = m!.id as string;

  await sweep();

  const { data: c, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId,
      first_name: 'PE',
      last_name: `${MARKER} Client`,
      contact_type: 'client',
    })
    .select('id')
    .single();
  if (cErr) throw new Error(`contact: ${cErr.message}`);
  contactId = c!.id as string;
  const { data: seqRow } = await admin
    .from('projects')
    .select('project_internal_seq')
    .eq('company_id', companyId)
    .order('project_internal_seq', { ascending: false })
    .limit(1)
    .maybeSingle();
  const base = (seqRow?.project_internal_seq ?? 0) + 4000;
  proj.on = await makeProject('ON', base);
  proj.off = await makeProject('OFF', base + 1);

  const { error: aErr } = await admin.from('project_assignments').insert({
    company_id: companyId,
    project_id: proj.on,
    member_id: peMemberId,
    role_on_project: 'project_executive',
  });
  if (aErr) throw new Error(`assign: ${aErr.message}`);

  co.on = await makeCo(proj.on, 1);
  co.off = await makeCo(proj.off, 2);
  inv.on = await makeInvoice(proj.on);
  inv.off = await makeInvoice(proj.off);

  pe = await sessionFor(PE);
}, 180_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .like('name', `${MARKER} %`);
  record('teardown_projects_left', count ?? 0);
  expect(count ?? 0, 'disposable PEW projects survived teardown').toBe(0);
}, 180_000);

/** Rows an UPDATE touched, as the PE sees it: RLS turns a refusal into 0. */
async function touched(
  table: string,
  patch: Record<string, unknown>,
  id: string,
  key = 'id'
): Promise<number> {
  const { data, error } = await pe.from(table).update(patch).eq(key, id).select(key);
  if (error) return -1;
  return (data ?? []).length;
}

describe('S111 step 3 — CONTROL: the fixtures are what they claim', () => {
  it('the PE READS its ON project money and nothing on OFF (the read arms, 20261830000000)', async () => {
    const onRead =
      (await pe.from('project_financials').select('project_id').eq('project_id', proj.on)).data ??
      [];
    const offRead =
      (await pe.from('project_financials').select('project_id').eq('project_id', proj.off)).data ??
      [];
    record('read_financials_on_off', [onRead.length, offRead.length]);
    expect(onRead.length).toBe(1);
    expect(offRead.length).toBe(0);
  });
});

describe('S111 step 3 — ON its project, every write lands', () => {
  it('W1 change order: update, insert, add a line item', async () => {
    const upd = await touched('change_orders', { title: `${MARKER} CO 1 (PE edit)` }, co.on);
    const { data: ins, error: insErr } = await pe
      .from('change_orders')
      .insert({
        project_id: proj.on,
        co_number: `${MARKER}-3`,
        title: `${MARKER} CO 3`,
        co_type: 'fixed_price',
        status: 'draft',
      })
      .select('id');
    const { data: li, error: liErr } = await pe
      .from('change_order_line_items')
      .insert({ change_order_id: co.on, name: `${MARKER} line`, sort_order: 0 })
      .select('id');
    record('W1_on', {
      update: upd,
      insert: ins?.length ?? insErr?.message,
      lineItem: li?.length ?? liErr?.message,
    });
    expect(upd).toBe(1);
    expect(insErr?.message ?? null).toBeNull();
    expect(ins).toHaveLength(1);
    expect(liErr?.message ?? null).toBeNull();
    expect(li).toHaveLength(1);
  });

  it('W2 money side tables: contract value and budgeted amount', async () => {
    const fin = await touched(
      'project_financials',
      { contract_value: 51000 },
      proj.on,
      'project_id'
    );
    const bud = await touched(
      'project_budget_amounts',
      { budgeted_amount: 1100 },
      bi.on,
      'budget_item_id'
    );
    record('W2_on', { financials: fin, budgetAmounts: bud });
    expect(fin).toBe(1);
    expect(bud).toBe(1);
  });

  it('W3 invoice: edit, approve, then void (FILL-5: send and void on its projects)', async () => {
    const edit = await touched('invoices', { title: `${MARKER} invoice (PE edit)` }, inv.on);
    const approve = await touched('invoices', { approved_at: new Date().toISOString() }, inv.on);
    const vo = await touched(
      'invoices',
      { status: 'voided', void_reason: `${MARKER} test`, voided_at: new Date().toISOString() },
      inv.on
    );
    record('W3_on', { edit, approve, void: vo });
    expect(edit).toBe(1);
    expect(approve).toBe(1);
    expect(vo).toBe(1);
  });

  it('W4 change order void — any author on its project', async () => {
    const vo = await touched(
      'change_orders',
      { status: 'voided', void_reason: `${MARKER} test`, voided_at: new Date().toISOString() },
      co.on
    );
    record('W4_on', vo);
    expect(vo).toBe(1);
  });
});

describe('S111 step 3 — OFF its project, the same writes touch NOTHING', () => {
  it('X1 change order: update 0, insert refused, line item refused', async () => {
    const upd = await touched('change_orders', { title: 'should not land' }, co.off);
    const { data: ins } = await pe
      .from('change_orders')
      .insert({
        project_id: proj.off,
        co_number: `${MARKER}-4`,
        title: `${MARKER} CO 4`,
        co_type: 'fixed_price',
        status: 'draft',
      })
      .select('id');
    const { data: li } = await pe
      .from('change_order_line_items')
      .insert({ change_order_id: co.off, name: 'should not land', sort_order: 0 })
      .select('id');
    record('X1_off', { update: upd, insert: ins?.length ?? 0, lineItem: li?.length ?? 0 });
    expect(upd).toBeLessThanOrEqual(0);
    expect(ins?.length ?? 0).toBe(0);
    expect(li?.length ?? 0).toBe(0);
  });

  // [S181b] X1 above cannot fail on the INSERT arms: `.insert().select()` also
  // checks the new row against the PE's SELECT arm, whose refusal rolls the
  // statement back. Measured: with change_orders_insert_project_executive and
  // change_order_line_items_insert_project_executive widened to
  // `company_id AND role`, X1 stayed green. X1 is kept (it still proves the
  // read side); this is the probe that reaches the write arms — NO RETURNING,
  // judged by the service role's count.
  it('X1b the same inserts WITHOUT RETURNING: refused by the write arm, service role counts nothing new', async () => {
    const { error: insErr } = await pe.from('change_orders').insert({
      project_id: proj.off,
      co_number: `${MARKER}-5`,
      title: `${MARKER} CO 5`,
      co_type: 'fixed_price',
      status: 'draft',
    });
    const { error: liErr } = await pe
      .from('change_order_line_items')
      .insert({ change_order_id: co.off, name: 'should not land', sort_order: 0 });
    const { count: coCount } = await admin
      .from('change_orders')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', proj.off);
    const { count: liCount } = await admin
      .from('change_order_line_items')
      .select('id', { count: 'exact', head: true })
      .eq('change_order_id', co.off);
    record('X1b_off_no_returning', {
      insert: insErr?.message ?? null,
      lineItem: liErr?.message ?? null,
      coCount,
      liCount,
    });
    expect(insErr?.message ?? '').toMatch(/row-level security/i);
    expect(liErr?.message ?? '').toMatch(/row-level security/i);
    expect(coCount).toBe(1); // the service role's CO 2 only
    expect(liCount).toBe(0);
  });

  it('X2 money side tables untouched', async () => {
    const fin = await touched('project_financials', { contract_value: 1 }, proj.off, 'project_id');
    const bud = await touched(
      'project_budget_amounts',
      { budgeted_amount: 1 },
      bi.off,
      'budget_item_id'
    );
    record('X2_off', { financials: fin, budgetAmounts: bud });
    expect(fin).toBeLessThanOrEqual(0);
    expect(bud).toBeLessThanOrEqual(0);
  });

  it('X3 invoice: edit / approve / void all touch nothing', async () => {
    const edit = await touched('invoices', { title: 'should not land' }, inv.off);
    const approve = await touched('invoices', { approved_at: new Date().toISOString() }, inv.off);
    const vo = await touched(
      'invoices',
      { status: 'voided', void_reason: 'x', voided_at: new Date().toISOString() },
      inv.off
    );
    record('X3_off', { edit, approve, void: vo });
    expect(edit).toBeLessThanOrEqual(0);
    expect(approve).toBeLessThanOrEqual(0);
    expect(vo).toBeLessThanOrEqual(0);
  });

  it('X4 and the service role confirms the OFF rows are exactly as made', async () => {
    const { data: c } = await admin
      .from('change_orders')
      .select('title, status')
      .eq('id', co.off)
      .single();
    const { data: i } = await admin
      .from('invoices')
      .select('title, status, approved_at')
      .eq('id', inv.off)
      .single();
    const { data: f } = await admin
      .from('project_financials')
      .select('contract_value')
      .eq('project_id', proj.off)
      .single();
    const { data: b } = await admin
      .from('project_budget_amounts')
      .select('budgeted_amount')
      .eq('budget_item_id', bi.off)
      .single();
    const { count: coCount } = await admin
      .from('change_orders')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', proj.off);
    record('X4_off_state', { co: c, invoice: i, contract: f, budgeted: b, coCount });
    expect(c).toEqual({ title: `${MARKER} CO 2`, status: 'draft' });
    expect(i).toEqual({ title: `${MARKER} invoice`, status: 'draft', approved_at: null });
    expect(Number(f!.contract_value)).toBe(50000);
    expect(Number(b!.budgeted_amount)).toBe(1000);
    expect(coCount).toBe(1);
  });
});

// ===========================================================================
// [S181] What the role still CANNOT do — on its OWN project. Q1 (RULED Josh):
// no refunds, neither issue nor approve. Q2 (RULED Josh): no contract
// authority. Each refusal sits beside a service-role control proving the
// payload itself is valid, so the refusal is the policy, not a bad row.
// ===========================================================================
describe('S181 — ON its own project, what the PE is still REFUSED', () => {
  it('Q1 a refund: the PE cannot INSERT one (control: the same row is valid)', async () => {
    const refund = {
      contact_id: contactId,
      project_id: proj.on,
      refund_date: '2026-09-27',
      amount: 10,
      source: 'other',
    };
    const { data: peRow, error: peErr } = await pe.from('client_refunds').insert(refund).select('id');
    const { data: ctl, error: ctlErr } = await admin
      .from('client_refunds')
      .insert({ ...refund, company_id: companyId })
      .select('id, status');
    // ...and it cannot APPROVE the valid one either (UPDATE touches 0).
    const approve = ctl?.[0]
      ? await touched(
          'client_refunds',
          { status: 'approved', approved_at: new Date().toISOString() },
          ctl[0].id as string
        )
      : -2;
    const { data: after } = ctl?.[0]
      ? await admin.from('client_refunds').select('status, approved_at').eq('id', ctl[0].id).single()
      : { data: null };
    record('S181_Q1_refund', {
      peInsert: peRow?.length ?? 0,
      peError: peErr?.message ?? null,
      control: ctl?.length ?? ctlErr?.message,
      peApprove: approve,
      after,
    });
    expect(ctlErr?.message ?? null).toBeNull();
    expect(ctl).toHaveLength(1);
    expect(peRow?.length ?? 0).toBe(0);
    expect(approve).toBeLessThanOrEqual(0);
    expect(after).toEqual({ status: 'pending_approval', approved_at: null });
  });

  it('Q2 a client contract: the PE cannot void it (touches 0; the row is unchanged)', async () => {
    const { data: cc, error: ccErr } = await admin
      .from('client_contracts')
      .insert({ company_id: companyId, project_id: proj.on, status: 'sent' })
      .select('id')
      .single();
    expect(ccErr?.message ?? null).toBeNull();
    // Control: the PE can SEE it (client_contracts_select_visible), so 0 below is authority.
    const { data: seen } = await pe.from('client_contracts').select('id').eq('id', cc!.id);
    const vo = await touched('client_contracts', { status: 'void' }, cc!.id as string);
    const { data: after } = await admin.from('client_contracts').select('status').eq('id', cc!.id).single();
    record('S181_Q2_contract_void', { seen: seen?.length ?? 0, touched: vo, after });
    expect(seen).toHaveLength(1);
    expect(vo).toBeLessThanOrEqual(0);
    expect(after?.status).toBe('sent');
  });
});
