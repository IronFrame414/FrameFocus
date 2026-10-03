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
