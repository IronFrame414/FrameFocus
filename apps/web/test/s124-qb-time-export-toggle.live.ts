import { describe, it, expect, afterAll } from 'vitest';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { forEveryRole } from '@/test-support/role-matrix';

// ============================================================================
// S124 Part 2 — the time-export switch, against the real database (rebuild-test).
//
//   1. Every row carries a boolean. (The DEFAULT is read from the SCHEMA by the
//      SQL verification, never from a mutable row — CLAUDE.md S157.)
//   2. Who can flip it: a TOTAL role map, each role writing through its OWN
//      session with NO returned rows (S181c: `.insert().select()` measures the
//      read policy). The effect is counted with the service role.
//   3. Turning it on stamps when and who; the stamps cannot be hand-written.
//   4. It cannot be turned on while QuickBooks is not connected.
//
// Sabal Point is rebuild-test's sandbox-connected tenant. NOTHING HERE QUEUES OR
// SENDS: Part 2 adds no reader of this column, and rebuild-test has no worker.
// Every test leaves the switch OFF (afterAll asserts it).
// ============================================================================

const SABAL = '03bb903f-1084-4ab4-afb8-03192cb58d30';
const RIDGELINE_OWNER = 'josh+qa-b-owner@worthprop.com'; // TEST CO 2 — disconnected

const EMAIL_FOR: Record<CompanyRole, string> = {
  owner: 'josh+test50@worthprop.com',
  admin: 'josh+qa-admin@worthprop.com',
  project_executive: 'josh+qa-pe@worthprop.com',
  project_manager: 'josh+pm@worthprop.com',
  foreman: 'josh+qa-foreman@worthprop.com',
  crew_member: 'josh+crew@worthprop.com',
  client: 'josh+qa-client@worthprop.com',
  subcontractor: 'josh+qa-sub@worthprop.com',
};

async function switchOf(companyId: string) {
  const { data, error } = await admin
    .from('companies')
    .select('qb_time_export_enabled, qb_time_export_enabled_at, qb_time_export_enabled_by, qb_connection_state')
    .eq('id', companyId)
    .single();
  if (error) throw new Error(`read failed: ${error.message}`);
  return data!;
}

async function forceOff(companyId: string) {
  const { error } = await admin
    .from('companies')
    .update({ qb_time_export_enabled: false })
    .eq('id', companyId);
  if (error) throw new Error(`reset failed: ${error.message}`);
}

afterAll(async () => {
  await forceOff(SABAL);
  const after = await switchOf(SABAL);
  expect(after.qb_time_export_enabled).toBe(false);
});

describe('S124 Part 2 — the switch on rebuild-test', () => {
  it('every company carries a boolean switch (NOT NULL, measured on every row)', async () => {
    // ⚠️ The DEFAULT itself is read from information_schema by the SQL
    // verification (rebuild-test and production, report Part 2) — PostgREST
    // cannot reach information_schema, and a default must be read from the
    // schema, never inferred from rows.
    assertRebuildTest();
    const probe = await admin.from('companies').select('id, qb_time_export_enabled');
    expect(probe.error).toBeNull();
    const rows = probe.data ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => typeof r.qb_time_export_enabled !== 'boolean')).toEqual([]);
  });

  const MAY_FLIP: Record<CompanyRole, boolean> = {
    owner: true,
    admin: false,
    project_executive: false,
    project_manager: false,
    foreman: false,
    crew_member: false,
    client: false,
    subcontractor: false,
  };

  forEveryRole(MAY_FLIP, (role, allowed) => {
    it(`${role} writing the switch through its own session → ${allowed ? 'ON' : 'unchanged OFF'}`, async () => {
      assertRebuildTest();
      await forceOff(SABAL);
      const s = await sessionFor(EMAIL_FOR[role]);
      // ⚠️ No `.select()`: a returned row would make Postgres check the SELECT
      // policy and measure the wrong thing (S181c).
      const { error } = await s.from('companies').update({ qb_time_export_enabled: true }).eq('id', SABAL);
      const after = await switchOf(SABAL);
      expect(after.qb_time_export_enabled).toBe(allowed);
      if (role === 'admin') {
        // Admin passes RLS (companies_update_owner_admin) — the TRIGGER is what refuses.
        expect(error?.code).toBe('42501');
        expect(error?.message).toBe('Turning QuickBooks time export on or off is Owner-only.');
      }
      if (allowed) expect(error).toBeNull();
      await forceOff(SABAL);
    });
  });

  it('turning it ON stamps when and who, and the stamps cannot be hand-written', async () => {
    assertRebuildTest();
    await forceOff(SABAL);
    const owner = await sessionFor(EMAIL_FOR.owner);
    const { data: me } = await owner.auth.getUser();
    const before = Date.now();
    const on = await owner.from('companies').update({ qb_time_export_enabled: true }).eq('id', SABAL);
    expect(on.error).toBeNull();
    const stamped = await switchOf(SABAL);
    expect(stamped.qb_time_export_enabled).toBe(true);
    expect(stamped.qb_time_export_enabled_by).toBe(me.user!.id);
    const at = new Date(stamped.qb_time_export_enabled_at as string).getTime();
    expect(at).toBeGreaterThanOrEqual(before - 60_000);
    expect(at).toBeLessThanOrEqual(Date.now() + 60_000);

    const forge = await owner
      .from('companies')
      .update({ qb_time_export_enabled_at: '2020-01-01T00:00:00Z', qb_time_export_enabled_by: null })
      .eq('id', SABAL);
    expect(forge.error).toBeNull();
    const kept = await switchOf(SABAL);
    expect(kept.qb_time_export_enabled_at).toBe(stamped.qb_time_export_enabled_at);
    expect(kept.qb_time_export_enabled_by).toBe(me.user!.id);

    const off = await owner.from('companies').update({ qb_time_export_enabled: false }).eq('id', SABAL);
    expect(off.error).toBeNull();
    expect((await switchOf(SABAL)).qb_time_export_enabled).toBe(false);
  });

  it('it cannot be turned on while QuickBooks is not connected (Ridgeline, disconnected)', async () => {
    assertRebuildTest();
    const ownerB = await sessionFor(RIDGELINE_OWNER);
    const { data: prof } = await ownerB.from('profiles').select('company_id, role').single();
    expect(prof?.role).toBe('owner');
    const companyB = prof!.company_id as string;
    const before = await switchOf(companyB);
    expect(before.qb_connection_state).toBe('disconnected');
    expect(before.qb_time_export_enabled).toBe(false);

    const { error } = await ownerB.from('companies').update({ qb_time_export_enabled: true }).eq('id', companyB);
    expect(error?.code).toBe('22023');
    expect(error?.message).toBe('Connect QuickBooks before turning on time export.');
    expect((await switchOf(companyB)).qb_time_export_enabled).toBe(false);
  });
});
