import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, assertRebuildTest, sessionFor } from './live-session';

// ============================================================================
// S146 — the 7I services, EXECUTED. `contracts.ts` + `contracts-client.ts`.
//
// Migration: 20260926000000_7i_contracts.sql
// Spec:      docs/specs/7I-spec.md §8 (roles, REWRITTEN S145), §10 (schema)
// ============================================================================
//
// ⚠️ WHY THIS FILE EXISTS. S145 landed schema + services + probes and chose
// [C4=(b)] to defer the UI precisely BECAUSE the service layer is where the
// guards live. `s145-contracts.live.ts` probed the RLS floor by writing to the
// tables directly; it never called a single service function, and no UI calls
// them either. Shipping that layer unexercised defeats the reasoning that
// chose to land it.
//
// ⚠️ ONLY THE CLIENT FACTORY IS REPLACED. `state.client` is a real anon-key
// client on a real user JWT — the shipped service functions run unmodified,
// under exactly the policies they run under in the browser. Same technique as
// `s97ct-7e-clicktest.live.ts:37`.
//
// ⚠️ THE MOST IMPORTANT TEST HERE IS S146-C4. `voidContractDocument(id, role,
// status, reason)` takes the caller's role as a PARAMETER, so a caller who
// passes `role: 'owner'` walks straight past `canVoidContract()`. The service
// check is a message, not a gate. What actually refuses that caller is
// `enforce_contract_void_authority` in the database — and C4 proves it by
// making the lie and watching Postgres refuse it.

const state = vi.hoisted(() => ({ client: null as unknown as SupabaseClient }));
vi.mock('@/lib/supabase-browser', () => ({ createClient: () => state.client }));
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => state.client }));

// REAL shipped 7I services.
import {
  clientContractAppliesToEstimate,
  getContractDocumentsForEstimate,
  getContractDocumentsForSubContract,
  getContractTemplateBoxes,
  getContractTemplates,
} from '@/lib/services/contracts';
import {
  createContractTemplate,
  saveContractBoxMap,
  softDeleteContractTemplate,
  updateContractTemplate,
  voidContractDocument,
} from '@/lib/services/contracts-client';
import { catalogForKind } from '@/lib/services/contracts-shared';

const OWNER = 'josh+test50@worthprop.com';
const ADMIN_USER = 'josh+qa-admin@worthprop.com';
const PM = 'josh+pm@worthprop.com';
const OTHER_CO_OWNER = 'josh+qa-b-owner@worthprop.com';

const MARKER = 'S146SVC';

let ownerC: SupabaseClient;
let adminC: SupabaseClient;
let pmC: SupabaseClient;
/** Company B's OWNER — an owner by role, blind to company A by RLS. */
let otherCoC: SupabaseClient;

let companyId = '';
let estimateId = '';
let subContractId = '';
let projectId = '';
let clientTemplateId = '';
let subTemplateId = '';
let documentId = '';

const madeTemplates: string[] = [];
const madeDocuments: string[] = [];

beforeAll(async () => {
  assertRebuildTest();
  [ownerC, adminC, pmC, otherCoC] = (await Promise.all([
    sessionFor(OWNER),
    sessionFor(ADMIN_USER),
    sessionFor(PM),
    sessionFor(OTHER_CO_OWNER),
  ])) as SupabaseClient[];
  state.client = ownerC;

  const { data: prof } = await admin
    .from('profiles')
    .select('company_id')
    .eq('email', OWNER)
    .eq('is_deleted', false)
    .single();
  companyId = (prof as { company_id: string }).company_id;

  // self-heal after a crashed run
  // NOT scoped to companyId — the fixture also creates a template in company B.
  const { data: stale } = await admin
    .from('contract_templates')
    .select('id')
    .like('name', `${MARKER}%`);
  const staleIds = (stale ?? []).map((t) => (t as { id: string }).id);
  if (staleIds.length) {
    await admin.from('contract_documents').delete().in('template_id', staleIds);
    await admin.from('contract_template_boxes').delete().in('template_id', staleIds);
    await admin.from('contract_templates').delete().in('id', staleIds);
  }

  // ⚠️ THE SUBJECT MUST BE PM-VISIBLE, or C4's refusals pass for the wrong
  // reason — "no visibility" rather than "no authority". This is the fixture
  // defect S145 found in two of its own harnesses; constrained up front here.
  const { data: pmProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', PM)
    .eq('is_deleted', false)
    .single();
  const { data: pmMember } = await admin
    .from('company_members')
    .select('id')
    .eq('profile_id', (pmProfile as { id: string }).id)
    .maybeSingle();
  const { data: assignments } = await admin
    .from('project_assignments')
    .select('project_id')
    .eq('member_id', (pmMember as { id: string }).id);
  const assigned = (assignments ?? []).map((a) => (a as { project_id: string }).project_id);
  expect(assigned.length, 'the PM identity has no project assignments').toBeGreaterThan(0);

  const { data: contract } = await admin
    .from('subcontractor_contracts')
    .select('id, project_id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .in('project_id', assigned)
    .limit(1)
    .single();
  subContractId = (contract as { id: string }).id;
  projectId = (contract as { project_id: string }).project_id;

  const { data: estimate } = await admin
    .from('estimates')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .limit(1)
    .single();
  estimateId = (estimate as { id: string }).id;

});


afterAll(async () => {
  if (madeDocuments.length) await admin.from('contract_documents').delete().in('id', madeDocuments);
  const { data: tpls } = await admin
    .from('contract_templates')
    .select('id')
    .like('name', `${MARKER}%`);
  const ids = (tpls ?? []).map((t) => (t as { id: string }).id);
  if (ids.length) {
    await admin.from('contract_documents').delete().in('template_id', ids);
    await admin.from('contract_template_boxes').delete().in('template_id', ids);
    await admin.from('contract_templates').delete().in('id', ids);
  }
});

// ─────────────────────────────────────────────────────────────────────────────

describe('S146-C1 — template CRUD through the shipped service', () => {
  it('an Owner creates both kinds, and getContractTemplates reads them back', async () => {
    state.client = ownerC;

    const client = await createContractTemplate({
      name: `${MARKER} client form`,
      document_kind: 'client_contract',
    });
    expect(client.error).toBeUndefined();
    expect(client.success).toBe(true);
    clientTemplateId = client.id!;
    madeTemplates.push(clientTemplateId);

    const sub = await createContractTemplate({
      name: `${MARKER} sub form`,
      document_kind: 'sub_contract',
    });
    expect(sub.success).toBe(true);
    subTemplateId = sub.id!;
    madeTemplates.push(subTemplateId);

    // The READ half, also never executed before now.
    const all = await getContractTemplates();
    expect(all.map((t) => t.id)).toEqual(expect.arrayContaining([clientTemplateId, subTemplateId]));

    // …and the kind filter actually filters.
    const onlySub = await getContractTemplates('sub_contract');
    expect(onlySub.map((t) => t.id)).toContain(subTemplateId);
    expect(onlySub.map((t) => t.id)).not.toContain(clientTemplateId);
    for (const t of onlySub) expect(t.document_kind).toBe('sub_contract');
  });

  it('an Admin may too — the floor is Owner/Admin, not Owner', async () => {
    state.client = adminC;
    const res = await createContractTemplate({
      name: `${MARKER} admin form`,
      document_kind: 'client_contract',
    });
    expect(res.success).toBe(true);
    madeTemplates.push(res.id!);
  });

  it('a PM is REFUSED, and gets the friendly message rather than a policy dump', async () => {
    state.client = pmC;
    const res = await createContractTemplate({
      name: `${MARKER} pm attempt`,
      document_kind: 'client_contract',
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('Contracts are Owner/Admin only.');

    // The refusal WROTE NOTHING. A "failed" call that still inserted is not a
    // refusal, and only a service-role read can tell the difference.
    const { data } = await admin
      .from('contract_templates')
      .select('id')
      .eq('company_id', companyId)
      .eq('name', `${MARKER} pm attempt`);
    expect(data ?? []).toHaveLength(0);
  });

  it('a PM cannot read one either — getContractTemplates returns nothing', async () => {
    state.client = pmC;
    const templates = await getContractTemplates();
    expect(templates).toHaveLength(0);

    // …and the PM session is not simply broken, which would pass the line above
    // for a reason that has nothing to do with 7I.
    const { data: reachable } = await pmC.from('projects').select('id').limit(1);
    expect(reachable?.length, 'the PM session is broken').toBe(1);
    state.client = ownerC;
  });

  it('softDeleteContractTemplate hides it from the read without destroying it', async () => {
    state.client = ownerC;
    const made = await createContractTemplate({
      name: `${MARKER} doomed`,
      document_kind: 'client_contract',
    });
    madeTemplates.push(made.id!);

    expect((await getContractTemplates()).map((t) => t.id)).toContain(made.id);
    expect((await softDeleteContractTemplate(made.id!)).success).toBe(true);
    expect((await getContractTemplates()).map((t) => t.id)).not.toContain(made.id);

    // Soft, not hard — the row survives for an audit (CLAUDE.md trash-bin rule).
    const { data } = await admin
      .from('contract_templates')
      .select('is_deleted, deleted_at')
      .eq('id', made.id!)
      .single();
    expect((data as { is_deleted: boolean }).is_deleted).toBe(true);
    expect((data as { deleted_at: string | null }).deleted_at).toBeTruthy();
  });
});

describe('S146-C2 — the box map REPLACES, and is validated per document_kind', () => {
  it('saveContractBoxMap writes a map that getContractTemplateBoxes reads back', async () => {
    state.client = ownerC;
    const key = catalogForKind('client_contract')[0].key;

    const res = await saveContractBoxMap(clientTemplateId, 'client_contract', [
      { page: 0, x: 0.1, y: 0.1, width: 0.3, height: 0.04, kind: 'value', value_key: key },
      { page: 0, x: 0.1, y: 0.2, width: 0.3, height: 0.06, kind: 'signature', party: 'contractor' },
    ]);
    expect(res.error).toBeUndefined();

    const boxes = await getContractTemplateBoxes(clientTemplateId);
    expect(boxes).toHaveLength(2);
    expect(boxes.filter((b) => b.kind === 'value')[0].value_key).toBe(key);
    // R4/R5 [S150] — the party round-trips, and a value box carries none.
    expect(boxes.filter((b) => b.kind === 'signature')[0].party).toBe('contractor');
    expect(boxes.filter((b) => b.kind === 'value')[0].party).toBeNull();
  });

  // R4/R5 [S150] — added when `party` landed. Before it, a signature box knew
  // it was a signature but not WHOSE, so only one of the two parties on a
  // two-party instrument could ever be stamped.
  it('a signature or initials box with NO party is refused before any write', async () => {
    state.client = ownerC;
    const before = await getContractTemplateBoxes(clientTemplateId);

    for (const kind of ['signature', 'initial'] as const) {
      const res = await saveContractBoxMap(clientTemplateId, 'client_contract', [
        { page: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.04, kind },
      ]);
      expect(res.success, `${kind} with no party must be refused`).toBe(false);
      expect(res.error).toMatch(/who signs it/i);
    }

    // Refused BEFORE the clear, exactly like the key-vs-kind guard — otherwise
    // an invalid save would wipe a good map on its way to failing.
    expect(await getContractTemplateBoxes(clientTemplateId)).toHaveLength(before.length);
  });

  it('a second save REPLACES the map — it does not merge', async () => {
    // Replace-not-merge depends on a DELETE policy existing on
    // `contract_template_boxes`. With no DELETE policy the clear would remove
    // nothing, return no error, and the map would silently GROW — a box the
    // user deleted would come back on a legal document. That is why this is
    // asserted on the count rather than on the call's success flag.
    state.client = ownerC;
    const res = await saveContractBoxMap(clientTemplateId, 'client_contract', [
      { page: 0, x: 0.5, y: 0.5, width: 0.2, height: 0.04, kind: 'initial', party: 'recipient' },
    ]);
    expect(res.error).toBeUndefined();

    const boxes = await getContractTemplateBoxes(clientTemplateId);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].kind).toBe('initial');
  });

  it('a client-only key on a SUB template is refused BEFORE anything is written', async () => {
    state.client = ownerC;
    const clientOnly = catalogForKind('client_contract').find(
      (v) => !v.sides.includes('sub_contract')
    );
    expect(clientOnly, 'no client-only key in the catalog — this test is vacuous').toBeTruthy();

    // Seed a box so "nothing was written" is distinguishable from "nothing was
    // there". If the guard ran AFTER the clear, this box would be gone.
    await saveContractBoxMap(subTemplateId, 'sub_contract', [
      { page: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.04, kind: 'signature', party: 'contractor' },
    ]);

    const res = await saveContractBoxMap(subTemplateId, 'sub_contract', [
      { page: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.04, kind: 'value', value_key: clientOnly!.key },
    ]);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/would never fill/i);

    const boxes = await getContractTemplateBoxes(subTemplateId);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].kind).toBe('signature');
  });

  it('a PM cannot save a box map', async () => {
    state.client = pmC;
    const key = catalogForKind('client_contract')[0].key;
    const res = await saveContractBoxMap(clientTemplateId, 'client_contract', [
      { page: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.04, kind: 'value', value_key: key },
    ]);
    expect(res.success).toBe(false);
    state.client = ownerC;
    // The Owner's map is untouched.
    expect(await getContractTemplateBoxes(clientTemplateId)).toHaveLength(1);
  });
});

describe('S146-C3 — document reads through the service', () => {
  it('a seeded document is visible to Owner on both read paths', async () => {
    const { data: doc, error } = await admin
      .from('contract_documents')
      .insert({
        company_id: companyId,
        template_id: subTemplateId,
        document_kind: 'sub_contract',
        sub_contract_id: subContractId,
        project_id: projectId,
        status: 'sent',
        delivery_mode: 'esignature',
        filled_values: { scope_of_work: `${MARKER} scope` },
      })
      .select('id')
      .single();
    expect(error, `seed failed: ${error?.message}`).toBeNull();
    documentId = (doc as { id: string }).id;
    madeDocuments.push(documentId);

    state.client = ownerC;
    const bySub = await getContractDocumentsForSubContract(subContractId);
    expect(bySub.map((d) => d.id)).toContain(documentId);
    expect(bySub.find((d) => d.id === documentId)!.document_kind).toBe('sub_contract');

    // The estimate path must NOT return a sub document.
    const byEstimate = await getContractDocumentsForEstimate(estimateId);
    expect(byEstimate.map((d) => d.id)).not.toContain(documentId);
  });

  it('a PM reads no documents at all', async () => {
    state.client = pmC;
    expect(await getContractDocumentsForSubContract(subContractId)).toHaveLength(0);
    state.client = ownerC;
  });
});

describe('S146-C4 — VOID AUTHORITY: resolved server-side, and a discarded write fails', () => {
  // ⚠️ THIS BLOCK PROBES THE #1-s146 FIX. Before it, `voidContractDocument`
  // took `role` as a PARAMETER and returned `{ success: true }` over a write
  // RLS had discarded. Both halves are now asserted, and both are paired with a
  // positive so neither can pass by refusing everybody.

  it('HALF 1 — a PM is refused BY THE FUNCTION, not merely by the database', async () => {
    state.client = pmC;
    const res = await voidContractDocument(documentId, 'sent', 'no longer needed');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Owner\/Admin only/i);

    const { data } = await admin
      .from('contract_documents')
      .select('status')
      .eq('id', documentId)
      .single();
    expect((data as { status: string }).status).toBe('sent');
  });

  it('⚠️ HALF 1 — THE LIE IS NO LONGER SAYABLE: role is resolved from get_my_role()', async () => {
    // The old signature was (id, role, status, reason) and a project_manager
    // passing role:'owner' cleared canVoidContract() outright — nothing in the
    // service layer read the caller's ACTUAL role, so the only thing that saved
    // the data was the database refusing the write.
    //
    // There is now no `role` argument to lie in. This test asserts the property
    // that replaced it: the SAME PM session, making the same call, is refused
    // with the Owner/Admin message — which can only be produced by a role the
    // caller did not supply. `get_my_role()` is the same SECURITY DEFINER
    // function the RLS policies call, so the service check and the database gate
    // cannot disagree about who the caller is.
    state.client = pmC;
    const res = await voidContractDocument(documentId, 'sent', 'pretending to be the owner');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Owner\/Admin only/i);

    // It is refused BEFORE the write, so the document is untouched — same
    // safety property as before, now reached one layer earlier.
    const { data } = await admin
      .from('contract_documents')
      .select('status, void_reason, voided_by, voided_at')
      .eq('id', documentId)
      .single();
    const row = data as {
      status: string;
      void_reason: string | null;
      voided_by: string | null;
      voided_at: string | null;
    };
    expect(row.status).toBe('sent');
    expect(row.void_reason).toBeNull();
    expect(row.voided_by).toBeNull();
    expect(row.voided_at).toBeNull();
  });

  it('⚠️ HALF 2 — a write RLS DISCARDS returns failure, not success', async () => {
    // The row-count half, isolated from the role half.
    //
    // The caller is company B's OWNER. `get_my_role()` returns 'owner', so
    // canVoidContract() passes and the write is genuinely attempted — but the
    // document belongs to company A, so contract_documents_update_owner_admin
    // matches no row. Postgres reports NO ERROR: the policy simply matched
    // nothing, and an UPDATE that changes nothing is valid. That is the exact
    // shape that used to return `{ success: true }`.
    //
    // A cross-tenant owner rather than a bogus id ON PURPOSE — the row EXISTS
    // and is merely invisible, which is what "RLS discarded it" means. It also
    // makes this a tenant-isolation assertion in its own right.
    state.client = otherCoC;
    const res = await voidContractDocument(documentId, 'sent', 'reaching across tenants');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not applied/i);

    // …and company A's document is untouched.
    const { data } = await admin
      .from('contract_documents')
      .select('status, void_reason')
      .eq('id', documentId)
      .single();
    expect((data as { status: string }).status).toBe('sent');
    expect((data as { void_reason: string | null }).void_reason).toBeNull();
    state.client = ownerC;
  });

  it('HALF 2 — the same failure for a row that does not exist at all', async () => {
    state.client = ownerC;
    const res = await voidContractDocument(
      '11111111-1111-1111-1111-111111111111',
      'sent',
      'no such document'
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not applied/i);
  });

  it('⚠️ the fix is GENERAL to UPDATE-shaped writes, not special to void', async () => {
    // Same mechanism, different function. A PM has no UPDATE policy on
    // contract_templates either, so the update touches nothing and Postgres
    // reports no error — updateContractTemplate() used to return success.
    // Every UPDATE-shaped write in contracts-client.ts now selects its affected
    // rows and fails when there are none.
    state.client = pmC;
    const res = await updateContractTemplate(clientTemplateId, {
      name: `${MARKER} pm renamed this`,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not applied/i);

    const { data } = await admin
      .from('contract_templates')
      .select('name')
      .eq('id', clientTemplateId)
      .single();
    expect((data as { name: string }).name).not.toBe(`${MARKER} pm renamed this`);
    state.client = ownerC;
  });

  it('an Owner CAN void it — so the refusals above are authority, not breakage', async () => {
    state.client = ownerC;
    const res = await voidContractDocument(documentId, 'sent', 'superseded by rev 2');
    expect(res.error).toBeUndefined();
    expect(res.success).toBe(true);

    const { data } = await admin
      .from('contract_documents')
      .select('status, void_reason, voided_by, voided_at')
      .eq('id', documentId)
      .single();
    const row = data as {
      status: string;
      void_reason: string;
      voided_by: string | null;
      voided_at: string | null;
    };
    expect(row.status).toBe('voided');
    expect(row.void_reason).toBe('superseded by rev 2');
    expect(row.voided_by).toBeTruthy();
    expect(row.voided_at).toBeTruthy();
  });

  it('a void with no reason is refused by the service before it reaches the database', async () => {
    state.client = ownerC;
    const { data: doc } = await admin
      .from('contract_documents')
      .insert({
        company_id: companyId,
        template_id: subTemplateId,
        document_kind: 'sub_contract',
        sub_contract_id: subContractId,
        project_id: projectId,
        status: 'sent',
        delivery_mode: 'notary',
      })
      .select('id')
      .single();
    const id = (doc as { id: string }).id;
    madeDocuments.push(id);

    const res = await voidContractDocument(id, 'sent', '   ');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/needs a reason/i);

    const { data } = await admin
      .from('contract_documents')
      .select('status')
      .eq('id', id)
      .single();
    expect((data as { status: string }).status).toBe('sent');
  });

  it('an already-voided document cannot be voided twice', async () => {
    state.client = ownerC;
    const res = await voidContractDocument(documentId, 'voided', 'again');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/already voided/i);
  });
});

describe('S146-C5 — the two-level toggle, resolved by the service', () => {
  it('both levels must be on, and either one off is off', async () => {
    state.client = ownerC;
    const { data: co } = await admin
      .from('companies')
      .select('client_contracts_enabled')
      .eq('id', companyId)
      .single();
    const { data: est } = await admin
      .from('estimates')
      .select('include_client_contract')
      .eq('id', estimateId)
      .single();
    const priorCo = (co as { client_contracts_enabled: boolean }).client_contracts_enabled;
    const priorEst = (est as { include_client_contract: boolean }).include_client_contract;

    try {
      const set = async (company: boolean, estimate: boolean) => {
        await admin
          .from('companies')
          .update({ client_contracts_enabled: company })
          .eq('id', companyId);
        await admin
          .from('estimates')
          .update({ include_client_contract: estimate })
          .eq('id', estimateId);
      };

      await set(true, true);
      expect(await clientContractAppliesToEstimate(estimateId)).toBe(true);

      await set(true, false);
      expect(await clientContractAppliesToEstimate(estimateId)).toBe(false);

      await set(false, true);
      expect(await clientContractAppliesToEstimate(estimateId)).toBe(false);

      await set(false, false);
      expect(await clientContractAppliesToEstimate(estimateId)).toBe(false);
    } finally {
      await admin
        .from('companies')
        .update({ client_contracts_enabled: priorCo })
        .eq('id', companyId);
      await admin
        .from('estimates')
        .update({ include_client_contract: priorEst })
        .eq('id', estimateId);
    }
  });
});

describe('S146-C6 — the signing-session table is READ-ONLY to everybody today', () => {
  it('no INSERT policy exists, so even an Owner cannot open a session yet', async () => {
    // §6.5's ceremony is behind Gate 1 and its writer does not exist. Recorded
    // as an assertion so that adding an INSERT policy is a deliberate act with
    // a failing test attached, rather than something that quietly becomes
    // possible.
    const { error } = await ownerC.from('contract_signing_sessions').insert({
      company_id: companyId,
      contract_document_id: documentId,
      token: `${MARKER}-token`,
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
    } as never);
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/row-level security|violates/i);
  });
});

describe('S146-C7 — updateContractTemplate, and the trigger contract', () => {
  it('an update advances updated_at and updated_by without the service setting them', async () => {
    state.client = ownerC;
    const { data: before } = await admin
      .from('contract_templates')
      .select('updated_at, updated_by')
      .eq('id', clientTemplateId)
      .single();

    await new Promise((r) => setTimeout(r, 1100));
    const res = await updateContractTemplate(clientTemplateId, {
      name: `${MARKER} client form v2`,
    });
    expect(res.error).toBeUndefined();

    const { data: after } = await admin
      .from('contract_templates')
      .select('name, updated_at, updated_by')
      .eq('id', clientTemplateId)
      .single();
    const a = after as { name: string; updated_at: string; updated_by: string | null };
    const b = before as { updated_at: string; updated_by: string | null };

    expect(a.name).toBe(`${MARKER} client form v2`);
    // CLAUDE.md's service-layer contract: the triggers own these columns and
    // the service must never set them. If the triggers were missing, the value
    // would not move and the audit trail would be silently frozen.
    expect(new Date(a.updated_at).getTime()).toBeGreaterThan(new Date(b.updated_at).getTime());
    expect(a.updated_by).toBeTruthy();
  }, 30_000);
});
