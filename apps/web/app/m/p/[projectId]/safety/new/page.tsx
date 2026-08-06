import { notFound } from 'next/navigation';
import { getProject } from '@/lib/services/projects';
import { getMembers } from '@/lib/services/members';
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

  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '')
    ? searchParams.date!
    : new Date().toISOString().slice(0, 10);

  return (
    <IncidentForm
      projectId={params.projectId}
      projectName={project.name}
      roster={roster}
      initialDate={date}
    />
  );
}
