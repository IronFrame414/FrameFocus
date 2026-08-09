'use client';

import { useEffect, useState } from 'react';

// M6M Part C — shared primitives for the WRITE screens (M-32, M-33, M-34's
// actions).
//
// ===========================================================================
// WHY THIS IS A SECOND FILE AND NOT MORE OF mobile-ui.tsx
// ===========================================================================
// `mobile-ui.tsx` opens with "SERVER-SAFE ON PURPOSE. Nothing here is a client
// component", and every read screen depends on that: no client bundle for data,
// no hydration before the tab bar and the offline strip are usable. A single
// `useState` anywhere in that file marks the whole module `'use client'` and
// drags all seven list screens into the browser bundle with it.
//
// The write screens genuinely need state, so they get their own module. The
// invariant survives by separation rather than by discipline.

// ---------------------------------------------------------------------------
// §4.11.12 / §4.11.13 — ONLINE-ONLY, AND THE OFFLINE STATE IS REAL.
//
// Both write screens are "online-only, disabled offline with a plain message"
// and NEITHER is in D-6's offline set — A-18 counts exactly three queued
// actions and a build that queued a CO or a punch item breaks §5's contract.
// So this gate DISABLES; it never drafts, never queues, never shows a Draft
// pill. The delivery check-in (A-19) is the precedent it copies.
// ---------------------------------------------------------------------------
export function useOnline(): boolean {
  // Starts true so the control is not disabled during the first paint on a
  // perfectly good connection — navigator is unavailable during SSR.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return online;
}

export function OfflineNotice({ what, testId }: { what: string; testId: string }) {
  return (
    <p
      data-testid={testId}
      role="status"
      className="mb-[12px] rounded-[10px] border border-m6m-border bg-m6m-card px-[12px] py-[10px] text-[14px] text-m6m-navy"
    >
      {what} needs a connection — it is not saved offline. Reconnect and try again.
    </p>
  );
}

/** A refusal or a failure. Never names a cause that has not been verified. */
export function ErrorNotice({ message, testId }: { message: string; testId: string }) {
  return (
    <p
      data-testid={testId}
      role="alert"
      className="mt-[12px] rounded-[10px] border border-m6m-danger-border bg-[#fdf1f0] px-[12px] py-[8px] text-[14px] text-m6m-danger"
    >
      {message}
    </p>
  );
}

export function FieldLabel({
  children,
  required = false,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="mb-[6px] flex items-center justify-between">
      <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
        {children}
      </span>
      {required ? (
        <span className="rounded-full bg-[#fdf1f0] px-[8px] py-[2px] font-mono text-[10px] font-semibold text-m6m-danger">
          Required
        </span>
      ) : null}
    </div>
  );
}

/** §2's 44px floor applies to every input, not just to buttons. */
export function TextField({
  label,
  value,
  onChange,
  testId,
  placeholder,
  required = false,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
  placeholder?: string;
  required?: boolean;
  inputMode?: 'text' | 'decimal' | 'numeric';
}) {
  return (
    <div className="mt-[14px]">
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        data-testid={testId}
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`h-[48px] w-full rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] text-[15px] text-m6m-navy ${
          inputMode === 'decimal' || inputMode === 'numeric' ? 'font-mono' : ''
        }`}
      />
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  testId,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
  rows?: number;
}) {
  return (
    <div className="mt-[14px]">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        data-testid={testId}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] py-[10px] text-[15px] text-m6m-navy"
      />
    </div>
  );
}

/**
 * A stack of mutually-exclusive options.
 *
 * NEVER COLOUR ALONE — the selected option carries a check mark as well as a
 * fill, which is §2's rule and the same one `m-incident-type-*` follows.
 */
export function OptionStack<T extends string>({
  options,
  value,
  onChange,
  testIdPrefix,
}: {
  options: readonly { value: T; label: string; sub?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-[8px]">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            data-testid={`${testIdPrefix}-${o.value}`}
            data-active={on ? 'true' : 'false'}
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`flex min-h-[52px] items-center justify-between rounded-[12px] border px-[14px] text-left text-[15px] font-semibold ${
              on
                ? 'border-m6m-blue bg-[#f5f7ff] text-m6m-blue'
                : 'border-m6m-border bg-m6m-card text-m6m-navy'
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate">{o.label}</span>
              {o.sub ? (
                <span className="block font-mono text-[11px] font-normal text-m6m-muted">
                  {o.sub}
                </span>
              ) : null}
            </span>
            {on ? <span aria-hidden>✓</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** The one full-width commit control a write screen gets. */
export function PrimaryButton({
  label,
  busyLabel,
  onClick,
  disabled,
  busy,
  testId,
  tone = 'blue',
}: {
  label: string;
  busyLabel: string;
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
  testId: string;
  tone?: 'blue' | 'danger';
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled || busy}
      onClick={onClick}
      className={`mt-[14px] flex h-[60px] w-full items-center justify-center rounded-[14px] text-[17px] font-bold text-white disabled:opacity-40 ${
        tone === 'danger' ? 'bg-m6m-danger' : 'bg-m6m-blue'
      }`}
    >
      {busy ? busyLabel : label}
    </button>
  );
}

/** A secondary action — outlined, never a second filled button. */
export function SecondaryButton({
  label,
  onClick,
  disabled,
  testId,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className="mt-[10px] flex h-[52px] w-full items-center justify-center rounded-[14px] border border-m6m-border bg-m6m-card text-[15px] font-semibold text-m6m-navy disabled:opacity-40"
    >
      {label}
    </button>
  );
}
