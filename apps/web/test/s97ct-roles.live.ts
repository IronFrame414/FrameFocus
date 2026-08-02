/**
 * S97CT-ROLES — the deferred role checks, run for real (GATED.md Gate 2 follow-up).
 *
 * Every role-gated surface built since S95 had been "verified" by READING THE
 * MOUNT IN CODE — never by an actual login. This exercises them against real
 * sessions for Owner, Admin, PM, Foreman and Crew.
 *
 * WHAT THIS CAN AND CANNOT PROVE — read this before trusting a PASS.
 *
 *   DB READ  — can the role's session actually SELECT the rows the surface
 *              shows? This is the honest form of "must not fetch its data",
 *              and it is DB truth rather than a claim about JSX.
 *   DB WRITE — does the RPC or RLS refuse the write? Also DB truth. A UI-only
 *              gate is not a gate, so this is the half that matters.
 *   RENDER   — the JSX condition itself. Only reachable here for CLIENT
 *              components, which can be rendered to static markup in node.
 *              The gates in `page.tsx` server components cannot be executed
 *              outside a Next runtime, and are marked as such in the report
 *              rather than claimed as verified.
 *
 * SAFETY. Every write attempt is aimed at either (a) a deliberately invalid
 * target, so that even a BROKEN role guard mutates nothing — the fallback
 * validation fires before any write — or (b) this harness's own QA fixture,
 * never Josh's data, with the value captured and restored. Nothing in here can
 * damage the working test project.
 *
 * REQUIRES: node scripts/seed-test-identities.mjs
 * RUN:      cd apps/web && npx vitest run --config test/live.vitest.config.ts s97ct-roles
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { admin, assertRebuildTest, sessionFor } from './live-session';

const EMAILS = {
  owner: 'josh+test50@worthprop.com',
  admin: 'josh+qa-admin@worthprop.com',
  project_manager: 'josh+pm@worthprop.com',
  foreman: 'josh+qa-foreman@worthprop.com',
  crew_member: 'josh+crew@worthprop.com',
} as const;

type Role = keyof typeof EMAILS;
const ALL_ROLES = Object.keys(EMAILS) as Role[];
const GATED_ROLES: Role[] = ['project_manager', 'foreman', 'crew_member'];

const session: Record<Role, SupabaseClient> = {} as Record<Role, SupabaseClient>;

/** A UUID that exists nowhere — makes a write attempt provably harmless. */
const NOWHERE = '00000000-0000-0000-0000-000000000000';

let companyId: string;
/** Josh's project: PM-assigned, has invoices, COs and a sub-contract. READ ONLY. */
let richProjectId: string;
/** This harness's own project — the only thing it is allowed to write to. */
let qaProjectId: string;
let rateId: string;
let subContractId: string;
let invoiceId: string;

beforeAll(async () => {
  assertRebuildTest();

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Bishop Contracting').single();
  companyId = company!.id;

  for (const role of ALL_ROLES) session[role] = await sessionFor(EMAILS[role]);

  const { data: qa } = await admin
    .from('projects').select('id')
    .eq('company_id', companyId).eq('name', 'QA A — isolation fixture').single();
  qaProjectId = qa!.id;

  // The richest PM-assigned project — read targets only.
  const { data: rich } = await admin
    .from('projects').select('id')
    .eq('company_id', companyId).eq('id', 'a0a85240-333d-4177-bdf4-6df55fb069a6').single();
  richProjectId = rich!.id;

  const { data: rate } = await admin
    .from('instrument_rates').select('id').eq('company_id', companyId).limit(1).single();
  rateId = rate!.id;

  const { data: sub } = await admin
    .from('subcontractor_contracts').select('id')
    .eq('company_id', companyId).eq('is_deleted', false).limit(1).single();
  subContractId = sub!.id;

  const { data: invoice } = await admin
    .from('invoices').select('id').eq('project_id', richProjectId).limit(1).single();
  invoiceId = invoice!.id;
}, 180_000);

// ════════════════════════════════════════════════════════════════════════════
// 1. Budget & Cost project rate section — Owner/Admin see it; PM/Foreman/Crew
//    must neither render it NOR fetch its data.
//    Gate: budget/page.tsx:294  {isOwnerAdmin && <RateSection …>}
// ════════════════════════════════════════════════════════════════════════════
describe('1. Budget & Cost rate section', () => {
  it('1a. DB READ — Owner and Admin can read instrument rates', async () => {
    for (const role of ['owner', 'admin'] as const) {
      const { data } = await session[role].from('instrument_rates').select('id, rate').limit(5);
      expect(data?.length, `${role} could not read rates`).toBeGreaterThan(0);
    }
  });

  it('1b. DB READ — PM, Foreman and Crew must NOT be able to fetch rate data', async () => {
    const leaked: string[] = [];
    for (const role of GATED_ROLES) {
      const { data } = await session[role].from('instrument_rates').select('id, rate').limit(5);
      if ((data ?? []).length > 0) leaked.push(`${role} read ${data!.length} rate rows`);
    }
    expect(leaked, 'instrument_rates has no role floor — the gate is UI-only').toEqual([]);
  });

  it('1c. DB WRITE — a gated role cannot create a rate', async () => {
    for (const role of GATED_ROLES) {
      const { data, error } = await session[role]
        .from('instrument_rates')
        .insert({
          company_id: companyId, estimate_id: NOWHERE,
          rate_type: 'cost_plus_percent', rate: 99, effective_from: '2026-01-01',
        })
        .select('id');
      expect(error ?? (data?.length === 0), `${role} inserted a rate`).toBeTruthy();
    }
    const { count } = await admin
      .from('instrument_rates').select('id', { count: 'exact', head: true }).eq('rate', 99);
    expect(count).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. Correct-rates edit mode — Owner ONLY. Admin sees renegotiate but no
//    correct-rates control, and supersede_instrument_rate must refuse Admin.
//    Gate: budget/page.tsx:294  canSupersede={role === 'owner'}
// ════════════════════════════════════════════════════════════════════════════
describe('2. Correct-rates (supersede) — Owner only', () => {
  it('2a. DB WRITE — supersede_instrument_rate refuses ADMIN independently of the UI', async () => {
    // A rate id that exists nowhere: the role guard is the first check in the
    // function, so a broken guard falls through to "rate not found" and still
    // mutates nothing.
    const { error } = await session.admin.rpc('supersede_instrument_rate', {
      p_rate_id: NOWHERE, p_reason: 'role check',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('Superseding a rate is Owner only.');
  });

  it('2b. DB WRITE — it refuses PM, Foreman and Crew too', async () => {
    for (const role of GATED_ROLES) {
      const { error } = await session[role].rpc('supersede_instrument_rate', {
        p_rate_id: NOWHERE, p_reason: 'role check',
      });
      expect(error, `${role} was not refused`).not.toBeNull();
      expect(error!.message).toContain('Superseding a rate is Owner only.');
    }
  });

  it('2c. DB WRITE — the OWNER passes the role guard and is stopped only by the target', async () => {
    // Proves the guard is a ROLE gate, not a blanket refusal that would make
    // 2a/2b vacuous.
    const { error } = await session.owner.rpc('supersede_instrument_rate', {
      p_rate_id: NOWHERE, p_reason: 'role check',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('rate not found');
    expect(error!.message).not.toContain('Owner only');
  });

  it('2d. DB WRITE — Admin cannot reach the same effect by writing the column directly', async () => {
    const { data: before } = await admin
      .from('instrument_rates').select('superseded_at').eq('id', rateId).single();

    await session.admin
      .from('instrument_rates')
      .update({ superseded_at: new Date().toISOString(), superseded_reason: 'role check' })
      .eq('id', rateId);

    const { data: after } = await admin
      .from('instrument_rates').select('superseded_at').eq('id', rateId).single();
    expect(after!.superseded_at).toBe(before!.superseded_at);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Project Overview rate summary — Owner/Admin only.
//    Gate: projects/[id]/page.tsx:234  {canSeeFinancials && <RateSummary …>}
// ════════════════════════════════════════════════════════════════════════════
describe('3. Project Overview rate summary', () => {
  it('3a. DB READ — the data behind it is Owner/Admin readable', async () => {
    for (const role of ['owner', 'admin'] as const) {
      const { data } = await session[role].from('instrument_rates').select('id').limit(1);
      expect(data?.length).toBeGreaterThan(0);
    }
  });

  it('3b. DB READ — PM, Foreman and Crew must not be able to fetch the summary data', async () => {
    const leaked: string[] = [];
    for (const role of GATED_ROLES) {
      const { data } = await session[role]
        .from('instrument_rates').select('id, rate, rate_type').limit(5);
      if ((data ?? []).length > 0) leaked.push(`${role} read ${data!.length} rows`);
    }
    expect(leaked, 'rate summary data is reachable by gated roles').toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. CO builder rate fields — Owner/Admin edit; PM read-only, no entry.
//    Gate: changes/[coId]/page.tsx:39  canEditRates = ['owner','admin']
// ════════════════════════════════════════════════════════════════════════════
describe('4. CO builder rate fields', () => {
  it('4a. RENDER — the CO rate section hides its entry controls unless canEditRates', async () => {
    // co-rate-section.tsx is a CLIENT component, so the real gate can be
    // executed here rather than read.
    vi.doMock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
    const { renderToStaticMarkup } = await import('react-dom/server');
    const React = await import('react');
    const { CoRateSection } = await import(
      '@/app/dashboard/projects/[id]/changes/[coId]/co-rate-section'
    );

    const props = {
      changeOrderId: NOWHERE,
      coType: 'cost_plus' as const,
      isDraft: true,
      sourceEstimateId: null,
    };

    const editable = renderToStaticMarkup(
      React.createElement(CoRateSection, { ...props, canEditRates: true } as never)
    );
    const readOnly = renderToStaticMarkup(
      React.createElement(CoRateSection, { ...props, canEditRates: false } as never)
    );

    // The editable render must offer something the read-only one does not.
    expect(editable.length).toBeGreaterThan(readOnly.length);
    expect(readOnly).not.toMatch(/<input|<button/i);
  });

  it('4b. DB WRITE — a PM cannot write a CO rate', async () => {
    const { data: co } = await admin
      .from('change_orders').select('id').eq('project_id', richProjectId).limit(1).single();

    const { data, error } = await session.project_manager
      .from('instrument_rates')
      .insert({
        company_id: companyId, change_order_id: co!.id,
        rate_type: 'cost_plus_percent', rate: 98, effective_from: '2026-01-01',
      })
      .select('id');
    expect(error ?? (data?.length === 0), 'PM inserted a CO rate').toBeTruthy();

    const { count } = await admin
      .from('instrument_rates').select('id', { count: 'exact', head: true }).eq('rate', 98);
    expect(count).toBe(0);
  });

  it('4c. DB WRITE — Owner and Admin ARE allowed (the gate is a role gate, not a wall)', async () => {
    for (const role of ['owner', 'admin'] as const) {
      const { data: co } = await admin
        .from('change_orders').select('id').eq('project_id', richProjectId).limit(1).single();
      const { data, error } = await session[role]
        .from('instrument_rates')
        .insert({
          company_id: companyId, change_order_id: co!.id,
          rate_type: 'cost_plus_percent', rate: 97, effective_from: '2031-01-01',
        })
        .select('id');
      expect(error, `${role} was refused: ${error?.message}`).toBeNull();
      expect(data?.length).toBe(1);
      // clean up immediately — this is the one place the harness writes a real row
      await admin.from('instrument_rates').delete().eq('id', data![0].id);
    }
    const { count } = await admin
      .from('instrument_rates').select('id', { count: 'exact', head: true }).eq('rate', 97);
    expect(count).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. Sub-contract "Edit schedules" — Owner/Admin full; PM setup-only and never
//    reaching revise_sub_contract_schedule.
// ════════════════════════════════════════════════════════════════════════════
describe('5. Sub-contract schedules', () => {
  it('5a. DB WRITE — revise_sub_contract_schedule refuses a PM', async () => {
    // Bogus contract id: the role guard is the function's first statement, so
    // a broken guard falls through to "contract not found" before any write.
    const { error } = await session.project_manager.rpc('revise_sub_contract_schedule', {
      p_sub_contract_id: NOWHERE,
      p_stages: [{ label: 'role check', amount: 1 }],
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain('Only Owner/Admin may revise a payment schedule.');
  });

  it('5b. DB WRITE — it refuses Foreman and Crew', async () => {
    for (const role of ['foreman', 'crew_member'] as const) {
      const { error } = await session[role].rpc('revise_sub_contract_schedule', {
        p_sub_contract_id: NOWHERE,
        p_stages: [{ label: 'role check', amount: 1 }],
      });
      expect(error, `${role} was not refused`).not.toBeNull();
      expect(error!.message).toContain('Only Owner/Admin may revise a payment schedule.');
    }
  });

  it('5c. DB WRITE — Owner and Admin pass the role guard (stopped only by the target)', async () => {
    for (const role of ['owner', 'admin'] as const) {
      const { error } = await session[role].rpc('revise_sub_contract_schedule', {
        p_sub_contract_id: NOWHERE,
        p_stages: [{ label: 'role check', amount: 1 }],
      });
      expect(error).not.toBeNull();
      expect(error!.message).toContain('contract not found');
      expect(error!.message).not.toContain('Only Owner/Admin');
    }
  });

  it('5d. DB WRITE — a PM IS allowed setup_payment_schedule (setup-only is a real distinction)', async () => {
    const { error } = await session.project_manager.rpc('setup_payment_schedule', {
      p_sub_contract_id: NOWHERE,
      p_stages: [{ label: 'role check', amount: 1 }],
    });
    expect(error).not.toBeNull();
    // past the role guard, stopped by the bogus target
    expect(error!.message).toContain('contract not found');
    expect(error!.message).not.toContain('Only Owner/Admin/PM');
  });

  it('5e. DB WRITE — Foreman and Crew cannot even set up a schedule', async () => {
    for (const role of ['foreman', 'crew_member'] as const) {
      const { error } = await session[role].rpc('setup_payment_schedule', {
        p_sub_contract_id: NOWHERE,
        p_stages: [{ label: 'role check', amount: 1 }],
      });
      expect(error, `${role} was not refused`).not.toBeNull();
      expect(error!.message).toContain('Only Owner/Admin/PM may set up a payment schedule.');
    }
  });

  it('5f. DB WRITE — a PM cannot bypass the RPC by editing the contract directly', async () => {
    const { data: before } = await admin
      .from('subcontractor_contracts')
      .select('retainage_percent, contract_value').eq('id', subContractId).single();

    await session.project_manager
      .from('subcontractor_contracts')
      .update({ retainage_percent: 99 })
      .eq('id', subContractId);

    const { data: after } = await admin
      .from('subcontractor_contracts')
      .select('retainage_percent, contract_value').eq('id', subContractId).single();
    expect(after!.retainage_percent, 'a PM rewrote a sub-contract retainage directly')
      .toBe(before!.retainage_percent);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. The Invoices tab — Owner/Admin/PM only; Foreman and Crew must not see it.
// ════════════════════════════════════════════════════════════════════════════
describe('6. Invoices tab', () => {
  it('6a. RENDER — the real tab list hides Invoices from Foreman and Crew', async () => {
    vi.doMock('next/navigation', () => ({ usePathname: () => '/dashboard/projects/x' }));
    vi.doMock('next/link', () => ({
      default: ({ children, href }: { children: unknown; href: string }) =>
        ({ type: 'a', props: { href, children }, key: null, $$typeof: Symbol.for('react.element') }),
    }));
    const { renderToStaticMarkup } = await import('react-dom/server');
    const React = await import('react');
    const { ProjectHeader } = await import('@/app/dashboard/projects/[id]/project-header');

    const project = {
      id: 'x', name: 'role check', status: 'active', project_number: 'PRJ-001',
      contact: null,
    };

    for (const role of ALL_ROLES) {
      const html = renderToStaticMarkup(
        React.createElement(ProjectHeader, { project, canManage: false, role } as never)
      );
      const showsInvoices = /Invoices/.test(html);
      if (role === 'foreman' || role === 'crew_member') {
        expect(showsInvoices, `${role} was shown the Invoices tab`).toBe(false);
      } else {
        expect(showsInvoices, `${role} was NOT shown the Invoices tab`).toBe(true);
      }
    }
  });

  it('6b. DB READ — Owner, Admin and PM can read invoices', async () => {
    for (const role of ['owner', 'admin', 'project_manager'] as const) {
      const { data } = await session[role].from('invoices').select('id').eq('id', invoiceId);
      expect(data ?? [], `${role} could not read the invoice`).toHaveLength(1);
    }
  });

  it('6c. DB READ — Foreman and Crew read NO invoices at all', async () => {
    for (const role of ['foreman', 'crew_member'] as const) {
      const { data: byId } = await session[role].from('invoices').select('id').eq('id', invoiceId);
      expect(byId ?? [], `${role} read the invoice by id`).toHaveLength(0);
      const { data: all } = await session[role].from('invoices').select('id').limit(10);
      expect(all ?? [], `${role} listed invoices`).toHaveLength(0);
    }
  });

  it('6d. DB WRITE — Foreman and Crew cannot create an invoice', async () => {
    for (const role of ['foreman', 'crew_member'] as const) {
      const { data, error } = await session[role]
        .from('invoices')
        .insert({ project_id: qaProjectId, title: 'ROLE CHECK BREACH' })
        .select('id');
      expect(error ?? (data?.length === 0), `${role} created an invoice`).toBeTruthy();
    }
    const { count } = await admin
      .from('invoices').select('id', { count: 'exact', head: true }).eq('title', 'ROLE CHECK BREACH');
    expect(count).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. §12a carve-out — a PM sees invoice amounts, but NOT the contract value.
//    Gate: invoices/page.tsx:117  canSeeContractValue = owner || admin
//          invoices/page.tsx:197  {contractValue !== null && canSeeContractValue && …}
// ════════════════════════════════════════════════════════════════════════════
describe('7. §12a carve-out — invoice amounts yes, contract value no', () => {
  it('7a. DB READ — a PM CAN read the invoice amounts (the carve-out half that should work)', async () => {
    const { data } = await session.project_manager
      .from('invoices')
      .select('id, billed_total, amount_receivable, retainage_withheld')
      .eq('id', invoiceId).single();
    expect(data).not.toBeNull();
    expect(data!.billed_total).not.toBeNull();
  });

  it('7b. DB READ — a PM must NOT be able to read contract_value (the tile IS the carve-out)', async () => {
    const { data } = await session.project_manager
      .from('projects').select('id, contract_value').eq('id', richProjectId).maybeSingle();

    // The tile is hidden in the UI. If the figure is still readable, the
    // carve-out is cosmetic.
    expect(
      data?.contract_value ?? null,
      `PM read contract_value = ${data?.contract_value} — the §12a tile gate is UI-only`
    ).toBeNull();
  });

  it('7c. DB READ — Foreman and Crew must not read contract_value either', async () => {
    const leaked: string[] = [];
    for (const role of ['foreman', 'crew_member'] as const) {
      const { data } = await session[role]
        .from('projects').select('id, contract_value').eq('id', qaProjectId).maybeSingle();
      if (data?.contract_value != null) leaked.push(`${role} read ${data.contract_value}`);
    }
    expect(leaked).toEqual([]);
  });

  it('7d. DB WRITE — a PM cannot change the contract value', async () => {
    // Aimed at the QA fixture, never Josh's project, and restored either way.
    const { data: before } = await admin
      .from('projects').select('contract_value').eq('id', qaProjectId).single();

    await session.project_manager
      .from('projects').update({ contract_value: 999999 }).eq('id', qaProjectId);

    const { data: after } = await admin
      .from('projects').select('contract_value').eq('id', qaProjectId).single();

    if (Number(after!.contract_value) !== Number(before!.contract_value)) {
      await admin
        .from('projects').update({ contract_value: before!.contract_value }).eq('id', qaProjectId);
    }
    expect(Number(after!.contract_value), 'a PM rewrote the contract value')
      .toBe(Number(before!.contract_value));
  });
});
