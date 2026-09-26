# S112 R2 — loading feedback on `/m` (audit F1)

**Ruled [Josh, S112 R2]:** `app/m/loading.tsx` inside the persistent shell; re-run the held-tap
measurement; if taps are still dead at 800 ms, add the pending state and say so.

**Taps were still dead at 800 ms after `loading.tsx` alone, so the pending state was added.**

## Method

Production builds (`next build && next start`), crew identity (`josh+crew@`), 390×844 at DPR 3,
touch. Every RSC request (navigation and prefetch) held 3,000 ms. Five navigations × 4 taps = 20.
"First visible change" = the `m-loading` skeleton or the `m-nav-pending` bar appears, or the page
text changes, timed from `pointerdown` in the page. Harness: `held-tap.cjs` (session scratchpad; its
logic is reproduced in the e2e test below for the part that needs guarding).

## Result

| Build | Changed by 800 ms | Tab Field | Tab Projects | Project row | Photo tile | Punch row |
| --- | --- | --- | --- | --- | --- | --- |
| Control (no `loading.tsx`) | **0 / 20** | 3,365–3,482 ms | 3,373–3,438 ms | 3,392–3,723 ms | 3,403–3,687 ms | 3,374–3,532 ms |
| `loading.tsx` only | **16 / 20** | 32–33 ms (skeleton) | 29–32 ms (skeleton) | 31–33 ms (skeleton) | 32–45 ms (skeleton) | **3,378–3,415 ms — dead** |
| + pending bar (first build) | 16 / 20 | skeleton | skeleton | skeleton | skeleton | **3,336–3,415 ms — bar never shown** |
| + pending bar (fixed) | **20 / 20** | 15–16 ms (skeleton) | 14–15 ms (skeleton) | 13–15 ms (skeleton) | 15–16 ms (skeleton) | **15–17 ms (bar)** |

The control reproduces the audit's finding (20 of 20 dead; audit: settled 3.4–6.8 s).

## Why the punch row needed more

`/m` has one layout, so `app/m/loading.tsx` wraps all 49 pages — but Next 14 remounts it only when
the **first segment under `/m` changes**. A punch row opening its item (`/m/p/X/punch` →
`/m/p/X/punch/Y`) keeps that segment, so the old screen sat unchanged for the full 3 s.

**The pending bar** (`app/m/nav-pending.tsx`, mounted once in `mobile-shell.tsx`) shows a 3 px bar
under the app bar on a tap of any same-origin `/m` link, and clears when the pathname or query
changes (15 s give-up). It never navigates or cancels anything.

**The first build of the bar raised it 0 of 4 times.** `next/link` calls `preventDefault()` on every
client-side navigation and React's handler runs before a bubble-phase document listener, so a listener
that honoured `defaultPrevented` saw every real navigation as cancelled. It now listens in the capture
phase and skips only taps on a control nested inside a link (e.g. "show original" in a log row).

## Guard

`e2e/m-sections.spec.ts` → M-14 → "R2 · a held punch-row tap shows the pending bar at once, and it
clears on arrival": RSC held 3 s, bar visible within 800 ms, and gone once the URL has changed.
Passed locally against the production build (2 passed: setup + test).

## Not a reason for `staleTimes`

Per the ruling, this does **not** unblock `feature/s112-staletimes-hold`. That branch's cost was
2,129 ms on Slow 3G for a tab revisit; feedback makes a slow revisit visible, not fast.

## ⚠️ CI found a conflict: `app/m/loading.tsx` changes HTTP semantics on every `/m` page

CI run **36246627024** on this branch: **6 failed / 585 passed.** A loading boundary makes every page
under it STREAM, so the response status is sent before the page runs:

- `notFound()` now renders inside a **200**, not a 404 — A-43 `/m/dashboard`, `/m/subs/<missing>`,
  `/m/logs/<missing>`, `/m/p/{id}/chat` (four specs asserting a real 404);
- a server `redirect()` becomes a client-side one — the `/m/capture` control lands on `/m/timeclock`;
- `m-hydration` aborts on navigation.

**Measured alternative — the pending bar ALONE, no `loading.tsx`** (same harness, same production-build
conditions): **20 / 20 taps changed by 800 ms, 13–16 ms, the bar on all five navigations.** Against
that build, locally, the six CI failures all pass, as does the R2 punch-row guard: `m-capture:967`,
`m-chat-shell:116`, `m-destinations:861`, `m-hydration`, `m-logs:285`, `m-shell:686`, and all of
`m-sections` — **68 passed, 0 failed** (4 skipped are pre-existing data-conditional skips).

**Not changed — this contradicts the ruled mechanism, so it is Josh's call:** keep `loading.tsx` and
accept 200-with-not-found-UI (and rewrite those specs), or drop it and keep the bar alone.
