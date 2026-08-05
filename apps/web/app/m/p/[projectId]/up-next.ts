import type { CalendarEvent } from '@/lib/services/schedule';

// M6M §4.3 / D-24 — "Up next" selection, kept out of page.tsx so the rule can be
// exercised directly. It is the whole of A-11f and A-11g.
//
// ---------------------------------------------------------------------------
// BOUND TO THE SCHEDULE. NO MILESTONE CONCEPT IS INTRODUCED.
// ---------------------------------------------------------------------------
// The source is getCalendarEvents({ projectId }) — the existing UNION of the
// three things this platform calls "scheduled": dated tasks, schedule entries
// and inspections. M-12 reads the same call, which is what makes A-32b ("the
// two never disagree about the next event") true by construction rather than by
// discipline.
//
// DO NOT PASS ownMemberId. That argument is the crew CALENDAR filter; passing
// it here would narrow a project-level card to the viewer's own rows. What a
// crew member does and does not see is decided by RLS instead
// (schedule_entries_select_scoped limits crew and subcontractors to their own
// GENERAL entries, while tasks and inspections stay project-scoped) — §4.3 says
// M-3 inherits that rather than working around it, and A-11j asserts it.

/**
 * The tie-break D-24 requires. The union's own sort is on DATE ALONE
 * (schedule.ts:200), and same-day items are common — so without this the card
 * flickers between equally-dated events on every render (A-11g).
 *
 * Inspection first because it is the item with a hard external deadline: a
 * failed inspection stops the job in a way a task slipping a day does not.
 */
const SOURCE_RANK: Record<CalendarEvent['source'], number> = {
  inspection: 0,
  task: 1,
  general: 2,
};

/**
 * The first upcoming event for this project, or null when nothing is dated
 * today or later.
 *
 * `today` is injected rather than read from the clock so the rule is testable
 * without freezing time. Callers pass `new Date().toISOString().slice(0, 10)`.
 *
 * ">= today", NOT "> today": an inspection scheduled for this morning is still
 * the thing that happens next, and dropping it would show tomorrow's task while
 * the inspector is on site.
 */
export function selectUpNext(events: CalendarEvent[], today: string): CalendarEvent | null {
  const upcoming = events.filter((e) => e.start_date >= today);
  if (upcoming.length === 0) return null;

  // Sorted rather than reduced: the comparator IS the spec sentence, and a
  // one-pass minimum would hide the tie-break inside a chain of conditionals.
  const sorted = [...upcoming].sort((a, b) => {
    if (a.start_date !== b.start_date) return a.start_date < b.start_date ? -1 : 1;
    if (SOURCE_RANK[a.source] !== SOURCE_RANK[b.source]) {
      return SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
    }
    return a.title.localeCompare(b.title);
  });

  return sorted[0];
}

/**
 * The amber line under the title.
 *
 * IT IS THE DATE. It is NOT `detail.notes` — A-11i exists precisely because
 * `detail.notes` is populated for general entries and inspections but NOT for
 * tasks (schedule.ts:151 sets `detail: { status }` only), so a notes binding
 * renders a blank line on exactly the source a field user sees most.
 *
 * §4.3 asks for it "rendered relative", so the relative phrase LEADS and the
 * absolute date follows it. Both, not either: "In 3 days" alone loses the fact
 * a foreman needs to write down, and the date alone throws away the reason §4.3
 * asked for relative rendering. The date half is what A-11i asserts.
 */
export function upNextDateLine(startDate: string, today: string): string {
  const days = Math.round(
    (new Date(`${startDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
      86400000
  );
  const relative =
    days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days > 1 ? `In ${days} days` : `${days} days`;
  return `${relative} · ${startDate}`;
}
