# S111 — photo grid thumbnails (`feature/s111-photo-thumbnails`) — appended after every step

> Ruling: Josh, 2026-09-25 — "route ruled, thumbnail work approved to build". Route: Supabase Storage
> image transformation via `/render/image/` signed URLs; no `next/image`. 400×400 square; the grid never
> loads an original; load ahead ~2 screens desktop / ~12 mobile, reduced on a slow connection; uploads
> keep full resolution; the conversion tripwire must keep passing.

## Step T0 — branch

Cut from `main` at `ec8eb72a`. The conversion tripwire
(`e2e/desktop-photos-conversion-s111.spec.ts`) exists only on `feature/s111-photos-harden`, which carries
two migrations not yet on production — so it was **cherry-picked** (`4445d00b`, identical file) rather
than branching from harden. The two branches merge in either order without conflict and this branch does
not inherit the migrations.

## Step T1 — the route, measured (rebuild-test; same Supabase organization as production)

| probe | result |
| --- | --- |
| P3 single `createSignedUrl(path, ttl, { transform: 400×400 cover })` | **works**: JPEG 2,163,602 B → **11,870 B WebP 400×400** (Chrome and Safari Accept); **20,010 B JPEG** for `Accept: */*` |
| P1 batch `createSignedUrls` token, path swapped to `/render/image/sign/`, transform as query | **ignored — FULL image** (3000×4000, 454,952 B WebP) |
| P2 batch POST with `transform` in the body | **ignored — FULL image** (same) |
| P5 small images at 400×400 cover | **not enlarged**: 8×8 → 8×8, 211×46 → 211×46, 65×85 → 65×85 |

**Consequence:** a thumbnail token can only be minted **one Storage call per photo**. The batch call
the grid used (one call for all photos) cannot produce one. See T4 — this is what stopped the build.

**Real thumbnail sizes** (every image > 100 KB on rebuild-test, 400×400 cover, WebP as Chrome/Safari
receive it). Real photos only (13, originals 0.42–3.65 MB): **mean 29.7 KB, median 26.6 KB, max 61.7 KB**.
(PNG screenshots 7.8 KB.) Against a mean original of ~1.7 MB.

## Step T2 — ⚠️ NEW DEFECT, measured: HEIC photos invisible — and `/render/image/` DOES transcode HEIC

- **Transcodes: yes, measured.** `20190820_200921046_iOS.heic`, 3,654,530 B → **200 image/webp 61,694 B,
  400×400** (Chrome Accept), 200 image/jpeg 57,726 B for `*/*`. All 9 stored HEICs on rebuild-test
  rendered (sizes in T1's list: 15.6–61.7 KB). **So a thumbnail grid shows these photos for free.** The
  full-size views (markup canvas, /m viewer, share, chat) still load the raw HEIC and stay blank outside
  Safari; those need a real conversion + backfill.
- **Stored as HEIC:** the object's own recorded `mimetype` is **`application/octet-stream`** for all 9
  (the browser sent no type), so it is useless as a signal; the row's `mime_type` and the file name say
  HEIC. The query counts each signal separately so disagreements show.
- **Production-safe read-only count, per company and project, for Josh** (rebuild-test: 9 rows — 7
  `daily_logs`, 2 `photos`, all on "kitchen test", 2026-07-21/22):

```sql
SELECT c.name AS company, f.company_id,
       COALESCE(p.name, '(estimate ' || f.estimate_id || ')') AS project_or_estimate,
       f.category,
       count(*) AS heic_rows,
       count(*) FILTER (WHERE f.mime_type IN ('image/heic','image/heif')) AS by_row_mime,
       count(*) FILTER (WHERE o.metadata->>'mimetype' IN ('image/heic','image/heif')) AS by_object_mime,
       count(*) FILTER (WHERE f.file_path ~* '\.(heic|heif)$') AS by_name,
       count(*) FILTER (WHERE o.id IS NULL) AS object_missing,
       min(f.created_at)::date AS oldest, max(f.created_at)::date AS newest
FROM files f
JOIN companies c ON c.id = f.company_id
LEFT JOIN projects p ON p.id = f.project_id
LEFT JOIN storage.objects o ON o.bucket_id = 'project-files' AND o.name = f.file_path
WHERE f.is_deleted = false
  AND (f.mime_type IN ('image/heic','image/heif')
       OR o.metadata->>'mimetype' IN ('image/heic','image/heif')
       OR f.file_path ~* '\.(heic|heif)$')
GROUP BY c.name, f.company_id, project_or_estimate, f.category
ORDER BY heic_rows DESC;
```

**Not fixed** (ruling: measure only).

## Step T3 — built (commit `f5af775e`, plus this step's)

- `lib/photos/thumbnail.ts` — `THUMB_PX = 400`, `THUMB_TRANSFORM`, buffer policy (desktop 2 screens,
  mobile 12, mobile constrained 3), `rootMarginFor()`. Unit test `test/s111-photo-thumbnails.test.ts` 12/12.
- `lib/photos/use-lazy-src.ts` — one `IntersectionObserver` per (scroll root, margin), shared by every
  tile; root = the nearest `overflow-y: auto|scroll` ancestor (on /m that is `main[m-content]` — with the
  window as root, tiles below the container's fold are clipped and would never load early). Callback ref,
  element held in state, so a REMOUNTED tile (/m swaps link ↔ button in selection mode) is re-observed.
- `getSignedThumbnailUrls()` (`lib/services/files.ts`) — per-path `createSignedUrl` with the transform,
  16 in flight; failures logged with path and cause. `getProjectPhotos(id, { thumbnails: true })` adds
  `thumbUrl` (derivative's thumbnail when annotated, D-31; the original's THUMBNAIL if that cannot be
  signed — never the original). Opt-in: chat and the viewer do not pay for it.
- Desktop grid → `GridThumb` (client) with the shared hook; /m `Tile` → `thumbUrl` via the shared hook.
  `displayUrl` is unchanged and still the FULL file for Share, the viewer and chat.
- **Uploads untouched** — full resolution; `prepareImageForUpload()` HEIC→JPEG at 0.82 unchanged.
- New e2e: `desktop-photos-thumbnails-s111`, `m-photos-thumbnails-s111`, fixture `thumb-fixture.ts`
  (80 real tiny photos, distinct paths, own project, swept by tag). `m-photos` A-23l **inverted, not
  deleted**: the tile src is now `/render/image/sign/…` (old assertion quoted in place).
- Local: unit suite **118 files / 1652 passed**; `next build` **BUILD_EXIT_LINE=0**; tsc 0; eslint 0.

### What the new e2e measured (production build, rebuild-test)

- **Desktop 1280×600:** first view **40 of 80** loaded; **0** loaded beyond 2 screens, **0** pending
  inside 2 screens; wheel-scrolled to the end → **80 of 80**; storage image requests **80 thumbnails,
  0 originals**.
- **/m 402×500, normal connection:** 80 of 80 get a src without scrolling (12 screens covers 80);
  **0 originals** requested.
- **/m, data-saver reported:** **30 of 80** without scrolling — the buffer shrank. (A first version
  scrolled with `scrollIntoView` on the last tile: that JUMPS the container, and the tiles leapt over
  sat > 3 screens above the new position, correctly unloaded — 65 of 80. The spec now scrolls a screen
  at a time, as a person does.)
- **Tripwire** `desktop-photos-conversion-s111`: passes (3 files / 2 images; Photos rows 2).

### The buffers, in tiles and MB (layout from D6; thumbnail bytes from T1 — mean 29.7 KB, max 61.7 KB)

Tiles per screen = columns × (scroll-root height ÷ row pitch). Root heights: desktop = window; /m =
`main[m-content]`, measured 361 px at 500 tall → 139 px of chrome → 735 px at 874, 661 px at 800.

| surface | tiles / screen | buffer | tiles ahead | MB ahead, mean (max) |
| --- | --- | --- | --- | --- |
| desktop 1440×900 (6 × 193.7 px) | 27.9 | 2 screens | **56** | **1.7 MB** (3.4) |
| desktop 1920×1080 (9 × 182.4 px) | 53.3 | 2 screens | **107** | **3.2 MB** (6.6) |
| /m 402×874 (3 × 124.3 px) | 17.7 | 12 screens | **213** | **6.3 MB** (13.1) |
| /m 360×800 (3 × 110.3 px) | 18.0 | 12 screens | **216** | **6.4 MB** (13.3) |
| /m 402×874, constrained | 17.7 | 3 screens | **53** | **1.6 MB** (3.3) |

The visible screen loads on top of the buffer. For comparison, the old grid loaded **every** tile at
full size: 216 tiles × ~1.7 MB ≈ 370 MB.

**Slow-connection detection:** `navigator.connection` (Network Information API): constrained when
`saveData === true` or `effectiveType` is `slow-2g`, `2g` or `3g`. ⚠️ **Chromium only — Safari (every
iPhone) and Firefox expose nothing**, so an iPhone always gets the full 12-screen buffer; that is a blind
spot, not a detection. **What the reduced buffer costs:** 3 screens ≈ 53 tiles ≈ 1.6 MB queued instead
of ≈ 6.3 MB; on a connection slow enough to trigger it, a user who flings faster than the buffer refills
sees grey placeholders that fill in behind them — about one screen (~0.5 MB) per 2.7 s at 1.6 Mbps.

## Step T4 — ⛔ STOPPED: per-photo signing exhausts Storage's database connections

Stop rule 2 — a decision the ruling did not settle. The ruled route (signed `/render/image/` URLs)
needs one Storage API call per photo (T1), and each call is a database query inside Storage.

**Measured on rebuild-test, 80 photos per page, nothing else running:**

| signing | wall time | failures |
| --- | --- | --- |
| today's batch call (full-size URLs only) | **82 ms** | 0 |
| per photo, 16 in flight, 1 page | 4,120 ms | 0 |
| per photo, 8 in flight, 1 page | 1,697 ms | 0 |
| per photo, 4 in flight, 1 page | 2,925 ms | 0 |
| per photo, 16 in flight, **3 pages at once** | 5,551 ms | **7 / 10 / 5 of 80** |
| per photo, 4 in flight, **3 pages at once** | 16,543 ms | **23 / 13 / 29 of 80** |

Every failure: **"Too many connections issued to the database"**. Three people opening a grid at once
loses tiles; throttling makes it worse (longer overlap). In the e2e runs the same error also failed
**uploads** (`upload 5`, `upload 63`) — the exhaustion is shared, so the grid would degrade uploads for
everyone. Even a single-worker e2e run logged **7** such failures (plus 35 expected "Object not found"
for annotated fixtures whose derivative is deliberately absent, each a wasted call).

Rebuild-test may run on smaller compute than production; production's pool is not measured. The shape
does not change: calls scale with photos × concurrent viewers, against 1 call today.

### Options for Josh

- **A — stored thumbnails (recommended).** Write one `{file_path}.thumb.webp` per photo, ONCE (generated
  from the `/render/image/` output, so HEIC is transcoded too), and have the grid **batch-sign the thumb
  paths — one call, ~82 ms**. Originals untouched (ruling 6 holds: nothing is discarded). ~30 KB per
  photo. Needs: a generation step on upload (server-side, shared by both surfaces), a storage-policy arm
  for `.thumb.webp` (same shape as the derivative arms, with the assignment check), and a **backfill of
  existing production photos** (a production write — Josh's).
- **B — sign on demand, windowed.** Tiles entering the buffer ask an API route for their URLs in pages.
  Same N Storage calls, spread over scrolling; still exhausts under concurrent users, just later.
- **C — mint the tokens in our server** with the project JWT secret. Zero Storage calls, but it depends
  on Supabase's internal token format, puts that secret in Vercel, and breaks silently if Supabase
  changes signing. Not recommended.
- **D — keep per-photo signing, throttled.** Measured above: fails with 3 concurrent pages. Not acceptable.

**Nothing is merged; the branch is pushed so the work survives.** The committed grid code is the
per-photo design and **must not ship as is**.

## Same defect elsewhere (not in this build's scope — recorded)

Full-size images rendered as small thumbnails also on: the /m viewer filmstrip
(`photos/[fileId]/viewer.tsx:548`), chat composer and thread thumbnails (`components/chat/*`), and the
site-visit record grid (`components/site-visits/site-visit-record.tsx:431`, one URL round trip per photo).
→ **RULED: point all three at thumbnails, separate commits.** Done in Step T8.

---

# RULED [Josh, 2026-09-25]: OPTION A — store one derived thumbnail per photo

> _"B and D are disqualified by your own numbers … C puts the JWT secret in Vercel … A converts a
> per-view cost into a one-time per-photo cost, and it fixes the HEIC rows as a side effect."_

## Step T5 — the read rule, negative test FIRST (ruling 2)

`test/s111-thumbnail-read-floor.live.ts` (`23c0f19a`) ran **before any policy existed**: unassigned
subcontractor, a plain and an annotated thumbnail on a project it is not on, measured three ways
(download, single sign, and the BATCH sign the grid uses):

| run | unassigned | assigned CONTROL |
| --- | --- | --- |
| BEFORE the policy | **0 / 0 / 0** (both) | **0 / 0 / 0 — red, as predicted**: nothing granted a non-owner a `.thumb.webp` |
| AFTER `20261810000000` | **0 / 0 / 0** | **1 / 1 / 1** |

- `20261810000000_s111_thumbnail_read_policy.sql` (`ef4d4d27`) — a **new, separate policy**,
  `project_files_select_thumbnail_assigned`: SELECT, non-client, name matches the thumbnail pattern, and
  the original's project is one the caller is **assigned to — checked directly**, not borrowed from
  `files` RLS. **Why separate:** this branch is cut from `main`, where `project_files_select_non_client`
  is still pre-hardening; a DROP/CREATE of it here, applied after `20261800000000`, would silently undo
  that hardening. Permissive policies OR, so this one can only add.
- **Self-containment, measured** (rolled-back `DO` block, `files` SELECT widened to `USING (true)`):
  unassigned **0**, CONTROL assigned **1**. Residue 0.
- Nothing grants a non-owner WRITE on a thumbnail — the server writes them with the service role.
  (Pre-existing and unchanged: an assigned crew member can already overwrite a photo's own bytes, A6, so
  planting a fake thumbnail on their own project is no new capability.)
- Applied to rebuild-test with the two harden migrations copied in **temporarily and uncommitted**, because
  the CLI refuses a push when the remote holds versions the branch lacks. Its suggested fix,
  `migration repair --status reverted 20261790000000 20261800000000`, would have falsely recorded those
  two as reverted — **not run**. Dry run listed exactly `20261810000000`.

## Step T6 — built

- **Name:** `{path}.thumb.webp` for a plain photo; `{path}.m{8-hex markup fingerprint}.thumb.webp` for an
  annotated one (`packages/shared/utils/markup.ts` `thumbPathFor`). ⚠️ **The fingerprint is a deliberate
  addition to the ruled name.** One fixed name would go STALE when a markup save's regeneration failed or
  never ran: the grid would show the old unmarked thumbnail beside the "marked up" indicator — #129's
  silent loss. With the fingerprint, a new markup is a new name; until its thumbnail exists the grid falls
  back to the full derivative. A stale thumbnail can never be selected. Both forms end `.thumb.webp`.
- **Generation** (`lib/photos/thumbnail-server.ts`): source = the display file (derivative when
  annotated), through `/render/image/` (400×400 cover, WebP), stored with the service role; older
  versions of the same photo pruned. Triggered on **every displayable write**:
  - `uploadFile()` — every client upload (17 caller files), fire-and-forget `POST /api/photos/thumbnail`;
  - `saveMarkup()` — both surfaces' markup editors (desktop and /m call the same function);
  - `POST /api/estimates/[id]/files` — site-visit photos, generated in the route.
  - Not hooked, recorded: `api/bid/[token]/files` and `api/portal/messages` accept images that no grid
    shows.
- **The route** reads the row under the CALLER's session (403, never 404, when it cannot), then
  generates. It grants no read; the read is the policy above.
- **The grid** signs thumbnails in the **same single batch call** as the originals — no extra Storage
  request per view. `thumbUrl = signed thumbnail ?? displayUrl`.
- ⚠️ **RULED fallback (3):** no thumbnail → the full display file. Asserted by
  `desktop-photos-thumbnails-s111` "no thumbnail → the full file": 80 of 80 visible.
- **Deletes:** both permanent-delete paths remove the photo's thumbnails (best-effort; trash purge
  lists every version, the client path removes the two names it can compute). Pre-existing and not
  fixed: they already leave `.markup.jpg` derivatives behind.
- **Uploads keep full resolution** — `prepareImageForUpload()` unchanged.

## Step T7 — what rebuild-test's Storage would not take, measured — and what changed

Rebuild-test: `max_connections` **60**; Storage holds a pool of **~5** connections shared by every
upload, sign and render. Its refusal is **429, code `SlowDown`, "Too many connections issued to the
database"**.

1. **/m's 12-screen buffer fired all 80 thumbnail loads at once; 22–33 of 80 were refused** — Chrome
   reports the JSON refusal as `net::ERR_BLOCKED_BY_ORB`, so the tiles showed broken. **Fix:** loads go
   through a queue, **6 in flight**, nearest first, and a failed THUMBNAIL load retries with backoff (3×).
   The buffer is unchanged — it just does not all start in the same instant.
2. **The page's one batch sign was itself refused once** → every tile had no URL (an empty grid, the
   S110 shape). **Fix:** `getSignedUrls()` retries on SlowDown (2×) and logs a final failure.
3. **Generation / the fixture drew SlowDown and a 502 even at 2 in flight.** **Fix:** generation and
   the backfill retry 429/502/503/504 with backoff (writes are idempotent upserts), and the backfill runs
   **one photo at a time** by default, paced.
4. ⚠️ **A regression my retry introduced, caught by measurement:** the fallback tile of an undecodable
   HEIC original fails in Chrome for good, and retrying it re-downloaded the multi-MB original **4×** —
   **236 requests / 409.6 MB for 80 photos**. **Fix (`b4d7b7e2`): only thumbnails retry;** a full-file
   fallback gets one attempt. Re-measured: 80 requests / 133.49 MB.
   ⚠️ **That fix was itself wrong, and CI caught it** (run 36190114550 on `1536e3ce`): with fallbacks never
   retried, Storage throttling left **74–76 of 80** fallback tiles permanently broken — an invisible photo.
   _Superseded rule, quoted:_ "only thumbnails retry". **Final rule: everything retries except a HEIC/HEIF
   full file** (the only thing measured to fail for good). Re-measured locally: fallback runs made 84 and
   82 requests for 80 photos — the refusals retried and recovered; 13/13 passed.
5. **Test hygiene:** 111 orphaned thumbnails were found — fixture sweeps ignored `remove()`'s result
   under SlowDown, and seven specs' teardowns removed only the original of an app upload (which now has a
   thumbnail). Sweeps now check and retry; teardowns use `e2e/storage-cleanup.ts` `withThumbnails()`.
   Residue removed; **0 orphans** after.

⚠️ **Production's pool is not measured.** If production runs the same small compute, (1)–(3) are what
its users would hit, not just the tests.

## Step T8 — the other three surfaces (ruling 6), one commit each

All three were straightforward; none was forced.

| surface | commit | change |
| --- | --- | --- |
| /m viewer filmstrip | `6e200f1f` | 52px squares use `thumbUrl ?? displayUrl`; the stage keeps the full file |
| chat | `5d2a864e` | picker, attachment chips and message tiles use `thumbUrl ?? displayUrl`; links, the file sheet and share keep the full file. A client has no thumbnail read arm → falls back to the full file (correct, no saving) |
| site-visit record | `51264874` | the per-file `/url` route signs `[file, thumbnail]` in ONE batch call (still one Storage request per file) and returns `thumb_url`; contract + registry updated; the S109 source guard `src={p.url}` **inverted, not deleted** (old pattern quoted) |

## Step T9 — measured before / after (80 real photos, same build, rebuild-test)

Fixture: 80 photos copied from the 14 real originals on rebuild-test (mean 1.63 MB; iPhone HEIC and JPEG),
**133.49 MB** of originals; a site visit with 12 real captures (21.48 MB). "Before" = no thumbnails, so
every surface falls back to the full files — the old behaviour's bytes. Bytes are response bodies the
browser received (Resource Timing is blind cross-origin).

| surface | before | after |
| --- | --- | --- |
| desktop grid 1440×900, first view | all 80 originals, **133.49 MB** (the old grid loaded every tile eagerly) | 72 thumbnails, **2.00 MB** |
| desktop grid, scrolled to the end | 80 / 133.49 MB | 80 / **2.20 MB** |
| /m grid 402×874, on open (12-screen buffer) | 80 / 133.49 MB | 80 / **2.20 MB** |
| /m viewer + filmstrip of 80 | 80 / 133.49 MB | 81 / **5.68 MB** (80 thumbnails 2.20 MB + the photo on stage, full, 3.49 MB) |
| chat photo picker (80) | 80 / 133.49 MB | 80 / **2.20 MB** |
| site-visit record (12) | 12 / 21.48 MB | 12 / **0.31 MB** |

The HEIC photos, invisible in Chrome before, display after — their thumbnails are WebP.

## Step T10 — the backfill, run on rebuild-test (a trial, not production)

`scripts/s111-thumbnail-backfill.cjs`. **Dry run by default; `--apply` required; `--project-ref` must match
the URL** (measured: a production ref against the rebuild-test URL → `REFUSING`, exit 1).

| run | result |
| --- | --- |
| dry run | 127 image rows, 178.4 MB of originals, 0 thumbnails present; wrote nothing |
| `--apply`, **killed with SIGINT after 20 s** | 14 thumbnails written, **0 partial / empty objects** |
| `--apply` again | **skipped the 14**, generated 106, 5 source objects missing, 2 sources Storage cannot render |
| `--apply` a third time | 120 present, **0 generated**, exit 0 — idempotent |

**Generation time per photo** (one at a time): **median 843 ms, p95 1,254 ms, max 1,381 ms** (CI's
e2e fixture, tiny images: median 619 ms). **Storage added per photo:** mean **25.3 KB** across this
trial; **29.7 KB** mean (median 26.6, max 61.7) for real iPhone photos (T1).

**If interrupted partway:** safe. Each photo is one complete upload (a Storage object exists only once its
upload finishes — measured 0 partial objects after the kill); photos done are skipped on the next run by
one batch existence check per 500 rows; the grid is correct throughout because a photo without a
thumbnail shows its full file. Missing and unrenderable sources are listed, counted apart, and do not
fail the run.

### ⛔ The production backfill — Josh runs it. Row count and MB first (read-only):

```sql
SELECT count(*) AS image_rows,
       count(*) FILTER (WHERE f.markup_data IS NOT NULL
                          AND jsonb_array_length(COALESCE(f.markup_data->'shapes','[]'::jsonb)) > 0) AS annotated,
       count(*) FILTER (WHERE o.id IS NULL) AS original_object_missing,
       round(sum(COALESCE((o.metadata->>'size')::bigint, f.file_size))/1048576.0, 1) AS originals_mb,
       round(count(*) FILTER (WHERE o.id IS NOT NULL) * 29.7 / 1024.0, 1) AS est_thumbnail_mb_at_29_7_kb
FROM files f
LEFT JOIN storage.objects o ON o.bucket_id = 'project-files' AND o.name = f.file_path
WHERE f.is_deleted = false AND f.mime_type LIKE 'image/%';
```

(rebuild-test: 35 real rows → 23.4 MB of originals, ≈0.9 MB of thumbnails.) Time ≈ rows × ~0.85 s at the
default one-at-a-time. Then, with PRODUCTION's URL and service key in the environment:
`node scripts/s111-thumbnail-backfill.cjs --project-ref jwkcknyuyvcwcdeskrmz` (dry run: same numbers,
writes nothing), then the same with `--apply`. ⚠️ Run it outside working hours: it shares Storage's small
pool with the crew's uploads.

## Owed to production (none applied by this session)

1. `20261790000000` + `20261800000000` — **together**, from `feature/s111-photos-harden` (ruling C).
2. `20261810000000` — thumbnail read policy, this branch. Policy-only; governs no row. Order-independent
   of (1) by construction (a separate policy).
3. The backfill — **after** (2) and after this branch is deployed (the app must be writing thumbnails
   for new photos first, or the backfill races new uploads it would simply redo).

⚠️ `apps/web/lib/schema-fingerprint-baseline.json` / `scripts/.db-fingerprint.json` say latest migration
`20261800000000` on the harden branch and `20261810000000` here: they WILL conflict at the second merge.
Take `20261810000000`.

