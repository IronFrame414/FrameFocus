import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  managesProjectOperations,
  receivesAssignedProjectAlerts,
  supervisesProjectWork,
} from '@framefocus/shared/constants/roles';
import { canApproveRefund, canIssueRefund } from '@/lib/services/payments-shared';
import { canManageContracts } from '@/lib/services/contracts-shared';
import { forEveryRole, JUNK_ROLES } from '@/test-support/role-matrix';

// ===========================================================================
// S114 PART A — the project-operations predicates, as TOTAL maps.
// ===========================================================================
// They replaced 3–7 hand-written copies of ['owner','admin','project_manager'
// (,'foreman')] that each omitted the Project Executive. A new role fails to
// compile here until it answers. The carve-outs are asserted beside them so
// the widening can never be read as refund or contract authority.
// ===========================================================================

describe('S114 — managesProjectOperations / supervisesProjectWork / receivesAssignedProjectAlerts', () => {
  it('every role answered', () => {
    forEveryRole(
      {
        owner: [true, true, false],
        admin: [true, true, false],
        project_executive: [true, true, true],
        project_manager: [true, true, true],
        foreman: [false, true, false],
        crew_member: [false, false, false],
        subcontractor: [false, false, false],
        client: [false, false, false],
      },
      (role, [manage, supervise, alerts]) => {
        expect(managesProjectOperations(role), `${role} manage`).toBe(manage);
        expect(supervisesProjectWork(role), `${role} supervise`).toBe(supervise);
        expect(receivesAssignedProjectAlerts(role), `${role} alerts`).toBe(alerts);
      }
    );
  });

  it('fails closed on junk, including prototype keys', () => {
    for (const junk of [...JUNK_ROLES, 'constructor', '__proto__', 'toString']) {
      expect(managesProjectOperations(junk), `junk '${junk}'`).toBe(false);
      expect(supervisesProjectWork(junk), `junk '${junk}'`).toBe(false);
      expect(receivesAssignedProjectAlerts(junk), `junk '${junk}'`).toBe(false);
    }
    expect(managesProjectOperations(null)).toBe(false);
    expect(supervisesProjectWork(undefined)).toBe(false);
  });

  it('the carve-outs did NOT move with it: the PE manages operations but issues no refund and manages no contract', () => {
    expect(managesProjectOperations('project_executive')).toBe(true);
    expect(canIssueRefund('project_executive')).toBe(false);
    expect(canApproveRefund('project_executive')).toBe(false);
    expect(canManageContracts('project_executive')).toBe(false);
  });
});

describe('S114 — the hand-written copies are gone from the sites that had them', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const sites = [
    '../app/dashboard/projects/[id]/schedule/page.tsx',
    '../lib/services/punch-client.ts',
    '../app/dashboard/projects/[id]/punch/punch-panel.tsx',
    '../app/m/p/[projectId]/punch/[itemId]/punch-actions.tsx',
    '../app/dashboard/projects/[id]/deliveries/page.tsx',
    '../app/dashboard/field-ops/[projectId]/deliveries/page.tsx',
    '../app/dashboard/field-ops/[projectId]/deliveries/new/page.tsx',
    '../app/dashboard/field-ops/[projectId]/deliveries/[poId]/edit/page.tsx',
    '../app/api/pos/[id]/send/route.ts',
    '../app/dashboard/projects/[id]/team/page.tsx',
    '../app/dashboard/projects/[id]/contacts/page.tsx',
    '../app/api/selections/spec-sheet/route.ts',
    '../app/api/selections/link-thumbnail/route.ts',
    '../app/dashboard/projects/[id]/selections/selections-tab.tsx',
    '../app/dashboard/projects/[id]/selections/[selectionId]/selection-lifecycle.tsx',
    '../app/dashboard/projects/[id]/selections/[selectionId]/selection-sheet.tsx',
    '../app/dashboard/expenses/page.tsx',
    '../app/dashboard/expenses/expenses-page-client.tsx',
    '../components/expenses/budget-split-editor.tsx',
  ];
  it.each(sites)('%s reads the shared predicate, not a local list', (rel) => {
    const src = read(rel);
    expect(src).toMatch(/managesProjectOperations|supervisesProjectWork/);
    expect(src).not.toMatch(/\['owner', 'admin', 'project_manager'(, 'foreman')?\]/);
  });
});
