# M6M — Mobile PWA Spec

> **Status:** DRAFT for build, S98.
>
> **Sources:** the _FrameFocus — Mobile App Shell_ handoff (6b nav menu, 6f projects list, 6g project
> sections, 6e offline) and the _FrameFocus — Mobile Photos_ handoff (6j gallery, 6k viewer, 6l markup),
> plus Josh's rulings in this session.
>
> **Gap pass [S98]:** GAP-1b, GAP-3, GAP-4 and GAP-7 closed by **verification** — every claim carries a
> file and line. GAP-2, GAP-5 and GAP-6 closed by **ruling**. **All eight §11 questions are RULED
> (Josh, S98); §11 is now a register, not a queue.** The rulings are D-14 (amended) and D-17…D-21 in §0.
>
> **Two figures were deleted rather than derived** — the progress percentage (D-19) and the `estimating`
> count (D-4) — because neither had a source in the schema. §4.2 and §4.3 carry the respec, not a gap.
>
> **BUILD STEP 1 is migrations, not a screen: FOUR policies** — `files_insert_non_client`,
> `files_update_non_client`, `project_files_insert_non_client`, `project_files_update_non_client`
> (D-20 as extended, §7a). A photo is two writes, the row and the bytes, and `subcontractor` was missing
> from both sets. Until they land, the camera — the most prominent control on every mobile screen — is
> broken for one role. **A second migration**, `sync_conflicts` (§5.7, §7b), must land before any offline
> write path ships.
>
> **⛔ One item is OPEN and blocks a complete build:** what renders when `markup_data` is non-empty and no
> derivative exists (**§4.7a**). Ruling 3 made the derivative load-bearing; the desktop editor produces
> markup without one, permanently. Everything else in this spec is ruled.
>
> **Verified against the repo at S98** (branch merged to `main` as `91806cf`):
>
> - No `apps/web/app/m` route tree exists.
> - M6 desktop routes live under `app/dashboard/field-ops/**` and `app/dashboard/timeclock/**`.
> - Services present: `time-tracking-client.ts`, `daily-logs-client.ts`, `files-client.ts`.
> - `time_clock_sessions`, `time_segments`, `daily_logs`, `files` all use
>   `id uuid DEFAULT gen_random_uuid()`; the time and daily-log tables carry an explicit
>   _"client may generate (offline-ready)"_ comment, and `time_clock_sessions.clock_in` is
>   commented _"device timestamp"_.
> - `files.markup_data jsonb` exists. Photo storage bucket is `project-files`.
> - `files` links: `daily_log_id`, `delivery_id`, `delivery_item_id`, `safety_incident_id`, `expense_id`.
>   **There is no punch link column.**

---

## §0 — Decisions locked (do not re-litigate in build)

| #    | Decision                      | Ruling                                                                                                                                                                                                                                                                                                                                                                |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1  | Delivery mechanism            | **PWA installed to the home screen.** Not React Native. `apps/mobile` stays PARKED, not deleted.                                                                                                                                                                                                                                                                      |
| D-2  | Code structure                | **A separate mobile route tree.** Not a repair of the desktop shell. The desktop's 1,917 inline styles are not touched by this work.                                                                                                                                                                                                                                  |
| D-3  | Navigation model              | **Persistent 5-slot bottom tab bar + hamburger sheet.** The bar owns Projects · Timeclock · [camera] · Logs · Field. The hamburger owns everything else. No destination appears in both.                                                                                                                                                                              |
| D-4  | List-screen pattern           | **The project card** (§4.2) is the one list pattern. Every other mobile list reuses its geometry.                                                                                                                                                                                                                                                                     |
| D-5  | Failure state                 | **One offline state** (§4.4), app-wide, not per-screen.                                                                                                                                                                                                                                                                                                               |
| D-6  | Offline-capable actions, v1   | **Clock in/out, daily log, photo capture.** Delivery check-in is v1 **online-only**.                                                                                                                                                                                                                                                                                  |
| D-7  | Idempotency                   | **Client-generated UUID at capture time.** Server upserts on that id.                                                                                                                                                                                                                                                                                                 |
| D-8  | Camera                        | **Camera-first, gallery fallback.**                                                                                                                                                                                                                                                                                                                                   |
| D-9  | Nav scope                     | Contacts, Subs & Vendors, Team **stay** in the hamburger. Finance (Budget, Invoices, Payments, Contracts) is **absent from mobile entirely**.                                                                                                                                                                                                                         |
| D-10 | Notifications                 | **Out of scope here.** Web Push on iOS requires an installed PWA, so manifest + icons + service worker are prerequisites. GATED.md Gate 4.                                                                                                                                                                                                                            |
| D-11 | Who gets mobile               | **All roles.** No role gate on `/m`.                                                                                                                                                                                                                                                                                                                                  |
| D-12 | Landing                       | **Sign-in lands on `/m/timeclock`.** On a successful clock-in, redirect to the project clocked into; if no project was selected, redirect to the dashboard.                                                                                                                                                                                                           |
| D-13 | Timeclock / Logs / Field tabs | **Real mobile screens**, built in this pass (§4.5–§4.7). Not links to desktop pages.                                                                                                                                                                                                                                                                                  |
| D-14 | Photos badge                  | **Total count only. AMENDED [S98, Josh]: the unseen dot is DEFERRED TO V2.** The number is every photo on the project. _Superseded clause, quoted not rewritten: "with an unseen indicator… an amber dot marks that unseen photos exist for this user."_ No view-tracking table is built. The intended v2 shape is recorded in §9 so it can be added without rework. |
| D-15 | Punch photos                  | **No migration.** The link already exists on `punch_list_items` as `reference_photo_file_id` and `completion_photo_file_id`. The gallery derives the `Punch` badge by a **read-only** join: a file is punch-sourced if its `id` appears in either column. **Those two columns keep their existing meanings and are not merged, altered, or written to by this work.** |
| D-16 | Punch counter                 | **Mine first, then the project total** — e.g. `2 mine · 4 open`. Applies to the M-3 stat strip and the Punch List tile. **"Open" means `status IN ('open','in_progress')`** — not `complete`, not `verified`.                                                                                                                                                         |
| D-17 | Offline sync conflict         | **The server version stands.** [S98, Josh] When a queued mutation targets a row the server has changed since capture, the queued copy **does not overwrite** it and **is not discarded** — it leaves the sync queue and enters a reconciliation review for Owner/Admin. The field user is told. **EXTENDED [S98]: the held copy goes to a server-side table, `sync_conflicts`, not to IndexedDB** — it must survive a cleared PWA or a new handset. Contract in §5.6; table, RLS and lifecycle in **§5.7**; migration ordering in §7b. The review *surface* remains out of scope. |
| D-18 | Offline test tooling          | **Both.** [S98, Josh] Queue logic is unit-tested in the existing Node harness; screen-level and browser-state criteria are tested with **Playwright, a new dependency this repo does not yet carry**. Nothing in §10 is left untestable. Assignment table in §10a. |
| D-19 | Progress percentage           | **CUT FROM V1.** [S98, Josh] No progress % anywhere on mobile. The M-3 stat strip is **two** stats, not three (§4.3); the M-2 project card has **no** progress bar (§4.2). No project-level progress derivation is invented. |
| D-20 | Subcontractor photo access    | **Subs upload AND annotate.** [S98, Josh] D-11 stands unchanged. **EXTENDED [S98]: `files_update_non_client` is widened too**, so a sub can annotate photos including ones they just took — and, found while applying that, **the two `storage.objects` policies carry the same omission and must be widened as well** or the bytes are refused regardless. **Four policies, role array only.** Required migration and the **FIRST build step** — see §7a. |
| D-21 | Markup storage & display      | **Both, and the derivative is what displays.** [S98, Josh] `files.markup_data` holds the editable annotation layer and **is the source of truth**; Save additionally writes a flattened derivative image. **EXTENDED [S98]: where a photo has markup, the derivative is what the UI renders** — gallery thumbnail, viewer stage and filmstrip — and §4.9's toggle is now the only route to the unannotated image. The original is never modified. Storage contract in §4.10; display precedence in **§4.7a**, which also carries the one case still BLOCKED. |

---

## §1 — Route tree

All mobile routes live under `apps/web/app/m/`. Nothing under `app/dashboard/` is modified.

```
app/m/
  layout.tsx                        mobile shell: app bar + tab bar + offline strip + sheet host
  page.tsx                          → redirect to /m/timeclock  (D-12)
  timeclock/page.tsx                M-5   tab slot 2
  projects/page.tsx                 M-2   projects list
  logs/page.tsx                     M-6   tab slot 4
  field/page.tsx                    M-7   tab slot 5
  capture/page.tsx                  camera action target (§6)
  offline/page.tsx                  M-4   offline / failure state
  p/[projectId]/page.tsx            M-3   project sections hub
  p/[projectId]/photos/page.tsx     M-8   gallery
  p/[projectId]/photos/[fileId]/page.tsx        M-9   viewer
  p/[projectId]/photos/[fileId]/markup/page.tsx M-10  markup
```

**Entry.** A viewport or user-agent check is **not** the router. Mobile is entered by URL (`/m`) and by
the installed PWA's `start_url`. A desktop browser opening `/m` gets the mobile shell; that is intended
and is how it gets tested.

**The service layer is shared.** Mobile routes call the same `lib/services/*` functions as desktop. No
duplicate data access is written for mobile.

---

## §2 — Design tokens

| Token       | Value                                 | Use                                                        |
| ----------- | ------------------------------------- | ---------------------------------------------------------- |
| navy        | `#14213d`                             | app bar, primary text                                      |
| blue        | `#2f49d1`                             | active state, icons, primary button                        |
| amber       | `#f59e0b`                             | camera action, avatar, primary field CTA, attention counts |
| danger      | `#c0362c`                             | sign out, damage/blocking badges                           |
| surface     | `#f4f6f9`                             | page background                                            |
| card        | `#ffffff`, border `#e6e9ef`           | all cards and tiles                                        |
| muted       | `#8a919c` on light, `#8fa0c4` on navy | inactive tab, captions                                     |
| dark canvas | `#0d1220`                             | photo viewer and markup only                               |

**Type.** Barlow for UI. **IBM Plex Mono for every number, ID, timestamp, and micro-label.** Body ≥15px
(≥14px on the dark photo screens). Captions ≥11px, mono, captions only.

**Canvas.** 402 × 874 logical px reference (iPhone 16 Pro). Content inset 18–20px (14px on markup);
56–58px top; bottom safe area via `env(safe-area-inset-bottom)`.

**Touch targets.** Tiles 76px · markup tool tiles 62px · list/menu rows 58px · tab-bar items and action
tiles 56px · on-canvas nav circles 40–46px · colour swatches 34px (spaced 8px, the only permitted
sub-44px target). **Everything else is ≥44px.**

**Motion.** 120–160ms ease on press. Menu sheet slides down from the app bar; page transitions slide;
dismissal fades. No decorative animation.

---

## §3 — Shell

### 3.1 App bar (navy `#14213d`)

Left: **44px hamburger** — three 18×2px white bars in an `rgba(255,255,255,.13)` 11px-radius square.
Centre-left: title block, 18–21px/800, with an IBM Plex Mono 11px sub-line for project/company context.
Right: **38px amber avatar** with the user's initials.

**Inside a project, the hamburger is replaced by a back chevron.** Never both.

### 3.2 Bottom tab bar — locked on every mobile screen

`background:#fff`, `border-top:1px #e6e9ef`, `padding:10px 14px 14px`, `justify-content:space-between`.

Five slots: **Projects · Timeclock · [camera] · Logs · Field**.

- Side items: 23px stroke icon over an 11px Barlow label. Active `#2f49d1`/700; inactive `#8a919c`/600.
- **Centre camera action:** 66px amber circle, `margin-top:-26px` so it breaks the bar's top edge,
  **4px border in the bar's own background colour**, shadow `0 8px 20px rgba(245,158,11,.4)`,
  30px navy camera glyph.
- The bar **never scrolls away**; the active tab always reflects the current screen.
- On the dark photo screens (M-9, M-10) the bar is replaced by that screen's own action row.

### 3.3 Hamburger sheet (M-1)

Drops over a `rgba(20,33,61,.5)` scrim. Content inset 18px under a mono **"GO TO"** label. A **2-column
grid of 76px tiles** — icon top-left `#2f49d1`, bold 15px label bottom-left, optional badge top-right.
Current location = `1.5px #2f49d1` border, label in blue.

**Tiles:** Dashboard · Schedule · Expenses · Subs & Vendors · Team _(count)_ · Contacts · Settings.
Below the grid, a full-width **Sign out** row (58px, `#c0362c` text, `#f0d4d1` border).

Tapping the scrim or the hamburger closes it. **The tab bar stays visible and functional beneath the sheet.**

> Because the tab bar owns Projects, Timeclock, Logs and Field, those four are **deliberately absent**
> here. A build that adds them back is wrong.

---

## §4 — Screens

### 4.1 M-1 · Navigation menu — see §3.3.

### 4.2 M-2 · Projects list

App bar: "Projects" + mono `{n} active`.

> **AMENDED [S98, D-4 ruling]:** the header read `{n} active · {m} estimating`. **The second half is
> dropped.** There is no `estimating` project status — `projects_status_check` permits exactly
> `active, on_hold, complete, archived, cancelled` — and no status is added. The header is the active
> count alone.

A **48px search field**; a horizontally scrolling **filter chip row** — All / Active / Mine / On hold,
active chip navy fill, 20px radius, **single-select**; then **project cards**, `gap:11px`:

- 15px radius, 15–16px padding
- name 17px/700 navy
- mono sub-line `PRJ-### · {client}`
- status pill top-right (always carries text, never colour alone)
- footer: mono `{n} days left` left, right-aligned callout (`4 punch`, `4 open`, `—`)

> **AMENDED [S98, D-19]:** the card carried a **7px progress bar** and its footer read
> `62% · 38 days left`. **Both the bar and the percentage are cut.** No project-level progress figure
> exists in the schema and none is invented. The footer is the days-left figure alone, and the card
> loses a row of height rather than gaining filler — nothing replaces the bar. Days-left renders all
> three states per §8a: positive, negative past target, and the empty state when `target_end_date` is
> null.

**The project the user is currently clocked into carries the `1.5px #2f49d1` border and an "On site" pill.**
Exactly zero or one card carries it. **Zero is a normal state, not a bug:** the current project is the
`project_id` of the caller's open segment, and `travel`, `shop` and `break` segments are constrained to
carry no project at all (§8a). A clocked-in user on a break sees no highlighted card. The build must not
fall back to "the most recent project" to fill the gap.

Search filters live. Tap a card → M-3.

### 4.3 M-3 · Project — sections

Navy header: back chevron, project name 21px/800, mono `PRJ-### · {client}`, status pill, and a
**2-stat strip** — **Days left / Punch** (mono 19px; **Punch amber when non-zero**, muted at zero).

> **AMENDED [S98, D-19]:** the strip was **3 stats — Progress / Days left / Punch — divided by two 1px
> rules**. **Progress is cut** (no project-level percentage exists; see §8a). **Respec, not a gap:** the
> two remaining stats split the header width **50/50**, separated by a **single** 1px rule on the centre
> line. They do not stay at their old one-third widths with a hole on the left, and no third stat is
> substituted in to keep the shape. Every other property of the strip — mono 19px figures, the amber/muted
> Punch rule, the divider weight — is unchanged.

Per D-16 the Punch stat reads `{mine} mine · {total} open` — items assigned to
the signed-in member first, then the project-wide open total. When the user has none assigned, it renders
`0 mine · {total} open`, not a bare total. **"Open" is `status IN ('open','in_progress')`** — `complete`
and `verified` items are excluded from both figures.

**The exact comparison for `{mine}` (closes GAP-1b).** `punch_list_items.assignee_id` is FK-constrained to
`company_members(id)`, so "mine" is a member comparison, never a `profiles.id` or an `auth.uid()`:

```sql
SELECT count(*) FROM punch_list_items
WHERE project_id = :projectId
  AND is_deleted = false
  AND status IN ('open','in_progress')
  AND assignee_id = public.get_my_member_id();   -- {mine}
```

`{total}` is the same query without the last line. From TypeScript, `get_my_member_id()` is reached with
`supabase.rpc('get_my_member_id')` — the call already in use at `time-tracking.ts:56`. **Do not compare
`assignee_id` to the user id.** The two are different tables; the comparison would silently return 0 for
every user rather than erroring.

> **Known divergence, deliberate.** D-16's "open" is not the complement of 5C §6's "closed".
> `isItemClosed()` (`punch.ts:36-41`) treats an item as closed only when `verified` (or `complete`, when
> `requires_verification` is false). An item sitting at `complete` **awaiting verification** is therefore
> neither "open" by D-16 nor "closed" by the project-complete gate, and will not appear in this stat.
> D-16 was chosen to match the two existing surfaces (`dashboard.ts:83`,
> `projects/[id]/page.tsx:76`), which both use `('open','in_progress')`. Consistency with the rest of
> the platform was preferred to completeness of the count. Recorded so nobody "fixes" it into a
> third definition.

Body: an **"Up next"** card — blue dot with a 4px `#e7ebf9` halo, item title 16px/700, amber date line.

**Binding [S98, D-6 ruling — bound to the schedule, no milestone concept introduced].** "Up next" is the
**next upcoming scheduled item on this project**, taken from the existing calendar UNION —
`getCalendarEvents({ projectId })` (`apps/web/lib/services/schedule.ts:106`). That function already unions
the three things this platform calls "scheduled":

| Source | Table | Date column | Notes |
| ------ | ----- | ----------- | ----- |
| Dated task | `tasks` | `start_date`, falling back to `due_date` (`schedule.ts:137`) | Selected on `is_scheduled = true`, a **generated** column: `(start_date IS NOT NULL) OR (due_date IS NOT NULL)` (`20260704213000_module5_5b_tasks_scheduling.sql:83`). A scheduled task therefore always has a usable date — the fallback cannot yield null. |
| General entry | `schedule_entries` | `entry_date` (`NOT NULL`, `:209`) | `general_kind` ∈ project/pto/shop/other. |
| Inspection | `inspections` | `scheduled_date` | Undated inspections are already skipped (`schedule.ts:183`). |

**The selection rule:** filter to `start_date >= today`, take the **first** — the union is already sorted
ascending by `start_date` (`schedule.ts:200`). Do **not** pass `ownMemberId`; that argument is the crew
*calendar* filter and would narrow a project-level card to the viewer's own rows.

- **Title** = `CalendarEvent.title`, which the union already composes per source (task title; project name
  or the general-kind label; `Inspection: {type}`).
- **Date line** = `CalendarEvent.start_date`. **There is no free-text "scheduling note" available for
  every source** — `detail.notes` is populated for general entries and inspections but **not for tasks**
  (`schedule.ts:151` sets `detail: { status }` only). The amber line is therefore the **date**, rendered
  relative, and not a notes field. Do not bind it to `detail.notes` and leave it blank on tasks.
- **Tie-break**, required because the sort is on date alone and same-day items are common: order
  `inspection` → `task` → `general`, then by `title` ascending. Deterministic, and it surfaces the item
  with a hard external deadline first.
- **Empty state:** when no event is dated today or later, the card renders "Nothing scheduled" rather
  than being omitted — the card's absence would otherwise read as a loading failure.

> **Viewer-dependent for two roles, by existing RLS — state it, don't fight it.**
> `schedule_entries_select_scoped` (`20260704213000_module5_5b_tasks_scheduling.sql:406-414`) grants
> Owner/Admin/PM/Foreman every row but limits **crew and subcontractors to `member_id = get_my_member_id()`**.
> Tasks (`:341-351`) and inspections (`:432-437`) are project-scoped for everyone. So a crew member's
> "Up next" may skip a general entry belonging to a teammate. This is the schedule module's existing
> visibility rule, not a mobile decision, and M-3 inherits it rather than working around it.

Then a mono **"SECTIONS"** label and a **2-column grid of 76px tiles**:

Overview · Schedule · Change Orders · Punch List · Deliveries · Files · Photos · Contacts · Team

Badges: Change Orders and Punch List amber, Deliveries red, Photos and Team plain mono. **Photos carries
the total photo count and nothing else** (D-14 as amended [S98] — the unseen dot is deferred to v2; see
§9).

Bottom: full-width amber **"Log the day"** (60px), then the tab bar.

> **This tile set intentionally excludes Budget, Invoices, Payments and Contracts** (D-9). A build that
> renders a finance tile here fails review.

### 4.4 M-4 · Offline / failure state

App bar, then an amber **status strip** (`#fdf6ec` bg, `#f3e2c4` border): dot + `Offline · last synced
{h:mm}` + a queued-count pill.

Centred block: 72px white icon tile with a struck-through wifi glyph (`#c0362c` slash); **"No connection"**
23px/800; body copy _"Keep working — everything you enter is saved on this phone and syncs when you're
back in signal."_; mono `last try {h:mm}`. Then a **"Waiting to sync"** card listing each queued item with
a `Queued` badge, and two stacked 60px buttons — primary **"Try again"**, secondary **"Keep working offline"**.

**The status strip is app-wide** — it renders on every mobile screen while offline, not only here. M-4 is
reached by tapping the strip, or when a navigation genuinely cannot be served.

### 4.5 M-5 · Timeclock _(sign-in lands here — D-12)_

No handoff mockup exists; built from the locked patterns.

- App bar: "Timeclock" + mono `{today's date}`.
- **State card** (15px radius, card surface): when clocked out — mono `Not clocked in`; when clocked in —
  the project name, the mono elapsed time updating live, and the current segment type.
- **Project select** (58px row) — required before clock-in unless the user is clocking in with no project.
- Primary 60px button: amber **"Clock in"**, or `#c0362c` **"Clock out"** when a session is open.
- Below: **today's segments** as 58px rows — segment type, mono start–end, mono duration.
- **On successful clock-in, navigate to `/m/p/{projectId}`; if no project was selected, navigate to the
  dashboard** (D-12).
- Offline-capable (§5). The button works with no signal and the resulting event enters the queue.

### 4.6 M-6 · Logs

- App bar: "Logs" + mono `{n} this week`.
- Filter chips: All / Mine / This project _(when a project is in context)_ — single-select, same geometry
  as M-2's chips.
- Rows use the **project-card geometry** (D-4): log date 17px/700, mono `{project} · {author}`, a
  one-line excerpt of `work_performed`, and a right-aligned mono photo count.
- A `Queued` badge replaces the photo count on any log still waiting to sync.
- Primary 60px amber **"Log the day"** at the bottom.

### 4.7 M-7 · Field

The mobile equivalent of the desktop Field Ops hub. A **2-column grid of 76px tiles** — same idiom as
M-1 and M-3: **Daily logs · Deliveries · Safety · Photos**, each with its attention badge. Above the grid,
a project context row (58px) naming the project the tiles apply to, tappable to switch.

### 4.7a Photo display precedence — **governs M-8, M-9 and M-10** (D-21 as extended [S98])

Stated once here rather than three times below. Every surface that renders a photo obeys it.

> **The rule [S98, Josh]: derivative when `markup_data` is non-empty, original otherwise.**

Where a photo has markup, **the annotated version is what the UI displays** — the M-8 gallery thumbnail,
the M-9 image stage, and the M-9 filmstrip thumbnail all render the derivative. §4.9's toggle back to the
original stands and is **now the only way to see the unannotated image**; it is no longer a convenience.

**This makes the derivative load-bearing, not a side artifact.** Three things in this spec were written
when it was optional and are corrected here:

1. **Generation is part of Save, not after it.** §4.10's Save is not complete until both writes land. A
   save that writes `markup_data` and fails to write the derivative has produced a photo the UI cannot
   display correctly, so **`markup_data` and the derivative are written as one unit of work from the
   user's point of view** — the editor does not report success on a partial save.
2. **Regeneration is mandatory on every re-edit**, per §4.10 — full re-render from the original bytes,
   overwritten in place. Under the old model a stale derivative was a cosmetic lag in a sharing artefact.
   Under this rule a stale derivative is **the app showing the wrong image**.
3. **The derivative inherits the original's access control**, which is what makes this safe: same bucket,
   same `{company_id}/{project_id}/` prefix, therefore the same `storage.objects` policies (§7a). No
   surface may render a derivative by a path that skips the signed-URL flow the original uses
   (`getSignedUrl`, `files.ts:70`).

**The count is unaffected.** Precedence changes *which bytes render*, never *how many tiles exist*. The
derivative still gets no `files` row (§4.10), so A-23d's guarantee — photo count and gallery tile count
unchanged by a markup save — holds exactly as before.

> ### ⛔ BLOCKED — what renders when `markup_data` is non-empty and no derivative exists
>
> **This case is real, ongoing, and not covered by the ruling. No fallback is invented here.**
>
> The desktop markup editor writes `markup_data` and nothing else —
> `updateFile(fileId, { markup_data })`
> (`apps/web/app/dashboard/projects/[id]/files/[fileId]/markup/markup-editor.tsx:244-247`). It does not
> produce a derivative and, under **A-28** and **D-2**, M6M does not change it. So the population of
> photos with markup and no derivative is **not a legacy backfill problem that ends** — it is every
> photo annotated on desktop, before or after this build, permanently.
>
> Applying the rule literally sends the mobile gallery after an object that does not exist. The two
> candidate answers differ in cost and in what the user sees, and choosing between them is Josh's:
>
> | Option | What the user sees | Cost |
> | ------ | ------------------ | ---- |
> | **A. Fall back to original bytes + a live overlay rendered from `markup_data`** — the mechanism M-9's toggle already needs. | Marks always visible, everywhere. Consistent with desktop. | The gallery **thumbnail** must render an SVG overlay over a thumbnail. Materially more work than showing an image, and it demotes the derivative to a performance optimisation rather than the display source — which is not what this ruling established. |
> | **B. Fall back to the bare original.** | A photo the user annotated appears **unannotated**, silently. Worse than a broken image, because nothing signals the marks exist. | Trivial. |
> | **C. Generate the derivative on first mobile view** when markup exists and no derivative does. | Marks always visible; derivative stays the display source. | A read path that writes. Needs the storage-write policies of §7a for whoever happens to open it first, and a crew member browsing a gallery would be issuing writes. |
> | **D. Change the desktop editor to write a derivative too.** | Fully consistent; the population never arises. | **Breaks A-28** (`apps/web/app/dashboard/**` unchanged) and D-2. A scope change, not a build detail. |
>
> **Until this is ruled, the criteria below cover only photos that HAVE a derivative.** No criterion
> asserts behaviour for the missing case, deliberately — a criterion written against a guess would pass
> vacuously, which is the failure this spec keeps correcting.

---

### 4.8 M-8 · Project photos — gallery _(handoff 6j)_

Navy app bar: **back chevron**, "Photos" 20px/800, mono `{project} · {n} photos`, and a 38px search button
(`rgba(255,255,255,.13)`, 10px radius) on the right.

Horizontally scrolling **filter chip row**: All / Daily logs / Deliveries / Punch — active navy fill,
20px radius, `9px 16px` padding, `white-space:nowrap`, **single-select**.

Body **grouped by day**: a mono uppercase section label (`TODAY · JUL 8 · 8`, letter-spacing .05em,
`#8a919c`) above a **3-column grid**, `gap:7px`, square tiles at 11px radius. Sections run newest-first;
the current day is labelled "Today". Infinite scroll by day.

**Source badges** (9–10px Barlow 600, white on translucent fill, 4px radius, 6px inset from bottom-left):

| Badge               | Fill                  | Bound to                                                                                                                |
| ------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Log` / `Daily log` | `rgba(20,33,61,.72)`  | `files.daily_log_id`                                                                                                    |
| `Delivery`          | `rgba(20,33,61,.72)`  | `files.delivery_id` / `files.delivery_item_id`                                                                          |
| `Safety`            | `rgba(192,54,44,.85)` | `files.safety_incident_id`                                                                                              |
| `Punch`             | `rgba(180,83,9,.85)`  | read-only join — `files.id` appears in `punch_list_items.reference_photo_file_id` or `.completion_photo_file_id` (D-15) |

Untagged photos carry **no** badge. **A photo's badge is its provenance — never invent one.**

Tap a tile → M-9. Long-press enters multi-select for bulk share/delete. Tab bar present, Projects active.

### 4.9 M-9 · Photo viewer _(handoff 6k)_

Dark chrome `#0d1220`, dark status bar.

Header row: 22px **close ✕**, centred filename 15px/700 with mono `3 of 34` beneath, **⋮ overflow** right
(markup, set as cover, move, report). A fixed **330px image stage**, full-bleed, no radius, with 40px
translucent prev/next circles inset 14px. A **filmstrip** of 52px thumbnails (`gap:7px`); the current one
carries `0 0 0 2px #f59e0b`, the rest sit at 45% opacity.

Detail block: **caption** 14px/1.5 `#cdd6e8`; **tag pills** (`rgba(47,73,209,.22)` fill, `#9fb0f5` text)
plus a dashed **+ Tag**; then a metadata list above a `rgba(255,255,255,.08)` rule — **Taken** (mono
timestamp), **By**, **Source** (the record it came from).

Bottom: a **4-up action row** of 56px tiles — Save · Share · Comment · **Delete** (`rgba(192,54,44,.16)`
fill, `#f0908a` icon and label).

Swipe left/right pages; pinch zooms; swipe down dismisses — **the arrows are the visible equivalent of the
swipe**. Tapping **Source** navigates to the daily log / delivery / incident. Delete confirms first and is
role-gated.

**A photo with markup indicates it, and the viewer can toggle back to the original.**

### 4.10 M-10 · Photo markup _(handoff 6l)_

Dark chrome `#0d1220`, dark status bar, inset 14px.

Header: **Cancel** (`#8fa0c4`) left, centred "Markup" + mono filename, **Save** (`#f59e0b`, 700) right.
A flexible **canvas** (14px side margins, 14px radius) holding the live annotation layer.

**5-tool row**, 62px tiles: **Draw · Arrow · Box · Text · Pin**. Active tool =
`rgba(242,69,61,.18)` fill + `1.5px #f2453d` border + red icon and label — **state carries a border and a
label change, not tint alone**.

**Controls row:** five 34px colour swatches — red `#f2453d` (selected, 2.5px white ring), yellow `#ffd400`,
green `#3ecf6a`, blue `#4f8ff7`, white — and a stroke-width slider (small dot → 56px track with a 16px
white knob → large dot).

Bottom: **Undo · Redo · Done** — Done is amber `#f59e0b` with a navy label at `flex:1.2` so it reads as
primary. Redo dims when empty. Undo/Redo are per-mark.

Behaviour: one tool active at a time; the selected colour and width apply to the next mark. Draw is
freehand; Arrow and Box are drag-to-place; Text drops a callout and opens the keyboard; Pin drops the next
number in sequence (34px red circle, white 2px ring, mono numeral).

**Markup is a non-destructive layer. Save writes TWO things [S98, D-21].** The previous text —
_"Save writes an annotated derivative and keeps the original. `files.markup_data jsonb` already exists and
is the store"_ — named two different storage models in consecutive sentences and never said which won.
Both, with a defined relationship:

1. **`files.markup_data jsonb` is the source of truth.** It holds the editable mark list — the same
   column and shape the desktop editor already writes
   (`apps/web/app/dashboard/projects/[id]/files/[fileId]/markup/markup-editor.tsx`). Re-opening markup
   loads from here. Undo/Redo, tool state and per-mark editing all operate on this layer, never on
   pixels.
2. **A flattened derivative image**, written on Save, so a mark-up photo can leave the app — texted to a
   sub, attached to an email, dropped in a PDF — and still show its marks.

The contract between them:

- **The original file is never modified.** Its bytes, `file_path`, `file_size` and `mime_type` are
  untouched by any number of markup saves. Only `markup_data` changes on the original's row.
- **The derivative is regenerated in full on every re-edit**, from the current `markup_data` against the
  original bytes. It is never edited incrementally and never used as the input to the next render — that
  would compound JPEG loss with each save.
- **The previous derivative is overwritten in place**, at a path deterministically derived from the
  original (same `{company_id}/{project_id}/` folder, a reserved suffix on the file name). No history of
  derivatives is kept; `markup_data` is the history that matters, and it is versionable independently.
- **The derivative does NOT get its own `files` row.** It is a storage object beside the original.
  Reason, and it is concrete: a second row with `category = 'photos'` would be counted by the Photos
  badge (§4.3) and rendered as a separate tile in the gallery grid (§4.8), so every annotated photo
  would appear twice and inflate the count. The `files.supersedes_id` / `version` columns
  (`20260101000000_baseline_schema.sql:1384-1385`) are the document-versioning mechanism and are **not**
  overloaded to mean "derivative of".
- **A file carrying marks is flagged from `markup_data` being non-empty** — that is what M-9's markup
  indicator (§4.9) reads, and what its toggle-to-original switches off. The toggle is a render choice
  between the original bytes and the overlay; it does not fetch the derivative.

> **Open sub-question, deliberately not decided here.** If sharing ever needs the derivative to be a
> first-class, permission-checked, signed-URL artefact rather than a sibling object, it needs its own
> `files` row and therefore a category that keeps it out of the photo gallery. Nothing in v1 requires
> that. Flagging so it is a decision later rather than a surprise.

Cancel confirms if there are unsaved marks.

Markup is also reachable from a punch item or incident, pre-linked to that record.

---

## §5 — Offline & sync contract

### 5.1 Scope (D-6)

| Action               | Offline in v1 | Notes                                                                                                                           |
| -------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Clock in / clock out | **Yes**       | Wires the unwired seam in `clockIn` (TECH_DEBT #118).                                                                           |
| Daily log            | **Yes**       | Full log body + presence, queued.                                                                                               |
| Photo capture        | **Yes**       | Blob held locally, uploaded on reconnect.                                                                                       |
| Delivery check-in    | **No**        | Online-only in v1. Offline, the screen shows the strip and blocks submit with a plain message — it does **not** silently queue. |
| Everything else      | No            | Read-only surfaces degrade to last-fetched data or the offline screen.                                                          |

### 5.2 Queue model

A single local queue (IndexedDB) of **mutations**, not screens:

```
{
  id:            uuid,        // client-generated, IS the target row's primary key
  kind:          'clock_event' | 'daily_log' | 'photo',
  payload:       object,      // exactly what the online path would have sent
  captured_at:   ISO string,  // when the user acted, NOT when it synced
  attempts:      integer,
  last_error:    string | null
}
```

1. **`captured_at` is the business timestamp.** A clock-in queued at 6:58am and synced at 11:20am is a
   6:58am clock-in. `time_clock_sessions.clock_in` is already documented as the device timestamp — the
   client sets it, the server does not substitute receipt time.
2. **Auto-retry with backoff** on reconnect. `Try again` forces an immediate attempt.
3. **Never silently discard a queued item.** A permanently failing entry stays in the queue, moves to a
   `Needs attention` badge, and surfaces `last_error`.
4. The queued-count pill must equal the number of records/files that will actually upload.

### 5.3 Idempotency (D-7) — schema already supports this

`time_clock_sessions.id`, `time_segments.id`, `daily_logs.id` and `files.id` all default to
`gen_random_uuid()`, and the first three carry an explicit _"client may generate (offline-ready)"_ comment.
**No migration is needed to allow a client-supplied id.**

What the build must do:

- Widen the client service calls (`time-tracking-client.ts`, `daily-logs-client.ts`, `files-client.ts`) to
  accept and pass an explicit `id`.
- Make each offline-capable write an **upsert on the primary key**, so replaying a queued mutation N times
  produces exactly one row.

**INSERT RLS verified [S98] — a client-supplied `id` passes all four.** None of the four policies
references `id`, `gen_random_uuid()`, or any server-generated value in its `WITH CHECK`; each gates on
company, role and membership only. Quoted in full so a future reader does not have to re-derive this:

```sql
-- 20260710130000_module6_6a_time_tracking.sql:308-316
CREATE POLICY time_clock_sessions_insert_authorized ON public.time_clock_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      member_id = public.get_my_member_id()
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

-- 20260710130000_module6_6a_time_tracking.sql:348-356
CREATE POLICY time_segments_insert_authorized ON public.time_segments
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR public.owns_open_session(session_id)
    )
  );

-- 20260728000000_security_rls_96_99.sql:183-192  (supersedes the 6B original)
CREATE POLICY daily_logs_insert_authorized ON public.daily_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.can_view_project(project_id)
    AND (
      author_member_id = public.get_my_member_id()
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

-- 20260728000000_security_rls_96_99.sql:77-81  (role arm; the client_visible
-- and category arms below it are not reproduced — none mentions id either)
CREATE POLICY files_insert_non_client ON public.files
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text])
    ...
  );
```

Two things the quotes make visible that the build must respect:

1. `time_segments` inserts are gated on **`owns_open_session(session_id)`** — see §5.5, this is a real
   replay hazard, not a formality.
2. `files_insert_non_client` **omits `subcontractor`** from its role array. D-11 puts every role on
   `/m`. **Ruled [S98, D-20]: the policy is widened, and that migration is BUILD STEP 1 — see §7a.**

> **Do not** dedupe on a natural key (member + project + minute). Two legitimate clock events can share a
> minute; a uuid cannot collide.

### 5.4 Presentation while offline

Any surface backed by data not held locally renders the offline strip and its own empty state. It does not
spin forever, and it does not show stale data without the strip.

### 5.5 Replay obligations the flat queue does not give you for free

§5.2 models the queue as an ordered list of independent mutations. Three constraints make it not
independent. All three are DB facts, verified [S98], not predictions.

1. **A segment cannot be inserted against a closed session.** `owns_open_session()`
   (`20260710130000_module6_6a_time_tracking.sql:172-183`) requires `clock_out IS NULL`. A full shift
   captured offline — clock in 07:00, segments, clock out 15:00 — must therefore replay as
   **INSERT session (`clock_out` NULL) → INSERT segments → UPDATE session set `clock_out`**. If the
   queue collapses the shift into one INSERT that already carries `clock_out`, every segment insert is
   rejected by RLS and the shift syncs with no attribution. The queue must preserve
   parent-before-child order and must not fold a later `clock_out` into the original insert.
2. **One open session per member, enforced by a partial unique index.**
   `idx_time_clock_sessions_one_open_per_member` (`:127-129`) is
   `UNIQUE (member_id) WHERE (clock_out IS NULL AND is_deleted = false)`. Upsert-on-pk makes a *replay*
   safe, but two genuinely different offline sessions left open will collide on sync. Surface that as a
   `Needs attention` queue entry (§5.2.3), never as a silent drop.
3. **Queued photos must upload through `uploadFile`, not straight to storage.** The HEIC→JPEG
   conversion lives inside `uploadFile` (`files-client.ts:84`), not in a storage trigger. A queue that
   holds a blob and PUTs it to the `project-files` bucket on reconnect bypasses the conversion and
   silently reintroduces TECH_DEBT #94 for exactly the users the PWA is built for. See GAP-7.

### 5.6 Conflict — the server version stands (D-17)

**The case:** a daily log is edited on desktop while an offline copy of that same log sits in the phone's
queue. Both writes are legitimate — `daily_logs_update_authorized`
(`20260711150000_module6_6b_daily_logs.sql:298-306`) lets the author update their own log, and RLS blocks
neither. Left alone, §5.3's upsert-on-primary-key would replay the phone's copy straight over the desktop
edit with no trace that the desktop edit existed.

**The rule.** Before replaying any queued mutation that targets an **existing** row, compare the server
row's `updated_at` against the queued item's `captured_at`:

- **Server `updated_at` ≤ queued `captured_at`** → no conflict. Replay normally.
- **Server `updated_at` > queued `captured_at`** → **conflict. The server version stands.**
  - The queued copy **is not written.** The desktop edit remains live and untouched.
  - The queued copy **is not discarded.** This is the whole point of the ruling — offline work is never
    destroyed to protect a server row.
  - The entry **leaves the sync queue** and **enters reconciliation review.** It stops being retryable:
    no backoff, no further attempts, and it no longer counts toward the queued-count pill (§5.2.4), which
    must continue to mean "records that will actually upload".
  - **The field user is told**, on the device, at the moment the conflict is detected — not silently
    moved. The message names the record and says their copy was kept and sent for review. It is not the
    generic `Needs attention` treatment of a failed retry (§5.2.3), because nothing here will succeed on
    a retry and offering one would be a lie.
  - Reconciliation is **manual, by Owner or Admin**, who see both versions and choose. Nothing
    auto-merges. Nothing expires.

**A first write is never a conflict.** An INSERT of a row id the server has never seen has no server
`updated_at` to compare, so the ordinary idempotent-upsert path (§5.3) applies unchanged. Conflict
detection is strictly an update-to-an-existing-row concern.

**The losing copy goes to a server-side table, not to the phone.** IndexedDB is the wrong home for
something that must survive the user clearing the PWA, switching handsets, or never opening the app
again. The store is `sync_conflicts` (§5.7) and it is **required migration 2 of 2** (§7b).

**The review surface itself is still out of scope for M6M** — the Owner/Admin screen that resolves a
conflict is desktop work, and no route, screen or notification for it is specced here. **What is no
longer out of scope is the data**: §5.7 defines the table so that surface needs **no schema change** when
it is built. What it will read and write is stated there.

### 5.7 `sync_conflicts` — the holding store (D-17 as extended [S98])

Required migration 2 of 2 (§7b). **Not written here** — this section states the shape; the migration is
Josh's to run.

**What it holds.** One row per rejected queued copy.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | `uuid PK DEFAULT gen_random_uuid()` | |
| `company_id` | `uuid NOT NULL DEFAULT get_my_company_id()` | Per-tenant, per the house rule. |
| `target_table` | `text NOT NULL` | `CHECK (target_table = ANY (ARRAY['daily_logs']))` in v1 — see "why the shape is generic" below. |
| `target_row_id` | `uuid NOT NULL` | The row the copy conflicts with. **No FK** — the target table varies, and a FK to one table would block the CHECK ever widening. |
| `project_id` | `uuid REFERENCES projects(id)` | Denormalised so a future surface can scope and filter without joining through the target row. |
| `rejected_body` | `jsonb NOT NULL` | The queued payload **exactly as the online path would have sent it** (§5.2). |
| `captured_at` | `timestamptz NOT NULL` | The business timestamp from the queue entry — when the field user acted, not when the conflict was detected. |
| `author_member_id` | `uuid NOT NULL REFERENCES company_members(id)` | The field user whose work is being held. |
| `server_updated_at` | `timestamptz NOT NULL` | The target row's `updated_at` **at detection** — the value that lost the comparison, kept so a reviewer can see the race that occurred. |
| `status` | `text NOT NULL DEFAULT 'pending'` | `CHECK (status = ANY (ARRAY['pending','kept_server','kept_field','dismissed']))`. |
| `resolved_by` | `uuid REFERENCES company_members(id)` | Null while pending. |
| `resolved_at` | `timestamptz` | Null while pending. |
| `resolution_note` | `text` | Optional free text from the reviewer. |
| standard columns | | `created_at`, `updated_at`, `created_by`, `updated_by`, `is_deleted`, `deleted_at`. **This is not an append-only log** — it has a resolution lifecycle, so it takes the full standard column set, both BEFORE UPDATE triggers (`sync_conflicts_updated_at`, `sync_conflicts_set_updated_by`) and the three column defaults. |

**Deliberately NOT stored: a snapshot of the server row.** A reviewer choosing between "the field copy"
and "the desktop version" should be looking at the desktop version **as it is now**, not as it stood at
detection — the row may have been edited again since. `server_updated_at` records the race; the live row
supplies the content. Storing a stale snapshot would let a reviewer keep a version that no longer exists.

**Who can read it — Owner/Admin.** Consistent with D-17: reconciliation is an Owner/Admin job.

```sql
-- SELECT / UPDATE: Owner and Admin only.
sync_conflicts_select_owner_admin   -- company_id = get_my_company_id() AND get_my_role() IN ('owner','admin')
sync_conflicts_update_owner_admin   -- same predicate; this is how a row is resolved

-- INSERT: the author writes their own conflict during sync; Owner/Admin may also write one.
sync_conflicts_insert_authorized
  -- company_id = get_my_company_id()
  -- AND (author_member_id = get_my_member_id() OR get_my_role() IN ('owner','admin'))

-- DELETE: NO POLICY AT ALL. Denied to every role, matching the financial side tables.
```

> **Consequence the build must handle:** the field user can INSERT their conflict but **cannot SELECT it
> back** — they are not Owner/Admin. The client must insert **without requesting the representation**
> (no `.select()` chained onto the insert), or the write appears to fail when only the read was refused.
> This is the same class of trap as the storage-policy helper issue in CLAUDE.md: the error surfaces far
> from its cause.

**Lifecycle.**

1. **Created** by the syncing client at the moment §5.6's comparison rejects a replay — one row, status
   `pending`. This is the same step that removes the entry from the sync queue, and the two must be
   atomic from the user's point of view: a queue entry is never dropped before its `sync_conflicts` row
   is durably written. If the insert itself fails, the entry stays queued and retryable — a conflict that
   could not be recorded has not been handled.
2. **Resolved** by an Owner or Admin setting `status` to `kept_server`, `kept_field` or `dismissed`,
   with `resolved_by` and `resolved_at`. Applying a `kept_field` resolution — actually writing the held
   body onto the target row — is the review surface's job, not the queue's.
3. **Kept, never deleted.** Resolved rows stay, with their status. They are the audit trail of a
   near-miss data loss, and the trash-bin rule (soft delete only, no DELETE policy) applies. Nothing
   expires and nothing is purged on a schedule.

**What a future review surface reads and writes — so it needs no schema change.**

- **Reads:** `sync_conflicts WHERE status = 'pending' AND is_deleted = false`, joined to
  `company_members` on `author_member_id` for a name, and to the live target row on
  `(target_table, target_row_id)` for the current server version. `project_id` scopes the list.
  `rejected_body`, `captured_at` and `server_updated_at` render the field side and the race.
- **Writes:** `status`, `resolved_by`, `resolved_at`, `resolution_note` — and, for `kept_field`, an
  ordinary update to the target row through its existing service.
- **Needs no new column** for any of that. If it later wants notifications or assignment, those are
  additive and not M6M's problem.

**Why the shape is generic when the ruling named the daily log.** §5.6's comparison applies to any queued
mutation targeting an existing row, so the table is keyed by `(target_table, target_row_id)` rather than
by `daily_log_id`. In v1 the daily log is the **only** producer, and that is not an accident: a clock-in
and a photo are inserts, and A-19f rules an insert is never a conflict. The CHECK is therefore pinned to
`'daily_logs'` — widening it later is a one-line change, whereas a `daily_log_id` column would have had
to be migrated away.

---

## §6 — Camera-first capture (D-8)

The tab bar's centre action is a **global capture action**. Tapping it opens the **camera immediately**
(`<input type="file" accept="image/*" capture="environment">`), with a small secondary control to switch to
the photo library.

- With a project in context, the photo files to that project.
- With no project in context, the app asks which project **after** the shot is taken, never before.
- Offline, the photo enters the queue (§5.2) and the user is told it will upload later — in the same
  confirmation, not a separate alert.

Photos land in the `project-files` bucket with `files.category = 'photos'`. The same camera-first rule
applies to every field image input (daily log, incident, delivery damage). Gallery is always reachable;
camera is always the default.

---

## §7 — PWA prerequisites

1. `apps/web/app/manifest.ts` (or `public/manifest.webmanifest`): `name`, `short_name: "FrameFocus"`,
   `start_url: "/m"`, `display: "standalone"`, `background_color: "#14213d"`, `theme_color: "#14213d"`.
2. Icons at 192, 512, and a 512 maskable.
3. A service worker registered from the mobile layout — app-shell caching plus the queue's retry hook.
4. `apple-mobile-web-app-capable` and status-bar-style meta for iOS home-screen install.

These four are also the prerequisites for Web Push on iOS (Gate 4). Notifications are not built here, but
nothing in this spec may make them harder.

---

## §7a — Required migration 1 of 2: subcontractor photo access (D-20, extended [S98]) — **BUILD STEP 1**

**This is the first thing built, before any route, screen or component.** D-11 puts every role on `/m` and
§3.2 puts the camera in the centre of the tab bar on every screen. Today a subcontractor who taps it gets
a rejection **after** taking the photo. Building the shell first means every mobile screen is demoed and
reviewed with its most prominent control broken for one role.

### It is FOUR policies, not one

> **[S98] Scope correction — this is the finding that matters most in this section.** The original §7a
> named one policy: `public.files` INSERT. **That alone would not have worked.** A photo is two writes —
> the **row** in `public.files` and the **bytes** in `storage.objects` — governed by two independent
> policy sets, and `subcontractor` is missing from **both**. Widening only `public.files` produces a
> subcontractor who can insert a file row whose bytes the storage layer refuses. Verified against the
> current definitions, which live in `20260728000000_security_rls_96_99.sql` (it drops and recreates all
> four storage policies; the earlier `20260714175906_project_files_storage_policies.sql` is superseded).

| # | Policy | Object | Why it is needed | Ruling |
| - | ------ | ------ | ---------------- | ------ |
| 1 | `files_insert_non_client` | `public.files` | The file **row** for a captured photo. | D-20 |
| 2 | `files_update_non_client` | `public.files` | Markup Save writes `files.markup_data` — an **UPDATE** (`markup-editor.tsx:244`). Without it a sub can upload a photo and not annotate it, including one they just took. | **[S98] Josh — widen it too** |
| 3 | `project_files_insert_non_client` | `storage.objects` | The photo **bytes**, and the first write of a markup derivative. | **[S98] found while applying the above** |
| 4 | `project_files_update_non_client` | `storage.objects` | Overwriting the derivative in place on re-edit (§4.10). | **[S98] found while applying the above** |

All four carry the identical five-role array, and all four get `'subcontractor'::text` appended to it:

```sql
-- present in all four, and the ONLY thing that changes in any of them
AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text])
```

### The role array is the only thing that changes

Verified arm by arm, not assumed. **Every other arm already admits an assigned subcontractor correctly
and must be left byte-identical.**

**On `public.files` (policies 1 and 2):**

- **The `client_visible` arm** requires a non-owner/admin to write with `COALESCE(client_visible, false)
  = false`. A sub's field photo is not client-visible, so this passes unchanged and keeps subs from
  publishing to the client portal. Correct as-is.
- **The category/project arm** requires `project_id IS NOT NULL` and, for photos,
  `category <> ALL ('contracts','change_orders','invoices') AND can_view_project(project_id)`.
  `can_view_project` (`20260704211000_module5_5a_projects.sql:248-262`) admits **any assigned member
  regardless of role**, so an assigned sub passes and an unassigned one does not. Correct as-is.

**On `storage.objects` (policies 3 and 4):**

- **The company arm** is the inline-subquery form the house rule requires —
  `(storage.foldername(name))[1] = (SELECT company_id::text FROM profiles WHERE user_id = auth.uid() …)`.
  Untouched.
- **The project-assignment arm** matches segment 2 of the path against the UUID pattern and requires a
  `project_assignments` row reached via `company_members → profiles → auth.uid()`. That join is **role-blind**,
  so an assigned sub satisfies it today. Untouched.
- **SELECT needs no change at all.** `project_files_select_non_client` gates on
  `get_my_role() <> 'client'` plus the same assignment arm — a subcontractor already passes both. Do not
  touch it, and do not "tidy" it to match the others.
- **DELETE stays Owner/Admin.** `project_files_delete_owner_admin` is not in scope and does not change.

Net grant to a subcontractor: on a project they are assigned to, write and re-write a non-client-visible,
non-financial file and its bytes. Nothing else.

### Consequences the rest of the spec depends on

- **A file cannot be inserted without a project** for any non-owner/admin role — every field role. §6's
  "with no project in context, ask which project *after* the shot" is therefore not a UX preference but
  the only sequence the database permits; the shot is held client-side until a project is chosen (A-21c).
- **The derivative is subject to the same storage policies as the original**, because it lives in the
  same bucket under the same `{company_id}/{project_id}/` prefix (§4.10). Policies 3 and 4 are what let a
  sub's markup save land at all.

**NOT written here.** Per the ruling and this session's scope, the spec states the changes; it does not
write the migration. Four DROP/CREATE pairs, no data change, no column change, no backfill.

---

## §7b — Required migration 2 of 2: the conflict holding store (D-17, extended [S98])

Specified in **§5.7**, which defines the table, its RLS, and its lifecycle.

**Ordering — must it land before the mobile build starts?** **Before the offline queue is built; not
before the shell.** §7a is genuinely build step 1 because the camera is on every screen from the first
commit. The holding store is only reachable once a write can be queued, so it must land **before any
offline write path ships**, and no later. Shipping the queue first would mean shipping a conflict path
with nowhere to put a conflict — which is precisely the bounded gap D-17 was extended to close.

Both migrations are independent of each other and can land in either order relative to one another.

---

## §8 — Known gaps for CC to resolve before build

- **GAP-1 — CLOSED (D-15). No migration.** `files` carries no punch column, but the relationship already
  exists from the other side: `punch_list_items.reference_photo_file_id` and
  `.completion_photo_file_id` (`20260704214000_module5_5c_punch_lists.sql`), both Module 3 files,
  already annotatable via the shared MarkupViewer. The gallery derives the badge by joining those two
  columns back to `files.id`. **Read-only. The two columns retain their distinct meanings — reference
  photo and completion photo are not interchangeable and must not be merged into one link.**
- **GAP-1b — CLOSED [S98]. `assignee_id` holds a `company_members.id`.** The column is FK-constrained:
  `20260704214000_module5_5c_punch_lists.sql:116` —
  `ADD CONSTRAINT punch_list_items_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.company_members(id)`.
  The `-- broad; NOT membership-gated` comment at `:85` describes the **RLS visibility rule**, not the
  referent — `punch_list_items_select_visible` (`:186-194`) reads
  `can_view_project(project_id) OR assignee_id = public.get_my_member_id()`, i.e. an assignee sees their
  own item even without a `project_assignments` row. **The exact comparison for D-16's "mine" is stated
  in §4.3.** No migration, no ambiguity.
- **GAP-2 — CLOSED BY RULING [S98]. Deferred to v2; nothing is built.** D-14 is amended: the Photos
  badge is the total count, with **no** unseen dot, and **no view-tracking table is created**. The
  finding below stands as the record of why — it is what the deferral is deferring. The v2 shape is
  recorded in §9 so it can be added later without reworking the badge. _(Original finding:)_ D-14 required
  "last viewed" state for the amber dot. Verified absent: no `last_viewed` / `viewed_at` / `seen_at`
  column on `files` (`20260101000000_baseline_schema.sql:1367-1390` — the full column list), and no
  per-user view-state table anywhere in `supabase/migrations/`. The only `viewed_at` in the schema is
  `estimates.viewed_at` (`:1338`), which tracks a *client* opening a proposal and is unrelated.
  `files.is_favorite` (`:1387`) is the near-miss precedent — a per-row flag with **no user column**, so
  it is company-wide, not per-user, and cannot be copied. **Ruled: deferred — §11 Decision 1.**
- **GAP-3 — CLOSED [S98].** Every binding on M-2 and M-3 is bound to a named file and line, **cut by
  ruling**, or **dropped by ruling**. Nothing is left MISSING. See §8a: "Up next" is now bound to the
  schedule UNION (D-6 ruling), progress % is cut (D-19) and `{m} estimating` is dropped (D-4 ruling).
- **GAP-4 — CLOSED [S98]. A client-supplied `id` passes all four INSERT policies.** None of the four
  references `id` in its `WITH CHECK`; each gates on company, role, and membership only. Quoted in
  §5.3. **One consequence the queue model did not account for is recorded in §5.5 — read it before
  building the queue.**
- **GAP-5 — CLOSED BY RULING [S98]. The server version stands (D-17).** The queued copy neither
  overwrites nor is discarded; it leaves the queue and enters Owner/Admin reconciliation review. Full
  contract, including what happens to the queue entry and what the review surface will need, in **§5.6**.
- **GAP-6 — CLOSED BY RULING [S98]. Both harnesses (D-18).** Queue logic is unit-tested in the existing
  Node runner; screen-level and browser-state criteria move to **Playwright, which this repo does not
  currently carry**. Nothing in §10 remains untestable. Assignment table in §10a.
- **GAP-7 — CLOSED. Stale as written; TECH_DEBT #94 was fixed in Session 90.** The gap text above was
  written from the handoffs, not from the repo. What actually happens to a HEIC upload today, on every
  existing path: `uploadFile` (`apps/web/lib/services/files-client.ts:59`) detects
  `image/heic` / `image/heif` (`:30`, `:84`), dynamically imports `heic2any`, converts to JPEG at
  quality `0.82` (`:42-46`), keeps the first frame of a multi-frame burst (`:48-49`), renames the file
  to `.jpg` (`:51`) and stores `mime_type = 'image/jpeg'`. On **any** conversion failure it logs and
  uploads the original bytes unchanged (`:54`) — it never fails harder than the pre-fix behaviour. The
  size limit is applied to the **original** bytes, before conversion (`:68`). Closed Session 90, commit
  `de3eaf9` (`TECH_DEBT.md:289`); the fix sits at the shared call site, so daily logs, safety,
  deliveries, 7A receipts and generic files were all covered without consumer changes.
  **No fix is designed here and none is needed.** The only thing the mobile build owes this: the
  offline photo queue must upload **through `uploadFile`**, not by writing to storage directly, or it
  silently loses the conversion. That obligation is recorded in §5.5.
- **GAP-8 — Mobile Field Capture handoff** (clock, segment switch, daily log, delivery check-in, incident)
  is referenced by both handoffs but has not been provided. M-5 and M-6 above are specced from the locked
  patterns, not from that handoff; if it arrives, reconcile.

---

## §8a — Data bindings (closes GAP-3)

Every figure on M-2 and M-3, bound to a named file and line, or removed by ruling. **[S98] No row is
MISSING any more** — the three that were are now ruled: `{m} estimating` dropped (D-4), progress % cut
(D-19), "Up next" bound to the schedule (D-6). Nothing here was invented to fill a gap; two figures were
deleted instead.

| Figure (screen)                     | Status      | Source                                                                                                                                                                                                                                                     |
| ----------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{n} active` (M-2 app bar)          | **BOUND**   | `projects.status = 'active'` with `is_deleted = false`. Reference derivation: `apps/web/lib/services/dashboard.ts:49-53`, surfaced as `activeProjectCount` at `:91`. On mobile it is the count of the rows M-2 already lists — no second query.            |
| `{m} estimating` (M-2 app bar)      | **DROPPED [S98, D-4]** | **There is no `estimating` project status** — `projects_status_check` (`20260704211000_module5_5a_projects.sql:120`) permits exactly `active, on_hold, complete, archived, cancelled`, and `ProjectStatus` (`projects.ts:7`) mirrors it. Ruled: the figure is removed from the header rather than a status being added. Nothing binds it because nothing renders it. |
| `62%` progress (M-2 card, M-3 stat) | **CUT [S98, D-19]** | No project-level percentage exists; the nearest ingredient is phase-level `PhaseRollup.percent` (`tasks-shared.ts:48, 83-88`), the mean of `tasks.percent_complete` **within one phase**. Ruled cut from v1 rather than derived. The M-2 progress bar and the M-3 Progress stat are both removed — §4.2 and §4.3 carry the respec. |
| `38 days left` (M-2 card, M-3 stat) | **BOUND**   | `projects.target_end_date` (`20260704211000_module5_5a_projects.sql:105`). Existing derivation: `apps/web/app/dashboard/projects/[id]/page.tsx:104-111`, rendered as the "Days to Target" KPI at `:140-145`. **Signed** — it goes negative past target — and `null` when the date is unset, which the desktop renders as `—` with a "Needs dates" caption. Mobile must carry both states; `38 days left` is only the happy path. |
| `{total} open` punch (M-3, M-2)     | **BOUND**   | Exact-count query on `punch_list_items`, `is_deleted = false`, `status IN ('open','in_progress')`, `project_id = :id`. Reference: `apps/web/app/dashboard/projects/[id]/page.tsx:71-76`. The company-wide twin is `dashboard.ts:78-85`. D-16's definition of "open" matches both precedents exactly. |
| `{mine}` punch (M-3, M-2)           | **BOUND**   | The same query plus `assignee_id = get_my_member_id()` — see §4.3 for the exact expression. `get_my_member_id()` is defined at `20260704210000_company_members_foundation.sql:104-114`.                                                                     |
| "Up next" (M-3)                     | **BOUND [S98, D-6]** | The next upcoming item from the calendar UNION: `getCalendarEvents({ projectId })` (`schedule.ts:106`), filtered to `start_date >= today`, first row of the existing ascending sort (`schedule.ts:200`), tie-broken inspection → task → general → title. Per-source tables and date columns in the §4.3 table. **No milestone entity was introduced** — `grep -rn "milestone"` still returns nothing across `supabase/`, `apps/web/lib` and `packages/`, and nothing was added to make it return something. Viewer-dependent for crew/subcontractor via `schedule_entries_select_scoped` (`20260704213000_module5_5b_tasks_scheduling.sql:406-414`) — stated in §4.3. |
| "currently clocked into" (M-2, D-12)| **BOUND**   | `getOpenSession()` (`time-tracking.ts:53`) → the open segment → its `project_id`. The open-segment expression already exists twice: `components/time/clock-modal.tsx:149` (`s.segment_end === null && !s.is_deleted` — use this one, it carries the soft-delete guard) and `dashboard/timeclock/timeclock-client.tsx:121`. **Caveat, and it is not an edge case:** `time_segments_project_gate_check` (`20260710130000_module6_6a_time_tracking.sql:225-228`) *forces* `project_id IS NULL` on `travel`, `shop` and `break` segments. A clocked-in user on a break has an open session and **no** current project. See §4.2. |
| Photo count / gallery (M-3, M-8)    | **BOUND**   | `getFiles({ projectId, category: 'photos' })` (`files.ts:29-48`). There is no count-only function; the count is the length of the list. **The unseen dot is deferred to v2 [S98, D-14 as amended]** — the badge is this count and nothing else, so there is no unbound half left. |

---

## §9 — Out of scope

- Finance surfaces of any kind on mobile (D-9).
- Push notifications (D-10, Gate 4).
- Offline **reads** of arbitrary data. v1 offline is about not losing writes.
- Delivery check-in offline (D-6).
- Any change to `apps/mobile` (PARKED) or to the desktop shell's inline styles (D-2).
- **A project-level progress percentage** (D-19). Not deferred pending a derivation — cut. If it returns,
  it returns as a decision about what "progress" means, not as a mobile styling task.
- **The offline reconciliation review surface** (D-17). M6M detects the conflict, holds the copy and tells
  the user; the Owner/Admin screen that resolves it is desktop work. What it will need is enumerated in
  §5.6 so the queue does not have to be reopened to serve it.
- **Per-user unseen-photo tracking** (D-14 as amended). Deferred to v2 — see the v2 note below.

### v2 shape for the unseen-photo dot — recorded so it drops in without rework

D-14's dot is deferred, **not redesigned**. When it returns, the intended shape is
**per-project last-viewed, not per-photo**:

- A table keyed `(company_id, project_id, member_id)` with a single `last_viewed_at` — **one row per
  member per project**, upserted when the gallery is opened. Bounded row count, one write per gallery
  visit.
- "Unseen exist" is then `EXISTS (SELECT 1 FROM files WHERE project_id = :p AND category = 'photos' AND
  created_at > last_viewed_at)` — a predicate, not a per-photo join.
- **Why this shape survives v1 unchanged:** the Photos badge already renders the total count from
  `getFiles({ projectId, category: 'photos' })`. The dot is a second, independent boolean beside that
  count. Adding it later touches the badge component and adds a query; it does not change the count's
  binding, the tile grid, or anything in §4.8's gallery.
- **What v1 must therefore avoid:** do not make the badge a single fused "count + state" value, and do
  not cache photo counts per user. Keep the count company-wide and stateless, exactly as §8a binds it.
- Accepted limitation of this shape, already understood: opening the gallery clears the dot for photos
  the user never scrolled to. Per-photo precision would need the heavier `(file_id, member_id)` table,
  and that trade was considered and declined for v2's first cut.

---

## §10 — Acceptance criteria

Each criterion tests a _sentence of this spec_, not a summary of it.

> **[S98] This section was re-read against the prose of §3–§7, sentence by sentence, rather than against
> the other criteria.** S97 shipped three gaps because criteria were written from summaries. Additions
> carry sub-letter IDs so existing numbers stay stable. Two criteria contradicted the sentence they were
> meant to test — see A-23 and A-24, both now corrected.
>
> **Every criterion carries its harness [S98, D-18].** `[live]` = the existing Node harness against
> rebuild-test; `[unit]` = the committed vitest suite, queue logic with injected storage and online
> predicate; `[Playwright]` = browser-driven, **a dependency this repo does not currently carry**;
> `[manual]` = a release check no tool can automate. **Nothing is marked UNTESTABLE any more** —
> the ten that were are assigned in §10a. Criteria with no marker are static or build-time checks.

**Shell**

- A-1 The tab bar renders on every `/m/**` route except M-9 and M-10, and does not scroll out of view.
- A-1b On M-9 and M-10 the tab bar is **replaced by that screen's own action row**, not simply absent — the 4-up row on M-9, the Undo/Redo/Done row on M-10. _(§3.2 promised a replacement; A-1 only tested the absence.)_
- A-1c The active tab reflects the current screen on every `/m/**` route — arriving at `/m/p/{id}` by any path leaves Projects active. _(§3.2 — no prior criterion.)_
- A-2 With the hamburger sheet open, the tab bar is still visible **and tappable** — tapping Timeclock through the open sheet navigates. `[Playwright]`
- A-3 The hamburger sheet contains **no** tile for Projects, Timeclock, Logs, or Field.
- A-3b The hamburger sheet contains **exactly** the seven tiles named in §3.3 — Dashboard, Schedule, Expenses, Subs & Vendors, Team, Contacts, Settings — plus the full-width Sign out row. _(A-3 tested only the negative. §3.3's positive list had no criterion at all — this is the same class of gap S97 shipped.)_
- A-3c The tile matching the current location carries the blue border and blue label; no other tile does. _(§3.3 — no prior criterion.)_
- A-3d Tapping the scrim closes the sheet, and tapping the hamburger closes it. _(§3.3 — no prior criterion.)_
- A-4 On a project screen the hamburger is absent and a back chevron is present.
- A-5 Every interactive element on every `/m/**` screen measures ≥44px in its smallest dimension, except the markup colour swatches (34px, 8px apart). `[Playwright]`

**Landing (D-12)**

- A-6 A successful sign-in lands on `/m/timeclock`, not `/m/projects` and not the dashboard.
- A-7 Clocking in with a project selected navigates to that project's hub; clocking in with no project navigates to the dashboard.

**Projects list**

- A-8 The card for the project the signed-in user is currently clocked into carries the blue border **and** the "On site" pill; no other card does.
- A-8b With the signed-in user clocked in on a `break` / `travel` / `shop` segment, **no** card carries the border or pill, and no card is highlighted by falling back to a recent project. _(§4.2. A-8 alone passes vacuously in this state, which is the state the DB constraint guarantees exists.)_
- A-9 Filter chips are single-select — selecting "Mine" deselects "All".
- A-9b The chip row renders exactly All / Active / Mine / On hold, and each chip changes the rows listed. _(§4.2 — no prior criterion.)_
- A-9c Typing in the search field filters the list without a submit action. _(§4.2 "Search filters live" — no prior criterion.)_
- A-10 Every number on the screen renders in IBM Plex Mono; no number renders in Barlow. `[Playwright]`
- A-10b The status pill always renders its text label; no status is conveyed by fill colour alone. _(§4.2. This is the same accessibility class as A-24, which did have a criterion — the pill did not.)_
- A-10c The app bar renders `{n} active` and **nothing after it** — no second count, no separator, no `estimating` figure. _(Rewritten [S98, D-4]. The old criterion tested a two-part header that no longer exists; this one fails if the dropped half comes back.)_
- A-10d **No project card renders a progress bar or a percentage anywhere on M-2.** _(New [S98, D-19]. The bar was cut; without this, a build that keeps it violates §4.2 and no criterion notices.)_
- A-10e The card footer renders days-left in all three states — a positive count, a **negative** count past target rather than a clamp at zero, and the empty state when `target_end_date` is null. _(§4.2 as amended; the desktop precedent at `projects/[id]/page.tsx:104-111, 140-145` already handles all three.)_

**Project sections**

- A-11 The Punch stat renders amber when the count is non-zero and muted when it is zero.
- A-11b The Punch stat and the Punch List tile both read `{mine} mine · {total} open`, and `{mine}` differs between two members with different assignments on the same project.
- A-11c An item moved to `complete` drops out of both figures; an item at `in_progress` stays in both.
- A-11d The "Days left" stat renders the signed value from `projects.target_end_date`, renders a negative number past target rather than clamping at zero, and renders the empty state when the date is null. _(§4.3 + §8a. The spec's `38 days left` is the happy path only; the desktop precedent already handles all three states.)_
- A-11e The stat strip renders **exactly two** stats — Days left and Punch — split 50/50 across the header width, separated by a **single** 1px rule. No third stat, no leftover one-third columns, no empty slot. _(Rewritten [S98, D-19]. The old criterion tested that a Progress stat was bound; the respec means the failure mode is now a strip that keeps three-column geometry after losing a stat, and this criterion catches that.)_
- A-11f The "Up next" card renders the **first** calendar event with `start_date >= today` for this project, from the union of dated tasks, schedule entries and inspections; a nearer-dated event added afterwards displaces it. _(Rewritten [S98, D-6].)_
- A-11g With two events on the same date, "Up next" applies the tie-break — inspection before task before general entry, then title ascending — and picks the same one on every render. _(§4.3. The underlying sort is on date alone, so without this the card flickers between equally-dated items.)_
- A-11h With no event dated today or later, "Up next" renders the "Nothing scheduled" empty state; the card is **not** omitted. _(§4.3.)_
- A-11i The "Up next" date line renders the event's date. It is **not** bound to `detail.notes`, which is absent for tasks — a task-sourced card renders a date, never a blank line. _(§4.3. This is the failure the binding was written to prevent.)_
- A-11j A crew member's "Up next" reflects the schedule rows RLS grants them — a general entry belonging to a teammate does not appear, while project tasks and inspections do. _(§4.3's viewer-dependency note. Without this the caveat is prose nobody verifies, and a build that "fixes" it by querying with elevated rights leaks another member's schedule.)_ `[live]`
- A-12 The section grid renders exactly nine tiles and **none** is Budget, Invoices, Payments, or Contracts.
- A-12b Change Orders and Punch List badges render amber, Deliveries red, Photos and Team plain mono. _(§4.3 — no prior criterion.)_
- A-13 The Photos tile shows the project's total photo count **and no dot** — no unseen indicator renders under any data condition, including photos created after the user's last visit. _(Rewritten [S98, D-14 as amended]. The dot clause is removed, and the criterion now fails if a dot is built anyway.)_

**Field (M-7) — §4.7 had no criteria at all**

- A-13b M-7 renders a 2-column grid of exactly four tiles — Daily logs, Deliveries, Safety, Photos — each with its attention badge.
- A-13c M-7's project context row names the project the tiles apply to, and tapping it switches project; the tiles then reflect the new project.

**Logs (M-6) — §4.6 was untested apart from the queue**

- A-13d A log still waiting to sync renders the `Queued` badge **in place of** the photo count, not alongside it. _(§4.6.)_
- A-13e M-6's chips are All / Mine / This project, single-select, and "This project" appears only when a project is in context.

**Offline**

- A-14 With the network disabled, the amber offline strip renders on the projects list, the project hub, and the timeclock screen — not only on `/m/offline`. `[Playwright]`
- A-14b Tapping the status strip navigates to M-4. `[Playwright]`
- A-14c A read-only surface with no local data renders the strip **and** its own empty state — it does not spin indefinitely, and it never renders stale data without the strip. `[Playwright]`
- A-15 A clock-in performed offline at time T and synced at T+3h stores `T` in `time_clock_sessions.clock_in`. `[live/unit]`
- A-15b The same `captured_at`-is-the-business-timestamp rule holds for a queued daily log and a queued photo, not only for a clock event. _(§5.2.1 is written for all three kinds; A-15 tested one.)_ `[live/unit]`
- A-16 Replaying the same queued mutation three times produces exactly one row. `[live]`
- A-16b A shift captured entirely offline (clock in, ≥1 segment, clock out) syncs with its segments attached — replaying in the order §5.5 requires, the segment inserts are not rejected by `owns_open_session`. _(§5.5.1. Without this, A-16 passes and the feature still loses every segment.)_ `[live]`
- A-17 A queued item whose sync fails permanently remains in "Waiting to sync" with its error visible; it is not dropped. `[unit + Playwright]`
- A-17b "Try again" forces an immediate sync attempt rather than waiting for the backoff interval. `[unit]`
- A-18 The queued-count pill equals the number of records/files that will actually upload. `[unit + Playwright]`
- A-19 Attempting a delivery check-in while offline blocks submission with an explicit message and creates **no** queue entry. `[Playwright]`

**Conflict — the server version stands (D-17, §5.6). All new [S98].**

- A-19b A queued update whose target row has a server `updated_at` **later** than the item's `captured_at` **is not written** — the server row is byte-identical before and after the sync attempt. `[live]`
- A-19c That same queued copy **is not discarded** — its payload and `captured_at` survive the rejection and remain retrievable. `[unit]`
- A-19d The conflicted entry **leaves the sync queue**: no further retry is attempted, no backoff is scheduled, and it **stops counting toward the queued-count pill**, which continues to equal only what will actually upload. `[unit]` _(Without the pill clause this passes while A-18 silently breaks.)_
- A-19e The field user is shown a message naming the record and stating their copy was kept and sent for review — and it is **not** the generic `Needs attention` retry treatment used for transient failures. `[Playwright]`
- A-19f A queued **insert** of a row id the server has never seen is **never** treated as a conflict — it takes the ordinary idempotent-upsert path even when the queue is replayed long after capture. `[live]` _(§5.6's "a first write is never a conflict". Without this, an over-eager conflict check strands every offline creation.)_
- A-19g The held copy is written to **`sync_conflicts`**, not to IndexedDB: after a conflict, clearing the PWA's local storage entirely leaves the rejected body, its `captured_at` and its `author_member_id` still retrievable server-side. `[live]` _(New [S98, ruling 2]. This is the criterion the ruling exists for — a store that survives only while the app does would satisfy A-19c and still lose the work.)_
- A-19h A queue entry is **never** removed before its `sync_conflicts` row is durably written — if that insert fails, the entry stays queued and retryable. `[unit]` _(§5.7 lifecycle step 1. Without this the conflict path can lose the very copy it exists to preserve.)_
- A-19i `sync_conflicts` is readable by Owner and Admin and by **no other role** — including the author of the held copy. `[live]`
- A-19j The author **can insert** their own conflict row while being unable to read it back, and the client does not chain a returning-representation read onto that insert. `[live]` _(§5.7's flagged trap: the write succeeds, the read is refused, and a `.select()` makes it look like the write failed.)_
- A-19k **No role can DELETE a `sync_conflicts` row**, and a resolved row is retained with its `status`, `resolved_by` and `resolved_at` rather than removed. `[live]`
- A-19l A `sync_conflicts` row stores `server_updated_at` but **no snapshot of the server row body**. `[live]` _(§5.7's deliberate omission. Needed because "we didn't store it" is invisible otherwise, and a well-meaning build would add it.)_

**Capture**

- A-20 Tapping the tab-bar camera opens the camera directly, not a picker. `[Playwright]`
- A-20b **Every** field image input — daily log, safety incident, delivery damage — opens the camera by default with the gallery as the secondary control, not just the tab-bar action. _(§6 says "the same camera-first rule applies to every field image input". A-20 tested one of four call sites — too narrow to fail if the other three regress.)_ `[Playwright]`
- A-20c A photo captured on any mobile path lands in the `project-files` bucket with `files.category = 'photos'`. `[live]`
- A-20d A queued offline photo uploads through `uploadFile`, so a HEIC capture is stored as JPEG with `mime_type = 'image/jpeg'` after sync. _(§5.5.3 / GAP-7 — without this the queue silently reopens #94 for exactly the users the PWA is built for.)_ `[live]`
- A-21 With no project in context, the project prompt appears **after** the shot, not before. `[Playwright]`
- A-21b With a project in context, the photo files to that project with no prompt at all. `[Playwright]`
- A-21c A photo is never submitted without a `project_id`. For every non-owner/admin role the DB rejects a project-less insert (§7a), so the shot is held client-side until a project is chosen. `[live]`

**Subcontractor access (D-20, §7a) — all new [S98]**

- A-21d A **subcontractor** assigned to a project can complete a photo capture end-to-end: the row inserts, with `client_visible` false. `[live]` _(Fails today; this is the failing-then-passing assertion for the §7a migration.)_
- A-21e A subcontractor **not** assigned to the project is still refused — the widening did not become a blanket grant. `[live]`
- A-21f A subcontractor is still refused an insert in `contracts`, `change_orders` and `invoices` categories, and still cannot insert with `client_visible = true`. `[live]` _(The two `public.files` arms §7a leaves untouched. Without this, a migration that widens more than the role array passes unnoticed.)_
- A-21g A subcontractor's photo **bytes** land in the `project-files` bucket, not just the `files` row. `[live]` _(New [S98]. `storage.objects` policies are independent of `public.files` — widening only the table produces a row whose bytes were refused, and A-21d alone would not catch it.)_
- A-21h A subcontractor assigned to a project can **save markup** on a photo — both writes land: `files.markup_data` updates and the derivative object is written. `[live]` _(New [S98, ruling 1]. Exercises `files_update_non_client` and `project_files_update_non_client` together; fails today on both.)_
- A-21i A subcontractor is refused a storage write outside their company prefix, and outside a project they are assigned to. `[live]` _(The company arm and the project-assignment arm §7a leaves untouched on `storage.objects`.)_
- A-21j A **client**-role user is still refused all four widened policies. `[live]` _(Four role arrays are being edited at once; this fails if `client` is admitted by a careless rewrite.)_

**Photos**

- A-22 A photo's source badge is derived from its link column; a photo with no link column set renders **no** badge.
- A-22b A file referenced by `punch_list_items.reference_photo_file_id` or `.completion_photo_file_id` carries the `Punch` badge and appears under the Punch filter chip.
- A-22c Rendering the gallery writes nothing — `punch_list_items` rows are byte-identical before and after (D-15 is read-only).
- A-22d The gallery groups by day, newest day first, labels the current day "Today", and loads further days on scroll. _(§4.8 — no prior criterion.)_
- A-22e Long-press enters multi-select; bulk share and bulk delete act on the selected set. _(§4.8 — no prior criterion.)_
- A-23 Saving markup writes **both**: the mark list to `files.markup_data`, **and** a flattened derivative image to storage. Asserting only one is not a pass. _(Rewritten [S98, D-21]. The old criterion named `markup_data` alone, so it passed under all three candidate storage models — including the two that never produce a shareable image. That is why it caught nothing.)_ `[live]`
- A-23b The original is **never modified** by a markup save — its bytes, `file_path`, `file_size` and `mime_type` are identical before and after, across two consecutive saves. Only `markup_data` differs. `[live]`
- A-23c Re-editing marks regenerates the derivative **in full from the original bytes**, not from the previous derivative, and **overwrites it in place** — after N saves there is exactly one derivative object and no accumulated recompression. `[live]`
- A-23d The derivative does **not** get its own `files` row: after a markup save, the project's photo count (§4.3) and the gallery tile count (§4.8) are unchanged. `[live]` _(The double-count failure §4.10 was written to prevent.)_
- A-23e The viewer's toggle reaches the **original** — with markup present and the derivative displaying, the toggle renders the unannotated original bytes. `[Playwright]` _(Amended [S98, ruling 3]: this is now the ONLY route to the unannotated image, so it is load-bearing rather than a convenience.)_

**Display precedence (§4.7a) — all new [S98, ruling 3]. Every criterion here concerns a photo that HAS a derivative; the missing-derivative case is BLOCKED in §4.7a and deliberately carries no criterion.**

- A-23f A photo with non-empty `markup_data` renders the **derivative** in the M-8 gallery thumbnail. `[Playwright]` _(The failure Josh named: a thumbnail showing the original while markup exists.)_
- A-23g The same photo renders the derivative in the **M-9 image stage** and in the **M-9 filmstrip** thumbnail. `[Playwright]` _(One rule, three surfaces — §4.7a exists so they cannot drift, and testing only the stage would let the filmstrip regress.)_
- A-23h A photo with **empty or null** `markup_data` renders the **original** on all three surfaces. `[Playwright]` _(Without this, a build that always takes the derivative path passes A-23f–A-23g and breaks every unannotated photo.)_
- A-23i Adding markup to a previously unannotated photo flips all three surfaces to the derivative **without a reload**, and removing every mark flips them back. `[Playwright]` _(Precedence is a function of current state, not of what was true when the screen mounted.)_
- A-23j A markup save that writes `markup_data` but fails to write the derivative **does not report success**. `[unit]` _(§4.7a.1. Under the old model this was a cosmetic lag; now it produces a photo the UI cannot display correctly.)_
- A-23k Re-editing marks updates what all three surfaces display — no surface serves a stale derivative after a re-save. `[Playwright]` _(§4.7a.2. A-23c proves the object was overwritten; this proves the UI is not caching past it.)_
- A-23l Every surface fetches the derivative through the same signed-URL flow as the original, from the same `{company_id}/{project_id}/` prefix. `[live]` _(§4.7a.3. A path that skips signing would work in testing and leak in production.)_
- A-24 The active markup tool is distinguishable without colour — it carries a **border** and a label change. _(Corrected [S98]: this read "a label weight change". §4.10 specifies `1.5px #f2453d` border plus a red icon **and label** — a colour change, not a weight change. The criterion was testing something the spec does not say, so it could pass on a build that violated §4.10. The border half is the colour-independent signal; the build must not substitute tint alone.)_
- A-24b Undo and Redo operate per-mark, and Redo renders dimmed when the redo stack is empty. _(§4.10 — no prior criterion.)_
- A-24c Cancel with unsaved marks prompts for confirmation; Cancel with no marks exits directly. _(§4.10 — no prior criterion.)_
- A-24d Markup opened from a punch item or an incident returns to that record and stays linked to it. _(§4.10 — no prior criterion.)_
- A-25 Every gesture on M-9 (swipe to page, swipe down to dismiss) has a visible on-screen equivalent.
- A-25b A photo carrying markup is visibly marked as such in the viewer. _(§4.9. A-23 covers the toggle; nothing covered the indicator.)_
- A-25c Tapping **Source** navigates to the originating daily log, delivery, or safety incident. _(§4.9 — no prior criterion.)_
- A-25d Delete prompts for confirmation and is refused for roles that cannot delete. `files_delete_owner_admin` (`20260101000000_baseline_schema.sql:3608`) restricts DELETE to Owner/Admin — "role-gated" in §4.9 means Owner/Admin, and the UI must not offer an action the DB will reject.

**PWA**

- A-26 The app installs to an iOS home screen and launches at `/m` in standalone display. `[manual]` — no tool installs a PWA to an iPhone home screen; this is a release check on a real device under any tooling choice.
- A-26b The manifest declares `start_url: "/m"`, `display: "standalone"`, `short_name: "FrameFocus"`, and both colours as `#14213d`. _(§7.1 — a plain fetch/parse, unlike A-26.)_ `[unit]`
- A-26c Icons exist at 192, 512, and 512 maskable, and the manifest references all three. `[unit]`
- A-26d A service worker is registered from the mobile layout and exposes the queue's retry hook. `[Playwright]`
- A-26e The mobile document head carries `apple-mobile-web-app-capable` and the status-bar-style meta. _(§7.4 — the iOS Web Push precondition D-10 depends on, so a regression here silently blocks Gate 4.)_ `[Playwright]`
- A-27 A full `npm run build` passes with the mobile tree present.

**Regression**

- A-28 `apps/web/app/dashboard/**` is unchanged by this work — `git diff --stat` against the merge base shows no desktop route files.
- A-28b No `lib/services/*` file is duplicated for mobile — the mobile tree imports the existing service functions. _(§1 "The service layer is shared… No duplicate data access is written for mobile" was normative and untested. Assertable by grep over the diff.)_

---

## §10a — Test harnesses (closes GAP-6; D-18)

**Ruled [S98, Josh]: both.** Queue logic is unit-tested; screen-level and browser-state criteria are
tested with Playwright. Nothing in §10 is left untestable.

**Why two were needed.** The live harness cannot simulate offline and never will:
`apps/web/test/live.vitest.config.ts:54` sets `environment: 'node'`, and `apps/web/test/live-session.ts:41`
mints a bare `supabase-js` client on the anon key carrying a real user JWT. That gives real RLS against the
real rebuild-test database — and nothing else. There is **no DOM, no `navigator.onLine`, no service
worker, and no IndexedDB**. Equally, a unit test with fakes can prove the queue reorders correctly but can
never prove the amber strip rendered or that a tap landed.

> **Playwright is a NEW DEPENDENCY. It is not in this repo today.** `apps/web/package.json` lists
> `vitest` as its only test dependency — there is no `jsdom`, `happy-dom`, `fake-indexeddb`, or browser
> driver anywhere. Adding it brings a new CI surface and browser binaries to install and cache. That cost
> is accepted by D-18; it is recorded here so it is not discovered mid-build.

### The four harnesses

| Marker | Runner | Scope |
| ------ | ------ | ----- |
| `[live]` | existing `test/*.live.ts`, `test/live.vitest.config.ts` | Real DB, real RLS, real JWT. DB-shaped assertions about the *result* of a sync. New file: `test/s98ct-offline.live.ts`; the §7a role work goes in `test/s98ct-mobile-roles.live.ts`. |
| `[unit]` | existing committed suite, `apps/web/vitest.config.ts` | The queue as a pure module with an **injected storage adapter** and an **injected online predicate**. Runs in CI. No DB, no browser. |
| `[Playwright]` | **new** | `context.setOffline(true)`, computed styles, bounding boxes, real taps. |
| `[manual]` | none | A-26 only. |

### Assignment of the ten that were previously unassignable

| Criterion | Harness | Mechanism |
| --------- | ------- | --------- |
| A-2 | Playwright | Open the sheet, tap Timeclock through it, assert navigation. Needs real hit-testing — the whole point of the criterion is that the sheet does not swallow the tap. |
| A-5 | Playwright | `boundingBox()` over every interactive element on each `/m/**` route; assert min dimension ≥44, with the markup swatches as the single declared exception. |
| A-10 | Playwright | Computed `font-family` on every numeric text node. |
| A-14, A-14b, A-14c | Playwright | `context.setOffline(true)`, then assert the strip on three routes, the tap-through to M-4, and the empty-state-not-spinner behaviour. |
| A-17 | unit + Playwright | Unit: a permanently-failing item stays in the queue with its error. Playwright: it is visible in "Waiting to sync". Split because the criterion asserts both retention *and* visibility. |
| A-17b | unit | Assert an immediate attempt is issued rather than waiting out the backoff — a clock-injection test, not a browser one. |
| A-18 | unit + Playwright | Unit: the count function equals what will upload, including the D-17 exclusion (A-19d). Playwright: the pill renders that number. |
| A-19 | Playwright | Offline, attempt a delivery check-in; assert the block message **and** that the queue length did not change. |
| A-26 | manual | No tool installs a PWA to an iPhone home screen. Release check on a real device. |

### What `[live]` proves today, with no new tooling

A-15, A-15b, A-16, A-16b, A-19b, A-19f, A-19g, A-19i–A-19l, A-20c, A-20d, A-21c–A-21j, A-22c, A-23–A-23d,
A-23l, plus A-28/A-28b as
shell checks. Two of these deserve their mechanism spelled out because the assertion runs backwards:

- **A-16b** — insert session (`clock_out` NULL) → segments → UPDATE `clock_out`, then repeat with
  `clock_out` set on the initial insert and assert the segment insert is **rejected**. The failing
  direction is what proves §5.5.1 is a real constraint and not a style note.
- **A-21d** — currently **fails**, and must, until the §7a migration lands. It is the failing-then-passing
  assertion the house rule requires for that migration.

**House rule.** Every fix still needs a failing-then-passing assertion. Under D-18 that rule is now
satisfiable for every criterion in §10 except A-26, which is manual by nature.
## §11 — Decision register (eleven ruled [S98, Josh]; ONE open)

The eight questions raised in the S98 gap pass are closed, and so are the three follow-ups from the
second ruling pass. **One item is open — see the blocked box below.** The rulings are recorded as D-14
(amended) and D-17…D-21 (D-17, D-20 and D-21 each extended by the second pass) in §0, and applied
throughout §4, §4.7a, §5, §5.7, §7a, §7b, §8a, §9 and §10.
Options considered are dropped rather than preserved — §0 is the register of what was decided, this is
the register of where each ruling landed.

| # | Question | **Ruling** | Applied in |
| - | -------- | ---------- | ---------- |
| 1 | What backs the unseen-photo dot? | **Deferred to v2. No dot, no view-tracking table.** Photos badge is the total count alone. | D-14 amended; §4.3; §8a; §9 v2 note; A-13 rewritten |
| 2 | Desktop edit vs queued offline copy? | **The server version stands.** Queued copy neither overwrites nor is discarded — it leaves the queue for Owner/Admin reconciliation, and the field user is told. | D-17; **§5.6** (new); §9; A-19b–A-19f (new) |
| 3 | Offline test tooling? | **Both** — unit tests for queue logic, **Playwright** for screen-level. Playwright is a new dependency. | D-18; **§10a** rewritten; every §10 criterion now carries a harness marker |
| 4 | What does `{m} estimating` count? | **Dropped.** Header shows the active count only; no status added to `projects_status_check`. | §4.2; §8a; A-10c rewritten |
| 5 | How is `62%` derived? | **Cut from v1.** No progress bar on M-2, no Progress stat on M-3; strip respecced to two stats. | D-19; §4.2; §4.3; §8a; §9; A-10d, A-11e |
| 6 | What is "Up next" bound to? | **The schedule** — next upcoming item from the existing calendar UNION. No milestone concept introduced. | §4.3 binding table; §8a; A-11f–A-11i |
| 7 | Subcontractor photo access? | **Subs upload AND annotate** [extended S98]. **Four** policies widened — two on `public.files`, two on `storage.objects`; **first build step**. | D-20; **§7a** rewritten; A-21d–A-21j |
| 8 | Markup storage? | **Both**, and [extended S98] **the derivative is what displays** wherever markup exists. Original never modified. | D-21; §4.10; **§4.7a**; A-23–A-23l |

### Second ruling pass [S98] — three follow-ups ruled

| Item | **Ruling** | Applied in |
| ---- | ---------- | ---------- |
| Subcontractor UPDATE policy | **Widen it too.** Same discipline — role array only. | D-20 extended; §7a rewritten to four policies; A-21f–A-21j |
| Conflict holding store | **Add it.** Server-side table, Owner/Admin read, resolved rows kept. | D-17 extended; **§5.7** (new); §7b; §5.6 bounded-gap language removed; A-19g–A-19l |
| Markup derivative | **Confirmed, and it is what displays** wherever markup exists. | D-21 extended; **§4.7a** (new); A-23e amended, A-23f–A-23l |

### ⛔ ONE ITEM OPEN — the only thing blocking a complete build

**What renders when `markup_data` is non-empty and no derivative exists.** Options and costs in **§4.7a**.
This is not a leftover from the first pass; ruling 3 created it by making the derivative load-bearing.
It is **not** a one-time backfill: the desktop editor writes `markup_data` and nothing else
(`markup-editor.tsx:244-247`), and M6M does not change desktop under A-28/D-2, so the population keeps
growing. Every other question raised in this session is closed.

### Carried forward — raised by a ruling, not covered by it

Both items carried out of the first ruling pass are now **CLOSED** by the second — `files_update_non_client`
is widened (D-20 extended) and the holding store exists (D-17 extended, §5.7). One new item was found
while applying them, and it is **already applied** rather than carried:

- **The `storage.objects` policies carried the same subcontractor omission as `public.files`.** A photo is
  two writes — the row and the bytes — under two independent policy sets. D-20 as originally specced
  widened only the row, which would have produced a subcontractor who inserts a file row whose bytes the
  storage layer refuses, and A-21d would have passed on the row insert alone. §7a now covers all four
  policies and A-21g asserts the bytes specifically. **This was not in either ruling; the direction was
  unambiguous, so it is applied rather than queued** — flagging it because it changes what "build step 1"
  costs, from one DROP/CREATE to four.
