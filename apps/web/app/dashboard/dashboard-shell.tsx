'use client';
import { createClient } from '@/lib/supabase-browser';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  Bell,
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
import { ChatPanel } from '@/components/chat/chat-panel';

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
  /** ND-12 — the Notifications item's unread badge. 0 renders no badge. */
  unreadCount: number;
  /** ND-33 — the global chat panel needs the caller's PROFILE id, not user id. */
  myProfileId: string;
}

// ===========================================================================
// FFNav — 14 items, THREE SECTIONS. Locked [S130, Josh]. Spec:
// docs/specs/ffnav-reindex-spec.md
// ===========================================================================
//
// ⚠️ THE ORDER IS AN INTERVIEW OUTCOME, NOT A CONVENTION. Dashboard, Projects
// and Schedule lead because they are what Josh opens every morning on desktop;
// he named that order explicitly. It is not alphabetical and not inherited.
// The top layer is the DAILY SET; Reference and Admin are the items he does not
// touch in a month, and that split is his own. Reasoning in the spec's §2 so a
// later reader can meet it rather than rediscover it.
//
// _Superseded, quoted not rewritten — the history this replaces:_
//   "FFNav 12-item order locked S86 round-2 (6a-ui-build-report addendum), built
//    with the 6B UI: Field Ops inserted after Schedule. … 7A [S90]: Expenses
//    APPENDED after Timeclock as item 13 of the locked 12 (7A-spec §5.2 —
//    ungated, the Field Ops precedent; page content is role-scoped). Final
//    position is owed to the deferred FFNav reindex session."
//
// That comment was accurate every time it was written. The list grew four times
// — ui-01 specced TEN, the M6 handoff refreshed to ELEVEN, S86 round-2 locked
// TWELVE, 7A appended Expenses (13), ND-12 appended Notifications (14) — and
// each append correctly flagged that its final position was owed to a reindex
// session that had not happened. It has now happened. See the spec's §0 for why
// three different counts were all simultaneously true.
//
// ROLE GATES ARE UNCHANGED BY THIS WORK and must stay that way: Estimates +
// Cost Catalog owner/admin/pm; Settings owner/admin; Billing owner-only
// (ui-01 §5/§S5). Moving items between groups is exactly when a gate gets
// "tidied" by accident — A-N6 asserts they did not.
//
// Icon mapping per ui-01 §5/§S4 (lucide; hard-hat = Field Ops).

/** §1 — the two labelled sections. The top layer is `null`: no header. */
type NavSection = 'reference' | 'admin' | null;

const NAV_ITEMS: {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: CompanyRole[];
  section: NavSection;
}[] = [
  // ---- TOP LAYER — the daily set. No header. ----------------------------
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid, section: null },
  { href: '/dashboard/projects', label: 'Projects', icon: Rows3, section: null },
  { href: '/dashboard/schedule', label: 'Schedule', icon: Calendar, section: null },
  // Field Ops: ungated (all dashboard roles) per the S86 round-2 decision;
  // per-project RLS (can_view_project) scopes what the hub actually lists.
  { href: '/dashboard/field-ops', label: 'Field Ops', icon: HardHat, section: null },
  // PERMANENT first-class item (S86 decision — no longer interim). Timesheets
  // is NOT a nav item: it lives at /dashboard/timeclock/timesheets (S85).
  { href: '/dashboard/timeclock', label: 'Timeclock', icon: Clock, section: null },
  // 7A: ungated — crew capture + own list; content is role-scoped (§5.4).
  { href: '/dashboard/expenses', label: 'Expenses', icon: Receipt, section: null },
  {
    href: '/dashboard/estimates',
    label: 'Estimates',
    icon: FileText,
    roles: ['owner', 'admin', 'project_manager'],
    section: null,
  },
  // ND-12 [S123] — Notifications. UNGATED: every role has notifications, and
  // `notifications_select_own` is what scopes the contents, so a role gate here
  // would have to be kept in step with every future consumer for no gain.
  //
  // ✅ POSITION RULED [S130]: EIGHTH, last in the top layer. _Superseded,
  // quoted not rewritten: "⚠️ POSITION IS NOT DECIDED HERE … FINAL PLACEMENT IS
  // STILL OWED TO THE DEFERRED FFNav REINDEX."_ It is checked by BADGE rather
  // than navigated to, so proximity to the top buys nothing the badge does not
  // already provide — while positions 1–3 are load-bearing, being the three
  // Josh named as his morning order.
  { href: '/dashboard/notifications', label: 'Notifications', icon: Bell, section: null },

  // ---- REFERENCE — labelled. -------------------------------------------
  // Contacts and Subs & Vendors are ONE THING in Josh's head and the system
  // treats them differently, hence adjacent rather than merged.
  { href: '/dashboard/contacts', label: 'Contacts', icon: User, section: 'reference' },
  {
    href: '/dashboard/subcontractors',
    label: 'Subs & Vendors',
    icon: Users,
    section: 'reference',
  },
  // ⚠️ TEAM WAS IN NONE OF THE INTERVIEW'S THREE GROUPS — the ruling accounted
  // for 13 items and the list has 14. Found by reading NAV_ITEMS in full rather
  // than trusting the count. Ruled into Reference [S130]: it is people-shaped
  // and belongs beside the two above.
  //
  // Admin was REJECTED for it, on the ruling's own worked example: Team is
  // UNGATED, so placing it in Admin would give a crew member an Admin header
  // with Team under it — contradicting "a crew member's Admin is empty".
  { href: '/dashboard/team', label: 'Team', icon: UsersRound, section: 'reference' },
  {
    href: '/dashboard/catalog',
    label: 'Cost Catalog',
    icon: List,
    roles: ['owner', 'admin', 'project_manager'],
    section: 'reference',
  },

  // ---- ADMIN — labelled. ------------------------------------------------
  {
    href: '/dashboard/settings',
    label: 'Settings',
    icon: Settings,
    roles: ['owner', 'admin'],
    section: 'admin',
  },
  {
    href: '/dashboard/billing',
    label: 'Billing',
    icon: CreditCard,
    roles: ['owner'],
    section: 'admin',
  },
];

/** §4b — the section labels. Order here IS render order. */
const NAV_SECTIONS: { key: Exclude<NavSection, null>; label: string }[] = [
  { key: 'reference', label: 'Reference' },
  { key: 'admin', label: 'Admin' },
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
  unreadCount,
  myProfileId,
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

  // The role filter, applied ONCE. Order is NAV_ITEMS' order, always.
  const visible = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(userRole));

  function renderItem(item: (typeof NAV_ITEMS)[number]) {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        data-testid={`nav-item-${item.href}`}
        className={
          active
            ? 'flex items-center gap-[11px] rounded-[9px] bg-brand-500 px-3 py-[10px] text-sm font-semibold text-white'
            : 'flex items-center gap-[11px] rounded-[9px] px-3 py-[10px] text-sm font-medium text-brand-200 transition-colors duration-150 hover:bg-white/5'
        }
      >
        <Icon size={17} strokeWidth={1.9} aria-hidden />
        {item.label}
        {/* ND-12 — the unread badge, on the Notifications item only. Nothing at
            0: an always-present "0" is noise that trains people to ignore the
            item, and it would pass any "the badge exists" assertion (A-N44
            tests all three states). Caps at 9+, matching parent §10.3's mobile
            rule so the two surfaces do not diverge. */}
        {item.href === '/dashboard/notifications' && unreadCount > 0 && (
          <span
            data-testid="nav-unread-badge"
            className="ml-auto min-w-[20px] rounded-full bg-accent-500 px-1.5 text-center font-mono text-[11px] font-bold leading-5 text-brand-900"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Link>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* ------------------------------------------------------------------
          THE SIDEBAR IS PINNED TO THE VIEWPORT [S158 · Finding 3, RULED Josh]

          It used to be a plain flex item: `flex w-[236px] shrink-0 flex-col`.
          With no height of its own it STRETCHED to the height of the flex
          container, which is the height of the DOCUMENT — so on a long page
          (Settings was the one Josh caught) the footer's `mt-auto` pushed the
          user block and Sign out to the bottom of the *document*, hundreds of
          pixels below the fold. The nav did not "scroll away" because it was
          scrolling; it scrolled away because it was as tall as the page.

          Three classes, and each is load-bearing:
            · `h-screen`  — an explicit cross-size, which is also what STOPS the
                            stretch. `align-self: stretch` only applies while
                            the cross-size is `auto`, and a stretched box has no
                            room to move, so `sticky` on its own would do
                            nothing at all here.
            · `self-start` — says the same thing declaratively. Redundant with
                            `h-screen` by the spec; kept so a later edit that
                            touches the height does not silently reinstate the
                            stretch.
            · `sticky top-0` — pins it. Not `fixed`: fixed leaves the 236px
                            column behind and every dashboard page would have to
                            re-add the offset.

          ⚠️ AND THE NAV ITSELF NOW SCROLLS — see the `overflow-y-auto min-h-0`
          below. Capping the aside at one viewport creates the opposite failure
          on a SHORT viewport: an Owner sees all 14 items plus the lockup and the
          footer, which overflows a laptop window, and without an inner scroller
          the overflow would be unreachable in a different way. A fix that works
          on Settings and breaks a 700px window is not a fix.
          ------------------------------------------------------------------ */}
      <aside className="sticky top-0 flex h-screen w-[236px] shrink-0 flex-col self-start bg-brand-900 py-[22px]">
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

        {/* ------------------------------------------------------------------
            Nav — THREE SECTIONS [S130]. Spec: docs/specs/ffnav-reindex-spec.md

            The top layer renders with NO header; Reference and Admin render a
            label above their items.

            ⚠️ AN EMPTY SECTION RENDERS NO HEADER. A labelled group with nothing
            under it is worse than no group — and it is the case a crew member
            actually hits, since both Admin items are gated away from them.
            Because the role filter runs BEFORE the grouping below, an empty
            section simply produces no rows and its header is never reached.
            Nothing else is needed: headers are labels rather than dividers, so
            omitting one leaves no artefact behind.

            ⚠️ ROLE FILTERING NEVER RE-ORDERS. `visible` preserves NAV_ITEMS'
            order and only removes; each section then renders its own subset in
            that same order. A build that sorted per role would pass every
            "the right items are present" assertion and fail A-N3.
            ------------------------------------------------------------------ */}
        {/* `min-h-0` before `overflow-y-auto`, in that order of reasoning: a
            flex item's default `min-height: auto` refuses to shrink below its
            content, so the overflow rule would never engage and the footer
            would be pushed off the bottom of the pinned aside instead. The
            lockup above and the footer below stay put; only this list moves. */}
        <nav className="flex min-h-0 flex-1 flex-col gap-[2px] overflow-y-auto px-[14px]">
          {visible.filter((item) => item.section === null).map(renderItem)}

          {NAV_SECTIONS.map(({ key, label }) => {
            const items = visible.filter((item) => item.section === key);
            if (items.length === 0) return null;
            return (
              <div key={key} className="contents">
                {/* §4b — ui-01's microLabelStyle, recoloured for navy. A token
                    reused rather than one invented. No divider rule: Josh ruled
                    labels, not bare dividers. */}
                <p
                  data-testid={`nav-section-${key}`}
                  className="mt-[14px] mb-[2px] px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-brand-300"
                >
                  {label}
                </p>
                {items.map(renderItem)}
              </div>
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
        <header className="flex h-[54px] shrink-0 items-center justify-end border-b border-[#e4e8ef] bg-white px-[30px]">
          <GlobalClockButton
            openSession={openSession}
            myMemberId={myMemberId}
            timeZone={timeZone}
            gpsMode={gpsMode}
            userRole={userRole}
          />
        </header>
        <main className="flex-1 bg-[#f4f6fa] px-[30px] py-[26px]">{children}</main>
      </div>
      {/* ND-33 / A-C24 — the chat launcher and panel mount ONCE, here, so they
          render on every /dashboard route including the ones that have nothing
          to do with a project. Mounting them per page would be a second
          implementation of one surface (§7.1a) and would fail A-C24 on
          Contacts, Estimates and Settings while passing everywhere else. */}
      <ChatPanel myProfileId={myProfileId} />
    </div>
  );
}
