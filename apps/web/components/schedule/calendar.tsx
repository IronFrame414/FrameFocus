'use client';

import { useMemo, useRef, useState } from 'react';
import type { CalendarEvent } from '@/lib/services/schedule-client';
import { layoutWeek } from '@/lib/schedule/lanes';
import { addDays, applyDrag, daysBetween, type DragMode } from '@/lib/schedule/drag';
import { Gantt, ganttGroupsFromEvents } from './gantt';
import { memberColor } from './member-color';
import { color, font } from '@/lib/theme';

// 5B §8 → S121 Part 5. The desktop calendar: WEEK / MONTH / GANTT.
//
// [S121 5-H] Multi-day bars CONNECT (lib/schedule/lanes.ts): one segment per
//   event per week row, stacked in lanes; a bar cut by the row break is squared
//   off and carries ‹ / › so the two pieces read as one bar.
//   SUPERSEDED: eventsFor(day) — the same event repeated as a chip in every
//   day cell it touched.
// [S121 5-B] GANTT is the third view — one bar per task (ASK-2), through the
//   SAME Gantt component the project panel uses (ganttGroupsFromEvents).
// [S121 5-D] A day cell is clickable when `onDayClick` is given (the
//   scheduling sheet opens with that day as the start).
// [S121 5-E] Bars DRAG (the whole range, length kept) and RESIZE (either end)
//   when `onMove` is given and `canMove(event)` says so. The arithmetic is
//   lib/schedule/drag.ts; a resize past the other end CLAMPS at one day and the
//   note under the grid says so. Only tasks and general entries move.

interface CalendarProps {
  events: CalendarEvent[];
  /** Click-to-detail (5B §8): every event is clickable */
  onSelect?: (event: CalendarEvent) => void;
  /** [S121 5-D] Click an empty part of a day → schedule on that day. */
  onDayClick?: (dayKey: string) => void;
  /** [S121 5-E] Persist a drag/resize; resolves to an error sentence or null. */
  onMove?: (event: CalendarEvent, start: string, end: string) => Promise<string | null>;
  canMove?: (event: CalendarEvent) => boolean;
  /** Which views to offer; default all three. */
  views?: ViewMode[];
}

type ViewMode = 'month' | 'week' | 'gantt';

function toKey(d: Date): string {
  // Local date parts — toISOString() would shift the day in +UTC timezones
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay()); // Sunday
  return copy;
}

const LANE_H = 20;
const LANES_SHOWN = { month: 4, week: 9 } as const;

interface DragState {
  event: CalendarEvent;
  mode: DragMode;
  originDay: string;
  deltaDays: number;
  moved: boolean;
}

export function Calendar({
  events,
  onSelect,
  onDayClick,
  onMove,
  canMove,
  views = ['week', 'month', 'gantt'],
}: CalendarProps) {
  const [view, setView] = useState<ViewMode>(views.includes('month') ? 'month' : views[0]);
  const [anchor, setAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Build the visible week rows
  let weeks: string[] = [];
  let title = '';
  if (view === 'month') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = toKey(startOfWeek(first));
    weeks = Array.from({ length: 6 }, (_, i) => addDays(gridStart, i * 7));
    title = anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } else {
    const weekStart = startOfWeek(anchor);
    weeks = [toKey(weekStart)];
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    title = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  function shift(direction: -1 | 1) {
    const next = new Date(anchor);
    if (view === 'month') next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + 7 * direction);
    setAnchor(next);
  }

  // The bars as they render: a dragged bar shows its PREVIEW range.
  const shown = useMemo(() => {
    if (!drag) return events;
    const r = applyDrag({ start: drag.event.start_date, end: drag.event.end_date }, drag.mode, drag.deltaDays);
    return events.map((e) => (e.key === drag.event.key ? { ...e, start_date: r.start, end_date: r.end } : e));
  }, [events, drag]);

  const todayKey = toKey(new Date());
  const monthNum = anchor.getMonth();

  function dayUnder(x: number, y: number): string | null {
    for (const el of document.elementsFromPoint(x, y)) {
      const d = (el as HTMLElement).dataset?.date;
      if (d) return d;
    }
    return null;
  }

  function beginDrag(e: React.PointerEvent, ev: CalendarEvent, mode: DragMode) {
    if (!onMove || !canMove?.(ev) || e.button !== 0) return;
    const origin = dayUnder(e.clientX, e.clientY);
    if (!origin) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const s: DragState = { event: ev, mode, originDay: origin, deltaDays: 0, moved: false };
    dragRef.current = s;
    setDrag(s);
    setNote(null);
  }

  function onPointerMove(e: React.PointerEvent) {
    const cur = dragRef.current;
    if (!cur) return;
    const day = dayUnder(e.clientX, e.clientY);
    if (!day) return;
    const delta = daysBetween(cur.originDay, day);
    if (delta === cur.deltaDays) return;
    const next = { ...cur, deltaDays: delta, moved: cur.moved || delta !== 0 };
    dragRef.current = next;
    setDrag(next);
  }

  async function onPointerUp() {
    const cur = dragRef.current;
    dragRef.current = null;
    if (!cur) return;
    if (!cur.moved || cur.deltaDays === 0) {
      setDrag(null);
      // No day changed: it was a click.
      if (!cur.moved) onSelect?.(cur.event);
      return;
    }
    const r = applyDrag({ start: cur.event.start_date, end: cur.event.end_date }, cur.mode, cur.deltaDays);
    setSaving(true);
    const err = await onMove!(cur.event, r.start, r.end);
    setSaving(false);
    setDrag(null);
    if (err) setNote(err);
    else if (r.clamped) setNote('A bar cannot end before it starts — it was kept to one day.');
  }

  const navButton: React.CSSProperties = {
    padding: '5px 11px',
    fontSize: '13px',
    fontWeight: 600,
    color: color.body,
    border: `1px solid ${color.inputBorder}`,
    borderRadius: '9px',
    backgroundColor: '#fff',
    cursor: 'pointer',
    transition: 'background-color 140ms ease',
  };

  return (
    <div data-testid="schedule-calendar" data-view={view}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        {view === 'gantt' ? (
          <span style={{ fontSize: '15px', fontWeight: 700, color: color.navy }}>Timeline · one bar per task</span>
        ) : (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => shift(-1)} style={navButton} aria-label="Previous">
              ←
            </button>
            <span
              data-testid="calendar-title"
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: color.navy,
                minWidth: '180px',
                textAlign: 'center',
              }}
            >
              {title}
            </span>
            <button onClick={() => shift(1)} style={navButton} aria-label="Next">
              →
            </button>
          </div>
        )}
        {/* Week / Month / Gantt segmented toggle (ui-02 §4 pattern) */}
        <div
          style={{
            display: 'flex',
            gap: '2px',
            backgroundColor: color.neutralBadgeBg,
            borderRadius: '8px',
            padding: '3px',
          }}
        >
          {views.map((m) => (
            <button
              key={m}
              data-testid={`calendar-view-${m}`}
              onClick={() => setView(m)}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                backgroundColor: view === m ? '#fff' : 'transparent',
                boxShadow: view === m ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                color: view === m ? color.navy : color.mutedAlt,
                transition: 'background-color 140ms ease',
              }}
            >
              {m === 'month' ? 'Month' : m === 'week' ? 'Week' : 'Gantt'}
            </button>
          ))}
        </div>
      </div>

      {view === 'gantt' ? (
        <Gantt
          groups={ganttGroupsFromEvents(events)}
          onSelect={(id) => {
            const e = events.find((x) => x.source === 'task' && x.id === id);
            if (e) onSelect?.(e);
          }}
        />
      ) : (
        <div
          onPointerMove={onPointerMove}
          onPointerUp={() => void onPointerUp()}
          onPointerCancel={() => {
            dragRef.current = null;
            setDrag(null);
          }}
          style={{
            border: `1px solid ${color.cardBorder}`,
            borderRadius: '9px',
            overflow: 'hidden',
            userSelect: drag ? 'none' : undefined,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: color.tableHeadBg }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div
                key={d}
                style={{
                  padding: '6px',
                  fontFamily: font.mono,
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: '#a2a8b2',
                  textAlign: 'center',
                }}
              >
                {d}
              </div>
            ))}
          </div>
          {weeks.map((weekStart) => {
            const segs = layoutWeek(shown, weekStart);
            const maxLanes = view === 'month' ? LANES_SHOWN.month : LANES_SHOWN.week;
            const rowMinH = view === 'month' ? 96 : 60 + LANES_SHOWN.week * (LANE_H + 3);
            return (
              <div
                key={weekStart}
                data-testid="calendar-week"
                style={{ position: 'relative', borderTop: `1px solid ${color.cardBorder}` }}
              >
                {/* Day cells: background, date number, click target. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {Array.from({ length: 7 }, (_, i) => {
                    const key = addDays(weekStart, i);
                    const inMonth = view === 'week' || Number(key.slice(5, 7)) - 1 === monthNum;
                    const isToday = key === todayKey;
                    const hidden = segs.filter(
                      (s) => s.lane >= maxLanes && s.col <= i && s.col + s.span - 1 >= i
                    ).length;
                    return (
                      <div
                        key={key}
                        data-date={key}
                        data-testid={`calendar-day-${key}`}
                        onClick={() => onDayClick?.(key)}
                        style={{
                          minHeight: `${rowMinH}px`,
                          padding: '4px',
                          backgroundColor: inMonth ? '#fff' : color.tableHeadBg,
                          borderLeft: i === 0 ? 'none' : `1px solid ${color.cardBorder}`,
                          cursor: onDayClick ? 'pointer' : 'default',
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            display: 'inline-block',
                            fontFamily: font.mono,
                            fontSize: '12px',
                            fontWeight: 600,
                            padding: isToday ? '1px 6px' : '1px 0',
                            borderRadius: '7px',
                            backgroundColor: isToday ? color.primary : 'transparent',
                            color: isToday ? '#fff' : inMonth ? color.muted : color.faintAlt,
                          }}
                        >
                          {Number(key.slice(8, 10))}
                        </div>
                        {hidden > 0 && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '3px',
                              left: '5px',
                              fontSize: '10.5px',
                              color: color.muted,
                            }}
                          >
                            +{hidden} more
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Bars: one segment per event per row, laid over the cells. */}
                {segs
                  .filter((s) => s.lane < maxLanes)
                  .map((s) => {
                    const e = s.event;
                    const c = e.source === 'inspection' ? '#3a4db0' : (e.color ?? memberColor(e.member_id, null));
                    const movable = !!onMove && !!canMove?.(e);
                    const dragging = drag?.event.key === e.key;
                    const label = `${e.member_name ? `${e.member_name}: ` : ''}${e.title}${e.color_note ? ` (${e.color_note})` : ''}`;
                    return (
                      <div
                        key={`${e.key}-${weekStart}`}
                        data-testid="calendar-bar"
                        data-key={e.key}
                        data-start={e.start_date}
                        data-end={e.end_date}
                        title={label}
                        onPointerDown={(p) => beginDrag(p, e, 'move')}
                        onClick={(c2) => {
                          c2.stopPropagation();
                          if (!movable) onSelect?.(e);
                        }}
                        style={{
                          position: 'absolute',
                          top: `${24 + s.lane * (LANE_H + 3)}px`,
                          left: `calc(${(s.col / 7) * 100}% + 3px)`,
                          width: `calc(${(s.span / 7) * 100}% - 6px)`,
                          height: `${LANE_H}px`,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          padding: '0 6px',
                          fontSize: '10.5px',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          boxSizing: 'border-box',
                          cursor: movable ? (dragging ? 'grabbing' : 'grab') : onSelect ? 'pointer' : 'default',
                          backgroundColor: e.source === 'inspection' ? color.blueTintAlt : c + '22',
                          color: c,
                          borderLeft: s.continuesLeft ? `1px dashed ${c}` : `3px solid ${c}`,
                          // The row break: squared edges on the cut side.
                          borderRadius: `${s.continuesLeft ? 0 : 4}px ${s.continuesRight ? 0 : 4}px ${s.continuesRight ? 0 : 4}px ${s.continuesLeft ? 0 : 4}px`,
                          opacity: dragging && saving ? 0.6 : 1,
                          outline: dragging ? `2px solid ${c}` : 'none',
                          touchAction: movable ? 'none' : undefined,
                          zIndex: dragging ? 3 : 1,
                        }}
                      >
                        {movable && !s.continuesLeft && (
                          <span
                            data-testid="calendar-bar-start"
                            onPointerDown={(p) => beginDrag(p, e, 'resize-start')}
                            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '7px', cursor: 'ew-resize' }}
                          />
                        )}
                        {s.continuesLeft && <span aria-hidden>‹</span>}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{label}</span>
                        {s.continuesRight && <span aria-hidden>›</span>}
                        {movable && !s.continuesRight && (
                          <span
                            data-testid="calendar-bar-end"
                            onPointerDown={(p) => beginDrag(p, e, 'resize-end')}
                            style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '7px', cursor: 'ew-resize' }}
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}
      {note && (
        <p data-testid="calendar-note" style={{ marginTop: '8px', fontSize: '12.5px', color: color.warning }}>
          {note}
        </p>
      )}
      {drag && drag.moved && (
        <p data-testid="calendar-drag-preview" style={{ marginTop: '8px', fontSize: '12.5px', color: color.muted }}>
          {(() => {
            const r = applyDrag({ start: drag.event.start_date, end: drag.event.end_date }, drag.mode, drag.deltaDays);
            return `${r.start}${r.end !== r.start ? ` → ${r.end}` : ''}${r.clamped ? ' (one day — the end cannot come before the start)' : ''}`;
          })()}
        </p>
      )}
    </div>
  );
}
