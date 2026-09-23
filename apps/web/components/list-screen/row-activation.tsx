'use client';

import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

/**
 * S109 #163 — THE WHOLE ROW OPENS THE ITEM. The shared row primitive.
 *
 * RULED [Josh, S109 ASK-163.A, option 1]: _"It owns click, keyboard, and the
 * guard against firing when the click originated inside an interactive child.
 * It owns no columns, no layout and no data, so it is not the generic table the
 * list-screen author refused. The drag handle decides this: clicking it to focus
 * is the documented keyboard reorder path, and that guard must exist in one
 * tested place, not copied eight times."_
 *
 * So this is BEHAVIOUR, not a table. `list-screen.tsx:13-15` refused a generic
 * table ("a framework, not a pattern") and that refusal stands: every screen
 * still renders its own `<tr>`/`<div>`, cells, grid and styles. It spreads
 * `rowActivation(...)` onto the element it already has.
 *
 * WHAT IT GIVES THE ROW (trap 3 — announced and keyboard-reachable):
 *   role="button" + tabIndex=0 + aria-label + Enter/Space — the shape the
 *   contacts and subs lists established under the prior ruling
 *   (`contacts-list.tsx`, `subcontractors-list.tsx`), now in one place.
 *
 * THE GUARD (traps 1 and 2): a click or key press that STARTED inside an
 * interactive child — a Delete/Clone/Send button, a checkbox, a select, an
 * inline-edit input, a link, the line-items drag handle (a `<button draggable>`)
 * — belongs to that child, and the row does nothing. `stopPropagation` in each
 * actions cell (the `file-row.tsx` pattern) still works, but it has to be
 * remembered at every control; this does not. The keyboard half matters as much
 * as the click half: without it, Enter on a focused Delete button bubbles to the
 * row's onKeyDown and opens the item on top of the delete.
 *
 * `<a>` wrapping is NOT used: most desktop lists are `<tbody>`, where an `<a>`
 * cannot wrap a row. `/m`'s `ListRowLink` is the `<ul>` answer and stays mobile's.
 */

/**
 * Anything matching this, between the event target and the row, owns the event.
 * `[data-row-ignore]` is the escape hatch for a custom control that is none of
 * these (e.g. a click-to-edit cell rendered as a plain element).
 */
export const INTERACTIVE_SELECTOR =
  'a[href], button, input, select, textarea, label, summary, [contenteditable="true"], ' +
  '[draggable="true"], [role="button"], [role="link"], [role="checkbox"], [role="switch"], ' +
  '[role="menuitem"], [role="option"], [role="tab"], [data-row-ignore]';

/**
 * True when the event began inside an interactive element that is a DESCENDANT
 * of the row. The row itself carries role="button", so it matches INTERACTIVE —
 * which is why the row is excluded explicitly rather than by the selector.
 */
export function startedInInteractiveChild(e: {
  target: EventTarget | null;
  currentTarget: EventTarget | null;
}): boolean {
  const row = e.currentTarget as Element | null;
  let node = e.target as Element | null;
  // A text node has no `closest`; step up to its element.
  if (node && typeof (node as Element).closest !== 'function') node = (node as Node).parentElement;
  if (!row || !node) return false;
  const hit = node.closest(INTERACTIVE_SELECTOR);
  return !!hit && hit !== row && row.contains(hit);
}

export interface RowActivationProps {
  role: 'button';
  tabIndex: 0;
  'aria-label': string;
  onClick: (e: MouseEvent<HTMLElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

/**
 * Spread onto the row element: `<tr {...rowActivation(() => open(id), 'Open X')}>`.
 * `label` is the accessible name, and should name the item ("Open Smith kitchen").
 */
export function rowActivation(onOpen: () => void, label: string): RowActivationProps {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onClick: (e) => {
      if (startedInInteractiveChild(e)) return;
      onOpen();
    },
    onKeyDown: (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (startedInInteractiveChild(e)) return;
      e.preventDefault();
      onOpen();
    },
  };
}

/**
 * The same, as a component — for SERVER-component pages
 * (`projects/[id]/invoices/page.tsx`, `projects/[id]/page.tsx`) that cannot
 * attach a handler themselves. Takes an `href` (serialisable), navigates with
 * the router. `as` picks the element so a `<tr>` stays a `<tr>`.
 */
export function ActivatableRow({
  as = 'tr',
  href,
  label,
  children,
  style,
  className,
  testId,
}: {
  as?: 'tr' | 'div' | 'li';
  href: string;
  label: string;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  testId?: string;
}) {
  const router = useRouter();
  const Tag = as;
  return (
    <Tag
      {...rowActivation(() => router.push(href), label)}
      style={{ cursor: 'pointer', ...style }}
      className={className}
      data-testid={testId}
    >
      {children}
    </Tag>
  );
}
