import { describe, expect, it } from 'vitest';
import {
  PROJECT_MONEY_ROLES,
  seesCompanyMoney,
  seesProjectMoney,
} from '@framefocus/shared/constants/roles';
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
