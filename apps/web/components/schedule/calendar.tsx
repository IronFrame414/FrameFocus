'use client';

import { useState } from 'react';
import type { CalendarEvent } from '@/lib/services/schedule-client';
import { memberColor } from './member-color';
import { color, font } from '@/lib/theme';

interface CalendarProps {
  events: CalendarEvent[];
  /** Click-to-detail (5B §8): every event is clickable */
  onSelect?: (event: CalendarEvent) => void;
}

type ViewMode = 'month' | 'week';

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

/**
 * Month/week employee calendar (5B §8), restyled to 1a (ui-01 §5a). Renders
 * the pre-assembled UNION of dated tasks + general entries + job-level
 * inspections; each member in their color. Inspections use the 1a inspection
 * chip family (ui-02 §4).
 */
export function Calendar({ events, onSelect }: CalendarProps) {
  const [view, setView] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });

  // Build the visible day range
  let days: Date[] = [];
  let title = '';
  if (view === 'month') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    days = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      return d;
    });
    title = anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } else {
    const weekStart = startOfWeek(anchor);
    days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
    const end = days[6];
    title = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  function shift(direction: -1 | 1) {
    const next = new Date(anchor);
    if (view === 'month') next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + 7 * direction);
    setAnchor(next);
  }

  function eventsFor(dayKey: string): CalendarEvent[] {
    return events.filter((e) => e.start_date <= dayKey && e.end_date >= dayKey);
  }

  const todayKey = toKey(new Date());

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
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => shift(-1)} style={navButton} aria-label="Previous">
            ←
          </button>
          <span
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
        {/* Week/Month segmented toggle (ui-02 §4 pattern) */}
        <div
          style={{
            display: 'flex',
            gap: '2px',
            backgroundColor: color.neutralBadgeBg,
            borderRadius: '8px',
            padding: '3px',
          }}
        >
          {(['week', 'month'] as ViewMode[]).map((m) => (
            <button
              key={m}
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
              {m === 'month' ? 'Month' : 'Week'}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          border: `1px solid ${color.cardBorder}`,
          borderRadius: '9px',
          overflow: 'hidden',
          backgroundColor: color.cardBorder,
          gap: '1px',
        }}
      >
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
              backgroundColor: color.tableHeadBg,
              textAlign: 'center',
            }}
          >
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = toKey(day);
          const dayEvents = eventsFor(key);
          const inMonth = view === 'week' || day.getMonth() === anchor.getMonth();
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              style={{
                minHeight: view === 'month' ? '96px' : '160px',
                padding: '4px',
                backgroundColor: inMonth ? '#fff' : color.tableHeadBg,
                fontSize: '12px',
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
                  marginBottom: '3px',
                }}
              >
                {day.getDate()}
              </div>
              {dayEvents.map((e) => (
                <button
                  key={`${e.source}-${e.id}`}
                  onClick={() => onSelect?.(e)}
                  title={`${e.title}${e.member_name ? ` — ${e.member_name}` : ''}`}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    marginBottom: '3px',
                    padding: '3px 5px',
                    borderRadius: '4px',
                    fontSize: '10.5px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    cursor: onSelect ? 'pointer' : 'default',
                    border: 'none',
                    backgroundColor:
                      e.source === 'inspection'
                        ? color.blueTintAlt
                        : memberColor(e.member_id, e.color) + '22',
                    color:
                      e.source === 'inspection' ? '#3a4db0' : memberColor(e.member_id, e.color),
                    borderLeft:
                      e.source === 'inspection'
                        ? '3px solid #7385d8'
                        : `3px solid ${memberColor(e.member_id, e.color)}`,
                  }}
                >
                  {e.member_name ? `${e.member_name}: ` : ''}
                  {e.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
