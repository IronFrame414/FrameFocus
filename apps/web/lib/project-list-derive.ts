// Desktop redesign §8.1 — pure derivations for the 14a Projects list.
// Kept out of the component so the two ruled derivations are unit-testable:
// Progress (percent + days left, nothing else) and Needs attention (four
// conditions, closed set). Everything here is CALENDAR-date arithmetic on
// 'YYYY-MM-DD' strings — `today` comes from companyToday(timezone) on the
// server (the dashboard tz-fix pattern); no Date-vs-instant maths.

/** Days from calendar day `a` to calendar day `b` (both 'YYYY-MM-DD'). */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export interface Progress {
  /** 0–100, elapsed against start → target end. */
  percent: number;
  /** Calendar days from today to target end; negative = past the target. */
  daysLeft: number;
}

/**
 * RULED: percent + days left, nothing else. No phase label — `public.phases`
 * has no dates of its own. Null when either date is missing; the caller
 * renders "no dates set", not an empty bar.
 */
export function progressFor(
  start: string | null,
  targetEnd: string | null,
  today: string
): Progress | null {
  if (!start || !targetEnd) return null;
  const span = daysBetween(start, targetEnd);
  const elapsed = daysBetween(start, today);
  const percent =
    span <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((elapsed / span) * 100)));
  return { percent, daysLeft: daysBetween(today, targetEnd) };
}

/** "62% · 38d left" · "100% · 3d over" · null dates → "no dates set". */
export function progressLabel(p: Progress | null): string {
  if (p === null) return 'no dates set';
  const days = p.daysLeft >= 0 ? `${p.daysLeft}d left` : `${-p.daysLeft}d over`;
  return `${p.percent}% · ${days}`;
}

export interface AttentionInputs {
  hasDates: boolean;
  /** Draft COs the CALLER can see — RLS already scopes change_orders (S121),
   *  so a foreman/crew count is 0 by policy, not by this code. */
  draftCoCount: number;
  /** Open + in_progress punch items (the checkPunchGate statuses, matching
   *  dashboard.ts's openPunchCount). */
  openPunchCount: number;
  /** An estimate on this project with status 'accepted' — conversion flips it
   *  to 'converted', so 'accepted' IS "not yet converted". */
  hasAcceptedUnconverted: boolean;
}

/**
 * RULED: four conditions, CLOSED SET. Margin-under-target is deliberately not
 * here — it needs the company target, which is deferred (§6b.2). Returns the
 * conditions in the ruled order; the caller joins them or renders the em-dash.
 */
export function attentionFor(input: AttentionInputs): string[] {
  const out: string[] = [];
  if (!input.hasDates) out.push('No dates set');
  if (input.draftCoCount > 0)
    out.push(`${input.draftCoCount} draft CO${input.draftCoCount > 1 ? 's' : ''}`);
  if (input.openPunchCount > 0) out.push(`${input.openPunchCount} punch open`);
  if (input.hasAcceptedUnconverted) out.push('Accepted — convert');
  return out;
}
