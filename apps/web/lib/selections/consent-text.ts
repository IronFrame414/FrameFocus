// ============================================================================
// S175 stage 7 — THE BINDING WORDING, IN ONE PLACE, REACHABLE FROM BOTH SIDES.
// ============================================================================
//
// ⚠️ WHY THIS MOVED OUT OF `selection-lifecycle-service.ts`.
//
// The wording is Josh's, ruled at S169 and recorded in spec §6.2. It is stored
// verbatim in `selection_signing_sessions.consent_text` and in the signature
// snapshot, and — from stage 7 — it is also the sentence the CLIENT READS above
// the signature pad before she signs.
//
// Those two are the same sentence or the signature is worthless. The service
// that stores it is `server-only`; the portal panel that shows it is a browser
// component. A component cannot import the service, so the only options were to
// hand the text down from the server (which cannot work — the figures move as
// she picks, and the wording names the figures) or to write the sentence a
// second time in the UI.
//
// The second one is CLAUDE.md's `#129` divergence exactly: *"a second
// implementation that 'does the same thing' is the divergence, written in a form
// that looks like agreement"*, and *"a helper under `app/…` implies that surface
// owns it. If both need it, it belongs in `lib/`."* The same argument, and the
// same remedy, as `option-sell.ts` one file over — which exists because the sell
// formula had been written three times.
//
// So: PURE and client-safe — no `server-only`, no Supabase import — and the
// service re-exports it rather than redefining it.
//
// ⚠️ THE CHANNEL SENTENCE IS PART OF THE STRING, unlike the change-order
// `CONSENT_TEXT`, where it is appended server-side. That is deliberate here and
// is what makes showing it honest: a selection signature has exactly ONE channel
// (`signer_channel = 'portal_session'`, a CHECK), she IS signed in to her portal
// when she reads it, and what she attests to is then byte-for-byte what the
// record stores.
// ============================================================================

/**
 * The binding wording — two variants: money, and the client-supplied no-money
 * variant (a "stated costs" clause over no stated costs would be false).
 */
export function selectionConsentTextFor(input: {
  clientSupplied: boolean;
  sellAmount?: number | null;
  allowanceDeduction?: number | null;
  variance?: number | null;
}): string {
  if (input.clientSupplied) {
    return 'By signing, I confirm this selection. I am supplying this item myself; no charge applies. This signature is binding. I gave this signature while signed in to my client portal account.';
  }
  const f = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const sell = input.sellAmount ?? 0;
  const ded = input.allowanceDeduction ?? 0;
  const v = input.variance ?? 0;
  const net = v >= 0 ? `an added price of ${f(v)}` : `a credit of ${f(Math.abs(v))}`;
  return `By signing, I confirm my selection and accept the stated price of ${f(sell)}, less my allowance of ${f(ded)}, for ${net}. This signature is binding and accepts the stated costs. I gave this signature while signed in to my client portal account.`;
}
