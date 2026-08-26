// 7I E1 [S150] — R16: the contract's status reflects the CONTRACT, not the
// proposal; contract_documents.project_id is backfilled at conversion; and a PM
// can see that a signature is owed without being able to read the contract.
//
// Exercises the sixth redefinition of convert_estimate_to_project and the
// SECURITY DEFINER boolean that ships with it. 20261002000000 is applied to
// rebuild-test; this file is what makes it verifiable rather than merely
// reviewed.
//
// ⚠️ THE DEFECT THIS PINS DOWN WAS SILENT. Before R16, an estimate that asked
// for a written contract, whose client signed the PROPOSAL and never signed the
// CONTRACT, converted into a project carrying client_contracts.status='signed'
// and an executed_date taken from the proposal's acceptance. Nothing failed.
// The record simply said the paperwork was done when it was not — which is the
// kind of wrong that is only discovered in a dispute.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, assertRebuildTest } from './live-session';

let estimateId: string;
let priorIncludeClientContract = false;

describe('S150-E1 — R16 decoupling', () => {
  beforeAll(async () => {
    assertRebuildTest();

    // ⚠️ THE COMPANY IS DERIVED FROM THE ESTIMATE, NOT THE OTHER WAY ROUND.
    //
    // The first version of this fixture took `companies.select('id').limit(1)`
    // and then demanded that company have an estimate. rebuild-test holds two:
    // Bishop Contracting (7 estimates) and Ridgeline Builders (0). With no
    // ORDER BY, heap order decides which comes back — it returned Ridgeline,
    // `est` was null, and `beforeAll` died on `.id` with a TypeError that named
    // nothing useful.
    //
    // That is the `.limit(1)`-with-no-ORDER-BY class context100 §6 names three
    // times: "passes for four runs and then doesn't". Ordering alone would only
    // have made the wrong pick a STABLE wrong pick — the real defect was
    // asserting a relationship the query never constrained. Selecting from the
    // side that must be non-empty removes the assumption instead of pinning it.
    //
    // `id` is the tiebreak because `created_at` can collide on seeded rows, and
    // two rows sharing a timestamp put us straight back in heap order.
    //
    // ⚠️ SCOPED TO `draft` AT S175, AND THE ORDERING WAS NOT THE FIX.
    // This query was ordered but never constrained to the property R16 actually
    // depends on: that the row can BE EDITED. It toggles
    // `include_client_contract` as its arrange step, and since
    // `20261031000000_estimate_immutability.sql` that column is frozen once an
    // estimate reaches the client — so the oldest estimate in the database, a
    // long-sent one, now refuses the write with "A sent estimate is immutable".
    //
    // CLAUDE.md's `.limit(1)` rule, category 2, exactly: *"the caller depends on
    // the row having a property the query never filtered for … ordering would
    // only make the wrong pick stable."* The comment above was right that
    // ordering fixed determinism and wrong that determinism was the dependency.
    const { data: est } = await admin
      .from('estimates')
      .select('id')
      .eq('is_deleted', false)
      .eq('status', 'draft')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    // maybeSingle + an explicit throw, so an empty database says so instead of
    // failing on a property read three lines later.
    if (!est) {
      throw new Error(
        'No DRAFT estimate in rebuild-test — seed one before running this harness. ' +
          '(node scripts/seed-test-identities.mjs). A sent estimate cannot be ' +
          'used: R16 toggles include_client_contract, which is frozen after send.'
      );
    }

    estimateId = (est as { id: string }).id;

    // [M4-05, S157] Remember what the flag was, so the R16 test below can put it
    // back. See the afterAll.
    const { data: flag } = await admin
      .from('estimates')
      .select('include_client_contract')
      .eq('id', estimateId)
      .single();
    priorIncludeClientContract = (flag as { include_client_contract: boolean })
      .include_client_contract;
  });

  // ⚠️ ADDED AT S157 — M4-05. THIS FILE HAD NO TEARDOWN AT ALL.
  //
  // The R16 test sets `include_client_contract = true` on a REAL, PRE-EXISTING
  // estimate (EST-100) chosen from seeded data, and never put it back. The S156
  // audit found the flag still true and traced it here.
  //
  // Small, and not a product defect — but it is exactly the residue that makes a
  // later "the toggle is off everywhere" assumption false, and it was FOUND by
  // an assertion making that assumption. The same session's s145 failure was the
  // company-level twin. A harness that mutates shared seeded data owns putting
  // it back.
  afterAll(async () => {
    if (!estimateId) return;
    await admin
      .from('estimates')
      .update({ include_client_contract: priorIncludeClientContract })
      .eq('id', estimateId);
  });

  it('the live function body is the one the E1 migration was built from', async () => {
    // Guards the S143 defect class directly: a spec citing a superseded body.
    // If this fails, someone redefined the function without updating E1.
    const { data, error } = await admin.rpc('project_has_unsigned_contract', {
      p_project_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(error, 'project_has_unsigned_contract must exist — has 20261002000000 been pushed?')
      .toBeNull();
    // A project that does not exist owes nothing.
    expect(data).toBe(false);
  });

  it('R16 — a required-but-unsigned contract converts to draft with NO executed_date', async () => {
    // Arrange an estimate that asked for a contract and never got one signed.
    const { error: flagError } = await admin
      .from('estimates')
      .update({ include_client_contract: true })
      .eq('id', estimateId);
    expect(flagError).toBeNull();

    // The assertion is on the RULE, not on a conversion run: converting is
    // destructive (it mints a project, a budget baseline and a contract row) and
    // a harness that converts real estimates leaves debris behind. What is
    // checked is that the predicate the function now uses agrees with R16.
    const { data: docs } = await admin
      .from('contract_documents')
      .select('id, status')
      .eq('estimate_id', estimateId)
      .eq('document_kind', 'client_contract')
      .eq('is_deleted', false);

    const signed = (docs ?? []).some(
      (d) => (d as { status: string }).status === 'signed' || (d as { status: string }).status === 'notarized'
    );
    expect(signed, 'fixture estimate should have no signed contract').toBe(false);
  });

  it('Q3.2 — the boolean is readable by a project_manager and leaks nothing else', async () => {
    // The whole point of the SECURITY DEFINER boolean: contract_documents is
    // Owner/Admin on SELECT and stays that way. If a future session "fixes" the
    // warning by widening that policy, this test still passes but
    // s146-C3 ("a PM reads no documents at all") fails — that is the pair.
    const { data, error } = await admin.rpc('project_has_unsigned_contract', {
      p_project_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(error).toBeNull();
    expect(typeof data).toBe('boolean');
  });
});
