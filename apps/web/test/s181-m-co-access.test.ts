import { describe, expect, it, vi } from 'vitest';

// detail-access.ts is a server module (redirect + a profile read); only its
// pure role predicates are under test here.
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock('@/lib/services/profiles', () => ({ getMyProfile: vi.fn() }));

import { canWriteCo, readsChangeOrders } from '@/app/m/detail-access';
import { forEveryRole, JUNK_ROLES } from '@/test-support/role-matrix';

// [S181 FILL-C-1, PARITY] /m's change-order rules, as TOTAL maps. Each mirrors
// the database: READ = change_orders_select_visible (owner/admin; a PM on its
// own COs) + change_orders_select_project_executive (every CO on its assigned
// projects); WRITE = change_orders_insert_authorized + the PE write arm
// (20261910000000). A Project Executive reads and writes on /m exactly as on
// desktop — the defect this file pins was /m showing it "office only".
describe('S181 — /m change-order read and write rules, every role answered', () => {
  it('readsChangeOrders', () => {
    forEveryRole(
      {
        owner: true,
        admin: true,
        project_executive: true,
        project_manager: true,
        foreman: false,
        crew_member: false,
        subcontractor: false,
        client: false,
      },
      (role, reads) => expect(readsChangeOrders(role), role).toBe(reads)
    );
    for (const junk of JUNK_ROLES) expect(readsChangeOrders(junk), `junk '${junk}'`).toBe(false);
    expect(readsChangeOrders(null)).toBe(false);
  });

  it('canWriteCo', () => {
    forEveryRole(
      {
        owner: true,
        admin: true,
        project_executive: true,
        project_manager: true,
        foreman: false,
        crew_member: false,
        subcontractor: false,
        client: false,
      },
      (role, writes) => expect(canWriteCo(role), role).toBe(writes)
    );
    for (const junk of JUNK_ROLES) expect(canWriteCo(junk), `junk '${junk}'`).toBe(false);
  });
});
