import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole } from '@/test-support/role-matrix';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { loadCriticalPathData } from '@/lib/critical-path/load';

// ============================================================================
// S127 item 6 — the standard holidays reach the ENGINE, and only Owner/Admin
// can toggle them (and only `enabled`).
//   ENGINE   loadCriticalPathData's calendar carries Thanksgiving's resolved
//            date for every year in the span while the rule is on, and none
//            while it is off — the engine resolves years, not the UI.
//   AUTHORITY TOTAL role map on toggling `enabled`, judged by the service role
//            (writes return no rows).
//   SCOPE    the Owner cannot change the rule itself (month) — 42501.
// The QA tenant's rule is restored in afterAll.
// ============================================================================

const COMPANY = '03bb903f-1084-4ab4-afb8-03192cb58d30';
const IDENTITY: Record<CompanyRole, string> = {
  owner: 'josh+test50@worthprop.com',
  admin: 'josh+qa-admin@worthprop.com',
  project_executive: 'josh+qa-pe@worthprop.com',
  project_manager: 'josh+pm@worthprop.com',
  foreman: 'josh+qa-foreman@worthprop.com',
  crew_member: 'josh+crew@worthprop.com',
  client: 'josh+qa-client@worthprop.com',
  subcontractor: 'josh+qa-sub@worthprop.com',
};
const MAY_TOGGLE: Record<CompanyRole, boolean> = {
  owner: true,
  admin: true,
  project_executive: false,
  project_manager: false,
  foreman: false,
  crew_member: false,
  client: false,
  subcontractor: false,
};

let ruleId = '';
let original = true;
let projectId = '';

async function enabled(): Promise<boolean> {
  const { data } = await admin
    .from('company_holiday_rules')
    .select('enabled')
    .eq('id', ruleId)
    .single();
  return data!.enabled as boolean;
}

beforeAll(async () => {
  assertRebuildTest();
  const { data: r } = await admin
    .from('company_holiday_rules')
    .select('id, enabled')
    .eq('company_id', COMPANY)
    .eq('rule_key', 'thanksgiving')
    .single();
  ruleId = r!.id as string;
  original = r!.enabled as boolean;
  const { data: p } = await admin
    .from('projects')
    .select('id')
    .eq('company_id', COMPANY)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  projectId = p!.id as string;
});

afterAll(async () => {
  await admin.from('company_holiday_rules').update({ enabled: original }).eq('id', ruleId);
  expect(await enabled()).toBe(original);
});

describe('S127 6 — the engine', () => {
  it('Thanksgiving is in the calendar for every year while on, and in none while off', async () => {
    await admin.from('company_holiday_rules').update({ enabled: true }).eq('id', ruleId);
    const on = await loadCriticalPathData(admin as unknown as SupabaseClient<Database>, projectId);
    expect(on.ok).toBe(true);
    const onDays = on.ok ? on.data.input.calendar.holidays : [];
    const year = new Date().getFullYear();
    expect(onDays).toContain(
      year === 2026 ? '2026-11-26' : (onDays.find((d) => d.endsWith('-11-26')) ?? 'x')
    );
    expect(onDays).toContain('2027-11-25');
    await admin.from('company_holiday_rules').update({ enabled: false }).eq('id', ruleId);
    const off = await loadCriticalPathData(admin as unknown as SupabaseClient<Database>, projectId);
    const offDays = off.ok ? off.data.input.calendar.holidays : ['x'];
    console.log(`[s127-hol] on=${onDays.length} off=${offDays.length}`);
    expect(offDays).not.toContain('2027-11-25');
    expect(offDays).not.toContain('2026-11-26');
  });
});

describe('S127 6 — who may toggle (TOTAL map, judged by the service role)', () => {
  forEveryRole(MAY_TOGGLE, (role, allowed) => {
    it(`${role}: ${allowed ? 'toggles' : 'is refused'}`, async () => {
      await admin.from('company_holiday_rules').update({ enabled: false }).eq('id', ruleId);
      const s = await sessionFor(IDENTITY[role]);
      await s.from('company_holiday_rules').update({ enabled: true }).eq('id', ruleId);
      expect(await enabled(), role).toBe(allowed);
    });
  });

  it('the Owner cannot change the rule itself — only on/off', async () => {
    const s = await sessionFor(IDENTITY.owner);
    const { error } = await s.from('company_holiday_rules').update({ month: 12 }).eq('id', ruleId);
    expect(error?.code).toBe('42501');
    const { data } = await admin
      .from('company_holiday_rules')
      .select('month')
      .eq('id', ruleId)
      .single();
    expect(data!.month).toBe(11);
  });
});
