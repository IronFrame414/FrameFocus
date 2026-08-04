# M6M — Mobile PWA Spec

> **Status:** DRAFT for build, S98.
>
> **Sources:** the _FrameFocus — Mobile App Shell_ handoff (6b nav menu, 6f projects list, 6g project
> sections, 6e offline) and the _FrameFocus — Mobile Photos_ handoff (6j gallery, 6k viewer, 6l markup),
> plus Josh's rulings in this session.
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
| D-14 | Photos badge                  | **Total count, with an unseen indicator.** The number is every photo on the project; an amber dot marks that unseen photos exist for this user.                                                                                                                                                                                                                       |
| D-15 | Punch photos                  | **No migration.** The link already exists on `punch_list_items` as `reference_photo_file_id` and `completion_photo_file_id`. The gallery derives the `Punch` badge by a **read-only** join: a file is punch-sourced if its `id` appears in either column. **Those two columns keep their existing meanings and are not merged, altered, or written to by this work.** |
| D-16 | Punch counter                 | **Mine first, then the project total** — e.g. `2 mine · 4 open`. Applies to the M-3 stat strip and the Punch List tile. **"Open" means `status IN ('open','in_progress')`** — not `complete`, not `verified`.                                                                                                                                                         |

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

App bar: "Projects" + mono `{n} active · {m} estimating`.
A **48px search field**; a horizontally scrolling **filter chip row** — All / Active / Mine / On hold,
active chip navy fill, 20px radius, **single-select**; then **project cards**, `gap:11px`:

- 15px radius, 15–16px padding
- name 17px/700 navy
- mono sub-line `PRJ-### · {client}`
- status pill top-right (always carries text, never colour alone)
- 7px progress bar
- footer: mono progress text left (`62% · 38 days left`), right-aligned callout (`4 punch`, `4 open`, `—`)

**The project the user is currently clocked into carries the `1.5px #2f49d1` border and an "On site" pill.**
Search filters live. Tap a card → M-3.

### 4.3 M-3 · Project — sections

Navy header: back chevron, project name 21px/800, mono `PRJ-### · {client}`, status pill, and a
**3-stat strip** divided by 1px rules — **Progress / Days left / Punch** (mono 19px; **Punch amber when
non-zero**, muted at zero). Per D-16 the Punch stat reads `{mine} mine · {total} open` — items assigned to
the signed-in member first, then the project-wide open total. When the user has none assigned, it renders
`0 mine · {total} open`, not a bare total. **"Open" is `status IN ('open','in_progress')`** — `complete`
and `verified` items are excluded from both figures.

Body: an **"Up next"** card — blue dot with a 4px `#e7ebf9` halo, milestone name 16px/700, amber
scheduling note. Then a mono **"SECTIONS"** label and a **2-column grid of 76px tiles**:

Overview · Schedule · Change Orders · Punch List · Deliveries · Files · Photos · Contacts · Team

Badges: Change Orders and Punch List amber, Deliveries red, Photos and Team plain mono. **Photos carries
the total count plus an amber dot when unseen photos exist** (D-14).

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

**Markup is a non-destructive layer.** Save writes an annotated derivative and keeps the original.
`files.markup_data jsonb` already exists and is the store. Cancel confirms if there are unsaved marks.

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
- Confirm the insert RLS policies on those four tables do not assume a server-generated id. _(Not verified
  in S98 — verify before building, per house rule.)_

> **Do not** dedupe on a natural key (member + project + minute). Two legitimate clock events can share a
> minute; a uuid cannot collide.

### 5.4 Presentation while offline

Any surface backed by data not held locally renders the offline strip and its own empty state. It does not
spin forever, and it does not show stale data without the strip.

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

## §8 — Known gaps for CC to resolve before build

- **GAP-1 — CLOSED (D-15). No migration.** `files` carries no punch column, but the relationship already
  exists from the other side: `punch_list_items.reference_photo_file_id` and
  `.completion_photo_file_id` (`20260704214000_module5_5c_punch_lists.sql`), both Module 3 files,
  already annotatable via the shared MarkupViewer. The gallery derives the badge by joining those two
  columns back to `files.id`. **Read-only. The two columns retain their distinct meanings — reference
  photo and completion photo are not interchangeable and must not be merged into one link.**
- **GAP-1b — `assignee_id` semantics unverified.** `punch_list_items.assignee_id` is commented
  _"broad; NOT membership-gated"_, so it is **not** safe to assume it holds a `company_members.id`.
  D-16's "mine" count needs the actual referent confirmed before it is written. **Do not assume.**
- **GAP-2 — Unseen-photo tracking does not exist.** D-14 requires per-user "last viewed" state for the
  amber dot. No such table or column was found. Needs a design + migration, or the dot is deferred.
- **GAP-3 — Data bindings unverified.** `62%` progress, `38 days left`, `4 punch`, the "Up next" milestone,
  the `4 active · 1 estimating` counts, and the "currently clocked into" query were **not** confirmed to
  exist in the service layer. Each needs a named source before the screen is built.
- **GAP-4 — Insert RLS on the four offline tables** not read; confirm a client-supplied `id` passes.
- **GAP-5 — Conflict rule undefined.** A daily log edited on desktop while an offline copy sits queued.
- **GAP-6 — Offline test method undefined.** A-11…A-16 need a mechanism in the live-assertion harness;
  house rule requires a failing-then-passing assertion per fix.
- **GAP-7 — HEIC.** iPhone photos arrive as HEIC (TECH_DEBT #94). Unresolved for the mobile capture path.
- **GAP-8 — Mobile Field Capture handoff** (clock, segment switch, daily log, delivery check-in, incident)
  is referenced by both handoffs but has not been provided. M-5 and M-6 above are specced from the locked
  patterns, not from that handoff; if it arrives, reconcile.

---

## §9 — Out of scope

- Finance surfaces of any kind on mobile (D-9).
- Push notifications (D-10, Gate 4).
- Offline **reads** of arbitrary data. v1 offline is about not losing writes.
- Delivery check-in offline (D-6).
- Any change to `apps/mobile` (PARKED) or to the desktop shell's inline styles (D-2).

---

## §10 — Acceptance criteria

Each criterion tests a _sentence of this spec_, not a summary of it.

**Shell**

- A-1 The tab bar renders on every `/m/**` route except M-9 and M-10, and does not scroll out of view.
- A-2 With the hamburger sheet open, the tab bar is still visible **and tappable** — tapping Timeclock through the open sheet navigates.
- A-3 The hamburger sheet contains **no** tile for Projects, Timeclock, Logs, or Field.
- A-4 On a project screen the hamburger is absent and a back chevron is present.
- A-5 Every interactive element on every `/m/**` screen measures ≥44px in its smallest dimension, except the markup colour swatches (34px, 8px apart).

**Landing (D-12)**

- A-6 A successful sign-in lands on `/m/timeclock`, not `/m/projects` and not the dashboard.
- A-7 Clocking in with a project selected navigates to that project's hub; clocking in with no project navigates to the dashboard.

**Projects list**

- A-8 The card for the project the signed-in user is currently clocked into carries the blue border **and** the "On site" pill; no other card does.
- A-9 Filter chips are single-select — selecting "Mine" deselects "All".
- A-10 Every number on the screen renders in IBM Plex Mono; no number renders in Barlow.

**Project sections**

- A-11 The Punch stat renders amber when the count is non-zero and muted when it is zero.
- A-11b The Punch stat and the Punch List tile both read `{mine} mine · {total} open`, and `{mine}` differs between two members with different assignments on the same project.
- A-11c An item moved to `complete` drops out of both figures; an item at `in_progress` stays in both.
- A-12 The section grid renders exactly nine tiles and **none** is Budget, Invoices, Payments, or Contracts.
- A-13 The Photos tile shows the project's total photo count, and an amber dot appears only when unseen photos exist for the signed-in user.

**Offline**

- A-14 With the network disabled, the amber offline strip renders on the projects list, the project hub, and the timeclock screen — not only on `/m/offline`.
- A-15 A clock-in performed offline at time T and synced at T+3h stores `T` in `time_clock_sessions.clock_in`.
- A-16 Replaying the same queued mutation three times produces exactly one row.
- A-17 A queued item whose sync fails permanently remains in "Waiting to sync" with its error visible; it is not dropped.
- A-18 The queued-count pill equals the number of records/files that will actually upload.
- A-19 Attempting a delivery check-in while offline blocks submission with an explicit message and creates **no** queue entry.

**Capture**

- A-20 Tapping the tab-bar camera opens the camera directly, not a picker.
- A-21 With no project in context, the project prompt appears **after** the shot, not before.

**Photos**

- A-22 A photo's source badge is derived from its link column; a photo with no link column set renders **no** badge.
- A-22b A file referenced by `punch_list_items.reference_photo_file_id` or `.completion_photo_file_id` carries the `Punch` badge and appears under the Punch filter chip.
- A-22c Rendering the gallery writes nothing — `punch_list_items` rows are byte-identical before and after (D-15 is read-only).
- A-23 Saving markup leaves the original file row intact and writes the annotation layer to `files.markup_data`; the viewer can toggle back to the original.
- A-24 The active markup tool is distinguishable without colour — it carries a border and a label weight change.
- A-25 Every gesture on M-9 (swipe to page, swipe down to dismiss) has a visible on-screen equivalent.

**PWA**

- A-26 The app installs to an iOS home screen and launches at `/m` in standalone display.
- A-27 A full `npm run build` passes with the mobile tree present.

**Regression**

- A-28 `apps/web/app/dashboard/**` is unchanged by this work — `git diff --stat` against the merge base shows no desktop route files.
