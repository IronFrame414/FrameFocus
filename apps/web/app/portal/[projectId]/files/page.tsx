import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { color, font } from '@/lib/theme';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/services/signed-url-ttl';
import {
  getPortalDocuments,
  getPortalIdentity,
  getPortalPhotos,
  getPortalProjects,
  getPortalThread,
  signPortalPaths,
} from '@/lib/services/portal';
import { PortalCard, PortalEmpty, PortalStatus, day, money, rowStyle } from '../../portal-ui';
import { ClientComposer } from '../portal-writes-ui';

/**
 * PAGE 3 of 4 — Files & photos: documents, photos, and the questions thread.
 * [Josh, S168]
 *
 * ⚠️ CHANGE ORDERS ARE NOT HERE. `getPortalDocuments()` returns contracts AND
 * change orders; Josh's page table puts *"change orders"* on Financials and
 * *"documents"* here, so the list is split by `kind` at the point of render.
 * The Financials page filters the complement of this filter — one fetch, two
 * readers, and no document belongs to neither page.
 *
 * ⚠️ AND THE QUESTIONS SECTION IS HERE BY RULING, NOT BY THEME. Josh's table
 * puts it on this page alongside the photos. It is where a client already is
 * when she wants to ask about a picture, which is what §4.7 designed it for.
 */
export default async function PortalFilesPage({
  params,
}: {
  params: { projectId: string };
}) {
  const supabase = await createClient();
  const identity = await getPortalIdentity(supabase);
  if (!identity) return null;

  const projects = await getPortalProjects(supabase);
  const project = projects.find((p) => p.id === params.projectId);
  if (!project) notFound();

  const [documents, photos, thread] = await Promise.all([
    getPortalDocuments(supabase, project.id),
    getPortalPhotos(supabase, project.id),
    getPortalThread(supabase, project.id, identity.profileId, SIGNED_URL_TTL_SECONDS),
  ]);

  // §6.1 — the marked-up image where one exists. `display_path` already made
  // that choice; this only mints the URLs.
  const urls = await signPortalPaths(
    supabase,
    photos.map((p) => p.display_path),
    SIGNED_URL_TTL_SECONDS
  );

  const contracts = documents.filter((d) => d.kind !== 'change_order');
  const limited = identity.accessLevel !== 'full';
  const notForYou = 'Not included in your current portal access.';

  return (
    <>
      <PortalCard title="Documents" subtitle="Contracts and agreements on this job.">
        {contracts.length === 0 ? (
          <PortalEmpty>Nothing has been sent to you for this project yet.</PortalEmpty>
        ) : (
          contracts.map((d) => (
            <div key={`${d.kind}-${d.id}`} style={rowStyle}>
              <span>
                <span style={{ fontWeight: 600, color: color.navy, display: 'block' }}>{d.title}</span>
                <span style={{ fontSize: '12.5px', color: color.muted }}>
                  {day(d.created_at)}
                  {d.amount !== null && d.amount !== undefined ? ` · ${money(d.amount)}` : ''}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* R10 — stage 5 turns this into the signing action. Naming the
                    pending state now is not a placeholder: a client who is told
                    nothing is waiting on her is being told the wrong thing. */}
                {d.signable && (
                  <span style={{ fontSize: '12px', fontWeight: 700, color: color.warningDeep }}>
                    Awaiting your signature
                  </span>
                )}
                <PortalStatus value={d.status} />
              </span>
            </div>
          ))
        )}
      </PortalCard>

      <PortalCard title="Photos" subtitle="Pictures your contractor has shared with you.">
        {photos.length === 0 ? (
          <PortalEmpty>
            {limited
              ? notForYou
              : 'No photos have been shared with you yet. Your contractor chooses which pictures you see.'}
          </PortalEmpty>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '10px',
              paddingTop: '4px',
            }}
          >
            {photos.map((p) => {
              const url = urls.get(p.display_path);
              return (
                <figure key={p.id} style={{ margin: 0 }}>
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt={p.file_name}
                      style={{
                        width: '100%',
                        aspectRatio: '4 / 3',
                        objectFit: 'cover',
                        borderRadius: '10px',
                        border: `1px solid ${color.cardBorder}`,
                        display: 'block',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        aspectRatio: '4 / 3',
                        borderRadius: '10px',
                        backgroundColor: color.tableHeadBg,
                        border: `1px solid ${color.cardBorder}`,
                      }}
                    />
                  )}
                  <figcaption style={{ fontSize: '11.5px', color: color.muted, marginTop: '5px' }}>
                    {day(p.created_at)}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </PortalCard>

      <PortalCard
        title="Questions and photos"
        subtitle="Anything you send here goes to the office. Your photos are shared with them automatically."
      >
        {thread.length === 0 ? (
          <PortalEmpty>
            {limited
              ? notForYou
              : 'Nothing here yet. Send a question, a note, or a picture of something you want to ask about.'}
          </PortalEmpty>
        ) : (
          thread.map((m) => (
            <div
              key={m.id}
              style={{
                borderTop: `1px solid ${color.rowDivider}`,
                padding: '11px 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: m.mine ? 'flex-end' : 'flex-start',
              }}
            >
              {/* ⚠️ NO NAMES — §4.7 (R8). "You" and "the office", never a
                  person. The S131 roster floor would return blanks anyway, and
                  a blank where a name should be reads as a defect. */}
              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: '10.5px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: color.mutedAlt,
                }}
              >
                {m.mine ? 'You' : 'The office'} · {day(m.createdAt)}
              </span>
              {m.body && (
                <p style={{ fontSize: '13.5px', color: color.body, margin: '4px 0 0', maxWidth: '46ch' }}>
                  {m.body}
                </p>
              )}
              {m.photos.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '7px', flexWrap: 'wrap' }}>
                  {m.photos.map((ph) =>
                    ph.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={ph.fileId}
                        src={ph.url}
                        alt=""
                        style={{
                          width: '108px',
                          height: '81px',
                          objectFit: 'cover',
                          borderRadius: '8px',
                          border: `1px solid ${color.cardBorder}`,
                        }}
                      />
                    ) : null
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* R11 is a write, so it is gated on full access — and by RLS besides.
            A documents-only client is shown the section's empty sentence above
            and no composer, rather than a composer that fails on send. */}
        {!limited && <ClientComposer projectId={project.id} />}
      </PortalCard>
    </>
  );
}
