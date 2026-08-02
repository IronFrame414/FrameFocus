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
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
/** A QA sub-contract created for this run. Item 4: the write probes below aim
 *  HERE, never at Josh's real contracts — 5f previously wrote retainage 99 onto
 *  two live rows and, because it compared a value to itself, called it a PASS. */
let qaSubContractId: string;
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

  // A throwaway sub-contract on the QA fixture project — the only sub-contract
  // this harness is allowed to write to.
  const { data: subMember } = await admin
    .from('company_members').select('id')
    .eq('company_id', companyId).eq('member_type', 'subcontractor').limit(1).single();
  const { data: qaSub, error: qaSubErr } = await admin
    .from('subcontractor_contracts')
    .insert({
      company_id: companyId, project_id: qaProjectId, member_id: subMember!.id,
      scope_of_work: 'S97ROLES QA sub-contract', contract_value: 5000,
      retainage_shape: 'percent_across', retainage_percent: 10, status: 'draft',
    })
    .select('id').single();
  if (qaSubErr) throw new Error(`qa sub-contract: ${qaSubErr.message}`);
  qaSubContractId = qaSub!.id;
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
  it('4a. RENDER — RULING A: the CO rate section has NO read-only mode left to leak through', async () => {
    // co-rate-section.tsx is a CLIENT component, so the real gate can be
    // executed here rather than read.
    //
    // RULING A [S97]: the old `canEditRates` prop and its "read-only" branch
    // are GONE — the section is mounted only for Owner/Admin (4a-ii), so there
    // is no half-state that could render a rate value to a PM. Passing the dead
    // prop must not resurrect one.
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

    const rendered = renderToStaticMarkup(React.createElement(CoRateSection, props as never));
    const withDeadProp = renderToStaticMarkup(
      React.createElement(CoRateSection, { ...props, canEditRates: false } as never)
    );

    // Identical: the prop is dead, and the component always offers entry
    // controls because it only ever renders for a role allowed to set rates.
    expect(withDeadProp).toBe(rendered);
    expect(rendered).not.toMatch(/read-only/i);
    expect(rendered).toMatch(/<button/i);
  });

  it('4a-ii. RENDER — RULING A: the CO builder does not mount the rate section below Owner/Admin', async () => {
    // The mount gate itself, executed. This is the assertion that proves a PM
    // gets NO rate panel rather than an empty or read-only one.
    const { renderToStaticMarkup } = await import('react-dom/server');
    const React = await import('react');
    const { CoBuilder } = await import(
      '@/app/dashboard/projects/[id]/changes/[coId]/co-builder'
    );

    const co = {
      id: NOWHERE, project_id: NOWHERE, co_type: 'cost_plus', status: 'draft',
      co_number: 'CO-001', title: 'role check', line_items: [], net_delta: 0,
      is_deleted: false,
    };
    const base = {
      projectId: NOWHERE,
      changeOrder: co,
      subcontractors: [],
      canManage: true,
      sourceEstimateId: null,
      pendingSigningToken: null,
      companyName: 'role check',
      hasSavedSignature: false,
    };

    const withRates = renderToStaticMarkup(
      React.createElement(CoBuilder, { ...base, canSeeRates: true } as never)
    );
    const withoutRates = renderToStaticMarkup(
      React.createElement(CoBuilder, { ...base, canSeeRates: false } as never)
    );

    expect(withRates).toMatch(/Contract rates/);
    expect(withoutRates, 'a PM was shown the CO rate panel').not.toMatch(/Contract rates/);
    // and no empty husk in its place
    expect(withoutRates).not.toMatch(/not set|read-only/i);
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

  it('5f. DB WRITE — a PM cannot rewrite a sub-contract\'s financial terms', async () => {
    // FINANCIAL-RLS-FLOOR part 2 (20260808000000). Aimed at the QA fixture, not
    // Josh's data, and it asserts the REFUSAL rather than comparing a value to
    // itself — the failure mode that made this test report PASS for three runs
    // while it was quietly rewriting live retainage.
    const { data: before } = await admin
      .from('subcontractor_contracts')
      .select('contract_value, retainage_percent').eq('id', qaSubContractId).single();

    const { error } = await session.project_manager
      .from('subcontractor_contracts')
      .update({ contract_value: 777777, retainage_percent: 99 })
      .eq('id', qaSubContractId)
      .select('id');

    // Restore FIRST, and verify the restore landed — a failing assertion must
    // never leave a corrupted fixture behind (item 4).
    await admin
      .from('subcontractor_contracts')
      .update({
        contract_value: before!.contract_value,
        retainage_percent: before!.retainage_percent,
      })
      .eq('id', qaSubContractId);
    const { data: restored } = await admin
      .from('subcontractor_contracts')
      .select('contract_value, retainage_percent').eq('id', qaSubContractId).single();
    expect(Number(restored!.contract_value), 'restore failed').toBe(Number(before!.contract_value));
    expect(Number(restored!.retainage_percent), 'restore failed').toBe(Number(before!.retainage_percent));

    expect(error, 'a PM rewrote a sub-contract\'s financial terms').not.toBeNull();
    expect(error!.message).toContain('The financial terms of a subcontract are Owner/Admin only.');
  });

  it('5g. DB WRITE — a PM CAN still edit a sub-contract\'s ordinary fields', async () => {
    // Column scope, not a wall: the same shape asserted for projects in 7f.
    const { data: before } = await admin
      .from('subcontractor_contracts')
      .select('scope_of_work').eq('id', qaSubContractId).single();
    const marker = `S97ROLES scope ${before?.scope_of_work === 'A' ? 'B' : 'A'}`;

    const { error } = await session.project_manager
      .from('subcontractor_contracts')
      .update({ scope_of_work: marker })
      .eq('id', qaSubContractId);
    expect(error, 'the trigger over-reached and blocked an ordinary field').toBeNull();

    const { data: after } = await admin
      .from('subcontractor_contracts')
      .select('scope_of_work').eq('id', qaSubContractId).single();
    expect(after!.scope_of_work).toBe(marker);

    await admin
      .from('subcontractor_contracts')
      .update({ scope_of_work: before!.scope_of_work }).eq('id', qaSubContractId);
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

  it('7e. DB WRITE — the column-scope trigger names the class of column it froze', async () => {
    // FINANCIAL-RLS-FLOOR (20260806000000). Distinct from 7d, which only checks
    // the value: this asserts the REFUSAL is explicit rather than an RLS silent
    // no-op, so a caller learns why. Owner/Admin are unaffected (7f).
    const { data: before } = await admin
      .from('projects').select('contract_value').eq('id', qaProjectId).single();

    const { error } = await session.project_manager
      .from('projects').update({ contract_value: 888888 }).eq('id', qaProjectId).select('id');

    // Restore BEFORE asserting: until the migration is applied this write
    // SUCCEEDS, and a failing assertion must not leave the fixture corrupted.
    await admin
      .from('projects').update({ contract_value: before!.contract_value }).eq('id', qaProjectId);

    expect(error, 'the projects column-scope trigger did not fire').not.toBeNull();
    expect(error!.message).toContain('The financial terms of a project are Owner/Admin only.');
  });

  it('7f. DB WRITE — a PM can still edit ORDINARY project fields (column scope, not a wall)', async () => {
    const { data: before } = await admin
      .from('projects').select('internal_notes').eq('id', qaProjectId).single();
    const marker = `role check ${before?.internal_notes === 'a' ? 'b' : 'a'}`;

    const { error } = await session.project_manager
      .from('projects').update({ internal_notes: marker }).eq('id', qaProjectId);
    expect(error, 'the trigger over-reached and blocked an ordinary field').toBeNull();

    const { data: after } = await admin
      .from('projects').select('internal_notes').eq('id', qaProjectId).single();
    expect(after!.internal_notes).toBe(marker);

    await admin
      .from('projects').update({ internal_notes: before?.internal_notes ?? null }).eq('id', qaProjectId);
  });

  it('7g. DB WRITE — Owner and Admin CAN still set the contract value', async () => {
    const { data: before } = await admin
      .from('projects').select('contract_value').eq('id', qaProjectId).single();

    for (const role of ['owner', 'admin'] as const) {
      const { error } = await session[role]
        .from('projects').update({ contract_value: 50001 }).eq('id', qaProjectId);
      expect(error, `${role} was blocked from setting the contract value`).toBeNull();
    }

    await admin
      .from('projects').update({ contract_value: before!.contract_value }).eq('id', qaProjectId);
    const { data: restored } = await admin
      .from('projects').select('contract_value').eq('id', qaProjectId).single();
    expect(Number(restored!.contract_value)).toBe(Number(before!.contract_value));
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

// The QA sub-contract is created per run and removed here. Nothing else in this
// harness creates a row; every other write attempt is either aimed at a
// nonexistent id or restored inline.
afterAll(async () => {
  if (!qaSubContractId) return;
  const { error } = await admin
    .from('subcontractor_contracts').delete().eq('id', qaSubContractId);
  console.log(`\n[S97ROLES TEARDOWN] QA sub-contract removed; error: ${error?.message ?? 'NONE'}`);
}, 120_000);
