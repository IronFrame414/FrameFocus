import { getProjects } from '@/lib/services/projects';
import { getMembers } from '@/lib/services/members';
import { LogForm, type SubMember } from './log-form';

// M6M §4.12.3 — M-21 · Daily log entry (7c). THE ROUTE THAT CLOSES GAP-8's
// CORE DEFECT: §4.6's "Log the day" button resolved to nothing until this
// existed. A PAGE, not a sheet (D-28).
//
// Company-scoped route: the project rides in `?project=` (M-3's "Log the day"
// passes its own), else the form opens with a project picker row.

export default async function NewDailyLogPage({
  searchParams,
}: {
  searchParams: { project?: string };
}) {
  const [projects, members] = await Promise.all([
    getProjects({ status: 'active' }),
    getMembers().catch(() => []),
  ]);

  const subs: SubMember[] = (members ?? [])
    .filter((m) => m.member_type === 'subcontractor')
    .map((m) => ({ id: m.id, display_name: m.display_name }));

  const initial = projects.find((p) => p.id === searchParams.project)?.id ?? null;

  return (
    <LogForm
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        project_number: p.project_number,
      }))}
      initialProjectId={initial}
      subs={subs}
    />
  );
}
