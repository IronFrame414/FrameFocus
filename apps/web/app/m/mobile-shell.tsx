'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ClipboardList,
  Contact,
  Folder,
  HardHat,
  Receipt,
  Settings,
  Timer,
  Truck,
  Users,
  CalendarDays,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import { MobileHeaderProvider, useMobileHeader } from './mobile-header';

// M6M §3 — THE MOBILE SHELL.
//
// One client component owns all four pieces §1 lists for layout.tsx: the app
// bar (§3.1), the bottom tab bar (§3.2), the hamburger sheet host (§3.3) and
// the app-wide offline strip (§4.4). They are together because three of them
// share one piece of state — whether the sheet is open — and because the
// LAYERING between them is the specified behaviour, not an implementation
// detail (see A-2 below).

// ---------------------------------------------------------------------------
// §3.2 — the five tab slots. Order is Projects · Timeclock · [camera] · Logs ·
// Field; the camera is not in this list because it is not a tab (it has no
// label, no active state, and is rendered separately).
// ---------------------------------------------------------------------------
const TABS = [
  { href: '/m/projects', label: 'Projects', Icon: Folder },
  { href: '/m/timeclock', label: 'Timeclock', Icon: Timer },
  { href: '/m/logs', label: 'Logs', Icon: ClipboardList },
  { href: '/m/field', label: 'Field', Icon: HardHat },
] as const;

// ---------------------------------------------------------------------------
// §3.3 — the SIX sheet tiles, in the spec's order, and nothing else.
//
// Projects, Timeclock, Logs and Field are ABSENT BY RULE: "Because the tab bar
// owns [them], those four are deliberately absent here. A build that adds them
// back is wrong." A-3 fails if any of them appears.
//
// DASHBOARD IS ABSENT BY RULING — D-38 [S100] CUT it from v1. Every non-money
// figure it carried is already owned by M-2, M-3, M-13 or M-14; its attention
// feed is office admin with /dashboard/** hrefs; and getDashboardData() reaches
// for change_orders.net_delta twice, which is the exact column D-26 cut. There
// is no /m/dashboard route, and A-43 asserts BOTH halves — no tile and no route.
//
// THE HREFS ARE NOW /m ROUTES, per §4.13 (M-25 … M-30). They previously pointed
// at /dashboard/**, which was an INFERENCE the spec never ruled; §4.13 replaced
// it with real mobile screens, so the inference is moot.
//
// THESE SIX ROUTES 404 UNTIL §4.13 IS BUILT. Expected for this slice: the tile
// set, the ordering and the current-location highlight are shell concerns and
// are correct now; the screens behind them are the next slice. A tile pointing
// at its real future route is right; one pointing at a desktop page would have
// to be un-pointed later, and A-12c's principle is that a tile goes where it says.
// ---------------------------------------------------------------------------
const SHEET_TILES = [
  { href: '/m/schedule', label: 'Schedule', Icon: CalendarDays },
  { href: '/m/expenses', label: 'Expenses', Icon: Receipt },
  { href: '/m/subs', label: 'Subs & Vendors', Icon: Truck },
  { href: '/m/team', label: 'Team', Icon: Users, badgeKey: 'team' as const },
  { href: '/m/contacts', label: 'Contacts', Icon: Contact },
  { href: '/m/settings', label: 'Settings', Icon: Settings },
] as const;

// `initials()` lived here and is GONE with the avatar (D-36). The desktop shell
// keeps its own copy at dashboard-shell.tsx:84 — that one is still in use and is
// not this ruling's business (A-28).

/** `h:mm` — §4.4 spells the format out, and it is mono everywhere it appears. */
function hhmm(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * §3.2 — "the active tab always reflects the current screen" (A-1c).
 *
 * `/m/p/**` maps to PROJECTS, which is what A-1c names explicitly: "arriving at
 * /m/p/{id} by any path leaves Projects active". A project hub is somewhere you
 * got to THROUGH Projects, so the tab that owns it is Projects.
 *
 * Returns null on routes no tab owns (`/m/offline`, `/m/capture`). §3.2 does not
 * say what those should light up, and lighting up an unrelated tab would be a
 * lie about where you are — so nothing is active. Flagged.
 */
export function activeTabHref(pathname: string): string | null {
  if (pathname === '/m/projects' || pathname.startsWith('/m/projects/')) return '/m/projects';
  if (pathname === '/m/p' || pathname.startsWith('/m/p/')) return '/m/projects';
  for (const tab of TABS) {
    if (tab.href === '/m/projects') continue;
    if (pathname === tab.href || pathname.startsWith(`${tab.href}/`)) return tab.href;
  }
  return null;
}

/** §3.1 — "Inside a project, the hamburger is replaced by a back chevron." */
export function isInsideProject(pathname: string): boolean {
  return pathname.startsWith('/m/p/');
}

/** Fallback titles for screens that have not declared their own (see mobile-header.tsx). */
function defaultTitle(pathname: string): string {
  if (pathname.startsWith('/m/timeclock')) return 'Timeclock';
  if (pathname.startsWith('/m/projects')) return 'Projects';
  if (pathname.startsWith('/m/logs')) return 'Logs';
  if (pathname.startsWith('/m/field')) return 'Field';
  if (pathname.startsWith('/m/offline')) return 'Offline';
  if (pathname.startsWith('/m/p/')) return 'Project';
  return 'Field app';
}

export type MobileShellProps = {
  children: React.ReactNode;
  companyName: string;
  /** §3.3 — the Team tile's "(count)" badge. */
  teamCount: number | null;
};
// `userName` was a prop here and is GONE with the avatar (D-36) — it had no
// other consumer. The signed-in name is not lost: M-30 (§4.13.7) binds it to
// getMyMember(), which is the right source for it anyway.

export function MobileShell(props: MobileShellProps) {
  return (
    <MobileHeaderProvider>
      <MobileShellInner {...props} />
    </MobileHeaderProvider>
  );
}

function MobileShellInner({ children, companyName, teamCount }: MobileShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const declared = useMobileHeader();

  const insideProject = isInsideProject(pathname);
  const activeHref = activeTabHref(pathname);
  const title = declared?.title ?? defaultTitle(pathname);
  const sub = declared !== null ? declared.sub : companyName;

  // A route change must never leave the sheet hanging over the new screen.
  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  return (
    <div
      data-testid="m-shell"
      // h-[100dvh] + overflow-hidden, with the scrolling confined to <main>, is
      // what makes A-1's "does not scroll out of view" STRUCTURAL rather than a
      // z-index promise: the tab bar is a flex sibling of the scroll container,
      // so no amount of scrolling can move it. dvh (not vh) so mobile browser
      // chrome collapsing does not crop the bar.
      className="relative flex h-[100dvh] flex-col overflow-hidden bg-m6m-surface font-sans"
    >
      {/* ------------------------------------------------------------------ */}
      {/* §3.1 — APP BAR                                                      */}
      {/* ------------------------------------------------------------------ */}
      <header className="shrink-0 bg-m6m-navy">
        <div className="flex h-[58px] items-center gap-3 px-[18px]">
          {insideProject ? (
            // §3.1: "Inside a project, the hamburger is replaced by a back
            // chevron. Never both." The two are branches of one ternary
            // precisely so no future edit can render them side by side.
            <button
              type="button"
              data-testid="m-back"
              aria-label="Back"
              onClick={() => router.back()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] bg-white/[.13] text-white"
            >
              <ChevronLeft size={22} strokeWidth={2.5} aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              data-testid="m-hamburger"
              aria-label="Menu"
              aria-expanded={sheetOpen}
              aria-controls="m-nav-sheet"
              onClick={() => setSheetOpen((v) => !v)}
              // 44px square, rgba(255,255,255,.13) fill, 11px radius, three
              // 18x2px white bars — §3.1 to the pixel.
              className="flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-[3px] rounded-[11px] bg-white/[.13]"
            >
              <span className="block h-[2px] w-[18px] bg-white" />
              <span className="block h-[2px] w-[18px] bg-white" />
              <span className="block h-[2px] w-[18px] bg-white" />
            </button>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[19px] font-extrabold leading-tight text-white">
              {title}
            </h1>
            {sub ? (
              // §2: IBM Plex Mono for every micro-label. §2's muted-on-navy.
              <p className="truncate font-mono text-[11px] leading-tight text-m6m-muted-navy">
                {sub}
              </p>
            ) : null}
          </div>

          {/* §3.1 as amended — THE RIGHT SIDE IS EMPTY, BY RULING.
              D-36 [S100] CUT the 38px amber avatar outright: §3.1 gave it a size
              and never an action, which left it either a sub-44px tap target
              (A-5) or decoration spending the app bar's scarcest resource.
              Identity and sign-out already have homes — §3.3's Sign out row and
              M-30 (§4.13.7). Do NOT add anything here: A-40 asserts the app bar
              renders no right-hand element at all, and A-40b asserts the
              hamburger (or, inside a project, the back chevron) is its only
              interactive control. */}
        </div>

        <OfflineStrip />
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* CONTENT + SHEET HOST                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative min-h-0 flex-1">
        <main data-testid="m-content" className="h-full overflow-y-auto">
          {children}
        </main>

        {sheetOpen ? (
          <NavSheet
            pathname={pathname}
            teamCount={teamCount}
            onClose={() => setSheetOpen(false)}
          />
        ) : null}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* §3.2 — BOTTOM TAB BAR                                               */}
      {/* ------------------------------------------------------------------ */}
      {/* A-2 LIVES HERE. "With the hamburger sheet open, the tab bar is still
          visible AND tappable." The sheet and its scrim are rendered INSIDE the
          content region above, so they physically cannot cover this element —
          the guarantee is layout, not z-index. A stacking-order fix would work
          until someone added a transform or a new overlay; this cannot regress
          without moving the markup. */}
      <nav
        data-testid="m-tabbar"
        aria-label="Primary"
        className="flex shrink-0 items-start justify-between border-t border-m6m-border bg-m6m-card px-[14px] pt-[10px] pb-[14px]"
        style={{ paddingBottom: 'calc(14px + env(safe-area-inset-bottom))' }}
      >
        <TabItem {...TABS[0]} active={activeHref === TABS[0].href} />
        <TabItem {...TABS[1]} active={activeHref === TABS[1].href} />

        {/* §3.2 — the centre camera action. 66px amber circle, margin-top:-26px
            so it breaks the bar's top edge, 4px border IN THE BAR'S OWN
            BACKGROUND COLOUR (so the circle reads as punched through the bar,
            not ringed in white by accident), amber shadow, 30px navy glyph.

            It is a <button> and not a Link: §6's capture handling is explicitly
            not this slice, and /m/capture is not built. A link to a route that
            404s would be worse than a control that is present, correctly sized
            (A-5) and not yet wired. Flagged. */}
        <button
          type="button"
          data-testid="m-camera"
          aria-label="Camera"
          className="-mt-[26px] flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-full border-4 border-m6m-card bg-m6m-amber transition-transform duration-150 ease-out active:scale-95"
          style={{ boxShadow: '0 8px 20px rgba(245,158,11,.4)' }}
        >
          <Camera size={30} strokeWidth={2} className="text-m6m-navy" aria-hidden />
        </button>

        <TabItem {...TABS[2]} active={activeHref === TABS[2].href} />
        <TabItem {...TABS[3]} active={activeHref === TABS[3].href} />
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// §3.2 — a side tab. 23px stroke icon over an 11px Barlow label; active
// #2f49d1/700, inactive #8a919c/600. 56px target (§2's tab-bar item size).
// ---------------------------------------------------------------------------
function TabItem({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      data-testid={`m-tab-${label.toLowerCase()}`}
      aria-current={active ? 'page' : undefined}
      className={`flex h-[56px] min-w-[56px] flex-col items-center justify-center gap-[3px] rounded-lg transition-transform duration-150 ease-out active:scale-95 ${
        active ? 'text-m6m-blue' : 'text-m6m-muted'
      }`}
    >
      <Icon size={23} strokeWidth={active ? 2.4 : 2} aria-hidden />
      <span className={`text-[11px] leading-none ${active ? 'font-bold' : 'font-semibold'}`}>
        {label}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// §3.3 — M-1, the hamburger sheet.
// ---------------------------------------------------------------------------
function NavSheet({
  pathname,
  teamCount,
  onClose,
}: {
  pathname: string;
  teamCount: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/sign-in');
    router.refresh();
  }, [router]);

  return (
    <>
      {/* §3.3 — "Drops over a rgba(20,33,61,.5) scrim." The scrim spans the
          content region only; the tab bar is outside it (A-2). */}
      <button
        type="button"
        data-testid="m-sheet-scrim"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 z-30 bg-[rgba(20,33,61,.5)]"
      />

      <div
        id="m-nav-sheet"
        data-testid="m-nav-sheet"
        role="dialog"
        // NOT aria-modal. The tab bar behind this sheet stays operable by
        // design (§3.3, A-2), and aria-modal="true" would tell a screen reader
        // the opposite — that everything outside is inert.
        aria-modal="false"
        aria-label="Go to"
        className="absolute inset-x-0 top-0 z-40 max-h-full overflow-y-auto rounded-b-[18px] bg-m6m-surface p-[18px] shadow-lg motion-safe:animate-[m6mSheetDrop_140ms_ease-out]"
      >
        <p className="mb-3 font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
          GO TO
        </p>

        {/* 2-column grid of 76px tiles. */}
        <div data-testid="m-sheet-grid" className="grid grid-cols-2 gap-[10px]">
          {SHEET_TILES.map(({ href, label, Icon, ...rest }) => {
            // §3.3 — "Current location = 1.5px #2f49d1 border, label in blue."
            //
            // This CAN match now. The tiles point at /m routes (§4.13), so
            // opening the sheet on /m/expenses lights the Expenses tile and no
            // other — which is what makes A-3c assertable at all, and A-41 walks
            // all six. Until §4.13's screens are built the routes 404, so the
            // match is not yet reachable by navigation; the rule itself is right.
            //
            // Prefix-scoped, per §3.3: equal to the href, or the href plus '/'.
            // NOT startsWith(href) alone, which would light Schedule on a
            // hypothetical /m/schedulex.
            const current = pathname === href || pathname.startsWith(`${href}/`);
            const badge =
              'badgeKey' in rest && rest.badgeKey === 'team' && teamCount !== null
                ? String(teamCount)
                : null;

            return (
              <Link
                key={href}
                href={href}
                data-testid={`m-sheet-tile-${label}`}
                data-current={current ? 'true' : 'false'}
                aria-current={current ? 'page' : undefined}
                className={`relative flex h-[76px] flex-col justify-between rounded-[14px] bg-m6m-card p-[12px] transition-transform duration-150 ease-out active:scale-[.98] ${
                  current
                    ? 'border-[1.5px] border-m6m-blue'
                    : 'border border-m6m-border'
                }`}
              >
                <Icon size={20} strokeWidth={2} className="text-m6m-blue" aria-hidden />
                <span
                  className={`text-[15px] font-bold leading-none ${
                    current ? 'text-m6m-blue' : 'text-m6m-navy'
                  }`}
                >
                  {label}
                </span>
                {badge !== null ? (
                  // §2 — every number is mono, badges included.
                  <span
                    data-testid="m-sheet-badge"
                    className="absolute right-[10px] top-[10px] font-mono text-[11px] font-semibold text-m6m-muted"
                  >
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        {/* §3.3 — full-width Sign out row, 58px, #c0362c text, #f0d4d1 border. */}
        <button
          type="button"
          data-testid="m-sign-out"
          onClick={handleSignOut}
          disabled={signingOut}
          className="mt-[10px] flex h-[58px] w-full items-center justify-center rounded-[14px] border border-m6m-danger-border bg-m6m-card text-[15px] font-bold text-m6m-danger disabled:opacity-60"
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// §4.4 — THE APP-WIDE OFFLINE STRIP.
//
// "The status strip is app-wide — it renders on every mobile screen while
// offline, not only here." So it lives in the shell, under the app bar, and M-4
// is what it links to (A-14b).
//
// WHAT IS REAL HERE AND WHAT IS NOT. `navigator.onLine` plus the online/offline
// events is the whole detection mechanism, and it is genuine. The QUEUED COUNT
// is 0 because the queue does not exist in this slice — §5's queue is a later
// slice, stated in this slice's scope. It renders 0 rather than being omitted
// because §4.4 puts the pill in the strip unconditionally, and a strip that
// grows a new element later is a worse regression than one that starts at zero.
// `last synced` is likewise shell-local: it is the moment this tab last SAW the
// network, not the moment a sync last succeeded. Both become real when the
// queue lands. Flagged.
// ---------------------------------------------------------------------------
function OfflineStrip() {
  // Start ONLINE, always. navigator.onLine is not available during SSR, and
  // guessing offline would flash the strip on every first paint.
  const [offline, setOffline] = useState(false);
  const [lastOnline, setLastOnline] = useState<Date | null>(null);

  useEffect(() => {
    const sync = () => {
      const isOffline = !navigator.onLine;
      setOffline(isOffline);
      if (!isOffline) setLastOnline(new Date());
    };
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <Link
      href="/m/offline"
      data-testid="m-offline-strip"
      // >=44px so A-5 holds — §4.4 gives the strip colours but no height.
      className="flex min-h-[44px] w-full items-center gap-2 border-y border-m6m-strip-border bg-m6m-strip-bg px-[18px] py-[10px]"
    >
      <span
        aria-hidden
        className="h-[8px] w-[8px] shrink-0 rounded-full bg-m6m-amber"
      />
      <span className="flex-1 font-mono text-[11px] font-medium text-m6m-navy">
        Offline · last synced {lastOnline ? hhmm(lastOnline) : '—'}
      </span>
      <span
        data-testid="m-queued-pill"
        className="shrink-0 rounded-full bg-m6m-amber/20 px-[8px] py-[2px] font-mono text-[11px] font-semibold text-m6m-navy"
      >
        0 queued
      </span>
    </Link>
  );
}
