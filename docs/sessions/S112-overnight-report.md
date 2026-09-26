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
shrink to display size, so the 47s Fast 3G save drops by the upload share. The 3a number is below,
so the ruling can be applied without another measurement.

## DONE AND PROVEN

_(none yet)_

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

- 02:58Z — ruling 3b enumeration done: export consumers need full res → R1, resize NOT built.
  Report and audit branches pushed with `[skip ci]`; Actions API shows 0 runs on both.
- 02:53Z — started. main is `528bc76b`. Fix branch rebased cleanly (`5b4172dd`, `5770e699`).
  CI run 36212856885 on **main** is live, so no fix-branch push and no local e2e yet (local
  fixtures share the `M6MP` prefix with CI's and delete each other's leftovers).
