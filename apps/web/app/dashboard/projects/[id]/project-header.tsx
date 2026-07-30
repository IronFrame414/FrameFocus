'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ProjectWithContact } from '@/lib/services/projects';
import { PROJECT_STATUS_LABELS } from '@/lib/services/projects-client';
import { badgeStyle, color, font, h2Style, primaryButtonStyle } from '@/lib/theme';

interface ProjectHeaderProps {
  project: ProjectWithContact;
  /** Owner/Admin/PM — shows the "+ Change Order" action (ui-04 §4). */
  canManage: boolean;
  /** Caller's role — gates the Job Cost tab (7A §5.6: hidden for crew). */
  role: string;
}

// ui-04 §S2 (locked round 2): current tabs + Photos (adjacent to Files).
// + Deliveries (S90, 6D-spec §U amendment) — first-class project tab after
// Punch List (the field/materials cluster); Daily Logs and Safety stay on
// the Field Ops surface only.
// S93 (money representation A-5/§7.2): Budget + Job Cost merged into ONE
// "Budget & Cost" tab at the old Budget position; /costs redirects here.
// The 7A crew gate carries over — Owner/Admin/PM/Foreman only.
const TABS: { slug: string; label: string; roles?: string[] }[] = [
  { slug: '', label: 'Overview' },
  { slug: 'schedule', label: 'Schedule' },
  {
    slug: 'budget',
    label: 'Budget & Cost',
    roles: ['owner', 'admin', 'project_manager', 'foreman'],
  },
  { slug: 'changes', label: 'Change Orders' },
  { slug: 'punch', label: 'Punch List' },
  { slug: 'deliveries', label: 'Deliveries' },
  { slug: 'files', label: 'Files' },
  { slug: 'photos', label: 'Photos' },
  { slug: 'contacts', label: 'Contacts' },
  { slug: 'contracts', label: 'Contracts' },
  { slug: 'team', label: 'Team' },
];

// ui-03 §4 badge system (shared with the list screen).
const STATUS_BADGES: Record<string, { bg: string; fg: string }> = {
  active: { bg: '#e4f0e6', fg: '#3d7a4b' },
  on_hold: { bg: '#fdece0', fg: '#b45309' },
  complete: { bg: '#eef1f6', fg: '#6b7280' },
  archived: { bg: '#eef1f6', fg: '#6b7280' },
  cancelled: { bg: '#eef1f6', fg: '#c0362c' },
};

export function ProjectHeader({ project, canManage, role }: ProjectHeaderProps) {
  const pathname = usePathname();
  const base = `/dashboard/projects/${project.id}`;
  const badge = STATUS_BADGES[project.status] ?? STATUS_BADGES.archived;
  const visibleTabs = TABS.filter((t) => !t.roles || t.roles.includes(role));

  function isActive(slug: string): boolean {
    if (slug === '') return pathname === base;
    return pathname.startsWith(`${base}/${slug}`);
  }

  return (
    <div style={{ marginBottom: '20px' }}>
      {/* Breadcrumb (ui-04 §4) */}
      <div style={{ marginBottom: '8px' }}>
        <Link
          href="/dashboard/projects"
          style={{
            fontFamily: font.mono,
            fontSize: '12px',
            fontWeight: 500,
            color: color.faint,
            textDecoration: 'none',
          }}
        >
          Projects
        </Link>
        <span style={{ fontFamily: font.mono, fontSize: '12px', color: color.faint }}> / </span>
        <span style={{ fontFamily: font.mono, fontSize: '12px', fontWeight: 500, color: color.muted }}>
          {project.project_number}
        </span>
      </div>

      {/* Title row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ ...h2Style, fontSize: '25px' }}>{project.name}</h2>
          <span
            style={{ ...badgeStyle, backgroundColor: badge.bg, color: badge.fg }}
          >
            {PROJECT_STATUS_LABELS[project.status]}
          </span>
        </div>
        {canManage && (
          <Link href={`${base}/changes`} style={primaryButtonStyle}>
            + Change Order
          </Link>
        )}
      </div>

      {/* Tab bar — active tab carries the inset blue underline (ui-04 §4) */}
      <div
        style={{
          display: 'flex',
          gap: '2px',
          borderBottom: `1px solid ${color.cardBorder}`,
        }}
      >
        {visibleTabs.map((tab) => {
          const active = isActive(tab.slug);
          return (
            <Link
              key={tab.slug}
              href={tab.slug === '' ? base : `${base}/${tab.slug}`}
              style={{
                padding: '10px 14px',
                fontFamily: font.sans,
                fontSize: '13px',
                fontWeight: 600,
                color: active ? color.navy : color.mutedAlt,
                boxShadow: active ? `inset 0 -2px 0 ${color.primary}` : 'none',
                textDecoration: 'none',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
