import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { color } from '@/lib/theme';
import { getPortalBranding, getPortalIdentity, getPortalProjects } from '@/lib/services/portal';
import { PortalShell } from '../portal-shell';
import { PortalTabs } from './portal-tabs';

/**
 * One project, FOUR PAGES [Josh, S168] — and one layout, which is the point.
 *
 * ===========================================================================
 * ⚠️ FOUR ROUTES MUST NOT BECOME FOUR GUARDS
 * ===========================================================================
 * Everything that decides *whether this person may be here* happens once, in
 * this file and in `../layout.tsx` above it. The four pages beneath render
 * rows and nothing else — no auth read, no project lookup, no access branch.
 *
 * That is not tidiness. A split like this is exactly how surfaces diverge: the
 * page that gets written last is the one that forgets a check, and it fails
 * open silently because the other three still look right. CLAUDE.md's PARITY
 * ruling was written after `#129`, where two implementations that both
 * "worked" produced silent data loss. Four is worse than two.
 *
 * ===========================================================================
 * AND THE GUARD STILL PROTECTS NO DATA — THE ARMS DO
 * ===========================================================================
 * `notFound()` below decides what is REACHED. What is READABLE comes back
 * through the client read arms (`20261019000000`, `20261020000000`), which a
 * raw PostgREST call hits identically. If this file were deleted, every row
 * these pages render would still be correctly floored. It is here so the
 * client gets a true sentence, not so the data is safe.
 *
 * ⚠️ NO SERVICE ROLE, HERE OR IN ANY OF THE FOUR PAGES. `portal-shell.live.ts`
 * P7a/P7b assert that in the SOURCE, and P7b now walks this whole directory
 * rather than a hand-written list of three files — because the failure mode of
 * a hand-written list is a new route that nobody added to it.
 */
export default async function PortalProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  const supabase = await createClient();
  const identity = await getPortalIdentity(supabase);
  if (!identity) return null; // the parent layout has already redirected

  const branding = await getPortalBranding(supabase, identity.companyId);

  // The project list IS the authorisation. If this id is not in it, RLS refused
  // it — and `notFound()` is the honest answer, because from her side the row
  // does not exist. CLAUDE.md's rule cuts the other way for AUTH failures, but
  // this is not one: she is authenticated, and the record genuinely is not hers.
  const projects = await getPortalProjects(supabase);
  const project = projects.find((p) => p.id === params.projectId);
  if (!project) notFound();

  const accent = branding.brandColor || color.primary;
  const limited = identity.accessLevel !== 'full';

  return (
    <PortalShell
      branding={branding}
      nav={[]}
      navSlot={<PortalTabs projectId={project.id} accent={accent} />}
      backHref="/portal"
      heading={project.name}
      subheading={project.address ?? undefined}
    >
      {/*
        ⚠️ THE LIMITED-ACCESS SENTENCE BELONGS HERE, NOT ON ONE PAGE.
        R17 narrows what comes back, so a documents-only client now meets three
        pages that are mostly empty instead of one page that was mostly full.
        Told once per page, in the same place every time, that reads as a state.
        Told on whichever page happens to explain it, it reads as a fault with
        that page. The per-card sentences stay as well — "nothing yet" and "not
        included in your access" are different facts and each card knows which
        one applies to it.
      */}
      {limited && (
        <div
          data-testid="portal-limited-banner"
          role="status"
          style={{
            border: `1px solid ${color.cardBorder}`,
            backgroundColor: color.cardBg,
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '14px',
            fontSize: '13px',
            color: color.body,
          }}
        >
          <strong style={{ color: color.navy }}>Limited access.</strong>{' '}
          {identity.accessLevel === 'signed_documents_only'
            ? 'You can see documents you have signed. Photos, billing and messages are not included right now.'
            : 'You can see documents sent to you for signature. Photos, billing and messages are not included right now.'}{' '}
          {branding.companyName || 'Your contractor'} can widen this at any time.
        </div>
      )}

      {children}
    </PortalShell>
  );
}
