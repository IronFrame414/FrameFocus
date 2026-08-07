import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// M6M — the [live] halves of A-55, A-58 and A-67b that Part C left open.
// ============================================================================
//
// S117 marked these three PARTIALLY SATISFIED and named exactly what was
// missing. This closes those, and each test is shaped around the failure the
// S117 note identified rather than around the happy path.
//
//   A-58  Part C asserted the PRE-TAP SURFACE — the notice renders, the button
//         is disabled — and never reached `verifyPunchItem`. **A build that
//         deleted the service-layer check and kept the disabled button passed
//         that test and defeated the rule.** So this file calls the function.
//   A-55  Part C proved net_delta CHANGED (0.00 → not 0.00). It did not prove
//         it MATCHES. So this asserts the identity net_delta = Σ line totals.
//   A-67b Part C read the list NAME rendered beside the item. So this reads
//         `punch_list_id`.
//
// ---------------------------------------------------------------------------
// WHAT IS STUBBED, AND WHY THAT DOES NOT WEAKEN A-58
// ---------------------------------------------------------------------------
// `vi.mock('@/lib/supabase-browser')` — the CLIENT FACTORY only, replaced with
// a real supabase-js client carrying a real user JWT. The precedent is
// `s97ct-7e-clicktest.live.ts`, which stubs the same factory for the same
// reason: the functions under test are browser-side services and there is no
// browser here.
//
// **The function is real; only its transport is substituted.** That matters
// for A-58 specifically, because the criterion is explicitly NOT about RLS —
// §4.11.10b records that RLS accepts a direct UPDATE setting
// `status='verified'` from any role (open item 7). The rule lives in
// TypeScript, so executing that TypeScript IS the test.

const state: { client: SupabaseClient | null } = { client: null };
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));

const { verifyPunchItem } = await import('@/lib/services/punch-client');

const OWNER = 'josh+test50@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const CREW = 'josh+crew@worthprop.com';

/** The m-sections project — where the Playwright suite writes. */
const SECTIONS_PROJECT = 'eaf0e25b-d60e-49c0-89b2-5612118d94b4';

/**
 * A-58's fixtures live on the ISOLATION fixture project, not the m-sections
 * one — TECH_DEBT #143: the foreman cannot reach m-sections, and A-58 needs a
 * Foreman+ completer who is not the verifier. On company A's fixture project
 * the seed assigns PM, foreman and crew, so the foreman is usable there.
 */
let isolationProjectId: string;
let isolationCompanyId: string;
let sectionsCompanyId: string;
let listId: string;
let itemId: string;
let foremanMemberId: string;

const FIXTURE_TITLE = 'QA A-58 separate-eyes fixture';

// ⚠️ EVERY ADMIN INSERT BELOW SETS company_id EXPLICITLY, AND MUST.
// Per-tenant tables carry `company_id DEFAULT get_my_company_id()` (CLAUDE.md's
// column-defaults checklist). Under the SERVICE ROLE there is no `auth.uid()`,
// so that default evaluates to NULL and the insert dies on the NOT NULL
// constraint. Cost a run to rediscover; stated so the next harness does not.

beforeAll(async () => {
  assertRebuildTest();

  const { data: project } = await admin
    .from('projects')
    .select('id, company_id')
    .eq('name', 'QA A — isolation fixture')
    .single();
  isolationProjectId = project!.id;
  isolationCompanyId = project!.company_id as string;

  const { data: sections } = await admin
    .from('projects')
    .select('company_id')
    .eq('id', SECTIONS_PROJECT)
    .single();
  sectionsCompanyId = sections!.company_id as string;

  const { data: foremanProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', FOREMAN)
    .single();
  const { data: foremanMember } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', foremanProfile!.id)
    .eq('is_deleted', false)
    .single();
  foremanMemberId = foremanMember!.id;

  // A list to hang the fixture item on.
  const { data: list, error: listError } = await admin
    .from('punch_lists')
    .insert({
      project_id: isolationProjectId,
      company_id: isolationCompanyId,
      name: FIXTURE_TITLE,
    })
    .select('id')
    .single();
  if (listError) throw new Error(`A-58 fixture list insert: ${listError.message}`);
  listId = list!.id;
});

afterAll(async () => {
  // Created here, removed here. Hard delete: these are harness fixtures, not
  // user data, and leaving them would drift M-3's punch counters for every
  // other suite that reads this project.
  if (itemId) await admin.from('punch_list_items').delete().eq('id', itemId);
  if (listId) await admin.from('punch_lists').delete().eq('id', listId);
});

// ===========================================================================
// A-58 — verifyPunchItem refuses the member who COMPLETED the item
// ===========================================================================
describe('A-58 — the separate-eyes rule, executed rather than displayed', () => {
  beforeAll(async () => {
    // A complete item, requiring verification, completed BY THE FOREMAN.
    const { data: item, error } = await admin
      .from('punch_list_items')
      .insert({
        punch_list_id: listId,
        project_id: isolationProjectId,
        company_id: isolationCompanyId,
        title: FIXTURE_TITLE,
        status: 'complete',
        requires_verification: true,
        requires_completion_photo: false,
        completed_by: foremanMemberId,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new Error(`A-58 fixture insert: ${error.message}`);
    itemId = item!.id;
  });

  it('REFUSES the foreman who completed it — the criterion itself', async () => {
    state.client = await sessionFor(FOREMAN);

    const result = await verifyPunchItem(
      {
        id: itemId,
        status: 'complete',
        requires_verification: true,
        completed_by: foremanMemberId,
      },
      'foreman'
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/completed an item cannot verify/i);

    // AND NOTHING WAS WRITTEN. A refusal that returns false after updating the
    // row would satisfy the assertion above and defeat the rule.
    const { data } = await admin
      .from('punch_list_items')
      .select('status, verified_by')
      .eq('id', itemId)
      .single();
    expect(data!.status).toBe('complete');
    expect(data!.verified_by).toBeNull();
  });

  it('REFUSES a crew member by ROLE, before the separate-eyes check', async () => {
    state.client = await sessionFor(CREW);

    const result = await verifyPunchItem(
      { id: itemId, status: 'complete', requires_verification: true, completed_by: foremanMemberId },
      'crew_member'
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/foreman and above/i);
  });

  it('ACCEPTS a different Foreman+ member — so the refusals are not vacuous', async () => {
    // ⚠️ THE PAIRED HALF. Without it, a `verifyPunchItem` that refused
    // everybody would pass both assertions above. Same discipline s113 uses
    // for D-57's absence assertions.
    state.client = await sessionFor(OWNER);

    const result = await verifyPunchItem(
      { id: itemId, status: 'complete', requires_verification: true, completed_by: foremanMemberId },
      'owner'
    );

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);

    const { data } = await admin
      .from('punch_list_items')
      .select('status, verified_by')
      .eq('id', itemId)
      .single();
    expect(data!.status).toBe('verified');
    expect(data!.verified_by).not.toBeNull();
    expect(data!.verified_by).not.toBe(foremanMemberId);
  });

  it('⚠️ RLS WOULD HAVE ALLOWED IT — the rule is TypeScript and nothing else', async () => {
    // Not a criterion; a standing demonstration that open item 7 is real, so a
    // reader does not mistake A-58 passing for a database guarantee.
    //
    // The crew member refused above by `verifyPunchItem` writes the SAME
    // transition straight through their own RLS-scoped client.
    const crew = await sessionFor(CREW);

    const { data: probe } = await admin
      .from('punch_list_items')
      .insert({
        punch_list_id: listId,
        project_id: isolationProjectId,
        company_id: isolationCompanyId,
        title: `${FIXTURE_TITLE} — RLS probe`,
        status: 'complete',
        requires_verification: true,
        requires_completion_photo: false,
      })
      .select('id')
      .single();

    const { error } = await crew
      .from('punch_list_items')
      .update({ status: 'verified' })
      .eq('id', probe!.id);

    // No error: RLS permits it. THIS IS THE POINT.
    expect(error).toBeNull();
    const { data: after } = await admin
      .from('punch_list_items')
      .select('status')
      .eq('id', probe!.id)
      .single();
    expect(after!.status).toBe('verified');

    await admin.from('punch_list_items').delete().eq('id', probe!.id);
  });
});

// ===========================================================================
// A-55 — net_delta MATCHES the sum of its line totals, not merely "changed"
// ===========================================================================
describe('A-55 — the persisted net_delta equals the persisted line totals', () => {
  it('holds for every change order M-32 created, and at least one exists', async () => {
    // Scoped to COs the mobile editor wrote (`e2e/m-writes.spec.ts` titles them
    // `E2E CO <stamp>` / `E2E Actions …` / `E2E Send …`). That is not a dodge:
    // A-55 is about "a CO created on M-32", and pre-existing seeded COs were
    // not created by it.
    const { data: cos, error } = await admin
      .from('change_orders')
      .select('id, co_number, title, net_delta')
      .eq('project_id', SECTIONS_PROJECT)
      .eq('is_deleted', false)
      .like('title', 'E2E %');
    if (error) throw new Error(`A-55 read: ${error.message}`);

    if (!cos || cos.length === 0) {
      throw new Error(
        'no M-32-created change orders found. Run the Playwright suite first: ' +
          'npx playwright test e2e/m-writes.spec.ts'
      );
    }

    let withLines = 0;
    for (const co of cos) {
      const { data: lines } = await admin
        .from('change_order_line_items')
        .select('total_price')
        .eq('change_order_id', co.id);

      const sum = (lines ?? []).reduce((acc, l) => acc + Number(l.total_price ?? 0), 0);
      if ((lines ?? []).length > 0) withLines++;

      // Rounded to cents on both sides: both are NUMERIC and the comparison is
      // about agreement, not float representation.
      expect(
        Math.round(Number(co.net_delta ?? 0) * 100),
        `${co.co_number} (${co.title}): net_delta ${co.net_delta} vs Σ line totals ${sum}`
      ).toBe(Math.round(sum * 100));
    }

    // ⚠️ THE ANTI-VACUOUS HALF. Every assertion above passes trivially on a set
    // of change orders that all have zero lines and a zero net_delta — which is
    // precisely the broken state A-55 was written to catch.
    expect(withLines, 'no M-32 change order carried line items — A-55 would be vacuous').toBeGreaterThan(0);
  });

  it('a change order carrying line rows has a NON-ZERO net_delta', async () => {
    // The S117 half, kept: "matches" and "is not 0" are different claims and a
    // build could satisfy the first with 0 = Σ(0).
    const { data: cos } = await admin
      .from('change_orders')
      .select('id, net_delta')
      .eq('project_id', SECTIONS_PROJECT)
      .eq('is_deleted', false)
      .like('title', 'E2E %');

    let sawPriced = false;
    for (const co of cos ?? []) {
      const { count } = await admin
        .from('change_order_line_rows')
        .select('id', { count: 'exact', head: true })
        .in(
          'line_item_id',
          ((
            await admin.from('change_order_line_items').select('id').eq('change_order_id', co.id)
          ).data ?? []).map((l) => l.id)
        );
      if ((count ?? 0) > 0) {
        expect(Number(co.net_delta ?? 0)).not.toBe(0);
        sawPriced = true;
      }
    }
    expect(sawPriced, 'no M-32 change order carried line ROWS').toBe(true);
  });
});

// ===========================================================================
// A-67b — the item's punch_list_id points at the list M-33 created
// ===========================================================================
describe('A-67b — read the column, not the label rendered beside it', () => {
  it('an M-33-created item points at the M-33-created list of the same stamp', async () => {
    // `e2e/m-writes.spec.ts` creates `E2E List <stamp>` inline and files
    // `E2E Item <stamp>` into it. The STAMPS MUST MATCH — that is what proves
    // the item landed in the list the author created rather than in some other
    // list that happened to exist.
    const { data: lists, error } = await admin
      .from('punch_lists')
      .select('id, name')
      .eq('project_id', SECTIONS_PROJECT)
      .eq('is_deleted', false)
      .like('name', 'E2E List %')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`A-67b list read: ${error.message}`);

    if (!lists || lists.length === 0) {
      throw new Error(
        'no M-33-created lists found. Run the Playwright suite first: ' +
          'npx playwright test e2e/m-writes.spec.ts'
      );
    }

    const newest = lists[0];
    const stamp = newest.name.replace('E2E List ', '').trim();

    const { data: items } = await admin
      .from('punch_list_items')
      .select('id, title, punch_list_id')
      .eq('project_id', SECTIONS_PROJECT)
      .eq('is_deleted', false)
      .eq('title', `E2E Item ${stamp}`);

    expect(items ?? [], `no item titled "E2E Item ${stamp}" for list "${newest.name}"`).toHaveLength(1);

    // THE ASSERTION THE S117 NOTE ASKED FOR: the COLUMN, read directly.
    expect(items![0].punch_list_id).toBe(newest.id);
  });

  it('an empty list left behind by a failed item insert is a LEGAL state', async () => {
    // A-67b: "A failed item insert leaves the new list behind, which is
    // accepted (D-60) and must not be 'fixed' with a cleanup." Asserted as the
    // absence of a cleanup: a list with no items survives, is not soft-deleted,
    // and stays readable.
    const { data: orphan, error: orphanError } = await admin
      .from('punch_lists')
      .insert({
        project_id: SECTIONS_PROJECT,
        company_id: sectionsCompanyId,
        name: 'QA A-67b orphan — empty is legal',
      })
      .select('id')
      .single();
    if (orphanError) throw new Error(`A-67b orphan insert: ${orphanError.message}`);

    const { count } = await admin
      .from('punch_list_items')
      .select('id', { count: 'exact', head: true })
      .eq('punch_list_id', orphan!.id);
    expect(count ?? 0).toBe(0);

    const { data: still } = await admin
      .from('punch_lists')
      .select('id, is_deleted')
      .eq('id', orphan!.id)
      .single();
    expect(still!.is_deleted).toBe(false);

    await admin.from('punch_lists').delete().eq('id', orphan!.id);
  });
});
