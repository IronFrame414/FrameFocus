'use client';

// S175 item 9 — the native-dialog sweep.
//
// ONE shared overlay behind a promise hook, replacing 54 `window.confirm()` and
// 20 `window.alert()` call sites [Q9.1/Q9.2, Josh, S175]. The call-site shape is
// preserved so the diff is one line each:
//
//   const confirm = useConfirm();
//   if (!(await confirm('Move this to trash?'))) return;
//
// WHY A HOOK AND NOT INLINE PANELS: `app/m` uses inline `mode`-state panels, but
// there are four of them in screens built around them. Desktop has 54 call sites
// across ~40 files and five bespoke modals; an inline panel at each is 54 design
// decisions. A promise hook is one, and it leaves every call site's control flow
// intact — `if (!(await confirm(…))) return;`.
//
// WHY IT MATTERS BEYOND COSMETICS: Playwright DISMISSES unhandled native dialogs,
// so every one of those confirm-guarded destructive actions was CANCELLED in
// every e2e run and never exercised in a browser. Once these overlays replace the
// native dialogs, the clicks land — the buttons carry `data-testid`s so a test
// clicks through instead of relying on Playwright's auto-dismiss.
//
// Visual language follows `app/m`'s styled panels (a card, a blue primary, an
// outlined secondary — write-ui.tsx) rendered with the dashboard's own
// `lib/theme` tokens so it sits inside the desktop shell.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { cardStyle, color, font, primaryButtonStyle, secondaryButtonStyle } from '@/lib/theme';

export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` paints the confirm button red; the default is the primary blue. */
  tone?: 'default' | 'danger';
}

export interface AlertOptions {
  message: string;
  title?: string;
  okLabel?: string;
}

type Pending =
  | { kind: 'confirm'; opts: Required<Pick<ConfirmOptions, 'message'>> & ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'alert'; opts: Required<Pick<AlertOptions, 'message'>> & AlertOptions; resolve: () => void };

interface ConfirmContextValue {
  confirm: (arg: string | ConfirmOptions) => Promise<boolean>;
  alert: (arg: string | AlertOptions) => Promise<void>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback((arg: string | ConfirmOptions) => {
    const opts = typeof arg === 'string' ? { message: arg } : arg;
    return new Promise<boolean>((resolve) => {
      setPending({ kind: 'confirm', opts, resolve });
    });
  }, []);

  const alert = useCallback((arg: string | AlertOptions) => {
    const opts = typeof arg === 'string' ? { message: arg } : arg;
    return new Promise<void>((resolve) => {
      setPending({ kind: 'alert', opts, resolve });
    });
  }, []);

  const value = useMemo<ConfirmContextValue>(() => ({ confirm, alert }), [confirm, alert]);

  // Settle the outstanding promise, then clear the overlay. `accept` is ignored
  // for an alert (it resolves void either way).
  const settle = useCallback(
    (accept: boolean) => {
      setPending((cur) => {
        if (!cur) return null;
        if (cur.kind === 'confirm') cur.resolve(accept);
        else cur.resolve();
        return null;
      });
    },
    []
  );

  // Enter accepts, Escape cancels. Bound only while a dialog is open.
  useEffect(() => {
    if (!pending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        // Escape on an alert dismisses it; on a confirm it cancels (returns false).
        settle(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        settle(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, settle]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && <DialogOverlay pending={pending} onSettle={settle} />}
    </ConfirmContext.Provider>
  );
}

function DialogOverlay({ pending, onSettle }: { pending: Pending; onSettle: (accept: boolean) => void }) {
  const isConfirm = pending.kind === 'confirm';
  const opts = pending.opts;
  const danger = pending.kind === 'confirm' && pending.opts.tone === 'danger';

  return (
    <div
      // Backdrop click cancels (confirm) / dismisses (alert). The card stops
      // propagation so a click inside never settles.
      onClick={() => onSettle(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        backgroundColor: 'rgba(20, 33, 61, 0.45)',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        data-testid={isConfirm ? 'confirm-dialog' : 'alert-dialog'}
        onClick={(e) => e.stopPropagation()}
        style={{
          ...cardStyle,
          width: '100%',
          maxWidth: '400px',
          padding: '22px',
          boxShadow: '0 12px 40px rgba(20, 33, 61, 0.22)',
        }}
      >
        {opts.title && (
          <p
            style={{
              margin: '0 0 8px',
              fontFamily: font.sans,
              fontSize: '16px',
              fontWeight: 700,
              color: color.navy,
            }}
          >
            {opts.title}
          </p>
        )}
        <p
          style={{
            margin: 0,
            fontFamily: font.sans,
            fontSize: '14px',
            lineHeight: 1.5,
            color: color.body,
          }}
        >
          {opts.message}
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            marginTop: '20px',
          }}
        >
          {isConfirm && (
            <button
              type="button"
              data-testid="confirm-cancel"
              onClick={() => onSettle(false)}
              style={{ ...secondaryButtonStyle }}
            >
              {(pending.kind === 'confirm' && pending.opts.cancelLabel) || 'Cancel'}
            </button>
          )}
          <button
            type="button"
            autoFocus
            data-testid={isConfirm ? 'confirm-accept' : 'alert-ok'}
            onClick={() => onSettle(true)}
            style={{
              ...primaryButtonStyle,
              ...(danger ? { backgroundColor: color.danger } : null),
            }}
          >
            {isConfirm
              ? (pending.kind === 'confirm' && pending.opts.confirmLabel) || 'Confirm'
              : (pending.kind === 'alert' && pending.opts.okLabel) || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Returns a `confirm()` that renders the shared overlay and resolves `true`/`false`.
 * Drop-in for `window.confirm`: `if (!(await confirm('…'))) return;`.
 */
export function useConfirm(): (arg: string | ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx.confirm;
}

/**
 * Returns an `alert()` that renders the shared overlay and resolves when dismissed.
 * Drop-in for `window.alert`: `await alert('…')` (or fire-and-forget).
 */
export function useAlert(): (arg: string | AlertOptions) => Promise<void> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useAlert must be used within a ConfirmProvider');
  return ctx.alert;
}
