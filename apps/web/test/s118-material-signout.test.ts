import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { JUNK_ROLES, forEveryRole } from '@/test-support/role-matrix';
import {
  RECEIPT_ACKNOWLEDGEMENT,
  canCloseSignout,
  isActive,
  isOverdue,
} from '@/lib/material-signouts/signout';

// S118 item 11 — the sign-out's pure rules. The database enforces the close
// (close_material_signout, test/s118-material-signouts.live.ts); this pins the
// UI's copy of that list to the same answer for every role.

const CLOSE: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: true,
  project_manager: true,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};

describe('canCloseSignout — Owner/Admin/PM/PE (total map)', () => {
  forEveryRole(CLOSE, (role, may) => {
    it(`${role} → ${may}`, () => expect(canCloseSignout(role)).toBe(may));
  });
  it.each(JUNK_ROLES.map((r) => [r]))('junk role %j fails closed', (r) => {
    expect(canCloseSignout(r)).toBe(false);
  });
  it('null/undefined fail closed', () => {
    expect(canCloseSignout(null)).toBe(false);
    expect(canCloseSignout(undefined)).toBe(false);
  });
});

describe('OVERDUE is derived: open AND the expected return is before today', () => {
  const today = '2026-09-29';
  it.each([
    ['open', '2026-09-28', true],
    ['open', '2026-09-29', false], // due today is not overdue
    ['open', '2026-09-30', false],
    ['pending_receipt', '2026-09-01', false], // it has not left yet
    ['returned', '2026-09-01', false],
    ['damaged_on_return', '2026-09-01', false],
    ['not_returned', '2026-09-01', false],
  ] as const)('%s due %s → %s', (status, due, want) => {
    expect(isOverdue({ status, expected_return_date: due }, today)).toBe(want);
  });
  it('active = awaiting signature or out', () => {
    expect(isActive({ status: 'pending_receipt' })).toBe(true);
    expect(isActive({ status: 'open' })).toBe(true);
    expect(isActive({ status: 'returned' })).toBe(false);
  });
});

describe('the acknowledgement is ONE text: the UI shows what the database stores', () => {
  it("RECEIPT_ACKNOWLEDGEMENT equals the migration's c_ack constant, byte for byte", () => {
    const dir = join(__dirname, '../../../supabase/migrations');
    const file = readdirSync(dir).find((f) => f.startsWith('20262080000000_'));
    expect(file, 'the item 11 migration').toBeTruthy();
    const sql = readFileSync(join(dir, file!), 'utf8');
    const m = /c_ack constant text := '([^']*)';/.exec(sql);
    expect(m, 'c_ack found in the migration').not.toBeNull();
    expect(m![1]).toBe(RECEIPT_ACKNOWLEDGEMENT);
  });
  it('and it is the paper form, verbatim', () => {
    expect(RECEIPT_ACKNOWLEDGEMENT).toBe(
      'By signing above, the receiving party acknowledges responsibility for the listed material while in their possession and agrees to return it in the same or better condition.'
    );
  });
});
