# S114 — SPEC (skeleton) — close every open item

**Status: INCOMPLETE. This is a scaffold, not a spec.**

**RULED** = settled by Josh. **FILL-n** = CC measures and fills in place. **ASK-n** = Phase 2.

⚠️ **A FILL you cannot fill must say why, in one line. Never delete a marker.**
⚠️ **If a measurement contradicts a RULED line, STOP and report — do not reconcile it.**

Source of items: `S181-open-items-audit.md` (2026-09-27), `docs/specs/S113-SPEC-open-items.md`, and
Josh's rulings of 2026-09-27. Each PART is independently shippable and has its own branch.

⚠️ **Items marked `[CLAIM]` in the audit are unverified.** Several were reported done or reported
broken and never re-measured. **Verify before building. Do not close one on the strength of a report.**

---

# RULED [Josh, 2026-09-27]

**R1 — The Project Executive has complete access to the projects it is assigned to, with exactly two
carve-outs, and nothing at company level.**
- ⚠️ **Carve-out 1 (Q1): no refunds.** It can neither issue nor approve. This is the near-miss — a
  reformatting cleanup once moved a line into `canIssueRefund` and would have granted exactly this. It
  compiled and no test caught it.
- ⚠️ **Carve-out 2 (Q2): no contract authority.** It cannot manage or void client contracts, contract
  documents or subcontracts. The PE clause was deliberately removed from `20261910000000`.
- Everything else a `project_manager` can do on a project, the PE can do on its assigned projects.

**R2 — The role stays withheld from the invite form and the Team edit form until PART A ships.**
Removing `project_executive` from `WITHHELD_ROLES` is the **last** step of PART A, not the first.

**R3 — QuickBooks project exclusion.** Per project. **Owner only** — not Admin. Changeable at any time,
not fixed at creation. It stops **future** syncing only; records already in QuickBooks are left alone
and nothing is unlinked or deleted. The control lives in the **STATUS section of the project overview**,
beside Mark On Hold / Mark Complete / Mark Cancelled / Move to Trash. ⚠️ **The Project Executive sees no
QuickBooks UI at all** — QuickBooks is company books.

**R4 — Photos uploaded with no project selected: refuse the upload.** Nothing is ever orphaned.

**R5 — The CDN revocation probe is replaced, not filed.** The cache is keyed on the signed URL and
cannot outlive it by much, so the revocation window is the **signed-URL lifetime** — a number we choose,
not one we measure. See D-3. ⚠️ **Do not start another 90-minute probe.**

**R6 — Build order: PART A first.** The role is half-shipped; it sees money and cannot upload a photo.

**R7 — Files must filter by CATEGORY, never by MIME type.** Excluding `image/*` would make a scanned
plan, a photographed permit or a signed JPEG vanish from Files and appear nowhere useful.

**R8 — Merge authority is unchanged.** CC may merge when (1) CI is green on the branch rebased onto
current `main`, (2) every agreed check passed with its measurement stated, and (3) every migration the
branch carries is already on production and verified by object. ⚠️ **Applying a migration to production
is Josh's action.** The S181d override was scoped to five named migrations in one session and does not
carry here.

---

# PART A — the Project Executive, finished (`project_executive` operational arms)

The database grants this role its projects' money and nothing else. Of **98** policies naming
`project_manager` in a positive role list, **0** name `project_executive` `[VERIFIED 2026-09-27]`. On its
own projects it cannot upload a photo or file, touch tasks, phases, schedule, purchase orders,
inspections or selections, see safety incidents, read the roster (ruled, unbuilt), assign people
(ruled, unbuilt), or read the cost catalog (ruled, unbuilt).

**FILL-A-1** — Every one of the 98, grouped by table, each with the arm R1 requires and whether it is
read, write or both. ⚠️ **State the full count and the exact command.** A role list missed here is a
silent denial or a silent leak, and this is the same shape of search that already shipped one
production regression when it was truncated.

**FILL-A-2** — The storage policies, separately. ⚠️ **A storage policy must never call
`get_my_company_id()`** — resolve the caller from `auth.uid()` inline, as `pe_can_attach_lien_release`
does. This is a recorded trap.

**FILL-A-3** — The TypeScript side: every `Record<CompanyRole, T>` total map and every hand-written role
array. The total maps fail to compile until the role answers; the hand-written arrays do not, and they
are where the near-miss lived.

**FILL-A-4** — ⚠️ **The two carve-outs, proven negatively.** Refunds and contract authority each get a
live negative on the PE's **own** project, where the read arm admits the row, so the write arm is what
refuses. **Write without returning rows** — an off-project negative written with `.insert().select()`
measures the READ policy, not the write policy. Each with its own sabotage that must go red.

**FILL-A-5** — PARITY. Every surface the role now reaches, on `/m` **and** desktop. ⚠️ Every item in this
program that shipped one surface came back as a defect; `/m`'s `readsChangeOrders()` omitted the PE while
desktop listed them.

**FILL-A-6** — **Last step.** Remove `project_executive` from `WITHHELD_ROLES`, invert the
`desktop-team.spec.ts` invite-options assertion in place with the old count quoted, and confirm both
grant routes now accept it.

**ASK-A-1** — Any table where "complete access" does not obviously answer read-versus-write. Propose,
do not decide.

---

# PART B — exclude a project from QuickBooks

**FILL-B-1** — ⚠️ **Establish what exists before designing anything.** Does the QuickBooks integration
sync today, what objects does it push, from which code paths, and is it automatic or triggered? Do not
trust `7G-spec` or any context file; read the code and say what you found.

**FILL-B-2** — ⚠️ **Audit by what is CALLED, not by what matches a catalog filter.** Every path that can
push a record to QuickBooks must honour the flag. A path found by naming convention and not by call
graph is a path that will keep syncing.

**FILL-B-3** — The flag: column, default, and the policy that lets **only an Owner** set it.
⚠️ **Authority in the database, not the UI** — a gate controlling only rendering still ships the data in
the payload (`#136`). A negative test proving an Admin cannot set it.

**FILL-B-4** — The STATUS-section control, matching the existing buttons on the project overview.
State what it says when the project is excluded, so the state is visible and not just togglable.

**FILL-B-5** — Read-only PRODUCTION count for Josh: projects per company, and how many already have
records pushed to QuickBooks. He runs it.

---

# PART C — defects a user hits

**C-1. Password reset is unusable on production.** `[CLAIM]` The email's link verifies then lands on the
site root, which does not exchange the PKCE code.
**FILL-C-1.1** — Does the app pass `redirectTo` to `resetPasswordForEmail`? File and line.
**FILL-C-1.2** — The Site URL and every Redirect URL in production's auth settings. Supabase silently
substitutes the Site URL when a requested redirect is not allowlisted; establish which is happening.
**FILL-C-1.3** — ⚠️ **The proof must walk the REAL path**: request the email, click the link that
actually arrives, set a password, sign in with it, on a second device. The S112 proof used
`/auth/confirm?token_hash=…`, a link shape the emails never send, and passed while the real flow was
broken.

**C-2. Photos are still filed under Files.** `[CLAIM]` Reported 2026-09-26, unresolved.
**FILL-C-2.1** — What actually separates a photo from a file in this schema. ⚠️ **Do not propose a fix
before this is answered** — write-path bug, conversion bug and query bug have different fixes.
**FILL-C-2.2** — The query backing the Files list, file and line. R7 applies.
**FILL-C-2.3** — Production count of rows that would leave the Files view, per company and project.
**ASK-C-2** — Daily-log and safety images are in the Photos query but are not category `photos`. Say
what your change does to them; do not decide it.

**C-3. The bid page never lists its documents.** `[CLAIM]` The endpoint serves them; nothing calls it. A
subcontractor invited to bid cannot reach the scope documents through the UI at all.

**C-4. Refuse a photo upload with no project (R4).**
**FILL-C-4.1** — What happens to those rows today: `project_id`, `category`, `file_path`, and which
surface lists them, if any.
**FILL-C-4.2** — Desktop too. Untested.
**FILL-C-4.3** — ⚠️ **Rows already orphaned on production.** Count them per company and hand Josh the
query. R4 stops new ones; it does nothing for the existing ones, and they need a ruling once counted.

**C-5. Multi-file upload.** The `multiple` attribute is trivial; the handling is the work.
**FILL-C-5.1** — Every upload control, from the 36-control inventory. Which get `multiple`, which stay
single, with a reason each. ⚠️ A camera capture is not a library picker, and a camera-only input with no
library option beside it fails the M6M camera-first ruling.
**FILL-C-5.2** — ⚠️ Concurrency limit. Ten at once exhausted Storage's connections twice in S111.
**FILL-C-5.3** — Partial failure names which files failed and retries only those. Per-file progress.
Timing for a 10-file batch including thumbnails.

**C-6. The proposal signing page.** ⚠️ **RULED:** a format named "Summary with Descriptions" SHOWS its
line descriptions — the client signs what they see. Fix the page first, then trim the payload to the
corrected page, never to the current one.

**C-7. Comments on photos.** ⚠️ **This was removed, not built.** Josh asked for the Comments button to
work; the dead button was deleted and comments filed as a scoped item. Build it, or say plainly what it
costs so Josh can rule.

**C-8. Site-visit markup — the old B-9.** On `/m/site-visits/[id]` and desktop `site-visit-record.tsx`,
which have **no markup entry point at all**. Unsent visits only. ⚠️ A frozen visit must show a notice
explaining WHY — "part of a sent estimate, can't be annotated" — not a missing or dead control. PARITY
across both surfaces. The eventual answer for sent visits is a derivative that never writes back to the
sent record; do not design that now.

---

# PART D — security and access lifetime

**D-1.** ⚠️ **Re-run the enumeration that found the anon hole, against `authenticated`.** The lockdown
closed the logged-out door. **Nobody has asked what an ordinary signed-in user of ANY company can
execute.** State the full count and the command.

**D-2.** `20261900000000`, the `supabase_admin` default-ACL guard, on `feature/s112-default-acl-guard`,
unmerged and unapplied. The `postgres` default is fixed; this one cannot be altered from a migration
(42501 on both routes, proven). Merge it and hand Josh the production steps.

**D-3. Make the revocation window a number we set (R5).**
**FILL-D-3.1** — The signed-URL lifetime today, per surface. One measurement, not a probe.
**FILL-D-3.2** — What a shorter lifetime costs. ⚠️ It pulls against the photo work — 45.9 MB to ~2 MB
came partly from CDN caching. Propose the split: short lifetimes for financial documents, lien releases
and contracts; long for photos.
**FILL-D-3.3** — Record what is already known: reads persisted **1,792 seconds** past token expiry;
exposure is limited to URLs the user already held; no listing and no new-URL issuance survives
revocation.
**ASK-D-3** — The actual numbers. Josh picks.

---

# PART E — migration debt and the drift baseline

**E-1.** Four migrations owed to production, all on unmerged branches:
`20261850000000`, `20261860000000`, `20261890000000` (`feature/s112-bid-token-status`) and
`20261900000000` (`feature/s112-default-acl-guard`, also D-2).
**FILL-E-1.1** — Is each branch finished? Measure; do not assume. CI state on current `main`.
**FILL-E-1.2** — Merge order, and a production runbook per migration in the S181 shape: one file per
section, a dry run listing exactly one file, verification by object. ⚠️ **Never
`migration repair --status reverted`** — it would record work as reverted that was never applied.

**E-2. The drift baseline deadlock.** `[VERIFIED 2026-09-27]` The committed baseline was generated from
rebuild-test, which carries the four above. The daily cron will report drift that is not drift.
⚠️ **Build the baseline from the migration FILES, not from a shared mutable database.** Filed `#1-s112f`.

---

# PART F — internal debt and housekeeping

**F-1. `#2-pe`** — 14 masked off-project negatives in 7 files, each listed by file:line.
`[VERIFIED 2026-09-27]` ⚠️ Each fix writes **without returning rows** and carries its own sabotage that
must go red. ⚠️ **Watch the unique keys** — a widened arm's row must land where the tally sees it, not
collide. **Blind spots to close or restate:** the `expect(error ?? data?.length === 0).toBeTruthy()`
form, 136 calls passing the table name as a variable, and 5 `.upsert()` calls.
⚠️ **Prior art:** `s98ct-offline.live.ts:365` documented this mechanism in S105 and it was never applied
to the floor tests. Say what stops that happening a third time.

**F-2. `#1-pe`** — the Payments retainage-release panel does not offer the PE what `20261910000000`
permits. Fails closed. ⚠️ Releasing retainage also drafts an invoice, so prove the PE's invoice arms
admit the exact sequence, live.

**F-3. `#3-pe`** — the PE reading stored contract files on its own projects. Read-only, resolving the
project through the file's subject, with a no-returning negative and its own sabotage.

**F-4.** Renumber `#1-pe`, `#2-pe`, `#3-pe` once the branch lands. Next free on `main` is `#164`.

**F-5. CLAUDE.md** is 391 lines against a 350 target. ⚠️ **No rule is deleted.** Every line that leaves
is compressed in place or moved to a named file; anything proposed for deletion is listed for Josh.

**F-6. `20261910000000`'s header comment** still says `client_refunds` is "Unruled for this role" while
Q1 ruled it. ⚠️ **Known and deliberate** — the migration is applied and ruled not to be edited. Record
the ruling where a reader of that file will find it, without editing the migration.

**F-7. Branch estate.** Delete what is merged. ⚠️ These survive unless Josh says otherwise:
`s112-staletimes-hold`, `s110-a-site-visit-access` (18 commits that exist nowhere else),
`s112-cdn-investigation`, `s112-catalog-importer`.

**F-8. `feature/s112-m-loading`** was pushed without CI and is unverified.

**F-9. The cost catalog.** 282 items, pre-validated. The importer on `s112-catalog-importer` has never
run and neither company has a catalog. Dry run reporting what it would insert per company, then Josh
runs it.

---

# PART G — only Josh can do these

⚠️ **A green suite is not a person looking at the thing.** CC produces this as one checklist Josh can
work through on a phone, ordered to find the most breakage soonest.

**G-1. Create the Project Executive on production.** No UI path exists by R2 until PART A ships; it is a
direct SQL update to `profiles.role`. CC writes the statement; Josh runs it and picks the login.

**G-2. Click the role.** As that PE, on an assigned project: Budget, Invoices, Payments (record-new
only), Profitability, Change Orders and Lien Releases all show money. Then an unassigned project is not
listed at all. Then neither the invite form nor the Team edit form offers "Project Executive" — until
FILL-A-6.

**G-3. The unrun production measurements:** images still filed under Files; HEIC objects that show blank
outside Safari; frozen HEIC site-visit photos; orphaned photo rows (FILL-C-4.3); QuickBooks-synced
project counts (FILL-B-5).

**G-4. Deployed and never confirmed by a person:** B-10's markup placement; the markup fix, display-size
and sixteen audit fixes from 2026-09-26; the site-visit textarea against the camera button on a real
iPhone; a file opened from each of the nine file-sheet sites and the client portal; a crew phone set to
Español on `/m`; a proposal with a Spanish name; a row dragged in Safari on a Mac.

**G-5. The performance pass**, once the region question is answered: the main screens on production as a
real user, with time-to-interactive, transferred bytes, request count and the slowest server call,
ranked.

---

# ASK — Phase 2

**ASK-1** — ASK-A-1: any table where "complete access" does not answer read-versus-write.
**ASK-2** — ASK-C-2: daily-log and safety images.
**ASK-3** — C-4: what happens to photo rows already orphaned on production, once counted.
**ASK-4** — ASK-D-3: the signed-URL lifetimes.
**ASK-5** — C-7: build comments, or state the cost and let Josh rule.
**ASK-6** — Build order **within** each PART. PART A is first by R6; CC proposes the rest, Josh rules.

---

## Standing constraints

Branch from `main`, one branch per PART. Commit path-scoped; never `git add -A`; push after every
commit. ⚠️ **Never reformat a file the repo does not already format** — a whole-file Prettier pass once
buried ~40 real lines in ~1,300 lines of reflow and hid a refund-authority error that compiled and
passed. Migrations rebuild-test only, via `npx supabase db push`, never MCP `apply_migration`; verify the
CLI link first and **never relink to production**. ⚠️ **Count on PRODUCTION first the rows any new
constraint governs, and give Josh the query** — a constraint written against rebuild-test's rows has
aborted on production twice. `next build` must pass and the printed exit line must be read; type-check is
not enough. **A test that passes on zero rows is a failure — state row counts.** Green means no
regression, not a working feature.

⚠️ **One branch's CI at a time.** `[skip ci]` is read from the **HEAD commit only**.

⚠️ **Questions in plain text, never an interactive picker.** Josh is not notified when a picker appears,
so the session sits idle. State each question in full.

Append to the session report after every step, commit and push it. ⚠️ **The Codespace has restarted eight
times in five days and killed a session mid-run. Only pushed work survives.**

⚠️ **"Done" means merged, or it says where it is.**

---

# AUDIT — before each PART ships

1. Every FILL filled, or one line why not; every ASK ruled with the alternative it beat.
2. Every negative test written and run BEFORE its fix, with row counts, and **written without returning
   rows** where it is an off-project negative.
3. Every sabotage restored and the policy text read back identical.
4. Every production count run by Josh and recorded, with the query.
5. Nothing measured on zero rows and reported as a pass.
6. No test deleted; every superseded assertion quoted in place.
7. No file reformatted that the repo does not already format.
8. PARITY stated per surface, `/m` and desktop, for everything the change touches.