# TECH_DEBT.md — FrameFocus

<!-- ========================================================================= -->

## ~~NUMBERING RECONCILIATION `#147`–`#149` [S136]~~ — DISCHARGED AND REMOVED

Removed [register-backlog §1.2, Josh Phase 2 Q2] — both branches merged, all four reassignment rows
applied and struck, and the block's own closing line said it *"is fully discharged and can be
removed."* The full table survives in git history and in the S136 context file. The rule that
prevents recurrence lives in CLAUDE.md → "Tech-debt numbering", which is unchanged.


> **Last updated:** August 11, 2026 — S134 (**#149 AND #150 RAISED**, filing the fallout of reverting the S133 Playwright sharding (Option D, Josh's ruling). **#150** records the concurrency hazard precisely — four shards shared one rebuild-test DB, so any test asserting the absence/count of something another shard writes to a shared fixture was exposed; CI #201 (`desktop-payload.spec.ts:175`) is the instance, NOT a payload leak — the #117 read floor holds at the query. **#149** is the constraint that blocked every safe fix: the pinned e2e fixtures are hand-curated on rebuild-test and reproducible from no script — `seed-test-identities.mjs` only *warns* if `eaf0e25b` is missing — which is what blocks a database-per-shard, the fix that is safe by construction. The sharding work is kept on branch `ci/shard-playwright`, not deleted. **⚠️ #149 is also speculatively used on two unmerged branches (`feat/notifications`, `feature/m6m-mobile`) for different items — a merge-time reconciliation is owed there regardless; main's file is the assignment authority.**)
> **Previously:** August 10, 2026 — S123 (**#151 RAISED** from a real-device test — the push enrolment control does not read as tappable. **A UI pass, not a defect:** the component carries **zero `className` attributes**, and with `@tailwind base` Preflight in force an unstyled `<button>` has no background, no border and no radius, so it renders as a line of body text that happens to click. It is also the ONE control between a user and ever receiving a push, and on iOS the prompt is one-shot and sticky, so a bad first encounter is permanent. Constraints recorded, including that the **iOS install-gate branch must NOT become pressable** — and that **no test references this component at all**, so that constraint has no safety net today)
> **Previously:** August 9, 2026 — S123 (**#147 AND #148 RAISED**, both from Josh, both investigated before filing rather than described from the request. **#147 multi-address is a UI GAP, not a schema gap** — `contact_addresses` has no unique constraint on `contact_id`, only a PARTIAL one-primary index, and `listAddressesForContact()` plus the 4D estimate address picker already handle N; exactly one form, `contact-form.tsx`, only ever writes the primary. No migration needed. **#148 inline contact-create is a SHARED COMPONENT's change** — `ContactAddressPicker` has three consumers, and `contacts_insert_authorized` matches `estimates_insert_manager` exactly, so there is no permission gap. The two meet at `contact-form.tsx` and should be sequenced together)
> **Previously:** August 9, 2026 — S123 (**#153 RAISED — the lean-repo sweep, one entry for one pass.** Whole return is **~9,060 lines (4.0%)** and **8,068 of it is a single finding**: five byte-identical `support.js` and three `ios-frame.jsx` in `docs/`. Everything else is small or needs a ruling; **dead code recommended SKIPPED** — 38 sites, ~990 lines, in service files where complete-CRUD-ahead-of-UI is deliberate. ⛔ **`/workspaces/rafterworks-s89` and `feat/module-8-architecture` are NOT deletable** — they hold the only copies of `notifications-architecture.md` (212 lines; notifications is the next project) and two context files; they need MERGING. **#154 RAISED** — `updateProject()` has zero callers, and that is the DOCUMENTED INTENT of S63/S64, not drift: a latent write path neutralised before it has a caller. Not a defect; **must not be deleted**, or the guard goes with it)
> **Previously:** August 9, 2026 — S123 (**#130 CLOSED as not-a-defect** — the stale wordmark lives in an unimported prototype, the file is NOT deleted, and it is byte-identical in two cited locations so any future fix or deletion must take both. **#131 AMENDED — RULED: e2e becomes a required check**, which makes the three CI Supabase secrets **permanent infrastructure** and reverses this entry's "remove them later" premise. ⚠️ Required checks gate PULL REQUESTS and this repo has never opened one — every merge is a local `merge:` pushed straight to `main` — so **requiring the check alone changes nothing**; requiring PRs is the piece that makes it real, and its cost is 15–25 min per change. Direct-push decision OPEN)
> **Previously:** August 9, 2026 — S123 (**#145 CLOSED as MITIGATED — and the `oom_kill 0` argument that made its cause "unknown" was INVALID.** The kernel is not the only thing that can kill a renderer: V8 aborts it itself on allocation failure, leaving `oom_kill` at 0 in exactly the case being excluded. Reproduced the signature on demand — `V8 javascript OOM (Reached heap limit)` on stderr, then **`page.goto: Page crashed` on the NEXT navigation**, which is why the report always named a bystander test. Also established: **no crash dump was ever possible** (`chrome-headless-shell` ships no crashpad handler; `--enable-crash-reporter` is fatal at launch) and **no local trace was ever captured** (`retries: 0` + `on-first-retry`). Measured for the first time: fds **3.9k/524k**, pids **396/9.5k**, Chromium RSS **flat**, `next-server` the only thing that grows. Still did NOT reproduce naturally in ~347 executions. **Do not move local e2e to a production build** — it does not build on this box. Residue filed as **#152**. Also: **#132 fallout** — a trigger outlived its columns and no PM could edit any sub or vendor)
> **Previously:** August 8, 2026 — S120 (**#145 FIXED, and its diagnosis was WRONG.** Not memory: `/dev/shm` is **64 MB**, the Docker default, and Chromium's renderer dies when it fills. `oom_kill` is **0** in `/proc/vmstat` and in every cgroup — nothing on this box was ever OOM-killed. One flag, `--disable-dev-shm-usage`, took the same 217-test group from **53 failures to 2** in a single unsplit process, and made it faster. **The four-process split is retired.** Also: M6M §6 camera capture + M-22, and §4.6's M-6 daily-logs screen, replacing a placeholder that had let A-12d/A-12e pass on a stub)
> **Previously:** August 7, 2026 — S120 (**#145 RAISED** — the Codespace OOMs during a full Playwright chunk and Chromium's renderer is killed mid-navigation: 7.9 GB total, **130 MB free**, no swap, `next-server` at **1.4 GB RSS**. Presents as `Page crashed` on a different test each run, which reads as a flake and is a resource ceiling. Worked around by splitting the e2e gate into **four** processes with a server restart; **#135's `next build && next start` would remove the cause instead**. Also: **A-30f** — the detail views had no back chevron, found on a phone)
> **Previously:** August 7, 2026 — S119 (**#143 AND #144 BOTH CLOSED.** #143: the seed now assigns PM/foreman/crew to the m-sections project — it created exactly one row, the foreman's, confirming the diagnosis — and the crew-for-foreman substitutions are reverted. **The reachability guard needed a new negative**: with every company-A identity reaching every company-A project, the table no longer contained a `false`, so it now asserts the cross-tenant refusal against company B as well. #144 below)
> **Previously:** August 7, 2026 — S119 (**#144 CLOSED** — the Part C suite cleans up at both ends and the live harnesses now create their own data, so they run standalone. **Proven by two back-to-back runs**: run 2's pre-clean sweep removed ZERO, and the row counts after each run were identical at the fixture baseline. A side-effect closed a separate owed item — the project now starts each run with **exactly one punch list**, which is A-67's case, asserted rather than hoped for)
> **Previously:** August 7, 2026 — S118 (**#144 RAISED** — the M6M Part C Playwright suite writes permanent fixture data every run and never cleans up; caused its first flake this session, and the obvious fix is **blocked by a coupling S118 introduced** where the live harnesses read those leftovers. **#143 now MACHINE-CHECKED** rather than only described — `s118-fixture-reachability.live.ts` asserts every seeded identity's reach against a declared table; **`josh+qa-admin@` was suspected of the same fault and is CLEAR**, only the foreman is affected. **Also this session:** M6M's seven Part C criteria are closed — A-55/A-57/A-58/A-67b fully, A-56 for four of six roles with both absences named, and **A-58 verified load-bearing** by deleting the check and watching it fail)
> **Previously:** August 7, 2026 — S117 (**#143 RAISED** — `josh+qa-foreman@` is seeded and signs in but is **not assigned to the fixture project**, so every "the foreman does not see X" assertion made under it passes **vacuously**. #127's class, one step further on and *silent* where #127 failed loudly. Found by M6M Part C's write-path suite failing 5/21. **Also this session:** Part C shipped the CO and punch write paths, and **A-57 is recorded NOT SATISFIED** — completing and verifying exist now, so the M-3 badge criterion is testable and simply was not written)
> **Previously:** August 7, 2026 — S115 (**#140 FIXED**, and its symptom **corrected**: the "silently wrong total" had already been converted to a hard stop by `assertInstrumentRatesInForce`, so what actually shipped was an error naming a false cause plus a PM being unable to recalculate any non-fixed CO. Fixed by a privileged server path + scoped route, following `invoice-derivation-server.ts`. **The UTC-slice as-of date is still owed and must move on BOTH paths together.** M6M **D-60/D-61** rule punch list targeting on M-33 with M-14 staying flat; **D-62** rules #140-first-then-all-three-CO-types)
> **Previously:** August 7, 2026 — S113 (**#127 CLOSED** — rebuild-test now holds permanent `subcontractor` and `client` identities with a linked member row, a project assignment and three punch fixtures, all seeded idempotently; the 32 `profile_id IS NULL` roster rows were **not** used. **#141 largely discharged** — `20260828000000_punch_subcontractor_visibility.sql` narrows punch SELECT **and** UPDATE, applied and proven failing-then-passing at 15/15; only the column-level verify residue stays open)
> **Previously:** August 7, 2026 — S110 (**#141 REWRITTEN** — M6M D-52's subcontractor exclusion from punch was reversed by Josh, so the four-policy floor #141 originally proposed **must not be built**. What is owed instead is the opposite migration: **narrowing** `punch_list_items_select_visible` so a subcontractor sees only items they are assigned or authored (M6M D-57). Narrower than current behaviour — `can_view_project()`'s assignment arm is role-blind, so an assigned sub sees the whole project's punch list today)
> **Previously:** August 7, 2026 — S109 (#140–#142 RAISED and **#117 AMENDED** — fallout from M6M's read-only reversal, D-50…D-56. #140 a PM's cost-plus CO totals read a DB-floored `instrument_rates` and get zero rows with no error; #141 `punch_list_items`/`punch_lists` have no role floor at all, so D-52's subcontractor exclusion exists nowhere — migration shape recorded, not written; #142 `/api/files/signed-url` returns 500 where CLAUDE.md requires 403. **#117's open scoping question is CLOSED — UI-only accepted by ruling**, with the exposure stated and found to be wider than `net_delta`)
> **Previously:** August 5, 2026 — S103 (#136 RAISED: desktop ships retainage rows to a crew browser in the RSC payload — render-deep protection, not payload-deep; exposed by D-47's widening, independent of M6M's D-49 mobile filter)
> **Previously:** August 5, 2026 — S100 (#127–#135 RAISED: M6M build fallout — missing sub/client test identities, silently-truncating db:types, desktop markup derivative gap, prototype wordmark, CI Supabase secrets, `subcontractors` role floor (#117's class), work_performed CHECK vs the desktop form, deliveries `checked_in_at` question, Playwright CI cold-start. **#103 and #104 CLOSED** — both verified satisfied on rebuild-test; they had been stale since S97)
> **Previously:** August 5, 2026 — S99 (#119–#126 RAISED: rebrand and comp fallout — slug/sender-address scheme, sign-up placeholders, undiagnosed site slowness, unverified password reset, deferred AI-prompt string, missing favicon.ico, stray test-mode Stripe subscription, unverified email authentication)
> **Purpose:** Tracks all known tech debt — open and closed. Lives in the repo, not in project knowledge. Read on demand when working on items, planning a polish session, or auditing.

---

## Polish Session Plan — Before Module 4 Build

Complete as of Session 40. All polish items closed. Module 4 build is unblocked.

---

## Conventions

**Tech debt numbers are immutable.** Once assigned, a number is never reused, never reassigned, never compacted. If #44 is closed, it stays #44 forever and nothing else can ever be #44.

**Closures move, they don't disappear.** When an item is closed, it moves from `Open Tech Debt` to `Closed Tech Debt` as a one-line entry: number, brief description, session closed, commit reference. The full description is preserved in git history (the commit that closed it) and in the relevant context file.

**Why this matters:** Old context files, code comments, and commit messages reference items by number. Deleting a number breaks every reference to it. Marking it closed in place preserves the audit trail without bloating the open list.

**Cross-references in code/docs:** Comments like `// TODO(#44):` or `Tech debt #21` in markdown should be updated when the underlying item closes — but the number itself stays stable so old references still resolve when looked up here.

---

## Open Tech Debt

### Branch-scoped, awaiting real numbers — `feature/register-backlog` [register-backlog §1.2]

> Provisional ids per the S136 rule (never a bare `#N` on a branch). Tag `regbacklog`. Main's next
> free was **#155** when filed. Four entries, not five: `s146-C5` was NOT filed — the audit-fixes
> pass root-caused and fixed it (s145-C5 and s146-C5 were the only two writers of
> `client_contracts_enabled`, racing each other on company A; s145-C5 now drives company B), and the
> following battery ran 1497/1497 with zero parallel reds. Recorded as fixed in the register.

- **#1-regbacklog — custom composable roles (register A14).** Josh raised **per-person** visibility;
  **ruled toward custom ROLES instead.** Every gate keys on `get_my_role()`; RLS cannot restrict
  columns, so a per-person permission on a *field* multiplies side tables rather than replacing
  them; and testing loses its fixed set — the S121 audit caught a crew member reading 13 change
  orders precisely because "crew" is a knowable state. ⚠️ **The underlying need is real:** a
  bookkeeper who needs invoices but not the schedule fits none of the five roles.

- **#2-regbacklog — "unbilled to client" on Expenses (register A15).** No expense→invoice link
  exists; this needs schema. ⚠️ **Not the same as `13c`'s "Cost you've fronted"** — that is cost
  fronted on a *project*, derivable via `invoice_cost_claims`. Two different questions; do not build
  one and label it the other.

- **#3-regbacklog — package scope rename `@framefocus/shared` (register A16).** ~150 import lines,
  breaks the build on any miss, **zero user-facing change** — the npm scope is a build-time
  identifier that never reaches a browser, a PDF or an email. Do it in one sweep or not at all.

- **#4-regbacklog — duplicate token values after the README ramp (K8).** `warning` == `warningDeep`
  and `danger` == `dangerAlt` since the ramp landed — the design carries one of each. **Both names
  were kept deliberately: a repaint is not a rename.** ⚠️ But two names pointing at one hex will
  read as a mistake to the next person; either re-diverge them when the design does, or fold the
  aliases with a sweep of their consumers. Until ruled, neither — this entry is the explanation.


### Branch-scoped, awaiting real numbers — `feature/s175-dialog-sweep` [S175 item 9]

> Provisional id per the S136 rule (never a bare `#N` on a branch). Tag `dialogsweep`.
> Filed, NOT built — the Q9.2 ruling says the `prompt()` value-collectors each need their own small
> design and must not be papered over with an improvised text-input modal to make the sweep look
> complete.

- **#1-dialogsweep — the native `prompt()` sweep is owed, and there are FIVE sites, not the two the
  item-9 brief named.** Raised S175 (2026-08-27), during the confirm/alert sweep. The brief's Q9.2
  said *"2 `prompt()` calls: a markup text label, and an items-tab entry."* Measured against the
  tree, there are **five**, and all five collect a value (a form, not a confirmation), so the
  ruling's reasoning — *"each needs its own small design"* — applies to all five, not two:

  | # | Site | What it collects |
  | --- | --- | --- |
  | 1 | `apps/web/app/dashboard/estimates/[id]/items-tab.tsx:201` | an items-tab entry (the brief's example) |
  | 2 | `apps/web/app/dashboard/projects/[id]/files/[fileId]/markup/markup-editor.tsx:92` | a markup text label (the brief's example) |
  | 3 | `apps/web/app/dashboard/projects/[id]/lien-releases/releases-panel.tsx:85` | a void reason |
  | 4 | `apps/web/app/dashboard/settings/contract-settings-form.tsx:307` | a form name (picker label) |
  | 5 | `apps/web/app/dashboard/settings/lien-release-settings-form.tsx:104` | a form name (picker label) |

  All five were **left exactly as-is** by item 9 (out of scope, correctly). The build owed is a
  small text-input dialog — a `usePrompt()` companion to the shipped `useConfirm()`/`useAlert()`
  (`apps/web/components/confirm/confirm-provider.tsx`) — returning `Promise<string | null>`. Sites 3
  (a void reason) and 4/5 (a name that becomes a stored label) are the ones with real validation
  needs; sites 1/2 are the simplest. **Same Playwright hazard as the confirms:** a native `prompt()`
  is auto-dismissed (returns `null`) in every e2e run, so these value-collecting flows are not
  exercised in a browser either.

### Branch-scoped, awaiting real numbers — `feature/s174-selections-email-and-markup` [S174]

> Provisional ids per the S136 rule: never allocate a bare `#N` on a branch. Tag `s174`.
> **All four came out of Josh's S173 click-test and NONE was built in S174**, on the brief's own
> instruction: *"Investigate and report 3, 4, 5, 6 — do not build them."* Items 1 and 2 of that
> click-test WERE built and are commits `0626e6c` and `9b49cc1`; they are not filed here.
>
> **Every claim below was probed against the live rebuild-test database**, not read off the
> migration files, because the two disagree in one place that matters (`#2-s174`). The probe was
> a throwaway estimate created, exercised and hard-deleted in one script; the residue check at the
> end returned zero rows.

- **#1-s174 — A CLIENT WHO CONFIRMS BY PHONE, IN PERSON OR ON PAPER CANNOT BE RECORDED AT ALL.
  There is no company-side path to a selection decision, and the SCHEMA forbids one twice over.**
  Raised S174 (2026-08-25). Josh: *"Some clients confirm by phone, in person or on paper. The
  company must be able to record the client's choice on their behalf — WITH A REQUIRED NOTE saying
  how the choice was received."*

  **What blocks it today, both halves confirmed in `20261026000000_selections_tables.sql`:**

  | Constraint | Text | Why it blocks |
  | --- | --- | --- |
  | `selection_signing_sessions_channel_check` | `CHECK (signer_channel = 'portal_session')` | A single permitted value. There is no channel a company attestation could be written as. The CO table admits `token_link` as well; this one was deliberately tightened, and its comment says so: *"PORTAL ONLY … The CHECK is therefore tighter than the CO one."* |
  | `selection_signing_sessions_completed_shape` | `status <> 'completed' OR (… signature_data IS NOT NULL AND signer_profile_id IS NOT NULL …)` | A completed session must carry a client's drawn-or-typed signature AND a client profile id. A company attestation has neither: nobody signed in the product. |

  Both are correct for what they were written for, and both must be widened rather than removed.

  **THE PRECEDENT JOSH NAMED IS THE NOTARY PATH, and it fits exactly.** `contract_documents`
  (`20260926000000_7i_contracts.sql`) carries `delivery_mode` = `'esignature' | 'notary'`, and on
  the notary path `lien-release-pdf-service.ts` leaves the signature area **BLANK** — ruling C4,
  S140, in its own words: *"A notary attests to a signature made in their presence, so a signature
  the product drew would be a second, contradictory claim."* The product does not fabricate a
  signature it did not witness; it records that the ceremony happened elsewhere and says so.

  **AND THE SHAPE IS Q6's CALLER CONTEXT**, which already exists for change orders
  (`co-signing-service.ts:130`, `CoSignatureCaller`). Its header is the argument for this item
  verbatim: *"an authenticated portal session and an anonymous token holder are materially
  different evidence, and `signer_ip`, `signer_user_agent` and the consent record must be able to
  say which … Storing those two in one pair of columns with nothing to tell them apart would make
  the weaker evidence indistinguishable from the stronger, in the row that IS the binding record."*
  A COMPANY ATTESTATION is a third, and weaker, kind of evidence than either. `signer_ip` and
  `signer_user_agent` would describe **a member of staff**, not the client — the exact conflation
  that paragraph forbids.

  **Fix direction — do NOT reuse `signer_profile_id` for the staff member.** That column means
  "the client who signed", it is what `selections_client_arm`-style reads key on, and overloading
  it makes a company attestation indistinguishable from a client signature by query. Sketch:
  - a third channel value, e.g. `company_attested`, added to the CHECK;
  - `completed_shape` gains an arm: on `company_attested`, `signature_data` and `signer_profile_id`
    are NULL and **`attested_by` (staff profile) and `attestation_note` are NOT NULL** — Josh's
    required note, enforced structurally, the way `change_orders_void_shape_check` enforces
    `void_reason` rather than trusting a form;
  - `selectionConsentTextFor()` gains a third variant naming the channel inside the sentence, as
    `coConsentTextFor()` does — so the consent record answers the question on its own without a
    reader having to join it to `signer_channel`;
  - the sheet renders it as visibly NOT a signature, the way the notary path renders a blank box.

  **Open question for Josh, and it should be answered before this is built:** may a company
  attestation be *reversed* by the company that wrote it, or is it a resting record like a signed
  session? The client never touched it, which argues for reversible; it is the basis for a price
  the client will be billed, which argues for `revise`-and-re-attest. Cross-ref `#4-s174`.

- **#2-s174 — ⚠️ AN OWNER OR ADMIN CAN SILENTLY REWRITE A SENT ESTIMATE — ITS NAME, ITS
  `grand_total` AND ITS SCOPE — THROUGH ORDINARY POSTGREST. The freeze is in TypeScript only, and
  the estimate's own LINE ITEMS are floored at the database while its PARENT ROW is not.**
  Raised S174 (2026-08-25). **This was found while investigating Josh's items 4 and 5 and is more
  serious than either.**

  **Probed live, signed in as `josh+test50@worthprop.com` through the anon key — i.e. exactly what
  a browser console can do — against a throwaway estimate at `status = 'sent'`:**

  | Attempt | Result |
  | --- | --- |
  | `UPDATE estimates SET name = …` | **1 row.** Applied. |
  | `UPDATE estimates SET grand_total = 999999, subtotal = 999999` | **1 row. `grand_total` read back as `999999`.** |
  | `UPDATE estimates SET scope_summary = …` | **1 row.** Applied. |
  | `INSERT INTO estimate_line_items …` | **refused** — `new row violates row-level security policy` |
  | `UPDATE estimates SET status = 'draft'` (unsend) | **1 row.** Applied. |
  | `DELETE FROM estimates` | 0 rows — no DELETE policy for anyone. Correct. |
  | the same three UPDATEs as a **PM who did not author it** | 0 rows each. Correct. |

  **The asymmetry, exactly:** `estimate_line_items_insert_manager` and `..._update_manager`
  (baseline `:3428`, `:3446`) both carry `AND e.status = 'draft'`. `estimates_update_manager`
  (baseline `:3595`) carries `status = 'draft'` **only on its project-manager arm** — the
  Owner/Admin arm is `get_my_role() = ANY (ARRAY['owner','admin'])` and nothing else. The children
  are frozen at the database; the parent is frozen only by
  `updateEstimate()`'s `if (current.status !== 'draft')` in `estimates-client.ts:353`.

  **This is CLAUDE.md's PARITY rule failing in the way it names:** *"The rules live below the UI —
  in RLS, a service function, or a shared util — so neither surface can enforce a different version
  of them."* A service-layer check is not below the UI; it is the UI's own code, and every write
  path in this app goes to PostgREST directly.

  **Why it matters more than a hypothetical console attack.** It is the mechanism by which items
  `#3-s174` and `#4-s174` could be "solved" wrongly: an unsend that flips `sent → draft` is already
  possible and already permitted, so anyone adding an Unsend button gets silent post-send editing
  for free, with no guard anywhere to stop it.

  **Fix direction.** Widen `estimates_update_manager`'s Owner/Admin arm with an explicit status
  predicate, and decide in the same pass which columns are legitimately writable after send —
  `viewed_at`, `accepted_at`, `declined_at`, `reminder_count`, `last_reminder_sent_at`,
  `client_unsubscribed_at`, `signed_proposal_file_id` and `status` itself are all written by the
  signing and reminder machinery on rows that are already sent, so a blanket `status = 'draft'`
  gate would break the proposal flow. The CO precedent is a **trigger** that names the permitted
  columns (`enforce_change_order_immutability`), not an RLS predicate. Cross-ref `#4-s174`, which
  should be decided first: what "frozen" means depends on whether void-and-reissue exists.

- **#1-s175 — `softDeleteEstimate()` HAS NO STATUS GUARD: A SENT ESTIMATE REACHES THE TRASH WITH NO
  REASON RECORDED.** Raised S175 (2026-08-25), found while building void-and-reissue.
  **Live today.**

  Void requires a reason in every case and freezes it permanently (`#3-s174`, closed below). The
  trash bin, beside it, asks for nothing: `softDeleteEstimate()` checks the caller is Owner/Admin
  and writes `is_deleted = true` at any status. So the *documented* remedy for withdrawing a
  client-facing document keeps a permanent record, and the *undocumented* one sitting next to it on
  the same screen keeps none.

  **Deliberately NOT fixed at S175 [Josh].** Delete was ruled out of scope for that session and the
  reason is recorded rather than assumed: widening scope mid-queue is how sessions stop finishing.
  This is the filing, not a deferral by neglect.

  **Fix direction.** Not "add a reason to delete" — decide first whether a sent estimate should be
  soft-deletable at all now that void exists. The change-order answer is instructive and does not
  transfer wholesale: S168 allowed DELETE only for UNSIGNED COs, with `void` as the path for
  anything the client had seen. The estimate equivalent of "the client has seen it" is `sent`, and
  the equivalent of "signed" is `accepted`/`converted` — which `#3-s174`'s ruling already refuses to
  void, so a delete path there would be the only way to remove one. Cross-ref `#2-s174` (the freeze)
  and `#3-s174`.

- **#3-s174 — ✅ CLOSED [S175] — A SENT ESTIMATE CANNOT BE VOIDED. There is no `voided` status, no
  `void_reason`, and no supersession chain — the three things S168 gave change orders.** Raised
  S174 (2026-08-25).

  > ### ✅ CLOSED [S175] — `20261032000000_estimate_void_reissue.sql` + `20261033000000_void_estimate_rpc.sql`
  >
  > `voided` in the status CHECK, `void_reason`/`voided_by`/`voided_at` with a two-way shape CHECK,
  > `supersedes_estimate_id` with `estimates_supersedes_once`, and the void record frozen the moment
  > it is written. Reason REQUIRED in every case, as ruled for COs. Reissue reuses
  > `clone_estimate()` rather than copying its traversal.
  >
  > **Two things the build found that the filing did not anticipate:**
  >
  > **(i) The ruled PM arm was UNREACHABLE.** Q2.4 was ruled Owner/Admin + the authoring PM.
  > `estimates_update_manager`'s PM arm carries `status = 'draft'`, so a SENT estimate is filtered
  > out of a PM's UPDATE **before any trigger runs** — zero rows, no error. The authority trigger
  > was correct and could never fire for the one role it was written to admit. Fixed with a
  > SECURITY DEFINER `void_estimate()` RPC; **widening the RLS policy was rejected** because it
  > would hand a PM UPDATE on every non-frozen column of a client-facing document, `status`
  > included — so a PM could mark an estimate `accepted` on the client's behalf.
  >
  > **(ii) The three dead vocabularies were retired in the same pass** [Josh]: `'revised'` dropped
  > from the CHECK (verified zero rows), `parent_estimate_id` and `version_number` commented as
  > vestigial with what each was for quoted. *"A dead `revised` beside a live `voided` is a trap."*
  >
  > A CONVERTED estimate is refused outright, with the error naming the project — the one place the
  > S168 CO ruling deliberately does NOT carry over, because **a change order adds to a project and
  > an estimate is its origin.** Evidence: `s175-estimate-void-reissue.live.ts`, 18 probes, every
  > refusal mutation-proved through the service role.
  Josh: *"Same shape as #1-s167fx, the sent CO you fixed at S168."*

  **He is right about the shape and it is worth being precise about the difference.** `#1-s167fx`
  was a CO that could not be REMOVED by any path including service role, because two guards closed
  on each other. A sent estimate is not stuck that way:

  | | sent change order, pre-S168 | sent estimate, today |
  | --- | --- | --- |
  | soft delete | n/a | **works** — Owner/Admin, `softDeleteEstimate()`, no status guard, button already on the builder |
  | hard delete | refused by an FK with no CASCADE | refused — no DELETE policy at all |
  | void | did not exist | **does not exist** |
  | reissue / supersedes | did not exist | `parent_estimate_id` and `cloned_from_estimate_id` exist, but neither means "this replaces a withdrawn one" |

  So the estimate's defect is **narrower and cleaner**: there is no deadlock to unpick, only a
  missing concept. `estimates_status_check` (`20260704212000:19`) is
  `draft · review · sent · viewed · accepted · declined · expired · revised · converted` — nine
  values and none of them means "we withdrew this". `declined` is the CLIENT's act and must not be
  borrowed for the company's.

  **What "void" would have to be, following S168 rather than inventing:** `voided` in the status
  CHECK; `void_reason` / `voided_by` / `voided_at` with a two-way shape CHECK (a voided row cannot
  lack its reason, a live row cannot carry one); authority mirroring the estimate READ floor
  (`estimates_select_authenticated` — Owner/Admin, or the authoring PM) rather than inventing a
  new one; `voided_by` stamped from `auth.uid()`, never from the payload;
  `supersedes_estimate_id` with a once-only unique index, the `contract_documents
  .supersedes_document_id` shape. **And the freeze that makes a void mean anything is `#2-s174`** —
  voiding a row that can still be edited afterwards records nothing.

  **One thing S168 settled that must NOT be re-litigated silently:** Josh ruled a void requires a
  reason in **every** case, signed or unsigned, and ruled *against* distinguishing them. The
  estimate equivalent of "signed" is `accepted` / `converted`.

  **The judgement call this needs from Josh, which the CO ruling does not answer:** an estimate
  that has been **converted to a project** is load-bearing in a way a signed CO is not —
  `projects.source_estimate_id`, `project_financials.contract_value` and every budget line derived
  from it hang off it. `20260806000000` already freezes `source_estimate_id` because *"re-pointing
  the source instrument silently re-prices"*. Voiding a converted estimate probably must be
  refused outright rather than allowed-with-a-reason. Cross-ref `#117`.

- **#4-s174 — ✅ CLOSED [S175] AS WON'T BUILD, AND THE DATABASE NOW ENFORCES IT — A SENT ESTIMATE
  CANNOT BE UNSENT.** Raised S174 (2026-08-25).

  > ### ✅ CLOSED [S175] — WON'T BUILD, and the boundary is now defended by something
  >
  > Josh accepted the recommendation: void-and-reissue is the answer and unsend is not built.
  > **But "won't build" was not enough on its own**, and that was the whole finding —
  > `UPDATE estimates SET status = 'draft'` on a sent estimate returned **1 row**, so nothing
  > defended the boundary except the absence of a button.
  >
  > `enforce_estimate_immutability` now refuses any transition to `draft` or `review` from a
  > client-facing status: *"A sent estimate cannot be returned to draft — void it and reissue
  > instead."* Backwards only — forward transitions (accepted, declined, expired, converted, voided)
  > are untouched, and `s175-estimate-void-reissue` D3 is the paired positive that proves the rule
  > did not over-reach.
  >
  > The second reason unsend is wrong is now also structural: `estimate_line_items`' own policies
  > key on the same `status = 'draft'`, so an unsend would have re-opened the LINE ITEMS too. Josh: *"Related to 4, and possibly deliberate — an
  emailed estimate is a document the client holds, and silently editing it is the thing
  void-and-reissue exists to prevent. Report whether void-and-reissue is the right answer here as
  it was for COs."*

  **Answer: yes, void-and-reissue is the right answer, and "unsend" should NOT be built.** Three
  reasons, in order of weight:

  1. **The document is already gone.** `contracts-shared.ts` says it for contracts and it is just
     as true here: *"nothing can [reach] the counterparty's hands — this is bookkeeping about an
     instrument that is already out there."* The client has a PDF and an email with a tokenised
     signing link. An unsend changes the company's record of an estimate the client is still
     holding, and the two then disagree with no marker saying so. That is the S173 Job 1 failure
     mode pointed at a document instead of an affordance: everything looks consistent from inside.
  2. **Unsend would produce exactly the silent edit Josh is describing**, because `#2-s174` means
     nothing stops the edit once the row reads `draft` again — and `estimate_line_items`' own
     `status = 'draft'` policy would then **re-open the line items too**. The freeze that makes the
     document trustworthy is keyed on the same status an unsend button would flip.
  3. **The estimate has a live signing session.** Sending mints a tokenised link with an expiry;
     `sent_at`, `expires_at`, `reminder_count`, `last_reminder_sent_at` and the reminder cron all
     key off "sent". Unsend has to answer what happens to a link already in the client's inbox, and
     "invalidate it" is precisely what void does — with a record of why.

  **The probe result that makes this urgent rather than theoretical:** `UPDATE estimates SET
  status = 'draft'` on a sent estimate as Owner returned **1 row**. Unsend is not blocked; it is
  merely unreachable from the product. Nothing is defending the boundary Josh is describing — the
  absence of a button is.

  **Recommended sequencing, and it matters:** `#2-s174` (the freeze) → `#3-s174` (void + reissue) →
  close this one as WON'T BUILD with the reasoning above. Building void first on an unfrozen row
  gives a void that can be edited around.

- **#5-s174 — 56 NATIVE `window.confirm()` DIALOGS ACROSS 38 DESKTOP FILES, WHILE MOBILE ALREADY
  USES STYLED PANELS FOR THE SAME ACTIONS.** Raised S174 (2026-08-25). Josh named the
  convert-to-project one; it is repo-wide, and the sweep he asked for is below.

  **Inventory** — `app/dashboard/**` and `components/**`, `.tsx`:

  | | count |
  | --- | --- |
  | `confirm()` call sites | **56**, in **38** files |
  | `alert()` call sites | 20 |
  | `prompt()` call sites | 2 — `estimates/[id]/items-tab.tsx:201`, `projects/[id]/files/[fileId]/markup/markup-editor.tsx:92` |
  | any of the three under `app/m/**` | **0** |

  Heaviest files: `changes/[coId]/co-builder.tsx` (5), `projects/[id]/status-control.tsx` (4),
  `estimates/[id]/items-tab.tsx` (4), `contracts/contracts-panel.tsx` (3),
  `estimates/[id]/estimate-builder.tsx` (3).

  **⚠️ THE PARITY ANGLE IS THE REASON THIS IS DEBT AND NOT A PREFERENCE.** The same actions exist
  on both surfaces and confirm differently: `app/m/p/[projectId]/changes/[coId]/co-actions.tsx`
  uses an inline panel with `PrimaryButton … tone="danger"` and `SecondaryButton`
  (`m-co-void-confirm`, `m-co-send-confirm`), while `co-builder.tsx` uses `window.confirm()`.
  CLAUDE.md permits presentation to differ between surfaces and requires the reason to be recorded
  where the code is — there is no such note in either file, so this is drift, not a ruled
  exception.

  **AND THE PRECEDENT FOR CONVERTING THEM ALREADY EXISTS, from S168.** `co-builder.tsx:190` says
  it: *"The void REASON is required in every case, so voiding is a panel and no longer a
  `window.confirm()`. Josh ruled against a signed/unsigned split."* The rule that fell out of it is
  worth stating before any sweep begins: **a confirmation that must CARRY DATA is a panel; a
  confirmation that is purely yes/no is what these 56 are.** Converting the 56 is a presentation
  change, not a behaviour change — which is what makes it safely mechanical, and also what makes it
  low-value to do by hand one at a time.

  **Fix direction — one primitive, not 38 rewrites.** There is no shared modal shell today:
  `clone-modal.tsx`, `send-proposal-modal.tsx`, `payment-modal.tsx`, `closeout-dialog.tsx` and
  `clock-modal.tsx` each build their own overlay. A `useConfirm()` hook returning a promise keeps
  every call site's shape (`if (!(await confirm({…}))) return;`) so the diff is one line per site
  and the control flow is unchanged. Do the primitive and ONE file first, let Josh look at it, then
  sweep. **`e2e/**` accepts these dialogs via `page.once('dialog', d => d.accept())` in at least
  `desktop-selections.spec.ts` and others — every such handler is a test that will go green while
  clicking nothing once the dialog stops being native.** That is the S157 trap in this item, and it
  is why the e2e sweep belongs in the same commit as the UI change, not after it.

- **#6-s174 — ✅ NOT A DEFECT — `EST-1951` showing `project = null` is correct; Josh converted
  `EST-1952`.** Raised and closed S174 (2026-08-25).

  Verified against rebuild-test:

  | estimate | status | project via `projects.source_estimate_id` |
  | --- | --- | --- |
  | `EST-1951` "Copy of Copy of test4" | `sent` | none — and it was never converted |
  | `EST-1952` "Copy of Copy of Copy of test4" | `converted` | **`PRJ-1952` "Copy of Copy of Copy of test4"** |

  Conversion links exactly as expected, through `projects.source_estimate_id`. The two estimates
  are one clone apart and their names differ by a single "Copy of", which is why they read as the
  same record. **No fix, and nothing to file** — recorded only so the next reader does not
  re-investigate a link that works.

### Branch-scoped, awaiting real numbers — `feature/s175-clients-off-team` [S175 item 6]

> Provisional id per the S136 rule: never allocate a bare `#N` on a branch. Tag `s175i6`.

- **#1-s175i6 — A PENDING CLIENT INVITATION IS VISIBLE AND CANCELLABLE IN EXACTLY ONE PLACE, AND IT
  IS THE TEAM PAGE — the page `#1-s168` just took clients off.** Raised S175 (2026-08-27), while
  closing `#1-s168`.

  `#1-s168`'s filing lists, after its five limbs: *"Plus the pending-invitations table on the same
  page, which lists client invites and offers Copy link / Resend / Cancel for them."* It was
  **deliberately not changed**, and the reason is worth more than the change would have been.

  **The portal panel has no pending-invitation surface at all.** `PortalAccountRow` is
  `{contactId, contactName, email, profileId, state}`, and `profileId` is null until an invite is
  **accepted** — so between sending and acceptance the panel shows the same "Invite to portal"
  button and nothing else. Hiding `role = 'client'` rows from the Team page would therefore make a
  pending client invite **invisible everywhere and impossible to cancel**.

  **And one such row exists on rebuild-test right now**, which is how this was noticed:

  ```
  josh+qa1-client@worthprop.com   role=client  status=pending
  contact_id=NULL  project_id=NULL            (created via the STAFF route, pre-fix)
  ```

  `contact_id IS NULL` means it maps to **no project**, so it would not appear in any project's
  portal panel even if that panel grew a pending list. Legacy rows created through the Team form
  before this session all have that shape.

  **What is owed, and it is a build, not a filter:**
  - a pending-invitation row in `portal-panel.tsx` — sent-at, expiry, Copy link, Resend, Cancel —
    keyed on `invitations` where `role = 'client'` and `project_id = <this project>`;
  - a decision about the orphans: legacy client invites with `project_id IS NULL` belong to no
    project and need either a backfill or a company-level surface;
  - **only then** filter the Team page's pending table. Doing it first strands rows.

  Not urgent: the Team page listing a pending client invite is untidy, not harmful, and Copy
  link / Resend / Cancel all still work correctly on it.

---

### Branch-scoped, awaiting real numbers — `feature/s168-co-lifecycle-portal-split` [S168]

> Provisional ids per the S136 rule: never allocate a bare `#N` on a branch. Tag `s168`.
> **Both came out of Josh's Part B click-test and NEITHER was built in S168**, on the brief's own
> instruction: *"establish what removing them touches before changing it, and if it is more than
> cosmetic, file and report rather than building it here."* It is more than cosmetic. The scope
> below is the establishing work, done, so the fix session starts from a map instead of a survey.

- **#1-s168 — ✅ CLOSED [S175 item 6] — A CLIENT IS NOT A TEAM MEMBER, BUT `/dashboard/team` LISTS
  THEM AND OFFERS THEM THE STAFF INVITE. The invite link it offers a client is a dead end.** Raised
  S168 (2026-08-20), from Josh's click-test: *"client should be removed from team side."*

  > ### ✅ CLOSED [S175 item 6] — no migration, no policy change, one constant
  >
  > `NON_TEAM_ROLES = ['client']` and `isTeamRole()` in `lib/services/team.ts`, read by BOTH
  > surfaces. All five limbs, in the order this file listed them:
  >
  > 1. the local `INVITABLE_ROLES` duplicate is **deleted**; the form builds from the shared
  >    `INVITABLE_ROLES` × `ROLE_LABELS` × `ROLE_DESCRIPTIONS`, giving the shared list its FIRST
  >    consumer — it had none, which is how the two diverged unnoticed;
  > 2. `isClientRole` and its seat-limit branch **deleted**, both sites;
  > 3. `getTeamMembers()` filters with `.not('role','in',…)` — a deny-list, so it cannot over-reach;
  > 4. `getTeamMember()` returns **null**, so `/dashboard/team/[id]` inherits the gate;
  > 5. the accommodation comment is quoted and retired.
  >
  > **⚠️ THE FILING UNDERCOUNTED THE DOORS: IT IS FIVE, NOT ONE.** `app/dashboard/team/[id]/actions.ts`
  > carries four server actions that take a `targetId` straight off the wire and never render the
  > page. Before this, `updateTeamMemberAction` would rewrite a CLIENT's role and notes through the
  > staff editor's action and `deleteTeamMemberAction` would soft-delete their portal account **and
  > ban their auth user for 876000 hours**. None of that is touched by a list filter, and none of it
  > was named in the five limbs. Putting the rule in the SERVICE closed the page and all four at
  > once; TypeScript then made every call site declare how it refuses.
  >
  > **That is not a theory — it was measured.** Inverting the gate and re-running the harness
  > performed exactly those writes on `josh+qa-client@`, which had to be repaired by hand. See
  > `docs/specs/S175-log.md`.
  >
  > **⚠️ Q6.1 [Josh, S175]: `subcontractor` is NOT filtered**, and this file's own warning about
  > `DASHBOARD_ROLES` — *"a scope decision, not a freebie"* — is why. Both the live harness (A3, B3)
  > and the browser spec assert the sub is STILL on the list and STILL has a detail page, so the
  > tidy reach fails loudly rather than silently dropping rows.
  >
  > **⚠️ THE PENDING-INVITATIONS TABLE IS DELIBERATELY UNCHANGED — see `#1-s175i6` in the section above.** Hiding
  > client rows there would strand them.
  >
  > Proof: `s175-team-clients-off.live.ts` (17 probes) and `e2e/desktop-team.spec.ts` (2). Both were
  > proved non-vacuous by inverting the gate and watching them go red.

  The portal invite Josh actually wants is already built and already lives in the right place —
  `portal-panel.tsx`, on the **project's Contacts tab** (M9 B.4). The Team page is a second,
  older door to the same idea, and it is the wrong one: a client has no seat, no dashboard, and
  nothing on that page applies to them.

  **WHY THIS IS NOT A ONE-LINE FILTER.** `client` is not incidentally present on the Team side —
  it was deliberately wired in, before the portal existed, and the wiring has five limbs:

  | Site | What it does today |
  | --- | --- |
  | `lib/services/team.ts:97` `getTeamMembers()` | `select … from profiles` with **no role filter** — every client in the company is a row. Called only by `team-page-client.tsx:45`. |
  | `app/dashboard/team/invite/invite-form.tsx:10` | A **LOCAL `INVITABLE_ROLES` duplicate** that includes `client` with the description *"Portal access to project timeline, payments, and documents"*. |
  | `packages/shared/constants/roles.ts:42` | The shared `INVITABLE_ROLES` **also** includes `'client'`. Two lists, and the local one is the one the form renders. |
  | `invite-form.tsx:64,77` `isClientRole` | A real behavioural branch — **client invites skip the seat-limit check**. Removing the role without removing this leaves dead logic that will read as a bug. |
  | `app/dashboard/team/[id]` | The detail route is reachable by URL for a client's profile id whether or not the list shows it. **Dropping the row from the list is cosmetic on its own.** |

  Plus the pending-invitations table on the same page, which lists client invites and offers Copy
  link / Resend / Cancel for them, and **`#2-s168` below, which is the same defect seen from the
  invitee's side and resolves with this.**

  **Fix direction.** Decide first whether a client invite should exist on the Team side *at all* or
  only be re-pointed. If removed: filter `getTeamMembers()` by `DASHBOARD_ROLES` (which already
  excludes `client` **and** `subcontractor` — note that second one, it is a scope decision, not a
  freebie); delete `client` from BOTH `INVITABLE_ROLES` lists and collapse the local duplicate into
  the shared one while you are there; remove `isClientRole`; gate `/dashboard/team/[id]` on the same
  list; and sweep the invite pipeline (`/api/invites`, `email_type`, the acceptance page) for the
  client arm. **Sweep the tests before finishing** — anything asserting a team-roster row count or
  the invite role list encodes today's behaviour, per CLAUDE.md's S157 rule.

- **#3-s168 — `CO-QA-M9-SENT` WAS SIGNED FROM THE PORTAL AND IS PERMANENTLY LOST. THE READ ARMS
  STAYED GREEN OVER IT FOR THREE RUNS.** Raised S168 (2026-08-21), found while chasing unrelated
  fixture residue. Nobody reported it, because nothing failed.

  ```
  co_signing_sessions:  status=completed  signer_channel=portal_session
                        signer_name="QA Client Linked"  signed_at=2026-08-20T23:15:43
  ```

  Signed from the **portal**, during the Part B click-test. `9-spec.md` R10 puts a **Sign** button
  on exactly that row and `S165-m9-clicktest.md` B.2.2 tells the tester to expect it; B.5 §1 tells
  them not to press it. Both were true at once.

  **Two defects, and the second is the one that generalises.**

  1. **The fixture is unrepairable, and now more thoroughly than `CO-QA-M9-DRAFT` was.** `signed_at`
     cannot be cleared (S164) and the row cannot be deleted (S168's own boundary). It cannot even be
     renamed-aside-and-rebuilt the way the draft was: the seed's `ensureRow` key is the **title**, so
     a rename frees the title, but `co_number` is frozen by the immutability trigger and
     `CO-QA-M9-SENT` stays taken. A rebuild must take `CO-QA-M9-SENT-2`.

  2. **⚠️ `s164-m9-read-arms` STAYED 188/188 ACROSS THREE RUNS OVER A BROKEN FIXTURE.** ARM 4a
     asserts only `status !== 'draft'`, and ARM 5a only that the sent CO's line is visible. `signed`
     satisfies both. This is CLAUDE.md's S157 rule seen from the other end: not a test that
     contradicts a shipped rule, but a test **whose every assertion is satisfied by the wrong
     state**. A fixture pinned to one specific state needs an assertion that names that state.

  **Fix, in one pass, and not before Josh's click-test is finished** — re-seeding under a live
  click-test is the S167 mistake repeated:
  - Rename the signed row aside (`ZZ SUPERSEDED — QA M9 sent CO …`) and rebuild as
    `CO-QA-M9-SENT-2`, draft → line → flip to `sent`, per the existing S167 repair block's shape.
  - **Then tighten ARM 4a to assert the seeded CO is specifically `sent`** — that assertion is what
    would have caught this at 23:15 instead of two hours later by accident. It is deliberately NOT
    added now, because it would be red against the live database until the rebuild lands, and a
    knowingly-red test in the battery is noise rather than a task.
  - Decide whether the seeded pair should carry a portal Sign affordance at all. A fixture whose
    only job is to sit in one state probably should not be the row the click-test is told to click.
  Cross-ref `docs/specs/S167-fixture-inventory.md`, which now carries this as its second worked
  example and has had its "reachable from the UI" column widened from `/dashboard` to every surface.

- **#2-s168 — ✅ CLOSED [S175 item 6] — AN EXPIRED CLIENT INVITE POINTS AT THE ONE PAGE A CLIENT
  SHOULD NOT BE ON.** Raised S168 (2026-08-20), from the same click-test.

  > ### ✅ CLOSED [S175 item 6] — one sentence, and the role-aware version was the WRONG fix
  >
  > `'This invitation has expired. Ask the company to send you a new one.'` — matching the
  > `cancelled` sibling, which was already screen-free.
  >
  > **⚠️ IT DID NOT RESOLVE BY ITSELF, WHICH IS WHAT THE SESSION WAS ASKED TO CONFIRM.** Removing
  > clients from the Team side makes the old sentence WORSE — a misleading pointer becomes a wrong
  > one. The copy change is the resolution.
  >
  > **⚠️ AND THERE IS A THIRD FAULT NOBODY HAD NAMED, which is what decided the remedy.**
  > `get_invitation_status()` (`20261017000000`) branches on role: for `role = 'client'`, "expired"
  > means **the project's window closed**, and `expires_at` is not read at all.
  > `/api/invites/[id]/resend` resets `expires_at`. So telling a client to ask for a resend
  > prescribes an action that resets a clock their invitation does not read — from the Team page or
  > from anywhere else.
  >
  > So the requirement filed below — *"the message also needs to know whether the expired invite was
  > a staff invite or a client one"* — **is withdrawn rather than met.** Naming ANY screen repeats
  > fault one; promising a resend repeats fault three. Both halves of the honest sentence are
  > identical for both roles, so no new RPC, no widening of what an anonymous token-holder can learn
  > from a token, and no migration. Measured live: `s175-team-clients-off` C2 pins an expired client
  > invite whose `expires_at` is a year in the FUTURE.

  `app/invite/accept/accept-invite.tsx:63`:

  ```
  'This invitation has expired. Ask the company to resend it — they can do that from their Team page.'
  ```

  Two things are wrong with one sentence. It names an **internal** screen to an external
  counterparty, who cannot see it and cannot act on it; and once `#1-s168` lands, the Team page is
  not where a client invite is resent from either — the project's Contacts tab is. So the message is
  a dead end today and a **false statement** afterwards.

  It is not simply "reword it": the honest sentence depends on where client invites come from, which
  is `#1-s168`'s decision. **Resolve them together.** The message also needs to know whether the
  expired invite was a staff invite or a client one, and today it does not — the copy is shared.

### Branch-scoped, awaiting real numbers — `fix/s167-restore-m9-draft-co-fixture` [S167]

> Provisional id per the S136 rule: never allocate a bare `#N` on a branch. Tag `s167fx`.

- **#1-s167fx — ✅ CLOSED [S168] — A CHANGE ORDER THAT HAS LEFT DRAFT AND CARRIES A LINE ITEM IS UNDELETABLE BY ANY
  PATH, INCLUDING SERVICE ROLE. The two guards close on each other, and one of them documents an
  escape hatch that does not exist.** Raised S167 (2026-08-20).

  Both halves confirmed against the live row `cb5d7729-48e5-4fb7-8aac-14c762ab8b6c` on
  rebuild-test, with the service-role key, before this was filed:

  | Attempt | Result |
  | --- | --- |
  | `DELETE` the parent CO | `violates foreign key constraint "change_order_line_items_change_order_id_fkey"` — the FK is **`NO ACTION`**, declared without `ON DELETE CASCADE` at `20260704215000_module5_5d_change_orders.sql:130`. |
  | `DELETE` the line first | `Lines of a sent change order are immutable — void and reissue instead.` — `enforce_co_line_parent_open()`, `20260809000000_financial_rls_floor_part3.sql`. |

  **The escape hatch is imaginary.** `enforce_co_line_parent_open()` returns early when the parent
  row is already gone, and says why in its own comment: *"The parent is already gone (CASCADE
  delete) — nothing to protect, and blocking here would make a change order undeletable."* That
  branch can never be reached from a `DELETE` on `change_orders`, because the FK it presumes has
  no `CASCADE`. **The comment describes the exact defect it was written to prevent.**

  Service role is no help — it bypasses **RLS**, not triggers, and not FKs.

  **The same row is also unrevertable**, which is correct and is not the debt: the S164 fix
  (`20261022000000_co_signature_stamp_fix.sql`) refuses to clear `signed_at` or
  `contractor_signed_at` ("A signature stamp cannot be rewritten"), and the S123-era freeze refuses
  to restore `net_delta` ("A sent change order is immutable — void and reissue instead"). Those are
  the rules working. The debt is that **`void` is the documented remedy and `void` does not remove
  a row**, so a wrongly-created CO is permanent.

  **How it surfaced.** The S165 click-test signed the seeded fixture CO `CO-QA-M9-DRAFT` by
  accident (see the S167 inventory, `docs/specs/S167-fixture-inventory.md`). The fixture could not
  be restored, only renamed aside and rebuilt — `scripts/seed-test-identities.mjs`, S167 repair
  block — and `s164-m9-read-arms` ARM 5b had to be re-anchored from the line's **name** to its
  **parent id**, because the stuck row keeps a line called "QA M9 line on the DRAFT co" that is now
  legitimately client-visible.

  **Impact beyond QA.** This is a product behaviour, not a fixture problem. Any real CO created in
  error and sent — wrong project, wrong client, duplicate — is in the company's data for good.
  `voided` hides it from most surfaces but the row, its number and its line items remain, and
  `20260809000000` freezes `voided` too ("A voided change order is frozen forever").

  > ### ✅ CLOSED [S168] — `20261023000000_co_void_reissue_delete.sql`
  >
  > **Josh ruled all three paths** and the fix direction below was followed rather than short-cut:
  > the question *"should a sent CO be deletable at all"* was answered first, and the answer draws
  > the line at the **signature**, not at the FK.
  >
  > | Path | What shipped |
  > | --- | --- |
  > | **VOID** | Any sent CO, **signed or unsigned**, with a **REQUIRED reason** — Josh ruled against distinguishing the two. `void_reason`/`voided_by`/`voided_at` + `change_orders_void_shape_check`, authority in `enforce_change_order_void_authority` (owner/admin/authoring-PM, mirroring the #117 read floor). `voided_by` is stamped from `auth.uid()`, not the payload, and the whole record is frozen afterwards by the amended immutability trigger. **The signed artifact is retained** — only `pending` signing sessions are invalidated. |
  > | **REISSUE** | `supersedes_change_order_id`, the `contract_documents.supersedes_document_id` shape (7I §10.4). `enforce_change_order_supersedes_valid` requires the target to be VOIDED, same company, same project, never itself; `change_orders_supersedes_once` allows exactly one reissue per withdrawal. `/api/change-orders/[id]/reissue` copies lines and rows and rolls the new draft back on any partial failure — a rollback only possible *because* this item was fixed. |
  > | **DELETE** | **UNSIGNED ONLY.** `change_orders_delete_unsigned` (RLS: Owner/Admin, in-tenant) answers WHO; `enforce_change_order_delete_boundary` answers WHAT and **has no service-role escape**, because the claim it protects is *"we never sent that"*. |
  >
  > **The deadlock: CASCADE, and the comment is now true.** `ON DELETE CASCADE` added to
  > `change_order_line_items.change_order_id`, `change_order_line_rows.line_item_id`,
  > `co_signing_sessions.change_order_id` and `instrument_rates.change_order_id` (forced there —
  > `instrument_rates_one_instrument` makes SET NULL invalid); `tasks.change_order_id` takes SET NULL
  > because field work outlives its paperwork. An ordered delete was rejected: PostgREST has no
  > transaction, so it is three round trips that can strand a half-deleted document, **and it would
  > have required relaxing `enforce_co_line_parent_open()` as well** — CASCADE requires relaxing
  > nothing, because that function's unreachable early-return was written for exactly this.
  >
  > **⚠️ TWO FKs KEPT `NO ACTION` ON PURPOSE, and they are a feature:**
  > `invoice_lines.source_change_order_id` and `project_budget_items.source_change_order_id`. A CO
  > that has been billed or budgeted against is load-bearing elsewhere; the FK refusing is the guard,
  > and the route translates `23503` into a sentence.
  >
  > **Two judgement calls the ruling did not reach**, flagged in the migration header and repeated
  > here so they are easy to overturn: **(i)** delete is Owner/Admin, narrower than void's
  > owner/admin/PM, because it is destructive and unrecoverable; **(ii)** "unsigned" means
  > `signed_at IS NULL AND status <> 'signed'`, so a draft and a voided-but-never-signed CO are both
  > deletable — the ruling's boundary is the signature and the predicate is the signature.
  >
  > Evidence: `apps/web/test/s168-co-lifecycle.live.ts`, 21 probes, every refusal mutation-proved by
  > re-reading through the service role. Both surfaces updated (`co-builder.tsx`, `co-actions.tsx`)
  > through the same `voidChangeOrder`/`reissueChangeOrder`/`deleteChangeOrder`, per PARITY.

  **Fix direction as filed at S167 — do NOT just add `ON DELETE CASCADE`.** Decide first whether a sent CO *should*
  be deletable at all. If yes, the narrow change is `ON DELETE CASCADE` on
  `change_order_line_items.change_order_id` (and `change_order_line_rows.line_item_id`), which
  `enforce_co_line_parent_open()` is **already written to accommodate**, plus an Owner-only guard so
  this is not a PM-reachable erase of a financial record. If no, then the comment quoted above is
  the thing to fix, and `void` needs to be honest that it is permanent. Cross-ref `#117` (the CO
  read floor) for who may reach these rows at all.

### Branch-scoped, awaiting real numbers — `feature/s164-m9-client-portal` [S164]

> Provisional ids per the S136 rule: never allocate a bare `#N` on a branch. Tag `m9`.
> **Both were found while auditing Module 9's client surface and NEITHER is Module 9's.**
> Filed rather than fixed, on Josh's ruling [S164 Q-findings]: they belong to the M1 and M7 passes.

- **#1-m9 — `subscriptions_select_owner_admin` HAS NO ROLE CHECK. Its name asserts a floor its
  predicate does not contain.** Raised S164 (2026-08-19).

  ```
  subscriptions_select_owner_admin  SELECT  PERMISSIVE
    (company_id = get_my_company_id())
  ```

  It is the **only** SELECT policy on the table, so nothing narrows it — permissive policies are
  OR'd. Every role in the company reads the subscription row: crew, foreman, **subcontractor and
  client** included. Source: `20260101000000_baseline_schema.sql`.

  `CLAUDE.md`'s Admin Role Principle makes billing **Owner-only** and is explicit that it is
  stronger than owner+admin — *"Admin cannot see the Billing page at all."* The policy admits
  everyone and its name says the opposite.

  ⚠️ **IT IS NOT CURRENTLY LEAKING, AND THAT IS THE DANGEROUS PART.** The QA company has **0
  `subscriptions` rows**, so a probe reading `subscriptions` as a client returns `[]` and passes.
  That is `9-spec.md` §2's vacuity trap in a new place: the zero has nothing to do with the policy.
  **Do not close this on the strength of a green probe** — seed a row first.

  This is the S157 rule (*"a test that passes while contradicting a shipped rule is worse than a
  failing one"*) applied to a **policy name** rather than a test title. Same failure, same reason it
  survived four audit passes: nothing reads the name against the body.

  **Belongs to the M1 pass** (billing/subscription is M1's surface).

- **#2-m9 — `cost_catalog` SELECT has no role check, and a client and a subcontractor can read the
  company's unit-cost book TODAY.** Raised S164 (2026-08-19). **CLOSED [S170, 2026-08-21]** —
  `20261024000000_cost_catalog_select_floor.sql` replaces `cost_catalog_select_authenticated` with
  `cost_catalog_select_manager` (owner/admin/PM; **foreman excluded** — unit costs, per Josh S169
  Q11). Pulled forward from the M7 pass as **stage 0 of Allowances & Selections**, because the catalog
  becomes a client-facing option source there. Proven non-vacuously in
  `s170-allowance-row-type.live.ts` S170-0: owner and PM read ≥1 row; foreman, crew, sub and client
  read 0 with a working session. _Original text retained below._

  ```
  cost_catalog_select_authenticated  SELECT  (company_id = get_my_company_id())
  ```

  **Confirmed live, with rows, unlike #1-m9: 2 rows readable by `josh+qa-client@worthprop.com` and
  2 by `josh+qa-sub@worthprop.com`.** `cost_catalog_update_manager` correctly floors WRITES to
  owner/admin/PM — SELECT was simply never given the same treatment.

  Same shape as the leak S154 closed on `contact_addresses`, and **the subcontractor half is the
  sharper one**: a sub reading the cost book they are bidding against is a commercial exposure, not
  just a privacy one.

  ⚠️ **Check `estimate_*` before assuming this generalises.** The six `estimate_*` tables carry the
  same bare `company_id` shape but are contained by an `EXISTS` against `estimates`, whose own
  policy floors to owner/admin-or-PM-author. They are safe *by containment*. `cost_catalog` has no
  parent to be contained by, which is why it is the one that is actually open.

  **Belongs to the M7 pass** (cost/financial surface).

- **#3-m9 — the Financial Visibility Floor gates `project_financials.contract_value` and leaves
  the SAME FIGURE readable on `client_contracts`. A CREW MEMBER reads it today.** Raised S164
  (2026-08-19), while building M9 stage 4.

  ```
  client_contracts_select_visible  SELECT
    company_id = get_my_company_id()
    AND get_my_role() <> ALL (ARRAY['subcontractor','client'])   <- everyone else is in
    AND can_view_project(project_id)
  ```

  `client_contracts.contract_value` is a real column with real values, and the policy admits
  **project_manager, foreman and crew_member** on any project they are assigned to.

  **Confirmed live, with rows.** Signed in as the seeded QA identities against rebuild-test:

  | Identity | `client_contracts.contract_value` | `project_financials.contract_value` |
  | --- | --- | --- |
  | `josh+crew@worthprop.com` | **213854.10, 12345** | `[]` |
  | `josh+qa-foreman@worthprop.com` | **12345** | `[]` |
  | `josh+pm@worthprop.com` | **7860, 12365, 213854.10, 12345** | `[]` |

  `project_financials` is correctly floored for all three — which is the point. **The floor works
  on the table `CLAUDE.md` names and does not exist on the second copy.**

  ⚠️ **`CLAUDE.md`'s enforcement table says "Contract value … DB-enforced, Owner/Admin" and cites
  `20260811000000`.** That is true of `project_financials` and false of the platform: S123 was
  burned by exactly this shape on `change_orders`, where the documented policy and the live one had
  diverged. Here the two policies never diverged — there are simply **two homes for one figure**,
  and only one of them was ever floored.

  **NOT fixed here, deliberately.** The obvious fix — floor `client_contracts` to owner/admin —
  changes who can work with a contract, and 7I's authoring flow admits a PM. It needs a ruling, not
  a policy edit, and it is not M9's: M9 only touched the CLIENT arm on this table, which is
  correctly scoped and is proved by `s164-m9-read-arms.live.ts` ARM 2.

  **The client reading it is NOT part of this finding and is correct** — it is her contract, and
  `CLAUDE.md`'s S164 ruling puts the counterparty outside the Floor. The exposure is to **staff**.

  **Belongs to the M7 pass** (Financial Visibility Floor), with 7I as the affected surface.

- **#4-m9 — 🔴 FIXED HERE, and filed so the SHAPE is on record: the change-order signature was
  IMPOSSIBLE for ten days and no test noticed.** Raised and closed S164 (2026-08-19).

  `enforce_change_order_immutability()` (`20260809000000` §1) froze `signed_at` on any CO that had
  left draft. `completeCoSignature()` — the only writer of a client signature — does
  `update({ status: 'signed', signed_at })` on a CO whose status is `sent`. `OLD.signed_at` is NULL,
  `NEW.signed_at` is a timestamp, so **the first stamp was refused with the message written for a
  rewrite**: *"A signature stamp cannot be rewritten."* `/sign-co/[token]` returned 409 to every
  client who clicked Sign.

  **Confirmed three ways before the fix was written**, and the second is the one worth keeping:

  1. The exact write was attempted against a live `sent` CO and refused, by name.
  2. **Every `signed` change order in the database predates 2026-08-09.** The newest is 2026-07-31
     — the migration's own date is the cut-off. Nothing has been signed since it shipped.
  3. The trigger permitted `status = 'signed'` on its own and forbade only the timestamp. A CO could
     be marked signed with no record of when, and could not be marked signed with one.

  **Why the suite did not catch it, which is the transferable part.**
  `s123-co-signed-notify.live.ts` INSERTs a row with `status: 'signed'` directly and asserts the
  notifications. `s97ct-floor3.live.ts` **1c** asserts the trigger's refusal of a REWRITE and passes
  correctly. **The suite covered the rule and it covered the consequence. Nothing covered the act
  between them** — no test had ever called `completeCoSignature`.

  Fixed by `20261022000000_co_signature_stamp_fix.sql`: the first stamp is allowed on the transition
  into `signed`, a rewrite is still refused, and a stamp without the status is refused. Regression
  guard: `s164-m9-client-writes.live.ts` **W8a/W8b/W8c**, plus **W7** which signs an actual change
  order end-to-end through the portal.

- **#5-m9 — two live tests pick a fixture with an unordered `limit(1)` and depend on which row they
  get.** Raised S164 (2026-08-19), both repaired in the same session.

  | Test | Picked | Why it mattered |
  | --- | --- | --- |
  | `s143-void-authority` | the first `project_assignments` row in the company, any member's | its own comment says the project must be one **the PM** is assigned to. It landed on an owner-only assignment and took V0/V1/V2/V4 red **on visibility** — the exact confusion the comment exists to prevent. |
  | `s163-m5-m6-fixes` **D3** | the first `time_segments` row | `audit_time_segment_edit()` writes **no log** when the editor is the segment's own member. On a run that picked one of the owner's own segments it failed with *"the audit trigger stopped firing — M6-02 broke the audit trail"* — announcing a broken audit trail while the trigger worked as specified. |

  **D3 destabilises its own fixture**: it rewrites the segment's note, which moves the row, so the
  next run's unordered pick is a different one. Both now filter to a row that satisfies the test's
  own premise and order deterministically.

  ⚠️ **Not necessarily the last two.** `.limit(1)` without `.order()` returns rows in physical order,
  which changes with any UPDATE anywhere in the table. A sweep of the live harnesses for
  `.limit(1)` with no `.order()` is worth doing as its own pass.

### Branch-scoped, awaiting real numbers — `feature/s150-audit-fixes` [S150]

> Provisional ids per the S136 rule: never allocate a bare `#N` on a branch.

- **#1-audit — the "Retainage held" line asserts "% across payments" without reading
  `retainage_shape`, and prints the CURRENT rate against a HISTORICAL accrual.**

  Raised by §2 of `docs/specs/S150-m7-completion-audit.md` (7C). Confirmed still present
  at `54279df`. **7C UI; no ruling covered it, which is why it went unfiled.**

  `apps/web/app/dashboard/projects/[id]/contracts/contracts-panel.tsx:885-886`:

  ```tsx
  {contract.retainage_percent !== null && (
    <span style={{ color: '#6b7280' }}>({Number(contract.retainage_percent)}% across payments)</span>
  )}
  ```

  The sentence is gated on the PERCENT being non-null and **never consults the shape** —
  even though the same component reads `retainage_shape` 130 lines below, at `:1016-1017`,
  to seed the editor. The value is in hand and is not used.

  **Two distinct faults, and they have different reachability. Recorded separately so
  neither is fixed by accident and the other assumed gone.**

  **(a) Shape-blindness — LATENT, not reachable through the shipped UI today.** The audit's
  finding, stated as *"for `final_hold` that sentence is false: nothing is withheld across
  payments"*. That is the right reading of the code, and the reason it does not currently
  fire is worth writing down, because it is an accident:

  - The block only renders when `retainageRow` exists (`:483`, `:881`) — the `is_retainage`
    accrual expense. That row is born **only** when `v_withhold > 0`
    (`20260729010000_7c_accounts_payable.sql:683-696`), which requires
    `retainage_shape = 'percent_across'` **and** `retainage_percent > 0`. So a pure
    `final_hold` contract has no accrual row and never reaches `:885`.
  - Every shipped writer sets shape and percent **together**, and `payables-client.ts`
    (`:203`, `:285`) suppresses the percent for `final_hold` with
    `retainage?.shape === 'percent_across' ? retainage.percent : undefined`, so the column
    lands NULL.

  **What makes it latent rather than dead: that pairing is a client-side ternary, not a
  constraint.** `setup_payment_schedule` (`20260730010000:1242-1249`) and
  `revise_sub_contract_schedule` (`20260731060000:121-127`) both validate
  *`percent_across` ⇒ percent present*. **Neither validates *`final_hold` ⇒ percent absent*,
  and `subcontractor_contracts` carries no CHECK pairing the two columns.** Any caller that
  is not `payables-client.ts` — a direct RPC call, a future service, 7I's contract
  generator reading these columns for Exhibit B — can write `final_hold` with a percent and
  the false sentence prints. The pass-through trigger
  (`20260814000000_sub_retainage_passthrough.sql`) is well-behaved here: it sets both, always
  `percent_across`.

  **(b) Rate-history-blindness — REACHABLE TODAY through the shipped UI, and the sentence is
  false about the money next to it.** Independent of shape. `revise_sub_contract_schedule`
  updates `retainage_percent` (`20260731060000:306-310`) and **never touches the accrual row**
  — stated in that migration's own header, item 5. So:

  1. Sub contract, `percent_across` @ 10%. Pay stage 1 of $10,000 → withhold $1,000; accrual
     row born at $1,000.
  2. Revise the schedule, change retainage to 5% (the panel's percent input at `:1295` is
     editable, and revise submits full state).
  3. Pay stage 2 of $10,000 → withhold $500; accrual row now $1,500.
  4. The panel prints **"Retainage held $1,500 (5% across payments)"**. $1,500 is not 5% of
     $20,000. The accrual is the sum of two rates; the sentence claims one.

  The dollar figure is correct — it is `committedRemaining` over the accrual row, which is the
  bookkeeping mirror of Σ withheld. **Only the explanation beside it is wrong**, which is the
  worse failure of the two: a user reconciling the number against the stated rate finds a
  discrepancy in a figure that is actually right.

  ## ⚖️ RULED [Josh, S150] — RETAINAGE RATE CHANGES ARE PROSPECTIVE ONLY

  **A rate change never reaches back.** Past accruals stand at the rate in force when they
  were taken; the new rate applies from that point forward.

  **What this settles about the defect, and it is not what the audit assumed.** The dollar
  figure **was never wrong** — it correctly sums accruals taken across different rates, which
  under this ruling is exactly right. **The SENTENCE is wrong**, because it names one rate as
  though that rate explains the whole total. The governing rule for the display follows
  directly:

  > **The line may name a rate only when that rate accounts for the entire held total.
  > A multi-rate accrual must not claim a single rate.**

  **⚠️ Do NOT ship the one-line shape fix on its own.** Rendering the parenthetical only for
  `percent_across` closes (a), leaves (b) alive, and makes the item read as closed. Ruled
  explicitly against.

  **The runtime already behaves prospectively — nothing MAKES it.** `record_expense_payment`
  computes the withhold from the contract's rate **at payment time** and freezes it onto the
  payment row (`20260729010000:683-690`), and `revise_sub_contract_schedule` never touches the
  accrual row (its header, item 5). Both are properties of two function bodies, not
  constraints. `convert_estimate_to_project` has been redefined **six** times; a seventh
  redefinition of either of these would change the rule silently.

  **Enforcement is owed and belongs in the database [RULED Josh, S150].** Grounding for the
  proposal, all verified at `54279df`:

  - ✅ **Already enforced:** `expense_payments.retainage_withheld` is **immutable for every
    role, Owner/Admin included** — `enforce_expense_payments_column_scope` (`:270-271`) raises
    *"A recorded payment is immutable — soft-delete and re-enter to correct it."* A past
    withhold cannot be restated. This is the strongest existing leg of the ruling.
  - ❌ **Not enforced — the accrual row's `amount` is freely writable by Owner/Admin.**
    `enforce_expenses_column_scope` **returns `NEW` immediately for owner/admin**
    (`20260729010000:143-145`) and does not guard `amount` for anyone. A direct
    `UPDATE expenses SET amount = …` on the `is_retainage` row restates retainage history with
    no guard at all.
  - ❌ **Not recorded:** nothing stores **which rate** produced each withhold. Only the dollar
    amount is kept, so the rate is inferable but lossily (rounding), and the ruling is true in
    dollars while being unprovable in rate terms.
  - ❌ **Not enforced:** the `retainage_shape` / `retainage_percent` pairing — see (a) above.

  **Proposal owed, not built [S150].** Display wording and the enforcement shape were proposed
  in session and are pending Josh's selection. Nothing was implemented.

  **The pairing CHECK still needs its own decision.** Pairing `final_hold` with
  `retainage_percent IS NULL` is the tidy backstop for (a), but `subcontractor_contracts`
  carries live rows and the pass-through trigger writes both columns on every INSERT — a
  constraint is a migration against shipped money terms, which is #117's and #132's class of
  decision, not a UI patch. **The S150 prospective-only ruling does not cover this**; it
  governs rate *changes over time*, not shape/percent coherence at a point in time.

  Observed S150, from the Module 7 completion audit.

- **#2-audit — 7I acceptance criterion 15's parenthetical is stale, and BOTH halves of it
  are false. PREVIOUSLY FILED AND THEN DELETED, not closed.**

  **⚠️ Read the provenance first, because it is the reason this is being filed twice.** This
  finding was filed at `35c4927` as an unnumbered bullet in the
  `feature/7i-stage1-settings` block, and **`53c7353` deleted it** while replacing `#1-7i`
  and `#2-7i` with their closed forms. It was not closed, not resolved and not superseded —
  it was dropped. Between `53c7353` and this entry it existed **only in git**, and the S150
  Module 7 completion audit (finding #1) reported it as *"already recorded in `TECH_DEBT.md`
  this session"*, which was not true of the file. **Re-filed [Josh, S150] so the loss is
  visible rather than silently repaired.**

  `53c7353` dropped **three** records in one commit. The other two are `#3-7i` (restored
  above as a closure) and `#2-7i`'s original text (correctly superseded by its closed form).
  Only this one was a live finding.

  **The finding.** `docs/specs/7I-spec.md` §12 criterion 15 reads:

  > *"**A PM cannot** generate, send, or void a contract of either kind. **(UI gate; the DB
  > floor is the separate `FINANCIAL-RLS-FLOOR` follow-up — §8.)**"*

  **Half 1 — "UI gate" is false.** It is a database floor. `20260926000000_7i_contracts.sql`
  §6 gives all four 7I tables Owner/Admin RLS **including SELECT**, plus
  `enforce_contract_void_authority` on the three tables carrying contract state. The S150
  audit confirmed all five 7I tables Owner/Admin against `pg_policies` **[LIVE]**.

  **Half 2 — "the separate `FINANCIAL-RLS-FLOOR` follow-up" is false.** That follow-up
  **landed at S97**, in `20260806000000_financial_rls_floor.sql`. There is no outstanding
  work behind this criterion. `GATED.md`'s own "Still owed" entry for that migration was
  struck through and marked done at S150.

  **Why it matters more than a stale parenthetical usually would.** §8's own S145 banner
  already corrected this **in the body of the same spec** — so the document contradicts
  itself, and criterion 15 is the half a builder reads when checking acceptance. A reader
  taking it at face value concludes a DB floor is still owed and may write a second one.

  **Fix is one edit:** correct the parenthetical in place, quoting the superseded text,
  per this repo's convention. Not done at S150 — re-filing was the ruling, not amending.
  Cross-ref: criteria **4** and **16** in the same section were reworded at S150 for
  unrelated reasons, so §12 has recently-touched neighbours.

- **#3-audit — no `viewport` export anywhere in `apps/web/app/`, so nothing controls
  `viewport-fit=cover` and the shell has no TOP safe-area inset.**

  **Carried out of Gate 4 at its close [Josh, S150].** It was the single row of Gate 4's
  nine-row S97 inventory that is still true at `54279df`; the gate was closed and this filed
  rather than holding a gate open for one item. Verified: `grep -rn "export const viewport"
  apps/web/app` returns nothing, and neither the root layout nor `app/m/layout.tsx` sets
  `viewport-fit`.

  **Not currently broken, and Gate 4's own text said so** — *"Next 14's default is injected,
  so nothing is broken, but there is no control over `viewport-fit=cover` (safe area)."* It
  blocks no install, no push and no notification work.

  **What it actually costs, and why it is not merely cosmetic.** `app/layout.tsx` already
  reasons about this in a comment that is worth reading before touching it: `appleWebApp`
  ships `statusBarStyle: 'black'` and **deliberately not** `'black-translucent'`, because
  translucent renders content **under** the iOS status bar and needs a top safe-area inset —
  *"the shell is built now [S105] but pads the safe area at the bottom only (the tab bar) —
  the app bar does not, so translucent would still ship an overlap."* So the missing viewport
  export is what pins the status-bar style to the more conservative of the two options.

  **Fix shape, and it is two things that must move together, not one:**

  1. `export const viewport: Viewport = { viewportFit: 'cover', themeColor: … }` in
     `app/layout.tsx` (Next 14 moved these out of `metadata`).
  2. **Top safe-area padding on the `/m` app bar** — `env(safe-area-inset-top)` — before any
     switch to `'black-translucent'`. Shipping (1) alone changes nothing visible; shipping
     the style change without (2) ships the overlap the comment predicts.

  **Re-check `A-26e` when this moves** — `layout.tsx`'s comment names it as the criterion that
  must still hold, and flags that this pair of metas is the iOS Web Push precondition (D-10):
  *"losing them silently blocks Gate 4."* Gate 4 is closed, but the dependency is real.

  Observed S150, verifying Gate 4's `[UNVERIFIED]` PWA-install half.

### Branch-scoped, awaiting real numbers — `feature/7i-stage1-settings` [S150]

> Provisional ids per the S136 rule: never allocate a bare `#N` on a branch.

- **#2-7i — ✅ FIXED [S150] — 7F's box editor never loaded the existing map, so
  saving replaced a placed map with nothing.**

  `BoxMapEditor` initialised `useState<BoxInput[]>([])` and never read the boxes
  back. `getTemplateBoxes()` (`lien-releases.ts:53`) had exactly ONE caller in the
  repo — `api/lien-releases/generate/route.ts:171`. No settings surface called it.

  So: place boxes → save → re-open to adjust one → the table is **empty** → save →
  `saveBoxMap` replaced the map with nothing. No error, no warning, and the
  editor's own footnote ("Saving replaces the whole map for this form") read as a
  correct description of intended behaviour, which is what made it hard to see.
  The replace-not-merge semantics were right and were never the bug.

  Fixed by the #1-7i extraction rather than separately: the shared editor takes
  `initialBoxes` as a REQUIRED prop, read server-side in
  `app/dashboard/settings/page.tsx`, so an editor that opens on an empty map is
  no longer expressible. Same class as `#129` — silent divergence found by
  reading the save path, not by anything failing.

  ⚠️ **NOT CLICK-TESTED at S150.** Josh accepted the risk that 7F inherits the
  shared editor before either surface has been exercised by hand.

- **#1-7i — ✅ CLOSED [S150] — one box editor, mounted by both modules.**

  `components/box-map/box-map-editor.tsx` replaces 7F's private `BoxMapEditor`
  and 7I's `ContractBoxEditor`. **It is deliberately NOT under
  `components/contracts/`**: CLAUDE.md's PARITY ruling makes a helper's directory
  a claim of ownership, and two modules mount this one.

  Everything module-specific is a prop — catalog, which kinds exist, whether
  boxes carry a party, the size floor, the save function. 7I passes four kinds
  and a party (R4/R5); 7F passes three and none. The sizing tables stay separate
  (`minWidthForContractKey` / `minWidthForReleaseKey`) because the KEYS differ —
  a release has a claimant and a waiver date, a contract has neither — but both
  multiply the same shared `FRACTION_PER_CHAR`, so the two floors cannot drift
  into disagreeing about how wide a character is.

  7F inherited visual placement (R6) as a side effect, and its §3.1 overflow
  question — which `7f2-spec` left open and 7I §2.2 says "propagates to 7F" — is
  answered on the authoring side by the shared placement warning.

  ⚠️ **7F STILL SHRINKS AT RENDER.** `fitTextToBox()` reduces the font to
  `MIN_FONT_SIZE` before declaring overflow, and that is unchanged — this closed
  an editor duplication, not a renderer difference. So the placement warning is
  advisory on 7F in a way it will not be on 7I once R10 blocks the send.
  Reconciling the two render paths belongs to 7I stage 2.

- **#3-7i — ✅ CLOSED [S150] — superseded. Box placement is no longer typed-only.**

  **Read this before trusting a search of this file: `#3-7i` was DELETED from
  `TECH_DEBT.md` by `53c7353`, not closed.** Between `35c4927` (which filed it) and
  HEAD it is recoverable only from git. It is restored here as a closure so the
  decision has a record where a reader will look for it. Two sibling records went
  the same way in that commit — see the note at the end of this entry.

  _Original entry, quoted rather than paraphrased (`35c4927`):_

  > **#3-7i — Box placement is TYPED COORDINATES, not visual. Decided by default at
  > S150, not by ruling.**
  >
  > `ContractBoxEditor` is a numeric table: the user types X/Y/W/H as percentages and
  > reads off where the blanks fall by opening the form in another tab. It matches 7F's
  > shipped interaction exactly, which is the argument for it — but nobody chose it on
  > the merits.
  >
  > A visual overlay (drag a box onto the rendered page) needs the PDF rasterised in the
  > browser, and **the repo has no library that can do it**: `pdf-lib` manipulates PDFs
  > without rendering them and `@react-pdf/renderer` generates them. It would mean adding
  > `pdfjs-dist` — a real dependency decision on a legal-document surface, out of scope
  > for a slice scoped to "UI work, no migration", so it was not taken unilaterally.
  >
  > Worth a ruling before a company maps a 12-page agreement by typing 4 numbers per
  > blank. Closing this alongside #1-7i would upgrade both documents at once.

  **Why it is closed.** Its own closing sentence named the condition — *"closing this
  alongside #1-7i would upgrade both documents at once"* — and that is what happened.
  The `#1-7i` extraction shipped `components/box-map/box-map-editor.tsx`, which **7F
  inherited visual placement (R6) from as a side effect**. Box placement is no longer
  typed-only on either surface, so the question this item held open — whether to accept
  a numeric table by default — no longer has a subject. **Superseded, not deferred and
  not decided against.**

  **The dependency decision it was protecting was never taken, and did not need to be.**
  No `pdfjs-dist` was added. Whatever the shared editor does for placement, it does
  without rasterising a PDF in the browser — which is the reason the original item
  existed. Anyone reopening the visual-placement question starts from the shared editor,
  not from `ContractBoxEditor`, which no longer exists.

  ⚠️ **Closed on the extraction, NOT on a click-test.** `#1-7i` and `#2-7i` both carry
  the same caveat: neither surface has been exercised by hand since the swap, and Josh
  accepted that risk explicitly at S150. This closure inherits it.

  **⚠️ `53c7353` dropped three records, not one.** It replaced `#2-7i` and `#1-7i` with
  their closed forms — correct — but also deleted `#3-7i` (restored above) **and the
  unnumbered "7I acceptance criterion 15's parenthetical is stale" bullet, which is
  recorded nowhere at HEAD.** **✅ RE-FILED [Josh, S150] as `#2-audit`** — see this branch's
  block above, which carries the finding and its provenance in full. The S150 completion
  audit (finding #1) recorded it as "already recorded in `TECH_DEBT.md` this session";
  that was not true of the file at the time, and the audit's claim should not be relied
  on for it. What remains owed is the one-line correction to §12 criterion 15 itself.

- **§13's prerequisite list is stale on this point, recorded so it is not re-followed.**
  7I §13 names "the box-placement component" among the hard prerequisites 7F supplies.
  7F supplies a box-placement *component*, but not a *reusable* one — see #1-7i. A
  builder reading §13 will look for something to import and find nothing importable.

- **`contract_document_attachments` (§7.4) — the TABLE shipped; the UI is stage 2's.**

  > **⚠️ CORRECTED [S150, later the same session].** _Superseded text, quoted rather than
  > rewritten:_ _"The table was never created — absent from `20260926000000_7i_contracts.sql`
  > and from `packages/shared/types/database.ts`. … Not created at S150."_
  >
  > **It was created at S150**, in `20261001000000_7i_party_defaults_attachments.sql:179`,
  > and it IS in `packages/shared/types/database.ts`. The S150 completion audit read it live
  > with select/insert/update policies. The bullet was written before that migration landed
  > and was never revisited.

  The mis-sequencing half stands and is unchanged: §13 listed attachments under stage 1,
  but every column hangs off `contract_documents(id)` and no contract document exists until
  stage 2 generates one. **Deferred to stage 2** [RULED Josh, S150]. What remains owed is the
  **UI**, not the migration. §13 is corrected in place as of this session.

### Branch-scoped, awaiting real numbers — `feature/s143-void-guard-qb-reconcile` [S143]

> Provisional ids per the S136 rule: never allocate a bare `#N` on a branch.

- **#1-s143 — ✅ FIXED [S148] — `enforce_time_clock_sessions_column_scope` was the
  only column-scope trigger in the repo with no service-role escape.**

  Every sibling — `enforce_expenses_column_scope`, `enforce_invoices_column_scope`,
  and both 7E QB guards — opens with `IF auth.uid() IS NULL THEN RETURN NEW; END IF;`.
  6A's does not. It goes straight to `get_my_role()`, so a service-role or system
  write to a time session is refused outright with *"Session system columns are not
  editable for your role."*

  **Found the hard way at S143:** it blocked `20260924000000`'s own backfill, twice —
  first by referencing a renamed column, then by refusing the corrected write. The
  migration works around it by suspending the trigger for its own two statements,
  inside the transaction.

  **Not fixed there, deliberately.** Adding the escape changes a shipped Module 6A
  guard nobody asked to change, inside a migration about QuickBooks columns. It also
  has a second-order effect worth a ruling: any future maintenance script touching
  `time_clock_sessions` hits the same wall, and the workaround (suspend the trigger)
  is more dangerous than the escape would be.

  **RULED [Josh, S148]: option (a) — add the escape.** It is the anomaly, not the
  rule. The two rejected alternatives are recorded in `20260927000000`'s header:
  dropping TimeActivity from 7G's scope would drop scope to accommodate a defect,
  and having the worker suspend the trigger is more dangerous than the escape it
  works around.

  **What forced the ruling:** 7G's sync worker is ruled SERVICE ROLE (7g1-spec §S),
  and this trigger made the two columns `20260924000000` added to that table
  (`qb_push_status`, `qb_time_activity_id`) **unreachable by their only intended
  writer**. Proved at S148 with a paired probe, both writes carrying no JWT:
  `invoices.qb_push_status` SUCCEEDED (escape present) while
  `time_clock_sessions.qb_push_status` was REFUSED — then SUCCEEDED after the fix.

  **Fixed** in `20260927000000_time_clock_service_escape.sql`, recreated from the
  live body via `pg_get_functiondef()` rather than retyped — S143 paid for that
  lesson on this same function. Every pre-existing branch is byte-identical; the
  new lines are reachable only when `auth.uid()` is NULL, which no browser session
  ever is. `s148-qb-connection.live.ts` S148-Q5 pairs the service-role success with
  a real PM session still being refused on the same row, and that PM still clocking
  out on it — so the guard was widened, not opened.

  **Consequence for the S143 probe, which was correct to pin it:** S143-Q2 encoded
  the asymmetry as expected behaviour and named this item as the reason. With the
  escape in place `time_clock_sessions` now refuses an out-of-vocabulary status via
  its CHECK, exactly like the other four, so the special case was removed and the
  superseded comment quoted in place. **The test was the side that was wrong** —
  it pinned a defect that has since been fixed.

### Branch-scoped, awaiting real numbers — `feature/s147-trial-screens-teardown` [S147]

> Provisional ids per the S136 rule: never allocate a bare `#N` on a branch.

- **#1-s147 — ✅ FIXED [S147] — `desktop-trial-screens.spec.ts` leaked two companies
  per run and CI #210 failed on it.** Third harness in two sessions with the
  identical mechanism.

  `desktop-trial-screens.spec.ts:74` — *"an S139% company survived teardown"* —
  **2, then 4, then 6** across the attempt and its two retries. **The climbing
  count is the diagnosis**: a fixture creating rows it cannot delete, with the
  retry mechanism making it visibly worse.

  **Cause, MEASURED not assumed.** 87 tables reference `companies` with
  `NO ACTION`; a query across all of them showed exactly one holding rows for the
  orphans: **`lien_release_templates`, 96 rows = 12 companies × 8.** 7F's seed
  trigger (`20260922000000`) creates 8 per company insert and the FK does not
  cascade. `destroyThrowawayCompany()`'s inline child list never knew about them,
  **and the parent delete discarded its error entirely** — `await admin.from(
  'companies').delete()` with no `.error` read. The company survived, the auth
  user was deleted, and the orphan became **unreachable by email forever**, which
  is why `createThrowawayCompany()`'s own by-email self-heal could not recover it.

  **The fixture's own header asserted the property it lacked**: *"deletes children
  in FK order and **verifies** the parent is gone, rather than assuming."* It did
  neither. Quoted in place rather than deleted — a comment claiming a property the
  code does not have is what stops the next reader checking.

  **Fixed** with one `purgeMarkerCompanies()` called from both ends — self-healing
  in `beforeAll`, complete in `afterAll` — keyed on the **name** (`S139%`) rather
  than ids captured this run, deleting in FK order through a shared
  `deleteCompanies()` that `destroyThrowawayCompany()` now also uses, with the
  parent delete's error checked and thrown. A unique-per-run slug was rejected
  again for the same reason as `#4-s146`: it stops the collision and keeps leaking.

  **Evidence.** From a clean database: run 1 `Received: 2`, run 2 `Received: 4`,
  both `EXIT=1` — CI reproduced exactly. After: **three consecutive runs 16/16,
  `EXIT=0`**, the first starting with 4 orphans present and self-healing them.
  Mutation-proved by dropping `lien_release_templates` from the child list, which
  turns the run red **naming the cause** — *"purge companies: update or delete on
  table "companies" violates foreign key constraint
  "lien_release_templates_company_id_fkey""* — the exact condition that was
  silent before.

  **⚠️ A LOCAL RUN WITHOUT `--workers=1` MISREPRESENTS THIS.** `playwright.config.ts`
  sets `workers: process.env.CI ? 1 : undefined`, so locally the file forks and
  `beforeAll` runs **per worker**: one run leaked **12**, not 2, and two extra
  tests failed as parallel-fixture artifacts that CI would never show. Reproduce
  and verify with `--workers=1`.

- **#2-s147 — ✅ FIXED [S147b] — the same leak in six more harnesses. Zero new
  companies after a full live-suite run.**

  **THE ATTRIBUTION IN THE ORIGINAL FILING WAS BY NAMING CONVENTION AND WAS WRONG
  IN ONE PLACE.** Re-done by instrumentation — purge to zero, run each harness
  alone, measure the delta:

  | harness | measured leak/run | filed guess |
  | --- | --- | --- |
  | `s136-company-slug` | 3 | ✓ |
  | `s137-trial-lifecycle` | 2 | ✓ |
  | `s138-trial-unlock` | 2 | (grouped as 4 across three files) |
  | `s138-trial-export` | 1 | ✓ |
  | `s138-trial-deletion-run` | 1 | ✓ |
  | **`s97ct-7e-clicktest`** | **2** | **filed as "live-session `adoptSignupProfile`"** |
  | `s135-invite-fallthrough` | 1 | ✓ |
  | `s133-subcontractor-read-floor` | **0** | — not a leaker |
  | `s97ct-reply-to` | **0** | control; `#4-s146` holds |

  `adoptSignupProfile()` is the **mechanism**; `s97ct-7e-clicktest` is its only
  caller. `"My Company"` is `handle_new_user()`'s DEFAULT name for any
  `createUser` without `company_name` metadata, which is exactly why marker names
  cannot attribute reliably. **`s133` creates users and leaks nothing** because it
  passes `invitation_token` — the invited path joins an existing tenant instead of
  building one.

  **So the shared helper covered ONE of the six**, not several. Establishing that
  before touching the rest was the point of measuring.

  **Fixed** with one shared module, `apps/web/test-support/company-purge.ts`,
  imported by both trees — `COMPANY_CHILDREN`, `deleteCompanies()` (error-checked)
  and `purgeCompaniesNamed()` (case-insensitive, name-keyed). `#1-s146` and
  `#1-s147` had each grown their own copy; the child list is the thing that goes
  stale and it now goes stale in one place. Every harness calls the purge from
  **both ends** and asserts it worked.

  **Acceptance test met: full live suite, companies BEFORE `2 / 0 orphans`,
  AFTER `2 / 0 orphans`.** Previously one run re-created 12.

  **`COMPANY_CHILDREN` fails loudly rather than leaking — confirmed empirically.**
  `contacts` is deliberately NOT in the list and `s138-trial-export` populates it.
  Removing that harness's own `contacts` delete produces
  *"purge companies: … violates foreign key constraint "contacts_company_id_fkey"
  on table "contacts""* and fails the run — naming the table to add. The
  subsequent run then refuses to start rather than proceeding over the residue,
  which is the same property one layer earlier.

  _Superseded filing text, quoted rather than deleted:_

- **~~#2-s147 — THE SAME LEAK IS LIVE IN FIVE MORE HARNESSES, and `#1-s147` fixes
  only the one CI named.~~**

  Measured on rebuild-test at S147: **111 companies, 109 with no profile** — i.e.
  109 orphans and only the two real QA tenants. Every orphan carried exactly 8
  blocking templates (872 in total). Purged to **0** at S147; **one full live-suite
  run then re-created 12**, none of them `S139%`:

  | leaker | orphans before purge | re-created by ONE live-suite run |
  | --- | --- | --- |
  | `s138-trial-*` (unlock / export / deletion) | 30 | 4 |
  | `live-session.ts` `adoptSignupProfile()` — "My Company" | 21 | 2 |
  | `s136-company-slug` | 21 | 3 |
  | `s137-trial-lifecycle` | 15 | 2 |
  | `s135-invite-fallthrough` | 10 | 1 |
  | `desktop-trial-screens` (**fixed, `#1-s147`**) | 12 | **0** |

  **`live-session.ts:107-111` is the one to fix first** — it is the SHARED helper
  (`adoptSignupProfile()`), it deletes `tag_options`, `subscriptions`, `companies`
  and nothing else, and it checks no error. Every harness that adopts a signup
  profile inherits it.

  **Nine harnesses create a company** — three by direct insert
  (`s136-company-slug`, `s137-trial-lifecycle`, `s97ct-reply-to` — the last already
  fixed as `#4-s146`) and six via `auth.admin.createUser()` → `handle_new_user()`.
  **Any harness that creates a company inherits this**, so the answer to "will it
  surface a fourth time" is that it already has, five times over — silently,
  because only `desktop-trial-screens` asserts a company count. The others leak
  without going red.

  **Not fixed here**: outside S147's stated scope (one task, the CI failure).
  Filed so the next session can take it in one pass; the fix is the same shape
  each time.

### Branch-scoped, awaiting real numbers — `feature/s145-7i-audit-subinbound` [S146]

> Provisional ids per the S136 rule: never allocate a bare `#N` on a branch.

- **#1-s146 — ✅ FIXED [S146] — role was a caller-supplied parameter, and an
  UPDATE-shaped write reported SUCCESS when RLS filtered the row away.**

  `voidContractDocument()` takes the caller's `role` as a PARAMETER, so
  `canVoidContract()` believes whatever it is told. A project_manager passing
  `role: 'owner'` walks straight past it. What stops the write is
  `contract_documents_update_owner_admin`, whose USING clause is
  `get_my_role() = ANY('owner','admin')` — so the UPDATE **matches zero rows**.

  **The document is safe. The caller is told a lie.** A zero-row UPDATE is not an
  error, `error` is null, and the function returns `{ success: true }`. The 7I UI
  lands next session and will report "contract voided" over a contract that is
  still live — on a legal document.

  **General to the pattern, not special to void.** `updateContractTemplate()` has
  the same shape and the same false success. INSERT-shaped writes
  (`createContractTemplate`, the box insert) are unaffected: RLS surfaces a real
  error on those, which is why S146-C1 and C2 pass.

  **Found by executing the service layer for the first time** (S146 Part 4) — the
  RLS probes in `s145-contracts.live.ts` write to the tables directly and cannot
  see this. Pinned by `s146-contract-services.live.ts` S146-C4, whose two
  assertions say *"if this is now false, #1-s146 has been fixed — invert it"*.

  **FIXED [Josh ruled both halves, S146], applied across the pattern.**

  **Half 1 — role resolved server-side.** `role` is gone as a parameter;
  `voidContractDocument(id, status, reason)` resolves it through
  `get_my_role()` — **the same SECURITY DEFINER function every RLS policy
  calls**, chosen over a `profiles` read so the service check and the database
  gate cannot disagree about who the caller is. Precedent:
  `time-tracking-client.ts:107`. `status` stays a parameter deliberately: it
  selects the message, not the authority, and both the void-shape CHECK and the
  void-authority trigger hold regardless of what is passed.

  **Half 2 — zero affected rows is a failure.** Every UPDATE-shaped write in the
  file now `.select('id')`s and returns `DISCARDED` when nothing was touched:
  `updateClientContract`, `updateSubcontractorContract`, `updateContractTemplate`,
  `softDeleteContractTemplate`, `voidContractDocument`, `setEstimateContractToggle`.
  The message names no cause it has not verified — an empty result cannot tell
  "policy refused you" from "the row is gone", so it says both.

  **Two write sites are deliberately NOT row-counted, and the reasons differ:**
  the four INSERTs already surface a real error, and `saveContractBoxMap`'s
  `.delete()` clear **legitimately affects zero rows on the first save of every
  template** — `applied()` there would refuse the commonest case. That left a
  hole the row count could not reach: a PM passing `[]` cleared nothing and was
  told the map was emptied. Closed with the ROLE half instead —
  `saveContractBoxMap` now gates on `canManageContracts(await myRole(...))`
  before the write.

  **Probed and mutation-proved**, `s146-contract-services.live.ts` S146-C4, 22/22:

  - *Half 1* — a PM is refused **by the function** with the Owner/Admin message,
    which can only come from a role they did not supply. Mutating `myRole()` to
    return `'owner'` (i.e. trusting the caller, as the old parameter did) turns
    both half-1 tests red — the PM falls through to the database and gets
    `DISCARDED` instead of the service refusal, which is exactly the old shape.
  - *Half 2* — **company B's OWNER** voiding company A's document. Role gate
    passes (they really are an owner), the row EXISTS and is merely invisible, so
    RLS matches nothing and Postgres reports no error. Returns failure. A
    cross-tenant owner rather than a bogus id on purpose: it isolates "the policy
    matched nothing" from "no such row", and doubles as a tenant-isolation
    assertion. Mutating `applied()` to `return true` turns all three half-2 tests
    red.

  All three shipped call sites in `contracts-panel.tsx` already branch on
  `result.success` and surface `result.error`, so a discarded void now shows the
  user a message instead of a silent success over unchanged data.

  **Related, and worth deciding together:** `contract_documents_void_authority` is
  currently **unreachable in practice**. RLS on that table is strictly narrower
  than the trigger — only owner/admin can UPDATE at all, and the trigger only
  refuses non-owner/admin — so it can never fire. It is genuinely load-bearing on
  `client_contracts` and `subcontractor_contracts`, where an assigned PM DOES hold
  an UPDATE policy (proved by `s145-contracts.live.ts` S145-C4). Harmless as
  defence in depth; noted so nobody reads the trigger's existence as evidence that
  the `contract_documents` path is guarded by it.

- **#2-s146 — the sub-inbound trigger→type mapping has no database backstop, and
  RULED [Josh, S146] that it should not get one.**

  `lien_releases_subject_check` enforces the SUBJECT split (completion →
  `sub_contract_id`, payment → `expense_id`). That completion yields *conditional*
  and payment yields *unconditional* lives only in the generate route and
  `resolveSubReleaseValues()`.

  Proposed as a CHECK and **rejected on the merits.** #117, the compliance floor,
  the invoice-void hole and the contract-void hole are all about **authority** —
  who may do a thing — which belongs in the database. Trigger→type is **which of
  two legal instruments the workflow offers by default**, and the ruling makes that
  layer optional: the system prompts, it never blocks.

  Both arms would block real instruments. `expense_id` + CONDITIONAL is the
  conditional waiver on progress payment — what a GC collects before releasing a
  stage payment, the sub-side analogue of the client-outbound flow 7F ships.
  `sub_contract_id` + UNCONDITIONAL is the final waiver over a fully paid contract.
  Both partial unique indexes are keyed `(subject, TYPE)` precisely to allow both,
  and `s145-sub-inbound.live.ts` S145-S4 asserts it.

  **Filed rather than closed** because the mapping is still only as good as its one
  writer. The route is now EXECUTED and proved to refuse a caller-supplied `type`
  (`s146-generate-route.live.ts` S146-G3). Revisit only if a second writer appears.
  Full reasoning is in the harness, above S145-S4, so it is not re-derived.

- **#3-s146 — nothing ties a lien-release template's `direction` to the release's.**

  `lien_releases_template_id_fkey` is a plain single-column FK, so a `sub_inbound`
  template bound to a `client_outbound` release is accepted silently. This is what
  made `s140-lien-releases.live.ts`'s unfiltered `.limit(1)` template pick able to
  test the wrong pairing without failing — fixed at S146 with a direction filter
  plus an assertion that the fixture's template and release agree.

  **Expressible and cheap** (PostgreSQL 17.6, so the column-list `ON DELETE SET
  NULL` is available):

  ```sql
  ALTER TABLE lien_release_templates ADD CONSTRAINT lien_release_templates_id_direction_key UNIQUE (id, direction);
  ALTER TABLE lien_releases DROP CONSTRAINT lien_releases_template_id_fkey;
  ALTER TABLE lien_releases ADD CONSTRAINT lien_releases_template_direction_fkey
    FOREIGN KEY (template_id, direction) REFERENCES lien_release_templates (id, direction)
    ON DELETE SET NULL (template_id);
  ```

  **NOT BUILT [Josh, S146]:** it forecloses a template ever serving both
  directions, which is a real option to give up for an invariant nothing has
  violated. The S146 direction filters close the actual leak. **Revisitable if a
  bug appears.**

- **#5-s146 — ✅ FIXED [S146] — `s97ct-isolation.live.ts` could report a
  cross-company ISOLATION FAILURE over a row nobody had breached.** Fourth
  instance of the fixture-drift class.

  `firstIdFor()` picked its fixture row with `.limit(1)` and **neither an
  `is_deleted` filter nor an ORDER BY**. Company A currently has **four of its ten
  invoices soft-deleted**, so the pick could hand test 11 — *"B's owner cannot
  soft-delete company A's invoice"* — a row whose `is_deleted` was **already
  true**. B's owner was refused correctly and the assertion failed anyway.

  **The absence of an ORDER BY is why it looked like a regression.** Postgres
  returns heap order and an UPDATE moves a row, so the pick is not stable between
  runs: the file passed four consecutive full-suite runs and then failed, with
  nothing relevant having changed. It failed STANDALONE too, which is what ruled
  out a cross-harness race.

  **Not caused by the `#1-s146` service change**, checked rather than assumed:
  that diff touches `contracts-client.ts` only, and its single occurrence of the
  word "invoice" is inside a comment.

  **Fixed** by filtering to live rows — `NO_SOFT_DELETE` names the two tables in
  the list that genuinely lack the column, read from `information_schema` rather
  than guessed — and ordering by `created_at`. **A fixture that can select a
  deleted row cannot test soft-delete refusal.** Red standalone before, 14/14
  after, which is also the proof the isolation itself was never broken: given a
  LIVE invoice, B's owner cannot touch it.

- **#4-s146 — ✅ FIXED [S146] — `s97ct-reply-to.live.ts` leaked a fixed-slug company
  and blocked every later full-suite run. Same root cause as Part 1, third instance.**

  Its `beforeAll` inserts an orphan company with the CONSTANT slug
  `s97replyto-orphan`; its teardown deletes it by id. **The delete cannot
  succeed:** 7F's seed trigger (`20260922000000`) now creates 8
  `lien_release_templates` on every new company, and
  `lien_release_templates_company_id_fkey` is `NO ACTION`, so `companies` is
  pinned. The orphan survives, and the NEXT run dies in `beforeAll` on
  `companies_slug_key`. Once leaked, the file fails forever.

  **Observed three times at S146, and it recurs every run.** Suite run 1 leaked
  the row; run 2 died in `beforeAll` on it (`Error: orphan company: duplicate key
  value violates unique constraint "companies_slug_key"`, 5 tests skipped); it was
  cleared by hand, run 2 then leaked a fresh one and run 3 died on that. **Every
  full-suite run is therefore red until this is fixed** — the file passes once
  after a manual clear and never twice in a row. Cleared by hand again after run 3
  (boxes, templates, then the company) so the database is not left blocked.

  **This is the same lesson as Part 1 in a second instance:** 7F changed seed
  behaviour and a harness written before it began failing silently — here not by
  going red on an assertion, but by breaking its own cleanup. A build that
  changes what gets seeded owes a run of every harness that creates a company.

  **FIXED [Josh ruled option (a), S146].** One `purgeMarkerCompanies()` helper
  called from BOTH ends: self-healing in `beforeAll` so a crashed run cannot
  poison the next one, and complete in `afterAll` — boxes, then templates, then
  the company. Keyed on the NAME, not on `orphanCompanyId`, so a run that died
  before the insert still clears what a previous one left. A unique-per-run slug
  was rejected: it stops the collision and keeps leaking companies.

  **And the teardown now ASSERTS that it worked** rather than logging. That is
  the part that let this hide: the failed delete WAS recorded, into a list that
  was `console.log`-ged, which vitest suppresses for a passing file. **A cleanup
  that cannot fail its own run is not a cleanup.**

  **Evidence.** Before: run 1 `EXIT=0` / 5 passed then leaks, run 2 `EXIT=1` /
  5 skipped — reproduced from a clean database. After: three consecutive runs
  `EXIT=0`, 5/5 each, the first of them starting with a leaked orphan present and
  self-healing. Mutation-proved by skipping the templates purge, which reproduces
  the original FK error exactly and now **fails the run** —
  `S97REPLYTO companies left behind — cleanup did not work: expected 1 to be +0`.

### Branch-scoped, awaiting real numbers — `feature/m7-compliance-profit-liens` [S140]

> Provisional ids per the S136 rule: **never allocate a bare `#N` on a branch.** These
> convert to the next free numbers from main's file when this branch lands, and any
> cross-reference updates in the same commit.

- **#1-m7cpl — ✅ CLOSED [Josh, S150]. RULED IN FAVOUR OF THE SHIPPED CODE: foreman stays
  `actual_only`, and every document now says so.**

  **The ruling.** A foreman does **not** see committed cost. `budgetColumnsFor()` keeps
  `actual_only`, 3 columns, `seesCommitted: false`. No code changes; `ui-05` §7.1's column
  counts and `s97ct-budget-floor.live.ts` already assert this and are untouched.

  **⚠️ This is a DELIBERATE RULING CHANGE, not a discovered drift.** It **narrows** what
  `7h1-spec.md` §7H.2 #10 granted at S97. The code already matching is the outcome, not
  the argument — most of S150's other corrections went the other way (document stale, code
  right) and this one must not be read as one of those.

  **`CLAUDE.md` → Financial Visibility Floor is amended [S150]** and is the authority. It
  carries the ruling, all three superseded generations of the sentence, and the role table.

  **⚠️ THIS ITEM'S OWN FRAMING WAS WRONG, and the correction changes what the ruling
  means.** _Superseded text, quoted rather than rewritten:_ the table below heads its
  authority column **"Ruling (money-rep P9, 7h1 #10)"** and the entry says narrowing it
  *"would discard a decision P9 made on purpose."* **money-rep P9 says nothing about
  foreman.** It widens the **PM** only (`money-representation.md:113`), and the same
  document puts foreman at actual-only twice more — `:863` (*"Foreman — actual only"*) and
  `:1046` (§7.3's matrix: foreman is **—** for committed, **✓** for actual). The extension
  to foreman is `7h1-spec.md`'s own, in its own words: _"Ruled [S97]: P9's widening stands,
  and **extends to foreman**."_

  **So the S150 ruling does not overturn the money model of record — it restores agreement
  with it.** `money-representation.md` and the shipped code never disagreed about foreman.
  Only `7h1` and (following it) `CLAUDE.md` did.

  **Why it is closed.** Its filed closing condition was that the ruling and every document
  stating it move together — *"doing one without the others is how this drifted in the first
  place"*. **`7h1-spec.md` §7H.2 #10 was amended at S150 at all nine sites** that stated or
  relied on the foreman grant: the floor banner, the role table, the S140 correction note,
  the two-gates note, the provenance list, §7H.12 A.1 and its argument, and the
  build-artifact role scope. Superseded text quoted at every one.

  **The argument was withdrawn, not just the conclusion** — as ruled. §7H.12 A.1 warned that
  an un-corrected `CLAUDE.md` *"would gate committed cost from the two roles that are
  supposed to see it"*. **Right for the PM, inverted for the foreman:** there, the
  un-corrected `CLAUDE.md` agreed with P9, with `money-representation.md` §7.3, and with the
  shipped code. That paragraph is what changed `CLAUDE.md` at S140 and created this item.

  **Full agreement as of S150:** `CLAUDE.md`, `money-representation.md`, `7h1-spec.md`,
  `ui-05` §7.1, `s97ct-budget-floor.live.ts`, `budgetColumnsFor()`.

  **No code, test or migration changed at any point in this item's life** — it was a
  documentation divergence from first filing to close, which is exactly why it survived
  three sessions without anything failing.

  _Original entry retained below. Note its authority column is the mis-attribution corrected
  above._

- **#1-m7cpl (original entry) — the Financial Visibility Floor and `budgetColumnsFor()`
  disagree about FOREMAN, and it is not obvious which is right.**

  Surfaced at S140 while applying the `CLAUDE.md` correction that `7h1-spec.md` §7H.2
  #10 has owed since S97.

  | Role | Ruling (money-rep P9, 7h1 #10) | Shipped `budgetColumnsFor()` |
  | --- | --- | --- |
  | Project Manager | actual + committed | `committed`, 5 cols — agrees |
  | **Foreman** | **actual + committed** | **`actual_only`, 3 cols, `seesCommitted: false`** |
  | Crew | actual only | `none` — redirected off the screen, stricter than the ruling |

  **Neither side was changed**, deliberately: widening foreman is a behaviour change to
  a shipped screen that **ui-05 §7.1's column counts (Owner/Admin 7, PM 5, Foreman 3)**
  and `s97ct-budget-floor.live.ts` both assert, and nobody asked for it; narrowing the
  ruling would discard a decision P9 made on purpose.

  **What a ruling has to decide:** does a foreman see committed cost? If yes, three
  things move together — `budgetColumnsFor()`, ui-05 §7.1's counts, and the live
  harness. If no, money-rep P9 and `7h1-spec.md` #10 are amended instead. Doing one
  without the others is how this drifted in the first place.

  Cross-refs: `CLAUDE.md` → Financial Visibility Floor (carries the same table);
  `apps/web/lib/services/invoices-shared.ts` `budgetColumnsFor()`.

### Pre-Beta

- **#1** No tags UI on contacts/subs forms (columns exist as TEXT[], no input component yet)
- **#2** No loading.tsx or error.tsx boundary files for any routes
- **#3** No CSV import for contacts or subcontractors
- **#4** No active page highlighting in sidebar nav
- **#5** No phone format enforcement in any forms
- **#6** Source CHECK constraint may be too restrictive (real contractors may want yard sign, trade show, Angi, HomeAdvisor, etc.)
- **#7** Optional cleanup of Session 7 debugging artifacts — orphaned test users

- **#83** Typed contractor signature stored as rendered PNG only — consider also persisting the typed text string (new column) to allow clean re-rendering later. Currently image-only to match uploaded-signature shape.
- **#84** Sent change orders cannot be edited. Correct flow is void → edit → resend, not direct edit of a sent CO — a sent CO is a record the client has seen, so mutating it in place is wrong. Needs a void action that supersedes the sent CO and unlocks a new editable revision. Identified Session 76.
- **#86** Client typed signatures have no typed-name mode — co-data.ts always rasterizes the client's mark to a PNG data-URI whether drawn or typed. The contractor's typed mark renders as native <Text> in Dancing Script (18pt), so the two marks cannot be size-matched: one is point-sized vector text, the other an aspect-fit bitmap. Fix: pass the client's typed text + mode through the signing payload and render as <Text>, mirroring the contractor path. Cross-ref #83. Batch with the typed-name signature UI work. Discovered Session 76.
- **#102** purchase_orders.total_amount can be written directly, bypassing the set_po_total_amount RPC, desyncing the PO's committed expense row. The live PO UPDATE policy lets PM edit open POs. Accepted in 7C v1: the RPC is the only UI path, so drift requires a hand-rolled API call. No column-scope trigger shipped. Fix shape: PO column-scope trigger pinning total_amount to the RPC. Cross-ref #93 (same tighten-if-observed posture). Observed Session 91.
- **#105** No identity join between company_members and subcontractors, and no uniqueness guard on names anywhere on the platform. The subcontractors_create_member trigger copies company_name → display_name only; no FK exists. S91's 7C closeout therefore resolves member → subcontractor by NAME MATCH requiring exactly one hit (payables-client.ts) — two subs with the same name and the did-not-finish flag silently goes nowhere (fails safe: closeout still succeeds with a "flag by hand" warning). Josh's intent (S91): prohibit exact duplicate names platform-wide — clients, subcontractors, vendors, staff. Two fix shapes to decide between at build: (a) add a real FK subcontractors.member_id and drop name matching entirely — fixes the resolution defect at its root; (b) enforce per-company unique names across contacts/subcontractors/company_members — data hygiene, but collides with legitimate duplicates (two crew named John Smith, same-name vendors in different regions), so it needs a same-name override path. Recommend (a) as the fix and (b) as a separate soft warning at entry, not a hard constraint. Cross-ref #13. Observed Session 91.
- **#106** No bill-document attachment path on 7C bills. Three parts. (a) Defect: the "Attach bill" action is gated on awaiting_paper, so a bill created without that flag has no in-UI path to ever attach its invoice PDF — ungate it so any bill can carry its document. (b) Gap: bill-form.tsx has no file input at all; 7C-spec §2.1/§3.2 treat the PDF as post-hoc only (attachBillDoc exists solely to clear the flag), so attaching at creation time requires a spec amendment, not just UI. Deliberately looser than 7A receipts, where S90 added a receipt-photo-required rule at capture (Owner/Admin exempt) — that rule was never extended to 7C bills; decide at build whether to extend it. (c) Enhancement: support clipboard paste (Ctrl+V) of an image directly into the attachment control, in addition to the standard file picker. Josh's intent (S92): every bill can carry its invoice, attachable at creation or later, by picker or paste. Observed Session 92.
- **#107** No link between expenses and budget lines; Budget's Committed column is dead. Three parts. (a) Defect: project_budget_items.committed_amount has no writer anywhere in the repo — only the 5E CREATE TABLE (20260704212000, DEFAULT 0) and two reads (budget.ts:58, budget/page.tsx:221). The Budget tab's Committed column has rendered em-dash since 5E and 7C did not populate it; 7C derives committed from expenses (committedRemaining, payables-shared.ts:54) and surfaces it on Job Cost → Payables instead. Not a 7C regression — the link was never built. (b) Root cause: expenses has no join key to a budget line. Only cost_category (text) exists — no cost_code, no budget_item_id — and neither the 7C services nor the 7C migration reference cost_code at all, while Budget groups by cost_code. Committed dollars therefore cannot be attributed per budget row. Fix requires a schema decision: hard budget_item_id FK on expenses vs. matching on cost_category text; then rewire budget.ts to derive committed at read (7B/7C pattern) and drop the dead column rather than write to it. (c) IA: Budget and Job Cost should merge into one screen — most information is redundant, and the redundancy exists precisely because committed lives on one screen and the baseline on the other. Josh's intent (S92): one screen, committed derived, no stored committed_amount. Batch with #100 markup layer and the parked budget sell/profit + sales-tax question — same money-representation surface, spec together. Observed Session 92.
- **#108** Subcontractor closeout leaves no visible record, and there is no read-only sub profile. Three parts. (a) Defect: subcontractors.did_not_finish is written (payables-client.ts:401) but read nowhere — zero references in any .tsx. The flag lands and surfaces on no screen, so a walk-off is invisible after the fact. (b) Enhancement: closing out a sub that isn't paid in full should prompt for the reason AND a new star rating in the same dialog, and persist the reason to the sub's file as part of their history. NOT an automatic 1-star demotion — Josh's note (S92): some walk-offs are mutually agreed, so the rating is a judgment call the user makes at closeout, not a penalty the system applies. (c) IA: on Subs & Vendors, the only way to view a subcontractor or vendor is to click Edit — there is no read-only profile view. Clicking anywhere on the row should open the profile without entering edit mode; that profile is the natural home for (a) and (b) — did-not-finish status, closeout reasons, and rating history. Cross-ref #105 (name-match resolution can silently fail to set the flag at all, which compounds (a)). Observed Session 92.
- **#109** No payment edit or void, and no overpayment carry-forward. Two parts. (a) Defect, high severity: expense_payments rows cannot be edited or voided from the UI. Under 7C's derived-at-read model those rows ARE the source of truth for cash out, retainage withheld, stage settlement, and job cost actual — so a wrong amount, wrong date, or wrong stage entered once is uncorrectable in-app and silently poisons every derived figure downstream. Needs a void-and-reenter path (audit-preserving, mirroring #84's void→edit→resend posture for sent COs) rather than an in-place UPDATE; the 7C UPDATE policy on expense_payments exists but no UI reaches it. (b) Gap: over-stage payment warns correctly (click-test item 5 passed the warning), but an overpayment has nowhere to go — no way to apply the excess against a future stage or a future bill for the same sub. Today the only options are leave the stage over-paid or don't overpay. Fix shape to decide at spec: credit carried on the sub, or a negative-amount payment row, or explicit stage reallocation. Observed Session 92.
- **#110** Purchase order total entry is misplaced, and a PO cannot be cancelled. Two parts. (a) IA: setting a PO's total is only reachable as a separate action on a separate surface — it is NOT on the initial form where the material or delivery is entered, so committing a PO dollar figure requires a second trip the user has no reason to know about. A PO created and left at no total contributes nothing to committed cost, which reads as a silent failure. Fix: put the delivery/PO total on the material entry form itself, routed through the set_po_total_amount RPC (never a direct column write — see #102). (b) Gap: there is no way to cancel or void a PO. Josh's note (S92): crew open POs by accident, and today an erroneous PO has no exit — it sits open and carries committed dollars against the job forever. Needs a cancel/void path with the same audit-preserving posture as sub-contract void (7C-spec §312, Q7i: void auto-closes open committed rows with a system reason) rather than a hard delete. Cross-ref #102 (PO total_amount direct-write drift — same column, fix together). Observed Session 92.
- **#112** instrument_rates backdating floor is not concurrency-serialized — DOCUMENTED-ACCEPTED (Josh, S93 follow-up). Two simultaneous rate inserts for the same instrument+rate_type can both read the same `MAX(effective_from)` floor in `instrument_rates_backdating_guard` and both pass; the partial unique indexes block same-date duplicates but out-of-order interleavings are theoretically possible. Writers are Owner/Admin only and the action is rare, so no lock taken. Fix shape if ever needed: `SELECT ... FOR UPDATE` on the instrument parent row (estimates/change_orders) at the top of the trigger. Observed S93 follow-up.
- **#113** Subcontractor bid award leaves no trace and creates no commitment. Three parts, and one non-issue recorded to stop it being re-raised. NON-ISSUE (recorded S93 — **REVERSED 2026-07-31, S95, Josh's ruling**): the S93 record read *"Pricing moves only when a winner is picked (set_winning_bid RPC writes bid_amount into the line's estimate_line_rows.amount as subcontractor cost, then recalculateEstimateTotals reflows markup/tax). That is correct behavior."* — the first half stands (entering a bid still alters nothing: createEstimateSubBid INSERTs to estimate_sub_bids only), but the overwrite-on-award is no longer correct: **awarding must NOT overwrite an estimator-entered subcontractor cost**. New rule (fill-only-when-empty, migration `20260731040000_award_no_cost_overwrite.sql`): an existing sub row with a non-zero amount gets `subcontractor_id` only; an empty (0/NULL) amount is seeded from the bid; a missing sub row is still created with the bid amount (the row must exist — #113(c) stage 4 ties the sub-contract to the budget line via source_line_row_id). The awarded amount reaches the project as the draft contract's `contract_value` (#113(c) stage 2), so nothing is lost by keeping the estimator's cost; bid-vs-plan shows as budgeted-vs-committed variance (113c-spec §0.6). (a) Gap: no visible award record. is_winner exists with a one-winner-per-line partial unique index and a radio control (bidding-tab.tsx:164-171), but nothing surfaces WHO won and FOR HOW MUCH as a durable note, and the identity is lost at conversion — subcontractor_id stays on the estimate row and project_budget_items has no subcontractor column, so the winning sub does not reach the project at all. (b) Defect: bids cannot be attached. bid_document_file_id exists on estimate_sub_bids with an FK to files, an index, and a place in CreateSubBidInput/UpdateSubBidInput — but the add form never sends it, the column renders read-only "Attached"/"—" (bidding-tab.tsx:182-185, "Read-only until 4L attachments UI ships", Q1-b), and updateEstimateSubBid (estimate-items-client.ts:463) is dead code with no callers. The sub's bid PDF should attach at bid entry. Cross-ref #106 (same attach-a-document-to-a-money-row shape). (c) SPEC, not a patch: a won bid should carry forward to the project budget as COMMITTED, not only as cost. Today the winning amount reaches project_budget_items.budgeted_amount via the subcontractor arm of the budget-baseline INSERT (source_line_row_id → the sub row); nothing lands in committed and convert_estimate_to_project() never references estimate_sub_bids. Josh's intent (S93): awarding a bid IS a commitment. That changes 7C's committed model — committed rows would originate at award, not at bill/PO entry — and depends on #107's expense↔budget-line join and the sub identity gap in (a). Spec with the money-representation pass, not before. Observed Session 93.
- **#114** Rateless-instrument banner does not clear until reload. On an estimate's Contract section, setting a contract type with no rate in force correctly raises "No labor rate in force for this instrument — set a rate before totals can recalculate" (the #54b6d2a guard — a rateless instrument must never price at 0%). Entering a labor rate writes and persists correctly, but the banner stays up until the page is reloaded, at which point it clears and the rate reads back correctly. Stale client state, not a data defect — the guard is not re-evaluated after the rate save. Low severity, but it reads as broken to a user who just did the right thing, and it sits on the exact guard that exists to prevent silent 0% pricing. Fix: re-evaluate in-force state after a rate write. Observed Session 93.
- **#115** Expense capture model — field roles write budget-line allocations, and that is under review. DEFERRED-POST-LAUNCH (Josh, S94). S93 shipped split-at-capture (docs/specs/money-representation.md §4.4): createExpense writes the expense plus ≥1 expense_allocations rows in the same flow, Σ(allocation amounts) = expenses.amount exactly, and the expense_allocations INSERT policy was deliberately widened to every role that can capture an expense, field roles included. Rule A-7 (§4.5) hardens this — zero-allocation approval is illegal; approve_expense requires ≥1 allocation summing to the amount exactly. The split editor grants "New budget line" to Owner/Admin/PM only; foreman/crew pick existing lines or Miscellaneous. Josh's position (S94): field staff should not be allocating to budget lines at all — they will not know what is budgeted against what. Field capture should be total, job, location, photo, and similar observable facts; allocation is an office function performed by Owner/Admin at approval. This is a reversal of the capture model, not a toggle: under A-7 an unallocated expense cannot be approved, so removing field allocation requires either relaxing A-7 back toward 7A Option B (zero-allocation legal at capture, allocation at approval) or introducing a capture-time placeholder allocation — both of which move budget numbers and touch the same approval machinery #113(c) stage 4 sits on. Cross-ref the S94 §7.2 decision (sub stages must always target a real budget line — same principle applied to sub schedules) and #113(c) stage 4. Not patched — Josh will evaluate post-launch with real staff usage, then interview before any change. Raised Session 94.

- **#116** Calendar dates derived from UTC instead of the company timezone — **13 remaining sites across 12 files, all DESKTOP** (was 14; the CO/renegotiate arm closed S97, see below; `/m` re-introduced and then closed six of its own in S106 — see the last bullet). `new Date().toISOString().slice(0, 10)` yields the **UTC** calendar day, so after ~20:00 EDT (19:00 EST) it returns **tomorrow**. `companies.timezone` has existed since `20260719000000` and Module 6 already does this correctly in all three of its layers (`paidHoursPerSession` via `zonedParts`, the timesheet `dayKey`, and `get_project_day_presence()`'s `AT TIME ZONE`). Ruling (Josh, S97): **calendar dates use the company timezone.** Fixed so far under that ruling: 7D's `companyDay`/`companyToday` (`54e623a`, `09ec8cd`) and `instrument-rates-client.ts:54,77` (`FIX 5`). Correct idiom: **`companyToday(timeZone)` from `@framefocus/shared/utils/dates`** — the single implementation as of [S106]. Before that it had been written **six** times (`todayInZone` in instrument-rates-shared.ts, `companyToday` in invoices-shared.ts, a local copy in `api/cron/invoice-reminders/route.ts`, and three more under `/m`, two of which used a different spelling); all six now resolve to that module, and both service files re-export it under their original names so no existing call site moved. The "pinned to the same answer by test" arrangement is retired — they are now the same function. **NOT a candidate for a blanket find-and-replace.** Two categories are correct as-is and must be left alone — only CALENDAR DATES are wrong: (a) an *instant* stored in `timestamptz` (`sent_at`, `approved_at`, `voided_at`, `deleted_at`) is correctly `toISOString()`; (b) *date-string arithmetic* anchored at `T00:00:00Z` on both sides is symmetric and correct — e.g. `nextDay()` in `renegotiate-rate.tsx` and `daysBetween()` in `invoices-shared.ts`. Remaining, by severity:
  - **CLOSED [S97] — the CO arm.** `budget/renegotiate-rate.tsx:79` was the effective-date pre-fill for a renegotiated rate *and* the save path behind the **CO rate-section** (co-rate-section delegates to `RenegotiateRate`, so it did not inherit the FIX 5 correction). Fixed in `FIX 6`: the control now resolves `todayForCompany()` **before the panel opens**, so the date input never renders a UTC date even for one frame, and `save()` refuses an empty date rather than letting `addInstrumentRate` hide it behind its own default.
  - **Money/behavior-relevant, still open.** `estimate-items-client.ts:48`, `payables.ts:185`.
  - **Rate-in-force display "today"** — decides whether the rateless banner shows: `estimates/[id]/contract-section.tsx:78`, `estimates/[id]/items-tab.tsx:97`, `changes/[coId]/co-rate-section.tsx:100`, `projects/[id]/rate-summary.tsx:33`, `projects/[id]/budget/rate-section.tsx:150`.
  - **Recorded dates / display.** `projects-client.ts:163,165` (`actual_end_date` — a project could be stamped complete a day late), `dashboard.ts:36`, `projects/[id]/page.tsx:96`, `estimates/[id]/bidding-tab.tsx:384` (bid received-at default), `expenses/bills-tab.tsx:76`.
  - **[S106] `/m` re-introduced this, and it is CLOSED there.** The mobile tree shipped the UTC idiom in six places. Three **wrote a business date** — `logs/new` (`log_date`), `deliveries/check-in` (`delivery_date`) and `safety/new` (incident date) — recording **tomorrow** for any evening capture, i.e. wrong data rather than a display nit; three were display (`daysLeft`, M-3's Up-next `>= today` boundary, M-8's TODAY day-grouping). Fixed: server pages resolve `companyToday(getCompanyTimeSettings().timezone)`, and the two **client** forms take it as a prop rather than deriving it from the handset clock — which is neither the company's zone nor UTC, so a crew member travelling would have been a third wrong answer. `daysLeft`/`daysLeftLabel` take `today` as a parameter now. Note for whoever takes the remaining 13: `m6m-hubs.test.ts` previously derived its expected values the same UTC way the code did, so **the tests agreed with the bug**; they now pin the 21:00-EDT boundary explicitly. Check the desktop tests for the same complicity before trusting them.

  Fix shape: thread the timezone from the server page where the tree is shallow (the 7D pattern), or call `todayForCompany()` / `todayInZone()` from `instrument-rates-client` where the callers are deep inside a client tree (the FIX 5/6 pattern — one memoized `companies.timezone` read rather than threading through ~8 M4/M5 files). Neither should fall back to UTC; fall back to the column default `America/New_York`, mirroring `getCompanyTimeSettings`. The five rate-in-force display sites are the natural next batch — they all ask the same question ("what is in force today?") and all already sit next to a rates import, so `todayForCompany()` is a drop-in. Observed Session 97.

- **#117 ✅ CLOSED [S121]** — the floor is in the database. `20260830000000_change_order_read_floor.sql`: `change_orders_select_visible` and both children are Owner/Admin, **or a PM for change orders they authored** (`created_by = auth.uid()`), and nothing for foreman, crew or subcontractor. Ruled by Josh [S121] after the S121 scoping report; the authored-by-vs-assigned-project question this item held open since S97 is answered **authored-by**. Measured before → after under real JWTs: crew `13 → 0` change orders (net_delta to 211,563.12, with `unit_cost`/`markup_percent`/`total` on 61 line rows), foreman `2 → 0`, subcontractor `2 → 0`, PM `20 → 1` (exactly the one they authored), owner/admin `20 → 20`. Evidence `apps/web/test/s121-co-floor.live.ts`, failing-then-passing (12 failed → 17 passed). Four money columns nobody had named are covered: `labor_markup_percent`, `material_markup_percent`, `subcontractor_markup_percent`, `markup_percent`. `unit_cost`/`rate` floored per the ruling — *"a quote is not a cost incurred"* — with the question logged in the migration. **Residual, recorded not fixed:** a PM may UPDATE a CO they cannot SELECT (Postgres evaluates UPDATE's USING independently); not a leak, and narrowing it would change who may EDIT a CO. **Consequences:** D-53's "detail views for everyone except subcontractors" is narrowed for M-31 only; the desktop CO surfaces were WIDENED for PM at the same time (they were Owner/Admin-only, narrower than the S97 ruling). Original entry retained below.

- **#117 (original entry)** `change_orders.net_delta` has no DB-level role floor — the last figure in the Financial Visibility Floor that is **UI-gated only**. DEFERRED-BY-RULING (Josh, S97). **AMENDED S109 (Josh, M6M D-56) — re-affirmed for mobile, with the exposure stated and the scoping question answered.**

  **[S109] The open scoping question is CLOSED, and the answer is "neither".** M6M §4.11.3 said the authored-by-scope-versus-assigned-project-scope choice "should be answered before the screen is built, not during it", and D-51 (full CO lifecycle on mobile, Owner/Admin/PM) made the screen real. **Josh ruled: `change_orders_select_visible` keeps no role floor and no author scoping. The gate stays in the UI.** This unblocks D-51 rather than deferring it again.

  **The exposure, stated plainly rather than implied away.** A **foreman** or **crew member** who reaches a CO row **gets it from the database** — `change_orders_select_visible` is `company_id = get_my_company_id() AND can_view_project(project_id)`, nothing more (`20260704215000_module5_5d_change_orders.sql:332-337`). **Only the interface stops them seeing the value.**

  **[S109] The exposure is WIDER than `net_delta` alone — this is new information, found by deriving M6M §4.11.10b's block list from the policies.** `change_order_line_items_select_visible` (`:355-364`) and `change_order_line_rows_select_visible` (`:389-399`) are **also** `can_view_project()` with **no role arm**, and `change_order_line_rows` carries **`total`, `rate`, `unit_cost` and `amount`** (`:150-176`). So the unfloored surface is the CO's total **and its line-level cost and marked-up price**. Any future fix must cover all three tables; flooring the parent alone would leave the arithmetic readable.

  **The WRITE side needs no migration, and that is why the read gap is tolerable.** All three tables already carry `get_my_role() = ANY (ARRAY['owner','admin','project_manager'])` on **INSERT, UPDATE and DELETE** (`:339-351`, `:366-386`, `:402-421`), and both the send and void Route Handlers return **403** on the same three roles (`app/api/change-orders/[id]/send/route.ts:51`, `.../void/route.ts:31`). **A foreman cannot author, alter, send or void a CO regardless of what the UI does.** What is unenforced is *reading a number*, not *changing one*. **One CO read IS floored:** `co_signing_sessions_select_manager` is Owner/Admin/PM (`:427-433`).

  **What mobile adds to the risk, and what mitigates it.** M6M D-51 puts CO authoring on a phone, so the UI gate now has a second consumer. **D-54 requires the gate to be a server-side route guard, not a hidden button** — the guard is the enforcement and hiding the control is cosmetic on top of it. **A build that ships only the hidden control has shipped no permission at all**, and M6M **A-53** and **A-65** exist to fail on exactly that. The other three families were closed by moving the column to a 1:1 Owner/Admin side table: contract value → `project_financials` (`20260811000000`, old column dropped `20260812000000`), budgeted amount → `project_budget_amounts` (`20260816000000`, old column dropped `20260817000000`), and `instrument_rates` got a SELECT floor (`20260806000000` §1). `net_delta` was deliberately left on the parent row.

  **Josh's ruling (S97), in substance:** a PM **must** be able to write a change order, and **may** see the value of the COs they write. What he does **not** want is a PM seeing other amounts charged to clients. The DB floor is deferred because the same split that worked for the other three does not work here: `net_delta` sits on the row a PM must be able to INSERT and UPDATE, so splitting it would either **remove CO authoring from PM** or produce **a table a PM can write but not read** — a shape that is worse than the gap it closes.

  **The residual, precisely.** Today `change_orders_select_visible` is `company_id = get_my_company_id() AND can_view_project(project_id)` — no role floor and **no author scoping**. So a PM can read `net_delta` on **ANY change order they can see, not only ones they authored**: every CO on every project they are assigned to, including COs written by the Owner. **The ruling is satisfied by intent but not by enforcement.** The UI gate (ui-01 §11) is the only thing standing between a PM and other people's CO dollar figures, and a direct API/query walks around it.

  ---

  ### ⚠️ [S121] SCOPED FOR CLOSURE — MEASURED, AND **BIGGER THAN A MIGRATION**. NOT STARTED.

  Asked to close #117 as the blocker on D-65's award auto-assign. Investigated under the S90 harness
  (`apps/web/test/s121-co-floor-audit.live.ts`, read-only) and **stopped before writing anything**,
  because the fix needs a ruling #117 itself says must not be inferred.

  **1. THE COLUMN SET IS WIDER THAN THIS ITEM RECORDED.** #117 named `net_delta` on the parent and
  `total, rate, unit_cost, amount` on `change_order_line_rows`. The full set is:

  | Table | Money / margin columns | Named in #117 before? |
  | ----- | ---------------------- | --------------------- |
  | `change_orders` | `net_delta` | yes |
  | `change_orders` | **`labor_markup_percent`, `material_markup_percent`, `subcontractor_markup_percent`** | **NO** |
  | `change_orders` | `tax_rate` | no (pricing input) |
  | `change_order_line_items` | **`total_price`** | table named, column not |
  | `change_order_line_rows` | `total`, `rate`, `unit_cost`, `amount` | yes |
  | `change_order_line_rows` | **`markup_percent`** | **NO** |

  **The four markup columns are the sharpest addition and they are the same figure #132 calls "the
  company's margin ... precisely the class the Financial Visibility Floor keeps from PM, foreman and
  crew everywhere else."** Three of them sit on the parent row.

  **2. THE EXPOSURE IS NOT LATENT. MEASURED ON REBUILD-TEST, REAL JWTs:**

  ```
  role              change_orders          line_items      line_rows
  owner/admin/PM    20 rows, 20 net_delta  28 total_price  83 rows, 30 cost/rate, 79 markup
  foreman            2 rows                 2               3
  crew_member       13 rows, 13 net_delta  19 total_price  61 rows, 22 cost/rate, 59 markup
  subcontractor      2 rows                 2               3

  crew_member net_delta values include 211563.12, 197227.74*, 75996.90, 39116.67
    (*owner-visible set; crew's own max is 211563.12)
  crew_member line_rows sample: unit_cost 235, markup 20, total 1410
  ```

  **`crew_member` reads thirteen change orders, with cost, margin AND price** — the complete pricing
  picture. The "latent because 32 of 33 subs have no login" framing is true of subcontractors and
  **false of crew**: `josh+crew@` is a real seeded login reading real figures today. Crew sees MORE
  than foreman (13 vs 2) because crew holds more project assignments.

  **3. COLUMN-LEVEL `GRANT` CANNOT EXPRESS THIS FLOOR — not "costly", INAPPLICABLE.** Every app role
  signs in as the same Postgres role, `authenticated`; `get_my_role()` reads `profiles`, not
  `current_user`. A column `REVOKE` therefore applies to owner and crew identically. Making it work
  would mean one Postgres role per app role and a session-level role swap — an authentication
  architecture change, not a migration. (Measured separately: `select('*')` succeeds for all six roles
  on all three tables today, so a revoke would also turn `change-orders.ts:93,102` into hard `42501`s
  for whoever it applied to.)

  **4. THE 1:1 SIDE-TABLE SPLIT STILL FAILS, FOR THE REASON ALREADY RECORDED** — the money sits on rows
  a PM must INSERT and UPDATE, so a split yields either "PM loses CO authoring" or "a table a PM can
  write but not read". The three markup columns make it worse, not better: they are *inputs* the
  authoring UI must round-trip.

  **5. WHAT THE FINANCIAL VISIBILITY FLOOR GIVES, AND WHERE IT RUNS OUT.** It answers the easy part:
  CO dollar amounts and margin are **Owner/Admin**, explicitly including PM. It does **not** answer:
  - **the PM carve-out's scope** — Josh's S97 ruling ("a PM may see the value of the COs they write")
    is a carve-out the Floor's own table does not express. #117's owed decision — authored-by vs
    assigned-project — is still owed, and this item already says: *"Do not pick one at implementation
    time by inference; ask."*
  - **`unit_cost` / `rate` on a CO line.** The Floor says **actual and committed cost is visible to all
    roles**. A CO line's `unit_cost` is a *quoted pricing input*, not `project_budget_items.actual_amount`.
    The Floor was written about the latter. Genuinely ambiguous; needs a ruling.

  **6. WHAT A ROW-LEVEL FLOOR WOULD TAKE AWAY** (the only shape RLS can express — SELECT scoped to
  owner/admin/PM, mirroring the WRITE policies these tables already carry):
  - **Desktop `/dashboard/projects/[id]/changes`** — foreman/crew lose the CO list entirely. Note the
    money is *already* hidden there: `canSeeFinancials = ['owner','admin']` (`page.tsx:37`), so desktop
    is **stricter than the S97 ruling** and denies PM today.
  - **⚠️ NEW, #136's class on a new table:** that page passes `changeOrders={changeOrders}` to a client
    component **unconditionally** (`page.tsx:~44`). `canSeeFinancials` gates *rendering only*, so
    `net_delta` and all three markup percents ship in the **RSC payload** to PM, foreman and crew.
    Render-deep, not payload-deep — the same defect as #136.
  - **Mobile M-13 / M-31** — foreman/crew/sub lose them. D-26 already cuts every CO dollar from `/m`
    for every role, so nothing *rendered* is lost, but A-33c would start passing **vacuously** over an
    empty page — the exact failure the seed script's step 5b comment exists to prevent.
  - **`budget.ts:132`** reads `change_orders` for the signed-CO list, selecting `id, co_number, title,
    status` — **no money**. A row floor would empty that list for foreman/crew and silently change the
    budget screen. This is the one place the change reaches beyond COs; it does **not** otherwise reach
    7C (`expenses`, `subcontractor_contracts` carry no CO money).

  **7. THE FOUR OPTIONS, FOR A RULING.**
  - **(a) Row floor to Owner/Admin/PM** on all three SELECTs, mirroring the writes. One migration.
    Closes crew/foreman/sub completely. **Does not close the PM half** — a PM still reads every CO on
    every assigned project, which is what S97 said Josh does *not* want. Costs the enumerated screens.
  - **(b) (a) + author scoping for PM** (`created_by = auth.uid()` OR owner/admin). Closes #117 fully
    as worded. Needs the owed ruling, and PM's own CO list becomes narrower than the desktop UI implies.
  - **(c) A view layer** — read through a view that NULLs the floored columns per `get_my_role()`.
    The only shape that gives per-column granularity. Costs a **service-layer refactor**: every reader
    in `change-orders.ts`, `change-orders-client.ts` and `change-order-totals-server.ts` retargeted,
    and writes still go to the tables.
  - **(d) Keep the read gap, close the PAYLOAD leak.** One conditional in the desktop page, mirroring
    the tab gate already there. Cheap, real, and does not pretend to be the floor.

  **RECOMMENDED SEQUENCE:** (d) now — it is a genuine defect independent of the ruling and costs one
  line. Then rule the PM scope, then (b). (c) only if `unit_cost` must stay readable by field roles.

  **NOTHING WAS CHANGED.** No migration written, no policy altered, no service touched. The audit
  harness is committed because the measurements are the evidence and would otherwise be lost.

  **The decision owed before anyone builds this:** what "COs they write" actually means — **authored-by** scope (`created_by = auth.uid()`, narrow, matches the words of the ruling) or **assigned-project** scope (what the policy accidentally implements today, wider). These are materially different floors and the answer changes the fix. Do not pick one at implementation time by inference; ask.

  Note there is no `change_order_amounts` split table — nothing has been half-built toward either answer. Cross-ref: CLAUDE.md → **Financial Visibility Floor** → "Current enforcement status" (that table cites this item, and the two must be updated together). Related: #115 (same posture — a capture/authoring model Josh wants revisited rather than patched). **#132 is the same class on a different table.** Raised Session 97.

- **#132 ✅ CLOSED [S122]** — **RULED [Josh]: Owner and Admin only, all three, same answer for each — a real floor, not a UI gate.** `20260903000000_subcontractor_financials.sql` moves `default_hourly_rate`, `default_markup_percent` and `ein` to an Owner/Admin side table and **DROPS the columns**, following #117's shape for #117's reason (RLS is row-level; column GRANT/REVOKE kills `select(*)` for every role, a masking view splits reads from writes, read triggers do not exist). SELECT/INSERT/UPDATE are Owner/Admin and there is **no DELETE policy at all**, matching `project_financials`. **#117's carve-out does NOT apply**: nothing below Admin writes these, and the one client-side reader of `default_markup_percent` — the 4D bidding-tab picker — **never used it** (dead payload, removed). **MEASURED BEFORE AND AFTER, signed in as CREW:** before, `select(*)` returned `default_hourly_rate: 96`, `default_markup_percent: 20`, `ein: "zfgz"`; after, all three keys are **absent** and the explicit-column query returns **0 rows**. Harness `test/s122-sub-financials-floor.live.ts` **13/13**, failing-then-passing both directions. _Original entry retained below._

- **#132 (original entry)** **#117's class on `subcontractors` — a rate, a markup and a tax ID reaching every role, gated only by the UI.** `getSubcontractors()` does `.select('*')` (`subcontractors.ts:19`, and `getSubcontractor()` again at `:43`), and `subcontractors_select_authenticated` is `company_id = <caller's company> AND is_deleted = false` — **no role floor of any kind** (verified S100 against rebuild-test). So `default_hourly_rate`, `default_markup_percent` and `ein` are in the payload for **crew_member, foreman, project_manager and subcontractor** alike, on every screen that lists subs.

  **`default_markup_percent` is the sharpest of the three.** It is the company's margin on that subcontractor — precisely the class of figure the Financial Visibility Floor keeps from PM, foreman and crew everywhere else. `default_hourly_rate` is a cost rate, adjacent to `instrument_rates`, which **is** DB-enforced Owner/Admin (`20260806000000` §1). `ein` is a tax identifier and is not a visibility question at all, it is a PII one.

  **M6M §4.13.4 (M-27) cuts all three from the mobile Subs & Vendors screen, and says in the spec that the cut is UI-ONLY** — the same sentence #117 has to carry about `net_delta`. Desktop is unaudited: nothing here claims the desktop subs list renders them, only that RLS would not stop it if it did. **A fix is not specced and should not be inferred from #117's shape** — the side-table split that closed contract value and budgeted amount may or may not fit here, and unlike `net_delta` there is no ruling that a lower role must be able to *write* these columns. Out of scope for M6M by design; this is a Module 2 / Financial-Visibility-Floor question. First step is to establish who, if anyone, below Admin has a business reason to read each of the three — they may not have the same answer. Observed Session 100.

- **#133 ✅ CLOSED [S122]** — **and two of its three asks were already done, which is worth stating rather than claiming credit for.** The entry asked for three things: mark the field required, validate before submit, stop coercing empty to `null`. Found on inspection: the label already read **"Work performed (required)"** and a guard already sat ahead of the create/update branch (`if (!fields.work_performed?.trim())`), both landed after this entry was filed. **What was still live is the third:** the payload wrote `work_performed: fields.work_performed?.trim() || null`, identical to its six genuinely-optional neighbours. That expression can only ever produce a row the CHECK refuses — a raw `23514` naming a constraint instead of a field. It is now `fields.work_performed.trim()`, so **the payload cannot express the invalid state at all**, rather than depending on a guard twenty lines away staying put. The comment records why this one line deliberately differs from the six around it, so nobody "consistency-fixes" it back. The client guard remains **stricter than the database on purpose** (JS `.trim()` strips all whitespace; Postgres one-arg `btrim()` strips spaces only) — the safe direction, already documented in the code. Gate: `tsc --noEmit` clean, eslint clean. **A-28 note:** this is an `app/dashboard/**` change, which A-28 forbids to the M6M mobile slices; it is made here under Josh's explicit direction, in the same pass as #129's desktop change. _Original entry retained below._

- **#133 (original entry)** Migration `20260824000000_m6m_capture_constraints.sql` makes `daily_logs.work_performed` required, and **the desktop daily-log form has no idea**. The constraint is `CHECK (work_performed IS NOT NULL AND btrim(work_performed) <> '')` — correct, and exactly what D-30 / M6M §7c ruled. But `app/dashboard/field-ops/[projectId]/daily-logs/log-form.tsx:116` writes `work_performed: fields.work_performed?.trim() || null` on **both** the create and the update path, and the textarea at `:210-216` carries **no required marker, no asterisk and no client-side validation** — the form's only guard is a per-row check on subcontractor entries at `:105-110`. So a user who saves with that field empty now gets a raw Postgres `23514` surfaced through the form's generic `setError(result.error ?? 'Save failed')`, naming a constraint instead of a field.

  **The constraint is right; the form is what needs fixing** — mark the field required, validate before submit, and stop coercing empty to `null`. Not urgent in the same breath as a production incident: the migration is applied to **rebuild-test only** as of S100, so this is a fix-before-prod item, not a live break. It is filed separately from the migration because **A-28 forbids the M6M mobile slices from touching `app/dashboard/**`** — this is a desktop change and needs a desktop slice to own it. Backfill was **not** required (0 NULL and 0 blank rows measured before the constraint was added VALID). Observed Session 100.

- **#119** Company slug generation appends 8 random hex chars, and the slug **is** the tenant's email sender address. `handle_new_user()` builds it as `LOWER(REGEXP_REPLACE(company_name, '[^a-zA-Z0-9]+', '-', 'g'))` → `TRIM(BOTH '-')` → `|| '-' || SUBSTR(gen_random_uuid()::text, 1, 8)` (`20260704210000_company_members_foundation.sql:297-299`; identical copy in the baseline at `:345-347`). `buildSenderAddress()` then composes `"<Company Name> <slug@ezcontractorbinder.com>"` (`email-service.ts:63-64`), so a client sees e.g. **`Worth Properties <worth-properties-768f378f@ezcontractorbinder.com>`** on every proposal, invoice, change order and reminder. It reads machine-generated, and it lands on a domain with no sending reputation — the two compound: an unfamiliar domain plus a random-looking local part is the shape both spam filters and humans distrust. Cross-ref #126.

  **What consumes `slug` besides email: NOTHING.** Verified S99 — `buildSenderAddress()` is the only reader in the repo. `incident-notify.ts:63` merely types the object it forwards; every `slug` hit in `project-header.tsx` is an unrelated local tab identifier, not `companies.slug`. No `[slug]` route exists anywhere in `app/` (companies and projects are addressed by UUID), no FK references it, and no external system consumes it. Schema is `companies.slug text NOT NULL` + `companies_slug_key UNIQUE` + `idx_companies_slug` (baseline `:1028`, `:1604`, `:1849`). **The hex suffix therefore exists solely to satisfy the UNIQUE constraint**, and the scheme can be changed without touching anything but email.

  Fix shape to decide: (a) collision-check-and-increment (`bishop-contracting`, then `-2`) so the common case is clean and only genuine duplicates carry a suffix; (b) let Owner choose the sending local part in Company Settings with uniqueness validated at save — the address is client-facing, so the tenant arguably should own it; (c) drop the local part from tenant identity entirely and send from one fixed mailbox with the company name only in the display name, trading per-tenant addressing for a clean From line. **(a) and (b) both need a migration path for existing slugs** — changing a slug changes a live sending address, breaking anything already in a client's inbox, address book or allowlist. Observed Session 99.

- **#120** Sign-up form ships hardcoded personal placeholders. `app/sign-up/page.tsx:97,111,127` render `placeholder="Josh"`, `placeholder="Bishop"` and `placeholder="Bishop Contracting"` on the public sign-up page, so every prospect who reaches it sees the founder's name and company as example input. The email and password placeholders on the same form (`:142` `you@company.com`, `:158` `Min. 8 characters`) are already generic and are the pattern to follow. Trivial fix, but it sits on the first screen a stranger touches. Cross-ref #119 — the company-name field at `:127` is also what permanently determines the tenant's sending address, so this form warrants a copy pass rather than a one-line placeholder swap. Observed Session 99.

- **#121** Site and login noticeably slow on `ezcontractorbinder.com` — **UNDIAGNOSED**. Reported S99. No profiling run, no cause identified, and it is not known whether this is Vercel cold-start latency, the middleware's per-request round-trips (`middleware.ts:33,77,84` — `supabase.auth.getUser()` plus a profile lookup plus a subscription lookup, up to three sequential DB calls on every `/dashboard/*` request), DNS/TLS on a freshly-pointed domain, Vercel/Supabase region mismatch, or something else entirely. Not reproduced under instrumentation. First step is to establish WHERE the time goes — Vercel function logs and timing headers, then a browser waterfall — before proposing any fix. **Do not optimize the middleware on suspicion alone**; it is the most plausible-looking suspect and that is exactly why it needs evidence first. Observed Session 99.

- **#122** Password reset reported not working pre-comp — **UNVERIFIED IN BOTH DIRECTIONS**. Reported S99 against `jsbishop14@gmail.com` while that account sat at `subscriptions.status = 'canceled'`, which `middleware.ts:96-100` treats as `needsPayment` and redirects to `/dashboard/billing/plans` from every `/dashboard/*` path — so the symptom may have been the billing gate rather than a reset defect. Nobody re-tested reset after the comp, so neither reading is confirmed. **Cross-ref #70**, an independent, pre-existing, still-open report (Session 39) that the sign-in page's Forgot Password link does not let the user set a new password. If reset is still broken after the comp this is most likely #70 and not a new item, and this entry should be closed as a duplicate. Retest and resolve to one or the other. Observed Session 99.

- **#125** Test-mode Stripe subscription `sub_1TOjVGCgYe8l4i028oWCDmJq` still exists and should be deleted. It was attached to Bishop Contracting (company `4a0f9073-bca2-485f-8fbb-34e71102ab42`) in **production**; the S99 comp set `status = 'active'`, `seat_limit = 10` and NULLed `stripe_subscription_id` on that row. NULLing closes the branches that resolve by `stripe_subscription_id` lookup (`invoice.payment_failed`, and the fallback arm of `customer.subscription.updated`/`.deleted` — `webhook/route.ts:78-84,117-124,143`) but does **not** close the **metadata path**: those two branches read `subscription.metadata?.company_id` FIRST, and `checkout/route.ts:108-117` attaches `company_id` to `subscription_data.metadata` whenever the checkout carried trial days. If that subscription holds the metadata and ever emits `customer.subscription.updated` or `.deleted`, it will overwrite the comped row by company_id. Deleting the Stripe object removes the emitter and closes the path completely. Note that a test-mode subscription id reached the production DB at all, which means production was pointed at Stripe test keys at some point — confirm which keys are live before deleting. Observed Session 99.

- **#126** No test send has confirmed DKIM/SPF/DMARC pass from `ezcontractorbinder.com`. The domain shows verified in Resend as of S99 with records published at the registrar (DKIM TXT, SPF MX + TXT, DMARC), and `SENDING_DOMAIN` was cut over in `4c7eea1` — but **no message has been sent and inspected**. Local tests prove only that the address is composed correctly (`email-service.test.ts` pins the literal From line); nothing local can reach authentication or deliverability, which are properties of mail in flight. Smallest closing test: send one message to a controlled mailbox and read `Authentication-Results` for `dkim=pass spf=pass dmarc=pass`. Separately the domain has **no sending reputation** — a brand-new domain is an inbox-placement risk independent of authentication, and every client-facing email on the platform now rides it. Cross-ref #119 (a random-looking local part compounds the trust problem). Blocking for any real client-facing send. Observed Session 99.

### Code Quality

- **#8** `team-page-client.tsx` has local `ROLE_LABELS` — should import from `@framefocus/shared`
- **#9** `invite-form.tsx` has local `INVITABLE_ROLES` — should import from `@framefocus/shared`
- **#10** `invite-form.tsx` imports `Invitation` without `import type` — cross-boundary type import should use `import type`
- **#12** **PRIORITY — fix before Module 4 build (scheduled Session 35).** `packages/shared/types/index.ts` is the same barrel anti-pattern that old #11 was for constants, now for types. Verified Session 34 (F3). Multiple drift issues:
  - `CompanyUserRole` inline string union missing `admin` role — same bug pattern as old #11. Compounded by `export * from './roles'` at the file's bottom, which re-exports a different `CompanyUserRole` from `roles.ts`. Consumers get whichever wins by import order.
  - `Profile` interface inline, uses `id` instead of actual DB column `user_id` (see #32), and missing standard audit columns (`created_by`, `updated_by`, `is_deleted`, `deleted_at`).
  - `Company` interface inline, missing `website`, `license_number`, and `ai_tagging_enabled` (added Session 30, Migration 023). Also has `owner_id` and `stripe_subscription_id` fields that may not exist in the actual schema — verify against `database.ts` before trusting them.
  - `Company` forward-references `SubscriptionStatus` before it's declared. Works via TS hoisting but fragile.
  - Fix: delete all inline interfaces. Consumers import from `database.ts` (auto-generated, source of truth) or per-entity service files using the existing Pick/Omit patterns. Same fix shape as old #11.
- **#90** Crew-role RLS gates not yet verified end-to-end via UI. Session 79 verified project_manager RLS gates fully (team-detail blocked, billing/settings hidden, projects correctly scoped to assigned-only). Crew (crew_member) tier was NOT tested because no working Crew login could be established: the password-reset email link is broken (#70) and Supabase magic-link/reset hit the email rate limit. Crew is more restricted than PM, so PM passing all gates makes a Crew failure unlikely but not impossible — verify when a Crew login path exists. Blocked on #70. Observed Session 79.
- **#128 ✅ CLOSED [S122]** — `db:types` now runs `scripts/db-types.sh`, which generates to a **temp file** and only `mv`s it into place after three gates pass: the generator exited 0, the output clears a 500-line floor, and it contains `export type Database` plus three long-standing tables. `2>/dev/null` is gone, so the generator's stderr reaches the operator. **Proven in all four directions** by shimming `npx`: a failed generation, a one-line truncation and a 900-line partial each **exit 1 and leave `database.ts` byte-identical** (md5 `359e8f4a…` before and after all three); the happy path regenerated 6479 → 6479 lines at the same md5. For the record, the old form was demonstrated destroying a file and reporting success: `( false 2>/dev/null > demo.ts )` → **0 bytes, exit 0**. _Original entry retained below._

- **#128 (original entry)** `db:types` **silently truncates `database.ts` on failure and reports success.** The script is
  ```
  "db:types": "supabase gen types typescript --linked 2>/dev/null > packages/shared/types/database.ts"
  ```
  (`package.json:17`). Two independent faults compound. The shell performs `>` redirection **before** running the command, so the target file is truncated to zero bytes the instant the pipeline starts — the previous good contents are gone before generation is even attempted. And `2>/dev/null` discards the generator's stderr, so an expired token, a lost CLI link (a routine Codespace-rebuild casualty), or a network failure produces **no visible error**. The exit status is the redirect's, not the generator's. Net effect: a failed run leaves an empty or partial `database.ts`, the chained `npm run db:push` (`:16`) continues to `type-check`, and the failure surfaces later as hundreds of unrelated type errors — or, worse, as a committed truncated file. **Verify every regeneration by line count, md5 and a grep for a known symbol; do not trust the exit code.** Fix shape: drop `2>/dev/null`, generate to a temp file, and only move it into place when the command exits 0 and the output is non-empty. Observed Session 100.
- **#131 — AMENDED [S123]. RULED [Josh]: e2e becomes a REQUIRED CHECK. Half of this entry is now settled and the other half depends on a decision that has not been made.**

  **⚠️ THE PREMISE THAT REVERSES.** This entry was filed on the assumption that the secrets are *"meant to be removed later"*. **They are not, any more.** A required check must pass on every gated change, forever, so the secrets it needs become **permanent infrastructure**. That is now **three** secrets, not two — `SUPABASE_SERVICE_ROLE_KEY` joined them in S123 (`ci.yml:159`) because the fixtures build a service-role client and `/api/change-orders/[id]/recalculate` constructs one at request time. Removing any of the three no longer degrades a test job; it **breaks the gate**. The original body's advice — "if they are removed, give the e2e job placeholder values or gate the job on their presence" — is **superseded**: under the ruling they are not removed at all. Everything the original says about *how* their absence misreports (below) remains accurate and is why this was never a small question.

  **WHAT JOSH CLICKS.** The check names are the job `name:` values in `.github/workflows/ci.yml` — **`E2E (Playwright)`** (`:70`) and **`Lint & Type Check`** (`:34`). A check is only offered in the picker after it has reported at least once; both have, so both will be findable.

  _Rulesets (current GitHub UI, preferred):_
  1. Repo → **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**
  2. Name it; set **Enforcement status: Active**
  3. **Target branches** → **Add target** → **Include default branch** (or add `main` by name)
  4. Tick **Require status checks to pass** → **Add checks** → add **`E2E (Playwright)`** (and `Lint & Type Check`)
  5. Leave the **Bypass list EMPTY** — an admin in the bypass list makes the whole thing advisory
  6. **Create**

  _Classic equivalent:_ **Settings** → **Branches** → **Add branch protection rule** → pattern `main` → **Require status checks to pass before merging** → select the checks → tick **Do not allow bypassing the above settings** → **Create**.

  **⚠️ AS THINGS STAND, THE RULING BUYS ALMOST NOTHING, AND THIS IS THE PART THAT MATTERS.**

  **Required status checks gate PULL REQUESTS. This repo has never had one.** Every merge commit on `main` is a hand-written `merge: …` — `9a2be5e`, `3f9ad56`, `9fc9bc9`, `6b6830e` — and never GitHub's `Merge pull request #N from …`. Verified S123 across the last 20 commits: work is merged **locally** and pushed straight to `main`. So a required check has **nothing to attach to**, and CI's `on: push: [main, dev]` trigger means it keeps doing exactly what it already does — running **after** the commit is already on `main`, and after Vercel has already begun deploying it. **A required check on a repo with no PRs changes nothing about what can reach production.**

  **The piece that makes it real is requiring a pull request** — Rulesets: **Require a pull request before merging**; classic: the same-named option. That is what forbids the direct push and forces every change through a PR the status check can gate. **Without it, step 4 above is decoration.**

  **THE COST, STATED PLAINLY, BECAUSE IT CHANGES HOW EVERY FUTURE SESSION SHIPS.**
  - The current workflow **ends**. CLAUDE.md's run protocol — *"Merging to `main` is Josh's call, done manually"* — stays true in spirit but becomes: branch → push → open PR → wait → merge.
  - **Every change waits for the full e2e job**: `npm ci` + `playwright install --with-deps chromium` + a ~175 s production build + the suite (11.3 m measured) — realistically **15–25 minutes per PR**, against a job `timeout-minutes: 20`. A one-line docs fix pays the same toll as a schema change.
  - **A red or flaky e2e run blocks the merge.** CI runs `retries: 2`, so a flake usually self-clears, but the tail risk is a genuine block on a bad afternoon. There is no partial credit.
  - **Emergency fixes need an explicit bypass** — and any standing bypass reopens the hole the rule was created to close.

  **STATUS: the ruling is recorded; the clicks have not been made, and the direct-push question is OPEN and is Josh's.** Requiring the check alone is cheap and near-pointless. Requiring PRs is what buys the guarantee, and costs the workflow above. **Do not treat this item as discharged by ticking the status check.** Ruled S123.

  _Original entry retained below — its account of what the secrets' absence does is unchanged and is the reason this was never trivial._

- **#131 (original entry)** GitHub Actions repo secrets `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` were added pointing at **rebuild-test** so the Playwright job can boot the app (`.github/workflows/ci.yml:94-95`). **They are meant to be removed later, and the consequence of removing them is not a skipped test — it is a whole-suite failure that misreports its own cause.** Without them `next dev` still starts, but `middleware.ts` constructs its Supabase client from `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `..._ANON_KEY!` (`:11-12`) — non-null assertions over `undefined` — so the client is built against nothing and **every matched route 500s**. The matcher covers `/dashboard/:path*`, `/sign-in` and `/sign-up`, and `e2e/auth.setup.ts` signs in through `/sign-in`, so **setup fails and every authenticated spec fails on `page.goto` rather than on its assertion**. A reader of that CI log sees fifty broken tests, not one missing secret. If they are removed, either give the e2e job placeholder values or gate the job on their presence and say so in the skip reason. Observed Session 100.
- **#137 ✅ CLOSED [S122]** — **the rules moved to where they are read, and the one mechanical half was mechanised.** (1) `.github/workflows/ci.yml` now sets `defaults.run.shell: bash -euo pipefail {0}` at workflow level, so **every** `run:` step gets `pipefail` — GitHub's default is `bash -e {0}`, with no pipefail, which is exactly why `npx next build | tail -20` shipped a failed build as green. `-u` is included for the adjacent class (a typo'd secret name becoming `""` rather than failing). YAML re-parsed after the edit; both jobs still resolve. (2) The four rules moved verbatim into **CLAUDE.md → Claude Code run protocol → "Reading the exit status of a command"**, because a rule about how to run commands belongs in the file read before every session, not in a debt register consulted when something breaks. **⚠️ CLOSED DOES NOT MEAN SOLVED.** `defaults.run.shell` closes the **pipe** case workflow-wide. It does **not** close the **trailing-command** case — `cmd; echo "exit: $?"` still reports the `echo`'s status — and nothing but not writing it does. That limitation is stated in both new homes rather than allowed to disappear with the entry. _Original entry retained below, including the fifth instance (`pkill -f` killing its own shell), which is now rule 4 in CLAUDE.md._

- **#137 (original entry)** **Masked exit status — a passing command that was not the command that mattered. FOUR instances in one session [S106].** One root cause each time: the status read belonged to a *different* process than the one being judged.
  - `npx next build | tail -20` → the pipeline's status is **`tail`'s**, always `0`. A build that failed lint was reported clean and committed on that basis; caught only when a later run happened not to pipe.
  - `supabase gen types typescript --linked 2>/dev/null > database.ts` → the redirect truncates the file **before** the command runs and `2>/dev/null` hides why, so a failed generation reports success and leaves an empty file (this is #128's mechanism; recorded here as the same family).
  - `npx playwright test; echo "exit: $?"` → the **compound command's** status is the `echo`'s, so both the shell **and the task-notification summary** reported `0` while the run had exited `1`. Twice this masked real failures — **89 and 91 tests** — and both times the true cause was a server killed out from under the run.
  - **Mitigation that worked, and is the recommendation:** (a) never judge a command through a pipe — redirect to a file and grep it instead (`cmd > log 2>&1; echo $?` *immediately*, before anything else runs); (b) print the real code **into the output** and read *that line*, not any wrapper's status; (c) corroborate with an **independent signal** — a `✘` count, a test tally, a connection-error count — because a status can be masked but a tally cannot.
  - **A fifth instance, same family, found while cleaning up after the fourth [S107]:** `pkill -f "next dev"` matches **any** process whose command line contains that string — **including the shell running the pkill itself**, which is why those commands kept returning **exit 144** and why servers appeared to die for no reason. `pkill -f` is a footgun in any harness step; **list the processes and `kill <PID>`** instead. The tell is the same as the rest of this entry: the status reported belonged to a process other than the one being judged.
  - **⚠️ CI IS WHERE THIS BITES HARDEST.** Locally a masked failure costs a re-run. In `.github/workflows/ci.yml` a masked non-zero **ships red as green**: the job goes green, the branch looks mergeable, and nothing downstream re-checks. Any CI step that pipes, or that ends in a trailing command, needs auditing for this specifically — `set -o pipefail` addresses the pipe cases and nothing addresses the trailing-command case except not writing it.
- **#138 ✅ CLOSED [S122]** — the pre-run check is now `scripts/e2e-preflight.sh`, in the harness rather than in habits. It kills dev servers **by PID with a self-exclusion** (never `pkill -f` — see #137's fifth instance), asserts the port is free by requiring `curl` to **fail**, starts exactly one server, and then greps the log for **both** signals: a `Local: …:3000` / `Ready in` binding line **and** the absence of `Port 3000 is in use`. It also fails fast on `Missing script` / `ENOENT`, which is the working-directory-drift case the entry describes. **Proven in three directions:** clean start → exit 0; a stale dev server already holding 3000 → swept and replaced, exit 0; a **non-next** process holding 3000 (`python3 -m http.server`) → **exit 1, refusing to start a second server that would bind 3001 and be driven by nothing**. ⚠️ While testing this, a hand-rolled `pgrep -f 'next-server|next dev'` kill loop **returned exit 144 by killing its own shell** — #137's fifth instance reproduced live, and the reason the script excludes `$$`. _Original entry retained below._

- **#138 (original entry)** **`npm run dev` treats a port collision as a WARNING and silently moves to 3001, while Playwright keeps driving whatever holds 3000.** Observed S106: a dev server left running from a previous suite kept port 3000; a new server was started (after `rm -rf .next`, which deleted the *old* server's build manifest out from under it) and printed `⚠ Port 3000 is in use, trying 3001 instead` before carrying on happily. `playwright.config.ts` sets `baseURL: 'http://localhost:3000'`, so the runner drove the **crippled** server for two full suites — `auth.setup` failed, 277 tests never ran, twice. A `curl` warm-up returned `200` and reassured falsely, because the stale server could still serve a cached page; only the sign-in POST path was broken.
  **Nothing surfaces this unless the server log is read** — the collision is a warning, not an error, and `reuseExistingServer` means Playwright is equally happy to attach to the wrong thing. **The pre-run check belongs in the harness, not in habits:** kill every `next dev`/`next-server` (**by PID — see #137's fifth instance; `pkill -f` can kill the shell running it**), confirm the port is actually free (`curl` it and expect failure), start exactly one server, then grep its log for **both** `Local:        http://localhost:3000` **and the absence of** `in use`.
  **It earns its keep beyond port collisions.** In the two runs after it was adopted it caught, on separate occasions: (a) a stale server still holding 3000 so the new one silently went elsewhere — the original fault; (b) `npm run dev` failing outright with `Missing script: "dev"` because the shell's **working directory had drifted to the repo root**, which without the log grep would have surfaced later as inexplicable test failures against a server that was never running. Both were invisible to "did the command appear to succeed" and obvious to "does the log say it bound the port I am about to drive". Related to #135 (also a webServer/dev-server-lifecycle trap) but a distinct fault.
- **#135 ✅ CLOSED [S122]** — CI now serves a **production build**, which is the fix the config's own comment recommended. `playwright.config.ts`'s `webServer.command` is `npm run start` when `process.env.CI` is set and `npm run dev` otherwise; `.github/workflows/ci.yml` gained a **separate `Build (production)` step**. The separation is the point: folding the build into the webServer command would turn a COMPILE ERROR into `Timed out waiting … from config.webServer`, which is the misreporting this item is about. **Measured, this box, rebuild-test:** cold `next build` **175s**; `next start` to serving **2s**; `e2e/m-writes.spec.ts` **2.8m against production vs 5.0m against dev** (same 53 tests, −44%); full suite against production **424 passed, 7 skipped, 1 flaky, 11.3m, exit 0**; `next-server` RSS **320MB after the full suite vs ~1400MB and climbing** for the dev server. **So CI gets FASTER despite adding a build**, and the 1.4 GB dev server — the only resource growth #145 ever measured — is gone from the loop. _Original entry retained below._

- **#135 (original entry)** Playwright CI cold-start can exceed `webServer.timeout`. Observed S100 locally: a leftover **production** `.next` from an earlier `next build` forces `next dev` into a full recompile, which ran past `playwright.config.ts`'s `timeout: 120 * 1000` and failed the entire run with `Timed out waiting 120000ms from config.webServer` — **before a single test executed**, so the report names the web server and not the app. **CI pays the same cost every run and has no warm cache at all**: it always starts its own server (`reuseExistingServer: !process.env.CI`), on a cold checkout, on a slower runner. The config already carries a comment saying the timeout was raised from 60s "because the dev server compiles routes on first request" — this is the next notch of the same problem. Two fixes, and the second is the one the config itself already recommends: raise the timeout, or switch the e2e job to `next build && next start` so CI tests a production build instead of an on-demand-compiling dev server. Local workaround while it stands: `rm -rf apps/web/.next`, start `npm run dev`, wait for it to answer, then run Playwright — `reuseExistingServer` attaches to it. Observed Session 100.

### UX Polish

- **#13** Row click should open read-only detail view (contacts + subcontractors) — currently Edit button is only way in
- **#89** Vendors are mislabeled "(Sub)" in the project-scheduling New Task assignee dropdown. Both subcontractors and vendors from the Subs & Vendors list render with a "(Sub)" suffix, so a vendor (member_type='vendor') shows as "(Sub)" — the label doesn't match the record's type. Assignment itself works correctly; this is a display bug only. Fix: label each assignee by its actual type — "(Sub)" for subcontractors, "(Vendor)" for vendors. Likely a single dropdown-builder that hardcodes the "(Sub)" suffix instead of reading member_type. Observed Session 79 during manual testing.
- **#100** Photo markup is invisible outside the markup editor. markup_data (JSONB on files, baseline :1386) renders only as an SVG overlay in markup-editor.tsx; the file grid, daily-log/incident/delivery photo strips, all three PDF services, and downloads all show the raw original. A user who marks up a photo sees no evidence of it anywhere afterward. Intent (Josh, S90): markup should persist as a non-destructive LAYER over the original — original bytes never overwritten, markup viewable wherever the photo is viewed. Fix shape: render the SVG overlay in every photo surface (grid, strips, viewer), and composite to flat JPEG/PNG only where the image must leave the app. Cross-ref #53 (flattened export for email/PDF — the leaving-the-app half of the same problem) and #55 (in-app fullscreen viewer, the natural host for layered display). Discovered Session 90 during markup testing.
- **#101** Job/task switching is unreachable outside /dashboard/timeclock, and the dashboard shell has no mobile handling. ClockModal's modes are 'clock-in' | 'clock-out' only; the switch modal lives solely in timeclock-client.tsx, so a crew member on any other page must navigate to the timeclock page to switch jobs — and the 7A material-run expense prompt on the switch path only fires there. Compounding it, dashboard-shell.tsx has zero responsive handling: no media queries, no drawer, a shrink-0 236px sidebar that never collapses (~140px of usable content on a 375px phone), and a non-sticky header, so the global clock button scrolls out of view. Intent (Josh, S90): the clock control should be locked to the top on mobile, and switching should be reachable from it. Fix shape: add a 'switch' mode to ClockModal so the global button can switch, and make the header sticky + the shell responsive. Field crew on phones are the primary audience for 6A/7A capture. Cross-ref #30 (mobile app is a placeholder — this is the web shell that exists today). Discovered Session 90.

  **[S97, 2026-08-03] THE PWA RULING CONFIRMS THE DIRECTION BUT NOT THE SHAPE.** Josh ruled mobile
  is a PWA on this same web app (CLAUDE.md → Technology Stack), so this item is no longer competing
  with a React Native app that might have made it moot — the web shell IS the mobile experience.
  **What is still OPEN, and is Josh's next decision: REPAIR the existing dashboard shell (collapse
  the sidebar to a drawer, sticky header — what this item assumed at S90) versus a SEPARATE ROUTE
  TREE for phones.** Repair is cheaper and keeps one system; a separate tree lets field screens be
  designed for touch instead of adapted. Do not start either until it is ruled.

  **Audit measurements [S97, 2026-08-03] — the arithmetic behind "no mobile handling":**
  `dashboard-shell.tsx:119` is `<aside className="flex w-[236px] shrink-0 …">` with `<main
  className="… px-[30px]">`. Content width is therefore **390 − 236 − 60 = 94px** on an iPhone
  14/15 and **375 − 236 − 60 = 79px** on an SE/mini. (This item's original "~140px on a 375px
  phone" counted the sidebar but not the main padding — both figures are right; **79px** is what
  content actually gets.) The header at `dashboard-shell.tsx:175` is `h-[54px] shrink-0` with **no
  `sticky top-0`**, confirming the scroll-away clock button.

  **AND THE CONSTRAINT THAT SIZES THE FIX: the screens are inline-styled, and inline styles cannot
  carry a media query.** Counted S97: **1,917 `style={{` usages against 771 `className=`** across
  `apps/web/app`; **zero** `@media` rules in source; and **exactly one** responsive Tailwind variant
  in the whole codebase (`md:grid-cols-3` in `billing/plans/plan-selection.tsx:93` — a page crew
  never see). Tailwind is configured and the shell uses it, but the screens do not. So "make the
  shell responsive" is cheap; **making the SCREENS responsive is a styling-system decision**
  (migrate to Tailwind, or container queries, or a JS breakpoint hook — the last reintroducing the
  second-system risk). That choice is part of the repair-vs-separate-tree decision above, not
  separable from it.

  Also measured: **18 files contain `<table>`**; recurring fixed grids include
  `'2fr 1fr 1fr 1fr 2fr auto'` (6 columns) and `'1fr 320px'` (a hard 320px rail);
  `components/time/clock-modal.tsx:309` is **`width: '460px'` with no `maxWidth`**, so the most-used
  field action's modal is **wider than the viewport** on every phone; and **no image input anywhere
  sets `capture`** (`accept="image/*"` only, in five field forms), so field photo capture opens the
  file chooser rather than the camera.

### Track for Module 4 (Estimating)

- **#18** Add `converted_at` timestamp to contacts — for lead-to-client conversion tracking
- **#19** Add cursor-based pagination to list pages — contacts and subcontractors currently load all records

- **#140 ✅ FULLY CLOSED [S122]** — the S115 fix shipped the route, the privileged module and the shared pricing context; the **STILL OWED** paragraph below is now discharged too. `lib/services/pricing-as-of.ts` is one definition of the as-of date in COMPANY time, and **both paths moved to it in a single commit** — `estimate-items-client.ts` (RLS-scoped, passes `null`) and `change-order-totals-server.ts` (service-role, passes an explicit `company_id` because RLS is bypassed). That coupling is the point: moving one alone would make a PM total differ from an Owner total for a few hours each evening, which the server module's own comment refused to do. Fallback is the column default, never UTC. Proof: `test/pricing-as-of.test.ts` **7/7** — the evening-boundary test asserts the answer is NOT the UTC slice, and one test asserts the RLS path and the service-role path return the SAME date. `test/s115-co-recalc-rates.live.ts` still **7/7** against the real database. _S115 text and the original entry retained below._

- **#140 (S115)** **[S115] FIXED — and the entry below was WRONG about the symptom. Read this before the original text.** The fix ships as three files (M6M §4.11.12a, D-62): `buildInstrumentPricingContext()` **extracted** into `lib/services/instrument-rates-shared.ts` so both paths shape rates through one definition; **`lib/services/change-order-totals-server.ts`** (new, `server-only`) which reads `instrument_rates` with the **service role**, prices with the same shared functions, persists row/line/`net_delta` and **returns `{ success }` — no rate, no rows, no markup**; and **`app/api/change-orders/[id]/recalculate/route.ts`** (new) doing 401 → 403 (owner/admin/PM) → **RLS-scoped CO read** → 404 before the privileged call. `recalculateChangeOrderTotals()` now POSTs to that route with an **unchanged signature**, so none of the three desktop call sites moved.
  **⚠️ THE SILENT-ZERO CLAIM BELOW WAS NO LONGER TRUE, and the correction matters because it changes what needed fixing.** Verified live on rebuild-test [S115] against `CO-105-02` (cost_plus, real rates, material + subcontractor rows): `assertInstrumentRatesInForce` — which landed for A-9/7d1 §6.1 after this entry was filed — already converted the silent path into a **hard stop**. Owner reads material 20% / sub 20% and prices; **a PM reads zero rows and the guard THROWS**. So what actually shipped as a defect was:
  **(a) an error naming a cause that is false** — `NoRateInForceError` says *"set a rate before totals can recalculate"* when the rate **is** set and the caller merely cannot read it, which CLAUDE.md forbids in as many words and which sent a PM to ask an Owner to create a rate that already existed; and **(b) a PM could not recalculate a non-fixed CO at all** — every T&M CO and any cost-plus CO with a material/subcontractor/other row — breaking D-51's lifecycle for two of the three CO types.
  **A narrow silent case survives and is NOT this bug:** a cost-plus CO whose rows are **all labor** passes the guard for everyone (`assertInstrumentRatesInForce` never checks `cost_plus_labor_hourly`), but labor bills flat at the **row's own** rate under `flat_rate_labor` (S97), so a PM and an Owner compute the **same** number. Recorded so nobody "fixes" it into a regression.
  **Evidence.** `apps/web/test/co-rate-visibility.test.ts` (unit, 7/7) locks the silent zero — **verified sensitive**: injecting `?? 0` for `?? null` in `rateInForce` fails **4 of its 7** assertions. `apps/web/test/s115-co-recalc-rates.live.ts` (7/7) calls the **same** privileged function with a PM-scoped client (**refused, nothing persisted**) and with the service-role client (**prices to the hand-computed 132.00**), which is the shape that fails on the defect where a happy-path test would not. `apps/web/e2e/m-co-recalc-route.spec.ts` (6/6) proves the route's 401/403/403/404/200 gate.
  **STILL OWED, deliberately not done here:** both paths compute their as-of date as a **UTC** slice (`new Date().toISOString().slice(0,10)`), which `instrument-rates-shared.ts`'s own header explains is wrong for `effective_from` — after ~20:00 EDT it is tomorrow. Moving only the privileged path to `companyToday()` would make a PM's total differ from an Owner's each evening — worse than the bug fixed, and indistinguishable from #140 to whoever hit it. **Both paths must move together, in one change, with the company timezone loaded server-side.**
  _Original entry, retained as the reasoning of record:_ **A PM recalculating a non-fixed-price change order reads a DB-floored table, gets zero rows with no error, and lands a silently wrong total.** `recalculateChangeOrderTotals()` (`change-orders-client.ts:431`) calls `loadInstrumentPricingContext()` (`estimate-items-client.ts:30`), which for a `cost_plus` or `time_and_materials` instrument queries **`instrument_rates`** — a table whose SELECT is **DB-floored to Owner/Admin** (`instrument_rates_select_owner_admin`, `20260806000000_financial_rls_floor.sql:66`). **RLS filters, it does not error.** So a PM's query returns an empty set, `rateInForce()` resolves every rate to null, and `net_delta` is computed from missing rates with **no failure surfaced anywhere** — no exception, no empty state, no log. The CO is then sendable to a client at the wrong number.
  **Scope.** `fixed_price` COs are unaffected — `loadInstrumentPricingContext` returns before the query, and `createChangeOrder` defaults `co_type` to the project's type falling back to `fixed_price`. It bites only `cost_plus` / `time_and_materials`, and only for a PM (Owner/Admin read the rates fine).
  **PRE-EXISTING AND TRUE OF DESKTOP.** `change_orders_insert_authorized` already admits PMs, so a PM can author a cost-plus CO on desktop today and hit exactly this. **Not introduced by M6M** — but **M6M D-51 puts it in a PM's hand on a phone**, which is why it is filed now rather than left unnamed.
  **The fix shape already exists in this repo and does not need designing.** `lib/services/invoice-derivation-server.ts` was built for the identical collision (7D1 RULING B, S97): a **privileged server-side module** that runs with the service role, reads the rates itself, and **returns no rate value to the caller** — not the rows, not a rate, not a `unit_rate` readable off the response. A CO equivalent is the same pattern against `change_order_line_rows`. Its header states the trap to respect: the service role bypasses RLS entirely, so the caller-facing route must do company + role + project scoping **before** the privileged function is reached.
  **Interim option, proposed and NOT ruled:** M6M §4.11.12 suggests M-32 offer `fixed_price` only until this is closed. Open item 4 in M6M §11's fourteenth pass. Observed Session 108 (M6M spec pass, verified in code). **[S115] WITHDRAWN — D-62 rules the opposite: fix #140 first, then ship all three CO types with no `fixed_price`-only restriction. The interim was never adopted.**

- **#141 ✅ CLOSED [S122]** — the migration half was already built, applied and proven at S113 (15/15, failing-then-passing across a deliberate revert/re-apply). The only thing holding this entry open was the **column-level residue** in its last paragraph, and that is now **RULED [Josh]: the service layer is accepted, no trigger is owed.** Re-filed as **#146** so the residue is tracked as a decision with a rationale rather than as an unfinished migration — which is what a paragraph at the bottom of a closed item reads like. _Everything below is retained as the reasoning of record._

- **#141 (original entry)** **[S113] THE MIGRATION IS BUILT, APPLIED AND PROVEN — what remains open is only the column-level residue in the last paragraph.** `supabase/migrations/20260828000000_punch_subcontractor_visibility.sql` narrows **both** `punch_list_items_select_visible` (D-57) and `punch_list_items_update_authenticated` (D-58) to the identical two-arm predicate; applied to rebuild-test and verified against `pg_policies`. Proof is `apps/web/test/s113-punch-sub-visibility.live.ts`, **15/15**, run failing-then-passing across a deliberate revert/re-apply of the two policies: with the pre-migration policy in force the sub saw **3/3** items and could **write all three**, the harness exited **1**; with the migration in force the sub sees **2** (assignee arm + author arm) and the NEITHER item is **refused on both read and write**, exit **0**. The other five roles read **3 before and 3 after** — the non-change half held. Consequences (b) and (c) below are now discharged: **(b)** UPDATE was mirrored, closing the blind-update-by-id hole (confirmed live — the sub really could update the NEITHER row before this migration); **(c)** #127 is **closed**, so this is provable by signing in and is reproducible by anyone from the permanent seed. **(a)** the M-3 badge label was **ruled** — D-59 keeps it as-is (commit `987a4e6`). _Everything below is retained as the reasoning of record._
  **REWRITTEN S110 — the migration this entry originally proposed has been REVERSED. Do not build it.** _Superseded text, quoted:_ _"`punch_list_items` and `punch_lists` carry NO role floor at all — so M6M D-52's 'everyone except subcontractors' exclusion exists nowhere … Add `AND public.get_my_role() IS DISTINCT FROM 'subcontractor'::text` … to **four** policies."_ **M6M D-52's subcontractor exclusion is withdrawn (Josh, S110): subs get punch lists, including creating them.** The absence of a role floor on punch INSERT and UPDATE is therefore **correct behaviour, not a gap**, and nothing is owed there.

  **What IS owed is the opposite change — a NARROWING of SELECT (M6M D-57).** **A subcontractor sees a punch item only if `assignee_id = get_my_member_id()` OR `created_by = auth.uid()`.** Nothing else on the project. Punch **lists** stay fully visible.

  **This is narrower than what ships today, not wider.** `punch_list_items_select_visible` (`20260704214000_module5_5c_punch_lists.sql:185-195`) is `company_id` + (`can_view_project(project_id)` OR assignee), and **`can_view_project()`'s second arm is role-blind** (`20260704211000_module5_5a_projects.sql:248-262`) — the same property M6M §7a *relies on* for sub photo access. **So an assigned subcontractor currently sees every punch item on the project.** D-57 takes that away.

  **`created_by` exists**, so no schema change is needed: `DEFAULT auth.uid()`, `punch_list_items_created_by_fkey → auth.users(id)` (`:126`). **⚠️ The two halves of the predicate sit on different identity axes** — `assignee_id` FKs to `company_members(id)` (`:116`) and `created_by` to `auth.users(id)`. Comparing either against the wrong one **returns no rows rather than erroring**, so the failure looks like the rule working. This is GAP-1b's trap in a new place.

  **Shape: one DROP/CREATE on `punch_list_items_select_visible`, two mutually exclusive arms** — `get_my_role() IS DISTINCT FROM 'subcontractor'` keeps the original predicate byte-for-byte for the other six roles, and the sub arm is `assignee_id = get_my_member_id() OR created_by = auth.uid()`. `IS DISTINCT FROM`, not `<>`, because `get_my_role()` can be NULL. The sub arm deliberately omits `can_view_project()`, preserving the "broad assignment" intent the original policy's own comment describes. **Full write-up: M6M §4.11.14a.** ~~Not written.~~ **[S113] Written, and D-58 mirrored the same predicate onto UPDATE in the same migration** — the two are asserted to *agree* rather than each checked alone, because the defect to guard against is drift.

  **Why RLS and not the service layer:** it is a pure row-level predicate, which is exactly what a SELECT policy expresses; a filter in `getPunchLists()` would leave the rows in the payload — **#136's mistake** — and that function is shared with desktop. **Zero application code changes:** every caller reads through RLS and receives fewer rows.

  **Three consequences to carry — all three discharged [S113].** (a) `getOpenPunchCounts` reads through RLS, so **a sub's M-3 badge counts only what they can see** — correct, and the same shape M6M A-11j already accepts for crew; whether the *label* should change ~~is open~~ **was ruled: D-59 keeps the label as-is** (`987a4e6`). (b) `punch_list_items_update_authenticated` keeps its role-blind arm, so **a sub could write to an item they can no longer read** — incoherent rather than dangerous; mirroring the two arms onto UPDATE ~~is proposed, not ruled~~ **was ruled (D-58) and shipped in the same migration.** The hole was real, not theoretical: with the old policy in force the QA sub successfully updated the NEITHER item. (c) **It cannot be proven while #127 stands** — ~~no `subcontractor` identity exists to probe with~~ **#127 is closed**; `josh+qa-sub@worthprop.com` is a real signed-in identity with a member row, and the paired assertions in the harness mean the "sub sees nothing" degenerate pass fails rather than looks correct. **Seed, then migrate, then prove both arms** — done, in that order.

  **The one finding from the original entry that survives:** verify's Foreman+ floor, the `requires_verification` and `status='complete'` checks and the **separate-eyes** rule are all in `punch-client.ts:182-211` (TypeScript), and RLS accepts a direct UPDATE setting `status='verified'`. **[S110] M6M D-52 is corrected so the ruling now matches that code** (verify is Foreman+, crew excluded, 5C §4 unreversed), so it is no longer a ruling-versus-code conflict — just a pre-existing, desktop-wide, column-level rule that RLS cannot express without a trigger. Observed Session 108, rewritten Session 110.

- **#142 ✅ CLOSED [S122]** — **and the fix is in the SERVICE, not the route, because the swallowed cause was the actual defect.** `getSignedUrl` (`files.ts`) did `if (error) return null`, destroying the only object that knew why one layer BELOW the route. Changing the route's status code alone would have been guessing at information that no longer existed. So `signedUrlFor()` now returns `{ url, error }` and keeps Storage's `status` / `statusCode` / `message`; the route logs all three with the route name and the failing check (`project_files_select_non_client`), and answers **403** when Storage returns a 4xx, **500** only for a genuine failure. **`getSignedUrl()` survives as a null-returning wrapper on purpose** — `resolveUrls()` in `photos.ts` probes for a `.markup.jpg` derivative that is legitimately absent most of the time and turns `null` into `derivativeMissing`; making that path throw would turn a normal answer into an exceptional one. **No auth check was added to the route**, per M6M §4.11.6 and this entry's own instruction — RLS remains the only gate. **Storage deliberately conflates "denied" with "absent"** (anti-enumeration), so the client copy names neither; CLAUDE.md's "never name an unverified cause" and "never fall through to a not-found path" together make 403-with-generic-copy the honest answer, and the LOG carries what actually happened. `open-file.tsx` (M6M D-53's mobile file-open path) now distinguishes **"No access"** from **"Could not open"**, which its comment had explicitly deferred to this item — it reads the server's status and adds no role logic of its own. Gate: `test/signed-url-error-contract.test.ts` **9/9** (service keeps the cause; 403 vs 500; the log's contents; 400 before any storage call), `tsc --noEmit` clean, eslint clean. **Known and left alone:** desktop `file-row-actions.tsx` still collapses any `!res.ok` into one generic alert — pre-existing, out of this item's scope, and now trivially fixable since the status is meaningful. _Original entry retained below._

- **#142 (original entry)** **`/api/files/signed-url` answers 500 where a permission failure should answer 403, and logs nothing.** `app/api/files/signed-url/route.ts` performs **no auth check of its own** — it signs whatever `path` it is given. **That is not a hole:** `getSignedUrl` (`files.ts:70`) uses the **user's** RLS-scoped server client, so `createSignedUrl` on `project-files` is bound by `project_files_select_non_client` and a caller cannot sign a path they cannot read. **The defect is the error contract.** RLS refusal surfaces as `getSignedUrl` returning `null`, and the route answers `{ error: 'Could not sign URL' }` with **status 500**. CLAUDE.md is explicit: *"Auth and permission failures return 401/403 with their own message — never fall through to a 'not found' path"* and *"every error response logs the real cause server-side with the route and the failing check"* — this route does neither, so a permission denial is indistinguishable from a storage outage in both the client response and the logs. Pre-existing; **M6M D-53 makes this mobile's file-open path** (M-16 rows become tappable), which is why it is filed now. **Not a reason to add a UI role check** — M6M §4.11.6's "RLS does the gating, not the UI" rule stands. Observed Session 108.

- **#145 — ✅ CLOSED [S123] as MITIGATED, not fixed. The MECHANISM is now demonstrated; the exclusion that made it "unknown" was WRONG.** Closed on evidence, not on the CI result — the CI result only retired the easier of the two conditions.

  **1. THE `oom_kill 0` ARGUMENT WAS INVALID, AND IT IS WHY THIS SAT UNSOLVED.** S120/S121 read `/proc/vmstat oom_kill 0` and every cgroup's `memory.events oom_kill 0` and concluded "not memory". That inference only holds if **the kernel is the only thing that can kill a renderer**. It is not. V8 and Chromium abort a renderer themselves on allocation failure, and the kernel never participates, so the counters stay at **0** in exactly the case being excluded. **The counters were right and the conclusion drawn from them was wrong.**

  **2. THE SIGNATURE, REPRODUCED ON DEMAND.** Forced with `--js-flags=--max-old-space-size=48`, on this box, against this app:

  ```
  [ERROR:v8_initializer.cc:969] V8 javascript OOM (Reached heap limit).
  page.evaluate: Target crashed
  page.goto: Page crashed          <- #145's exact error text
  isClosed: false   crash event: fired
  <process did exit: exitCode=0, signal=null>   <- the browser exits CLEANLY
  ```

  Every recorded observation falls out of this at once:
  - **`Page crashed` is reported on the NEXT navigation**, not the one that exhausted memory. That IS the "different test each time, each passing alone" signature the entry called a resource ceiling. The test named in the report is a **bystander**.
  - **`oom_kill` stays 0** (point 1).
  - **The browser exits 0** — nothing looks wrong from outside.
  - The only evidence is one stderr line, visible **only** under `DEBUG=pw:browser`.

  **3. WHY NO ARTEFACT WAS EVER RECOVERABLE — both halves, settled.** S121 asked for "a trace and an `error-context.md` from the next occurrence". Neither was ever obtainable here:
  - **No crash dump can exist on this browser.** Playwright launches `chrome-headless-shell`, whose build ships **no `chrome_crashpad_handler` binary** (the full `chromium-1234` build does have one), and Playwright passes **`--disable-breakpad`** in its own default args. Passing `--enable-crash-reporter` is **fatal at launch**: `posix_spawn … chrome_crashpad_handler: No such file or directory`, then SIGTRAP. Verified S123.
  - **No trace is ever captured locally.** `trace: 'on-first-retry'` with `retries: process.env.CI ? 2 : 0` means the local value is **retries 0**, so there is never a first retry and never a trace. The artefact prior sessions kept asking for could not be produced by the config asking for it.

  So: **nothing was written, and nobody looked in the one place that had it** (`DEBUG=pw:browser`). Both, not either.

  **4. WHAT WAS MEASURED THIS TIME AND HAD NEVER BEEN.**

  | | |
  | --- | --- |
  | fds in use / limit | **~3,900 / 524,288** — not binding |
  | pids in use / cgroup max | **396 / 9,524** — not binding |
  | Chromium processes across a long run | **6, flat** |
  | Chromium total RSS across a long run | **365–541 MB, flat — does NOT accumulate** |
  | `next-server` RSS | **grows to ~1.4 GB** — still the only thing that grows |
  | CPUs | **2** (so local `workers: undefined` already resolves to 1) |

  Contexts and pages do **not** leak. The browser side is flat. The dev server is the entire growth story, which is what makes this load-correlated.

  **5. IT STILL DID NOT REPRODUCE NATURALLY.** ~347 test executions across two long instrumented runs this session, **zero** `Page crashed`. Combined with S121's four clean long runs, that is nine long runs without a natural occurrence. **So the mechanism is demonstrated and the specific historical incidents are still not proven to be it.** That distinction is deliberate: this entry has already named a cause too confidently twice (OOM, then `/dev/shm`), and "I reproduced a matching signature" is not "I reproduced the incident".

  **6. ⚠️ DO NOT SWITCH LOCAL e2e TO `next build && next start`.** The obvious reading of #135 is that it removes the 1.4 GB dev server and therefore the cause. Two problems:
  - It would remove the **largest contributor to pressure**, not the mechanism. A renderer can still exhaust its heap on a 320 MB server; it just becomes far less likely.
  - **The production build does not currently complete on this box.** `npm run build` was killed twice with `Next.js build worker exited with code: null and signal: SIGTERM` at ~1.8 GB available, with ~2.3 GB held by VS Code extension hosts. Adopting it locally trades an intermittent, re-runnable test crash for a build that does not finish. **Local stays on `next dev`; CI owns the production path** (green on `9a2be5e`, full suite, 432 tests).

  **WHY CLOSED RATHER THAN LEFT OPEN.** The symptom is local-only, load-correlated, recovers on re-run, and cannot reach `main` — CI runs the production path at `workers: 1` with `retries: 2` and is green. The diagnostic question that kept it open ("what is it?") is answered at the mechanism level, and the reasoning error that blocked it is corrected. What remains is an **instrumentation** gap, which is a different item and is filed as **#152** rather than kept here as an open question with no action attached.

  _Original S120/S121 entry retained in full below — the way this was misdiagnosed is still the useful part, and point 1 above is now a second instance of the same lesson._

- **#145 (original entry)** ~~**The Codespace runs out of memory during a full Playwright chunk, and Chromium's renderer is OOM-killed mid-navigation.**~~ — **FIXED S120, AND THE DIAGNOSIS ABOVE WAS WRONG.** The symptom was real and is gone; the cause named for it never happened. Kept in full rather than rewritten, because the way this was misdiagnosed is the useful part.

  ### ⚠️ [S121] INVESTIGATED AGAIN — AND THE `/safety` FRAMING IS A RED HERRING

  Asked to explain the `page.goto: Page crashed` seen on a long combined run, or to establish it only
  happens under memory pressure with evidence. **Neither, honestly. Here is what is and is not proven.**

  **1. `/m/p/{id}/safety` IS NOT INVOLVED.** The item was filed against that page because A-39 does not
  run. A-39 does not run because it **skips on a DATA condition** — `test.skip(true, 'no incidents on
  this project')`, the fixture project has none — and **A-39b navigates the same route in every run and
  passes**. The route was never crashing. Anyone chasing "the /safety crash" is chasing a skip.

  **2. Nothing is being OOM-killed, and that is now checked in both places.**
  `/proc/vmstat` → `oom_kill 0`; every cgroup's `memory.events` → `oom_kill 0`. The corrected S120
  diagnosis stands: this is not the kernel reaping processes.

  **3. `/dev/shm` is still 64 MB and the fix for it is in force.** `--disable-dev-shm-usage`
  (`playwright.config.ts:83`) moves renderer shared memory to disk-backed `/tmp`, so the 64 MB ceiling
  is bypassed rather than raised.

  **4. THE REAL RESOURCE STORY, MEASURED — `next-server` grows to ~1.4 GB inside a single run.**
  Sampled every 10s across a 7.5-minute three-file run:

  ```
  t=  50s  free= 364MB  available=2848MB  next-server= 777MB
  t= 170s  free= 198MB  available=2582MB  next-server=1073MB
  t= 290s  free= 161MB  available=2246MB  next-server=1218MB
  t= 410s  free= 473MB  available=2307MB  next-server=1372MB
  ```

  Monotonic growth, and it matches the 1.4 GB S120 recorded. But **`available` never dropped below
  ~2.2 GB** — `free` is low because buff/cache holds the rest, and that is reclaimable. The box is
  under pressure and is not out of memory.

  **5. Dev servers do NOT accumulate between invocations.** Checked: no listener on :3000 and no
  orphaned `next-server` between runs — Playwright's `webServer` tears its own down. A plausible theory
  ("each invocation leaks a server, so failures appear mid-session") is therefore dead.

  **6. ⚠️ IT DID NOT REPRODUCE.** Four consecutive long combined runs, including **the exact four-file
  combination that failed twice earlier in S121** (m-shell + m-hydration + m-logs + m-sections) and a
  heavier five-file run (173 tests, 7.9 minutes). All passed. The two S121 incidents showed the
  documented signature — a different test each time, each passing alone — but the error text was not
  captured at the time and cannot be now.

  **CONCLUSION, stated at the strength the evidence supports:** the failure is **intermittent and
  load-correlated**, it is **not** an OOM kill, it is **not** `/dev/shm` (that cause is fixed), and it
  is **not** specific to any route. What it actually is remains **unproven** — dressing "I could not
  reproduce it" as "environmental" would be the same mistake the original entry made with "OOM".

  **What would settle it:** capture `error-context.md` and a trace from the next occurrence rather than
  re-running afterwards (`trace: 'on-first-retry'` only helps with `retries > 0`, which is CI-only —
  locally the artifact is gone by the time anyone looks). **#135's `next build && next start` remains
  the recommended structural fix**: it removes the 1.4 GB dev server, which is the only measured
  resource growth in the loop, whether or not it is the cause.

  **The four-process split stays**, on the evidence that long runs are where this appears — not because
  the cause is known.

  **What it actually was: `/dev/shm` is 64 MB.** That is the Docker default, and Chromium puts renderer shared memory there. When it fills, the renderer dies instantly — surfacing to Playwright as `Page crashed`, on whichever test happened to be navigating. Fixed by `--disable-dev-shm-usage` in `apps/web/playwright.config.ts`, which moves that allocation to disk-backed `/tmp`.

  **The evidence that killed the memory theory** — the kernel's own counters, which were never checked when this was filed:

  | | |
  | --- | --- |
  | `/proc/vmstat` → `oom_kill` | **0** |
  | `/sys/fs/cgroup/memory.events` → `oom_kill` | **0** (root and every child cgroup) |
  | `df /dev/shm` | **64 MB** |

  **Nothing on this box had ever been OOM-killed.** Free memory *was* genuinely low, and that is what made the wrong answer so easy to believe.

  **Result of the fix**, same 217-test group, one process, no split, same machine: **53 failures → 2**, both of which pass on re-run. Then the three previously-split groups, re-run whole: `m-shell` 54/54 in **2.3m** (was 3.7m), `m-sections` 60/60 in **2.9m** (was 5.0m), `m-photos` **40/40** in 3.1m (was 39/40, the 1 a crash). Faster as well as green — the split was costing wall-clock for nothing.

  **⚠️ The lesson worth keeping.** Every observation in the original entry below is accurate. The reasoning is what failed: low free memory was *observed*, "OOM kill" was *inferred* from it, and the inference was written down as a measurement. The splitting workaround then appeared to confirm it — smaller groups really did fail less — but only because a shorter run opens fewer pages before /dev/shm fills, not because it used less RAM. **A workaround that helps is not evidence for the theory that motivated it.** Two counters would have settled this in one command at the time.

  **The four-process split is now unnecessary** and should be retired rather than maintained: it was a shelf-life workaround for a cause that no longer exists. **#135's `next build && next start` recommendation still stands on its own merits** (CI cold-start vs `webServer.timeout`) — but it was never going to fix this, and would have "worked" for the wrong reason.

  _Original entry, preserved verbatim:_

  ~~**The Codespace runs out of memory during a full Playwright chunk, and Chromium's renderer is OOM-killed mid-navigation.**~~ Measured S120, at the end of a ~13-minute combined chunk-3 run:

  | | |
  | --- | --- |
  | Total RAM | **7,944 MB** |
  | Free at end of run | **130 MB** |
  | Swap | **NONE** |
  | CPUs | **2** |
  | `next-server` RSS after the run | **1.4 GB** |

  **The symptom is `Error: page.goto: Page crashed`, and it does not look like a memory problem.** It names whichever test happened to be navigating — S120 saw **A-25b** and then **A-12c** on two consecutive runs, and S119 saw **A-30b** on a combined m-sections+m-capture run. Three incidents, three different criteria, all photo- or navigation-heavy, none related to the change under test. A-12c carries `test.setTimeout(180_000)`, so it is **not slowness** — the renderer process dies.
  **Why it reads as a flake and is not.** Every one of those specs passes when run in a smaller group: `m-photos` alone is **40/40**, `m-sections` alone **60/60**. Only the long combined process fails, and it fails on a *different* test each time — which is the signature of a resource ceiling rather than a defect, and also the reason a re-run "fixes" it and teaches nothing.
  **The dev server is the largest single consumer**: `next dev` compiles routes on demand and accumulates them, reaching 1.4 GB across a full chunk. Add a Chromium with several heavy pages plus the VS Code extension hosts and the box has nothing left.
  **⚠️ ACCEPTED WORKAROUND [S120, Josh] — SPLIT THE CHUNK, and it has a shelf life.** The e2e gate now runs **four Playwright processes, not three**: chunks 1 and 2 as before, then chunk 3 as *two* processes — `m-photos` on its own and everything else together — with a **dev-server restart between**, which returns `next-server` to ~200 MB. This buys headroom; it does not raise the ceiling. **The suite keeps growing**, so the split will need re-splitting, and each re-split is a silent tax on anyone who does not know why the boundary is where it is. That is the cost of routing around the cause instead of removing it.
  **The fix that REMOVES the cause is [#135](TECH_DEBT.md)'s standing recommendation**: run e2e against `next build && next start` instead of `next dev`. A production server carries no on-demand compile cache, so the 1.4 GB never accumulates — and #135 wants the change anyway, for its own reason (CI cold-start exceeding `webServer.timeout`). **One change closes both.** The alternative, a larger Codespace, treats the symptom and costs money forever. Observed Session 120.

### Track for Module 5/6

- **#20** Add `insurance_carrier` and `insurance_policy_number` to subcontractors — for Insurance Expiration Alert workflow
- **#21** `tm_rate` column on `profiles` (Module 6 prep) — decided Session 12, needs migration
- **#91** 6A timeclock notifications — 6A emits "still-clocked-in" events at 4:00 PM and 5:00 PM (overtime) for any open clock session; clocking out cancels them. Actual push-notification delivery is deferred to the separate cross-cutting Notifications build. 6A only emits named events, never delivers. Decided Session 83 during 6A UI interview.
- **#92** `companies.week_starts_on` re-bucketing — DOCUMENTED-ACCEPTED BEHAVIOR, not a fix item (Session 86, Company Settings pass, migration 20260721050000). Week windows, derived OT, and the Labor Cost (wk) KPI are all computed at read time from the current setting, so changing week-start re-groups ALL historical sessions into the new weeks and re-derives OT/labor cost for past periods; already-approved sessions keep their per-session `approved` status but their week rollups shift, and a previously whole-approved week can display as partial under the new boundaries. Decision (Josh, S86): accepted as a one-time consequence of a rarely-changed setting — NO effective-dating (deliberately unlike pay rates #snapshot rule). The settings UI carries a caption stating this. If a customer ever needs a clean payroll cutover, the manual procedure is: approve/export everything through the last old-boundary week, then flip the setting.
- **#93** 6D PM-can-reopen-closed-PO edge — DOCUMENTED-ACCEPTED (S87, 6D UI Phase 2 Q8). The live `purchase_orders_update_authorized` `with_check` blocks a PM from writing `status = 'closed'` (Owner/Admin only) but does not block a PM from flipping a closed PO back to `open` via direct API — the new row's status passes the check. The UI offers no reopen control; auto-reopen legitimately exists for auto-closed POs (`recompute_po_status` sentinel match). Tighten the policy only if PM reopens are ever observed in the wild.
- **#129 ✅ CLOSED [S122]** — **RULED [Josh]: the desktop editor writes the same derivative mobile does. D-31 STANDS.** The two options this entry left open were "teach desktop to export" or "reverse D-31"; D-31 is upheld, so desktop was the side that was wrong. `handleSave()` in `markup-editor.tsx` no longer calls `updateFile(fileId, { markup_data })` — it calls **`saveMarkup()`, the exact function the mobile canvas calls**, with **`drawShapes`, the exact rasteriser it draws with**. The flattener moved from `app/m/p/[projectId]/photos/[fileId]/markup/flatten-shapes.ts` to **`lib/markup/flatten-shapes.ts`** so neither surface owns the format: a desktop-only export that "does the same thing" would have been the same divergence, written in a form that looks like agreement. `page.tsx` now passes `file_path` (a signed URL cannot be turned back into a storage path, and `derivativePathFor()` needs one). **The three-state result is carried, not collapsed** — `derivative_failed` means the marks are safe in `markup_data` but every surface still shows the photo unmarked, so desktop reports that distinctly and keeps the editor dirty, which is A-23j's rule applied to the surface that never had it. **Josh's general principle was ruled alongside it and is recorded in CLAUDE.md → "PARITY: ONE FEATURE, BOTH SURFACES, SAME BEHAVIOUR": everything viewable from both desktop and mobile behaves the same way on both.** Gate: `m6m-markup` + `m6m-markup-save` **31/31** (the mobile path still passes through the moved module), `tsc --noEmit` clean, eslint clean. **Not gated live** — the desktop editor has no automated coverage of its own, and this closes the write half; the first-annotation-on-desktop case now produces a derivative where it previously produced none. _Original entry retained below._

- **#129 (original entry)** **The desktop markup editor writes `markup_data` and no flattened derivative — and D-31 made the derivative the display source.** `markup-editor.tsx:244-248` saves exactly one thing: `updateFile(fileId, { markup_data: data })`. There is no canvas export, no `toBlob`, no second `files` row — verified S100 by reading the whole save path. That was fine while the overlay was the display mechanism. **M6M D-31 [S99] reversed it**: the mobile viewer renders the **derivative** and toggles back to the original by swapping files (§4.7a). So a photo annotated on desktop today has `markup_data` and **no derivative**, and will render on mobile as an **unannotated original with no indication that markup exists** — silent loss of the annotation, not an error.

  **⚠️ AMENDED [S107 audit] — there is a SECOND case, and it is worse than silent loss.** The text above describes a photo annotated *for the first time* on desktop. Now take a photo that **already has a derivative** (annotated on mobile, so `.markup.jpg` exists) and edit it on **desktop**: desktop rewrites `markup_data` and leaves the derivative untouched, so `photos.ts` keeps signing the **stale** derivative and every mobile surface shows the **old marks as current**. Nothing detects it — there is no hash, no timestamp comparison, no version counter on the pair. So D-31 turned this from a cosmetic gap into a **wrong-image-on-screen defect**: not a missing annotation the user might notice, but a confidently-rendered *incorrect* one. On a punch item or an incident photo, the marks are the instruction.
  **Minimum viable fix (audit's recommendation, NOT implemented):** block or warn on a desktop save of any photo that already has a derivative. See also **#139**, found while widening M-9 in the same session.

- **#139 ✅ CLOSED [S122]** — one clause, `.eq('project_id', projectId)`, in `getPhoto()` (`lib/services/photos.ts`). **The pause this entry asked for was taken, and it cleared:** the concern was that scoping 404s a URL that used to resolve, so before applying it the call graph was checked — the ONLY caller is M-10's `photos/[fileId]/markup/page.tsx`, and the only link into it is `viewer.tsx`'s `` `/m/p/${projectId}/photos/${photo.id}/markup` ``, built from the gallery of the project you are already in. **Nothing links cross-project on purpose**, so the new 404 is reachable only by hand-typing a mismatched pair, which is exactly the case being closed. `getPhoto` now scopes identically to its sibling `getReceiptFile()`, which already carried the clause — the two photo resolvers no longer disagree. The stale "KNOWN, NOT FIXED HERE" comment in the query is replaced by the reasoning above rather than deleted. Gate: `m6m-markup` + `m6m-markup-save` **31/31**, `tsc --noEmit` clean, eslint clean. _Original entry retained below._

- **#139 (original entry)** **`getPhoto()` does not verify the file belongs to the `projectId` in the route.** `apps/web/lib/services/photos.ts` — `getPhoto(fileId, projectId)` selects on `id`, `category` and `is_deleted`, and uses `projectId` **only** to fetch the punch-photo id set for the source badge. So `/m/p/{projectA}/photos/{fileFromProjectB}/markup` resolves file B under project A's URL and its markup is written there. **Bounded, which is why it is filed rather than fixed:** RLS still applies (`files_select_*` scopes to `get_my_company_id()` and `can_view_project()`), so this reaches only files inside the caller's own company that they are already entitled to see — it is a *wrong-context* bug, not a disclosure. Pre-existing; found [S107] while adding the `category = 'photos'` guard to the same query, and deliberately not widened into that change. Fix is one clause (`.eq('project_id', projectId)`); the reason to pause is that it makes a previously-working URL 404, so it wants a moment's thought about whether anything links cross-project on purpose. That is strictly smaller than teaching the desktop editor to export a flattened image, and it closes the wrong-image case — the first-annotation case degrades to today's silent-loss behaviour until the export lands. Whichever is chosen, the pair must stop being able to disagree without anything noticing.

  D-31's own justification says the case is gone — _"no existing photos need preserving"_ — which is true of the **historical** backlog it was weighing. It is **not** true going forward: every desktop annotation made from now until this is fixed reproduces the gap. **Out of scope for the M6M build by A-28** (`app/dashboard/**` is not the mobile slices' to change), which is why this is its own item rather than a note inside the mobile spec. Fix shape: have the desktop save produce the same derivative the mobile path will, so both surfaces read one contract — or rule that the overlay is rendered on mobile too, which reopens D-21 vs D-31 and should be a decision, not a build detail. Cross-ref **#100** (markup invisible outside the editor — the same subject before D-31 changed the contract) and **#53** (flattened export for email/PDF, the leaving-the-app half). Observed Session 100.

- **#134 ✅ CLOSED [S122]** — **RULED [Josh]: yes, and it records WHO.** `20260902000000_deliveries_check_in_state.sql` adds `checked_in_at` (NULL = in progress) and `checked_in_by`, and `submit_delivery_check_in()` becomes a state transition — it stamps both only after every existing gate passes, so a refused submit leaves the row in progress. **`received_by` was checked first and is a DIFFERENT FACT, not a duplicate:** it is the domain receiver, set at row creation, NOT NULL, and is the edit-permission axis for five consumers (`isAdminRole || myMember.id === received_by`); the finaliser can be a different person (crew receives, foreman submits) and does not exist at all while a check-in is in progress. `updated_by` does not cover it either — it records the last toucher. A pair CHECK keeps the two columns from being written half-way, and a partial index on `checked_in_at IS NULL` serves the one query the state exists for. **Existing rows backfill to NULL — accepted by ruling**; inventing a timestamp would fabricate an audit fact. **Nine live consumers enumerated in the migration header before migrating; none break** — all are additive-safe and no application change ships with it. _Original entry retained below._

- **#134 (original entry)** **OPEN DESIGN QUESTION, not a defect — should `deliveries` gain a `checked_in_at` column?** M6M §7c's damage-photo rule is enforced by `submit_delivery_check_in(uuid)` (migration `20260824000000`), a `SECURITY DEFINER` RPC that refuses when any line has `qty_damaged > 0` and no linked live `files` row. **It is a gate, not a state transition**, and that is forced rather than chosen: `deliveries` has no status column and no finalisation timestamp — the columns are `project_id, purchase_order_id, vendor_name, delivery_date, has_exceptions, notes, received_by, pdf_file_id` plus the standard set (verified S100). So "finalise the check-in", which is what §7c calls for, has nothing to flip; the RPC authorises, validates, and recomputes `has_exceptions` on success.

  **The consequence:** a half-entered check-in is indistinguishable from a finished one. Both are a `deliveries` row with items. Nothing records that a human said "done", so nothing can list abandoned check-ins, and the notification the 7d screen fires on success has no persisted counterpart. Adding `checked_in_at timestamptz` (NULL = in progress) would make the gate stateful and give M-22 a real completion marker — but it lands on a **Module 6D table with existing desktop consumers**, every existing row would backfill to NULL and read as "never checked in", and 6D's own screens would need to decide whether they care. Deliberately not decided inside the M6M migration, which was scoped to "the four capture constraints". Raise with Josh before 7d / M-22 is built. Observed Session 100.

- **#95** — M6B cast escape-hatch cleanup
  Post-S88 type regen, ~60 `as unknown as` casts remain in apps/web (services + delivery/safety/daily-log routes). Some may be redundant now that M6B schema is typed, but type-check is green so none are load-bearing failures. No spec names which to remove. Approach when picked up: remove one at a time, re-run `npx turbo run type-check`, keep only removals that stay green. Do NOT bulk-remove — most are structural join-shape casts that will break.

### Module 3 Follow-Ups

- **#24** `uploadFile` still does auth + profile lookup for storage path — unavoidable until `company_id` is in JWT custom claims. Defer.
- **#25** Verify Postgres column defaults fire correctly on first real `files` INSERT — confirmed via `information_schema`, but no INSERT has run against `files` yet
- **#50** Delete `apps/web/app/dashboard/markup-test/page.tsx` once Module 3G editor is complete — throwaway visual test for MarkupViewer
- **#51** Add `.claude/` to `.gitignore` — Claude Code local config showing up as untracked

### Lower Priority / Existing

- **#27** Invite emails not automated — Owner copies invite link manually. Resend integration deferred.
- **#29** No shared UI components — `apps/web/components/` and `packages/ui/` empty. shadcn/ui not yet installed.
- **#130 — ✅ CLOSED [S123] as NOT A DEFECT. The file stays; its fate is a separate decision.** A stale wordmark inside an unimported prototype is not a bug — nothing builds it, nothing imports it, and it ships to nobody. The entry existed so a rebrand audit that greps `apps/` and reports "clean" is not mistaken for having covered `docs/`. That purpose is served by the record, not by editing the file.

  **Explicitly NOT deleted, and not one line changed.** The original entry offered "fix is one line, or delete the file if the handoff is spent". Neither was taken, deliberately.

  **What the S123 deletion survey found, so the next cleanup pass does not rediscover it:**

  - **The file is byte-identical in two places** — `docs/handoffs/module-6-field-operations/FFNav.dc.html` and `docs/design/module-6/FFNav.dc.html` (`cmp` clean, `md5 20c7b38b`). **So the stale wordmark exists in BOTH**, and the one-line fix was always a two-line fix. A grep that finds one copy and stops will report a fix that is half-done.
  - **It is not just that file.** `docs/design/module-6/` is a byte-identical copy of the ENTIRE `docs/handoffs/module-6-field-operations/` directory — all four files, 2,425 lines, 140 K.
  - **Both paths are cited in live docs**, which is why this is not a free delete: `docs/specs/6B-1-spec.md:13` names `docs/design/module-6/` as the *"Design authority (read view)"*, and this entry itself named the handoffs path. Removing either breaks a live reference, and because they are identical, removing one does **not** resolve the wordmark in the other.
  - **Wider duplication in the same family:** `support.js` exists as **5 byte-identical copies** (1,841 lines each) and `ios-frame.jsx` as **3** (352 each) across `docs/handoffs/*` and `docs/design/module-6/`. Deduplicating to one copy of each is ~8,068 redundant lines / ~312 K — the single largest lean-repo win found, and independent of this entry.

  **⚠️ If the file is ever deleted, delete both copies or neither.** Fixing or removing one and leaving its twin is the failure mode this closure exists to prevent. **Deletion is a cleanup decision for Josh, tracked here as a candidate — not owed work.** Observed S100, closed S123.

- **#130 (original entry)** `docs/handoffs/module-6-field-operations/FFNav.dc.html:12` hardcodes the pre-rebrand wordmark as inline markup — `Frame<span style="color:#f59e0b">Focus</span>` — so it cannot be caught by a plain string grep for the old product name in the way a normal literal would. **Prototype only, and genuinely low priority:** it is a design handoff artifact, is not built, is not imported, ships to nobody, and the handoff's own README already says the `.dc.html` files are design references rather than production code. Recorded so a rebrand audit that greps `apps/` and reports "clean" is not taken as covering `docs/`. Fix is one line, or delete the file if the handoff is spent. Observed Session 100.
- **#118** **The offline seam in `clockIn` is DESIGNED BUT UNWIRED — an asset for whoever builds the
  queue, and a trap for anyone who assumes it is live.** [Discovered S97, 2026-08-03, mobile
  readiness audit.] `apps/web/lib/services/time-tracking-client.ts:71-77` already accepts
  `clock_in?: string` (*"device timestamp; defaults to now()"*) and `session_client_id?` /
  `segment_client_id?` (*"client-generated UUID (offline-ready)"* — its own comment). The client id
  is written to the row's primary key, which would make a replayed write idempotent by PK collision.
  **Nothing calls any of the three**, and **no `client_id`, device or idempotency column exists
  anywhere in the live schema** (checked against `information_schema` at S97). GPS capture
  (`components/time/clock-modal.tsx:81-85`) is a device sensor and works with no signal, so a queued
  clock-in could carry a real fix and a real time.
  **Why it matters:** a lost clock event is lost payroll, and re-clocking after signal returns
  records the LATER time — the device timestamp exists precisely to prevent that. **Why it is a
  trap:** the comment says "offline-ready", which reads as shipped. It is not. Whoever builds the
  offline queue should treat this as a head start on ONE action and confirm that **no other field
  action has an equivalent** — clock in/out, photo upload, daily log, receipt capture and delivery
  check-in all currently fail with an on-screen error and no queue, no retry, no persistence (no
  IndexedDB, no `localStorage` of pending writes, no `navigator.onLine` anywhere in the tree).
  Cross-ref #101 (the shell) and #30 (the PWA ruling that makes offline a web problem rather than an
  Expo SQLite one).

- **#30** Mobile app is a placeholder. Phase 2 work. — **SUPERSEDED IN DIRECTION [S97, 2026-08-03].**
  Josh ruled the mobile experience is a **PWA — the existing Next.js web app installed to the home
  screen — NOT React Native** (reasons: no app store at this time; and iOS requires a home-screen
  install for Web Push regardless, so the PWA is also the precondition for notifications on iPhone).
  `apps/mobile/` is therefore **PARKED, not deleted** — see `apps/mobile/README.md`, which records
  what deletion would involve (workspace glob, the devcontainer's port 8081, four remaining Expo
  references in CLAUDE.md, the "web + mobile" wording on `packages/shared`). **Deletion is Josh's
  call.** This item stays OPEN until he makes it; it is no longer "Phase 2 work" on the RN app,
  because there is no RN app to build. Ruling recorded in CLAUDE.md → Technology Stack.
- **#31** No tests. Test infrastructure not set up.
- **#32** `profiles` table uses `user_id` column — all queries use `.eq('user_id', user.id)`
- **#33** Promote-to-admin UI not built
- **#34** Per-seat overage billing not implemented
- **#36** Legacy `subscription_tier`/`subscription_status` columns on companies table (unused but redundant)
- **#37** TypeScript `any` workaround in webhook
- **#38** Bishop Contracting may need manual subscription row — predates Migration 007
- **#39** Role-check patterns repeated across page.tsx files — would benefit from `isOwnerOrAdmin()` / `canManageProjects()` helpers
- **#40** Inline style objects duplicated across forms — cleanup with shadcn/ui migration
- **#47** Customize Supabase auth emails (recovery, invite, signup confirmation) to use FrameFocus branding and copy. Currently using Supabase defaults. Set in Supabase Dashboard → Authentication → Email Templates.
- **#49** Inline styles across Module 3 pages (3F, 3G, 3I, 3J: page.tsx, upload-form.tsx, file-row.tsx, file-row-actions.tsx, favorite-toggle.tsx, markup-editor.tsx, markup/page.tsx, trash/page.tsx, trash-row.tsx) — same pattern as tech debt #40. Clean up with shadcn/ui migration in one focused pass.
- **#52** Polished markup text editor — replace `window.prompt()` in `markup-editor.tsx` with inline text input: positioned at click location, multi-line, per-shape font size control, click-to-edit existing text in select mode. Functional but unpolished in v1.
- **#53** Flattened markup image export — currently markup is JSON-only (rendered as SVG overlay). Need a flattened PNG/JPEG export when markup needs to leave the app: email attachments (Module 6 daily logs), client downloads, printed daily-log PDFs. Render via canvas (client-side) or Puppeteer (server-side). Decide when first email-sending feature ships.
- **#54** `getFiles()` returns all files and the trash page filters client-side to `is_deleted = true`. For small projects this is fine; for projects with thousands of files, add a dedicated `getTrash()` server function (or an `only_deleted: true` flag) that filters in the DB. Discovered Session 28.
- **#55** Image-aware file browsing for the files page. Two coupled pieces: (a) **thumbnail grid view** for images (likely when category = Photos, or for any image mixed in the table) — investigate Supabase image transformations vs. upload-time thumbnail generation; (b) **in-app fullscreen viewer** opened by clicking a thumbnail — same window, left/right arrow navigation across the project's images (keyboard + on-screen buttons), Open Markup button, Download button, close returns to grid. Non-image files keep current behavior (table row, Download opens new tab). Estimated 400-600 lines, dedicated session.
- **#56** SQL/TS tag list drift risk. `seed_default_tags()` in migration 021 and `DEFAULT_TAGS` in `packages/shared/constants/default-tags.ts` must be kept in sync manually. Add automated diff check before public launch. Both files have header warnings. Discovered Session 29.
- **#57** Empty migration file `20260415182317_add_tag_options_table.sql` — kept in repo intentionally because it was applied to remote (accidental double-create during Session 29). Won't fix; documented for clarity.
- **#58** `npm audit` reports 4 high-severity vulnerabilities in the web app's dependency tree (surfaced during `openai` install in Session 30, but pre-existing). Run `npm audit` to inspect, address before public launch. Pre-launch.-
- **#60** AI photo auto-tagging add-on pricing structure undecided. Placeholder boolean `companies.ai_tagging_enabled` exists (default false). Needs Stripe product/price wiring + per-image quota or MB limit before paid launch. Decide pricing model (flat monthly / per-image / per-MB), then build billing path. Real cost data from Session 31: ~$0.00382 per call (GPT-4o). Anchor pricing against this.
- **#61** Platform admin dashboard not built. Foundation exists: `platform_admins` table (Migration 001) and `is_platform_admin()` helper. Build when 2nd paying customer signs up. Estimated 2–3 sessions for useful set of views (companies list, AI cost per company, subscription/MRR overview, support tools). Defer.
- **#62** AI tag suggestion review (post-launch). When GPT-4o suggests a tag NOT in a company's active list, the API route discards it. Capture these discards instead — they are signals that the company's tag list has gaps. Add an `ai_tag_suggestions` table (company_id, suggested_tag, occurrence_count, status: pending/added/dismissed, first_seen_at, last_seen_at) and a platform-admin view to review aggregated suggestions across all companies. Strong product signal for default tag list improvements. Address after public launch — depends on platform admin (#61) being built first.
- **#64** GPT-4o pricing constants (`INPUT_COST_PER_M`, `OUTPUT_COST_PER_M`) are hard-coded in `apps/web/lib/services/ai-tagging.ts`. Values correct as of Session 31 per OpenAI published pricing. Needs re-verification before public launch and on any OpenAI price change. Consider moving to env vars or a pricing config file before multiple AI features ship (Module 4, 6, 9, 10, 11 will all call OpenAI). Tracked so this isn't forgotten at launch.
- **#67** `packages/shared/utils/index.ts` contains four functions (`hasPermission`, `formatName`, `generateSlug`, `formatCurrency`) with zero callers anywhere in the codebase. Discovered Session 35 during #12 cleanup. Either delete the file (and remove `export * from './utils'` from `packages/shared/index.ts`) or wire the functions into existing call sites where they would replace inline duplicates. Address during pre-beta cleanup.
- **#68** `getSupabaseAdmin()` was duplicated inline in the Stripe webhook before Session 37. Now extracted to `apps/web/lib/supabase-admin.ts`. CLAUDE.md mentions the lazy-init pattern but does not point to the file path. Add a Service Layer Pattern note in CLAUDE.md pointing to `@/lib/supabase-admin` so future AI features (Module 4 estimating, Module 9 summaries, Module 10 NL queries, Module 11 marketing) don't re-create their own copies. Pre-Module 4.
- **#69** `softDeleteTeamMember` uses `ban_duration: '876000h'` (~100 years) as a stand-in for permanent ban. Supabase has no true permanent-ban API. Verify this duration is honored on auth attempts during Session 38 smoke test. If it's silently ignored or capped, switch to deleting the auth user (with the trade-off documented in Session 37 — restore would require re-invite). Verify and decide before public launch.
- **#70** Sign-in page "Forgot password" flow is broken. Email sends successfully, but the link in the email doesn't allow the user to set a new password. Discovered Session 39 during team member smoke testing (reset triggered from sign-in page, not the new Admin reset button — that path works). Unrelated to Session 39 work; pre-existing. Investigate the `/reset-password` page handler and the email link's token exchange. Likely related to the redirect URL or the Supabase `onAuthStateChange` handling. Pre-beta.
- **#71** Payment method handover not enforced after ownership transfer. Old Owner's card stays attached to the Stripe Customer until new Owner updates it via Customer Portal — could result in old Owner being charged at next billing cycle. Pre-beta: add a banner on the new Owner's billing page ("Update payment method to complete transfer") and consider a force-add-card-before-transfer flow as v2. Discovered Session 40 during #66 build.
- **#72** No email notification to new Owner confirming ownership transfer. Pre-beta polish. Discovered Session 40.
- **#73** No append-only audit log for ownership transfer events. Add `ownership_transfers` table (company_id, from_user_id, to_user_id, performed_at) following the append-only convention. Pre-beta — needed for any company doing real account handoffs. Discovered Session 40.
- **#74** Stripe Customer email drift on Owner profile edit. If the Owner edits their own profile email at any point, the Stripe Customer's email is not updated to match. Pre-existing issue, surfaced during #66 build. Pre-beta. Discovered Session 40.
- **#75** Reusing an email alias for invitations fails silently. When a user is soft-deleted, the underlying `auth.users` row remains (correct for audit), but re-inviting the same email collides with the lingering auth user. Currently the invite flow does not surface an error to the user — the new invite has no visible effect. Either detect collision and surface a clear error ("This email was previously used; choose a different alias"), or design a path to re-invite a soft-deleted email. Discovered Session 40 during #66 testing. Pre-beta.
- **#76** Validation schema naming inconsistency. companySettingsSchema uses camelCase keys (addressLine1) and requires a manual remap somewhere in the company write path. New contactAddressSchema uses snake_case so the parsed object flows straight into the service layer with no remap. Resolves when companies writes get migrated to the standard pattern (related to the existing companies pre-trigger holdover item — but a separate code path).
- **#77** Optional-address vs empty-string-vs-NULL. label and address_line2 use .optional() in Zod, which accepts both undefined and "". An empty form field will insert "" into the DB rather than NULL. Consistent with existing schemas, not blocking, flagged for awareness if data quality matters later.
- **#78** 4B `set_cost_catalog_updated_by()` trigger function omits SECURITY DEFINER, deviating from the CLAUDE.md per-table updated_by template. Functionally harmless (the trigger passed 4B acceptance tests) but a pattern deviation. Fix: add SECURITY DEFINER to match the template. Found during 4B/4C build wrap.
- **#87** MCP `SUPABASE_ACCESS_TOKEN` (sbp\_ personal token) lives only in the current shell env — vanishes on Codespace rebuild, breaking the Supabase MCP server every fresh session. Make it persistent (Codespaces secret or committed-safe mechanism). Discovered Session 77.
- **#123** `ai-tagging.ts:105` still names FrameFocus in the GPT-4o system prompt (_"You are a construction-photo tagger for FrameFocus, a contractor management platform"_) — the last product-name string left in `apps/web` outside test assertions, the `live-session.ts` test password, and `.claude/` path rules. **DEFERRED pending an eval, not an oversight.** It is prompt text, so editing it changes the token sequence the model conditions on, and GPT-4o is non-deterministic even at low temperature — which is precisely why the AI tests assert structure rather than content (CLAUDE.md → Testing AI features). No test in the repo can confirm the change is behaviorally neutral. Risk is low: the semantic work is done by "a contractor management platform" plus the grouped allowed-tag list, and output is clamped by the validate-against-allowed-set rule. The benefit is also nil — no user ever sees the string. Close it by changing the literal to `${brand.name}` and re-tagging ~20 photos with known-good expected tags, comparing before and after. Observed Session 99.
- **#124** No real `favicon.ico`. S99 wired explicit icon links in `app/layout.tsx` — `/app-icon.svg` first, `/favicon-ez-48.png` as fallback — which covers current browsers, but bare `/favicon.ico` requests still 404, and that path is still hit by feed readers, link unfurlers and older crawlers that ignore `<link>` tags. Next has a file convention for `app/favicon.ico` specifically that would handle it automatically. Generate a multi-resolution `.ico` (16/32/48) from `app-icon.svg` — needs `librsvg2-bin` and `ghostscript`, neither of which survives a Codespace rebuild. Separately, `favicon-ez-48.png` is a downscale of a detailed tile and may read muddy at 16px in a browser tab; a purpose-drawn 16px mark would be sharper, but that is an art decision rather than a code one. Cosmetic, not blocking. Observed Session 99.
- **#88** rebuild-test still uses legacy JWT anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY` = eyJ... format). Migrate to `sb_publishable_` key + update `.env.local`, then click "Disable JWT-based API keys" to kill the leaked legacy service*role key (rotated to sb_secret* in S77, but legacy pair still enabled because anon half is in use). Rebuild-test only; production unaffected. Discovered Session 77.
  ### Track for Module 7

#### #81 — Dormant subcontractor invite path (parked, not dead)

**Status:** Open — reactivate with the subcontractor portal / sub-invite surface
(Module 6+, behind the Pre-M9 external-surface gate).

**Origin:** Module 5 review. Removed `subcontractor` as a _company role value_
(decision B): subs are architecturally outside the role system — identity lives on
`company_members.member_type='subcontractor'`, and the future sub portal will be its
own limited-access mechanism, not a CompanyRole. B intentionally KEPT the partial
sub-invite scaffolding (rather than full removal, "A") to preserve the started
account mechanism to build on later.

**Parked — present, coherent, currently unreachable** (migration
`20260704210000_company_members_foundation.sql`):

- `invitations.member_id` column + FK → `company_members(id)` (§5)
- `handle_new_user()` linking branch: `IF v_invitation.member_id IS NOT NULL THEN
UPDATE company_members SET profile_id = v_profile_id …` (§8)
- `get_invitation_for_signup()` `member_id` return column (§8)
- `create_member_for_new_profile()` §7a skip — the `subcontractor` arm of
  `IF NEW.role IN ('client','subcontractor')`

**Why unreachable:** `member_id` is populated only by an invite with
`role='subcontractor'`, which `invitations_role_check` no longer permits. The
linking branch therefore never fires today. Dormant, NOT dead — reactivates cleanly
when a sub-invite path/role returns. The §7a `subcontractor` skip must stay even
while dormant: without it, a future sub profile would get a crew member row (from the
trigger) AND its linked sub member row — a double member.

**NOT debt — live, correct M2 plumbing, do not touch:**
`member_type='subcontractor'`, `subcontractors_create_member` trigger, the sub
backfill, and `sub_type` on the subcontractors table.

**On reactivation:** re-add `subcontractor` to `invitations_role_check`; decide
whether it re-enters `profiles_role_check` + app role machinery or stays a pure
non-role portal identity; then build the sub-facing surface that issues these invites.

---

**#82** Punch-complete gate has no DB-level backstop. `checkPunchGate` and `updateProject` (`apps/web/lib/services/projects-client.ts`) were hardened in Session 63 (commit `59a696f`): the gate now fails closed on query error or null count, and `updateProject` rejects `status` writes. The invariant is still enforced only in the service layer — CLAUDE.md documents this as "service-layer only by design." Josh chose Option 3 (full robustness) in Session 62; the DB trigger is the remaining piece, **deferred to pre-launch**. Open design question when built: whether the trigger enforces the punch gate alone, or the whole `allowedStatusTransitions` state machine. The latter forces a decision on the currently-unresolved `complete` → reversal path (no legal transition out of `complete` except `archived`, flagged twice as a problem). Building the trigger reverses a documented CLAUDE.md decision — treat as a spec change, migration required.

- **#146** **Punch VERIFY's rules live in TypeScript, and RLS accepts a direct UPDATE that breaks them — ACCEPTED AS SERVICE-LAYER, NO TRIGGER OWED. RULED [Josh, S122].** Re-filed from #141's residue, which is otherwise closed.

  **What the code actually enforces.** `punch-client.ts:182-211` holds four rules for moving an item to `status='verified'`: the **Foreman+ floor** (crew excluded), the **`requires_verification`** check, the **`status='complete'`** precondition, and the **separate-eyes** rule (the verifier may not be the completer). All four are TypeScript. RLS's `punch_list_items_update_authenticated` is a **row**-level predicate and accepts a direct UPDATE setting `status='verified'` regardless of any of them.

  **Why this is not a hole in the sense #141 was.** #141's defect was a subcontractor reading and writing rows on a project they had no business seeing — a row-level question, which is what a row-level policy expresses, so it was fixed with a policy. This is a **column-level state-machine** question: "may THIS role move THIS column from THIS value to THAT one, given who set a different column." **RLS cannot express that without a trigger** — `WITH CHECK` sees the proposed row but not the prior one, so the `complete → verified` transition and the separate-eyes comparison are both out of reach.

  **The ruling: the service layer is accepted here, and no trigger is owed.** Reasons, so this is not re-opened as an oversight: (a) exploiting it requires a **hand-crafted PostgREST call** — no UI path reaches it, and the caller must already be an authenticated member of the company with write access to that project, so the population able to do it is the population already trusted with the record; (b) the consequence is a **wrongly-verified punch item**, which is recoverable and visible in the row's own audit columns, not a disclosure and not a financial write; (c) a trigger here would have to encode the whole verify state machine in plpgsql and **keep it in step with `punch-client.ts` forever**, and two implementations of one state machine is the drift this register is full of.

  **This matches **#82** exactly** — the punch-complete project gate, also service-layer-only, also ruled deliberate, also documented as such in CLAUDE.md rather than left implicit. Treat the two together: **if a trigger is ever built for one, build it for both**, because they are the same decision about the same table family and splitting them is how one silently becomes the exception.

  **What would reopen this:** a UI or API path that reaches the transition without going through `punch-client.ts`, or verify acquiring a financial or client-facing consequence. Pre-existing and desktop-wide; observed S108, ruled S122.

- **#147** **A contact can hold only ONE address in the product. The schema, the service layer AND one consumer already support many — this is a UI GAP, not a schema gap.** Raised by Josh S123; the distinction is the whole point of the entry, because the two are very different pieces of work.

  **The schema already does N, and was designed to.** `contact_addresses` (Migration 028) is its own table keyed on `contact_id`, carrying `label`, `is_primary` and the standard column set. **There is no unique constraint on `contact_id`.** The only unique index is `idx_contact_addresses_one_primary` — `UNIQUE (contact_id) WHERE is_primary = true AND is_deleted = false` — which is **partial**: it permits unlimited addresses per contact and at most one flagged primary. A `label` column and a one-primary index are meaningless for a 1:1 table, so the intent was multi-address from the start.

  **The service layer already does N.** `listAddressesForContact(contactId)` (`contact-addresses-client.ts:91`) reads **every** live address for a contact, ordered primary-first; `createAddress()` (`:24`) accepts an arbitrary `label` and an explicit `is_primary`. Both ship today.

  **And a consumer already uses them.** `app/dashboard/estimates/contact-address-picker.tsx` is a 4D address picker that lists every address for the selected contact. **The estimate flow can already choose among many — there is simply never more than one to choose from.**

  **The gap is exactly one form.** `app/dashboard/contacts/contact-form.tsx` only ever writes the primary: `updatePrimaryAddress()` on edit (`:103`), `createAddress({…})` on create (`:119`), with no control that adds a second. Nothing in the product ever writes a non-primary row. Live data agrees: **3 live address rows, 0 contacts with more than one, 0 non-primary rows.**

  **The floor any new surface inherits, and the half of it that is easy to get wrong.** `20260829000000_contact_addresses_role_floor.sql` floors **writes** to `owner, admin, project_manager` (INSERT/UPDATE/DELETE). **SELECT is NOT floored** — it is `company_id = get_my_company_id()` for every role, crew and subcontractors included. So a multi-address surface must be readable by everyone and writable by Owner/Admin/PM only; a blanket role gate on the screen would over-reach.

  **What breaks if built naively.** The one-primary partial index is a real invariant: promoting a second address to primary must demote the first **in the same transaction**, or the write fails with a unique violation. `updatePrimaryAddress()` does not do this today because it has never had to. Also on the path: `getPrimaryAddress()` (`contact-addresses.ts:17`) is a single-row read used by `/dashboard/contacts/[id]/edit` and `/m/contacts/[contactId]`, and `lib/proposal/proposal-data.ts:127` reads the table directly for the proposal document — each needs a "which address" answer or an explicit decision to keep showing the primary. Mobile has **no address write path at all** today (`app/m/contacts/[contactId]/edit/contact-edit-form.tsx` says so in its header).

  **No migration is required for the feature Josh asked for.** Observed S123.

- **#148** **Creating an estimate cannot create a contact — the contact must be added on the contacts page first, then selected. Fixing it is a SHARED COMPONENT'S change, not one screen's.** Raised by Josh S123.

  **What the flow does today.** `/dashboard/estimates/new` → `new-estimate-form.tsx:79` renders `<ContactAddressPicker>`, whose contact half is a typeahead over `listContactOptions()` (`contacts-client.ts:56`) — a plain SELECT over existing contacts. There is no create affordance anywhere in it.

  **The picker is shared by THREE consumers, and its own header says so:** `/dashboard/estimates/new` (`new-estimate-form.tsx:79`), the clone modal (`clone-modal.tsx:88`), and the estimate Details tab (`estimates/[id]/details-tab.tsx:130`). So an inline create is one component's change that all three inherit — the cheap direction, but it also means it **cannot be prototyped on the new-estimate screen alone** without forking the component, and forking it is how the three quietly diverge.

  **No permission gap, which is the good news and worth stating because the opposite would change the size of the job.** `contacts_insert_authorized` and `estimates_insert_manager` are the **same set** — `owner, admin, project_manager`. Anyone who can reach the new-estimate screen can already insert a contact, so an inline create cannot 403 for a user who got that far.

  **A decision is owed, not a build detail.** `contacts.contact_type` is CHECK-constrained to `lead, client, vendor, architect, inspector, building_dept, other_external`. An inline create must pick one — `'lead'` is the natural default for an estimate, but that is Josh's call, and the wrong default mis-files the contact in the contacts list where somebody has to find it later.

  **What breaks if built naively.** The picker caches its options in component state (`listContactOptions().then(setContacts)`), so a newly created contact must be pushed into that list **and** selected, or the user creates a contact and then cannot find it in the field they created it from. And the address half is filtered by contact: a brand-new contact has **no** address, so the address select must tolerate an empty list rather than blocking submit.

  **`createContact()` already exists** (`contacts-client.ts:3`) and takes a loose `Record<string, unknown>` — validation lives in `contact-form.tsx`, not in the service. So an inline create either reuses that form, **which also owns the address write**, or defines a minimal field set of its own.

  **#147 and #148 meet at `contact-form.tsx`** — one wants it to write N addresses, the other wants part of it reusable inline. Worth sequencing together rather than separately. Observed S123.

- **#149** **The e2e pinned fixtures are hand-curated on rebuild-test and NOT reproducible from any script — this is the constraint that blocked every good fix for the sharding hazard (#150), and it is a standing liability independent of CI.** Raised S134 (2026-08-11), while reverting the S133 sharding.

  **What is not scripted.** `scripts/seed-test-identities.mjs` seeds identities, the second company, invoices and a set of `project_assignments` idempotently — but it does **not** create the entities the specs pin by literal UUID. For the m-sections project it does the opposite: it `select`s `eaf0e25b-d60e-49c0-89b2-5612118d94b4` and, if absent, only **warns** (`seed-test-identities.mjs:465-469`, *"`{id}` not found — e2e/m-sections.spec.ts PROJECT_ID has moved; A-33c's sub arm will be vacuous"*). The project itself, its two non-deleted change orders (`net_delta` 1410 and 21385.91), the three shared chat projects, the pinned photo rows and the roster memberships were made **by hand** and exist only on rebuild-test. `eaf0e25b` alone is referenced by literal UUID in **13 spec files**.

  **What that costs today, beyond CI.** If that project (or rebuild-test) were reset or the row deleted, 13 spec files break and **nothing recreates them** — there is no record of how they were built. The seed's own warning is the only guard, and it degrades a real assertion to a vacuous pass rather than failing.

  **What it blocks, and unblocks.** A reproducible seed is the prerequisite for a **database per shard** — the only fix for #150 that is safe *by construction* (a new test cannot reintroduce the collision because it has its own DB). It also makes **namespaced fixtures** (each shard writes its own company/project) honest rather than discipline-dependent. Both were ruled out for the #150 revert **because this seed does not exist**.

  **The option analysis, recorded so the next reader does not redo it** (full form in the S134 diagnosis; the pattern that already works is the M6M per-worker prefix fixture — `hub-fixture.ts`, created and hard-deleted per worker, genuinely isolated):

  | Option | Cost | Leaves fragile | If someone adds a test unaware |
  | ------ | ---- | -------------- | ------------------------------ |
  | **A · DB per shard** | High — needs this seed reproduced in N places (blocked here); then 4 standing Supabase projects (migrations ×4, 4 secret sets, org cost) or ephemeral branch DBs (per-run seed + auth users, minutes/shard) | Seed drift — a migration applied to 3 of 4 silently breaks one shard | **Cannot reintroduce the bug** — own DB per shard. Safe by construction. |
  | **B · Namespaced fixtures** | High-medium — same seed prerequisite ×N in one DB; every literal UUID in 13 files becomes a shard-indexed lookup; shard index must be plumbed to test code | The discipline that *every* shared-entity access routes through the resolver | **Breaks** — a hard-coded UUID (13 already exist) collides, with nothing to stop it short of a lint banning literal project UUIDs. |
  | **C · Pin colliding files to one shard** | Low to type — but `--shard=k/n` gives no file→shard control; needs hand-partitioned per-shard file lists, forfeiting Playwright's auto-balancing (125/141/128/106) | A hand-maintained grouping invariant with no machine check; balance drifts as files grow | **Breaks silently** — a new spec touching a shared entity lands in the default group and collides across shards. |
  | **D · Un-shard, raise the cap** ← **CHOSEN [Josh, S134]** | Wall-clock — serial `workers:1` is ~14.3 min local, slower on GitHub; timeout raised 20→35 | Wall-clock ceiling — every added test pushes back toward the cap; a reprieve, not a cure | **Cannot reintroduce the bug** — serial can't collide, whatever a new test does. |

  A is the eventual answer and is blocked here. **Building the reproducible seed is the real unlock.** Cross-ref #150. Raised S134.

  **[S167] The same problem has a second, smaller face, and it is now inventoried.** #149 is about
  fixtures that cannot be **rebuilt**; S167 found the adjacent class — fixtures that a human can
  **change from the product UI in two clicks**, some of which the seed cannot put back. The S165
  click-test signed `CO-QA-M9-DRAFT` by accident and the row turned out to be neither revertable
  nor deletable (`#1-s167fx`), so the seed can only rename it aside and build a new draft beside it.
  **The inventory — which fixtures are reachable, which are repairable, and the one whose corruption
  is silent — is `docs/specs/S167-fixture-inventory.md`.** It is a smaller unlock than the
  reproducible seed and does not depend on it.

- **#150** **Four CI shards shared ONE rebuild-test database, so any test asserting the ABSENCE / emptiness / exact COUNT of something another shard writes to a shared fixture was exposed. Recorded precisely so a future sharding attempt starts from this list, not a fresh audit.** Raised S134 (2026-08-11). The sharding that caused it (S133, `ce6efa8`) is reverted for now (Option D, #149); the sharding work is kept on branch `ci/shard-playwright`, not deleted, for when the seed (#149) lands.

  **The generalization, plainly.** Sharding replaced one serial DB consumer with four concurrent ones against the same DB. To that DB the four shards **are** concurrent runs — the exact hazard `#198/#199/#200` were run *in sequence* to avoid. That reasoning was not carried across the shard boundary. `desktop-payload.spec.ts:175` is the test that noticed, not the problem. (Playwright shards **by file** with `workers:1`, so a writer and asserter in the *same* file are serial and safe; the hazard is only across *different* files.)

  **The exposed set — concentrated in two subsystems, not diffuse:**
  - **Change orders on `eaf0e25b`.** `desktop-payload.spec.ts:172-175` asserts a PM sees **no** `net_delta` on that project (they authored none there); `m-co-recalc-route.spec.ts:111-136` transiently inserts a **PM-authored** (`created_by = josh+pm`) `net_delta:0` CO on the same project and deletes it in a `finally`. Cross-shard, the PM legitimately sees their own row → `["0"]` where `[]` is asserted. **This is CI #201.** Not a payload leak — the #117 read floor (`20260830000000`) holds at the query, verified by JWT impersonation (PM gets 0 foreign rows); a foreign row would redact to `net_delta:null`, never `0`. Also here: `m-details.spec.ts` `firstCoUrlAsOwner .first()` can 404 when `m-writes`/`m-co-recalc` delete their transient `E2E` COs mid-read (borderline ordering race).
  - **Chat on the three shared chat projects.** `desktop-chat-poll.spec.ts:86/91/96` assert **exact thread totals** (`toHaveCount(25/30/0)`); five other files (`desktop-chat-send`, `-mentions`, `-switcher`, `-sub`, `m-chat-sub`) both send to and **`teardownChat([project])`** the same threads. **Teardown is per-PROJECT**, so a teardown on one shard can delete another shard's in-flight chat data — the ~11-file chat suite is mutually fragile on shared threads, broader than the count assertions alone. `desktop-chat-switcher` unread badges are a borderline second case.
  - **Latent near-miss, recorded as a load-bearing invariant.** `m-destinations.spec.ts` roster partition-equality (`subs + vendors === all`, `crew + subs === all` over `COMPANY_A`) is safe **only because no spec currently inserts or deletes `subcontractors`/`contacts`/`company_members` rows** — `m-writes` only UPDATEs and restores. The day any spec starts creating/soft-deleting roster rows, these become exposed. Undocumented until now.

  **What is safe, and why it is the pattern to copy.** The ~11-file M6M mobile surface (hubs, capture, photos, logs) uses per-worker prefixed fixtures (`M6M`/`M6MC`/`M6MP`, `hub-fixture.ts`), created and torn down in isolation — **source-level isolation is already proven in this repo**. Every count/absence assertion there resolves against an isolated fixture or a unique key.

  **Correction to the S121-era read of one line:** `m-writes.spec.ts:542-544` ("exactly one punch list", `toHaveCount(2)`) is **safe, not exposed** — the only writer of punch lists to `eaf0e25b` is `m-writes` itself, and same-file means serial under shard-by-file. A reader working from the first classification would chase it.

  **Fix direction when sharding returns:** #149's reproducible seed → Option A (DB per shard). Until then, isolate these specific writers/asserters at the source (private projects/threads; per-thread not per-project chat teardown) if partial sharding is ever attempted. Cross-ref #149. Raised S134.


- **#1-trial** **THE TRIAL DELETION JOB IS BUILT, TESTED, AND DELIBERATELY NOT SCHEDULED — because nobody has confirmed we may delete these records on this timetable.** Raised S137 (2026-08-12).

  ⚠️ **Provisional branch-scoped id**, per CLAUDE.md → "Tech-debt numbering" [S136]. This is the first use of that rule. It converts to the next free number from **main's** file when `feature/trial-lifecycle` lands.

  **What is built:** `trial_lifecycle`, `deletion_jobs`, `export_jobs`, the `exports` bucket, the warning loop, the lock, and `lib/trial/deletion.ts` — a resumable, per-table, rows-then-storage job that stops and alarms rather than retrying. `apps/web/vercel.json` carries `trial-warnings` and `trial-lock` and **deliberately carries no entry for `/api/cron/trial-deletion`.**

  **Why it is not scheduled.** **TL-24 is unanswered and with professional legal review**: whether these records may be permanently deleted on a 14-day timer *at all*. Some of what the job destroys is material a construction company is legally required to retain — signed contracts, change orders, lien releases, safety incidents, and daily logs that evidence what happened on site on a given day. **Legal review can invalidate the expiry ruling entirely**, which is why the code exists and the schedule does not.

  **The one line that turns it on is Josh's, after legal returns.** Until then the absence of that line is load-bearing, and it is asserted: `s137-trial-lifecycle.live.ts` fails if `/api/cron/trial-deletion` ever appears in `vercel.json`. That assertion was **verified load-bearing** — adding the entry turned it red naming the reason, and it returned to green on revert.

  **Also open, and part of the same gate — the signed-document mechanism.** The ruling is that *signed* client contracts, change orders and subcontractor contracts survive deletion while unsigned ones do not. That cannot be expressed as a row filter: all three tables carry `project_id` REFERENCES `projects`, and the project is deleted, so a surviving signed row would hold an FK to a row that no longer exists. Two reasonable answers and nothing picks one — **(a)** detach (null the linkage, accept an orphaned document), or **(b)** archive (copy signed documents plus identifying context outside the company-scoped set, then delete the originals). **Until it is ruled, all three tables are excluded from the walk ENTIRELY**, so the signed rows survive as required and the unsigned ones survive too. Keeping more than asked is the safe direction to be wrong in while TL-24 is open, and it is asserted rather than assumed.

  **What unblocks it:** legal's answer on TL-24 and TL-23 (the customer-facing wording, which is deliberately absent from the spec and the code — a placeholder would be mistaken for approved language). Cross-ref: `docs/specs/trial-lifecycle-spec.md`, `docs/specs/trial-lifecycle-interview.md`, GATED.md → TRIAL LIFECYCLE.

  **⚠️ AMENDED [S138] — the claim "built, TESTED" above was too strong, and one more thing is now known.** What S137 tested were the job's exclusion *lists*; the job had never been run. S138 ran it and found `#3-trial`. The deletion cron is **still unscheduled** and the assertion guarding that is still green (`s137-trial-lifecycle.live.ts` 20/20, re-run after `export-worker` was added to `vercel.json`). Note for whoever reads the schedule file next: **`/api/cron/export-worker` IS scheduled and that is not a loosening of this gate** — it creates a copy of the customer's data for the customer and removes only the export artefacts it made itself. Nothing in it destroys tenant data.

  **Also now known: there must be no backfill of `trial_lifecycle`.** Ruled [Josh, S138] and written into `20260919000000_trial_unlock.sql` §3 with the reason. Two live production tenants are `trialing` with an already-past `trial_end`; a backfill would make the next lock run ban them for a year, and the `status = 'active'` skip does not protect them.

- **#3-trial** **"Deleted" leaves the company row standing, with its NAME on it — and until S138 the job reported a clean completion anyway.** Raised S138 (2026-08-12). Provisional id, same rule as #1-trial.

  **Found by RUNNING the deletion job for the first time.** S137's log said "the job exists, is tested"; what was tested were its exclusion *lists*. `runTrialDeletion()` had never been executed. `apps/web/test/s138-trial-deletion-run.live.ts` executes it against a company built to be destroyed, and the first run destroyed every tenant row, every storage object and the auth users — then **left `companies` in place and returned `completed: 1`**, because the error from the parent delete was discarded.

  **The cause is structural, not a typo.** Five tables on the `SURVIVES` list hold a plain `REFERENCES companies(id)` with no on-delete action, so the parent delete is RESTRICTed by exactly the rows the ruling says must outlive the tenant: `email_logs`, `trial_lifecycle`, `trial_warning_acknowledgements`, `deletion_jobs`, `export_jobs`. `trial_lifecycle` cannot even be nulled out of the way — `company_id` is its primary key and it is where `deleted_at` lives.

  **What S138 fixed, and what it deliberately did not.** Fixed: the job is now honest. It checks the error, records `tenant data deleted, but the companies row remains: …` on the `deletion_jobs` row, marks the job `stopped` (needs a human), and counts `companyRowsRemaining` in its outcome so this can never again be reported as a completion. **Not fixed:** whether the shell *should* survive. That is a ruling, it sits directly under TL-24, and the two answers are meaningfully different — **(a)** accept a tombstone and say so in the customer-facing wording (the company NAME survives deletion, which is a privacy statement, not an implementation detail), or **(b)** make the audit tables tolerate an absent parent (`ON DELETE SET NULL` where the column is nullable, and a different home for `trial_lifecycle.deleted_at`).

  **Do not close this by changing the FKs without answering (a) vs (b).** The probe asserts the shell REMAINS; if it ever starts passing with the row gone, the ruling has been made implicitly by whoever edited the constraints.

- **#2-trial ✅ BUILT [S138]** — the export exists. `lib/trial/export.ts` (chunked by self-contained `part-NNN.zip`, cursor-resumed), `lib/trial/export-sweep.ts` (the worker plus the 24-hour sweep), `POST /api/trial/export`, `GET /api/trial/export/[id]`, `GET /api/cron/export-worker` (scheduled `*/5`), and `/dashboard/trial/export`. `fflate` is the zip dependency. Evidence: `export.test.ts` 12/12 and `s138-trial-export.live.ts` 6/6, which writes real rows, runs the real sweeper and reads the entries out of the real zip in the real bucket.

  **TL-1 is now reproducible**, which was the substantive complaint below: `scripts/measure-export-throughput.mjs` is committed and refuses to run anywhere but rebuild-test. Re-measured S138 — 62 files, 28.41 MB, 15.20 s → **1.87 MB/s**, large case ≈ 2.7 h, ~61× margin on the 168 h window, ~42 invocations. S137's 1.07 MB/s was the conservative figure; the conclusion is unchanged. _Original entry retained below._

- **#2-trial (original entry)** **The trial EXPORT is specced and measured but NOT BUILT.** Raised S137 (2026-08-12). Provisional id, same rule as #1-trial.

  `export_jobs` and the private `exports` bucket exist; the job that fills them does not, and no zip dependency has been added. The spec's `input → store → output` trace (§4) is written and is what a build should follow.

  **TL-1 is settled and does NOT change a ruling.** Measured on rebuild-test — 61 files, 28.19 MB, sequential through the service role: **1.07 MB/s, 0.434 s/file**. Extrapolated to Josh's stated shape (15–20 projects; thousands of photos; 50+ page blueprint sets): a small company ≈ **5 minutes**, a mid one (~2k files, 4 GB) ≈ **64 minutes**, a large one (~8.5k files, 18 GB) ≈ **4.8 hours**. Against the **7-day** pre-expiry export window that is a ~35× margin, so the window is not the binding constraint and no ruling has to move.

  **What IS binding is Vercel's `maxDuration = 300`.** A large export needs roughly 58 invocations at five minutes each, so the job must chunk and resume across invocations — which is why `export_jobs.cursor` exists. Method stated so the number can be challenged: sequential, single connection, from a Codespace; parallel downloads would improve it and production egress may differ.

- **#151 — RENUMBERED FROM `#149` [S139].** It was filed as `#149` on this branch in S123; main independently allocated `#149` to "e2e fixtures not reproducible", and `feature/m6m-mobile` allocated it to a third item. Main's `TECH_DEBT.md` is the assignment authority and its header reconciliation table assigns this item **`#151`**. Verified against main rather than trusted: main's own entries stop at `#150`, and the table allocates `#151`–`#154`. **Every citation on this branch was grepped before the move** — there were exactly two, both in this file, and no code, comment or test referenced it. The two items this branch numbers `#147` and `#148` are byte-identical to main's and are NOT renumbered.

- **#151** **The push enrolment control does not read as tappable. A UI PASS, NOT A DEFECT — the control works, it just does not announce itself.** Found by Josh on a real device, S123: he located it and turned notifications on, but the affordance does not look like a button.

  **Where it lives.** `apps/web/components/notifications/push-enrolment.tsx` — ONE component serving both surfaces, which is CLAUDE.md's parity rule applied deliberately: each surface passes a `surface` prop and neither owns a copy. Rendered at exactly two sites:
  - `app/dashboard/notifications/page.tsx:66` — `surface="desktop"`, inside a `<section>` beneath an `<h2>Push notifications</h2>`.
  - `app/m/notifications/page.tsx:53` — `surface="mobile"`, inside a bare `<section style={{ marginTop: '24px' }}>` with **no heading at all**, so on the phone it reads as an unlabelled sentence under the notifications list.

  **What it looks like today, and why — so the fix does not start with rediscovery.** The component contains **zero `className` attributes**, in any branch (verified by count, not by eye). `app/globals.css` loads `@tailwind base`, so Preflight is in force: it sets `background-color: transparent` and `background-image: none` on buttons, and `border-width: 0` universally. An unstyled `<button>` therefore renders with **no background, no border, no radius and an inherited type ramp** — visually a line of body text that happens to respond to a click. This is CSS *absence*, not CSS error, which is why nothing looks broken and nothing fails. There is also no sizing class, so the button's height is content-driven and **will not meet A-5's 44px floor without one** — measure it during the pass rather than trusting a number written here.

  **Why this outranks ordinary polish, recorded because it is the reason it was raised.** This is the one control standing between a user and ever receiving a notification, so an unclear affordance means most people never enrol at all. And on iOS the permission prompt is **one-shot and sticky per origin** — a denial cannot be re-prompted — so a user who meets this control in a confusing state and taps through wrongly ends up in a *permanent* state, not a recoverable one.

  **Constraints any refinement inherits.**
  1. **A-5's 44px floor.** `notification-bell.tsx:53` (`h-11 w-11`) is the in-repo reference for 44px in this Tailwind scale.
  2. **§2's tokens** — the `m6m.*` namespace at `tailwind.config.ts:55` (`navy, blue, amber, danger, surface, card, border, muted, …`). §2 names `blue` as the primary button and `amber` as the primary FIELD CTA; choosing between them here is a design call, not a build detail. Note both render sites currently use raw inline styles for spacing, so the pass should decide whether to tokenise those too or deliberately leave them.
  3. **⚠️ THE iOS INSTALL-GATE BRANCH MUST NOT BECOME PRESSABLE.** `state === 'ios-needs-install'` renders instructions and **no control**, on purpose — §10.2, *"the UI must not offer a control that cannot succeed"* — because pressing it cannot work and a denial there is permanent for the origin. A styling pass that hands that block a card, a border and a tappable-looking surface reinstates the exact offer the branch exists to withhold. The same applies to `denied` and `unsupported`: those branches are **statements, not actions**.

  **What a pass would be working without.** **No test references this component anywhere** — `push-enrolment`, `push-enable`, `push-ios-install`, `push-disable`, A-N26 and A-N27 appear in no unit or e2e file. The criteria the component's own header cites are asserted nowhere, so there is currently no safety net for constraint 3 above. The pass should add at minimum an A-N26 assertion — *no button in the iOS branch* — **before** restyling, so the one thing that must not change is pinned while the rest moves.

  **Not a behaviour change.** The enrolment path, the user-gesture guard on `requestPermission()` and the per-surface service-worker scoping are all correct and were exercised on a real device. Observed S123.

- **`#152` / `#153` / `#154` — RENUMBERED FROM `#147` / `#148` / `#149` [S139].** All three were filed on this branch in S123, and all three collided: main allocated `#147`–`#149` to three DIFFERENT items ("contact holds only ONE address", "estimate cannot create a contact", "e2e fixtures not reproducible"), and `feat/notifications` took `#149` for a fourth. **The divergence starts at `#147`, not `#148`.** Main's `TECH_DEBT.md` is the assignment authority and its header table assigns exactly these three numbers. Verified against main as it now stands rather than trusted: main's own entries stop at `#150`, and `#152`–`#154` were unused on this branch before the move.

  **⚠️ ONE CITATION WAS IN CODE, NOT IN THIS FILE**, which is the whole reason the rule says to grep first: `apps/web/playwright.config.ts` carried `LOCAL IS 1, NOT 0 — TECH_DEBT #147(a) [S123]. THIS NUMBER IS THE EVIDENCE.` A comment that calls a number the evidence is worthless pointing at the wrong entry, so it moved in the same commit and now reads `#152(a)`. Every occurrence across both files was enumerated before the change (`#147`×3, `#148`×4, `#149`×3) and confirmed zero afterwards.

- **#152** **PARTLY CLOSED [S123] — (a) is fixed, (b) STAYS OPEN.** Filed S123 as the actionable residue of **#145**, which closed as mitigated. Two separate things, kept together because both are about the local e2e loop telling the truth about itself.

  **(a) ✅ CLOSED [S123] — the local run is no longer blind.** `playwright.config.ts` is now `retries: process.env.CI ? 2 : 1` (CI's 2 unchanged), so `trace: 'on-first-retry'` finally has a first retry to attach to and a local failure writes a trace instead of nothing.

  **What was wrong:** locally `retries` was **0**, so there was never a first retry and **no trace was ever written**. The artefact S121 explicitly asked the next investigator to capture could not be produced by the config that asked for it. #145 sat undiagnosed for four sessions substantially because of this.

  **Two costs, recorded in the config comment rather than left to be discovered:**
  1. **A flaky test can now pass on retry and hide locally**, where before it failed loudly. Playwright's `flaky` line in the run summary is the only place it surfaces — read it. The same trade is already accepted in CI at `retries: 2`.
  2. **`retries` and `trace` are coupled, and the coupling is invisible from either line.** Setting `retries` back to 0 deletes the evidence **without touching `trace:` at all** — which is precisely how this gap arose. Anyone wanting no local retries must switch `trace` to `retain-on-failure` in the same edit.

  **Still owed, and deliberately not done here:** `DEBUG=pw:browser` is the ONLY channel carrying the cause of a renderer death (S123 — it is where `V8 javascript OOM (Reached heap limit)` appears), and nothing documents or sets it. A line in `scripts/e2e-preflight.sh`'s recommended invocation or an e2e README would close that; it is documentation, not config, so it did not belong in this change. **Do not enable crash dumps** — established S123 that `chrome-headless-shell` ships no `chrome_crashpad_handler` and `--enable-crash-reporter` is fatal at launch.

  **(b) ⚠️ STAYS OPEN — a dev server died mid-run, silently, and the suite kept going.** S123, during a 236-test instrumented run: `next-server` vanished at ~13:20:12 with **no error in its log** — the log ends on a successful `Compiled /m/p/[projectId]/files in 1068ms` followed by a bare cursor-restore escape (`ESC[?25h`), the signature of a clean signal-triggered exit, not a crash. No kernel `oom_kill` (still 0 everywhere), no `JavaScript heap out of memory`. Playwright then ran **~80 more tests against a dead origin**, failing each in ~1.3s. The server was started by `scripts/e2e-preflight.sh`, so `reuseExistingServer` means Playwright did not own its lifecycle and should not have torn it down. **What sent the signal is not established.**

  **Why it matters independently of #145:** a suite that keeps running after its origin disappears converts one infrastructure fault into a wall of unrelated red, which is the same misreporting class as **#135** and **#138**. Note this is NOT #145's mechanism — verified S123 by controlled experiment: a page whose server is killed reports **`net::ERR_CONNECTION_REFUSED`**, fires **no** crash event, and never says `Page crashed`.

  **Fix shape:** a cheap origin liveness check in the Playwright global setup or a `webServer` health assertion, so a vanished server fails the run **once, naming itself**, rather than 80 times naming the tests. Observed S123.

- **#153** **LEAN-REPO SWEEP — the S123 deletion survey, recorded so it is not re-derived.** One entry on purpose: Josh works it as a single pass. Survey was **read-only**; nothing here has been done. Repo is **224,830 tracked lines**.

  **⚠️ READ THE "DO NOT DELETE" SECTION FIRST.** Two of the things a naive sweep would remove hold the only copy of work that exists nowhere else.

  ### The verdict, up front
  The whole return is **~9,060 lines (4.0%)**, and **8,068 of it is one finding**. The rest is ~990 lines of code across 38 sites — a large sweep with a small return. **Do the duplicates. Skip the dead code.**

  ### 1. Duplicate prototype runtime — the only finding worth doing
  `support.js` exists as **5 byte-identical copies** (`md5 450f2a92`, 1,841 lines each) and `ios-frame.jsx` as **3** (`md5 6da93954`, 352 each), across `docs/handoffs/{mobile-app-shell,mobile-field-capture,mobile-photos,module-6-field-operations}/` and `docs/design/module-6/`. Keeping one of each removes **8,068 lines / ~312 K**.

  **⚠️ THE TRADEOFF, WHICH IS REAL:** the `.dc.html` prototypes need `support.js` to render, so deduping to one copy means **three bundles stop rendering**. Their own READMEs already say `support.js` is *"prototype runtime — reference only; do not port"* and `ios-frame.jsx` is *"presentation-only … Not part of the design"*, so the rendering was never the point. **Worth taking — but it is a trade, not a free win**, and whoever does it should say so in the commit rather than discover it later.

  ### 2. `docs/design/module-6/` — a byte-identical copy of a whole directory
  It duplicates **all four files** of `docs/handoffs/module-6-field-operations/` (`diff -rq` clean): 2,425 lines / 140 K.

  **⚠️ BOTH PATHS ARE CITED IN LIVE DOCS, so deduping breaks a reference either way.** `docs/specs/6B-1-spec.md:13` names `docs/design/module-6/` the *"Design authority (read view)"*; **#130** cites the handoffs path. And because they are identical, **#130's stale wordmark lives in both** — see #130's closure, which carries the rule *delete both copies or neither*. Needs a ruling, not a sweep.

  ### 3. `supabase/migrations_archive/` — 37 files, 4,413 lines / 244 K
  **Content is not at risk**: it was moved with `git mv` (#79, S56), so history holds it. **What breaks is references:** two LIVE migrations point at it by path in comments to explain where a policy came from — `20260819000000_company_logos_bucket.sql:22` and `20260714175906_project_files_storage_policies.sql:6`. Deleting orphans both. Cheap to fix (reword two comments), but it must be done deliberately.

  ### 4. `apps/mobile/` — 5 files, 133 lines
  **PARKED by the D-1 PWA ruling, not abandoned** (CLAUDE.md → Technology Stack; #Josh's reasons are recorded there and in `apps/mobile/README.md`). Deleting is not just `rm`: it needs the `apps/*` **workspace member** removed, the **`dev:mobile` script** dropped from root `package.json:10`, and a **`package-lock.json` regen** (it carries `@framefocus/mobile` at `:22` and `:3334`). **60 of the 133 lines are the README, which IS the record of why it is parked** — the category this register exists to protect. Needs Josh's ruling.

  ### 5. 12 uncited live harnesses — 3,342 lines. **LEAN KEEP, and the reason is the point**
  33 `test/*.live.ts` exist (11,185 lines); **21 are cited by name** in CLAUDE.md / TECH_DEBT / docs, several as active guardrails — CLAUDE.md names `s97ct-roles.live.ts` **8b-ii** and `s97ct-budget-floor.live.ts` **7-foreman/7-crew_member** as existing *"to fail loudly if anyone adds one"*. The other 12 (`s97ct-floor3`, `s97ct-budget-immutability`, `s97ct-budget-writers`, `s97ct-derivation`, `s97ct-reminders`, `s121-contact-addresses-floor`, `s97ct-terms`, `s97ct-contract-value`, `s97ct-retainage-passthrough`, `s121-award-assign`, `s97ct-reply-to`, `s121-assignment-grant`) are uncited **only because no prose happened to name them**.

  **Why keep:** each is the executable record of how a DB floor or money rule was *proven* — the thing that was run to show a policy actually refuses. They never run in CI (the `.live.ts` suffix keeps them out), so they cost nothing but disk, and **being uncited is not evidence of being spent** — it is evidence that nobody wrote a sentence about them. That makes them closer to spec than to dead code, and spec is the expensive thing to lose.

  ### 6. Dead code — ~990 lines across 38 sites. **RECOMMENDATION: SKIP**
  Method: tokenised all 569 tracked `.ts`/`.tsx` files, counted references to 719 exported symbols outside their defining file, then validated against known-live symbols.
  - **6 fully-unreferenced files in `packages/shared`** — 347 lines: `validation/time-tracking.ts` (129), `constants/default-tags.ts` (89), `validation/index.ts` (46), `constants/subscriptions.ts` (39), `utils/index.ts` (36), `constants/modules.ts` (8). Both `index.ts` **barrels are dead because every consumer imports the specific file** (`@framefocus/shared/validation/deliveries`), never the barrel.
  - **32 dead exported functions** in `apps/web/lib/services/*` — ~640 lines, each with exactly one repo-wide occurrence (its own definition).
  - **12 more are NOT dead, just over-exported** (`sumLive` 5 uses, `NO_PROJECT` 4, `getPunchPhotoIds` 3 …) — used inside their own file. The remedy is dropping `export`, **not deleting**. A sweep that does not separate these deletes working code.

  **Why skip:** 38 sites each needing individual verification, in service files where **complete CRUD written ahead of its UI is a deliberate pattern**, not an accident — `softDeleteInvoice`, `restoreProject`, `releaseRetainage`, `getClientAging` are surfaces waiting on screens. Under 1% of source for real regression risk. **⚠️ `updateProject` appears in this list and MUST NOT be deleted — see #154.**

  ### 7. Free and safe
  - `apps/web/app/invite/accept/invite-form.tsx` is **0 bytes and referenced by nothing**. The `invite-form` import at `dashboard/team/invite/page.tsx:4` resolves to a different, real file in its own directory. Confident delete.
  - **15 local branches merged into `origin/main`** — tidiness only, 0 repo lines.
  - **`/workspaces/FrameFocus-spec`** sits on `docs/m6m-hamburger-screens`, already merged. That worktree is spent.
  - Untracked, outside the repo: `apps/web/playwright-report` (**2.8 M**) and `test-results` (68 K), both gitignored.

  ### ⛔ DO NOT DELETE — these look sweepable and are not
  **`/workspaces/rafterworks-s89` (branch `feat/notifications-architecture`) and `feat/module-8-architecture`.** Both are unmerged and both hold docs that **exist nowhere on `main`**:
  - `docs/specs/notifications-architecture.md` — **212 lines, NOT on main**, and **notifications is the next project** per the PWA ruling (CLAUDE.md, GATED.md).
  - `docs/sessions/context89.md` and `docs/sessions/context88.md` — **neither on main**. (`module8-architecture.md` IS on main, but the branch version differs — it adds open questions on price-edit authority and misc-borrow approval.)

  **They need MERGING, not deleting.** Both contain only docs, no code, so neither is stale work — just unmerged writing. **This section exists because an entry listing worktrees under "deletion" would get one of them destroyed**, and the notifications spec has no other copy. Surveyed S123.

- **#154** **`updateProject()` has zero callers — VERIFIED S123, and it is NOT a defect. Do not "fix" it and do not delete it.** Filed separately from **#153** because it is a correctness question, and filed at all because the surface facts invite a wrong conclusion twice over.

  **What the S123 survey found.** `apps/web/lib/services/projects-client.ts:91` `updateProject()` has **exactly one occurrence repo-wide — its own definition**. **#82** describes it as hardened ("`updateProject` rejects `status` writes"), which reads as though a live protection is in place. Both are true, and the tempting inference — *the protection guards nothing* — is **wrong**.

  **Why it is wrong, from the record.** `docs/sessions/context64.md:45` states it in as many words: _"`git grep` confirmed **zero callers**, so nothing broke — it was a latent path, not a live one."_ The zero-caller state is **the documented, intended outcome of S63/S64**, not drift. Josh chose Option 3 in S62 (fail-closed + neutralize `updateProject` + DB trigger); neutralising a latent write path **preemptively**, so that the first future caller fails closed rather than silently writing `status`, is the whole point. A guard on a path nobody calls yet is not a no-op — it is the guard being there **before** the caller is.

  **And there is no bypass — checked, not assumed.** The other `projects.update()` in the same file (`:188`) is inside **`transitionProjectStatus()`**, the sanctioned status path that owns the punch gate and the re-completion end-date logic. That is exactly what `updateProject`'s own refusal message points callers at (*"Status changes must go through transitionProjectStatus()"*). The two-function split is coherent; nothing routes around it.

  **⛔ THE ACTIONABLE PART: `updateProject` will keep showing up in dead-code sweeps, and deleting it is the real risk.** It is unreferenced by every honest static measure, so #153's method flags it and so will the next one. **Deleting it removes the guard along with the function** — and the next developer who needs a general project-field update writes a fresh, ungated `.update(updates)`, which is precisely the latent defect S62 found and S63 closed. **Keep it. It is dead weight on purpose.**

  **What would make this a real item:** a caller appearing that passes user-controlled keys into `updates`, or the **#82** DB trigger landing (at which point the service-layer guard becomes belt-and-braces and the question changes shape). **Cross-ref #82** — that entry's deferred DB backstop is the piece still genuinely owed; this one is not. Verified S123.

## Closed Tech Debt

<!-- Moved from Open Tech Debt [S122] — closed in S119/S121, relocated during housekeeping. -->

- **#136 ✅ CLOSED [S121]** — raised S103, filed, never fixed; closed while fixing #117's payload half. `dashboard/expenses/page.tsx` now strips payable rows from **both** props for a role outside `SEES_BILLS`. **Fixing `billRows` alone was not enough and the payload test caught it:** the payables are also in `expenses`, because a payable IS an expense — which is why the client filtered them off the Receipts tab by id. #136's own filed fix ("pass `billRows` only when `seesBills`") would have emptied `payableIds` and made the Receipts tab **start showing** the rows it exists to hide; a test asserts that specific regression. **Two more instances of the same pattern were found by sweeping every `app/dashboard/**/page.tsx` that computes a role gate** — the CO list and the CO detail — both closed in the same commit, and `e2e/desktop-payload.spec.ts` now asserts on the RSC payload rather than the DOM, because a DOM assertion is what let all three ship. Original entry retained below.

- **#136 (original entry)** **Desktop ships retainage rows to a crew member's browser — its protection is render-deep, not payload-deep.** `app/dashboard/expenses/page.tsx:83` passes `billRows={billRows}` to `ExpensesPageClient` **unconditionally**, with no role branch, and the page itself has no role redirect (only an auth check at `:25`). `getBillsAndCommitments()` has no role logic either — it is a predicate query whose `PAYABLE_OR_FILTER` includes `is_retainage.eq.true` (`payables-shared.ts:30`). So every role that reaches `/dashboard/expenses` receives every payable row RLS grants them, **in the RSC payload**, including subcontractor retainage accruals.

  **What stops a crew member SEEING them is entirely render-level**, and it is two independent UI filters: the Bills & Commitments tab is gated to Owner/Admin/PM/Foreman (`expenses-page-client.tsx:77` — the comment reads *"Crew has nothing in 7C — receipts only"*), and the Receipts tab excludes anything in `payableIds` (`:99`). Both are correct and neither is a leak on screen. **The payload is the leak**: view-source, devtools, or any RSC-payload inspection reveals rows the UI declines to draw.

  **Live before this became reachable, but only just.** Pre-**D-47** (migration `20260825000000`, S102) `expenses_select_scoped` gave crew only rows they **authored**, and `expenses_insert_authorized` restricts `is_retainage = true` to Owner/Admin — so crew authored none and RLS returned none, and `billRows` for a crew member was empty of retainage. D-47's widening is what put rows in that payload. **Verified S103 under impersonation: a crew member can now read 3 retainage rows, 0 of them authored by them.**

  **Independent of mobile.** M6M's **D-49** filters `is_retainage` out of M-26 for every role, which fixes the mobile surface and does nothing for this one — the two are separate consumers of the same widened policy. Fix shape, cheapest first: pass `billRows` only when `seesBills` is true (one conditional in `page.tsx`, mirrors the tab gate already in the client), **or** close it properly by narrowing `expenses_select_scoped` to exclude `is_retainage` for crew/subcontractor — which would fix both surfaces and is the "Option C" M6M §4.13.3 records as considered-and-rejected for scope reasons, not correctness ones. **Same class as #117 and #132: a real figure protected by UI discipline rather than by RLS.** Observed Session 103.

- **#143 — ✅ CLOSED [S119].** `scripts/seed-test-identities.mjs` now assigns **PM, foreman and crew** to the m-sections project idempotently, alongside the sub row S114 added. Running it created **exactly one row — the foreman's** (`assignment foreman → m-sections project — CREATED`; PM and crew reported `exists`), which is the diagnosis confirmed rather than assumed. All six identities now reach the project.
  **The substitutions are reverted.** `e2e/m-writes.spec.ts`'s role-exclusion tests name the role they actually mean again: "a foreman gets the LIST but no create control", "a foreman READS the change order and gets no write controls", and A-58's self-verify runs as the foreman rather than a stand-in PM. The foreman also joined A-56's create-control loop (now five of six — admin is the one still absent, and only because it is not in the mobile suite's identity set).
  **⚠️ THE GUARD NEEDED A NEW NEGATIVE, and this is the part worth reading.** `s118-fixture-reachability.live.ts` broke on the seed — by design; the test literally named *"#143 IS STILL OPEN"* failed, which is what it was built to do. But once every company-A identity reached every company-A project, the declared table contained no `false` at all, and **a `can_view_project()` that simply returned TRUE for everything would have satisfied it**. So the harness now also asserts the **cross-tenant negative**: no company-A identity may reach `QA B — isolation fixture`. Both directions, same sessions — the identities refused company B are the identities that reach company A, so a harness whose sessions were merely broken fails rather than passing the refusals for the wrong reason.
  **The "exactly one punch list" item is closed too, by #144 rather than by a new fixture** — cleanup restores the project to one list, so A-67's case is the default starting state and is asserted. No extra project was created, which also avoided perturbing `m-hubs`' `{n} active` count.
  _Original entry retained below as the reasoning of record._

- **#143 (original)** **A seeded test identity — `josh+qa-foreman@worthprop.com` — cannot see the project the whole mobile suite drives, so every assertion made under it passes VACUOUSLY.** Discovered S117 while writing M6M Part C's write-path suite: five of twenty-one tests failed, and the failures were the finding rather than a build defect. `change_orders_select_visible` is `company_id + can_view_project()`, so the foreman's M-13 is **empty** — `getByTestId('m-co-row')` never resolves. Worse, `getProject()` returns **null** for that identity, so `/m/p/{PROJECT}/punch/new` **404s outright** before any punch code runs. Confirmed by contrast in the same run: `josh+pm@`'s row click succeeded, so the PM **is** assigned; `josh+crew@` is the identity the rest of the mobile suite already drives the project as.
  **Why this is #127's class and not a one-off test bug.** #127 was *"missing sub/client test identities"* — a fixture gap that made criteria unprovable. This is the same failure one step further on: the identity **exists and signs in**, so nothing looks wrong, but it is not assigned to the project, and **an assertion of the form "role X does NOT see Y" passes for the wrong reason**. #127 at least failed loudly. This one is silent, and it is the more dangerous shape: **a role-exclusion suite is exactly where a vacuous pass is indistinguishable from a real one.** The S114 work that closed #127 seeded a member row, a project assignment and punch fixtures for the sub and client identities — the foreman was not part of that pass and never got the assignment.
  **What it cost, concretely:** M6M A-56's create-control half and A-58's service-layer refusal are both still unproven partly because the natural identity for them cannot reach the fixture. The Part C suite works around it by asserting under **crew** wherever a role must actually see something, keeping the foreman only for route-guard tests where no project access is needed (M6M §4.11.11b, ruling 4). **That workaround is load-bearing and undocumented in the test file's absence** — hence this entry.
  **Fix:** seed `josh+qa-foreman@` a `project_assignments` row on the rebuild-test fixture project, idempotently, in the same place S114 seeded the sub and client. Then revert the crew substitutions so the criteria are asserted under the role they name. **Audit the other identities while there** — `josh+qa-admin@` has not been checked and may be in the same state. **Cheap guard worth adding regardless:** a harness assertion that each seeded identity reaches the fixture project, so a missing assignment fails once and loudly instead of silently weakening every suite downstream. Observed Session 117.

- **#144 — ✅ CLOSED [S119].** The suite now cleans up at **both ends**, and the live harnesses no longer depend on its leftovers.
  **What changed.** `test/s118-m6m-write-criteria.live.ts` used to READ the Playwright suite's rows (A-55 scanned COs titled `E2E %`; A-67b matched an item to its list by name). That coupling was what blocked the obvious fix. It now **creates everything it asserts on** — a change order through `createChangeOrder`/`createCoLineItem`/`createCoLineRow` priced by `recalculateChangeOrderTotalsPrivileged`, and a punch list through `createPunchList`/`createPunchItem` — and removes it in `afterAll`. It runs standalone like every other `*.live.ts`, which was the stated goal. `e2e/m-writes.spec.ts` gained `cleanUpFixtures()` on `beforeAll` **and** `afterAll`, deleting children-first (`change_order_line_rows` before `change_order_line_items` — that FK has no CASCADE; punch items before lists; `files` rows after the items whose `completion_photo_file_id` referenced them, with the storage object removed before the row so no blob is orphaned). Scoped by name prefix AND project, so the fixture COs and the seeded D-57 punch data survive.
  **PROVEN, not assumed — two runs back to back:** before, the project carried `{cos:15, punchLists:23, punchItems:23, files:17}`. Run 1's cleanup removed 16 COs / 27 lists / 27 items / 21 files. **Run 2's `beforeAll` sweep removed ZERO of everything** — the strongest available evidence that run 1 missed nothing — and the row counts after run 1 and after run 2 were **identical**: `{cos:2, coLines:2, coRows:3, punchLists:1, punchItems:1, files:0}`, exactly the documented fixture baseline. The live harnesses then passed **standalone with the leftovers gone**, which is the assertion that the decoupling is real rather than incidental.
  **A bonus that closed a separate owed item:** because cleanup restores the project to **exactly one punch list**, A-67's "a project with exactly one list still asks" case is now the *default* starting state, and the test asserts it (1 existing list + the `__new__` sentinel = 2 options, none preselected). No separate seeded project was needed.
  _Original entry retained below as the reasoning of record._

- **#144 (original)** **`e2e/m-writes.spec.ts` writes PERMANENT fixture data on every run and never cleans up, so the shared project grows without bound.** Each run of the Part C suite adds ~5 change orders (with line items and rows) and ~5 punch lists with items to `eaf0e25b-…`, the project every mobile spec drives. Nothing removes them. **Raised S118 after it caused its first failure:** `m-details.spec.ts`'s D-55 change-order test flaked at the tail of a 220-test run — the page snapshot showed the row link present and correct, so the navigation simply did not finish inside Playwright's 5s default while the dev server rendered an ever-longer M-13. Fixed *proximately* by giving that block explicit 30s navigation timeouts, which is right on its own terms — the claim is "the row opens the detail page", not "the dev server renders it in five seconds" — but it treats the symptom.
  **Why it will get worse rather than plateau.** The growth is linear in runs, and the assertions most exposed are the ones that compare counts: `m-hubs`' A-11b (the M-3 stat and the Punch tile must agree), A-11c (completing an item moves both figures), and M-13's own row rendering. **A-57, added this session, reads the rendered open count before and after a write** — it is relative, so it survives, but it is slower every run.
  **⚠️ THE OBVIOUS FIX IS BLOCKED BY A COUPLING THIS SESSION INTRODUCED, and that is worth stating plainly rather than discovering later.** `test/s118-m6m-write-criteria.live.ts` READS the Playwright suite's leftovers — A-55 asserts `net_delta = Σ line totals` over COs titled `E2E %`, and A-67b matches an `E2E Item <stamp>` to its `E2E List <stamp>` by `punch_list_id`. Adding a plain `afterAll` cleanup to the Playwright spec would leave both with nothing to assert and they would throw their "run the Playwright suite first" error. **So the fix is not "delete what you created" — it is to decide which harness owns the data.** Two shapes, and the second is probably right: (a) the Playwright spec prunes rows from PREVIOUS runs at start-up and leaves the current run's behind, keeping the project bounded and the live harnesses fed; or (b) the live harnesses create their own COs and punch items through the service layer and assert the invariants on those, dropping the dependency entirely — which also makes them runnable without Playwright, as every other `*.live.ts` already is. Raised Session 118.

- **#127** No permanent **subcontractor** or **client** identity in rebuild-test — closed Session 113. Both now exist on `nmyphyhmfttxkdoposvf` as real `profiles` rows with the role set: `josh+qa-sub@worthprop.com` (`subcontractor`) and `josh+qa-client@worthprop.com` (`client`), seeded idempotently by `scripts/seed-test-identities.mjs`. The sub also has a **linked `company_members` row** (`6600b2a9-…`) built the way production builds one — `subcontractors` insert → `subcontractors_create_member` trigger → `profile_id` linked as `handle_new_user()`’s invite branch does — plus a `project_assignments` row on the `QA A — isolation fixture` project. The client deliberately has **no member row** (`create_member_for_new_profile()` skips the role, and the seed asserts the absence). **The 32 roster rows the original entry warned about were not used and are not a substitute** — they remain `profile_id IS NULL` and cannot sign in. First use: `s113-punch-sub-visibility.live.ts` proves both arms of M6M D-57 by signing in, which is the reproducibility the entry existed to demand. Details: STATE.md → Test Data. Unblocks #141.
- **#103** No foreman test identity in rebuild-test — closed Session 97 (commit `1f36996`), verified again Session 100. `josh+qa-foreman@worthprop.com` exists on `nmyphyhmfttxkdoposvf` with `profiles.role = 'foreman'` and a matching non-deleted `company_members` row, under Bishop Contracting. Seeded idempotently by `scripts/seed-test-identities.mjs`, which refuses to run against any project but rebuild-test. GATED.md Gate 2 recorded this at S97; the open entry here was stale drift. The foreman SELECT arm on `expense_payments` that S91 left NOT RUN is now runnable. Superseded gap for the two roles still missing: **#127**.
- **#104** rebuild-test has only one company — closed Session 97 (commit `1f36996`), verified again Session 100. A second company exists: **Ridgeline Builders (TEST CO 2)** (`f079a1f4-12db-4bc8-ae95-2d647d688260`) with its own owner `josh+qa-b-owner@worthprop.com`. `companies` now returns 2. True cross-company isolation probes are possible and were run in S100's §7c evidence — the cross-tenant arm of `submit_delivery_check_in` was proved by impersonating the Company B owner against a Company A delivery. GATED.md Gate 2 recorded this at S97; the open entry here was stale drift.
- **#111** instrument_rates date cap uses UTC `CURRENT_DATE` — closed Session 95, RESOLVED-MOOT. The future-dating ruling (money-representation.md P5 as amended 2026-07-31) removed the today-cap entirely: migration `20260731010000_rates_future_dating.sql` (applied to rebuild-test) redefined `instrument_rates_backdating_guard()` without the `effective_from > CURRENT_DATE` check, so the guard no longer references `CURRENT_DATE` at all — there is no today-boundary left for a timezone to trip. The floor check (later rates ≥ latest non-superseded rate) has no timezone component. #112 (unserialized floor) is unaffected and stays open-accepted.
- **#79** contacts/subcontractors had no committed CREATE TABLE baseline (migration ...009 was a 2-line placeholder) — closed Session 56 (commit `c041afa`). Resolved via Option C: squashed all 37 prior migrations to a single prod-verified baseline (`20260101000000_baseline_schema.sql`, pg_dump of prod public schema), old migrations archived to `supabase/migrations_archive/`. Acceptance: clean `db push` to an empty project + prod/throwaway parity (tables 22, policies 64, functions 29, triggers 32).

> One line per closed item: number, brief description, session closed, commit reference (where available). Full context lives in the commit and the matching `docs/sessions/contextN.md`.
>
> **Note:** This list starts at Session 34. Items closed before Session 34 (e.g., #11, #22, #23, #26, #41, #42, #44, #45, #46, #48, #56) lived under the old "delete on close" convention and are not reconstructed here. They can be looked up via `git log --all --grep="#NN"` or by reading the relevant context file.

- **#12** `packages/shared/types/index.ts` barrel anti-pattern — closed Session 35. Inline interfaces (`Profile`, `Company`, `PlatformAdmin`, `BaseEntity`, inline `SubscriptionStatus`, inline `CompanyUserRole`) had zero consumers except `utils/index.ts`, which was repointed to `CompanyRole` from `roles.ts`. Barrel reduced to `export * from './roles'; export * from './markup';`. Type-check clean.
- **#35** `.env.local` doesn't persist across Codespace rebuilds — closed Session 34 (audit). Resolved via GitHub Codespaces secrets, which auto-inject 11 env vars on every new session. Confirmed working across Sessions 26, 28, 30, 31, 32. Documented in CLAUDE.md and STATE.md Environment Variables sections. No code change required.
- **#59** Document the append-only audit log exception in CLAUDE.md — closed Session 31 (commit `bd6657a`). Convention added to CLAUDE.md Database Conventions section, immediately above the Trash-bin pattern block. Lists `ai_tag_logs` and `trial_emails` as current examples.
- **#63** CLAUDE.md doc drift — closed Session 34. Stale sections ("Migrations Run", "Current Session Context") were already removed in earlier cleanup; remaining drift was the header date, Module 3 status line, table row, and OPENAI_API_KEY comment, all corrected this session. STATE.md is the live source of truth for current work.
- **#65** Owner uniqueness not enforced at DB level — closed Session 35. Migration 024 added partial unique index `profiles_one_owner_per_company` on `profiles(company_id) WHERE role='owner' AND is_deleted=false`, and dropped the unmaintained `companies.owner_id` column (verified zero application reads/writes; signup trigger no longer references it). `profiles.role='owner'` is now the unambiguous source of truth.
- **#43** `profiles_update_owner` Owner-only RLS policy — closed Session 36. Migration 025 dropped `profiles_update_own` (no self-updates), kept `profiles_update_owner` with WITH CHECK preventing Owner from demoting self, added `profiles_update_admin` allowing Admin to edit non-Owner/non-Admin/non-self profiles with role-promotion blocked. RLS-only — UI for team edits still depends on #14.
- **#14** Team member edit UI (`/dashboard/team/[id]`) — closed Session 39 (commit `1ec46b5`). Page renders server-side with auth + self-lock + admin-viewing-privileged gates; client form handles all five editable fields (first/last name, phone, role, notes) with caller-scoped role dropdown. Smoke tested against Bishop Contracting: Owner→Crew, Admin→Crew, Owner self-lock, Admin self-lock, Admin→Owner block — all pass.
- **#15** Team member delete UI — closed Session 39 (commit `1ec46b5`). Two-step inline confirmation (click Delete → "Confirm delete"/Cancel). Soft delete via `is_deleted=true` + auth ban. Verified: deleted user cannot log in; team list count drops.
- **#16** Team member password reset UI — closed Session 39 (commit `1ec46b5`). "Send password reset email" button on edit page triggers `auth.resetPasswordForEmail`. Server action ran clean; email delivery blocked by Supabase rate limit during smoke test — infrastructure, not code. Separately discovered pre-existing bug in the sign-in page's Forgot Password link handler (see #70).
- **#17** Team member notes field — closed Session 39 (commit `1ec46b5`). Textarea in edit form, writes to `profiles.notes` column added in Migration 026.
- **#66** Ownership transfer — closed Session 40 (commit pending). Migration 027 + transfer-form on Owner-self team detail page. Spawned #71–#75.---
- **#8** team-page-client.tsx local ROLE_LABELS — closed Session 76 (commit c5ac222). Now imports from @framefocus/shared; shared constant is a superset, all overlapping values identical, behavior unchanged.
- **#10** invite-form.tsx Invitation import missing import type — closed Session 76 as stale. No Invitation import exists in invite-form.tsx; the only one (in team-page-client.tsx) already uses an inline type qualifier. Condition described never existed in current code.
- **#50** Delete markup-test/page.tsx — closed Session 76 (commit e8ca00d). Module 3G complete; no references anywhere in codebase.
- **#85** CO PDF bold line-item row — closed Session 79 (UI verification, no code change — bold row confirmed intentional, it is the line item vs. its detail breakdown, not a bug).
- **#96** `files` company-wide RLS leak (select/insert/update policies project-scoped + category-gated; `client_visible` and gated-category recategorization Owner/Admin-only via trigger) — closed Session 90, commit `9fbcc1c` (migration `20260728000000_security_rls_96_99.sql`). **Applied to BOTH rebuild-test and production, Session 90.** The `storage.objects` arm is defense-in-depth (storage cannot see `files.category`); the table policy is the primary gate. Verified by impersonated RLS probe (`SET LOCAL role authenticated` + `request.jwt.claims`), negative and positive controls both pass. Record correction: the S89 probes cited in this item's original entry ran via Supabase MCP as `current_user=postgres` with RLS bypassed and were NOT valid behavioral evidence — the S90 impersonated probes are the evidentiary run.
- **#97** `daily_logs` INSERT author spoofing — WITH CHECK now binds `author_member_id = get_my_member_id()` with Owner/Admin override — closed Session 90, commit `9fbcc1c` (same migration; applied to BOTH rebuild-test and production, Session 90).
- **#98** `daily_logs` soft-delete reversal — `is_deleted`/`deleted_at` transitions blocked in both directions for non-Owner/Admin via BEFORE UPDATE column-scope trigger — closed Session 90, commit `9fbcc1c` (same migration; applied to BOTH rebuild-test and production, Session 90).
- **#99** `daily_log_crew`/`daily_log_sub_entries` cross-company `member_id` — same-company EXISTS added to INSERT WITH CHECK and new explicit UPDATE WITH CHECK on both tables — closed Session 90, commit `9fbcc1c` (same migration; applied to BOTH rebuild-test and production, Session 90).
- **#80** signed-CO deltas → `contract_value` reconciliation — closed by DERIVATION, not write-through: `projects.contract_value` is never mutated; revised = original + Σ(client-signed CO `net_delta`), derived by `apps/web/lib/services/contract-value.ts` (7B-spec §0 rules 1-2). Closed Session 90, commits `e57043c` (service) + `93d41d7` (call sites). Spec: `docs/specs/7B-spec.md`.
- **#94** HEIC photos stored but never render — closed Session 90, commit `de3eaf9`: client-side `heic2any` conversion at upload in `uploadFile` (`files-client.ts`; dynamic import, quality 0.82, rename → `.jpg`, `mime_type 'image/jpeg'`), covering every photo call site (daily logs, safety, deliveries, 7A receipts, generic files). Grids, PDF embeds, and the 7A review popup render new uploads with no consumer changes. On conversion failure the original bytes upload as before (logged — never fails harder than pre-fix). Pre-fix HEIC rows were test data only; no backfill run (backfill page stood down, S90).

## Process notes

When closing an item:

1. Move the entry from `Open Tech Debt` to `Closed Tech Debt` as a one-liner with session + commit reference.
2. Run `grep -rn "#NN" .` (replacing NN with the closed number) to find any references in code comments, docs, or other tech debt items. Update or remove them as appropriate.
3. The number stays in the closed list permanently. Don't reuse it.

When opening a new item:

1. Use the next sequential number after the highest one in the file (open or closed).
2. Add to the appropriate category in `Open Tech Debt`.
3. If the item depends on or relates to other items, reference them by number — those references will resolve correctly forever because numbers are stable.
