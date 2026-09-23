'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * S109 #161 — THE REUSABLE MODAL. [RULED Josh, ASK-161.A: "build the reusable
 * modal, then the file sheet on top of it."]
 *
 * Before this the app had no modal primitive: `confirm-provider.tsx` is the one
 * `aria-modal` surface (no focus trap, no focus restore), `/m`'s nav sheet is
 * deliberately `aria-modal="false"`, `box-map-editor.tsx`'s full-screen overlay
 * has no role and no Escape, and everything named `*-sheet.tsx` is a side panel.
 * TECH_DEBT #161 warned that building the file viewer without deciding this
 * would give the app "a fifth thing called a sheet". This is the one to use.
 *
 * WHAT IT OWNS, and nothing else:
 *   · role="dialog" + aria-modal + a labelled title
 *   · Escape closes; the scrim closes
 *   · FOCUS: moved in on open, trapped on Tab/Shift-Tab, RESTORED to whatever
 *     had it before on close (the "never lose your place" half of the ruling
 *     that prompted it — a keyboard user lands back on the row they opened)
 *   · page scroll locked while open, restored after
 *   · shape: full-screen on a phone (a PDF page needs the width), inset panel
 *     from `sm` up
 * It owns no content, no header actions and no data. Callers pass `title`,
 * optional `actions` for the header, and children.
 *
 * Location: `components/`, not `app/dashboard/` or `app/m/` — both surfaces
 * mount it (CLAUDE.md → PARITY, "location is a claim about ownership").
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ModalSheet({
  open,
  onClose,
  title,
  actions,
  children,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Rendered in the header, before the close button. */
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    restoreRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the close button (first focusable) so Escape/Enter work at once.
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !panelRef.current.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !panelRef.current.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      // Restore focus where the user was — only if that element still exists.
      const back = restoreRef.current;
      if (back && document.contains(back)) back.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={() => onCloseRef.current()}
        className="absolute inset-0 cursor-default"
        style={{ backgroundColor: 'rgba(20,33,61,0.55)' }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        className="relative flex h-full w-full flex-col overflow-hidden bg-white shadow-xl outline-none sm:h-[90vh] sm:max-w-5xl sm:rounded-xl"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-2 sm:px-4">
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="Close"
            data-testid={testId ? `${testId}-close` : undefined}
            className="rounded-md px-2 py-1 text-lg leading-none text-gray-600 hover:bg-gray-100"
          >
            ✕
          </button>
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
            {title}
          </h2>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-gray-100">{children}</div>
      </div>
    </div>,
    document.body
  );
}
