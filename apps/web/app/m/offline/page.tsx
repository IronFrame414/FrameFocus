'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WifiOff } from 'lucide-react';
import { SetMobileHeader } from '../mobile-header';

// M6M §4.4 — M-4, the offline / failure state.
//
// Reached two ways, per §4.4: by tapping the app-wide status strip (A-14b), or
// when a navigation genuinely cannot be served. The SECOND route does not exist
// yet — it needs the service worker, which is explicitly not this slice — so
// today M-4 is reachable by the strip and by URL only. Flagged.
//
// THE "WAITING TO SYNC" CARD IS EMPTY BY CONSTRUCTION IN THIS SLICE. §5's queue
// is a later slice; there is nothing to enumerate. The card renders with its
// empty state rather than being omitted, so the shape §4.4 specifies is in place
// and the later slice fills it rather than adding it.

function hhmm(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function MobileOfflinePage() {
  const router = useRouter();
  const [lastTry, setLastTry] = useState<Date | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    setLastTry(new Date());
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const tryAgain = useCallback(() => {
    setLastTry(new Date());
    setOnline(navigator.onLine);
    // If the network is genuinely back, re-render the tree that failed.
    if (navigator.onLine) router.refresh();
  }, [router]);

  return (
    <div className="px-[18px] py-[18px]">
      <SetMobileHeader title="Offline" sub={online ? 'Connection restored' : 'No connection'} />

      {/* Centred block — §4.4. */}
      <div className="flex flex-col items-center pt-[24px] text-center">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[18px] border border-m6m-border bg-m6m-card">
          {/* The struck-through wifi glyph. lucide's WifiOff carries the slash
              as part of the icon; §4.4 wants that slash in danger red, so the
              icon is navy and the slash is drawn over it. */}
          <span className="relative block h-[34px] w-[34px]">
            <WifiOff size={34} strokeWidth={2} className="text-m6m-navy" aria-hidden />
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 block h-[2.5px] w-[40px] -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full bg-m6m-danger"
            />
          </span>
        </div>

        <h2 className="mt-[16px] text-[23px] font-extrabold leading-tight text-m6m-navy">
          No connection
        </h2>
        <p className="mt-[8px] max-w-[300px] text-[15px] leading-snug text-m6m-navy/80">
          Keep working — everything you enter is saved on this phone and syncs when you&apos;re
          back in signal.
        </p>
        <p className="mt-[10px] font-mono text-[11px] text-m6m-muted">
          last try {lastTry ? hhmm(lastTry) : '—'}
        </p>
      </div>

      {/* "Waiting to sync" — §4.4. */}
      <section
        data-testid="m-waiting-to-sync"
        className="mt-[22px] rounded-[15px] border border-m6m-border bg-m6m-card p-[14px]"
      >
        <h3 className="font-mono text-[11px] font-medium uppercase tracking-wide text-m6m-muted">
          Waiting to sync
        </h3>
        <p className="mt-[8px] text-[15px] text-m6m-muted">
          Nothing waiting. Anything you capture offline will be listed here.
        </p>
      </section>

      {/* Two stacked 60px buttons — §4.4. */}
      <div className="mt-[18px] flex flex-col gap-[10px] pb-[8px]">
        <button
          type="button"
          data-testid="m-try-again"
          onClick={tryAgain}
          className="h-[60px] w-full rounded-[14px] bg-m6m-blue text-[16px] font-bold text-white transition-transform duration-150 ease-out active:scale-[.99]"
        >
          Try again
        </button>
        <button
          type="button"
          data-testid="m-keep-working"
          onClick={() => router.back()}
          className="h-[60px] w-full rounded-[14px] border border-m6m-border bg-m6m-card text-[16px] font-bold text-m6m-navy transition-transform duration-150 ease-out active:scale-[.99]"
        >
          Keep working offline
        </button>
      </div>
    </div>
  );
}
