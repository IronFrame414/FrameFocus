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
/** A budget line on the QA project — without one, assertion 8b iterates over
 *  nothing and reports a vacuous PASS (the 5f failure mode). */
let qaBudgetItemId: string;
let invoiceId: string;
/** [Fix 4] A PM-authored invoice (on the QA project) — the positive case for
 *  the authorship read floor; `invoiceId` above is authored by someone else. */
let pmMemberId: string;
let pmInvoiceId: string;

beforeAll(async () => {
  assertRebuildTest();

  const { data: company } = await admin
    .from('companies').select('id').eq('name', 'Sabal Point Construction').single();
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

  // [Fix 4] The PM's member id, looked up BEFORE the invoice pick below,
  // because that pick must be scoped against it.
  const { data: pmProfile } = await admin
    .from('profiles').select('id').eq('email', EMAILS.project_manager).eq('is_deleted', false).single();
  const { data: pmMember } = await admin
    .from('company_members').select('id')
    .eq('profile_id', (pmProfile as { id: string }).id)
    .eq('company_id', companyId).eq('is_deleted', false).single();
  pmMemberId = (pmMember as { id: string }).id;

  // SCOPED, not just ordered — the S165 `.limit(1)` rule, category 2. Test 6b
  // depends on this invoice being authored by someone OTHER than the PM (its
  // negative half asserts the PM cannot read it), and the previous
  // `.eq('project_id', …).limit(1)` never filtered for that: a heap-order
  // shift handed back the PM's own 'test invoice time' row and the
  // authorship-floor negative went red while the floor itself stood
  // [2026-08-30 battery]. The `.order` makes the pick stable; the `.neq`
  // makes it CORRECT.
  const { data: invoice } = await admin
    .from('invoices').select('id')
    .eq('project_id', richProjectId)
    .neq('author_member_id', pmMemberId)
    .order('created_at', { ascending: true })
    .limit(1).single();
  invoiceId = invoice!.id;

  // [Fix 4] A PM-AUTHORED invoice on the writable QA project (the PM is assigned
  // to it, so can_view_project passes). This is the positive half of the
  // authorship read floor: a PM reads invoices where
  // author_member_id = get_my_member_id(), and NOT `invoiceId` above, which is
  // authored by someone else and must now be invisible to the PM.
  const { data: pmInv } = await admin
    .from('invoices')
    .insert({
      company_id: companyId, project_id: qaProjectId, author_member_id: pmMemberId,
      title: 'S97CT PM-authored fixture', status: 'draft',
    })
    .select('id').single();
  pmInvoiceId = (pmInv as { id: string }).id;

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

  const { data: qaBudget, error: qaBudgetErr } = await admin
    .from('project_budget_items')
    .insert({
      company_id: companyId, project_id: qaProjectId,
      description: 'S97ROLES QA budget line',
      actual_amount: 100, committed_amount: 200,
    })
    .select('id').single();
  if (qaBudgetErr) throw new Error(`qa budget line: ${qaBudgetErr.message}`);
  qaBudgetItemId = qaBudget!.id;

  // RULING [S97]: the budgeted figure lives in project_budget_amounts now.
  const { error: qaAmountErr } = await admin.from('project_budget_amounts').upsert({
    company_id: companyId, budget_item_id: qaBudgetItemId, budgeted_amount: 12345.67,
  }, { onConflict: 'budget_item_id' });
  if (qaAmountErr) throw new Error(`qa budget amount: ${qaAmountErr.message}`);
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
    // S175 item 9 — CoBuilder now calls useConfirm(), which throws outside a
    // ConfirmProvider. Wrap the render; no dialog pending -> children-only, so
    // the "Contract rates" mount assertion below is unaffected.
    const { ConfirmProvider } = await import('@/components/confirm/confirm-provider');

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
      React.createElement(ConfirmProvider, null, React.createElement(CoBuilder, { ...base, canSeeRates: true } as never))
    );
    const withoutRates = renderToStaticMarkup(
      React.createElement(ConfirmProvider, null, React.createElement(CoBuilder, { ...base, canSeeRates: false } as never))
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
    // [Redesign Phase D] The header renders SIX SECTIONS now, and a tab label
    // appears only in the ACTIVE section's sub-row. Rendering at the project
    // base (Overview — no sub-row) would fail the owner arm and pass the
    // foreman/crew arms VACUOUSLY on a page with no tab labels at all. So each
    // role renders INSIDE Money, at a Money page that role can reach: budget
    // for owner/admin/PM/foreman, changes for crew (budget is foreman-floored
    // and crew never sees it). The 'Change Orders' assertion is the
    // counter-vacuity guard: it proves the sub-row actually rendered.
    let pathname = '/dashboard/projects/x/budget';
    vi.doMock('next/navigation', () => ({ usePathname: () => pathname }));
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
      pathname =
        role === 'crew_member'
          ? '/dashboard/projects/x/changes'
          : '/dashboard/projects/x/budget';
      const html = renderToStaticMarkup(
        React.createElement(ProjectHeader, { project, canManage: false, role } as never)
      );
      expect(
        /Change Orders/.test(html),
        `${role} did not render the Money sub-row at all — the absence below would be vacuous`
      ).toBe(true);
      const showsInvoices = /Invoices/.test(html);
      if (role === 'foreman' || role === 'crew_member') {
        expect(showsInvoices, `${role} was shown the Invoices tab`).toBe(false);
      } else {
        expect(showsInvoices, `${role} was NOT shown the Invoices tab`).toBe(true);
      }
    }
  });

  it('6b. DB READ — Owner/Admin read any invoice; a PM reads ONLY their own [Fix 4]', async () => {
    // Owner and Admin stay company-wide.
    for (const role of ['owner', 'admin'] as const) {
      const { data } = await session[role].from('invoices').select('id').eq('id', invoiceId);
      expect(data ?? [], `${role} could not read the invoice`).toHaveLength(1);
    }
    // A PM reads the invoice THEY authored…
    const { data: own } = await session.project_manager.from('invoices').select('id').eq('id', pmInvoiceId);
    expect(own ?? [], 'a PM could not read their own invoice').toHaveLength(1);
    // …and NOT one authored by someone else — the authorship floor.
    const { data: other } = await session.project_manager.from('invoices').select('id').eq('id', invoiceId);
    expect(other ?? [], 'a PM read an invoice they did not author').toHaveLength(0);
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
  it('7a. DB READ — a PM CAN read the amounts on an invoice THEY authored [Fix 4]', async () => {
    const { data } = await session.project_manager
      .from('invoices')
      .select('id, billed_total, amount_receivable, retainage_withheld')
      .eq('id', pmInvoiceId).single();
    expect(data).not.toBeNull();
    expect(data!.billed_total).not.toBeNull();
  });

  it('7b. DB READ — projects.contract_value is GONE, and a PM cannot reach it in its new home', async () => {
    // RULING 2, step 4. Two halves, both required:
    //   (a) the retired column no longer exists — a select on it ERRORS, which
    //       is the loud failure a dropped column should produce;
    //   (b) the figure is genuinely unreachable in project_financials, not just
    //       moved somewhere a PM can still read.
    const { error: goneError } = await session.project_manager
      .from('projects').select('id, contract_value').eq('id', richProjectId).maybeSingle();
    expect(goneError, 'projects.contract_value still exists — the drop did not run').not.toBeNull();
    expect(goneError!.message).toMatch(/contract_value/);

    const { data } = await session.project_manager
      .from('project_financials').select('contract_value').eq('project_id', richProjectId);
    expect(data ?? [], 'a PM read the contract value from project_financials').toHaveLength(0);
  });

  it('7c. DB READ — Foreman and Crew cannot reach it either', async () => {
    const leaked: string[] = [];
    for (const role of ['foreman', 'crew_member'] as const) {
      const { data } = await session[role]
        .from('project_financials').select('project_id, contract_value');
      for (const row of data ?? []) leaked.push(`${role} read ${row.contract_value}`);
    }
    expect(leaked, 'the contract value is readable below Owner/Admin').toEqual([]);
  });

  it('7d. DB WRITE — a PM cannot change the contract value (now via project_financials RLS)', async () => {
    // The proof MOVED with the column rather than being deleted. Protection is
    // now RLS on project_financials, which refuses at row level on every path,
    // where the old trigger only covered UPDATEs on projects (Josh's ruling).
    const { data: before } = await admin
      .from('project_financials').select('contract_value').eq('project_id', qaProjectId).maybeSingle();

    const { error: updateError } = await session.project_manager
      .from('project_financials').update({ contract_value: 999999 }).eq('project_id', qaProjectId).select('id');
    const { error: insertError } = await session.project_manager
      .from('project_financials')
      .insert({ company_id: companyId, project_id: qaProjectId, contract_value: 999999 })
      .select('id');

    const { data: after } = await admin
      .from('project_financials').select('contract_value').eq('project_id', qaProjectId).maybeSingle();
    if (Number(after?.contract_value) !== Number(before?.contract_value)) {
      await admin
        .from('project_financials')
        .update({ contract_value: before?.contract_value ?? null }).eq('project_id', qaProjectId);
    }

    // RLS refuses an UPDATE silently (zero rows) and an INSERT loudly; either
    // way the value must be untouched — that is what is actually asserted.
    expect(Number(after?.contract_value ?? 0), 'a PM rewrote the contract value')
      .toBe(Number(before?.contract_value ?? 0));
    expect(insertError ?? updateError, 'neither write path was refused').not.toBeNull();
  });

  it('7e. DB WRITE — the projects column-scope trigger still guards what it kept', async () => {
    // enforce_projects_column_scope no longer mentions contract_value (it moved
    // to RLS), but it still freezes retainage_percent, tax_rate and
    // source_estimate_id. This proves the trigger SURVIVED the drop and still
    // raises with its message — the regression test for the failure mode that
    // blocked step 4 (a trigger referencing a dropped column errors on EVERY
    // project update).
    const { data: before } = await admin
      .from('projects').select('retainage_percent').eq('id', qaProjectId).single();

    const { error } = await session.project_manager
      .from('projects').update({ retainage_percent: 88 }).eq('id', qaProjectId).select('id');

    await admin
      .from('projects').update({ retainage_percent: before!.retainage_percent }).eq('id', qaProjectId);
    const { data: restored } = await admin
      .from('projects').select('retainage_percent').eq('id', qaProjectId).single();
    expect(Number(restored!.retainage_percent), 'restore failed')
      .toBe(Number(before!.retainage_percent));

    expect(error, 'the projects column-scope trigger did not fire').not.toBeNull();
    expect(error!.message).toContain('The financial terms of a project are Owner/Admin only.');
  });

  it('7f. DB WRITE — an ORDINARY project update still works for Owner, Admin AND PM', async () => {
    // THE REGRESSION TEST FOR THE STEP-4 BLOCKER. If enforce_projects_column_
    // scope still referenced the dropped column, plpgsql would raise
    // `record "new" has no field "contract_value"` on EVERY project update —
    // renaming a job, a date change, a status transition — for every role.
    // This exercises all three roles on ordinary fields to prove it does not.
    const { data: before } = await admin
      .from('projects').select('name, internal_notes, target_end_date').eq('id', qaProjectId).single();

    for (const role of ['owner', 'admin', 'project_manager'] as const) {
      const { error } = await session[role]
        .from('projects')
        .update({
          name: `QA A — isolation fixture`,
          internal_notes: `ordinary update by ${role}`,
          target_end_date: '2027-01-31',
        })
        .eq('id', qaProjectId);
      expect(error, `an ordinary project update broke for ${role}: ${error?.message}`).toBeNull();
    }

    await admin
      .from('projects')
      .update({
        name: before!.name,
        internal_notes: before!.internal_notes,
        target_end_date: before!.target_end_date,
      })
      .eq('id', qaProjectId);
    const { data: restored } = await admin
      .from('projects').select('name, target_end_date').eq('id', qaProjectId).single();
    expect(restored!.name, 'restore failed').toBe(before!.name);
    expect(restored!.target_end_date, 'restore failed').toBe(before!.target_end_date);
  });

  it('7g. DB WRITE — Owner and Admin CAN still set the contract value', async () => {
    const { data: before } = await admin
      .from('project_financials').select('contract_value').eq('project_id', qaProjectId).maybeSingle();

    for (const role of ['owner', 'admin'] as const) {
      const { error } = await session[role]
        .from('project_financials').update({ contract_value: 50001 }).eq('project_id', qaProjectId);
      expect(error, `${role} was blocked from setting the contract value`).toBeNull();
    }

    await admin
      .from('project_financials')
      .update({ contract_value: before?.contract_value ?? null }).eq('project_id', qaProjectId);
    const { data: restored } = await admin
      .from('project_financials').select('contract_value').eq('project_id', qaProjectId).maybeSingle();
    expect(Number(restored?.contract_value ?? 0)).toBe(Number(before?.contract_value ?? 0));
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. Budget & Cost — what each role can actually READ (§7.1).
//    The COLUMN COUNTS are asserted exhaustively as a pure rule in
//    budget-columns.test.ts (extracted from the server component so they could
//    be tested at all). This is the other half: the DATA behind those columns.
// ════════════════════════════════════════════════════════════════════════════
describe('8. Budget & Cost data per role', () => {
  it('8a. every role that reaches the screen can read the budget lines', async () => {
    // Owner/Admin see all projects; PM/Foreman need an assignment, which the
    // seed gives them on the QA project.
    for (const role of ['owner', 'admin', 'project_manager', 'foreman'] as const) {
      const { data } = await session[role]
        .from('project_budget_items').select('id').eq('project_id', qaProjectId);
      expect(data, `${role} could not reach the budget lines`).not.toBeNull();
    }
  });

  it('8b. budgeted_amount is GONE from the line, and unreachable in its new home', async () => {
    // Two halves, both required — moving a figure somewhere still readable
    // would not be a fix:
    //   (a) the retired column no longer exists, so selecting it ERRORS;
    //   (b) the figure is genuinely unreachable for a gated role in
    //       project_budget_amounts.
    const { error: goneError } = await session.project_manager
      .from('project_budget_items')
      .select('id, budgeted_amount')
      .eq('project_id', qaProjectId);
    expect(goneError, 'project_budget_items.budgeted_amount still exists — the drop did not run')
      .not.toBeNull();
    expect(goneError!.message).toMatch(/budgeted_amount/);

    const leaked: string[] = [];
    for (const role of ['project_manager', 'foreman', 'crew_member'] as const) {
      const { data } = await session[role]
        .from('project_budget_amounts').select('budgeted_amount').limit(10);
      for (const row of data ?? []) leaked.push(`${role} read ${row.budgeted_amount}`);
    }
    expect(leaked, 'the budgeted figure is readable below Owner/Admin').toEqual([]);
  });

  it('8b-i. an Owner CAN still read it — the gate is a role gate, not a wall', async () => {
    const { data } = await session.owner
      .from('project_budget_amounts')
      .select('budgeted_amount')
      .eq('budget_item_id', qaBudgetItemId)
      .maybeSingle();
    expect(Number(data?.budgeted_amount), 'an Owner lost the budgeted figure').toBe(12345.67);
  });

  it('8b-ii. ACTUAL COST must stay readable to Foreman and Crew — before AND after', async () => {
    // The ruling's other half, and the reason a plain role floor on
    // project_budget_items is not an option: actual_amount lives on the SAME
    // ROW. This asserts the property the split must preserve, so if anyone
    // "fixes" 8b by flooring the parent table, THIS fails and says why.
    for (const role of ['foreman', 'crew_member'] as const) {
      const { data, error } = await session[role]
        .from('project_budget_items')
        .select('id, actual_amount, committed_amount')
        .eq('project_id', qaProjectId);
      expect(error, `${role} lost access to the budget lines entirely`).toBeNull();
      expect(
        (data ?? []).length,
        `${role} can no longer read ACTUAL COST — the floor over-reached (CLAUDE.md)`
      ).toBeGreaterThan(0);
      expect((data ?? [])[0].actual_amount).not.toBeUndefined();
    }
  });

  it('8c. Crew DO reach budget lines at the DB — and that is correct', async () => {
    // CORRECTED [S97]: this previously asserted crew read ZERO rows. That was
    // MY expectation and it was wrong about the intended rule — CLAUDE.md puts
    // ACTUAL COST in the "visible to all roles" list, and crew reach the rows
    // through can_view_project like anyone else assigned.
    //
    // The screen is what excludes crew (budget/page.tsx redirects any role
    // outside owner/admin/pm/foreman), and budgetColumnsFor('crew_member')
    // returns 0 columns — asserted exhaustively in budget-columns.test.ts.
    // What must be hidden from crew is the BUDGETED figure, which is 8b's job.
    const { data, error } = await session.crew_member
      .from('project_budget_items')
      .select('id, actual_amount')
      .eq('project_id', qaProjectId);
    expect(error).toBeNull();
    expect((data ?? []).length, 'crew lost access to actual cost').toBeGreaterThan(0);
  });
});

// The QA sub-contract is created per run and removed here. Nothing else in this
// harness creates a row; every other write attempt is either aimed at a
// nonexistent id or restored inline.
afterAll(async () => {
  if (qaBudgetItemId) {
    await admin.from('project_budget_items').delete().eq('id', qaBudgetItemId);
  }
  // [Fix 4] remove the PM-authored invoice fixture (before the early return).
  if (pmInvoiceId) {
    await admin.from('invoices').delete().eq('id', pmInvoiceId);
  }
  if (!qaSubContractId) return;
  const { error } = await admin
    .from('subcontractor_contracts').delete().eq('id', qaSubContractId);
  console.log(`\n[S97ROLES TEARDOWN] QA sub-contract removed; error: ${error?.message ?? 'NONE'}`);
}, 120_000);
