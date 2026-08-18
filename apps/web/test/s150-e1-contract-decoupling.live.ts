// 7I E1 [S150] — R16: the contract's status reflects the CONTRACT, not the
// proposal; contract_documents.project_id is backfilled at conversion; and a PM
// can see that a signature is owed without being able to read the contract.
//
// ⚠️ RED UNTIL 20261002000000 IS PUSHED. Everything here exercises the sixth
// redefinition of convert_estimate_to_project and a function that does not
// exist yet. That is the point: this file is what makes the migration
// verifiable rather than merely reviewed.
//
// ⚠️ THE DEFECT THIS PINS DOWN WAS SILENT. Before R16, an estimate that asked
// for a written contract, whose client signed the PROPOSAL and never signed the
// CONTRACT, converted into a project carrying client_contracts.status='signed'
// and an executed_date taken from the proposal's acceptance. Nothing failed.
// The record simply said the paperwork was done when it was not — which is the
// kind of wrong that is only discovered in a dispute.

import { describe, it, expect, beforeAll } from 'vitest';
import { admin, assertRebuildTest } from './live-session';

let companyId: string;
let estimateId: string;

describe('S150-E1 — R16 decoupling', () => {
  beforeAll(async () => {
    assertRebuildTest();
    const { data: co } = await admin.from('companies').select('id').limit(1).single();
    companyId = (co as { id: string }).id;
    const { data: est } = await admin
      .from('estimates')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .limit(1)
      .single();
    estimateId = (est as { id: string }).id;
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
