// Module 7I — contracts. PURE logic, no supabase import.
//
// docs/specs/7I-spec.md §5 (client half), §6 (sub half), §7 (value catalog),
// §10 (schema), §11.1 (the service triple).
//
// ⚠️ THIS FILE EXISTS TO GUARD THE CLIENT-BUNDLE BOUNDARY. A value import from
// `contracts.ts` pulls `next/headers` into the client bundle and **tsc does not
// catch it** — the failure is at runtime, not at compile time. `invoices-`,
// `payables-`, `payments-`, `instrument-rates-` and `lien-releases-shared.ts`
// all exist for this reason. §11.1 records that CLAUDE.md documents a service
// PAIR and that this third leg is de-facto convention rather than written rule.
//
// Nothing here may import supabase, `server-only`, or anything under `app/`.

export type DocumentKind = 'client_contract' | 'sub_contract';
export type ContractDocumentStatus =
  | 'draft'
  | 'sent'
  | 'signed'
  | 'notarized'
  | 'declined'
  | 'voided';
export type DeliveryMode = 'esignature' | 'notary';
export type ContractBoxKind = 'value' | 'signature' | 'initial' | 'custom';

/**
 * R4 / R5 [S150] — which side a signature or initials box belongs to.
 *
 * ⚠️ `recipient`, NOT `client` OR `counterparty`, AND THAT IS THE POINT. One
 * editor serves both `document_kind`s (§2.1), so a stored value that reads
 * correctly on a client contract and wrongly on a subcontract would drag the UI
 * back into per-kind special-casing. The value stays kind-neutral; the LABEL is
 * derived from `document_kind` by `partyOptionsFor()` below.
 *
 * R5: this applies to `initial` as well as `signature`. §7.3d needs the
 * recipient's initials on the Chapter 558 clause, and a contractor may need to
 * initial elsewhere on the same form. Both are placeable.
 */
export type ContractParty = 'contractor' | 'recipient';

/** Whether this box kind carries a party at all — the payload CHECK's rule,
 *  stated once so the service, the editor and the database agree. */
export function boxKindNeedsParty(kind: ContractBoxKind): boolean {
  return kind === 'signature' || kind === 'initial';
}

/**
 * The party choices for a template of this kind, labelled for a human.
 *
 * Lives here rather than in the editor because the vocabulary is a domain fact,
 * not a presentation detail: "recipient" means the client on one side and the
 * subcontractor on the other, and exactly one place should know that.
 */
export function partyOptionsFor(
  kind: DocumentKind
): { value: ContractParty; label: string }[] {
  return [
    { value: 'contractor', label: 'Us (the contractor)' },
    {
      value: 'recipient',
      label: kind === 'client_contract' ? 'The client' : 'The subcontractor',
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// §7 — the contract value catalog
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ SEPARATE FROM 7F's, AND THAT IS THE POINT. 7F's catalog is lien-specific:
// claimant/lienor, waiver_date, through_date, release_amount. A contract needs
// none of those and needs a dozen things 7F does not have. Sharing one catalog
// would put half the keys in front of a user who can never use them.
//
// What IS shared is the BOX SHAPE — fractions of page width/height, top-left
// origin, same three-way kind discrimination plus 'initial'. So 7F's
// `renderRelease()` and `fitTextToBox()` serve both documents and 7I builds no
// second renderer (§1: "consumes it rather than rebuilding it").
//
// THE TWO SIDES READ DIFFERENT TABLES, which is why `sides` exists on every
// entry. The client contract is an ESTIMATE-STAGE document and never touches
// `projects`; the sub contract is a PROJECT-STAGE one and never touches
// `estimates`. A box map is per template and a template is per `document_kind`,
// so a key that applies to only one side must not be offerable on the other.

export interface ContractValueKey {
  key: string;
  label: string;
  /** Which document kinds may place this box. */
  sides: DocumentKind[];
  source: 'auto' | 'settings' | 'manual';
  group: 'contractor' | 'counterparty' | 'property' | 'terms' | 'signature';
  hint?: string;
}

export const CONTRACT_VALUE_CATALOG: ContractValueKey[] = [
  // ── The contractor — us, on both sides ────────────────────────────────────
  { key: 'contractor_name', label: 'Contractor name', sides: ['client_contract', 'sub_contract'], source: 'auto', group: 'contractor' },
  { key: 'contractor_address', label: 'Contractor address', sides: ['client_contract', 'sub_contract'], source: 'auto', group: 'contractor' },
  { key: 'contractor_license_no', label: 'Contractor license #', sides: ['client_contract', 'sub_contract'], source: 'auto', group: 'contractor' },

  // ── The counterparty — the client on one side, the sub on the other ───────
  {
    key: 'counterparty_name',
    label: 'Counterparty name',
    sides: ['client_contract', 'sub_contract'],
    source: 'auto',
    group: 'counterparty',
    hint: 'The client on a client contract; the subcontractor on a subcontract.',
  },
  { key: 'counterparty_address', label: 'Counterparty address', sides: ['client_contract'], source: 'auto', group: 'counterparty' },
  {
    key: 'owner_entity_block',
    label: 'Owner as an entity (name / title)',
    sides: ['client_contract'],
    source: 'manual',
    group: 'counterparty',
    hint: '§7.3c — MANUAL. `contacts` has no title column, and inventing one for a signature block is how a wrong title reaches a signed instrument.',
  },

  // ── The property ──────────────────────────────────────────────────────────
  { key: 'project_name', label: 'Project name', sides: ['client_contract', 'sub_contract'], source: 'auto', group: 'property' },
  {
    key: 'property_address',
    label: 'Property address',
    sides: ['client_contract', 'sub_contract'],
    source: 'auto',
    group: 'property',
    hint: 'Nullable on BOTH sides — estimates.contact_address_id and projects.contact_address_id. Generation refuses rather than rendering a blank required field.',
  },
  { key: 'legal_description', label: 'Legal description', sides: ['client_contract', 'sub_contract'], source: 'auto', group: 'property' },

  // ── Terms ─────────────────────────────────────────────────────────────────
  { key: 'scope_of_work', label: 'Scope of work', sides: ['client_contract', 'sub_contract'], source: 'auto', group: 'terms' },
  { key: 'contract_value', label: 'Contract value', sides: ['client_contract', 'sub_contract'], source: 'auto', group: 'terms' },
  { key: 'contract_date', label: 'Contract date', sides: ['client_contract', 'sub_contract'], source: 'auto', group: 'terms' },
  { key: 'start_date', label: 'Start date', sides: ['client_contract', 'sub_contract'], source: 'auto', group: 'terms' },
  { key: 'target_end_date', label: 'Target completion', sides: ['client_contract', 'sub_contract'], source: 'auto', group: 'terms' },
  {
    key: 'substantial_completion_days',
    label: 'Substantial completion (days)',
    sides: ['client_contract'],
    source: 'auto',
    group: 'terms',
    hint: '§7.3a — an estimated timeframe in days, captured on the estimate.',
  },
  { key: 'retainage_percent', label: 'Retainage %', sides: ['client_contract', 'sub_contract'], source: 'auto', group: 'terms' },
  {
    key: 'payment_schedule',
    label: 'Payment schedule',
    sides: ['sub_contract'],
    source: 'auto',
    group: 'terms',
    hint: '§6.3 — the sub’s stage schedule, printed INSIDE the sub contract. The CLIENT payment schedule is specced separately (§7.2) and is not 7I’s.',
  },
  { key: 'terms_text', label: 'Terms', sides: ['client_contract'], source: 'auto', group: 'terms' },

  // ── Signature block ───────────────────────────────────────────────────────
  { key: 'signer_name', label: 'Signatory print name', sides: ['client_contract', 'sub_contract'], source: 'settings', group: 'signature' },
  { key: 'signer_title', label: 'Signatory title', sides: ['client_contract', 'sub_contract'], source: 'settings', group: 'signature' },
];

export const CONTRACT_VALUE_KEYS = new Set(CONTRACT_VALUE_CATALOG.map((v) => v.key));

export function isLegalContractValueKey(key: string): boolean {
  return CONTRACT_VALUE_KEYS.has(key);
}

/** The keys a template of this kind may place. A box map is per template and a
 *  template is per kind, so offering a client-only key on a subcontract would
 *  guarantee a permanently blank box. */
export function catalogForKind(kind: DocumentKind): ContractValueKey[] {
  return CONTRACT_VALUE_CATALOG.filter((v) => v.sides.includes(kind));
}

export function isKeyValidForKind(key: string, kind: DocumentKind): boolean {
  const entry = CONTRACT_VALUE_CATALOG.find((v) => v.key === key);
  return entry ? entry.sides.includes(kind) : false;
}

// ─────────────────────────────────────────────────────────────────────────────
// §2.2 / Q5 — the placement-time size floor
// ─────────────────────────────────────────────────────────────────────────────
//
// Josh: "warn user of overflow. we must make all boxes large enough that this is
// a rare occurrence." §2.2 warns at BOTH ends — while authoring, and at render.
//
// ⚠️ A HEURISTIC, AND IT CANNOT BE ANYTHING ELSE. The render-time check is
// `fitTextToBox()`, which needs `widthPerChar` — measured from the font embedded
// in the PDF at generate time. The browser has no such measurement while placing
// boxes, so calling `fitTextToBox()` here would mean inventing a font metric and
// reporting the guess as a calculation.
//
// ⚠️ IT DELIBERATELY OVER-WARNS [RULED S150, Q5]. R10 makes render-time overflow
// BLOCK the send, so the two must not disagree in the direction that lets an
// author pass placement and fail at the door. They cannot be made equal — one
// guesses, one measures — so the guess is the stricter of the two. The cost is
// warning on boxes that would have been fine, which is the cheaper error.
//
// ⚠️ THIS TABLE IS 7I's, AND 7F HAS ITS OWN [#1-7i, S150]. The box EDITOR is now
// shared between the two modules; the sizing table is not, because the keys are
// not. Each module owns what its own values look like.

/** Typical rendered length of each catalog value, in characters. */
const EXPECTED_CHARS: Record<string, number> = {
  contractor_name: 30,
  contractor_address: 45,
  contractor_license_no: 16,
  counterparty_name: 30,
  counterparty_address: 45,
  owner_entity_block: 40,
  project_name: 32,
  property_address: 45,
  legal_description: 90,
  scope_of_work: 90,
  contract_value: 14, // "$1,234,567.89"
  contract_date: 18, // "September 26, 2026"
  start_date: 18,
  target_end_date: 18,
  // §12.18 — prints spelled-out AND as a numeral from one value:
  // "one hundred twenty (120)".
  substantial_completion_days: 30,
  retainage_percent: 6,
  payment_schedule: 90, // §6.3 — a printed block, not a field
  terms_text: 90,
  signer_name: 30,
  signer_title: 24,
};

const DEFAULT_EXPECTED_CHARS = 24;

/**
 * Fraction of page width one character is assumed to occupy.
 *
 * A 10pt Helvetica character averages ~5pt on a 612pt US Letter page — about
 * 0.008. Set well above that per Q5, so the floor sits near 13pt text and fires
 * before a realistic 10–11pt render would overflow.
 */
export const FRACTION_PER_CHAR = 0.011;

/** The width below which a contract value box is likely to overflow at render. */
export function minWidthForContractKey(valueKey: string | null | undefined): number {
  const chars = (valueKey && EXPECTED_CHARS[valueKey]) || DEFAULT_EXPECTED_CHARS;
  return Math.min(0.9, chars * FRACTION_PER_CHAR);
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.2 — the two-level toggle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether this estimate ships a client contract with its proposal.
 *
 * BOTH levels must be on. The master (`companies.client_contracts_enabled`)
 * says the company uses contracts at all; the per-proposal flag says this one
 * does. §5.2 makes this "the single trigger for everything conditional" — the
 * send route, the signing page's second step, and what conversion carries all
 * read it, so it lives in one function rather than being re-derived at each.
 */
export function clientContractApplies(
  masterEnabled: boolean,
  includeOnThisEstimate: boolean
): boolean {
  return masterEnabled && includeOnThisEstimate;
}

// ─────────────────────────────────────────────────────────────────────────────
// §8 — who may act
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §8 [RULED S99, reasoning rewritten S145] — Owner/Admin only, everywhere.
 *
 * ⚠️ THE REASON IS THE FLOOR, NOT AN ANALOGY TO 7F. A contract displays contract
 * value, and CLAUDE.md's Floor carve-out admits a PM to invoice amounts but
 * explicitly NOT to contract value, "on every surface". 7F had to STRIKE that
 * argument because a release amount is a receivable; 7I does not. Do not "fix"
 * this gate by analogy to 7F.
 *
 * ⚠️ AND THIS IS NOT THE ONLY GATE. `enforce_contract_void_authority`
 * (20260926000000) enforces the void half in the database, because
 * `client_contracts_update_authorized` admits an assigned PM and the shipped
 * contracts panel already exposes the action.
 */
export function canManageContracts(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

export interface VoidContractDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * §8 / C5 — voiding a contract.
 *
 * A SENT or SIGNED contract can still be voided, deliberately: the record of
 * having issued it is exactly what must survive, and a corrected contract
 * issues with a supersedes-link. Voiding does not retrieve a document from the
 * counterparty's hands — nothing can — so this is bookkeeping about an
 * instrument that is already out there.
 */
export function canVoidContract(
  role: string,
  status: ContractDocumentStatus,
  reason: string
): VoidContractDecision {
  if (!canManageContracts(role)) {
    return { allowed: false, reason: 'Voiding a contract is Owner/Admin only (7I §8).' };
  }
  if (status === 'voided') {
    return { allowed: false, reason: 'This contract is already voided.' };
  }
  if (!reason.trim()) {
    return { allowed: false, reason: 'A void needs a reason. It is kept permanently.' };
  }
  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// §5.3 / §5.5 — delivery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §5.5a [RULED — Josh, S145, option C3] — on the NOTARY path the proposal keeps
 * its tokenised link; only the contract carries no signature box.
 *
 * The rejected alternative was sending the whole email non-tokenised, which
 * would have degraded a working proposal flow to solve a contract problem.
 */
export function proposalKeepsTokenOnNotaryPath(): true {
  return true;
}

/**
 * §5.3a [RULED — Josh, S145, option C2] — TWO signature steps in ONE session.
 *
 * The client receives one email with two documents and signs each explicitly.
 * One signature applied to both was the cheaper option and was rejected: a
 * contract deserves its own act of signing, and the cost is one extra pane.
 *
 * Returned as a count rather than a boolean so the signing page can drive its
 * step indicator from the same source that decides the rule.
 */
export function signatureStepsFor(contractIncluded: boolean): 1 | 2 {
  return contractIncluded ? 2 : 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// §6.1 — the sub-contract badge
// ─────────────────────────────────────────────────────────────────────────────

export type SubContractBadge =
  | 'none'
  | 'not_set_up'
  | 'ready_to_send'
  | 'awaiting_signature'
  | 'signed';

/**
 * §6.1 [S99] — the sub contract is created at conversion and surfaced as a
 * BADGE, not a task row, and it cannot be sent until the project is set up.
 *
 * "Set up" means the schedule exists: §6.3 prints the payment schedule INSIDE
 * the sub contract, so sending before the stages are entered would produce a
 * contract with an empty schedule block — worse than no contract, because it
 * looks complete.
 */
export function subContractBadge(input: {
  requiresFormalContract: boolean;
  hasSchedule: boolean;
  documentStatus: ContractDocumentStatus | null;
}): SubContractBadge {
  if (!input.requiresFormalContract) return 'none';
  if (input.documentStatus === 'signed' || input.documentStatus === 'notarized') return 'signed';
  if (input.documentStatus === 'sent') return 'awaiting_signature';
  if (!input.hasSchedule) return 'not_set_up';
  return 'ready_to_send';
}
