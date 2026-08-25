import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';
import { computeChosenFigures } from '@/lib/services/selection-lifecycle-service';
import { getSelection } from '@/lib/services/selections';

// ============================================================================
// S174 #2 — THE MARKUP SNAPSHOT: the trigger, the ruling, and the floor.
// ============================================================================
//
// Josh: an option at qty 100 × cost 100 totalled **$10,000** — cost — with
// "inherit" in the markup box. `markup_percent ?? 0` in all three readers.
//
// ⚠️ THE RULING [Josh, S174], narrower than spec §5.2 / Q3 as ruled at S170:
// *"the option inherits the markup FROM THE ESTIMATE AS IT STOOD WHEN THE
// ALLOWANCE WAS SET — a snapshot at allowance-creation time, not a live read of
// the estimate now."* §5.2's chain is unchanged; WHEN it is walked is.
//
// So the assertion that carries the ruling is C2, and it is a NEGATIVE with a
// paired positive: change the source markup AFTER the allowance was linked and
// the selection's price MUST NOT MOVE — while a selection linked after the
// change picks the new value up. A snapshot that never updates and a live read
// that always does are both wrong, and only the pair tells them apart.
//
// ⚠️ THE ARITHMETIC IS NOT PROVEN HERE. `s174-option-sell.test.ts` owns it,
// without a database, because the formula is now a shared unit rather than
// three copies inside React components. This file owns the STAMP.
// ============================================================================

const MARKER = 'S174SNAP';
const PROJECT = '4a4f8567-67f8-4394-baae-181229974bd9'; // QA A — isolation fixture
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';
const SUB = 'josh+qa-sub@worthprop.com';
const LINKED = 'josh+qa-client-linked@worthprop.com';

type Client = SupabaseClient<Database>;
const S: Partial<Record<'owner' | 'pm' | 'foreman' | 'sub' | 'linked', Client>> = {};
let companyId: string;
let companyDefaultMarkup: number;
let allowanceA: string; // no source row → the company default rung
let selLinked: string;
let selUnlinked: string;
let optNullMarkup: string;

const must = (l: string, e: { message: string } | null) => { if (e) throw new Error(`${l}: ${e.message}`); };

const snapOf = async (selectionId: string) =>
  (await admin.from('selection_amounts').select('inherited_markup_percent, snapshot_at').eq('selection_id', selectionId).maybeSingle()).data;

async function sweep(): Promise<void> {
  const { data: sels } = await admin.from('selections').select('id').like('name', `${MARKER}%`);
  const ids = (sels ?? []).map((s) => s.id);
  if (ids.length) {
    await admin.from('notifications').delete().in('source_id', ids).eq('source_table', 'selections');
    await admin.from('selections').update({ signed_session_id: null }).in('id', ids);
    await admin.from('selection_signing_sessions').delete().in('selection_id', ids);
    const { data: opts } = await admin.from('selection_options').select('id').in('selection_id', ids);
    const oids = (opts ?? []).map((o) => o.id);
    if (oids.length) {
      await admin.from('selection_option_amounts').delete().in('option_id', oids);
      await admin.from('selection_options').delete().in('id', oids);
    }
    await admin.from('selection_notes').delete().in('selection_id', ids);
    await admin.from('selection_threads').delete().in('selection_id', ids);
    // ON DELETE CASCADE off `selections` clears selection_amounts, but delete
    // it explicitly so a failure to cascade shows up here rather than as
    // residue in the next run.
    await admin.from('selection_amounts').delete().in('selection_id', ids);
    await admin.from('selections').delete().in('id', ids);
  }
  await admin.from('selection_areas').delete().like('name', `${MARKER}%`);
  const { data: items } = await admin.from('project_budget_items').select('id').eq('project_id', PROJECT).like('description', `${MARKER}%`);
  const iids = (items ?? []).map((i) => i.id);
  if (iids.length) {
    await admin.from('project_budget_amounts').delete().in('budget_item_id', iids);
    await admin.from('project_budget_items').delete().in('id', iids);
  }
}

/** An allowance budget line with NO source row → the company-default rung. */
async function makeAllowance(label: string, budgeted: number): Promise<string> {
  const { data: item, error } = await admin
    .from('project_budget_items')
    .insert({ company_id: companyId, project_id: PROJECT, row_type: 'allowance', description: `${MARKER} ${label}`, created_by: null })
    .select('id').single();
  must(`allowance ${label}`, error);
  must(`allowance amount ${label}`, (await admin.from('project_budget_amounts').insert({ company_id: companyId, budget_item_id: item!.id, budgeted_amount: budgeted })).error);
  return item!.id;
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  const { data: co } = await admin.from('companies').select('id, default_material_markup_percent').eq('name', 'Bishop Contracting').single();
  companyId = co!.id;
  companyDefaultMarkup = Number(co!.default_material_markup_percent ?? 0);
  for (const [k, e] of [['owner', OWNER], ['pm', PM], ['foreman', FOREMAN], ['sub', SUB], ['linked', LINKED]] as const) {
    S[k] = (await sessionFor(e)) as Client;
  }
  allowanceA = await makeAllowance('tile allowance', 5000);

  const { data: a, error: aErr } = await admin
    .from('selections')
    .insert({ company_id: companyId, project_id: PROJECT, name: `${MARKER} linked`, allowance_budget_item_id: allowanceA })
    .select('id').single();
  must('linked selection', aErr);
  selLinked = a!.id;

  const { data: u, error: uErr } = await admin
    .from('selections')
    .insert({ company_id: companyId, project_id: PROJECT, name: `${MARKER} unlinked` })
    .select('id').single();
  must('unlinked selection', uErr);
  selUnlinked = u!.id;

  // ⚠️ THE OPTION AT THE HEART OF THE BUG: markup_percent NULL, i.e. "inherit".
  const { data: o } = await admin
    .from('selection_options')
    .insert({ company_id: companyId, selection_id: selLinked, name: `${MARKER} porcelain`, is_chosen: true })
    .select('id').single();
  optNullMarkup = o!.id;
  must('amounts', (await admin.from('selection_option_amounts')
    .insert({ company_id: companyId, option_id: optNullMarkup, quantity: 100, unit_cost: 100, markup_percent: null })).error);
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin.from('selections').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  expect(count, 'selections left behind').toBe(0);
  const { count: bc } = await admin.from('project_budget_items').select('id', { count: 'exact', head: true }).like('description', `${MARKER}%`);
  expect(bc, 'fixture allowance lines left behind').toBe(0);
}, 240_000);

// ───────────────────────────────────────────────────────────────────────────
describe('S174-A — the trigger stamps, and it stamps the Q3 chain', () => {
  it('A1 — a selection created WITH an allowance is stamped at insert, from the allowance chain', async () => {
    const snap = await snapOf(selLinked);
    expect(snap, 'no snapshot row — the AFTER INSERT trigger did not fire').not.toBeNull();
    // The fixture allowance has no source row, so the chain lands on the
    // company's material default — the same last rung `allowanceSellFor` uses.
    expect(Number(snap!.inherited_markup_percent)).toBe(companyDefaultMarkup);
  });

  it('A2 — a selection created with NO allowance is stamped too, from the project’s source estimate or the company default', async () => {
    const snap = await snapOf(selUnlinked);
    expect(snap, 'an unlinked selection must still carry a basis').not.toBeNull();
    expect(snap!.inherited_markup_percent).not.toBeNull();
  });

  it('A3 — a backfilled world has no un-stamped selections at all', async () => {
    // "No snapshot" and "a snapshot of zero" are indistinguishable to a reader,
    // and the second is the bug. The migration backfilled; nothing may be left.
    const { data: sels } = await admin.from('selections').select('id');
    const { data: snaps } = await admin.from('selection_amounts').select('selection_id');
    const have = new Set((snaps ?? []).map((s) => s.selection_id));
    const missing = (sels ?? []).map((s) => s.id).filter((id) => !have.has(id));
    expect(missing, 'selections with no markup snapshot').toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S174-B — the option prices at the snapshot, which is the whole defect', () => {
  it('B1 — ⚠️ 100 × $100 with a NULL markup is cost × (1 + snapshot), NOT $10,000', async () => {
    const f = await computeChosenFigures(admin, selLinked);
    if ('error' in f) throw new Error(f.error);
    const expected = Math.round(100 * 100 * (1 + companyDefaultMarkup / 100) * 100) / 100;
    expect(f.sellAmount).toBe(expected);
    // Only meaningful if the company default is not itself zero — assert that
    // the fixture can actually distinguish the two answers.
    expect(companyDefaultMarkup, 'the fixture company has a 0% default — B1 proves nothing').toBeGreaterThan(0);
    expect(f.sellAmount).not.toBe(10000);
    // ⚠️ AND THE ALLOWANCE DEDUCTION, which is what proves the RPC actually
    // RESOLVES. `allowanceSellFor` no longer walks the chain in TypeScript — it
    // calls `allowance_effective_markup_percent()`, the single implementation
    // shared with the trigger. A silent RPC failure would show up here as a
    // deduction of the bare cost, and it is also what makes D5's "nobody else
    // may call it" a floor rather than a broken function.
    expect(f.allowanceDeduction).toBe(Math.round(5000 * (1 + companyDefaultMarkup / 100) * 100) / 100);
    expect(f.allowanceDeduction).not.toBe(5000);
  });

  it('B2 — an EXPLICIT markup still wins, including an explicit 0', async () => {
    must('explicit 0', (await admin.from('selection_option_amounts').update({ markup_percent: 0 }).eq('option_id', optNullMarkup)).error);
    const zero = await computeChosenFigures(admin, selLinked);
    if ('error' in zero) throw new Error(zero.error);
    expect(zero.sellAmount).toBe(10000); // a typed 0 means 0, not "inherit"

    must('explicit 50', (await admin.from('selection_option_amounts').update({ markup_percent: 50 }).eq('option_id', optNullMarkup)).error);
    const fifty = await computeChosenFigures(admin, selLinked);
    if ('error' in fifty) throw new Error(fifty.error);
    expect(fifty.sellAmount).toBe(15000);

    must('restore NULL', (await admin.from('selection_option_amounts').update({ markup_percent: null }).eq('option_id', optNullMarkup)).error);
  });

  it('B3 — the READ layer hands the snapshot to the UI, so the sheet and the signature agree', async () => {
    // The three readers were three copies of one wrong expression. They now
    // share `optionSell`, but only if the UI is actually GIVEN the snapshot.
    const sel = await getSelection(selLinked, S.owner!);
    expect(sel, 'owner cannot read the selection').not.toBeNull();
    expect(sel!.inherited_markup_percent).toBe(companyDefaultMarkup);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S174-C — it is a SNAPSHOT, not a live read: the ruling, asserted both ways', () => {
  it('C1 — re-linking the allowance RE-WALKS the chain; it does not merely re-date the row', async () => {
    // A trigger that fired but reused the old value would pass a timestamp
    // check and fail the product. So the basis is MOVED underneath, and the
    // re-stamp must pick the new one up.
    const other = await makeAllowance('fixture allowance B', 1000);
    const prior = companyDefaultMarkup;
    const bumped = prior + 7;
    const before = await snapOf(selLinked);

    let afterRelink: number | null = null;
    let afterStamp: string | null = null;
    try {
      must('bump default', (await admin.from('companies').update({ default_material_markup_percent: bumped }).eq('id', companyId)).error);
      must('relink', (await admin.from('selections').update({ allowance_budget_item_id: other }).eq('id', selLinked)).error);
      const after = await snapOf(selLinked);
      afterRelink = after === null ? null : Number(after.inherited_markup_percent);
      afterStamp = after?.snapshot_at ?? null;
    } finally {
      // Restore BEFORE asserting (S173 ARM 15b) — including the link, so the
      // rest of the file sees the fixture it was built on.
      must('restore default', (await admin.from('companies').update({ default_material_markup_percent: prior }).eq('id', companyId)).error);
      must('relink back', (await admin.from('selections').update({ allowance_budget_item_id: allowanceA }).eq('id', selLinked)).error);
    }

    expect(afterRelink, 'the UPDATE trigger did not re-walk the chain').toBe(bumped);
    expect(new Date(afterStamp!).getTime()).toBeGreaterThanOrEqual(new Date(before!.snapshot_at).getTime());
    // Relinking back re-stamps again, now under the restored default.
    expect(Number((await snapOf(selLinked))!.inherited_markup_percent)).toBe(prior);
  });

  it('C2 — ⚠️ THE RULING: changing the company default AFTER the link does NOT move the stamped selection, and DOES set a new one', async () => {
    // The paired positive is the point. A snapshot that never updates and a
    // live read that always does would both pass a one-sided probe.
    const prior = companyDefaultMarkup;
    const bumped = prior + 13;
    const stampedBefore = Number((await snapOf(selLinked))!.inherited_markup_percent);

    let freshStamp: number | null = null;
    let stampedAfter: number | null = null;
    let newSelId: string | null = null;
    try {
      must('bump default', (await admin.from('companies').update({ default_material_markup_percent: bumped }).eq('id', companyId)).error);
      stampedAfter = Number((await snapOf(selLinked))!.inherited_markup_percent);
      const { data: fresh } = await admin
        .from('selections')
        .insert({ company_id: companyId, project_id: PROJECT, name: `${MARKER} after the bump`, allowance_budget_item_id: allowanceA })
        .select('id').single();
      newSelId = fresh!.id;
      freshStamp = Number((await snapOf(newSelId!))!.inherited_markup_percent);
    } finally {
      // ⚠️ RESTORE BEFORE ASSERTING (S173 ARM 15b). A failed expectation must
      // not leave the shared fixture company on a wrong default for every other
      // harness in the battery.
      must('restore default', (await admin.from('companies').update({ default_material_markup_percent: prior }).eq('id', companyId)).error);
      if (newSelId) {
        await admin.from('selection_amounts').delete().eq('selection_id', newSelId);
        await admin.from('selections').delete().eq('id', newSelId);
      }
    }

    expect(stampedAfter, 'the existing selection re-priced from a later edit — this is a LIVE read, not a snapshot').toBe(stampedBefore);
    expect(freshStamp, 'a selection linked AFTER the change kept the old basis — the chain is not being walked at all').toBe(bumped);
    expect((await admin.from('companies').select('default_material_markup_percent').eq('id', companyId).single()).data!.default_material_markup_percent).toBe(prior);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S174-D — the snapshot is FLOORED: a markup percent is a sell-side figure', () => {
  it.each([
    ['foreman', 'foreman'],
    ['sub', 'subcontractor'],
    ['linked', 'client'],
  ] as const)('D1 — a %s reads NO selection_amounts row (owner/admin/PM only)', async (key, _role) => {
    const { data } = await S[key]!.from('selection_amounts').select('id, inherited_markup_percent').eq('selection_id', selLinked);
    expect(data ?? []).toHaveLength(0);
  });

  it('D2 — the PM DOES read it: the floor is owner/admin/PM, matching selection_option_amounts', async () => {
    const { data } = await S.pm!.from('selection_amounts').select('inherited_markup_percent').eq('selection_id', selLinked);
    expect(data ?? []).toHaveLength(1);
  });

  it('D3 — a floored reader is handed NULL by the read layer, and therefore prices nothing at all', async () => {
    // The paired assertion that makes D1 mean something: not merely "no row",
    // but that the UI contract carries the absence rather than a zero.
    const sel = await getSelection(selLinked, S.foreman!);
    expect(sel, 'the foreman cannot see the selection at all — D3 proves nothing').not.toBeNull();
    expect(sel!.inherited_markup_percent).toBeNull();
    expect(sel!.options.every((o) => o.amounts === null)).toBe(true);
  });

  it('D4 — NOBODY may DELETE a snapshot: there is no DELETE policy at all', async () => {
    for (const k of ['owner', 'pm'] as const) {
      const { data } = await S[k]!.from('selection_amounts').delete().eq('selection_id', selLinked).select('id');
      expect(data ?? [], `${k} deleted a markup snapshot`).toHaveLength(0);
    }
    expect(await snapOf(selLinked)).not.toBeNull();
  });

  it('D5 — the chain function is not an RPC any signed-in caller can use', async () => {
    // `allowance_effective_markup_percent` returns a floored figure. It is
    // REVOKEd from `authenticated` precisely so it cannot be used to read
    // around the side table it exists to populate.
    for (const k of ['owner', 'pm', 'foreman', 'sub', 'linked'] as const) {
      const { error } = await S[k]!.rpc('allowance_effective_markup_percent' as never, { p_budget_item_id: allowanceA } as never);
      expect(error, `${k} could call allowance_effective_markup_percent`).not.toBeNull();
    }
  });
});
