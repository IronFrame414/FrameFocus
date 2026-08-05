// Billing enforcement kill-switch [S99].
//
// One flag, one job: let subscription gating be turned OFF in an environment
// without deleting the gating code. Reverting is removing the env var.
//
// ---------------------------------------------------------------------------
// THE DEFAULT IS "ENFORCED", AND THE COMPARISON DIRECTION IS WHY
// ---------------------------------------------------------------------------
// The test is `=== 'true'` on a DISABLE_ flag, so the ONLY input that turns
// gating off is the exact string 'true'. Everything else — the var missing, an
// empty string, 'false', '1', 'TRUE', a typo, a value Vercel dropped on a bad
// deploy — leaves enforcement ON.
//
// The inverse spelling (an ENABLE_ flag tested with `!== 'false'`) reads more
// naturally but fails the wrong way round in one specific case that matters:
// misspell the value and you silently stop charging people. Here a misspelling
// is inert. Unpaid access is a revenue leak nobody gets an alert about; an
// over-enforced gate is a support ticket within minutes. Fail toward the
// noisy one.
//
// It takes the value rather than reading process.env itself so the semantics
// above are unit-testable without mutating global env state between cases —
// billing-flag.test.ts asserts each spelling directly.
//
// NOT NEXT_PUBLIC_: middleware is server-side and the browser has no business
// knowing whether gating is off.

/** True when subscription gating should run. Only the exact string 'true' disables it. */
export function billingEnforcementEnabled(disableFlagValue: string | undefined): boolean {
  return disableFlagValue !== 'true';
}
