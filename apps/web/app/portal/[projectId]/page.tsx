import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { color, font } from '@/lib/theme';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/services/signed-url-ttl';
import {
  getPortalBilling,
  getPortalBranding,
  getPortalDocuments,
  getPortalIdentity,
  getPortalPhotos,
  getPortalProjects,
  getPortalProposals,
  getPortalSchedule,
  signPortalPaths,
} from '@/lib/services/portal';
import { PortalShell } from '../portal-shell';
import { PortalCard, PortalEmpty, PortalStatus, day, money, rowStyle } from '../portal-ui';

/**
 * One project, on ONE PAGE. That is the ruling, not a layout preference.
 *
 * Josh, S164 Q3: *"The easy way to understand what a client will see is that
 * they see what is on the invoice. **In the portal, they see all of it on one
 * page and totals added.**"*
 *
 * So there are no tabs and no sub-routes. A tabbed portal would put the client
 * one click away from every answer and would invite each tab to develop its own
 * idea of what she may see — which is the divergence CLAUDE.md's PARITY rule
 * describes, grown inside a single surface.
 *
 * ===========================================================================
 * ⚠️ EVERY SECTION BELOW RENDERS WHAT CAME BACK. NONE OF THEM FILTERS.
 * ===========================================================================
 * There is no `if (accessLevel === …)` around the documents, the photos or the
 * money, and there must not be. R17's states are enforced in
 * `my_client_access_level()`, which the policies consult; a documents-only
 * client's photo query returns zero rows before this file sees it. The one
 * place access level IS read is to choose the EMPTY-STATE SENTENCE — because
 * "nothing yet" and "not available to you" are different facts and a client
 * deserves the true one.
 */
export default async function PortalProjectPage({ params }: { params: { projectId: string } }) {
  const supabase = await createClient();
  const identity = await getPortalIdentity(supabase);
  if (!identity) return null;

  const branding = await getPortalBranding(supabase, identity.companyId);

  // The project list is the authorisation. If this id is not in it, RLS refused
  // it — and `notFound()` is the honest answer, because from her side the row
  // does not exist. CLAUDE.md's rule cuts the other way for AUTH failures, but
  // this is not one: she is authenticated, and the record genuinely is not hers.
  const projects = await getPortalProjects(supabase);
  const project = projects.find((p) => p.id === params.projectId);
  if (!project) notFound();

  const [schedule, documents, proposals, photos, billing] = await Promise.all([
    getPortalSchedule(supabase, project.id),
    getPortalDocuments(supabase, project.id),
    getPortalProposals(supabase, project.id),
    getPortalPhotos(supabase, project.id),
    getPortalBilling(supabase, project.id),
  ]);

  // §6.1 — the marked-up image where one exists. `display_path` already made
  // that choice; this only mints the URLs.
  const urls = await signPortalPaths(
    supabase,
    photos.map((p) => p.display_path),
    SIGNED_URL_TTL_SECONDS
  );

  const limited = identity.accessLevel !== 'full';
  const notForYou = 'Not included in your current portal access.';

  return (
    <PortalShell
      branding={branding}
      nav={[]}
      backHref="/portal"
      heading={project.name}
      subheading={project.address ?? undefined}
    >
      <PortalCard title="Where things stand">
        <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', paddingTop: '2px' }}>
          <Fact label="Status" value={<PortalStatus value={project.status} />} />
          <Fact label="Started" value={day(project.start_date)} />
          <Fact
            label={project.actual_end_date ? 'Completed' : 'Target completion'}
            value={day(project.actual_end_date ?? project.target_end_date)}
          />
        </div>
      </PortalCard>

      <PortalCard title="Schedule" subtitle="Upcoming and completed milestones on your job.">
        {schedule.length === 0 ? (
          <PortalEmpty>
            {limited
              ? notForYou
              : 'No schedule has been published yet. It will appear here once your job is planned out.'}
          </PortalEmpty>
        ) : (
          schedule.map((s) => (
            <div key={s.id} style={rowStyle}>
              <span>
                <span style={{ fontWeight: 600, color: color.navy, display: 'block' }}>{s.title}</span>
                {s.phase_name && (
                  <span style={{ fontSize: '12.5px', color: color.muted }}>{s.phase_name}</span>
                )}
              </span>
              <span style={{ fontSize: '12.5px', color: color.muted, whiteSpace: 'nowrap' }}>
                {day(s.start_date)} → {day(s.due_date)}
              </span>
            </div>
          ))
        )}
      </PortalCard>

      <PortalCard title="Documents" subtitle="Contracts and change orders on this job.">
        {documents.length === 0 ? (
          <PortalEmpty>Nothing has been sent to you for this project yet.</PortalEmpty>
        ) : (
          documents.map((d) => (
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

      <PortalCard title="Proposals">
        {proposals.length === 0 ? (
          <PortalEmpty>
            {limited ? notForYou : 'No proposals have been sent to you for this project.'}
          </PortalEmpty>
        ) : (
          proposals.map((p) => (
            <div key={p.id} style={rowStyle}>
              <span>
                <span style={{ fontWeight: 600, color: color.navy, display: 'block' }}>
                  {p.name || p.estimate_number || 'Proposal'}
                </span>
                <span style={{ fontSize: '12.5px', color: color.muted }}>
                  Sent {day(p.sent_at)}
                  {p.accepted_at ? ` · accepted ${day(p.accepted_at)}` : ''}
                </span>
              </span>
              <span style={{ fontWeight: 700, color: color.navy }}>{money(p.grand_total)}</span>
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
        title="Billing"
        subtitle="Every bill on this job, and what they add up to."
        action={
          billing.invoices.length > 0 ? (
            <span style={{ fontSize: '18px', fontWeight: 800, color: color.navy }}>
              {money(billing.totalBilled)}
            </span>
          ) : undefined
        }
      >
        {billing.invoices.length === 0 ? (
          <PortalEmpty>
            {limited ? notForYou : 'You have not been billed for anything on this project yet.'}
          </PortalEmpty>
        ) : (
          <>
            {billing.invoices.map((inv) => (
              <div key={inv.id} style={{ borderTop: `1px solid ${color.rowDivider}`, padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span>
                    <span style={{ fontWeight: 700, color: color.navy, display: 'block' }}>
                      {inv.invoice_number ? `Invoice ${inv.invoice_number}` : inv.title || 'Invoice'}
                    </span>
                    <span style={{ fontSize: '12.5px', color: color.muted }}>
                      Issued {day(inv.issue_date)} · due {day(inv.due_date)}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: color.navy, display: 'block' }}>
                      {money(inv.billed_total)}
                    </span>
                    <PortalStatus value={inv.status} />
                  </span>
                </div>

                {/*
                  ⚠️ THE THREE SHAPES BELOW ARE NOT A BRANCH ON THE CONTRACT.
                  They are a branch on WHAT CAME BACK. A lump-sum bill has no
                  lines because the RESTRICTIVE gate on `invoice_lines` refused
                  them; a by-section bill has sections because the projecting
                  function allowed them. Two bills on ONE project can differ —
                  a lump-sum contract carrying a T&M change order is the case
                  Josh named — and this renders each on its own terms because
                  it never asked the project anything.
                */}
                {inv.lines.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                    <thead>
                      <tr>
                        {['Item', 'Qty', 'Rate', 'Cost', 'Billed'].map((h, i) => (
                          <th
                            key={h}
                            style={{
                              textAlign: i === 0 ? 'left' : 'right',
                              fontFamily: font.mono,
                              fontSize: '10.5px',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                              color: color.mutedAlt,
                              padding: '5px 6px',
                              backgroundColor: color.tableHeadBg,
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {inv.lines.map((l) => (
                        <tr key={l.id}>
                          <td style={cell('left')}>{l.description ?? '—'}</td>
                          <td style={cell('right')}>{l.quantity ?? '—'}</td>
                          <td style={cell('right')}>{money(l.unit_rate)}</td>
                          {/* R7a — the pre-markup figure IS shown beside the
                              marked-up one. That is the ruling, not an accident
                              of selecting the column. */}
                          <td style={cell('right')}>{money(l.cost_basis)}</td>
                          <td style={{ ...cell('right'), fontWeight: 700 }}>{money(l.billed_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {inv.lines.length === 0 && inv.sections.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    {inv.sections.map((s) => (
                      <div
                        key={s.category}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '13px',
                          color: color.body,
                          padding: '4px 0',
                        }}
                      >
                        <span style={{ textTransform: 'capitalize' }}>{s.category}</span>
                        <span style={{ fontWeight: 600 }}>{money(s.billed_subtotal)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div
              style={{
                borderTop: `2px solid ${color.cardBorder}`,
                marginTop: '6px',
                paddingTop: '12px',
                display: 'grid',
                gap: '4px',
              }}
            >
              <Total label="Billed to date" value={billing.totalBilled} strong />
              {billing.totalRetainage > 0 && (
                <Total label="Retainage withheld" value={billing.totalRetainage} />
              )}
              <Total label="Outstanding" value={billing.totalReceivable} />
            </div>
          </>
        )}
      </PortalCard>
    </PortalShell>
  );
}

function cell(align: 'left' | 'right'): React.CSSProperties {
  return {
    textAlign: align,
    fontSize: '12.5px',
    color: color.body,
    padding: '6px',
    borderBottom: `1px solid ${color.rowDivider}`,
  };
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontFamily: font.mono,
          fontSize: '10.5px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: color.mutedAlt,
          marginBottom: '4px',
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: '14px', color: color.navy, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function Total({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px' }}>
      <span style={{ color: color.bodyAlt, fontWeight: strong ? 700 : 400 }}>{label}</span>
      <span style={{ color: color.navy, fontWeight: strong ? 800 : 600 }}>{money(value)}</span>
    </div>
  );
}
