'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { color } from '@/lib/theme';

/**
 * The four portal pages, as ruled [Josh, S168].
 *
 * ===========================================================================
 * ⚠️ THE ONE-PAGE RULING WAS REAL AND IT WAS OVER-APPLIED
 * ===========================================================================
 * The project view shipped as a single page on the strength of Josh's S164 Q3:
 * *"in the portal, they see all of it on one page and totals added."* He has
 * now clarified: *"I believe that was referring to financials."*
 *
 * So the ruling **stands, for the Financials page only** — proposals, change
 * orders and billing are one page with totals added, and must not be tabbed or
 * paginated further. The rest of the portal is broken up the way the company
 * side is: *"it is all 1 page but should be broken up with separate pages just
 * like the company side is."*
 *
 * ⚠️ AND THIS IS THE ONLY CLIENT COMPONENT IN THE SPLIT. It exists solely to
 * read `usePathname()` for the active state. Nothing is fetched here and
 * nothing is decided here — the guard, the branding and the access banner are
 * all in the layout, server-side, where they cannot be skipped.
 */

export interface PortalTab {
  segment: string;
  label: string;
}

export const PORTAL_TABS: PortalTab[] = [
  { segment: '', label: 'Dashboard' },
  { segment: '/financials', label: 'Financials' },
  { segment: '/files', label: 'Files & photos' },
  { segment: '/selections', label: 'Selections' },
];

export function PortalTabs({ projectId, accent }: { projectId: string; accent: string }) {
  const pathname = usePathname();
  const base = `/portal/${projectId}`;

  return (
    <nav
      aria-label="Project sections"
      data-testid="portal-tabs"
      style={{
        display: 'flex',
        gap: '6px',
        margin: '18px 0 16px',
        flexWrap: 'wrap',
        borderBottom: `1px solid ${color.cardBorder}`,
        paddingBottom: '10px',
      }}
    >
      {PORTAL_TABS.map((tab) => {
        const href = `${base}${tab.segment}`;
        // Exact match, not `startsWith`. `/portal/x` is a prefix of every other
        // tab, so a prefix test would light Dashboard up on all four.
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            data-testid={`portal-tab-${tab.segment.replace('/', '') || 'dashboard'}`}
            style={{
              fontSize: '13px',
              fontWeight: active ? 700 : 600,
              color: active ? '#ffffff' : color.bodyAlt,
              textDecoration: 'none',
              padding: '6px 11px',
              borderRadius: '8px',
              backgroundColor: active ? accent : color.pageBg,
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
