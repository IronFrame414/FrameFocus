# S112 — ruling 3c/3d: show the markup a save just built

**Branch:** `feature/s112-markup-local-display`, stacked on `feature/s112-router-staleness`.

**What changed.** `saveMarkup()` keeps the JPEG it just flattened (`lib/photos/local-derivative.ts`),
keyed by the fingerprint of `markup_data` **as stored**. The UPDATE now returns the stored row in the
same request, because jsonb reorders keys. The `/m` viewer's stage and filmstrip show that local copy
while the server's `PhotoRecord.markupFingerprint` matches it; otherwise they show the stored
derivative, as before.

**The filmstrip half matters.** Right after a save the new thumbnail doesn't exist yet (its name
carries the new fingerprint). So the server's fallback for the filmstrip square was the same full
derivative the stage stopped downloading, and would have brought the 2 MB back.

## 3d — before / after

Measured with production builds on the same base: before = `feature/s112-router-staleness` @
`e2e21cf9`; after = this branch @ `5ba64596`. The photo is a real 12 MP iPhone JPEG (4032×3024,
2.16 MB). Crew saves one box through the UI, and the clock runs from the Save tap.

| Condition | Save → marked photo visible, before → after | GETs of its own `.markup.jpg` after Save | Bytes downloaded after Save |
| --- | --- | --- | --- |
| Local (CPU 1×, no throttle) | 2,725 → **2,593 ms** | 1 → **0** | 2,095,107 → **3,022** |
| 1 Mbps uplink (CPU 4×, LTE 4 Mbps down, 150 ms) | 25,346 → **20,994 ms** | 1 → **0** | 2,107,482 → **15,382** |
| Fast 3G (CPU 4×, 1.44 Mbps down, 562 ms) | 42,142 → **29,871 ms** | 1 → **0** | 2,120,016 → **28,038** |

The stage `src` after Save is `https://…markup.jpg` before and **`blob:`** after, in all three
conditions.

**What's left of the time is the upload** (2.09 MB) and the flatten. That's ruling 3's
display-size question, which is **not built**: an export consumer needs full resolution today (see
the overnight report, R1). The before run's one derivative GET per save is also the control for the
counter: the probe that reads 0 after is the same probe that read 1 before.

**Tests.** `e2e/m-photos.spec.ts` "[S112] the markup save, by taps" now also asserts the stage `src`
is `blob:` and that there are **zero** GETs of the target's own derivative between Save and the
marked viewer. Run locally against this build, all 43 m-photos tests passed. One run failed at the
derivative upload with Supabase's `Too many connections issued to the database`: shared-rebuild-test
contention. The app refused to navigate and showed its `derivative_failed` notice, as designed. A
rerun passed (2/2).
