# TECH_DEBT_CLOSED.md — FrameFocus — CLOSED

**The register is THREE files** — a number lives in exactly one; if it is not here, check the other two:
- [`TECH_DEBT.md`](TECH_DEBT.md) — **OPEN**: owed work with a known fix.
- [`TECH_DEBT_CLOSED.md`](TECH_DEBT_CLOSED.md) — **CLOSED**: done, kept for the audit trail.
- [`TECH_DEBT_IDEAS.md`](TECH_DEBT_IDEAS.md) — **IDEAS**: deferred *decisions* (not deferred work).

> Closed items, kept as the audit trail. One line per item: number, description, session closed,
> commit. Numbers stay here permanently and are never reused. Full context lives in the closing
> commit and the matching `docs/sessions/contextN.md`.

---

## Closed Tech Debt

- **#3-7gqb ✅ CLOSED [feature/7g-quickbooks; S182]** — retainage RELEASE does not reach QuickBooks.
  ⚠️ **Closed by REMOVING the question, not by answering it.** The blocker was an allocation problem:
  `retainage_releases` is UNIQUE per project while many invoices may each withhold, so "which QB
  invoice does the release pay, and in what split?" had no reversible default. **Josh's S103 §1c
  reversal deleted the premise** — QuickBooks now receives the NET RECEIVABLE and each invoice
  CLOSES FULLY when paid, so no invoice is ever left open for retainage and there is nothing to
  split. A release is already its own invoice
  (`recordSignOffAndGenerateRelease()` has always called `createInvoice()`), so it syncs through the
  ordinary `invoice:create` path with **no new columns, no new `entity_type`, and no new handler** —
  all three of the "structural gaps" this entry listed turned out to be unnecessary. The release
  invoice now carries **a line per withholding** rather than one aggregate line, per the ruling.
  Commit: the §1c unit on `feature/7g-quickbooks`; trace rewritten in `docs/specs/7g2-spec.md` §4.

- **#13 ✅ CLOSED [debt-split-and-ux; built S140/S158/S159]** — read-only detail/profile view for
  Contacts and Subs & Vendors. Entry was STALE: the row-click read-only view shipped for subs at
  S140, contacts at S158, unified into a matching sheet pattern at S159. Both list files carry
  "THE ROW IS THE WAY IN" headers naming #13/#108(c) as fixed; `ContactDetailSheet` /
  `SubcontractorDetailSheet` (desktop) + `m/contacts/[contactId]` (M-36) / `m/subs/[subId]` (M-27)
  (mobile) are all read-only, Floor-safe by schema (sub money moved to `subcontractor_financials`,
  S122). Closed on verification during the debt split; no build was required. **#108(a)/(b)**
  (did_not_finish read-back, closeout reason, rating history) remain OPEN — see `TECH_DEBT.md`.


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

## Reclassified from OPEN [S105b — item T, RULED Josh]

Moved here verbatim (by ordinal) from `TECH_DEBT.md` when the OPEN register was
reclassified: nothing owed — shipped, superseded, not-a-defect, won’t-fix,
documented-accepted, or accepted-by-ruling.

- **#1-delsweep — DMARC `rua` still points at `josh@worthprop.com` — the last WorthProp reference
  in the mail configuration.** The live record on the sending domain reads
  `v=DMARC1; p=none; rua=mailto:josh@worthprop.com` (`_dmarc.ezcontractorbinder.com`, resolved
  2026-08-30), so DMARC aggregate reports go to a WorthProp address while every other contact for
  this product is now `ezcontractorbinder@gmail.com` (`SUPPORT_REPLY_TO`, `b1b970e` — the monitored
  box; the sending domain is send-only).

  **⚠️ AMENDED [Email §4, 2026-08-30] — the "cosmetic" judgment did not survive the deliverability
  diagnosis.** _Superseded text, quoted not rewritten: "**Cosmetic** — reports still arrive, and
  nothing about authentication or delivery changes … Reports reach the WorthProp address today
  despite that, so the major reporters are evidently tolerant."_ **"Reports arrive" was never
  verified — no aggregate report has been produced from the inbox — and the DNS says they should
  not:** RFC 7489 §7.1 requires a reporter to confirm a cross-domain `rua` via a
  `<domain>._report._dmarc.<dest>` TXT record before sending, and
  `ezcontractorbinder.com._report._dmarc.worthprop.com` is **ENODATA** (re-confirmed 2026-08-30,
  twice, in both email diagnosis sessions). Gmail documents honoring this check, so the working
  assumption must be that **Gmail sends nothing today**, and the platform is flying without the one
  free signal of how the largest receiver judges a domain it is currently spam-foldering
  (`docs/specs/email-deliverability-diagnosis.md` §1e).

  **The two options, reported for Josh's ruling — DNS is his to change, in both:**

  1. **Publish the authorization record at `worthprop.com`:** one TXT,
     `ezcontractorbinder.com._report._dmarc.worthprop.com` = `v=DMARC1`. Keeps `rua` where it is;
     makes cross-domain delivery spec-compliant for every conforming reporter. Trade-off: the last
     WorthProp string in the mail configuration stays (the original complaint of this entry), and
     it couples the product's reporting to a second domain's DNS.
  2. _Superseded fix, quoted not rewritten: "one TXT record edit at Spaceship,
     `rua=mailto:ezcontractorbinder@gmail.com`."_ **Does not work:** the same RFC 7489 check would
     then need `ezcontractorbinder.com._report._dmarc.gmail.com`, **which cannot be published**
     (ENOTFOUND, checked 2026-08-30 — nobody edits gmail.com's zone). A gmail-box `rua` is only
     viable as a **same-domain** address that forwards, e.g. `rua=mailto:dmarc@ezcontractorbinder.com`
     — same-domain needs no authorization record at all — **but the sending domain deliberately has
     no inbox** (`SUPPORT_REPLY_TO` doc, `email-service.ts`), so this option carries the real cost
     of standing up a mailbox or forwarding alias on `ezcontractorbinder.com` first.

  Option 1 is one record Josh already controls; option 2's same-domain form is cleaner long-term
  and costs infrastructure. **Awaiting Josh's DNS edit; verify by an aggregate report actually
  landing before closing.** Filed alongside the other brand-string debt: cross-ref **#119** (the
  sender-address scheme on this same domain), **#123** (the last product-name string in `apps/web`
  — the same "last remaining reference" shape), **#126** (the record set published at the
  registrar; its closing test reads `Authentication-Results` for the same domain). Raised
  2026-08-30, amended 2026-08-30 (Email §4)
  (deletion-sweep §3).

- **#1-email — THE SAFETY-INCIDENT NOTIFICATION FANS OUT TO EVERY SUPERVISOR ABOVE THE SUBMITTER,
  AND NOBODY HAS RULED THAT IT SHOULD.** `app/api/safety-incidents/route.ts:141`
  (`sendIncidentNotifications`) mails one message per recipient returned by
  `computeIncidentRecipients` (`lib/services/incident-notify.ts:93`), which is **every profile in
  `owner`/`admin`/`project_manager`/`foreman` ranked ABOVE the submitter** (floor: an Owner-submitter
  still notifies Admin, so nothing is silent). In the four-person fixture tenant that is **three
  emails per incident**; on a real twenty-person company it is far larger, and it scales with the
  org chart, not with the incident.

  **This is a PRODUCT finding, not a test artefact, and it is filed rather than fixed on purpose.**
  It is the single largest contributor to the branch's 442 real fixture sends **precisely because
  the fan-out is wide** — `safety_incident` dominated the loop diagnosis
  (`docs/specs/email-loop-diagnosis.md`). ⚠️ **The §1 send gate HIDES this rather than resolves it:**
  once test mail is redirected to a Resend test address, the volume stops reaching an inbox but the
  fan-out is unchanged, so the count looks solved while the design question is still open. In
  production the gate does nothing to it at all.

  **Explicitly NOT changed here.** Who is told about an injury is a **safety** decision, not an
  email one — narrowing it (e.g. to direct-supervisor + owner, or a digest) could mean a real
  injury reaches fewer people, which is the opposite failure. Needs Josh's ruling on the intended
  audience before any change. Cross-ref the send gate (`email-service.ts`, `a0596db`) which bounds
  the blast radius without deciding the policy. Raised 2026-08-31 (Email §5).

- **#4-regbacklog — ✅ CLOSED [register close-out, S180] — duplicate token values folded (K8).**
  `warningDeep`/`dangerAlt` deleted; `warning`/`danger` kept; all 41 call sites rewritten
  (`00690df`), and the follow-up `6faa383` reworded a comment so `theme.ts` no longer contains the
  substring `brand` (the m6m-pwa A-26b4 guard). The register close-out audit confirmed: **no hex
  changed, no dangling `color.warningDeep`/`color.dangerAlt` reference remains in any code**
  (Tailwind config uses raw hex; `/m`, email and PDF templates carry none), and A-26b4 still holds.

  > ### ✅ CLOSED [S180] — `00690df` + `6faa383`
  >
  > _Superseded rationale, quoted rather than deleted — and it was WRONG._ The entry read:
  > _"**Both names were kept deliberately: a repaint is not a rename.**"_ and _"⚠️ **[S179] verified
  > still true:** … `warning`/`warningDeep` both `#b45309`, `danger`/`dangerAlt` both `#c0362c`."_
  >
  > ⚠️ **The "kept deliberately during a repaint" framing was a misread.** The two names **never
  > held distinct values** — there was no repaint in which one diverged and was later re-collapsed.
  > `warning` and `warningDeep` were identical (`#b45309`) from the moment the README ramp landed, as
  > were `danger`/`dangerAlt` (`#c0362c`); the "duplicate" was a paste of one value under two names,
  > not a design decision preserved through a re-colour. So the correct action was always the simple
  > one — pick one name, delete the other, sweep the consumers — and that is what K8 did. There was
  > never a divergence to protect. Recorded because the wrong framing is exactly what kept the fold
  > filed-but-unbuilt across multiple sessions.

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

- **#102 — ✅ CLOSED [S103], OBSOLETE.** The exact fix this entry proposed has shipped. A column-scope trigger `enforce_purchase_orders_column_scope()` + `CREATE TRIGGER purchase_orders_column_scope BEFORE UPDATE` (`supabase/migrations/20260809000000_financial_rls_floor_part3.sql:179-209`) RAISES `'A purchase order total is set through the PO total control, not edited directly.'` on any direct `total_amount` change unless the caller is Owner/Admin or inside an RPC (the transaction-local `app.po_total` flag set by `set_config`). Every PO path writes lines and lets the RPC recompute — the 18a convert/draft path (`po-lines-client.ts`, "Drafts never write total_amount"), `issue_po_lines` (`po_rpcs.sql:161-169`), and `setPoTotal`→`set_po_total_amount` (`payables-client.ts:440`); a grep finds **zero** direct `.update({ total_amount })`. _Superseded premise, quoted rather than deleted: "No column-scope trigger shipped." That posture (tighten-if-observed) was reversed by the Financial-RLS-Floor Tier-1 work._ Original entry preserved below.

- **#102** purchase_orders.total_amount can be written directly, bypassing the set_po_total_amount RPC, desyncing the PO's committed expense row. The live PO UPDATE policy lets PM edit open POs. Accepted in 7C v1: the RPC is the only UI path, so drift requires a hand-rolled API call. No column-scope trigger shipped. Fix shape: PO column-scope trigger pinning total_amount to the RPC. Cross-ref #93 (same tighten-if-observed posture). Observed Session 91.

- **#112** instrument_rates backdating floor is not concurrency-serialized — DOCUMENTED-ACCEPTED (Josh, S93 follow-up). Two simultaneous rate inserts for the same instrument+rate_type can both read the same `MAX(effective_from)` floor in `instrument_rates_backdating_guard` and both pass; the partial unique indexes block same-date duplicates but out-of-order interleavings are theoretically possible. Writers are Owner/Admin only and the action is rare, so no lock taken. Fix shape if ever needed: `SELECT ... FOR UPDATE` on the instrument parent row (estimates/change_orders) at the top of the trigger. Observed S93 follow-up.

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

- **#9 — ✅ CLOSED [S103] as STALE.** Already resolved by #1-s168's S175 closure: `invite-form.tsx:9` imports `INVITABLE_ROLES` from `@framefocus/shared` and builds `INVITE_OPTIONS` from it (`:31`); there is no local `const INVITABLE_ROLES`. Verified in current code. (⚠️ The bare stubs **#8** at line ~2088 and **#10** at ~2090 are likewise stale open duplicates of entries already CLOSED at ~2839/2840 — #8 fixed S76 `c5ac222`, #10 closed S76 as never-existed. Left in place, flagged here.) Original stub preserved below.

- **#9** `invite-form.tsx` has local `INVITABLE_ROLES` — should import from `@framefocus/shared`

- **#10** `invite-form.tsx` imports `Invitation` without `import type` — cross-boundary type import should use `import type`

- **#128 ✅ CLOSED [S122]** — `db:types` now runs `scripts/db-types.sh`, which generates to a **temp file** and only `mv`s it into place after three gates pass: the generator exited 0, the output clears a 500-line floor, and it contains `export type Database` plus three long-standing tables. `2>/dev/null` is gone, so the generator's stderr reaches the operator. **Proven in all four directions** by shimming `npx`: a failed generation, a one-line truncation and a 900-line partial each **exit 1 and leave `database.ts` byte-identical** (md5 `359e8f4a…` before and after all three); the happy path regenerated 6479 → 6479 lines at the same md5. For the record, the old form was demonstrated destroying a file and reporting success: `( false 2>/dev/null > demo.ts )` → **0 bytes, exit 0**. _Original entry retained below._

- **#128 (original entry)** `db:types` **silently truncates `database.ts` on failure and reports success.** The script is
  ```
  "db:types": "supabase gen types typescript --linked 2>/dev/null > packages/shared/types/database.ts"
  ```
  (`package.json:17`). Two independent faults compound. The shell performs `>` redirection **before** running the command, so the target file is truncated to zero bytes the instant the pipeline starts — the previous good contents are gone before generation is even attempted. And `2>/dev/null` discards the generator's stderr, so an expired token, a lost CLI link (a routine Codespace-rebuild casualty), or a network failure produces **no visible error**. The exit status is the redirect's, not the generator's. Net effect: a failed run leaves an empty or partial `database.ts`, the chained `npm run db:push` (`:16`) continues to `type-check`, and the failure surfaces later as hundreds of unrelated type errors — or, worse, as a committed truncated file. **Verify every regeneration by line count, md5 and a grep for a known symbol; do not trust the exit code.** Fix shape: drop `2>/dev/null`, generate to a temp file, and only move it into place when the command exits 0 and the output is non-empty. Observed Session 100.

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

- **#130 — ✅ CLOSED [S123] as NOT A DEFECT. The file stays; its fate is a separate decision.** A stale wordmark inside an unimported prototype is not a bug — nothing builds it, nothing imports it, and it ships to nobody. The entry existed so a rebrand audit that greps `apps/` and reports "clean" is not mistaken for having covered `docs/`. That purpose is served by the record, not by editing the file.

  **Explicitly NOT deleted, and not one line changed.** The original entry offered "fix is one line, or delete the file if the handoff is spent". Neither was taken, deliberately.

  **What the S123 deletion survey found, so the next cleanup pass does not rediscover it:**

  - **The file is byte-identical in two places** — `docs/handoffs/module-6-field-operations/FFNav.dc.html` and `docs/design/module-6/FFNav.dc.html` (`cmp` clean, `md5 20c7b38b`). **So the stale wordmark exists in BOTH**, and the one-line fix was always a two-line fix. A grep that finds one copy and stops will report a fix that is half-done.
  - **It is not just that file.** `docs/design/module-6/` is a byte-identical copy of the ENTIRE `docs/handoffs/module-6-field-operations/` directory — all four files, 2,425 lines, 140 K.
  - **Both paths are cited in live docs**, which is why this is not a free delete: `docs/specs/6B-1-spec.md:13` names `docs/design/module-6/` as the *"Design authority (read view)"*, and this entry itself named the handoffs path. Removing either breaks a live reference, and because they are identical, removing one does **not** resolve the wordmark in the other.
  - **Wider duplication in the same family:** `support.js` exists as **5 byte-identical copies** (1,841 lines each) and `ios-frame.jsx` as **3** (352 each) across `docs/handoffs/*` and `docs/design/module-6/`. Deduplicating to one copy of each is ~8,068 redundant lines / ~312 K — the single largest lean-repo win found, and independent of this entry.

  **⚠️ If the file is ever deleted, delete both copies or neither.** Fixing or removing one and leaving its twin is the failure mode this closure exists to prevent. **Deletion is a cleanup decision for Josh, tracked here as a candidate — not owed work.** Observed S100, closed S123.

- **#130 (original entry)** `docs/handoffs/module-6-field-operations/FFNav.dc.html:12` hardcodes the pre-rebrand wordmark as inline markup — `Frame<span style="color:#f59e0b">Focus</span>` — so it cannot be caught by a plain string grep for the old product name in the way a normal literal would. **Prototype only, and genuinely low priority:** it is a design handoff artifact, is not built, is not imported, ships to nobody, and the handoff's own README already says the `.dc.html` files are design references rather than production code. Recorded so a rebrand audit that greps `apps/` and reports "clean" is not taken as covering `docs/`. Fix is one line, or delete the file if the handoff is spent. Observed Session 100.

- **#57** Empty migration file `20260415182317_add_tag_options_table.sql` — kept in repo intentionally because it was applied to remote (accidental double-create during Session 29). Won't fix; documented for clarity.

- **#146** **Punch VERIFY's rules live in TypeScript, and RLS accepts a direct UPDATE that breaks them — ACCEPTED AS SERVICE-LAYER, NO TRIGGER OWED. RULED [Josh, S122].** Re-filed from #141's residue, which is otherwise closed.

  **What the code actually enforces.** `punch-client.ts:182-211` holds four rules for moving an item to `status='verified'`: the **Foreman+ floor** (crew excluded), the **`requires_verification`** check, the **`status='complete'`** precondition, and the **separate-eyes** rule (the verifier may not be the completer). All four are TypeScript. RLS's `punch_list_items_update_authenticated` is a **row**-level predicate and accepts a direct UPDATE setting `status='verified'` regardless of any of them.

  **Why this is not a hole in the sense #141 was.** #141's defect was a subcontractor reading and writing rows on a project they had no business seeing — a row-level question, which is what a row-level policy expresses, so it was fixed with a policy. This is a **column-level state-machine** question: "may THIS role move THIS column from THIS value to THAT one, given who set a different column." **RLS cannot express that without a trigger** — `WITH CHECK` sees the proposed row but not the prior one, so the `complete → verified` transition and the separate-eyes comparison are both out of reach.

  **The ruling: the service layer is accepted here, and no trigger is owed.** Reasons, so this is not re-opened as an oversight: (a) exploiting it requires a **hand-crafted PostgREST call** — no UI path reaches it, and the caller must already be an authenticated member of the company with write access to that project, so the population able to do it is the population already trusted with the record; (b) the consequence is a **wrongly-verified punch item**, which is recoverable and visible in the row's own audit columns, not a disclosure and not a financial write; (c) a trigger here would have to encode the whole verify state machine in plpgsql and **keep it in step with `punch-client.ts` forever**, and two implementations of one state machine is the drift this register is full of.

  **This matches **#82** exactly** — the punch-complete project gate, also service-layer-only, also ruled deliberate, also documented as such in CLAUDE.md rather than left implicit. Treat the two together: **if a trigger is ever built for one, build it for both**, because they are the same decision about the same table family and splitting them is how one silently becomes the exception.

  **What would reopen this:** a UI or API path that reaches the transition without going through `punch-client.ts`, or verify acquiring a financial or client-facing consequence. Pre-existing and desktop-wide; observed S108, ruled S122.

- **#3-trial** **"Deleted" leaves the company row standing, with its NAME on it — and until S138 the job reported a clean completion anyway.** Raised S138 (2026-08-12). Provisional id, same rule as #1-trial.

  **Found by RUNNING the deletion job for the first time.** S137's log said "the job exists, is tested"; what was tested were its exclusion *lists*. `runTrialDeletion()` had never been executed. `apps/web/test/s138-trial-deletion-run.live.ts` executes it against a company built to be destroyed, and the first run destroyed every tenant row, every storage object and the auth users — then **left `companies` in place and returned `completed: 1`**, because the error from the parent delete was discarded.

  **The cause is structural, not a typo.** Five tables on the `SURVIVES` list hold a plain `REFERENCES companies(id)` with no on-delete action, so the parent delete is RESTRICTed by exactly the rows the ruling says must outlive the tenant: `email_logs`, `trial_lifecycle`, `trial_warning_acknowledgements`, `deletion_jobs`, `export_jobs`. `trial_lifecycle` cannot even be nulled out of the way — `company_id` is its primary key and it is where `deleted_at` lives.

  **What S138 fixed, and what it deliberately did not.** Fixed: the job is now honest. It checks the error, records `tenant data deleted, but the companies row remains: …` on the `deletion_jobs` row, marks the job `stopped` (needs a human), and counts `companyRowsRemaining` in its outcome so this can never again be reported as a completion. **Not fixed:** whether the shell *should* survive. That is a ruling, it sits directly under TL-24, and the two answers are meaningfully different — **(a)** accept a tombstone and say so in the customer-facing wording (the company NAME survives deletion, which is a privacy statement, not an implementation detail), or **(b)** make the audit tables tolerate an absent parent (`ON DELETE SET NULL` where the column is nullable, and a different home for `trial_lifecycle.deleted_at`).

  **Do not close this by changing the FKs without answering (a) vs (b).** The probe asserts the shell REMAINS; if it ever starts passing with the row gone, the ruling has been made implicitly by whoever edited the constraints.

  **✅ CLOSED [deletion-sweep session, 2026-08-30] — (b) was RULED, explicitly, not implicitly.** Josh, Phase 3 on `docs/specs/deletion-sweep-analysis.md` Q2: *"refactor. SET NULL the five audit FKs and rehome trial_lifecycle.deleted_at. The published text says 'not hidden, not archived' — a surviving row carrying the company name contradicts a legally-reviewed document. Change the code, not the sentence."* Shipped as `20261054000000_deletion_shell_unpinned.sql` (the four audit FKs → `ON DELETE SET NULL`; `trial_lifecycle` keeps `deleted_at` and DROPS its FK, since `company_id` is its PK). Two latent `profiles` pins were found and fixed in the same migration: `export_jobs.requested_by` and `trial_warning_acknowledgements.profile_id`. The probe was rewritten per the S157 rule with the superseded assertions quoted (`s138-trial-deletion-run.live.ts`): it now asserts the row is GONE, and the run **completes** — proven 13/13 on rebuild-test, including a full-census scan and a spared-company negative case.

- **#2-trial ✅ BUILT [S138]** — the export exists. `lib/trial/export.ts` (chunked by self-contained `part-NNN.zip`, cursor-resumed), `lib/trial/export-sweep.ts` (the worker plus the 24-hour sweep), `POST /api/trial/export`, `GET /api/trial/export/[id]`, `GET /api/cron/export-worker` (scheduled `*/5`), and `/dashboard/trial/export`. `fflate` is the zip dependency. Evidence: `export.test.ts` 12/12 and `s138-trial-export.live.ts` 6/6, which writes real rows, runs the real sweeper and reads the entries out of the real zip in the real bucket.

  **TL-1 is now reproducible**, which was the substantive complaint below: `scripts/measure-export-throughput.mjs` is committed and refuses to run anywhere but rebuild-test. Re-measured S138 — 62 files, 28.41 MB, 15.20 s → **1.87 MB/s**, large case ≈ 2.7 h, ~61× margin on the 168 h window, ~42 invocations. S137's 1.07 MB/s was the conservative figure; the conclusion is unchanged. _Original entry retained below._

- **#2-trial (original entry)** **The trial EXPORT is specced and measured but NOT BUILT.** Raised S137 (2026-08-12). Provisional id, same rule as #1-trial.

  `export_jobs` and the private `exports` bucket exist; the job that fills them does not, and no zip dependency has been added. The spec's `input → store → output` trace (§4) is written and is what a build should follow.

  **TL-1 is settled and does NOT change a ruling.** Measured on rebuild-test — 61 files, 28.19 MB, sequential through the service role: **1.07 MB/s, 0.434 s/file**. Extrapolated to Josh's stated shape (15–20 projects; thousands of photos; 50+ page blueprint sets): a small company ≈ **5 minutes**, a mid one (~2k files, 4 GB) ≈ **64 minutes**, a large one (~8.5k files, 18 GB) ≈ **4.8 hours**. Against the **7-day** pre-expiry export window that is a ~35× margin, so the window is not the binding constraint and no ruling has to move.

  **What IS binding is Vercel's `maxDuration = 300`.** A large export needs roughly 58 invocations at five minutes each, so the job must chunk and resume across invocations — which is why `export_jobs.cursor` exists. Method stated so the number can be challenged: sequential, single connection, from a Codespace; parallel downloads would improve it and production egress may differ.
