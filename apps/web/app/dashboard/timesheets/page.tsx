import { redirect } from 'next/navigation';

/**
 * Redirect stub (S85): Timesheets moved to a subpage of Timeclock
 * (/dashboard/timeclock/timesheets). Kept so bookmarks and old links survive;
 * preserves the ?week= anchor.
 */
export default function TimesheetsRedirect({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  redirect(
    `/dashboard/timeclock/timesheets${searchParams.week ? `?week=${searchParams.week}` : ''}`
  );
}
