import { notFound } from 'next/navigation';
import { getProject } from '@/lib/services/projects';
import { getMembers } from '@/lib/services/members';
import { getCompanyTimeSettings } from '@/lib/services/company';
import { companyToday } from '@framefocus/shared/utils/dates';
import { IncidentForm, type RosterMember } from './incident-form';

// M6M §4.12.5 — M-23 · Incident report (7e). "No contradictions — the
// best-grounded screen in the handoff." A PAGE (D-28).
//
// Reached two ways: from M-19, and from 7c's hazard escalation pre-filled with
// project (the route segment) and date (`?date=`) — D-29: NOTHING IS WRITTEN
// until the user submits here. Arriving via the offer with a blank form and
// leaving again persists no row anywhere.

export default async function NewIncidentPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { date?: string };
}) {
  const [project, members] = await Promise.all([
    getProject(params.projectId),
    getMembers().catch(() => []),
  ]);
  if (!project) notFound();

  const roster: RosterMember[] = (members ?? []).map((m) => ({
    id: m.id,
    display_name: m.display_name,
    member_type: m.member_type,
  }));

  // The default incident date is a CALENDAR DATE, so it must be the company's
  // day, not UTC's [S106]. Derived from toISOString() an incident reported
  // after ~20:00 EDT defaulted to TOMORROW — wrong data on a safety record,
  // not a display nit.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '')
    ? searchParams.date!
    : companyToday((await getCompanyTimeSettings()).timezone);

  return (
    <IncidentForm
      projectId={params.projectId}
      projectName={project.name}
      roster={roster}
      initialDate={date}
    />
  );
}
