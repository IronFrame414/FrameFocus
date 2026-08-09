/**
 * §3f — "the reminders are exhausted" as a pure predicate.
 *
 * Spec: docs/specs/notifications-architecture.md §3f.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A FUNCTION AND NOT AN INLINE `===`
 * ---------------------------------------------------------------------------
 * The condition lives inside `/api/cron/estimate-reminders`, and that route
 * CANNOT be driven from a test: every pass through the loop sends a real
 * reminder through Resend to whatever address the fixture invented. So an
 * end-to-end test of the trigger would mail a fabricated client, which is not a
 * side effect a harness gets to have.
 *
 * Extracting the arithmetic is what is left. The failure modes are both
 * off-by-one and neither is visible in a screenshot:
 *
 *   `>= schedule.length - 1`  fires on the SECOND-TO-LAST reminder, so the
 *                             Owner is told the reminders ran out while one is
 *                             still scheduled to go.
 *   `>= 1`, or no guard       fires on EVERY reminder — the "one row, not one
 *                             per send" rule (Option B, founder-decided S89)
 *                             inverted, which is three notifications per
 *                             estimate and a habit of ignoring them.
 */

/**
 * Was the reminder that just went out the LAST one on the schedule?
 *
 * @param reminderCountBefore `estimates.reminder_count` as READ, before the
 *   increment for the send that just happened. The caller has this value in
 *   hand; re-reading the row after the update would race the next cron pass.
 * @param scheduleLength number of steps in the effective schedule (estimate
 *   override ?? company default ?? [3,7,14]).
 */
export function isFinalReminderStep(
  reminderCountBefore: number,
  scheduleLength: number
): boolean {
  // An empty schedule means "opted out" — no reminders are ever sent, so none
  // can be exhausted. Without this, `0 + 1 === 0` is false and it happens to
  // work; it is written down because the reasoning is not the arithmetic.
  if (scheduleLength <= 0) return false;
  return reminderCountBefore + 1 === scheduleLength;
}
