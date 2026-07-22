import { createClient } from '@/lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getProject, PROJECT_TYPE_LABELS } from '@/lib/services/projects';
import { getSignedChangeOrders, getChangeOrders } from '@/lib/services/change-orders';
import { getPhases, getTasks, rollupPhases } from '@/lib/services/tasks';
import { getProjectAssignments } from '@/lib/services/project-assignments';
import { memberColor } from '@/components/schedule/member-color';
import { StatusControl } from './status-control';
import { cardStyle, color, font, microLabelStyle } from '@/lib/theme';

/**
 * ui-04 — 1a Project Overview: KPI row + schedule-progress stepper (derived
 * from phases + tasks, §S4 round 2) + team / open-items rail. StatusControl,
 * Details, Scope, and Internal Notes are preserved below (checkpoint
 * decision). Financial floor (ui-01 §11): Revised Contract + Projected Margin
 * are Owner/Admin only — the KPI row REFLOWS to 2-up for gated roles; CO
 * open-items carry no dollar amounts.
 */

function money(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function date(value: string | null): string {
  if (!value) return '—';
  return new Date(value + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''))
    .toUpperCase();
}

export default async function ProjectOverviewPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .eq('is_deleted', false)
    .single();
  if (!profile) redirect('/dashboard');

  const project = await getProject(params.id);
  if (!project) notFound();

  const [signedCos, allCos, phases, tasks, assignments] = await Promise.all([
    getSignedChangeOrders(params.id),
    getChangeOrders(params.id),
    getPhases(params.id),
    getTasks(params.id),
    getProjectAssignments(params.id),
  ]);

  // Open punch count (plain count — no due-date model, ui-04 §S6).
  const { count: punchCount } = await supabase
    .from('punch_list_items')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', params.id)
    .eq('is_deleted', false)
    .in('status', ['open', 'in_progress']);

  // Estimate link (when converted)
  let sourceEstimate: { id: string; estimate_number: string } | null = null;
  if (project.source_estimate_id) {
    const { data } = await supabase
      .from('estimates')
      .select('id, estimate_number')
      .eq('id', project.source_estimate_id)
      .single();
    sourceEstimate = data ?? null;
  }

  const canTransition = ['owner', 'admin', 'project_manager'].includes(profile.role);
  const canSeeFinancials = profile.role === 'owner' || profile.role === 'admin';

  // --- KPIs (ui-04 §S3) --------------------------------------------------
  const signedDelta = signedCos.reduce((sum, co) => sum + co.net_delta, 0);
  const revisedContract =
    project.contract_value !== null ? project.contract_value + signedDelta : null;

  const today = new Date().toISOString().slice(0, 10);
  const daysToTarget = project.target_end_date
    ? Math.round(
        (new Date(project.target_end_date + 'T00:00:00').getTime() -
          new Date(today + 'T00:00:00').getTime()) /
          86400000
      )
    : null;

  const kpiCards: { label: string; value: string; valueColor: string; caption?: string }[] = [
    ...(canSeeFinancials
      ? [
          {
            label: 'Revised Contract',
            value: revisedContract !== null ? money(revisedContract) : '—',
            valueColor: revisedContract !== null ? color.navy : color.faint,
          },
        ]
      : []),
    {
      // Em-dash until Module 7A populates actuals (§S3) — the one money KPI
      // every role may see.
      label: 'Cost to Date',
      value: '—',
      valueColor: color.faint,
    },
    ...(canSeeFinancials
      ? [
          {
            // Em-dash until the sell/profit schema gap is fixed (§S3).
            label: 'Projected Margin',
            value: '—',
            valueColor: color.faint,
          },
        ]
      : []),
    {
      label: 'Days to Target',
      value: daysToTarget !== null ? String(daysToTarget) : '—',
      valueColor: daysToTarget !== null ? color.navy : color.faint,
      caption: daysToTarget === null ? 'Needs dates' : undefined,
    },
  ];

  // --- Stepper (ui-04 §S4 round 2: phases + tasks) ------------------------
  const { rollups } = rollupPhases(phases, tasks);
  const firstIncomplete = rollups.findIndex((r) => r.status !== 'complete');
  const startedIncomplete = rollups.findIndex(
    (r) => r.status === 'in_progress' || r.status === 'blocked'
  );
  const currentIdx = startedIncomplete !== -1 ? startedIncomplete : firstIncomplete;

  // --- Open items (ui-04 §S6 — no punch overdue state, no CO $ amounts) ---
  const openItems: { dot: string; emphasis: string; text: string; href: string | null }[] = [];
  for (const co of allCos.filter((c) => c.status === 'sent')) {
    openItems.push({
      dot: '#d97706',
      emphasis: co.co_number,
      text: 'awaiting client signature',
      href: `/dashboard/projects/${params.id}/changes/${co.id}`,
    });
  }
  if (!project.start_date || !project.target_end_date) {
    openItems.push({
      dot: '#2f49d1',
      emphasis: 'Project dates',
      text: 'start or target date missing',
      href: null,
    });
  }
  if ((punchCount ?? 0) > 0) {
    openItems.push({
      dot: '#2f49d1',
      emphasis: `${punchCount} punch item${punchCount === 1 ? '' : 's'}`,
      text: 'open',
      href: `/dashboard/projects/${params.id}/punch`,
    });
  }

  const cardTitleStyle: React.CSSProperties = {
    fontFamily: font.sans,
    fontSize: '15px',
    fontWeight: 700,
    color: color.navy,
    marginBottom: '14px',
  };
  const railTitleStyle: React.CSSProperties = {
    ...microLabelStyle,
    fontSize: '13px',
    fontWeight: 700,
    color: color.navy,
    marginBottom: '14px',
  };
  const detailRow: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    fontSize: '14px',
  };
  const detailKey: React.CSSProperties = { color: color.muted };

  return (
    <div>
      {/* KPI row — reflow per financial floor */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${kpiCards.length}, 1fr)`,
          gap: '14px',
          marginBottom: '18px',
        }}
      >
        {kpiCards.map((kpi) => (
          <div key={kpi.label} style={{ ...cardStyle, padding: '15px 16px' }}>
            <div style={microLabelStyle}>{kpi.label}</div>
            <div
              style={{
                fontFamily: font.mono,
                fontSize: '24px',
                fontWeight: 600,
                color: kpi.valueColor,
                marginTop: '4px',
              }}
            >
              {kpi.value}
            </div>
            {kpi.caption && (
              <div style={{ fontSize: '12px', color: color.warning, fontWeight: 600 }}>
                {kpi.caption}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Two-column region */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '18px' }}>
        {/* Left — schedule progress stepper */}
        <div style={{ ...cardStyle, padding: '18px 20px', alignSelf: 'start' }}>
          <div style={cardTitleStyle}>Schedule progress</div>
          {rollups.length === 0 ? (
            <p style={{ fontSize: '13px', color: color.faint, margin: 0 }}>No schedule set</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {rollups.map((r, i) => {
                const state: 'done' | 'current' | 'future' =
                  r.status === 'complete' ? 'done' : i === currentIdx ? 'current' : 'future';
                const schedulingNeeded = state === 'current' && !r.start_date;
                return (
                  <Link
                    key={r.phase.id}
                    href={`/dashboard/projects/${params.id}/schedule`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      textDecoration: 'none',
                    }}
                  >
                    <span
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#fff',
                        backgroundColor:
                          state === 'done'
                            ? color.success
                            : state === 'current'
                              ? color.primary
                              : color.neutralBadgeBg,
                        border: state === 'future' ? '2px solid #d5dae3' : 'none',
                        boxShadow: state === 'current' ? `0 0 0 4px ${color.blueTintAlt}` : 'none',
                      }}
                    >
                      {state === 'done' ? '✓' : ''}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: '14px',
                          fontWeight: state === 'future' ? 500 : 600,
                          color: state === 'future' ? color.faint : color.navy,
                        }}
                      >
                        {r.phase.name}
                      </span>
                      {schedulingNeeded && (
                        <span style={{ fontSize: '12px', color: color.warning, fontWeight: 600 }}>
                          Scheduling needed
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: '12px',
                        color:
                          state === 'current'
                            ? color.primary
                            : state === 'future'
                              ? color.faintAlt
                              : color.faint,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {state === 'done'
                        ? `${date(r.end_date)} · done`
                        : state === 'current'
                          ? r.start_date
                            ? `${date(r.start_date)} · now`
                            : '· now'
                          : date(r.start_date)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Right rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ ...cardStyle, padding: '18px' }}>
            <div style={railTitleStyle}>Team & contacts</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {project.contact && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                  <span
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: color.blueTintAlt,
                      color: '#3a4db0',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    {initialsOf(`${project.contact.first_name} ${project.contact.last_name}`)}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: color.navy,
                      }}
                    >
                      {project.contact.first_name} {project.contact.last_name}
                    </span>
                    <span style={{ fontSize: '12px', color: color.faint }}>Client</span>
                  </span>
                </div>
              )}
              {assignments
                .filter((a) => a.member)
                .map((a) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                    <span
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '8px',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor:
                          memberColor(a.member!.id, a.member!.schedule_color) + '33',
                        color: memberColor(a.member!.id, a.member!.schedule_color),
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      {initialsOf(a.member!.display_name)}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: 600,
                          color: color.navy,
                        }}
                      >
                        {a.member!.display_name}
                      </span>
                      <span style={{ fontSize: '12px', color: color.faint }}>
                        {a.member!.member_type === 'subcontractor' ? 'Sub' : 'Crew'}
                      </span>
                    </span>
                  </div>
                ))}
              {assignments.filter((a) => a.member).length === 0 && !project.contact && (
                <p style={{ fontSize: '13px', color: color.faint, margin: 0 }}>
                  No team assigned yet.
                </p>
              )}
            </div>
          </div>

          <div style={{ ...cardStyle, padding: '18px' }}>
            <div style={railTitleStyle}>Open items</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
              {openItems.length === 0 && (
                <p style={{ fontSize: '13px', color: color.faint, margin: 0 }}>
                  Nothing open right now.
                </p>
              )}
              {openItems.map((item, i) => {
                const body = (
                  <span style={{ fontSize: '13px', color: color.body, lineHeight: 1.4 }}>
                    <span style={{ color: color.navy, fontWeight: 700 }}>{item.emphasis}</span>{' '}
                    {item.text}
                  </span>
                );
                return (
                  <div key={i} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: item.dot,
                        marginTop: '5px',
                        flexShrink: 0,
                      }}
                    />
                    {item.href ? (
                      <Link href={item.href} style={{ textDecoration: 'none' }}>
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Field Ops entry point (6B UI, Phase 3 Q3) — second door into the
              project's field surface besides the Field Ops nav item.
              Deliveries dropped from the label (S90): it is now a first-class
              tab in the strip above. */}
          <div style={{ ...cardStyle, padding: '18px' }}>
            <div style={railTitleStyle}>Field operations</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Link
                href={`/dashboard/field-ops/${project.id}/daily-logs`}
                style={{
                  fontSize: '13px',
                  color: color.primary,
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                Daily logs &amp; safety →
              </Link>
              <Link
                href={`/dashboard/field-ops/${project.id}/daily-logs/new`}
                style={{
                  fontSize: '13px',
                  color: color.primary,
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                + New daily log
              </Link>
            </div>
          </div>

          {canTransition && (
            <div style={{ ...cardStyle, padding: '18px' }}>
              <div style={railTitleStyle}>Status</div>
              <StatusControl
                projectId={project.id}
                currentStatus={project.status}
                userRole={profile.role}
              />
            </div>
          )}
        </div>
      </div>

      {/* Preserved detail cards (checkpoint decision: no functional loss) */}
      <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ ...cardStyle, padding: '18px 20px' }}>
          <div style={railTitleStyle}>Details</div>
          <div style={{ maxWidth: '560px' }}>
            <div style={detailRow}>
              <span style={detailKey}>Internal #</span>
              <span style={{ fontFamily: font.mono }}>
                {String(project.project_internal_seq).padStart(3, '0')}
              </span>
            </div>
            <div style={detailRow}>
              <span style={detailKey}>Type</span>
              <span>{PROJECT_TYPE_LABELS[project.project_type]}</span>
            </div>
            {canSeeFinancials && (
              <div style={detailRow}>
                <span style={detailKey}>Contract Value</span>
                <span style={{ fontFamily: font.mono, fontWeight: 600 }}>
                  {money(project.contract_value)}
                </span>
              </div>
            )}
            <div style={detailRow}>
              <span style={detailKey}>Source Estimate</span>
              <span>
                {sourceEstimate ? (
                  <Link
                    href={`/dashboard/estimates/${sourceEstimate.id}`}
                    style={{ color: color.primary, textDecoration: 'none' }}
                  >
                    {sourceEstimate.estimate_number}
                  </Link>
                ) : (
                  'Manual (no estimate)'
                )}
              </span>
            </div>
            <div style={detailRow}>
              <span style={detailKey}>Start Date</span>
              <span style={{ fontFamily: font.mono }}>{date(project.start_date)}</span>
            </div>
            <div style={detailRow}>
              <span style={detailKey}>Target End</span>
              <span style={{ fontFamily: font.mono }}>{date(project.target_end_date)}</span>
            </div>
            <div style={detailRow}>
              <span style={detailKey}>Actual End</span>
              <span style={{ fontFamily: font.mono }}>{date(project.actual_end_date)}</span>
            </div>
          </div>
        </div>

        {project.scope_summary && (
          <div style={{ ...cardStyle, padding: '18px 20px' }}>
            <div style={railTitleStyle}>Scope of Work</div>
            <p style={{ fontSize: '14px', whiteSpace: 'pre-wrap', margin: 0 }}>
              {project.scope_summary}
            </p>
          </div>
        )}

        {project.internal_notes && (
          <div style={{ ...cardStyle, padding: '18px 20px' }}>
            <div style={railTitleStyle}>Internal Notes</div>
            <p style={{ fontSize: '14px', whiteSpace: 'pre-wrap', margin: 0 }}>
              {project.internal_notes}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
