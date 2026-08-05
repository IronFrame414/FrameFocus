'use client';

import { useEffect } from 'react';

// M6M §4.13.2 — "today first, then ascending, with past days reachable by
// scrolling up."
//
// The DOM order puts past days ABOVE today, because that is what "reachable by
// scrolling up" means and A-44d asserts it. But rendering that order alone would
// open the screen on last month, which is the opposite of "today first". This
// closes the gap: the document order stays past → today → future, and the
// viewport starts at today.
//
// The ONLY client component in the four §4.13 screens built in this slice, and
// it exists for exactly this. It reads nothing and renders nothing.
export function ScrollToToday() {
  useEffect(() => {
    const anchor = document.getElementById('m-today');
    if (!anchor) return;
    // 'auto', not 'smooth': this is the initial position, not a transition, and
    // an animated scroll on mount reads as the page moving under the user.
    anchor.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, []);

  return null;
}
