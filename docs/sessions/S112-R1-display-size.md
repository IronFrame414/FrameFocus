# S112 R1 — display-size derivative, full-resolution export

**Ruled [Josh, S112 R1]:** option 1, client-side, 2,048 px long edge. Store display-size; regenerate
full resolution on export from original + `markup_data` through the one rasteriser
(`lib/markup/flatten-shapes.ts` → `lib/markup/flatten-image.ts`). Conditions (a) fallback, (b) no
backfill, (c) measure the export path on the same three conditions.

## Measured — production build of `feature/s112-display-size`

Harness: `apps/web/e2e/m-s112-r1-measure.spec.ts` (runs only with `S112_MEASURE=1`). The same real
12 MP iPhone JPEG (2,163,602 B) the 3d table used, a fresh copy per condition on a crew project;
crew draws one box through the UI and taps Save (clock: tap → marked photo on the stage), then taps
the viewer's Save-to-device (clock: tap → the browser's download event — the whole export, flatten
included). Stored derivative and exported file read back and their JPEG dimensions parsed.

| Condition | Save → marked photo visible: 3d (full-res store) → **R1** | Stored `.markup.jpg` | **Export (Save to device)** | Exported file |
| --- | --- | --- | --- | --- |
| Local (CPU 1×, no throttle) | 2,593 → **2,536 ms** | 559,442 B, 1536×2048 | **1,826 ms** | 2,090,890 B, **3024×4032** |
| 1 Mbps uplink (CPU 4×, LTE 4 Mbps down, 150 ms) | 20,994 → **8,236 ms** | 559,442 B, 1536×2048 | **7,954 ms** | 2,090,890 B, **3024×4032** |
| Fast 3G (CPU 4×, 1.44 Mbps down, 562 ms) | 29,871 → **11,209 ms** | 559,442 B, 1536×2048 | **14,827 ms** | 2,090,890 B, **3024×4032** |

(Width×height as stored. The original is 4032×3024 with an EXIF rotation tag; a canvas draws it upright, so the derivative and the export are portrait with the rotation baked in — the same pixel count, full resolution.) The 3d
column is the overnight measurement on the base branch, same photo and conditions, a different
harness; the R1 column was measured twice this session (first run 2,645 / 8,395 / 11,188 ms save,
1,745 / 7,720 / 14,911 ms export).

**The trade, as ruled:** a save uploads 559 KB instead of 2.09 MB, so the slow-link save is about
2.5× faster. An export now pays the flatten plus the original's download — 1.8 s local, 15 s on Fast
3G. Before R1 the viewer's "Save" was an anchor to a cross-origin signed URL, whose `download`
attribute browsers ignore, so it opened the image rather than saving it.

## (a) Fallback — measured, not assumed

| Case | What was exported |
| --- | --- |
| Regeneration FAILS (the original's bytes refused by the harness), mark list intact | the stored derivative: 559,442 B, 1536×2048, in 235 ms, with the note "The full-resolution version could not be built — this is the display-size marked-up image." |
| `markup_data` REMOVED from the row, derivative still in storage | the stored derivative: 559,442 B, 1536×2048, in 1,071 ms |

**The second case failed before a fix made during this measurement.** The /m viewer and grid were
never offered the stored derivative when the row had no mark list (`fallbackUrl` is null whenever
`hasMarkup` is false), so they exported the **unmarked original, silently**. Now resolved at export
time (`storedDerivativeResolver`). Nothing in the app clears `markup_data` while leaving a
derivative (the only `markup_data: null` write is a new-file insert), so this case is lost data by
definition. Desktop Files already handled it. **Chat now does too** [Josh Q4]: it passes the file's ID, never its path, and `/api/files/signed-url?fileId=` resolves the path from the row under the caller's RLS (unreadable row → the same 403, no Storage call). D-31's guard is unchanged and green.

## (b) Mixed content, for a user

Derivatives saved before R1 stay full resolution; new saves are 2,048 px. What a person notices:

- **Export (Save, Share, Download): no difference.** Every export rebuilds from the original at full
  resolution whichever size is stored.
- **Viewing: none at normal size.** 2,048 px covers every surface measured in the overnight 3a table
  un-zoomed except a portrait photo on a 1440p Retina desktop. Zoomed past ~1.2× in the /m viewer, a
  newly saved marked photo is softer than an old one; "show original" stays full-res.
- **Fallback exports differ**: an old photo's fallback is full-res, a new one's is 2,048 px.
- **Client portal and PDFs** embed the stored derivative, so newly marked photos appear there at
  2,048 px (print-adequate; the delivery PDF draws 692×517 px at 300 dpi).

## Residuals

1. ~~**Chat**, for a row that lost its `markup_data`, still exports the unmarked original.~~ **CLOSED
   [Josh Q4]:** done by file ID through the shared helper (`storedDerivativeResolverForFile`); chat
   never touches a path and D-31 is intact. Covered by unit tests of the route and the helper; not yet
   exercised in a browser against the live route.
2. **Web Share on iOS after a 12 MP rebuild** is not verified on a device; a share that outlives the
   tap's activation now says "tap Share again" (the built bytes are kept, so the second tap is
   instant).
3. **48 MP originals** exceed iOS Safari's canvas limit, so they always export the display-size
   fallback, with its note.
