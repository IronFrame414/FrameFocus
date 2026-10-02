import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CompanyRole } from '@framefocus/shared/types/roles';
import { forEveryRole, JUNK_ROLES } from '@/test-support/role-matrix';
import { TIME_EXPORT_COPY } from '@/lib/quickbooks/time-export-copy';

// ============================================================================
// S124 Part 2 — the QuickBooks time-export switch. ⚠️ THE SAFETY GATE.
//
// Three things, each pinned EXACTLY (never `includes` on a key set):
//   1. the migration ships the column DEFAULT false (stop rule 9) — read from
//      the migration file itself; the live harness reads it back from the DB;
//   2. the screen says what turning it on/off will and will NOT do, including
//      that QuickBooks Payroll may turn the hours into pay [Josh, RULED Q3];
//   3. the route is OWNER ONLY [Josh, RULED Q4], as a TOTAL role map.
// ============================================================================

const MIGRATION = fileURLToPath(
  new URL('../../../supabase/migrations/20262134000000_s124_qb_time_export_toggle.sql', import.meta.url)
);

describe('S124 Part 2 — the migration defaults the switch OFF', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('adds qb_time_export_enabled as NOT NULL DEFAULT false, exactly once', () => {
    const adds = sql.match(/ADD COLUMN qb_time_export_enabled [^,;]+/g);
    expect(adds).toEqual(['ADD COLUMN qb_time_export_enabled boolean NOT NULL DEFAULT false']);
  });

  it('never sets the switch true for existing rows (no UPDATE … = true anywhere)', () => {
    expect(sql.match(/qb_time_export_enabled\s*=\s*true/gi)).toBeNull();
    expect(sql.match(/^\s*UPDATE\s/gim)).toBeNull();
  });
});

describe('S124 Part 2 — what the switch says where it is flipped', () => {
  it('the copy is exactly this', () => {
    expect(TIME_EXPORT_COPY).toEqual({
      title: 'Send approved timesheets to QuickBooks',
      what:
        'When this is on, each approved day is sent to QuickBooks as one time entry per person, ' +
        'with the actual paid time rounded to the nearest minute.',
      payroll:
        'If you run QuickBooks Payroll and pay people from their time entries, QuickBooks may turn ' +
        'these hours into pay.',
      noBackfill:
        'Only days approved after you turn this on are sent. Days approved before then are not sent.',
      offIsNotUndo:
        'Turning this off stops sending new hours. Entries already in QuickBooks stay there. Turning ' +
        'it off does not remove or undo them.',
      disconnect: 'Disconnecting QuickBooks turns this off. After reconnecting, turn it on again yourself.',
      ownerOnly: 'Only the Owner can turn this on or off.',
      // [S124 Part 1] added with the employee matching [Josh, RULED Q2/Q9].
      matching:
        'Each person must be matched to an employee that already exists in QuickBooks. A person who ' +
        'is not matched is held and never sent. This app never creates employees in QuickBooks. Each ' +
        'entry carries a note like "EZCB session [FF:…]" so it can be found again; anyone reading the ' +
        'books, including your accountant, will see it.',
      confirmOn:
        'Turn on sending approved timesheets to QuickBooks?\n\n' +
        'If you run QuickBooks Payroll and pay people from their time entries, QuickBooks may turn ' +
        'these hours into pay.\n\n' +
        'Only days approved from now on are sent. Days approved before now are not sent.',
    });
  });

  it('the confirm shown on turning it ON carries the payroll warning verbatim', () => {
    expect(TIME_EXPORT_COPY.confirmOn.split('\n\n')[1]).toBe(TIME_EXPORT_COPY.payroll);
  });

  it('the component renders every safety sentence', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../components/quickbooks/time-export-settings.tsx', import.meta.url)),
      'utf8'
    );
    const rendered = [...src.matchAll(/\{TIME_EXPORT_COPY\.(\w+)\}/g)].map((m) => m[1]).sort();
    expect(rendered).toEqual(['disconnect', 'matching', 'noBackfill', 'offIsNotUndo', 'ownerOnly', 'payroll', 'title', 'what']);
  });
});

// ── 3. The route, as a TOTAL role map ──────────────────────────────────────

let role: string | null = 'owner';
const updates: Record<string, unknown>[] = [];

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (table: string) => {
      if (table === 'profiles') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          single: async () => ({ data: role === null ? null : { company_id: 'co-1', role }, error: null }),
        };
        return chain;
      }
      return {
        update: (patch: Record<string, unknown>) => ({
          eq: async () => {
            updates.push(patch);
            return { error: null };
          },
        }),
      };
    },
  }),
}));

const { POST } = await import('@/app/api/quickbooks/time-export/route');
const req = (body: unknown) =>
  new Request('http://t/api/quickbooks/time-export', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;

beforeEach(() => {
  updates.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('S124 Part 2 — POST /api/quickbooks/time-export is Owner only', () => {
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

  forEveryRole(MAY_FLIP, (r, allowed) => {
    it(`${r} → ${allowed ? '200, writes the switch' : '403, writes nothing'}`, async () => {
      role = r;
      const res = await POST(req({ enabled: true }));
      expect(res.status).toBe(allowed ? 200 : 403);
      expect(updates).toEqual(allowed ? [{ qb_time_export_enabled: true }] : []);
    });
  });

  for (const junk of [...JUNK_ROLES, null]) {
    it(`junk role ${JSON.stringify(junk)} → 403, writes nothing`, async () => {
      role = junk;
      const res = await POST(req({ enabled: true }));
      expect(res.status).toBe(403);
      expect(updates).toEqual([]);
    });
  }

  it('a non-boolean "enabled" is refused (400) and writes nothing', async () => {
    role = 'owner';
    const res = await POST(req({ enabled: 'true' }));
    expect(res.status).toBe(400);
    expect(updates).toEqual([]);
  });

  it('turning it OFF writes exactly false', async () => {
    role = 'owner';
    const res = await POST(req({ enabled: false }));
    expect(res.status).toBe(200);
    expect(updates).toEqual([{ qb_time_export_enabled: false }]);
  });
});
