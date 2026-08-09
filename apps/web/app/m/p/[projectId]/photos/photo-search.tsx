'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

// M6M §4.8 — the gallery's search control.
//
// ---------------------------------------------------------------------------
// TWO DELIBERATE DEVIATIONS FROM §4.8's LINE, BOTH FLAGGED RATHER THAN HIDDEN.
// ---------------------------------------------------------------------------
// §4.8 puts "a 38px search button" on the RIGHT OF THE APP BAR. Neither half of
// that survives contact with two later rulings:
//
//   SIZE   38px is under §2's 44px floor, and A-5 exempts only the markup
//          colour swatches. D-36 [S100] CUT the app bar's 38px avatar on
//          exactly this reasoning — "38px sits under §2's 44px floor, which
//          only the markup colour swatches are exempt from (A-5 would fail on
//          it)". Shipping a second sub-floor control in the same bar would
//          reinstate what that ruling removed. Rendered at 44px.
//
//   PLACE  §3.1 as amended by D-36 ends "Right: NOTHING. The title block runs
//          to the bar's right inset", and A-40 asserts the app bar renders no
//          right-hand element on any /m route. So the control cannot live in
//          the bar without failing a criterion that is currently green.
//
// It therefore sits at the top of the screen body, at 44px. §4.8 states no
// search BEHAVIOUR at all and no criterion covers it, so the behaviour is
// modelled on M-2's, which is specified: filter live over what the user can
// see — here the file name and both tag arrays.
// ---------------------------------------------------------------------------

export function PhotoSearch({
  basePath,
  source,
  initial,
}: {
  basePath: string;
  /** Preserved across a search so the chip and the query compose. */
  source: string | null;
  initial: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initial.length > 0);
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Debounced so a filter over the server's list does not issue a navigation
  // per keystroke. The list itself is filtered server-side, which keeps the
  // day grouping and the counts consistent with the chips.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (source) params.set('source', source);
      if (value.trim()) params.set('q', value.trim());
      const qs = params.toString();
      router.replace(qs ? `${basePath}?${qs}` : basePath);
    }, 250);
    return () => clearTimeout(t);
  }, [value, open, source, basePath, router]);

  if (!open) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          data-testid="m-photo-search-open"
          aria-label="Search photos"
          onClick={() => {
            setOpen(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-m6m-border bg-m6m-card text-m6m-navy"
        >
          <Search size={20} strokeWidth={2} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-[8px]">
      <input
        ref={inputRef}
        type="search"
        data-testid="m-photo-search"
        aria-label="Search photos"
        placeholder="Search photos"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-11 flex-1 rounded-[12px] border border-m6m-border bg-m6m-card px-[14px] text-[15px] text-m6m-navy placeholder:text-m6m-muted"
      />
      <button
        type="button"
        data-testid="m-photo-search-close"
        aria-label="Close search"
        onClick={() => {
          setValue('');
          setOpen(false);
          router.replace(source ? `${basePath}?source=${source}` : basePath);
        }}
        className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-m6m-border bg-m6m-card text-m6m-navy"
      >
        <X size={20} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
