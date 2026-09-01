'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProjectStatus, ProjectWithContact } from '@/lib/services/projects';
import { PROJECT_STATUS_LABELS } from '@/lib/services/projects-client';
import { attentionFor, progressFor, progressLabel } from '@/lib/project-list-derive';
import {
  FilterChips,
  ListPageHeader,
  ListSearchInput,
  MetricStrip,
} from '@/components/list-screen/list-screen';
import type { Metric } from '@/components/list-screen/list-screen';
import { badgeStyle, cardStyle, color, font, microLabelStyle, primaryButtonStyle } from '@/lib/theme';

interface ProjectsListProps {
  projects: ProjectWithContact[];
  /** 7B: revised contract per project id (server-derived via
   *  getRevisedContractMap — the single legal derivation). null = no
   *  original contract value; empty for roles without the Contract column. */
  revisedContracts: Record<string, number | null>;
  /** §8.1 Billed / Margin — from the per-project profitability report loop
   *  (§6). Empty objects for gated roles: the server made ZERO calls. */
  billed: Record<string, number>;
  marginPercent: Record<string, number | null>;
  /** Needs-attention inputs (§8.1 — grouped queries, caller-RLS-scoped). */
  draftCoCounts: Record<string, number>;
  openPunchCounts: Record<string, number>;
  acceptedUnconverted: string[];
  /** Company-calendar today ('YYYY-MM-DD', companyToday — §8c.1 pattern). */
  today: string;
  metrics: {
    contractValueActive: number;
    unbilledTotal: number;
    awaitingSignature: number;
  };
  currentStatus: string;
  canCreate: boolean;
  /** Financial floor (ui-01 §11): Contract, Billed, Margin are Owner/Admin
   *  only — the 8-column grid reflows to 5. */
  canSeeFinancials: boolean;
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'complete', label: 'Complete' },
  { value: 'archived', label: 'Archived' },
  { value: 'cancelled', label: 'Cancelled' },
];

// ui-03 §4 badge colors — these hex values are authoritative (round 2).
const STATUS_BADGES: Record<ProjectStatus, { bg: string; fg: string }> = {
  active: { bg: '#e4f0e6', fg: '#3d7a4b' },
  on_hold: { bg: '#fdece0', fg: '#b45309' },
  complete: { bg: '#eef1f6', fg: '#6b7280' },
  archived: { bg: '#eef1f6', fg: '#6b7280' },
  cancelled: { bg: '#eef1f6', fg: '#c0362c' },
};

function money(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function ProjectsList({
  projects,
  revisedContracts,
  billed,
  marginPercent,
  draftCoCounts,
  openPunchCounts,
  acceptedUnconverted,
  today,
  metrics,
  currentStatus,
  canCreate,
  canSeeFinancials,
}: ProjectsListProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const counts = useMemo(
    () => ({
      total: projects.length,
      active: projects.filter((p) => p.status === 'active').length,
      complete: projects.filter((p) => p.status === 'complete').length,
    }),
    [projects]
  );

  const acceptedSet = useMemo(() => new Set(acceptedUnconverted), [acceptedUnconverted]);

  const attentionByProject = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const p of projects) {
      map[p.id] = attentionFor({
        hasDates: Boolean(p.start_date && p.target_end_date),
        draftCoCount: draftCoCounts[p.id] ?? 0,
        openPunchCount: openPunchCounts[p.id] ?? 0,
        hasAcceptedUnconverted: acceptedSet.has(p.id),
      });
    }
    return map;
  }, [projects, draftCoCounts, openPunchCounts, acceptedSet]);

  const needAttentionCount = useMemo(
    () => projects.filter((p) => (attentionByProject[p.id] ?? []).length > 0).length,
    [projects, attentionByProject]
  );

  const visible = useMemo(() => {
    let rows = projects;
    if (currentStatus !== 'all') rows = rows.filter((p) => p.status === currentStatus);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((p) => {
        const client = p.contact ? `${p.contact.first_name} ${p.contact.last_name}` : '';
        return (
          p.name.toLowerCase().includes(q) ||
          p.project_number.toLowerCase().includes(q) ||
          client.toLowerCase().includes(q)
        );
      });
    }
    return rows;
  }, [projects, currentStatus, search]);

  // §8.1 metric strip. The two money cards are Owner/Admin only — a gated
  // role's strip REFLOWS to the two count cards (less, not nothing).
  const stripMetrics: Metric[] = [
    ...(canSeeFinancials
      ? [
          {
            label: 'Contract value',
            value: money(metrics.contractValueActive),
            sub: 'active jobs',
          },
          { label: 'Unbilled work', value: money(metrics.unbilledTotal) },
        ]
      : []),
    { label: 'Awaiting signature', value: metrics.awaitingSignature },
    { label: 'Need attention', value: needAttentionCount },
  ];

  // Financial floor reflow (ui-01 §11): 8 columns for Owner/Admin — Project ·
  // Client · Status · Progress · Contract · Billed · Margin · Attention — and
  // 5 without the three money columns for gated roles.
  const gridTemplate = canSeeFinancials
    ? '2.1fr 1.3fr 1fr 1.1fr 1.2fr 1fr 0.7fr 1.4fr'
    : '2.4fr 1.6fr 1.2fr 1.3fr 1.8fr';

  const rowBase: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: gridTemplate,
    gap: '12px',
    alignItems: 'center',
    padding: '13px 20px',
    borderBottom: `1px solid ${color.rowDivider}`,
    cursor: 'pointer',
  };

  return (
    <div>
      <ListPageHeader
        title="Projects"
        subtitle={`${counts.total} total · ${counts.active} active · ${counts.complete} complete`}
      >
        <ListSearchInput value={search} onChange={setSearch} placeholder="Search projects…" />
        {canCreate && (
          <Link href="/dashboard/projects/new" style={primaryButtonStyle}>
            + New Project
          </Link>
        )}
      </ListPageHeader>

      <MetricStrip metrics={stripMetrics} />

      <FilterChips
        options={STATUS_FILTERS}
        selected={currentStatus}
        onSelect={(value) =>
          router.push(value === 'all' ? '/dashboard/projects' : `/dashboard/projects?status=${value}`)
        }
      />

      {/* Table card */}
      {visible.length === 0 ? (
        <div style={{ ...cardStyle, padding: '48px', textAlign: 'center', color: color.muted }}>
          No projects
          {currentStatus !== 'all' ? ` with status "${currentStatus}"` : ''}
          {search.trim() ? ` matching "${search.trim()}"` : ''}. Convert an accepted estimate or
          create one manually.
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          {/* Header row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: gridTemplate,
              gap: '12px',
              padding: '12px 20px',
              backgroundColor: color.tableHeadBg,
              borderBottom: `1px solid ${color.neutralBadgeBg}`,
            }}
          >
            <span style={microLabelStyle}>Project</span>
            <span style={microLabelStyle}>Client</span>
            <span style={microLabelStyle}>Status</span>
            <span style={microLabelStyle}>Progress</span>
            {canSeeFinancials && (
              <>
                {/* [S97] "Contract / projected" — one header over rows of BOTH
                    kinds, so it cannot claim either. The per-row qualifier
                    below disambiguates (P11: a cost-plus/T&M value is a
                    non-binding projection, never a contract). The design's
                    bare CONTRACT header is AMENDED — the ruling wins. */}
                <span style={{ ...microLabelStyle, textAlign: 'right' }}>Contract / projected</span>
                <span style={{ ...microLabelStyle, textAlign: 'right' }}>Billed</span>
                <span style={{ ...microLabelStyle, textAlign: 'right' }}>Margin</span>
              </>
            )}
            <span style={microLabelStyle}>Needs attention</span>
          </div>

          {visible.map((p, i) => {
            const attention = attentionByProject[p.id] ?? [];
            const progress = progressFor(p.start_date, p.target_end_date, today);
            // K7 [RULED Josh, register-batch2]: `rowTintAttention` marks a row in a
            // needs-attention STATE — here the four-condition set (`attention`) the
            // row already renders as text. The token literally means "row needing
            // attention", so it tints exactly this. Not the deferred over-budget/
            // margin-under-target trigger — that waits on the C4/A6 target (§8.1
            // excludes it). `rowTintProblem` (compliance failure) is 14d's, and 14d
            // is SKIPPED this pass (the insurance store is RULED LEAVE AS IS).
            //
            // ⚠️ Hover still darkens to `tableHeadBg`; mouseleave returns the row to
            // `restBg`, NOT white — otherwise the leave handler would wipe the tint
            // (the collision flagged in Phase 2). A clean row's rest state is
            // transparent, exactly as before.
            const restBg = attention.length > 0 ? color.rowTintAttention : 'transparent';
            return (
              <div
                key={p.id}
                onClick={() => router.push(`/dashboard/projects/${p.id}`)}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = color.tableHeadBg)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = restBg)}
                style={{
                  ...rowBase,
                  backgroundColor: restBg,
                  borderBottom: i === visible.length - 1 ? 'none' : rowBase.borderBottom,
                }}
              >
                {/* Project — number folded beneath the name (§8.1). The Type
                    column is dropped; project_type still marks projected rows. */}
                <span>
                  <span
                    style={{
                      display: 'block',
                      fontFamily: font.sans,
                      fontWeight: 700,
                      color: color.navy,
                      fontSize: '14px',
                    }}
                  >
                    {p.name}
                  </span>
                  <span
                    style={{
                      fontFamily: font.mono,
                      fontSize: '11.5px',
                      fontWeight: 500,
                      color: color.faint,
                    }}
                  >
                    {p.project_number}
                  </span>
                </span>
                <span style={{ fontSize: '13px', color: color.bodyAlt }}>
                  {p.contact ? `${p.contact.first_name} ${p.contact.last_name}` : '—'}
                </span>
                <span>
                  <span
                    style={{
                      ...badgeStyle,
                      backgroundColor: STATUS_BADGES[p.status].bg,
                      color: STATUS_BADGES[p.status].fg,
                    }}
                  >
                    {PROJECT_STATUS_LABELS[p.status]}
                  </span>
                </span>
                {/* Progress — RULED: percent + days left, nothing else. */}
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: '12.5px',
                    color: progress === null ? color.faint : color.bodyAlt,
                  }}
                >
                  {progressLabel(progress)}
                </span>
                {canSeeFinancials && (
                  <>
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: '13.5px',
                        fontWeight: 600,
                        // 7B (Q3a): the Contract column shows the REVISED value.
                        color: (revisedContracts[p.id] ?? null) === null ? color.faint : color.navy,
                        textAlign: 'right',
                      }}
                    >
                      {money(revisedContracts[p.id] ?? null)}
                      {/* [S97] PER-ROW QUALIFIER. A projected row is marked; a
                          contract row is not, so the unmarked case stays clean. */}
                      {p.project_type !== 'fixed_price' &&
                        (revisedContracts[p.id] ?? null) !== null && (
                          <span
                            style={{
                              display: 'block',
                              fontFamily: font.sans,
                              fontSize: '10px',
                              fontWeight: 400,
                              color: color.faint,
                            }}
                          >
                            projected
                          </span>
                        )}
                    </span>
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: '13.5px',
                        color: color.bodyAlt,
                        textAlign: 'right',
                      }}
                    >
                      {money(billed[p.id] ?? null)}
                    </span>
                    <span
                      style={{
                        fontFamily: font.mono,
                        fontSize: '13.5px',
                        fontWeight: 600,
                        color: (marginPercent[p.id] ?? null) === null ? color.faint : color.navy,
                        textAlign: 'right',
                      }}
                    >
                      {(marginPercent[p.id] ?? null) === null ? '—' : `${marginPercent[p.id]}%`}
                    </span>
                  </>
                )}
                {/* Needs attention — RULED: four conditions, closed set;
                    em-dash when clean. */}
                <span
                  style={{
                    fontFamily: font.sans,
                    fontSize: '12.5px',
                    fontWeight: attention.length > 0 ? 600 : 400,
                    color: attention.length > 0 ? color.warning : color.faint,
                  }}
                >
                  {attention.length > 0 ? attention.join(' · ') : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
