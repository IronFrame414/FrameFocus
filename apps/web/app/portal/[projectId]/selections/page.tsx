import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getPortalIdentity, getPortalProjects } from '@/lib/services/portal';
import { PortalCard, PortalEmpty } from '../../portal-ui';

/**
 * PAGE 4 of 4 — Selections. **A DELIBERATE DEAD PAGE.** [Josh, S168]
 *
 * ===========================================================================
 * ⚠️ THE ROUTE IS THE DELIVERABLE. THE FEATURE IS NOT.
 * ===========================================================================
 * Josh: *"add page now. It will be a dead page. It will be built soon and the
 * portal shouldn't be built twice."* So the nav entry and this route exist, and
 * nothing else does.
 *
 * ⚠️ DO NOT BUILD AN ALLOWANCE SURFACE HERE. R21 is deferred to its own module,
 * which **starts at the estimate and budget side**, and that foundation does
 * not exist yet. A client-facing selections screen built first would be
 * designed backwards from the tip — it would invent a shape for allowances,
 * and the module that actually owns them would then have to either adopt the
 * guess or break this page. There is no storage, no service call and no query
 * in this file on purpose. Adding one is the mistake this comment exists to
 * prevent.
 *
 * ===========================================================================
 * AND IT MUST NOT READ AS BROKEN
 * ===========================================================================
 * An empty page with no explanation is indistinguishable from a page that
 * failed to load, and a client cannot tell the difference — she has no console
 * and no other tenant to compare against. So it says plainly what it is: not
 * "coming soon" as a product tease, but the one honest fact, which is that
 * selections will appear here when there is something to choose.
 *
 * The layout above still runs the guard and the project lookup, so a client who
 * does not own this project gets `notFound()` here exactly as she does on the
 * other three. A dead page is not an unguarded one.
 */
export default async function PortalSelectionsPage({
  params,
}: {
  params: { projectId: string };
}) {
  const supabase = await createClient();
  const identity = await getPortalIdentity(supabase);
  if (!identity) return null;

  const projects = await getPortalProjects(supabase);
  if (!projects.some((p) => p.id === params.projectId)) notFound();

  return (
    <PortalCard title="Selections" subtitle="Finishes, fixtures and materials to choose.">
      <PortalEmpty>
        <span data-testid="portal-selections-empty">
          There is nothing to choose yet. When your contractor sets up the finishes, fixtures and
          materials for your job, they will appear here for you to pick from and approve.
        </span>
      </PortalEmpty>
    </PortalCard>
  );
}
