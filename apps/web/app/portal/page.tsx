import Link from 'next/link';
import { createClient } from '@/lib/supabase-server';
import { color } from '@/lib/theme';
import { getPortalBranding, getPortalIdentity, getPortalProjects } from '@/lib/services/portal';
import { PortalShell } from './portal-shell';
import { PortalCard, PortalEmpty, PortalStatus, day, rowStyle } from './portal-ui';

/**
 * The portal's front door — her projects.
 *
 * ⚠️ NO PROJECTS IS THREE DIFFERENT SITUATIONS AND THEY MUST NOT SHARE A
 * SENTENCE. This is R16 done honestly: "a mostly empty page with a line telling
 * her the project hasn't started yet" is the right words for exactly one of
 * them.
 *
 *   accessLevel 'none'   — R17/R2/R5: her access has ended, or was revoked.
 *                          Telling her a project "hasn't started" would be a
 *                          lie about a job that finished 46 days ago.
 *   documents-only       — R17(b)/(c): she has access, to documents. An empty
 *                          project list here is the state working, and the page
 *                          must point at where the documents are.
 *   full, and 0 rows     — R16 proper. Nothing is set up yet.
 */
export default async function PortalHome() {
  const supabase = await createClient();
  const identity = await getPortalIdentity(supabase);
  if (!identity) return null; // the layout has already redirected

  const branding = await getPortalBranding(supabase, identity.companyId);
  const projects = identity.accessLevel === 'none' ? [] : await getPortalProjects(supabase);

  const greeting = identity.firstName ? `Hello, ${identity.firstName}` : 'Your projects';

  return (
    <PortalShell
      branding={branding}
      nav={[]}
      heading={greeting}
      subheading={
        identity.accessLevel === 'full'
          ? 'Follow your job, review documents and see what you have been billed.'
          : undefined
      }
    >
      <PortalCard title="Projects">
        {identity.accessLevel === 'none' ? (
          <PortalEmpty>
            Your portal access has ended. If you need anything from your project records, contact{' '}
            {branding.companyName || 'your contractor'} directly and they can reopen your access.
          </PortalEmpty>
        ) : projects.length === 0 ? (
          <PortalEmpty>
            Your project hasn&rsquo;t started yet. When work begins, your schedule, photos and
            documents will appear here.
          </PortalEmpty>
        ) : (
          projects.map((p) => (
            <Link
              key={p.id}
              href={`/portal/${p.id}`}
              style={{ ...rowStyle, textDecoration: 'none', color: color.body }}
            >
              <span>
                <span style={{ fontWeight: 700, color: color.navy, display: 'block' }}>{p.name}</span>
                <span style={{ fontSize: '12.5px', color: color.muted }}>
                  {p.address ?? 'No site address on file'}
                  {p.start_date ? ` · started ${day(p.start_date)}` : ''}
                </span>
              </span>
              <PortalStatus value={p.status} />
            </Link>
          ))
        )}
      </PortalCard>

      {identity.accessLevel === 'signed_documents_only' && (
        <PortalCard title="Documents only">
          <PortalEmpty>
            Your access is limited to documents you have signed. Open a project above to see them.
          </PortalEmpty>
        </PortalCard>
      )}
      {identity.accessLevel === 'documents_for_signature' && (
        <PortalCard title="Documents only">
          <PortalEmpty>
            Your access is limited to documents sent to you for signature. Open a project above to
            review and sign them.
          </PortalEmpty>
        </PortalCard>
      )}
    </PortalShell>
  );
}
