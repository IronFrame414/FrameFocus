import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// #117 — WHAT EACH ROLE ACTUALLY READS FROM THE THREE CO TABLES TODAY.
// ============================================================================
//
// AUDIT ONLY. This file asserts the CURRENT state, so it is the "before" half
// of any failing-then-passing pair and a regression net for the roles that must
// KEEP access. It changes nothing and proposes nothing.
//
// Real supabase-js clients on the anon key carrying real user JWTs, so RLS
// applies exactly as it does in the app. Never `postgres`.

const ROLES = [
  ['owner', 'josh+test50@worthprop.com'],
  ['admin', 'josh+qa-admin@worthprop.com'],
  ['project_manager', 'josh+pm@worthprop.com'],
  ['foreman', 'josh+qa-foreman@worthprop.com'],
  ['crew_member', 'josh+crew@worthprop.com'],
  ['subcontractor', 'josh+qa-sub@worthprop.com'],
] as const;

const sessions: Record<string, SupabaseClient> = {};

beforeAll(async () => {
  assertRebuildTest();
  for (const [role, email] of ROLES) sessions[role] = await sessionFor(email);
}, 240_000);

describe('#117 · the exposure, measured per role', () => {
  for (const [role] of ROLES) {
    it(`${role} — change_orders`, async () => {
      const { data, error } = await sessions[role]
        .from('change_orders')
        .select('id, co_number, net_delta, labor_markup_percent, material_markup_percent, subcontractor_markup_percent, tax_rate')
        .eq('is_deleted', false);
      const rows = data ?? [];
      const money = rows.filter((r) => r.net_delta != null);
      const markup = rows.filter(
        (r) =>
          r.labor_markup_percent != null ||
          r.material_markup_percent != null ||
          r.subcontractor_markup_percent != null
      );
      console.log(
        `  [${role.padEnd(15)}] change_orders rows=${rows.length} withNetDelta=${money.length} ` +
          `withAnyMarkup=${markup.length} err=${error?.code ?? '-'}` +
          (money.length ? `  values=[${money.map((r) => r.net_delta).join(', ')}]` : '')
      );
      expect(error).toBeNull();
    });
  }

  for (const [role] of ROLES) {
    it(`${role} — change_order_line_items.total_price`, async () => {
      const { data, error } = await sessions[role]
        .from('change_order_line_items')
        .select('id, name, total_price');
      const rows = data ?? [];
      console.log(
        `  [${role.padEnd(15)}] line_items rows=${rows.length} ` +
          `withTotalPrice=${rows.filter((r) => r.total_price != null).length} err=${error?.code ?? '-'}`
      );
      expect(error).toBeNull();
    });
  }

  for (const [role] of ROLES) {
    it(`${role} — change_order_line_rows cost + price + markup`, async () => {
      const { data, error } = await sessions[role]
        .from('change_order_line_rows')
        .select('id, name, row_type, quantity, unit_cost, rate, markup_percent, amount, total');
      const rows = data ?? [];
      const withCost = rows.filter((r) => r.unit_cost != null || r.rate != null);
      const withMarkup = rows.filter((r) => r.markup_percent != null);
      console.log(
        `  [${role.padEnd(15)}] line_rows rows=${rows.length} withCostOrRate=${withCost.length} ` +
          `withMarkup=${withMarkup.length} err=${error?.code ?? '-'}` +
          (withCost.length
            ? `  sample=${JSON.stringify(withCost[0] && { unit_cost: withCost[0].unit_cost, rate: withCost[0].rate, markup: withCost[0].markup_percent, total: withCost[0].total })}`
            : '')
      );
      expect(error).toBeNull();
    });
  }
});

// ---------------------------------------------------------------------------
// Does a column-level GRANT even work here? Answered by observation, not by
// reasoning about Postgres: `select('*')` is what PostgREST issues for an
// unqualified select, and a revoked column makes that a HARD ERROR (42501)
// rather than a null. If that is the failure shape, every `select('*')` caller
// on these tables breaks for the floored roles.
// ---------------------------------------------------------------------------
describe('#117 · what select(*) does per role today (the GRANT blast-radius probe)', () => {
  for (const [role] of ROLES) {
    it(`${role} — select('*') on all three`, async () => {
      for (const table of ['change_orders', 'change_order_line_items', 'change_order_line_rows']) {
        const { data, error } = await sessions[role].from(table).select('*').limit(1);
        console.log(
          `  [${role.padEnd(15)}] ${table.padEnd(28)} select(*) rows=${(data ?? []).length} ` +
            `err=${error?.code ?? '-'} ${error?.message ?? ''}`
        );
      }
    });
  }
});
