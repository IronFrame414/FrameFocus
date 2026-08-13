import { describe, it, expect } from 'vitest';
import {
  CONTRACT_VALUE_CATALOG,
  canManageContracts,
  canVoidContract,
  catalogForKind,
  clientContractApplies,
  isKeyValidForKind,
  isLegalContractValueKey,
  signatureStepsFor,
  subContractBadge,
  type ContractDocumentStatus,
} from './contracts-shared';

// 7I pure logic. The cases that matter are the ones where a wrong answer would
// look right on a legal document.

describe('§7 — the contract value catalog is 7I\'s, not 7F\'s', () => {
  it('carries NO lien-release keys', () => {
    // 7F's catalog is claimant/lienor/waiver. Sharing one catalog would put
    // half the keys in front of a user who can never use them.
    for (const lienKey of [
      'claimant_name',
      'claimant_address',
      'claimant_license_no',
      'waiver_date',
      'through_date',
      'release_amount',
      'invoice_no',
    ]) {
      expect(isLegalContractValueKey(lienKey), `${lienKey} leaked in from 7F`).toBe(false);
    }
  });

  it('every key is unique', () => {
    const keys = CONTRACT_VALUE_CATALOG.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every key declares at least one side', () => {
    for (const v of CONTRACT_VALUE_CATALOG) {
      expect(v.sides.length, `${v.key} applies to no document kind`).toBeGreaterThan(0);
    }
  });

  it('the sub contract can place the payment schedule; the client contract cannot', () => {
    // §6.3 prints the SUB's stage schedule inside the sub contract. The CLIENT
    // payment schedule is specced separately (§7.2) and is not 7I's — offering
    // the key on the client side would promise something 7I does not build.
    expect(isKeyValidForKind('payment_schedule', 'sub_contract')).toBe(true);
    expect(isKeyValidForKind('payment_schedule', 'client_contract')).toBe(false);
  });

  it('client-only keys are not offerable on a subcontract', () => {
    expect(isKeyValidForKind('substantial_completion_days', 'client_contract')).toBe(true);
    expect(isKeyValidForKind('substantial_completion_days', 'sub_contract')).toBe(false);
    expect(isKeyValidForKind('terms_text', 'sub_contract')).toBe(false);
    expect(isKeyValidForKind('owner_entity_block', 'sub_contract')).toBe(false);
  });

  it('an unknown key is valid for neither side', () => {
    expect(isKeyValidForKind('notary_venue', 'client_contract')).toBe(false);
    expect(isKeyValidForKind('', 'sub_contract')).toBe(false);
  });

  it('catalogForKind returns only that side\'s keys', () => {
    for (const v of catalogForKind('sub_contract')) {
      expect(v.sides).toContain('sub_contract');
    }
    expect(catalogForKind('client_contract').length).toBeGreaterThan(0);
    expect(catalogForKind('sub_contract').length).toBeGreaterThan(0);
  });

  it('§7.3c — the owner-as-entity block is MANUAL, never auto', () => {
    // `contacts` has no title column. Inventing one for a signature block is
    // how a wrong title reaches a signed instrument.
    const entry = CONTRACT_VALUE_CATALOG.find((v) => v.key === 'owner_entity_block')!;
    expect(entry.source).toBe('manual');
  });
});

describe('§5.2 — the two-level toggle', () => {
  it('needs BOTH levels on', () => {
    expect(clientContractApplies(true, true)).toBe(true);
    expect(clientContractApplies(true, false)).toBe(false);
    expect(clientContractApplies(false, true)).toBe(false);
    expect(clientContractApplies(false, false)).toBe(false);
  });

  it('the master alone does not opt a proposal in', () => {
    // Turning the feature on company-wide must not retroactively attach a
    // contract to every proposal in flight.
    expect(clientContractApplies(true, false)).toBe(false);
  });
});

describe('§8 — Owner/Admin only', () => {
  it('admits Owner and Admin, refuses everyone else', () => {
    expect(canManageContracts('owner')).toBe(true);
    expect(canManageContracts('admin')).toBe(true);
    for (const role of ['project_manager', 'foreman', 'crew_member', 'subcontractor', 'client']) {
      expect(canManageContracts(role), `${role} was admitted`).toBe(false);
    }
  });

  it('a PM cannot void, whatever the reason', () => {
    const d = canVoidContract('project_manager', 'sent', 'a perfectly good reason');
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/Owner\/Admin only/);
  });

  it('an Owner needs a reason', () => {
    expect(canVoidContract('owner', 'sent', '').allowed).toBe(false);
    expect(canVoidContract('owner', 'sent', '   ').allowed).toBe(false);
    expect(canVoidContract('owner', 'sent', 'wrong scope').allowed).toBe(true);
  });

  it('a SIGNED contract can still be voided — the record is the point', () => {
    expect(canVoidContract('owner', 'signed', 'superseded by rev 2').allowed).toBe(true);
  });

  it('refuses to void twice', () => {
    const d = canVoidContract('owner', 'voided', 'again');
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/already voided/);
  });
});

describe('§5.3a / §5.5a — the two delivery rulings', () => {
  it('two signature steps when a contract rides the proposal', () => {
    expect(signatureStepsFor(true)).toBe(2);
  });

  it('one step when it does not', () => {
    expect(signatureStepsFor(false)).toBe(1);
  });
});

describe('§6.1 — the sub-contract badge', () => {
  const base = {
    requiresFormalContract: true,
    hasSchedule: true,
    documentStatus: null as ContractDocumentStatus | null,
  };

  it('shows nothing when no formal contract is required', () => {
    expect(subContractBadge({ ...base, requiresFormalContract: false })).toBe('none');
  });

  it('blocks send until the project is set up', () => {
    // §6.3 prints the payment schedule INSIDE the contract, so sending before
    // the stages exist produces a contract with an empty schedule block —
    // worse than no contract, because it looks complete.
    expect(subContractBadge({ ...base, hasSchedule: false })).toBe('not_set_up');
  });

  it('is ready once the schedule exists', () => {
    expect(subContractBadge(base)).toBe('ready_to_send');
  });

  it('tracks the document through send and signature', () => {
    expect(subContractBadge({ ...base, documentStatus: 'sent' })).toBe('awaiting_signature');
    expect(subContractBadge({ ...base, documentStatus: 'signed' })).toBe('signed');
    expect(subContractBadge({ ...base, documentStatus: 'notarized' })).toBe('signed');
  });

  it('a SENT contract stays awaiting even if the schedule was since emptied', () => {
    // The document is already out there; the badge must not regress to
    // "not set up" and imply nothing was sent.
    expect(subContractBadge({ ...base, hasSchedule: false, documentStatus: 'sent' })).toBe(
      'awaiting_signature'
    );
  });
});
