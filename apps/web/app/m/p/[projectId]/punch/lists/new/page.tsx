import { notFound } from 'next/navigation';
import { getProject } from '@/lib/services/projects';
import { getPunchLists } from '@/lib/services/punch';
import { PunchListForm } from './list-form';

// M6M — M-41 · `/m/p/[projectId]/punch/lists/new`. D-63 [S121, Josh].
//
// A PUNCH LIST IS STANDALONE. Until D-63 a list could only come into existence
// as a side effect of creating an item, which meant a foreman could not lay out
// "Second floor" / "Client walkthrough" before the walk — and, reported from a
// device [S120, Josh], could not find any way to "create a list" at all, because
// the only control on M-14 said **New punch item** and the list option lived
// inside that form's picker.
//
// ⚠️ NO ROLE GUARD, for the same reason M-33 takes none:
// `punch_lists_insert_authenticated` admits every role, subcontractors included
// (D-52 as corrected, S110), and §4.11.10a forecloses gating a further surface
// "because there is a pattern now". Do not add one by analogy with
// `deletePunchList`, which is Foreman+ — delete and create are different verbs.
//
// `getPunchLists` is reused rather than a new count query — §1's shared-service
// rule — and its names feed the duplicate WARNING (not a block: the table
// carries no unique constraint on (project_id, name), so duplicates are legal).

export default async function NewPunchListPage({
  params,
}: {
  params: { projectId: string };
}) {
  const [project, lists] = await Promise.all([
    getProject(params.projectId),
    getPunchLists(params.projectId),
  ]);
  if (!project) notFound();

  return (
    <PunchListForm
      projectId={params.projectId}
      projectName={project.name}
      existingNames={lists.map((l) => l.name.trim().toLowerCase())}
    />
  );
}
