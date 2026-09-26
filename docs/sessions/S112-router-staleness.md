# S112 — "mutate, then go back to a page the client holds": fix, cost, and the save profile

**Branches:**

- `feature/s112-router-staleness` — the reorder, the human-path e2e, and this doc. Ship-ready.
- `feature/s112-staletimes-hold` — `staleTimes.dynamic: 0`, **held** (item 1 below).
- **Nothing is pushed.**

**Instrument:** local production builds (`next build && next start -p 3000`) against rebuild-test.

- Each build was checked in its compiled router chunk:
  - main's baseline reads `1e3*Number("30")`
  - the hold build reads `Number("0")`
  - the reorder-only build reads `Number("30")`
- Each server was confirmed as the sole listener on :3000 before its numbers were read.
- No CI run was live or queued at any write, checked via the Actions API.

## 1. `staleTimes.dynamic: 0` — MEASURED MATERIALLY WORSE ON SLOW NETWORKS; NOT SHIPPED

A return to a page visited under 30s ago. Median of 3, from the tap until the new header appears.

| Profile | Tab revisit, main → dynamic 0 | Tile then tab, main → dynamic 0 | Back arrow, main → dynamic 0 |
| --- | --- | --- | --- |
| unthrottled | 52 → 369 ms | 51 → 399 ms | 62 → 78 ms |
| LTE (150 ms RTT, 4 Mbps down) | 48 → 392 ms | 51 → 349 ms | 70 → 86 ms |
| Fast 3G (562 ms RTT) | 51 → **639 ms** | 50 → **633 ms** | 66 → 47 ms |
| Slow 3G (2 s RTT) | 51 → **2,129 ms** | 54 → **2,121 ms** | 54 → 55 ms |
| RSC bytes | 0 → 4,575 B (`/m/projects`) | 0 → 7,986 B (`/m/field`) | 0 → 0 |

**The payload is small. The cost is latency:** one round trip per revisit where there used to be
none. /m has no loading indicator during that wait (audit F1), so on a jobsite connection every tab
revisit becomes a 0.6–2s dead tap.

**It also does not cover Back.** `router.back()` (the /m arrow) and the phone's back gesture go
through `restore-reducer.js`, which reuses the in-memory cache and never reads `staleTimes`. The
back-arrow column above is unchanged, with 0 requests in both builds.

**Instrument corrections along the way.** Two probes were wrong before they were right, and neither
produced a reported number:

1. Matching an `RSC` request header in CDP counted 0 on runs that visibly fetched.
2. `resp.body()` drops streamed RSC bodies.

The bytes above come from `route.fetch()` reading each full body, with navigation fetches
separated from prefetches by the `next-router-prefetch` header.

## 2. The reorder — `markup-canvas.tsx`: push first, then refresh

`action-queue.js` discards a pending action when a navigation arrives. The old
`refresh(); push()` therefore never applied its refresh. A refresh dispatched after the push is
queued behind it instead.

**Verified alone, with the default `staleTimes` of 30:**

- `m-photos.spec.ts`: **43/43 passed**, `E2E_EXIT_LINE=0`.
- Every back-gesture step after a save shows the saved state: the reopened editor, the post-save
  viewer, the first editor, the pre-save viewer (1 box, indicator present).

**The markup defect is fixed without item 1.** It was also the only refresh-then-navigate call site
in the app. `co-create-form.tsx:117-118` already navigates first.

## 3. The human-path e2e — `m-photos.spec.ts`, "[S112] the markup save, by taps"

The test takes one launch `goto('/m')`, the PWA start_url, and taps only after that. It asserts
that the elapsed time stayed under 30s, so it can't pass for the wrong reason.

**Control:**

- **Red** on main's build: `E2E_EXIT_LINE=1`, no markup indicator after Save.
- **Green** with the fix: `E2E_EXIT_LINE=0`.

## 4. The three storage migrations — untouched

## 5. The markup save — what the ~6 seconds is (measured, not fixed)

These are real 12 MP iPhone JPEGs (4032×3024, 2.16 MB, portrait after EXIF). Crew draws one box
through the UI, and the timeline runs from the Save tap. "Phone" means a 4× CPU throttle on this
container, which is only a proxy: a current iPhone's CPU is closer to 1×.

| Step (critical path unless noted) | Unthrottled, CPU 1× | CPU 4×, LTE 1 Mbps up |
| --- | --- | --- |
| `OPTIONS` + `PATCH files.markup_data` | 0.1 s | 0.2 s |
| Re-read the original for flatten | disk cache, 0 bytes | disk cache, 0 bytes |
| **Flatten: decode + draw 12 MP + JPEG encode (q 0.92)** | **1.5 s** | **3.2 s** |
| **`OPTIONS` + upload `.markup.jpg`, 2,092,439 B** | 0.4 s (local network) | **17.4 s** |
| Navigate to the viewer (RSC, 4.7 KB) | 0.7 s | 0.6 s |
| **Viewer re-downloads the same 2.09 MB derivative to show it** | 0.2 s | **4.4 s** |
| **Save → marked photo visible** | **2.9 s** | **25.8 s** |
| Thumbnail (`POST /api/photos/thumbnail`), fire-and-forget, **off** the critical path | 3.8 s | 0.9 s |

On Fast 3G (675 kbps up) the same save took **47.4 s**.

- **Round trips on the critical path: 4.** The files PATCH (with a CORS preflight), the upload
  (with a preflight), the viewer's RSC fetch, and the derivative download.
- **The thumbnail contributes nothing to the wait.** It's never awaited
  (`request-thumbnail.ts:5-17`), and it runs server-side after the upload.
- **The flattened full-resolution JPEG is essentially all of it.** It costs CPU to build, 2.09 MB
  to send, and the same 2.09 MB to fetch back for display. The phone already holds the original
  and has just drawn the marks. Josh's ~6s fits:
  - roughly 1.5–3 s of flatten on a phone
  - 2–3 s to upload 2 MB at a typical 5–8 Mbps LTE uplink
  - about 1 s to navigate and re-download

  On a weak jobsite uplink it grows linearly with the 2 MB.

The temporary rows (`S112PROFILE-*`) and all 9 objects the saves created were removed:
`S112PROFILE rows left: 0`.
