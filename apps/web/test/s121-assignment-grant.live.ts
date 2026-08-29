import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// WHAT DOES A project_assignments ROW ACTUALLY GRANT A SUBCONTRACTOR? [S121]
// ============================================================================
//
// The award auto-assign trigger and its backfill both create assignment rows,
// and `can_view_project()` is `owner/admin OR is_assigned_to_project()` with a
// ROLE-BLIND second arm. So an assignment is a data-access grant, and ~50
// policies key off that helper.
//
// This measures the grant instead of reasoning about it: the QA subcontractor
// is assigned to one project and not to another, so the DIFFERENCE between the
// two is exactly what an assignment buys.
//
// AUDIT ONLY — asserts the current state so it is the "before" for anything
// that changes it, and a regression net for the two lines that matter most.

const SUB = 'josh+qa-sub@worthprop.com';

/** The QA sub IS assigned here (seed-test-identities step 5b). */
const ASSIGNED = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

let sub: SupabaseClient;
let unassigned: string;

const MONEY_TABLES = [
  ['change_orders', 'id, net_delta'],
  ['invoices', 'id, billed_total, amount_receivable'],
  ['subcontractor_contracts', 'id, contract_value'],
  ['project_budget_items', 'id, actual_amount, committed_amount'],
  ['expenses', 'id, amount'],
  ['purchase_orders', 'id, total_amount'],
] as const;

const NON_MONEY_TABLES = [
  // Moved from MONEY_TABLES [blocking-items]: contract_value was dropped from
  // this row (20261051) — the money lives on client_contract_amounts, probed
  // by its own test below because the side table carries no project_id.
  ['client_contracts', 'id, status'],
  ['daily_logs', 'id'],
  ['tasks', 'id'],
  ['phases', 'id'],
  ['punch_list_items', 'id'],
  ['safety_incidents', 'id'],
  ['deliveries', 'id'],
] as const;

beforeAll(async () => {
  assertRebuildTest();
  sub = await sessionFor(SUB);

  const { data: mine } = await admin
    .from('company_members')
    .select('id')
    .eq('display_name', 'QA Subcontractor Co (TEST IDENTITY)')
    .single();
  const { data: assigns } = await admin
    .from('project_assignments')
    .select('project_id')
    .eq('member_id', mine!.id)
    .eq('is_deleted', false);
  const assignedIds = new Set((assigns ?? []).map((a) => a.project_id));

  const { data: projects } = await admin.from('projects').select('id').eq('is_deleted', false);
  unassigned = (projects ?? []).find((p) => !assignedIds.has(p.id))!.id;

  expect(assignedIds.has(ASSIGNED), 'the QA sub is not assigned to the fixture project').toBe(true);
}, 240_000);

describe('what an assignment grants a sub — MONEY tables', () => {
  for (const [table, cols] of MONEY_TABLES) {
    it(`${table}`, async () => {
      const on = await sub.from(table).select(cols).eq('project_id', ASSIGNED);
      const off = await sub.from(table).select(cols).eq('project_id', unassigned);
      console.log(
        `  [MONEY] ${table.padEnd(26)} assigned=${(on.data ?? []).length}  unassigned=${(off.data ?? []).length}` +
          (on.data?.length ? `  sample=${JSON.stringify(on.data[0])}` : '')
      );
      // ⚠️ THE ERROR CHECK IS LOAD-BEARING. A bad column name makes PostgREST
      // return `data: null`, which reads as "0 rows — no access" and would let
      // a mis-typed probe masquerade as a clean result. It caught exactly that
      // on `invoices` (there is no `total_amount`; the columns are
      // `billed_total` / `amount_receivable`).
      expect(on.error?.code ?? null, `${table}: ${on.error?.message}`).toBeNull();
    });
  }

  // client_contract_amounts carries no project_id — probe through the parent
  // with an inner join. The floor is Owner/Admin + client-of-project, so a
  // sub reads zero on assigned and unassigned alike (20261051).
  it('client_contract_amounts', async () => {
    const on = await sub
      .from('client_contract_amounts')
      .select('id, contract_value, client_contracts!inner(project_id)')
      .eq('client_contracts.project_id', ASSIGNED);
    const off = await sub
      .from('client_contract_amounts')
      .select('id, contract_value, client_contracts!inner(project_id)')
      .eq('client_contracts.project_id', unassigned);
    console.log(
      `  [MONEY] ${'client_contract_amounts'.padEnd(26)} assigned=${(on.data ?? []).length}  unassigned=${(off.data ?? []).length}`
    );
    expect(on.error?.code ?? null, `client_contract_amounts: ${on.error?.message}`).toBeNull();
    expect((on.data ?? []).length, 'a sub read a client contract amount on an assigned project').toBe(0);
    expect((off.data ?? []).length).toBe(0);
  });
});

describe('what an assignment grants a sub — non-money tables', () => {
  for (const [table, cols] of NON_MONEY_TABLES) {
    it(`${table}`, async () => {
      const on = await sub.from(table).select(cols).eq('project_id', ASSIGNED);
      const off = await sub.from(table).select(cols).eq('project_id', unassigned);
      console.log(
        `  [ops]   ${table.padEnd(26)} assigned=${(on.data ?? []).length}  unassigned=${(off.data ?? []).length}`
      );
      expect(on.error?.code ?? null).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// THE TWO THAT MUST STAY CLOSED — the reason the backfill was held until #117.
// ---------------------------------------------------------------------------
describe('the #117 floor holds for an ASSIGNED subcontractor', () => {
  it('an assigned sub reads NO change orders — the grant does not reopen #117', async () => {
    const { data } = await sub.from('change_orders').select('id, net_delta');
    expect(data ?? [], 'assignment reopened the CO money #117 closed').toEqual([]);
  });

  it('an assigned sub reads no CO line rows either', async () => {
    const { data } = await sub
      .from('change_order_line_rows')
      .select('id, unit_cost, markup_percent, total');
    expect(data ?? []).toEqual([]);
  });
});
