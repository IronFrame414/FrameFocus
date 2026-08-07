import { notFound } from 'next/navigation';
import { getProject } from '@/lib/services/projects';
import { getChangeOrder, type ChangeOrderType } from '@/lib/services/change-orders';
import { requireCoWriteAccess } from '@/app/m/detail-access';
import { CoCreateForm } from './co-create-form';
import { CoEditor } from './co-editor';

// M6M §4.11.12 — M-32 · Change order create AND edit.
//
// ===========================================================================
// ONE ROUTE, TWO MODES — AND THAT IS §1's TABLE, NOT AN ECONOMY
// ===========================================================================
// §1 lists exactly one route for this screen:
//
//     p/[projectId]/changes/new/page.tsx   M-32  CO create+edit  OWNER/ADMIN/PM
//
// and §4.11.12 says M-32 "Also serves editing a `draft`, reached from M-31's
// Edit." There is no `[coId]/edit` in the route table, so this file is both.
// `?co=<id>` selects edit mode. A separate edit route would have been the
// obvious build and would have added a route §1 does not have.
//
// It stays deep-linkable either way, which is all D-55 asks of a page: the
// editor URL survives a bookmark and a PWA cold start.
//
// ===========================================================================
// WHY CREATE AND EDIT ARE TWO COMPONENTS BEHIND ONE ROUTE
// ===========================================================================
// **`createChangeOrder` takes no amount** — §4.11.12 calls this "THE BIGGEST
// SCOPE FACT IN D-51". `net_delta` is a stored column computed by
// `recalculateChangeOrderTotals()` from line items → line rows, so a change
// order cannot be created with a value: it is created, and THEN priced. The two
// halves are genuinely different screens and pretending otherwise would mean a
// create form with a dead, un-saveable line-item section.
//
// So: create writes the CO and lands on the editor with its new id. From there
// the author builds line items and rows, and every pricing edit recalculates.
//
// ===========================================================================
// THE GUARD, AND WHAT IT IS AND IS NOT DOING
// ===========================================================================
// `requireCoWriteAccess` refuses FIVE roles — foreman and crew_member included,
// even though D-53 lets both READ M-31. But unlike the four read guards, this
// one is not the enforcement: `change_orders_insert_authorized` carries exactly
// owner/admin/project_manager, so the database refuses them anyway. See
// app/m/detail-access.ts for the asymmetry stated in full.

export default async function NewChangeOrderPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { co?: string };
}) {
  const backTo = `/m/p/${params.projectId}/changes`;
  await requireCoWriteAccess(backTo);

  const project = await getProject(params.projectId);
  if (!project) notFound();

  // CREATE MODE.
  if (!searchParams.co) {
    return (
      <CoCreateForm
        projectId={params.projectId}
        projectName={project.name}
        // createChangeOrder defaults co_type to the project's type and falls
        // back to fixed_price. Preselecting the same value means the default
        // BEHAVIOUR is unchanged by D-62 — what changed is that the author can
        // now see it and pick another.
        defaultType={asCoType(project.project_type)}
      />
    );
  }

  // EDIT MODE.
  const co = await getChangeOrder(searchParams.co);
  if (!co) notFound();
  // A CO deep-linked under the wrong project is a wrong link, not a permission
  // — RLS already answered the permission question.
  if (co.project_id !== params.projectId) notFound();

  return <CoEditor projectId={params.projectId} projectName={project.name} co={co} />;
}

/**
 * `projects.project_type` and `change_orders.co_type` are separate CHECK
 * constraints that happen to share three values today. Narrowed explicitly
 * rather than cast, so a new project type does not silently become an invalid
 * co_type and fail at the INSERT.
 */
function asCoType(projectType: string): ChangeOrderType {
  return projectType === 'cost_plus' || projectType === 'time_and_materials'
    ? projectType
    : 'fixed_price';
}
