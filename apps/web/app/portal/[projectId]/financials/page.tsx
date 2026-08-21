import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { color, font } from '@/lib/theme';
import {
  getPortalBilling,
  getPortalDocuments,
  getPortalIdentity,
  getPortalProjects,
  getPortalProposals,
} from '@/lib/services/portal';
import {
  PortalCard,
  PortalEmpty,
  PortalStatus,
  Total,
  cell,
  day,
  money,
  rowStyle,
} from '../../portal-ui';
import { CoSignPanel } from '../portal-writes-ui';

/**
 * PAGE 2 of 4 — Financials: proposals, change orders, billing. [Josh, S168]
 *
 * ===========================================================================
 * ⚠️ THE ONE-PAGE RULING LIVES HERE, AND ONLY HERE. DO NOT SPLIT THIS PAGE.
 * ===========================================================================
 * Josh, S164 Q3: *"in the portal, they see all of it on one page and totals
 * added."* At S168 he clarified the scope — *"I believe that was referring to
 * financials"* — which is why the rest of the portal is now four routes and
 * why this one is not tabbed, paginated, or broken into "Proposals" and
 * "Billing" pages later. The money is read together or it is read wrong.
 *
 * ⚠️ CHANGE ORDERS ARE HERE, CONTRACTS ARE ON FILES & PHOTOS.
 * `getPortalDocuments()` returns both kinds in one list, and Josh's page table
 * names *"change orders"* under Financials and *"documents"* under Files &
 * Photos. So the list is split by `kind` at the point of RENDER, not by asking
 * the service for a different query — one fetch, two readers, no second
 * opinion about what a client may see. A change order carries an amount and
 * changes what she owes; that is the money page.
 *
 * ===========================================================================
 * ⚠️ `getPortalBilling()` HAS NO INSTRUMENT BRANCH AND MUST NEVER GROW ONE
 * ===========================================================================
 * The three bill shapes below are NOT a branch on the contract. They are a
 * branch on WHAT CAME BACK. A lump-sum bill has no lines because the
 * RESTRICTIVE gate on `invoice_lines` refused them; a by-section bill has
 * sections because the projecting function allowed them. Two bills on ONE
 * project can legitimately differ — a lump-sum contract carrying a T&M change
 * order is the case Josh named — and this renders each on its own terms
 * because it never asked the project anything.
 *
 * Moving this code between routes changed the imports and nothing else. If a
 * future edit finds itself reaching for `project.project_type` here, that is
 * the defect this paragraph exists to prevent.
 */
export default async function PortalFinancialsPage({
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

  const [documents, proposals, billing] = await Promise.all([
    getPortalDocuments(supabase, project.id),
    getPortalProposals(supabase, project.id),
    getPortalBilling(supabase, project.id),
  ]);

  const changeOrders = documents.filter((d) => d.kind === 'change_order');
  const limited = identity.accessLevel !== 'full';
  const notForYou = 'Not included in your current portal access.';
  const signerName = `${identity.firstName ?? ''} ${identity.lastName ?? ''}`.trim();

  return (
    <>
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

      <PortalCard title="Change orders" subtitle="Changes to the scope or price of your job.">
        {changeOrders.length === 0 ? (
          <PortalEmpty>No change orders have been sent to you for this project.</PortalEmpty>
        ) : (
          changeOrders.map((d) => (
            <div key={`${d.kind}-${d.id}`} style={rowStyle}>
              <span>
                <span style={{ fontWeight: 600, color: color.navy, display: 'block' }}>{d.title}</span>
                <span style={{ fontSize: '12.5px', color: color.muted }}>
                  {day(d.created_at)}
                  {d.amount !== null && d.amount !== undefined ? ` · ${money(d.amount)}` : ''}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* R10 — the signing action, on the row it belongs to. R13: any
                    client contact may sign, so there is no signer check here
                    and none in the route. */}
                {d.signable && (
                  <CoSignPanel changeOrderId={d.id} title={d.title} defaultName={signerName} />
                )}
                <PortalStatus value={d.status} />
              </span>
            </div>
          ))
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

                {/* See the header: three shapes, no instrument branch. */}
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

            {/* "…and totals added" — the second half of Q3, and the reason this
                page is not split. */}
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
    </>
  );
}
