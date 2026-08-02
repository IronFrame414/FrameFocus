/**
 * S97CT-BUDGET — budgeted_amount floor, stage 3 verification (S97).
 *
 * Proves the two halves of the ruling against real rows, through the SHIPPED
 * getBudgetRollup — the one reader every budget surface goes through:
 *
 *   OWNER/ADMIN see figures IDENTICAL to what the old column holds — line by
 *   line, group total, instrument total and grand total. Not "a number", the
 *   SAME number.
 *
 *   PM / FOREMAN / CREW get NULL everywhere a budgeted figure would be —
 *   asserted explicitly NOT 0, NOT -cost, NOT NaN. Those three are the exact
 *   artefacts the five `?? 0` fallbacks used to produce, and a plausible wrong
 *   number is worse than a blank.
 *
 * ACTUAL COST must survive for Foreman and Crew — the property that makes a
 * plain role floor on project_budget_items unusable, since it shares a row.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const state = vi.hoisted(() => ({ client: null as never }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

const MARKER = 'S97BUDGET';

let companyId: string;
let contactId: string;
let projectId: string;
const itemIds: string[] = [];
const sessions: Record<string, never> = {};
/** budgeted_amount straight from the OLD column — the truth to compare against. */
let expectedTotal = 0;

const must = (label: string, error: { message: string } | null) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

beforeAll(async () => {
  assertRebuildTest();

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = company!.id;

  for (const [role, email] of [
    ['owner', 'josh+test50@worthprop.com'],
    ['admin', 'josh+qa-admin@worthprop.com'],
    ['project_manager', 'josh+pm@worthprop.com'],
    ['foreman', 'josh+qa-foreman@worthprop.com'],
    ['crew_member', 'josh+crew@worthprop.com'],
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
      company_id: companyId, name: `${MARKER} — budget floor`, contact_id: contactId,
      project_type: 'fixed_price',
      project_number: `PRJ-${String(seq).padStart(3, '0')}`, project_internal_seq: internal,
    })
    .select('id').single();
  must('project', pErr);
  projectId = project!.id;
  must('counters', (await admin.from('companies').update({
    estimate_number_sequence: seq, project_internal_sequence: internal,
  }).eq('id', companyId)).error);

  // Every role must be able to REACH the job, so a refusal is attributable to
  // the role and not to visibility.
  for (const email of [
    'josh+pm@worthprop.com', 'josh+qa-foreman@worthprop.com', 'josh+crew@worthprop.com',
  ]) {
    const { data: profile } = await admin.from('profiles').select('id').eq('email', email).single();
    const { data: member } = await admin
      .from('company_members').select('id').eq('profile_id', profile!.id).single();
    must('assignment', (await admin.from('project_assignments').insert({
      company_id: companyId, project_id: projectId, member_id: member!.id,
    })).error);
  }

  // Three lines, including a NEGATIVE one (a credit / negative-CO row) and a
  // genuine ZERO — the two values the old `?? 0` fallbacks mis-handled.
  for (const [desc, budgeted, actual] of [
    [`${MARKER} framing`, 5000, 1200],
    [`${MARKER} credit line`, -750, 0],
    [`${MARKER} zero-budget catch-all`, 0, 340],
  ] as const) {
    const { data, error } = await admin
      .from('project_budget_items')
      .insert({
        company_id: companyId, project_id: projectId,
        description: desc,
        actual_amount: actual, committed_amount: 0,
      })
      .select('id').single();
    must(`budget line ${desc}`, error);
    itemIds.push(data!.id);

    // RULING [S97]: the budgeted figure lives in project_budget_amounts.
    must(`budget amount ${desc}`, (await admin.from('project_budget_amounts').upsert({
      company_id: companyId, budget_item_id: data!.id, budgeted_amount: budgeted,
    }, { onConflict: 'budget_item_id' })).error);
    expectedTotal += budgeted;
  }
}, 240_000);

describe('S97CT-BUDGET — the column is retired and the figures survived', () => {
  it('1. project_budget_items.budgeted_amount is GONE, and every line still has its figure', async () => {
    // Before the drop this compared the two homes row by row. That comparison
    // is impossible now by design, so it asserts the END STATE instead: the old
    // column errors, and the new table carries a real number for every line.
    const { error: goneError } = await admin
      .from('project_budget_items').select('id, budgeted_amount').limit(1);
    expect(goneError, 'project_budget_items.budgeted_amount still exists').not.toBeNull();
    expect(goneError!.message).toMatch(/budgeted_amount/);

    const { data } = await admin
      .from('project_budget_amounts').select('budget_item_id, budgeted_amount').in('budget_item_id', itemIds);
    expect((data ?? []).length, 'the fixture lines lost their amounts').toBe(3);
    for (const row of data ?? []) {
      expect(Number.isNaN(Number(row.budgeted_amount)), `${row.budget_item_id} holds a non-number`)
        .toBe(false);
    }
  });
});

describe('S97CT-BUDGET — an Owner sees IDENTICAL figures', () => {
  it('2. line, group, instrument and grand totals all match the old column exactly', async () => {
    state.client = sessions.owner;
    const { getBudgetRollup } = await import('@/lib/services/budget');
    const rollup = await getBudgetRollup(projectId);

    // Grand total — the same arithmetic as before the split.
    expect(rollup.totalBudgeted).not.toBeNull();
    expect(rollup.totalBudgeted).toBe(expectedTotal); // 5000 - 750 + 0 = 4250

    const lines = rollup.instruments.flatMap((i) => i.groups.flatMap((g) => g.items));
    expect(lines.length).toBe(3);
    const byDesc = new Map(lines.map((l) => [l.description, l.budgeted_amount]));
    expect(byDesc.get(`${MARKER} framing`)).toBe(5000);
    expect(byDesc.get(`${MARKER} credit line`)).toBe(-750);
    // A GENUINE ZERO survives as 0, not as null — the distinction the whole
    // 1:1 table design exists to preserve.
    expect(byDesc.get(`${MARKER} zero-budget catch-all`)).toBe(0);

    for (const instrument of rollup.instruments) {
      expect(instrument.budgeted, 'an instrument total went null for an Owner').not.toBeNull();
      for (const group of instrument.groups) {
        expect(group.budgeted, 'a group total went null for an Owner').not.toBeNull();
      }
    }
  });

  it('3. an Admin sees the same', async () => {
    state.client = sessions.admin;
    const { getBudgetRollup } = await import('@/lib/services/budget');
    expect((await getBudgetRollup(projectId)).totalBudgeted).toBe(expectedTotal);
  });
});

describe('S97CT-BUDGET — PM, Foreman and Crew get NULL, with no artefacts', () => {
  for (const role of ['project_manager', 'foreman', 'crew_member'] as const) {
    it(`4-${role}. every budgeted figure is null — not 0, not -cost, not NaN`, async () => {
      state.client = sessions[role];
      const { getBudgetRollup } = await import('@/lib/services/budget');
      const rollup = await getBudgetRollup(projectId);

      expect(rollup.totalBudgeted, `${role} saw a grand total`).toBeNull();
      // THE THREE ARTEFACTS the `?? 0` fallbacks used to produce.
      expect(rollup.totalBudgeted).not.toBe(0);
      expect(Number.isNaN(Number(rollup.totalBudgeted ?? 0))).toBe(false);

      for (const instrument of rollup.instruments) {
        expect(instrument.budgeted, `${role} saw an instrument total`).toBeNull();
        for (const group of instrument.groups) {
          expect(group.budgeted, `${role} saw a group total`).toBeNull();
          for (const item of group.items) {
            expect(item.budgeted_amount, `${role} saw a line budget`).toBeNull();
            expect(item.budgeted_amount).not.toBe(0);
          }
        }
      }
    });
  }

  it('5. the variance a gated role would render is NULL, never minus-the-cost', async () => {
    // The single worst old behaviour: `(budgeted ?? 0) - cost` produced a
    // confident negative figure on a screen meant to show nothing. This
    // reproduces the page's exact expression against the new shape.
    state.client = sessions.project_manager;
    const { getBudgetRollup } = await import('@/lib/services/budget');
    const rollup = await getBudgetRollup(projectId);

    for (const item of rollup.instruments.flatMap((i) => i.groups.flatMap((g) => g.items))) {
      const cost = (item.actual_amount ?? 0) + item.committed_remaining;
      const variance = item.budgeted_amount !== null && cost !== 0 ? item.budgeted_amount - cost : null;
      expect(variance, 'a gated role would see a variance figure').toBeNull();
      // and the old expression would have produced this instead:
      const oldBehaviour = (item.budgeted_amount ?? 0) - cost;
      if (cost !== 0) expect(oldBehaviour).toBeLessThan(0); // proves the artefact was real
    }
  });

  it('6. credit classification does not silently flip when the figure is absent', async () => {
    state.client = sessions.project_manager;
    const { getBudgetRollup } = await import('@/lib/services/budget');
    const rollup = await getBudgetRollup(projectId);
    for (const item of rollup.instruments.flatMap((i) => i.groups.flatMap((g) => g.items))) {
      // New rule: unknown is unknown, so nothing is classified a credit.
      expect(item.budgeted_amount !== null && item.budgeted_amount < 0).toBe(false);
    }
  });
});

describe('S97CT-BUDGET — ACTUAL COST survives for Foreman and Crew', () => {
  for (const role of ['foreman', 'crew_member'] as const) {
    it(`7-${role}. still reads actual and committed on every line`, async () => {
      state.client = sessions[role];
      const { getBudgetRollup } = await import('@/lib/services/budget');
      const rollup = await getBudgetRollup(projectId);

      const lines = rollup.instruments.flatMap((i) => i.groups.flatMap((g) => g.items));
      expect(lines.length, `${role} lost the budget lines entirely`).toBe(3);
      expect(rollup.totalActual).toBe(1540); // 1200 + 0 + 340
      for (const item of lines) {
        expect(item.actual_amount, `${role} lost actual cost`).not.toBeUndefined();
      }
    });
  }
});

afterAll(async () => {
  const errors: string[] = [];
  const check = (label: string, error: { message: string } | null) => {
    if (error) errors.push(`${label}: ${error.message}`);
  };

  if (itemIds.length) {
    check('amounts', (await admin.from('project_budget_amounts').delete().in('budget_item_id', itemIds)).error);
    check('items', (await admin.from('project_budget_items').delete().in('id', itemIds)).error);
  }
  if (projectId) {
    check('assignments', (await admin.from('project_assignments').delete().eq('project_id', projectId)).error);
    check('project', (await admin.from('projects').delete().eq('id', projectId)).error);
  }
  if (contactId) check('contact', (await admin.from('contacts').delete().eq('id', contactId)).error);

  const { count } = await admin
    .from('projects').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  console.log(`\n[${MARKER} TEARDOWN] rows left: ${count}; errors: ${errors.length ? JSON.stringify(errors) : 'NONE'}`);
}, 180_000);
