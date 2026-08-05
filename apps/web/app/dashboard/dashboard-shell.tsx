'use client';
import { createClient } from '@/lib/supabase-browser';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  CreditCard,
  FileText,
  HardHat,
  LayoutGrid,
  List,
  Receipt,
  Rows3,
  Settings,
  User,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { ROLE_LABELS, type CompanyRole } from '@framefocus/shared';
import { brand } from '@/lib/brand';
import type { GpsClockMode } from '@framefocus/shared/utils/time-tracking';
import type { SessionWithSegments } from '@/lib/services/time-tracking-client';
import { GlobalClockButton } from '@/components/time/global-clock-button';

interface DashboardShellProps {
  children: React.ReactNode;
  userName: string;
  userRole: CompanyRole;
  companyName: string;
  /** Global clock state (S85 header button) — fetched by the layout. */
  openSession: SessionWithSegments | null;
  myMemberId: string | null;
  timeZone: string;
  /** companies.gps_clock_mode [S86] — 'off' disables capture in ClockModal. */
  gpsMode: GpsClockMode;
}

// FFNav 12-item order locked S86 round-2 (6a-ui-build-report addendum), built
// with the 6B UI: Field Ops inserted after Schedule. Role gates preserved from
// ui-01 §5/§S5: Estimates + Cost Catalog owner/admin/pm; Settings owner/admin;
// Billing owner-only. Icon mapping per §5/§S4 (lucide; hard-hat = Field Ops).
// 7A [S90]: Expenses APPENDED after Timeclock as item 13 of the locked 12
// (7A-spec §5.2 — ungated, the Field Ops precedent; page content is
// role-scoped). Final position is owed to the deferred FFNav reindex session.
const NAV_ITEMS: {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: CompanyRole[];
}[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/dashboard/projects', label: 'Projects', icon: Rows3 },
  { href: '/dashboard/schedule', label: 'Schedule', icon: Calendar },
  // Field Ops: ungated (all dashboard roles) per the S86 round-2 decision;
  // per-project RLS (can_view_project) scopes what the hub actually lists.
  { href: '/dashboard/field-ops', label: 'Field Ops', icon: HardHat },
  // PERMANENT first-class item (S86 decision — no longer interim). Timesheets
  // is NOT a nav item: it lives at /dashboard/timeclock/timesheets (S85).
  { href: '/dashboard/timeclock', label: 'Timeclock', icon: Clock },
  // 7A: ungated — crew capture + own list; content is role-scoped (§5.4).
  { href: '/dashboard/expenses', label: 'Expenses', icon: Receipt },
  { href: '/dashboard/contacts', label: 'Contacts', icon: User },
  { href: '/dashboard/subcontractors', label: 'Subs & Vendors', icon: Users },
  {
    href: '/dashboard/estimates',
    label: 'Estimates',
    icon: FileText,
    roles: ['owner', 'admin', 'project_manager'],
  },
  {
    href: '/dashboard/catalog',
    label: 'Cost Catalog',
    icon: List,
    roles: ['owner', 'admin', 'project_manager'],
  },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, roles: ['owner', 'admin'] },
  { href: '/dashboard/team', label: 'Team', icon: UsersRound },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard, roles: ['owner'] },
];

/** First initial of first + last word of the wired name (ui-01 §S6). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function DashboardShell({
  children,
  userName,
  userRole,
  companyName,
  openSession,
  myMemberId,
  timeZone,
  gpsMode,
}: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/sign-in');
    router.refresh();
  }

  // Active = current route (§5): exact match for the Dashboard root so it
  // doesn't stay lit on every /dashboard/* child; prefix match elsewhere.
  function isActive(href: string): boolean {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-[236px] shrink-0 flex-col bg-brand-900 py-[22px]">
        {/* Header block — the PRODUCT lockup, above the TENANT's company name.
            /logo-full-ice.svg is the FULL-COLOUR variant for navy, and it is
            the deliberate choice here [Josh, S98]: the brand sheet's own
            sidebar mockup puts a coloured mark on navy, not a plain white
            reversal. logo-white.svg — the one-colour reversal — is NOT the
            right file for this surface. The auth screens, which are light, use
            logo-full-light.svg; the one-colour logo-navy.svg and logo-white.svg
            are currently unused spares.

            NOT logo-full-dark.svg, despite the name. The two files differ in
            one attribute — the kicker fill — and on this navy that difference
            decides whether the kicker is readable: slate #7B849A is 4.27:1,
            ice #CED6E8 is 10.96:1, at a ~8.4px cap height. "full-dark" is
            named for dark backgrounds generally; on THIS background ice wins.
            The landing page (app/page.tsx, same bg-brand-900) uses the same
            file for the same reason — keep the two in step.

            The whole two-line lockup — indigo binder tile, "EZ CONTRACTOR"
            ice kicker, amber "Binder" wordmark — lives inside the SVG. Do
            NOT rebuild those lines as markup: the kerning, the two baselines
            and the mark's optical alignment are all in the file, and a text
            reconstruction drifts from the brand sheet the moment the font
            falls back.

            The SVG carries hexes that are off the Tailwind scale on purpose —
            #3F47CF tile, #CED6E8 kicker, #EDA122 amber (vs accent-500
            #f59e0b), #17213C (vs brand-900). They are the brand sheet's own
            values. Leave them as literals in the file; do not "fix" the
            mismatch by reconciling either side. Note this is the one place
            the icon indigo appears in the web UI — lib/brand.ts's "indigo is
            phone-icon only" note is about manifest/theme colours, which this
            does not touch.

            Sized h-16 = 64px tall -> ~168px wide against the 192px of sidebar
            width left by px-[22px]. */}
        <div className="px-[22px] pb-[22px]">
          <h1 className="m-0">
            <img
              src="/logo-full-ice.svg"
              alt={brand.name}
              width={168}
              height={64}
              className="h-16 w-auto"
            />
          </h1>
          <p className="mt-[2px] text-[12px] font-medium text-brand-300">{companyName}</p>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-[2px] px-[14px]">
          {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(userRole)).map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? 'flex items-center gap-[11px] rounded-[9px] bg-brand-500 px-3 py-[10px] text-sm font-semibold text-white'
                    : 'flex items-center gap-[11px] rounded-[9px] px-3 py-[10px] text-sm font-medium text-brand-200 transition-colors duration-150 hover:bg-white/5'
                }
              >
                <Icon size={17} strokeWidth={1.9} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="mx-[14px] mt-auto border-t border-white/[0.08] pt-4">
          <div className="flex items-center gap-[11px]">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-accent-500 text-sm font-bold text-brand-900">
              {initials(userName)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-white">{userName}</p>
              <p className="truncate text-[12px] text-brand-300">
                {ROLE_LABELS[userRole] ?? userRole}
              </p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="mt-3 w-full rounded-[9px] px-3 py-2 text-left text-[12px] text-brand-300 transition-colors duration-150 hover:bg-white/5 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Global header strip (S85): the clock button rides top-right on
            every dashboard page. Known cost, accepted: shifts page content
            down by the strip's height. */}
        <header className="flex h-[54px] shrink-0 items-center justify-end border-b border-[#e6e9ef] bg-white px-[30px]">
          <GlobalClockButton
            openSession={openSession}
            myMemberId={myMemberId}
            timeZone={timeZone}
            gpsMode={gpsMode}
            userRole={userRole}
          />
        </header>
        <main className="flex-1 bg-[#f4f6f9] px-[30px] py-[26px]">{children}</main>
      </div>
    </div>
  );
}
