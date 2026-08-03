'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProjectStatus, ProjectWithContact } from '@/lib/services/projects';
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '@/lib/services/projects-client';
import {
  badgeStyle,
  cardStyle,
  color,
  font,
  h2Style,
  microLabelStyle,
  primaryButtonStyle,
} from '@/lib/theme';

interface ProjectsListProps {
  projects: ProjectWithContact[];
  /** 7B: revised contract per project id (server-derived via
   *  getRevisedContractMap — the single legal derivation). null = no
   *  original contract value; empty for roles without the Contract column. */
  revisedContracts: Record<string, number | null>;
  currentStatus: string;
  canCreate: boolean;
  /** Financial floor (ui-01 §11): Contract column is Owner/Admin only. */
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

  // Financial floor reflow (ui-01 §11): 6 columns for Owner/Admin, 5 without
  // the Contract column for gated roles.
  const gridTemplate = canSeeFinancials
    ? '1fr 2.2fr 1.5fr 1.2fr 1.2fr 1.3fr'
    : '1fr 2.4fr 1.7fr 1.3fr 1.3fr';

  const rowBase: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: gridTemplate,
    gap: '12px',
    alignItems: 'center',
    padding: '15px 20px',
    borderBottom: `1px solid ${color.rowDivider}`,
    cursor: 'pointer',
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '18px',
        }}
      >
        <div>
          <h2 style={h2Style}>Projects</h2>
          <p style={{ color: color.muted, fontSize: '14px', margin: '4px 0 0' }}>
            {counts.total} total · {counts.active} active · {counts.complete} complete
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            style={{
              width: '220px',
              padding: '9px 12px',
              backgroundColor: '#fff',
              border: `1px solid ${color.inputBorder}`,
              borderRadius: '9px',
              fontFamily: font.sans,
              fontSize: '13px',
              color: color.body,
            }}
          />
          {canCreate && (
            <Link href="/dashboard/projects/new" style={primaryButtonStyle}>
              + New Project
            </Link>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {STATUS_FILTERS.map((f) => {
          const selected = currentStatus === f.value;
          return (
            <button
              key={f.value}
              onClick={() =>
                router.push(
                  f.value === 'all'
                    ? '/dashboard/projects'
                    : `/dashboard/projects?status=${f.value}`
                )
              }
              style={{
                padding: '7px 14px',
                fontFamily: font.sans,
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '8px',
                border: selected ? '1px solid transparent' : `1px solid ${color.cardBorder}`,
                backgroundColor: selected ? color.navy : '#fff',
                color: selected ? '#fff' : color.bodyAlt,
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

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
            <span style={microLabelStyle}>Number</span>
            <span style={microLabelStyle}>Name</span>
            <span style={microLabelStyle}>Client</span>
            <span style={microLabelStyle}>Type</span>
            <span style={microLabelStyle}>Status</span>
            {canSeeFinancials && (
              // [S97] "Contract / projected" — one header over rows of BOTH
              // kinds, so it cannot claim either. The per-row qualifier below
              // is what disambiguates each figure (P11: a cost-plus/T&M value
              // is a non-binding projection, never a contract).
              <span style={{ ...microLabelStyle, textAlign: 'right' }}>Contract / projected</span>
            )}
          </div>

          {visible.map((p, i) => (
            <div
              key={p.id}
              onClick={() => router.push(`/dashboard/projects/${p.id}`)}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = color.tableHeadBg)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              style={{
                ...rowBase,
                borderBottom: i === visible.length - 1 ? 'none' : rowBase.borderBottom,
              }}
            >
              <span style={{ fontFamily: font.mono, fontSize: '13px', fontWeight: 500, color: color.muted }}>
                {p.project_number}
              </span>
              <span style={{ fontFamily: font.sans, fontWeight: 700, color: color.navy, fontSize: '14px' }}>
                {p.name}
              </span>
              <span style={{ fontSize: '13px', color: color.bodyAlt }}>
                {p.contact ? `${p.contact.first_name} ${p.contact.last_name}` : '—'}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: color.bodyAlt }}>
                {PROJECT_TYPE_LABELS[p.project_type]}
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
              {canSeeFinancials && (
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: '14px',
                    fontWeight: 600,
                    // 7B (Q3a): the Contract column shows the REVISED value.
                    color: (revisedContracts[p.id] ?? null) === null ? color.faint : color.navy,
                    textAlign: 'right',
                  }}
                >
                  {money(revisedContracts[p.id] ?? null)}
                  {/* [S97] PER-ROW QUALIFIER. A projected row is marked; a
                      contract row is not, so the unmarked case stays clean. */}
                  {p.project_type !== 'fixed_price' && (revisedContracts[p.id] ?? null) !== null && (
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
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
