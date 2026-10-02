import { color, font } from '@/lib/theme';
import { day } from '../portal-ui';

/**
 * S123 D-1a — THE CLIENT'S GANTT. BARS ON A DATE AXIS, AND NOTHING ELSE.
 * [Josh, RULED 2026-10-02]
 *
 *   ⚠️ NO dependency arrows.  ⚠️ NO slack ghosts.  ⚠️ NO critical colouring.
 *
 * With arrows a Gantt hands the client the schedule's slack: one bar ends the
 * 10th, the next depends on it and starts the 20th — ten days read straight off
 * the screen. Without arrows a gap is ambiguous (slack, sequencing, a crew on
 * another job). Same picture, no disclosure. Every bar is the same colour.
 *
 * ⚠️ THIS IS ITS OWN DRAWING, NOT components/schedule/gantt.tsx WITH A FLAG.
 * One component with a `hideFloat` prop is the #136 shape: the data still
 * reaches the payload even though nothing renders it. This file imports nothing
 * from the staff schedule, and its props CANNOT carry a dependency, a float or
 * a critical flag — there is no field for one. The portal import walk
 * (test/s122-cp-portal-imports.test.ts) fails if the portal ever reaches the
 * staff Gantt.
 *
 * A server component, like the rest of the portal: it renders markup on the
 * server and hands nothing to client code.
 */

/** One task on the client's schedule: what the page may show, and nothing more. */
export interface ClientGanttRow {
  phase: string | null;
  title: string;
  start: string | null;
  finish: string | null;
}

const MS_PER_DAY = 86_400_000;
/** Whole days since the epoch for a YYYY-MM-DD date (UTC: a date has no time zone). */
const dayNumber = (ymd: string): number => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))) / MS_PER_DAY;

export function ClientGantt({ rows, grouped }: { rows: ClientGanttRow[]; grouped: boolean }) {
  const dated = rows.filter((r) => r.start && r.finish) as (ClientGanttRow & { start: string; finish: string })[];
  if (dated.length === 0) {
    return (
      <p data-testid="portal-gantt-empty" style={{ fontSize: '13px', color: color.muted, margin: '6px 0' }}>
        No dates have been set yet. They will appear here once the work is scheduled.
      </p>
    );
  }
  const first = dated.reduce((a, r) => (r.start < a ? r.start : a), dated[0].start);
  const last = dated.reduce((a, r) => (r.finish > a ? r.finish : a), dated[0].finish);
  const from = dayNumber(first);
  const span = dayNumber(last) - from + 1;

  let phase: string | null | undefined;
  return (
    <div data-testid="portal-gantt" style={{ marginTop: '6px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: font.mono,
          fontSize: '10.5px',
          color: color.mutedAlt,
          paddingBottom: '6px',
        }}
      >
        <span data-testid="portal-gantt-from">{day(first)}</span>
        <span data-testid="portal-gantt-to">{day(last)}</span>
      </div>
      {rows.map((r, i) => {
        const header = grouped && (i === 0 || r.phase !== phase) ? (
          <div
            data-testid="portal-gantt-phase"
            style={{ fontWeight: 600, color: color.navy, fontSize: '13px', padding: '10px 0 2px' }}
          >
            {r.phase ?? 'Other work'}
          </div>
        ) : null;
        phase = r.phase;
        const left = r.start ? ((dayNumber(r.start) - from) / span) * 100 : 0;
        const width = r.start && r.finish ? ((dayNumber(r.finish) - dayNumber(r.start) + 1) / span) * 100 : 0;
        return (
          <div key={i}>
            {header}
            <div data-testid="portal-gantt-row" style={{ padding: '6px 0', borderTop: `1px solid ${color.rowDivider}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '12.5px' }}>
                <span style={{ color: color.navy, minWidth: 0, overflowWrap: 'anywhere' }}>
                  {r.title}
                  {!grouped && r.phase ? <span style={{ color: color.muted }}> · {r.phase}</span> : null}
                </span>
                <span style={{ color: color.muted, whiteSpace: 'nowrap' }}>
                  {r.start && r.finish ? `${day(r.start)} → ${day(r.finish)}` : 'Not yet scheduled'}
                </span>
              </div>
              <div style={{ position: 'relative', height: '10px', marginTop: '5px', background: color.rowDivider, borderRadius: '5px' }}>
                {r.start && r.finish ? (
                  <div
                    data-testid="portal-gantt-bar"
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: `${left}%`,
                      width: `${width}%`,
                      background: color.primary,
                      borderRadius: '5px',
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
