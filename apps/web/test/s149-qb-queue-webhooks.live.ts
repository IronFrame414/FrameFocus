import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
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

  // Self-heal. A run that died — or a MUTATION run in which the deliberately
  // added INSERT policy let a row through that `enqueue()` never tracked —
  // leaves queue rows this file's afterAll cannot reach by id. Keyed on the
  // company and the fixture subjects rather than on ids captured this run,
  // which is the #2-s147 rule applied to a table that is not `companies`.
  await admin.from('qb_sync_queue').delete().eq('company_id', companyA);
  await admin.from('qb_webhook_events').delete().eq('company_id', companyA);
});

afterAll(async () => {
  if (madeQueue.length) await admin.from('qb_sync_queue').delete().in('id', madeQueue);
  if (madeEvents.length) await admin.from('qb_webhook_events').delete().in('id', madeEvents);
  if (madeBudget.length) await admin.from('qb_read_budget').delete().in('id', madeBudget);
  await admin.from('contacts').update({ qb_customer_id: null }).eq('id', contactId);
  await admin.from('projects').update({ qb_sub_customer_id: null }).eq('id', assignedProjectId);
  await admin.from('invoices').update({ qb_void_memo: null }).eq('id', invoiceId);
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

    const { data: row } = await admin
      .from('contacts').select('qb_customer_id, notes').eq('id', contactId).single();
    expect((row as { qb_customer_id: string | null }).qb_customer_id).toBeNull();

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

    const { data } = await admin
      .from('projects').select('qb_sub_customer_id').eq('id', assignedProjectId).single();
    expect((data as { qb_sub_customer_id: string | null }).qb_sub_customer_id).toBeNull();
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
    const { error: e1 } = await admin
      .from('contacts').update({ qb_customer_id: `${MARKER}-cust` }).eq('id', contactId);
    const { error: e2 } = await admin
      .from('projects').update({ qb_sub_customer_id: `${MARKER}-sub` }).eq('id', assignedProjectId);
    const { error: e3 } = await admin
      .from('invoices').update({ qb_void_memo: `${MARKER}-memo` }).eq('id', invoiceId);
    expect([e1, e2, e3]).toEqual([null, null, null]);
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

    const secretId = await admin.rpc('qb_vault_put', {
      p_company_id: companyA, p_payload: JSON.stringify({ refresh_token: `${MARKER}-rt` }),
    });

    await admin.from('companies').update({
      qb_realm_id: `${MARKER}-reauth-realm`,
      qb_token_secret_id: secretId.data as unknown as string,
      qb_connection_state: 'needs_reauth',
    }).eq('id', companyA);

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

    await admin.from('companies').update({
      qb_connection_state: 'disconnected', qb_realm_id: null, qb_token_secret_id: null,
    }).eq('id', companyA);
    await admin.from('companies').update(prior).eq('id', companyA);
    await admin.rpc('qb_vault_forget', { p_secret_id: secretId.data as unknown as string });
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
  it('one row per company per month, and the count cannot go negative', async () => {
    const period = new Date().toISOString().slice(0, 8) + '01';
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
