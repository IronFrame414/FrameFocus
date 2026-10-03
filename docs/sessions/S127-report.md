# S127 — report (unattended; research → plan → build)

> **The lead sections below were written after the sixth timeout and are kept current at the end.** The body
> grows from the bottom, one finding per commit. Merge and production facts are in the body, by section.

## WHAT JOSH DOES WHEN HE'S BACK

1. **Reconnect rebuild-test's Sabal Point to the QuickBooks SANDBOX** (it unblocks S124 Parts 1 + 3, still stopped on
   `feature/s124-p1-push`):
   1. In the Codespace terminal, run exactly: `cd /workspaces/FrameFocus && bash scripts/e2e-preflight.sh`
      (it starts ONE dev server on port 3000, against rebuild-test, and says so).
   2. In the browser, open **`http://localhost:3000/sign-in`**. If that does not load (a Codespace opened in a
      browser cannot reach `localhost`), use the forwarded address from the **Ports** tab, port 3000.
   3. Sign in as **Sabal Point Construction's Owner**, `josh+test50@worthprop.com`.
   4. Go to **Settings → Accounting** (`/dashboard/settings/accounting`) and click **Connect QuickBooks**.
   5. On Intuit's screen, choose **"Sandbox Company US cc64"** (realm `9341457813274121`). **Not** any real
      company.
   6. ⚠️ If Intuit sends you to `http://localhost:3000/api/quickbooks/callback?…` and the page does not load, copy
      that address, replace `http://localhost:3000` with the forwarded address from step 2, and press Enter. (The
      app registered `localhost` with Intuit; the server still sends `localhost`, so the exchange matches.)
   7. **It worked if** the Accounting screen says **Connected**, and offers to turn the timesheet switch back on.
      That is item 1's reconnect offer, because the switch turned itself off at `needs_reauth`.
   8. **If not, check:** the address you finished on is `/api/quickbooks/callback` with no `error=` in it; you chose
      the cc64 company; you were signed in as the Owner (Admin cannot connect). Then tell the next session. It
      reads the connection status from rebuild-test, never the tokens.
2. **The floating bottom bar (5b): a real iPhone at 402 px.** On `/m`, open a daily log's close-out, tap a **date**
   field, pick a date, dismiss the picker, and see whether a white band appears under the tab bar. If it does, the
   cause in 1.4d is confirmed and the fix written there can be built.
3. **"It asks permission every time" (B-2): on the same iPhone,** Settings → Apps → Safari → Location → **Allow**,
   and Privacy & Security → Location Services → Safari Websites → **While Using the App**. Then clock in twice from
   the home-screen app and say whether it still asks. No app change can make iOS remember it (1.4e).
4. **Item 2 (member removal) is built, proven and NOT merged, by your ruling #11.** It's on
   `feature/s127-member-removal` `fe131aca`, with CI green. Merge it yourself if you agree. It carries no migration,
   and `get_my_company_id()` is untouched.
5. **Rule on the questions under "WHAT JOSH MUST RULE"** below.
6. **`feature/s114-c5-multi-upload`:** the revert reason still holds (item 8). Discarding it is yours.

## 1.4a — MEMBER REMOVAL: ⛔ CONFIRMED

**Deactivating a member on `/m` ("Inactive") left them full company access at their role, with no time limit,
including a fresh sign-in.** Desktop team-page removal cut everything. **Production: 0 people in the exposed state
(latent).** **The fix is built and proven on `feature/s127-member-removal` `fe131aca` (CI `37087311433` green). NOT
MERGED, by ruling #11.** Full evidence is under "1.4a" and "Item 2" in the body.

## WHAT JOSH MUST RULE

- **R-1 (`#3-share`): a public photo link serves the photo's CURRENT marked-up version.** If markup is edited after
  sharing, the public image changes with it; a link made before any markup keeps the unmarked original. A) keep it
  live (as built); B) freeze a copy at share time (a stored snapshot per link). *Recommend B* if links go to
  outsiders in disputes, since the preview then stays the truth; A is fine if links are only quick sends.
- **R-2 (`#1-share`): add a database check binding `share_path` to its own photo** (defence in depth; the app
  already refuses a foreign path). A) a small migration; B) leave it to the app. *Recommend A.*
- **R-3 (5a, taken on my reading): a log's author makes their client-facing slot photos visible to the client
  without Owner/Admin approval.** That is how the fix works (ruling #4's dedicated slot). A) keep; B) require
  Owner/Admin approval before a client sees them (a different feature). *Recommend A.*
- **R-4 (`#2-share`, pre-existing): the desktop Photos grid shows the client-visibility toggle to every staff role,
  but the database lets only Owner/Admin change it,** so a PM's toggle fails. A) show it to Owner/Admin only; B) widen
  the database. *Recommend A.*
- **R-5 (P-9): cross-request caching of company settings.** *Recommend not building* (body, "P-8 and P-9"): the
  saving is small, and a stale setting changes payroll screens without saying so.
- **R-6 (P-7): send only the active language's dictionary to `/m`** (about −17 KB gz per page, ~8%). A) build it as
  its own item; B) leave it.
- **R-7 (Q-D, from phase 2): deleting a subcontractor whose directory row is linked to a login keeps that login.**
  Same class as 1.4a, another screen. A) route it through the same removal mechanism; B) leave it.

## THE PLAN, AND EVERY DEVIATION

The phase 2 plan is under "PHASE 2" below. Deviations, each with its reason in the body: the train order after the
timeout (5a + 6 first: migration order and a green CI already in hand; 4a + 4b together, since 4b is built on 4a);
**the 5a fix inserted after 5a merged** (a live defect, found and fixed with 0 rows affected); P-5 rode with P-2 (P-2
is built on it); P-3 finished from its WIP after the train; P-7 measured, not built; P-8 not started; P-9 recommended
against.

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

## Production sections for items 1 and 7: expectations STATED BEFORE THE QUERIES (written 03:10Z)

**Pre-state, read-only on `jwkcknyuyvcwcdeskrmz` at 03:05Z (it matched what S124 left):**
`enforce_companies_qb_time_export` md5 `57240739631328c1215351024c4f4a43`; `reopen_session_on_segment_hours` md5
`27f18f288f62a006e12d033b5005741e`; `notifications_type_check` 20 values; companies: H&H `disconnected / switch off`,
Worth Properties `connected / switch off`; latest migration `20262134000000`. Dry run from a workdir of `main` + item
1's file: **exactly** `20262134100000_s127_qb_time_export_auto_off.sql`.

**Item 1, expected after the push:**
1. `schema_migrations` has `20262134100000`.
2. `companies.qb_time_export_auto_off_at` (timestamptz), `_reason` (text) and `_from_state` (text) exist, all nullable,
   no default.
3. `companies_qb_time_export_auto_off_reason_check` allows exactly `connection_disconnected`, `connection_revoked`,
   `connection_needs_reauth`; `companies_qb_time_export_auto_off_complete_check` is present.
4. `notifications_type_check` has 21 values, all known (the 20 + `qb_time_export_auto_off`).
5. `enforce_companies_qb_time_export` md5 **`65284c5df44f2980c736df045cc869ed`** (= rebuild-test).
6. 0 companies with an auto-off record; 0 notifications of the new type.
7. Both switches still off; Worth Properties still `connected`, H&H still `disconnected` (the migration changes no
   state, so nothing fires).

**Item 7, expected after its push (a separate section, dry run of exactly its one file):**
1. `schema_migrations` has `20262134200000`.
2. `reopen_session_on_segment_hours` md5 **`044157b9a0ade061e0d56c647fffd7ab`** (= rebuild-test), same ACL.
3. `time_segments_z_reopen_on_hours_change` present and enabled.
4. `time_clock_sessions` by status unchanged: approved 9, pending 10, NULL 6 (the migration corrects nothing, ruling
   #9).

## ✅ ITEMS 1 + 7 MERGED: `5f05476a`. Both migrations are on production, verified by object.

- **CI `37092221364`** on the stacked head `a1a79e1f`: **green**. Unit **172 files / 2,327 tests**, e2e **705 passed, 24
  skipped, 0 failed** (34.7 m), alone on rebuild-test. The run before it (`37090127411`) was red only on the three unit
  failures fixed above; its e2e half passed.
- **Production, item 1** (`20262134100000`): the workdir's file was byte-identical to the tested one (`cmp`), and the
  dry run listed exactly that file. **Every stated expectation matched (7/7):** history row; the 3 columns nullable with
  no default; both constraints with the three reasons; allowlist **21**, all known; function md5
  **`65284c5d…`**; **0** auto-off rows and **0** notifications of the new type; H&H `disconnected/off` and Worth
  `connected/off`, unchanged.
- **Production, item 7** (`20262134200000`): the dry run listed exactly that file. **4/4 matched:** history row; md5
  **`044157b9…`**; ACL unchanged; trigger enabled (`O`); sessions approved 9 / pending 10 / NULL 6, unchanged (nothing
  corrected, ruling #9).
- **Merge:** a `--no-ff` merge of the tested head onto `main` `be5d8a0c`, carrying `[skip ci]`. **Tree-identity proof:**
  `git diff --name-only a1a79e1f 5f05476a` → `docs/sessions/S127-report.md` only (`grep -v '^docs/' | wc -l` → 0).
  No main run started (`gh run list` read back). Vercel deploys `main`.
- ⚠️ **What this means live:** Worth Properties' switch is off, so nothing changes until an Owner turns it on. From now
  on, if QuickBooks disconnects, is revoked or **its grant dies**, the switch turns off, records why, and the Owner is
  notified once. On reconnect, the Accounting screen offers to turn it back on and says that the days missed will not
  be sent.
- **A CI fact for § 8 / Build C:** `ci.yml`'s concurrency group is `workflow + branch` with `cancel-in-progress`, so a
  push to the SAME branch cancels that branch's earlier run (`37092220368`, cancelled by the next push). Runs on
  DIFFERENT branches still share rebuild-test and still collide.

## Next: P-1 (+P-6) + P-4 stacked on `main` `5f05476a`, CI `37094489407`

Local first: `tsc` 0; unit **174 files / 2,343 tests**; `turbo lint` 0.

## ✅ P-1 (+P-6) + P-4 MERGED: `574d9aef`. CI `37094489407` green: unit 174 files, e2e **708 passed** / 24 skipped / 0 failed (44.6 m). No migration. Tree identity printed: the diff from the tested head `47e7417a` lists `docs/sessions/S127-report.md` only (0 non-docs paths). **The two must-land defects are on `main`.**

## Sections on rebuild-test while the database was free (04:40Z)

- **5a** `20262134300000`: dry run exactly one file; a nullable text column with no default; CHECK of the 4 reasons;
  0 of 13 logs non-null. `database.ts` +3.
- **6** `20262134400000`: dry run exactly one file; the dirty-marker original confirmed at md5 `460edf02…` before
  the push; 10 companies × 7 = **70** rules, every company exactly 7, **0** wrong defaults, **0** projects dirtied by
  the seed; dirty md5 `6904c573…`. Live `s127-holiday-rules.live.ts` **10/10**: the engine carries 84 vs 72 holiday
  dates with Thanksgiving on/off (12 years); total role map on toggling (Owner/Admin only); the Owner cannot change the
  rule itself (42501). **Engine sabotage** (rules ignored) **1 red**, restored md5 `c0eea7f8…`. `database.ts` +72.
- **4e** `20262134500000`: dry run exactly one file; 2 tables with RLS on, 4 policies, 0 rows. `database.ts` +111.
- CI `37097508084` started on the 5a + 6 stack (local first: unit 176 / 2,367, lint 0, tsc 0).

## Production expectations for 5a and 6, STATED BEFORE THE QUERIES

**Pre-state, read-only:** see the line below this section; the dirty-marker md5 is `460edf02…`.
- **5a:** a history row; `daily_logs.client_photo_skip_reason` text, nullable, no default; CHECK with exactly the 4
  reasons; **0** non-null of the 2 production logs.
- **6:** a history row; **2 companies × 7 = 14 rules**, each company exactly 7. **Worth Properties all 7 `enabled =
  false`** (it has a Critical Path project); **H&H all 7 `enabled = true`** (it has none). **0** projects newly marked
  dirty (the seed runs with no `auth.uid()`). Dirty-marker md5 `6904c573…` (= rebuild-test). Trigger
  `companies_seed_holiday_rules` present. 4 triggers on the table, 2 policies. `company_holidays` unchanged (0 rows).

Pre-state read at 04:46Z: dirty-marker md5 `460edf02566fde6158f6896ce52215b3`; 2 companies (H&H: Critical Path never used; Worth Properties: used); 2 daily logs; 0 projects needing recompute; latest migration `20262134200000`.

---

# RESUMED after the sixth Codespace timeout (2026-10-03, session `framefocus-42`)

**`ListAgents`:** *"No reachable agents — no other Claude session is running on this machine right now."* No peer.

**Re-established by object (not from this report):**
- `origin/main` = **`c9aa76f0`**, as claimed. `git merge-base --is-ancestor` → **merged:** `qb-auto-off` (item 1),
  `segment-type` (item 7), `p1-defects` (P-1, and P-6 `941fce30` beneath it), `p4-queries` (P-4), `report`.
- **Migrations, `supabase_migrations.schema_migrations` read through the Management API:**
  production `jwkcknyuyvcwcdeskrmz` tops at `20262134200000`, `20262134100000`, `20262134000000` → items 1 and 7 on
  production, nothing later. Rebuild-test `nmyphyhmfttxkdoposvf` also has `20262134300000` (5a), `20262134400000` (6),
  `20262134500000` (4e) and S124 Part 1's `20262135000000`. **As claimed.**
- **Unmerged branch heads (local = origin on every one):** `member-removal` `fe131aca` (item 2, ruling #11, left
  alone) · `photo-trash` `5f5014ce` (4a) · `photo-viewer` `63dfd789` (4b, **on 4a**) · `share-link` `b95661b1` (4e,
  **on 4b on 4a**) · `clock-location` `9c08148c` (4c) · `daily-log-client-photo` `5f09865f` (5a) · `holidays`
  `b143b57d` (6, **on 5a**) · `p5-request-user` `fba72d87` (P-5) · `p2-feedback` `52e00862` (P-2, **on P-5**) ·
  `p3-thumb-proxy` `0c9f69db` (P-3, STOPPED WIP by the earlier half of this session).
- ⚠️ **Not in this report until now — CI on the 5a + 6 stack:** run `37097508084` (`49971c9d`) was **red** on 3 e2e
  that the client-photo gate overturned (706 passed). `b143b57d` updated those three in place, quoting the superseded
  assertions, and touched `log-form.tsx` (+2). Run **`37099880575` on `b143b57d`: ✅ green** (05:27 → 06:01Z), on base
  `574d9aef`. The two reds are not the same cause class as stop rule 5 counts: it was the change under test, fixed.

## Train order, and why it deviates from the brief's

The brief: *4b + 4e, then 4a, 4c, 5a, 6.* **I am shipping 5a + 6 first, then 4a + 4b, then 4e, then 4c.** Reasons:
1. **Production migration order.** 5a is `…134300000`, 6 is `…134400000`, 4e is `…134500000`. Pushing 4e first puts
   production out of timestamp order, and 5a/6 would need `--include-all` against production.
2. **5a + 6 is the only built item with a green CI on today's tree.** `main` has moved only by docs since its base
   (`574d9aef` → `c9aa76f0`). Merging anything with code first stales that run and costs another ~40 minutes.
3. **4b cannot go before 4a.** 4b is built on 4a's commits. And § 8 rule 2 forbids stacking migration work (4e) with
   work that carries none (4a, 4b). So the photo stack ships as **4a + 4b** (two deep, no migration), then **4e** alone.
- **P-5 rides with P-2.** The brief does not name P-5, but P-2 is built on it. Both carry no migration, two deep.

## Production, 5a (`20262134300000`) ✅ MATCH 4/4

- **Pre-state re-read** (matches 04:46Z): latest migration `20262134200000`; 2 companies (H&H `cp_used false`, Worth
  Properties `cp_used true`); 2 daily logs; 0 projects dirty; 0 `company_holidays`; dirty-marker md5 `460edf02…`, ACL
  `{postgres=X, service_role=X, supabase_auth_admin=X}`; no `company_holiday_rules`; no `client_photo_skip_reason`.
- **Section:** scratch workdir = `origin/main`'s 301 migrations + the 5a file taken from the tested head `b143b57d`
  (`cmp` 0); linked to `jwkcknyuyvcwcdeskrmz` (ref read back); the checkout stayed on `nmyphyhmfttxkdoposvf`. Dry run →
  **exactly** `20262134300000_s127_daily_log_client_photo.sql`. Push exit 0.
- **By object:** history row 1 ✅ · column `text / nullable / no default` ✅ · CHECK = NULL or exactly
  `inspection_day, weather, no_site_access, no_visible_progress` ✅ · **0** non-null of **2** logs ✅.

## Production, 6 (`20262134400000`): expectations, re-stated in full BEFORE the push

(The earlier statement stands; the md5s are now written out from rebuild-test.)
1. History row present.
2. `company_holiday_rules`: **14 rows = 2 companies × 7**; each company exactly 7 distinct `rule_key`s.
3. **Worth Properties (`dc4da2a7…`): 7 of 7 `enabled = false`. H&H (`31c7afc0…`): 7 of 7 `enabled = true`.**
4. **0** projects with `needs_recompute = true` (unchanged from 0).
5. `mark_schedule_dirty_from_row` md5 **`6904c5731f2e8917a400cd764cac302d`**, ACL unchanged
   `{postgres=X/postgres,service_role=X/postgres,supabase_auth_admin=X/postgres}`.
6. `seed_company_holiday_rules` md5 `c75374946397dcdd9b9fd1adf18d1755`; `enforce_company_holiday_rules_scope` md5
   `4a9d05a97b1312a683ef7d2614f026bf` (= rebuild-test).
7. RLS on; **2 policies**; **4 user triggers** on the table; `companies_seed_holiday_rules` on `companies`.
8. `company_holidays` unchanged: **0** rows.

## ✅ 5a + 6 MERGED: `965b3f21`. Both migrations on production.

- **Production, 6** (`20262134400000`): dry run **exactly** that file (`cmp` 0 against `b143b57d`), push exit 0.
  **MATCH 8/8:** history row ✅ · **14** rules, each company 7 rows / 7 keys ✅ · **H&H 7 of 7 on, Worth Properties 0
  of 7 on** ✅ · **0** dirty projects ✅ · dirty-marker md5 `6904c573…` + ACL unchanged ✅ · seed `c7537494…`, scope
  `4a9d05a9…` ✅ · RLS on, 2 policies, 4 triggers, `companies_seed_holiday_rules` present ✅ · `company_holidays` 0 ✅.
- **Merge:** `main` fast-forwarded over the docs-only report commits, then `git merge --no-ff b143b57d` → **`965b3f21`**,
  `[skip ci]`. **Tree-identity proof:** `git diff --name-only b143b57d 965b3f21` → `docs/sessions/S127-report.md`;
  `| grep -v '^docs/' | wc -l` → **0**. CI green on the tested head: `37099880575`.
- ⚠️ **What this means live:** a daily log on either surface can no longer be SENT without at least one client-facing
  photo or a stated reason. Editing a pre-S127 log is not blocked. Worth Properties' holidays are all OFF (its Critical
  Path job is not re-dated); H&H's are all ON (it has no Critical Path dates to move).

## 4a + 4b: CI `37116585932` started (10:29Z) on `292d7164`

`feature/s127-photo-viewer` rebased onto `main` `965b3f21` (clean, 4 commits; force-pushed with a lease on the old head
`63dfd789`). Local first, on that tree: `tsc` exit 0 (0 lines) · `next lint` exit 0 · unit **178 files / 2,375 tests**
exit 0. No migration.

## ⚠️ 4e FINDING, fixed before it shipped: a link could serve another company's photo

**Found reading 4e's code on resume, before its CI.** `photo_share_links.share_path` is set by the create route, but
the INSERT policy checks only `file_id` (role, company, a live image), **not `share_path`**. The image route then
downloaded `share_path` with the **service role**. So an Owner or Admin of **any** tenant (a fresh trial signup
included), inserting a row through PostgREST around the route, could name **any object in `project-files`**, another
company's included, and serve it publicly. Not on production (4e never shipped). It needs a known path, but a path is
not a secret worth resting tenancy on.

**Fix (`732fdf8e`, no migration change):** `resolveShareLink` now reads the link's own `files.file_path` and refuses a
`share_path` that is not that original or its `.markup.jpg` derivative (`sharePathBelongsToFile`), logging the link id
(never the token).
- **Unit**, driven through `resolveShareLink` with a fake admin client: original ✅ served · derivative ✅ served ·
  another company's object ✗ · another photo in the same company ✗ · another photo's derivative ✗. **9/9.**
- **Sabotage** (check bypassed): **3 red** (exactly the three refusals). Restored; md5 `bc301276…` before and after.
- **e2e** (`share-link-s127.spec.ts`, new case): a service-role row (a superset of the raw insert) naming another real
  object → a cookie-less image request gets **404**, and the page says *"This link is no longer available."*
- **Why not also in the policy:** the migration is already on rebuild-test and verified. The check belongs where the
  service-role read happens, because that is what trusts the column. A DB-side `WITH CHECK` binding `share_path` to
  the file is **proposed as defence in depth (`#1-share`)**, not built.

## ⛔ 5a DEFECT, live since `965b3f21`, found after its merge by me. Fix built: `feature/s127-5a-client-photo-fix`

**What is wrong on production now.** `client_visible` is **Owner/Admin only in the database**: `enforce_files_column_scope`
raises *"client_visible is Owner/Admin only."* on any other role's UPDATE (read from production's definition), and
`files_insert_non_client` refuses `client_visible = true` on their INSERT. 5a set the flag **through the caller's
client** on all three paths. **So for a foreman or crew member (the people who write logs) a client-facing photo fails:**
- **desktop:** the link write (`daily_log_id` + `client_visible`) is refused as a whole. The photo is uploaded but not on
  the log, and the retry queue fails the same way every time.
- **`/m` online:** the photo is saved and linked, then *"Photo saved but not shared with the client: …"*.
- **`/m` offline:** the queued link is refused, and the entry keeps failing.

An Owner or Admin is unaffected. The *reason* path works for everyone.
**Impact so far: none.** Production has **0** daily logs and **0** photos created since the merge (10:00Z → now; the
last log is 2026-10-02 19:41Z). **Why CI was green:** 5a's e2e chose a *reason* rather than attaching a client photo as a
foreman, and its unit tests pinned the payload, not the write. **The flag path was never exercised by a non-Owner.**
That is my gap: a write path proven by the shape of its payload, not by a row.

**The fix (no migration, `d2a52a0e` on `feature/s127-5a-client-photo-fix`).** One server mechanism,
`lib/daily-logs/client-photo-share.ts`, reached through `POST /api/daily-logs/client-photo` from all three paths
(PARITY). It reads the profile, the log and the file **through the caller's RLS** first. It admits the **log's author**
(the table's own UPDATE rule) sharing **a photo they uploaded**, on the **same project**, not already on another log.
Owner/Admin are exempt from author and uploader, since they may set the flag directly anyway. Then the **service role**
writes `daily_log_id` + `client_visible = true` and counts exactly 1 row. This is the same admin-write shape the
selection-spec PDF service already uses. **It is not a widening of who may flip `client_visible` on an arbitrary
file.** It is the narrow act ruling #4 puts in the crew's hands (*"a crew member must never be unsure which pictures
the client can see"*). **Reading taken, stated here: the ruling authorises the log's author to make their slot photos
client-visible.** If Josh wants client photos approved by Owner/Admin first, that is a different feature.
- Unit **8/8** (+3 pins: every surface reaches the one mechanism; no client code writes `client_visible: true`).
  Sabotage (the old offline write put back): **2 red**; restored md5 `2dd98b1f…` read back.
- Live harness `s127-client-photo-share.live.ts`: a control that must fire (the foreman's own write is refused), a
  **total role map** judged by the service role, plus author/uploader/scope. **To be run when CI frees rebuild-test.**
- **Train change:** this ships **next**, stacked with 4c (both carry no migration), ahead of 4e.

## 4d built while CI ran: `feature/s127-photo-bulk` `25c8ad0d`. ⛔ GATED: not merged until 4a is merged and its restore proven

- **What:** multi-select on **both** surfaces. **"Show to client"** sets `client_visible`, and its confirmation says a
  documents-only client sees nothing and a marked-up photo shows its markup. **"Move to Trash"** is a SOFT delete,
  and its confirmation says where the photos go. **Owner/Admin only** (ruling A-1a): `canBulkDeletePhotos` and
  `canSharePhotosWithClient`. ⚠️ **`/m`'s existing bulk delete is NARROWED** from `canDeletePhoto` (Owner, Admin, PM,
  PE) to Owner/Admin. PM and PE keep one-photo delete from the viewer. Both bars write through **one module**,
  `lib/photos/bulk-actions.ts`, row-counted. **No "select all"**, deliberately. Mobile "text" share is `shareImages`,
  unchanged (bytes, never a URL). Desktop has no OS share sheet; its share-out is 4e's link, one photo by ruling.
- **Proofs so far:** unit **22/22** (total maps for both rules, junk fails closed, "narrower than one-photo delete", both
  surfaces through the one module, both confirmations carry their caveats). **Sabotage:** bulk = `canDeletePhoto` →
  **3 red**; restored md5 `78986269…` read back. Full unit **179 files / 2,398 tests**; tsc 0; lint: no new warnings.
  The e2e `photo-bulk-s127.spec.ts` is written: Owner shows 2 and trashes 2 (each counted by the service role, with a
  third photo outside the selection unchanged), cancel writes nothing, both come back from the Trash; a PM is offered
  neither action on either surface; `/m` Owner "show to client" acts on the set. **It runs in CI after 4a+4b merge.**
- Existing tests swept: `m-photos.spec` A-22e (Owner bulk delete) and the crew "not offered" check both still hold.
  No existing test offered PM bulk delete.

**Pre-existing, not this session's, recorded:** the desktop grid shows `PhotoVisibilityToggle` to **every staff
role**, but the database refuses `client_visible` to everyone except Owner and Admin. So a PM's or foreman's toggle on
a tile fails. It is the same render-vs-database gap as the 5a defect, in older code. Filed as **`#2-share`**, not
fixed (outside the plan).

## P-7 (bundle weight): MEASURED, and the brief's premise is mostly false for `/m`

**Instrument:** `next build` on `main` `965b3f21` (exit 0), then `.next/app-build-manifest.json` per route, each chunk
gzipped and summed. **The `/m` layout is 226 KB gz** (18 chunks), the same number S125 measured. Field pages:
`/m/timeclock` 206, `/m/timeclock/switch` 208, `/m/logs/new` 206, `/m/p/[id]/photos` 201 KB gz.

**What is in it:** React DOM 52 KB · the Supabase client 41 + 12 KB · the Next runtime 31 KB · ⚠️ **the i18n
dictionary, ENGLISH AND SPANISH TOGETHER, 35 KB** (chunk `3437`: `LanguageProvider` plus every area's `en` and `es`
maps; `field.clock` ×44 and `photos.grid` ×34 keys) · the rest small.

**What is NOT in it:** `heic2any` (332 KB gz chunk), `@react-pdf/renderer` (262 KB), `pdfjs-dist` (108 KB). Each is
already a separate, lazily loaded chunk (`heic2any` and `pdfjs` are dynamic `import()`). Every `pdf-lib` and all but one
`@react-pdf` importer are **server-only** services. The one client importer is
`dashboard/estimates/[id]/proposal/pdf-preview.tsx`, on the route that uses it. The Gantt is ~570 hand-written lines
with no library.

⇒ **The heavy-library fix the brief describes has nothing to do on `/m`.** The one real `/m` target is **sending only
the active language's dictionary** (about −17 KB gz per page, roughly 8%). That touches `useT()` and every `/m` screen,
and it is a change to how every string loads. **Not built this session.** It is proposed, with the measurement, for
its own item. The heaviest desktop route is `/dashboard/estimates/[id]` at 300 KB first load. It is not a field
screen, so it ranks low by the brief's own rule.

## 4a + 4b: CI `37116585932` ❌ RED on 4b's own spec (1 failed, 712 passed, 24 skipped). Re-run `37118884675`

**Not a collision:** the run had rebuild-test to itself (nothing else ran 10:29 → 11:04Z). One test failed, 3 tries:
`desktop-photo-view-s127.spec.ts:76`.
1. **Instrument defect:** `expect(maxH).toBe('calc(100vh - 240px)')`. Chromium reports the normalised
   `calc(-240px + 100vh)`, so the assertion could never pass. It now asserts the two terms. Checked against both
   spellings, plus a `100vw` control that must fail (it does). The superseded line is quoted in place.
2. ⚠️ **A real defect behind it.** The failure at line 95 meant the rest of the test (previous/next and the RSC count)
   **had never run in CI**. Run locally on a **production build** (`next build` + `next start`, rebuild-test), it went
   red: **1 RSC request** while moving. The printed URL was `…/files/<next id>/markup?from=photos … prefetch=1`. The
   "Mark up" `<Link>` gets a new `href` per photo, and production prefetches each one: one server round trip per
   swipe, the cost 4b exists to remove (S125 finding 3). **Fix:** `prefetch={false}`, the grid tiles' H-5 call. After
   it, the 3 photo specs pass **12/12** locally. The red-then-green on the RSC count is the control that the probe can
   fail.
- Same-cause count for stop rule 5: these are **different** causes from any earlier red.

## Production expectations for 4e (`20262134500000`), STATED BEFORE ITS SECTION

Read from rebuild-test's catalog, where the same file is applied and verified:
1. A history row for `20262134500000`.
2. `photo_share_links` and `photo_share_link_views` exist, **RLS on for both**, **0 rows** each.
3. **Exactly 4 policies:** `photo_share_link_views_select_owner_admin`, `photo_share_links_insert_owner_admin`,
   `photo_share_links_select_owner_admin`, `photo_share_links_update_owner_admin`. **None for DELETE**, and none on views
   for INSERT (the server writes views with the service role).
4. **3 triggers** on `photo_share_links`: `_scope`, `_set_updated_by`, `_updated_at`.
5. `enforce_photo_share_links_scope` md5 **`3b33475f24115d8bfe25a4f7e0d70a28`**; `set_photo_share_links_updated_by` md5
   **`cbc12514b798744a2e8dfbed351e98ad`**.
6. CHECKs `photo_share_links_expiry_check` and `photo_share_links_token_hash_check`; 7 indexes, including the unique
   `photo_share_links_token_hash_key`.
7. Nothing else changes: `files` row count and `companies` unchanged (a pure addition).

## ✅ 4a + 4b MERGED: `7f6627fe`. No migration.

- CI **`37118884675` green** on the tested head `4d6775f0`: unit **178 files / 2,375**; e2e **713 passed, 24 skipped, 0
  failed** (independent tally: **0** `✘` lines in the log). Alone on rebuild-test.
- **Tree-identity proof:** `git diff --name-only 4d6775f0 7f6627fe` → `docs/sessions/S127-report.md`;
  `| grep -v '^docs/' | wc -l` → **0**. `[skip ci]`.
- **4d's gate is open:** 4a is merged, and its restore is proven by `desktop-photo-trash-s127.spec.ts` (desktop and `/m`
  restore, each counted by the service role; crew refused), green in that run.

## 5a FIX + 4c: CI `37121504124` started (12:01Z) on `3c33742f`, stacked on `main` `7f6627fe`

**Proven locally first (production build, rebuild-test), and the reason the order changed:**
- **Live `s127-client-photo-share` 13/13.** The control fired: the foreman's own write was refused with *"client_visible
  is Owner/Admin only."*, flag still false. **Total map, judged by the service role:** owner, admin, foreman → shared
  (linked + `client_visible`); PM, crew → **403** (not the log's author); PE, client, sub → **404** (the log isn't
  visible to them). The crew member's own photo on their own log → shared. The author with someone else's photo →
  403. Another project → 409. A photo already on another log → 409, and it stays there. **Sabotage** (author/uploader
  arm off): **3 red**; restored md5 `4015a8bc…` read back.
- **e2e `log-client-photo-s127`, as the FOREMAN, through the UI:** (1) a `/m` log with a client photo → the row is on
  the log and `client_visible`, counted by the service role; (2) the share route forced to 500 → the done screen
  **says so** and the photo stays internal. **Sabotage** (5a's original caller-client write put back, rebuilt): (1)
  **red, 0 rows shared**; restored md5 `f361d47a…`.
- ⚠️ **What that sabotage run exposed, also fixed:** under it, the done screen showed **no error at all**. The form
  sets its error and then swaps itself for the done screen, which never rendered the error. So on `/m` a failed log
  photo (old) or a client photo that wasn't shared (5a) **looked exactly like a sent one**. The done screen now carries
  the error (`m-log-done-error`), and the wording is true in both failure modes: *"A client-facing photo is NOT visible
  to the client: …"* (en + es).
- Local `next start`: 5 chromium + **45** `/m` specs green (`m-logs`, `m-capture`, `s116-c5-desktop-log`,
  `desktop-clock-location-s127`, the new spec). Unit **179 / 2,382**. **0** fixture rows left behind.

## ✅ 5a FIX + 4c MERGED: `879e869f`. No migration. **The live 5a defect is closed.**

- CI **`37121504124` green** on the tested head `3c33742f`: unit **2,382**; e2e **717 passed, 0 failed** (0 `✘` lines),
  including `log-client-photo-s127` and `desktop-clock-location-s127`.
- **Tree-identity proof:** `git diff --name-only 3c33742f 879e869f` → `docs/sessions/S127-report.md`; non-docs **0**.
- **Window of exposure:** 5a's broken client-photo write was on `main` from `965b3f21` (≈10:00Z) to `879e869f`
  (≈12:40Z). Production had **0** logs and **0** photos created in that window when last read (10:00Z → 10:4xZ). It is
  re-read below.
- **Re-read at 12:37:44Z (production): 0 daily logs and 0 files created since 10:00Z.** Nobody hit the defect.

## 4e: two more defects found before ship, both fixed. CI `37123905145` started (12:45Z) on `1658a215`

1. **`next build` failed on 4e as built:** *"PHOTO_LINKS_LIMIT is not a valid Page export field"*. The earlier half
   recorded unit + lint for 4e, never a build. Fixed by un-exporting it (it had no importer); the build exits 0.
2. ⚠️ **THE PAYLOAD GATE FIRED, as designed.** Run on a local production build, the payload e2e went red with
   `public payload leaks: supabase.co`. The page rendered the logo from `companies.logo_url`, which is
   `https://<project>.supabase.co/storage/v1/object/public/company-logos/<company uuid>/logo.png`. The logo is ruled
   in; its **storage URL** is not. It gives a stranger the storage host and the company's id. **Fix:** the logo is
   streamed through the app like the photo (`/share/p/[token]/logo`, `private, no-store`, dead the moment the link is
   revoked), its path re-derived from `logo_url` and **bound to the link's own company** (`logoStoragePath`: another
   company's logo, a climbing path or another bucket → no logo). The payload contract is still exactly 3 fields;
   `logoUrl` now carries the app's path. **That red run is the payload proof's control: the probe can fail, and it
   failed on the real leak.**
- Also: my foreign-`share_path` negative left its own row behind, which the PM test then counted (expected 0, got 1).
  It now deletes its row in `finally`.
- **Local `next start`:** `share-link-s127` + the photo specs **16/16**. Company A has a logo, so the logo branch ran:
  200, `private, no-store`, an image. **0** links and **0** views left. Unit **180 / 2,397**; lint clean.
- **Stated residual (not a gate):** a link serves the derivative's **current** bytes. If the photo's markup is edited
  after sharing, the public image changes with it; and a link made before any markup keeps serving the unmarked
  original. The pre-confirm preview shows what is public **at creation**. Filed as `#3-share` for a ruling: freeze a
  copy at share time, or keep it live.

## ✅ 4e MERGED: `aff79789`. Migration `20262134500000` on PRODUCTION, verified by object: MATCH 7/7

- CI **`37123905145` green** on the tested head `1658a215`: unit **2,397**; e2e **721 passed, 0 failed** (0 `✘`), with
  all 4 `share-link-s127` cases (the payload proof on the bytes, the foreign-`share_path` negative, PM refused, the
  preview writes nothing).
- **Section:** workdir = `main` `879e869f`'s 301 migrations + the file from `1658a215` (`cmp` 0; 0 diff lines since it
  was applied and verified on rebuild-test at `b95661b1`). Dry run → **exactly** `20262134500000_s127_photo_share_links.sql`.
  Pre-state: latest `20262134400000`, neither table present, files 390, companies 2.
- **Against the expectations stated before the section:** history row ✅ · both tables, RLS on, **0** rows ✅ · exactly
  the 4 named policies ✅ · the 3 named triggers ✅ · scope md5 `3b33475f…` ✅ · updated-by md5 `cbc12514…` ✅ · both
  CHECKs, **7** indexes incl. the unique token hash ✅ · files **390**, companies **2**, unchanged ✅.
- **Tree-identity proof:** `git diff --name-only 1658a215 aff79789` → `docs/sessions/S127-report.md`; non-docs **0**.
- ⚠️ **What this means live:** an Owner or Admin can now make a public link to one photo from the desktop single view.
  The link is listed under **Public photo links** (reached from the Photos tab), and one click revokes it. **No link
  exists until someone makes one.**

## P-5 + P-2: CI `37126944240` started (13:39Z) on `3679dcd8`, stacked on `main` `aff79789`

Local production build first: `/m` feedback, double-tap, clock-out-task and logs specs **25/25**; desktop punch,
day-clock-edit and lists **16/16**; tsc 0; build 0; unit **181 / 2,402**; the P-5 guard **3/3**. One rebase conflict
(an import line in `timesheets/page.tsx`, where 4c and P-5 each added an import) was resolved by keeping both.
**Order kept as ruled: P-2 before 4d.**

## P-3: finished from the stopped WIP, on `feature/s127-p3-thumb-proxy-v2` `15169355` (stacked on 4d). Not merged yet

- Started from the earlier half's `0c9f69db` (route + service), cherry-picked onto the current code. **What the WIP
  lacked, now done:** (a) its `export const THUMB_CACHE_CONTROL` in `route.ts` would have failed `next build` (the 4e
  trap). The contract moved to `lib/photos/thumb-proxy.ts`. (b) **Every** response is private: 200 `private,
  max-age=604800, immutable`; 401 and 404 `private, no-store`. (c) `X-Thumb-Source` (thumb | derivative | original)
  labels what was served, so the three S111 e2e classify **proxy responses** (direct storage image requests are still
  watched, so a regression to signed URLs would show). (d) `/m` A-23l now asserts the tile is the proxy, versioned by
  this markup's fingerprint, serving the **derivative's** pixels, never the original (superseded lines quoted). (e)
  The `/m` filmstrip's S112 3c saving survives: the old `thumbUrl !== displayUrl` test cannot see a server-side
  fallback, so the tab's local derivative now wins whenever it exists.
- **Proofs so far:** unit **5/5** (the contract, every response's header, caller-only auth, the stable/versioned URL,
  no thumbnail signing). **Sabotage:** header → `public`: **red**; restored md5 `800c02fb…`. New e2e: the header read
  off **real** responses, **another company's Owner holding the exact URL → 404** (`private, no-store`, no source
  header, not the bytes), no session → refused. tsc 0; build 0; unit **183 / 2,430**. **Local e2e and CI are next,
  after 4d.**
- The trash reader keeps signed thumbnails on purpose: the proxy 404s a trashed file.

## P-8 and P-9: NOT BUILT this session, with the reasons

- **P-8 (upload queue, full resolution kept):** a device-side thumbnail, a persistent full-resolution queue, and an
  indicator that says *"keep the app open"* (iOS has no background sync). It touches every capture surface and the
  offline queue. That is a spec-and-session item, not a tail. **Not started.** The pieces it would build on exist
  (`useUploadBatches`, the offline queue, held-photo listing).
- **P-9 (cross-request cache of rarely-changing data): RECOMMEND NOT BUILDING, as scoped.** The candidate reads are one
  primary-key read of `companies` per layout render. The columns are written **client-side**
  (`lib/services/company-client.ts`, the browser client), so a server cache could be invalidated only by adding a
  server round trip to every settings save. And every other writer (SQL, triggers, the QuickBooks routes) would leave
  it stale. Stale `breaks_paid` or `ot_threshold_hours` changes what payroll screens compute. The saving is small and
  the failure is a payroll display that is wrong without saying so, on top of the cross-tenant risk the brief names.
  **Josh's call** if he wants it anyway. The safe shape is the service role, `company_id` in the key, a short TTL, and
  invalidation from a server route that the settings forms call.

## ✅ P-5 + P-2 MERGED: `78eeeb30`. No migration.

- CI **`37126944240` green** on the tested head `3679dcd8`: unit **2,402**; e2e **723 passed, 0 failed** (0 `✘`).
- **Tree-identity proof:** `git diff --name-only 3679dcd8 78eeeb30` → `docs/sessions/S127-report.md`; non-docs **0**.

## ⚠️ RULING [Josh, 2026-10-03 10:58–11:01]: photo client-visibility permissions, folded into 4d BEFORE its merge

**Receipt confirmed in chat before acting.** At that moment: P-5 + P-2 merged (`78eeeb30`); 4d built, its CI
`37130101549` running; P-3 finished on a branch, not CI'd. **4d was not merged. That run tests superseded code and
will not be used to merge, green or red.** A red there does not count toward stop rule 5 on the new code.

| action | UI gate (what is DRAWN) | DB gate (what is WRITTEN) |
| --- | --- | --- |
| SINGLE share | O, A, PE, PM — `canSharePhotoWithClient` (new) | O, A **+ PM, PE on a photo**: `enforce_files_column_scope`, migration `20262134600000` |
| BULK share | O, A, PE — `canSharePhotosWithClient` (widened) | the same rows as single share: the DB cannot tell one write from many |
| SINGLE delete | O, A, PM, PE — `canDeletePhoto` (unchanged) | O, A, PM, PE — `20262030000000` (unchanged) |
| BULK delete | O, A — `canBulkDeletePhotos` (unchanged, A-1a) | the same rows as single delete |

**Bulk share and bulk delete differ on purpose: sharing is reversible, deleting is destructive.** The bulk rows'
narrower lists can only be enforced by the UI gate, because a bulk action is N single writes. That is stated, not
hidden, and the live harness proves the DB gate each bulk write actually meets.

- **Migration `20262134600000`** (one file): replaces only the `client_visible` arm. The trash and recategorise arms
  are byte-identical to the original, captured from both databases first (md5 `6b1c44e8…`, identical; committed with
  RESTORE `919f1d7a`). **Narrowed on my reading:** the PM/PE widening applies to a **photo** (an image, not
  contracts, COs or invoices), judged on `OLD`, so a document relabelled as an image in the same write cannot ride
  it. INSERT is unchanged.
- **UI:** the desktop grid's single toggle is now drawn for the four roles only (it was every staff role, and a
  foreman's or crew member's toggle was refused). The daily-log detail page had the same gap, so it got the same
  gate; other roles see a read-only "shared" badge.
- **Proofs so far (no database needed):** unit maps for all four rows, **50/50** with s115. **Four sabotages, one per
  rule:** single share drops PM → 1 red; bulk share adds PM → 2 red; bulk delete adds PE → 3 red; single delete
  drops PE → 3 red. Each restored; md5 `1c80f665…` read back.
- **Waiting on rebuild-test:** the migration section, the live DB total maps (`s127-photo-perms.live.ts`: four maps,
  every role, no returned rows, service-role verdicts, plus PM non-image/contract/relabel controls), DB sabotages,
  the e2e (PE: Select + "Show to client", no Trash; crew: no toggle; a PM's toggle lands, counted), then 4d's own CI.

## Part 2 (CI speed), from the same message

- **2.1 Runner:** both jobs run on **`ubuntu-latest`** (standard GitHub-hosted; for a private repo, 2 vCPU / 7 GB).
  E2E `timeout-minutes: 75`; Playwright `workers: 1` in CI and `retries: 2`. A larger runner costs about twice the
  per-minute rate per doubling of cores (GitHub's published Linux pricing; to be confirmed on the billing page).
  **Expected saving: small while `workers: 1` holds.** A serial suite against a remote database waits on network and
  database, not CPU; the build step would gain. **This conclusion holds only while the cap holds. Re-state it after
  2.3.** Not changed.
- **Why `workers: 1`: it is a RULING, recorded in place.** `ci.yml` (*"UN-SHARDED, DELIBERATELY … [Josh, S134]"*) and
  TECH_DEBT **#150**, option D chosen. Cause: **CI #201**. Under S133's 4 shards, a change order created by
  `m-co-recalc-route.spec.ts` on one shard was read by `desktop-payload.spec.ts:175`'s **assert-absence** on another.
  *"The only two speedups available, sharding and `workers > 1`, BOTH introduce that same intra-DB concurrency …
  `workers: 1` is load-bearing."* **What blocked the safe fixes: #149.** The pinned e2e fixtures are hand-curated on
  rebuild-test and reproducible from no script. **#150 rated namespacing "Breaks":** 13 spec files carry literal
  fixture UUIDs. ⇒ **2.3 must first close #149 (a reproducible seed), replace the literal UUIDs, and cover every
  assert-absence/count test. Only then can the cap be raised, with the test count proven identical before and after.**
- **2.2:** being taken from run `37130101549`. Wall time, setup/test split and the slowest specs come **from its
  logs**. Database connections come **from an instrumented sampler** (`pg_stat_activity` every 15 s, read-only)
  running during that same run. Each number is labelled with its source below when it lands.
