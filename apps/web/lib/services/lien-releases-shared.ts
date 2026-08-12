// Module 7F — lien releases. PURE logic, no supabase import.
//
// docs/specs/7f2-spec.md §3 (the engine), §4 (templates), §5 (triggers and
// scope), §6 (value catalog), §8 (lifecycle).
//
// ⚠️ THIS FILE EXISTS TO GUARD THE CLIENT-BUNDLE BOUNDARY. A value import from
// `lien-releases.ts` pulls `next/headers` into the client bundle and **tsc does
// not catch it** — the build fails at runtime instead. 7C, 7D and 7E all ship
// this triple for the same reason (7F §11.1). Nothing here may import supabase,
// server-only, or anything under app/.

export type ReleaseType = 'conditional' | 'unconditional';
export type ReleaseDirection = 'client_outbound' | 'sub_inbound';
export type ReleaseStatus = 'draft' | 'signed' | 'notarized' | 'sent' | 'voided';
export type BoxKind = 'value' | 'signature' | 'custom';

// ─────────────────────────────────────────────────────────────────────────────
// §6 — the value catalog
// ─────────────────────────────────────────────────────────────────────────────
//
// AUTO = filled from a live column. SETTINGS = from Company Settings.
// Every value is user-editable before render (§7 step 4) — that is a step in
// the flow, not a per-field exception. The instrument is signed and cannot be
// retracted, so the user gets the last look.
//
// ⚠️ SIX KEYS WERE REMOVED AT S98 AND MUST NOT BE REINTRODUCED (§6.1):
// check_or_draft_no, payer_account_name, payer_bank_name (the payment-
// instrument block — Josh whited the bank line out of his own form, and
// client_payments has no check-number column anyway); payment_date (no form
// examined carries one, and a release spanning several payments has no single
// date to give); payment_type (the form sent determines it); File No / Draw No
// (lender-only, no lender concept exists); county (the only county on the FL
// form is the NOTARY's venue, which the notary fills).

export interface ValueKeyDef {
  key: string;
  label: string;
  /** Where the default comes from. 'manual' has no source and must be typed. */
  source: 'auto' | 'settings' | 'manual';
  group: 'parties' | 'property' | 'money' | 'signer';
  /** Conditional-only, unconditional-only, or both. */
  appliesTo?: ReleaseType;
  hint?: string;
}

export const VALUE_CATALOG: ValueKeyDef[] = [
  // §6.2 — parties. RULED [S98]: the company is ALWAYS the contractor, and the
  // party the release is sent to is ALWAYS the client. This holds even when
  // the company works under a higher GC — it still occupies the contractor
  // role, and the client is simply whoever it bills.
  { key: 'claimant_name', label: 'Claimant / Lienor name', source: 'auto', group: 'parties' },
  { key: 'claimant_address', label: 'Claimant address', source: 'auto', group: 'parties' },
  { key: 'claimant_license_no', label: 'Claimant license #', source: 'auto', group: 'parties' },
  { key: 'contractor_furnished_to', label: 'Furnished to (contractor)', source: 'auto', group: 'parties' },
  {
    key: 'owner_name',
    label: 'Property owner',
    source: 'auto',
    group: 'parties',
    hint: 'Defaults to the client. Override when the company is a lower-tier claimant and the property owner is a party this system does not know.',
  },

  // §6.3 — property.
  { key: 'project_name', label: 'Project name', source: 'auto', group: 'property' },
  { key: 'property_address', label: 'Property address', source: 'auto', group: 'property' },
  {
    key: 'legal_description',
    label: 'Legal description',
    source: 'auto',
    group: 'property',
    hint: 'Prints ALONGSIDE the address, never instead of it. Blank is normal.',
  },
  { key: 'contract_date', label: 'Contract date', source: 'auto', group: 'property' },
  { key: 'contract_value', label: 'Contract value', source: 'auto', group: 'property' },
  { key: 'scope_of_work', label: 'Scope of work', source: 'auto', group: 'property' },

  // §6.4 — money.
  {
    key: 'release_amount',
    label: 'Release amount',
    source: 'auto',
    group: 'money',
    hint: 'Conditional: what is payable now. Unconditional: what has actually been received.',
  },
  { key: 'invoice_no', label: 'Invoice #', source: 'auto', group: 'money' },
  { key: 'retainage_released', label: 'Retainage released', source: 'auto', group: 'money' },
  { key: 'through_date', label: 'Through date', source: 'auto', group: 'money' },
  { key: 'waiver_date', label: 'Waiver date', source: 'auto', group: 'money' },

  // §6.5 — signer. The signature IMAGE is a box kind, not a value key.
  { key: 'signer_name', label: 'Print name', source: 'settings', group: 'signer' },
  { key: 'signer_title', label: 'Title ("Its")', source: 'settings', group: 'signer' },
];

export const VALUE_KEYS = new Set(VALUE_CATALOG.map((v) => v.key));

/** §6.1 — removed at S98. Rejected loudly rather than silently ignored, so a
 *  template carried over from an older design cannot fail open at render. */
export const REMOVED_VALUE_KEYS = new Set([
  'check_or_draft_no',
  'payer_account_name',
  'payer_bank_name',
  'payment_date',
  'payment_type',
  'file_no',
  'draw_no',
  'county',
]);

export function isLegalValueKey(key: string): boolean {
  return VALUE_KEYS.has(key);
}

// ─────────────────────────────────────────────────────────────────────────────
// §4.2 — template selection
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplateChoice {
  id: string;
  name: string;
  type: ReleaseType;
  is_final: boolean;
  direction: ReleaseDirection;
  jurisdiction_state: string | null;
  hasPdf: boolean;
}

export interface TemplateSelection {
  /** Pre-selected match, or null when nothing matches the slot. */
  preselected: TemplateChoice | null;
  /** Everything legal for this direction — the picker is ALWAYS shown. */
  options: TemplateChoice[];
  /** More than one template claims this slot (§4.3). Informational only. */
  ambiguous: boolean;
}

/**
 * §4.2 — selection is `type` x `is_final` and needs no new data.
 *
 * [RULING C2, S140] THE PICKER IS ALWAYS SHOWN, pre-selected to the match.
 * Templates are unlimited but carry only two selection tags, so two can both
 * be conditional-and-not-final; auto-picking the first would silently choose
 * between two legal instruments on the user's behalf. Showing the picker costs
 * one click and removes the ambiguity entirely.
 */
export function selectTemplate(
  templates: TemplateChoice[],
  want: { type: ReleaseType; isFinal: boolean; direction: ReleaseDirection }
): TemplateSelection {
  const options = templates.filter((t) => t.direction === want.direction);
  const matches = options.filter((t) => t.type === want.type && t.is_final === want.isFinal);
  return {
    preselected: matches[0] ?? null,
    options,
    ambiguous: matches.length > 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §3.1 — text overflow [RULING C1, S140]
// ─────────────────────────────────────────────────────────────────────────────

export interface FitResult {
  fontSize: number;
  /** True when the text had to be shrunk below the requested size. */
  shrunk: boolean;
  /** True when even the floor size does not fit — the review step flags it. */
  overflows: boolean;
}

/** Below this a stamped value stops being legible on a printed instrument. */
export const MIN_FONT_SIZE = 6;

/**
 * SHRINK-TO-FIT WITH A FLOOR, and flag anything that shrank (§7 step 4).
 *
 * The three options were shrink, truncate, or overflow. Truncation is the
 * dangerous one: silently dropping the tail of a name, an address or an amount
 * on a legal instrument produces a document that looks complete and says
 * something different from what was meant. Overflow renders unreadable.
 * Shrinking degrades legibility gradually and visibly, and the review step
 * shows the user which boxes shrank before anything renders.
 *
 * `widthPerChar` is the font's average advance at size 1 — the caller measures
 * it once from the embedded font so this stays pure.
 */
export function fitTextToBox(
  text: string,
  boxWidthPoints: number,
  requestedSize: number,
  widthPerChar: number
): FitResult {
  if (!text || boxWidthPoints <= 0 || widthPerChar <= 0) {
    return { fontSize: requestedSize, shrunk: false, overflows: false };
  }
  const naturalWidth = text.length * widthPerChar * requestedSize;
  if (naturalWidth <= boxWidthPoints) {
    return { fontSize: requestedSize, shrunk: false, overflows: false };
  }
  const needed = boxWidthPoints / (text.length * widthPerChar);
  if (needed >= MIN_FONT_SIZE) {
    // Floor to a tenth so two boxes with near-identical content do not render
    // at visibly different sizes.
    return { fontSize: Math.floor(needed * 10) / 10, shrunk: true, overflows: false };
  }
  return { fontSize: MIN_FONT_SIZE, shrunk: true, overflows: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// §8.1 — lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export interface VoidDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * §8.1 — void requires a reason and retains the record forever.
 *
 * A release ALREADY SENT can still be voided, and that is deliberate: the
 * record of having issued it is exactly what must survive. Voiding does not
 * retrieve the instrument from the client's hands — nothing can — so the void
 * is bookkeeping about a document that is already out there, and a corrected
 * release issues with a supersedes-link.
 */
export function canVoidRelease(status: ReleaseStatus, reason: string): VoidDecision {
  if (status === 'voided') {
    return { allowed: false, reason: 'This release is already voided.' };
  }
  if (!reason.trim()) {
    return { allowed: false, reason: 'A void needs a reason. It is kept permanently.' };
  }
  return { allowed: true };
}

/**
 * §8.1 — what happens to a conditional release when its invoice is voided.
 *
 * The voiding is 7D's ACTION; 7F only reacts to the resulting status. A
 * successor invoice prompts a new release against the successor; a terminal
 * void prompts nothing, because there is nothing left to release against.
 */
export type InvoiceVoidEffect = 'void_and_reprompt' | 'void_only' | 'none';

export function releaseEffectOfInvoiceVoid(
  releaseStatus: ReleaseStatus,
  hasSuccessorInvoice: boolean
): InvoiceVoidEffect {
  if (releaseStatus === 'voided') return 'none';
  return hasSuccessorInvoice ? 'void_and_reprompt' : 'void_only';
}

// ─────────────────────────────────────────────────────────────────────────────
// §6.4 — the amount rule
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A release NEVER covers more than the money it is about.
 *
 *   conditional   -> invoices.amount_receivable  (what is payable now)
 *   unconditional -> Σ client_payment_applications (what actually arrived)
 *
 * This holds because 7E's `record_client_payment` enforces P-4 — an
 * application may never exceed an invoice's remaining receivable
 * (20260804000000:553-561) — so Σ applications ≤ amount_receivable always, and
 * an unconditional can never over-waive relative to its conditional.
 *
 * ⚠️ IF P-4 IS EVER RELAXED, THIS RULE SILENTLY LOSES ITS FLOOR. The guard
 * below is cheap insurance against that day: it clamps and reports rather than
 * trusting the invariant to hold forever.
 */
export function releaseAmount(
  type: ReleaseType,
  amountReceivable: number,
  appliedTotal: number
): { amount: number; clamped: boolean } {
  if (type === 'conditional') return { amount: round2(amountReceivable), clamped: false };
  const clamped = appliedTotal > amountReceivable;
  return {
    amount: round2(clamped ? amountReceivable : appliedTotal),
    clamped,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
