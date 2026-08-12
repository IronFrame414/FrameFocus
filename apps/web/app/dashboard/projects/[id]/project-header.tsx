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
  // 7D — client invoicing. Owner/Admin/PM only (§12): a PM creates invoices
  // but cannot send without Owner/Admin approval. Foreman/Crew never see
  // client billing; the invoices RLS policies enforce the same set.
  {
    slug: 'invoices',
    label: 'Invoices',
    roles: ['owner', 'admin', 'project_manager'],
  },
  // 7E — money received. Recording a payment is Owner/Admin ONLY (§8); a PM
  // reads it (P-3) because a PM who cannot see whether their invoice was paid
  // cannot do the job. Foreman/Crew never see client money.
  {
    slug: 'payments',
    label: 'Payments',
    roles: ['owner', 'admin', 'project_manager'],
  },
  // 7H — job profitability. OWNER/ADMIN ONLY (§7H.6), narrower than Invoices
  // and Payments beside it: a PM legitimately sees invoice amounts (the S97
  // Floor carve-out) but margin is not an invoice amount. money-rep P9 —
  // "budgeted, sell, and margin figures remain Owner/Admin-only".
  //
  // The page repeats this gate server-side. A tab hidden from the bar is not
  // a gate; the route is reachable by typing it.
  {
    slug: 'profitability',
    label: 'Profitability',
    roles: ['owner', 'admin'],
  },
  // 7F — lien releases and waivers. OWNER/ADMIN ONLY (§8.2).
  //
  // ⚠️ NOT justified on the Financial Visibility Floor — that rationale was
  // STRUCK at S98, because the Floor's S97 carve-out already lets a PM see
  // invoice totals and retainage, which IS the release amount. The reason is
  // narrower and sufficient: a release waives legal rights and voiding does
  // not retrieve it, so the actor must be able to bind the company.
  {
    slug: 'lien-releases',
    label: 'Lien Releases',
    roles: ['owner', 'admin'],
  },
  { slug: 'punch', label: 'Punch List' },
  { slug: 'deliveries', label: 'Deliveries' },
  { slug: 'files', label: 'Files' },
  { slug: 'photos', label: 'Photos' },
  { slug: 'contacts', label: 'Contacts' },
  { slug: 'contracts', label: 'Contracts' },
  { slug: 'team', label: 'Team' },
  // ND-33/ND-35 [S126 slice 3] — the project Chat tab (§7.1b): the reading and
  // auditing surface, and the only way back to an ARCHIVED project's thread
  // once the switcher drops it (§7.1a-i).
  //
  // ⚠️ NO `roles` ENTRY, AND THAT IS THE RULING, NOT AN OVERSIGHT (A-C27).
  // `can_view_project()` already decides who can read a thread; a role list
  // here would be a second answer to the same question and the two would have
  // to be kept in step forever. A-C27 asserts this ABSENCE precisely because
  // adding one would look like a safety improvement.
  //
  // APPENDED rather than inserted: §7.1b names the tab and not its position,
  // and the same reasoning the Notifications sidebar item carries applies —
  // placing it mid-strip would be a decision this build has no authority to
  // make.
  { slug: 'chat', label: 'Chat' },
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
