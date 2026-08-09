'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';

/**
 * The app-bar bell. ND-13 as amended [S123, Josh]; M6M §3.1, A-40/A-40b/A-40c.
 *
 * ---------------------------------------------------------------------------
 * IT IS A LINK, NOT A MENU. THAT IS ASSERTED, NOT ASSUMED.
 * ---------------------------------------------------------------------------
 * One action: go to /m/notifications. No popover, no dropdown, no preview list.
 *
 * M6M A-40b asserts the app bar holds EXACTLY TWO interactive controls — one
 * left (hamburger XOR back chevron) and this one. The edit D-36 was written to
 * prevent was "restore the avatar as a menu button"; with a right slot now
 * legitimately occupied, that edit comes back either as a THIRD control or as a
 * bell that opens a menu instead of navigating. An exact count of two catches
 * the first; A-N45 ("tapping the bell navigates and opens no menu") catches the
 * second.
 *
 * ---------------------------------------------------------------------------
 * 44px IS THE WHOLE REASON THIS IS ALLOWED TO EXIST
 * ---------------------------------------------------------------------------
 * D-36 cut the avatar partly because 38px is under §2's 44px floor, which only
 * the markup colour swatches are exempt from (A-5). `h-11 w-11` is 44px in this
 * Tailwind scale. Do not shrink it to fit a longer title — the title block
 * truncates, and that is what `min-w-0 flex-1` on the title is for.
 *
 * ---------------------------------------------------------------------------
 * THE BADGE SHOWS NOTHING AT ZERO
 * ---------------------------------------------------------------------------
 * A-N44. An always-present "0" is noise that trains people to ignore the bell,
 * and it passes any "the badge exists" assertion — which is why the criterion
 * tests all three states (absent at 0, a count at >=1, capped at 9+).
 */
export function NotificationBell({
  count,
  href = '/m/notifications',
}: {
  count: number;
  href?: string;
}) {
  const showBadge = count > 0;
  const label = showBadge ? `Notifications, ${count} unread` : 'Notifications';

  return (
    <Link
      href={href}
      data-testid="m-bell"
      aria-label={label}
      // 44px square — §2's floor, the exact test the 38px avatar failed.
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] bg-white/[.13] text-white"
    >
      <Bell size={22} strokeWidth={2.5} aria-hidden />
      {showBadge && (
        <span
          data-testid="m-bell-badge"
          // Sits on the icon, not in the layout flow, so the bell's own tap
          // target stays exactly 44px whatever the badge says.
          className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-m6m-amber px-1 text-center font-mono text-[11px] font-bold leading-[18px] text-m6m-navy"
        >
          {/* §2: every number is mono, badges included. */}
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
