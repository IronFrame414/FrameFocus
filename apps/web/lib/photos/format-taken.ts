/**
 * S127 item 4b (A-4) — WHEN A PHOTO WAS TAKEN, in the reader's words. ONE
 * formatter for /m's viewer and the desktop single view (PARITY; the S106
 * `captureGps` lesson: two surfaces formatting the same value differently).
 *
 * MOVED here from `app/m/p/[projectId]/photos/[fileId]/viewer.tsx`'s inline
 * useMemo, unchanged: the locale is the reader's (`dateLocale(lang)`), no
 * `timeZone` (the viewer's own clock), '—' when there is no timestamp.
 */
export function formatTakenAt(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
