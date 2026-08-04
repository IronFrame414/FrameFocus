# M6M — Mobile PWA Spec

> **Status:** DRAFT for build, S98.
>
> **Sources:** the _FrameFocus — Mobile App Shell_ handoff (6b nav menu, 6f projects list, 6g project
> sections, 6e offline) and the _FrameFocus — Mobile Photos_ handoff (6j gallery, 6k viewer, 6l markup),
> plus Josh's rulings in this session.
>
> **Gap pass [S98]:** GAP-1b, GAP-3, GAP-4 and GAP-7 are **closed by verification** — every claim now
> carries a file and line. GAP-6 has a stated mechanism that is **partially blocked** by the test
> tooling. GAP-2 and GAP-5 could not be closed by verification and are decisions.
> **Eight open questions are collected in §11 — this spec is not buildable end-to-end until they are
> ruled.** Three of them (4, 5, 6) exist because a figure in the mockups has no source in the schema.
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
Exactly zero or one card carries it. **Zero is a normal state, not a bug:** the current project is the
`project_id` of the caller's open segment, and `travel`, `shop` and `break` segments are constrained to
carry no project at all (§8a). A clocked-in user on a break sees no highlighted card. The build must not
fall back to "the most recent project" to fill the gap.

Search filters live. Tap a card → M-3.

### 4.3 M-3 · Project — sections

Navy header: back chevron, project name 21px/800, mono `PRJ-### · {client}`, status pill, and a
**3-stat strip** divided by 1px rules — **Progress / Days left / Punch** (mono 19px; **Punch amber when
non-zero**, muted at zero). Per D-16 the Punch stat reads `{mine} mine · {total} open` — items assigned to
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
   `/m`. **→ §11 Decision 7.**

> **Do not** dedupe on a natural key (member + project + minute). Two legitimate clock events can share a
> minute; a uuid cannot collide.

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
- **GAP-1b — CLOSED [S98]. `assignee_id` holds a `company_members.id`.** The column is FK-constrained:
  `20260704214000_module5_5c_punch_lists.sql:116` —
  `ADD CONSTRAINT punch_list_items_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.company_members(id)`.
  The `-- broad; NOT membership-gated` comment at `:85` describes the **RLS visibility rule**, not the
  referent — `punch_list_items_select_visible` (`:186-194`) reads
  `can_view_project(project_id) OR assignee_id = public.get_my_member_id()`, i.e. an assignee sees their
  own item even without a `project_assignments` row. **The exact comparison for D-16's "mine" is stated
  in §4.3.** No migration, no ambiguity.
- **GAP-2 — OPEN, decision required. Unseen-photo tracking does not exist.** D-14 requires per-user
  "last viewed" state for the amber dot. Verified absent: no `last_viewed` / `viewed_at` / `seen_at`
  column on `files` (`20260101000000_baseline_schema.sql:1367-1390` — the full column list), and no
  per-user view-state table anywhere in `supabase/migrations/`. The only `viewed_at` in the schema is
  `estimates.viewed_at` (`:1338`), which tracks a *client* opening a proposal and is unrelated.
  `files.is_favorite` (`:1387`) is the near-miss precedent — a per-row flag with **no user column**, so
  it is company-wide, not per-user, and cannot be copied. **→ §11 Decision 1.**
- **GAP-3 — RESOLVED INTO §8a [S98].** Every binding on M-2 and M-3 is now either bound to a named
  file and line or recorded as MISSING. See the table in §8a. Three of the six are MISSING and are
  carried to §11 as decisions.
- **GAP-4 — CLOSED [S98]. A client-supplied `id` passes all four INSERT policies.** None of the four
  references `id` in its `WITH CHECK`; each gates on company, role, and membership only. Quoted in
  §5.3. **One consequence the queue model did not account for is recorded in §5.5 — read it before
  building the queue.**
- **GAP-5 — OPEN, decision required. Conflict rule undefined.** A daily log edited on desktop while an
  offline copy sits queued. **→ §11 Decision 2.**
- **GAP-6 — MECHANISM STATED, PARTIALLY BLOCKED [S98].** The live harness is Node-only and cannot
  simulate a browser offline state. Two of the six offline criteria are testable in it today; four are
  not, and need tooling that does not exist in this repo. Full statement in §10a. **→ §11 Decision 3.**
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

Every figure on M-2 and M-3, bound to a named file and line or recorded MISSING. **A binding marked
MISSING is not to be invented at build time** — it is a decision in §11.

| Figure (screen)                     | Status      | Source                                                                                                                                                                                                                                                     |
| ----------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{n} active` (M-2 app bar)          | **BOUND**   | `projects.status = 'active'` with `is_deleted = false`. Reference derivation: `apps/web/lib/services/dashboard.ts:49-53`, surfaced as `activeProjectCount` at `:91`. On mobile it is the count of the rows M-2 already lists — no second query.            |
| `{m} estimating` (M-2 app bar)      | **MISSING** | **There is no `estimating` project status.** `projects_status_check` (`20260704211000_module5_5a_projects.sql:120`) permits exactly `active, on_hold, complete, archived, cancelled`, and `ProjectStatus` (`projects.ts:7`) mirrors it. **→ §11 Decision 4.** |
| `62%` progress (M-2 card, M-3 stat) | **MISSING** | No project-level percentage exists. The nearest ingredient is **phase**-level: `PhaseRollup.percent` (`tasks-shared.ts:48, 83-88`) = the mean of `tasks.percent_complete` within one phase. Rolling phases up to a project figure is a new derivation. **→ §11 Decision 5.** |
| `38 days left` (M-2 card, M-3 stat) | **BOUND**   | `projects.target_end_date` (`20260704211000_module5_5a_projects.sql:105`). Existing derivation: `apps/web/app/dashboard/projects/[id]/page.tsx:104-111`, rendered as the "Days to Target" KPI at `:140-145`. **Signed** — it goes negative past target — and `null` when the date is unset, which the desktop renders as `—` with a "Needs dates" caption. Mobile must carry both states; `38 days left` is only the happy path. |
| `{total} open` punch (M-3, M-2)     | **BOUND**   | Exact-count query on `punch_list_items`, `is_deleted = false`, `status IN ('open','in_progress')`, `project_id = :id`. Reference: `apps/web/app/dashboard/projects/[id]/page.tsx:71-76`. The company-wide twin is `dashboard.ts:78-85`. D-16's definition of "open" matches both precedents exactly. |
| `{mine}` punch (M-3, M-2)           | **BOUND**   | The same query plus `assignee_id = get_my_member_id()` — see §4.3 for the exact expression. `get_my_member_id()` is defined at `20260704210000_company_members_foundation.sql:104-114`.                                                                     |
| "Up next" milestone (M-3)           | **MISSING** | **There is no milestone entity in this codebase.** `grep -rn "milestone"` over `supabase/`, `apps/web/lib`, and `packages/` returns nothing. Two existing structures could stand in — phases (`rollupPhases`, with the current-phase index derived at `projects/[id]/page.tsx:150-154`) or dated calendar events (`getCalendarEvents`, `schedule.ts:106`) — and they are not the same thing. **→ §11 Decision 6.** |
| "currently clocked into" (M-2, D-12)| **BOUND**   | `getOpenSession()` (`time-tracking.ts:53`) → the open segment → its `project_id`. The open-segment expression already exists twice: `components/time/clock-modal.tsx:149` (`s.segment_end === null && !s.is_deleted` — use this one, it carries the soft-delete guard) and `dashboard/timeclock/timeclock-client.tsx:121`. **Caveat, and it is not an edge case:** `time_segments_project_gate_check` (`20260710130000_module6_6a_time_tracking.sql:225-228`) *forces* `project_id IS NULL` on `travel`, `shop` and `break` segments. A clocked-in user on a break has an open session and **no** current project. See §4.2. |
| Photo count / gallery (M-3, M-8)    | **BOUND**   | `getFiles({ projectId, category: 'photos' })` (`files.ts:29-48`). There is no count-only function; the count is the length of the list. The **unseen** half of D-14 is GAP-2, unbound.                                                                     |

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

> **[S98] This section was re-read against the prose of §3–§7, sentence by sentence, rather than against
> the other criteria.** S97 shipped three gaps because criteria were written from summaries. Additions
> carry sub-letter IDs so existing numbers stay stable. Criteria that **cannot be tested with the tooling
> in this repo** are marked `[UNTESTABLE — §10a]` rather than quietly left in; a criterion nobody can run
> is not a criterion. Two criteria contradicted the sentence they were meant to test — see A-23 and A-24.

**Shell**

- A-1 The tab bar renders on every `/m/**` route except M-9 and M-10, and does not scroll out of view.
- A-1b On M-9 and M-10 the tab bar is **replaced by that screen's own action row**, not simply absent — the 4-up row on M-9, the Undo/Redo/Done row on M-10. _(§3.2 promised a replacement; A-1 only tested the absence.)_
- A-1c The active tab reflects the current screen on every `/m/**` route — arriving at `/m/p/{id}` by any path leaves Projects active. _(§3.2, untested.)_
- A-2 With the hamburger sheet open, the tab bar is still visible **and tappable** — tapping Timeclock through the open sheet navigates. `[UNTESTABLE — §10a]`
- A-3 The hamburger sheet contains **no** tile for Projects, Timeclock, Logs, or Field.
- A-3b The hamburger sheet contains **exactly** the seven tiles named in §3.3 — Dashboard, Schedule, Expenses, Subs & Vendors, Team, Contacts, Settings — plus the full-width Sign out row. _(A-3 tested only the negative. §3.3's positive list had no criterion at all — this is the same class of gap S97 shipped.)_
- A-3c The tile matching the current location carries the blue border and blue label; no other tile does. _(§3.3, untested.)_
- A-3d Tapping the scrim closes the sheet, and tapping the hamburger closes it. _(§3.3, untested.)_
- A-4 On a project screen the hamburger is absent and a back chevron is present.
- A-5 Every interactive element on every `/m/**` screen measures ≥44px in its smallest dimension, except the markup colour swatches (34px, 8px apart). `[UNTESTABLE — §10a]`

**Landing (D-12)**

- A-6 A successful sign-in lands on `/m/timeclock`, not `/m/projects` and not the dashboard.
- A-7 Clocking in with a project selected navigates to that project's hub; clocking in with no project navigates to the dashboard.

**Projects list**

- A-8 The card for the project the signed-in user is currently clocked into carries the blue border **and** the "On site" pill; no other card does.
- A-8b With the signed-in user clocked in on a `break` / `travel` / `shop` segment, **no** card carries the border or pill, and no card is highlighted by falling back to a recent project. _(§4.2. A-8 alone passes vacuously in this state, which is the state the DB constraint guarantees exists.)_
- A-9 Filter chips are single-select — selecting "Mine" deselects "All".
- A-9b The chip row renders exactly All / Active / Mine / On hold, and each chip changes the rows listed. _(§4.2, untested.)_
- A-9c Typing in the search field filters the list without a submit action. _(§4.2 "Search filters live", untested.)_
- A-10 Every number on the screen renders in IBM Plex Mono; no number renders in Barlow. `[UNTESTABLE — §10a]`
- A-10b The status pill always renders its text label; no status is conveyed by fill colour alone. _(§4.2. This is the same accessibility class as A-24, which did have a criterion — the pill did not.)_
- A-10c The card header count renders both halves of `{n} active · {m} estimating`, each bound per §8a. **Blocked: `{m} estimating` is MISSING — §11 Decision 4. This criterion cannot be finalised until that is ruled.**

**Project sections**

- A-11 The Punch stat renders amber when the count is non-zero and muted when it is zero.
- A-11b The Punch stat and the Punch List tile both read `{mine} mine · {total} open`, and `{mine}` differs between two members with different assignments on the same project.
- A-11c An item moved to `complete` drops out of both figures; an item at `in_progress` stays in both.
- A-11d The "Days left" stat renders the signed value from `projects.target_end_date`, renders a negative number past target rather than clamping at zero, and renders the empty state when the date is null. _(§4.3 + §8a. The spec's `38 days left` is the happy path only; the desktop precedent already handles all three states.)_
- A-11e The "Progress" stat is bound per §8a. **Blocked: MISSING — §11 Decision 5.**
- A-11f The "Up next" card names the record it is bound to and links to it. **Blocked: MISSING — §11 Decision 6.**
- A-12 The section grid renders exactly nine tiles and **none** is Budget, Invoices, Payments, or Contracts.
- A-12b Change Orders and Punch List badges render amber, Deliveries red, Photos and Team plain mono. _(§4.3, untested.)_
- A-13 The Photos tile shows the project's total photo count, and an amber dot appears only when unseen photos exist for the signed-in user. **The dot half is blocked: no per-user view state exists — §11 Decision 1.**

**Field (M-7) — §4.7 had no criteria at all**

- A-13b M-7 renders a 2-column grid of exactly four tiles — Daily logs, Deliveries, Safety, Photos — each with its attention badge.
- A-13c M-7's project context row names the project the tiles apply to, and tapping it switches project; the tiles then reflect the new project.

**Logs (M-6) — §4.6 was untested apart from the queue**

- A-13d A log still waiting to sync renders the `Queued` badge **in place of** the photo count, not alongside it. _(§4.6.)_
- A-13e M-6's chips are All / Mine / This project, single-select, and "This project" appears only when a project is in context.

**Offline**

- A-14 With the network disabled, the amber offline strip renders on the projects list, the project hub, and the timeclock screen — not only on `/m/offline`. `[UNTESTABLE — §10a]`
- A-14b Tapping the status strip navigates to M-4. _(§4.4, untested.)_ `[UNTESTABLE — §10a]`
- A-14c A read-only surface with no local data renders the strip **and** its own empty state — it does not spin indefinitely, and it never renders stale data without the strip. _(§5.4, untested.)_ `[UNTESTABLE — §10a]`
- A-15 A clock-in performed offline at time T and synced at T+3h stores `T` in `time_clock_sessions.clock_in`.
- A-15b The same `captured_at`-is-the-business-timestamp rule holds for a queued daily log and a queued photo, not only for a clock event. _(§5.2.1 is written for all three kinds; A-15 tested one.)_
- A-16 Replaying the same queued mutation three times produces exactly one row.
- A-16b A shift captured entirely offline (clock in, ≥1 segment, clock out) syncs with its segments attached — replaying in the order §5.5 requires, the segment inserts are not rejected by `owns_open_session`. _(§5.5.1. Without this, A-16 passes and the feature still loses every segment.)_
- A-17 A queued item whose sync fails permanently remains in "Waiting to sync" with its error visible; it is not dropped. `[UNTESTABLE — §10a]`
- A-17b "Try again" forces an immediate sync attempt rather than waiting for the backoff interval. _(§5.2.2, untested.)_ `[UNTESTABLE — §10a]`
- A-18 The queued-count pill equals the number of records/files that will actually upload. `[UNTESTABLE — §10a]`
- A-19 Attempting a delivery check-in while offline blocks submission with an explicit message and creates **no** queue entry. `[UNTESTABLE — §10a]`

**Capture**

- A-20 Tapping the tab-bar camera opens the camera directly, not a picker.
- A-20b **Every** field image input — daily log, safety incident, delivery damage — opens the camera by default with the gallery as the secondary control, not just the tab-bar action. _(§6 says "the same camera-first rule applies to every field image input". A-20 tested one of four call sites — too narrow to fail if the other three regress.)_
- A-20c A photo captured on any mobile path lands in the `project-files` bucket with `files.category = 'photos'`. _(§6, untested, and cheap to assert in the live harness.)_
- A-20d A queued offline photo uploads through `uploadFile`, so a HEIC capture is stored as JPEG with `mime_type = 'image/jpeg'` after sync. _(§5.5.3 / GAP-7.)_
- A-21 With no project in context, the project prompt appears **after** the shot, not before.
- A-21b With a project in context, the photo files to that project with no prompt at all. _(§6, untested.)_

**Photos**

- A-22 A photo's source badge is derived from its link column; a photo with no link column set renders **no** badge.
- A-22b A file referenced by `punch_list_items.reference_photo_file_id` or `.completion_photo_file_id` carries the `Punch` badge and appears under the Punch filter chip.
- A-22c Rendering the gallery writes nothing — `punch_list_items` rows are byte-identical before and after (D-15 is read-only).
- A-22d The gallery groups by day, newest day first, labels the current day "Today", and loads further days on scroll. _(§4.8, untested.)_
- A-22e Long-press enters multi-select; bulk share and bulk delete act on the selected set. _(§4.8, untested.)_
- A-23 Saving markup leaves the original file row intact and writes the annotation layer to `files.markup_data`; the viewer can toggle back to the original. **⚠️ CONTRADICTS §4.10 — see §11 Decision 8.** §4.10 says Save "writes an annotated derivative and keeps the original"; A-23 says it writes to `files.markup_data`. A derivative file and a jsonb layer are different storage models, and A-23 as written cannot fail if the derivative is never produced. **Do not build against this criterion until Decision 8 is ruled.**
- A-24 The active markup tool is distinguishable without colour — it carries a **border** and a label change. _(Corrected [S98]: this read "a label weight change". §4.10 specifies `1.5px #f2453d` border plus a red icon **and label** — a colour change, not a weight change. The criterion was testing something the spec does not say, so it could pass on a build that violated §4.10. The border half is the colour-independent signal; the build must not substitute tint alone.)_
- A-24b Undo and Redo operate per-mark, and Redo renders dimmed when the redo stack is empty. _(§4.10, untested.)_
- A-24c Cancel with unsaved marks prompts for confirmation; Cancel with no marks exits directly. _(§4.10, untested.)_
- A-24d Markup opened from a punch item or an incident returns to that record and stays linked to it. _(§4.10, untested.)_
- A-25 Every gesture on M-9 (swipe to page, swipe down to dismiss) has a visible on-screen equivalent.
- A-25b A photo carrying markup is visibly marked as such in the viewer. _(§4.9. A-23 covers the toggle; nothing covered the indicator.)_
- A-25c Tapping **Source** navigates to the originating daily log, delivery, or safety incident. _(§4.9, untested.)_
- A-25d Delete prompts for confirmation and is refused for roles that cannot delete. `files_delete_owner_admin` (`20260101000000_baseline_schema.sql:3608`) restricts DELETE to Owner/Admin — "role-gated" in §4.9 means Owner/Admin, and the UI must not offer an action the DB will reject.

**PWA**

- A-26 The app installs to an iOS home screen and launches at `/m` in standalone display. `[UNTESTABLE — §10a; manual device check, no automation is possible]`
- A-26b The manifest declares `start_url: "/m"`, `display: "standalone"`, `short_name: "FrameFocus"`, and both colours as `#14213d`. _(§7.1 — testable as a plain fetch/parse of the manifest, unlike A-26.)_
- A-26c Icons exist at 192, 512, and 512 maskable, and the manifest references all three. _(§7.2, untested.)_
- A-26d A service worker is registered from the mobile layout and exposes the queue's retry hook. _(§7.3, untested.)_
- A-26e The mobile document head carries `apple-mobile-web-app-capable` and the status-bar-style meta. _(§7.4, untested — and this is the iOS Web Push precondition D-10 depends on, so a regression here silently blocks Gate 4.)_
- A-27 A full `npm run build` passes with the mobile tree present.

**Regression**

- A-28 `apps/web/app/dashboard/**` is unchanged by this work — `git diff --stat` against the merge base shows no desktop route files.
- A-28b No `lib/services/*` file is duplicated for mobile — the mobile tree imports the existing service functions. _(§1 "The service layer is shared… No duplicate data access is written for mobile" was normative and untested. Assertable by grep over the diff.)_

---

## §10a — How the offline criteria actually get tested (closes GAP-6)

**The live harness cannot simulate offline, and no amount of spec language changes that.**
`apps/web/test/live.vitest.config.ts:54` sets `environment: 'node'`, and `apps/web/test/live-session.ts:41`
mints a bare `supabase-js` client on the anon key carrying a real user JWT. That gives real RLS against
the real rebuild-test database — and nothing else. There is **no DOM, no `navigator.onLine`, no service
worker, no IndexedDB, and no Playwright** (`apps/web/package.json` lists `vitest` as the only test
dependency; there is no `jsdom`, `happy-dom`, `fake-indexeddb`, or browser driver anywhere in the repo).

**What the existing harness CAN prove today, with no new tooling** — these are DB-shaped assertions
about the *result* of a sync, and they belong in a new `test/s98ct-offline.live.ts`:

| Criterion | Mechanism in the Node harness |
| --------- | ------------------------------ |
| A-15, A-15b | INSERT with an explicit `clock_in` / log date of `T` while wall-clock is `T+3h`; read the row back and assert the stored value is `T`. No offline needed — the assertion is that the server does not substitute receipt time. |
| A-16 | Call the upsert three times with the same client-generated uuid; assert `count = 1`. |
| A-16b | Insert session (`clock_out` NULL) → segments → UPDATE `clock_out`, as a session-scoped client. Then repeat with `clock_out` set on the initial insert and assert the segment insert is **rejected** — that failing direction is what proves §5.5.1 is a real constraint and not a style note. |
| A-20c, A-20d | Upload through `uploadFile`, assert bucket, `category`, and (for a HEIC fixture) `mime_type = 'image/jpeg'`. |
| A-22c | Snapshot `punch_list_items` rows, run the gallery's read, re-read, compare. Already the pattern used by `s97ct-budget-floor.live.ts`. |
| A-28, A-28b | Shell/grep over the diff. Not a vitest concern at all. |

**What it CANNOT prove, and what each would require.** A-2, A-5, A-10, A-14, A-14b, A-14c, A-17, A-17b,
A-18, A-19, A-26 are all browser-state or rendered-geometry assertions. Two candidate mechanisms, and
they are not equivalent — this is **§11 Decision 3**:

1. **Unit-test the queue module in isolation.** Extract the queue as a pure module with an injected
   storage adapter and an injected "online" predicate, then test it under the *committed* suite
   (`apps/web/vitest.config.ts`) with fakes. Cheap, runs in CI, no new heavy dependency. Proves the
   queue's logic — ordering, backoff, retry, never-discard, count correctness. Proves **nothing** about
   whether the strip renders, whether a tap lands, or whether anything measures 44px.
2. **Add Playwright.** `context.setOffline(true)` is the only mechanism that tests what these criteria
   literally say. It also unlocks A-5 (bounding boxes), A-10 (computed styles), A-2 (real taps) and
   A-26b–e. New dependency, new CI surface, materially slower.

A-26 (iOS home-screen install) is **manual on a real device under any option** — Playwright cannot
install a PWA to an iPhone home screen. It should be marked as a manual release check, not automated.

**House rule note.** The repo requires a failing-then-passing assertion per fix. Under option 1 that rule
is satisfiable for queue logic and **unsatisfiable for every rendering criterion above** — which is why
this is a decision and not a build detail.

---

## §11 — Decisions for Josh

Eight open questions. Each blocks a specific criterion in §10. **None is answered here.** D-1…D-16 are
closed and are not reopened by any of these.

### Decision 1 — The amber "unseen photos" dot (D-14). What backs it?

No per-user view state exists anywhere in the schema (GAP-2). D-14 is ruled; the dot's *storage* is not.

| Option | Cost | Consequence |
| ------ | ---- | ----------- |
| **A. New `file_views` table** — `(company_id, file_id, member_id, viewed_at)`, append-or-upsert per member per file. | One migration + RLS + a write on every photo open. Row count ≈ photos × members who look. | Exact. Answers "unseen by me" per photo, and the same table later answers "who has seen this". Heaviest write path — one round trip per photo viewed, on the phone. |
| **B. New `project_photo_marks` table** — `(company_id, project_id, member_id, last_viewed_at)`, one row per member per project. Unseen = any photo with `created_at > last_viewed_at`. | One migration + RLS, one write per gallery visit. Bounded row count. | Approximate. Cannot mark a single photo unseen, and opening the gallery clears the dot for photos never actually scrolled to. Cheap and probably indistinguishable in the field. |
| **C. Client-only** — store `last_viewed_at` per project in the PWA's local storage. | No migration. | Per-device, not per-user. Dot resets on a new phone and never agrees across two devices. Nothing to test server-side, so A-13's dot half stays unverifiable. |
| **D. Defer the dot** — ship the total count from D-14, no dot, until a real need appears. | None. | D-14 ships half-built. §4.3 and A-13 both need an explicit amendment saying so, or the build looks like it missed a requirement. |

**Blocks:** A-13 (dot half), §4.3 Photos badge.

### Decision 2 — A daily log edited on desktop while an offline copy sits queued. Which wins?

The queue replays an upsert on the primary key (§5.3), so the queued copy **overwrites the desktop edit
silently** unless a rule says otherwise. `daily_logs_update_authorized`
(`20260711150000_module6_6b_daily_logs.sql:298-306`) permits the author to update their own log, so both
writes are legitimate and neither is blocked by RLS.

| Option | Consequence |
| ------ | ----------- |
| **A. Last-write-wins, queue loses.** Before replaying, compare the server row's `updated_at` to the queued item's `captured_at`; if the server is newer, drop the queued copy into `Needs attention` and do not write. | Never destroys a desktop edit. Costs the field user their offline work, and they find out late. |
| **B. Last-write-wins, queue wins.** Replay unconditionally — current §5.3 behaviour. | Field capture is authoritative, which matches "v1 offline is about not losing writes" (§9). Silently destroys the desktop edit, with no record that it existed. |
| **C. Conflict surfaces to the user.** Detect as in A, but hold both and make the user choose on next open. | Correct, and the only option that loses nothing. Needs conflict UI on M-6 that this spec does not contain — new screens, new scope. |
| **D. Make it impossible.** Block desktop edits on a log that has an unsynced mobile copy. | Requires the server to know a queued copy exists, which by definition it does not while offline. Not available. |

**Blocks:** §5.2/§5.3 replay semantics; no criterion exists yet — one must be added once ruled.

### Decision 3 — How do the offline criteria get tested?

Stated in full in §10a. The short form: the Node harness can prove A-15, A-15b, A-16, A-16b, A-20c,
A-20d, A-22c, A-28, A-28b today. It can never prove A-2, A-5, A-10, A-14, A-14b, A-14c, A-17, A-17b,
A-18, A-19, A-26.

| Option | Cost | Consequence |
| ------ | ---- | ----------- |
| **A. Queue-as-pure-module unit tests** under the committed suite, with injected storage and an injected online predicate. | Low. No new dependency, runs in CI. | Proves queue logic. Ten rendering/browser-state criteria stay unverified and should be re-marked as manual. |
| **B. Add Playwright.** | New dependency, new CI surface, materially slower. | The only path that tests what the criteria literally say, and it also unlocks A-5, A-10, A-26b–e. |
| **C. Both** — Playwright for the offline strip and geometry, unit tests for queue logic. | Highest. | Complete coverage. |
| **D. Accept manual verification** for the ten, documented as a release checklist. | None. | Honest, and consistent with how A-26 must work regardless. Nothing catches a regression. |

**Blocks:** ten criteria in §10, all marked `[UNTESTABLE — §10a]`.

### Decision 4 — `{m} estimating` in the M-2 header. What is it counting?

**There is no `estimating` project status.** `projects_status_check`
(`20260704211000_module5_5a_projects.sql:120`) permits exactly `active, on_hold, complete, archived,
cancelled`. The word came from the mockup, not from the schema.

| Option | Consequence |
| ------ | ----------- |
| **A. Count estimates, not projects** — open `estimates` rows (`draft`/`review`/`sent`/`viewed`). | Reads naturally in a contractor's head. But M-2 is a *projects* list; a count of a different entity in its header is a category error, and estimating is a Module 4 surface with its own visibility rules. |
| **B. Count a different project status** — e.g. `{n} active · {m} on hold`. | Truthful to the schema, needs no new anything, and matches what the list actually contains. Not what the mockup said. |
| **C. Drop the second half** — header reads `{n} active`. | Smallest change. Loses the mockup's two-part rhythm. |
| **D. Add an `estimating` project status.** | Migration, CHECK change, and a lifecycle question far bigger than mobile — projects currently begin at `active` on conversion from an estimate. Out of scope for M6M by a wide margin. |

**Blocks:** A-10c, §4.2 app bar.

### Decision 5 — The `62%` progress figure. How is it derived?

No project-level percentage exists. The only percentage in the codebase is phase-level:
`PhaseRollup.percent` (`tasks-shared.ts:48, 83-88`), the unweighted mean of `tasks.percent_complete`
within one phase. The desktop deliberately shows a **stepper**, not a number
(`projects/[id]/page.tsx:148-154`).

| Option | Consequence |
| ------ | ----------- |
| **A. Unweighted mean of `tasks.percent_complete` across all the project's tasks.** | Simple, one derivation, matches the existing phase formula one level up. A 1-hour task counts as much as a 3-week one. |
| **B. Mean of the phase percents.** | Consistent with the phase rollup. A phase with one task counts as much as a phase with twenty. |
| **C. Schedule-elapsed** — `(today − start_date) / (target_end_date − start_date)`. | Needs no task data, which matters because tasks may be sparse. Measures *time spent*, not *work done*, and will read as a lie on a late project. |
| **D. Drop the percentage; port the desktop's stepper to M-3 instead.** | No new derivation, no new number to defend, and the two surfaces agree. Costs the progress bar on the M-2 card (§4.2), which would need to become something else. |

**Blocks:** A-11e, the M-2 card progress bar and footer text, the M-3 Progress stat.

### Decision 6 — The "Up next" card. What record is it showing?

**There is no milestone entity.** `grep -rn "milestone"` over `supabase/`, `apps/web/lib` and `packages/`
returns nothing at all.

| Option | Consequence |
| ------ | ----------- |
| **A. The current/next incomplete phase** from `rollupPhases`, using the same current-index rule as the desktop stepper (`projects/[id]/page.tsx:150-154`). | Reuses an existing derivation exactly; agrees with the desktop. A phase is coarse — "Framing" for three weeks is a static card. |
| **B. The next dated calendar event** from `getCalendarEvents` (`schedule.ts:106`) — the soonest task, schedule entry, or inspection. | Genuinely "up next", changes daily, and inspections are exactly what a foreman wants surfaced. Mixes three sources of differing importance; the soonest event may be trivial. |
| **C. The next incomplete task assigned to the signed-in user.** | Most actionable on a phone. Not a project-level fact, so the card means something different per viewer. |
| **D. Add a milestone flag to `tasks`** and let the office mark them. | Truest to the mockup. Migration + UI in Module 5's task surfaces + a data-entry habit that does not exist yet. |

**Blocks:** A-11f, §4.3's "Up next" card. The amber scheduling note under the title has no source under any option and needs one.

### Decision 7 — A subcontractor on `/m` cannot upload a photo. Which gives?

D-11 rules that **all roles** get mobile, with no gate on `/m`. But
`files_insert_non_client` (`20260728000000_security_rls_96_99.sql:81`) permits INSERT only for
`owner, admin, project_manager, foreman, crew_member` — **`subcontractor` is not in the list.**

A subcontractor on `/m` today can clock in (`time_clock_sessions_insert_authorized` allows
`member_id = get_my_member_id()`), can write a daily log (`can_view_project`,
`20260704211000_module5_5a_projects.sql:257-260`, admits any assigned member regardless of role) — and
**every photo capture fails at the database.** §6 puts the camera in the tab bar for everyone, so this is
the most prominent control on the screen failing for one role.

| Option | Consequence |
| ------ | ----------- |
| **A. Add `subcontractor` to the INSERT policy.** | One migration. Subs upload photos like anyone else. It is a permission widening on the files table and should be ruled deliberately, not slipped in as mobile plumbing. |
| **B. Hide the camera for subcontractors.** | No migration. Contradicts nothing in D-11 (which is about *reaching* `/m`, not about every control working) but means the tab bar's centre action is absent for one role — and §3.2 calls the 5-slot bar "locked on every mobile screen". |
| **C. Leave it and let it fail.** | Not viable. The DB rejects the insert after the user has taken the photo. |

**Blocks:** §6, D-11's practical scope, A-20/A-20b for one role.

### Decision 8 — Markup storage: an annotated derivative, or `files.markup_data`?

§4.10 says Save "writes an annotated derivative and keeps the original". A-23 says Save "writes the
annotation layer to `files.markup_data`". The `markup_data jsonb` column exists
(`20260101000000_baseline_schema.sql:1386`) and the desktop markup editor already uses it
(`apps/web/app/dashboard/projects/[id]/files/[fileId]/markup/markup-editor.tsx`).

| Option | Consequence |
| ------ | ----------- |
| **A. `markup_data` only** — marks stored as jsonb, rendered as an overlay at view time. | Matches the desktop and needs no new storage. Nothing to share or email — a recipient outside FrameFocus receives the clean original with the marks invisible. |
| **B. jsonb + a flattened derivative on save** — keep `markup_data` as the editable source, also write a rendered JPEG. | Shareable and printable, marks still editable. Two artefacts to keep in sync, and `files.supersedes_id` / `version` (`:1384-1385`) would need a stated role. |
| **C. Derivative only.** | Simple output. Marks become uneditable after save, contradicting §4.10's "non-destructive layer" and the Undo/Redo model. |

**Blocks:** A-23, §4.10's Save behaviour. **Do not build markup until this is ruled** — A-23 as currently
written passes under all three options, which is precisely why it failed to catch the ambiguity.
