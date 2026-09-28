import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { qbExclusionAccess } from '@framefocus/shared/constants/roles';
import { QB_PROJECT_EXCLUDED_REASON, queueRowExcluded } from '@/lib/quickbooks/worker';
import { forEveryRole, JUNK_ROLES } from '@/test-support/role-matrix';

// S114 PART B [RULED Josh R3 + Q16] — who sees the "Exclude from QuickBooks"
// control, and the worker's exit gate. The DATABASE authority is proven live
// in s114-qb-exclusion.live.ts; this pins what is OFFERED and the gate's shape.

describe('S114 PART B — qbExclusionAccess, every role answered', () => {
  it('Owner sets, Admin sees read-only, everyone else — the PE included — sees nothing', () => {
    forEveryRole(
      {
        owner: 'set',
        admin: 'see',
        project_executive: 'none',
        project_manager: 'none',
        foreman: 'none',
        crew_member: 'none',
        subcontractor: 'none',
        client: 'none',
      },
      (role, want) => expect(qbExclusionAccess(role), role).toBe(want)
    );
  });

  it('junk and missing roles fail closed', () => {
    for (const junk of [...JUNK_ROLES, 'constructor', 'toString']) {
      expect(qbExclusionAccess(junk), JSON.stringify(junk)).toBe('none');
    }
    expect(qbExclusionAccess(null)).toBe('none');
  });
});

function fakeAdmin(result: { data: unknown; error: { message: string } | null }) {
  const calls: unknown[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push([fn, args]);
      return result;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe('S114 PART B — queueRowExcluded (the exit gate’s check)', () => {
  const row = { entity_type: 'payment', entity_id: 'p-1' };

  it('asks qb_entity_excluded with the row’s own entity', async () => {
    const f = fakeAdmin({ data: true, error: null });
    expect(await queueRowExcluded(f.client, row)).toBe(true);
    expect(f.calls).toEqual([
      ['qb_entity_excluded', { p_entity_type: 'payment', p_entity_id: 'p-1' }],
    ]);
  });

  it('false passes the row on', async () => {
    expect(await queueRowExcluded(fakeAdmin({ data: false, error: null }).client, row)).toBe(false);
  });

  it('an ERROR is neither true nor false — the worker retries rather than pushing', async () => {
    const out = await queueRowExcluded(
      fakeAdmin({ data: null, error: { message: 'boom' } }).client,
      row
    );
    expect(out).toEqual({ error: 'Could not check the QuickBooks exclusion: boom' });
  });

  it('the reason the accounting panel shows names the Owner’s exclusion', () => {
    expect(QB_PROJECT_EXCLUDED_REASON).toMatch(/excluded from QuickBooks by the Owner/);
  });
});

describe('S114 PART B — the worker checks BEFORE it sends', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../lib/quickbooks/worker.ts', import.meta.url)),
    'utf8'
  );
  it('the exit gate runs before markInFlight / handleQueueRow in the drain loop', () => {
    const gate = src.indexOf('const exclusion = await queueRowExcluded(admin, row);');
    const inFlight = src.indexOf('await markInFlight(admin, row.id);');
    const handle = src.indexOf('const result = await handleQueueRow(ctx, row);');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(inFlight);
    expect(inFlight).toBeLessThan(handle);
  });
});
