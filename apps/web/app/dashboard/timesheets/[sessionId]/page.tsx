import { redirect } from 'next/navigation';

/**
 * Redirect stub (S85): day detail moved with the Timesheets subpage —
 * /dashboard/timeclock/timesheets/[sessionId].
 */
export default function TimesheetDetailRedirect({
  params,
}: {
  params: { sessionId: string };
}) {
  redirect(`/dashboard/timeclock/timesheets/${params.sessionId}`);
}
