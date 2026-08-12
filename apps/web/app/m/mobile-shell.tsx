'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ClipboardList,
  Contact,
  Folder,
  Images,
  HardHat,
  MessageSquare,
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
import { NotificationBell } from '@/components/notifications/notification-bell';
import { OfflineSyncProvider, useOfflineSync } from './offline-sync';
import { CaptureStoreProvider, projectInContext, useCaptureStore } from './capture-store';
import { MobileChatOverlay } from '@/components/chat/mobile-chat-overlay';

// M6M §3 — THE MOBILE SHELL.
//
// One client component owns all four pieces §1 lists for layout.tsx: the app
// bar (§3.1), the bottom tab bar (§3.2), the hamburger sheet host (§3.3) and
// the app-wide offline strip (§4.4). They are together because three of them
// share one piece of state — whether the sheet is open — and because the
// LAYERING between them is the specified behaviour, not an implementation
// detail (see A-2 below).

// ---------------------------------------------------------------------------
// §3.2 — the five tab slots. ⚠️ AMENDED [ND-36, S126 slice 5].
//
// _Superseded, quoted not rewritten: "Order is Projects · Timeclock · [camera]
// · Logs · Field"._
//
//     BEFORE   Projects · Timeclock · [camera] · Logs · Field
//     AFTER    Projects · Timeclock · [camera] · Chat · Field
//
// The bar stays at FIVE, so ND-14's arithmetic is untouched — no envelope
// shrinks and the camera keeps a true centre. D-3's "no destination appears in
// both" also holds, because Logs LEAVES the bar as Chat ARRIVES: the rule is
// preserved by the swap rather than excepted.
//
// ⚠️ CHAT IS NOT IN THIS LIST BECAUSE IT IS NOT A LINK. It owns no route
// (ND-37) — it opens an overlay over the current screen — so it is rendered
// separately, like the camera, and for the same reason: a slot with no href
// cannot be a `<Link>` and has no route-derived active state.
//
// The cost of demoting Logs is stated in §7.1d-i rather than buried: the
// project screen's "Log the day" entry is UNTOUCHED, and the one on /m/logs now
// costs hamburger → Logs → button.
// ---------------------------------------------------------------------------
const TABS = [
  { href: '/m/projects', label: 'Projects', Icon: Folder },
  { href: '/m/timeclock', label: 'Timeclock', Icon: Timer },
  { href: '/m/field', label: 'Field', Icon: HardHat },
] as const;

// ---------------------------------------------------------------------------
// §3.3 — the SEVEN sheet tiles. ⚠️ AMENDED [ND-36, S126 slice 5].
//
// _Superseded, quoted not rewritten: "the SIX sheet tiles, in the spec's order,
// and nothing else. Projects, Timeclock, Logs and Field are ABSENT BY RULE …
// A-3 fails if any of them appears."_
//
// ⚠️ LOGS IS NOW HERE, AND M6M A-3 WAS REWRITTEN TO SAY SO. The old rule read
// "no tile for Projects, Timeclock, LOGS, or Field", so moving Logs into the
// sheet made that criterion FALSE BY DESIGN — not an off-by-one but a direct
// inversion, and the single worst item in §14's list. Projects, Timeclock and
// Field remain absent by rule, because the bar still owns those three.
//
// LOGS IS FIRST, and that placement is a judgement: §3.3 never ordered a
// seventh tile, and Logs is the one destination here that a foreman reaches
// daily. Putting it first minimises the hunt that §7.1d-i already concedes the
// swap costs. Everything else keeps its ruled order.
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
  { href: '/m/logs', label: 'Logs', Icon: ClipboardList },
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
/**
 * ⚠️ `/m/logs` NOW RETURNS null, AND THAT IS A-C33.
 *
 * The Logs slot left the bar (ND-36), so no tab owns that route any more. The
 * criterion — "on /m/logs the tab bar renders and NO slot carries the active
 * state" — therefore holds by the same mechanism `/m/offline` and `/m/capture`
 * already used, rather than by a special case. M6M A-42 was rewritten from six
 * routes to seven for the same reason.
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

/**
 * Detail routes that hang off a HAMBURGER destination rather than a project.
 *
 * Exactly the two in §1's table — `contacts/[contactId]` (M-36) and
 * `team/[memberId]` (M-35). Listed explicitly rather than inferred from "has a
 * path segment that looks like an id", because the capture screens
 * (`/m/logs/new`, `/m/timeclock/switch`) are the same shape and are NOT detail
 * views — they own their own chrome and their own exits.
 */
const COMPANY_DETAIL_PREFIXES = ['/m/contacts/', '/m/team/', '/m/subs/', '/m/logs/'];

/**
 * The capture screens, which live at the SAME depth and are NOT detail views.
 *
 * `/m/logs/new` is why this list exists rather than being a comment. Adding
 * '/m/logs/' above to give M-37 (`/m/logs/{logId}`) its chevron would otherwise
 * catch M-21 too, and §4.12's capture screens were ruled to own their own
 * chrome and their own exits — a chevron there would be a second exit competing
 * with the form's own.
 *
 * `/m/timeclock/switch` matches no prefix above and so needs no exclusion. It
 * is listed anyway, because the RULE is "capture screens are not detail views"
 * and a reader adding '/m/timeclock/' later must find the exception already
 * stated rather than rediscover it from a bug.
 *
 * ⚠️ FLAGGED, NOT FIXED [S121]: `/m/logs/new` has no exit at all before it is
 * submitted — no chevron by this rule, and the form offers no cancel. That is
 * the same class of defect 295c6b5 fixed for the detail views, on a screen that
 * ruling did not cover. It is left alone here because it is a capture-chrome
 * question, not a detail-view one, and inventing an answer would pre-empt it.
 */
const CAPTURE_SCREENS = ['/m/logs/new', '/m/timeclock/switch'];

/**
 * §3.1 — "Inside a project, the hamburger is replaced by a back chevron."
 *
 * ⚠️ RENAMED FROM `isInsideProject` [S120], AND THE RENAME IS THE FIX.
 *
 * The old name transcribed §3.1's sentence literally, so the implementation was
 * `startsWith('/m/p/')` and every screen outside a project got the hamburger.
 * That is right for a top-level destination and WRONG for a detail view:
 * `/m/contacts/{id}` and `/m/team/{id}` (M-36, M-35) are drilled into from a
 * list, and they shipped with no way back at all. Found on a phone [S120,
 * Josh] — the tab bar leaves the section entirely and a standalone-display PWA
 * has no browser back gesture, so the user was simply stranded.
 *
 * **The rule the user experiences is DEPTH, not project-ness.** A screen you
 * drilled into needs a way back; a destination you picked from the sheet does
 * not. `/m/p/` happened to be the only depth that existed when §3.1 was
 * written, which is why the two readings agreed until M-35 and M-36 landed.
 *
 * The name now states the rule it implements, so the next detail route added
 * outside `/m/p/` has an obvious place to declare itself.
 */
export function showsBackChevron(pathname: string): boolean {
  // The capture screens first, because they sit at detail depth and the depth
  // test below would otherwise claim them. Checked before the project branch
  // too, so a future capture screen under /m/p/ is covered by adding one entry.
  if (CAPTURE_SCREENS.includes(pathname)) return false;

  // Everything inside a project — §3.1's original case, unchanged.
  if (pathname.startsWith('/m/p/')) return true;

  // The company-scoped DETAIL routes. The trailing slash and the length check
  // together are what keep this a depth test rather than a prefix test: the
  // LIST at `/m/contacts` must keep its hamburger (it is a sheet destination),
  // while `/m/contacts/{id}` must not.
  return COMPANY_DETAIL_PREFIXES.some(
    (prefix) => pathname.startsWith(prefix) && pathname.length > prefix.length
  );
}


/**
 * §4.9 / §4.10 — M-9 and M-10 RUN ON THE DARK CANVAS AND OWN THEIR OWN CHROME.
 *
 * These are the two screens the shell steps back from entirely:
 *
 *   §3.2  "On the dark photo screens (M-9, M-10) the bar is REPLACED BY THAT
 *          SCREEN'S OWN ACTION ROW" — the 4-up Save/Share/Comment/Delete row on
 *          M-9, the Undo/Redo/Done row on M-10 (A-1, A-1b).
 *   §4.9  its header is a close ✕, the filename with `3 of 34` beneath, and a ⋮
 *          overflow — not §3.1's hamburger-or-chevron app bar.
 *   §4.10 the same, with Cancel / "Markup" / Save.
 *
 * So the shell renders NEITHER bar here. It is a route test rather than a prop
 * because layout.tsx is a server component and the shell is where pathname
 * lives; A-1b asserts the replacement on both screens.
 *
 * M-8 is NOT chromeless — §4.8 ends "Tab bar present, Projects active" — hence
 * the trailing segment: `/photos` alone is the gallery, `/photos/{fileId}` and
 * below are the dark screens.
 */
export function isDarkCanvasScreen(pathname: string): boolean {
  return /^\/m\/p\/[^/]+\/photos\/[^/]+/.test(pathname);
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
  /** ND-13 — the app-bar bell's unread count. 0 renders no badge (A-N44). */
  unreadCount: number;
  /** ND-37 — the chat overlay needs the caller's PROFILE id, not their user id. */
  myProfileId: string;
};
// `userName` was a prop here and is GONE with the avatar (D-36) — it had no
// other consumer. The signed-in name is not lost: M-30 (§4.13.7) binds it to
// getMyMember(), which is the right source for it anyway.

export function MobileShell(props: MobileShellProps) {
  return (
    <MobileHeaderProvider>
      {/* §5 — one queue per tab, hosted above every mobile screen so the
          strip's pill, M-4's list and the capture screens share one truth. */}
      <OfflineSyncProvider>
        {/* §6 — the shot is held here between the shutter and /m/capture.
            Above the shell because the tab bar writes it and a page reads it. */}
        <CaptureStoreProvider>
          <MobileShellInner {...props} />
        </CaptureStoreProvider>
      </OfflineSyncProvider>
    </MobileHeaderProvider>
  );
}

function MobileShellInner({
  children,
  companyName,
  teamCount,
  unreadCount,
  myProfileId,
}: MobileShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  /**
   * ND-37 — the Chat overlay. The Chat slot's active state IS this boolean,
   * never the route underneath (A-C34).
   */
  const [chatOpen, setChatOpen] = useState(false);
  const declared = useMobileHeader();
  const capture = useCaptureStore();

  /**
   * §6 — everything AFTER the shutter. Runs only once a file exists, which is
   * what keeps A-21c2 true: no navigation happens on the tap itself.
   *
   * The project in context is read HERE, at capture time, from the screen the
   * user was on. Reading it later on /m/capture would be wrong — by then the
   * pathname is `/m/capture` and the context is gone.
   */
  const onShot = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Allows re-picking the same file twice; without it the second change
      // event never fires.
      e.target.value = '';
      if (!file || !capture) return;

      const search = new URLSearchParams(
        typeof window === 'undefined' ? '' : window.location.search
      );
      capture.hold(file, projectInContext(pathname, search));
      router.push('/m/capture');
    },
    [capture, pathname, router]
  );

  /**
   * ND-40 / A-C42 — `?chat=1` opens the overlay on arrival.
   *
   * This is the whole of the mobile deep link: a mention resolves to
   * `/m/p/{id}?chat=1`, the project screen loads, and the overlay opens over it
   * already showing that project's thread. No `/m/p/{id}/chat` route exists and
   * none may — a thin route "just for the link" would make ND-37 half-true.
   *
   * Read once, on mount. Re-reading on every search change would re-open the
   * overlay after the user closed it without navigating away.
   */
  useEffect(() => {
    if (searchParams?.get('chat') === '1') setChatOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const insideProject = showsBackChevron(pathname);
  const activeHref = activeTabHref(pathname);
  const title = declared?.title ?? defaultTitle(pathname);
  const sub = declared !== null ? declared.sub : companyName;
  const darkCanvas = isDarkCanvasScreen(pathname);

  // A route change must never leave the sheet hanging over the new screen.
  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  // -------------------------------------------------------------------------
  // §4.9 / §4.10 — the dark photo screens. No app bar, no tab bar; the screen
  // supplies both (A-1, A-1b).
  //
  // THE OFFLINE STRIP STAYS. §4.4 is explicit that it "renders on every mobile
  // screen while offline, not only [on M-4]" — app-wide means these two as
  // well. Dropping it here would trade a specified guarantee for a cleaner
  // photo, and a field user who has gone offline mid-markup is exactly who
  // needs to know.
  // -------------------------------------------------------------------------
  if (darkCanvas) {
    return (
      <div
        data-testid="m-shell"
        data-chrome="dark"
        className="flex h-[100dvh] flex-col overflow-hidden bg-m6m-canvas font-sans"
      >
        <OfflineStrip />
        <main data-testid="m-content" className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    );
  }

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

          {/* §3.1 as amended [S123, notifications ND-13] — THE RIGHT SLOT HOLDS
              THE NOTIFICATIONS BELL, and nothing else, ever.

              _Superseded comment, quoted not deleted:_ "THE RIGHT SIDE IS EMPTY,
              BY RULING. […] Do NOT add anything here: A-40 asserts the app bar
              renders no right-hand element at all."

              D-36 [S100] cut the 38px amber avatar for two reasons: it had NO
              ACTION, and 38px sat under §2's 44px floor. THE BELL FAILS NEITHER
              — one unambiguous action (open the notifications list) at 44px. So
              this is not D-36 being reversed; D-36 ruled out a control with no
              action and a sub-floor target, not the existence of a right slot.

              WHY THE BELL IS HERE AND NOT A SIXTH TAB. Josh ruled a six-slot
              bottom bar and then REVERSED it on the arithmetic: at 402px the
              bar's inner width is 374px, so a sixth slot cuts each side item's
              envelope from 77.0px to 61.6px while "Notifications" needs ~70px at
              11px Barlow — and five side items plus the centre camera has no
              true centre, so the camera's -26px break would read as a mistake.
              D-3 stands; the bottom bar below is untouched (A-40c).

              A-40 as rewritten: no right-hand element OTHER than the bell, and
              the bell measures >=44px. A-40b as rewritten: exactly two
              interactive controls, one per side — which is what catches both a
              restored avatar and a bell that quietly becomes a menu. */}
          <NotificationBell count={unreadCount} />
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

        {/* ND-37 — the chat overlay, rendered INSIDE the content region so it
            physically cannot cover the tab bar below (A-C35, M6M A-1). Same
            technique as the sheet above, and for the same reason: the guarantee
            is layout, not z-index. */}
        <MobileChatOverlay
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          myProfileId={myProfileId}
          projectId={projectFromPath(pathname)}
        />
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

        {/* §3.2 — the centre camera action, and §6's camera-first rule.

            ⚠️ IT IS A FILE INPUT, NOT A LINK, AND THAT IS A-21c2.
            "The tab-bar camera control navigates nowhere — it is a file input,
            and /m/capture is entered only AFTER the shutter." A build that
            routes to /m/capture first puts a navigation between the tap and the
            camera, which breaks A-20's "opens the camera directly". The label
            keeps the 66px amber circle exactly as §3.2 specifies; the input
            inside it is hidden and carries `capture="environment"`, which is
            what makes the phone open the CAMERA rather than a picker.

            The library control beside it is §6's "small secondary control to
            switch to the photo library" — the same input WITHOUT `capture`.
            Both live in this one flex slot so the bar keeps its five
            justify-between children and the circle keeps its measured geometry
            (66px, breaking the bar's top edge — asserted by m-shell). */}
        <div className="flex shrink-0 items-start gap-[6px]">
          <label
            data-testid="m-camera"
            aria-label="Camera"
            className="-mt-[26px] flex h-[66px] w-[66px] shrink-0 cursor-pointer items-center justify-center rounded-full border-4 border-m6m-card bg-m6m-amber transition-transform duration-150 ease-out active:scale-95"
            style={{ boxShadow: '0 8px 20px rgba(245,158,11,.4)' }}
          >
            <input
              type="file"
              accept="image/*"
              capture="environment"
              data-testid="m-camera-input"
              className="hidden"
              onChange={onShot}
            />
            <Camera size={30} strokeWidth={2} className="text-m6m-navy" aria-hidden />
          </label>

          <label
            data-testid="m-camera-library"
            aria-label="Photo library"
            className="mt-[2px] flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-[11px] border border-m6m-border bg-m6m-card"
          >
            <input
              type="file"
              accept="image/*"
              data-testid="m-camera-library-input"
              className="hidden"
              onChange={onShot}
            />
            <Images size={18} strokeWidth={2} className="text-m6m-muted" aria-hidden />
          </label>
        </div>

        {/* ND-36/ND-37 — the Chat slot. A BUTTON, not a Link: it owns no
            route and opens an overlay over the current screen.

            ⚠️ A-C34 — IT IS LIT ONLY WHILE THE OVERLAY IS OPEN, AND NEVER BY
            THE ROUTE UNDERNEATH. M6M A-1c ("the active tab reflects the current
            screen") assumes every slot owns a route; this one owns none, so
            A-1c was REWRITTEN rather than satisfied. A build that lights Chat
            because the user happens to be on a project misstates where they
            are — the same defect A-42 exists to prevent one level up. */}
        <ChatTabItem active={chatOpen} onClick={() => setChatOpen((v) => !v)} />
        <TabItem {...TABS[2]} active={activeHref === TABS[2].href} />
      </nav>
    </div>
  );
}

/**
 * The project the overlay should open into, or null.
 *
 * ND-40's link lands on `/m/p/{id}`, and §5.6c is explicit that the one shape
 * the recipient of "@Josh needs you on Alvarez" must NOT get is a list they
 * have to search. Anywhere else, the overlay opens on the switcher.
 */
function projectFromPath(pathname: string): string | null {
  const m = /^\/m\/p\/([^/]+)/.exec(pathname);
  return m ? m[1] : null;
}

/**
 * The Chat slot — ND-36, ND-37.
 *
 * A `<button>`, not a `<Link>`, because it owns no route. Its geometry matches
 * TabItem exactly (56px target, 23px icon, 11px label) so the bar's five slots
 * stay measurably identical — ND-14's arithmetic depends on it.
 */
function ChatTabItem({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="m-tab-chat"
      data-active={active}
      aria-pressed={active}
      aria-label="Chat"
      onClick={onClick}
      className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-[3px] border-none bg-transparent p-0"
    >
      <MessageSquare
        size={23}
        strokeWidth={2}
        className={active ? 'text-m6m-primary' : 'text-m6m-muted'}
        aria-hidden
      />
      <span
        className={
          active
            ? 'text-[11px] font-bold text-m6m-primary'
            : 'text-[11px] font-semibold text-m6m-muted'
        }
      >
        Chat
      </span>
    </button>
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
// THE QUEUED COUNT IS LIVE — §5's queue feeds it, and A-18 pins its meaning:
// entries at state:'queued' ONLY, the records and files that will actually
// upload. A conflicted entry has left the queue and is EXCLUDED — counting it
// would promise an upload that will never happen. `last synced` remains the
// moment this tab last saw the network. Flagged.
// ---------------------------------------------------------------------------
function OfflineStrip() {
  // Start ONLINE, always. navigator.onLine is not available during SSR, and
  // guessing offline would flash the strip on every first paint.
  const [offline, setOffline] = useState(false);
  const [lastOnline, setLastOnline] = useState<Date | null>(null);
  const offlineSync = useOfflineSync();
  const queuedCount = offlineSync?.queuedCount ?? 0;

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
        {queuedCount} queued
      </span>
    </Link>
  );
}
