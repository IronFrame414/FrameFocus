import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// S109 #163 — the shared row primitive, `components/list-screen/row-activation.tsx`.
//
// SPLIT BY WHAT CAN BE DECIDED WITHOUT A BROWSER (ruling 163.C: Playwright, no
// jsdom, no Testing Library):
//   · the GUARD's decision — "did this event start inside an interactive child
//     of the row?" — is a pure function of target / currentTarget. Decided here
//     against minimal element stand-ins that implement exactly the two DOM
//     methods it calls (`closest`, `contains`).
//   · trap 3's MARKUP (role, tabindex, aria-label) — rendered to static markup.
//   · adoption — SOURCE-level: every migrated screen routes its row through the
//     primitive and none keeps a bare row onClick.
//   · real clicks, real keys, the real drag handle — `e2e/desktop-row-activation-s109.spec.ts`.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

import {
  ActivatableRow,
  INTERACTIVE_SELECTOR,
  rowActivation,
  startedInInteractiveChild,
} from '@/components/list-screen/row-activation';

// ---- a DOM-shaped stand-in: a tree of nodes, `closest` by a matcher --------
interface FakeEl {
  name: string;
  interactive: boolean;
  parent: FakeEl | null;
  closest: (sel: string) => FakeEl | null;
  contains: (other: FakeEl) => boolean;
}
function el(name: string, interactive: boolean, parent: FakeEl | null): FakeEl {
  const self: FakeEl = {
    name,
    interactive,
    parent,
    // The primitive passes its INTERACTIVE selector; the stand-in answers by
    // the `interactive` flag, walking up exactly as Element.closest does.
    closest: () => {
      let n: FakeEl | null = self;
      while (n) {
        if (n.interactive) return n;
        n = n.parent;
      }
      return null;
    },
    contains: (other) => {
      let n: FakeEl | null = other;
      while (n) {
        if (n === self) return true;
        n = n.parent;
      }
      return false;
    },
  };
  return self;
}

// The row is itself role="button" — i.e. matches the selector.
const row = el('tr[role=button]', true, null);
const cell = el('td', false, row);
const text = el('span', false, cell);
const actions = el('td.actions', false, row);
const deleteBtn = el('button', true, actions);
const deleteIcon = el('svg', false, deleteBtn);
const handle = el('button[draggable]', true, cell); // the line-items drag handle
const elsewhere = el('button-outside', true, null);

const ev = (target: FakeEl) => ({ target: target as unknown as EventTarget, currentTarget: row as unknown as EventTarget });

describe('S109 #163 — the guard decides who owns an event', () => {
  it('a click on plain row content belongs to the ROW', () => {
    expect(startedInInteractiveChild(ev(text))).toBe(false);
    expect(startedInInteractiveChild(ev(cell))).toBe(false);
  });

  it('the row matching the selector itself is NOT "an interactive child"', () => {
    expect(startedInInteractiveChild(ev(row))).toBe(false);
  });

  it('trap 1 — a click inside a row button (even on its icon) belongs to the BUTTON', () => {
    expect(startedInInteractiveChild(ev(deleteBtn))).toBe(true);
    expect(startedInInteractiveChild(ev(deleteIcon))).toBe(true);
  });

  it('trap 2 — a click on the drag handle belongs to the HANDLE', () => {
    expect(startedInInteractiveChild(ev(handle))).toBe(true);
  });

  it('the selector names every control a row can contain — the stand-in trusts it, so assert it', () => {
    const parts = INTERACTIVE_SELECTOR.split(',').map((p) => p.trim());
    for (const needed of ['a[href]', 'button', 'input', 'select', 'textarea', 'label', '[draggable="true"]', '[role="button"]', '[role="checkbox"]', '[data-row-ignore]']) {
      expect(parts, `the guard no longer recognises ${needed}`).toContain(needed);
    }
  });

  it('an interactive element OUTSIDE the row does not suppress the row', () => {
    expect(startedInInteractiveChild(ev(elsewhere))).toBe(false);
  });

  it('the handlers honour the guard — click AND keyboard', () => {
    let opened = 0;
    const props = rowActivation(() => opened++, 'Open X');
    const click = (t: FakeEl) =>
      props.onClick({ ...ev(t) } as unknown as React.MouseEvent<HTMLElement>);
    const key = (t: FakeEl, k: string) => {
      let prevented = false;
      props.onKeyDown({ ...ev(t), key: k, preventDefault: () => (prevented = true) } as unknown as React.KeyboardEvent<HTMLElement>);
      return prevented;
    };
    click(text);
    expect(opened, 'a click on row content did not open').toBe(1);
    click(deleteBtn);
    expect(opened, 'a click on Delete ALSO opened the row').toBe(1);
    expect(key(row, 'Enter')).toBe(true);
    expect(key(row, ' ')).toBe(true);
    expect(opened, 'Enter/Space on the focused row did not open').toBe(3);
    // Enter on a focused child button must reach the button, not the row —
    // and must not be preventDefault'ed, or the button would not activate.
    expect(key(deleteBtn, 'Enter')).toBe(false);
    expect(key(handle, ' ')).toBe(false);
    expect(opened, 'Enter on a child control opened the row').toBe(3);
    expect(key(row, 'ArrowDown')).toBe(false);
    expect(opened).toBe(3);
  });
});

describe('S109 #163 — trap 3: the row is announced and keyboard-reachable', () => {
  it('rowActivation gives role, tabIndex and a name', () => {
    const p = rowActivation(() => {}, 'Open Smith kitchen');
    expect(p.role).toBe('button');
    expect(p.tabIndex).toBe(0);
    expect(p['aria-label']).toBe('Open Smith kitchen');
  });

  it('ActivatableRow renders them onto the element it was asked for', () => {
    const html = renderToStaticMarkup(
      <table>
        <tbody>
          <ActivatableRow href="/x" label="Open invoice 1001" testId="r1">
            <td>1001</td>
          </ActivatableRow>
        </tbody>
      </table>
    );
    expect(html).toMatch(/<tr role="button" tabindex="0" aria-label="Open invoice 1001"/);
    expect(html).toContain('data-testid="r1"');
    const div = renderToStaticMarkup(<ActivatableRow as="div" href="/x" label="L">x</ActivatableRow>);
    expect(div).toMatch(/^<div role="button" tabindex="0" aria-label="L"/);
  });
});

describe('S109 #163 — every whole-row list routes through the ONE primitive', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const adopters: [string, RegExp][] = [
    ['../app/dashboard/contacts/contacts-list.tsx', /\{\.\.\.rowActivation\(/],
    ['../app/dashboard/subcontractors/subcontractors-list.tsx', /\{\.\.\.rowActivation\(/],
    ['../app/dashboard/projects/projects-list.tsx', /\{\.\.\.rowActivation\(/],
    ['../app/dashboard/team/team-page-client.tsx', /\{\.\.\.rowActivation\(/],
    ['../app/dashboard/projects/[id]/files/file-row.tsx', /\{\.\.\.rowActivation\(/],
    ['../app/dashboard/projects/[id]/changes/changes-panel.tsx', /\{\.\.\.rowActivation\(/],
    ['../app/dashboard/estimates/estimates-list.tsx', /\{\.\.\.rowActivation\(/],
    ['../app/dashboard/catalog/catalog-list.tsx', /rowActivation\(\(\) => router\.push\(`\/dashboard\/catalog\/\$\{item\.id\}\/edit`\)/],
    ['../app/dashboard/projects/[id]/invoices/page.tsx', /<ActivatableRow/],
    ['../app/dashboard/projects/[id]/page.tsx', /<ActivatableRow/],
  ];
  for (const [file, pattern] of adopters) {
    it(file.replace('../app/dashboard/', ''), () => {
      const src = read(file);
      expect(src).toMatch(pattern);
      // The mouse-only shape the primitive replaces: a row element whose own
      // onClick navigates. None may come back.
      expect(src, 'a bare row onClick={() => router.push(...)} is back').not.toMatch(
        /<(tr|div)\s[^>]*onClick=\{\(\) => router\.push/
      );
    });
  }

  it('ruling 163.B — expenses rows stay INERT (nothing to open)', () => {
    const src = read('../app/dashboard/expenses/expenses-page-client.tsx');
    expect(src).not.toMatch(/rowActivation|ActivatableRow/);
  });

  it('the line-items card has NO click handler (it opens nothing; the handle must keep its keyboard path)', () => {
    const src = read('../app/dashboard/estimates/[id]/items-tab.tsx');
    const card = src.slice(src.indexOf('data-line-card={line.id}') - 200, src.indexOf('data-line-card={line.id}') + 400);
    expect(card).not.toMatch(/onClick/);
    expect(src).not.toMatch(/rowActivation|ActivatableRow/);
  });
});
