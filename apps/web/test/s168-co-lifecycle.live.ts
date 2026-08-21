import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  admin,
  assertRebuildTest,
  disposeChangeOrders,
  sessionFor,
  sweepChangeOrders,
} from './live-session';

// ============================================================================
// S168 — VOID / REISSUE / DELETE on a change order. Closes #1-s167fx.
//
// Migration: `20261023000000_co_void_reissue_delete.sql`.
// Ruling:    [Josh, S168] a reason on EVERY void, signed or unsigned; reissue
//            is a fresh draft linked back; DELETE is UNSIGNED ONLY —
//            "a change order is a legal document, and being able to prove you
//            never sent one is a claim the system must not be able to make
//            falsely."
// ============================================================================
//
// ⚠️ WHY EVERY REFUSAL BELOW IS MUTATION-PROVED.
// A PostgREST write returns a status, and a status is not a fact about the
// data. Two different failures look identical from the client:
//
//     the write was refused          -> the row is unchanged
//     the write landed, the RETURNING was refused (42501) -> the row CHANGED
//
// and a zero-row UPDATE is not an error at all (`mutation-result.ts`). So every
// probe here **re-reads through the service role afterwards** and asserts the
// row. The status is evidence of nothing on its own.
//
// ⚠️ AND THE FIXTURES ARE THIS FILE'S OWN.
// It never touches `CO-QA-M9-DRAFT`, `CO-QA-M9-SENT` or the `ZZ SUPERSEDED`
// row — S167's inventory is exactly about fixtures moving under a test, and
// Josh is click-testing against those three.

const OWNER = 'josh+test50@worthprop.com';
const ADMIN_USER = 'josh+qa-admin@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const FOREMAN = 'josh+qa-foreman@worthprop.com';

let ownerC: SupabaseClient;
let adminC: SupabaseClient;
let pmC: SupabaseClient;
let foremanC: SupabaseClient;

let companyId = '';
let projectId = '';
let ownerMemberId = '';
let pmUserId = '';

/** Everything this file creates, torn down service-role in afterAll. */
const made = new Set<string>();

let seq = 0;
const nextNumber = () => `ZZ-S168-${Date.now().toString(36)}-${(seq += 1)}`;

/**
 * ⚠️ THE STABLE SIGNED FIXTURE — created ONCE, EVER, and reused forever.
 *
 * L4c and L4d need a genuinely signature-bearing change order and neither
 * MUTATES it: the delete they attempt is refused, so the row comes out the
 * other side untouched. Creating a fresh one per run would strand two more
 * permanent rows every time, because a signed CO cannot be deleted by anyone
 * (`enforce_change_order_delete_boundary`) — which is the ruling, not a bug.
 *
 * Its prefix deliberately does NOT match the `ZZ-S168-` sweep below, so the
 * sweep cannot soft-delete the thing it is supposed to preserve.
 */
const PERMANENT_SIGNED = 'ZZ-S168X-PERMANENT-SIGNED';

/**
 * A change order in a chosen state, seeded service-role so its existence never
 * depends on the policy under test.
 *
 * ⚠️ THE LINE IS NOT OPTIONAL DECORATION. `#1-s167fx` only bites a CO that HAS
 * a line item — that is the FK with no CASCADE and the frozen child. A harness
 * that seeded bare parents would delete them happily and prove nothing.
 */
async function makeCo(
  opts: {
    status?: 'draft' | 'sent' | 'signed' | 'voided';
    signed?: boolean;
    createdBy?: string | null;
    withLine?: boolean;
  } = {}
): Promise<string> {
  const status = opts.status ?? 'draft';
  const withLine = opts.withLine ?? true;

  const { data, error } = await admin
    .from('change_orders')
    .insert({
      company_id: companyId,
      project_id: projectId,
      co_number: nextNumber(),
      title: 'ZZ S168 harness fixture',
      co_type: 'fixed_price',
      pricing_mode: 'markup',
      author_member_id: ownerMemberId,
      created_by: opts.createdBy === undefined ? null : opts.createdBy,
      status: 'draft',
      net_delta: 500,
    })
    .select('id')
    .single();
  if (error) throw new Error(`makeCo insert: ${error.message}`);
  const id = (data as { id: string }).id;
  made.add(id);

  if (withLine) {
    // While it is still a draft — `enforce_co_line_parent_open()` freezes lines
    // the moment the parent leaves draft, which is the trap the seed script
    // records for `QA M9 — sent CO`.
    const { error: lineError } = await admin.from('change_order_line_items').insert({
      company_id: companyId,
      change_order_id: id,
      name: 'ZZ S168 line',
      sort_order: 1,
      total_price: 500,
    });
    if (lineError) throw new Error(`makeCo line: ${lineError.message}`);
  }

  if (status !== 'draft') {
    const patch: Record<string, unknown> = { status, sent_at: new Date().toISOString() };
    if (status === 'signed' || opts.signed) patch.signed_at = new Date().toISOString();
    if (status === 'voided') {
      patch.void_reason = 'ZZ S168 seeded voided';
      patch.voided_at = new Date().toISOString();
    }
    const { error: flipError } = await admin.from('change_orders').update(patch).eq('id', id);
    if (flipError) throw new Error(`makeCo flip to ${status}: ${flipError.message}`);
  }

  return id;
}

/** Find-or-create the one permanent signed fixture. */
async function permanentSignedCo(): Promise<string> {
  const { data: found } = await admin
    .from('change_orders')
    .select('id')
    .eq('company_id', companyId)
    .eq('co_number', PERMANENT_SIGNED)
    .maybeSingle();
  if (found) return (found as { id: string }).id;

  const { data, error } = await admin
    .from('change_orders')
    .insert({
      company_id: companyId,
      project_id: projectId,
      co_number: PERMANENT_SIGNED,
      title: 'ZZ S168 permanent signed fixture — cannot be deleted, by design',
      co_type: 'fixed_price',
      pricing_mode: 'markup',
      author_member_id: ownerMemberId,
      status: 'draft',
      net_delta: 500,
    })
    .select('id')
    .single();
  if (error) throw new Error(`permanentSignedCo: ${error.message}`);
  const id = (data as { id: string }).id;

  const { error: signError } = await admin
    .from('change_orders')
    .update({ status: 'signed', signed_at: new Date().toISOString() })
    .eq('id', id);
  if (signError) throw new Error(`permanentSignedCo sign: ${signError.message}`);
  return id;
}

async function row(id: string) {
  const { data } = await admin
    .from('change_orders')
    .select('id, status, void_reason, voided_by, voided_at, signed_at, supersedes_change_order_id')
    .eq('id', id)
    .maybeSingle();
  return data as {
    id: string;
    status: string;
    void_reason: string | null;
    voided_by: string | null;
    voided_at: string | null;
    signed_at: string | null;
    supersedes_change_order_id: string | null;
  } | null;
}

/** Void the way a direct PostgREST call would — no service layer in the way. */
const tryVoid = (c: SupabaseClient, id: string, reason: string | null) =>
  c
    .from('change_orders')
    .update({ status: 'voided', void_reason: reason })
    .eq('id', id)
    .select('id');

beforeAll(async () => {
  assertRebuildTest();
  [ownerC, adminC, pmC, foremanC] = (await Promise.all([
    sessionFor(OWNER),
    sessionFor(ADMIN_USER),
    sessionFor(PM),
    sessionFor(FOREMAN),
  ])) as SupabaseClient[];

  const { data: prof } = await admin
    .from('profiles')
    .select('id, company_id, user_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  companyId = (prof as { company_id: string }).company_id;

  const { data: ownerMember } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', (prof as { id: string }).id)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .single();
  ownerMemberId = (ownerMember as { id: string }).id;

  const { data: pmProfile } = await admin
    .from('profiles')
    .select('id, user_id')
    .eq('email', PM)
    .eq('is_deleted', false)
    .single();
  pmUserId = (pmProfile as { user_id: string }).user_id;

  // A project THE PM IS ASSIGNED TO, scoped to the PM's own member row and
  // ORDERED. The unscoped version of this query is the `.limit(1)` defect
  // CLAUDE.md records: `s143-void-authority` took the first assignment in the
  // company, landed on an Owner-only one, and four probes went red on
  // visibility rather than on the authority they were written to test.
  const { data: pmMember } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', (pmProfile as { id: string }).id)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .single();

  const { data: assignment } = await admin
    .from('project_assignments')
    .select('project_id, projects!inner(company_id, is_deleted)')
    .eq('member_id', (pmMember as { id: string }).id)
    .eq('projects.company_id', companyId)
    .eq('projects.is_deleted', false)
    .order('project_id')
    .limit(1)
    .single();
  projectId = (assignment as unknown as { project_id: string }).project_id;

  // ⚠️ START FROM A DIRTY DATABASE. `afterAll` does not run when a run is
  // interrupted, and before S168 this file left 120 rows behind across six
  // green runs. Sweeping first means the suite is honest about its own residue
  // instead of stepping around it. Signature-bearing leftovers are soft-deleted
  // by the sweep rather than removed — they cannot be removed.
  await sweepChangeOrders('ZZ-S168-');
});

afterAll(async () => {
  // ==========================================================================
  // ⚠️ THE PREVIOUS VERSION OF THIS BLOCK LEAKED 120 CHANGE ORDERS. [S168]
  // ==========================================================================
  // _Superseded code, quoted rather than deleted:_
  //
  //     await admin.from('change_orders')
  //       .update({ signed_at: null, status: 'draft' }).in('id', ids);
  //     await admin.from('change_orders').delete().in('id', ids);
  //
  // THREE faults, each of which alone would have been enough:
  //
  //   1. The UPDATE is refused for every signed row ("A signature stamp cannot
  //      be rewritten") and every voided one ("frozen forever"), and its error
  //      was never read.
  //   2. **`.in(ids)` IS ONE STATEMENT.** A single row the delete boundary
  //      refuses aborts the whole batch and takes every deletable sibling with
  //      it. Nothing was ever deleted — not some of it, none of it.
  //   3. Nothing checked, so nothing said so.
  //
  // ⚠️ AND THE REASON IT STAYED INVISIBLE IS WORTH MORE THAN THE FIX. The
  // `co_number`s here are timestamped, so this harness can never collide with
  // its own residue — and a harness that cannot collide with itself also cannot
  // TELL you it is leaking. It ran green six times over 120 abandoned rows. The
  // suites that did notice were six unrelated s97ct files, one run later, dying
  // on a duplicate key in `beforeAll`.
  //
  // `disposeChangeOrders()` throws if a row is still live afterwards.
  const result = await disposeChangeOrders([...made]);
  if (result.retained.length) {
    // NOT a failure. A change order carrying a real signature cannot be deleted
    // by anyone, service role included — that is exactly what L4c/L4d assert.
    // Soft-deleted, so it leaves every listing and stops contributing to the
    // revised-contract derivation, and reported so the cost is never silent.
    console.log(
      `\n[S168 TEARDOWN] ${result.deleted} deleted, ${result.unflagged} unflagged-then-deleted, ` +
        `${result.retained.length} PERMANENT (signed, soft-deleted): ${JSON.stringify(result.retained)}`
    );
  }
});

// ───────────────────────────────────────────────────────────────────────────
describe('L0 — the harness can reach these rows at all', () => {
  it('L0a — a PM sees a CO they authored on the fixture project', async () => {
    // NON-VACUITY, load-bearing for every PM case below: the S121 read floor
    // (`20260830000000`) shows a PM only their OWN change orders, so a refusal
    // by invisibility and a refusal by authority are trivially confusable.
    const id = await makeCo({ status: 'sent', createdBy: pmUserId });
    const { data } = await pmC.from('change_orders').select('id').eq('id', id);
    expect(data ?? [], 'PM cannot see their own CO — every PM probe is vacuous').toHaveLength(1);
  });

  it('L0b — and CANNOT see one they did not author', async () => {
    const id = await makeCo({ status: 'sent', createdBy: null });
    const { data } = await pmC.from('change_orders').select('id').eq('id', id);
    expect(data ?? []).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('L1 — VOID requires a reason, in every case', () => {
  it('L1a — ⚠️ an Owner voiding WITHOUT a reason is refused, and the row does not move', async () => {
    const id = await makeCo({ status: 'sent' });
    const { error } = await tryVoid(ownerC, id, null);
    expect(error?.message ?? '').toMatch(/without a reason/i);

    // MUTATION-PROVED. A 42501 alone cannot tell "refused" from "written, then
    // the RETURNING was refused".
    const after = await row(id);
    expect(after?.status).toBe('sent');
    expect(after?.void_reason).toBeNull();
  });

  it('L1b — a blank-string reason is refused too', async () => {
    const id = await makeCo({ status: 'sent' });
    const { error } = await tryVoid(ownerC, id, '   ');
    expect(error?.message ?? '').toMatch(/without a reason/i);
    expect((await row(id))?.status).toBe('sent');
  });

  it('L1c — with a reason it lands, and voided_by is STAMPED not supplied', async () => {
    const id = await makeCo({ status: 'sent' });
    const { error } = await tryVoid(ownerC, id, 'Sent to the wrong client.');
    expect(error).toBeNull();

    const after = await row(id);
    expect(after?.status).toBe('voided');
    expect(after?.void_reason).toBe('Sent to the wrong client.');
    expect(after?.voided_at).not.toBeNull();
    // The trigger writes `auth.uid()`. Nothing in the payload said so.
    expect(after?.voided_by).not.toBeNull();
  });

  it('L1d — ⚠️ a SIGNED change order voids, with a reason [Josh, S168]', async () => {
    // This is the ruling change. The old route refused anything but draft/sent,
    // citing 5D F-4 ("reversing a binding CO is unpinned"). That interview
    // happened.
    //
    // ⚠️ THIS PROBE COSTS ONE PERMANENT ROW PER RUN, AND IT IS IRREDUCIBLE.
    // It CONSUMES its fixture — signed goes to voided and a voided CO is frozen
    // forever — so unlike L4c/L4d it cannot reuse the stable one, and the row it
    // leaves carries a signature and can never be deleted by anybody. The
    // teardown soft-deletes it and PRINTS it. That is the price of the ruling,
    // paid where the ruling is tested, rather than hidden.
    const id = await makeCo({ status: 'signed' });
    const { error } = await tryVoid(ownerC, id, 'Scope withdrawn by agreement.');
    expect(error).toBeNull();

    const after = await row(id);
    expect(after?.status).toBe('voided');
    // ⚠️ AND THE SIGNATURE SURVIVES. `signed-artifact-spec.md`: a document the
    // client actually saw is never destroyed. Voiding retires it.
    expect(after?.signed_at, 'the signature stamp was erased by the void').not.toBeNull();
  });

  it('L1e — ⚠️ and the void record cannot be rewritten afterwards', async () => {
    const id = await makeCo({ status: 'sent' });
    await tryVoid(ownerC, id, 'First reason.');

    const { error } = await ownerC
      .from('change_orders')
      .update({ void_reason: 'A more flattering reason.' })
      .eq('id', id)
      .select('id');
    expect(error?.message ?? '').toMatch(/void record cannot be rewritten/i);
    expect((await row(id))?.void_reason).toBe('First reason.');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('L2 — WHO may void', () => {
  it('L2a — a foreman cannot, and the row does not move', async () => {
    const id = await makeCo({ status: 'sent' });
    await tryVoid(foremanC, id, 'foreman attempt');
    // A foreman cannot even SELECT this row (S121 floor), so the UPDATE matches
    // nothing and Postgres calls that success. The row is the only evidence —
    // which is precisely why `mutation-result.ts` exists.
    expect((await row(id))?.status).toBe('sent');
  });

  it('L2b — an Admin can', async () => {
    const id = await makeCo({ status: 'sent' });
    const { error } = await tryVoid(adminC, id, 'admin void');
    expect(error).toBeNull();
    expect((await row(id))?.status).toBe('voided');
  });

  it('L2c — the AUTHORING PM can', async () => {
    const id = await makeCo({ status: 'sent', createdBy: pmUserId });
    const { error } = await tryVoid(pmC, id, 'pm voids their own');
    expect(error).toBeNull();
    expect((await row(id))?.status).toBe('voided');
  });

  it('L2d — ⚠️ a PM cannot void a CO they did not author', async () => {
    const id = await makeCo({ status: 'sent', createdBy: null });
    await tryVoid(pmC, id, 'pm voids somebody else’s');
    expect((await row(id))?.status).toBe('sent');
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('L3 — REISSUE, the path the trigger has always advertised', () => {
  it('L3a — only a VOIDED change order can be superseded', async () => {
    const live = await makeCo({ status: 'sent' });
    const { error } = await admin
      .from('change_orders')
      .insert({
        company_id: companyId,
        project_id: projectId,
        co_number: nextNumber(),
        title: 'ZZ S168 illegal reissue',
        author_member_id: ownerMemberId,
        supersedes_change_order_id: live,
      })
      .select('id');
    expect(error?.message ?? '').toMatch(/only a voided change order can be reissued/i);
  });

  it('L3b — a voided CO can be superseded exactly ONCE', async () => {
    const dead = await makeCo({ status: 'voided' });

    const { data: first, error: firstError } = await admin
      .from('change_orders')
      .insert({
        company_id: companyId,
        project_id: projectId,
        co_number: nextNumber(),
        title: 'ZZ S168 reissue 1',
        author_member_id: ownerMemberId,
        supersedes_change_order_id: dead,
      })
      .select('id')
      .single();
    expect(firstError).toBeNull();
    made.add((first as { id: string }).id);

    // Without `change_orders_supersedes_once`, a double-click produces two live
    // drafts for one withdrawal and the revised contract value double-counts
    // the moment both are signed.
    const { error: secondError } = await admin
      .from('change_orders')
      .insert({
        company_id: companyId,
        project_id: projectId,
        co_number: nextNumber(),
        title: 'ZZ S168 reissue 2',
        author_member_id: ownerMemberId,
        supersedes_change_order_id: dead,
      })
      .select('id');
    expect(secondError?.code, 'a second reissue was allowed').toBe('23505');
  });

  it('L3c — ⚠️ a reissue cannot land on another project', async () => {
    const dead = await makeCo({ status: 'voided' });
    const { data: other } = await admin
      .from('projects')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .neq('id', projectId)
      .order('id')
      .limit(1)
      .maybeSingle();
    expect(other, 'need a second project or this probe is vacuous').not.toBeNull();

    const { error } = await admin
      .from('change_orders')
      .insert({
        company_id: companyId,
        project_id: (other as { id: string }).id,
        co_number: nextNumber(),
        title: 'ZZ S168 misfiled reissue',
        author_member_id: ownerMemberId,
        supersedes_change_order_id: dead,
      })
      .select('id');
    expect(error?.message ?? '').toMatch(/same company and project/i);
  });

  it('L3d — and a change order cannot supersede itself', async () => {
    const dead = await makeCo({ status: 'voided' });
    const { error } = await admin
      .from('change_orders')
      .update({ supersedes_change_order_id: dead })
      .eq('id', dead)
      .select('id');
    // The immutability freeze fires first on a non-draft row; either refusal is
    // the correct one, and both leave the column NULL.
    expect(error).not.toBeNull();
    expect((await row(dead))?.supersedes_change_order_id).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('L4 — DELETE: unsigned only, and the FK deadlock is gone', () => {
  it('L4a — ⚠️ an Owner deletes an UNSIGNED sent CO **that has a line item**', async () => {
    // THE #1-s167fx CASE, exactly. Before `20261023000000` this was impossible
    // in both directions: the parent was FK-blocked by its line, and the line
    // was frozen by its parent.
    const id = await makeCo({ status: 'sent' });
    const { data: lines } = await admin
      .from('change_order_line_items')
      .select('id')
      .eq('change_order_id', id);
    expect(lines ?? [], 'no line — this would not reproduce #1-s167fx').toHaveLength(1);

    const { error } = await ownerC.from('change_orders').delete().eq('id', id).select('id');
    expect(error).toBeNull();
    expect(await row(id)).toBeNull();

    // ⚠️ AND THE CASCADE REACHED THE CHILD. `enforce_co_line_parent_open()`'s
    // early return — written for a CASCADE that did not exist until now — is
    // what let this through. Asserted rather than assumed.
    const { data: orphans } = await admin
      .from('change_order_line_items')
      .select('id')
      .eq('change_order_id', id);
    expect(orphans ?? []).toHaveLength(0);
  });

  it('L4b — a draft deletes too', async () => {
    const id = await makeCo({ status: 'draft' });
    const { error } = await ownerC.from('change_orders').delete().eq('id', id).select('id');
    expect(error).toBeNull();
    expect(await row(id)).toBeNull();
  });

  it('L4c — 🔴 a SIGNED change order does NOT delete, for an Owner', async () => {
    // The STABLE fixture, not a fresh one. Neither this probe nor L4d mutates
    // it — the delete is refused, so the row is untouched — and a fresh signed
    // CO per run would strand two more permanently undeletable rows every time.
    const id = await permanentSignedCo();
    const { error } = await ownerC.from('change_orders').delete().eq('id', id).select('id');
    // Two guards could answer here — the RLS policy excludes it silently, the
    // trigger refuses it loudly. Either way the row must still exist.
    expect(await row(id), 'a signed change order was deleted').not.toBeNull();
    if (error) expect(error.message).toMatch(/signed change order cannot be deleted/i);
  });

  it('L4d — 🔴 nor for the SERVICE ROLE. This one has no escape hatch, deliberately', async () => {
    // The ruling is about the record, not about who is asking: "being able to
    // prove you never sent one is a claim the system must not be able to make
    // falsely." A service-role exemption would be that claim, available to any
    // background job or migration.
    const id = await permanentSignedCo();
    const { error } = await admin.from('change_orders').delete().eq('id', id);
    expect(error?.message ?? '').toMatch(/signed change order cannot be deleted/i);
    expect(await row(id)).not.toBeNull();
  });

  it('L4e — a PM cannot delete, even one they authored and may void', async () => {
    const id = await makeCo({ status: 'sent', createdBy: pmUserId });
    await pmC.from('change_orders').delete().eq('id', id).select('id');
    expect((await row(id))?.status, 'a PM deleted a change order').toBe('sent');

    // ...and the counterfactual, so this is a statement about DELETE and not
    // about the PM being unable to touch the row at all.
    const { error: voidError } = await tryVoid(pmC, id, 'but the PM can still void it');
    expect(voidError).toBeNull();
    expect((await row(id))?.status).toBe('voided');
  });

  it('L4f — a foreman cannot delete', async () => {
    const id = await makeCo({ status: 'draft' });
    await foremanC.from('change_orders').delete().eq('id', id).select('id');
    expect(await row(id)).not.toBeNull();
  });
});
