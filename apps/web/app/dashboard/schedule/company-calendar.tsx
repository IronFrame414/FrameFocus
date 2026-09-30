'use client';

import { useRouter } from 'next/navigation';
import type { CalendarEvent } from '@/lib/services/schedule-client';
import { SchedulingCalendar } from '@/components/schedule/scheduling-calendar';
import type { ScheduleMember } from '@/components/schedule/schedule-sheet';

/**
 * Company-wide employee calendar (5B §8): every dated task + general entry +
 * inspection across all jobs, each member in their color. Crew sees own-only
 * (filtered server-side). Click-to-detail routes into the event's project
 * schedule tab. [S121 Part 5] It now SCHEDULES — click a day, drag, resize —
 * for the roles that may (lib/schedule/authority.ts).
 */
export function CompanyCalendar({
  events,
  projects,
  members,
  role,
}: {
  events: CalendarEvent[];
  projects: { id: string; name: string }[];
  members: ScheduleMember[];
  role: string | null;
}) {
  const router = useRouter();

  return (
    <SchedulingCalendar
      events={events}
      projects={projects}
      members={members}
      role={role}
      onSelect={(event) => {
        if (event.project_id) {
          router.push(`/dashboard/projects/${event.project_id}/schedule`);
        }
      }}
    />
  );
}
