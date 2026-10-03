'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV_START_EVENT } from '@/lib/navigation/pending-navigation';

// S112 R2 (audit F1) — THE navigation feedback. RULED [Josh, S112, second
// ruling]: "drop loading.tsx, keep the pending bar. It measured 20/20 within
// 17 ms on its own ... A missing page returning 200 is wrong, and the 6 red
// tests are the guard doing its job. Never trade a proven behaviour for a
// redundant mechanism."
//
// ⚠️ DO NOT ADD loading.tsx (app/m OR app/dashboard). A loading boundary makes
// every page under it STREAM, so the status is sent before the page runs:
// notFound() renders inside a 200, a server redirect() turns client-side. CI
// run 36246627024 went 6 red on exactly that.
//
// It listens at the document for a tap on any same-origin link under `prefix`
// and shows a bar until the route actually changes. It never navigates or
// cancels anything — it only reflects that navigation began.
//
// [S127 P-2] MOVED here from app/m/nav-pending.tsx (which re-exports it) so the
// DASHBOARD gets the same bar (finding 2: "Dashboard and portal have no
// navigation feedback at all") — one mechanism, two mounts (PARITY).
// [S127 P-2] SUPERSEDED: "Not covered, deliberately: router.push() from code.
// Those are after a write … and each of those screens already shows its own
// busy state." They did not keep it: the busy state cleared BEFORE the next
// screen arrived (S125 G-3/G-4). Code navigation now raises the bar through
// `signalNavigationStart()` (lib/navigation/pending-navigation.ts).

/** Cleared by the route change; this only bounds a navigation that never lands. */
const GIVE_UP_MS = 15_000;

export function NavPending({
  prefix = '/m',
  placement = 'absolute',
  testId = 'm-nav-pending',
}: {
  prefix?: string;
  placement?: 'absolute' | 'fixed';
  testId?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);

  // The route changed — the new screen is on screen.
  useEffect(() => {
    setPending(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as Element | null;
      const a = target?.closest?.('a');
      if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
      // A control nested INSIDE the link (e.g. "show original" in a /m/logs row)
      // handles its own tap and does not navigate.
      const control = target?.closest?.('button, input, select, textarea, label, [role="button"]');
      if (control && a.contains(control)) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith(prefix)) return;
      // Same screen (a hash, or a link to where you already are) never lands a
      // route change, so it must never raise the bar.
      if (url.pathname === window.location.pathname && url.search === window.location.search)
        return;
      setPending(true);
    }
    // CAPTURE phase, and defaultPrevented is deliberately NOT consulted: next/link
    // calls preventDefault() on every client-side navigation, and React's
    // handler runs before a bubble-phase document listener — so a bubble
    // listener sees every real navigation as "cancelled". Measured: the first
    // build of this component raised the bar on 0 of 4 punch-row taps.
    document.addEventListener('click', onClick, true);
    // [S127 P-2] Navigation started from code.
    const onCode = () => setPending(true);
    window.addEventListener(NAV_START_EVENT, onCode);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener(NAV_START_EVENT, onCode);
    };
  }, [prefix]);

  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setPending(false), GIVE_UP_MS);
    return () => window.clearTimeout(t);
  }, [pending]);

  if (!pending) return null;
  return (
    <div
      data-testid={testId}
      role="progressbar"
      aria-busy="true"
      aria-label="…"
      className={`pointer-events-none ${placement} inset-x-0 top-0 z-30 h-[3px] overflow-hidden`}
    >
      <div className="h-full w-full animate-pulse bg-m6m-blue" />
    </div>
  );
}
