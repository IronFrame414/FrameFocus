import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  INVITABLE_ROLES,
  OFFERED_ROLES,
  PROJECT_MONEY_ROLES,
  WITHHELD_ROLES,
  isWithheldRole,
  seesCompanyMoney,
  seesProjectMoney,
} from '@framefocus/shared/constants/roles';
import { forEveryRole, JUNK_ROLES } from '@/test-support/role-matrix';
import { TIME_ROLE_RANK } from '@framefocus/shared/utils/time-tracking';

// S111 Part One — the central money predicates. The database decides WHICH
// projects (20261830000000); these decide whether a screen draws what it got.

describe('S111 — seesProjectMoney / seesCompanyMoney', () => {
  it('project money: Owner, Admin and a Project Executive — nobody else', () => {
    expect([...PROJECT_MONEY_ROLES].sort()).toEqual(['admin', 'owner', 'project_executive']);
    for (const r of ['owner', 'admin', 'project_executive'])
      expect(seesProjectMoney(r), r).toBe(true);
  });

  it('CONTROL: PM, foreman, crew, sub, client and junk see no project money', () => {
    for (const r of [
      'project_manager',
      'foreman',
      'crew_member',
      'subcontractor',
      'client',
      '',
      null,
      undefined,
      'OWNER',
    ]) {
      expect(seesProjectMoney(r), String(r)).toBe(false);
    }
  });

  it('company money stays Owner/Admin — a Project Executive is OUT (RULED 3a)', () => {
    expect(seesCompanyMoney('owner')).toBe(true);
    expect(seesCompanyMoney('admin')).toBe(true);
    expect(seesCompanyMoney('project_executive')).toBe(false);
    expect(seesCompanyMoney('project_manager')).toBe(false);
  });

  it('Q13: a Project Executive ranks with the PM for timesheets — never rank 0', () => {
    expect(TIME_ROLE_RANK.project_executive).toBe(TIME_ROLE_RANK.project_manager);
    expect(TIME_ROLE_RANK.project_executive).toBe(3);
  });
});

// [S181] The same predicates as TOTAL maps (CLAUDE.md, S112): a new role fails
// to compile until it answers. The hand lists above are kept, not deleted.
describe('S181 — money predicates, every role answered', () => {
  it('seesProjectMoney / seesCompanyMoney', () => {
    forEveryRole(
      {
        owner: [true, true],
        admin: [true, true],
        project_executive: [true, false],
        project_manager: [false, false],
        foreman: [false, false],
        crew_member: [false, false],
        subcontractor: [false, false],
        client: [false, false],
      },
      (role, [project, company]) => {
        expect(seesProjectMoney(role), `${role} project`).toBe(project);
        expect(seesCompanyMoney(role), `${role} company`).toBe(company);
      }
    );
    for (const junk of JUNK_ROLES) {
      expect(seesProjectMoney(junk), `junk '${junk}'`).toBe(false);
      expect(seesCompanyMoney(junk), `junk '${junk}'`).toBe(false);
    }
  });
});

// [S181 Q3, RULED Josh] The Project Executive is WITHHELD from every grant UI
// until its operational arms land — from ONE source, and never from the schema.
describe('S181 Q3 — withheld from the offer, kept in the schema', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

  it('isWithheldRole — every role answered', () => {
    forEveryRole(
      {
        owner: false,
        admin: false,
        project_executive: true,
        project_manager: false,
        foreman: false,
        crew_member: false,
        subcontractor: false,
        client: false,
      },
      (role, withheld) => expect(isWithheldRole(role), role).toBe(withheld)
    );
    for (const junk of JUNK_ROLES) expect(isWithheldRole(junk), `junk '${junk}'`).toBe(false);
    expect([...WITHHELD_ROLES]).toEqual(['project_executive']);
  });

  it('OFFERED_ROLES is INVITABLE_ROLES minus the withheld — PE absent, the four staff roles present', () => {
    expect([...OFFERED_ROLES]).toEqual(['admin', 'project_manager', 'foreman', 'crew_member']);
    expect(OFFERED_ROLES).not.toContain('project_executive');
    // It is still INVITABLE by type and by list — withheld, not removed.
    expect(INVITABLE_ROLES).toContain('project_executive');
  });

  it('ONE source: both pickers derive from OFFERED_ROLES; neither hand-lists a role', () => {
    const invite = read('../app/dashboard/team/invite/invite-form.tsx');
    const edit = read('../app/dashboard/team/[id]/edit-form.tsx');
    expect(invite).toMatch(/const INVITE_OPTIONS = OFFERED_ROLES\.map\(/);
    expect(edit).toMatch(/const OWNER_ROLE_OPTIONS = OFFERED_ROLES\.map\(/);
    expect(edit).toMatch(/const ADMIN_ROLE_OPTIONS = OWNER_ROLE_OPTIONS\.filter\(/);
    // CONTROL that must fire on the superseded shape: a literal option object.
    expect("{ value: 'project_manager', label: 'Project Manager' }").toMatch(/\{ value: '[a-z_]+', label:/);
    // Code only: both files QUOTE their superseded lists in comments, on purpose.
    const code = (src: string) =>
      src
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
    expect(code(invite)).toMatch(/INVITE_OPTIONS/); // the filter left the code in
    for (const [name, src] of [['invite-form', invite], ['edit-form', edit]] as const)
      expect(code(src), `${name} hand-lists a role option again`).not.toMatch(/\{ value: '[a-z_]+', label:/);
  });

  it('both grant paths refuse a withheld role (a hand-built request, not only the picker)', () => {
    expect(read('../app/api/invites/route.ts')).toMatch(/if \(isWithheldRole\(role\)\)/);
    expect(read('../app/dashboard/team/[id]/actions.ts')).toMatch(
      /isWithheldRole\(updates\.role\) && updates\.role !== target\.role/
    );
  });

  it('the DATABASE keeps it: both role CHECKs still admit project_executive', () => {
    const m = read('../../../supabase/migrations/20261820000000_s111_project_executive_role.sql');
    for (const c of ['profiles_role_check', 'invitations_role_check']) {
      const at = m.indexOf(`ADD CONSTRAINT ${c}`);
      expect(at, c).toBeGreaterThan(-1);
      expect(m.slice(at, at + 400), c).toMatch(/'project_executive'/);
    }
  });
});
