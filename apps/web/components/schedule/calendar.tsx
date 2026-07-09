'use client';

import { useState } from 'react';
import type { CalendarEvent } from '@/lib/services/schedule-client';
import { memberColor } from './member-color';

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
 * Month/week employee calendar (5B §8). Renders the pre-assembled UNION of
 * dated tasks + general entries + job-level inspections; each member in
 * their color.
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
    padding: '0.25rem 0.625rem',
    fontSize: '0.875rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    backgroundColor: '#fff',
    cursor: 'pointer',
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button onClick={() => shift(-1)} style={navButton}>
            ←
          </button>
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, minWidth: '180px', textAlign: 'center' }}>
            {title}
          </span>
          <button onClick={() => shift(1)} style={navButton}>
            →
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          {(['month', 'week'] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setView(m)}
              style={{
                ...navButton,
                backgroundColor: view === m ? '#2563eb' : '#fff',
                color: view === m ? '#fff' : '#374151',
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
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          overflow: 'hidden',
          backgroundColor: '#e5e7eb',
          gap: '1px',
        }}
      >
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div
            key={d}
            style={{
              padding: '0.375rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#6b7280',
              backgroundColor: '#f9fafb',
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
          return (
            <div
              key={key}
              style={{
                minHeight: view === 'month' ? '96px' : '160px',
                padding: '0.25rem',
                backgroundColor: inMonth ? '#fff' : '#f9fafb',
                fontSize: '0.75rem',
              }}
            >
              <div
                style={{
                  fontWeight: key === todayKey ? 700 : 400,
                  color: key === todayKey ? '#2563eb' : inMonth ? '#374151' : '#9ca3af',
                  marginBottom: '0.125rem',
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
                    marginBottom: '2px',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    fontSize: '0.6875rem',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    cursor: onSelect ? 'pointer' : 'default',
                    border: e.source === 'inspection' ? '1px dashed #92400e' : 'none',
                    backgroundColor:
                      e.source === 'inspection'
                        ? '#fef3c7'
                        : memberColor(e.member_id, e.color) + '22',
                    color:
                      e.source === 'inspection'
                        ? '#92400e'
                        : memberColor(e.member_id, e.color),
                    borderLeft:
                      e.source === 'inspection'
                        ? '3px solid #d97706'
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
