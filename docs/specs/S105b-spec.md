# S105b — SPEC (skeleton)

**Status: INCOMPLETE. This is a scaffold, not a spec.**

**RULED** = settled. Do not re-litigate.
**FILL-n** = a hole CC measures and fills in place.
**ASK-n** = goes to Josh in Phase 2 and becomes a ruling.
**PREV** = measured in the lost S105 run. ⚠️ **A claim to verify, not ground
truth** — cheap to re-check, and the whole point of recording it is that
re-measuring should be fast, not skipped.

⚠️ **Do not build from this file until the audit at the end passes.**

---

## What happened, and why this file exists twice

A twelfth Codespace restart destroyed 11 unpushed commits: the completed S105
spec, item 5's three screens, item 7, item 10, and the TECH_DEBT classification.
The branch had never been pushed, so nothing survived the rebuild.

⚠️ **The rule that caused it is now changed and committed** (CLAUDE.md,
`662b531`, pushed): **CC pushes the feature branch to origin after every commit.
`main` stays Josh's.** A local branch dies with the box; pushing a feature branch
is not a merge and risks nothing.

**Every ruling from the lost run is preserved below.** This is re-execution, not
re-decision.

---

## How to use this file

1. **Fill every FILL marker** by measurement — read the file, run the query, go
   to the wire. Not from memory, not from a context file, not from an adjacent
   entry.
2. **Verify every PREV line.** Each is a measurement from a session whose report
   no longer exists. Confirm or correct; say which.
3. **Put every ASK to Josh in one Phase 2 message.** Record his answer here as
   RULED, with the alternative it beat and why.
4. **Then audit** — the checklist at the bottom.
5. Commit and **push** the completed spec before any build.

⚠️ **A FILL you cannot fill must say why, in one line. Do not delete the
marker** — a deleted marker is indistinguishable from a filled one.

⚠️ **If a measurement contradicts a RULED line, STOP and report.** Do not
reconcile it yourself. The lost run found four such contradictions and every one
was worth more than the work it interrupted.

---

## Verified state

- `main` = `662b531`, pushed. Vercel green through `14bc6ed`.
- Four S104 migrations on production, objects verified.
- Production ledger clean: 215 rows, no duplicates, no MCP-signature rows.
- CLI linked to `framefocus-rebuild-test` (`nmyphyhmfttxkdoposvf`).
- ⚠️ **The CLI can reach production.** S104 configured the DB password. The
  property that no repo path could write to production **no longer holds.**
- ⚠️ **The TECH_DEBT classification was LOST and must be redone.** Josh's rulings
  are recorded in FILL-T.1 below.
- ⚠️ **Item 1 (connect a real company on production) is OUT OF SCOPE.** It needs
  Josh's Intuit credentials in a browser. A null `qb_realm_id` is not a defect.

**FILL-0** — Confirm `main` is at `662b531` and the tree is clean. Report the tip
if it moved.

---

## ⚠️ Four stale claims the lost run found

Recorded so they are not re-inherited from the handoff. **Three of the four were
already corrected in `docs/sessions/debt-split-ux-log.md` §2.5 — the handoff was
written without reading the file it pointed at.**

1. "Item 5 is the largest remaining UI gap" — **four of six already conform.**
2. "The clock→job routing already works, verify it" — **it does not exist.**
3. "No image input sets `capture`" — **it is set at five sites**, including the
   burst entry point.
4. "`#118`: there is NO offline queue" — **there is, and capture already uses
   it.** The real gap is narrower and worse: it fires on `!navigator.onLine`, so
   a jobsite with one bar is "online" and failing, on an unhandled rejection
   path.

⚠️ **Read `debt-split-ux-log.md` §2.5 before item 7.**

---

# ITEM 5 — the three remaining list screens

## RULED

- The shared anatomy is **`components/list-screen/list-screen.tsx`** (PREV).
- **Four of the six already wear it**: estimates, subs, cost catalog, and
  projects — **projects is `14a`, the reference** (PREV).
- ⚠️ **Build only the three that remain: team, files, daily logs.**
- ⚠️ **Do NOT touch the four that conform.** A conformance pass on working
  screens is how `14a` gets regressed. Drift among the four (e.g. a missing
  MetricStrip) is a separate item and not this one.
- **The two named money screens are already DB-floored** (PREV): estimate totals
  are Owner/Admin (all) + PM (own only, `created_by = auth.uid()`); cost catalog
  unit costs are Owner/Admin/PM (all). ⚠️ **The role sets DIFFER.** Both enforced
  in RLS, below any fetch layer. **No `#136` leak was found on either.**
- ⚠️ **ASK-5.A from the first draft is MOOT.** The floors are per-table in the
  database, so the shared anatomy needs no per-screen floor definition.

### Team is a third money screen — RULED

Team renders **Burden / hr**, which the original handoff did not name. It is
DB-floored via `instrument_rates` (Owner/Admin), so a gated role gets an empty
map and the column reflows to em-dashes.

⚠️ **RULED: do NOT add a burden metric card.** It would render `$0` for a gated
role — a false figure where there is currently a reflow. **A gated role must see
less, not wrong.**

## What CC measures

**FILL-5.1** — Verify the four PREV claims above: the anatomy's path, which four
conform, the two role sets, and the absence of a `#136` payload leak. Say
confirmed or corrected for each.

**FILL-5.2** — For team, files, and daily logs: route, component file, what each
has today, what the anatomy requires. A table.

**FILL-5.3** — Any money rendered on files or daily logs. Team's Burden / hr is
known; check the other two rather than assuming they are clean.

**FILL-5.4** — ⚠️ **`next build` caught five errors that `tsc` passed** in the
lost run — new `useMemo`s placed after the team component's early returns. Same
class will recur. State the hook-placement rule the three screens must follow.

## ASK

**ASK-5.A** — None. Recorded as moot; see RULED above.

---

# ITEM 6A — the `files` RLS audit

⚠️ **Runs in Phase 1, BEFORE ASK-6.A. Its findings decide what the ownership rule
can be.** Read-only. Propose nothing until every FILL below is answered.

## Why this exists

The lost run established one fact: `files_insert_non_client` requires
`project_id IS NOT NULL` for non-owner/admin roles and permits null for
owner/admin, and **178 of 326 rows have no `project_id`** — 174 lien releases and
4 contracts.

⚠️ **Only the INSERT policy was read.** SELECT, UPDATE and DELETE on this table
have never been audited, and the 178 rows sit outside whatever project-based
scoping the rest of the table relies on. Four separate risks follow, and none has
been measured.

## What CC measures

**FILL-6A.1** — ⚠️ **The SELECT policy on `files`, in full.** If SELECT scopes by
project membership, a row with no `project_id` has **no project-based access
control at all**. Say which is true:
- there is a company-wide arm, so **every role in the company can read all 178**;
- or those rows are reachable only by owner/admin;
- or something else. Name it.

**FILL-6A.2** — ⚠️ **Four of the 178 are CONTRACTS, which carry money.** If
FILL-6A.1 finds a company-wide read arm, **that is the Financial Visibility
Floor on an unaudited table.** State plainly whether a gated role can currently
read a contract file. ⚠️ **`#136`'s class: check the payload, not the renderer.**

**FILL-6A.3** — ⚠️ **The UPDATE policy.** If UPDATE also demands
`project_id IS NOT NULL`, then **178 rows are permanently un-updatable by
non-admins** — readable and un-writable, failing wherever something tries.

⚠️ **That is S104's defect at 25× the scale.**
`expense_payments_retainage_rate_recorded_check` was NOT VALID, exempted seven
rows, made them permanently un-writable, and the QuickBooks connector lost a
Purchase link to it — silently, because the writer never checked the error.
**Look for the same shape here: who writes to `files`, and does that writer check
its error?**

**FILL-6A.4** — The DELETE policy, and the soft-delete/trash path for these rows.

**FILL-6A.5** — ⚠️ **"Company-scoped by design" is a CLAIM, not a finding.** What
was established is that the INSERT policy *permits* null. Whether the design
*intends* it is separate. A lien release is released against a specific job; 174
with no project could be deliberate company-level storage, **or an association
that was never written.**

Establish which, from the code that creates them — the route or service that
inserts a lien release, and whether it ever had a project to attach. ⚠️ **This
decides whether the fix is a third ownership arm or a backfill, and they are not
close to the same thing.**

**FILL-6A.6** — Run the same counts on **production**. Rebuild-test and
production differ; S104's retainage case had seven rows on one and zero on the
other.

⚠️ **These are signed artifacts. They are never destroyed.** Cleanup is not among
the options, whatever the audit finds.

---

# ITEM 6 — files tab + sub upload (`#5-estred`)

## RULED

- The sub receives an **EMAIL SUMMARY plus a LINK** to full detail and file
  upload. Not the full detail in the email.
- Uploads **land on the estimate's files** and **carry to project files on
  conversion**.
- ⚠️ **Stop rule 4 CLEARED** (PREV). `signing_sessions` is **not** an anon-RLS
  model — it has one policy, authenticated owner/admin. Anonymous pages use the
  **service role server-side behind a SECURITY DEFINER token RPC**;
  `/bid/[token]` does exactly this. **The upload needs no anonymous storage
  policy and weakens no bucket.**
- **25 MB cap. `application/pdf`, `image/jpeg`, `image/png`, `image/heic`.**
  ⚠️ **Enforced in the route, not at the bucket** — a bucket change affects every
  upload.
- **Token lifetime = the bid request's own expiry. A re-send REUSES the token**,
  so a link in flight never dies mid-upload.
- ⚠️ **The sub sees NO money.** Scope, files, and their own bid form. Never
  totals, never margin. The page is anonymous; anything it renders is public to
  whoever holds the link.
- **Provenance needs no new mechanism** (PREV): `projects.source_estimate_id`
  exists and `convert_estimate_to_project()` already writes it. The chain is
  `files.project_id → projects.source_estimate_id → estimates.id`.
  ⚠️ **Recorded limit: provenance is per-PROJECT, not per-file.** Harmless while
  conversion creates the project; wrong the day a re-convert or merge-projects
  feature ships.

## 🛑 THE BLOCKER — and it is the only thing gating this item

`files` has **no `estimate_id` column**, and `files_insert_non_client` demands
`project_id IS NOT NULL` for every non-owner/admin role. So an estimate's file
has no legal home today.

The first draft ruled: add `files.estimate_id`, and a **hard CHECK — exactly one
of `project_id` or `estimate_id` non-null**, added VALID, never NOT VALID.

⚠️ **Measurement broke that ruling's premise.** **178 of 326 `files` rows have
`project_id IS NULL`** — 174 lien releases and 4 contracts, **company-scoped by
design and expressly permitted by `files_insert_non_client`'s owner/admin arm.**

So "exactly one" rejects 178 legitimate rows. VALID aborts. NOT VALID is what the
ruling forbids — and S104 proved why: `expense_payments_retainage_rate_recorded_check`
was NOT VALID, exempted seven rows, and made them **permanently un-writable**.

**FILL-6.1** — ⚠️ **Does a company-scoped file carry anything identifying it as
company-level**, or is it `project_id IS NULL` and nothing else? A `company_id`,
a type discriminator, a bucket path convention — anything. **This determines
whether a third ownership arm is expressible.** Answer this BEFORE ASK-6.A.

**FILL-6.2** — The exact text of `files_insert_non_client`, and every other
policy on `files`.

**FILL-6.3** — Confirm the 178/326 counts on rebuild-test, and run the same count
on **production**. The two databases differ; S104's retainage case had seven rows
on rebuild-test and zero on production.

## ASK

**ASK-6.A** — ⚠️ **The ownership rule for `files`.** ⚠️ **Do not put this to Josh
until ITEM 6A is complete** — FILL-6A.5 may show the 178 rows are a missing
association rather than a design, which changes the answer entirely. Options, and
FILL-6.1 or the audit may add a better one:

1. **Three-arm CHECK** — exactly one of `project_id`, `estimate_id`, or a
   company-level marker. Keeps the constraint hard and makes the 178 rows legal
   by naming what they actually are. **Preferred if FILL-6.1 says it is
   expressible.**
2. **"At most one"** — permits an ownerless row, which is the hole the first
   ruling existed to close.
3. **Defer item 6**, build 5, 7, 10, and rule this attended.

⚠️ **Do not proceed past this ASK unattended.** It is stop rule 2.

---

# ITEM 7 — burst photo capture

## RULED

- **Take several photos back to back.**
- **Auto-save to the clocked-in job.**
- **If not clocked in, the job picker appears ONCE, when the batch is DONE.**
- ⚠️ **The clock→job routing does NOT exist — this is NEW WIRING, not
  verification** (PREV). `projectInContext()` (`capture-store.tsx:66-86`) reads
  only the URL path `/m/p/{id}` and `?project=`; it never reads the clock.
- ⚠️ **RULED: add the clocked-in segment as a third project source, with explicit
  precedence — URL path > `?project=` > open clock segment > null.** Precedence
  stated in the spec and tested.

## Still a ruling change — both go to Josh again

- The **single-slot `PendingShot` is deliberate**, tied to the **§7a invariant
  that a field INSERT without a `project_id` is refused by RLS.**
- The **clock→job wiring changes A-21's ruled null-prompt behaviour.**

## What CC measures

**FILL-7.1** — ⚠️ **Read `docs/sessions/debt-split-ux-log.md` §2.5.** Summarise
what it already decided. It corrected three of the four stale handoff claims and
may answer questions below. **If it contradicts a RULED line, that is a STOP.**

**FILL-7.2** — `PendingShot` today: the type, where it lives, why single-slot,
and exactly how it ties to §7a.

**FILL-7.3** — The §7a invariant, stated precisely — the RLS policy text.

**FILL-7.4** — A-21's ruled null-prompt behaviour in its own words, and what the
clock→job wiring changes about it.

**FILL-7.5** — The offline queue as it exists. ⚠️ **It fires on
`!navigator.onLine`, so one bar reads as online and fails on an unhandled
rejection** (PREV). Confirm, and state the failure path exactly.

**FILL-7.6** — ⚠️ **What happens when photo 4 of 7 fails.** Not "it retries" —
the resulting state of photos 1–3, photo 4, photos 5–7, and what the user sees.

**FILL-7.7** — The five `capture` sites (PREV). Confirm and name them.

## ASK

**ASK-7.A** — The two ruling changes. Each stated plainly: what was ruled, what
replaces it, what is lost.

**ASK-7.B** — On FILL-7.6's answer: does a failed photo block the batch, drop
silently, or surface and let the rest proceed? ⚠️ **A jobsite has no signal half
the time. This decides whether the feature is usable or merely faster.**

**ASK-7.C** — If not clocked in and the user **dismisses** the end-of-batch
picker, the photos exist with no `project_id`, which §7a forbids. What happens?

---

# ITEM 10 — housekeeping

## RULED

- ⚠️ **Port 3000 stays PUBLIC on the live port.** The handoff's "back to private"
  is **superseded**: `.devcontainer/devcontainer.json:6` says verbatim *"PORT
  3000 IS FORWARDED PUBLIC, AND OAUTH CANNOT WORK OTHERWISE"*, and S103 recorded
  that Intuit's cross-site return is bounced to a GitHub interstitial when it is
  private. **Item 1 still needs that path.**
- **RULED: change the devcontainer so a future REBUILD comes up private; leave
  the live port public.** Amend the comment to explain why both states exist.
  (`gh` is not installed, so CC cannot change the live port regardless — only
  Josh can, in the VS Code PORTS panel.)
- ⚠️ **The `.png` files in `apps/web/public/screenshots/` are RULED CORRECT.**
  They are marketing assets and public is intended. **Do not move or remove
  them.** The handoff entry is superseded.
- ⚠️ **Rotating the exposed Resend API keys is JOSH'S.** Deferred by him. **CC
  does not touch keys.**

## What CC measures

**FILL-10.1** — Sandbox QuickBooks residue. Known: Bills 147/149, Purchases
151/152/155/156, and Vendor 77 (PREV: cannot be deleted, only voided), plus
whatever S104 added. Full inventory. ⚠️ **Propose; do not delete.**

**FILL-10.2** — ⚠️ **`s148`/`s149-E` set the live company `disconnected`
mid-test — a crash in that window severs the connection.** Read both, state the
exposed window, propose a fix. If it cannot be fixed without losing what the test
covers, say so.

---

# ITEM T — the TECH_DEBT classification (redo)

Lost with the branch. **Josh's rulings stand; do not re-propose.**

**Final split: CLOSED 69, IDEAS 11, OPEN 106.** Total conserved at 223.

**Five entries stay OPEN** against the original proposal:
- `#31` and `#54` — closed on inference from adjacent entries and from CLAUDE.md
  rather than the entry's own text. Investigation was out of scope.
- `#77` — "flagged for awareness if data quality matters later" is not a deferred
  decision.
- `#150` — sharding was reverted; the decision was made, not deferred.
- `#1-trial` — a live compliance gap, not a future idea.

**FILL-T.1** — Re-derive the classification against these rulings. ⚠️ **RENUMBER
NOTHING. Move entries verbatim. Classify by ORDINAL, not by id** — ids repeat
(`#117` and `#117 (original entry)` are two entries). **Count before and after;
if any count is off by one, STOP.**

⚠️ **Known and accepted from the lost run:** `#110`, `#131`, `#151` will appear
in both OPEN and CLOSED — the superseded "(original)" half moves, the live half
stays. This bends Conventions' "a number lives in exactly one file". **Josh has
accepted it.** Also pre-existing in both files before any pass: `#8`, `#10`,
`#12`, `#13`, `#50`.

**Six pointer blockquotes** were added in the lost run where a branch section
lost every entry, so it does not read as "this branch's debt vanished". **Josh
ruled: keep them.**

---

# Cross-cutting

## The Financial Visibility Floor

⚠️ **A gate controlling only RENDERING still ships the data in the payload**
(`#136`'s class). **Authority belongs in the database. A renderer omitting a
column is not a floor.**

Applies to: estimates list, cost catalog, team's Burden / hr, and ASK-6.C's
anonymous page.

**FILL-X.1** — The floor's canonical implementation in this repo, by file, so
items 5 and 6 apply the same mechanism rather than two similar ones.

## Migrations

**FILL-X.2** — Every migration this spec requires, with purpose. ⚠️ **If none,
say none.** Item 6 is the only candidate and it is gated on ASK-6.A. Josh needs
to know before the build whether a fifth attended production push is coming.

## Credentials

⚠️ **Two credential slips in two sessions, both from a hand-written probe rather
than the app's own path** — an invented `qb_vault_put` signature, and a live
`ghu_` token printed by `${VAR:-...}`, which prints the value precisely when it
is set. **Do not hand-write probes that touch credentials. Use the app's own
path, and never echo a variable to check whether it is set.**

## Tooling

⚠️ **A markdown formatter reflows every table in `CLAUDE.md` on save**, producing
a 77-line diff for a two-line edit. It will do the same to `TECH_DEBT.md` and to
this spec. **Note it in the report; do not fight it mid-build.**

---

# AUDIT — run before any build

Report the result of each line.

1. **Every FILL is filled**, or says in one line why not. State the count found
   and the count filled.
2. **Every PREV line is confirmed or corrected**, individually.
3. **Every ASK has a recorded ruling from Josh**, with the alternative it beat.
4. **No measurement contradicts a RULED line.** Any that does is listed here and
   the build does not start for that item.
5. **No two sections contradict each other.** Item 5's floor and item 6's floor
   are the same mechanism. Item 7's `PendingShot` treatment is consistent between
   FILL-7.2 and ASK-7.C.
6. **Every interface, RLS policy, and migration named**, not gestured at.
7. **Every stop rule that could fire is identified in advance** — specifically
   ASK-6.A and ASK-7.A. If either is unresolved, that item does not build.
8. **Anything in the handoff or a context file that measurement CONTRADICTED**
   is listed. The lost run found four; assume there are more.
9. **Anything still unknown that the build will need.** If this list is not
   empty, the build is not ready.