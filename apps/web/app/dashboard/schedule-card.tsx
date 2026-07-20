'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CalendarEvent } from '@/lib/services/schedule-client';
import { Calendar } from '@/components/schedule/calendar';
import { color, font } from '@/lib/theme';

/**
 * ui-02 §4 — "This week — crew schedule" dashboard card. Week view is the 1a
 * 7-day chip grid; Month falls back to the shared (restyled) Calendar. Chip
 * families derive GENERICALLY from company_members.member_type — no tenant
 * names. Known: vendors sync in as member_type='subcontractor' and chip as
 * "Sub" until tech-debt #89 is fixed at the source (spec round 2).
 */

type ChipFamily = 'sub' | 'crew' | 'inspection';

const CHIP_STYLES: Record<ChipFamily, { bg: string; fg: string; bar: string }> = {
  sub: { bg: '#fdece0', fg: '#b45309', bar: '#ea9a52' },
  crew: { bg: '#e4f0e6', fg: '#3d7a4b', bar: '#6bab7a' },
  inspection: { bg: '#e7ebf9', fg: '#3a4db0', bar: '#7385d8' },
};

function familyFor(e: CalendarEvent): ChipFamily {
  if (e.source === 'inspection') return 'inspection';
  return e.member_type === 'subcontractor' ? 'sub' : 'crew';
}

function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ScheduleCard({ events }: { events: CalendarEvent[] }) {
  const router = useRouter();
  const [view, setView] = useState<'week' | 'month'>('week');

  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const todayKey = toKey(now);

  function eventsFor(dayKey: string): CalendarEvent[] {
    return events.filter((e) => e.start_date <= dayKey && e.end_date >= dayKey);
  }

  function open(e: CalendarEvent) {
    if (e.project_id) router.push(`/dashboard/projects/${e.project_id}/schedule`);
  }

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
        <span style={{ fontSize: '15px', fontWeight: 700, color: color.navy }}>
          This week — crew schedule
        </span>
        <div
          style={{
            display: 'flex',
            gap: '2px',
            backgroundColor: color.neutralBadgeBg,
            borderRadius: '8px',
            padding: '3px',
          }}
        >
          {(['week', 'month'] as const).map((m) => (
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
              }}
            >
              {m === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' ? (
        <Calendar events={events} onSelect={open} />
      ) : (
        <>
          {/* Day grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '8px',
              marginBottom: '10px',
            }}
          >
            {days.map((d) => {
              const key = toKey(d);
              const isToday = key === todayKey;
              return (
                <div key={key} style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontFamily: font.mono,
                      fontSize: '11px',
                      fontWeight: isToday ? 700 : 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: isToday ? color.primary : '#a2a8b2',
                    }}
                  >
                    {d.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div
                    style={{
                      display: 'inline-block',
                      fontFamily: font.mono,
                      fontSize: '15px',
                      fontWeight: 600,
                      marginTop: '2px',
                      padding: '1px 7px',
                      borderRadius: '7px',
                      backgroundColor: isToday ? color.primary : 'transparent',
                      color: isToday ? '#fff' : color.muted,
                    }}
                  >
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Event chips */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
            {days.map((d) => {
              const key = toKey(d);
              return (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {eventsFor(key).map((e) => {
                    const fam = CHIP_STYLES[familyFor(e)];
                    const label =
                      e.source === 'inspection' ? e.title : (e.member_name ?? e.title);
                    return (
                      <button
                        key={`${e.source}-${e.id}`}
                        onClick={() => open(e)}
                        title={`${e.title}${e.member_name ? ` — ${e.member_name}` : ''}`}
                        style={{
                          fontFamily: font.sans,
                          fontSize: '10.5px',
                          fontWeight: 600,
                          borderRadius: '4px',
                          padding: '5px 6px',
                          border: 'none',
                          borderLeft: `3px solid ${fam.bar}`,
                          backgroundColor: fam.bg,
                          color: fam.fg,
                          cursor: e.project_id ? 'pointer' : 'default',
                          textAlign: 'left',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
