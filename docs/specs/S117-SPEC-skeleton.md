# S117 — SPEC (skeleton) — field forms, estimates for the PE, and the stranded work

**Status: INCOMPLETE. This is a scaffold, not a spec.**

**RULED** = settled by Josh. **FILL-n** = CC measures and fills in place. **ASK-n** = Phase 2.

⚠️ **A FILL you cannot fill must say why, in one line. Never delete a marker.**
⚠️ **If a measurement contradicts a RULED line, STOP and report — do not reconcile it.**

Source: Josh's rulings of 2026-09-29, plus the open items carried from
`docs/specs/S114-SPEC-close-open-items.md`. Each PART is independently shippable and has its own branch.

---

# RULED [Josh, 2026-09-29]

**R12 — Production authorisation.** CC may apply this spec's migrations to production and merge, using a
runbook in the established shape: one migration per section, a dry run that must list exactly one file,
verification by object with every expected value stated, then relink to rebuild-test and prove it.
⚠️ **This does not amend CLAUDE.md** and does not extend beyond this spec's work. ⚠️ **Never
`supabase link` while another session holds the terminal**; ⚠️ **never
`migration repair --status reverted`**.

**R13 — Build order.** PART A first, then PART B, then PART D, then PART E. PARTs C, F and G slot where
they fit without delaying those four.

**R14 — The daily log is brought up to the paper form** (`WP-Daily-CloseOut-Lookahead`). ⚠️ **Add what
the paper form has and the app lacks. Remove nothing.** Anything the app captures that the paper form
does not is **flagged for Josh**, never dropped.

**R15 — The material sign-out form** (`WP_Material_Signout_Form`) is a separate feature from the daily
log. The two are not connected.
- The receiving party is **always external** — a sub, a driver, a vendor. Never your own crew. No
  account is required of them.
- An open sign-out **blocks nothing**. It is a record and a reminder, not a gate.
- ⚠️ **At least one release photo is REQUIRED** before the receiving party can sign. There is no in-app
  bypass, and that is deliberate: staff carry paper copies of the form for a dead phone, so the fallback
  lives outside the app. ⚠️ **Do not add a skip control later "for convenience"** — it would defeat the
  only evidence the record exists to produce.

**R16 — A project rename does not change history.** Documents already sent keep the name they were sent
under.

**R17 — Photo comments stay filed as debt** (`#166`). Not built.

**R18 — The cost catalog is imported now, with +5% applied to each item's cost.** So the figures do not
need editing again immediately.

**R19 — The Project Executive gets estimates from the beginning** — create, build and input, not just
read a converted one. This is the author-floor model the Project Manager already uses.

**R20 — WITHDRAWN [Josh, 2026-09-29]. Converting a project back to an estimate is NOT built.** Raised
and withdrawn the same day: it is a one-off or very rare circumstance, Josh handles the files and photos
himself when it arises, and the build is not worth it. ⚠️ **Recorded rather than deleted** so a future
session does not rediscover the idea and build it. If it ever returns, the reverse's contract is every
row and column `convert_estimate_to_project()` touches — it nulls `estimate_id`, re-points files,
reclassifies `other` → `photos`, and un-freezes site-visit captures because the freeze keys on
`estimate_id`.

**R21 — CLAUDE.md is left alone at 392 lines.** The 350-line target is withdrawn.

---

# PART A — merge the stranded work (FIRST)

Three branches carry finished work that never merged, and four migrations are owed to production
because of it: `20261850000000`, `20261860000000`, `20261890000000`
(`feature/s112-bid-token-status`) and `20261900000000` (`feature/s112-default-acl-guard`).

Merging them closes three things at once: the **bid page finally lists its documents** for a
subcontractor you invite, the **drift detector stops reporting drift that is not drift**, and the
**`supabase_admin` default-ACL guard** goes live.

**FILL-A-1** — Each branch: how far behind `main`, whether it merges cleanly, its CI state, and what its
migrations do. ⚠️ **These branches are ~215 commits behind.** Rebase, do not assume.
**FILL-A-2** — The bid-token work restricts `GET /api/bid/[token]/files` to files tagged `bid-scope` and
closes settled tokens. The S114 hotfix already applied the same tag restriction to `main`. ⚠️ **Confirm
the two do not conflict and that the tag value matches**, or the hotfix silently reverts.
**FILL-A-3** — The bid page's document list, which the hotfix deliberately left unbuilt. A sub invited
to bid must be able to reach the scope documents, and only those.
**FILL-A-4** — Production runbook, then apply under R12, then merge.
**FILL-A-5** — ⚠️ **Regenerate the drift baseline from the migration FILES, not from rebuild-test**
(`#1-s112f`). Building it from a shared mutable database is what made it wrong.

---

# PART B — the field forms

## B-1. Material sign-out form, on the Field tab

Fields, read from `WP_Material_Signout_Form`. ⚠️ **This is a two-stage record with an open state**, not a
single-submit form. Material goes out, then comes back — or does not.

**1 — Job:** job address, project / job name, date.
**2 — Material:** type / name, colour / pattern, manufacturer / brand, model / SKU, item #, quantity,
dimensions / size; **condition at release** (undamaged | minor damage | pre-existing damage); damage
notes.
**3 — Purpose and return:** work to be performed, **expected return date**, return location.
**4 — Receiving party:** company name, contact name, phone, driver / recipient name, vehicle / unit #.
**5 — Sign-out:** released by (WP) + date/time + **WP signature** + title; received by + date/time +
**receiving party signature** + title / company.
**6 — Return, completed later:** date returned, time returned, **condition at return** (same as released
| damage occurred | **material not returned**), return notes, received back by (WP) + date/time + **WP
signature**.

Above the receiving party's signature, verbatim: *"By signing above, the receiving party acknowledges
responsibility for the listed material while in their possession and agrees to return it in the same or
better condition."*

**FILL-B-1.1** — ⚠️ **Signature capture already exists** for proposal signing. Measure whether that
component and its storage are reusable. Do not build a second signature mechanism without stating why.
**FILL-B-1.2** — States and transitions: open → returned | damaged on return | **not returned**; overdue
derived from `expected_return_date`. Who may move each.
**FILL-B-1.3** — Where an open or overdue record surfaces. ⚠️ **A record nobody is shown is a record
nobody closes.**
**FILL-B-1.4** — PDF output, attached to the project like other documents. Both photo sets included,
captioned by stage.
**FILL-B-1.5 — Photos, two distinct sets.** Release photos evidence "condition at release"; return
photos evidence "condition at return". ⚠️ **Never one merged list** — the entire value is putting them
side by side when a sub says the damage was already there. Each set carries its timestamp and who took
it. ⚠️ **Use `runUploadBatch` and the `upload-batch-list` UI** per `#2-s180u`; this counts as a surface
needing its own proof. It must **not** become another bespoke upload path. ⚠️ **Category, never MIME**
(R7) — its own category so the project Photos grid does not fill with pallet shots.
⚠️ **R15: at least one release photo is required before the receiving party signs.** No bypass.
**FILL-B-1.6** — Who creates, who signs as WP, who closes out. Narrower default: anyone who reaches the
Field tab creates and signs as WP; Owner/Admin/PM/PE close.
**FILL-B-1.7** — PARITY. Used on a phone at a tailgate, so `/m` is primary; desktop needs the list and
the PDF.

## B-2. The daily log, brought up to the paper form

⚠️ **R14: add what is missing, remove nothing, flag anything app-only for Josh.**

The paper form's sections, to compare field by field against what the app captures today:

**A — Close-out checklist**, ten items: floors swept/vacuumed; debris hauled, no piles; cut station
broken down and clean; tools cleaned, staged, locked; cords coiled, walk paths clear; materials stacked
flat and covered; finished work protected; water and power off at source; windows and doors locked, site
secure; tomorrow's first task staged. Plus **photos sent** (each work area, staging/debris area, entry
path, 4–5 minimum) **with the time sent**.
**B — Completed today.**
**C — Next two days:** tomorrow and day after, each with a date.
**D — Needed on site, not here now** — the 48-hour rule. Table: item / material, qty, unit, needed by,
vendor / source, **ordered (office)**. ⚠️ **This one has teeth.** It is a request from the field to the
office with an acknowledgement column.
**E — Blockers:** sub, inspection, or a decision from the office.
**Footer:** completed by; **office reviewed / actioned**.

**FILL-B-2.1** — The app's daily log today, field by field, against the above. What is missing, what
exists under a different name, and **what the app has that the paper form does not** — that list goes to
Josh, unchanged.
**FILL-B-2.2** — Sections D and the footer imply a second reader. Establish whether a daily log reaches
anyone in the office today or is only stored.
**FILL-B-2.3** — PARITY `/m` and desktop.

**ASK-B-2** — Does "ordered (office)" need to be actionable — the office marks it ordered, the field sees
that — or is it a record only? Recommendation: actionable, because the 48-hour rule only works if the
field knows the office saw it.

---

# PART C — estimates for the Project Executive

## C-1. The PE builds estimates from the beginning (R19)

Today the PE reaches only a **converted** estimate, and only to read. R19 gives it the author-floor model
the PM has: create an estimate, and see the ones it authored.

**FILL-C-1.1** — The 21 estimate write policies and their author floor, replayed from the migrations.
⚠️ **State the full count and the command.** A role list missed here is a silent denial or a silent leak.
**FILL-C-1.2** — The migration adding the PE to each, plus the read arm for authored estimates. Every
child table follows by containment — confirm rather than assume.
**FILL-C-1.3** — The app gates: 4 page redirects, the proposal-data API, the nav entry, the builder role
type, and send/resend. ⚠️ **Send stays Owner/Admin.** Sending a proposal for signature is
contract-adjacent and R1's carve-out 2 stands.
**FILL-C-1.4** — Markup and margin are visible to the PE, per R11. No column scope is added.
**FILL-C-1.5** — Negative tests, **written without returning rows**: a PE cannot read or write an
estimate it did not author and that is not on its project. Each with its own sabotage.

## C-2 — REMOVED. See R20: converting a project back to an estimate is not built.

⚠️ **Do not add a STATUS-section control for this.** The only new control beside "Exclude from
QuickBooks" is the one PART B or G introduces, if any.

---

# PART D — the remaining slow spots

Everything here is measured, not speculative.

**D-1** — `getBudgetRollup` runs **8 calls in series** and `getJobCostRollup` **6**. Budget's remaining
sequential depth is 8. Money code — it gets its own tests before any reorder.
**D-2** — `/m` → `/m/timeclock` is a server redirect, so a cold PWA launch pays two requests.
**D-3** — `/api/chat/threads` is polled 4 times on first load, each one a full middleware run.
**D-4** — Anything the H-5 ranked list left open once the above land.

⚠️ **Measure the same way before and after, and state both numbers.** The instrument is
`scratchpad/nav-measure.mjs` and the server-side fetch log already used for H-2 and H-5.

---

# PART E — the security enumeration nobody has run

⚠️ The S112 lockdown closed the **logged-out** door: 272 anon-callable functions became 3, verified by
object. **Nobody has asked what an ordinary signed-in user of ANY company can execute.**

**FILL-E-1** — Re-run that enumeration against `authenticated` rather than `anon`. State the full count
and the command.
**FILL-E-2** — For anything reachable that should not be, the fix and a negative test proving a user of
another company is refused, written without returning rows.
**FILL-E-3** — The `supabase_admin` default-ACL guard (`20261900000000`, PART A) confirmed firing on
production afterwards.

---

# PART F — the cost catalog (R18)

`scripts/data/cost-catalog-home-depot-south-florida-2026-09-23.csv`, 282 items, every value pre-validated
against the CHECK constraints. The importer on `feature/s112-catalog-importer` has never run and neither
company has a catalog.

**FILL-F-1** — ⚠️ **Apply +5% to each item's cost on import** (R18). State the rounding rule and show
five worked examples before and after.
**FILL-F-2** — Dry run reporting what it would insert per company, for Josh, before anything is written.
**FILL-F-3** — ⚠️ Idempotency: running it twice must not double the catalog.

---

# PART G — defects

**G-1. Project rename** (R16 — history unchanged).
**FILL-G-1.1** — Every place `projects.name` is read, copied or embedded: documents, PDFs, emails,
**QuickBooks memo strings**, file paths, notifications. ⚠️ QuickBooks has no project object, so the name
is memo text on everything that syncs.
**FILL-G-1.2** — Any place the name is denormalised at creation, which a rename would not reach.
**FILL-G-1.3** — Owner/Admin only, narrower default.

**G-2. `setup_payment_schedule()` is locked by a single hand-entered expense.** ⚠️ **LIVE DEFECT
affecting the Owner today** (`#167`). One expense linked to a subcontract makes the formal schedule
refuse for **everyone**. Fix it and state the production count of subcontracts currently affected.

**G-3. Floor the foreman/crew photo soft-delete.** RLS currently lets a foreman or crew member
soft-delete a photo on any project they can view — wider than any written rule. Bring it to
Owner/Admin/PM/PE, matching the ruling of 2026-09-29.

**G-4. The portal splits photos from files by MIME** (`#170`) — an R7 deviation on the client surface.

**G-5. The direct-UPDATE residual on `project_budget_amounts`.** Owner/Admin/PE can update it directly
with no invoice lock; R10's lock binds only the new functions. Closing the direct path is a policy
change — propose, do not do it unasked.

---

# PART H — only Josh can do these

⚠️ **A green suite is not a person looking at the thing.** One checklist, ordered to find the most
breakage soonest.

- **PART A of S114, properly.** The Project Executive on production, itemised, not "seems to work".
  ⚠️ Its account is currently **banned until 2126** — that needs lifting first, and it is worth
  establishing what set it.
- **A real password reset on a second device.** C-1 is deployed-unproven.
- **A real proposal**, for C-6, and for C-12's scope formatting once it lands.
- **B-10's markup placement**, plus the sixteen fixes deployed 2026-09-26, all unclicked.
- **The auth redirect allow-list** in the Supabase dashboard (`#168`).
- **QuickBooks**: mark exclusions first, then connect. ⚠️ Exclusion stops **future** syncing only.

---

## Standing constraints

Branch from `main`, one branch per PART. Commit path-scoped; never `git add -A`; push after every
commit. ⚠️ **Never reformat a file the repo does not already format.** ⚠️ **Write off-project negatives
without returning rows** — with RETURNING, the read policy judges the row and the test cannot fail.
Watch unique keys. `next build` must pass and the printed exit line read. **A test that passes on zero
rows is a failure — state row counts.** Every sabotage restored and the text read back identical.

⚠️ **Run the CI job's three commands locally before every CI request.** ⚠️ **One branch's CI at a time.**
⚠️ **"Done" means merged, or it says where it is.** ⚠️ **A report is a claim.**

---

# AUDIT — before each PART ships

1. Every FILL filled or one line why not; every ASK ruled with the alternative it beat.
2. Every negative test written and run BEFORE its fix, with row counts, written without returning rows.
3. Every sabotage restored and read back identical.
4. Every production value verified by object, against a stated expectation.
5. Nothing measured on zero rows and reported as a pass.
6. No test deleted; every superseded assertion quoted in place.
7. PARITY stated per surface, `/m` and desktop.