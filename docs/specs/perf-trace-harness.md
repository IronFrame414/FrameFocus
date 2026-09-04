# `PERF_TRACE` — the sign-in latency harness

**Status: unmerged.** Lives on `feature/sign-in-latency` at `239d31f`, which conflicts with `main`
in `apps/web/app/dashboard/layout.tsx` (2 hunks). `middleware.ts` and `page.tsx` merge clean.
Recorded here because the only account of it was a commit message on a branch.

## What it is

`perfTime(label, fn)` in `apps/web/lib/perf.ts` — 12 lines. Wraps an async phase and logs its
duration as `[PERF] <label>\t<n>ms`.

- **Inert unless `PERF_TRACE=1`.** Off, it returns `fn()` untouched — no timer, no log, no await
  added. Dev, prod and CI are unaffected.
- **Logs in a `finally`**, so a phase that throws still reports its timing.
- ⚠️ **Self-declared TEMPORARY** — the file's own header says remove it once the latency work lands.

## What it measures

Phase boundaries on the dashboard render, per `239d31f`:

| Site | Phases wrapped |
| --- | --- |
| `middleware.ts` | getUser · lock · profiles · subscriptions |
| `dashboard/layout.tsx` | getUser · profiles · parallel5 |
| `dashboard/page.tsx` | getUser · profiles · getDashboardData · getCalendarEvents · getPortfolioMoney |

## To run

Set `PERF_TRACE=1` in the server environment and load `/dashboard`. Timings print to the server
console, not the browser.

## ⚠️ It is a measuring instrument, not a fix

It records where the milliseconds go. The latency **fix** is `9692038` on `main` (one Supabase
client per request, shared via React `cache()`) — already merged and deployed. The two conflict
precisely because both edit the same phase boundaries: one to time them, one to collapse them.

## Results

**Never recorded.** No before/after numbers were written down. If the harness is merged and run,
capture them here.
