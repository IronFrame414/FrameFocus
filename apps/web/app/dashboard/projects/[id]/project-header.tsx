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
  // [S171] Allowances & Selections §9.2 — visible to EVERY role including
  // subcontractors (Q10); the page carries no costs, and the amounts side
  // table's RLS (20261026000000) is what makes that a floor, not this list.
  { slug: 'selections', label: 'Selections' },
  { slug: 'changes', label: 'Change Orders' },
  // 7D — client invoicing. Owner/Admin/PM only (§12): a PM creates invoices
  // but cannot send without Owner/Admin approval. Foreman/Crew never see
  // client billing; the invoices RLS policies enforce the same set.
  {
    slug: 'invoices',
    label: 'Invoices',
    roles: ['owner', 'admin', 'project_manager'],
  },
  // 7E — money received. OWNER/ADMIN ONLY. [Fix 4] The screen is all AGGREGATES
  // (collected/spent/ahead, AR aging, retainage held, outstanding, payments
  // received) — the client's whole financial position, which cannot be
  // authorship-scoped. This supersedes P-3 ("a PM who cannot see whether their
  // invoice was paid cannot do the job"): a PM keeps the Invoices tab
  // (authorship-scoped) and submits for approval. Foreman/Crew/PM never see it.
  {
    slug: 'payments',
    label: 'Payments',
    roles: ['owner', 'admin'],
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

// ---------------------------------------------------------------------------
// Desktop-redesign §1 — 17 tabs become SIX SECTIONS with a sub-tab row.
// ---------------------------------------------------------------------------
// R2: grouping is PRESENTATION. The TABS list above — its role lists and its
//     comments — is untouched and remains the single authority on who sees
//     what; a section shows whatever of its sub-tabs the caller's role admits.
// R1: a section header is not a route. Its link resolves to the caller's
//     FIRST VISIBLE sub-tab (Money → Budget & Cost for a foreman, Change
//     Orders for crew), and a section with zero visible sub-tabs does not
//     render at all.
// R3: People groups Contacts and Team as two sub-tabs; the lists stay separate.
// R4: sections of one (Overview, Chat) render no sub-tab row.
// Sub-tab order within a section is §1's table, not TABS declaration order.
const SECTIONS: { label: string; slugs: string[] }[] = [
  { label: 'Overview', slugs: [''] },
  { label: 'Work', slugs: ['schedule', 'selections', 'punch', 'deliveries'] },
  {
    label: 'Money',
    slugs: ['budget', 'changes', 'invoices', 'payments', 'profitability'],
  },
  { label: 'Documents', slugs: ['files', 'photos', 'contracts', 'lien-releases'] },
  { label: 'People', slugs: ['contacts', 'team'] },
  { label: 'Chat', slugs: ['chat'] },
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

  function isActive(slug: string): boolean {
    if (slug === '') return pathname === base;
    return pathname.startsWith(`${base}/${slug}`);
  }

  function hrefFor(slug: string): string {
    return slug === '' ? base : `${base}/${slug}`;
  }

  // The role filter runs per sub-tab, against the untouched TABS lists (R2);
  // a section that filters to nothing is dropped entirely (R1).
  const tabBySlug = new Map(TABS.map((t) => [t.slug, t]));
  const sections = SECTIONS.map((s) => ({
    label: s.label,
    structurallySingle: s.slugs.length === 1,
    tabs: s.slugs
      .map((slug) => tabBySlug.get(slug))
      .filter((t): t is (typeof TABS)[number] => t !== undefined)
      .filter((t) => !t.roles || t.roles.includes(role)),
  })).filter((s) => s.tabs.length > 0);

  const activeSection = sections.find((s) => s.tabs.some((t) => isActive(t.slug)));

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

      {/* Section bar — README "Tab hierarchy (project detail only)": primary
          tabs are raised segments, active = primary fill with white text.
          Each section links to the caller's first visible sub-tab (R1). */}
      <div
        style={{
          display: 'flex',
          gap: '2px',
          borderBottom: `1px solid ${color.cardBorder}`,
        }}
      >
        {sections.map((section) => {
          const active = section === activeSection;
          return (
            <Link
              key={section.label}
              href={hrefFor(section.tabs[0].slug)}
              data-testid={`project-section-${section.label.toLowerCase()}`}
              style={{
                padding: '10px 16px',
                fontFamily: font.sans,
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '9px 9px 0 0',
                backgroundColor: active ? color.primary : 'transparent',
                color: active ? '#ffffff' : color.mutedAlt,
                textDecoration: 'none',
              }}
            >
              {section.label}
            </Link>
          );
        })}
      </div>

      {/* Sub-tab row — a white strip below the segments, active sub-tab carries
          the inset 0 -2.5px underline. R4: sections of one (Overview, Chat)
          render no row — the row appears only for structurally multi-tab
          sections, so a role filtered down to one sub-tab still sees where it
          is (a reflow, not a disappearance). */}
      {activeSection && !activeSection.structurallySingle && (
        <div
          style={{
            display: 'flex',
            gap: '2px',
            backgroundColor: '#ffffff',
            borderBottom: `1px solid ${color.cardBorder}`,
            padding: '0 4px',
          }}
        >
          {activeSection.tabs.map((tab) => {
            const active = isActive(tab.slug);
            return (
              <Link
                key={tab.slug}
                href={hrefFor(tab.slug)}
                data-testid={`project-subtab-${tab.slug === '' ? 'overview' : tab.slug}`}
                style={{
                  padding: '9px 12px',
                  fontFamily: font.sans,
                  fontSize: '13px',
                  fontWeight: 600,
                  color: active ? color.navy : color.mutedAlt,
                  boxShadow: active ? `inset 0 -2.5px 0 ${color.primary}` : 'none',
                  textDecoration: 'none',
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
