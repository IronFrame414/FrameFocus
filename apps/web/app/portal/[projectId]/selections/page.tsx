import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { color } from '@/lib/theme';
import { getPortalIdentity, getPortalProjects } from '@/lib/services/portal';
import { getPortalProjectSelections } from '@/lib/services/selections';
import { PortalCard, PortalEmpty } from '../../portal-ui';
import { PortalSelectionCard } from './portal-selections-ui';

/**
 * PAGE 4 of 4 — Selections. **LIVE as of S175 stage 7.** Spec §9.3.
 *
 * ===========================================================================
 * ⚠️ THIS WAS THE DELIBERATE DEAD PAGE, AND IT IS NOT ONE ANY MORE
 * ===========================================================================
 * _Superseded, quoted rather than deleted, because the reasoning was right and
 * a later reader should be able to see that it was retired on purpose:_
 *
 *   > **THE ROUTE IS THE DELIVERABLE. THE FEATURE IS NOT.** Josh: *"add page
 *   > now. It will be a dead page. It will be built soon and the portal
 *   > shouldn't be built twice."* … **DO NOT BUILD AN ALLOWANCE SURFACE HERE.
 *   > R21 is deferred to its own module, which starts at the estimate and
 *   > budget side, and that foundation does not exist yet. A client-facing
 *   > selections screen built first would be designed backwards from the tip.**
 *
 * That foundation now exists: the allowance row type (stage 1), the selections
 * tables and their floors (stage 2), the company sheet (stage 3), the lifecycle
 * and the signature (stage 4), the money downstream (stage 5) and the
 * specifications sheet (stage 6). This page is the last stage of the module and
 * it closes the loop the module was built for — **it is the first thing in the
 * product that lets the client actually choose.**
 *
 * ===========================================================================
 * AND THE GUARD IS STILL THE LAYOUT'S
 * ===========================================================================
 * `notFound()` below matches the other three routes exactly. Four routes must
 * not become four guards — the layout owns the identity, the branding and the
 * project lookup, and what is READABLE comes back through the client arms, not
 * from any branch in this file.
 *
 * ⚠️ NO SERVICE ROLE HERE, as on all four pages (`portal-shell.live.ts` P7b
 * walks this directory). `getPortalProjectSelections()` takes the caller's
 * client; the definer functions behind it decide what she may have, and they do
 * it in the database where a raw PostgREST call hits them identically.
 *
 * ⚠️ ONE EXCEPTION, NAMED RATHER THAN LEFT TO BE DISCOVERED: option images are
 * signed with the admin client, one layer down in `signSelectionOptionImages()`
 * — S172's shipped split, shared with the company sheet and the specifications
 * sheet. The AUTHORISATION is still hers (`selection_option_images()` runs under
 * her session and returns nothing for a selection she cannot see); only the
 * storage URL is minted privileged, because storage RLS keys on
 * `files.client_visible` and that flag is deliberately not involved in option
 * images. Nothing on THIS page decides visibility.
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

  const areas = await getPortalProjectSelections(params.projectId, supabase);
  const limited = identity.accessLevel !== 'full';
  const signerName = [identity.firstName, identity.lastName].filter(Boolean).join(' ');

  // ⚠️ ONE STABLE MARKER ON BOTH BRANCHES, AND IT IS NOT DECORATION.
  // `portal-pages.spec.ts` used to prove this route by asserting the DEAD
  // page's empty sentence. That assertion cannot survive the page going live:
  // `desktop-selections.spec.ts` releases selections on the SAME shared QA
  // project and runs concurrently, so "the client sees nothing here" would pass
  // or fail on worker ordering — the S157 trap, an assertion whose name says
  // "none" reading a live, mutable row rather than a fact. This testid is
  // present in BOTH states, so the browser test can prove the route RENDERS
  // without depending on what happens to be on it.
  const marker = 'portal-selections';

  if (!areas.length) {
    return (
      <PortalCard title="Selections" subtitle="Finishes, fixtures and materials to choose.">
        <span data-testid={marker} hidden />
        <PortalEmpty>
          <span data-testid="portal-selections-empty">
            {limited
              ? 'Not included in your current portal access.'
              : 'Nothing is waiting for you to choose right now. When your contractor sends you finishes, fixtures or materials to pick from, they will appear here.'}
          </span>
        </PortalEmpty>
      </PortalCard>
    );
  }

  return (
    <>
      <span data-testid={marker} hidden />
      {/* Grouped by area — Kitchen, Breakfast Nook, Dining Room. A selection with
          no area lands in "Unassigned", which `getProjectSelections()` already
          creates, so nothing can fall off the page for want of an area. */}
      {areas.map((area) => (
        <PortalCard
          key={area.id}
          title={area.name}
          subtitle={`${area.selections.length} selection${area.selections.length === 1 ? '' : 's'}`}
        >
          {area.selections.map((selection) => (
            <PortalSelectionCard
              key={selection.id}
              selection={selection}
              defaultName={signerName}
            />
          ))}
        </PortalCard>
      ))}

      {/* ⚠️ SAID ONCE, ON THE PAGE, RATHER THAN IMPLIED BY THE BUTTONS. A batch
          arrives together and a partial batch is NORMAL — Josh ruled one
          signature per selection precisely so she can think about one while
          moving the others along. A client who believes she must do all of them
          before her contractor can proceed will sit on the whole batch. */}
      <p
        data-testid="portal-selections-partial-note"
        style={{ fontSize: '12.5px', color: color.muted, margin: '0 0 16px', lineHeight: 1.6 }}
      >
        You can approve these one at a time. Anything you have not decided on yet can wait — your
        contractor can get on with the ones you have signed.
      </p>
    </>
  );
}
