'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

// S112 R2 (audit F1) — THE navigation feedback on /m. RULED [Josh, S112,
// second ruling]: "drop loading.tsx, keep the pending bar. It measured 20/20
// within 17 ms on its own ... A missing page returning 200 is wrong, and the 6
// red tests are the guard doing its job. Never trade a proven behaviour for a
// redundant mechanism."
//
// ⚠️ DO NOT ADD app/m/loading.tsx. A loading boundary makes every page under
// it STREAM, so the status is sent before the page runs: notFound() renders
// inside a 200, a server redirect() turns client-side. CI run 36246627024 went
// 6 red on exactly that (A-43 /m/dashboard, missing sub/log/chat 404s, the
// capture redirect, hydration). Bar alone, same harness: 20/20, 13–16 ms.
//
// History, as first built: app/m/loading.tsx fires when the first segment under /m changes,
// and measured with the next screen's RSC payload held 3s it took 16 of 20
// taps from dead to a skeleton in ~32ms. The other 4 — a punch row opening its
// item, a navigation that stays inside one project — kept the old screen,
// unchanged, for 3.4s: the boundary above them does not remount.
//
// So this listens at the document for a tap on any same-origin /m link and
// shows a bar under the app bar until the route actually changes. It covers
// every <Link> in the shell without touching the 49 pages, and it never
// navigates or cancels anything — it only reflects that navigation began.
//
// Not covered, deliberately: router.push() from code. Those are after a
// write (save, submit), and each of those screens already shows its own busy
// state on the button that caused it.

/** Cleared by the route change; this only bounds a navigation that never lands. */
const GIVE_UP_MS = 15_000;

export function NavPending() {
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
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/m')) return;
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
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setPending(false), GIVE_UP_MS);
    return () => window.clearTimeout(t);
  }, [pending]);

  if (!pending) return null;
  return (
    <div
      data-testid="m-nav-pending"
      role="progressbar"
      aria-busy="true"
      aria-label="…"
      className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[3px] overflow-hidden"
    >
      <div className="h-full w-full animate-pulse bg-m6m-blue" />
    </div>
  );
}
