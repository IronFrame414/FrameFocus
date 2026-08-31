import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@framefocus/shared/types/database';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// Group F drives the REAL shipped `recalculateEstimateTotals`, which builds its
// own browser client. Only the factory is replaced; `state.client` is a real
// anon-key client carrying a real user JWT, so RLS and the trigger both apply
// exactly as they do in the app.
const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));

// ============================================================================
// S175 #1 / TECH_DEBT `#2-s174` — A SENT ESTIMATE IS IMMUTABLE.
// ============================================================================
//
// The hole, proved at S174 as an Owner through the anon key — i.e. what a
// browser console can do — against `status = 'sent'`:
//     UPDATE estimates SET grand_total = 999999  ->  1 row, read back 999999
// The estimate's own LINE ITEMS were floored at the database and the PARENT ROW
// was not: `estimates_update_manager` carries `status = 'draft'` only on its
// project-manager arm. The freeze for Owner and Admin was a TypeScript `if`.
//
// ⚠️ THE HALF THAT MATTERS MOST HERE IS THE POSITIVE ONE.
// A freeze is easy to prove and easy to get catastrophically wrong in the other
// direction. `20261022000000` records the precedent: the original change-order
// trigger froze `signed_at` outright and *"broke every client signature from
// 2026-08-09"* — undetected for two weeks, because nothing asserts that a thing
// still WORKS. Three of the nine legitimate post-send writers are the client's
// own acts running as SERVICE ROLE, and a trigger is not bypassed by service
// role. So group B below exercises every one of them and is the reason this
// file is not just a list of refusals.
//
// ⚠️ EVERY REFUSAL IS MUTATION-PROVED. A PostgREST error alone cannot tell a
// refused WRITE from a refused RETURNING, and a zero-row result cannot tell a
// refusal from a filtered SELECT. Each negative below re-reads the row through
// the SERVICE ROLE afterwards and asserts the value did not move.
// ============================================================================

import { recalculateEstimateTotals } from '@/lib/services/estimate-items-client';

const MARKER = 'S175FRZ';
const OWNER = 'josh+test50@worthprop.com';
const PM = 'josh+pm@worthprop.com';

type Client = SupabaseClient<Database>;
let ownerC: Client;
let pmC: Client;
let companyId: string;
let contactId: string;
let sentId = '';
let draftId = '';
let reviewId = '';

const must = (l: string, e: { message: string } | null) => { if (e) throw new Error(`${l}: ${e.message}`); };

/** Postgres returns `2026-…+00:00` with trailing zeros trimmed; JS emits
 *  `…340Z`. Both name the SAME INSTANT, so the assertion is about the instant —
 *  comparing the strings tests the driver's formatting, not the freeze. */
const at_ = (v: string | null) => (v === null ? null : new Date(v).getTime());

/** The row as the DATABASE holds it — never through a policy. */
const row = async (id: string) =>
  (await admin.from('estimates').select('*').eq('id', id).single()).data!;

async function sweep(): Promise<void> {
  const { data: ests } = await admin.from('estimates').select('id').like('name', `${MARKER}%`);
  const ids = (ests ?? []).map((e) => e.id);
  if (ids.length) {
    await admin.from('signing_sessions').delete().in('estimate_id', ids);
    await admin.from('email_logs').delete().in('estimate_id', ids);
    const { data: li } = await admin.from('estimate_line_items').select('id').in('estimate_id', ids);
    const lids = (li ?? []).map((l) => l.id);
    if (lids.length) {
      await admin.from('estimate_line_rows').delete().in('line_item_id', lids);
      await admin.from('estimate_line_items').delete().in('id', lids);
    }
    await admin.from('estimates').delete().in('id', ids);
  }
}

/** Created through the OWNER's client: next_estimate_number() reads
 *  get_my_company_id(), which is NULL for the service role. */
async function makeEstimate(label: string, status: string): Promise<string> {
  const { data, error } = await ownerC
    .from('estimates')
    .insert({ name: `${MARKER} ${label}`, contact_id: contactId, status: 'draft' })
    .select('id')
    .single();
  must(`create ${label}`, error);
  if (status !== 'draft') {
    // Staged through the service role so the fixture does not depend on the
    // very transitions under test.
    must(
      `stage ${label}`,
      (await admin
        .from('estimates')
        .update(
          status === 'review'
            ? { status: 'review' }
            : { status, sent_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 864e5).toISOString() }
        )
        .eq('id', data!.id)).error
    );
  }
  return data!.id;
}

/**
 * A priced line item, inserted through the SERVICE ROLE while the estimate is
 * still a draft. It exists so a recompute has something to change: an estimate
 * with no lines recomputes 0 over 0, every frozen column is `IS NOT DISTINCT
 * FROM` its old value, and the trigger never fires — a probe against it would
 * pass VACUOUSLY, which is what the first version of F1 did.
 */
async function priceIt(estimateId: string): Promise<void> {
  const { data: cat } = await admin.from('estimate_categories').select('id').limit(1).maybeSingle();
  const { data: li, error } = await admin
    .from('estimate_line_items')
    .insert({ company_id: companyId, estimate_id: estimateId, category_id: cat!.id, name: `${MARKER} item`, sort_order: 0 })
    .select('id').single();
  must('line item', error);
  must('line row', (await admin.from('estimate_line_rows').insert({
    company_id: companyId, line_item_id: li!.id, name: `${MARKER} row`, row_type: 'material',
    sort_order: 0, quantity: 4, unit_cost: 250, markup_percent: 20,
  } as never)).error);
}

beforeAll(async () => {
  assertRebuildTest();
  await sweep();
  [ownerC, pmC] = (await Promise.all([sessionFor(OWNER), sessionFor(PM)])) as Client[];
  const { data: co } = await admin.from('companies').select('id').eq('name', 'Sabal Point Construction').single();
  companyId = co!.id;
  const { data: c } = await admin.from('contacts').select('id').eq('company_id', companyId).limit(1).single();
  contactId = c!.id;
  sentId = await makeEstimate('sent', 'sent');
  draftId = await makeEstimate('draft', 'draft');
  reviewId = await makeEstimate('review', 'review');
}, 240_000);

afterAll(async () => {
  await sweep();
  const { count } = await admin.from('estimates').select('id', { count: 'exact', head: true }).like('name', `${MARKER}%`);
  expect(count, 'estimates left behind').toBe(0);
}, 240_000);

// ───────────────────────────────────────────────────────────────────────────
describe('S175-A — the frozen set: the exact writes S174 proved, now refused', () => {
  it.each([
    ['grand_total', { grand_total: 999999, subtotal: 999999 }, 'grand_total'],
    ['name', { name: `${MARKER} renamed after send` }, 'name'],
    ['scope_summary', { scope_summary: 'silently changed after the client got the PDF' }, 'scope_summary'],
    ['tax_rate', { tax_rate: 99 }, 'tax_rate'],
    ['contact_id', { contact_id: null }, 'contact_id'],
    ['material_markup_percent', { material_markup_percent: 999 }, 'material_markup_percent'],
    ['estimate_number', { estimate_number: `${MARKER}-HIJACK` }, 'estimate_number'],
    ['sent_at', { sent_at: new Date(0).toISOString() }, 'sent_at'],
    ['expires_at', { expires_at: new Date(0).toISOString() }, 'expires_at'],
    ['include_client_contract', { include_client_contract: true }, 'include_client_contract'],
  ] as const)('A1 — an OWNER cannot rewrite %s on a sent estimate, and the value does not move', async (_label, patch, col) => {
    const before = await row(sentId);
    const { error } = await ownerC.from('estimates').update(patch as never).eq('id', sentId).select('id');
    expect(error, 'the write was NOT refused').not.toBeNull();
    expect(error!.message).toMatch(/immutable|void and reissue/i);
    // ⚠️ MUTATION-PROVED: an error alone cannot distinguish a refused write
    // from a refused RETURNING. Read the row as the database holds it.
    const after = await row(sentId);
    expect(after[col as keyof typeof after]).toEqual(before[col as keyof typeof before]);
  });

  it('A2 — ⚠️ THE SERVICE ROLE IS REFUSED TOO. A blanket auth.uid() IS NULL exemption would have relocated the hole, not closed it', async () => {
    // Josh, S175, ruling against the recommended shape: a freeze with a blanket
    // exemption is not a freeze. This is the assertion that holds him to it.
    const before = await row(sentId);
    const { error } = await admin.from('estimates').update({ grand_total: 123456 }).eq('id', sentId).select('id');
    expect(error, 'the SERVICE ROLE rewrote a sent estimate').not.toBeNull();
    expect(Number((await row(sentId)).grand_total)).toBe(Number(before.grand_total));
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-B — ⚠️ THE POSITIVE HALF: every legitimate writer still works', () => {
  // S164's lesson, and the reason this group exists. A freeze that breaks the
  // client's own acts fails silently for weeks, because nothing asserts that a
  // thing still works. Three of these run as SERVICE ROLE.

  it('B1 — the reminder machinery still writes reminder_count and last_reminder_sent_at', async () => {
    const now = new Date().toISOString();
    must('reminder', (await admin.from('estimates')
      .update({ reminder_count: 1, last_reminder_sent_at: now }).eq('id', sentId)).error);
    expect((await row(sentId)).reminder_count).toBe(1);
  });

  it('B2 — the expiry cron still moves sent → expired', async () => {
    const e = await makeEstimate('expiring', 'sent');
    must('expire', (await admin.from('estimates').update({ status: 'expired' }).eq('id', e).eq('status', 'sent')).error);
    expect((await row(e)).status).toBe('expired');
  });

  it('B3 — ⚠️ THE CLIENT ACCEPTS (service role): status, accepted_at and the signed PDF all land', async () => {
    const e = await makeEstimate('accepting', 'sent');
    const at = new Date().toISOString();
    const { error } = await admin.from('estimates')
      .update({ status: 'accepted', accepted_at: at, signed_proposal_file_id: null })
      .eq('id', e);
    expect(error, 'the freeze broke proposal ACCEPTANCE — the S164 failure, repeated').toBeNull();
    const r = await row(e);
    expect(r.status).toBe('accepted');
    expect(at_(r.accepted_at)).toBe(at_(at));
  });

  it('B4 — ⚠️ THE CLIENT DECLINES (service role): status, declined_at and both reason columns land', async () => {
    const e = await makeEstimate('declining', 'sent');
    const at = new Date().toISOString();
    const { error } = await admin.from('estimates')
      .update({ status: 'declined', declined_at: at, decline_reason_code: 'too_expensive', decline_reason_notes: 'over budget' })
      .eq('id', e);
    expect(error, 'the freeze broke proposal DECLINE').toBeNull();
    expect((await row(e)).decline_reason_code).toBe('too_expensive');
  });

  it('B5 — ⚠️ THE CLIENT UNSUBSCRIBES (service role) at any status, and may do it twice', async () => {
    // Deliberately unpaired to a status: the client may click unsubscribe in an
    // old reminder email long after the estimate expired.
    const first = new Date().toISOString();
    must('unsub 1', (await admin.from('estimates').update({ client_unsubscribed_at: first }).eq('id', sentId)).error);
    const second = new Date(Date.now() + 1000).toISOString();
    const { error } = await admin.from('estimates').update({ client_unsubscribed_at: second }).eq('id', sentId);
    expect(error, 're-clicking unsubscribe was refused').toBeNull();
  });

  it('B6 — the trash bin still works on a sent estimate (Owner/Admin, unchanged)', async () => {
    const e = await makeEstimate('trashing', 'sent');
    const { error } = await ownerC.from('estimates')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', e).select('id');
    expect(error).toBeNull();
    expect((await row(e)).is_deleted).toBe(true);
  });

  it('B7 — internal_notes stay editable: they never left the company', async () => {
    const { error } = await ownerC.from('estimates')
      .update({ internal_notes: `${MARKER} note after send` }).eq('id', sentId).select('id');
    expect(error).toBeNull();
  });

  it('B8 — reminder_schedule stays editable — bookkeeping about the document, not the document', async () => {
    const { error } = await ownerC.from('estimates')
      .update({ reminder_schedule: [3, 7] as never }).eq('id', sentId).select('id');
    expect(error).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-C — the boundary is `sent`, not "left draft"', () => {
  it('C1 — ⚠️ A REVIEW ESTIMATE IS STILL EDITABLE. Copying the CO trigger literally would have refused the send itself', async () => {
    // An estimate has a state a change order does not. `review` is the PM→Owner
    // hand-off and nothing has reached the client; `api/proposals/send` accepts
    // `draft|review` and stamps reviewed_by/reviewed_at ON that transition. A
    // freeze beginning at "left draft" breaks every PM-authored estimate.
    const { error } = await ownerC.from('estimates')
      .update({ grand_total: 4242, subtotal: 4242 }).eq('id', reviewId).select('id');
    expect(error, 'the freeze caught `review` — the send transition is now broken').toBeNull();
    expect(Number((await row(reviewId)).grand_total)).toBe(4242);
  });

  it('C2 — and the send transition itself runs from review: status, sent_at, expires_at, reviewed_*', async () => {
    const now = new Date().toISOString();
    const { error } = await ownerC.from('estimates')
      .update({ status: 'sent', sent_at: now, expires_at: new Date(Date.now() + 30 * 864e5).toISOString() })
      .eq('id', reviewId).select('id');
    expect(error, 'approve-and-send is refused by the freeze').toBeNull();
    expect((await row(reviewId)).status).toBe('sent');
  });

  it('C3 — a DRAFT is untouched: the whole point is that editing happens before sending', async () => {
    const { error } = await ownerC.from('estimates')
      .update({ grand_total: 777, name: `${MARKER} draft renamed` }).eq('id', draftId).select('id');
    expect(error).toBeNull();
    expect(Number((await row(draftId)).grand_total)).toBe(777);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-D — the stamps are records: first write allowed, rewrite refused', () => {
  it('D1 — an acceptance date cannot be rewritten once it exists', async () => {
    const e = await makeEstimate('stamp-accept', 'sent');
    const at = new Date().toISOString();
    must('accept', (await admin.from('estimates').update({ status: 'accepted', accepted_at: at }).eq('id', e)).error);
    const { error } = await admin.from('estimates')
      .update({ accepted_at: new Date(0).toISOString() }).eq('id', e);
    expect(error, 'a signature stamp was rewritten').not.toBeNull();
    expect(error!.message).toMatch(/cannot be rewritten/i);
    expect(at_((await row(e)).accepted_at)).toBe(at_(at)); // mutation-proved
  });

  it('D2 — a decline reason cannot be rewritten once the decline exists', async () => {
    const e = await makeEstimate('stamp-decline', 'sent');
    must('decline', (await admin.from('estimates')
      .update({ status: 'declined', declined_at: new Date().toISOString(), decline_reason_code: 'timing' }).eq('id', e)).error);
    const { error } = await admin.from('estimates').update({ decline_reason_code: 'other' }).eq('id', e);
    expect(error).not.toBeNull();
    expect((await row(e)).decline_reason_code).toBe('timing'); // mutation-proved
  });

  it('D3 — a stamp cannot appear without the status that explains it', async () => {
    const e = await makeEstimate('stamp-orphan', 'sent');
    const { error } = await admin.from('estimates')
      .update({ accepted_at: new Date().toISOString() }).eq('id', e); // status stays `sent`
    expect(error, 'an orphan acceptance date was accepted').not.toBeNull();
    expect(error!.message).toMatch(/without being accepted/i);
    expect((await row(e)).accepted_at).toBeNull(); // mutation-proved
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-E — the PM arm is unchanged, and the counterfactual is real', () => {
  it('E1 — a PM still cannot touch a sent estimate they did not author (RLS, not the trigger)', async () => {
    // Paired with A1 so the freeze is not credited with a refusal RLS was
    // already making. This one returns ZERO ROWS rather than an error, which is
    // how a policy refusal looks — a different mechanism, deliberately asserted
    // differently.
    const before = await row(sentId);
    const { data, error } = await pmC.from('estimates').update({ name: `${MARKER} pm` }).eq('id', sentId).select('id');
    expect(error).toBeNull();
    expect(data ?? [], 'a non-authoring PM wrote a sent estimate').toHaveLength(0);
    expect((await row(sentId)).name).toBe(before.name);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('S175-F — the FALSE SAFETY ARGUMENT, corrected and now asserted', () => {
  // `money-representation.md` §7.1 S-4 and two code comments claimed
  // `recalculateEstimateTotals` was *"a silent no-op that fakes a recompute"*
  // on a frozen estimate because its UPDATEs *"RLS-match zero rows"*. That held
  // only for a PM, and the same section restricts project rates to Owner/Admin
  // — so the guard missed exactly the roles the screen serves. All three sites
  // were corrected at S175 with the superseded text quoted. These are the
  // assertions that keep the corrected version honest.

  it('F1 — ⚠️ on a SENT estimate it now FAILS LOUDLY rather than half-succeeding', async () => {
    // It was never a no-op. It writes estimate_line_rows.total and
    // estimate_line_items.total_price FIRST — both floored to draft, and an
    // RLS-filtered UPDATE returns zero rows with NO error, which the function
    // does not check. So the child writes were dropped silently and the parent
    // write succeeded for an Owner: a PARTIAL write leaving the estimate's
    // stored totals disagreeing with its own line items.
    const e = await makeEstimate('recalc-draft-then-sent', 'draft');
    await priceIt(e);
    // Stage to `sent` with the stored totals still at 0, so a recompute WOULD
    // move grand_total. Without this the probe is vacuous — see priceIt().
    must('stage', (await admin.from('estimates')
      .update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', e)).error);
    state.client = ownerC;
    const before = await row(e);
    const r = await recalculateEstimateTotals(e);
    expect(r.success, 'the recompute still went through on a sent estimate').toBe(false);
    expect(r.error).toMatch(/immutable|void and reissue/i);
    // Mutation-proved: nothing moved.
    expect(Number((await row(e)).grand_total)).toBe(Number(before.grand_total));
    expect(Number((await row(e)).subtotal)).toBe(Number(before.subtotal));
  });

  it('F2 — and on a DRAFT it still recomputes, and the figure really moves', async () => {
    // The paired positive, and it asserts the MOVEMENT rather than just
    // `success: true` — which is exactly what F1's first version failed to do.
    const e = await makeEstimate('recalc-draft', 'draft');
    await priceIt(e);
    expect(Number((await row(e)).grand_total)).toBe(0);
    state.client = ownerC;
    const r = await recalculateEstimateTotals(e);
    expect(r.success, r.error).toBe(true);
    expect(Number((await row(e)).grand_total), 'the recompute changed nothing — F1 would be vacuous').toBeGreaterThan(0);
  });

  it('F3 — a no-change write is still permitted on a sent estimate: the freeze is IS DISTINCT FROM, not a blanket refusal', async () => {
    // Worth pinning, because it is why F1 needed a priced fixture at all. An
    // idempotent write must not fail — a trigger that refused one would break
    // every upsert-shaped caller in the app.
    const { error } = await admin.from('estimates')
      .update({ grand_total: (await row(sentId)).grand_total }).eq('id', sentId);
    expect(error).toBeNull();
  });
});
