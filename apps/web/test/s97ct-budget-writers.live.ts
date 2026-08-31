/**
 * S97CT-WRITERS — budget-line CREATION through all four writers (S97).
 *
 * WHY THIS EXISTS. The drop migration replaces four SQL functions that CREATE
 * budget lines. A broken writer means NO budget line at all, which is strictly
 * worse than a hidden figure — and the drop is irreversible, so this is run as a
 * BASELINE before it and again after. Identical results either side is the
 * evidence the replacements are faithful.
 *
 * All four, for Owner, Admin and PM where each admits them:
 *   create_budget_line_at_capture   Owner/Admin/PM
 *   get_or_create_misc_budget_item  any role that can view the project
 *   apply_change_order_budget       Owner/Admin (and the service role)
 *   convert_estimate_to_project     Owner/Admin/PM
 *
 * Every line created here is deleted in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, assertRebuildTest, disposeChangeOrdersError, sessionFor, sweepChangeOrders } from './live-session';

const MARKER = 'S97WRITERS';

let companyId: string;
let ownerMemberId: string;
let contactId: string;
let projectId: string;
let coId: string;
const sessions: Record<string, never> = {};
const createdProjects: string[] = [];

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

/** The budgeted figure for a line, from wherever it lives. */
async function budgetedFor(itemId: string): Promise<number | null> {
  const { data } = await admin
    .from('project_budget_amounts')
    .select('budgeted_amount')
    .eq('budget_item_id', itemId)
    .maybeSingle();
  return data ? Number(data.budgeted_amount) : null;
}

beforeAll(async () => {
  assertRebuildTest();
  // ⚠️ [S168] START FROM A DIRTY DATABASE. `afterAll` does not run when a run
  // is interrupted, and this suite's `co_number`s are FIXED — so one killed run
  // used to brick every later one on `change_orders_company_co_number_key`,
  // permanently, until somebody cleaned the table by hand. Sweeping first makes
  // the suite runnable twice in a row from ANY starting state, which is the
  // property that was actually missing and the one a single green run cannot
  // demonstrate.
  await sweepChangeOrders(MARKER);

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Sabal Point Construction').single();
  companyId = company!.id;

  const { data: ownerProfile } = await admin
    .from('profiles').select('id').eq('email', 'josh+test50@worthprop.com').single();
  ownerMemberId = (await admin
    .from('company_members').select('id').eq('profile_id', ownerProfile!.id).single()).data!.id;

  for (const [role, email] of [
    ['owner', 'josh+test50@worthprop.com'],
    ['admin', 'josh+qa-admin@worthprop.com'],
    ['project_manager', 'josh+pm@worthprop.com'],
  ] as const) {
    sessions[role] = (await sessionFor(email)) as never;
  }

  const { data: contact, error: cErr } = await admin
    .from('contacts')
    .insert({
      company_id: companyId, contact_type: 'client',
      first_name: MARKER, last_name: 'Client', email: `${MARKER.toLowerCase()}@example.invalid`,
    })
    .select('id').single();
  must('contact', cErr);
  contactId = contact!.id;

  const { data: counters } = await admin
    .from('companies')
    .select('estimate_number_sequence, project_internal_sequence').eq('id', companyId).single();
  const seq = counters!.estimate_number_sequence + 1;
  const internal = counters!.project_internal_sequence + 1;

  const { data: project, error: pErr } = await admin
    .from('projects')
    .insert({
      company_id: companyId, name: `${MARKER} — writers`, contact_id: contactId,
      project_type: 'fixed_price',
      // A literal, not a sequence value — convert_estimate_to_project mints its
      // own number from the company counter and would collide with it.
      project_number: `PRJ-${MARKER}`, project_internal_seq: internal,
    })
    .select('id').single();
  must('project', pErr);
  projectId = project!.id;
  createdProjects.push(projectId);
  must('counters', (await admin.from('companies').update({
    estimate_number_sequence: seq, project_internal_sequence: internal,
  }).eq('id', companyId)).error);

  // Every role that will call an RPC must be able to reach the job.
  for (const email of ['josh+pm@worthprop.com']) {
    const { data: profile } = await admin.from('profiles').select('id').eq('email', email).single();
    const { data: member } = await admin
      .from('company_members').select('id').eq('profile_id', profile!.id).single();
    must('assignment', (await admin.from('project_assignments').insert({
      company_id: companyId, project_id: projectId, member_id: member!.id,
    })).error);
  }

  // A SIGNED change order with two priced line rows, for apply_change_order_budget.
  const { data: co, error: coErr } = await admin
    .from('change_orders')
    .insert({
      company_id: companyId, project_id: projectId, author_member_id: ownerMemberId,
      co_number: `${MARKER}-CO`, title: `${MARKER} CO`, co_type: 'fixed_price',
      status: 'draft', tax_rate: 10, net_delta: 0,
    })
    .select('id').single();
  must('change order', coErr);
  coId = co!.id;

  const { data: li, error: liErr } = await admin
    .from('change_order_line_items')
    .insert({ company_id: companyId, change_order_id: coId, name: `${MARKER} item`, sort_order: 0, total_price: 0 })
    .select('id').single();
  must('co line item', liErr);

  // labor: rate x quantity, never taxed. other: amount, taxed at 10%.
  must('co labor row', (await admin.from('change_order_line_rows').insert({
    company_id: companyId, line_item_id: li!.id, row_type: 'labor',
    name: `${MARKER} labor`, sort_order: 0, rate: 50, quantity: 4, apply_tax: false,
  })).error);
  must('co other row', (await admin.from('change_order_line_rows').insert({
    company_id: companyId, line_item_id: li!.id, row_type: 'other',
    name: `${MARKER} other`, sort_order: 1, amount: 1000, apply_tax: true,
  })).error);

  must('sign co', (await admin
    .from('change_orders').update({ status: 'signed' }).eq('id', coId)).error);
}, 240_000);

describe('S97CT-WRITERS — create_budget_line_at_capture', () => {
  for (const role of ['owner', 'admin', 'project_manager'] as const) {
    it(`1-${role}. creates a line with a budgeted figure of 0`, async () => {
      const client = sessions[role] as unknown as {
        rpc: (fn: string, args: unknown) => Promise<{ data: string | null; error: { message: string } | null }>;
      };
      const { data: itemId, error } = await client.rpc('create_budget_line_at_capture', {
        p_project_id: projectId,
        p_description: `${MARKER} capture ${role}`,
        p_cost_code: null,
      });
      expect(error, `${role} could not create a budget line: ${error?.message}`).toBeNull();
      expect(itemId, `${role} got no line id back`).toBeTruthy();

      // The line exists AND carries its amount — a line with no amounts row
      // shows an Owner a dash where a real zero belongs.
      const { data: line } = await admin
        .from('project_budget_items').select('id, description').eq('id', itemId!).single();
      expect(line!.description).toBe(`${MARKER} capture ${role}`);
      expect(await budgetedFor(itemId!), 'the line has no budgeted figure').toBe(0);
    });
  }
});

describe('S97CT-WRITERS — get_or_create_misc_budget_item', () => {
  it('2. creates the Miscellaneous line once, with a figure, and is idempotent', async () => {
    const owner = sessions.owner as unknown as {
      rpc: (fn: string, args: unknown) => Promise<{ data: string | null; error: { message: string } | null }>;
    };
    const first = await owner.rpc('get_or_create_misc_budget_item', { p_project_id: projectId });
    expect(first.error, `misc getter failed: ${first.error?.message}`).toBeNull();
    expect(first.data).toBeTruthy();
    expect(await budgetedFor(first.data!), 'the Miscellaneous line has no figure').toBe(0);

    // Second call returns the SAME line — the ON CONFLICT path must not create
    // a second amounts row or a second line.
    const second = await owner.rpc('get_or_create_misc_budget_item', { p_project_id: projectId });
    expect(second.error).toBeNull();
    expect(second.data).toBe(first.data);

    const { count } = await admin
      .from('project_budget_amounts')
      .select('id', { count: 'exact', head: true })
      .eq('budget_item_id', first.data!);
    expect(count, 'a duplicate amounts row was written').toBe(1);
  });

  it('3. a PM can reach it too', async () => {
    const pm = sessions.project_manager as unknown as {
      rpc: (fn: string, args: unknown) => Promise<{ data: string | null; error: { message: string } | null }>;
    };
    const { data, error } = await pm.rpc('get_or_create_misc_budget_item', { p_project_id: projectId });
    expect(error, `a PM could not reach the Miscellaneous line: ${error?.message}`).toBeNull();
    expect(data).toBeTruthy();
  });
});

describe('S97CT-WRITERS — apply_change_order_budget', () => {
  it('4. writes one budget line per CO row, with the §5.1 cost expression intact', async () => {
    const owner = sessions.owner as unknown as {
      rpc: (fn: string, args: unknown) => Promise<{ data: number | null; error: { message: string } | null }>;
    };
    const { data: count, error } = await owner.rpc('apply_change_order_budget', {
      p_change_order_id: coId,
    });
    expect(error, `CO budget apply failed: ${error?.message}`).toBeNull();
    expect(count, 'no budget lines were written for the CO').toBe(2);

    const { data: lines } = await admin
      .from('project_budget_items')
      .select('id, description, row_type')
      .eq('source_change_order_id', coId);
    expect((lines ?? []).length).toBe(2);

    const byName = new Map<string, string>();
    for (const l of lines ?? []) byName.set(l.description, l.id);

    // labor: 50 x 4 = 200, never taxed.
    expect(await budgetedFor(byName.get(`${MARKER} labor`)!)).toBe(200);
    // other: 1000 taxed at 10% = 1100 — the tax-inclusive rule (A-1).
    expect(await budgetedFor(byName.get(`${MARKER} other`)!)).toBe(1100);
  });

  it('5. it stays idempotent — a second apply writes nothing', async () => {
    const owner = sessions.owner as unknown as {
      rpc: (fn: string, args: unknown) => Promise<{ data: number | null; error: { message: string } | null }>;
    };
    const { data: count, error } = await owner.rpc('apply_change_order_budget', {
      p_change_order_id: coId,
    });
    expect(error).toBeNull();
    expect(count, 'a second apply duplicated the budget lines').toBe(0);

    const { count: total } = await admin
      .from('project_budget_items')
      .select('id', { count: 'exact', head: true })
      .eq('source_change_order_id', coId);
    expect(total).toBe(2);
  });

  it('6. a PM is refused — Owner/Admin only', async () => {
    const pm = sessions.project_manager as unknown as {
      rpc: (fn: string, args: unknown) => Promise<{ error: { message: string } | null }>;
    };
    const { error } = await pm.rpc('apply_change_order_budget', { p_change_order_id: coId });
    expect(error, 'a PM applied a CO budget').not.toBeNull();
    expect(error!.message).toContain('Owner/Admin only');
  });
});

describe('S97CT-WRITERS — convert_estimate_to_project', () => {
  it('8. conversion builds the whole budget baseline, each line with its figure', async () => {
    // The highest-risk replacement: its two INSERT..SELECT blocks became loops,
    // so the §5.1 cost expression and the tax-inclusive rule are re-asserted
    // here rather than assumed. Run as an OWNER (conversion admits Owner/Admin/PM).
    const owner = sessions.owner as unknown as {
      rpc: (fn: string, args: unknown) => Promise<{ data: string | null; error: { message: string } | null }>;
    };

    const { data: estimate, error: eErr } = await admin
      .from('estimates')
      .insert({
        company_id: companyId, name: `${MARKER} estimate`, contact_id: contactId,
        // estimate_number is supplied explicitly: its DEFAULT calls
        // next_estimate_number(), which resolves the company from auth.uid() and
        // therefore has no company under the service role.
        // created_by_role defaults from the caller's role, likewise null here.
        // The RPC derives the project number from the estimate number's suffix
        // (PRJ- || everything after the last dash), so this must not collide
        // with the fixture project's own number.
        estimate_number: `EST-${MARKER}CONV`, created_by_role: 'owner',
        status: 'draft', contract_type: 'fixed_price', tax_rate: 10, grand_total: 9999,
      })
      .select('id').single();
    must('estimate', eErr);

    const { data: cat, error: catErr } = await admin
      .from('estimate_categories')
      .insert({ company_id: companyId, estimate_id: estimate!.id, name: 'Framing', sort_order: 0 })
      .select('id').single();
    must('category', catErr);

    const { data: item, error: iErr } = await admin
      .from('estimate_line_items')
      .insert({
        company_id: companyId, estimate_id: estimate!.id, category_id: cat!.id,
        name: `${MARKER} line`, sort_order: 0, total_price: 0,
      })
      .select('id').single();
    must('line item', iErr);

    // labor: rate x qty, never taxed. material: unit_cost x qty, taxed at 10%.
    must('labor row', (await admin.from('estimate_line_rows').insert({
      company_id: companyId, line_item_id: item!.id, row_type: 'labor',
      name: `${MARKER} labor`, sort_order: 0, rate: 60, quantity: 5, apply_tax: false,
    })).error);
    must('material row', (await admin.from('estimate_line_rows').insert({
      company_id: companyId, line_item_id: item!.id, row_type: 'material',
      name: `${MARKER} material`, sort_order: 1, unit_cost: 200, quantity: 2, apply_tax: true,
    })).error);

    const { data: newProjectId, error } = await owner.rpc('convert_estimate_to_project', {
      p_estimate_id: estimate!.id,
    });
    expect(error, `conversion failed: ${error?.message}`).toBeNull();
    expect(newProjectId).toBeTruthy();
    createdProjects.push(newProjectId!);

    const { data: lines } = await admin
      .from('project_budget_items')
      .select('id, description')
      .eq('project_id', newProjectId!);
    expect((lines ?? []).length, 'conversion created no budget baseline').toBe(2);

    const byName = new Map<string, string>();
    for (const l of lines ?? []) byName.set(l.description, l.id);

    // 60 x 5 = 300, untaxed.
    expect(await budgetedFor(byName.get(`${MARKER} labor`)!)).toBe(300);
    // 200 x 2 = 400, +10% tax = 440 (A-1 tax-inclusive on a taxed row).
    expect(await budgetedFor(byName.get(`${MARKER} material`)!)).toBe(440);
  });
});

describe('S97CT-WRITERS — every created line has a figure', () => {
  it('7. no line on this project is missing its amounts row', async () => {
    // The failure mode that matters most after the drop: a writer that creates
    // the line but not its amount leaves an OWNER looking at a dash.
    const { data: lines } = await admin
      .from('project_budget_items').select('id, description').eq('project_id', projectId);
    expect((lines ?? []).length).toBeGreaterThan(0);

    const orphans: string[] = [];
    for (const line of lines ?? []) {
      if ((await budgetedFor(line.id)) === null) orphans.push(line.description);
    }
    expect(orphans, 'budget lines created with NO budgeted figure').toEqual([]);
  });
});

afterAll(async () => {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  // Order is the whole difficulty here. Budget items reference the change
  // order, the change order references the project, and conversion leaves a
  // CIRCULAR reference — estimates.project_id points at the new project while
  // projects.source_estimate_id points back. Unlink, then unwind inside out.
  check('unlink estimates', (await admin
    .from('estimates').update({ project_id: null }).like('name', `${MARKER}%`)).error);

  const { data: allProjects } = await admin
    .from('projects').select('id').like('name', `${MARKER}%`);
  const projectIds = Array.from(new Set([...createdProjects, ...(allProjects ?? []).map((p) => p.id)]));

  for (const pid of projectIds) {
    check('client contracts', (await admin
      .from('client_contracts').delete().eq('project_id', pid)).error);
    const { data: items } = await admin
      .from('project_budget_items').select('id').eq('project_id', pid);
    const ids = (items ?? []).map((i) => i.id);
    if (ids.length) {
      check('amounts', (await admin.from('project_budget_amounts').delete().in('budget_item_id', ids)).error);
      check('items', (await admin.from('project_budget_items').delete().in('id', ids)).error);
    }
  }

  // Every CO on these projects, not just the fixture's — a CO left behind by an
  // earlier failed run blocks the project delete just as effectively.
  const { data: cos } = projectIds.length
    ? await admin.from('change_orders').select('id').in('project_id', projectIds)
    : { data: [] };
  for (const co of cos ?? []) {
    await admin.from('change_orders').update({ status: 'draft' }).eq('id', co.id);
    const { data: lis } = await admin
      .from('change_order_line_items').select('id').eq('change_order_id', co.id);
    for (const li of lis ?? []) {
      check('co rows', (await admin.from('change_order_line_rows').delete().eq('line_item_id', li.id)).error);
    }
    check('co items', (await admin.from('change_order_line_items').delete().eq('change_order_id', co.id)).error);
    check('co', await disposeChangeOrdersError([co.id]));
  }

  for (const pid of projectIds) {
    check('assignments', (await admin.from('project_assignments').delete().eq('project_id', pid)).error);
    check('project', (await admin.from('projects').delete().eq('id', pid)).error);
  }

  const { data: ests } = await admin
    .from('estimates').select('id').like('name', `${MARKER}%`);
  for (const est of ests ?? []) {
    const { data: items } = await admin
      .from('estimate_line_items').select('id').eq('estimate_id', est.id);
    for (const li of items ?? []) {
      check('est rows', (await admin.from('estimate_line_rows').delete().eq('line_item_id', li.id)).error);
    }
    if ((items ?? []).length) {
      check('est items', (await admin
        .from('estimate_line_items').delete().in('id', (items ?? []).map((i) => i.id))).error);
    }
    check('est categories', (await admin
      .from('estimate_categories').delete().eq('estimate_id', est.id)).error);
    check('estimate', (await admin.from('estimates').delete().eq('id', est.id)).error);
  }

  if (contactId) check('contact', (await admin.from('contacts').delete().eq('id', contactId)).error);

  const { count } = await admin
    .from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  const { count: estCount } = await admin
    .from('estimates').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  console.log(
    `\n[${MARKER} TEARDOWN] projects left: ${count}; estimates left: ${estCount}; ` +
      `errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`
  );
}, 240_000);
