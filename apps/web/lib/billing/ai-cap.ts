/**
 * The AI photo-tagging cap [storage-archive-ai-spec §5, RULED]:
 * $20/month · 1,500 photos · HARD CAP, no overage · resets on the calendar
 * month in the company's timezone (Q5 — the durable rule; the counter is
 * `company_ai_tags_this_month()`, 20261059).
 *
 * The $20 is DISPLAY COPY for now (Q2): the toggle stays manual and Stripe
 * wiring waits for paying customers. The counter and cap are the half that
 * protects us, and they are real.
 */

export const AI_MONTHLY_PHOTO_CAP = 1500;
export const AI_ADDON_PRICE_USD = 20;

/**
 * ⚠️ At the cap, UPLOADS STILL WORK — photos arrive untagged. The ruled
 * message says exactly that: a limit on a convenience, not a failure, and it
 * must not read like one.
 */
export const AI_CAP_MESSAGE =
  `Auto-tagging is paused for this month — you've tagged ${AI_MONTHLY_PHOTO_CAP.toLocaleString(
    'en-US'
  )} photos, the monthly limit. ` +
  'Uploads still work exactly as before; new photos just arrive untagged until the month resets. ' +
  'You can add tags by hand any time.';
