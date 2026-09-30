'use client';

// S121 Part 5 — the calendar that SCHEDULES (desktop). The one place the
// calendar is wired to the scheduling sheet (5-D) and to drag/resize (5-E), so
// the company Schedule, a project's Schedule tab and the project overview
// (5-I) behave identically.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar } from './calendar';
import { ScheduleSheet, type ScheduleMember } from './schedule-sheet';
import { moveCalendarEvent, type CalendarEvent } from '@/lib/services/schedule-client';
import { canAddToProjectFromSchedule, canSchedule } from '@/lib/schedule/authority';

export function SchedulingCalendar({
  events,
  projects,
  members,
  role,
  fixedProjectId,
  onSelect,
}: {
  events: CalendarEvent[];
  /** Open jobs the viewer may schedule on (the sheet's project picker). */
  projects: { id: string; name: string }[];
  members: ScheduleMember[];
  role: string | null;
  fixedProjectId?: string | null;
  onSelect?: (e: CalendarEvent) => void;
}) {
  const router = useRouter();
  const may = canSchedule(role);
  const [sheetDay, setSheetDay] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <div>
      <Calendar
        events={events}
        onSelect={onSelect}
        onDayClick={may ? (d) => setSheetDay(d) : undefined}
        canMove={(e) => may && (e.source === 'task' || e.source === 'general')}
        onMove={
          may
            ? async (e, start, end) => {
                const r = await moveCalendarEvent(e, start, end);
                if (!r.success) return r.error ?? 'The change was not saved.';
                router.refresh();
                return null;
              }
            : undefined
        }
      />
      {toast ? (
        <p data-testid="schedule-toast" role="status" style={{ marginTop: '8px', fontSize: '13px', color: '#15803d' }}>
          {toast}
        </p>
      ) : null}
      {sheetDay ? (
        <ScheduleSheet
          open
          onClose={() => setSheetDay(null)}
          dayKey={sheetDay}
          projects={projects}
          fixedProjectId={fixedProjectId}
          members={members}
          canAssignToProject={canAddToProjectFromSchedule(role)}
          onSaved={(m) => {
            setToast(m);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
