'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WifiOff } from 'lucide-react';
import { SetMobileHeader } from '../mobile-header';
import { useOfflineSync } from '../offline-sync';
import type { QueueEntry } from '@/lib/offline/queue';

// M6M §4.4 — M-4, the offline / failure state.
//
// [S105] The note below predates the service worker; sw.js now exists and
// precaches/serves THIS PAGE as the navigation fallback for /m routes, so a
// failed navigation renders M-4's content even though the URL stays put.
//
// Reached two ways, per §4.4: by tapping the app-wide status strip (A-14b), or
// when a navigation genuinely cannot be served. The SECOND route does not exist
// yet — it needs the service worker, which is explicitly not this slice — so
// today M-4 is reachable by the strip and by URL only. Flagged.
//
// THE "WAITING TO SYNC" CARD IS LIVE — §5's queue feeds it. Queued entries
// carry the `Queued` badge; a permanently-failing entry shows `Needs attention`
// with its last_error (§5.2.6, A-17); a CONFLICTED entry gets its own
// treatment — the message names the record and says the copy was kept and sent
// for review, and it is deliberately NOT the retry treatment, because nothing
// about it will succeed on a retry and offering one would be a lie (A-19e).

function hhmm(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const ENTITY_LABEL: Record<QueueEntry['entity'], string> = {
  time_clock_session: 'Clock event',
  time_segment: 'Time segment',
  daily_log: 'Daily log',
  photo: 'Photo',
};

export default function MobileOfflinePage() {
  const router = useRouter();
  const offlineSync = useOfflineSync();
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
    // A-17b — an IMMEDIATE sync attempt, not a wait on the backoff interval.
    if (navigator.onLine) {
      void offlineSync?.sync();
      router.refresh();
    }
  }, [offlineSync, router]);

  const entries = offlineSync?.entries ?? [];

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
        {entries.length === 0 ? (
          <p className="mt-[8px] text-[15px] text-m6m-muted">
            Nothing waiting. Anything you capture offline will be listed here.
          </p>
        ) : (
          <ul className="mt-[6px]">
            {entries.map((e) => (
              <li
                key={e.entry_id}
                data-testid="m-queued-item"
                data-state={e.state}
                className="flex min-h-[52px] items-center gap-[10px] border-b border-m6m-border py-[8px] last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-m6m-navy">
                    {ENTITY_LABEL[e.entity]}
                  </p>
                  <p className="font-mono text-[11px] text-m6m-muted">
                    {new Date(e.captured_at).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                  {e.state === 'conflicted' ? (
                    // A-19e — names the record, states the outcome, offers no
                    // retry: nothing about this will succeed on one.
                    <p
                      data-testid="m-conflict-message"
                      className="mt-[2px] text-[13px] text-m6m-navy/80"
                    >
                      Someone edited this {ENTITY_LABEL[e.entity].toLowerCase()} after you
                      loaded it. Your copy was kept and sent for review.
                    </p>
                  ) : e.attempts > 0 && e.last_error ? (
                    <p
                      data-testid="m-entry-error"
                      className="mt-[2px] text-[13px] text-m6m-danger"
                    >
                      {e.last_error}
                    </p>
                  ) : null}
                </div>
                {e.state === 'conflicted' ? (
                  <span
                    data-testid="m-held-badge"
                    className="shrink-0 rounded-full border border-m6m-border bg-m6m-surface px-[8px] py-[2px] font-mono text-[11px] font-semibold text-m6m-muted"
                  >
                    Held for review
                  </span>
                ) : e.attempts > 2 ? (
                  <span
                    data-testid="m-attention-badge"
                    className="shrink-0 rounded-full border border-m6m-danger-border bg-[#fdf1f0] px-[8px] py-[2px] font-mono text-[11px] font-semibold text-m6m-danger"
                  >
                    Needs attention
                  </span>
                ) : (
                  <span
                    data-testid="m-queued-badge"
                    className="shrink-0 rounded-full bg-m6m-amber/20 px-[8px] py-[2px] font-mono text-[11px] font-semibold text-m6m-navy"
                  >
                    Queued
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
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
