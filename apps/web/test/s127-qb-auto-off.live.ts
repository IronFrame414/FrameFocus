import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// S127 item 1 — the switch records WHEN and WHY it turned itself off, and tells
// the OWNER ONLY, ONLY on an actual on → off change.
//
// ⚠️ EVERY COUNT IS THE SERVICE ROLE'S. An Admin seeing nothing on screen is a
// render gate (the #136 mistake); "Owner only" is proved by counting the rows
// written per recipient role.
//
// ⚠️ NO QUICKBOOKS CALL IS MADE. Every transition is a direct write of
// `companies.qb_connection_state` by the service role — the same column the
// disconnect route writes — so the trigger is exercised without Intuit.
//
// The QA tenant (Company A) has one profile per role. Its QuickBooks columns are
// captured first and restored in `finally`, exactly, whatever happens.
// ============================================================================

const COMPANY_ID = '03bb903f-1084-4ab4-afb8-03192cb58d30';
const OWNER_EMAIL = 'josh+test50@worthprop.com';
const TYPE = 'qb_time_export_auto_off';

const COLS =
  'qb_connection_state, qb_time_export_enabled, qb_time_export_enabled_at, qb_time_export_enabled_by, ' +
  'qb_time_export_auto_off_at, qb_time_export_auto_off_reason, qb_time_export_auto_off_from_state';

type Row = {
  qb_connection_state: string;
  qb_time_export_enabled: boolean;
  qb_time_export_enabled_at: string | null;
  qb_time_export_enabled_by: string | null;
  qb_time_export_auto_off_at: string | null;
  qb_time_export_auto_off_reason: string | null;
  qb_time_export_auto_off_from_state: string | null;
};

let original: Row;
let roleOf = new Map<string, CompanyRole>();
const createdIds: string[] = [];

async function company(): Promise<Row> {
  const { data, error } = await admin.from('companies').select(COLS).eq('id', COMPANY_ID).single();
  if (error || !data) throw new Error(`read company: ${error?.message}`);
  return data as unknown as Row;
}

async function write(patch: Partial<Row>): Promise<void> {
  // ⚠️ No .select(): judged by the read-back, not by a returned row.
  const { error } = await admin.from('companies').update(patch).eq('id', COMPANY_ID);
  if (error) throw new Error(`write ${JSON.stringify(patch)}: ${error.message}`);
}

/** Auto-off notification rows for this company, per recipient role, by the service role. */
async function rowsByRole(): Promise<{
  total: number;
  byRole: Record<string, number>;
  ids: string[];
}> {
  const { data, error } = await admin
    .from('notifications')
    .select('id, recipient_profile_id')
    .eq('company_id', COMPANY_ID)
    .eq('type', TYPE)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const byRole: Record<string, number> = {};
  for (const r of data ?? []) {
    const role =
      roleOf.get((r as { recipient_profile_id: string }).recipient_profile_id) ?? 'UNKNOWN';
    byRole[role] = (byRole[role] ?? 0) + 1;
  }
  return {
    total: (data ?? []).length,
    byRole,
    ids: (data ?? []).map((r) => (r as { id: string }).id),
  };
}

beforeAll(async () => {
  assertRebuildTest();
  original = await company();
  const { data: profs, error } = await admin
    .from('profiles')
    .select('id, role')
    .eq('company_id', COMPANY_ID)
    .eq('is_deleted', false);
  if (error) throw new Error(error.message);
  roleOf = new Map((profs ?? []).map((p) => [p.id as string, p.role as CompanyRole]));
  // Pre-existing rows of this type would muddy every count; there must be none.
  const pre = await rowsByRole();
  expect(pre.total).toBe(0);
  console.log(`[s127-ao] original ${JSON.stringify(original)} profiles=${roleOf.size}`);
});

afterAll(async () => {
  try {
    const now = await rowsByRole();
    createdIds.push(...now.ids);
    if (createdIds.length > 0) await admin.from('notifications').delete().in('id', createdIds);
  } finally {
    // Exact restore. The service role has no auth.uid(), so the trigger's
    // freeze does not apply; the state it returns to is not disconnected or
    // revoked, so nothing is recorded or sent.
    await write(original);
    const back = await company();
    const left = await rowsByRole();
    console.log(`[s127-ao] restored ${JSON.stringify(back)} rowsLeft=${left.total}`);
    expect(back).toEqual(original);
    expect(left.total).toBe(0);
  }
});

describe('S127 item 1 — the switch says when it turned itself off', () => {
  it('ON → revoked (disconnected inside QuickBooks): off, recorded, ONE row for the Owner, ZERO for every other role', async () => {
    await write({ qb_connection_state: 'connected', qb_time_export_enabled: true });
    const on = await company();
    expect(on.qb_time_export_enabled).toBe(true);
    expect(on.qb_time_export_auto_off_at).toBeNull();

    await write({ qb_connection_state: 'revoked' });
    const off = await company();
    console.log(`[s127-ao] after revoke ${JSON.stringify(off)}`);
    expect(off.qb_time_export_enabled).toBe(false);
    expect(off.qb_time_export_auto_off_reason).toBe('connection_revoked');
    expect(off.qb_time_export_auto_off_from_state).toBe('connected');
    expect(off.qb_time_export_auto_off_at).not.toBeNull();

    const { total, byRole } = await rowsByRole();
    console.log(`[s127-ao] rows after revoke total=${total} ${JSON.stringify(byRole)}`);
    expect(total).toBe(1);
    // TOTAL role map: the answer for every role, the deny as well as the allow.
    forEveryRole<number>(
      {
        owner: 1,
        admin: 0,
        project_executive: 0,
        project_manager: 0,
        foreman: 0,
        crew_member: 0,
        subcontractor: 0,
        client: 0,
      },
      (role, expected) => expect(byRole[role] ?? 0, role).toBe(expected)
    );
  });

  it('ALREADY OFF → disconnected: ZERO new rows (counted both ways) and the record is untouched', async () => {
    const before = await company();
    const rowsBefore = await rowsByRole();
    await write({ qb_connection_state: 'connected' }); // the switch stays off
    const t0 = new Date().toISOString();
    await write({ qb_connection_state: 'disconnected' });
    const after = await company();
    const rowsAfter = await rowsByRole();
    const { count: since } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', COMPANY_ID)
      .eq('type', TYPE)
      .gte('created_at', t0);
    console.log(
      `[s127-ao] already-off: total ${rowsBefore.total} -> ${rowsAfter.total}, since t0=${since}`
    );
    expect(rowsAfter.total).toBe(rowsBefore.total);
    expect(since).toBe(0);
    expect(after.qb_time_export_enabled).toBe(false);
    expect(after.qb_time_export_auto_off_at).toBe(before.qb_time_export_auto_off_at);
    expect(after.qb_time_export_auto_off_reason).toBe(before.qb_time_export_auto_off_reason);
  });

  it("a client cannot forge or clear the record (the Owner's own session)", async () => {
    const owner = await sessionFor(OWNER_EMAIL);
    const before = await company();
    await owner
      .from('companies')
      .update({ qb_time_export_auto_off_at: null, qb_time_export_auto_off_reason: null })
      .eq('id', COMPANY_ID);
    const after = await company();
    expect(after.qb_time_export_auto_off_at).toBe(before.qb_time_export_auto_off_at);
    expect(after.qb_time_export_auto_off_reason).toBe(before.qb_time_export_auto_off_reason);
  });

  it('the Owner turning it back on clears the record; nothing turns it on by itself', async () => {
    await write({ qb_connection_state: 'connected' });
    expect((await company()).qb_time_export_enabled).toBe(false); // a reconnect does not
    const owner = await sessionFor(OWNER_EMAIL);
    await owner.from('companies').update({ qb_time_export_enabled: true }).eq('id', COMPANY_ID);
    const on = await company();
    expect(on.qb_time_export_enabled).toBe(true);
    expect(on.qb_time_export_auto_off_at).toBeNull();
    expect(on.qb_time_export_auto_off_reason).toBeNull();
    expect(on.qb_time_export_auto_off_from_state).toBeNull();
  });

  it('[Q-E] ON → needs_reauth (the grant died): off, recorded, one more Owner row; a FLAP adds nothing', async () => {
    await write({ qb_connection_state: 'connected' });
    const owner = await sessionFor(OWNER_EMAIL);
    await owner.from('companies').update({ qb_time_export_enabled: true }).eq('id', COMPANY_ID);
    expect((await company()).qb_time_export_enabled).toBe(true);
    const rowsBefore = await rowsByRole();
    await write({ qb_connection_state: 'needs_reauth' });
    const off = await company();
    const rowsAfter = await rowsByRole();
    console.log(
      `[s127-ao] after needs_reauth ${JSON.stringify(off)} rows ${rowsBefore.total} -> ${rowsAfter.total}`
    );
    expect(off.qb_time_export_enabled).toBe(false);
    expect(off.qb_time_export_auto_off_reason).toBe('connection_needs_reauth');
    expect(off.qb_time_export_auto_off_from_state).toBe('connected');
    expect(rowsAfter.total).toBe(rowsBefore.total + 1);
    expect(rowsAfter.total - (rowsAfter.byRole.owner ?? 0)).toBe(0);

    // The connection flaps: reconnect, die again, reconnect, die again.
    for (const st of ['connected', 'needs_reauth', 'connected', 'needs_reauth'] as const)
      await write({ qb_connection_state: st });
    const flapped = await rowsByRole();
    const afterFlap = await company();
    console.log(`[s127-ao] after flap rows=${flapped.total}`);
    expect(flapped.total, 'one off-event, not five').toBe(rowsAfter.total);
    expect(afterFlap.qb_time_export_auto_off_at, 'the first event stands').toBe(
      off.qb_time_export_auto_off_at
    );

    // [Q-E] A reconnect never turns it on, and LEAVES the record for the offer.
    await write({ qb_connection_state: 'connected' });
    const back = await company();
    expect(back.qb_time_export_enabled).toBe(false);
    expect(back.qb_time_export_auto_off_reason).toBe('connection_needs_reauth');
  });

  it('ON → disconnected (in FrameFocus): recorded as connection_disconnected, and one more Owner row', async () => {
    const owner = await sessionFor(OWNER_EMAIL);
    await owner.from('companies').update({ qb_time_export_enabled: true }).eq('id', COMPANY_ID);
    expect((await company()).qb_time_export_enabled).toBe(true);
    const rowsBefore = await rowsByRole();
    await write({ qb_connection_state: 'disconnected' });
    const off = await company();
    const rowsAfter = await rowsByRole();
    console.log(
      `[s127-ao] after disconnect ${JSON.stringify(off)} rows ${rowsBefore.total} -> ${rowsAfter.total}`
    );
    expect(off.qb_time_export_enabled).toBe(false);
    expect(off.qb_time_export_auto_off_reason).toBe('connection_disconnected');
    expect(off.qb_time_export_auto_off_from_state).toBe('connected');
    expect(rowsAfter.total).toBe(rowsBefore.total + 1);
    expect(rowsAfter.byRole.owner).toBe(3); // revoke, needs_reauth, disconnect
    expect(rowsAfter.total - (rowsAfter.byRole.owner ?? 0)).toBe(0);
  });
});
