/**
 * S97CT-CV — RULING 2 step 3: the contract value's new home (S97, 2026-08-02).
 *
 * WHY THIS EXISTS SEPARATELY FROM 7b/7c. Those two read
 * projects.contract_value DIRECTLY through the API. Step 1 deliberately KEPT
 * that column as the rollback, so they still fail and will only flip when it is
 * dropped in step 4. They are the right test of "the old exposure is gone".
 *
 * This file is the other half: proof that the NEW path is correct BEFORE the
 * irreversible drop. It exercises 7B's three readers — the only legal readers of
 * contract value — through real sessions, and asserts:
 *
 *   Owner  sees exactly the figures that were on the project row before;
 *   PM / Foreman / Crew see NULL, not zero and not NaN.
 *
 * That distinction matters: a null that a caller coerces to 0 is how a
 * percentage draw silently bills nothing, which is the failure RULING 2's
 * null-guards exist to prevent.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const state = vi.hoisted(() => ({ client: null as never }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

let companyId: string;
let projectId: string;
/** The value that was on the project row before the move. */
let expectedOriginal: number;

const sessions: Record<string, never> = {};

beforeAll(async () => {
  assertRebuildTest();

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = company!.id;

  // The PM-assigned project with a contract value — the same one 7b probes.
  // RULING 2 step 4: read the figure from its NEW home; projects.contract_value
  // no longer exists.
  projectId = 'a0a85240-333d-4177-bdf4-6df55fb069a6';
  const { data: financials } = await admin
    .from('project_financials')
    .select('contract_value')
    .eq('project_id', projectId)
    .single();
  expectedOriginal = Number(financials!.contract_value);

  for (const [role, email] of [
    ['owner', 'josh+test50@worthprop.com'],
    ['admin', 'josh+qa-admin@worthprop.com'],
    ['project_manager', 'josh+pm@worthprop.com'],
    ['foreman', 'josh+qa-foreman@worthprop.com'],
    ['crew_member', 'josh+crew@worthprop.com'],
  ] as const) {
    sessions[role] = (await sessionFor(email)) as never;
  }
}, 180_000);

describe('S97CT-CV — the column is retired and the figures survived', () => {
  it('1. projects.contract_value no longer exists, and project_financials carries the values', async () => {
    // Before the drop this compared the two columns row by row. That comparison
    // is impossible now by design — so it asserts the END STATE instead: the old
    // column is gone (a select on it errors) and the new table is populated.
    const { error: goneError } = await admin
      .from('projects').select('id, contract_value').limit(1);
    expect(goneError, 'projects.contract_value still exists').not.toBeNull();
    expect(goneError!.message).toMatch(/contract_value/);

    const { data: financials } = await admin
      .from('project_financials').select('project_id, contract_value');
    expect((financials ?? []).length, 'project_financials is empty — the backfill is gone')
      .toBeGreaterThan(0);
    for (const row of financials ?? []) {
      expect(Number.isNaN(Number(row.contract_value)), `${row.project_id} holds a non-number`)
        .toBe(false);
    }
  });
});

describe('S97CT-CV — Owner and Admin still see the figures', () => {
  it('2. getRevisedContract returns the original for an Owner', async () => {
    state.client = sessions.owner;
    const { getRevisedContract } = await import('@/lib/services/contract-value');
    const result = await getRevisedContract(projectId);
    expect(result.original).toBe(expectedOriginal);
    expect(result.revised).not.toBeNull();
    expect(Number.isNaN(Number(result.revised))).toBe(false);
  });

  it('3. …and for an Admin', async () => {
    state.client = sessions.admin;
    const { getRevisedContract } = await import('@/lib/services/contract-value');
    expect((await getRevisedContract(projectId)).original).toBe(expectedOriginal);
  });

  it('4. the batch map and the portfolio roll-up both still see it', async () => {
    state.client = sessions.owner;
    const { getRevisedContractMap, getPortfolioRevisedContract } = await import(
      '@/lib/services/contract-value'
    );

    const map = await getRevisedContractMap([projectId]);
    expect(map[projectId]).toBeDefined();
    expect(map[projectId].original).toBe(expectedOriginal);

    const portfolio = await getPortfolioRevisedContract();
    expect(portfolio.originalSum).toBeGreaterThan(0);
    expect(portfolio.visibleCount).toBeGreaterThan(0);
    expect(Number.isNaN(portfolio.revisedSum)).toBe(false);
  });
});

describe('S97CT-CV — PM, Foreman and Crew get NULL, not zero and not NaN', () => {
  for (const role of ['project_manager', 'foreman', 'crew_member'] as const) {
    it(`5-${role}. getRevisedContract returns null original / null revised`, async () => {
      state.client = sessions[role];
      const { getRevisedContract } = await import('@/lib/services/contract-value');
      const result = await getRevisedContract(projectId);

      expect(result.original, `${role} still saw a contract value`).toBeNull();
      expect(result.revised, `${role} still saw a revised contract value`).toBeNull();
      // The distinction that matters: NULL, never 0. A zero would price a
      // percentage draw at nothing and read on screen as a real figure.
      expect(result.original).not.toBe(0);
      expect(result.revised).not.toBe(0);
    });
  }

  it('6. the batch map still returns an ENTRY for a gated role — with a null original', async () => {
    // A missing key would crash a caller doing map[id].revised; a null original
    // is the honest answer.
    state.client = sessions.project_manager;
    const { getRevisedContractMap } = await import('@/lib/services/contract-value');
    const map = await getRevisedContractMap([projectId]);
    expect(map[projectId], 'the batch map dropped the key entirely').toBeDefined();
    expect(map[projectId].original).toBeNull();
    expect(map[projectId].revised).toBeNull();
  });

  it('7. the portfolio roll-up reports zero AND says nothing was visible', async () => {
    state.client = sessions.project_manager;
    const { getPortfolioRevisedContract } = await import('@/lib/services/contract-value');
    const portfolio = await getPortfolioRevisedContract();

    expect(portfolio.originalSum).toBe(0);
    expect(portfolio.visibleCount, 'visibleCount is what tells "none" apart from "not permitted"')
      .toBe(0);
    expect(Number.isNaN(portfolio.revisedSum), 'the roll-up produced NaN').toBe(false);
  });

  it('8. no reader produces NaN for any role — the $NaN artefact check', async () => {
    const { getRevisedContract, getPortfolioRevisedContract } = await import(
      '@/lib/services/contract-value'
    );
    for (const role of ['owner', 'admin', 'project_manager', 'foreman', 'crew_member'] as const) {
      state.client = sessions[role];
      const one = await getRevisedContract(projectId);
      const all = await getPortfolioRevisedContract();
      for (const [label, value] of [
        [`${role}.original`, one.original],
        [`${role}.revised`, one.revised],
        [`${role}.signedDelta`, one.signedDelta],
        [`${role}.originalSum`, all.originalSum],
        [`${role}.revisedSum`, all.revisedSum],
      ] as const) {
        expect(Number.isNaN(Number(value ?? 0)), `${label} is NaN`).toBe(false);
      }
    }
  });
});

describe('S97CT-CV — the new table is gated at the DB, not just in the service', () => {
  it('9. a gated role reads ZERO rows from project_financials directly', async () => {
    for (const role of ['project_manager', 'foreman', 'crew_member'] as const) {
      const client = sessions[role] as unknown as {
        from: (t: string) => { select: (c: string) => Promise<{ data: unknown[] | null }> };
      };
      const { data } = await client.from('project_financials').select('id, contract_value');
      expect(data ?? [], `${role} read project_financials directly`).toHaveLength(0);
    }
  });

  it('10. Owner and Admin do read rows — the gate is a role gate, not a wall', async () => {
    for (const role of ['owner', 'admin'] as const) {
      const client = sessions[role] as unknown as {
        from: (t: string) => { select: (c: string) => Promise<{ data: unknown[] | null }> };
      };
      const { data } = await client.from('project_financials').select('id, contract_value');
      expect((data ?? []).length, `${role} could not read project_financials`).toBeGreaterThan(0);
    }
  });
});
