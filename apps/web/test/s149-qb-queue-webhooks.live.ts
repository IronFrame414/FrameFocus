import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// S149 — 7G slices 2 and 3: entity ids, the sync queue, webhooks, read budget.
//
// Migrations: 20260929000000_qb_entity_ids_and_queue.sql
//             20260930000000_qb_webhooks_and_read_budget.sql
// Spec:       7g1-spec.md §S, §7G.7 (the queue), §7G.3a (metering)
// Scope:      SCHEMA, RLS AND PROBES ONLY. No OAuth route, no worker, no UI.
// ============================================================================
//
// ⚠️ NOTHING HERE CALLS INTUIT, by ruling. The queue's state machine, the
// idempotency guarantee and the budget counter are all fully testable without a
// network; the API contract is not, and a live call would meter against the
// Workspace-wide CorePlus quota §7G.3a exists to protect.
//
// ⚠️ WHICH PROBES RUN AS A REAL USER, AND WHICH DO NOT — the distinction
// matters and is deliberate:
//
//   RLS         must run as a REAL USER on an anon-key client carrying a real
//               JWT. A probe run as `postgres` or the service role bypasses RLS
//               and proves nothing.
//   TRIGGERS    fire for EVERY role, including postgres. So a service-role
//               write is valid evidence about a trigger — that is how #1-s143
//               was proved at S148 — but only for the trigger, never for RLS.
//   CHECKS      likewise bind every role.
//
// ⚠️ THIS FILE CREATES NO COMPANY, so `company-purge` (#2-s147) does not apply.
// It writes queue / webhook / budget rows and deletes every one in afterAll,
// and it restores the two entity-id columns it touches.

const OWNER = 'josh+test50@worthprop.com';
const ADMIN_USER = 'josh+qa-admin@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const OTHER_CO_OWNER = 'josh+qa-b-owner@worthprop.com';

const MARKER = 'S149';

let ownerC: SupabaseClient;
let adminC: SupabaseClient;
let pmC: SupabaseClient;
let otherCoC: SupabaseClient;

let companyA = '';
let companyB = '';
let contactId = '';
let assignedProjectId = '';
let invoiceId = '';

const madeQueue: string[] = [];
const madeEvents: string[] = [];
const madeBudget: string[] = [];

/**
 * ⚠️ THE VALUES THESE PROBES OVERWRITE, CAPTURED BEFORE THEY ARE OVERWRITTEN
 * [S188].
 *
 * When this file was written every `qb_*` column on every fixture row was NULL,
 * because nothing had ever written one — the connector did not exist yet. So
 * "restore" and "set to NULL" were the same operation, and the afterAll wrote
 * NULL.
 *
 * ⚠️ THEY ARE NOT THE SAME OPERATION ANY MORE, AND THE DIFFERENCE CORRUPTS
 * SOMEONE'S BOOKS. 7G is connected, and the fixture contact this file picks
 * carries a real link to a real QuickBooks Customer. Nulling it does not clean
 * up — it makes the app FORGET a customer it has already created, and the next
 * push then creates a SECOND one. A duplicate customer in a real chart of
 * accounts is the exact failure `disconnect-resets.ts` exists to prevent, and
 * this file was causing it on every run.
 *
 * Measured, not theorised: it nulled Karen Foster's link to Customer 62 on the
 * S187 battery and the link had to be restored by hand.
 */
let originalCustomerId: string | null = null;
let originalSubCustomerId: string | null = null;
let originalVoidMemo: string | null = null;

/** A queue row, service-role — the only writer the design admits. */
async function enqueue(fields: Record<string, unknown>): Promise<{ id?: string; error: unknown }> {
  const { data, error } = await admin
    .from('qb_sync_queue')
    .insert({ company_id: companyA, ...fields })
    .select('id')
    .single();
  if (data) madeQueue.push((data as { id: string }).id);
  return { id: (data as { id: string } | null)?.id, error };
}

beforeAll(async () => {
  assertRebuildTest();
  [ownerC, adminC, pmC, otherCoC] = (await Promise.all([
    sessionFor(OWNER),
    sessionFor(ADMIN_USER),
    sessionFor(PM),
    sessionFor(OTHER_CO_OWNER),
  ])) as SupabaseClient[];

  const { data: prof } = await admin
    .from('profiles').select('company_id').eq('email', OWNER).eq('is_deleted', false).single();
  companyA = (prof as { company_id: string }).company_id;

  const { data: other } = await admin
    .from('profiles').select('company_id').eq('email', OTHER_CO_OWNER).eq('is_deleted', false).single();
  companyB = (other as { company_id: string }).company_id;

  // ⚠️ THE PM MUST BE ABLE TO REACH EVERY ROW IT IS REFUSED ON, or the refusal
  // passes because RLS hid the row rather than because the trigger guarded the
  // column (#1-s146). `projects_update_authorized` admits a PM only on an
  // ASSIGNED project, so the project is chosen from their assignments.
  const { data: pmProfile } = await admin
    .from('profiles').select('id').eq('email', PM).eq('is_deleted', false).single();
  const { data: pmMember } = await admin
    .from('company_members').select('id').eq('profile_id', (pmProfile as { id: string }).id).maybeSingle();
  const { data: assignments } = await admin
    .from('project_assignments').select('project_id').eq('member_id', (pmMember as { id: string }).id);
  const assigned = (assignments ?? []).map((a) => (a as { project_id: string }).project_id);
  expect(assigned.length, 'the PM identity has no project assignments').toBeGreaterThan(0);
  assignedProjectId = assigned[0];

  const { data: contact } = await admin
    .from('contacts').select('id').eq('company_id', companyA).eq('is_deleted', false)
    .order('created_at', { ascending: true }).limit(1).single();
  contactId = (contact as { id: string }).id;

  // [Invoice floor, 2ff9966 / redesign battery] Picked through the PM's OWN
  // client, not admin's — the qb_void_memo test needs an invoice the PM can
  // MATCH through the SELECT policy, or the update matches zero rows, error is
  // null, and the refusal assertion fails (the exact 0f5d37e trap, mirrored).
  // This is also the S165 rule: the caller depends on a property (PM-visible)
  // the old admin-side `.limit(1)` never scoped for; ordering alone would
  // only have made the wrong pick stable.
  const { data: invoice } = await pmC
    .from('invoices').select('id').eq('company_id', companyA).eq('is_deleted', false)
    .order('created_at', { ascending: true }).limit(1).single();
  invoiceId = (invoice as { id: string }).id;

  // ⚠️ CAPTURE BEFORE ANY PROBE WRITES [S188]. Two probes below deliberately
  // put marker values in these columns; each puts the ORIGINAL back, and these
  // are what "original" means. See the declarations above for why NULL is no
  // longer a safe stand-in for it.
  const { data: before } = await admin
    .from('contacts').select('qb_customer_id').eq('id', contactId).single();
  originalCustomerId = (before as { qb_customer_id: string | null }).qb_customer_id;

  const { data: beforeProject } = await admin
    .from('projects').select('qb_sub_customer_id').eq('id', assignedProjectId).single();
  originalSubCustomerId =
    (beforeProject as { qb_sub_customer_id: string | null }).qb_sub_customer_id;

  const { data: beforeInvoice } = await admin
    .from('invoices').select('qb_void_memo').eq('id', invoiceId).single();
  originalVoidMemo = (beforeInvoice as { qb_void_memo: string | null }).qb_void_memo;

  // Self-heal. A run that died — or a MUTATION run in which the deliberately
  // added INSERT policy let a row through that `enqueue()` never tracked —
  // leaves queue rows this file's afterAll cannot reach by id. Keyed on the
  // company and the fixture subjects rather than on ids captured this run,
  // which is the #2-s147 rule applied to a table that is not `companies`.
  //
  // ⚠️ SCOPED TO THIS FILE'S OWN SUBJECTS [S188]. It used to delete EVERY queue
  // row and EVERY webhook event for the company, which was harmless when
  // nothing else wrote them and is not harmless now:
  //
  //   * a `qb_sync_queue` row is a record's PENDING PUSH. Deleting it does not
  //     re-queue anything — the enqueue triggers fire on a CHANGE — so that
  //     invoice simply never reaches QuickBooks, and nothing reports it.
  //   * since M-N a `qb_webhook_events` row with `processed_at IS NULL` is
  //     INBOUND WORK WE STILL OWE. Deleting it discards a real client payment,
  //     and Intuit's own retry is deduped away by the row we just removed.
  //
  // Every row this file creates hangs off `contactId` or `invoiceId`, and every
  // event it creates carries the `S149-` marker, so the narrower filter catches
  // exactly what the broad one was for.
  await admin
    .from('qb_sync_queue').delete().eq('company_id', companyA)
    .in('entity_id', [contactId, invoiceId]);
  await admin
    .from('qb_webhook_events').delete().eq('company_id', companyA)
    .like('intuit_event_id', `${MARKER}-%`);
});

afterAll(async () => {
  // S105b item 10 (FILL-10.2) — independent deletes so one failure cannot skip
  // the others. The connection-state restore for S149-E now lives in that test's
  // own `finally`, not here; a hard process kill mid-`it` is the only residual
  // window, repaired by re-running the file or reconnecting the tenant by hand.
  const steps: Array<[string, () => PromiseLike<unknown>]> = [
    ...(madeQueue.length ? [['qb_sync_queue', () => admin.from('qb_sync_queue').delete().in('id', madeQueue)] as [string, () => PromiseLike<unknown>]] : []),
    ...(madeEvents.length ? [['qb_webhook_events', () => admin.from('qb_webhook_events').delete().in('id', madeEvents)] as [string, () => PromiseLike<unknown>]] : []),
    ...(madeBudget.length ? [['qb_read_budget', () => admin.from('qb_read_budget').delete().in('id', madeBudget)] as [string, () => PromiseLike<unknown>]] : []),
  ];
  const failures: string[] = [];
  for (const [label, run] of steps) {
    try {
      await run();
    } catch (e) {
      failures.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (failures.length > 0) throw new Error(`S149 afterAll cleanup left rows: ${failures.join('; ')}`);

  // ⚠️ THE THREE `update({ qb_*: null })` LINES THAT STOOD HERE ARE GONE
  // [S188]. Superseded text, quoted rather than deleted:
  //
  //     await admin.from('contacts').update({ qb_customer_id: null })…
  //     await admin.from('projects').update({ qb_sub_customer_id: null })…
  //     await admin.from('invoices').update({ qb_void_memo: null })…
  //
  // They were written as "restore" and they were correct as restore for exactly
  // as long as those columns were always NULL. Once the connector shipped they
  // became a DESTRUCTIVE WRITE dressed as cleanup, and the file had no way to
  // notice: nulling the link is also what makes the stale assertion in S149-A
  // pass, so the damage bought the green tick. It failed on a fresh link and
  // passed on the second run, having deleted the thing that made it fail.
  //
  // The probe that writes a marker now puts the original back itself, in the
  // test, where the value that was overwritten is actually known.
});

// ─────────────────────────────────────────────────────────────────────────────

describe('S149-A — the new entity-id columns are connector-written, not hand-written', () => {
  it('a PM is refused on contacts.qb_customer_id — and CAN edit the same row otherwise', async () => {
    // `contacts_update_authorized` admits a PM, so the row is reachable and the
    // TRIGGER is what refuses. The pairing below proves that.
    const { error } = await pmC
      .from('contacts').update({ qb_customer_id: `${MARKER}-cust` }).eq('id', contactId);
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/written by the connector/i);

    // ⚠️ INVERTED [S188]. This asserted `.toBeNull()`, which tested the wrong
    // fact and tested it against live data.
    //
    // What the probe proves is that the PM's write was REFUSED — so the column
    // must be UNCHANGED. It is not "the column is empty": that was only ever
    // true because the connector had never run, and once it had, the assertion
    // could be satisfied in two ways — the write being refused (what we want to
    // know) or the link having been destroyed (what the afterAll was doing).
    // An assertion with two roads to green is not a test of either.
    const { data: row } = await admin
      .from('contacts').select('qb_customer_id, notes').eq('id', contactId).single();
    const after = (row as { qb_customer_id: string | null }).qb_customer_id;
    expect(after, 'the PM write was refused, so the column must not carry the marker')
      .not.toBe(`${MARKER}-cust`);
    expect(after, 'the refusal must leave the existing QuickBooks link untouched')
      .toBe(originalCustomerId);

    const prior = (row as { notes: string | null }).notes;
    const { error: ok } = await pmC
      .from('contacts').update({ notes: `${MARKER} reachable` }).eq('id', contactId);
    expect(ok, 'the PM cannot write this contact at all — the refusal is vacuous').toBeNull();
    await admin.from('contacts').update({ notes: prior }).eq('id', contactId);
  });

  it('⚠️ a PM on projects.qb_sub_customer_id gets the CONNECTOR message, not the financial one', async () => {
    // `enforce_projects_column_scope` raises TWO different exceptions. The QB
    // column got its own RAISE deliberately: a connector column is not a
    // financial term, and a message naming the wrong cause is worse than none.
    const { error } = await pmC
      .from('projects').update({ qb_sub_customer_id: `${MARKER}-sub` }).eq('id', assignedProjectId);
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/written by the connector/i);
    expect(error?.message).not.toMatch(/financial terms/i);

    // Inverted for the same reason as the contact probe above [S188]: the fact
    // under test is that the write was refused, not that the column is empty.
    const { data } = await admin
      .from('projects').select('qb_sub_customer_id').eq('id', assignedProjectId).single();
    const afterSub = (data as { qb_sub_customer_id: string | null }).qb_sub_customer_id;
    expect(afterSub).not.toBe(`${MARKER}-sub`);
    expect(afterSub).toBe(originalSubCustomerId);
  });

  it('…and the SAME project still raises the FINANCIAL message for a financial column', async () => {
    // Proves the two RAISEs are actually distinct rather than one message that
    // happens to match both patterns.
    const { error } = await pmC
      .from('projects').update({ tax_rate: 0.07 }).eq('id', assignedProjectId);
    expect(error?.message).toMatch(/financial terms of a project/i);
  });

  it('a PM is refused on invoices.qb_void_memo', async () => {
    const { error } = await pmC
      .from('invoices').update({ qb_void_memo: `${MARKER}-memo` }).eq('id', invoiceId);
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/written by the connector/i);
  });

  it('the service role writes all three — the guards are column-scoped, not blanket', async () => {
    // ⚠️ THIS IS THE PROBE THAT ACTUALLY OVERWRITES THE LIVE LINKS, and it has
    // to: proving the guard is column-scoped rather than blanket means really
    // writing the column as the service role. What it must not do is LEAVE the
    // marker there.
    const { error: e1 } = await admin
      .from('contacts').update({ qb_customer_id: `${MARKER}-cust` }).eq('id', contactId);
    const { error: e2 } = await admin
      .from('projects').update({ qb_sub_customer_id: `${MARKER}-sub` }).eq('id', assignedProjectId);
    const { error: e3 } = await admin
      .from('invoices').update({ qb_void_memo: `${MARKER}-memo` }).eq('id', invoiceId);

    // ⚠️ RESTORED HERE, IN THE TEST, NOT IN afterAll [S188]. Two reasons, and
    // the second is the one that bit.
    //
    // 1. The window matters. Between the write above and this restore the
    //    contact points at a QuickBooks customer called "S149-cust", and a
    //    drain landing in that window would push an update at an id that does
    //    not exist. Narrowing the window to a few statements is free.
    // 2. afterAll is the wrong place to know the value. It ran far from the
    //    write, could not see what had been overwritten, and "restored" a
    //    constant — which is how a cleanup step came to be the most destructive
    //    thing in the file.
    await admin.from('contacts').update({ qb_customer_id: originalCustomerId }).eq('id', contactId);
    await admin
      .from('projects').update({ qb_sub_customer_id: originalSubCustomerId })
      .eq('id', assignedProjectId);
    await admin.from('invoices').update({ qb_void_memo: originalVoidMemo }).eq('id', invoiceId);

    expect([e1, e2, e3]).toEqual([null, null, null]);

    // And the restore itself is asserted, because a silent failure here is the
    // original defect wearing a different hat.
    const { data: back } = await admin
      .from('contacts').select('qb_customer_id').eq('id', contactId).single();
    expect(
      (back as { qb_customer_id: string | null }).qb_customer_id,
      'the QuickBooks link was not put back — do not leave the suite in this state'
    ).toBe(originalCustomerId);
  });
});

describe('S149-B — qb_synced_at symmetry [A9]', () => {
  it('⚠️ all FIVE synced objects carry it — 1-of-5 and 2-of-5 are the same defect', async () => {
    // `qb_synced_at` answers one question — "when did this record last agree
    // with QuickBooks" — and it is the same question for every synced object.
    // Before S149 it existed on `invoices` alone. Adding it to `client_payments`
    // and stopping would have replaced a 1-of-5 asymmetry with a 2-of-5 one.
    for (const table of [
      'invoices',
      'client_payments',
      'client_refunds',
      'expenses',
      'time_clock_sessions',
    ]) {
      const { error } = await admin.from(table).select('qb_synced_at').limit(1);
      expect(error, `${table} has no qb_synced_at`).toBeNull();
    }
  });

  it('⚠️ the client_payments QB guard is UNREACHABLE below Admin — recorded, not faked', async () => {
    // `client_payments_update_owner_admin` admits only owner/admin, and
    // `enforce_client_payments_qb_scope` also lets owner/admin through. So no
    // client role can both reach the row AND be refused by the trigger: the
    // guard is defence-in-depth only, exactly like contract_documents' void
    // trigger (S146). Writing a "PM is refused" test here would pass because
    // RLS matched ZERO ROWS and returned NO ERROR (#1-s146) — a lie.
    const { data: pay } = await admin
      .from('client_payments').select('id, qb_synced_at').eq('company_id', companyA)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (!pay) return;
    const id = (pay as { id: string }).id;
    const prior = (pay as { qb_synced_at: string | null }).qb_synced_at;

    // No error, and NO ROW TOUCHED — the shape that would have been mistaken
    // for a working guard.
    await pmC.from('client_payments').update({ qb_synced_at: new Date().toISOString() }).eq('id', id);
    const { data: after } = await admin
      .from('client_payments').select('qb_synced_at').eq('id', id).single();
    expect((after as { qb_synced_at: string | null }).qb_synced_at).toBe(prior);
  });
});

describe('S149-C — the queue is readable by Owner/Admin and writable by nobody', () => {
  it('the service role enqueues; Owner and Admin can read it', async () => {
    const { id, error } = await enqueue({
      realm_id: `${MARKER}-realm`, entity_type: 'invoice', entity_id: invoiceId, operation: 'create',
    });
    expect(error).toBeNull();

    const { data: asOwner } = await ownerC.from('qb_sync_queue').select('id').eq('id', id!);
    expect(asOwner ?? []).toHaveLength(1);
    const { data: asAdmin } = await adminC.from('qb_sync_queue').select('id').eq('id', id!);
    expect(asAdmin ?? []).toHaveLength(1);
  });

  it('a PM reads NOTHING — and is not a broken session', async () => {
    const { data } = await pmC.from('qb_sync_queue').select('id');
    expect(data ?? []).toHaveLength(0);
    const { data: reachable } = await pmC.from('projects').select('id').limit(1);
    expect(reachable?.length, 'the PM session is broken').toBe(1);
  });

  it("another company's Owner reads nothing of ours", async () => {
    const { data } = await otherCoC.from('qb_sync_queue').select('id');
    expect(data ?? []).toHaveLength(0);
  });

  it('⚠️ an OWNER cannot INSERT — there is no write policy at all', async () => {
    // ⚠️ THE SUBJECT MUST BE ONE NO LIVE ROW ALREADY HOLDS, and the assertion
    // must name RLS specifically. The first version reused the invoice queued
    // above and asserted /row-level security|violates/ — which "duplicate key
    // value VIOLATES unique constraint" also matches. It passed against a
    // deliberately added INSERT policy, i.e. it was testing the unique index,
    // not the absence of a write policy. Found by mutation, which is the point
    // of mutation.
    const { error } = await ownerC.from('qb_sync_queue').insert({
      company_id: companyA,
      entity_type: 'time_activity',
      entity_id: assignedProjectId,
      operation: 'update',
    });
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/row-level security/i);
    expect(error?.message).not.toMatch(/duplicate key/i);

    // …and nothing landed.
    const { data } = await admin
      .from('qb_sync_queue').select('id')
      .eq('entity_type', 'time_activity').eq('entity_id', assignedProjectId);
    expect(data ?? []).toHaveLength(0);
  });

  it('⚠️ an OWNER cannot UPDATE — and the assertion is the ROW, not the error', async () => {
    // #1-s146: with no UPDATE policy the write matches zero rows and Postgres
    // reports NO ERROR. Asserting on `error` here would pass for the wrong
    // reason on any future change.
    const id = madeQueue[0];
    await ownerC.from('qb_sync_queue').update({ status: 'pushed' }).eq('id', id);
    const { data } = await admin.from('qb_sync_queue').select('status').eq('id', id).single();
    expect((data as { status: string }).status).toBe('queued');
  });
});

describe('S149-D — the queue invariants', () => {
  it('the four vocabularies are CHECK-bound', async () => {
    const bad = [
      { field: 'status', row: { entity_type: 'invoice', entity_id: invoiceId, operation: 'update', status: 'synced' }, re: /qb_sync_queue_status_check/ },
      { field: 'entity_type', row: { entity_type: 'estimate', entity_id: invoiceId, operation: 'update' }, re: /entity_type_check/ },
      { field: 'operation', row: { entity_type: 'invoice', entity_id: invoiceId, operation: 'delete' }, re: /operation_check/ },
    ];
    for (const b of bad) {
      const { error } = await enqueue(b.row);
      expect(error, `${b.field} accepted an out-of-vocabulary value`).toBeTruthy();
      expect((error as { message: string }).message).toMatch(b.re);
    }
  });

  it('a row cannot depend on itself', async () => {
    const { id } = await enqueue({
      entity_type: 'customer', entity_id: contactId, operation: 'create',
    });
    const { error } = await admin
      .from('qb_sync_queue').update({ depends_on_id: id }).eq('id', id!);
    expect(error?.message).toMatch(/no_self_dependency/);
  });

  it('⚠️ one LIVE entry per (entity, operation) — QB has no PUT, so a double push creates a double object', async () => {
    const { error: first } = await enqueue({
      entity_type: 'vendor', entity_id: contactId, operation: 'create',
    });
    expect(first).toBeNull();

    const { error: second } = await enqueue({
      entity_type: 'vendor', entity_id: contactId, operation: 'create',
    });
    expect(second).toBeTruthy();
    expect((second as { message: string }).message).toMatch(/one_live_per_entity_op|duplicate key/i);
  });

  it('…but the SAME entity may be re-queued once the first is `pushed` — the index is partial', async () => {
    const live = madeQueue.find(Boolean)!;
    const { data: rows } = await admin
      .from('qb_sync_queue').select('id').eq('entity_type', 'vendor').eq('entity_id', contactId)
      .eq('status', 'queued');
    const target = (rows ?? [])[0] as { id: string };
    await admin.from('qb_sync_queue').update({ status: 'pushed' }).eq('id', target.id);

    const { error } = await enqueue({
      entity_type: 'vendor', entity_id: contactId, operation: 'create',
    });
    expect(error, 'a pushed row still blocks re-queueing — the index is not partial').toBeNull();
    expect(live).toBeTruthy();
  });
});

describe('S149-E — needs_reauth KEEPS QUEUEING [Josh, S148]', () => {
  it('⚠️ nothing is marked failed, and new work still enqueues, while the connection is broken', async () => {
    // The ruling: on invalid_grant the work is still valid, nothing is wrong
    // with the records, and it flows the moment they reconnect. Marking these
    // rows failed would turn a reconnect into a manual recovery.
    const { data: priorState } = await admin
      .from('companies').select('qb_connection_state, qb_realm_id, qb_token_secret_id')
      .eq('id', companyA).single();
    const prior = priorState as Record<string, unknown>;

    // ⚠️ A SCRATCH SECRET, AND ITS ERRORS ARE ASSERTED [S189]. Superseded call,
    // quoted rather than deleted:
    //
    //     const secretId = await admin.rpc('qb_vault_put', {
    //       p_company_id: companyA, p_payload: … });
    //
    // That asked Vault to CREATE a token secret for companyA — which already
    // had one, because it is the genuinely connected fixture. `vault.secrets`
    // is UNIQUE on name, so it raised 23505, `secretId.data` came back NULL,
    // and **nothing here checked**. The `needs_reauth` update below then
    // violated `companies_qb_token_required_check`, and that error was ignored
    // too. ⚠️ THE PROBE HAD BEEN PASSING WHILE DOING ALMOST NOTHING — the
    // 23505 was acting as an accidental guardrail over a swallowed error.
    //
    // M-P made `qb_vault_put` adopt an orphan of the same name instead of
    // colliding, which removed that guardrail: the call adopted companyA's
    // REAL OAuth blob, overwrote it, and the cleanup at the end of this test
    // deleted it — destroying the rebuild-test connection. M-P now refuses to
    // adopt a secret a company still points at, so this can only fail loudly;
    // the probe is corrected here so it does not need that refusal.
    //
    // The scratch id is right on its own merits: this test is about the QUEUE
    // under `needs_reauth`, and it needs a token pointer that satisfies the
    // shape CHECK. Whose credential it is has never mattered.
    const scratchSecretCompany = randomUUID();
    const secretId = await admin.rpc('qb_vault_put', {
      p_company_id: scratchSecretCompany,
      p_payload: JSON.stringify({ refresh_token: `${MARKER}-rt` }),
    });
    expect(secretId.error, `qb_vault_put: ${secretId.error?.message}`).toBeNull();
    expect(secretId.data, 'no secret id came back').toBeTruthy();

    // ⚠️ S105b item 10 (FILL-10.2) — the restore now lives in a `finally`. Before
    // this it ran as the last statements of the test body, so ANY assertion below
    // that failed skipped it and left companyA stranded in `needs_reauth` on the
    // shared live tenant — the exact exposed window FILL-10.2 names. Wrapping the
    // mutation-through-assertions in `try` and the restore in `finally` closes the
    // common case (a failed assertion); only a hard process kill can still strand
    // it, and that is documented in this file's afterAll note.
    try {
      const { error: stateError } = await admin.from('companies').update({
        qb_realm_id: `${MARKER}-reauth-realm`,
        qb_token_secret_id: secretId.data as unknown as string,
        qb_connection_state: 'needs_reauth',
      }).eq('id', companyA);
      expect(
        stateError,
        'the company never reached needs_reauth, so everything below is vacuous'
      ).toBeNull();

      // Existing work is untouched…
      const { data: still } = await admin
        .from('qb_sync_queue').select('status').eq('company_id', companyA).eq('status', 'queued');
      expect((still ?? []).length, 'queued work vanished when the connection broke').toBeGreaterThan(0);

      // …and NEW work still enqueues.
      const { error } = await enqueue({
        entity_type: 'payment', entity_id: invoiceId, operation: 'create',
        realm_id: `${MARKER}-reauth-realm`,
      });
      expect(error, 'a needs_reauth connection refused new work').toBeNull();
    } finally {
      // disconnected-first then the snapshot (the shape CHECK refuses a partial
      // restore); the scratch secret is forgotten last. Each independent so one
      // failure cannot skip the rest.
      try {
        await admin.from('companies').update({
          qb_connection_state: 'disconnected', qb_realm_id: null, qb_token_secret_id: null,
        }).eq('id', companyA);
        await admin.from('companies').update(prior).eq('id', companyA);
      } finally {
        await admin.rpc('qb_vault_forget', { p_secret_id: secretId.data as unknown as string });
      }
    }
  });
});

describe('S149-F — webhook idempotency, which protects a PAID read', () => {
  it('⚠️ the same Intuit event id cannot be recorded twice', async () => {
    const eventId = `${MARKER}-evt-${Date.now()}`;
    const row = {
      company_id: companyA, realm_id: `${MARKER}-realm`, intuit_event_id: eventId,
      entity_name: 'Invoice', entity_id: 'qb-123', operation: 'Update',
    };
    const { data: first, error: e1 } = await admin
      .from('qb_webhook_events').insert(row).select('id').single();
    expect(e1).toBeNull();
    madeEvents.push((first as { id: string }).id);

    const { error: e2 } = await admin.from('qb_webhook_events').insert(row);
    expect(e2, 'a duplicate event was accepted — a metered read would be paid twice').toBeTruthy();
    expect(e2?.message).toMatch(/intuit_event_id|duplicate key/i);
  });

  it('an event from an UNKNOWN realm is still recorded — company_id is nullable on purpose', async () => {
    // A stale grant, or a tenant that disconnected. Recording it is what makes
    // that diagnosable rather than invisible.
    const { data, error } = await admin.from('qb_webhook_events').insert({
      company_id: null, realm_id: `${MARKER}-unknown-realm`,
      intuit_event_id: `${MARKER}-orphan-${Date.now()}`,
      entity_name: 'Customer', entity_id: 'qb-999', operation: 'Create',
    }).select('id').single();
    expect(error).toBeNull();
    madeEvents.push((data as { id: string }).id);
  });

  it('Owner reads its own events; a PM reads none', async () => {
    const { data: asOwner } = await ownerC.from('qb_webhook_events').select('id').eq('company_id', companyA);
    expect((asOwner ?? []).length).toBeGreaterThan(0);
    const { data: asPm } = await pmC.from('qb_webhook_events').select('id');
    expect(asPm ?? []).toHaveLength(0);
  });

  it('an Owner cannot forge an event', async () => {
    const { error } = await ownerC.from('qb_webhook_events').insert({
      company_id: companyA, realm_id: 'forged', intuit_event_id: `${MARKER}-forged`,
      entity_name: 'Invoice', entity_id: 'x', operation: 'Update',
    });
    expect(error).toBeTruthy();
  });
});

describe('S149-G — the read-budget counter', () => {
  // ⚠️ A HISTORICAL PERIOD, NOT THIS MONTH [S188]. Superseded line, quoted:
  //
  //     const period = new Date().toISOString().slice(0, 8) + '01';
  //
  // These probes seize a (company, period) pair and assert they created it.
  // That worked while nothing else wrote the table. **The connector now owns
  // the CURRENT month's row for the connected company** — `recordCorePlusRead`
  // creates it on the first metered read — so the probe's own insert collided
  // with real data and the case failed on a working system.
  //
  // ⚠️ THE ASSERTIONS THEMSELVES WERE NEVER WRONG, and none of them changed:
  // one row per company per month, the count cannot go negative, an Owner reads
  // it, a PM does not, and nobody may edit it. Only the fixture moved. The
  // connector always writes the first of the CURRENT month, so a long-past
  // period is a pair it can never take.
  const PERIOD = '2020-01-01';

  it('one row per company per month, and the count cannot go negative', async () => {
    const period = PERIOD;
    const { data, error } = await admin
      .from('qb_read_budget').insert({ company_id: companyA, period_month: period, coreplus_reads: 10 })
      .select('id').single();
    expect(error).toBeNull();
    madeBudget.push((data as { id: string }).id);

    const { error: dup } = await admin
      .from('qb_read_budget').insert({ company_id: companyA, period_month: period });
    expect(dup, 'two counters for one period is two partial answers').toBeTruthy();
    expect(dup?.message).toMatch(/company_period_key|duplicate key/i);

    const { error: neg } = await admin
      .from('qb_read_budget').update({ coreplus_reads: -1 }).eq('id', (data as { id: string }).id);
    expect(neg?.message).toMatch(/reads_non_negative/);
  });

  it('Owner reads it; a PM does not; and nobody may edit the counter', async () => {
    const { data: asOwner } = await ownerC.from('qb_read_budget').select('id').eq('company_id', companyA);
    expect((asOwner ?? []).length).toBeGreaterThan(0);

    const { data: asPm } = await pmC.from('qb_read_budget').select('id');
    expect(asPm ?? []).toHaveLength(0);

    // A user who could edit the counter could hide consumption from the very
    // ceiling it exists to warn about. Assert the ROW (#1-s146).
    const id = madeBudget[0];
    await ownerC.from('qb_read_budget').update({ coreplus_reads: 0 }).eq('id', id);
    const { data } = await admin.from('qb_read_budget').select('coreplus_reads').eq('id', id).single();
    expect((data as { coreplus_reads: number }).coreplus_reads).toBe(10);
  });
});
