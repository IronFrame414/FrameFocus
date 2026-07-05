'use client';

import { useRouter } from 'next/navigation';
import type { CalendarEvent } from '@/lib/services/schedule-client';
import { Calendar } from '@/components/schedule/calendar';

/**
 * Company-wide employee calendar on the main dashboard (5B §8): every dated
 * task + general entry + inspection across all jobs, each member in their
 * color. Crew sees own-only (filtered server-side). Click-to-detail routes
 * into the event's project schedule tab.
 */
export function CompanyCalendar({ events }: { events: CalendarEvent[] }) {
  const router = useRouter();

  return (
    <Calendar
      events={events}
      onSelect={(event) => {
        if (event.project_id) {
          router.push(`/dashboard/projects/${event.project_id}/schedule`);
        }
      }}
    />
  );
}
