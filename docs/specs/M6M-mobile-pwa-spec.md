# M6M — Mobile PWA Spec

> **Status:** **BUILD-READY [S99]. GAP-8 IS CLOSED.**
>
> _Superseded, quoted rather than rewritten:_ _"DRAFT — **not build-ready end to end.** The shell, photos,
> the twelve section screens and the offline contract are complete; **four prerequisites below are not**,
> and GAP-8 is the outstanding one. S98."_
>
> The _Mobile Field Capture_ handoff — the thing GAP-8 was blocked on for two sessions — arrived and is
> reconciled in **§4.12**. Its five screens now have routes (§1), M6M-compliant resolutions, and criteria.
> Prerequisites 1–3 are **done**; a fifth prerequisite, the constraint migration D-30, is **specced here
> and not yet written**.
>
> **Sources:** the _FrameFocus — Mobile App Shell_ handoff (6b nav menu, 6f projects list, 6g project
> sections, 6e offline), the _FrameFocus — Mobile Photos_ handoff (6j gallery, 6k viewer, 6l markup) and
> — **new [S99]** — the _FrameFocus — Mobile Field Capture_ handoff (7a clock in/out, 7b mid-shift
> segment switcher, 7c daily log entry, 7d delivery check-in, 7e incident report). All three are committed
> under `docs/handoffs/`. Plus Josh's rulings in S98 and S99.
>
> **The handoff bends to this spec, not the reverse [S99, Josh — ruling 1].** Where the handoff contradicts
> a locked ruling, the ruling wins and §4.12 records how the screen changes. **One exception, ruled
> separately:** the 7b mid-shift switcher is **ADOPTED**, because it was a gap in this spec rather than a
> contradiction — §4.5a already owed it and pre-committed its constraints (D-32).
>
> ---
>
> ## ⚑ PREREQUISITES BEFORE BUILD — read these before §1
>
> **Four things must be in place before, or alongside, the first screen.** They are specified deep in this
> document and a build that starts at §1 would meet them far too late. In order:
>
> **[S99] Status of all five.** 1–3 are done; 4 is closed; 5 is new and outstanding.
>
> | # | Prerequisite | State [S99] |
> | - | ------------ | ----------- |
> | 1 | Four-policy subcontractor migration (§7a) | **APPLIED** — `20260822000000_m6m_subcontractor_photo_access.sql`, rebuild-test. A-21d fails-then-passes verified under impersonation. **Production NOT yet applied.** |
> | 2 | `sync_conflicts` table (§5.7, §7b) | **APPLIED** — `20260823000000_m6m_sync_conflicts.sql`, rebuild-test. A-19g/A-19i–A-19l verified. **Production NOT yet applied.** |
> | 3 | Playwright (§10a) | **INSTALLED** — `apps/web/playwright.config.ts`, `apps/web/e2e/`, CI job added. Browser binaries do not survive a Codespace rebuild; reinstall with `npx playwright install chromium` **and** `sudo npx playwright install-deps chromium`. |
> | 4 | **GAP-8 — the _Mobile Field Capture_ handoff** | **CLOSED [S99]** — handoff received, reconciled in **§4.12**, routes in §1. |
> | 5 | **NEW — the constraint migration (D-30)** | **SPECCED, NOT WRITTEN.** §7c. Four UI-only rules become DB constraints. Must land before the field-capture screens are trusted to enforce them. |
>
> _The original table is kept below unchanged, because its "why it blocks" reasoning is still the record of
> why each mattered._
>
> | # | Prerequisite | Where | Why it blocks |
> | - | ------------ | ----- | ------------- |
> | 1 | **The four-policy subcontractor migration** — `files_insert_non_client`, `files_update_non_client`, `project_files_insert_non_client`, `project_files_update_non_client` | **§7a** | **Build step 1, before any route or component.** A photo is two writes — the row and the bytes — under two independent policy sets, and `subcontractor` is missing from both. Until this lands, the camera, which §3.2 puts on every screen, is broken for one role, and every mobile screen demos with its most prominent control failing. |
> | 2 | **The `sync_conflicts` table** | **§5.7**, ordering in **§7b** | Must land **before any offline write path ships**. Without it the conflict path (D-17) has nowhere to put a held copy, and the only alternatives are the silent overwrite and the silent loss the ruling forbids. Not needed before the shell. |
> | 3 | **Playwright — a NEW dependency this repo does not carry** | **§10a** | D-18 ruled both harnesses. Roughly half the criteria in §10 are `[Playwright]`; the existing Node harness is `environment: 'node'` with no DOM, service worker or IndexedDB and can never assert them. Adding it brings a new CI surface and browser binaries. |
> | 4 | **GAP-8 — the _Mobile Field Capture_ handoff** | status note below, **§8** | **The largest outstanding item, and it is not a documentation gap.** Two of D-6's three offline-capable actions have no screen to originate from: the daily log has no entry screen at all, and delivery check-in and incident reporting have none either. A mis-clocked segment also has **no in-app correction path**, because the mid-shift switcher lives in this handoff (§4.5a). The offline queue in §5 is specified in full for writes that two of its three producers cannot yet make. |
>
> **1 and 2 are migrations this spec states but does not write.** 3 is a tooling decision already ruled.
> **4 is not resolvable from inside this document** — it needs the handoff, or a decision to spec those
> screens here.
>
> ---
>
> **Gap pass [S98]:** GAP-1b, GAP-3, GAP-4 and GAP-7 closed by **verification** — every claim carries a
> file and line. GAP-2, GAP-5 and GAP-6 closed by **ruling**. **All eight §11 questions are RULED
> (Josh, S98); §11 is now a register, not a queue.** The rulings are D-14 (amended) and D-17…D-21 in §0.
>
> **Two figures were deleted rather than derived** — the progress percentage (D-19) and the `estimating`
> count (D-23) — because neither had a source in the schema. §4.2 and §4.3 carry the respec, not a gap.
>
> **BUILD STEP 1 is migrations, not a screen: FOUR policies** — `files_insert_non_client`,
> `files_update_non_client`, `project_files_insert_non_client`, `project_files_update_non_client`
> (D-20 as extended, §7a). A photo is two writes, the row and the bytes, and `subcontractor` was missing
> from both sets. Until they land, the camera — the most prominent control on every mobile screen — is
> broken for one role. **A second migration**, `sync_conflicts` (§5.7, §7b), must land before any offline
> write path ships.
>
> **✅ [S99] THE FIVE FIELD-CAPTURE SCREENS ARE NOW SPECCED — GAP-8 CLOSED.** The handoff arrived
> (`docs/handoffs/mobile-field-capture/`, commit `e1d9747`) and is reconciled screen by screen in
> **§4.12**. 7b, 7c, 7d and 7e have routes in §1 (D-28); 7a gains the type row D-27 requires. The
> paragraph and table below are the S98 record of the gap, kept because they state precisely what was
> missing and why it blocked — **read them as history, not as current state.**
>
> _Superseded [S99]:_ **"⚠️ THE FIVE FIELD-CAPTURE SCREENS ARE NOT SPECCED BY THIS DOCUMENT.** GAP-8 has been open the whole
> time under a heading that promises gaps are resolved before build, so it is hoisted here. The _Mobile
> Field Capture_ handoff — clock, segment switch, daily log entry, delivery check-in, incident — was never
> provided. Measured against D-6's three offline-capable actions:"
>
> | D-6 action | Screen status |
> | ---------- | ------------- |
> | Photo capture | **Specced** — §6, and `/m/capture` (§1). |
> | Clock in / out | **Specced** — M-5 (§4.5) plus **§4.5a**, which makes the segment type a required choice at clock-in (D-27) and records the complete per-type project rule. _(Updated [S98]: this row previously read "partly specced, and blocked" because no type selection existed. D-27 closed that.)_ **What remains missing is the mid-shift switcher**, so a crew member who clocks in on the wrong type has no in-app correction path. |
> | Daily log | **Not specced at all.** M-6 (§4.6) is a *list*, and its "Log the day" button has **no destination** — no entry screen, and no route for one in §1. |
>
> **So of the three actions D-6 makes offline-capable, two have complete screens and one — the daily log —
> has no screen whatsoever.** Delivery check-in and incident reporting are the other unspecced capture
> screens; check-in is online-only (D-6) but still has no screen. Together with the missing mid-shift
> switcher, that is four of the handoff's five surfaces still owed.
>
> **[S99] THIS SPEC IS NOW BUILD-READY.** _Superseded:_ _"**This spec is NOT build-ready end to end.**
> §4.11's twelve section screens, the shell, photos and the offline contract are complete and buildable;
> the field-capture surfaces above are not, and neither are the two migrations in the prerequisites table
> until someone writes them."_ Both migrations are written and applied to rebuild-test; the field-capture
> surfaces are specced in §4.12. **The one outstanding item is the D-30 constraint migration (§7c)** —
> specced, not written — and it gates enforcement, not the screens.
>
> **Every question raised this session is ruled** — including all twelve section tiles (§4.11: nine new
> routes, three shared) and the D-25 segment-type collision, which **D-27 dissolved** by making the type a
> required choice at clock-in rather than a default (§4.5a).
>
> **[S99] GAP-8 is closed and the display question was RE-RULED.** _Superseded:_ _"The one thing still
> outstanding is GAP-8, stated above: the five field-capture screens are not specced by this document,
> which is why the daily log has no entry screen and the mid-shift segment switcher has no home."_ Both
> now have routes and specs (§1, §4.12).
>
> **§4.7a IS REVERSED [S99, Josh — D-31]. Option A is overturned: the DERIVATIVE is the display source.**
> The _Mobile Photos_ handoff specifies it directly — _"save writes an annotated derivative and keeps the
> original; the viewer should indicate a photo has markup and allow toggling back to the original."_
> Option A's whole reason for existing was the desktop-annotated population carrying `markup_data` with no
> derivative; **that population does not exist** — no existing photos need preserving — so the premise is
> gone. See §4.7a and D-31 for the full reversal and the criteria it rewrites.
>
> _Superseded [S99], quoted:_ _"The display question was closed by
> ruling the derivative **off** the display path: the UI draws marks live from `files.markup_data` over
> the original (**Option A, §4.7a**), so desktop-authored markup is correct with no desktop change and no
> backfill."_ The pin gap that surfaced while specifying it is closed too — **`pin` becomes a shape type and
> `MARKUP_SCHEMA_VERSION` goes to 2** (D-22, **§4.10a**), with the number **stored** so deletes leave gaps
> rather than silently renumbering.
>
> **§4.10a is the only work this session that touches shared code the desktop imports**
> (`packages/shared/types/markup.ts`, `packages/shared/components/MarkupViewer.tsx`). A-28 holds — neither
> is under `apps/web/app/dashboard/**` — but it is called out rather than left implied.
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
| D-9  | Nav scope                     | **NARROWED BY D-37 [S100, Josh] — not reversed.** _Original text, quoted not rewritten:_ _"Contacts, Subs & Vendors, Team **stay** in the hamburger. Finance (Budget, Invoices, Payments, Contracts) is **absent from mobile entirely**."_ The first sentence stands. The second is narrowed: **Expenses is in scope for mobile**; Budget, Invoices, Payments and Contracts remain absent, deferred to v2. Everywhere this spec cites "D-9" to justify cutting a figure, read it as the narrowed rule — see D-37 and §4.13.3. |
| D-10 | Notifications                 | **Out of scope here.** Web Push on iOS requires an installed PWA, so manifest + icons + service worker are prerequisites. GATED.md Gate 4.                                                                                                                                                                                                                            |
| D-11 | Who gets mobile               | **All roles.** No role gate on `/m`.                                                                                                                                                                                                                                                                                                                                  |
| D-12 | Landing                       | **Sign-in lands on `/m/timeclock`.** On a successful clock-in, **the redirect follows the segment type the user chose** [restated S98, D-27]: a type that carries a project (`work`, `material_run`, `warranty`) → that project's hub; a type that cannot (`travel`, `shop`, `break`) → the dashboard. _(Original second clause, quoted: "if no project was selected, redirect to the dashboard" — written before D-27 and describing an accident rather than a rule.)_ |
| D-13 | Timeclock / Logs / Field tabs | **Real mobile screens**, built in this pass (§4.5–§4.7). Not links to desktop pages.                                                                                                                                                                                                                                                                                  |
| D-14 | Photos badge                  | **Total count only. AMENDED [S98, Josh]: the unseen dot is DEFERRED TO V2.** The number is every photo on the project. _Superseded clause, quoted not rewritten: "with an unseen indicator… an amber dot marks that unseen photos exist for this user."_ No view-tracking table is built. The intended v2 shape is recorded in §9 so it can be added without rework. |
| D-15 | Punch photos                  | **No migration.** The link already exists on `punch_list_items` as `reference_photo_file_id` and `completion_photo_file_id`. The gallery derives the `Punch` badge by a **read-only** join: a file is punch-sourced if its `id` appears in either column. **Those two columns keep their existing meanings and are not merged, altered, or written to by this work.** |
| D-16 | Punch counter                 | **Mine first, then the project total** — e.g. `2 mine · 4 open`. Applies to the M-3 stat strip and the Punch List tile. **"Open" means `status IN ('open','in_progress')`** — not `complete`, not `verified`.                                                                                                                                                         |
| D-17 | Offline sync conflict         | **The server version stands.** [S98, Josh] When a queued mutation targets a row the server has changed since capture, the queued copy **does not overwrite** it and **is not discarded** — it leaves the sync queue and enters a reconciliation review for Owner/Admin. The field user is told. **EXTENDED [S98]: the held copy goes to a server-side table, `sync_conflicts`, not to IndexedDB** — it must survive a cleared PWA or a new handset. Contract in §5.6; table, RLS and lifecycle in **§5.7**; migration ordering in §7b. The review *surface* remains out of scope. |
| D-18 | Offline test tooling          | **Both.** [S98, Josh] Queue logic is unit-tested in the existing Node harness; screen-level and browser-state criteria are tested with **Playwright, a new dependency this repo does not yet carry**. Nothing in §10 is left untestable. Assignment table in §10a. |
| D-19 | Progress percentage           | **CUT FROM V1.** [S98, Josh] No progress % anywhere on mobile. The M-3 stat strip is **two** stats, not three (§4.3); the M-2 project card has **no** progress bar (§4.2). No project-level progress derivation is invented. |
| D-20 | Subcontractor photo access    | **Subs upload AND annotate.** [S98, Josh] D-11 stands unchanged. **EXTENDED [S98]: `files_update_non_client` is widened too**, so a sub can annotate photos including ones they just took — and, found while applying that, **the two `storage.objects` policies carry the same omission and must be widened as well** or the bytes are refused regardless. **Four policies, role array only.** Required migration and the **FIRST build step** — see §7a. |
| D-21 | Markup storage & display      | **Both stored; the OVERLAY displays.** [S98, Josh] `files.markup_data` holds the editable annotation layer, **is the source of truth, and is drawn live over the original image on every surface** — gallery thumbnail, viewer stage, filmstrip (**Option A**, ruled once the derivative-as-display reading proved unbuildable for desktop-authored markup). Save still writes a flattened derivative, but it is a **sharing artifact only, never displayed**. The original is never modified and is always the image on screen. §4.9's toggle hides the drawn layer; it does not swap files. Storage contract in §4.10; display rule, fit, legibility and load order in **§4.7a**. |
| D-22 | Pin shape / schema v2         | **Add a `pin` shape type; `MARKUP_SCHEMA_VERSION` → 2.** [S98, Josh] Composing a pin from circle + text would make one pin two undo steps, contradicting §4.10's per-mark Undo/Redo; dropping Pin would remove what punch and incident work needs most. Additive, and `MarkupViewer` has no consumers. **The pin number is STORED, so deletes leave gaps and `next = max + 1`.** Contract, read/forward compatibility and blast radius in **§4.10a** — the first ruling this session to touch shared code desktop imports. |
| D-23 | `{m} estimating` count        | **Dropped.** [S98, Josh] The M-2 header shows the active count only. There is no `estimating` project status — `projects_status_check` permits `active, on_hold, complete, archived, cancelled` — and none is added. §4.2; §8a; A-10c. _(Renumbered [S98]: this ruling was previously cited as "D-4", which is the list-screen pattern.)_ |
| D-25 | ~~Segment type on clock-in~~  | **SUPERSEDED by D-27 [S98, Josh].** _Original text, quoted not deleted:_ _"**Default `work`, switch afterwards.** Clock-in writes `segment_type = 'work'` with no prompt — one tap to start a shift. Changing it is a separate action that closes the open segment and opens a new one, because that is the only shape RLS permits a crew member."_ Withdrawn because `work` requires a project while D-12 and §4.5 contemplate clocking in without one — a collision D-27 dissolves rather than works around. |
| D-26 | CO value on mobile            | **CUT, for every role including Owner and Admin.** [S98, Josh] `change_orders.net_delta` and every derived money figure stay off M-13. Two reasons, both kept: showing it would introduce the **first role-gated figure anywhere on `/m`**, a pattern this spec has deliberately never had (D-11 puts every role on the same screens); and the column is **UI-gated only, with no DB floor behind it** (TECH_DEBT #117), so a mobile leak would not be caught by RLS. §4.11.3; A-33, A-33c. |
| D-27 | Segment type on clock-in      | **The user selects the type as part of clocking in.** [S98, Josh] No default, no skippable prompt, no post-hoc switch on the clock-in path — a required choice from whatever `time_segments_type_check` permits. **The project requirement then follows from the type**, which is what dissolves D-25's collision. §4.5, §4.5a. _(Scope note [S99]: D-27 governs the **type**. It says nothing about whether the project row may arrive pre-selected — see §11's open questions.)_ |
| D-28 | Field-capture screens: route or sheet? | **PAGES.** [S99, Josh] 7b, 7c, 7d and 7e each get a real route under `/m/`. The handoff draws them with ✕ chrome; **that is styling and does not imply a sheet.** Decided once for all four rather than per screen. Routes in §1; screens in §4.12. |
| D-29 | Hazard → incident escalation  | **CONTEXT ONLY.** [S99, Josh] 7c's hazard toggle offers "File an incident report", which opens a **blank** 7e pre-filled with project and date. **No draft row is written. Nothing persists unless the user submits.** A hazard flag is not an incident. §4.12.3, §4.12.5. |
| D-30 | The four unenforced UI rules  | **DB CONSTRAINTS.** [S99, Josh] Required `work_performed`, injury-must-name-a-party, orderless-check-in-still-needs-a-project, and the damage-photo rule become a **third migration** — specced in **§7c**, not written here. **Where a constraint cannot reach, §7c says so plainly rather than pretending.** |
| D-31 | Markup display source         | **REVERSED [S99, Josh] — the DERIVATIVE is the display source.** Overturns D-21's third-pass Option A. Save writes an annotated derivative; the viewer indicates markup and **toggles back to the original by swapping files**. Per the _Mobile Photos_ handoff. **Option A's premise — desktop-annotated photos with `markup_data` and no derivative — no longer applies: no existing photos need preserving.** §4.7a rewritten; A-23e2/A-23g2 deleted, A-23f–A-23s rewritten. |
| D-33 | 7a project pre-selection      | **NO PRE-SELECTION. SORT NEAREST-FIRST.** [S99, Josh] No project is chosen when M-5 opens; the crew member taps one. The list is **ordered by proximity** so the likely-right project is at the top. **This extends D-27's principle from type to project** — the app does not guess and let the user correct. The "Here" GPS chip becomes a **status indicator on the nearest card, not a selection**. Rationale: wrong-project time lands in job costing. §4.12.1; A-7l. |
| D-34 | GPS at clock events           | **ALWAYS REQUESTED, NEVER BLOCKING, REASON RECORDED.** [S99, Josh] No opt-out — no setting, toggle or skip. Requested at every clock in and clock out. A missing fix **never** blocks: `gps_in`/`gps_out` stay nullable. **Why a fix is absent is recorded in a `reason` field INSIDE the existing jsonb — no new column** — mapped from the browser Geolocation API's own error codes. §4.12.1a; A-7k–A-7k3. |
| D-35 | OT week line on 7a            | **CUT.** [S99, Josh] 7a shows **no derived overtime figure**. Same shape as D-19's progress cut: the data exists (`companies.ot_threshold_hours`, `week_starts_on`) and is deliberately not surfaced. §4.12.1b; A-7m. |
| D-32 | The mid-shift switcher (7b)   | **ADOPTED.** [S99, Josh] A gap in this spec, not a contradiction — §4.5a already recorded it as owed and pre-committed its constraints. **A-7j is REWRITTEN, not satisfied**, and **A-7g is revived onto 7b**. 7b must close-and-open (never edit in place), honour the six-type/three-and-three table, and carry a note field. §4.5a, §4.12.2. |
| D-24 | "Up next" binding             | **Bound to the schedule.** [S98, Josh] The next upcoming item on the project, from the existing calendar UNION; no milestone concept is introduced. §4.3; §8a; A-11f–A-11j. _(Renumbered [S98]: this ruling was previously cited as "D-6", which is offline-capable actions.)_ |
| D-36 | The app-bar avatar            | **CUT.** [S100, Josh] §3.1's 38px amber avatar is removed from the app bar entirely — not resized, not made tappable. The hamburger stays as the bar's only left control, and **Sign out remains where §3.3 already puts it**, in the sheet. The bar is now: hamburger (or back chevron) · title block · nothing on the right. §3.1; A-40. _(Raised by the shell build: §3.1 sized the avatar and never gave it an action, and 38px sits under §2's 44px floor for interactive targets — so it was either a sub-spec tap target or a decoration. Ruled: neither. It goes.)_ |
| D-38 | Dashboard tile / M-24         | **CUT FROM V1.** [S100, Josh] The Dashboard tile leaves §3.3 — the sheet drops to **six** tiles — and `/m/dashboard` is not built. **Not permanent: a v1 cut, in D-19's and D-14's shape.** Three independent reasons, each sufficient. **(1) Every non-money figure is already owned elsewhere**, by a screen that owns it better: `activeProjectCount` by M-2's app bar (A-10c fixes it as `{n} active` **and nothing after it**), `openPunchCount` by D-16's counter and its two expressions, `pastTargetCount` by A-10e's signed days-left on the card the user can act from, `awaitingCount` by M-13. A second copy is a second chance to disagree. **(2) The attention feed — the one thing not duplicated — is office admin, not field work:** CO signature chasing, and project-setup data hygiene. All three item types hard-code `/dashboard/**` hrefs. **(3) `getDashboardData()` selects `change_orders.net_delta` twice** (`dashboard.ts:64`, `:73`) to build `awaitingSum` and the signed-CO items — so calling it from `/m` pulls **the exact column D-26 cut** into the mobile data path, where **TECH_DEBT #117** means RLS would not catch a slip. §3.3; §4.13 (M-24 removed); A-3b, A-41, A-43. |
| D-39 | App bar on the six destinations | **HAMBURGER, NOT A BACK CHEVRON — a deliberate departure from §4.11's common rule, confirmed [S100, Josh].** §4.11 gives the twelve project-section screens a back chevron; the six hamburger destinations keep the **hamburger**. Two reasons. §3.1's chevron clause is conditioned on being **inside a project** (`/m/p/**`) and these are company-scoped, so it never fires. And decisively: **A-3c can only be observed by opening the sheet while standing on one of these six routes** — a back chevron makes the sheet unopenable there, which would strand the criterion for a second time after §4.13 had just rescued it. **Recorded as a ruling, not a flagged deviation, so a later reader does not "fix" it back to the chevron.** §4.13's common rules; A-42b. |
| D-40 | Location data — read access and retention | **OWNER/ADMIN READ ONLY. 30-DAY RETENTION.** [S101, Josh] Closes the "retention and read access for location data" item D-34 opened. `gps_in`/`gps_out` are readable by Owner and Admin only, and rows older than 30 days lose their location payload. **NEITHER HALF IS ENFORCED TODAY, and neither is a UI change** — see §4.12.1a's new "Read access and retention" block for the cost. **A migration is required and is NOT written here.** |
| D-41 | In-app notice that location is captured | **NO. Crew are NOT told in-app.** [S101, Josh] The other half of the item D-34 left open. No banner, no first-run explainer, no line on M-5. **Josh's reasoning, recorded as his:** the capture is a condition of employment rather than a consent the app negotiates, and a per-clock-in notice on the one screen a crew member must use every shift is friction on a required action for a fact that does not change. **This spec records the ruling and does not endorse it as legal advice** — see §4.12.1a. |
| D-42 | `deliveries.checked_in_at`     | **YES — the column is adopted.** [S101, Josh] Resolves TECH_DEBT #134. `submit_delivery_check_in()` becomes a **state transition** rather than a bare gate: it stamps `checked_in_at` on success, so a half-entered check-in is distinguishable from a finished one. **Specced in §7c; NOT migrated here.** |
| D-43 | Expenses — who enters, views, edits | **Everyone enters and views. Everyone edits their own. Only Owner/Admin edit anything.** [S101, Josh] **The live RLS does not implement this, and the gap is in the "views" clause** — `expenses_select_scoped` gives crew and subcontractors **their own rows only**. Two further mismatches on the edit clause. Full comparison, and what each would cost, in §4.13.3's new "The ruling vs the live policies" block. **A-45d STANDS** — it asserts the absence of a UI role check, which this ruling reinforces. |
| D-44 | 7a fallback order with no GPS fix | **RECENTLY-USED.** [S101, Josh] Closes the D-33 open item. **There is no source function for it today** — stated plainly rather than bound to something approximate. The data exists on `time_segments`; the function does not. §4.12.1; A-7l2 rewritten. |
| D-45 | Change orders on mobile — full lifecycle | **INTENT RECORDED, SCREEN DEFERRED.** [S101, Josh] Owner/Admin/PM will eventually author a CO on mobile end-to-end, creation through send-for-signature. **Not in scope now, and M-13 must not be built in a way that forecloses it.** **Does NOT reverse D-26**, which governs *display on the read-only list*. §4.11.3. |
| D-46 | Money format on `/m`           | **ONE FORMAT, FIXED AS A §2 TOKEN.** [S101] `$1,234.56` / `-$1,234.56` / `—` for null. Matches the 15 desktop `style: 'currency'` call sites and the PDF templates' hand-rolled formatter, which agree on every case. Written into **§2** rather than §4.13.3 so the next money screen inherits it. A-50. |
| D-37 | Expenses on mobile            | **IN SCOPE. D-9 is NARROWED, NOT REVERSED.** [S100, Josh] Expenses gets a real mobile screen (§4.13.3, M-26). **Budget, Invoices, Payments and Contracts stay absent and are deferred to v2** — the exclusion list loses exactly one member and gains nothing. This is the first currency on `/m`, and §4.13.3 states in full what that forces and what it does **not**: unlike D-26's `net_delta`, `expenses_select_scoped` is a **real DB row floor**, and an expense amount is *actual cost*, which the Financial Visibility Floor explicitly makes visible to every role. **The open role question inside that is NOT decided here** — see §4.13.3's "What this forces" and §11's open list. §4.13.3; A-44–A-44f. |

---

## §1 — Route tree

All mobile routes live under `apps/web/app/m/`. Nothing under `app/dashboard/` is modified.

```
app/m/
  layout.tsx                        mobile shell: app bar + tab bar + offline strip + sheet host
  page.tsx                          → redirect to /m/timeclock  (D-12)
  timeclock/page.tsx                M-5   tab slot 2
  timeclock/switch/page.tsx         M-20  7b  mid-shift segment switcher   [S99, D-28/D-32]
  projects/page.tsx                 M-2   projects list
  logs/page.tsx                     M-6   tab slot 4
  logs/new/page.tsx                 M-21  7c  daily log entry              [S99, D-28]
  field/page.tsx                    M-7   tab slot 5
  capture/page.tsx                  post-shot handling (§6) — NOT the camera itself
  offline/page.tsx                  M-4   offline / failure state

  # The six hamburger-sheet destinations (§3.3 tiles → §4.13)   [S100]
  # NO dashboard/ ROUTE — the Dashboard tile is CUT from v1 (D-38).
  schedule/page.tsx                 M-25  company schedule — the calendar across projects
  expenses/page.tsx                 M-26  expenses  [D-37 — first currency on /m]
  subs/page.tsx                     M-27  subs & vendors directory
  team/page.tsx                     M-28  company team roster
  contacts/page.tsx                 M-29  company contacts directory
  settings/page.tsx                 M-30  settings — READ-ONLY (§4.13.7)
  p/[projectId]/page.tsx            M-3   project sections hub
  p/[projectId]/overview/page.tsx   M-11  overview — dates, scope, schedule stepper, status
  p/[projectId]/schedule/page.tsx   M-12  schedule — the project's calendar events
  p/[projectId]/changes/page.tsx    M-13  change orders — NO MONEY (§4.11.3)
  p/[projectId]/punch/page.tsx      M-14  punch list
  p/[projectId]/deliveries/page.tsx M-15  deliveries  (M-7's Deliveries tile shares this)
  p/[projectId]/deliveries/check-in/page.tsx  M-22  7d  delivery check-in  [S99, D-28]
                                          ONLINE-ONLY (D-6) — never queues; see §4.12.4
  p/[projectId]/files/page.tsx      M-16  files — non-photo documents
  p/[projectId]/contacts/page.tsx   M-17  project contacts
  p/[projectId]/team/page.tsx       M-18  assigned crew
  p/[projectId]/safety/page.tsx     M-19  safety incidents  (reached from M-7)
  p/[projectId]/safety/new/page.tsx M-23  7e  incident report              [S99, D-28]
  p/[projectId]/photos/page.tsx     M-8   gallery  (M-7's Photos tile shares this)
  p/[projectId]/photos/[fileId]/page.tsx        M-9   viewer
  p/[projectId]/photos/[fileId]/markup/page.tsx M-10  markup
```

**Four field-capture routes added [S99, D-28].** M-20…M-23 are 7b, 7c, 7d and 7e. **They are PAGES, not
sheets** — the handoff draws them with ✕ chrome rather than a back chevron, and Josh ruled that is styling,
not structure. Two consequences a build must honour: each is **deep-linkable and browser-back-able**, and
none of them is hosted by `layout.tsx`'s sheet host. 7a needs no new route — it is M-5, amended in §4.12.1.

**M-21 is what closes GAP-8's core defect.** §4.6's M-6 carries a primary "Log the day" button that until
now resolved to nothing; `logs/new` is its destination.

**Six hamburger destinations, six new routes [S100].** Until this pass every tile in §3.3's sheet had a
label and nothing behind it — no route here, no section in §4, no criterion in §10. They are now specced
in **§4.13** as M-25 … M-30, under the same rules §4.11 applied to the twelve section screens.
`/m/subs` is deliberately shorter than the tile's label ("Subs & Vendors"); a URL segment with an
ampersand in it is a needless escaping problem, and no other mobile route spells its label out either.

> **Six, not seven — the Dashboard tile is CUT [S100, D-38].** It was specced in this pass as M-24 and
> then ruled out of v1: every non-money figure it carried is already owned by M-2, M-3, M-13 or M-14, its
> attention feed is office admin with `/dashboard/**` hrefs, and `getDashboardData()` reaches for
> `net_delta` twice. **`M-24` is retired and not reused** — the numbering runs M-25 … M-30 with a gap,
> so a future reader meeting "M-24" in an older document finds the cut rather than a different screen.
> **There is no `/m/dashboard` route.** A build that adds one has un-ruled D-38.

**Two consequences.** First, **no sheet tile points at `/dashboard/**` any more** — the reading that let
them do so was an inference, never a ruling, and it is now moot. Second, **A-3c becomes satisfiable** —
see the note at the end of §3.3.

**Twelve tiles, nine new routes [S98].** Every tile on M-3 and M-7 resolves to a real mobile screen
(§4.11). Three tiles reuse a route rather than getting their own — stated in §4.11.10 — and **no tile is
cut, disabled, or pointed at a desktop page**; D-13 forbids the last of those one layer up.

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

**Money — one format, everywhere on `/m` [S101, D-46].** Currency is a number, so the mono rule already
covers the typeface. What it did not cover is the shape, and M-26 is the first money on mobile (D-37) —
so the shape is fixed here, as a **token**, rather than inside the first screen that needs it. The next
money screen inherits it instead of inventing a second convention.

| Case | Renders |
| ---- | ------- |
| Positive | `$1,234.56` |
| Negative | `-$1,234.56` — minus **before** the symbol |
| Zero | `$0.00` |
| Null / absent | the em-dash empty state (`—`), **never** `$0.00` |

Symbol `$` leading, comma thousands separators, **always exactly two decimals** — never truncated to
whole dollars, never a variable precision.

**This is not invented; it is the format desktop already uses, and the citation matters more than the
rule.** Two implementations exist and they agree on every case above:

- `value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })` — the dominant form, **15 call
  sites**, e.g. `app/dashboard/projects/[id]/page.tsx:25`, `projects/projects-list.tsx:50`,
  `projects/[id]/payments/payments-view.tsx:91`, `components/expenses/expense-ui.tsx:11`, and
  `app/dashboard/estimates/labels.ts:51` via a shared `Intl.NumberFormat`.
- A hand-rolled `` `${sign}$${Math.abs(v).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` ``
  in the PDF templates — `lib/invoices/invoice-template.tsx:21-27`, `lib/change-orders/co-template.tsx:28-34`,
  `lib/proposal/proposal-template.tsx:16`. Different code, **identical output**, including `-$` for
  negatives.

**Where the mobile implementation lives — and why it is not an import.** `expense-ui.tsx` and
`labels.ts` both sit inside desktop UI modules; importing either into `app/m/**` would couple the field
app to a desktop component file for a one-line formatter. The correct long-term home is
`packages/shared/utils/`, alongside the other pure helpers. Until something puts it there, **mobile
carries its own one-liner matching the calls cited above**, and **A-50 asserts the rendered output
rather than the function**, so the two cannot drift regardless of where the code ends up. A-28b's
"no duplicate data access for mobile" governs **services**, not formatters.

**The em-dash rule is the one that differs from a naive `toLocaleString` call.** `Number(null ?? 0)`
renders `$0.00`, and on a field screen "$0.00" and "not recorded" are different facts. Every mobile
money binding must distinguish them — the same rule §4.11.1 already applies to null dates.

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
Right: **nothing.** The title block runs to the bar's right inset.

> **AMENDED [S100, D-36] — the avatar is CUT.** _Superseded line, quoted rather than deleted:_
> _"Right: **38px amber avatar** with the user's initials."_
>
> **Why it went, so nobody restores it as an oversight.** §3.1 gave the avatar a size and contents and
> **never gave it an action**. That left exactly two readings, and both are wrong: as a *control* it is a
> 38px tap target, under §2's 44px floor, which only the markup colour swatches are exempt from (A-5
> would fail on it); as *decoration* it spends the app bar's scarcest resource — horizontal room at
> 402px — on information the user already has. Ruled cut rather than resized, because "make it 44px"
> would have answered the measurement and not the question.
>
> **What replaces it: nothing, and that is the point.** Identity and sign-out already have a home —
> §3.3's sheet carries the full-width **Sign out** row, and §4.13.7 (M-30) carries the signed-in
> identity. The avatar was a third route to the same two facts.
>
> **A build that renders any right-hand element in the app bar fails A-40.** That is written as an
> absence assertion, in the shape of A-10d and A-11e, because a helpful build will otherwise put the
> avatar back.

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

**Tiles:** Schedule · Expenses · Subs & Vendors · Team _(count)_ · Contacts · Settings. **Six.**
Below the grid, a full-width **Sign out** row (58px, `#c0362c` text, `#f0d4d1` border).

> **AMENDED [S100, D-38] — Dashboard is CUT and the grid is SIX tiles.** _Superseded line, quoted rather
> than deleted:_ _"**Tiles:** Dashboard · Schedule · Expenses · Subs & Vendors · Team (count) · Contacts
> · Settings."_ Reasoning in D-38 and in the note under §4.13's heading. **A v1 cut, not a permanent
> one** — D-19's and D-14's shape. Six tiles in a 2-column grid is three clean rows, which the seven
> never were.

Tapping the scrim or the hamburger closes it. **The tab bar stays visible and functional beneath the sheet.**

> Because the tab bar owns Projects, Timeclock, Logs and Field, those four are **deliberately absent**
> here. A build that adds them back is wrong.

**Every tile resolves to a `/m/` route [S100].** All six now have a screen behind them (§4.13,
M-25 … M-30) instead of a label:

| Tile | Route | Screen |
| ---- | ----- | ------ |
| Schedule | `/m/schedule` | M-25 (§4.13.2) |
| Expenses | `/m/expenses` | M-26 (§4.13.3) — D-37 |
| Subs & Vendors | `/m/subs` | M-27 (§4.13.4) |
| Team _(count)_ | `/m/team` | M-28 (§4.13.5) |
| Contacts | `/m/contacts` | M-29 (§4.13.6) |
| Settings | `/m/settings` | M-30 (§4.13.7) |

**A-3c IS NOW SATISFIABLE, AND WAS NOT BEFORE.** A-3c asserts that *"the tile matching the current
location carries the blue border and blue label; no other tile does."* While the tiles pointed at
`/dashboard/**` and the sheet only ever rendered on `/m/**`, **no tile could match any location the
sheet was open on** — so A-3c's positive half was unassertable and its negative half passed vacuously.
The S99 shell build recorded exactly that. With six `/m/` routes the match is real: open the sheet on
`/m/expenses` and the Expenses tile — and only that tile — carries the `1.5px #2f49d1` border and the
blue label. **The criterion is unchanged; what changed is that the app can now fail it.** A-41 walks all
six so the highlight cannot be right for one tile and wrong for the rest.

**D-38 does not weaken this.** Cutting Dashboard removed the one tile that had **no** `/m` route, so
every remaining tile is a live destination — A-3c's positive half is now reachable from every tile in
the grid, not merely from most of them.

**The comparison is prefix-scoped, and that matters for one pair.** "Current" means the pathname equals
the tile's href **or** begins with it plus `/`. `/m/schedule` and `/m/settings` share no prefix, but a
future `/m/s...` route could; the rule is stated so a build does not reach for `startsWith(href)` alone,
which would light Schedule on a hypothetical `/m/schedulex`.

---

## §4 — Screens

### 4.1 M-1 · Navigation menu — see §3.3.

### 4.2 M-2 · Projects list

App bar: "Projects" + mono `{n} active`.

> **AMENDED [S98, D-23]:** the header read `{n} active · {m} estimating`. **The second half is
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

**Binding [S98, D-24 — bound to the schedule, no milestone concept introduced].** "Up next" is the
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
- **Segment type select** (58px row) — **required** [S98, D-27]. Opens a picker of the six permitted types.
- **Project select** (58px row) — **present and required only for the types that carry a project**
  (`work`, `material_run`, `warranty`); **absent** for `travel`, `shop` and `break`. See §4.5a for the
  complete per-type rule. _(Superseded text: "required before clock-in unless the user is clocking in with
  no project" — that phrasing predates D-27 and described a state that can no longer arise by accident.)_
- Primary 60px button: amber **"Clock in"**, or `#c0362c` **"Clock out"** when a session is open. Enabled
  once the type, and any project that type requires, are set.
- Below: **today's segments** as 58px rows — segment type, mono start–end, mono duration.
- **On successful clock-in, the redirect follows the TYPE** (D-12 as restated in §4.5a): a type carrying a
  project navigates to `/m/p/{projectId}`; a type that cannot carry one navigates to the dashboard.
- Offline-capable (§5). The button works with no signal and the resulting event enters the queue.

#### 4.5a Segment type is chosen at clock-in (D-27 [S98, Josh]) — supersedes D-25

**There is no default type and no skippable prompt.** Starting a shift is: **pick a type → pick a project
where that type allows one → Clock in.** The type is a required choice, not something the app guesses and
the user corrects afterwards.

**This dissolves D-25's collision instead of working around it.** The problem was that a defaulted `work`
segment requires a project while D-12 and §4.5 allow clocking in without one. Once the user names the
type first, the project question has already been answered by their choice — there is no case left where
the app has committed to a type the project state cannot satisfy.

##### The complete per-type rule — all six types, verified from the CHECK

`time_segments_type_check` (`20260710130000_module6_6a_time_tracking.sql:214-215`) permits exactly six
types, and `time_segments_project_gate_check` (`:222-225`) partitions **all six** of them — three
requiring a project, three forbidding one. **No type is optional**, and the constraint has no `ELSE`: a
type is in one arm or the row is rejected.

| `segment_type` | `project_id` | `task_id` | Note required on end |
| -------------- | ------------ | --------- | -------------------- |
| `work` | **REQUIRED** | permitted (the only type that may carry one) | yes |
| `material_run` | **REQUIRED** | forbidden | yes |
| `warranty` | **REQUIRED** | forbidden | yes |
| `travel` | **FORBIDDEN** | forbidden | yes |
| `shop` | **FORBIDDEN** | forbidden | yes |
| `break` | **FORBIDDEN** | forbidden | **no** |

> **§8a's caveat was correct but incomplete, and is corrected here.** It said `travel`, `shop` and `break`
> are forced to `project_id IS NULL` — true — but implied `work` was the type that carries a project.
> **`material_run` and `warranty` require one too.** A build that treats "not work" as "no project" gets a
> constraint violation on both. The table above is the authority; §8a now points at it.

`task_id` and note columns come from `time_segments_task_gate_check` (`:229-231`),
`time_segments_completion_gate_check` (`:236-239`) and the `note` comment at `:242`. **Only `break`
escapes the note requirement.**

> **⛔ CORRECTION [S99] — the note rule IS DB-enforced. This section previously said the opposite.**
>
> _Superseded, quoted:_ _"— a service-layer rule with no CHECK behind it, so nothing but the UI enforces
> it."_
>
> **`time_segments_note_on_end_check` is live**, verified against rebuild-test:
>
> ```sql
> CHECK ((segment_end IS NULL) OR (segment_type = 'break') OR (note IS NOT NULL))
> ```
>
> **Why this matters rather than being a footnote:** a build that omits the note field does not degrade
> into an unenforced rule — it throws a constraint violation on **every** non-break segment end. That
> makes it a hard requirement of 7b (§4.12.2) and of clock-out, not a nicety. A-7h is corrected to match.

##### The clock-in interaction — what it actually is

**Not one tap.** The D-25 text claimed "one tap to start a shift"; that claim is withdrawn with the
ruling. The real interaction:

1. **Type row (58px)** — required. Opens a picker of six 58px rows.
2. **Project row (58px)** — **present only for `work`, `material_run` and `warranty`, where it is
   required.** For `travel`, `shop` and `break` the row is **absent, not disabled**. A greyed-out control
   invites a tap that can never succeed and implies the choice exists; the constraint says it does not.
3. **Clock in** — the 60px primary button, enabled once the type and any required project are set.

So: **two taps and a confirm for a project type, one tap and a confirm for a project-less type** — plus
whatever the pickers cost. The gain over D-25 is that no clock-in can be composed that the database will
reject.

**Ending a segment still requires a note for every type except `break`** — see the table. That is
unchanged by this ruling and applies wherever a segment ends: clock-out, and any later switch.

##### D-12's redirect now falls out of the type

D-12's second clause was written before this ruling and read as an accident of whether a project happened
to be selected. **Restated:** the redirect follows from the type the user chose.

- A type that **carries** a project (`work`, `material_run`, `warranty`) → navigate to **that project's
  hub**, `/m/p/{projectId}`. The project is guaranteed present, because the type required it.
- A type that **cannot** carry one (`travel`, `shop`, `break`) → navigate to the **dashboard**. Not
  because the user "didn't select a project" but because there is no project to navigate to.

The old phrasing — _"if no project was selected"_ — described a state that can no longer occur by accident.

##### What happened to the switch control — **ANSWERED [S99, D-32]: it is adopted, as 7b / M-20**

_Superseded heading and premise, quoted:_ _"The mid-shift switcher specced under D-25 **is not part of the
clock-in path and is not specced here.**"_ The first half stands — **7b is still not part of the clock-in
path**, and 7a gains no switch control. The second half is overtaken: the switcher now has a screen
(§4.12.2) and a route (`/m/timeclock/switch`, M-20).

**This was a GAP, not a contradiction**, which is why it is adopted rather than bent: this section already
recorded it as *"still true, and still owed by GAP-8's Mobile Field Capture handoff"* and pre-committed
its three constraints. The handoff satisfies two of them and misses one — see §4.12.2.

Being explicit about which parts survive:

- **Withdrawn from this section:** the type row on the *state card* as a post-hoc corrector, the
  default-then-switch flow, and its offline two-entry choreography. Those existed only to serve a default
  that no longer exists. Their criteria are rewritten or removed in §10.
- **SATISFIED [S99] — was "still owed by GAP-8's _Mobile Field Capture_ handoff":** a mid-shift change of
  segment type is a real field need, and when it is specced it **must** close the open segment and insert
  a new one rather than editing in place — `time_segments_update_authorized` lets a member end their **own
  open** segment but not alter an ended one, and `time_segments_insert_authorized` gates inserts on
  `owns_open_session(session_id)`. It must also honour the per-type table above and the note rule.
  _(Superseded clause: "That is a constraint on the future handoff, not a screen this document
  specifies." **It is now §4.12.2.**)_ **All three constraints carry over verbatim as requirements on
  7b** — the handoff already satisfies close-and-open, and misses the other two.
- **RESOLVED [S99] — was "Consequence to be honest about":** _quoted:_ _"with the switcher out of scope, a
  crew member who clocks in on the wrong type has **no in-app correction path in this spec's surface
  set**. That is GAP-8's gap, and it is now one more reason that handoff is a build blocker rather than a
  nicety."_ The correction path is `/m/timeclock/switch`.

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

### 4.7a Photo display — **REVERSED [S99, D-31]. Governs M-8, M-9 and M-10**

Stated once here rather than three times below. Every surface that renders a photo obeys it.

> ## ⛔ OPTION A IS OVERTURNED [S99, Josh — D-31]
>
> **THE RULE NOW: the annotated DERIVATIVE is the display source.** Save writes it; every surface that
> shows a marked-up photo shows **that file**. The viewer **indicates** a photo has markup and **toggles
> back to the original by swapping files.**
>
> Source — the _Mobile Photos_ handoff (§6l, `docs/handoffs/mobile-photos/README.md`):
> _"Markup is a non-destructive layer — save writes an annotated derivative and keeps the original; the
> viewer should indicate a photo has markup and allow toggling back to the original."_
>
> _Superseded [S99], quoted rather than deleted:_
>
> > _"**The rule [S98, Josh — Option A]: render the ORIGINAL image with the annotation layer drawn over
> > it, live, from `files.markup_data`.**_
> >
> > _This is the display path everywhere — gallery thumbnail, viewer image stage, filmstrip. **It does not
> > depend on a derivative existing**, so the desktop-annotated population renders correctly with **no
> > desktop change and no backfill**. D-2 and A-28 hold. The previously blocked case is gone: there is no
> > longer a "missing derivative" branch, because the derivative was never on the display path."_

#### 4.7a.0 Why the reversal is safe — the premise Option A was built on is gone

Option A existed **for one reason**: a population of photos annotated on desktop, carrying `markup_data`
with **no derivative**, which a derivative-based display path would render unmarked. Every argument in
§4.7a.1–§4.7a.4 below is downstream of solving that.

**Ruled [S99, Josh]: that population does not exist. No existing photos need preserving.** With no legacy
population, the blocked case Option A was designed around cannot occur, and the derivative — which Save
was already writing per D-21 — is simply the rendered artifact.

**What this costs, stated plainly rather than buried:**

- **The desktop markup editor must write a derivative on save, and currently does not.** Under Option A it
  never had to, because nothing read one. Under D-31 a desktop-annotated photo with no derivative renders
  **unmarked** on mobile. **Ruled [S99, Josh]: that is a SEPARATE WORK ITEM, outside this build.** It is
  not fixed here and M6M states no criterion for it. Recorded in §11's open items so it is not lost.
- **Toggling is now a file swap, not a layer toggle.** It issues a second image request. A-23e2, which
  asserted the opposite, is deleted.
- **A stale or missing derivative is a correctness problem again, not a cosmetic one** — it is what is on
  screen. §4.7a.5's three "reverted hardenings" revert back; see the note there.

**What it buys:** the display path is one `<img>` against one file. §4.7a.1's coordinate-model reasoning,
§4.7a.2's shared-viewBox requirement and §4.7a.3's legibility rules **all become moot for display** —
they described how to draw an overlay that is no longer drawn. They are retained below, struck through in
purpose but not deleted, because **§4.10's authoring canvas still renders shapes live** and still needs
every word of them.

> **[S99] SCOPE OF §4.7a.1 – §4.7a.4 AFTER D-31.** These four subsections specified how to draw a live
> overlay at display time. **Display no longer draws one**, so as *display* rules they are superseded.
> They are kept in full and unedited because **the M-10 authoring canvas still draws shapes live** over
> the image being annotated — §4.10 depends on the coordinate model (§4.7a.1), the shared-viewBox
> requirement (§4.7a.2, still non-negotiable *there*), the stroke floor and text handling (§4.7a.3) and
> the paint-ordering rule (§4.7a.4). **Read them as authoring rules, not display rules.** The one
> display-time item that survives unchanged is the markup **indicator** (§4.7a.3) — a derivative-based
> surface still has to tell the user the photo is annotated.

#### 4.7a.1 The stored coordinate model makes this work — verified, not assumed

The concern that this might be unbuildable does not survive contact with the schema.
`MarkupData` (`packages/shared/types/markup.ts:57-64`) stores:

```ts
export interface MarkupData {
  version: number;
  // Natural dimensions of the underlying image. Shapes are stored in image
  // coordinates so markup renders correctly regardless of display size.
  imageWidth: number;
  imageHeight: number;
  shapes: MarkupShape[];
}
```

Three properties follow, and all three are load-bearing:

1. **Coordinates are absolute pixels in the ORIGINAL image's natural space** — not screen pixels, not
   normalised 0–1. The editor converts pointer events through the SVG's own viewBox transform
   (`markup-editor.tsx:56-68`, _"Works regardless of CSS-applied display size"_), and the viewBox is
   `0 0 naturalWidth naturalHeight` (`:384`, dims measured at `:273-279`).
2. **The natural dimensions travel with the markup.** `imageWidth`/`imageHeight` are in the JSON, written
   by `createEmptyMarkup(imageDims.w, imageDims.h)` at save (`markup-editor.tsx:240-243`). **This is what
   makes a thumbnail overlay possible at all** — a consumer can build the viewBox without first
   downloading the full-resolution original to measure it. Had the dimensions been omitted, every gallery
   tile would have had to fetch a multi-megabyte image to learn its aspect ratio, and Option A would have
   been impractical.
3. **Absolute-pixels-plus-viewBox scales better than normalised coordinates would.** The viewBox transform
   maps image space to any rendered size uniformly. A mark covering 5% of the image covers 5% of the
   thumbnail, automatically.

**The renderer already exists and is unused.** `packages/shared/components/MarkupViewer.tsx` is a pure
presentational SVG renderer over exactly this schema — `viewBox={`0 0 ${width} ${height}`}` at `:34`, the
`<image>` and the shapes in **one** SVG at `:39-42`. It has **zero consumers** anywhere in the repo
(verified by grep). It lives in `packages/shared/`, **not** `apps/web/app/dashboard/**`, so adopting and
extending it does not touch A-28 or D-2.

#### 4.7a.2 Aspect-ratio fit — how marks stay on target in a square tile

**The image and the overlay must be rendered in ONE SVG sharing ONE viewBox.** This is the whole
mechanism, and it is non-negotiable: `<image>` and the shapes both live in image coordinates, so any
scaling or cropping the SVG applies is applied to both **together**. A build that renders an `<img>` with
CSS `object-fit: cover` and positions a separate SVG over it will drift at every size that is not the
authoring size — the two are then cropped by different rules. `MarkupViewer:39-42` already has the
correct structure.

Fit is then chosen with `preserveAspectRatio`, per surface:

| Surface | Tile shape | `preserveAspectRatio` | Behaviour |
| ------- | ---------- | --------------------- | --------- |
| M-8 gallery tile | **square** (§4.8) | `xMidYMid slice` | **Crops with the image.** The image fills the square and is centre-cropped; marks are cropped by exactly the same transform, so a mark in the cropped-away band is cropped away too. Correct — the alternative is a mark floating over a letterbox bar where its subject is not visible. |
| M-9 image stage | fixed 330px stage, full-bleed (§4.9) | `xMidYMid slice` | Same reasoning; the stage is full-bleed by §4.9. |
| M-9 filmstrip | square 52px (§4.9) | `xMidYMid slice` | Same as the gallery tile. |
| M-10 markup canvas | flexible, image-shaped (§4.10) | `xMidYMid meet` | **Never crops.** Authoring must show the whole image or a mark cannot be placed in the cropped region. |

**`MarkupViewer` needs an optional fit prop** to serve both — defaulting to its current `xMidYMid meet`
(`:37`) so nothing that might adopt it later changes behaviour by surprise. Adding an optional prop with
the existing value as default is a non-breaking change to a component with no consumers.

**Stated consequence, so nobody reports it as a bug:** a mark near the edge of a landscape photo may be
invisible in the square thumbnail and visible in the viewer. That is the crop working, not the overlay
failing.

#### 4.7a.3 Legibility at thumbnail size

A 3-column gallery tile at §4.8's geometry is roughly **120px**. Stroke widths are stored in **image**
pixels — the editor's default is `20` (`markup-editor.tsx:46`). On a 4000px-wide photo in a 120px tile the
scale factor is ~0.03, so a 20-unit stroke renders at **~0.6px**. Sub-pixel. Rendered faithfully, the
overlay is invisible at thumbnail size — which would make the gallery look like Option B, the outcome this
ruling rejected.

**Decision — a thumbnail renders the geometric overlay with a stroke floor, plus a corner indicator, and
drops text marks.** Three parts, each with its reason:

1. **Geometry renders, always.** Positions are never adjusted. A mark is where the mark is, at every size.
2. **Stroke has a floor of 1.5 device px.** Where the display scale would render a stroke below that, the
   stroke width is raised so the rendered result is 1.5px; it is **never lowered**, so a deliberately
   heavy mark stays heavy. Only stroke weight is affected — never position, never size, never geometry.
   `strokeWidth`-derived ornaments scale with it (the arrowhead is `max(strokeWidth * 4, 10)`,
   `MarkupViewer:108`), so an arrow keeps a visible head.
3. **`text` marks are omitted from the thumbnail overlay.** `TextShape.fontSize` is in image pixels
   (`markup.ts:52`); at a 0.03 scale a 40px label renders at ~1.2px — an illegible smudge that reads as
   an artefact, not as information. A stroke floor cannot rescue text, because legibility needs
   *letterforms*, not weight. Text renders in full at M-9 and M-10.

**And a corner indicator, because the overlay alone is not a reliable signal.** A photo whose only mark
sits in the cropped-away band would show a thumbnail indistinguishable from an unannotated photo. So an
annotated photo carries an explicit indicator.

> **It must not read as a source badge.** §4.8's rule is that *a photo's badge is its provenance — never
> invent one*, and the source badges (`Log`, `Delivery`, `Safety`, `Punch`) are **bottom-left, rounded
> rectangles, filled, carrying text**. The markup indicator is therefore deliberately none of those:
> **top-right, circular, icon-only, no text**, in the neutral `rgba(20,33,61,.72)` chrome fill. Different
> corner, different shape, no label. It says "this photo is annotated" — a property of the file — and it
> can never be mistaken for a statement about where the photo came from. A build that renders it as a
> labelled pill bottom-left has broken §4.8's rule even if the wording is right.

#### 4.7a.4 What renders before the overlay has drawn

The shapes are available immediately — `markup_data` arrives with the `files` row that populated the grid.
The **image** is what loads asynchronously, over a signed URL.

**The rule: the tile shows its placeholder until the composite is ready, then reveals both at once.** Two
partial states are specifically forbidden:

- **Shapes over a blank tile.** Both live in one SVG, so an unstyled build paints the shapes the instant
  the SVG mounts while `<image>` is still fetching — marks floating on nothing.
- **The bare image with marks arriving a beat later.** This is the more damaging of the two: for that
  interval the surface is showing an annotated photo as unannotated, which is exactly the failure Option
  B was rejected for. It is worse than a placeholder because it looks finished.

So: placeholder → complete composite. No intermediate paint. The indicator from §4.7a.3 may render on the
placeholder, since it derives from `markup_data` alone and needs no image.

#### 4.7a.5 The derivative — **RE-PROMOTED to the display source [S99, D-31]**

> **[S99] This subsection's title and premise are overturned.** _Superseded, quoted:_ _"**The derivative
> is a SHARING artifact, not a display source.** `markup_data` is the source of truth **and now also the
> display path**. Save still writes a flattened derivative per D-21, and it is used **only** when a
> marked-up photo has to leave the app — share, email, PDF embed. Nothing in the UI reads it."_
>
> **The derivative is now BOTH** — what the UI displays *and* what leaves the app. `markup_data` remains
> the source of truth **for re-editing** (§4.10 regenerates from it), but it is no longer a display input.
>
> **The three "reverted hardenings" below therefore revert BACK.** They were correct while the derivative
> was load-bearing, relaxed when Option A demoted it, and are load-bearing again:
>
> | Hardening | Under D-31 |
> | --------- | ---------- |
> | A failed derivative write | **Save must NOT report plain success.** The marks are in `markup_data` but the user would see an unmarked photo. A-23j reverts. |
> | Regeneration staleness | **A correctness break again** — a stale derivative is the wrong image on screen, not an out-of-date share. |
> | Signed URLs (A-23l) | **Kept, and now for the display path** as well as sharing. Unchanged in substance. |
>
> **A-23t is now redundant for sharing and vital for display**: "missing derivative degrades to the
> original with a warning" was written so a *share* never passes off an unmarked photo as marked. The same
> failure is now visible on every screen, which raises its severity rather than removing it.

_The S98 text is retained below as the record of the demotion that D-31 undoes._

Reverted [S98] — three hardenings added while the derivative was briefly load-bearing, each put back:

1. **A failed derivative is not a partial-save failure.** _(Was: "Save does not report success".)_ The
   marks are safe the moment `markup_data` lands, and the UI renders from it, so **Save reports success**.
   The derivative failure is a **non-blocking notice** on the save confirmation — the sharing image
   couldn't be made — and the share action regenerates on demand rather than the editor retrying.
   Sharing degrades to the original with a warning; it never silently shares an unmarked photo as if it
   were marked.
2. **Regeneration is cosmetic again.** A stale derivative means an **out-of-date share**, not the app
   showing the wrong image. §4.10's regenerate-in-full-on-re-edit rule stands as the way to keep the
   sharing artefact current; missing it is a defect of the share, not a correctness break.
3. **The signed-URL requirement stands, for the sharing path.** The derivative lives in the same bucket
   under the same `{company_id}/{project_id}/` prefix and is reached the same way as the original
   (`getSignedUrl`, `files.ts:70`). A path that skips signing would work in testing and leak in
   production.

**The count is still unaffected.** The derivative gets no `files` row (§4.10), so photo count and gallery
tile count are unchanged by a markup save — A-23d holds exactly as before.

> **✅ RESOLVED [S98, D-22] — the `Pin` tool now has a shape type.** While specifying the overlay it
> emerged that §4.10's five-tool row (Draw · Arrow · Box · Text · Pin) outran `MarkupShape`
> (`markup.ts:55`), which was `arrow | circle | rectangle | pen | text` — Draw→pen and Box→rectangle
> mapped cleanly, **Pin mapped to nothing**. Ruled: add a `pin` type, `MARKUP_SCHEMA_VERSION` → 2.
> The gap predated this session's rulings; it is closed in **§4.10a**, which also covers read- and
> forward-compatibility and the blast radius against A-28.

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

**Zoom control [S98, Josh].** The stage carries an on-screen zoom control so **pinch has a visible
equivalent** and §4.9's accessibility rule holds for every gesture without exception. Two **44px**
translucent circles — `−` and `+` — stacked at the stage's **bottom-right**, inset 14px, 8px apart, in the
same `rgba(255,255,255,.13)` chrome as the prev/next circles. Each tap steps the zoom by a fixed factor.
When zoom is above fit, a third 44px **`Fit`** pill appears directly above the pair; at fit it is absent,
so the resting state is two controls, not three.

- **It does not crowd the stage.** Prev/next sit vertically centred at the left and right edges, spanning
  roughly 145–185px down a 330px stage. The zoom stack rises from a 14px bottom inset through 220–316px,
  leaving ~35px of clearance. Nothing overlaps at any zoom level.
- **44px** satisfies §2's 40–46px on-canvas nav circle band; no new token.
- **While zoomed, a horizontal swipe pans instead of paging.** The prev/next circles keep paging at every
  zoom level — which is the second reason the visible controls matter: at zoom the arrows are not merely
  an *equivalent* of the swipe, they are the **only** way to page.

Swipe left/right pages; pinch zooms; swipe down dismisses — **and every one of those three has a visible
on-screen equivalent: the arrows, the zoom control, and the close ✕.** Tapping **Source** navigates to the daily log / delivery / incident. Delete confirms first and is
role-gated.

**A photo with markup indicates it, and the viewer can toggle the overlay off to reveal the unannotated
original.**

> **Restated [S98, Option A].** This previously read "toggle back to the original", which under the
> derivative-as-display rule meant **swapping which file is fetched**. It no longer does. The image on
> screen is always the original; the toggle **hides and shows the annotation layer drawn over it**. No
> second fetch, no second artefact, and the toggle is instant because the image never changes — only the
> SVG shapes are added or removed. It remains the only way to see the photo unannotated (§4.7a).

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

**[S98, D-22] All five tools are now backed by a stored shape type** — Draw→`pen`, Arrow→`arrow`,
Box→`rectangle`, Text→`text`, and **Pin→`pin`, added in schema v2 (§4.10a)**. "The next number in
sequence" is specifically `max(existing pin numbers) + 1`, **not** `count + 1`; deleting a middle pin
leaves the survivors' numbers untouched and the freed number is never reused (§4.10a.2). One pin is one
mark and therefore **one** Undo step, which is why it is a shape type rather than a circle plus a text
mark.

_(Note: `circle` exists in the schema and no tool in this row exposes it. That is spare capacity, not an
omission — do not add a Circle tool to "use it up".)_

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
   sub, attached to an email, dropped in a PDF — and still show its marks. **[S98] It is a SHARING
   artifact only and is never displayed in the app** (§4.7a.5). A save whose derivative write fails still
   **reports success**, with a non-blocking notice that the sharing image could not be generated.

The contract between them:

- **The original file is never modified.** Its bytes, `file_path`, `file_size` and `mime_type` are
  untouched by any number of markup saves. Only `markup_data` changes on the original's row.
  **[S98] It is also what every surface displays** — §4.7a draws the overlay over these bytes.
- **The derivative is regenerated in full on every re-edit**, from the current `markup_data` against the
  original bytes. It is never edited incrementally and never used as the input to the next render — that
  would compound JPEG loss with each save. **[S98] This is a freshness requirement for the sharing
  artifact, not a correctness requirement for display** — a stale derivative means an out-of-date share,
  never a wrong image on screen (§4.7a.5).
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
  indicator and the gallery's corner indicator (§4.7a.3) read, and what the toggle switches off. The
  toggle shows or hides the drawn layer; it never fetches a different file.

> **Open sub-question, deliberately not decided here.** If sharing ever needs the derivative to be a
> first-class, permission-checked, signed-URL artefact rather than a sibling object, it needs its own
> `files` row and therefore a category that keeps it out of the photo gallery. Nothing in v1 requires
> that. Flagging so it is a decision later rather than a surprise.

Cancel confirms if there are unsaved marks.

Markup is also reachable from a punch item or incident, pre-linked to that record.

---

### 4.10a Markup schema v2 — the pin shape (D-22 [S98])

**Ruled [S98, Josh]: add a `pin` shape type. `MARKUP_SCHEMA_VERSION` goes to 2.**

Recorded rationale, so this is not relitigated: composing a pin from `circle` + `text` would make **one
pin two undo steps**, contradicting §4.10's _"Undo/Redo are per-mark"_ — and undoing twice to remove one
mark is bad on a phone in gloves. Dropping Pin instead would remove the capability that punch and incident
work needs most. The change is **additive**, and `MarkupViewer` has no consumers yet.

#### 4.10a.1 The shape

Added to the `MarkupShape` union in `packages/shared/types/markup.ts`:

```ts
export interface PinShape extends MarkupShapeBase {
  type: 'pin';
  x: number;          // image coordinates, same space as every other shape
  y: number;          // the pin's POINT — the centre of the circle
  number: number;     // STORED, not derived. See 4.10a.2.
}
```

- **Position** is `(x, y)` in the original image's natural pixel space, identical to every other shape
  (§4.7a.1), so the pin scales and crops with the overlay under the same viewBox transform. No new
  coordinate rules.
- **No `strokeWidth`.** §4.10 fixes the pin's appearance — "34px red circle, white 2px ring, mono
  numeral" — so its size is a render constant, not authored data. It is therefore **exempt from §4.7a.3's
  stroke floor** and instead has its own minimum rendered diameter; a pin that scales to 4px in a
  thumbnail is a dot, not a numbered marker.
- **`color` is inherited from `MarkupShapeBase`**, so a pin can follow the selected swatch. §4.10's red is
  the default, not a constraint.

#### 4.10a.2 The number is STORED, not derived — and the consequence is gaps

Both options were live. **Stored wins, and the reason is external references.**

| | Delete pin 2 of 3 | Consequence |
| - | ----------------- | ----------- |
| **Derived from array order** | Survivors renumber to 1, 2 | A daily log reading _"cracked sill at pin 3"_, or a foreman saying it on site, now points at a **different mark**. The renumber is silent and retroactive — it rewrites the meaning of text already written elsewhere. |
| **Stored (ruled)** | Survivors stay 1, 3 | Numbers are stable for the life of the photo. A reference to pin 3 remains valid forever. **The sequence has gaps.** |

**Accepted consequence: pin numbers have gaps after a delete, and they are never reclaimed.** A photo may
show 1, 3, 7. That is correct, not a defect, and no "tidy up" renumber is offered — renumbering would
reintroduce exactly the failure the stored model exists to prevent.

**This makes the next-number rule specific, and it is the detail most likely to be got wrong:**

```
nextNumber = max(number of existing pins) + 1     // NOT count + 1
```

Counting would collide. Delete pin 2 from {1,2,3}, leaving {1,3}; `count + 1` yields 3 — a duplicate.
`max + 1` yields 4. **On a photo with no pins, `max` over an empty set is 0, so the first pin is 1.**

**§4.10's "drops the next number in sequence" is therefore `max + 1`**, and deleting a middle pin leaves
the others untouched — no resequencing, no shifting, no reuse of the freed number.

#### 4.10a.3 Read-compatibility: v1 rows under a v2 reader

**A v2 reader renders a v1 row unchanged.** v1 payloads contain only `arrow | circle | rectangle | pen |
text`, all of which v2 keeps with identical field shapes — v2 is purely additive. There is no migration of
stored rows, no rewrite, and no backfill: an untouched v1 row stays `version: 1` on disk and renders
identically before and after the schema change. Asserted by **A-29**.

#### 4.10a.4 Forward-compatibility: v2 pins under a v1 reader — **VERIFIED, it skips**

This is the half that could have made the ruling unbuildable, so it was checked before being written.

**A reader that does not know `pin` must skip it and render everything else.** That is already what the
code does — verified at all three shape switches, each of which ends `default: return null`:

| Renderer | Location | Unknown type |
| -------- | -------- | ------------ |
| Desktop editor, shape rendering | `markup-editor.tsx:558` | `default: return null` — skipped |
| Desktop editor, selection highlight | `markup-editor.tsx:627` | `default: return null` — skipped |
| Shared read-only viewer | `MarkupViewer.tsx:98-102` | `default: return null` — skipped |

**It skips, it does not throw. This ruling therefore exposes no defect and creates none** — had any of the
three thrown, the fix would have landed in shared code and this would have been a stop.

Two consequences that follow, both real and neither obvious:

1. **Pins round-trip through a v1 editor without data loss.** The desktop editor seeds its state from the
   loaded array (`markup-editor.tsx:42`, `initialMarkup?.shapes ?? []`) and saves that array back, so a
   shape it cannot render is still carried through untouched. A PM opening and re-saving a photo on
   desktop does not destroy the foreman's pins.
2. **But a v1 editor shows those pins as nothing at all** — not as a placeholder, not as an unknown-mark
   glyph. Until desktop adds a `pin` case, a photo pinned on the phone opens on desktop appearing to have
   no pins, while the marks are still in the data. **This is user-visible and is the price of the
   additive approach.** It is not a data-loss bug, and it resolves the moment desktop adds the case.

> **⚠️ Found while verifying — the `version` field can lie after a desktop round-trip.**
> Save writes `createEmptyMarkup(...)` first, which sets `version: MARKUP_SCHEMA_VERSION`
> (`markup.ts:68`), then spreads the shapes over it (`markup-editor.tsx:240-243`). A **v1** desktop saving
> a photo that contains **v2 pins** therefore writes `version: 1` alongside v2 content. The pins survive
> (consequence 1 above); the version number becomes wrong.
> **So readers must be tolerant by SHAPE TYPE, never gated on the version number.** No consumer may do
> `if (version < 2) skipPins()` — the field is not trustworthy across mixed-version editors. `version` is
> provenance, not a capability gate. Asserted by **A-29c**.

#### 4.10a.5 Blast radius — A-28 holds, but say the quiet part

**A-28 holds.** The two files this touches —
`packages/shared/types/markup.ts` and `packages/shared/components/MarkupViewer.tsx` — are **not** under
`apps/web/app/dashboard/**`, and D-2's subject is the desktop shell's inline styles. Neither is breached.

**But this ruling is the first this session to touch shared code that desktop imports**, and that deserves
saying plainly rather than hiding behind a passing criterion. Every prior ruling was confined to `/m`,
migrations, or spec text. This one adds a member to a union type the desktop markup editor imports.

Why that is safe here, verified rather than assumed:

- **Adding a union member does not break the desktop build.** Each switch handles its five cases and falls
  to `default: return null`; the new member simply widens what reaches the default. None of the three
  sites asserts exhaustiveness with a `never` binding, so nothing fails to compile.
- *(Noted in passing: `MarkupViewer.tsx:99-101` carries a comment claiming "TS will error here if a new
  shape type is added". It will not — there is no `never` assertion behind it. The comment is inaccurate
  today, independently of this ruling. Fixing it is not required by anything here.)*
- **`MarkupViewer` has no consumers** anywhere in the repo, so its signature is free.
- **Nothing in `apps/web/app/dashboard/**` is edited** to make pins work. Desktop gains the ability to
  render pins only when someone chooses to add the case — a separate, additive piece of work outside
  M6M's scope.

---

### 4.11 The twelve section screens (M-11 … M-19) [S98]

**Every tile on M-3 and M-7 has a real mobile screen and a route.** None is cut, none is disabled, none
opens a desktop page. Common rules, stated once so the nine subsections below stay short:

- **Patterns are reused, never re-invented.** Lists use the **project-card geometry** (D-4); hubs use the
  **76px tile grid** (§3.3); pickers and simple rows use the **58px row**. §2's touch targets and
  **mono-for-every-number** rule apply unchanged.
- **App bar** on every screen: back chevron (never a hamburger — §3.1), the section name, and a mono
  sub-line `PRJ-### · {client}`. The tab bar stays (§3.2), Projects active.
- **Offline (§5.4).** These are **read-only** surfaces in v1 — none is in D-6's offline-write set. Each
  renders the app-wide offline strip plus **its own empty state**; none spins indefinitely, and none shows
  stale data without the strip. Where a screen offers a write, that write is **disabled offline with a
  plain message**, exactly as delivery check-in is (D-6) — it does **not** silently queue.
- **Every figure below is bound to a named service function, or CUT.** Nothing is derived to fill a gap;
  the D-19 precedent applies throughout.

#### 4.11.1 M-11 · Overview — `/m/p/[projectId]/overview`

**It is not a duplicate of M-3.** M-3's header already carries status, days-left and punch, and the "Up
next" card. M-11 deliberately carries **none of those again** and holds what M-3 has nowhere to put:

- **Dates row** — `start_date`, `target_end_date`, `actual_end_date` (`projects`, `20260704211000_module5_5a_projects.sql:104-106`), via `getProject(id)` (`projects.ts:57`). Mono. Em-dash where null.
- **Schedule stepper** — phases rolled up from tasks: `rollupPhases(getPhases(id), getTasks(id))` (`tasks-shared.ts:52`, `tasks.ts:31`/`:17`). Renders each phase's `status`; the current phase is the first `in_progress`/`blocked`, else the first incomplete (the desktop rule at `projects/[id]/page.tsx:150-154`). **`PhaseRollup.percent` is NOT rendered** — D-19 cut progress percentages from mobile, and that applies here too.
- **Details** — `project_type` via `PROJECT_TYPE_LABELS` (`projects.ts:29`), and the source estimate's `estimate_number` when `source_estimate_id` is set.
- **Scope** — `scope_summary` and `scope_sections` (`:109-110`).
- **CUT: every money KPI.** The desktop Overview's Revised Contract, Cost to Date and Projected Margin are all absent. Contract value is Owner/Admin-only under the Financial Visibility Floor, and D-9 keeps finance off mobile entirely.
- **CUT: `internal_notes`.** No mobile requirement was stated for it and it is not field-facing. Not a data gap — a scope decision, recorded so nobody "restores" it.
- **Status change is NOT offered here.** The desktop `StatusControl` is Owner/Admin/PM; putting a lifecycle transition on a phone that all six roles reach (D-11) is a permission surface this spec has not designed. Read-only.

#### 4.11.2 M-12 · Schedule — `/m/p/[projectId]/schedule`

The project's calendar, as a list — not a grid. A month grid at 402px cannot carry a legible event label.

- **Source:** `getCalendarEvents({ projectId })` (`schedule.ts:106`) — the same UNION that feeds M-3's "Up next" (D-24), so the two can never disagree.
- **Grouped by day**, newest-first is wrong here: this is forward-looking, so **today first, then ascending**, with past days reachable by scrolling up. Day headers use M-8's mono uppercase section label.
- Each row: `title`, mono `start_date`–`end_date`, and the member name where `member_id` is set. Source is distinguishable — `task`, `general`, `inspection` — by a text label, never colour alone.
- **Inherits `schedule_entries_select_scoped`** (`20260704213000_module5_5b_tasks_scheduling.sql:406-414`): crew and subcontractors see only their **own** general entries, while tasks and inspections are project-scoped for everyone. Same caveat as §4.3, same reason, and M-12 must not work around it.
- **CUT: a Gantt or dependency view.** `getDependencies` (`tasks.ts:45`) exists, but nothing in the handoffs specced a mobile dependency visualisation and it is not derivable from the locked patterns.

#### 4.11.3 M-13 · Change Orders — `/m/p/[projectId]/changes` — **NO MONEY**

- **Source:** `getChangeOrders(projectId)` (`change-orders.ts:61`), which returns `ChangeOrderWithAuthor`.
- Rows use the project-card geometry: `co_number` mono, `title` 17px/700, a **status pill carrying text** (`CO_STATUS_LABELS`, `change-orders.ts:49`, over `draft | sent | signed | voided`), the author's `display_name`, and mono `sent_at` / `signed_at` where set.
- **`net_delta` and every dollar figure are CUT from mobile.**

> **Why this is not a stop, and the call I made inside it.** The audit flagged a possible collision with
> D-9. There isn't one: **a change order is perfectly meaningful without its value** — number, title,
> status, author and signature dates are what a foreman needs, and D-9's exclusion list is *Budget,
> Invoices, Payments, Contracts*, which does not name change orders. So the tile stays.
> The remaining question was whether to show `net_delta` to Owner/Admin only. **I cut it for all roles**,
> for two reasons: the Financial Visibility Floor gates CO dollar amounts from PM, foreman and crew, so
> showing it would require the **first role-gated figure anywhere on `/m`** — a pattern this spec has
> deliberately never introduced (D-11 puts every role on the same screens); and `change_orders.net_delta`
> is **UI-gated only, with no DB floor behind it** (TECH_DEBT #117), so a mobile leak would not be caught
> by RLS. Cutting is the D-19 precedent: where a figure cannot be shown correctly, it is not shown.
> **Reversible by ruling** — if Owner/Admin should see CO values on mobile, that is a role-gating decision
> for Josh, not a build detail.

> **INTENT RECORDED [S101, D-45] — full CO lifecycle on mobile, LATER. The screen is DEFERRED and is not
> in scope now.** Josh's direction: **Owner, Admin and PM will eventually author a change order on
> mobile end-to-end — creation through send-for-signature.**
>
> **This does NOT reverse D-26.** D-26 governs **display on the read-only list**, and it stands: M-13
> renders no `net_delta` and no derived money, for every role including Owner. The two are compatible
> because they are about different moments — reading someone's CO in a list, versus typing your own.
>
> **What M-13 must not do, which is the only reason this is recorded now.** M-13 is built in a later
> slice, and a read-only list is easy to build in a way that quietly forecloses authoring:
> - **Do not build the route as a leaf.** `/m/p/[projectId]/changes` needs room beside it for
>   `changes/new` and `changes/[coId]`; a page that owns the whole segment forces a restructure.
> - **Do not treat "no money on this screen" as "no money in this feature."** The cut is D-26's, scoped
>   to the list. A component or service shaped around "CO objects have no amounts" would have to be
>   unpicked.
> - **Do not assume the reader is the author.** `getChangeOrders()` returns `ChangeOrderWithAuthor`;
>   authoring needs the write path (`change-orders-client.ts`) and the signing service, neither of which
>   the list touches.
>
> **⚠️ AUTHORING PUTS `net_delta` ON `/m` AT THE POINT OF ENTRY — and #117 applies there.** A create form
> has an amount field; the value is on screen because the user is typing it. That is not a D-26 violation
> — but it means **the first mobile CO screen introduces the exact column the Financial Visibility Floor
> does not enforce at the database** (`change_orders_select_visible` has no role floor and no author
> scoping — **TECH_DEBT #117**). So the deferred screen inherits #117's open question — **authored-by
> scope versus assigned-project scope** — and **that question should be answered before the screen is
> built, not during it.** #117 already says the same thing about the desktop side; D-45 is the second
> consumer waiting on the same ruling.
>
> **Everything else in finance stays deferred to v2** (D-9 as narrowed by D-37): Budget, Invoices,
> Payments and Contracts are unchanged and unaffected by this.

#### 4.11.4 M-14 · Punch List — `/m/p/[projectId]/punch`

- **Source:** `getPunchLists(projectId)` (`punch.ts:48`), which already joins `assignee`, `completer` and `verifier` by `display_name`.
- Filter chips, single-select, same geometry as M-2: **Mine / Open / All**. "Mine" is `assignee_id = get_my_member_id()` and "Open" is `status IN ('open','in_progress')` — **the same two expressions D-16 uses on M-3**, so the tile badge and this screen always agree.
- Rows: `title` 17px/700, mono `location · trade` where set, a status pill with text (`PUNCH_STATUS_LABELS`, `punch.ts:24`), a priority chip where `priority` is set, and the assignee's `display_name`.
- **The D-16 divergence is inherited, not re-decided.** An item at `complete` awaiting verification appears under **All** and under neither **Open** nor any closed filter — because `isItemClosed()` (`punch.ts:36`) and D-16's "open" are not complements (§4.3). M-14 must not invent a third definition to tidy this up.
- Photo links: `reference_photo_file_id` / `completion_photo_file_id` open M-9 (D-15, read-only join).

#### 4.11.5 M-15 · Deliveries — `/m/p/[projectId]/deliveries`

- **Sources:** `getProjectDeliveries(projectId)` (`deliveries.ts:161`) and `getOrderlessDeliveries(projectId)` (`:175`) — both return `DeliveryWithItems` with `items` and `receiver.display_name`.
- Two groups under mono section labels: **Against a PO** and **No PO**. Rows carry the delivery date, receiver name, and a mono item count.
- A **damaged** delivery carries the `#c0362c` treatment and a text label — never colour alone.
- **CUT: purchase-order money.** `PurchaseOrderSummary` (`deliveries.ts:38`) carries `orderedTotal` / `usableTotal`; those are quantity rollups, not currency, and may render — but **no PO cost, price or extended value appears on mobile** (D-9).
- **Check-in is not offered here.** D-6 makes delivery check-in **online-only**, and the check-in screen is one of GAP-8's five unspecced surfaces. M-15 is a read surface until that handoff lands.

#### 4.11.6 M-16 · Files — `/m/p/[projectId]/files`

- **Source:** `getFiles({ projectId })` (`files.ts:29`), which filters `is_deleted = false` by default.
- **Photos are excluded** — `category = 'photos'` belongs to M-8. M-16 lists the document categories: `plans`, `permits`, `contracts`, `daily_logs`, `receipts`, `other`, plus `invoices` and `change_orders` where RLS returns them.
- Rows: `file_name` 17px/700, a mono category label, mono `created_at`, and a mono file size. Tapping opens the signed URL (`getSignedUrl`, `files.ts:70`).
- **RLS does the gating, not the UI.** `files_select_non_client` (`20260728000000_security_rls_96_99.sql:53-75`) already restricts `contracts`, `change_orders` and `invoices` to Owner/Admin plus the PM-invoices carve-out. M-16 renders what it is given and **must not add a second role check** — a UI filter that disagrees with RLS is how a "missing file" bug that is really a permission becomes unexplainable.
- **CUT: upload.** Camera capture is §6's job and files to `photos`. General document upload from a phone was never specced.

#### 4.11.7 M-17 · Contacts — `/m/p/[projectId]/contacts`

- **Source:** `getProjectContacts(projectId)` (`project-contacts.ts:19`), joined to the Module 2 contact.
- 58px rows: `first_name last_name` (or `company_name`), a mono `contact_type` label, and the role on this project from the junction row.
- **`phone` and `email` are tap-to-act** — `tel:` and `mailto:`. This is the screen's whole reason to exist on a phone; a list that only displays a number wastes the device.
- Contacts and Subs & Vendors stay distinct (D-9 keeps both in the hamburger at company scope); M-17 is the **project-scoped** view and does not duplicate them.

#### 4.11.8 M-18 · Team — `/m/p/[projectId]/team`

- **Source:** `getProjectAssignments(projectId)` (`project-assignments.ts:16`), which joins `member.display_name`, `member_type` and `schedule_color`.
- 58px rows: initials avatar tinted with `schedule_color` (falling back to §2's amber when null), `display_name`, and a mono `member_type` label — `crew` or `subcontractor`.
- **CUT: pay rates, cost rates, burden.** `instrument_rates` is DB-enforced Owner/Admin (`20260806000000_financial_rls_floor.sql` §1). Not a UI decision — the rows are not readable.
- **CUT: assign/unassign.** Managing assignments is not a field task and no handoff specced it.

#### 4.11.9 M-19 · Safety — `/m/p/[projectId]/safety`

- **Source:** `getIncidentsForProject(projectId)` (`safety.ts:74`), returning `IncidentListItem` with `project.name` and `reporter.display_name`.
- Rows: `incident_type` label, mono incident date, reporter name, and a status pill carrying text (`IncidentStatus`).
- Injuries are indicated by presence, not detail — the count from `IncidentDetail.injuries` on the detail read (`safety.ts:87`); **no injured-person names on a list screen** that every role reaches.
- **Reporting an incident is NOT specced here.** It is one of GAP-8's five capture screens. M-19 is read-only until that handoff lands, and the tile must not imply otherwise.

#### 4.11.10 The three tiles that share a route — confirmed, not assumed

M-7 is project-scoped by its own context row (§4.7), so three of its four tiles resolve to project routes
that already exist. **They do not get their own screens**, and building duplicates would be wrong:

| M-7 tile | Resolves to | Why not its own route |
| -------- | ----------- | --------------------- |
| **Photos** | `/m/p/[projectId]/photos` (M-8) | Identical screen, identical binding. M-7's context row supplies the same `projectId` M-3 would. A second gallery route would drift from M-8's §4.7a display rules. |
| **Deliveries** | `/m/p/[projectId]/deliveries` (M-15) | Same. |
| **Daily logs** | `/m/logs` (M-6) with its **This project** chip pre-applied | M-6 already specs that chip (§4.6) and appears "when a project is in context" — which is exactly M-7's state. A project-scoped logs route would duplicate M-6's list for no gain. |
| Safety | `/m/p/[projectId]/safety` (M-19) | The only M-7 tile needing a new route. |

**M-3's Photos tile and M-7's Photos tile are the same screen.** Confirmed rather than assumed: both are
project-scoped, both bind to `getFiles({ projectId, category: 'photos' })`, and §4.7a governs both.

---

### 4.12 The five field-capture screens (M-20 … M-23, plus M-5 amended) — **closes GAP-8 [S99]**

Source: `docs/handoffs/mobile-field-capture/` (commit `e1d9747`). The `.dc.html` is a **design reference,
not production code** — its own README says so, and `ios-frame.jsx` / `support.js` are to be ignored.

**Ruling 1 [S99, Josh]: where the handoff contradicts a locked ruling, THE RULING WINS and the handoff
bends.** Each subsection below states the contradiction and the resolution. **Ruling 2, the single
exception:** 7b is **adopted** (D-32) — it was a gap in this spec, not a contradiction.

**Routes are PAGES, not sheets (D-28).** All four are deep-linkable and browser-back-able. The ✕ chrome in
the handoff is styling.

#### 4.12.1 7a · Clock in / out → **M-5, amended** (`/m/timeclock`)

**⛔ CONTRADICTION — the deepest one. The handoff's 7a has NO segment type selection at all.**
Its flow is: status block → week line → "Clock in to" project cards → Clock in. Type is implicitly `work`,
corrected afterwards via 7b. **That is D-25's default-then-switch model, which D-27 superseded.**

**Resolution — 7a bends to §4.5a's numbered interaction:**

1. A **required type row** is added above the project row. Six options, **none pre-selected** (A-7b, A-7b2).
2. The project row becomes **conditional**: present and required for `work`/`material_run`/`warranty`;
   **absent — not disabled** — for `travel`/`shop`/`break` (A-7c, A-7c2).
3. "Clock in" stays disabled until type and any required project are set.
4. The handoff's "the crew's first tap of the day" framing goes with it. §4.5a already withdrew the
   one-tap claim.

**Also bends:** the handoff's amber **"Switch task or project"** control on the on-the-clock state now
navigates to **M-20** rather than acting in place (A-7j2).

**⛔ CONTRADICTION — project pre-selection. RULED [S99, D-33]: NO PRE-SELECTION, SORT BY PROXIMITY.**

_Superseded, quoted:_ _"**NOT resolved — carried to §11 as an open question:** 7a **pre-selects** the
scheduled/nearest project with an amber border and a green "Here" GPS chip. D-27's "no default" is scoped
to the **type**; A-7b says no *type* is pre-selected. **Nothing locked forbids a pre-selected project.** It
is contrary to D-27's spirit … but not to its letter, so it is not resolved by ruling here."_

**Josh ruled the spirit governs. D-27 now extends from type to project:** the app does not guess and let
the user correct.

- **Nothing is selected when M-5 opens.** No amber border, no implicit choice. "Clock in" stays disabled
  until the crew member **taps** a project (for the three types that require one).
- **The list sorts nearest-first**, so the likely-right project is the top row. Proximity changes
  **order**, never **selection** — this is the whole distinction, and a build that "helpfully" selects
  row 0 after sorting has reimplemented the thing the ruling removed.
- **The "Here" chip survives with a changed job: it is a STATUS INDICATOR on the nearest card, not a
  selection.** It reports "you appear to be at this one". It carries no selected styling, and tapping the
  card is still required.

**Why the tap is required, recorded so it is not optimised away later:** a wrong-project clock-in writes
`time_segments.project_id`, which flows into **job costing**. A mis-attributed shift is not a UI
annoyance — it is money on the wrong job, discovered at review if at all. That cost is why a tap is
cheaper than a correction.

**Consequence for the sort:** ordering by proximity needs a position, and D-34 makes a fix best-effort. The
list must therefore have a **defined order when no fix exists** — proximity is an enhancement to ordering,
never a precondition for rendering the list.

> **RULED [S101, D-44] — the fallback order is RECENTLY-USED.** _Superseded sentence, quoted rather than
> rewritten:_ _"Which fallback order (scheduled-first, recently-used, alphabetical) is **not ruled**; see
> §11."_ With no fix, the projects this member clocked into most recently sort to the top, most-recent
> first. It is the right answer for the reason D-33 exists: on a repeat visit it puts the likely project
> where proximity would have, without guessing, and it degrades to something meaningful on day one
> (an empty history sorts to a stable secondary order rather than to nothing).
>
> **⚠️ THERE IS NO SOURCE FUNCTION FOR THIS TODAY. Said plainly rather than bound to something
> approximate.** Verified S101 against `lib/services/time-tracking.ts`: the exported surface is
> `getOpenSession`, `getSession`, `getSessions`, `getSessionsWithMember`, `getSessionsForReview`,
> `getSessionDetail`, `getSessionSegments`, `getPendingApprovals`, `getProjectWorkedHours`,
> `getWeeklyHours`. **None returns "the projects I most recently worked, most recent first."**
>
> **The data exists; the function does not.** `time_segments` carries `project_id`, `session_id` and
> `segment_start` (verified), and `time_segments_select_visible` already scopes reads via
> `can_view_time_session()`. So the shape is a distinct `project_id` over the caller's own segments
> ordered by `max(segment_start)` descending — one new named function, not a schema change and not a
> migration. **§4.13's binding rule applies: it is bound to that function or it is cut.** Building 7a
> against a raw query in the page, or approximating with `getSessions()` and reducing client-side, both
> violate the rule — the first breaks the service-layer convention, the second silently caps the history
> at whatever page size `getSessions()` returns.
>
> **Secondary order, so "recently-used" is total rather than partial:** projects with no history for this
> member sort after those with history, **alphabetically by name**. Without this clause a first-day crew
> member gets an undefined order, which is exactly what A-7l2 was written to prevent.

#### 4.12.1a GPS at clock events (D-34 [S99, Josh])

M6M had **no** GPS ruling before this; D-34 reverses nothing and binds the build. The handoff's line —
_"GPS is captured at clock events for verification and displayed as status — never a blocker"_ — is
adopted and made precise.

**Three rules:**

1. **No opt-out.** There is **no setting, toggle or skip control** to disable location. The app requests
   GPS at **every** clock in and clock out. (The OS-level permission prompt is not an app opt-out — it is
   outside the app's control and is exactly what rule 3 exists to record.)
2. **Never blocking.** `time_clock_sessions.gps_in`/`gps_out` are nullable and **stay nullable**. A crew
   member inside a steel building, in a basement or underground **starts their shift**. No spinner that
   must resolve, no confirmation dialog, no degraded button.
3. **The reason for an absent fix is recorded** — see below.

##### Why a fix is absent, recorded in the existing jsonb — no new column

**The problem being solved:** today a denied permission and a genuine signal failure both produce the same
thing — nothing — and are **indistinguishable in the data**. One is a policy question about a crew member;
the other is a jobsite condition. They should not look alike.

**Shape.** `gps_in`/`gps_out` already hold `GpsFix` (`time-tracking-client.ts:23-28`):
`{ lat, lng, accuracy?, captured_at? }`. On failure the same column takes a **failure object** instead:

```
{ "reason": "permission_denied", "error_code": 1, "captured_at": "…" }
```

**No column is added.** A row therefore has three distinguishable states, which is the point:

| `gps_in` | Meaning |
| -------- | ------- |
| `{ lat, lng, … }` | A fix was acquired |
| `{ reason, error_code, … }` | **We asked and failed, and this is why** |
| `NULL` | **Nothing was recorded at all** — a legacy row, or a write path predating D-34. Not "no signal". |

**The vocabulary is the browser's, not invented.** Source: the `GeolocationPositionError` codes passed to
`navigator.geolocation.getCurrentPosition`'s error callback. Mapping, stated so it is auditable:

| Browser constant | `error_code` | `reason` |
| ---------------- | ------------ | -------- |
| `PERMISSION_DENIED` | `1` | `permission_denied` |
| `POSITION_UNAVAILABLE` | `2` | `position_unavailable` |
| `TIMEOUT` | `3` | `timeout` |

`error_code` is stored **alongside** `reason` deliberately: the numeric code is the API's stable contract,
the string is what a human reads in a query. Storing only the string would make a future vocabulary change
silently lossy. A fourth state — the API absent entirely (no `navigator.geolocation`) — has **no browser
code**; `reason: "unsupported"` with `error_code: null` is the natural extension, and it is flagged rather
than ruled (§11).

> **⚠️ A LIVE DESKTOP CONSUMER BREAKS ON THIS, and it is in scope to say so.**
> `apps/web/app/dashboard/timeclock/timesheets/live-board.tsx:129` renders
> `{row.gps_in != null ? ' · on site' : ''}`. It treats **any non-null** `gps_in` as "on site". Once a
> failure writes a jsonb object rather than NULL, **a crew member whose GPS was denied would display as
> "· on site"** — the exact opposite of the truth, on the board a supervisor watches.
> **The check must become "has coordinates", not "is not null"** — e.g. `row.gps_in?.lat != null`.
> This is a required change of D-34, not an optional cleanup. It is one line, it is on desktop, and A-28
> does not shield it because A-28 protects `apps/web/app/dashboard/**` from *this spec's* changes — this
> is a defect D-34 would introduce, so D-34 owns it.

##### Read access and retention (D-40 [S101, Josh]) — **ruled, and NOT enforced today**

**The ruling: `gps_in`/`gps_out` are Owner/Admin read-only, and location is retained 30 days.** This
closes the item D-34 opened — that a denied permission is now a durable fact about a person rather than
an absence, with nobody having said who may read it or for how long.

**Neither half exists today, and neither is a UI change.** What is actually live, verified S101:

- **There is no column-level floor, and RLS is row-level** — if a caller can read the
  `time_clock_sessions` row, they read `gps_in` and `gps_out` with it. Postgres RLS has no column
  granularity; nothing about "Owner/Admin only for two columns" can be expressed in a policy on that
  table.
- **Row visibility is NOT company-wide, and this correction matters** — `time_clock_sessions_select_scoped`
  is `company_id = get_my_company_id() AND (member_id = get_my_member_id() OR time_role_rank(get_my_role()) > time_member_rank(member_id))`.
  That is a **rank ladder**, not an open door: `time_role_rank()` is `owner 5, admin 4, project_manager 3,
  foreman 2, crew_member 1, subcontractor 1`. So a **foreman already reads a crew member's coordinates**,
  and a PM reads a foreman's. The gap D-40 closes is real but narrower than "everyone can see it".
- **There is no retention mechanism of any kind** — no TTL, no scheduled job, no `pg_cron` entry, no
  nulling trigger. Location written today is kept indefinitely.

**What enforcing it costs — stated so the size is known before anyone starts. A MIGRATION IS REQUIRED
AND IS NOT WRITTEN HERE.**

| Half | Cheapest honest shape | Cost |
| ---- | --------------------- | ---- |
| **Owner/Admin read** | The same **1:1 side-table split** that closed contract value and budgeted amount under the Financial Visibility Floor: move `gps_in`/`gps_out` to a `time_clock_session_locations` table with an Owner/Admin-only SELECT policy. | A migration, a backfill, a drop of the two parent columns, **and every existing reader repointed** — including `live-board.tsx:129`, which the D-34 note above already owes a fix. A column-level `GRANT` is **not** an alternative: PostgREST selects `*` in places, and a revoked column turns a working query into a hard error rather than a hidden field. |
| **30-day retention** | A scheduled job nulling `gps_in`/`gps_out` where `clock_in < now() - interval '30 days'`. | `pg_cron` is not currently used anywhere in this repo — verified. So this is **a new operational dependency**, not just a statement. The alternative, an Edge Function on a schedule, is the same decision in a different place. Whichever is chosen, **the deletion is irreversible and silent**, so it wants a dry-run count before it is armed. |

**Neither is M6M's to build.** M6M reads location at clock events (D-34); it does not own the storage
model for it. Filed as owed work, with the shape above so it is not re-derived.

##### Crew are NOT told in-app (D-41 [S101, Josh])

**No banner, no first-run explainer, no line on M-5.** The screens capture location and say nothing
about it.

**Josh's reasoning, recorded as his and not as this spec's conclusion:** the capture is a condition of
employment rather than a consent the app negotiates, and a notice on the one screen a crew member must
touch every shift is friction on a required action for a fact that never changes. D-34 already removed
the opt-out, which is what makes notice a separate question from consent rather than part of it.

> **⚠️ LOGGED, NOT ADVISED: this may carry an employment-law dimension that is outside this spec's
> competence and outside its scope.** Notice requirements for employee location tracking vary by
> jurisdiction and several impose them regardless of employment status; some attach to the *employer*
> rather than the software. **Nothing here is legal advice and no part of this document has assessed
> that question.** The ruling is recorded because it is Josh's to make and the build needs an answer;
> the flag is recorded because a future reader should not mistake "ruled" for "cleared". If it is ever
> reversed, **M-30 (§4.13.7) is the specced home for a persistent notice** — that is already written
> down, so a reversal costs a paragraph rather than a new screen.

**A-7n asserts the absence**, in the shape of A-10d and A-40: a build that helpfully adds a reassuring
line has un-ruled D-41.

#### 4.12.1b The OT week line is CUT (D-35 [S99, Josh])

The handoff's 7a carries _"This week 32.5 h · **7.5 to OT**"_ so overtime is visible before it is earned.
**Ruled: cut. 7a shows no derived overtime figure.**

**Same shape as D-19's progress cut** — but for a different reason, and the difference is worth stating.
D-19 cut the progress bar because **the figure had no source in the schema**. Here the data *does* exist:
`companies.ot_threshold_hours` and `companies.week_starts_on` are both live columns and the figure is
genuinely derivable. **It is deliberately not surfaced.**

**Why, and this is the load-bearing part:** `week_starts_on` is **re-bucketing**, per TECH_DEBT #92 —
week windows and derived OT are computed at read time from the *current* setting, so changing it
re-groups **all historical sessions** into new weeks and re-derives OT for past periods. Josh accepted
that in S86 as a one-time consequence of a rarely-changed setting, on a **desktop, Owner/Admin** surface
with a caption explaining it. **Putting the derived figure on a crew phone changes who is exposed to it:**
a crew member would watch "7.5 to OT" shift without explanation, on a screen with no room for the caption
and no authority to ask about it. The figure is not wrong — it is unstable in a way that only makes sense
to someone who can see the setting.

**What 7a keeps:** the hero counter and the current segment. Hours worked *this shift* are a fact of the
session, not a derivation over a re-bucketable window.

**Reversible by ruling.** If crew should see OT, that is a decision about exposure and about #92's caption,
not a build detail.

#### 4.12.2 7b · Mid-shift segment switcher → **M-20** (`/m/timeclock/switch`) — **ADOPTED (D-32)**

**This is the exception. Adopted, not bent** — §4.5a recorded it as owed and pre-committed three
constraints. The handoff satisfies one and misses two.

| §4.5a constraint | Handoff | Required |
| ---------------- | ------- | -------- |
| **Close-and-open, never edit in place** | ✅ _"starting one closes the previous at the same timestamp"_ | Unchanged. A-7j2. |
| **The per-type table** | ❌ **2×2 grid = four types** (`work`, `break`, `travel`, `shop`) | **Six types.** `material_run` and `warranty` are missing, so a crew member could clock into either and never switch back. A-7j3. |
| **The note rule** | ❌ **No note field**; footer is just "Start segment" | **A note on the segment being closed**, except `break`. `time_segments_note_on_end_check` is DB-enforced — without it the switch throws. A-7j4. |

**The handoff's project-visibility rule also bends.** It says _"Break / Travel / Shop take no project"_,
which implies work-vs-not-work. **The constraint partitions three-and-three** — `material_run` and
`warranty` require a project exactly as `work` does. §4.5a flagged this trap verbatim: _"a build that
treats 'not work' as 'no project' gets a constraint violation on both."_

**Adopted as drawn:** the day timeline bar (derived from `time_segments`; no new data), the
"Ends '<task>' at HH:MM" header, and the "Mark '<task>' complete" row — which is the only surface that may
write `completion`, and only on a `work` segment carrying a `task_id`.

#### 4.12.3 7c · Daily log entry → **M-21** (`/m/logs/new`)

**This route is what closes GAP-8's core defect** — §4.6's M-6 carries a primary "Log the day" button that
resolved to nothing.

**Adopted as drawn:** Work performed as the required field; crew hours read-only from 6A; sub hours manual;
photo grid; the three disclosure rows; the Draft pill; more than one log per project per day (verified —
`daily_logs` has **no** unique constraint).

**⛔ CONTRADICTION — the hazard escalation.** The handoff offers "File an incident report" on submit,
pre-filled. **Resolution [D-29]: CONTEXT ONLY.** The offer opens a **blank** 7e pre-filled with project and
date. **No draft row is written; nothing persists unless the user submits 7e.** A hazard flag is not an
incident. `daily_logs.hazards_present` + `hazard_notes` back the flag itself, and
`daily_logs_hazard_notes_check` already enforces that notes accompany it.

**⛔ CONTRADICTION — the camera.** 7c embeds its own camera tile. **Resolution:** it stays as an
affordance but routes through §6's capture path (D-8). No second camera implementation. §6's
"ask which project after the shot" does not apply — the log already has a project.

#### 4.12.4 7d · Delivery check-in → **M-22** (`/m/p/[projectId]/deliveries/check-in`)

**⛔ CONTRADICTION — the handoff queues this screen; D-6 makes it ONLINE-ONLY.** The global rules say
_"Every capture screen keeps a local draft… at minimum, queue and surface it."_ **Delivery check-in is the
one capture action D-6 deliberately excludes** (restated at §4.11.5 and A-35c).

**Resolution: 7d is exempt from autosave and from the queue.** Offline it fails closed with an offline
state — **not** a Draft pill, which would promise durability the ruling denies. 7a, 7c and photo capture
keep the queue.

**Also bends:** M-15 still offers **no** check-in control (A-35c). M-22 is reached from the delivery record,
not from the list.

**Adopted as drawn:** per-PO-line cards, the Received/Damaged steppers, `usable = received − damaged`
(derived — there is no stored usable column), the error treatment on damage, orderless check-in, and the
"notifies Owner, Admin, PM" consequence line.

**Schema note:** orderless check-in is real — `deliveries.purchase_order_id` is nullable — but
`deliveries.project_id` is **NOT NULL**, so a no-PO check-in still has to capture a project. The handoff's
header shows PO/vendor/truck and no project. See D-30.

#### 4.12.5 7e · Incident report → **M-23** (`/m/p/[projectId]/safety/new`)

**No contradictions.** The best-grounded screen in the handoff.

**Adopted as drawn**, and verified against the live schema: three incident types match
`safety_incidents_incident_type_check` **exactly** (`injury`, `property_damage`, `near_miss`); "Who was
hurt" and Witnesses map to `safety_incident_injuries` and `safety_incident_witnesses`, both of which carry
`member_id` **and** a name column, which is precisely the member-or-typed-outsider model the handoff
describes; Treatment given maps to `treatment_sought`/`treatment_notes`; the PDF maps to `pdf_file_id`.

**Reached two ways:** from M-19, and from 7c's hazard escalation pre-filled with project and date (D-29) —
**with nothing written until the user submits.**

**Also bends:** M-19 continues to offer no reporting control of its own beyond navigating here.

---

### 4.13 The six hamburger destinations (M-25 … M-30) [S100]

**Every tile in §3.3's sheet now has a screen and a route.** Until this pass all of them had a label and
nothing else — no route in §1, no section here, no criterion in §10. That is the same hole §4.11.1's
predecessor had for M-3's tiles, and it is closed the same way.

> **SIX, NOT SEVEN — M-24 · Dashboard is CUT [S100, D-38].** This pass specced it, found it had no
> distinct job, and Josh ruled it out of v1. The full reasoning is in **D-38**; the short form is that
> **every non-money figure it carried is already owned by a screen that owns it better** —
> `activeProjectCount` by M-2's app bar (A-10c), `openPunchCount` by D-16's counter, `pastTargetCount`
> by A-10e's signed days-left, `awaitingCount` by M-13 — that **the attention feed, the one thing not
> duplicated, is office admin** with `/dashboard/**` hrefs, and that **`getDashboardData()` reaches for
> `change_orders.net_delta` twice** (`dashboard.ts:64`, `:73`), pulling the exact column D-26 cut into
> the mobile data path where #117 means RLS would not catch a slip.
>
> **It is a v1 cut, not a permanent one** — the same shape as D-19's progress percentage and D-14's
> unseen dot. If a mobile dashboard ever earns a job, it will be because something exists for it to show
> that no other screen owns; nothing does today.
>
> **`M-24` is retired and NOT reused.** The numbering below runs M-25 … M-30 with a gap, so an older
> document citing "M-24" leads a reader to this cut rather than to a different screen. **There is no
> `/m/dashboard` route**, and A-43 fails on one.
>
> **The subsection numbers keep the same gap, on purpose: §4.13 starts at 4.13.2.** Renumbering to close
> it would silently repoint every existing cross-reference — §3.3's tile table, D-37, and eleven
> criteria all cite `§4.13.3` for Expenses — at no benefit. A gap that matches the screen numbering is
> the smaller surprise.

Common rules, stated once so the six subsections stay short. They are §4.11's rules, with **one that
cannot carry over and one that is new**:

- **Patterns are reused, never re-invented.** Lists use the **project-card geometry** (D-4); pickers and
  simple rows use the **58px row**. §2's touch targets and **mono-for-every-number** rule apply
  unchanged — every count, date, amount, ID, phone number and expiry renders in IBM Plex Mono.
- **App bar: the HAMBURGER, not a back chevron — RULED [S100, D-39], not a flagged deviation.** This is
  the one §4.11 rule that does not carry over, and the reason is structural rather than aesthetic. §3.1
  replaces the hamburger with a back chevron **inside a project** (`/m/p/**`); these six are
  company-scoped, so that clause never fires. More decisively: **A-3c cannot be satisfied without the
  hamburger here.** A-3c asserts that the tile matching the current location carries the blue border —
  which can only ever be *observed* by opening the sheet while standing on one of these six routes. A
  back chevron would make the sheet unopenable on exactly the screens A-3c is about, and the criterion
  would be unassertable for a second time, immediately after §4.13 rescued it. **The hamburger stays,
  and D-39 exists so a later reader does not "correct" this back to §4.11's chevron for consistency.**
- **No tab is active.** The tab bar renders and stays locked (§3.2, A-1), but none of these six is
  owned by Projects, Timeclock, Logs or Field, so **no tab carries the active state** — the same rule
  `/m/offline` already follows. A-42 asserts this. Lighting an unrelated tab to avoid an "empty" bar
  would misstate where the user is.
- **Offline (§5.4).** All six are **read-only** surfaces in v1 — none is in D-6's offline-write set.
  Each renders the app-wide offline strip **plus its own empty state**; none spins indefinitely and none
  shows stale data without the strip. The empty state is per-screen and says what is missing, never a
  generic spinner.
- **Every figure below is bound to a named service function, or CUT.** Nothing is derived to fill a gap;
  the D-19 precedent applies throughout. Where a screen wants a figure no existing function returns,
  this section says so and cuts it rather than inventing a derivation or a new query.
- **RLS does the gating, not the UI**, except where this section says otherwise **and says that the
  exception is UI-only**. A UI filter that disagrees with RLS is how a permission becomes an
  unexplainable "missing record" bug (§4.11.6's rule, applied company-wide).

---

#### 4.13.2 M-25 · Schedule — `/m/schedule`

The company calendar as a list, not a grid — same reasoning as M-12 (§4.11.2): a month grid at 402px
cannot carry a legible event label.

- **Source:** `getCalendarEvents({})` (`schedule.ts:106`) with **no `projectId`** — the company-wide form
  of the same UNION that feeds M-12 and M-3's "Up next" (D-24), so the three can never disagree.
- **`ownMemberId` is NOT passed.** The desktop dashboard passes it for crew (`dashboard/page.tsx:45`) to
  narrow tasks and general entries to self. Mobile does not, because **RLS already does the narrowing it
  can legitimately do** and the two mechanisms are not the same: `schedule_entries_select_scoped` limits
  crew and subcontractors to their **own general entries** at the database, while **tasks are
  project-scoped for everyone**. Passing `ownMemberId` would additionally hide a teammate's task that
  RLS grants — a UI filter disagreeing with RLS, which this section forbids. A crew member therefore
  sees their own general entries plus the tasks and inspections on their projects.
- **Grouped by day, today first, then ascending** — forward-looking, with past days reachable by
  scrolling up. Day headers use M-8's mono uppercase section label. Same rule as M-12.
- Each row: `title`, mono `start_date`–`end_date`, `project_label` where set, and `member_name` where
  set. Source (`task` / `general` / `inspection`) is distinguishable by a **text label, never colour
  alone** — `color` may tint, it may not carry the meaning.
- **Empty state:** "Nothing scheduled." Not a spinner, and not omitted.
- **CUT: create/edit/assign.** No handoff specced scheduling from a phone, and `schedule-client.ts`'s
  writes are desktop flows.
- **CUT: a month or week grid.** See above; and D-4 makes the card/row the one list pattern.

---

#### 4.13.3 M-26 · Expenses — `/m/expenses` — **THE FIRST CURRENCY ON `/m` (D-37)**

- **Source:** `getExpenses()` (`expenses.ts:39`) with no filter → `ExpenseListItem[]`, which already
  joins `author.display_name`.
- Rows use the project-card geometry: `supplier` 17px/700, mono `expense_date`, mono **`amount`**, a
  status pill carrying **text** over `pending | approved | rejected`, a `cost_category` label, and the
  author's `display_name`.
- Filter chips, single-select, M-2 geometry: **Mine / Pending / All**. "Pending" is
  `getExpenses({ status: 'pending' })` — the same predicate `getPendingExpenses()` (`:92`) uses, so the
  chip and any future badge cannot diverge. "Mine" is `author_member_id = get_my_member_id()`.
- **Receipts** open via `getExpenseReceipts(expenseId)` (`:97`) into M-9, the existing viewer. No second
  image surface is built.
- **Empty state:** "No expenses." Per-chip, so "No pending expenses" when that chip is selected.

##### What this forces, and what it does NOT — the D-26 comparison, in full

D-26 cut CO values partly because a role-gated figure would be **the first anywhere on `/m`**. Expenses
puts currency on `/m`, so that reasoning has to be re-examined rather than assumed to carry. It does
not carry, and the difference is specific:

| | `change_orders.net_delta` (D-26) | `expenses.amount` (D-37) |
| - | ------------------------------- | ------------------------ |
| **What the Floor says about the figure** | CO dollar amounts are **gated** from PM, foreman and crew (CLAUDE.md, Financial Visibility Floor). | An expense is **actual cost**. The Floor's "visible to all roles" line names actual and committed cost explicitly, and calls that deliberate rather than an oversight. |
| **What the DB enforces** | `change_orders_select_visible` = `company_id AND can_view_project(project_id)`. **No role floor, no author scoping.** UI-gated only — **TECH_DEBT #117**. | `expenses_select_scoped` = `company_id AND (author_member_id = get_my_member_id() OR (get_my_role() IN ('owner','admin','project_manager','foreman') AND can_view_project(project_id)))`. **A real row floor.** |
| **Consequence for mobile** | Showing it to Owner/Admin only would be a **UI-only** role gate with nothing behind it. | Showing `amount` on every row RLS returns is **not** a role gate at all — the database already decided which rows each role may see, and every returned row's amount is that caller's to read. |

**So M-26 introduces currency but not a role-gated figure**, and D-11's "every role sees the same
screens" survives intact: the screen is identical for all roles; the **row set** differs, and it differs
at the database. Concretely, from the policy above:

- **crew_member and subcontractor** — see **only expenses they authored**. Not a teammate's, not their
  project's. (Neither role appears in the policy's role array.)
- **foreman and project_manager** — own expenses, plus all expenses on projects they are assigned to.
- **owner and admin** — everything in the company (`can_view_project` is unconditional for them).

**Three things this genuinely forces, listed so they are not discovered mid-build:**

1. **A currency formatter on `/m`, which does not exist yet.** Every existing mobile figure is a count, a
   date or a duration. §2 says mono for every number, so `amount` is mono; it does not say what currency
   looks like. **Unspecified and flagged** — symbol, thousands separator and negative treatment need one
   answer used everywhere, before a second money screen exists to disagree with.
2. **An asymmetry inside the caller's own data.** `expense_allocations_select_scoped` restricts to
   `owner | admin | project_manager | foreman`. A **crew member can read their own expense row but not
   its budget-line allocations** — their own receipt, split across lines they cannot see. Allocations are
   CUT from M-26 (below), so v1 does not expose the asymmetry; it is recorded because the first build to
   add an allocation detail view will hit it.
3. **`is_retainage` and `state` are role-shaped on write, not on read.** `expenses_insert_authorized`
   restricts `is_retainage = true` to Owner/Admin and `state = 'committed'` to Owner/Admin/PM. M-26 is
   read-only, so nothing here trips them — but a future mobile capture screen must not assume the
   insert path is uniform across roles.

##### The role question — RULED [S101, D-43], and the live RLS does not match

> _Superseded paragraph, quoted rather than rewritten:_ _"**THE ROLE QUESTION IS NOT DECIDED HERE.** What
> is established above is what the **database already permits**. Whether mobile should show less than RLS
> returns … is a product ruling, deliberately left to Josh, and is carried into §11's open list. The
> default this section specs is **show what RLS returns** …"_

**The ruling (Josh, S101): everyone enters and views expenses. Everyone edits their own. Only Owner and
Admin edit anything.**

**A-45d STANDS, unchanged.** It asserts that mobile applies **no UI role check** on `amount` and renders
exactly the row set `getExpenses()` returns. The ruling reinforces that rather than overturning it — it
widens intent *outward*, and A-45d is the criterion that stops a build narrowing it in the UI.

**But the ruling and the live policies disagree in three places, and none of them is a mobile fix.**
Verified S101 against rebuild-test:

| Ruling clause | Live policy | Verdict |
| ------------- | ----------- | ------- |
| "everyone **views**" | `expenses_select_scoped` = `company_id AND (author_member_id = get_my_member_id() OR (get_my_role() IN ('owner','admin','project_manager','foreman') AND can_view_project(project_id)))` | **⚠️ GAP — the material one.** `crew_member` and `subcontractor` are **absent from the role array**, so they see **only rows they authored**. Not a teammate's, not their own project's. A crew member on a job cannot see the material receipt the foreman filed for that job. **Closing this is a migration widening the role array**, not a UI change — and it is the *opposite* direction from a role gate, so nothing in the Financial Visibility Floor blocks it: an expense is actual cost, which the Floor makes visible to all roles by design. |
| "everyone **enters**" | `expenses_insert_authorized` — needs `can_view_project(project_id)`, `author_member_id = mine` (or Owner/Admin), `status='pending'`, and all approval columns NULL | **Holds for the plain case.** But **five columns are role-shaped on insert**: `state='committed'` and `cost_category='subcontractor'` and `sub_contract_id`/`purchase_order_id` and `awaiting_paper` are Owner/Admin/PM; `is_retainage` is Owner/Admin. So "everyone enters" is true of an ordinary actual material/other expense and false of the rest. **M-26 is read-only in v1, so nothing here bites yet** — a future mobile capture screen must not assume a uniform insert. |
| "everyone edits **their own**" | `expenses_update_authorized` = `company_id AND (Owner/Admin OR (author_member_id = mine AND status = 'pending'))` | **⚠️ GAP — narrower than the ruling.** An author may edit their own **only while `status = 'pending'`**. Once approved or rejected the author is locked out. If the ruling means "their own, always", that is a policy change; if it means "their own, until it is decided", the live policy is already right and **the ruling wants the qualifier written down**. **Ask before migrating** — this one is genuinely ambiguous in the words. |
| "only Owner/Admin edit **anything**" | same policy, first arm | **✅ MATCHES exactly.** |

**Also worth recording: there is no DELETE policy on `expenses` at all**, so DELETE is denied to every
role including Owner. Removal is a soft delete via UPDATE `is_deleted`, which inherits the update policy
above — meaning an author cannot soft-delete their own expense after approval either. Consistent with
the trash-bin pattern; noted because "only Owner/Admin edit anything" reads as covering deletion and the
mechanism is not obvious.

**None of this changes what M-26 builds.** It is a read surface bound to `getExpenses()`, rendering what
RLS returns, with no UI role check. **What the gaps change is what a crew member SEES on it** — under
today's policies, only their own expenses. If Josh wants the "everyone views" clause honoured, that is a
migration on `expenses_select_scoped`, filed as owed work rather than smuggled into a mobile screen.

##### Cut from M-26

- **CUT: approve / reject.** `approveExpense` / `rejectExpense` (`expenses-client.ts:272`, `:286`) are
  the 7A desktop review flow. Approval is a money decision with a rejection-note requirement; nothing
  specced it for a phone.
- **CUT: capture.** `createExpense` and the receipt-upload path exist, but expense capture is not in
  D-6's offline-write set and was not among GAP-8's five capture screens. M-26 is a read surface in v1.
- **CUT: allocations.** See asymmetry (2) above.
- **CUT: `getJobCostRollup()` in its entirety** (`expenses.ts:177`). It carries `labor.totalCost`,
  burdened from `time_session_rate_snapshots`, and `payables.committedRemaining` / `retainageHeld`.
  Labor rates are DB-enforced Owner/Admin (`20260806000000_financial_rls_floor.sql` §1) — the same cut
  §4.11.8 already makes for M-18 — and payables are the committed side, which is Budget-adjacent and
  therefore still excluded by D-9-as-narrowed. The function's own `labor.available` flag shows the
  house pattern for this (RLS decides, the caller reflects); M-26 simply does not call it.

---

#### 4.13.4 M-27 · Subs & Vendors — `/m/subs`

- **Source:** `getSubcontractors()` (`subcontractors.ts:10`) → `Subcontractor[]`, ordered by
  `company_name`.
- **RLS is company-wide with NO role floor** — `subcontractors_select_authenticated` is
  `company_id = <caller's> AND is_deleted = false`, and nothing else. Every role reads every row.
- 58px rows: `company_name` 17px/700, mono `trade_type`, a `sub_type` label, and a status pill carrying
  **text**.
- **`phone`, `mobile` and `email` are tap-to-act** — `tel:` and `mailto:`. This is the screen's reason to
  exist on a phone, the same argument §4.11.7 makes for M-17.
- **`insurance_expiry` renders, in mono, and an expired date carries the `#c0362c` treatment plus a text
  label** — never colour alone. This is the one genuinely field-relevant fact on the table: whether a sub
  may be on site today.
- `license_number` renders in mono on the row detail.
- Filter chips, single-select: **All / Subs / Vendors**, bound to `getSubcontractors({ sub_type })`.

> **⚠ CUT: `default_hourly_rate`, `default_markup_percent` and `ein` — AND THE CUT IS UI-ONLY.**
> `getSubcontractors()` does `select('*')`, so all three arrive in the payload for **every role**, and
> the table has no role floor to stop them. That is **the same class of exposure as TECH_DEBT #117**:
> a rate, a markup and a tax ID, gated by nothing but the UI's willingness not to render them.
> `default_markup_percent` is the sharpest of the three — markup is the company's margin on that sub,
> which the Financial Visibility Floor keeps from PM, foreman and crew everywhere else.
>
> **This is a finding, not a specced behaviour.** M-27 must not render them; that is enforced by A-45.
> But the honest statement is that **a mobile leak here would not be caught by RLS**, exactly as D-26
> said of `net_delta`. Whether `subcontractors` should gain a column-level or side-table floor is
> **out of scope for M6M and belongs in TECH_DEBT alongside #117** — recorded here so the next reader
> does not assume `select('*')` on this table is safe.

- **Empty state [S101]:** **"No subs or vendors."** Per-chip: **"No subs."** / **"No vendors."** when a
  chip narrows the list to nothing. Never a spinner, never an omitted section.
- **CUT: create / edit / rate.** `rating` and `rating_notes` are a management judgement recorded on
  desktop; `subcontractors-client.ts`'s writes are the Module 2 flow.
- **CUT: address block.** Present on the table, but a directory row does not need it and D-4's geometry
  has no room. Not a data gap — a layout decision.

---

#### 4.13.5 M-28 · Team — `/m/team`

**Two different things are called "team" in this codebase, and the screen must pick one.** They are not
interchangeable:

| | `getTeamMembers(supabase)` (`team.ts:97`) | `getMembers()` (`members.ts:14`) |
| - | ----------------------------------------- | -------------------------------- |
| Table | `profiles` — login accounts | `company_members` — the operational roster |
| Fields | `id, first_name, last_name, role, created_at` | `display_name, member_type, schedule_color` |
| Desktop use | `/dashboard/team` — invitations, roles, deactivation | assignment, scheduling, timeclock, job cost |

**M-28 binds to `getMembers()`.** Three reasons: it is the entity every other mobile screen already
names — M-18 (§4.11.8) renders the identical shape for a project's crew, so the two agree by
construction; `schedule_color` gives the same avatar tint M-18 and M-12 use; and it includes
subcontractor members, who are on site and are not `profiles` rows at all. **It is also what §3.3's
Team tile count is already bound to**, so the badge and the screen cannot disagree.

- **Source:** `getMembers()` — company-wide, ordered by `display_name`.
  `company_members_select_authenticated` is `company_id = get_my_company_id()`: every role, every row.
- 58px rows: initials avatar tinted with `schedule_color` (falling back to §2's amber when null),
  `display_name`, and a mono `member_type` label — `crew` or `subcontractor`.
- Filter chips, single-select: **All / Crew / Subs**, bound to `getMembers({ member_type })` —
  `company_members_member_type_check` permits exactly `crew | subcontractor`, so the two chips are the
  whole domain and "All" is the unfiltered call.
- **Empty state [S101]:** **"No team members."** Per-chip: **"No crew."** / **"No subs."**
- **CUT: tap-to-call, and this one is a real gap rather than a choice.** `company_members` carries **no
  phone or email column** — the contact details live on `profiles`, which `profiles_select_authenticated`
  makes readable company-wide to every role. But **no named list function selects them**:
  `getTeamMembers()` selects five columns and none is `phone`. Per the binding rule this section opens
  with, the figure is therefore **CUT rather than derived**. It would take one added column in one
  existing `select` to enable — recorded so the decision is visible, not so it is quietly done.
- **CUT: `profiles.role`.** The roster is about who is on the crew, not who may do what. Role belongs to
  the desktop team-management surface that can also change it.
- **CUT: invite, deactivate, change role, reset password.** All of `team.ts`'s writes. Inviting is
  Owner/Admin (promotion to Admin is Owner-only, CLAUDE.md), and none is field work.
- **CUT: pay and cost rates.** The §4.11.8 precedent, unchanged: `instrument_rates` is DB-enforced
  Owner/Admin, so the rows are not readable rather than not rendered.

---

#### 4.13.6 M-29 · Contacts — `/m/contacts`

- **Source:** `getContacts()` (`contacts.ts:16`) → `Contact[]`, ordered by `last_name`.
- **RLS is company-wide with no role floor** — `contacts_select_authenticated` scopes by company and
  `is_deleted` only. Every role reads every row, and there is no money on the table.
- 58px rows: `first_name last_name` — or `company_name` where the person fields are empty — a mono
  `contact_type` label, and a status pill carrying **text**.
- **`phone`, `mobile` and `email` are tap-to-act** — `tel:` and `mailto:`, the same argument as M-17 and
  M-27.
- Filter chips, single-select: **All / Leads / Clients**, bound to `getContacts({ contact_type })` →
  `lead` and `client`. **`contacts_contact_type_check` permits seven values** — `lead, client, vendor,
  architect, inspector, building_dept, other_external` — so unlike M-28's chips these **do not cover the
  domain**. That is deliberate: leads and clients are the two a field user looks up, and **"All" is the
  unfiltered call, so an architect or inspector is reachable there and is never hidden** — it simply has
  no chip of its own. A build must not "complete" the set with five more chips; a seven-chip row does not
  fit 402px and D-4's geometry has no room for it.
- The mono `contact_type` label binds to **`CONTACT_TYPE_LABELS`** (`packages/shared/constants/form-options.ts:104`),
  which covers all seven values. **Never render the raw enum** — `building_dept` and `other_external` are
  the two that give the guess away.
- **Empty state [S101]:** **"No contacts."** Per-chip: **"No leads."** / **"No clients."**
- **This is the company-scoped list; M-17 is the project-scoped one.** They are not duplicates and
  neither replaces the other — §4.11.7 already states the split, and D-9's first sentence (which D-37
  leaves untouched) keeps Contacts in the hamburger.
- **CUT: `notes` and `tags`.** Free text on a 58px row has nowhere to go, and `notes` on a lead can hold
  commercial detail that has no reason to be on every crew phone. A layout decision reinforced by a
  discretion one; not a security control, because RLS grants the row either way.
- **CUT: create / edit / convert.** Module 2 desktop flows.

---

#### 4.13.7 M-30 · Settings — `/m/settings` — **READ-ONLY**

**What the existing desktop settings surface actually is.** `app/dashboard/settings/page.tsx` gates the
whole page at `:32` — `if (!profile || !['owner','admin'].includes(profile.role)) redirect(...)` — and
renders five forms, every one of them **company-level configuration**:

| Form | What it configures |
| ---- | ------------------ |
| `SettingsForm` | Company profile — name, logo, address, contact details |
| `EstimatingSettingsForm` | Estimating defaults, pricing mode (`markup` / `margin`), rates |
| `ProposalSettingsForm` | Proposal terms, pricing-detail level, boilerplate sections |
| `TimeTrackingSettingsForm` | Timeclock rules — timezone, week start, OT threshold, GPS mode |
| `GLMappingSettingsForm` | QuickBooks GL account mapping |

Plus `settings/tags/` for tag options.

**The finding that decides this screen: there is no personal-settings surface anywhere in this
application.** Not gated, not hidden — it does not exist. Every setting in the product is company-level
and Owner/Admin-only. A user's own record (`profiles.first_name`, `last_name`, `phone`) is edited
through **team management**, by an Owner or Admin, via `updateTeamMember()` — not by the user.

**So what does a field user actually need from Settings?** Working from what the field app already does
rather than from what a settings screen usually contains:

1. **To confirm who they are signed in as.** A shared site phone, or a handset that has been in a
   pocket since the last shift, makes "am I still me?" a real question — and clocking in as the wrong
   identity puts wrong-person time into job costing, the same failure mode D-33 exists to prevent.
2. **To confirm which company.** Reassuring rather than actionable, but free.
3. **To sign out.** **Already provided** — §3.3's sheet carries the full-width Sign out row, and D-36
   just declined to add a second route to it via the avatar.
4. **Notification preferences** — the obvious fourth. **They do not exist**: D-10 puts Web Push out of
   scope and GATED.md Gate 4 has not opened. Nothing to bind.

**Ruling for v1: M-30 is READ-ONLY for every role, including Owner and Admin.** Not "read-only for
gated roles" — read-only, full stop. Two reasons. Editing GL account mappings, proposal boilerplate or
markup tables on a 402px screen is worse than not offering it, and nothing in either handoff specced a
mobile settings form. And a mobile write path into company configuration would need its own permission
design, which this spec has not done. This is a D-19-shaped cut: the data exists and is deliberately not
made editable.

**What M-30 renders — two blocks, both bound:**

- **You** — from `getMyMember()` (`members.ts:50`): `display_name`, and a mono `member_type` label. The
  signed-in **role** comes from a **second read in this page**, via a new named function — see the
  correction immediately below.

> **CORRECTED [S101] — the "no new query" claim was FALSE.** _Superseded text, quoted rather than
> rewritten:_ _"The signed-in role comes from the `profiles` read the mobile layout already performs for
> the shell; no new query."_
>
> **It does not.** `app/m/layout.tsx:42` selects **`company_id` and nothing else**, and even before D-36
> removed the avatar it selected `first_name, last_name, company_id`. **`role` was never in that query**,
> and `MobileShell`'s props are `companyName` and `teamCount` — neither carries it. The sentence
> described a convenience that never existed.
>
> **RULED: a second read in the page, not an extended layout.** The two options and why this one:
>
> | | Extend the layout + thread through `MobileShell` | **Second read in M-30 (chosen)** |
> | - | ----------------------------------------------- | -------------------------------- |
> | Files touched | `layout.tsx` (select + prop), `mobile-shell.tsx` (prop **plus a new React context** — `{children}` cannot receive props from a layout, so a provider is the only delivery mechanism), then M-30 | `app/m/settings/page.tsx` and one service file |
> | What it adds | A **new ambient API** every `/m` screen can read, and a prop the shell **fetches but never renders** — the shell becomes a courier for data one screen wants | One query on one screen |
> | Cost when wrong | Every future screen inherits a shell dependency; a change to the context signature touches the shell every screen mounts inside | Contained to M-30 |
> | Runtime cost | One query for every `/m` page load, including the five that do not want it | One query, on the rarely-visited screen that does |
>
> **The blast radius is the deciding factor.** `MobileShell` is mounted by every mobile screen; its two
> existing props are both things **the shell itself renders** (the app-bar sub-line, the Team tile
> badge). Role would be the first prop it fetches and does not use. Widening the shell's contract to
> serve one label on one screen is the kind of change that is cheap once and expensive the fourth time.
>
> **It needs a NEW NAMED FUNCTION, and that is not a licence to inline a query.** §4.13's binding rule
> and CLAUDE.md's service-layer rule both forbid a page calling Supabase directly. **No exported
> function returns the caller's role today** — verified: `getMyMember()` returns `company_members` rows,
> which carry `display_name`/`member_type` and no role, and the only `getMyProfile` in the repo is
> **private to `estimates-client.ts:377`**. So M-30's build owes one small server function (shape:
> `getMyProfile()` → the caller's `profiles` row, or the narrower `role` alone). `profiles_select_authenticated`
> is `company_id = get_my_company_id() AND is_deleted = false`, so it is readable by every role and needs
> no policy work. **Consolidating the private copy in `estimates-client.ts` into that shared function is
> in scope for whoever writes it; leaving two is not.**
>
> **Cutting the role line was considered and rejected**: it is the one field that answers "am I signed in
> as the right person" for a user whose `display_name` may be shared or ambiguous on a site phone, which
> is the whole reason §4.13.7 gives this block. A-48b is amended to assert it.
- **Your company** — from `getCompany()` (`company.ts:45`): company `name`. And from
  `getCompanyTimeSettings()` (`company.ts:130`): the mono `timezone`. The timezone earns its place —
  it is the rule M-5's clock and every mobile timestamp are rendered in, so a user seeing times they do
  not expect can see why without calling the office. `companies_select_own` makes both readable to every
  role, and the mobile layout already calls the second one.

**Cut from M-30, with reasons:**

- **CUT: all five desktop settings forms.** Owner/Admin-only company configuration; see the ruling above.
- **CUT: tag options.** `settings/tags/` is a taxonomy editor. Photo auto-tagging applies tags
  instantly (CLAUDE.md, AI rule 4); editing the vocabulary is not field work.
- **CUT: `weekStartsOn`, `ot_threshold_hours` and the paid-break rules**, though
  `getCompanyTimeSettings()` returns all of them. **D-35 cut the derived OT figure from 7a for exactly
  this reason** — a crew phone has neither the room nor the authority to explain the rule — and
  surfacing the raw threshold here would reintroduce through the back door what D-35 removed from the
  front.
- **CUT: `gpsClockMode`.** D-34 removed the opt-out entirely; displaying a mode implies one exists.
  **Note the open question this touches:** §11 already carries "is the crew told location is being
  captured?" as flagged-not-decided. **If that is ever answered "yes, with a persistent notice", M-30 is
  the natural home for it** — recorded so the answer has somewhere to land rather than prompting a new
  screen.
- **CUT: a second Sign out.** It is in the sheet (§3.3). Two routes to one destructive action is how one
  of them gets a different confirmation than the other.
- **CUT: app version / build info.** No service function returns it and nothing specced it. Not derived.

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

A single local queue (IndexedDB) of **mutations**, not screens. **Respecced [S98]** — the previous shape
could not express what §5.5 and §5.6 require of it (see the note below):

```
{
  entry_id:         uuid,      // the QUEUE ENTRY's own key. Not the row's.
  target_id:        uuid,      // the target ROW's primary key — client-generated at
                               //   capture (D-7). Several entries may share one target_id.
  op:               'insert' | 'update',
  entity:           'time_clock_session' | 'time_segment' | 'daily_log' | 'photo',
  payload:          object,    // exactly what the online path would have sent
  captured_at:      ISO string,// when the user ACTED, not when it synced
  base_updated_at:  ISO | null,// the target row's updated_at AS LOADED. null on insert.
                               //   This is the conflict basis (§5.6) — NOT captured_at.
  depends_on:       uuid|null, // entry_id that must succeed first (§5.5.1)
  seq:              integer,   // monotonic capture order; the replay order
  state:            'queued' | 'conflicted',
  attempts:         integer,
  last_error:       string | null
}
```

> **Why the old shape was insufficient [S98].** It was
> `{ id, kind: 'clock_event'|'daily_log'|'photo', payload, captured_at, attempts, last_error }`, and three
> rules elsewhere in this spec could not be stated against it:
>
> 1. **No `op`.** §5.6 and A-19f require "a queued insert is never a conflict", which is unaskable if an
>    entry cannot say whether it is an insert.
> 2. **No `time_segment` kind**, although §5.5.1 replays segments as their own ordered step. Segments had
>    to hide inside `clock_event`, which also had to mean both the session insert and the later
>    clock-out update.
> 3. **`id` was defined as the target row's primary key.** That holds only while one entry equals one
>    row. §5.5.1's shift is **three** entries against **two** rows — a session insert, segment inserts,
>    and an update to that same session — so the session's insert and its clock-out update would have
>    collided on the same `id`. `entry_id` and `target_id` are now separate, and A-16's
>    replay-three-times-yields-one-row is stated on `target_id`.

1. **`captured_at` is the business timestamp.** A clock-in queued at 6:58am and synced at 11:20am is a
   6:58am clock-in. `time_clock_sessions.clock_in` is already documented as the device timestamp — the
   client sets it, the server does not substitute receipt time. **`captured_at` is NOT the conflict
   basis** — that is `base_updated_at`, and conflating the two is the defect §5.6 records.
2. **`base_updated_at` is captured on the READ path, not the write path.** When a mobile screen loads a
   row it may later edit, it records that row's `updated_at` exactly as returned, and the queue entry
   carries it unchanged. For a `daily_log` update that is the `updated_at` of the log as it populated
   the editor. **On an `insert` it is `null`** — there was no row to have loaded.
3. **Editing the same row twice offline does not advance the base.** A second edit **coalesces into the
   existing queued entry**: the payload is replaced, `captured_at` advances, and `base_updated_at`
   **stays at the originally loaded value**. Re-basing on the phone's own unsynced write would tell the
   detector the client had seen a server state it never saw, which is the same class of error as using
   `captured_at`.
4. **Replay order is `seq`, gated by `depends_on`.** Capture order already produces §5.5.1's required
   sequence — session insert, then segments, then the clock-out update — so `seq` carries it without a
   separate scheduler. `depends_on` is the hard gate: an entry whose parent has not succeeded is **not
   attempted**, so a segment never fails against `owns_open_session` merely because its session has not
   landed yet.
5. **Auto-retry with backoff** on reconnect. `Try again` forces an immediate attempt.
6. **Never silently discard a queued item.** A permanently failing entry stays in the queue, moves to a
   `Needs attention` badge, and surfaces `last_error`.
7. **The queued-count pill counts `state: 'queued'` only.** Entries at `state: 'conflicted'` have left
   the queue (§5.6) and must not be counted — the pill means "records and files that will actually
   upload", and a conflicted entry never will.

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
   rejected by RLS and the shift syncs with no attribution. **§5.2's entry shape is what makes this
   expressible:** the shift is three entries against two rows — `op:'insert'` on the
   `time_clock_session`, `op:'insert'` on each `time_segment` with `depends_on` pointing at the session
   entry, then `op:'update'` on the same session carrying `clock_out`. Replay follows `seq`, and
   `depends_on` stops a segment being attempted before its session exists. The queue must never fold the
   later `clock_out` into the original insert.
2. **One open session per member, enforced by a partial unique index.**
   `idx_time_clock_sessions_one_open_per_member` (`:127-129`) is
   `UNIQUE (member_id) WHERE (clock_out IS NULL AND is_deleted = false)`. Upsert-on-pk makes a *replay*
   safe, but two genuinely different offline sessions left open will collide on sync. Surface that as a
   `Needs attention` queue entry (§5.2.6), never as a silent drop.
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

> **⚠️ CORRECTED [S98] — the first formulation of this rule was unsound and would have shipped the exact
> data loss D-17 forbids.** It read: _"compare the server row's `updated_at` against the queued item's
> `captured_at`; server `updated_at` ≤ queued `captured_at` → no conflict."_ Walk it:
>
> | Time | Event |
> | ---- | ----- |
> | 08:00 | Phone loads the log, goes offline. It has the 08:00 version. |
> | 08:30 | Desktop edits the log. Server `updated_at` = 08:30. |
> | 09:00 | Phone edits its stale copy. `captured_at` = 09:00. |
> | later | Sync. `08:30 ≤ 09:00` → **"no conflict"** → §5.3 upserts the phone's copy **over the desktop edit.** |
>
> The desktop edit is destroyed silently. And this is not an edge case — it fires **whenever the field
> user is offline longer than the office user takes to edit**, which is the ordinary case this feature
> exists for. The error is that **`captured_at` records when the phone WROTE, not what the phone had
> READ.** Comparing a server timestamp to it answers a question nobody asked.

**The rule.** Conflict detection tests **the version the client loaded**, never when it wrote. Before
replaying any entry with `op: 'update'`, compare the target row's **current** server `updated_at` against
the entry's **`base_updated_at`** (§5.2 — the `updated_at` the row carried when the client read it):

- **Current server `updated_at` IS NOT DISTINCT FROM `base_updated_at`** → the row is untouched since the
  client read it. **No conflict.** Replay normally.
- **Current server `updated_at` IS DISTINCT FROM `base_updated_at`** → somebody changed the row after the
  client loaded it. **Conflict. The server version stands.**
  - The queued copy **is not written.** The other edit remains live and untouched.
  - The queued copy **is not discarded.** This is the whole point of the ruling — offline work is never
    destroyed to protect a server row.
  - The entry moves to **`state: 'conflicted'`** and **leaves the sync queue** into reconciliation review.
    It stops being retryable: no backoff, no further attempts, and it no longer counts toward the
    queued-count pill (§5.2.7), which must continue to mean "records that will actually upload".
  - **The field user is told**, on the device, at the moment the conflict is detected — not silently
    moved. The message names the record and says their copy was kept and sent for review. It is not the
    generic `Needs attention` treatment of a failed retry (§5.2.6), because nothing here will succeed on
    a retry and offering one would be a lie.
  - Reconciliation is **manual, by Owner or Admin**, who see both versions and choose. Nothing
    auto-merges. Nothing expires.

**Why `IS DISTINCT FROM` and not `>`.** Any change since the load invalidates the client's basis,
regardless of direction. A greater-than test would wave through a row whose `updated_at` moved
backwards — a restore, a clock skew between writers, a manual correction — and those are exactly the
cases where a blind overwrite does the most damage. The client is not asking "is the server newer?", it
is asking "is the server still what I saw?".

**A first write is never a conflict.** An entry with `op: 'insert'` has `base_updated_at: null` — there
was no row to load — so it takes the ordinary idempotent-upsert path (§5.3) unchanged, however long it
has been queued. Conflict detection is strictly an `op: 'update'` concern, which is why §5.2's entry
carries `op` at all.

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

> **[S98] What `/m/capture` is for — reconciling §1 with this section.** §1 listed `capture/page.tsx` as
> the "camera action target", which read as though the route opened the camera. It does not, and cannot:
> the camera is a **file input rendered in the tab bar**, so tapping it navigates nowhere. Deleting the
> route was the other option, but it is needed — everything that happens **after** the shutter has to live
> somewhere. `/m/capture` is that surface: the project prompt when there is no project in context (§6,
> A-21), the confirmation, and the offline "will upload later" message. The photo is held there until a
> project is chosen, which is not a UX preference but the only sequence the database permits (§7a, A-21c).
> With a project already in context and online, the route may be passed through without being seen.

- With a project in context, the photo files to that project.
- With no project in context, the app asks which project **after** the shot is taken, never before.
- Offline, the photo enters the queue (§5.2) and the user is told it will upload later — in the same
  confirmation, not a separate alert.

Photos land in the `project-files` bucket with `files.category = 'photos'`. The same camera-first rule
applies to every field image input (daily log, incident, delivery damage). Gallery is always reachable;
camera is always the default.

---

## §7 — PWA prerequisites

> **[S98] Brand values are INHERITED, not authored here.** A parallel session is renaming the product
> ("EZ Contractor Binder" is the working name) with a new logo and icon set. **This spec does not author,
> guess, or hard-code any product name, colour or icon.** It names the values the manifest needs and where
> each comes from; whatever the rebrand settles is what ships. The previous text specified
> `short_name: "FrameFocus"` and `#14213d` literals — those are removed, not updated.

### 7.1 Manifest

`apps/web/app/manifest.ts` (or `public/manifest.webmanifest`) must declare:

| Manifest field | Value | Source |
| -------------- | ----- | ------ |
| `name` | The product's full name | **Rebrand.** Read from the single shared brand source — one module both the manifest and any on-screen product name import. Never a literal in the manifest. |
| `short_name` | The product's home-screen name | **Rebrand**, same source. This is what appears under the icon on the phone, so a stale value here is the most visible possible regression. |
| `icons` | 192, 512, and a 512 **maskable** | **Rebrand** — the new icon set. §7.2. |
| `theme_color` | Product chrome colour | **Rebrand.** See §7.3 — this is not automatically §2's `navy`. |
| `background_color` | Splash background | **Rebrand**, same as above. |
| `start_url` | `/m` | **M6M owns this.** It is a routing decision (D-12, §1), unaffected by the rebrand. |
| `display` | `standalone` | **M6M owns this.** Required for the installed experience and for iOS Web Push (D-10). |

**M6M owns exactly two of these**, and only those two are specified in this document. The rest are
placeholders pointing at the rebrand; a build that fills them from this spec has filled them wrong.

### 7.2 Icons, service worker, iOS meta

2. Icons at **192, 512, and a 512 maskable** — artwork from the rebrand's icon set.
3. A service worker registered from the mobile layout — app-shell caching plus the queue's retry hook.
4. `apple-mobile-web-app-capable` and status-bar-style meta for iOS home-screen install.

These are also the prerequisites for Web Push on iOS (Gate 4). Notifications are not built here, but
nothing in this spec may make them harder.

### 7.3 Is §2's `navy` the same decision as `theme_color`? — **Two decisions, one value today**

Asked because §2 sets `navy #14213d` and the old §7 set `theme_color: "#14213d"`, which invites a build to
treat them as one constant.

They are **not** the same decision:

- **§2's `navy` is a UI token.** It colours the app bar and primary text *inside* the running app. M6M owns
  it; it is a design-system choice.
- **`theme_color` / `background_color` are OS-level product chrome.** They tint the splash screen, the task
  switcher card and the status bar — surfaces the user sees **before and around** the app, where the
  product is being identified rather than operated. They belong to the brand.

They coincide today only because the app bar happens to be navy. **After the rebrand they may legitimately
diverge**, and a build that has aliased them to one constant will silently drag the in-app UI to whatever
the new brand chrome is — or block the brand chrome from changing at all.

**So:** §2's token stays as specified in this document and is M6M's to own. The manifest colours come from
the rebrand. If they end up equal, that is a coincidence to be re-checked, not a shared constant to be
factored out.

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

## §7c — Required migration 3 of 3: the four capture constraints (D-30 [S99, Josh])

**Not written here.** This section states the shape; the migration is Josh's to run. Independent of §7a and
§7b; may land in any order relative to them, but **before the field-capture screens are trusted to enforce
these rules**.

**Why it exists.** Reconciling the handoff (§4.12) surfaced four rules the design states as requirements
and the database does not enforce. Ruled [S99, Josh]: **make them DB constraints.** Three reach cleanly.
**The fourth does not, and this section says so rather than pretending otherwise.**

### The three that a constraint reaches

| # | Rule | Today | Constraint shape |
| - | ---- | ----- | ---------------- |
| 1 | **`work_performed` is required on a daily log** (7c calls it "the only field that must be filled") | `daily_logs.work_performed` is **nullable**; UI-only | `NOT NULL`, or `CHECK (work_performed IS NOT NULL AND btrim(work_performed) <> '')`. **Prefer the CHECK** — `NOT NULL` alone admits `''`, which passes the constraint and fails the intent. **Needs a backfill decision:** existing rows may hold NULL. |
| 2 | **An injury must name a party** | `safety_incident_injuries.member_id` and `injured_name` are **both nullable**, and nothing ties the rule to `incident_type='injury'` | Two parts. (a) On the child row: `CHECK (member_id IS NOT NULL OR injured_name IS NOT NULL)` — a party row must identify *someone*. (b) The harder half — *an `injury` incident must have **at least one** child row* — **is not a CHECK.** A row-level constraint cannot count rows in another table. Options: a deferred constraint trigger on `safety_incidents`, or enforcement in the submit RPC. **Recommend the trigger**, because the RPC is not the only writer. |
| 3 | **An orderless check-in still needs a project** | Already enforced — `deliveries.project_id` is **NOT NULL** | **No migration needed.** Recorded because §4.12.4 raised it: the *design* omits a project field on the no-PO path, so this is a **UI defect**, not a schema gap. The constraint is already correct and the screen must supply a project. |

### The fourth — **where a DB constraint cannot reach**

**Rule: "damage requires ≥1 photo before submit" (7d).**

**This is not enforceable as a table constraint, and specifying one would be dishonest.** Three reasons,
each independently sufficient:

1. **It is a cross-table count.** The rule is "for each `delivery_items` row with `qty_damaged > 0`, at
   least one `files` row links to it". A `CHECK` sees one row of one table. `files` links via
   `delivery_item_id` — a different table, counted.
2. **It is a submit-time rule, not a row-time rule.** A check-in is built up over several inserts. At the
   moment the damaged line is written, its photo does not exist yet — the user photographs after
   counting. **A constraint that fired per-row would make the correct sequence impossible.**
3. **The photo is two writes** (§7a): the `files` row and the `storage.objects` bytes. A constraint on
   `files` proves a row exists, not that an image does.

**What IS enforceable, and what is therefore specified:**

- **A submit-time check inside a `SECURITY DEFINER` RPC** that finalises the check-in: refuse when any
  line has `qty_damaged > 0` and no linked `files` row. This is the real enforcement point, and it works
  because **7d is online-only (D-6)** — there is no queued path that bypasses it. Had check-in been
  offline-capable, even this would be advisory.
- **A deferred constraint trigger** as an alternative if a single finalising RPC is not built.

**Stated plainly: outside that RPC, the damage-photo rule is a UI rule.** A direct API caller can write a
damaged line with no photo. That residual is accepted, and it is recorded here rather than hidden behind a
constraint that looks stronger than it is.

### `deliveries.checked_in_at` — ADOPTED (D-42 [S101, Josh]) — **specced here, NOT migrated**

**Resolves TECH_DEBT #134.** The S100 migration shipped `submit_delivery_check_in()` as a **gate**: it
authorises, validates the damage-photo rule, and recomputes `has_exceptions`. It was a gate rather than a
state transition **because there was nothing to flip** — `deliveries` carries no status column and no
finalisation timestamp. D-42 supplies one.

**The column.** `checked_in_at timestamptz NULL` on `public.deliveries`. NULL means *in progress*; a
value means *a human said done*. No default, no `NOT NULL`, no CHECK.

**What changes in the RPC.** `submit_delivery_check_in()` stamps it on the success path — after the two
authorisation gates and the damage-photo validation, alongside the existing
`recompute_delivery_exceptions()` call. **The function becomes idempotent-by-intent rather than
idempotent-by-accident:** re-submitting an already-checked-in delivery should be a no-op on the timestamp
(`COALESCE`/`WHERE checked_in_at IS NULL`) rather than moving it, or the audit trail records the last
retry instead of the completion.

**What must NOT change.** The two authorisation gates stay exactly as they are — the row must be in the
caller's company and pass `can_view_project()`, and the caller must be the receiver or Owner/Admin. D-42
adds a side effect to the success path; it does not touch who may reach it.

**The consequences, stated because a nullable column added to a live table is never free:**

- **Every existing row backfills to NULL** and therefore reads as "never checked in" — including
  deliveries that were completed before the column existed. Whether to backfill them from `created_at`,
  or leave them NULL and treat NULL as "unknown, pre-column", is a **migration decision, not a spec one**;
  both are defensible and the choice should be deliberate.
- **Module 6D's desktop delivery screens gain a field they do not render.** That is fine — a nullable
  additive column breaks no existing read — but whether desktop *should* show it is a 6D question this
  spec does not answer.
- **M-22 (7d) is the first consumer**, and it is the reason the column exists: with it, the screen can
  distinguish a check-in the user abandoned from one they finished, and the "notifies Owner, Admin, PM"
  consequence line finally has a persisted counterpart.

**NOT MIGRATED HERE.** Same posture as §7c itself: this section states the shape; the migration is a
separate step, and it must land **before M-22 is built** — a screen that reads `checked_in_at` against a
table that lacks it fails at the first query.

### Ordering and evidence

Independent of §7a/§7b. Evidence when it lands: a failing-then-passing pair per constraint, under the S90
impersonation harness — not as `postgres`, which bypasses nothing here but sets the wrong precedent.

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
  schedule UNION (D-24), progress % is cut (D-19) and `{m} estimating` is dropped (D-23).
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
- **GAP-8 — ✅ CLOSED [S99] BY RECONCILIATION.** The _Mobile Field Capture_ handoff arrived
  (`docs/handoffs/mobile-field-capture/`, commit `e1d9747`) and is reconciled screen by screen in
  **§4.12**. Closing conditions, each met: **(a)** the daily log has an entry screen and a route — M-21,
  `/m/logs/new` — so M-6's "Log the day" button resolves; **(b)** the mid-shift switcher has a home — M-20,
  `/m/timeclock/switch` (D-32), so a mis-clocked segment has an in-app correction path; **(c)** delivery
  check-in and incident reporting have routes — M-22 and M-23; **(d)** M-5 already specced type selection
  at S98 via D-27/§4.5a, and §4.12.1 records how the handoff's 7a bends to it. **All three of D-6's
  offline-capable actions now have a screen to originate from**, and the fourth capture screen (7d) is
  correctly excluded from the queue as online-only.

  _The S98 statement is kept below as the record of what was blocked and why:_
  > _"**GAP-8 — OPEN, and hoisted to the status block [S98]. The five field-capture screens are not specced
  > by this document.** The _Mobile Field Capture_ handoff (clock, segment switch, daily log entry, delivery
  > check-in, incident) is referenced by both provided handoffs but was never delivered. M-5 and M-6 are
  > built from the locked patterns, not from it. **This is not a documentation gap — it is a build blocker
  > for two of D-6's three offline-capable actions:** the daily log has no entry screen at all (M-6's "Log
  > the day" button has no destination and §1 has no route for one), and M-5 never specs how a
  > `segment_type` is chosen, which `time_segments`' `NOT NULL` CHECK requires before any segment can be
  > written. … If the handoff arrives, reconcile; if it does not, these screens need specifying before the
  > queue has anything to carry."_

  **Reconciliation was the path taken.** One item it surfaced is NOT closed: the handoff asserts four rules
  the schema does not enforce, which became **D-30 / §7c**, a third migration — specced, not written.

---

## §8a — Data bindings (closes GAP-3)

Every figure on M-2 and M-3, bound to a named file and line, or removed by ruling. **[S98] No row is
MISSING any more** — the three that were are now ruled: `{m} estimating` dropped (D-23), progress % cut
(D-19), "Up next" bound to the schedule (D-24). Nothing here was invented to fill a gap; two figures were
deleted instead.

| Figure (screen)                     | Status      | Source                                                                                                                                                                                                                                                     |
| ----------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{n} active` (M-2 app bar)          | **BOUND**   | `projects.status = 'active'` with `is_deleted = false`. Reference derivation: `apps/web/lib/services/dashboard.ts:49-53`, surfaced as `activeProjectCount` at `:91`. On mobile it is the count of the rows M-2 already lists — no second query.            |
| `{m} estimating` (M-2 app bar)      | **DROPPED [S98, D-23]** | **There is no `estimating` project status** — `projects_status_check` (`20260704211000_module5_5a_projects.sql:120`) permits exactly `active, on_hold, complete, archived, cancelled`, and `ProjectStatus` (`projects.ts:7`) mirrors it. Ruled: the figure is removed from the header rather than a status being added. Nothing binds it because nothing renders it. |
| `62%` progress (M-2 card, M-3 stat) | **CUT [S98, D-19]** | No project-level percentage exists; the nearest ingredient is phase-level `PhaseRollup.percent` (`tasks-shared.ts:48, 83-88`), the mean of `tasks.percent_complete` **within one phase**. Ruled cut from v1 rather than derived. The M-2 progress bar and the M-3 Progress stat are both removed — §4.2 and §4.3 carry the respec. |
| `38 days left` (M-2 card, M-3 stat) | **BOUND**   | `projects.target_end_date` (`20260704211000_module5_5a_projects.sql:105`). Existing derivation: `apps/web/app/dashboard/projects/[id]/page.tsx:104-111`, rendered as the "Days to Target" KPI at `:140-145`. **Signed** — it goes negative past target — and `null` when the date is unset, which the desktop renders as `—` with a "Needs dates" caption. Mobile must carry both states; `38 days left` is only the happy path. |
| `{total} open` punch (M-3, M-2)     | **BOUND**   | Exact-count query on `punch_list_items`, `is_deleted = false`, `status IN ('open','in_progress')`, `project_id = :id`. Reference: `apps/web/app/dashboard/projects/[id]/page.tsx:71-76`. The company-wide twin is `dashboard.ts:78-85`. D-16's definition of "open" matches both precedents exactly. |
| `{mine}` punch (M-3, M-2)           | **BOUND**   | The same query plus `assignee_id = get_my_member_id()` — see §4.3 for the exact expression. `get_my_member_id()` is defined at `20260704210000_company_members_foundation.sql:104-114`.                                                                     |
| "Up next" (M-3)                     | **BOUND [S98, D-24]** | The next upcoming item from the calendar UNION: `getCalendarEvents({ projectId })` (`schedule.ts:106`), filtered to `start_date >= today`, first row of the existing ascending sort (`schedule.ts:200`), tie-broken inspection → task → general → title. Per-source tables and date columns in the §4.3 table. **No milestone entity was introduced** — `grep -rn "milestone"` still returns nothing across `supabase/`, `apps/web/lib` and `packages/`, and nothing was added to make it return something. Viewer-dependent for crew/subcontractor via `schedule_entries_select_scoped` (`20260704213000_module5_5b_tasks_scheduling.sql:406-414`) — stated in §4.3. |
| "currently clocked into" (M-2, D-12)| **BOUND**   | `getOpenSession()` (`time-tracking.ts:53`) → the open segment → its `project_id`. The open-segment expression already exists twice: `components/time/clock-modal.tsx:149` (`s.segment_end === null && !s.is_deleted` — use this one, it carries the soft-delete guard) and `dashboard/timeclock/timeclock-client.tsx:121`. **Caveat, and it is not an edge case:** `time_segments_project_gate_check` (`20260710130000_module6_6a_time_tracking.sql:222-225`) *forces* `project_id IS NULL` on `travel`, `shop` and `break` segments. **The complete per-type rule — all six types, three requiring a project and three forbidding one — is in §4.5a; `material_run` and `warranty` require a project just as `work` does.** A clocked-in user on a break has an open session and **no** current project. See §4.2. |
| Photo count / gallery (M-3, M-8)    | **BOUND**   | `getFiles({ projectId, category: 'photos' })` (`files.ts:29-48`). There is no count-only function; the count is the length of the list. **The unseen dot is deferred to v2 [S98, D-14 as amended]** — the badge is this count and nothing else, so there is no unbound half left. |

---

## §9 — Out of scope

- ~~Finance surfaces of any kind on mobile (D-9).~~ **NARROWED [S100, D-37].** _Original line, quoted
  not deleted._ **Budget, Invoices, Payments and Contracts remain out of scope and are deferred to v2.**
  **Expenses is IN** — M-26, §4.13.3. The blanket phrasing above was always wider than D-9's own
  exclusion list, which named four surfaces and not "finance of any kind"; D-37 removes exactly one
  member of that list. Other money that stays cut for its own reasons, unaffected by the narrowing:
  CO dollar amounts (D-26), labor and burden rates (`instrument_rates`, DB-enforced Owner/Admin),
  PO cost and price (§4.11.5), the job-cost rollup (§4.13.3), and sub default rates and markup
  (§4.13.4).
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
> meant to test — see A-23 and A-24, both since corrected.
>
> **Every criterion carries its harness [S98, D-18].** `[live]` = the existing Node harness against
> rebuild-test; `[unit]` = the committed vitest suite, queue logic with injected storage and online
> predicate; `[Playwright]` = browser-driven, **a dependency this repo does not currently carry**;
> `[manual]` = a release check no tool can automate; `[build]` / `[shell]` = a compile or a command, no
> runner needed. **A-7 and A-7g are superseded placeholders, not live criteria, and carry no marker by
> design** — they are kept so a withdrawal is visible rather than a silent gap. Every other criterion
> carries a marker — the ten once marked UNTESTABLE are assigned in
> §10a. The single exception is **A-25e**, which is flagged as unassertable pending a ruling and says so.

**Shell**

- A-1 The tab bar renders on every `/m/**` route except M-9 and M-10, and does not scroll out of view. `[Playwright]`
- A-1b On M-9 and M-10 the tab bar is **replaced by that screen's own action row**, not simply absent — the 4-up row on M-9, the Undo/Redo/Done row on M-10. _(§3.2 promised a replacement; A-1 only tested the absence.)_ `[Playwright]`
- A-1c The active tab reflects the current screen on every `/m/**` route — arriving at `/m/p/{id}` by any path leaves Projects active. _(§3.2 — no prior criterion.)_ `[Playwright]`
- A-2 With the hamburger sheet open, the tab bar is still visible **and tappable** — tapping Timeclock through the open sheet navigates. `[Playwright]`
- A-3 The hamburger sheet contains **no** tile for Projects, Timeclock, Logs, or Field. `[Playwright]`
- A-3b The hamburger sheet contains **exactly** the six tiles named in §3.3 — Schedule, Expenses, Subs & Vendors, Team, Contacts, Settings — plus the full-width Sign out row. _(A-3 tested only the negative. §3.3's positive list had no criterion at all — this is the same class of gap S97 shipped. **Rewritten [S100, D-38]:** the tile set was seven and named Dashboard first; that tile is cut from v1, so a build that still renders it now fails here rather than passing a stale count.)_ `[Playwright]`
- A-3c The tile matching the current location carries the blue border and blue label; no other tile does. _(§3.3 — no prior criterion.)_ `[Playwright]`
- A-3d Tapping the scrim closes the sheet, and tapping the hamburger closes it. _(§3.3 — no prior criterion.)_ `[Playwright]`
- A-4 On a project screen the hamburger is absent and a back chevron is present. `[Playwright]`
- A-5 Every interactive element on every `/m/**` screen measures ≥44px in its smallest dimension, except the markup colour swatches (34px, 8px apart). `[Playwright]`

**Landing (D-12)**

- A-6 A successful sign-in lands on `/m/timeclock`, not `/m/projects` and not the dashboard. `[Playwright]`
- A-7 **Superseded by A-7f [S98, D-27].** _Original: "Clocking in with a project selected navigates to that project's hub; clocking in with no project navigates to the dashboard."_ The distinction it tested — project selected or not — is no longer the one the app makes; the redirect follows the **type**. Placeholder kept so the supersession is visible rather than a gap in the sequence. **Not a live criterion — assert A-7f.**

**Projects list**

- A-8 The card for the project the signed-in user is currently clocked into carries the blue border **and** the "On site" pill; no other card does. `[Playwright]`
- A-8b With the signed-in user clocked in on a `break` / `travel` / `shop` segment, **no** card carries the border or pill, and no card is highlighted by falling back to a recent project. _(§4.2. A-8 alone passes vacuously in this state, which is the state the DB constraint guarantees exists.)_ `[Playwright]`
- A-9 Filter chips are single-select — selecting "Mine" deselects "All". `[Playwright]`
- A-9b The chip row renders exactly All / Active / Mine / On hold, and each chip changes the rows listed. _(§4.2 — no prior criterion.)_ `[Playwright]`
- A-9c Typing in the search field filters the list without a submit action. _(§4.2 "Search filters live" — no prior criterion.)_ `[Playwright]`
- A-10 Every number on the screen renders in IBM Plex Mono; no number renders in Barlow. `[Playwright]`
- A-10b The status pill always renders its text label; no status is conveyed by fill colour alone. _(§4.2. This is the same accessibility class as A-24, which did have a criterion — the pill did not.)_ `[Playwright]`
- A-10c The app bar renders `{n} active` and **nothing after it** — no second count, no separator, no `estimating` figure. _(Rewritten [S98, D-23]. The old criterion tested a two-part header that no longer exists; this one fails if the dropped half comes back.)_ `[Playwright]`
- A-10d **No project card renders a progress bar or a percentage anywhere on M-2.** _(New [S98, D-19]. The bar was cut; without this, a build that keeps it violates §4.2 and no criterion notices.)_ `[Playwright]`
- A-10e The card footer renders days-left in all three states — a positive count, a **negative** count past target rather than a clamp at zero, and the empty state when `target_end_date` is null. _(§4.2 as amended; the desktop precedent at `projects/[id]/page.tsx:104-111, 140-145` already handles all three.)_ `[Playwright]`

**Project sections**

- A-11 The Punch stat renders amber when the count is non-zero and muted when it is zero. `[Playwright]`
- A-11b The Punch stat and the Punch List tile both read `{mine} mine · {total} open`, and `{mine}` differs between two members with different assignments on the same project. `[live + Playwright]`
- A-11c An item moved to `complete` drops out of both figures; an item at `in_progress` stays in both. `[live + Playwright]`
- A-11d The "Days left" stat renders the signed value from `projects.target_end_date`, renders a negative number past target rather than clamping at zero, and renders the empty state when the date is null. _(§4.3 + §8a. The spec's `38 days left` is the happy path only; the desktop precedent already handles all three states.)_ `[Playwright]`
- A-11e The stat strip renders **exactly two** stats — Days left and Punch — split 50/50 across the header width, separated by a **single** 1px rule. No third stat, no leftover one-third columns, no empty slot. _(Rewritten [S98, D-19]. The old criterion tested that a Progress stat was bound; the respec means the failure mode is now a strip that keeps three-column geometry after losing a stat, and this criterion catches that.)_ `[Playwright]`
- A-11f The "Up next" card renders the **first** calendar event with `start_date >= today` for this project, from the union of dated tasks, schedule entries and inspections; a nearer-dated event added afterwards displaces it. _(Rewritten [S98, D-24].)_ `[Playwright]`
- A-11g With two events on the same date, "Up next" applies the tie-break — inspection before task before general entry, then title ascending — and picks the same one on every render. _(§4.3. The underlying sort is on date alone, so without this the card flickers between equally-dated items.)_ `[Playwright]`
- A-11h With no event dated today or later, "Up next" renders the "Nothing scheduled" empty state; the card is **not** omitted. _(§4.3.)_ `[Playwright]`
- A-11i The "Up next" date line renders the event's date. It is **not** bound to `detail.notes`, which is absent for tasks — a task-sourced card renders a date, never a blank line. _(§4.3. This is the failure the binding was written to prevent.)_ `[Playwright]`
- A-11j A crew member's "Up next" reflects the schedule rows RLS grants them — a general entry belonging to a teammate does not appear, while project tasks and inspections do. _(§4.3's viewer-dependency note. Without this the caveat is prose nobody verifies, and a build that "fixes" it by querying with elevated rights leaks another member's schedule.)_ `[live]`
- A-12 The section grid renders exactly nine tiles and **none** is Budget, Invoices, Payments, or Contracts. `[Playwright]`
- A-12c **Every one of the nine tiles navigates to its own `/m/**` route and renders a screen** — none is inert, none is disabled, and none resolves to a `/dashboard/**` URL. `[Playwright]` _(**Rewritten scope [S98].** A-12 asserts only that nine tiles render, so it passed on a grid of nine dead tiles for the whole of this spec's life. This is the criterion that fails on that. The `/dashboard/**` clause is D-13 one layer up — a tile that opens a desktop page is the thing D-13 rejected for tab screens.)_
- A-12d **The same holds for all four of M-7's tiles.** `[Playwright]` _(M-7's grid had the identical hole and no criterion at all. A-13b counts its tiles; nothing asserted they went anywhere.)_
- A-12e M-7's Photos, Deliveries and Daily-logs tiles resolve to the **existing** routes (M-8, M-15, M-6-with-project-chip) — no duplicate gallery, delivery or log screen is built. `[Playwright]` _(§4.11.10. Without this, "every tile has a screen" is satisfied by building four more screens that drift from the originals.)_
- A-12b Change Orders and Punch List badges render amber, Deliveries red, Photos and Team plain mono. _(§4.3 — no prior criterion.)_ `[Playwright]`
- A-13 The Photos tile shows the project's total photo count **and no dot** — no unseen indicator renders under any data condition, including photos created after the user's last visit. _(Rewritten [S98, D-14 as amended]. The dot clause is removed, and the criterion now fails if a dot is built anyway.)_ `[Playwright]`

**Field (M-7) — §4.7 had no criteria at all**

- A-13b M-7 renders a 2-column grid of exactly four tiles — Daily logs, Deliveries, Safety, Photos — each with its attention badge. `[Playwright]`
- A-13c M-7's project context row names the project the tiles apply to, and tapping it switches project; the tiles then reflect the new project. `[Playwright]`

**Logs (M-6) — §4.6 was untested apart from the queue**

- A-13d A log still waiting to sync renders the `Queued` badge **in place of** the photo count, not alongside it. _(§4.6.)_ `[Playwright]`
- A-13e M-6's chips are All / Mine / This project, single-select, and "This project" appears only when a project is in context. `[Playwright]`

**Timeclock segments (§4.5a, D-27) — rewritten [S98]**

> The previous A-7b…A-7i were written against D-25's default-then-switch model. That model is superseded,
> so **every one of them was re-checked**: A-7b and A-7d asserted a defaulted `work` segment and are
> replaced; A-7e/A-7f/A-7g/A-7i asserted the mid-shift switcher, which is no longer specced here and has
> moved to GAP-8 (A-7j records the constraint it must honour when it lands); A-7c and A-7h survive with
> their wording corrected.

- A-7b Clock-in **cannot be submitted without a segment type** — the button stays disabled until one is chosen, and no type is pre-selected. `[Playwright]` _(§4.5a, D-27. Replaces the old A-7b, which asserted the opposite: that clock-in wrote `work` with no prompt.)_
- A-7b2 The type picker offers **exactly** the six types in `time_segments_type_check` — `work`, `material_run`, `warranty`, `travel`, `shop`, `break`. `[Playwright]` _(A seventh option, or a missing one, is a constraint violation waiting to happen.)_
- A-7c For `work`, `material_run` and `warranty` the project row is **present and required**; clock-in cannot be submitted without a project. `[Playwright]` _(§4.5a. This is the criterion that fails if a build lets a `work` segment through with no project — the exact violation that killed D-25.)_
- A-7c2 For `travel`, `shop` and `break` the project row is **absent** — not present-and-disabled. `[Playwright]` _(§4.5a. A greyed control invites a tap that can never succeed and implies a choice the constraint forbids.)_
- A-7c3 A clock-in of `travel`, `shop` or `break` writes `project_id NULL`; **no project is attached under any circumstance**, including when a project was in context from the previous screen. `[live]` _(§4.5a. The context-carry-over is the likely bug: the user was on a project hub, taps Timeclock, picks `break`, and the screen helpfully sends the project — which the CHECK rejects.)_
- A-7d A clock-in of `work`, `material_run` or `warranty` writes the chosen `project_id`. `[live]`
- A-7d2 The written `segment_type` is the one the user selected — no substitution, no fallback to a default on any path. `[live]` _(Replaces the old A-7d. With no default in the model, a build that reintroduces one is silently ignoring the user's choice.)_
- A-7e Clock-in writes `task_id NULL` and therefore `completion NULL` for every type. `[live]` _(§4.5a. `time_segments_task_gate_check` permits a task only on `work`, and `time_segments_completion_gate_check` forbids a completion without one. Task attach is GAP-8's.)_
- A-7f **The redirect follows the type**: `work`/`material_run`/`warranty` land on `/m/p/{projectId}`; `travel`/`shop`/`break` land on the dashboard. `[Playwright]` _(D-12 as restated. Rewritten [S98] — the old A-7 tested "with a project selected / with no project selected", which is no longer the distinction the app makes.)_
- A-7g **REVIVED [S99, D-32] onto 7b.** On the **M-20 switcher**, selecting `work`, `material_run` or `warranty` requires a project before "Start segment" is enabled — with no project in context, the picker demands one. `[Playwright]` _(Original text, withdrawn with D-25 [S98]: "With no project in context, the picker requires a project before applying `work`, `material_run` or `warranty`." **It was withdrawn only because the screen it described left scope. That screen is back (§4.12.2), so the assertion is live again on it.** The clock-in equivalent remains A-7c.)_
- A-7h **[CORRECTED S99]** Ending a segment of any type other than `break` requires a note; ending a `break` does not. `[live]` _(§4.5a. **Correction: the previous rationale — "Service-layer rule with no CHECK behind it, so nothing else catches its absence" — was FALSE.** `time_segments_note_on_end_check` is live and DB-enforced, so a missing note is a constraint violation, not a silent gap. **Harness changed `[Playwright]` → `[live]`**: this is a database-refusal assertion and the browser cannot see it. Applies at clock-out AND at every 7b switch.)_
- A-7i An offline clock-in queues the session `insert` and the segment `insert` as **two** entries, the segment carrying `depends_on` the session. `[unit]` _(§5.5.1 + §5.2. Rewritten [S98]: the old A-7i asserted the two-entry shape of a mid-shift *switch*, which is no longer specced here — but clock-in has always had its own two-entry shape and had no criterion for it.)_
- A-7j **REWRITTEN [S99, D-32] — the prohibition becomes a requirement, and its guard survives.** A mid-shift switch **is** offered, at **M-20** (`/m/timeclock/switch`), reached from M-5's on-the-clock state. `[Playwright]` _(Original, quoted: "**No mid-shift segment switch is offered on any screen in this spec.** (§4.5a. The switcher is GAP-8's. This criterion exists so a build does not helpfully add one that edits a segment in place — which `time_segments_update_authorized` refuses for a crew member — and so the absence is a recorded decision rather than an oversight.)" **Note it carried TWO purposes: prohibit the screen, and prohibit edit-in-place. Only the first is overturned** — the second becomes A-7j2, which is why this is a rewrite and not a deletion.)_
- A-7j2 **NEW [S99, D-32] — the edit-in-place guard A-7j was really protecting.** A switch **closes the open segment and inserts a new one**; **no path issues an UPDATE against an ended segment.** `[live]` _(`time_segments_update_authorized` lets a member end their **own open** segment but not alter an ended one; `time_segments_insert_authorized` gates inserts on `owns_open_session(session_id)`. `[live]`, not `[Playwright]` — the assertion is that the database refuses, which a browser test cannot distinguish from a UI that simply never tries.)_
- A-7j3 **NEW [S99, D-32]** The switcher's type picker offers **all six** types, and applies the same three-and-three project rule as clock-in — project row present and required for `work`/`material_run`/`warranty`, **absent** for `travel`/`shop`/`break`. `[Playwright]` _(§4.12.2. The handoff's 2×2 grid shows four; §4.5a's table is the authority. A four-tile grid means a crew member can clock into `material_run` and never switch back to it.)_
- A-7k **NEW [S99, D-34] — fix acquired.** With location granted and a position available, clock-in succeeds and `gps_in` holds **coordinates** (`lat`/`lng` present). `[live]`
- A-7k2 **NEW [S99, D-34] — permission denied.** With location **denied**, **clock-in still succeeds**, and `gps_in` holds `reason: "permission_denied"`, `error_code: 1` — **not NULL, and not coordinates.** `[live]` _(§4.12.1a. Two failures in one: a build that blocks the shift, and a build that writes NULL and loses the distinction between "denied" and "never asked".)_
- A-7k3 **NEW [S99, D-34] — position unavailable.** With permission granted but no fix obtainable, **clock-in still succeeds**, and `gps_in` holds `reason: "position_unavailable"`, `error_code: 2`. `[live]` _(§4.12.1a. The steel-building case. Distinguishable from A-7k2 in the stored row — that is the whole reason the reason field exists.)_
- A-7k4 **NEW [S99, D-34]** **No control anywhere disables location capture** — no setting, toggle, or skip on M-5 or in settings. `[Playwright]` _(§4.12.1a rule 1. The OS permission prompt is not an app opt-out.)_
- A-7k5 **NEW [S99, D-34]** A surface that reports "on site" does so from **coordinates**, not from `gps_in` being non-null — a denied-permission session **never** renders as on site. `[Playwright]` _(§4.12.1a. Pins the `live-board.tsx:129` defect D-34 would otherwise introduce. Written against the behaviour rather than the file so it survives a refactor.)_
- A-7l **NEW [S99, D-33]** **No project is selected when M-5 opens**, and the project list is ordered **nearest-first**. "Clock in" stays disabled until a project is tapped, for the three types that require one. `[Playwright]` _(§4.12.1. The failure this catches is a build that sorts by proximity and then selects row 0 — which satisfies "sorted" and reintroduces the guess. Assert both: order changed, selection empty.)_
- A-7l2 **REWRITTEN [S101, D-44]** With **no** GPS fix the project list renders **most-recently-worked first for this member**, with projects the member has never worked sorted after those they have, **alphabetically by name** — and clock-in still works. `[live + Playwright]` _(**Rewritten [S101, D-44].** _Superseded text:_ _"the project list still renders in a defined order and clock-in still works."_ That asserted only that **an** order existed, because none was ruled. D-44 names it, so the criterion names it too. The `[live]` half matters: two members with different segment histories must get **different** orders on the same project set — a build that sorts by `projects.created_at` and calls it recency passes any single-user check.)_
- A-7l3 **NEW [S101, D-44]** The recently-used order is bound to a **named service function** over `time_segments`, not to a raw query in the page and not derived client-side from `getSessions()`. `[shell]` _(§4.12.1. No such function exists today — verified against `time-tracking.ts`'s ten exports. The client-side derivation is the tempting shortcut and it silently caps history at one page of sessions.)_
- A-7n **NEW [S101, D-41]** **No mobile screen tells the user their location is being captured** — no banner, no first-run explainer, no line on M-5, no caption under the clock button. `[Playwright]` _(§4.12.1a. An absence assertion in the shape of A-10d, A-40 and A-43: D-41 ruled that the app says nothing, and a considerate build adds a reassuring line without realising it is reversing a ruling. **The flag on D-41 about a possible employment-law dimension is recorded in §4.12.1a and is not something this criterion can test.**)_
- A-7m **NEW [S99, D-35]** **No derived overtime figure appears on M-5** — no "to OT", no weekly total, no threshold countdown. `[Playwright]` _(§4.12.1b. Written as an absence assertion, like A-10d and A-11e for the D-19 cut, because the data exists and a build could helpfully surface it.)_
- A-7j4 **NEW [S99, D-32]** Switching **captures a note for the segment being closed**, unless that segment is a `break`. `[live]` _(The handoff's 7b has no note field and its footer is just "Start segment" — but closing a segment *is* a segment end, so `time_segments_note_on_end_check` applies. Without this the switch throws on every non-break segment. See A-7h's correction.)_

**Section screens (§4.11) — all new [S98]**

- A-30 Every `/m/p/[projectId]/*` section screen renders the back chevron and **no hamburger**, and keeps the tab bar with Projects active. `[Playwright]` _(§4.11 common rules + §3.1.)_
- A-30b Every section screen renders the app-wide offline strip **and its own empty state** when offline — none spins indefinitely, none shows stale data without the strip. `[Playwright]` _(§4.11 against §5.4. Nine new read surfaces is nine new chances to get this wrong.)_
- A-30c No section screen queues a write offline. Where a screen offers a write, it is **disabled with a plain message**, as delivery check-in is. `[Playwright]` _(§4.11. D-6's offline-write set is closed at three actions; a tenth screen quietly queueing would break A-18's count and §5's whole contract.)_
- A-30d Every number on every section screen renders in IBM Plex Mono. `[Playwright]` _(§2, extended over nine new screens — A-10 covered M-2 only.)_
- A-30e Every interactive element on every section screen measures ≥44px in its smallest dimension. `[Playwright]` _(§2, extended over nine new screens — A-5's sweep must include them.)_
- A-31 **M-11 renders none of M-3's four figures again** — no status pill, no days-left, no punch count, no "Up next". `[Playwright]` _(§4.11.1. The audit's duplicate-screen concern; without this M-11 drifts into a second copy of the hub.)_
- A-31b M-11 renders **no** progress percentage, including from `PhaseRollup.percent`. `[Playwright]` _(§4.11.1. D-19 cut percentages from mobile; the stepper's underlying data still carries one, so this is the easiest cut in the spec to undo by accident.)_
- A-31c M-11 renders **no** contract, cost, margin or any other currency figure. `[Playwright]` _(§4.11.1 + D-9.)_
- A-31d M-11's stepper marks the current phase by the desktop rule — first `in_progress`/`blocked`, else first incomplete. `[unit]` _(§4.11.1. A different rule here and the two surfaces disagree about where the job is.)_
- A-32 M-12 lists **today first, then ascending**, with past days above — not newest-first. `[Playwright]` _(§4.11.2. M-8's gallery is newest-first, so copying that pattern here is the likely error and it points the screen backwards.)_
- A-32b M-12 and M-3's "Up next" derive from the **same** `getCalendarEvents({ projectId })` call and never disagree about the next event. `[live]` _(§4.11.2 + D-24.)_
- A-32c A crew member's M-12 omits a teammate's general schedule entry while showing project tasks and inspections. `[live]` _(`schedule_entries_select_scoped`. Same caveat as A-11j, now on a screen that lists every event rather than one.)_
- A-33 **M-13 renders no currency anywhere** — no `net_delta`, no line totals, no sums — for **every** role including Owner and Admin. `[live + Playwright]` _(§4.11.3. `change_orders.net_delta` is UI-gated only, with no DB floor behind it (TECH_DEBT #117), so nothing but this criterion catches a leak.)_
- A-33b M-13 renders each CO's number, title, status label, author and dates — a CO is identifiable and trackable without its value. `[Playwright]` _(The other half of A-33: a screen that shows nothing is not the same as a screen that shows no money.)_
- A-33c **No money figure appears on M-13 under ANY role** — signed in as owner, admin, project_manager, foreman, crew_member and subcontractor in turn, the screen renders no currency-formatted value, no `net_delta`, and no sum derived from one. `[live + Playwright]` _(**D-26 [S98, Josh].** A-33 states the rule; this walks all six roles. The owner/admin pass is the one that matters — a build that adds a role gate "because owners may as well see it" satisfies every other criterion here, and #117 means RLS would not stop it.)_
- A-34 M-14's **Mine** and **Open** chips use the same two expressions as D-16's counts, so the M-3 Punch stat and this screen's filtered totals always agree. `[live]` _(§4.11.4.)_
- A-34b An item at `complete` awaiting verification appears under **All** and under **neither** Open nor any closed filter. `[live]` _(§4.11.4. The inherited D-16 divergence — this criterion exists so a build that "fixes" it into a third definition fails loudly.)_
- A-35 M-15 groups deliveries into **Against a PO** and **No PO** from the two separate service calls, and renders **no** PO cost, price or extended value. `[Playwright]` _(§4.11.5.)_
- A-35b A damaged delivery carries a **text** label, not colour alone. `[Playwright]` _(§4.11.5 + §4.2's status-pill rule.)_
- A-35c M-15 offers **no** check-in control. `[Playwright]` _(§4.11.5. D-6 makes check-in online-only and its screen is GAP-8's; a tile that implies otherwise is worse than one that says nothing.)_
- A-36 M-16 excludes `category = 'photos'` and lists the document categories. `[live]` _(§4.11.6. Without the exclusion every photo appears twice across M-8 and M-16.)_
- A-36b M-16 applies **no role check of its own** — it renders exactly what `files_select_non_client` returns. `[live]` _(§4.11.6. A UI filter that disagrees with RLS turns a permission into an unexplainable missing file.)_
- A-37 M-17's phone and email are tap-to-act (`tel:` / `mailto:`). `[Playwright]` _(§4.11.7 — the screen's reason to exist on a phone.)_
- A-38 M-18 renders **no** pay, cost or burden rate. `[live]` _(§4.11.8. `instrument_rates` is DB-enforced Owner/Admin, so this should be unreachable — the criterion proves the screen never tries.)_
- A-39 M-19 lists incidents with type, date, reporter and status, and shows **no injured-person name** on the list. `[Playwright]` _(§4.11.9. Every role reaches this screen.)_
- A-39b M-19 offers **no** incident-reporting control. `[Playwright]` _(§4.11.9. GAP-8 owns that screen.)_

**Offline**

- A-14 With the network disabled, the amber offline strip renders on the projects list, the project hub, and the timeclock screen — not only on `/m/offline`. `[Playwright]`
- A-14b Tapping the status strip navigates to M-4. `[Playwright]`
- A-14c A read-only surface with no local data renders the strip **and** its own empty state — it does not spin indefinitely, and it never renders stale data without the strip. `[Playwright]`
- A-15 A clock-in performed offline at time T and synced at T+3h stores `T` in `time_clock_sessions.clock_in`. `[live/unit]`
- A-15b The same `captured_at`-is-the-business-timestamp rule holds for a queued daily log and a queued photo, not only for a clock event. _(§5.2.1 is written for all three kinds; A-15 tested one.)_ `[live/unit]`
- A-16 Replaying the same queued entry three times produces exactly one row **for its `target_id`**. `[live]` _(Restated [S98] on `target_id`: `entry_id` and the row's primary key are now separate fields (§5.2), because one shift is three entries against two rows.)_
- A-16b A shift captured entirely offline (clock in, ≥1 segment, clock out) syncs with its segments attached — replaying in `seq` order, the segment inserts are not rejected by `owns_open_session`. _(§5.5.1. Without this, A-16 passes and the feature still loses every segment.)_ `[live]`
- A-16c That shift is queued as **three entries against two rows** — `insert` on the session, `insert` on each segment, `update` on the same session carrying `clock_out` — with the session's insert and its clock-out update sharing one `target_id` and carrying **different `entry_id`s**. `[unit]` _(§5.2. The old shape defined `id` AS the row's primary key, so these two entries collided and the clock-out silently replaced the insert.)_
- A-16d A segment entry whose `depends_on` parent has not succeeded is **not attempted** — it does not fail against `owns_open_session` and burn a retry. `[unit]` _(§5.2.4. Ordering alone is not enough; a failed parent must gate the child rather than letting it fail on its own.)_
- A-16e Every entry carries an `entity` of `time_clock_session`, `time_segment`, `daily_log` or `photo` — a segment is its own entity, not folded into a clock event. `[unit]` _(§5.2. Without a distinct entity, §5.5.1's ordered segment step cannot be expressed or asserted.)_
- A-17 A queued item whose sync fails permanently remains in "Waiting to sync" with its error visible; it is not dropped. `[unit + Playwright]`
- A-17b "Try again" forces an immediate sync attempt rather than waiting for the backoff interval. `[unit]`
- A-18 The queued-count pill equals the number of entries at **`state: 'queued'`** — the records and files that will actually upload — and excludes every `state: 'conflicted'` entry. `[unit + Playwright]` _(Restated [S98, §5.2.7]. "Will actually upload" is only testable once the queue has a state field to exclude on.)_
- A-19 Attempting a delivery check-in while offline blocks submission with an explicit message and creates **no** queue entry. `[Playwright]`

**Conflict — the server version stands (D-17, §5.6). All new [S98].**

- A-19b **The 08:00 / 08:30 / 09:00 sequence produces a conflict.** Load a log at 08:00 (client records `base_updated_at` = 08:00); edit it server-side at 08:30; edit the offline copy at 09:00 (`captured_at` = 09:00); sync. The entry **must be rejected as conflicted** and the server row must be **byte-identical** before and after. `[live]` _(**Rewritten [S98].** The old wording — "server `updated_at` later than the item's `captured_at`" — asserted the broken mechanism rather than the outcome, so it PASSED on the unsound rule: 08:30 is not later than 09:00, the detector said "no conflict", and the criterion agreed while the desktop edit was destroyed. A criterion must fail on the scenario, not restate the formula it is checking.)_
- A-19b2 Detection is on **`base_updated_at`**, never on `captured_at`: a queued update whose `captured_at` is far **later** than the server's `updated_at` is still a conflict when the row changed after the client loaded it. `[unit]` _(The generalised form of A-19b. Without it a build can pass A-19b by special-casing that one timing and keep the wrong comparison everywhere else.)_
- A-19b3 A server `updated_at` that moved **backwards** relative to `base_updated_at` is also a conflict — detection is `IS DISTINCT FROM`, not `>`. `[unit]` _(§5.6. A greater-than test waves through restores, clock skew between writers and manual corrections, which are the cases where a blind overwrite does the most damage.)_
- A-19b4 Editing the same row twice offline **does not advance `base_updated_at`** — the second edit coalesces into the existing entry, `captured_at` advances, and the base stays at the originally loaded value. `[unit]` _(§5.2.3. Re-basing on the phone's own unsynced write would tell the detector the client saw a server state it never saw — the same class of error the corrected rule fixes.)_
- A-19c That same queued copy **is not discarded** — its payload and `captured_at` survive the rejection and remain retrievable. `[unit]`
- A-19d The conflicted entry **leaves the sync queue**: no further retry is attempted, no backoff is scheduled, and it **stops counting toward the queued-count pill**, which continues to equal only what will actually upload. `[unit]` _(Without the pill clause this passes while A-18 silently breaks.)_
- A-19e The field user is shown a message naming the record and stating their copy was kept and sent for review — and it is **not** the generic `Needs attention` retry treatment used for transient failures. `[Playwright]`
- A-19f An entry with **`op: 'insert'`** is **never** treated as a conflict — it carries `base_updated_at: null` and takes the ordinary idempotent-upsert path however long it has been queued. `[live]` _(§5.6. Without this, an over-eager conflict check strands every offline creation.)_
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
- A-21c2 The tab-bar camera control **navigates nowhere** — it is a file input, and `/m/capture` is entered only **after** the shutter. `[Playwright]` _(§6 as reconciled with §1. A build that routes to `/m/capture` first puts a navigation between the tap and the camera, breaking A-20's "opens the camera directly".)_

**Subcontractor access (D-20, §7a) — all new [S98]**

- A-21d A **subcontractor** assigned to a project can complete a photo capture end-to-end: the row inserts, with `client_visible` false. `[live]` _(Fails today; this is the failing-then-passing assertion for the §7a migration.)_
- A-21e A subcontractor **not** assigned to the project is still refused — the widening did not become a blanket grant. `[live]`
- A-21f A subcontractor is still refused an insert in `contracts`, `change_orders` and `invoices` categories, and still cannot insert with `client_visible = true`. `[live]` _(The two `public.files` arms §7a leaves untouched. Without this, a migration that widens more than the role array passes unnoticed.)_
- A-21g A subcontractor's photo **bytes** land in the `project-files` bucket, not just the `files` row. `[live]` _(New [S98]. `storage.objects` policies are independent of `public.files` — widening only the table produces a row whose bytes were refused, and A-21d alone would not catch it.)_
- A-21h A subcontractor assigned to a project can **save markup** on a photo — both writes land: `files.markup_data` updates and the derivative object is written. `[live]` _(New [S98, ruling 1]. Exercises `files_update_non_client` and `project_files_update_non_client` together; fails today on both.)_
- A-21i A subcontractor is refused a storage write outside their company prefix, and outside a project they are assigned to. `[live]` _(The company arm and the project-assignment arm §7a leaves untouched on `storage.objects`.)_
- A-21j A **client**-role user is still refused all four widened policies. `[live]` _(Four role arrays are being edited at once; this fails if `client` is admitted by a careless rewrite.)_

**Photos**

- A-22 A photo's source badge is derived from its link column; a photo with no link column set renders **no** badge. `[Playwright]`
- A-22b A file referenced by `punch_list_items.reference_photo_file_id` or `.completion_photo_file_id` carries the `Punch` badge and appears under the Punch filter chip. `[Playwright]`
- A-22c Rendering the gallery writes nothing — `punch_list_items` rows are byte-identical before and after (D-15 is read-only). `[live]`
- A-22d The gallery groups by day, newest day first, labels the current day "Today", and loads further days on scroll. _(§4.8 — no prior criterion.)_ `[Playwright]`
- A-22e Long-press enters multi-select; bulk share and bulk delete act on the selected set. _(§4.8 — no prior criterion.)_ `[Playwright]`
- A-23 Saving markup writes **both**: the mark list to `files.markup_data`, **and** a flattened derivative image to storage. Asserting only one is not a pass. _(Rewritten [S98, D-21]. The old criterion named `markup_data` alone, so it passed under all three candidate storage models — including the two that never produce a shareable image. That is why it caught nothing.)_ `[live]`
- A-23b The original is **never modified** by a markup save — its bytes, `file_path`, `file_size` and `mime_type` are identical before and after, across two consecutive saves. Only `markup_data` differs. `[live]`
- A-23c Re-editing marks regenerates the derivative **in full from the original bytes**, not from the previous derivative, and **overwrites it in place** — after N saves there is exactly one derivative object and no accumulated recompression. `[live]`
- A-23d The derivative does **not** get its own `files` row: after a markup save, the project's photo count (§4.3) and the gallery tile count (§4.8) are unchanged. `[live]` _(The double-count failure §4.10 was written to prevent.)_
- A-23e **[REWRITTEN S99, D-31]** The viewer's toggle reveals the **unannotated original by swapping files** — with markup present the stage shows the derivative; toggling loads the original. `[Playwright]` _(Amended three times. The Mobile Photos handoff: "allow toggling back to the original".)_
- A-23e2 **DELETED [S99, D-31].** _Original, quoted:_ _"Toggling issues **no second image request** — the same original is on screen before and after; only SVG shapes are added or removed. `[Playwright]` (New [S98, Option A]. Without this, a build that fetches a derivative on toggle satisfies A-23e and reintroduces the dependency the ruling removed.)"_ **It asserted the exact behaviour D-31 now requires.** Under D-31 a toggle *is* a file swap and *does* issue a second request. Placeholder kept so the deletion is visible rather than a silent gap in the sequence.

**Display — the overlay rule (§4.7a). Rewritten [S98] for Option A; the derivative-as-display criteria they replace are gone, not amended.**

> **[S99, D-31] A-23f–A-23s were written for Option A's live overlay. Every one is re-checked below.**
> Three patterns: rewritten for the derivative, **deleted** because they asserted Option A itself, or
> **re-scoped to M-10 authoring**, where shapes are still drawn live and the rule still bites.

- A-23f **[REWRITTEN S99]** A photo with markup renders **the annotated derivative** in the M-8 gallery thumbnail. `[Playwright]` _(Was: "renders its marks over the **original**".)_
- A-23g **[REWRITTEN S99]** The same photo renders the derivative in the **M-9 image stage** and the **M-9 filmstrip** thumbnail. `[Playwright]` _(One rule, three surfaces — they must not drift; testing only the stage would let the filmstrip regress. Reasoning survives the reversal intact.)_
- A-23g2 **DELETED [S99, D-31] — this is the criterion that existed to prove Option A.** _Original, quoted:_ _"**A photo annotated on desktop, with `markup_data` and NO derivative, renders its marks correctly on all three surfaces.** `[Playwright]` (New [S98] — the population that blocked the previous rule. This is the criterion that proves Option A actually solved it, and it fails instantly on any build that still consults a derivative.)"_ **Under D-31 it is not merely obsolete, it asserts the opposite of the ruling** — a build satisfying it would be non-compliant. It is deleted rather than rewritten because **the population it protected does not exist** (§4.7a.0). The related desktop-editor work item is logged in §11.
- A-23h **[REWRITTEN S99]** A photo with **no markup** renders the plain original on all three surfaces, with **no indicator**. `[Playwright]` _(Was "no overlay element and no indicator". The overlay clause is void; the indicator clause survives and is still what stops a build marking every photo.)_
- A-23i **[REWRITTEN S99]** Saving markup flips all three surfaces to the derivative **without a reload**. `[Playwright]` _(Was "adding/removing marks flips… Display is a function of current `markup_data`". Display is now a function of which file is current; the no-reload requirement is unchanged.)_
- A-23m **[RE-SCOPED S99 → M-10 only]** On the **M-10 authoring canvas**, the image and the live shape layer render in **one SVG sharing one viewBox** — marks stay registered to image features at every canvas size. `[Playwright]` _(§4.7a.2. No longer a display criterion: M-8 and M-9 render a flat file. The `<img object-fit:cover>` + separate-SVG drift failure is still exactly the risk while authoring, so the multi-size assertion stands.)_
- A-23n **[RE-SCOPED S99 → M-10 only]** The M-10 canvas renders `meet` and **never crops** — authoring must show the whole image or a mark cannot be placed in the cropped region. `[Playwright]` _(The `slice` half applied to gallery/filmstrip overlays, which no longer exist; **the derivative is pre-flattened and crops as an ordinary image**.)_
- A-23o **[RE-SCOPED S99 → M-10 only]** A stroke below **1.5 device px** is raised to that floor; a stroke above it is **never lowered**; no mark's position or size changes at any scale. `[unit]` _(§4.7a.3. A rendering rule for the live canvas. Thumbnail legibility is now a property of how the derivative was flattened, not of a runtime overlay.)_
- A-23p **DELETED [S99, D-31].** _Original, quoted:_ _"`text` marks are **omitted** from the gallery and filmstrip overlays and **rendered in full** at M-9 and M-10. `[Playwright]` (§4.7a.3.)"_ **There are no gallery or filmstrip overlays to omit anything from.** A derivative is flattened once and shows whatever it was flattened with. Whether text is legible at 120px is a flattening-quality question with no criterion attached — noted in §11.
- A-23q An annotated photo carries the markup indicator: **top-right, circular, icon-only, no text**. It is not bottom-left, not a rounded rectangle, and carries no label — so it cannot be read as a source badge. `[Playwright]` _(§4.7a.3 against §4.8's "a photo's badge is its provenance". A criterion that only checked "an indicator exists" would pass on a build that violates the provenance rule, which is the whole risk here.)_
- A-23r **[REWRITTEN S99]** A photo whose marks are all in a cropped-away band **still carries the indicator**. `[Playwright]` _(§4.7a.3's reason for an indicator at all. The cause changes — the derivative is cropped as a plain image rather than an overlay being cropped — but the user-visible failure is identical: an annotated photo that looks unannotated.)_
- A-23s **[REWRITTEN S99]** A tile holds its placeholder until its image has loaded — **the original never flashes before the derivative replaces it**. `[Playwright]` _(§4.7a.4. Was: "shapes never appear over a blank tile" and "the bare image never appears before its marks". The first clause is void — there are no free-floating shapes. **The second is now MORE dangerous, not less**: under Option A the un-marked interval was a paint-order bug; under D-31 a build that renders the original first and swaps has an annotated photo showing as unannotated for a full network round-trip.)_
- A-23j **[REVERTED AGAIN S99, D-31]** A markup save whose **derivative** write fails **must NOT report plain success** — the marks are in `markup_data` but every surface would show the photo unmarked. `[unit]` _(Third position for this criterion, so the reasoning is worth stating: it was strict while the derivative displayed, relaxed by Option A when it did not, and is strict again now that it does. The S98 text is quoted in §4.7a.5.)_
- A-23k **[REWRITTEN S99]** Re-editing marks regenerates the derivative and updates all three surfaces immediately. `[Playwright]` _(Was "from `markup_data` … no longer concerns derivative staleness". **Staleness is a correctness break again** — see §4.7a.5's table.)_
- A-23l The **sharing** path fetches the derivative through the same signed-URL flow as the original, from the same `{company_id}/{project_id}/` prefix. `[live]` _(Kept [S98] — §4.7a.5 keeps this requirement even though the derivative left the display path. A path that skips signing would work in testing and leak in production.)_
- A-23t Sharing a marked-up photo whose derivative is missing or stale **degrades to the original with a warning** — it never silently shares an unmarked photo as if it were marked. `[unit]` _(§4.7a.5. Demoting the derivative created this hole: nothing else now notices it is absent.)_

**Markup schema v2 — the pin shape (§4.10a). All new [S98, D-22].**

- A-29 A **v1** `markup_data` row renders identically before and after the schema change — same marks, same positions — and is **not** rewritten on read. `[unit]` _(§4.10a.3. v2 is additive; a reader that "upgrades" rows on read would silently churn every stored payload.)_
- A-29b A reader that does not know `pin` **skips it and renders every other shape**. `[unit]` _(§4.10a.4. Verified as today's behaviour at `markup-editor.tsx:558`, `:627` and `MarkupViewer.tsx:98`; this criterion locks it so a later refactor to an exhaustive `never` check cannot turn a skip into a throw.)_
- A-29c No consumer gates rendering on the **version number** — pins render whenever `type === 'pin'` is present, including on a payload whose `version` reads `1`. `[unit]` _(§4.10a.4's flagged trap: a v1 desktop save rewrites `version` to 1 while carrying v2 pins, so the field is unreliable. A build that does `if (version < 2) skipPins()` passes every other criterion here and drops pins after one desktop round-trip.)_
- A-29d Pins **survive a v1 editor round-trip**: opening and re-saving a pinned photo in a renderer that cannot draw pins leaves the pin shapes intact in `markup_data`. `[live]` _(§4.10a.4 consequence 1. This is the data-loss criterion — A-29b only proves they are not drawn.)_
- A-29e The pin's `number` is **stored** in the shape, not derived from array position: reordering the `shapes` array does not change any rendered number. `[unit]`
- A-29f Deleting a middle pin **leaves the survivors' numbers unchanged** — {1,2,3} minus 2 renders {1,3}, not {1,2}. `[unit]` _(§4.10a.2. The gap is the specified outcome; a build that tidies up has reintroduced the silent-renumber failure.)_
- A-29g The next pin after that deletion is **4**, not 3 — `max + 1`, never `count + 1`, and never a reused freed number. `[unit]` _(§4.10a.2. `count + 1` produces a duplicate number here, and duplicates are invisible until someone references one.)_
- A-29h The first pin on a photo with no pins is **1**. `[unit]` _(`max` over an empty set is 0. Without this, an off-by-one starts every photo at 0 or 2.)_
- A-29i A pin scales and crops with the overlay under the same viewBox transform as every other shape, and honours §4.7a.2's per-surface fit. `[Playwright]`
- A-29j A pin holds a **minimum rendered diameter** at thumbnail size and stays a legible numbered marker rather than collapsing to a dot; it is exempt from §4.7a.3's stroke floor, which does not apply to it. `[Playwright]` _(§4.10a.1. A pin has no `strokeWidth`, so the stroke floor cannot rescue it — without its own rule it is the one mark type that silently vanishes in the gallery.)_
- A-29k Adding one pin is **one** Undo step — a single Undo removes the whole pin, circle and numeral together. `[Playwright]` _(§4.10's "Undo/Redo are per-mark", and the stated reason this is a shape type rather than circle + text. A composed implementation passes A-29e–A-29h and fails here.)_

**Markup tool state and authoring (§4.10)**

> **Restored [S98].** A-24–A-24d and A-25–A-25d were **deleted in error** by the Option A rewrite
> (`6808d2e`), which replaced the criteria list from A-23e to the PWA heading and swallowed both blocks.
> Neither ruling asked for their removal, and eight normative sentences lost their only coverage. The
> ID-sequence diff in this session's report is what surfaced it.

- A-24 The active markup tool is distinguishable without colour — it carries a **border** and a label change. _(Corrected [S98]: this read "a label weight change". §4.10 specifies `1.5px #f2453d` border plus a red icon **and label** — a colour change, not a weight change. The criterion was testing something the spec does not say, so it could pass on a build that violated §4.10. The border half is the colour-independent signal; the build must not substitute tint alone.)_ `[Playwright]`
- A-24b Undo and Redo operate per-mark, and Redo renders dimmed when the redo stack is empty. `[Playwright]` _(§4.10. See also A-29k, which pins the per-mark rule for the composite-looking pin specifically.)_
- A-24c Cancel with unsaved marks prompts for confirmation; Cancel with no marks exits directly. `[Playwright]`
- A-24d Markup opened from a punch item or an incident returns to that record and stays linked to it. `[Playwright]`

**Viewer gestures and actions (§4.9)**

- A-25 Every gesture on M-9 has a visible on-screen equivalent: swipe-to-page is mirrored by the prev/next circles, and swipe-down-to-dismiss by the close ✕. `[Playwright]` _(§4.9's "the arrows are the visible equivalent of the swipe". A gesture-only affordance is unreachable for anyone who cannot perform the gesture.)_
- A-25b A photo carrying markup is visibly marked as such **in the viewer**. `[Playwright]` _(§4.9. A-23q covers the gallery/filmstrip indicator; the viewer's own indicator had no criterion.)_
- A-25c Tapping **Source** navigates to the originating daily log, delivery, or safety incident. `[Playwright]`
- A-25d Delete prompts for confirmation and is refused for roles that cannot delete. `files_delete_owner_admin` (`20260101000000_baseline_schema.sql:3608`) restricts DELETE to Owner/Admin — "role-gated" in §4.9 means Owner/Admin, and the UI must not offer an action the DB will reject. `[live]`
- A-25e The zoom control renders on the image stage — `−` and `+` at rest, plus `Fit` only when zoomed above fit — and each steps the zoom without a gesture. `[Playwright]` _(**Restored and now fully assertable [S98, Josh].** It was previously recorded as unassertable because pinch had no visible equivalent; the control closes that, and §4.9's "no gesture without a visible equivalent" rule now holds uniformly for all three gestures.)_
- A-25f No control overlaps another at any zoom level — the zoom stack and the prev/next circles keep their clearance on the 330px stage. `[Playwright]` _(§4.9. The stage is fixed-height and crowded; a control that covers the next-photo arrow trades one accessibility failure for another.)_
- A-25g While zoomed above fit, a horizontal swipe **pans** and the prev/next circles **still page**. `[Playwright]` _(§4.9. At zoom the arrows stop being an equivalent of the swipe and become the only way to page, so a build that disables them while zoomed strands the user.)_

**PWA**

- A-26 The app installs to an iOS home screen and launches at `/m` in standalone display. `[manual]` — no tool installs a PWA to an iPhone home screen; this is a release check on a real device under any tooling choice.
- A-26b The manifest declares `start_url: "/m"` and `display: "standalone"` — the two fields M6M owns. `[unit]` _(Rewritten [S98]: the old form also asserted `short_name: "FrameFocus"` and `#14213d` literally, which would have to be edited by the rebrand and would pass in the meantime while shipping a stale product name.)_
- A-26b2 The manifest's `name`, `short_name`, `theme_color` and `background_color` are **read from the shared brand source**, not written as literals in the manifest — changing that source changes the manifest with no edit to it. `[unit]` _(§7.1. This is the criterion that fails on a stale product name **without naming the new one**: if the rebrand lands and the manifest still ships the old value, the manifest and the source disagree and this breaks.)_
- A-26b3 No product name appears as a string literal anywhere in the `/m` tree or the manifest. `[unit]` _(A-26b2 alone passes on a build that reads the source **and** hard-codes a duplicate elsewhere; this catches the duplicate.)_
- A-26b4 §2's `navy` UI token and the manifest's `theme_color` resolve **independently** — changing one does not change the other. `[unit]` _(§7.3. They share a value today and are two decisions; a build that aliases them drags the in-app UI to the brand chrome, or freezes the brand chrome to the UI token.)_
- A-26c Icons exist at 192, 512, and 512 maskable, and the manifest references all three. `[unit]`
- A-26d A service worker is registered from the mobile layout and exposes the queue's retry hook. `[Playwright]`
- A-26e The mobile document head carries `apple-mobile-web-app-capable` and the status-bar-style meta. _(§7.4 — the iOS Web Push precondition D-10 depends on, so a regression here silently blocks Gate 4.)_ `[Playwright]`
- A-27 A full `npm run build` passes with the mobile tree present. `[build]`

**The app bar after D-36**

- A-40 The app bar renders **no right-hand element** — no avatar, no initials badge, no icon, no button — on every `/m/**` route, and the title block runs to the bar's right inset. `[Playwright]` _(§3.1 as amended, D-36. An absence assertion in the shape of A-10d and A-11e: the avatar was specced for the whole of this document's life, so a build that restores it satisfies every other criterion here.)_
- A-40b The only interactive control in the app bar is the hamburger — or, inside a project, the back chevron — and **never both at once**, on every `/m/**` route. `[Playwright]` _(§3.1. A-4 tests the project case; this asserts the count company-wide, which is what stops a "restore the avatar as a menu button" edit.)_

**The six hamburger destinations (§4.13)**

- A-41 Opening the sheet on each of `/m/schedule`, `/m/expenses`, `/m/subs`, `/m/team`, `/m/contacts`, `/m/settings` in turn, **exactly one tile carries the blue border and blue label, and it is the tile for that route.** `[Playwright]` _(§3.3 + §4.13. This is what makes **A-3c** assertable at all — before §4.13 every tile pointed at `/dashboard/**`, the sheet only rendered on `/m/**`, and no tile could ever match, so A-3c's positive half was unassertable and its negative half passed vacuously. Walking all six is deliberate: a build can get the highlight right for one tile and wrong for the rest. **Amended [S100, D-38]:** `/m/dashboard` is removed from the walk — cutting that tile removed the only one with no `/m` route, so **every** tile in the grid is now a live destination and this criterion covers the whole set rather than most of it.)_
- A-41b On `/m/schedule` the **Settings** tile is not highlighted, and on `/m/settings` the **Schedule** tile is not. `[Playwright]` _(§3.3's prefix rule. A build matching on `startsWith(href)` without the trailing-`/` guard is the failure; these two are the closest pair in the set.)_
- A-42 On all six routes the tab bar renders and **no tab carries the active state**. `[Playwright]` _(§4.13's common rules. A-1c fixes the active tab for the routes a tab owns; these are owned by none, and a build that lights Projects "so the bar isn't empty" misstates where the user is.)_
- A-42b All six carry the **hamburger**, not a back chevron. `[Playwright]` _(§4.13's common rules as ruled in **D-39**. Not cosmetic: a back chevron makes the sheet unopenable on exactly the screens A-3c/A-41 are about.)_
- A-42c Each of the six renders its **own empty state** when its source returns nothing — naming what is missing — and never an indefinite spinner. With the network disabled each also renders the app-wide offline strip. `[Playwright]` _(§4.13's common rules + §5.4.)_
- A-42d Every number, date, amount, ID, phone number and expiry on all six renders in IBM Plex Mono; none renders in Barlow. `[Playwright]` _(§2. A-10 asserts this for M-2 only; §4.13 adds five list screens and the first currency.)_

**Dashboard — CUT [S100, D-38]**

- A-43 **The hamburger sheet renders no Dashboard tile, and `/m/dashboard` does not resolve.** `[Playwright]` _(**Rewritten [S100, D-38].** _Superseded text, quoted not deleted:_ _"`/m/dashboard` renders no currency figure of any kind — no portfolio contract value, no `awaitingSum`, no sum derived from `change_orders.net_delta` — under every role."_ The screen is cut, so a criterion about what it renders has nothing to test. This is now an **absence assertion** in the shape of A-10d, A-11e and A-40, because the tile was in §3.3 for the whole of this document's life and a helpful build will put it back. It asserts **both halves deliberately** — a tile with no route is an inert tile (the A-12c failure), and a route with no tile is an orphan only reachable by typing a URL.)_
- ~~A-43b~~ **DROPPED [S100, D-38].** _Quoted so the deletion is visible:_ _"If the Dashboard tile is ruled cut, the sheet renders six tiles and `/m/dashboard` does not resolve. If it is ruled kept, the sheet renders seven and `/m/dashboard` renders a screen."_ It was written as a conditional **because the ruling was open**. D-38 closed it, so the conditional has one branch left and that branch is now A-43 plus A-3b's count. Keeping it would mean maintaining two criteria that assert the same fact.
- ~~A-43c~~ **DROPPED [S100, D-38].** _Quoted:_ _"No attention item on `/m/dashboard` carries an `href` resolving to `/dashboard/**`."_ The attention feed was the only content the screen would have carried; with no screen there is no feed and no href. **The concern it protected is not lost** — D-13's "no mobile surface opens a desktop page" is asserted for the tiles that still exist by A-12c and A-12d.

**Schedule (§4.13.2)**

- A-44 `/m/schedule` binds to `getCalendarEvents({})` with **no `projectId` and no `ownMemberId`**, and a crew member sees a **task** assigned to a teammate on a project they are assigned to. `[live + Playwright]` _(§4.13.2. The desktop dashboard passes `ownMemberId` for crew; passing it here would hide rows RLS grants, which is the UI-disagrees-with-RLS failure §4.13's common rules forbid.)_
- A-44b A crew member does **not** see another member's **general** entry on `/m/schedule`. `[live]` _(§4.13.2. `schedule_entries_select_scoped` does this at the database; the criterion exists so a build "fixing" A-44 by querying with elevated rights is caught.)_
- A-44c Event source — task / general / inspection — is conveyed by a **text label**, not by `color` alone. `[Playwright]` _(§4.13.2, the same accessibility class as A-10b and A-24.)_
- A-44d `/m/schedule` groups by day with **today first, then ascending**, and past days sit **above** today rather than being dropped. `[Playwright]` _(**New [S101].** §4.13.2 specifies the ordering in a sentence and nothing tested it. `getCalendarEvents` sorts plain ascending by `start_date` (`schedule.ts:200`), so a build that renders the service's order untouched puts last month at the top and **passes every other Schedule criterion**.)_
- A-44e Each row renders `title`, the mono date range, `project_label` where set and `member_name` where set — and a row whose `project_label` is null renders **no empty label slot**. `[Playwright]` _(**New [S101].** §4.13.2's row contents. The null case is the one a build gets wrong: `CalendarEvent.project_id`/`project_label` are nullable for a `general` entry with no project.)_

**Expenses (§4.13.3)**

- A-45 `/m/expenses` renders `amount` in IBM Plex Mono on every row. `[Playwright]` _(§4.13.3 + D-37. The first currency on `/m`; §2's mono rule has no currency exception.)_
- A-45b Signed in as **crew_member**, `/m/expenses` lists only expenses that member authored — a teammate's expense on the same project does not appear. `[live]` _(§4.13.3. `expenses_select_scoped`'s author branch. This is the criterion that proves the screen is row-floored at the database rather than filtered in the UI.)_
- A-45c Signed in as **foreman**, `/m/expenses` lists both own expenses and a teammate's expense on an assigned project. `[live]` _(§4.13.3. The complement of A-45b — without it, a build that simply filtered to "mine" for everyone would pass A-45b and be wrong.)_
- A-45d `/m/expenses` issues **no UI role check** on `amount` — the rendered row set equals what `getExpenses()` returns for that caller, for all six roles. `[live + Playwright]` _(§4.13.3. The default this spec sets is "show what RLS returns". If Josh rules that crew must not see amounts, **this criterion is the one that gets rewritten**, and it is named here so the rewrite is deliberate rather than a silent divergence.)_
- A-45e `/m/expenses` renders **no** labor cost, burden, committed total, retainage or job-cost rollup figure under any role. `[Playwright]` _(§4.13.3's cut list. `getJobCostRollup()` is one call away and carries all five.)_
- A-45f `/m/expenses` offers **no** approve, reject, capture or allocation control under any role, including Owner. `[Playwright]` _(§4.13.3. Read surface in v1.)_
- A-45g The chip row renders exactly **Mine / Pending / All**, single-select, and each changes the rows listed. "Pending" returns the same set as `getPendingExpenses()`. `[live + Playwright]` _(**New [S101].** §4.13.3's chips had no criterion. The `getPendingExpenses()` half is what stops the chip and that function drifting apart — they are specced as the same predicate.)_
- A-45h Tapping a row's receipt opens **M-9**, the existing viewer, and **no second image surface is built** under `/m/expenses`. `[Playwright]` _(**New [S101].** §4.13.3 binds receipts to `getExpenseReceipts()` and says "no second image surface"; nothing tested the second half, which is the one a build violates by adding a lightbox.)_

**Subs & Vendors (§4.13.4)**

- A-46 `/m/subs` renders **no** `default_hourly_rate`, **no** `default_markup_percent` and **no** `ein`, under every role including Owner and Admin. `[Playwright]` _(§4.13.4. `getSubcontractors()` does `select('*')` and `subcontractors_select_authenticated` has **no role floor**, so all three reach the client for every caller — the same shape as TECH_DEBT #117. The Owner/Admin pass matters most: a build that adds a role gate "because owners may as well see it" satisfies every other criterion and reintroduces a UI-only gate.)_
- A-46b An expired `insurance_expiry` carries the `#c0362c` treatment **and** a text label; expiry never renders as colour alone. `[Playwright]` _(§4.13.4, same accessibility class as A-10b.)_
- A-46c `phone`, `mobile` and `email` are tap-to-act (`tel:` / `mailto:`) on `/m/subs`, `/m/contacts` and M-17. `[Playwright]` _(§4.13.4, §4.13.6, §4.11.7 — the reason all three screens exist on a phone.)_
- A-46d `/m/subs` chips are **All / Subs / Vendors**, single-select, bound to `sub_type` — `subcontractor` and `vendor`, the only two values `subcontractors_sub_type_check` permits — and each changes the rows listed. `[Playwright]` _(**New [S101].** §4.13.4's chips had no criterion.)_
- A-46e `/m/subs` renders `license_number` in mono where set, and renders **no empty slot** where it is null. The status pill carries its **text label**, never colour alone. `[Playwright]` _(**New [S101].** §4.13.4 states both and neither was asserted; `license_number`, `trade_type` and `insurance_expiry` are all nullable on the table.)_

**Contacts (§4.13.6)**

- A-49 `/m/contacts` chips are **All / Leads / Clients**, single-select, bound to `getContacts({ contact_type })` → `lead` / `client`, and each changes the rows listed. **"All" is the unfiltered call**: a contact whose `contact_type` is one of the other five permitted values — `vendor`, `architect`, `inspector`, `building_dept`, `other_external` — **appears under All** and is never hidden by the chip row. `[live + Playwright]` _(**New [S101].** §4.13.6. The chips deliberately do not cover the domain, so the criterion that matters is that the uncovered five stay reachable — a build that filters "All" to `lead|client` loses five contact types silently.)_
- A-49b A contact with `first_name`/`last_name` renders those; a contact whose person fields are empty renders **`company_name`**; neither renders a blank row or a stray separator. `[Playwright]` _(**New [S101].** §4.13.6's naming rule. `contacts` permits a company-only row — all three of `first_name`, `last_name` and `company_name` are nullable — so this is a real state, not a defensive check.)_
- A-49c The `contact_type` label renders from **`CONTACT_TYPE_LABELS`**, never the raw enum — `building_dept` renders as **"Building Dept"**. The status pill carries its **text label**, never colour alone. `[Playwright]` _(**New [S101].** §4.13.6. `building_dept` and `other_external` are the two values that make a raw-enum build visibly wrong, which is why the criterion names one.)_
- A-49d `/m/contacts` renders **no `notes` and no `tags`**, under every role. `[Playwright]` _(**New [S101].** §4.13.6's cut. `getContacts()` does `select('*')` so both arrive in the payload for every caller — the cut is UI-only, and this is the criterion that holds it. Same shape as A-46, and the reason is the same: RLS grants the row either way.)_

**Team (§4.13.5)**

- A-47 `/m/team` binds to `getMembers()` (`company_members`) and **not** to `getTeamMembers()` (`profiles`) — subcontractor members appear, and no `profiles.role` is rendered. `[live + Playwright]` _(§4.13.5. The two are not interchangeable and the wrong one silently drops every sub from the roster.)_
- A-47b The count on §3.3's Team tile equals the number of rows `/m/team` lists. `[Playwright]` _(§4.13.5. Both are bound to `getMembers()`; this is what stops the badge and the screen drifting, the same guarantee D-16 gives the punch counter.)_
- A-47c `/m/team` offers **no** invite, deactivate, role-change or password-reset control, and renders **no** pay or cost rate. `[Playwright]` _(§4.13.5's cut list; the rate half is the §4.11.8 precedent.)_
- A-47d `/m/team` chips are **All / Crew / Subs**, single-select, bound to `member_type` — `crew` and `subcontractor`, the only two values `company_members_member_type_check` permits — and each changes the rows listed. `[Playwright]` _(**New [S101].** §4.13.5's chips had no criterion. Unlike M-29's, these two **do** cover the domain, so All = Crew ∪ Subs and a build can be checked against that.)_
- A-47e A member's initials avatar is tinted with `schedule_color`, and a member whose `schedule_color` is null falls back to §2's amber rather than rendering an untinted or transparent chip. `[Playwright]` _(**New [S101].** §4.13.5 states the fallback in a clause; `company_members.schedule_color` is nullable and the null case is what a build skips.)_

**Settings (§4.13.7)**

- A-48 `/m/settings` renders **no editable control of any kind** — no input, no select, no toggle, no save — signed in as **owner**. `[Playwright]` _(§4.13.7. Read-only for every role including Owner is the ruling; testing the Owner is the only test that can fail, since a gated role would see nothing either way.)_
- A-48b `/m/settings` renders the signed-in `display_name`, the `member_type`, **the signed-in role**, the company `name`, and the company `timezone` in mono. `[Playwright]` _(§4.13.7's two bound blocks. The positive half, so "read-only" is not satisfied by an empty screen. **Role added [S101]** with the correction to §4.13.7: it is bound to a **new named function**, not to the mobile layout, whose `profiles` select never carried it.)_
- A-48e `/m/settings` reaches the signed-in role through a **named service function**, not an inline Supabase query in the page, and **not** through a prop or context added to `MobileShell`. `[shell]` _(**New [S101].** §4.13.7's correction rules the mechanism, not just the output — A-48b would pass on either. This is the criterion that fails if the shell is widened to courier data it does not render, which is what the ruling rejected.)_
- A-48c `/m/settings` renders **no** OT threshold, week-start day, paid-break rule or GPS mode. `[Playwright]` _(§4.13.7's cut list. `getCompanyTimeSettings()` returns all four alongside the timezone the screen does render, so this is the easiest cut in §4.13 to undo by accident — and the OT one would reintroduce exactly what **D-35** removed from 7a.)_
- A-48d `/m/settings` carries **no** Sign out control. `[Playwright]` _(§4.13.7. Sign out lives in §3.3's sheet; two routes to one destructive action is how they end up with different confirmations.)_

**Design tokens (§2)**

- A-50 Every currency figure anywhere on `/m` renders as **`$1,234.56`** — leading `$`, comma thousands separators, **exactly two decimals** — with negatives as **`-$1,234.56`** (minus before the symbol) and a **null amount as the em-dash `—`, never `$0.00`**. `[Playwright]` _(**New [S101], D-46.** §2's money token. Written against the **rendered output** rather than a function name on purpose: §2 leaves the formatter's home open (mobile one-liner now, `packages/shared/utils/` eventually), so a criterion naming a function would break on the move while a criterion naming the string survives it. The null case is the one a naive `toLocaleString` gets wrong — `Number(null ?? 0)` renders `$0.00`, and on a field screen that is a different fact from "not recorded".)_

**Regression**

- A-28 `apps/web/app/dashboard/**` is unchanged by this work — `git diff --stat` against the merge base shows no desktop route files. `[shell]`
- A-28b No `lib/services/*` file is duplicated for mobile — the mobile tree imports the existing service functions. _(§1 "The service layer is shared… No duplicate data access is written for mobile" was normative and untested. Assertable by grep over the diff.)_ `[shell]`

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

A-15, A-15b, A-16, A-16b, A-19b, A-19f, A-19g, A-19i–A-19l, A-20c, A-20d, A-21c–A-21j, A-22c,
A-23–A-23d, A-23l and A-29d, plus A-28/A-28b as
shell checks. Two of these deserve their mechanism spelled out because the assertion runs backwards:

- **A-16b** — insert session (`clock_out` NULL) → segments → UPDATE `clock_out`, then repeat with
  `clock_out` set on the initial insert and assert the segment insert is **rejected**. The failing
  direction is what proves §5.5.1 is a real constraint and not a style note.
- **A-21d** — currently **fails**, and must, until the §7a migration lands. It is the failing-then-passing
  assertion the house rule requires for that migration.

**House rule.** Every fix still needs a failing-then-passing assertion. Under D-18 that rule is now
satisfiable for every criterion in §10 except A-26, which is manual by nature.
## §11 — Decision register (twenty-nine ruled [S98–S99, Josh]; one open, out of scope)

> **[S99, first pass]** Five rulings — **D-28…D-32** — closed GAP-8 and reversed the markup display rule
> (**seventh ruling pass**). The S98 header read _"twenty-one ruled; nothing open"_.
>
> **[S99, second pass]** Three more — **D-33…D-35** — closed three of the four items that pass left open
> (**eighth ruling pass**). **The only item still open is the desktop markup derivative, ruled out of
> scope.** Five smaller questions surfaced while applying D-33/D-34 and are flagged, not decided — listed
> under "Still open after the eighth pass".

The eight questions from the S98 gap pass are closed, as are the three follow-ups from the second ruling
pass, the display question from the third, the pin gap from the fourth, both audit items in the fifth, and
the segment-type collision in the sixth. **Nothing raised in this session remains open.** GAP-8 — the five
unspecced field-capture screens — is still outstanding and is stated in the status block. One *pre-existing*
schema gap surfaced while specifying the overlay and is flagged below. The rulings are recorded as D-14
(amended) and D-17…D-21 in §0 — D-17, D-20 and D-21 each extended, D-21 twice — and applied throughout
§4, §4.7a, §5, §5.7, §7a, §7b, §8a, §9 and §10.
Options considered are dropped rather than preserved — §0 is the register of what was decided, this is
the register of where each ruling landed.

| # | Question | **Ruling** | Applied in |
| - | -------- | ---------- | ---------- |
| 1 | What backs the unseen-photo dot? | **Deferred to v2. No dot, no view-tracking table.** Photos badge is the total count alone. | D-14 amended; §4.3; §8a; §9 v2 note; A-13 rewritten |
| 2 | Desktop edit vs queued offline copy? | **The server version stands.** Queued copy neither overwrites nor is discarded — it leaves the queue for Owner/Admin reconciliation, and the field user is told. | D-17; **§5.6** (new); §9; A-19b–A-19f (new) |
| 3 | Offline test tooling? | **Both** — unit tests for queue logic, **Playwright** for screen-level. Playwright is a new dependency. | D-18; **§10a** rewritten; every §10 criterion now carries a harness marker |
| 4 | What does `{m} estimating` count? **(D-23)** | **Dropped.** Header shows the active count only; no status added to `projects_status_check`. | §4.2; §8a; A-10c rewritten |
| 5 | How is `62%` derived? | **Cut from v1.** No progress bar on M-2, no Progress stat on M-3; strip respecced to two stats. | D-19; §4.2; §4.3; §8a; §9; A-10d, A-11e |
| 6 | What is "Up next" bound to? **(D-24)** | **The schedule** — next upcoming item from the existing calendar UNION. No milestone concept introduced. | §4.3 binding table; §8a; A-11f–A-11i |
| 7 | Subcontractor photo access? | **Subs upload AND annotate** [extended S98]. **Four** policies widened — two on `public.files`, two on `storage.objects`; **first build step**. | D-20; **§7a** rewritten; A-21d–A-21j |
| 8 | Markup storage? | **Both stored**; [S98, final] **the overlay displays**, drawn live from `markup_data` over the original. Derivative is a sharing artifact only. | D-21; §4.10; **§4.7a**; A-23–A-23t |

### Second ruling pass [S98] — three follow-ups ruled

| Item | **Ruling** | Applied in |
| ---- | ---------- | ---------- |
| Subcontractor UPDATE policy | **Widen it too.** Same discipline — role array only. | D-20 extended; §7a rewritten to four policies; A-21f–A-21j |
| Conflict holding store | **Add it.** Server-side table, Owner/Admin read, resolved rows kept. | D-17 extended; **§5.7** (new); §7b; §5.6 bounded-gap language removed; A-19g–A-19l |
| Markup derivative | **Confirmed as stored** — but the display question it raised was then re-ruled; see the third pass below. | D-21; **§4.7a**; A-23e, A-23f–A-23t |
| Pin shape (4th pass) | **Add the type, schema v2.** Number stored; `next = max + 1`. | D-22; **§4.10a**; §4.10; A-29–A-29k |

### Third ruling pass [S98] — the display rule, and what it reverted

**Ruled: Option A.** The UI renders the original with the annotation layer drawn live over it from
`files.markup_data`, on all three surfaces. The derivative is **not** the display source; it reverts to a
sharing artifact that Save still writes.

This closed the blocked item by removing its premise — with nothing consulting a derivative at display
time, the desktop-authored population (markup, no derivative) is simply correct. **No desktop change, no
backfill, D-2 and A-28 untouched.** A-23g2 is the criterion that proves it.

**Verified buildable before specifying it**, because the alternative was a genuine stop: shapes are stored
in the original's natural pixel space **and `markup_data` carries `imageWidth`/`imageHeight`**
(`packages/shared/types/markup.ts:57-64`). Without those two fields a thumbnail would have had to download
the full-resolution original just to learn its aspect ratio, and Option A would have been impractical.
A pure SVG renderer over exactly this schema already exists at
`packages/shared/components/MarkupViewer.tsx` with **zero consumers** — and it sits outside
`apps/web/app/dashboard/**`, so adopting it touches neither A-28 nor D-2.

**Three hardenings reverted**, added while the derivative was briefly load-bearing:

| Hardening | Then | Now |
| --------- | ---- | --- |
| A-23j | A failed derivative meant Save must not report success | Save **reports success**; the failure is a non-blocking notice about the sharing image (§4.7a.5) |
| Regeneration | A correctness requirement — stale meant the wrong image on screen | **Cosmetic again** — stale means an out-of-date share |
| A-23l signed URLs | Required for the display path | **Kept**, now for the sharing path |

Demoting the derivative left one hole nothing else covered, so it is specced rather than assumed: if the
derivative is missing or stale at share time, sharing **degrades to the original with a warning** and never
passes off an unmarked photo as marked (A-23t).

### Fifth ruling pass [S98] — twelve screens, zoom, segment default

Both items the audit left open are **CLOSED**, and one new collision opened.

| Audit item | **Ruling** | Applied in |
| ---------- | ---------- | ---------- |
| Twelve dead tiles | **Spec all twelve.** No tile cut, disabled, or pointed at a desktop page. | **§4.11** (M-11…M-19), §1 route tree, A-12c–A-12e, A-30–A-39b |
| Pinch-to-zoom | **Add a visible control.** | §4.9; A-25e restored and now assertable, A-25f/g |
| Segment type | **Default `work`, switch after.** | D-25, **§4.5a**, A-7b–A-7i |

**Nine new routes, three shared.** M-7's Photos, Deliveries and Daily-logs tiles resolve to M-8, M-15 and
M-6 rather than getting duplicates (§4.11.10); Safety is M-7's only new route.

**None of the three stop conditions fired.** M-13 can show a change order without its value, so there is
no D-9 collision; M-11 is not a duplicate of M-3 once M-3's four figures are excluded from it; and M-7's
Photos tile is confirmed to be the same screen as M-3's, not a second one.

**One decision made inside the ruling, and reversible.** `net_delta` is cut from M-13 **for every role,
including Owner and Admin** (§4.11.3). Showing it would require the first role-gated figure anywhere on
`/m`, and the column is UI-gated only with no DB floor behind it (TECH_DEBT #117). If Owner/Admin should
see CO values on mobile, that is a ruling, not a build detail.

### Sixth ruling pass [S98] — segment type at clock-in, CO value cut

**The D-25 collision is CLOSED — dissolved, not worked around.**

| Item | **Ruling** | Applied in |
| ---- | ---------- | ---------- |
| Segment type | **The user selects it as part of clocking in.** No default, no skippable prompt, no post-hoc switch on the clock-in path. | **D-27** (D-25 superseded, quoted not deleted); §4.5, **§4.5a**; D-12 restated; A-7b–A-7j |
| CO value | **Cut for every role, Owner and Admin included.** | **D-26**; §4.11.3; A-33, A-33c |

**Why the collision dissolved.** D-25 defaulted the type, so the app committed to `work` — and its project
requirement — before knowing whether a project existed. Under D-27 the user names the type first, so the
project question is already answered by their choice. There is no longer a path on which the app composes
a clock-in the database will reject.

**The complete per-type rule is now recorded** (§4.5a), and it corrects a gap in §8a: the CHECK partitions
**all six** types three-and-three, and **`material_run` and `warranty` require a project just as `work`
does**. §8a had named only the three forbidden types and implied `work` was the sole project-carrier. A
build that read "not work" as "no project" would have been rejected on two types.

**"One tap to clock in" is withdrawn.** The real interaction is two taps and a confirm for a project type,
one tap and a confirm for a project-less type. The claim appeared only in D-25's own text and in the
criterion that tested it; both are superseded.

**The mid-shift switcher is GAP-8's, and its absence is now a recorded consequence:** a crew member who
clocks in on the wrong type has **no in-app correction path in this spec's surface set** (A-7j asserts the
switcher is absent, so the omission cannot be mistaken for an oversight). When that handoff lands it must
close-and-open rather than edit in place, and honour the per-type table — a constraint on the future
handoff, stated in §4.5a.

### Fourth ruling pass [S98] — the pin shape### Fourth ruling pass [S98] — the pin shape

**Ruled: add a `pin` type; `MARKUP_SCHEMA_VERSION` → 2** (D-22, §4.10a). The gap predated this session
and surfaced while reading the schema the overlay depends on; it is now closed.

**The number is stored, not derived.** The trade was between gaps and silent renumbering, and stability
won: a derived number renumbers survivors after a delete, which retroactively rewrites the meaning of a
daily-log line reading _"cracked sill at pin 3"_. Stored numbers leave gaps — {1,3,7} is a correct
sequence — and no tidy-up renumber is offered. The rule that follows is `next = max + 1`, **never**
`count + 1`, which would duplicate a number after any delete (A-29g).

**Forward-compatibility verified before writing it**, because a throw would have been a stop and the fix
would have landed in shared code. All three shape switches skip unknown types today —
`markup-editor.tsx:558`, `:627`, `MarkupViewer.tsx:98`, each `default: return null`. **So this ruling
exposes no defect and creates none.** A-29b locks that behaviour so a later refactor to an exhaustive
`never` check cannot turn a skip into a throw.

**Two consequences worth knowing**, neither a blocker: pins **round-trip** through a v1 editor intact
(it re-saves the array it loaded, `markup-editor.tsx:42`) but render as **nothing at all** there until
desktop adds the case — a photo pinned on the phone looks unpinned on desktop while the data is fine.
And the `version` field **can lie**: a v1 desktop save writes `version: 1` over content containing v2
pins, so readers must be tolerant by shape type and never gate on the version number (A-29c).

**First ruling this session to touch shared code desktop imports.** A-28 holds —
`packages/shared/**` is not `apps/web/app/dashboard/**` — but §4.10a.5 says so plainly rather than
letting a passing criterion imply the change was confined to `/m`.

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

---

### Seventh ruling pass [S99, Josh] — the field-capture reconciliation

**GAP-8 is closed** (§8, §4.12). Five rulings, recorded as **D-28 … D-32** in §0.

| # | Question | **Ruling** | Applied in |
| - | -------- | ---------- | ---------- |
| 9 | Route or sheet for 7b/7c/7d/7e? | **PAGES.** Real routes under `/m/`; the ✕ chrome is styling, not structure. Decided once for all four. | **D-28**; §1 (M-20…M-23); §4.12 |
| 10 | Hazard → incident escalation? | **CONTEXT ONLY.** Opens a blank 7e pre-filled with project and date. **No draft row; nothing persists unless submitted.** | **D-29**; §4.12.3; §4.12.5 |
| 11 | The four unenforced UI rules? | **DB CONSTRAINTS** — a third migration, specced not written. Three reach; **the damage-photo rule does not**, and §7c says where it cannot rather than pretending. | **D-30**; **§7c** (new) |
| 12 | Markup display source? | **REVERSED — the DERIVATIVE displays.** Option A overturned; its premise (desktop-annotated photos needing preservation) does not exist. Viewer toggles back to the original by swapping files. | **D-31**; **§4.7a** rewritten; §4.7a.0 (new); §4.7a.5 re-promoted; A-23e/f/g/h/i/j/k/r/s rewritten; **A-23e2, A-23g2, A-23p deleted**; A-23m/n/o re-scoped to M-10 |
| 13 | The mid-shift switcher? | **ADOPTED** — a gap, not a contradiction. A-7j **rewritten**, A-7g **revived**. | **D-32**; §4.5a; §4.12.2; A-7g, A-7j, A-7j2–A-7j4 |

**Correction applied regardless of any ruling.** §4.5a and A-7h both stated the note-on-end rule had
"no CHECK behind it". **`time_segments_note_on_end_check` is live and DB-enforced.** Both corrected, and
A-7h's harness moved `[Playwright]` → `[live]` because the assertion is a database refusal.

### Open — carried into build [S99]

**§11 is a register, not a queue — but these four are genuinely open and are recorded rather than
guessed.** Nothing here blocks the build.

**[S99, second pass] Three of these four are now RULED — D-33, D-34, D-35.** The table is kept with each
row's original wording so the question is legible next to its answer.

| Item | Status | Original reason it was open → **resolution** |
| ---- | ------ | ------------------------------------------- |
| **7a pre-selects a project** | ✅ **RULED — D-33** | _"D-27's 'no default' is scoped to the **type** … Nothing locked forbids a pre-selected *project*. Contrary to D-27's spirit … but not to its letter."_ → **The spirit governs. No pre-selection; sort nearest-first; the "Here" chip becomes a status indicator.** §4.12.1; A-7l, A-7l2. |
| **GPS capture (7a)** | ✅ **RULED — D-34** | _"No criteria invented. Behaviour on permission denial is undecided."_ → **Always requested, no opt-out, never blocking, and the reason for an absent fix is recorded in the existing jsonb** from the browser's own error codes. §4.12.1a; A-7k–A-7k5. |
| **OT week line (7a)** | ✅ **RULED — D-35** | _"No criteria invented. Note TECH_DEBT #92: changing `week_starts_on` re-buckets historical weeks."_ → **CUT.** #92 is the reasoning, not a footnote: a crew phone is the wrong surface for a figure that silently re-buckets. §4.12.1b; A-7m. |
| **The desktop markup editor writes no derivative** | 🔶 **STILL OPEN — out of scope** | D-31 makes the derivative the display source, so a desktop-annotated photo with no derivative renders **unmarked** on mobile. Ruled explicitly as **not fixed here**; M6M states no criterion for it. **[S99] Logged as tech debt in a parallel session; stays recorded here as open.** |

Two smaller items with no criterion attached, noted where they arose rather than invented into rules:
**flattening quality** at thumbnail size (A-23p's deletion removed the text-legibility rule and nothing
replaced it, §10), and **7b's timeline bar**, adopted as drawn with no criterion because it is derived
display over `time_segments` and introduces no data.

---

### Eighth ruling pass [S99, Josh] — closing the open items

Three of the four items left open by the seventh pass are ruled. Recorded as **D-33 … D-35** in §0.

| # | Question | **Ruling** | Applied in |
| - | -------- | ---------- | ---------- |
| 14 | 7a project pre-selection? | **NO PRE-SELECTION; SORT NEAREST-FIRST.** Extends D-27 from type to project — the app does not guess and let the user correct. The "Here" chip becomes a **status indicator**, not a selection. Wrong-project time lands in job costing. | **D-33**; §4.12.1; A-7l, A-7l2 |
| 15 | GPS? | **ALWAYS REQUESTED, NEVER BLOCKING, REASON RECORDED.** No opt-out. Nullable columns stay nullable. Absence is explained by a `reason` + `error_code` **inside the existing jsonb**, mapped from `GeolocationPositionError`. | **D-34**; **§4.12.1a** (new); A-7k–A-7k5 |
| 16 | OT week line? | **CUT.** The data exists and is deliberately not surfaced — D-19's shape, TECH_DEBT #92's reasoning. | **D-35**; **§4.12.1b** (new); A-7m |

**One required change to existing desktop code, owned by D-34.**
`app/dashboard/timeclock/timesheets/live-board.tsx:129` reads `gps_in != null ? ' · on site' : ''`.
Once a failed fix writes an object instead of NULL, **a denied-permission session renders as "· on site"**.
The test must become "has coordinates". This is a defect D-34 introduces, so D-34 fixes it — it is not
shielded by A-28, which protects desktop from *this spec's* scope creep, not from its consequences.
A-7k5 asserts the behaviour rather than the file.

### Ninth ruling pass [S100, Josh] — the avatar, D-9's narrowing, and the seven orphan tiles

Two rulings, recorded as **D-36** and **D-37** in §0, plus the spec pass they enabled.

| # | Question | **Ruling** | Applied in |
| - | -------- | ---------- | ---------- |
| 17 | The 38px app-bar avatar? | **CUT.** Not resized, not made tappable. §3.1 gave it a size and no action, and 38px is under §2's 44px floor — so it was either a sub-spec tap target or decoration spending the app bar's scarcest resource. The hamburger stays; Sign out stays in the sheet. | **D-36**; §3.1 (amended); A-40, A-40b |
| 18 | Expenses on mobile? | **IN SCOPE. D-9 NARROWED, NOT REVERSED.** Budget, Invoices, Payments and Contracts stay out and are deferred to v2; the exclusion list loses exactly one member. | **D-37**; **§4.13.3** (new); §9; A-45–A-45f |

**The spec pass this enabled.** All seven §3.3 tiles had a label and nothing behind it — no route, no
section, no criterion. **§4.13 is new** and specced them as **M-24 … M-30** under §4.11's rules, with
seven routes added to §1's tree. **The tenth pass then cut one of the seven** — see below; §4.13 as it
now stands is six screens, M-25 … M-30. What the pass turned up, beyond the two rulings:

- **A-3c was unassertable and is now satisfiable.** Every tile pointed at `/dashboard/**` while the sheet
  only rendered on `/m/**`, so no tile could ever match the current location: the positive half could not
  be tested and the negative half passed vacuously. Real `/m/` routes fix it. **A-41** walks the set.
- **One §4.11 common rule could not carry over.** These take the **hamburger, not a back chevron** —
  not for symmetry, but because a back chevron makes the sheet unopenable on exactly the screens A-3c is
  about, which would strand the criterion a second time. Flagged here for confirmation; **ruled in the
  tenth pass as D-39.** §4.13's common rules; A-42b.
- **Dashboard has no distinct job, and §4.13.1 said so rather than inventing content.** Every non-money
  KPI `getDashboardData()` returns is already owned by M-2, M-3, M-13 or M-14; the money ones are out
  under D-26 and D-9-as-narrowed; and all three attention item types are office admin with `/dashboard/**`
  hrefs. **Recommendation: cut the tile.** Left as an open ruling because the tile set was declared
  unchanged — **accepted in the tenth pass as D-38.**
- **Settings has no personal half to carry.** The entire desktop settings surface is company-level and
  Owner/Admin-gated at the page (`settings/page.tsx:32`), and **no personal-settings surface exists
  anywhere in the product** — a user's own record is edited by an Owner or Admin through team management.
  M-30 is therefore **read-only for every role including Owner**, showing identity and company facts only.
- **A new finding of the #117 class, on a different table.** `getSubcontractors()` does `select('*')` and
  `subcontractors_select_authenticated` has **no role floor**, so `default_hourly_rate`,
  `default_markup_percent` and `ein` reach every role including crew. §4.13.4 cuts them at the UI and
  **says plainly that the cut is UI-only** — a leak here would not be caught by RLS. Whether the table
  needs a real floor is **out of scope for M6M and belongs in TECH_DEBT alongside #117**.
- **Expenses does NOT introduce a role-gated figure, and §4.13.3 shows the working.** Unlike
  `net_delta`, `expenses_select_scoped` is a real DB row floor, and an expense amount is *actual cost* —
  which the Financial Visibility Floor makes visible to every role by design. The screen is identical for
  all roles; the row set differs, at the database. **The product question — whether mobile should show
  less than RLS returns — is deliberately not decided here** and is carried below.

### Still open after the eighth pass

**Flagged, not decided** — each surfaced while applying D-33/D-34 and none was ruled:

| Item | Why it is flagged rather than decided |
| ---- | ------------------------------------- |
| **Is the crew told location is being captured?** | D-34 mandates capture with **no opt-out**, which makes notice a separate question from consent. The OS permission prompt is not notice from FrameFocus — it names the browser, not the employer, and says nothing about retention or who reads it. Whether M-5 carries a persistent line, a one-time explainer, or nothing is **not ruled**, and it is the kind of question that is cheaper to answer before the screen ships than after. Likely has an employment-law dimension that is outside this spec entirely. |
| **Fallback order when there is no fix** | D-33 sorts nearest-first; D-34 makes a fix best-effort, so "no fix" is a normal state, not an edge. The list needs a defined order then — scheduled-first, recently-used, or alphabetical. A-7l2 asserts a *defined* order exists without naming which. |
| **`navigator.geolocation` absent entirely** | The three browser error codes cover permission and signal. A browser with no Geolocation API produces **no code at all**. `reason: "unsupported"`, `error_code: null` is the natural extension of §4.12.1a's table; it is **not ruled**, and it is nearly unreachable on the PWA's target browsers. |
| **Retention and read access for location data** | D-34 records more than before — a denied permission is now a durable fact about a person rather than an absence. Who may read `gps_in`, and for how long it is kept, are unaddressed. `time_clock_sessions` follows the standard company-scoped RLS with no role floor on these columns. |
| **The desktop markup derivative** | Unchanged from the seventh pass — out of scope, logged as tech debt in a parallel session. |

### Eleventh ruling pass [S101, Josh] — location, expenses roles, checked_in_at, CO intent, money format

Seven rulings, **D-40 … D-46** in §0. Five close items this document had been carrying as open; two are
new. Plus the two spec defects the pre-build verification found.

| # | Question | **Ruling** | Applied in |
| - | -------- | ---------- | ---------- |
| 21 | Who reads location, and for how long? | **OWNER/ADMIN ONLY. 30 DAYS.** Neither half is enforced today and **both need a migration**, not a UI change. | **D-40**; §4.12.1a |
| 22 | Are crew told in-app? | **NO.** Reasoning recorded as Josh's; possible employment-law dimension **logged, not advised on**. | **D-41**; §4.12.1a; A-7n |
| 23 | `deliveries.checked_in_at`? | **YES.** The RPC becomes a state transition. Specced, **not migrated**. | **D-42**; §7c; TECH_DEBT #134 |
| 24 | Expenses — who enters/views/edits? | **Everyone enters and views; everyone edits their own; only Owner/Admin edit anything.** **A-45d stands.** | **D-43**; §4.13.3 |
| 25 | 7a fallback order with no fix? | **RECENTLY-USED**, then alphabetical for members with no history. **No source function exists** — said plainly. | **D-44**; §4.12.1; A-7l2 rewritten, A-7l3 |
| 26 | CO lifecycle on mobile? | **INTENT RECORDED, SCREEN DEFERRED.** Does not reverse D-26. | **D-45**; §4.11.3 |
| 27 | What does money look like on `/m`? | **`$1,234.56` / `-$1,234.56` / `—`.** Desktop's existing format, cited not invented. **§2 token**, so the next money screen inherits it. | **D-46**; §2; A-50 |

**Two spec defects fixed, both found by the pre-build verification rather than by a ruling:**

- **§4.13.7 claimed a query that does not exist.** "The signed-in role comes from the `profiles` read the
  mobile layout already performs" — `app/m/layout.tsx:42` selects `company_id` only, and **`role` was
  never in that query**. Corrected with the superseded sentence quoted. **Ruled: a second read in the
  page via a new named function, not an extended layout** — the blast-radius comparison is in §4.13.7,
  and the deciding factor is that `MobileShell` is mounted by every screen and would become a courier
  for data it does not render. A-48b amended, **A-48e added** to assert the mechanism rather than just
  the output.
- **M-29 Contacts had no criteria at all** — the same class of gap the S98 audit caught. **A-49 … A-49d
  added**, covering the chips (including that the five uncovered contact types stay reachable under
  "All"), the `company_name` fallback, the label map, and the `notes`/`tags` cut.

**Plus the unasserted list mechanics across the other four:** A-44d/A-44e (ordering, null `project_label`),
A-45g/A-45h (chips, receipts→M-9), A-46d/A-46e (chips, nullable `license_number`), A-47d/A-47e (chips,
null `schedule_color`). And the **empty-state copy** M-27, M-28 and M-29 were missing.

### Still open after the ninth pass [S100]

**Flagged, not decided** — each surfaced while applying D-36/D-37 and writing §4.13:

| Item | Why it is flagged rather than decided |
| ---- | ------------------------------------- |
| **Should mobile show LESS than RLS returns on expenses?** | **The one question D-37 explicitly did not answer.** §4.13.3 establishes what the database permits: `expenses_select_scoped` gives crew and subcontractors **their own expenses only**, foreman and PM their own plus assigned projects, Owner/Admin everything — and an expense amount is *actual cost*, which the Financial Visibility Floor makes visible to all roles by design. So showing `amount` on every returned row is **not** a role gate. Whether product policy nonetheless wants crew to see no figure even on their own receipt is a ruling, not a build detail. The spec's default is **show what RLS returns**; **A-45d is the criterion that gets rewritten** if that changes, named so the rewrite is deliberate. |
| ~~**The Dashboard tile — cut, keep, or keep-as-attention-feed?**~~ | **CLOSED [S100, D-38] — CUT.** The recommendation was accepted in the tenth pass. Kept in this list rather than deleted so the question's short life is visible: raised and answered within one session. |
| **What currency looks like on `/m`** | M-26 is the first money on mobile. §2 fixes the typeface (mono, like every number) and says nothing about symbol, thousands separator, or how a negative renders. **One answer is needed before a second money screen exists to disagree with it.** Cheap now, a reconciliation later. |
| **Does `subcontractors` need a real role floor?** | New finding of the TECH_DEBT #117 class, on a different table: `select('*')` plus a policy with no role floor puts `default_hourly_rate`, `default_markup_percent` and `ein` in every role's payload. §4.13.4 cuts them at the UI and says the cut is UI-only. **Out of scope for M6M** — it is a Module 2 / Financial-Visibility-Floor question, and belongs in TECH_DEBT next to #117 rather than being solved inside a mobile spec. |
| ~~**Should mobile show LESS than RLS returns on expenses?**~~ | **CLOSED [S101, D-43] — no.** Everyone enters and views; everyone edits their own; only Owner/Admin edit anything. **A-45d stands.** The ruling turned out to be *wider* than the live policies rather than narrower — see §4.13.3's comparison table for the two gaps it opens against `expenses_select_scoped` and `expenses_update_authorized`. |
| ~~**The Dashboard tile**~~ | **CLOSED [S100, D-38] — cut.** |
| **NEW [S101] — does `expenses_select_scoped` get widened to honour "everyone views"?** | D-43's "everyone views" clause is **not what the policy does**: `crew_member` and `subcontractor` are absent from its role array and see only rows they authored. Closing that is a migration widening the array, filed as owed work. It is the *opposite* of a role gate, so the Financial Visibility Floor does not block it — an expense is actual cost. **Not written, not scheduled.** |
| **NEW [S101] — does "edits their own" mean always, or only while pending?** | `expenses_update_authorized` allows an author to edit their own **only while `status = 'pending'`**. D-43's wording does not settle whether that qualifier is intended or accidental. **Genuinely ambiguous in the words — ask rather than migrate.** |
| **NEW [S101] — #117's scope question now has a second consumer.** | D-45 defers the mobile CO authoring screen but records the intent. Authoring puts `net_delta` on `/m` at the point of entry, and `change_orders_select_visible` still has no role floor and no author scoping. **#117's open question — authored-by scope versus assigned-project scope — should be answered before that screen is built.** |
| **Tap-to-call on M-28** | `company_members` has no phone column; `profiles` has one and is readable company-wide by every role, but **no named list function selects it**. §4.13.5 cuts the feature rather than deriving it. Enabling it is one added column in one existing `select` — recorded so the decision is visible rather than quietly taken. |

### Tenth ruling pass [S100, Josh] — Dashboard cut, hamburger confirmed

Two rulings, recorded as **D-38** and **D-39** in §0. Both close items the ninth pass raised; neither
opens anything new.

| # | Question | **Ruling** | Applied in |
| - | -------- | ---------- | ---------- |
| 19 | The Dashboard tile — cut, keep, or attention feed? | **CUT FROM V1.** The ninth pass's recommendation, accepted. §3.3's grid drops to **six** tiles; §4.13's M-24 is deleted; there is no `/m/dashboard` route. **A v1 cut, not permanent** — D-19's and D-14's shape. | **D-38**; §1; §3.3; §4.13; A-3b, A-41, A-43 (rewritten), A-43b/A-43c (dropped) |
| 20 | Hamburger or back chevron on the destinations? | **HAMBURGER — the §4.11 departure is CONFIRMED as a ruling**, not left as a flagged deviation, so a later reader does not "fix" it back to the chevron for consistency with the twelve section screens. | **D-39**; §4.13's common rules; A-42b |

**What the cut touched, so nothing is left half-done.** D-38 is the first ruling this session to remove a
surface rather than add or narrow one, and a removal leaves more loose ends than an addition:

- **§1's tree** — the `dashboard/page.tsx` line is replaced by an explicit `# NO dashboard/ ROUTE`
  comment. A silent deletion would read as an oversight to anyone diffing against the ninth pass.
- **§3.3** — the tile list is amended with the superseded line quoted, not rewritten.
- **§4.13** — the M-24 subsection is deleted; the heading, the common rules and the counts all read
  "six". **`M-24` is retired and not reused**, and **the subsection numbers keep the matching gap**
  (§4.13 starts at 4.13.2) rather than renumbering and silently repointing eleven criteria plus §3.3's
  table and D-37.
- **§10** — **A-43 rewritten** from "renders no currency" into an absence assertion covering **both**
  halves: no tile **and** no route. A tile with no route is the inert-tile failure A-12c exists to
  catch; a route with no tile is an orphan reachable only by typing a URL. **A-43b and A-43c dropped**,
  each with its text quoted so the deletion is visible rather than a gap in the ID sequence — the
  failure mode the S98 audit caught when the Option A rewrite silently swallowed A-24 and A-25.
  **A-3b** rewritten to six named tiles; **A-41** now walks six routes; **A-42 … A-42d** re-counted.
- **§11** — the ninth pass's open item is struck through and marked closed rather than deleted, so the
  question's one-session life stays visible.

**What the cut did NOT touch, deliberately.** `getDashboardData()` and the desktop dashboard are
untouched — D-38 is a mobile scope ruling, not a judgement on the desktop screen, which keeps every
figure listed above and is the right place for all of them. **A-28 is unaffected.**
