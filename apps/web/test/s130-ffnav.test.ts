import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ============================================================================
// FFNav reindex — A-N3, A-N4, A-N6, A-N7. Spec: docs/specs/ffnav-reindex-spec.md
// ============================================================================
//
// Source-level rather than render-level, because what is being asserted is the
// ORDER AND THE GATES of a module-scope constant. The rendered halves — the
// section headers and crew's missing Admin header — are Playwright's, in
// desktop-ffnav.spec.ts, where a real role can be signed in.

const shell = readFileSync(
  fileURLToPath(new URL('../app/dashboard/dashboard-shell.tsx', import.meta.url)),
  'utf8'
);

/** The NAV_ITEMS entries, in source order, each as its own text block. */
function entries(): Array<{ href: string; label: string; section: string; roles: string | null }> {
  const block = /const NAV_ITEMS[\s\S]*?\n\];/.exec(shell);
  if (!block) throw new Error('NAV_ITEMS not found');
  const out: Array<{ href: string; label: string; section: string; roles: string | null }> = [];
  // Entries are `{ ... }` objects, one per item, possibly multi-line.
  for (const m of block[0].matchAll(/\{[^{}]*href: '([^']+)'[^{}]*\}/g)) {
    const text = m[0];
    const label = /label: '([^']+)'/.exec(text)?.[1] ?? '';
    const section = /section: (?:'([^']+)'|null)/.exec(text)?.[1] ?? 'top';
    const roles = /roles: \[([^\]]*)\]/.exec(text)?.[1] ?? null;
    out.push({ href: m[1], label, section, roles });
  }
  return out;
}

describe('A-N4 / §1 — the ruled order', () => {
  it('is 14 items in the ruled sequence', () => {
    expect(entries().map((e) => e.label)).toEqual([
      // Top layer — the daily set, no header.
      'Dashboard',
      'Projects',
      'Schedule',
      'Field Ops',
      'Timeclock',
      'Expenses',
      'Estimates',
      'Notifications',
      // Reference.
      'Contacts',
      'Subs & Vendors',
      'Team',
      'Cost Catalog',
      // Admin.
      'Settings',
      'Billing',
    ]);
  });

  it('A-N4 — Notifications is EIGHTH and last in the top layer', () => {
    const list = entries();
    expect(list[7].label).toBe('Notifications');
    expect(list[7].section).toBe('top');
    // "Last in the top layer" is the half that a build could get wrong while
    // still putting it eighth — the next item must begin Reference.
    expect(list[8].section).toBe('reference');
  });

  it('the three sections hold 8 / 4 / 2', () => {
    const list = entries();
    expect(list.filter((e) => e.section === 'top')).toHaveLength(8);
    expect(list.filter((e) => e.section === 'reference')).toHaveLength(4);
    expect(list.filter((e) => e.section === 'admin')).toHaveLength(2);
  });

  it('§2 — Contacts and Subs & Vendors are ADJACENT', () => {
    // "One thing in his head, and the system treats them differently" — hence
    // adjacent rather than merged. A later alphabetiser separates them.
    const labels = entries().map((e) => e.label);
    expect(labels.indexOf('Subs & Vendors')).toBe(labels.indexOf('Contacts') + 1);
  });
});

describe('A-N6 — this work changed NO gate', () => {
  // Asserting that a refactor changed nothing is the point: moving items
  // between groups is exactly when a gate gets "tidied" by accident, and a
  // widened gate is invisible until someone sees a page they should not.
  const gateFor = (label: string) => entries().find((e) => e.label === label)?.roles ?? null;

  it('Estimates and Cost Catalog stay owner/admin/project_manager', () => {
    for (const label of ['Estimates', 'Cost Catalog']) {
      expect(gateFor(label), label).toBe("'owner', 'admin', 'project_manager'");
    }
  });

  it('Settings stays owner/admin; Billing stays owner-only', () => {
    expect(gateFor('Settings')).toBe("'owner', 'admin'");
    expect(gateFor('Billing')).toBe("'owner'");
  });

  it('everything else is ungated — including Team, which is why it is not in Admin', () => {
    const gated = entries().filter((e) => e.roles !== null).map((e) => e.label);
    expect(gated.sort()).toEqual(['Billing', 'Cost Catalog', 'Estimates', 'Settings']);
    // §2b: Team being ungated is precisely what kept it out of Admin — an
    // ungated item there would give crew an Admin header with Team under it.
    expect(gateFor('Team')).toBeNull();
  });
});

describe('A-N3 — role filtering removes, never re-orders', () => {
  it('the filter is applied once and the sections read from its result', () => {
    // The shape is the guarantee: one `visible` list in NAV_ITEMS order, then
    // per-section `.filter()` over it. A build that sorted per role would pass
    // every "the right items are present" assertion.
    expect(shell).toContain(
      'const visible = NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(userRole))'
    );
    expect(shell).toContain('visible.filter((item) => item.section === null)');
    expect(shell).toContain('visible.filter((item) => item.section === key)');
    // No sort anywhere near the nav — the thing that would silently break it.
    expect(shell).not.toMatch(/\.sort\(/);
  });

  it('an empty section renders NO header', () => {
    // A-N2's source half. Crew hit this: both Admin items are gated away, so
    // the section is empty and must produce nothing at all.
    expect(shell).toContain('if (items.length === 0) return null;');
  });
});

describe('A-N7 — active state is pathname-derived, never an ordinal', () => {
  it('isActive matches on href, so reordering cannot break it', () => {
    // The M6 handoff warned "this reindexes Settings to 9 — update any earlier
    // FFNav active='6' references". That warning does not apply here and this
    // is what makes it so: there is no ordinal to update.
    expect(shell).toContain('function isActive(href: string)');
    expect(shell).toContain('const active = isActive(item.href);');
    expect(shell).not.toMatch(/active=\{?["']?\d/);
  });
});

describe('A-N5 — the badge is unchanged by the reindex', () => {
  it('nothing at zero, capped at 9+', () => {
    expect(shell).toContain("item.href === '/dashboard/notifications' && unreadCount > 0");
    expect(shell).toContain("{unreadCount > 9 ? '9+' : unreadCount}");
  });
});
