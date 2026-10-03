'use client';

import { useCallback, useRef } from 'react';

/**
 * S127 P-1 — ONE id per intended create, so a second tap cannot make a second row.
 *
 * ⚠️ THE DEFECT. A second tap on punch create made a DUPLICATE ITEM: the table
 * has no natural key, and nothing in the request said "this is the same item I
 * already sent". The id below IS that statement. The client sends it as the
 * row's own primary key; the server's insert of the same id a second time hits
 * the primary key (23505), and the server reads that back as the first
 * request's success instead of inserting again.
 *
 * `current()` is stable until `renew()`; call `renew()` ONLY after a success,
 * so a retry after a failure reuses the id (nothing landed, so nothing
 * duplicates) and the NEXT item gets a fresh one. The same pattern the offline
 * queue already uses (`app/m/offline-sync.tsx`).
 *
 * Shared by `/m` and desktop (PARITY): a helper under one surface's folder would
 * claim that surface owns it.
 */
export function useRequestId(): { current: () => string; renew: () => void } {
  const ref = useRef<string | null>(null);
  const current = useCallback(() => {
    if (!ref.current) ref.current = crypto.randomUUID();
    return ref.current;
  }, []);
  const renew = useCallback(() => {
    ref.current = crypto.randomUUID();
  }, []);
  return { current, renew };
}
