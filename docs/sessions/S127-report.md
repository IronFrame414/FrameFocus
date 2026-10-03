# S127 — report (unattended; research → plan → build)

> Lead sections (WHAT JOSH DOES, 1.4a, RULINGS NEEDED, PLAN) are written at the top once phase 2 lands.
> Until then this file grows from the bottom, one finding per commit.

---

# PHASE 1 — RESEARCH

## 1.0 — Peers

`ListAgents` at session start: *"No reachable agents — no other Claude session is running on this machine
right now."* This session is `framefocus-21`. **No peer, so no stop.**

## 1.1 — The ground (ref: `origin/main` after `git fetch --prune`, 2026-10-03)

- `origin/main` = **`fc220fd0`** *"docs: S127 prompt and open-work bundle [skip ci]"*. The prompt expected
  `71a039d5`; `fc220fd0` is its direct child and adds only the prompt and the bundle. The checkout was on `main`
  at session start; no edits were made there.
- `docs/specs/OPEN-WORK-BUNDLE.md` is on `main` (841 lines), read in full.
- The claimed SHAs, checked with `git merge-base --is-ancestor <sha> origin/main`:

| part | SHA | on `main`? |
| --- | --- | --- |
| S124 Part 0 (email pacing) | `5a78a648` | ✅ yes |
| S124 Part 2 (the switch) | `81fe1efc` | ✅ yes |
| S124 Parts 1 + 3 | `9e08c3dc` (`feature/s124-p1-push` head, confirmed) | ✅ **NOT** on main, as claimed |
| S125 audit report | `71a039d5` | ✅ yes |

## 1.2 — S124's report rescued

`git log --all --pretty=format: --name-only -- '*S124*report*' | sort -u` → exactly one path,
`docs/sessions/S124-report.md`, present only on `feature/s124-qb-timesheets` (`d49ed832`). Brought onto `main`
with its prompt and spec as **`c92900e2`** (docs only, `[skip ci]`, a fast-forward of `fc220fd0`). Read back:
`git ls-tree origin/main docs/sessions/` lists `S124-report.md` once. One report file, not two.
(`feature/s124-qb-timesheets` also carries `test/qb-sandbox-gate.ts` and its live test. Those belong to Part 1,
which is DO NOT TOUCH, and they also exist on `feature/s124-p1-push`. Not brought over.)

## 1.3 — Does `main` require a passing status check? **NO.**

- `gh api repos/IronFrame414/FrameFocus/branches/main` → `"protected": false`,
  `required_status_checks.enforcement_level: "off"`, `checks: []`, `contexts: []`.
- `gh api repos/IronFrame414/FrameFocus/rulesets` → `[]` (no rulesets).
- `…/branches/main/protection` → HTTP 403 *"Resource not accessible by integration"*. That is the token's scope, not
  an answer, so it is not counted.
- Corroboration by effect: `fc220fd0` and `c92900e2` were pushed straight to `main` with `[skip ci]` and accepted.

⇒ **§ 8 rule 1 applies:** a merge may carry `[skip ci]` when tree identity is proven and printed. No proof, no skip.

## 1.4b — The trash scope matrix (code: agent read of `origin/main` `c92900e2`; counts: production, read-only)

**Josh's "the trash isn't rendering anywhere" is mostly right.** Only **four** entities have a trash list a user can
reach from the UI, and every one of them is desktop-only. **`/m` has no trash screen at all.**

| entity | soft delete from | trash reader | reachable trash UI | restore wired |
| --- | --- | --- | --- | --- |
| files, documents | desktop Files tab row actions | `getFiles({only_deleted})` `files.ts:140` | ✅ `/dashboard/projects/[id]/files/trash` (Files tab "Trash" button, `files-list.tsx:68`) | ✅ `restoreFile` |
| **files, photos** | `/m` grid bulk delete (`photo-grid.tsx:446`), `/m` viewer (`viewer.tsx:366`), desktop markup page | the same reader; it has no category filter | ⚠️ **desktop only, indirectly:** a trashed photo shows in the *Files* tab's Trash. **The Photos tab has no Trash link, and `/m` has none** | desktop only |
| contacts | contacts list / sheet | `getDeletedContacts` | ✅ `/dashboard/contacts/trash` | ✅ |
| subcontractors | list / sheet | `getDeletedSubcontractors` | ✅ `/dashboard/subcontractors/trash` | ✅ |
| expenses | expenses page | `listDeletedExpenses` | ✅ `/dashboard/expenses/trash` (Owner/Admin) | ✅ |
| **projects** | "Move to Trash" (`status-control.tsx`) | `getProjectTrash` exists, **0 callers** | ❌ **no page** | `restoreProject` exists, **0 callers** |
| contact_addresses | none (reads filter `is_deleted=false` only) | — | — | — |
| tasks, phases, punch lists/items, daily logs, estimates, sub-bids, change orders, POs/deliveries, safety incidents, inspections, employee docs, team members, catalog/templates/categories/pay rates | each has a soft-delete path | none | ❌ | ❌ |
| invoices, selections | a service function, **no UI caller** | none | ❌ | ❌ |

- **Photos' storage objects are KEPT on soft delete** (`softDeleteFile` updates the row only). They are removed by
  permanent delete, Empty Trash, or the 6-month purge cron (`lib/files/trash-purge.ts`, `/api/cron/file-trash-purge`).
  ⚠️ **So a trashed photo is on a 6-month clock**, and today the only way back is the Files tab's Trash on desktop.
- Who may trash or restore a photo: `canDeletePhoto` / `canTrashFile` (`lib/photos/delete-permission.ts`) allow
  **Owner, Admin, PM, Project Executive**, and RLS enforces the same list (`20262030000000_s118_file_trash_floor.sql`).
  Permanent delete is Owner/Admin.

### Already soft-deleted on production (2026-10-03, `jwkcknyuyvcwcdeskrmz`, every `public` table with `is_deleted`, 90 tables)

| table | deleted / total | company | reachable today? |
| --- | --- | --- | --- |
| **files** | **7 / 390**, all **images**, all with a project, deleted 2026-09-23 → 2026-10-02 | Worth Properties | desktop Files → Trash only. **Not from Photos, not from `/m`** |
| estimates | 3 / 16 | Worth Properties | ❌ **no trash, no restore** |
| company_members / profiles | 3 / 13, 3 / 9 | — | removals; not a trash question |
| site_visits | 1 / 5 | Worth Properties | ❌ |
| subcontractors | 1 / 4 | Worth Properties | ✅ subcontractors trash |
| cost_catalog | 1 / 626 | H&H Signature Renovations | ❌ |
| project_assignments | 1 / 24 | — | an unlink |
| **every other table** (projects, contacts, tasks, daily logs, …) | 0 | — | — |

⇒ **4 rows in user-facing entities (3 estimates, 1 site visit) are soft-deleted with no way back except SQL. The 7
photos have a way back only from a screen nobody would look in.** Reported only; nothing changed.

## 1.4c — The segment-type defect: production count (paths: see 1.4c-paths below, once the read lands)

Production (`jwkcknyuyvcwcdeskrmz`), read-only:
- Triggers on `time_segments`: `time_segments_z_reopen_on_hours_change` → `reopen_session_on_segment_hours()`. That
  function **returns early when `segment_start`, `segment_end` and `is_deleted` are unchanged**. Its own comment calls
  that *"attribution only (job, task, note, completion): hours unchanged"*, but `segment_type` is **not** in that list
  and **not** in the check. **The defect is confirmed in the live definition.**
- `audit_time_segment_edit()` **does** record `segment_type` from→to in `time_edit_logs`, so history exists to count from.
- **Count:** `time_edit_logs` 16 rows total; **0 carry a `segment_type` change**, so **0 sessions** have had a type
  flipped, approved or not. Sessions by status: approved 9, pending 10, NULL 6.
- ⚠️ Residual: the audit skips a member's own edit made outside the sheet functions (`v_me = v_target`, no flag). An
  Owner/Admin flipping the type on **their own** segment through PostgREST would leave no log. The 6 NULL-status
  sessions are Owner sessions that are never approved, so on today's data this changes nothing.
⇒ **Ruling #9 has nothing to report: there are 0 affected approved days on production.**

## Item 8 — `feature/s114-c5-multi-upload`: ⛔ THE REVERT REASON STILL HOLDS → STOP. Not discarded.

- The branch is one commit, `6409738e` (2026-09-28), 17 files, +620/−127. Its own message: *"C-5 remains UNPROVEN per
  TECH_DEBT #2-s180u (one proof per surface owed); not for merge until those exist."*
- **The revert**, `39d4a493` on `main`: *"per-component verification = a test PER SURFACE ("8 components, 8 proofs …
  A single batch test is not acceptance."). C-5 as built has a helper test and a timing run, not eight surface proofs."*
- Since then, `main` met that ruling with a **different implementation** (S116, merge `5b5cc366`: `runUploadBatch`,
  `useUploadBatches`, `makeAttachWorker`, plus 8 per-surface specs `e2e/s116-c5-*.spec.ts`). S121 §1.6
  (`S121-report.md:327-337`) and `TECH_DEBT.md` `#181` both record that this branch is the version that was replaced,
  with a duplicate-on-retry defect, and that merging it would add a **second upload mechanism (PARITY)**.
- **Tested against today's `main` (`c92900e2`) myself:** `git merge-tree --write-tree --name-only origin/main
  origin/feature/s114-c5-multi-upload` → exit **1**, **10** `CONFLICT (content)`; `uploadRemaining` (the branch's
  mechanism) has **0** references on `main`.
- **Verdict: STOP (ruling #10).** The branch still has 0 per-surface proofs of its own, and `main` has replaced what it
  does. Merging it would overwrite or duplicate the proven S116 code in 10 files. **Branch left untouched.** Its useful
  remainder is the step-2 `multiple` attributes on 4 inputs, which is `#181` and should be built fresh from `main`.
  **Discarding it stays Josh's call.**

## 1.4a — ⛔ CONFIRMED: deactivating a member on `/m` cuts NOTHING. Removing them from the desktop team page cuts everything.

**Instrument:** `apps/web/test/s127-member-removal.live.ts` (branch `feature/s127-member-removal`, `2d8895c7`), run 4× on
rebuild-test `nmyphyhmfttxkdoposvf`. The live guard decoded the key's own `ref`. Two throwaway users were adopted as
**Admin** into the QA tenant (Sabal Point Construction, `03bb903f`). Each signed in **before** removal, and the **same
client, same JWT,** probed before and after. Writes were made **without returning rows** and **counted with the service
role** by a unique marker. Storage was judged on an object the token had **never requested**.

| probe (same token) | before (control) | **P** — desktop team page `softDeleteTeamMember()` (real function, Owner's session): profile deleted + 876000h ban | **M** — `/m` "Inactive": `company_members.is_deleted = true` only, the form's exact write through the Owner's session |
| --- | --- | --- | --- |
| `get_my_company_id()` | company A | **NULL** | ⛔ **company A** |
| `get_my_member_id()` | the member | NULL | NULL *(the control that must fire: it did)* |
| read `projects` | 17 | **0** | ⛔ **17** |
| write `contacts` (service-role count) | 1 | **0** | ⛔ **1** |
| download a never-requested object | > 0 | **0** | ⛔ **2,163,602 bytes** |
| `createSignedUrl` | yes | **refused** | ⛔ **issued** |
| `get_approved_change_order_summaries()` (SECURITY DEFINER) | 6 rows | **0** | ⛔ **6 rows** |
| a brand-new password sign-in | — | **refused** | ⛔ **succeeds** |

The final run (`mr4.log`): **3 passed, 1 failed**. The failure is M, by design: the test states the secure expectation.
Cleanup left **0** marker contacts, and both subjects were removed.
**Cross-tenant control** (Ridgeline's Owner downloading the same object): **0 bytes**. The storage policy can refuse.

**What it means:**
- **The M path is real and shipped.** `/m/team/[memberId]` → Edit (`data-testid="m-member-edit"`, Owner/Admin only)
  → Active/Inactive → `updateMember()` (`lib/services/members-client.ts:92`). It writes `company_members` and nothing
  else. `get_my_company_id()` (baseline, never redefined) reads only `profiles`. Every company-wide RLS arm, every
  storage policy, and every function gated on it **never sees the deactivation**. The person keeps full company access
  at their role, **with no time limit**: they are not banned, so their sessions refresh and they can sign in again.
  An Admin can do this to anyone, including another Admin or the Owner (`company_members_update_authorized`).
- **The only thing M cuts is assignment-scoped access** (`get_my_member_id()` → NULL). An Owner or Admin keeps
  everything; a foreman or crew member keeps every company-wide policy.
- **Is it live on production? Latent, not live, today.** Read-only query on `jwkcknyuyvcwcdeskrmz`: every
  deactivated person (3, all Worth Properties: crew, admin, project executive) has `profiles.is_deleted = true` **and**
  an active ban, so all three went through the safe path. **0 people are member-only deactivated with a live login.**
  The screen that produces the state ships today, so the next person deactivated on `/m` would keep access.
- **A second path that cuts nothing:** deleting a **subcontractor** whose directory row is linked to a login
  (`deleteSubcontractor`, `subcontractors-client.ts:46`) writes only `subcontractors.is_deleted`. It doesn't touch the
  member row, the profile or the ban.
- **Already known as `#1-s109`** (`TECH_DEBT.md:848`, *"latent, 0 reverse ghosts on production at S109"*), and
  `20261710000000` records the `/m` toggle as *"NOT COVERED, BY RULING (ASK-160.B)"*. ⚠️ What S109 did not establish
  is the **consequence**: it filed this as a sync gap, but it is an access gap. This probe is the first test of what a
  member-only-deactivated person can still do.
- **Residual in P (low):** the object the token **had already downloaded** before removal was served again afterwards
  (147,191 bytes). Its fresh object, signed URL, read, write and function were all refused, and the cross-tenant control
  was refused, so this is a cached response keyed to that token for bytes the person already holds, not the policy
  admitting them. Recorded, not fixed.
- **The consequence for 16b:** the desktop team-page removal **does** cut access immediately in the database, because
  `get_my_company_id()` returns NULL on the very next request whatever the token says. So 16b is **not killed by P**.
  But M shows the database, not the Auth-server call, is what protects data; an Auth-server `getUser()` does not
  catch M either (the user isn't banned). **16b stays deferred as ruled.** It is not in this session, and its own
  session must take M's fix as a precondition.

## 1.4c — The segment-type defect: every path (code, `origin/main`)

The model: `time_segments.segment_type` ∈ work, material_run, warranty, travel, shop, break. A day is one
`time_clock_sessions` row, and `status` ∈ pending/approved (NULL means an Owner session). Paid hours depend on type only
through `break` (`breakMinutes`, `paidHours`, `paidHoursPerSession` against `breaks_paid` / `paid_break_cap_minutes`).
A break↔work flip always changes `project_id` as well, because the project gate requires one and forbids the other.

| path | who | can reach an approved day | reopens today? |
| --- | --- | --- | --- |
| week sheet → `edit_time_segment` RPC (also add/split) | Owner/Admin | yes | ✅ yes: `s121_time_reopen` runs unconditionally, and the notice shows |
| day page, admin branch → `editSegmentFull` → the same RPC | Owner/Admin | yes | ✅ yes |
| **day page, supervisor branch → `updateSubordinateSegment`**, a plain `.update()` whose `SEGMENT_ATTRIBUTION_COLUMNS` include `segment_type` | **PE, PM, foreman** over lower-ranked members | yes | ⛔ **NO** (audited, no notice) |
| **direct PATCH by Owner/Admin** (RLS allows; the dead `updateSegment` has 0 callers) | Owner/Admin | yes | ⛔ **NO**, and unlogged on their own segment |
| **direct PATCH by the segment's own member** (`is_my_recent_segment`; the UI exposes it only on the open session) | any role, own latest segment | **yes, via the API**: the latest ended segment of a closed approved day qualifies | ⛔ **NO**, and **not audited** |
| clock in / switch / clock out / offline queue | self | — | they never change type |

The root is `reopen_session_on_segment_hours()`. Its "attribution only" early return watches `segment_start`,
`segment_end` and `is_deleted`, and **not `segment_type`**. Its self-skip exempts every non-Owner/Admin self writer, not
just the open session. ⚠️ **So the brief's framing (an Owner/Admin flip) is slightly off.** The Owner/Admin UI already
reopens. The UI path that does not is the **supervisor's**, and the two API paths (Owner/Admin own segment, and a crew
member's own approved break) do not either.

## 1.4d — The floating bottom bar (`/m` daily log close-out): cause found by reading, NOT proven

- The shell is `relative flex h-[100dvh] flex-col overflow-hidden` (`app/m/mobile-shell.tsx:477`). The tab bar is a
  flex child, not `fixed`. `<main>` is the scroller. **`html` and `body` have no height or overflow lock**
  (`globals.css` sets only `bg-white`), and the safe-area inset is applied **once** (`mobile-shell.tsx:640`).
- The close-out page adds nothing positional: no fixed/sticky element, no `vh`, no inset, no transform. Its only
  distinguishing feature is **four native date/datetime pickers** in a very long form (`daily-log-closeout-fields.tsx`
  `:82, :111, :131, :179`), the densest use of them in `/m`.
- **Most likely cause:** after a native picker or the keyboard is dismissed, iOS leaves the **window** (not `<main>`)
  scrolled. With `html`/`body` free to scroll, the 100dvh shell sits shifted up and the **white `body`** shows beneath the
  tab bar. The band's colour fits, since the shell is `#f4f6fa`. Second most likely: `100dvh` mis-measured in
  standalone after the keyboard closes. Ruled out by code: a double safe-area inset.
- **Proposed fix (not built, per the prompt):** lock the document (`html, body { height:100%; overflow:hidden;
  overscroll-behavior:none }`) or make the shell `fixed inset-0`, plus a `scrollTo(0,0)` on `focusout`/`visualViewport`
  resize when `scrollY ≠ 0`. **It needs a real iPhone at 402px:** pick a date, dismiss it, and see whether the band
  appears. Reading `window.scrollY` / `visualViewport.offsetTop` at that moment confirms the cause.
- **Box C's "both dates show today":** production's 2 logs have `tasks_tomorrow_date` = the log date + 1, correctly,
  and `tasks_day_after_date` NULL. **No code puts today into either field.** An **empty** `<input type="date">` on iOS
  draws today's date while its value is `''`. So Josh's screenshot shows two **empty** fields, and the box is confusing
  rather than corrupting data.

## 1.4e — "It asks permission every time": **iOS behaviour, not something the app can stop**

- `captureGps()` (`lib/gps.ts:50-77`) calls `getCurrentPosition` cold on every clock event (`maximumAge 60s`, timeout
  10s mobile / 5s desktop), never queries the Permissions API, never rejects, and always records a reason.
- Nothing in the app discards a grant: one origin, no iframe, no Permissions-Policy header, a service worker scoped to
  `/m` that has no bearing on permissions. The manifest is `display: standalone`, `start_url: /m`.
- **Plainly:** iOS asks a home-screen web app for location again per launch/session when the site's location setting is
  "Ask" (Safari's default). **No app change makes iOS remember the grant.** What Josh can try on the device:
  Settings → Apps → Safari → Location → **Allow**, and Privacy & Security → Location Services → Safari Websites →
  **While Using the App**. Whether current iOS applies those to a home-screen app is unverified. That is B-2's
  reproduction, and it needs his phone.
- The one app-side change available is to query `permissions` first and record `permission_denied` without calling the
  API when it is `denied`. **That saves no prompt** (a denied state doesn't prompt), so **nothing is planned.**
- Parity note: desktop skips capture when `gps_clock_mode = 'off'`; `/m` never reads `gps_clock_mode` (A-7k4,
  deliberate). Recorded, not changed.

## 1.5 — Read before planning: what changes scope

- **P-1 punch duplicates on production:** `punch_list_items` has **0 rows**, so **0 duplicates**, and no constraint
  question arises. Even so, the fix goes in the **application layer** (a client-held request id sent as the row's `id`,
  with a 23505 on that id read back as success). No unique index over production rows; stop rule 2 is not approached.
- **P-1 clock-in:** the second tap hits `idx_time_clock_sessions_one_open_per_member` (unique partial, `member_id WHERE
  clock_out IS NULL AND NOT is_deleted`). `clockIn()` returns the raw Postgres text. `setBusy(false)` runs **before**
  `router.push`, and that gap is the window. `captureGps()` is already inside the busy window and is untouched.
- ⚠️ **P-2 conflicts with a standing ruling.** `app/m/nav-pending.tsx:6-16` records **S112 R2 [Josh]: "drop
  loading.tsx, keep the pending bar … DO NOT ADD app/m/loading.tsx."** A loading boundary makes every page under it
  stream, so `notFound()` returns 200 and a server `redirect()` becomes client-side. That turned 6 CI tests red (run
  36246627024). The prompt's "no `loading.tsx` and nothing streams" is true, and **it is true by ruling**.
- **Box C:** box C's three inputs (`tasks_tomorrow_date`, `tasks_day_after`, `tasks_day_after_date`) are separate from
  the older "Tomorrow" text field (`tasks_tomorrow`, its own disclosure on both forms). Consumers: the close-out view
  (both surfaces) and the PDF's "C — Next two days" section. **Production: 2 of 2 logs carry box C values.**
  ⚠️ **The bundle's "the close-out already requires 4–5 internal photos" is FALSE**: there is no photo minimum, slot or
  category anywhere, and close-out validation is **client-only**.
- **The photo viewer reloads the whole gallery on every swipe: CONFIRMED (mobile).** `goto()` → `router.push` to a new
  `[fileId]` path re-runs the server page. That page re-reads every file and re-signs every original, derivative and
  thumbnail in the project, then re-reads every uploader name (`viewer.tsx:161`, `page.tsx:52,75`). **Desktop has no
  single view at all:** every tile links straight into the markup editor (A-2), sized by width only (A-3), with only the
  file name as metadata (A-4).
- **Holidays (§ 6): rule columns on the existing table, or a second table? → a SECOND TABLE**,
  `company_holiday_rules`. `company_holidays` carries `holiday_date date NOT NULL`-style one-offs, a unique index on
  `(company_id, holiday_date)`, and a mark-dirty trigger. Rule rows have no date, and making `holiday_date` nullable
  plus kind/month/weekday/ordinal columns would put two shapes behind one table's constraints and every reader.
  One-offs stay exactly as they are. **There is no company-level Critical Path flag:** it is per project
  (`project_schedule_settings.enabled_at`). Production: **Worth Properties has 1 CP-enabled project (since
  2026-10-02); H&H has none**, and there are 0 hand-entered holidays.
- **Share-link precedent:** `/sign-co` and `/bid` store **plain-text** tokens; no token is hashed anywhere. The company
  logo is `companies.logo_url`, a public URL in the public `company-logos` bucket.
- **Item 1:** the switch's trigger already turns it off on a transition into `disconnected` or `revoked`, and records
  nothing. `needs_reauth` does **not** turn it off.

---

# PHASE 2 — THE PLAN (as presented, 2026-10-03)

**1.4a, stated plainly: CONFIRMED.** Deactivating a member on `/m` ("Inactive") leaves them full company access at
their role, with no time limit, including a fresh sign-in. Desktop team-page removal cuts everything immediately.
**Production today: 0 people in the exposed state (latent), but the screen that creates it ships.** So item 2 goes
first.

## Build order

| # | item | change | migrations | proof | could break |
| --- | --- | --- | --- | --- | --- |
| 1 | **Item 2: member removal** (BRANCH ONLY, never merged) | `/m` Inactive/Active goes through ONE server mechanism with desktop Remove: Inactive → `softDeleteTeamMember` (profile deleted + ban; the #160 trigger brings the member row); Active → profile restored + unbanned. The member-only write leaves the form. **`get_my_company_id()` is not touched.** | 0 | `s127-member-removal.live.ts` goes green (it is red on main); sabotage: put the member-only write back → red; a re-activation round trip; tsc/lint/unit/build | `/m` team edit for a sub-type member, whose profile links to a sub directory row (the #160 exemption) |
| 2 | **Item 1: the switch's "turned itself off" state** | `companies.qb_time_export_auto_off_at` + `_auto_off_reason` (the real transition, e.g. `connection_revoked` from `connected`); a notification type `qb_time_export_auto_off`; the trigger writes both and notifies **the Owner only**, **only on an on→off change**; a human turning it on clears them; the Accounting screen states WHEN and WHY | 1 | live: Owner-only by **service-role row count**; already-off → **0 rows**, counted both ways; sabotage the notify arm → red; sabotage the already-off path → red; restore, md5 identical; production by object | the trigger replaced in place: captured original + RESTORE committed first |
| 3 | **Item 7: segment type on an approved day** | the trigger's "hours unchanged" test adds `segment_type`; the self-skip narrows to **open** sessions; the supervisor path gets the shared "Hours changed" notice | 1 | live: reopen on every path in the 1.4c table, the note-only control stays approved, the self open-session clock flow still works, a negative per excluded role with no returned rows; 2 sabotages red | the live clock flow (self writes on an open session) |
| 4 | **Item 3 P-1: the two defects** | clock-in: 23505 → "already clocked in" + refresh, busy held through navigation, an in-flight ref; punch: a client-held request id sent as `id`, with 23505 on that id read back as success, busy held through navigation; **both surfaces through the shared service** | 0 | unit tests on the mapping; an e2e double-tap per defect (1 session, 1 item); sabotage → red | `captureGps()` untouched by design |
| 5 | **P-6** | correct `middleware.ts:389-394`, recording that it misled the 2026-09-29 reading | 0 | — | — |
| 6 | **P-4: findings 5, 7, 8, 10** | bound and order `/m/logs` and the schedule window; today's sessions with segments embedded and scoped to the caller; React `cache()` on the per-request readers | 0 | a unit/live row count per query; the existing e2e | "up next" beyond the window |
| 7 | **P-5 (16a)** | pages use the layout's `getRequestUser()` in place of their own `getUser()` | 0 | grep count 79 → 0 in scope; build; e2e | none intended (no security change) |
| 8 | **P-2: feedback** | on my reading of Q-A below: `NavPending` extended to code-triggered navigation, and buttons kept disabled until the next screen arrives, on the field screens ranked by use (timeclock, clock-in landing, daily log, capture/photos, projects) | 0 | e2e on the pending state | — |
| 9 | **Item 4a: photo trash** | a Trash entry on the Photos tab (desktop) and the `/m` photos grid, listing trashed photos (bounded, ordered by `deleted_at`), with restore; shared `lib/` reader | 0 | live restore round trip; role map | — |
| 10 | **Item 4b: A-2..A-5** | a desktop single view: view mode first, markup behind a button, fitted to viewport **height**, date/time/by from a formatter **moved into `lib/` and shared with `/m`**, prev/next + arrow keys **without** re-running the server page per photo | 0 | e2e | — |
| 11 | **Item 4c: B-1** | render `gps_in`/`gps_out` with three distinct states on the day review and week sheet | 0 | unit on the formatter; e2e | — |
| 12 | **Item 5a: the client-facing photo** | box C's inputs hidden (columns kept, existing values still shown and printed); a dedicated "Client-facing photo" slot (≥1, no cap) whose files get `client_visible = true`, **or** a one-tap reason stored on the log; shown on the log and marked in the PDF; the documents-only and markup caveats on screen | 1 (`daily_logs.client_photo_skip_reason`, a new nullable column) | live + e2e | — |
| 13 | **Item 6: standard holidays** | a new `company_holiday_rules` table (kind, month, day, weekday, ordinal, enabled), the seven seeded; the engine resolves years; settings with checkboxes, this year's date, and a consequence preview before applying | 1 | unit on resolution (incl. last Monday / 4th Thursday / Friday after); live; preview count | live Critical Path dates (the preview gates it) |
| 14 | **Item 4d / 4e, P-3, P-7, P-8, P-9** | as specified | 4e: 1 | — | — |

**Not going to reach, said now:** most likely **4e (the public share link), 4d (bulk), P-3 (thumbnail proxy), P-7
(bundle), P-8 (upload queue), P-9 (caching)**. Each is large, and two carry hard gates (the payload proof, the
cross-tenant cache test) that deserve a session rather than a tail. CI is ~50 minutes a run on one shared database, and
it caps the queue more than the code does. **If the road runs out, items stop whole and unmerged, in the order above.**

**Item 8 (`s114-c5`) is already decided: STOP.** The revert reason holds, and the branch is untouched.

## Open questions, with the reading I am taking (not waiting)

- **Q-A — P-2 vs S112 R2 ("DO NOT ADD app/m/loading.tsx").** Options: (A) honour R2: no `loading.tsx`; feedback via
  the pending bar on code navigation plus busy-until-arrival; (B) reopen R2. **Reading: A.** R2 is a standing ruling
  with a measured cost (`notFound()` → 200, 6 CI reds), and the prompt does not mention it, so it did not overturn it.
  Breaks under A: no skeleton screen, only a bar and a held button. Breaks under B: the 404/redirect semantics R2
  protected.
- **Q-B — holiday defaults for an EXISTING company that has never used Critical Path.** The ruling says "off for every
  existing company" and "on for any company that enables CP after this ships". H&H is both. **Reading: the stated reason
  decides.** It protects live CP jobs from being re-dated at deploy. So a company **with a CP-enabled project at ship**
  (Worth Properties) gets the seven **off**, and a company that **first enables CP after ship** (H&H, and every new
  company) gets them **on**, seeded at first enable. Reversible: each is a checkbox. Breaks the other way: H&H's
  first CP job would ignore Christmas until someone ticks it.
- **Q-C — item 2's layer.** **Reading: the application layer** (the fix shape `#1-s109` already records): one mechanism
  for both surfaces, `get_my_company_id()` untouched. A database-layer defence (the tenant gate also requiring a live
  member row) is **proposed, not built**: clients and directory members do not uniformly have member rows, and a wrong
  join there locks out every user. That is exactly what ruling #11 fences.
- **Q-D — a deleted subcontractor whose directory row is linked to a login keeps that login and its access.** Same
  class, different screen. **Reading: report, do not build.** It is not the ruled item, and the sub-login model has its
  own exemptions (#160's ASK-160.C).
- **Q-E — item 1's "real cause".** The switch only turns itself off on a transition into `disconnected` or `revoked`.
  `needs_reauth` (Intuit's `invalid_grant`) leaves it on. **Reading: record the transition actually taken, with its
  from-state, and do not add `needs_reauth` as a new off-trigger.** That would be a behaviour change nobody ruled.
  Flagged so Josh can rule on it.

---

# PHASE 3 — BUILD

## Item 2 — member removal: ✅ BUILT AND PROVEN ON `feature/s127-member-removal` (`fe131aca`). ⛔ NOT MERGED, by ruling #11.

**What changed (0 migrations; `get_my_company_id()` untouched):**
- `lib/team/team-access.ts`: `setTeamMemberLoginActive()`. For a member **with a login**, Inactive calls the **same
  `softDeleteTeamMember()` desktop Remove calls** (profile deleted + 876000h ban), and #160's trigger brings the member
  row. Active reverses it (profile restored through the caller's RLS with a 0-row check, ban lifted), and refuses in a
  trial-locked company so a restore cannot lift the lock. A member with no login is a no-op; their member-only write
  stays correct, because there is no token to cut.
- `lib/team/team-access-actions.ts`: the thin server action (caller + service role).
- `lib/team/team-edit-rules.ts`: `assertCanEditTeamMember`, **moved unchanged** from the desktop actions file so both
  surfaces share one rule. Side effect, and a fix: **an Admin can no longer deactivate the Owner, another Admin or a PE
  from `/m`** (desktop already refused that), and nobody can deactivate themselves.
- `/m` team edit form: the login half runs **first**. If it fails, the roster half does **not** flip `is_deleted` (no
  "hidden from pickers but can still sign in" state), and the failure is shown as its own note (en + es).

**Proofs (rebuild-test, `mr6.log`, verbose):**

| case | read | write | fresh download | signed URL | definer fn | `get_my_company_id` | new sign-in |
| --- | --- | --- | --- | --- | --- | --- | --- |
| before (control, 3 subjects) | 17 | 1 | > 0 | yes | 6 | company A | — |
| P, desktop Remove | 0 | 0 | 0 | no | 0 | NULL | refused |
| **M, `/m` Inactive (new mechanism)** | **0** | **0** | **0** | **no** | **0** | **NULL** | **refused** |
| M, Active again | 17 | 1 | 3,654,530 | yes | 6 | company A | succeeds |
| X, raw member-only API write (residual, `it.fails`) | 17 | 1 | 1,198,463 | yes | 6 | company A | succeeds |

- Live: **5 passed, 1 expected fail** (6). Cross-tenant control: 0 bytes, *"Object not found"*. Cleanup: 0 marker
  contacts left, 3 subjects removed.
- **Sabotage:** `softDeleteTeamMember` call removed from the mechanism → **2 failed** (M Inactive, M Active) → restored
  from the saved copy, md5 `9e67e0e6a7e4d1a64832f743e3273ff8` before and after.
- `tsc` exit 0 (after clearing a stale `.next/types` left by the S124 Part 1 build) · eslint on the changed files exit 0
  · unit **171 files / 2320 tests** exit 0 · `next build` exit 0.
- CI run `37087311433` started on push, 01:45:29Z. Its result is recorded below when it lands.

**⚠️ What it does NOT close (stated residuals):**
1. **A raw member-only write through the API** (an Owner/Admin PATCHing `company_members.is_deleted`) still cuts
   nothing (case X). Item 2 removes the screen that made it. The database-layer defence (the tenant gate also requiring
   a live member row for staff roles) is **proposed, not built**. Ruling #11 fences `get_my_company_id()`, and a wrong
   join there locks out every user, including clients, whose member-row coverage is not uniform.
2. **Deleting a subcontractor whose directory row is linked to a login** keeps that login and its access (Q-D).
3. **The form wiring is proven by type-check and build, not by an e2e:** the existing `/m` e2e never exercises
   `m-team-edit-active`. The mechanism it calls is what the live test drives.

**For Josh:** merge it yourself if you agree. It carries no migration. The live test is the regression guard: its X
case flips red the day the database layer lands, as designed.

## Build state while CI run `37087311433` (item 2's branch) holds rebuild-test (02:10Z)

**Every branch below is pushed, and every commit carries `[skip ci]`:** two branch runs on the one shared database
collide, and a migration must not land on rebuild-test while a run uses it (§ 10). **Nothing is merged yet.** Each
branch gets its CI run in turn, and migration-bearing branches get theirs only after their migration is on
rebuild-test.

| branch | item | migration | state |
| --- | --- | --- | --- |
| `feature/s127-member-removal` `fe131aca` | 2 | 0 | ✅ built + proven; CI running; **not to be merged (ruling #11)** |
| `feature/s127-qb-auto-off` `390b22f5` | 1 | `20262134100000` | code + unit 7/7 + live harness written; **migration not yet applied** |
| `feature/s127-segment-type` `bc420c0b` | 7 | `20262134200000` | original captured (`12a51ec1`); migration, service and live harness written; **not yet applied** |
| `feature/s127-p1-defects` `4975d6e3` | P-1 (+ P-6 `27e40270`) | 0 | unit 8/8, 2 sabotages red, e2e written |
| `feature/s127-p4-queries` `6c4f16e2` | P-4 | 0 | unit 7/7, 4 sabotages red |
| `feature/s127-p5-request-user` `1701cebd` | P-5 (16a) | 0 | 79 pages; guard 3/3; sabotage red |
| `feature/s127-clock-location` `17ff1b52` | 4c (B-1) | 0 | unit 4/4, sabotage red, e2e written |
| `feature/s127-photo-trash` `fdb64300` | 4a | 0 | unit 2/2, sabotage red, e2e written |

**Decisions taken on my own reading, recorded per the prompt:**
- **Migration numbering:** items 1 and 7 are numbered `20262134100000` and `20262134200000`, between S124 Part 2
  (`…134…`) and Part 1 (`…135…`, rebuild-test only). Production therefore takes them in order, and Part 1 still
  applies in order after them. Only rebuild-test needs `--include-all` for these files. **Production order is item 1,
  then item 7.**
- **Item 1's notification is written by the trigger in SQL** (in-app row, no push). That makes every path that can
  disconnect (route, Intuit's redirect, a script) tell the Owner without remembering to. Owner-only by recipient
  query: `profiles.role = 'owner'`.
- **Item 7 counts only changes to or from `break`** (the only type paid hours read). A crew member's own API retype of
  an approved break is **refused** (42501), not reopened: their status write is forbidden by the session column scope,
  as their clock times already are on a closed day.
- **P-4 finding 7:** only the **company-wide** calendar is windowed (−365 / +730 days). Project calendars keep the
  whole job, because the Gantt and the project day view need it. ⚠️ Visible consequence: navigating the company day
  view beyond the window shows nothing there. I also confirmed on rebuild-test (read-only) that two `.or()` filters
  combine with AND.
- **P-5:** scripted, one exact 3-line pattern per page, 79/79 matched. 10 pages dropped a client they no longer used.
  `eslint` and `tsc` are clean.
- **4c:** the day page's "GPS: On site" KPI was **false by construction** (no project has a coordinate), so it is
  replaced, not kept.

## Item 2 — CI `37087311433`: ✅ GREEN (01:45 → ~02:25Z, alone on rebuild-test)

Unit **171 files** passed; e2e **705 passed, 24 skipped, 0 failed** (36.2 m). **Not merged** (ruling #11). The branch is
`feature/s127-member-removal` `fe131aca`, ready for Josh.

## ⚠️ Josh's Q-E ruling arrived mid-build (22:20 ET), and item 1 was changed to match it

*"needs_reauth turns the switch OFF and notifies the Owner … when the connection is restored, the Owner gets a prompt
OFFERING to turn it back on … The offer is an offer … MUST STATE THAT TURNING IT BACK ON SENDS NOTHING THAT WAS MISSED
… Offer it only when the switch turned ITSELF off … Owner only … No repeat noise."*

What I built for it (`051a23c8`, on top of the earlier item 1 commits):
- The trigger now treats `needs_reauth` like `disconnected` and `revoked`: it turns the switch off, records
  `connection_needs_reauth` with the from-state, and sends one Owner notification. The reason CHECK lists those three
  values.
- **A flap produces one off-event:** once the switch is off, `OLD.qb_time_export_enabled` is false, so nothing records
  or sends again. Proved live: connected→needs_reauth→connected→needs_reauth→connected adds **0** rows after the first,
  and `auto_off_at` keeps its first value.
- **A reconnect never turns the switch on, and it leaves the record in place,** so the Accounting screen can show the
  **Owner** (and only the Owner) the offer: *"QuickBooks is connected again. Sending approved timesheets turned itself
  off on <date> because <cause>. It is still off. N days approved while it was off were NOT sent and will not be sent —
  turning it back on sends only days approved from now on. Enter those hours in QuickBooks yourself if you need them
  there."* N comes from `time_clock_sessions` approved since `auto_off_at`. The one click is the existing Owner-only
  "Turn it back on" button, through the S124 route and its confirm. **A switch a human turned off has no record, so it
  gets no offer.**
- The reconnect offer is **on screen only, with no second notification.** The off-event already notified the Owner and
  links to that screen, and the ruling asks for no repeat noise.

## Item 1 — on rebuild-test: ✅ (not yet merged; it waits for CI and production)

- **Section (rebuild-test):** workdir = the branch's migrations + Part 1's `20262135` (so the local history matches the
  remote). `--include-all` dry run → **exactly** `20262134100000_s127_qb_time_export_auto_off.sql`. Before the push the
  live function was confirmed at the S124 captured md5 `57240739…`.
- **Verified by object:** 3 nullable columns with no default; `companies_qb_time_export_auto_off_reason_check` (3
  values) + `…_complete_check`; `notifications_type_check` **21 values = the live 20 + `qb_time_export_auto_off`, all
  known (a superset)**; 0 companies with an auto-off record; history row present.
- `database.ts`: **+9 lines, only this migration's.** The generator also emitted 60 lines for Part 1's `qb_employee_map`
  (rebuild-test only), and those were **excluded**.
- **Live `s127-qb-auto-off.live.ts`: 6/6.**
  - **Owner-only by service-role row count:** after a revoke, `owner: 1` and every other role `0` (a total role map,
    10 profiles).
  - **Already off → disconnected: 0 new rows, counted both ways** (the total is unchanged, and rows since t0 = 0).
  - A client cannot forge or clear the record (Owner session).
  - A human turn-on clears the record.
  - needs_reauth + flap, as above.
  - disconnected → reason `connection_disconnected`.
  - Restored exactly; 0 rows left.
- **Sabotages:**
  - (A) notify arm removed → **3 red**.
  - (B) already-off guard removed → **3 red** (including the already-off test).
  - Both restored. ⚠️ **The first restore failed silently:** the file's leading `--` comment was parsed by the CLI as a
    flag. **The md5 read-back caught it** ("restored" = the sabotage md5). It was restored from the bare definition and
    read back identical. RESTORE now says to use `-f`.
- ⚠️ **3 unit reds I pushed, and fixed:**
  1. `brand-literals`: "FrameFocus" (the pre-rebrand name) in the copy and in the trigger's notification text, now
     `brand.name` / "EZ Contractor Binder". The function was re-applied on rebuild-test from the corrected migration,
     md5 **`65284c5d…`**, and the originals were re-captured.
  2. The `s123-still-clocked-in` producer census gains this migration, with its statement.
  3. S124's rendered-copy check is de-duplicated (the title now renders on two branches; the superseded line is quoted).

  They reached CI run `37090127411` because I pushed before the full unit run finished. **That run is red by my mistake;
  its e2e half still reports.** The fixed head is re-pushed when it ends (it cannot be cancelled, and two runs on one
  database collide).

## Item 7 — on rebuild-test: ✅ (stacked on item 1; not yet merged)

- **Section:** original `reopen_session_on_segment_hours` captured first (md5 `27f18f28…`, identical on both databases,
  committed `12a51ec1` with RESTORE). Dry run → **exactly** `20262134200000_s127_segment_type_reopen.sql`.
- **Verified by object:** md5 `044157b9…`, the type arm present, ACL unchanged, trigger enabled, history row present.
- **Live `s127-segment-type.live.ts`: 13/13.** (The first run was 8 red on a FIXTURE mistake: an ended non-break segment
  needs a note, `time_segments_note_on_end_check`. Fixed and re-run.)
  - **Total role map, break → shop on an approved crew day, judged by the service role:** owner, admin, PE, PM and
    foreman → type `shop`, day `pending`. Client, sub and crew (another member's day: RLS-filtered) → type `break`, day
    still `approved`.
  - break → work (with a job) by a PM reopens.
  - **Controls:** shop → travel keeps the day approved (the write landed); a note-only change keeps it approved; a
    pending day stays pending.
  - **Self:** the crew member's own approved break is refused with **42501** *"This day is approved. Ask a supervisor to
    change a break."*, type and approval unchanged.
- **Regression:** `s122-session-clock-edit.live.ts` + `s121-time-edits.live.ts` **64/64** (the live clock flow and the
  sheet's own reopen are unchanged).
- **Sabotages:** (i) the type arm removed → **7 red**; (ii) the self refusal removed → **1 red**. Both restored with
  `-f`, md5 `044157b9…` read back each time.
- **Ruling #9:** production has **0** affected approved days (1.4c), so there is nothing to correct and nothing was.

## Built since, all on pushed branches with `[skip ci]`, waiting their turn on CI (02:51Z)

| branch | item | migration | proofs so far |
| --- | --- | --- | --- |
| `feature/s127-daily-log-client-photo` `3a316a2c` | 5a | `20262134300000` (a new nullable column) | unit 5/5, gate sabotage red; S118 e2e inverted in place; all three upload paths (online, desktop retry, offline queue) set `client_visible` |
| `feature/s127-holidays` `f4619a2d` | 6 | `20262134400000` (a new table, seeded; dirty-marker extended in place, original captured, md5 `460edf02…` on both databases) | unit 18/18 (year resolution incl. last-Monday / 4th-Thursday / day-after; seed parity with code; the consequence wording); e2e written |
| `feature/s127-share-link` `c16c6e9d` (on 4b) | 4e | `20262134500000` (two new tables) | unit 4/4 (token, payload contract = 3 fields, page and image source); **payload e2e written (a cookie-less fetch of the page's BYTES)** |

All eight earlier branches were re-checked locally: `tsc` 0 and the full unit suite green on each. The one exception,
`s127-photo-trash`, had a hard-coded string caught by the `/m` i18n guard; it is fixed (`562b2ef4`).

**Decisions on my own reading (4e, 5a, 6):**
- **4e:** **Owner/Admin** create, list, revoke and extend public links. Bulk share/delete is Owner/Admin by ruling, and
  this is the most outward-facing act in the viewer. **The token is stored as a sha256 hash** (stricter than the
  `/sign-co` and `/bid` precedents, which store plain tokens). **A photo with markup but no derivative cannot be
  shared:** the preview would show the original, so it is blocked rather than publishing something the preview did
  not show.
- **5a:** the client-photo gate applies to **sending a new log**. Editing a log written before S127 is not blocked,
  because those logs had no such field.
- **6:** Q-B as stated. Worth Properties (Critical Path used) is seeded **off**. H&H and every new company are seeded
  **on**, since they have no Critical Path dates to move. The resolved dates span the project's start year (or this
  year) minus one, through ten years ahead.
