# S112 overnight report

**No production issue found** (so far; nothing on production was touched, by rule.)

> Resume point for a session with no memory: read this whole file first. The "Log" at the bottom
> says which step was last completed and pushed. The order is: ruling 1 (push the rebased fix
> branch) → ruling 3 (display-size derivative) → ruling 2 (push the hold branch, document it) →
> the S112 audit fixes → S111 Part One → queue A → B → C → D.
> This report lives on `feature/s112-overnight-report`; every commit to it carries `[skip ci]`
> so it never starts a CI run.

## NEEDS A RULING

### R1 — Display-sized `.markup.jpg` (ruling 3a/3b): an EXPORT consumer needs full resolution today

**The question.** Ruling 3 made the flattened `.markup.jpg` display-sized, on condition (3b) that no
consumer needs full resolution — "if any does, say so and STOP". Some do, so the resize is **not
built**. (3c — show the locally built image instead of downloading it back — does not depend on size
and IS being built.)

**Every consumer.** Command, run from the repo root, untruncated:
`grep -rln -E 'derivativePathFor|DERIVATIVE_SUFFIX|isDerivativePath|markup\.jpg' --exclude-dir={node_modules,.next,.git} .`
→ **52 files**: 18 runtime (app, lib, scripts, migrations), the rest tests and docs. Plus every
reader of the resolved `displayUrl` / `display_path`, which carries the derivative for an annotated
photo.

| Consumer | What it does with the bytes | Needs full res? |
| --- | --- | --- |
| `/m` viewer stage, desktop photos page, client portal `<img>` (`portal/[projectId]/files/page.tsx:161`) | display | no |
| Thumbnail generation (`lib/photos/thumbnail-server.ts`, `scripts/s111-thumbnail-backfill.cjs`) | source for a 400px WebP | no |
| Delivery, daily-log and incident PDFs (`lib/change-orders/co-data.ts:285`) | embedded; delivery draws 166×124 pt (`delivery-template.tsx:113`) ≈ 692×517 px at 300 dpi | no |
| Desktop Files View/Download (`/api/files/signed-url?markup=1`, `signed-url/route.ts:47-58`) | **the file the user downloads** | **yes, as built** |
| `/m` viewer **Save** (`viewer.tsx:635-638`, `<a href={displayUrl} download>`) | **the file the user saves** | **yes, as built** |
| `/m` viewer **Share**, grid bulk Share (`shareTargetFor`, `photo-grid.tsx`), chat share (`lib/chat/photos.ts:33` — "share keep using displayUrl, the full file") | **the file sent to a sub / insurer** | **yes, as built** |

Today the derivative is the ONLY way to get a full-resolution *marked* photo out of FrameFocus. The
original stays full-res, but unmarked.

**Options:**
1. **Export regenerates full-res on demand (Josh's named fallback).** The stored `.markup.jpg` becomes
   display-sized. Download/Save/Share build the full-res marked image from original + `markup_data`
   when asked. Client-side, that's the same `drawShapes()` flatten the save uses today (~1.5–3s on a
   phone, no upload). Server-side it needs a canvas/sharp renderer that mirrors `drawShapes()` — two
   rasterisers, which the PARITY rule warns against.
2. **Accept display-size exports.** The simplest option: every exported marked photo becomes
   display-sized (the size 3a measures).
3. **Keep full-res storage; build only 3c.** 3c alone removes the 2 MB download-back. The upload
   still costs 2 MB.

**Recommendation: 1, client-side.** One rasteriser (`lib/markup/flatten-shapes.ts`, already shared
by both surfaces), no new server renderer, and exports keep full resolution. The store and upload
shrink to display size, so the 47s Fast 3G save drops by the upload share.

**3a, measured, so this can be ruled without another session** (production build, sign-in reads only):

| Surface | Largest drawn area | At its DPR |
| --- | --- | --- |
| `/m` viewer stage, 360/390/430 wide | 360–430 × 330 CSS px, `object-cover` | 3× → **1,290×1,720** (portrait) / **1,320×990** (landscape) |
| Desktop file sheet (Files → View), 1440/1920/2560 wide | **1,024** × 763 / 925 / 1,249 CSS px, `object-contain` | 2× → **2,048** long edge (landscape); portrait at 1440p reaches 2,498 |
| Desktop click on a photo | opens the markup **editor**, which draws the ORIGINAL — not a derivative consumer | — |

- **Proposed size: 2,048 px long edge**, because it covers every surface above un-zoomed except
  portrait on a 1440p Retina desktop.
- **Caveat:** the `/m` viewer zooms up to 6× (`viewer.tsx` `MAX_ZOOM`), so past about 1.2× zoom a
  2,048 image softens. The "show original" toggle stays full-res.
- **Bytes on the real 12 MP photo:**
  - 4,032×3,024: **1,846,387 B**
  - **2,048×1,536: 557,985 B (−70%)**, with the 4×-CPU draw + encode dropping 2,085 → 1,275 ms
  - 1,600×1,200: 358,478 B

## DONE AND PROVEN

### Ruling 1 — fix branch rebased and pushed; the staleTimes cost measurement owed

- `feature/s112-router-staleness` rebased onto main `528bc76b` with no conflicts (`5b4172dd`,
  `5770e699`) and pushed at 03:19Z after main's run 36212856885 went green. CI run
  **36214441654** is live.
- **The back-navigation cost of `staleTimes.dynamic: 0`, as owed.** This was measured before the
  rebase on production builds, and it's also in `docs/sessions/S112-router-staleness.md` §1.
  Return to a page visited under 30s ago, median of 3:

  | Profile | Tab revisit, main → dynamic 0 | Tile then tab | Back arrow (`router.back`) |
  | --- | --- | --- | --- |
  | unthrottled | 52 → 369 ms | 51 → 399 ms | 62 → 78 ms |
  | LTE, 150 ms RTT | 48 → 392 ms | 51 → 349 ms | 70 → 86 ms |
  | Fast 3G | 51 → **639 ms** | 50 → **633 ms** | 66 → 47 ms |
  | Slow 3G | 51 → **2,129 ms** | 54 → **2,121 ms** | 54 → 55 ms |
  | RSC bytes | 0 → 4,575 B | 0 → 7,986 B | 0 → 0 |

  That's why `dynamic: 0` is **not** on this branch: the reorder alone fixes the markup defect
  (m-photos 43/43; the new human-path test is red on main's build and green on the fix).

## BUILT BUT UNTESTED

_(none yet)_

## BLOCKED

_(none yet)_

## OWED TO PRODUCTION

_(none yet)_

## WHAT JOSH MUST CLICK

_(none yet)_

## BRANCHES

| Branch | Contains | CI | Ready to merge |
| --- | --- | --- | --- |
| `feature/s112-router-staleness` | markup save reorder + human-path e2e + measurement doc; rebased onto main `528bc76b` | not pushed yet — waiting for main's CI run 36212856885 | — |
| `feature/s112-staletimes-hold` | `staleTimes.dynamic: 0`, held by measurement | not pushed (ruled: push after the fix branch's CI clears) | **No — held** |
| `feature/s112-m-audit` | the S112 /m UI audit report (local commit `d71014ce`) | not pushed | docs only |

## Log

- 03:21Z — main CI green → fix branch pushed (run 36214441654). The 3c and audit-fix branches are
  **parked** on origin under an empty `[skip ci]` head commit. GitHub reads `[skip ci]` from the
  head commit only, so the work survives a restart and uses no CI slot. The next real commit on
  either branch runs CI for the whole branch. Audit fixes committed so far: F16, F20, F15, F10,
  F18, F14, F5, F4, F9, F6, F7. **F12 withdrawn:** M6M §2 names 34px colour swatches "the only
  permitted sub-44px target", so it was never a defect.
- 03:05Z (logged as 03:12 in error) — 3c built and committed locally on `feature/s112-markup-local-display` (`5ba64596`),
  stacked on the fix branch; build exit 0, tsc exit 0. 3a measured (in R1). Waiting on main CI to
  push and to run e2e.
- 02:58Z — ruling 3b enumeration done: export consumers need full res → R1, resize NOT built.
  Report and audit branches pushed with `[skip ci]`; Actions API shows 0 runs on both.
- 02:53Z — started. main is `528bc76b`. Fix branch rebased cleanly (`5b4172dd`, `5770e699`).
  CI run 36212856885 on **main** is live, so no fix-branch push and no local e2e yet (local
  fixtures share the `M6MP` prefix with CI's and delete each other's leftovers).
