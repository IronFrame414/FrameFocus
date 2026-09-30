// S121 5-H — MULTI-DAY BARS CONNECT. Pure layout for one calendar week row.
//
// SUPERSEDED [5B §8]: eventsFor(day) repeated a multi-day event as a separate
// chip in EVERY day cell it touched. Now each event is ONE segment per week
// row, spanning its days, stacked into lanes so bars never overlap.
//
// ⚠️ THE ROW BREAK. An event that crosses a week boundary is cut into one
// segment per week row. The cut edge is SQUARED (not rounded) and carries a
// chevron — `continuesLeft` on the later row, `continuesRight` on the earlier
// — so the two pieces read as ONE bar that wraps, not two bookings.

import { addDays, daysBetween } from './drag';

export interface LaneInput {
  key: string;
  start_date: string;
  end_date: string;
}

export interface WeekSegment<E extends LaneInput> {
  event: E;
  /** 0–6: the first column this segment covers in the row. */
  col: number;
  /** 1–7 columns. */
  span: number;
  lane: number;
  continuesLeft: boolean;
  continuesRight: boolean;
}

export function layoutWeek<E extends LaneInput>(events: readonly E[], weekStart: string): WeekSegment<E>[] {
  const weekEnd = addDays(weekStart, 6);
  const inRow = events
    .filter((e) => e.start_date <= weekEnd && e.end_date >= weekStart)
    // Longer and earlier first — the usual calendar packing.
    .sort(
      (a, b) =>
        a.start_date.localeCompare(b.start_date) ||
        daysBetween(b.start_date, b.end_date) - daysBetween(a.start_date, a.end_date) ||
        a.key.localeCompare(b.key)
    );
  const laneEnds: string[] = []; // last occupied day per lane
  const out: WeekSegment<E>[] = [];
  for (const e of inRow) {
    const segStart = e.start_date < weekStart ? weekStart : e.start_date;
    const segEnd = e.end_date > weekEnd ? weekEnd : e.end_date;
    let lane = laneEnds.findIndex((end) => end < segStart);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(segEnd);
    } else laneEnds[lane] = segEnd;
    out.push({
      event: e,
      col: daysBetween(weekStart, segStart),
      span: daysBetween(segStart, segEnd) + 1,
      lane,
      continuesLeft: e.start_date < weekStart,
      continuesRight: e.end_date > weekEnd,
    });
  }
  return out;
}
