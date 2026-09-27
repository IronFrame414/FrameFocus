# S113 — SPEC (skeleton) — the open-items program

**Status: INCOMPLETE. This is a scaffold, not a spec.**

**RULED** = settled by Josh. **FILL-n** = CC measures and fills in place. **ASK-n** = Phase 2.

⚠️ **A FILL you cannot fill must say why, in one line. Never delete a marker.**
⚠️ **If a measurement contradicts a RULED line, STOP and report — do not reconcile it.**

This spec covers everything left open after S112, plus the items Josh raised on 2026-09-26. It is a
program, not one build. Each PART is independently shippable and has its own branch.

---

## RULED [Josh, 2026-09-26] — merge authority, and a CLAUDE.md change

CC may merge to `main` **without a separate approval** when ALL of these hold:

1. CI is green on the branch **rebased onto current main** — not an older main.
2. Every check agreed in the session has passed, with its measurement stated.
3. ⚠️ **Every migration the branch carries is already applied to production and verified by object.**

Point 3 is not a formality and was not waived: deploying code ahead of its migration means the app
calls a function that does not exist, and real users get errors. What changed is the approval
round-trip, not the prerequisite. **Applying a migration to production remains Josh's action.**

Add this to CLAUDE.md as a RULED block in the same pass as PART E's restructure.

---

# PART 0 — merge and branch cleanup (first thing, mostly unattended)

**RULED:** merge everything that is ready, then delete branches.

**FILL-0.1** — Every branch, with: CI state on current main, migrations it carries and whether each is
on production, and whether it merges cleanly. State the full count.

**FILL-0.2** — Merge, in dependency order, rebasing each onto the new `main` as it moves. Report every
conflict resolved and how. ⚠️ A silent resolution is how a fix disappears; the wave-1 merge kept both
behaviours in four conflicted files and said so, which is the standard.

**FILL-0.3** — Delete **only merged branches and dead ones**. ⚠️ These four are NOT dead and must
survive unless Josh says otherwise:
- `s112-staletimes-hold` — held by ruling, revisit when `/m` has loading feedback
- `s110-a-site-visit-access` — 18 commits that exist nowhere else; push or establish it is superseded
  BEFORE deleting
- `s112-cdn-investigation` — the revocation probe, unfinished
- `s112-catalog-importer` — a script Josh has not run yet

State each deletion and why it was safe.

---

# PART A — security and credentials

**A-1. The Resend API keys.** ✅ **DONE [Josh, 2026-09-27].** Two keys were exposed in the S103
transcript and had gone unrotated for nine sessions. ⚠️ This was a live credential in a chat log,
older than the anon hole closed on 2026-09-26.

**What was done (each step verified, not assumed):**

- New key `framefocus-prod-2026-09` created; `RESEND_API_KEY` updated in Vercel (**Production only**);
  redeployed; **verified by sending a real proposal from production and receiving it.**
- **Three old API keys deleted:** `vercel-production`, `RESEND_API_KEY`, `CRON_SECRET`. Only the new
  key remains.
- `RESEND_SIGNING_SECRET` rotated in Resend; Vercel updated (Production only); redeployed; **verified
  by a real event returning 200 in the endpoint's delivery log** — not assumed.
- Confirmed before deleting: **no consumer outside production.** `.github/` contains no `RESEND`
  reference, so CI never used one.

**⚠️ Finding (recorded, not just the fact) — a secret's NAME is unreliable evidence of what it is.**
Two of the deleted Resend keys were named `RESEND_API_KEY` and **`CRON_SECRET`** — variable names, not
purposes, and `CRON_SECRET` has nothing to do with Resend at all. Someone created keys while pasting
the wrong label. **Any future secret audit must treat a key's name as unreliable evidence of what it
is or what uses it** — verify by what actually consumes it. This is the secret-store instance of the
S180 rule **"audit by what is CALLED, not by what matches a catalog filter"** (CLAUDE.md / `rules.md`):
a name is a catalog property, not proof of use.

**A-2. The `supabase_admin` default ACL guard.** Built as `20261900000000` on
`feature/s112-default-acl-guard`, unmerged and unapplied. The `postgres` default is fixed; this one
cannot be altered from a migration (42501 on both routes, proven). Apply, merge, and confirm the guard
fires.

**A-3. The CDN revocation measurement — finish it or drop it.** Two attempts, both killed by restarts.
We still do not know how long a revoked user keeps reading. ⚠️ **Half-measured is the worst state.**
Either complete the 90-minute run on a disposable tenant and report the number, or record explicitly
that it is dropped and why. Do not leave it in limbo a third time.

**A-4** — ⚠️ Re-run the enumeration that found the anon hole, against `authenticated` rather than
`anon`. The lockdown closed the logged-out door. Nobody has asked what an ordinary signed-in user of
ANY company can execute. State the full count and the command.

---

# PART B — user-facing defects

**B-1. Password reset is unusable on production.** The email's link is
`…supabase.co/auth/v1/verify?token=pkce_…&type=recovery&redirect_to=https%3A%2F%2FEZContractorBinder.com`
— it verifies, then lands on the site root, which does not exchange the PKCE code. It pre-dates the
anon lockdown.

**FILL-B-1.1** — Does the app pass `redirectTo` to `resetPasswordForEmail`? File and line.
**FILL-B-1.2** — The Site URL and every Redirect URL in the production project's auth settings.
Supabase silently substitutes the Site URL when a requested redirect is not allowlisted; establish
which of the two is happening.
**FILL-B-1.3** — ⚠️ The proof must walk the REAL path: request the email, click the link that actually
arrives, set a password, sign in with it. The S112 proof used `/auth/confirm?token_hash=…`, a link
shape the emails never send, and passed while the real flow was broken.

**B-2. Photos uploaded with no project selected land in no-man's-land.** On `/m`: add photos → select
library → select photos, with no project in context. They upload and then cannot be reached or
assigned.

**FILL-B-2.1** — What actually happens to those rows: what `project_id`, `category` and `file_path`
they get, and which surface, if any, lists them. Josh will supply a screenshot of the screen.
**FILL-B-2.2** — Does the same happen on desktop? Untested by Josh. Measure it.
**FILL-B-2.3** — How many such orphaned rows exist on PRODUCTION today, per company. Read-only query
for Josh.
**ASK-B-2** — Two shapes, and Josh picks: (a) the upload is refused until a project is chosen, so
nothing is ever orphaned; or (b) the holding area stays and gains a way to assign photos to a project
afterwards — more forgiving on a jobsite where you shoot first and file later. State which you
recommend and why, and what happens to the rows already orphaned under either.

**B-3. The bid page never lists its documents.** The endpoint serves them; nothing on the page calls
it. Pre-dates the lockdown and exists on every branch. A subcontractor invited to bid cannot reach the
scope documents through the UI at all.

**B-4. Files must not list photos.** ⚠️ **RULED: filter by CATEGORY, never by MIME type.** Excluding
`image/*` would make a scanned plan, a permit photographed on site or a signed JPEG vanish from Files
and appear nowhere useful.
**FILL-B-4.1** — The query backing the Files list, file and line.
**FILL-B-4.2** — A read-only production count of rows leaving the Files view, per company and project.
**ASK-B-4** — Daily-log and safety images were ruled into the Photos QUERY but are not category
`photos`. Say what your change does to them; do not decide it.

**B-5. Multi-file upload.** The `multiple` attribute is trivial; the handling is the work.
**FILL-B-5.1** — Every upload control, reusing the 36-control inventory. Which get `multiple`, which
stay single, with a reason each. A camera capture is not a library picker.
**FILL-B-5.2** — ⚠️ Concurrency limit. Ten at once is the shape that exhausted Storage's connections
twice in S111. State the limit and test at it.
**FILL-B-5.3** — Partial failure names which files failed and retries only those. Per-file progress.
Timing for a 10-file batch including thumbnail generation.

**B-6. The proposal signing page.** ⚠️ **RULED:** a format named "Summary with Descriptions" SHOWS its
line descriptions — the client signs what they see. Fix the page first, then trim the payload to the
corrected page, never to the current one.

**B-7. `s112-m-loading`** — the `loading.tsx` drop was pushed without CI and is unverified.

---

## Photo-viewer UI (Josh, S180 hand-off) — measured before building; ordered by severity

Branch: `feature/s113-photo-viewer-ui`. All three MEASURED; none built yet — each needs a Josh input
recorded below. The `/m` viewer is `apps/web/app/m/p/[projectId]/photos/[fileId]/viewer.tsx`.

**B-8 (Josh's #3, the priority) — the Comments button does nothing.**
**FILL-A1 — MEASURED: it is a HALF-BUILT feature, not a wiring bug, and NO data is at risk.**
- **What it's bound to:** `viewer.tsx:765` — `<ActionTile testId="m-action-comment"
  label={t('photos.viewer.comment')} disabled />`. It is rendered **`disabled` with no `onClick` and
  no `href`** — bound to nothing.
- **Backend:** there is **none.** No comments table and no comment column exist — verified on the DB
  (rebuild-test): `information_schema` → **0 tables matching `comment`, 0 columns matching `comment`**.
  No comments service or route in `apps/web/lib/services` or `apps/web/app/api` (the grep hits are the
  word "comment" in code, and `-- comment` in SQL).
- **⚠️ Lost-data check (Josh's flag): CLEAR.** No backend ever existed, so nothing was ever written;
  no comments people believe they left are stranded. This is a dead button, not lost data.
- **Owed decision (report-before-build):** Josh scopes what a photo comment should DO (who can leave
  one, who sees it, does it notify, does it reach the client portal) before it is built. Until then it
  correctly stays `disabled`.

**B-9 (Josh's #2) — Markup on site-visit photos. ⚠️ THE FREEZE BLOCKS IT ON A SENT ESTIMATE — Josh's ruling.**
**FILL-B1 — MEASURED against `enforce_site_visit_file_freeze`.**
- The freeze trigger `files_z_site_visit_freeze` is **`BEFORE UPDATE ON files`**
  (`20261730000000:266`); the function `enforce_site_visit_file_freeze` (`20261770000000:347`) lists
  **`NEW.markup_data IS DISTINCT FROM OLD.markup_data`** (`:381`) among the changes it refuses on a
  frozen capture. Markup saves via **`.update({ markup_data })`** (`photos-client.ts:78`), an UPDATE.
- **SENT estimate (site visit frozen, `frozen_at` set, photo captured before it): markup is BLOCKED**
  — the markup_data UPDATE raises `42501 'This site-visit photo is frozen…'`.
- **UNSENT estimate (`frozen_at` NULL): markup is ALLOWED** — the trigger returns early (`:366`).
- **⚠️ STOP-AND-REPORT, per the hand-off:** whether a record a client already received may be
  annotated afterward is **Josh's ruling, not CC's.** Building is paused on B-9 until he rules the
  sent case. Options for the sent case: (a) keep it blocked and show a role-worded "this visit was
  sent and is frozen" notice instead of a dead markup control; (b) allow annotation but on a NEW
  derivative that does not mutate the frozen original (needs a freeze carve-out like the S111
  conversion re-point, and is a Floor/record-integrity decision). **Unsent markup is uncontroversial
  and buildable** once the entry point knows to enable only when `frozen_at IS NULL`.

**B-10 (Josh's #1) — Move Markup to the bottom action bar. FILL-C1 — MEASURED (placement).**
- **Bottom bar today** (`viewer.tsx` `m-viewer-actions`, a `grid-cols-4`): **Save · Share · Comment
  (disabled) · Delete** (Delete is absent for a role `files_delete_owner_admin` refuses, replaced by a
  hidden span). **Markup is NOT in the bar** — it lives in the **⋮ overflow menu** (`viewer.tsx:434`,
  a `Link` to `…/markup`), beside disabled Set-as-cover / Move / Report.
- **What moves / gets displaced:** the bar is already 4-up. Moving Markup in needs a 5th slot or must
  displace one tile. The **natural displacement is the dead Comment tile (B-8)** — which couples C to
  A: doing C cleanly wants B-8 resolved (or the Comment tile simply replaced by Markup). Flag the
  coupling; do not silently drop Comment.
- **⚠️ PARITY:** the desktop has **no equivalent bottom bar.** Desktop markup is a **dedicated page
  route** (`app/dashboard/projects/[id]/files/[fileId]/markup/`) opened from the file view. So moving
  Markup within the `/m` bar is a **layout/affordance difference, not a behavioural divergence**
  (markup does the same thing on both surfaces) — allowed by the PARITY rule. No desktop change is
  implied or needed.

---

# PART C — the project-scoped role (`project_executive`)

Full access to the projects it is assigned to, money included; nothing at company level. Q1–Q20 are
already ruled in `docs/specs/S111-SPEC-project-scoped-role.md`. The database side is built and proven;
`20261910000000` (write arms) is neither applied nor tested.

**RULED [Josh, 2026-09-26]: lien-release authority is INCLUDED for this role.**

**FILL-C-1** — The money UI. The database permits this role to read its own project's money; until the
screens render it, the role Josh asked for does not exist from a user's point of view.
**FILL-C-2** — Apply `20261910000000` to rebuild-test and run its live test. Currently unproven.
**FILL-C-3** — ⚠️ **The refund near-miss.** A reformatting cleanup moved a line from
`canRecordPayment` into `canIssueRefund`, which would have granted this role refund authority. It
compiled and no test caught it, because `payments-shared.test.ts:141-143` enumerates Owner, Admin and
PM by hand. Before any further permission work: that test covers `project_executive` explicitly, and
states what the role still CANNOT do.
**FILL-C-4** — Lien releases: every table, policy and route involved, and the negative test proving the
role cannot reach another project's.

---

# PART D — measurements written but never run

Each already has a query in a runbook. CC hands Josh the steps; Josh runs them; the result decides.

**D-1** — Q15: images still filed under Files on production rather than Photos.
**D-2** — HEIC objects on production that show blank outside Safari.
**D-3** — Frozen HEIC site-visit photos (the ones the freeze blocks converting).
**D-4** — ⚠️ **The region check, still unanswered and the cheapest lead on "the system is slower than I
expected."** Supabase's project region versus Vercel's function region. A mismatch costs a cross-region
round trip on every query on every page.

**FILL-D-5** — If D-4 shows the regions match, the performance question needs a real measurement pass:
the main screens, loaded on production as a real user, with time-to-interactive, transferred bytes,
request count and the slowest server call, ranked. Do not start this before D-4 answers.

---

# PART E — internal

**E-1. Role-permission tests become total maps.** ⚠️ Driven by a total `Record<Role, boolean>` so that
adding a role **fails to compile** until every permission states the new role's answer. State how many
test files have the hand-enumerated shape, with the full count and the command.

**E-2. CLAUDE.md restructure.** 936 lines and growing, read on every turn.
⚠️ **The contract: no rule is deleted.** Every line that leaves is compressed in place to its
imperative or moved to a named file. Anything proposed for deletion is listed for Josh, who rules.
**Audit table FIRST** — every section, its line count, and KEEP / COMPRESS / MOVE / DELETE — before a
single edit. Target under 350 lines.
Add, in the same pass: the merge-authority ruling above, "never reformat a file the repo does not
already format", and E-1's total-map rule.

**E-3. The drift baseline deadlock.** The baseline can only be regenerated when rebuild-test matches
`main`, and rebuild-test carries migrations from unmerged branches — so it is stale by construction and
will keep firing. ⚠️ Build the baseline from the **migration files** instead of a shared mutable
database. Filed as `#1-s112f`.

**E-4. The cost catalog.** `scripts/data/cost-catalog-home-depot-south-florida-2026-09-23.csv`, 282
items, every value pre-validated against the CHECK constraints. The importer exists on
`s112-catalog-importer` and has never run. Neither company has a catalog. Dry run reporting what it
would insert per company, then Josh runs it.

---

# PART F — deployed but never confirmed by a human

⚠️ **None of this is optional. A green suite is not a person looking at the thing.**

- The markup fix, display-size and the sixteen audit fixes, all deployed 2026-09-26 and unclicked.
- The site-visit textarea against the camera button, on Josh's iPhone.
- The S110 list, never done: open a file from each of the nine file-sheet sites and the client portal;
  a password reset to a real inbox on a second device; a crew phone set to Español on `/m`; a proposal
  with a Spanish name, confirming the warning and then "Send anyway"; drag a row in Safari on a Mac.
- Mark up a photo on production and save it twice.

CC produces this as a single checklist Josh can work through on a phone, in the order that finds the
most breakage soonest.

---

# ASK — Phase 2

**ASK-1** — B-2: refuse the upload without a project, or keep a holding area with a way to assign
later? And what happens to rows already orphaned?
**ASK-2** — B-4: daily-log and safety images.
**ASK-3** — A-3: finish the CDN revocation measurement, or drop it on the record?
**ASK-4** — Build order across PARTs A–F. CC proposes; Josh rules.

---

## Standing constraints

Branch from `main`, commit path-scoped, never `git add -A`, push after every commit. Migrations
rebuild-test only; verify the CLI link first; never MCP `apply_migration`. `next build` must pass and
the printed exit line must be read. **A test that passes on zero rows is a failure — state row
counts.** One branch's CI at a time. Nothing touches production. Append to the report after every step,
commit and push it — the Codespace has restarted seven times in four days and only pushed work
survives.

---

# AUDIT — before each PART ships

1. Every FILL filled or one line why not; every ASK ruled with the alternative it beat.
2. Every negative test written and run BEFORE its fix, with row counts.
3. Every production count run by Josh and recorded, with the query.
4. Nothing measured on zero rows and reported as a pass.
5. No test deleted; every superseded assertion quoted in place.
6. No file reformatted that the repo does not already format.