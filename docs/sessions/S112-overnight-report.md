# S112 overnight report

**No production issue found.** Nothing on production was touched, queried or migrated, by rule.

## Read this first (60 seconds)

- **Ready to merge, CI green, no migrations,** in this order:
  1. `feature/s112-router-staleness`: the markup-vanishes-after-save fix and its human-path test.
  2. `feature/s112-markup-local-display`: 3c. The save shows its own image; −2 MB per save, and
     Fast 3G drops from 42.1 s to 29.9 s.
  3. `feature/s112-audit-fixes`: 16 audit fixes, each measured before and after.
- **Proven, CI green, but NOT mergeable:** `feature/s111-project-role`. The Project Executive's money reads and
  Q9 payments are enforced in the database, proven with row counts and a sabotage run. But the UI
  doesn't show the role its money yet, and its two migrations need production first.
- **Needs your ruling:** R1 (derivative size: an export consumer needs full resolution, so the
  resize is not built), R2–R6 (audit items the audit marked for a ruling), R7 (HEIC).
- **One incident, mine, contained:** my Part One test identity briefly broke one chat test for
  every branch (a shared rebuild-test assignment). Found by CI, undone, and prevented from
  recurring. Details are in the Log at 05:24Z.
- **Production queries for you to run** are under OWED TO PRODUCTION (Q15 count, HEIC count, the
  role CHECK counts).

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

### R2 — Audit F1: `/m` loading feedback. You wrote it's "ruled and coming"; its FORM isn't in writing

**The question.** With the next screen's data held 3s, 20 of 20 taps showed nothing for 800 ms.
You've said loading feedback is ruled, but not which mechanism, so it isn't built.

**Options:**
1. `app/m/loading.tsx`: a skeleton inside the persistent shell. Next shows it on every
   navigation to a dynamic `/m` page.
2. A shell-level pending bar keyed to the router's navigation state.
3. Both.

**Recommendation: 1 first.** It's the Next-native mechanism, a single file, and it's what would let
the held `staleTimes.dynamic: 0` ship (its only cost was dead time with no feedback).

### R3 — Audit F2: every `/m` text field is 15px (the chat composer 13px), so iOS zooms on focus

**Options:**
1. Text inputs at 16px on `/m`.
2. `maximum-scale=1` in the viewport meta. This also disables pinch-zoom, which crews use on
   photos and small print.

**Recommendation: 1.** (The `/m` account form built tonight for F17 already uses 16px.)

### R4 — Audit F3: `m6m-muted #8792a8` fails contrast (3.13:1 on cards, 2.89:1 on the page)

It's the palette's caption/inactive-tab grey, used on almost every screen. The nearest same-hue
shade that passes both backgrounds is **`#687081`** (4.97 / 4.60). This is a design-token decision,
not built.

### R5 — Audit F8: crew and foreman see "No change orders." on a project that has some

Since the S121 read floor, crew and foreman can't read COs, but the hub still shows them the tile
and the list renders its normal empty state. `changes/page.tsx:21` still says the policy "has NO
role floor", which is stale.

**Options:**
1. Hide the tile for foreman/crew.
2. Keep the tile, and have the list show a role-worded notice ("Change orders are handled by the
   office"), like the sweep's `co-read` notice.

**Recommendation: 2**, since it matches the notice crew already get on a CO link. Either way the
stale comment gets fixed.

### R7 — Queue B: HEIC full-size — one-time conversion, or leave as is?

**The question.** Old HEIC objects display blank outside Safari (served as
`application/octet-stream`). Thumbnails already work.

**Options:**
1. **One-time conversion.** A script converts each HEIC through `/render/image/` to a stored JPEG
   (measured 2.88 MB at 3000×4000), then repoints `files.file_path`/`mime_type`, keeping the
   original. That's a production data change; it would get a dry-run count and an undo list, like Q15.
2. **Read-time transform.** The viewer, share and chat request `/render/image/` per view. No data
   change, but 1.2–2.5 s per open, and it's exactly the per-view signing that exhausted Storage's
   connections in S111.
3. Leave it. New uploads already convert, per the S111 ride-along.

**Recommendation: 1**, sized by query 4 in OWED TO PRODUCTION. If the production count is tiny,
3 is reasonable.

### R6 — Audit F11 is NOT fixable as proposed: the spec pins what the audit wanted to change

The hub Punch tile badge truncates ("1 mine · 1 a…") and is amber text on white at 2.15:1. My audit
proposed "count only", but e2e **A-11b** requires the tile to read `{mine} mine · {total} open`,
and §4.3 makes the tone amber.

**Options:**
1. Widen the badge (drop its `max-w-[60%]`) and keep the text.
2. Amend A-11b to show the count only.
3. Keep amber but darken the badge text (a palette decision, with R4).

**Recommendation: 1 now, 3 with R4.** The duplicated project title (F11's second half), the repeated
safety title (F22) and the unlabeled "—" (F23, whose em-dash is specified in A-10e) are design
calls and aren't built.

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

### Ruling 1 CI result — `feature/s112-router-staleness` GREEN

Run 36214441654: **591 passed, 10 skipped, 0 failed, 0 flaky** (40.4 min). That's one more test
than main's run: the new human-path test.

### Ruling 3c/3d — show the save's own image; before/after measured

`feature/s112-markup-local-display`. Same base, same real 12 MP iPhone photo, one box saved as crew
through the UI:

| Condition | Save → marked photo visible | GETs of its own `.markup.jpg` after Save | Bytes downloaded after Save |
| --- | --- | --- | --- |
| Local | 2,725 → **2,593 ms** | 1 → **0** | 2,095,107 → **3,022** |
| 1 Mbps uplink (CPU 4×) | 25,346 → **20,994 ms** | 1 → **0** | 2,107,482 → **15,382** |
| Fast 3G (CPU 4×) | 42,142 → **29,871 ms** | 1 → **0** | 2,120,016 → **28,038** |

- The stage `src` is `blob:` after, `https://…markup.jpg` before. The before run's 1 GET is the
  control for the counter.
- m-photos passed locally, 43/43. One run failed at the upload with Supabase's `Too many connections
  issued to the database`. That was **contention, not code**: the app correctly refused to navigate
  and showed its `derivative_failed` notice, and the rerun passed.
- The remaining time is the 2 MB upload plus the flatten, which is R1's resize (not built).
- Details: `docs/sessions/S112-markup-local-display.md`.

### Ruling 2 — hold branch parked and documented

`feature/s112-staletimes-hold` was rebased onto the rebased fix branch: one commit, `next.config.js`
only. It's parked on origin (`[skip ci]` head; it never needs CI to survive).
`S112-router-staleness.md` §Hold records what it contains, what it would and would not fix (Back is
untouched), and the **revisit condition: loading feedback on `/m`** (audit F1 / R2).

### S111 Part One — the Floor READ side and Q9, PROVEN on rebuild-test

Migrations **20261820000000** (role, CHECKs, time rank, Owner-only grant) and **20261830000000**
(13 read arms, 7 helpers, Q9) were applied with CI idle. They're verified live (CHECK text, 13
policies, rank 3). Types and the fingerprint baseline were regenerated; the drift detector passes
8/8 against it.

**FILL-7.2** — `test/s111-project-executive-floor.live.ts`, **7/7**, run as the real
`josh+qa-pe@worthprop.com` session. It's assigned to 2 of 17 projects. In every table the PE's rows
equal the Owner's rows on those projects:

| Table | Owner: on PE / off PE | PE: on / **off** |
| --- | --- | --- |
| project_financials (contract value) | 1 / 8 | 1 / **0** |
| project_budget_amounts (budgeted) | 4 / 75 | 4 / **0** |
| instrument_rates | 3 / 23 | 3 / **0** |
| change_orders (all authors) | 115 / 87 | 115 / **0** |
| CO line items / rows | 7 / 94, 7 / 82 | 7 / **0**, 7 / **0** |
| invoices (all authors) | 12 / 7 | 12 / **0** |
| invoice_lines (contained, measured) | 13 / 6 | 13 / **0** |
| estimates (converted only, Q7) | 2 / 27 | 2 / **0** |
| client_contract_amounts | 1 / 7 | 1 / **0** |
| client_payment_applications | 1 / 0 (+1 off made by the test) | 1 / **0** |

**Q9, the piece this build is judged on:**

- The Owner reads 3 payment headers, the rule admits 1, and the PE reads exactly that 1.
- The off-project payment and the unapplied-surplus payment, both made by the Owner for the test,
  are **invisible** to the PE. The surplus payment's own on-project application is visible (1); the
  off-project application is not (0).
- The PE **recorded** a payment on its own invoice and then read its header.
- A surplus is **refused** ("must apply the whole payment"), and so is an off-project invoice ("not
  on one of your projects"). The payment row count was unchanged (4 → 4) both times.
- All test payments were removed afterwards (0 leftover, 0 orphans, invoice statuses restored).

**FILL-7.3 sabotage:** I replaced the PE `project_financials` and `client_payments` arms with
unscoped ones. The proof went **red**: an 8-row leak on project_financials, and all 3 payment
headers visible, including both controls. After restoring the policies exactly as the migration
defines them it went **green** (7/7).

**Found and fixed on the way:** the first run failed only its control. The company held exactly one
payment, on the PE's own project, so "exactly the rule's set" was vacuously true. The harness now
creates its own negative payments.


### Queue A — the thumbnail read policy's "missing" Owner/Admin arm: NOT a defect (measured)

**The claim:** `20261810000000` requires `project_assignments`, so an Owner or Admin not assigned to
a new project would get no thumbnails.

**Measured, as real sessions on rebuild-test:**
- The seeded **Admin is assigned to 0 projects** and read **27 of 27** stored thumbnails.
- The Owner, assigned to 9, read the **2 of 2** on projects it isn't on.

**Why:** thumbnails are also covered by `project_files_select_non_client`, whose first arm is
`get_my_role() = ANY (owner, admin)` over **every object in the company folder**. Permissive
policies are OR'd, so the thumbnail policy only ADDS access for assigned staff.

**The other half of the question:** both project-creation paths assign **only the creator**. That's
desktop `createProject()` client-side (`role_on_project 'creator'`, a separate request whose error
is ignored) and `convert_estimate_to_project` inside the RPC (`'converter'`). Other Owners and
Admins are never assigned, and don't need to be. **No migration proposed.**

### Queue B — HEIC full-size outside Safari (measured, not built)

- **Why it's blank:** on a real 3.65 MB iPhone HEIC, the raw object is served as
  **`application/octet-stream`**, which no browser renders inline.
- **Can `/render/image/` produce a displayable full-size image? Yes, including JPEG.** It
  negotiates on `Accept`:
  - `Accept: image/jpeg` → **JPEG 3000×4000, 2.88 MB, 1.2 s**
  - WebP accepted → **WebP 3000×4000, 2.62 MB, 2.5 s**
  - at 2,048 wide → WebP 1.57 MB
- **Read-time vs one-time:** read-time would be a fresh 1.2–2.5 s transform per view, and per-view
  signing of `/render/image/` is the documented cause of Storage's "Too many connections" (S111
  T4, which also failed uploads). **A one-time conversion is the right shape.** That means a
  stored JPEG per HEIC plus a repoint of `files.file_path`/`mime_type`: a production data change,
  so it's R7 below.
- **rebuild-test count:** 9 HEIC rows (7 `daily_logs`, 2 `photos`).

### Queue C — the Q15 backfill: NOT made moot by the conversion fix

`20261770000000` changes `convert_estimate_to_project` **at the moment of conversion**, and states
it "governs no existing row". It fixes every conversion after it's applied, including estimates
still unconverted today. **Images on estimates converted BEFORE it keep `category = 'other'`**,
because nothing revisits them. It's moot only if Josh's production count is 0.

- Step 1 of `docs/sessions/S111-photos-backfill-PREPARED.sql` runs cleanly on rebuild-test and
  returns **0 rows**. So does its control without the category filter. rebuild-test has no
  converted estimate with images under `estimates/` at all, so **the criterion is unproven by a
  positive row here**; it rests on S111's design.
- The path it keys on matches the writer exactly: `{company}/estimates/{estimateId}/…`
  (`app/api/estimates/[id]/files/route.ts:159`).
- The query is in OWED TO PRODUCTION. **Not run on production.**


### Queue D — cost catalog importer (built, dry-run proven; NOT applied anywhere)

`feature/s112-catalog-importer` → `scripts/import-cost-catalog.mjs`.

- **How it works:** it signs in **as a user of the company**. `company_id` and `created_by` come
  from the session defaults and RLS admits only Owner/Admin/PM, so the service key is never used.
- **Dry run by default**; `--apply` writes. It's **idempotent**: names already in that company's
  live catalog are skipped, and it never updates or deletes.
- It validates every row against mirrors of the live CHECK sets.

**Dry run on rebuild-test, both companies:**

| Company | Existing items | Valid rows | Invalid | Already present | **Would insert** |
| --- | --- | --- | --- | --- | --- |
| Sabal Point Construction (A) | 3 rows (2 distinct names; "fb" twice) | 282 | 0 | 0 | **282** |
| Ridgeline Builders (B) | 0 | 282 | 0 | 0 | **282** |

By category: concrete 20, drywall 22, electrical 36, fasteners 21, finishes 35, hardware 15,
insulation 12, lumber 36, other 9, paint 12, plumbing 46, roofing 18 (= 282).

**Controls that must fire, and did:**
- A 2-row CSV with a bad category and a bad cost → 2 invalid reported by line, 0 to insert, exit 1.
- A crew identity → `REFUSED`, exit 1.

**Production counts are not measured** (production is off-limits tonight). They're Josh's dry run;
see WHAT JOSH MUST CLICK.


### S112 audit fixes — MEASURED after the fix (`feature/s112-audit-fixes`)

The same harness as the audit, on a production build of the branch, crew and owner, English and
Spanish, 360 wide: 19 routes plus the chat and photo-select states. That's 38 route records per
role, 0 errors, languages restored. The Spanish text diff covered all 49 routes plus the menu
sheet, both roles.

| Fix | Before (audit) | After (measured) |
| --- | --- | --- |
| F16 site-visit hydration: page errors | 120 | **0** (0 page errors on any route) |
| F6 chat controls < 44px | 24 | **0** |
| F7 "show original" target | 74×14 | **74×45.75**. The first fix measured 43.75, a quarter pixel short; caught by this re-run and fixed. |
| F17 `/m/account` targets < 44px | 28 | **0** |
| F18 photo-select overflow (owner, es, 360) | 23 px | **0**; no overflow on any measured route |
| F14 dead tiles | grey "loading" forever | **"Unavailable"/"No disponible" on all 4** |
| F13 Clock-in hint | none | **shown**, all 4 role/language combos |
| F4 English dates in Spanish | 16 strings | **0**; now "sáb, 26 de sept", "25 ago 2026, 9:06 p.m." |
| F5 wrong Spanish singulars | 3 | **0**; now "1 mío · 1 abierto" |
| F15 English screen-reader labels in Spanish | 6 | **0** |
| F9 raw tokens (`crew_member`, `not_started`) | 5 | **0** (`rough`/`finish` remain: user-typed phase NAMES) |
| F20 "a agreed" | present | **"an agreed"** |

F10 (visible share/delete note), F19 (site-visit date zone) and F21 (no-projects state) can't be
triggered by this harness, so they rest on code review and the unit suite. They're listed under
BUILT BUT UNTESTED.

**Found by this re-run and fixed:** F7's first version measured 43.75 px. **Found while fixing
F7:** tapping "show original" on the `/m/logs` list NAVIGATED to the log, because the button sits
inside the row `<Link>` without `preventDefault`. Fixed.


## BUILT BUT UNTESTED

- **S111 Part One — `retainage_releases` and `client_refunds` arms.** Both tables hold **0 rows
  company-wide** on rebuild-test, so their arms were never exercised. Unblock: a fixture with a
  retainage release and a refund on one PE project and one other project, then rerun the proof.
- **Audit F10** (share/delete failure note now visible), **F19** (site-visit date in the company
  zone) and **F21** (no-projects Clock-in state): built, unit suite green, not triggerable by the
  harness. F10 needs a browser whose Web Share refuses files; F19 an evening visit; F21 a crew
  member on no project.
- **Audit F24** (notification row 44px): the fix applies the component's existing compact floor.
  The original finding was at 390/430 and the re-run measured 360 only.

## BLOCKED

### S111 Part One — what's left (not started tonight; the queue came next, then STOP)

**Done:** the role exists, only the Owner can grant it (enforced in the database), and every Floor
READ and Q9 (payments, read and record) is proven with row counts and a sabotage run.

**⚠️ Not usable yet, and NOT mergeable.** A Project Executive can read its projects' money through
the API, but **the UI still hides it**. `budgetColumnsFor()` and the ~25 inline TS money gates don't
know the role, so they fail closed (FILL-3.2).

**What remains, in order** (each needs the CI slot for its migration, per the rules above):

1. **Write arms**, each `project_executive AND <project scope>`: invoices INSERT/UPDATE (already
   scoped by `can_view_project`, so the role can join that list); change orders plus line
   items/rows (their current writes carry NO project scope, so they need their own arms);
   `project_financials`, `project_budget_amounts`, `client_contract_amounts`, `instrument_rates`.
   Extend the live proof with "writes on its project, refused off it".
2. **The ~25 guard functions** that name `project_manager` or only owner/admin (FILL-3.1's list in
   `docs/sessions/S111-report.md` appendix A). Decide each, e.g. `enforce_invoice_void_authority`
   (ruled: may void on its projects), estimate conversion (ruled: may NOT create projects, Q6).
3. **TS gates:** one central predicate (FILL-6.1's recommendation, e.g. `lib/auth/role-caps.ts`)
   that `budgetColumnsFor()` and the money gates call, instead of adding the role to 25 inline
   arrays. Also the nav/tab `roles` lists, and seat counting (Q12: it takes a seat; `seats.ts`
   already counts it).
4. **The enumerating tests** FILL-7.1 lists, each inverted in place.

**No blocker needs a ruling:** Q1–Q20 cover all of it. It needs sessions and CI slots.

### Queue D — production cost catalog

Blocked on production access, by design tonight. Josh runs the dry run (WHAT JOSH MUST CLICK #2).

## OWED TO PRODUCTION

Nothing was run on production tonight. Each migration below carries the read-only query to run first.

1. **`20261820000000_s111_project_executive_role`** (Part One step 1; branch
   `feature/s111-project-role`, not mergeable yet, see BRANCHES). It widens two CHECKs, so it
   governs no existing row, but run these first anyway:
   ```sql
   SELECT role, count(*) FROM profiles GROUP BY role ORDER BY 1;
   SELECT role, count(*) FROM invitations GROUP BY role ORDER BY 1;
   ```
   Every row must be in the new lists; they're supersets, so this can't fail. ⚠️ It also stops an
   **Admin** inserting or editing an **Admin** invitation at the database level. TypeScript already
   refused that, so no working flow changes.
2. **`20261830000000_s111_project_executive_floor_reads`**: new policies and functions only, plus a
   `record_client_payment` replacement whose Owner/Admin path is unchanged. No data governed.
   Nothing to count; `SELECT count(*) FROM profiles WHERE role = 'project_executive';` should be 0
   on production until the Owner grants the role.
3. **Q15 backfill: count only** (from `docs/sessions/S111-photos-backfill-PREPARED.sql`, step 1):
   ```sql
   SELECT c.name AS company, f.company_id,
     count(*) FILTER (WHERE f.site_visit_capture)     AS site_visit_imgs,
     count(*) FILTER (WHERE NOT f.site_visit_capture) AS estimate_tab_imgs,
     count(*)                                         AS total,
     count(*) FILTER (WHERE f.is_deleted)             AS of_which_soft_deleted,
     string_agg(DISTINCT f.category, ',')             AS categories
   FROM files f
   JOIN projects p ON p.id = f.project_id
   LEFT JOIN companies c ON c.id = f.company_id
   WHERE f.estimate_id IS NULL
     AND p.source_estimate_id IS NOT NULL
     AND split_part(f.file_path, '/', 2) = 'estimates'
     AND split_part(f.file_path, '/', 3) = p.source_estimate_id::text
     AND f.mime_type LIKE 'image/%'
     AND f.category <> 'photos'
   GROUP BY c.name, f.company_id ORDER BY total DESC;
   ```
   Zero rows means the backfill is moot. Otherwise the UPDATE in step 2 of that file is ready. It
   isn't run and waits for your decision.
4. **HEIC count (queue B)**, read-only:
   ```sql
   SELECT category, mime_type, count(*) AS n, pg_size_pretty(sum(file_size)::bigint) AS total
   FROM files
   WHERE is_deleted = false
     AND (mime_type IN ('image/heic','image/heif') OR lower(file_name) ~ '\.(heic|heif)$')
   GROUP BY category, mime_type ORDER BY n DESC;
   ```

## WHAT JOSH MUST CLICK

1. **Markup on a real phone, the human path** (`feature/s112-router-staleness`, and
   `feature/s112-markup-local-display` on top): open a photo → ⋮ → Markup → draw → Save. The
   viewer should come back **marked immediately** (no reload), and reopening Markup should show your
   drawing. With 3c, the marked image should appear with no second download.
2. **Cost catalog, production, one company at a time.** From the branch
   `feature/s112-catalog-importer`, **dry run first**; it prints the count it would write:
   ```
   CATALOG_IMPORT_PASSWORD='<that user's password>' node scripts/import-cost-catalog.mjs \
     --email <owner-of-company-1> --csv scripts/data/cost-catalog-home-depot-south-florida-2026-09-23.csv
   ```
   Then the same with `--apply`, then the same for the second company. It needs `apps/web/.env.local`
   pointing at **production** (URL + anon key only; no service key).
3. **Settings / Account / Timeclock in Spanish on a phone** once `feature/s112-audit-fixes` is
   deployed: the dates (F4), "1 abierto" (F5), and the account form (F17).

## BRANCHES

Nothing is merged; merging is Josh's. "Parked" means pushed to origin under an empty `[skip ci]`
head commit, so it survives a Codespace restart without taking the one CI slot.

| Branch | Contains | CI | Ready to merge? |
| --- | --- | --- | --- |
| `feature/s112-router-staleness` | markup save reorder + human-path e2e + measurement docs (hold documented) | **GREEN**, run 36214441654: 591 passed / 0 failed / 0 flaky. Later commits are docs-only `[skip ci]`. | **Yes.** No migration. |
| `feature/s112-markup-local-display` | 3c: show the just-built image (stacked on the one above) | **GREEN**, run 36220665117: 591 passed / 0 failed. The first run (36217531323) failed on my unit-mock miss and my seeding; both explained in the Log. | **Yes, after router-staleness** (it contains it). No migration. |
| `feature/s112-audit-fixes` | 16 audit fixes (F4, F5, F6, F7, F9, F10, F13, F14, F15, F16, F17, F18, F19, F20, F21, F24), measured before/after | **GREEN**, run 36222852746: 590 passed / 0 failed / 0 flaky | **Yes.** No migration. |
| `feature/s111-project-role` | Part One steps 1–2 + the proof. Migrations `20261820000000`, `20261830000000` are APPLIED ON REBUILD-TEST | **GREEN**, run 36224321539: 590 passed / 0 failed / 0 flaky | **No.** The UI still hides the money (BLOCKED). Also needs its migrations on production first (Q20). |
| `feature/s112-staletimes-hold` | `staleTimes.dynamic: 0`, held (ruling 2) | never run, by design | **No, held.** Revisit when `/m` has loading feedback. |
| `feature/s112-catalog-importer` | queue D importer script | parked, not run: a script with no app change | Yes, script only. Josh runs it (WHAT JOSH MUST CLICK #2). |
| `feature/s112-m-audit` | the S112 /m audit report | parked, `[skip ci]` | Docs only. |
| `feature/s112-overnight-report` | this report | `[skip ci]` on every commit | Docs only. |

**Merge-order facts, measured with in-memory trial merges (`git merge-tree`, no refs made) and a
type-check of each result:**
- router-staleness → markup-local-display → audit-fixes: **textually clean, and the merged tree
  type-checks** (tsc exit 0).
- audit-fixes + s111-project-role: **textually clean but does NOT compile, on purpose.** Audit F9's
  Settings role map is a total `Record<CompanyRole, MsgKey>`, and Part One adds `project_executive`.
  Whichever lands second must add `'shell.role.project_executive'` (en "Project Executive", es
  "Ejecutivo de proyecto") and the map entry. The compiler names the exact line:
  `app/m/settings/page.tsx:33`.

## Log

- 07:10Z — **FINAL.** Part One CI GREEN (590/0/0). No CI is live.
  The final rebuild-test state check (read-only) shows everything I touched is back:
  - 0 `S112*` site visits
  - crew and owner language `en`
  - 0 live Project Executive assignments
  - 0 Q9 test payments
  - 0 profiling files
  - 13 PE arms in place (intended: Part One's migrations, applied)
  - catalog unchanged (newest row 2026-09-05)

  That check also caught the importer printing distinct NAMES as "items" (3 rows, 2 names). Fixed
  on its branch, and the report table corrected.
  **Queue finished. Stopping.**
- 06:37Z — audit-fixes CI GREEN (590/0/0). Part One CI requested (run 36224321539).
- 06:08Z — 3c rerun GREEN (591/0/0). Audit-fixes CI requested.
- 05:24Z — **INCIDENT, mine, contained.** 3c's first CI run (36217531323) failed two ways:
  1. **Unit step:** `m6m-markup-save.test.ts` mocked the save's UPDATE without the new
     `.select`. I hadn't run the full unit suite on that branch. Fixed, with a new unit test and a
     control (red when the feature is removed). Full suite 120/1,672.
  2. **E2E `desktop-chat-mentions`:** it found 5 postable people where 4 are pinned. The fifth was
     the **Project Executive identity I seeded**: its fixture-project assignment put it in QA A's
     crew thread. **That was shared rebuild-test state, so it would have failed every branch
     including main.** I soft-deleted both of its assignments (rebuild-test is back to its
     pre-session assignments) and the test passes locally (6/6). The seeder now never assigns it;
     the proof harness assigns it for its own run and removes it (rerun 7/7, 0 assignments left).
  3c rerun: 36220665117.
- 05:10Z — audit fixes re-measured (table in DONE AND PROVEN).
- 04:20Z — 3c pushed; CI run 36217531323 live. Queue A, B, C measured (read-only; the 4 HEIC
  transform calls ran sequentially to spare the connection pool while CI was live).
- 04:10Z — Part One migrations applied (CI idle); FILL-7.2/7.3 proven; 3d measured; hold branch
  parked and documented.
- 03:43Z — **S111 Part One started** on `feature/s111-project-role` (fast-forwarded to main
  `528bc76b`; parked). Committed, **not yet applied** because CI is live:
  - **step 1** (`5a1eef2e`): the role exists; only the Owner can grant it. The database guard
    also closes a live hole where an Admin could insert an Admin invitation via PostgREST.
  - **step 2** (`8a411b3f`): every Floor read arm and Q9.
  - **identity + proof harness** (`b9c8e0e6`).
  Q4's condition checked: no column in the directories carries rates or pricing. The 41 live
  negative-role policies were re-measured; none is a company-wide write. A `cp` of `.env.local`
  into a new worktree was blocked by a deny rule; I respected it and Part One uses the main
  checkout instead.
- 03:31Z — **audit fixes complete to the extent ruled**, on `feature/s112-audit-fixes`, parked.
  Built: F4, F5, F6, F7, F9, F10, F13, F14, F15, F16, F17, F18, F19, F20, F21, F24.
  Withdrawn: F12 (the ruled swatch exception). Needs a ruling: F1, F2, F3, F8, F11, F22, F23 (R2–R6).
  Full unit suite on the branch: **121 files / 1,673 tests passed**. Two tests were updated to the
  new rules, each with a control that must fire: `s109-password-wiring` (admits exactly `compact`)
  and the new `s112-plurals`. The i18n anti-rot guard: 143 passed.
  **Found while fixing F7:** tapping "show original" on the `/m/logs` list NAVIGATED to the log.
  The button sat inside the row `<Link>` without `preventDefault`. Fixed.
  **F9 partly reclassified:** project contacts' `client` is free text typed on desktop — data, not
  a token.
  The measured re-run proving these waits for a free CI slot, because it flips a shared user's
  language.
- 03:21Z — main CI green → fix branch pushed (run 36214441654). The 3c and audit-fix branches are
  **parked** on origin under an empty `[skip ci]` head commit. GitHub reads `[skip ci]` from the
  head commit only, so the work survives a restart and uses no CI slot. The next real commit on
  either branch runs CI for the whole branch. Audit fixes committed so far: F16, F20, F15, F10,
  F18, F14, F5, F4, F9, F6, F7. **F12 withdrawn:** M6M §2 names 34px colour swatches "the only
  permitted sub-44px target", so it was never a defect.
- ~03:05Z — 3c built and committed locally on `feature/s112-markup-local-display` (`5ba64596`),
  stacked on the fix branch; build exit 0, tsc exit 0. 3a measured (in R1). Waiting on main CI to
  push and to run e2e.
- 02:58Z — ruling 3b enumeration done: export consumers need full res → R1, resize NOT built.
  Report and audit branches pushed with `[skip ci]`; Actions API shows 0 runs on both.
- 02:53Z — started. main is `528bc76b`. Fix branch rebased cleanly (`5b4172dd`, `5770e699`).
  CI run 36212856885 on **main** is live, so no fix-branch push and no local e2e yet (local
  fixtures share the `M6MP` prefix with CI's and delete each other's leftovers).
