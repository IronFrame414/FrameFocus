'use client';
import { createClient } from '@/lib/supabase-browser';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  CreditCard,
  FileText,
  LayoutGrid,
  List,
  Rows3,
  Settings,
  User,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { ROLE_LABELS, type CompanyRole } from '@framefocus/shared';
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

// ui-01 §5 — ten items, this order. Role gates preserved from the previous
// shell (§S5): Estimates + Cost Catalog owner/admin/pm; Settings owner/admin;
// Billing owner-only. Icon mapping per §5/§S4 (lucide).
const NAV_ITEMS: {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: CompanyRole[];
}[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/dashboard/projects', label: 'Projects', icon: Rows3 },
  { href: '/dashboard/schedule', label: 'Schedule', icon: Calendar },
  // PERMANENT first-class item (S86 decision — no longer interim). Timesheets
  // is NOT a nav item: it lives at /dashboard/timeclock/timesheets (S85).
  // The owed FFNav reindex is DEFERRED to the 6B UI build and inserts a
  // Field Ops item after Schedule (target 12-item order in the 6a build
  // report's S86 round-2 addendum); Timeclock keeps this slot.
  { href: '/dashboard/timeclock', label: 'Timeclock', icon: Clock },
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
        {/* Header block */}
        <div className="px-[22px] pb-[22px]">
          <h1 className="text-[20px] font-extrabold tracking-[-0.01em] text-white">
            Rafter<span className="text-accent-500">Works</span>
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
          />
        </header>
        <main className="flex-1 bg-[#f4f6f9] px-[30px] py-[26px]">{children}</main>
      </div>
    </div>
  );
}
