import 'server-only';
import { waitUntil } from '@vercel/functions';

// S123 D-3 — WORK THAT RUNS AFTER THE RESPONSE [Josh, RULED 2026-10-02:
// "push in background … 95% of subs will be email only"].
//
// `waitUntil` (Vercel's own primitive; Next 14.2 has no `after()`, which is
// built on it) keeps the invocation alive after the response is sent, until the
// promise settles or the function's time limit is reached. Off Vercel (`next
// start` in CI and Codespaces) there is no request context, `waitUntil` is a
// no-op, and the promise simply runs to completion in the live server.
//
// ⚠️ Whatever is handed here MUST already have made its own failures visible:
// nothing here retries, and a rejection is only logged. Critical Path's sends
// log every attempt to email_logs (lib/critical-path/notify.ts), including the
// ones the time limit stops before they start.
//
// `settleBackground()` is the TEST seam: a live test awaits it before counting
// what the background wrote. The app never calls it.

const pending = new Set<Promise<unknown>>();

export function runInBackground(label: string, work: () => Promise<unknown>): void {
  const p: Promise<unknown> = Promise.resolve()
    .then(work)
    .catch((e) => console.error(`[background] ${label}: ${e instanceof Error ? e.message : String(e)}`))
    .finally(() => pending.delete(p));
  pending.add(p);
  waitUntil(p);
}

/** Resolves when every piece of background work started in this process has settled. */
export async function settleBackground(): Promise<void> {
  while (pending.size > 0) await Promise.allSettled([...pending]);
}
