'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useTransition } from 'react';

/**
 * S127 P-2 — feedback on navigation STARTED BY CODE (after a save, a clock-out,
 * a switch). [S125 findings 1–2; RULED Josh: "near instant is important … we
 * don't have time or patience to wait for software to load while in the field".]
 *
 * ⚠️ NOT `loading.tsx` — S112 R2 stands: a loading boundary makes every page
 * under it stream (`notFound()` → 200, server `redirect()` → client-side; 6 CI
 * reds). The fix is the two halves that were missing:
 *
 *   1. the BAR — `NavPending` only heard <Link> taps; `router.push()` from code
 *      showed nothing. `signalNavigationStart()` raises it;
 *   2. the BUTTON — screens cleared their busy state BEFORE the next screen
 *      arrived, so the old screen sat live and frozen (and a second tap landed
 *      on it). `isPending` from the transition below stays true until the new
 *      screen has rendered.
 */
export const NAV_START_EVENT = 'ff:nav-start';

export function signalNavigationStart(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NAV_START_EVENT));
}

export function usePendingNavigation(): {
  /** Push (or refresh), raise the bar, and stay pending until the screen lands. */
  navigate: (href: string | null, opts?: { refresh?: boolean }) => void;
  isPending: boolean;
} {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const navigate = useCallback(
    (href: string | null, opts?: { refresh?: boolean }) => {
      // The BAR only for a route change — it clears on the new path, and a
      // refresh-only re-render never changes the path. The BUTTON (isPending)
      // covers both.
      if (href) signalNavigationStart();
      startTransition(() => {
        if (href) router.push(href);
        if (opts?.refresh ?? true) router.refresh();
      });
    },
    [router]
  );
  return { navigate, isPending };
}
