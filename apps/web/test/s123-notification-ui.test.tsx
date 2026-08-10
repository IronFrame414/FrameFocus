import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NotificationBell } from '@/components/notifications/notification-bell';

// ============================================================================
// ND-13 — the app-bar bell. A-N41, A-N44, A-N45; M6M A-40, A-40b, A-40c.
// ============================================================================
//
// Rendered to static markup, the same technique s97ct-roles.live.ts uses to
// execute a client component's gates without a browser. The Playwright criteria
// (A-N41 measuring >=44px on a real layout) are release checks; these assert the
// rules that can be decided from the markup alone.

function markup(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe('A-N44 — the badge shows nothing at zero', () => {
  it('renders NO badge at 0', () => {
    // An always-present "0" is noise that trains people to ignore the bell, and
    // it passes any "the badge exists" assertion — which is why this criterion
    // tests all three states rather than just the happy one.
    const html = markup(<NotificationBell count={0} />);
    expect(html).not.toContain('m-bell-badge');
  });

  it('renders a count at 1 and above', () => {
    expect(markup(<NotificationBell count={1} />)).toContain('m-bell-badge');
    expect(markup(<NotificationBell count={7} />)).toContain('>7<');
  });

  it('caps at 9+', () => {
    expect(markup(<NotificationBell count={10} />)).toContain('9+');
    expect(markup(<NotificationBell count={250} />)).toContain('9+');
    // Not "250" spilling out of a 44px control.
    expect(markup(<NotificationBell count={250} />)).not.toContain('>250<');
  });

  it('the accessible name carries the count, so the badge is not the only signal', () => {
    expect(markup(<NotificationBell count={3} />)).toContain('Notifications, 3 unread');
    expect(markup(<NotificationBell count={0} />)).toContain('aria-label="Notifications"');
  });
});

describe('A-N45 / A-N41 — one action, and the 44px floor', () => {
  it('is an anchor to the notifications route, not a button or a menu', () => {
    // The D-36 edit in new clothing is "a bell that is secretly an avatar menu".
    // An <a href> cannot open a popover, which is the cheapest possible way to
    // make that regression impossible rather than merely tested.
    const html = markup(<NotificationBell count={2} />);
    expect(html).toContain('href="/m/notifications"');
    expect(html).toContain('<a');
    expect(html).not.toContain('aria-haspopup');
    expect(html).not.toContain('<button');
  });

  it('carries the 44px classes — the exact floor the 38px avatar failed', () => {
    // D-36 cut the avatar partly because 38px is under §2's 44px floor, which
    // only the markup colour swatches are exempt from (A-5). h-11/w-11 is 44px
    // in this scale. Playwright measures the real box (A-N41); this pins the
    // intent so a "make it smaller to fit the title" edit fails here first.
    const html = markup(<NotificationBell count={0} />);
    expect(html).toContain('h-11');
    expect(html).toContain('w-11');
  });

  it('the badge is absolutely positioned, so the tap target stays 44px', () => {
    // A badge in the layout flow would widen the control past 44px in one
    // direction and squeeze the app bar's scarcest resource — horizontal room
    // at 402px, which is what D-36 spent the avatar for.
    expect(markup(<NotificationBell count={9} />)).toContain('absolute');
  });
});

describe('M6M A-40 / A-40b / A-40c — what the shell may and may not carry', () => {
  const shell = readFileSync(
    fileURLToPath(new URL('../app/m/mobile-shell.tsx', import.meta.url)),
    'utf8'
  );

  /**
   * Comments stripped before any absence assertion.
   *
   * This file's own first run is the reason. `expect(shell).not.toContain('initials(')`
   * failed against the COMMENT that records the avatar's removal — "`initials()`
   * lived here and is GONE with the avatar (D-36)". The code was correct; the
   * assertion was reading prose. An absence assertion over a heavily-commented
   * file has to look at code or it tests the documentation.
   */
  const code = shell
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('A-40 the app bar renders the bell and no other right-hand element', () => {
    expect(code).toContain('<NotificationBell');
    // The avatar D-36 cut, and the helper that fed it, must stay gone from the
    // CODE — both are still named in comments on purpose, which is why `code`
    // and not `shell` is asserted here.
    expect(code).not.toContain('initials(');
    expect(code).not.toContain('userName');
  });

  it('A-40b the left slot is still hamburger XOR chevron, never both', () => {
    // The exclusivity is structural — one ternary — and that is what stops a
    // future edit rendering them side by side. Asserting the ternary is
    // asserting the guarantee, not the styling.
    expect(shell).toContain('insideProject ?');
    expect(shell).toContain('data-testid="m-back"');
    expect(shell).toContain('data-testid="m-hamburger"');
  });

  it('A-40c the bottom bar still has exactly five slots with the camera centred', () => {
    // THE REVERSAL GUARD. Josh ruled six slots and then reversed it on the
    // arithmetic; a later reader is exactly the person who undoes that by
    // accident, and the reversal's whole justification was protecting this bar.
    //
    // Scoped to the TABS array specifically. A whole-file regex for
    // `{ href: '/m/…', label: …, Icon: … }` matched 9 — the 4 tabs PLUS 5 of the
    // 6 SHEET_TILES, which share the shape exactly. That would have passed while
    // counting the wrong thing, and gone on passing if a tab were added and a
    // sheet tile removed.
    const tabsBlock = /const TABS = \[([\s\S]*?)\] as const;/.exec(shell);
    expect(tabsBlock, 'TABS array not found').not.toBeNull();
    const tabs = tabsBlock![1].match(/\{ href: '\/m\//g) ?? [];
    expect(tabs).toHaveLength(4); // 4 side items + the camera = 5 slots.
    expect(shell).toContain('TABS[0]');
    expect(shell).toContain('TABS[3]');
    // Notifications must NOT have become a tab.
    expect(shell).not.toContain("href: '/m/notifications'");
  });
});

describe('ND-12 — the desktop sidebar item', () => {
  const shell = readFileSync(
    fileURLToPath(new URL('../app/dashboard/dashboard-shell.tsx', import.meta.url)),
    'utf8'
  );

  it('is present and UNGATED — every role has notifications', () => {
    // ⚠️ REWRITTEN [S130 FFNav reindex], AND THE TEST WAS WHAT WAS WRONG.
    //
    // _Superseded, quoted not rewritten:_
    //   expect(shell).toMatch(
    //     /\{ href: '\/dashboard\/notifications', label: 'Notifications', icon: Bell \}/
    //   );
    //
    // That regex required `}` immediately after `icon: Bell`, so it pinned the
    // entry's FORMATTING rather than its property. Grouping added a `section`
    // field and it failed — while "present and ungated", the thing ND-12
    // actually rules, was never in doubt. It was predicted before the reorder
    // landed rather than discovered by the console.
    //
    // The replacement is STRONGER: it extracts the entry and asserts the
    // ABSENCE of a role array, which the old literal only implied by omission.
    const entry = shell.match(/\{[^{}]*href: '\/dashboard\/notifications'[^{}]*\}/);
    expect(entry, 'no notifications entry in NAV_ITEMS').not.toBeNull();
    expect(entry![0]).toContain("label: 'Notifications'");
    // A role array here would have to be kept in step with every future
    // consumer, for no gain: notifications_select_own already scopes contents.
    expect(entry![0]).not.toContain('roles');
  });

  it('badges only the notifications item, and only above zero', () => {
    expect(shell).toContain("item.href === '/dashboard/notifications' && unreadCount > 0");
  });
});
