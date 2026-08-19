# SYSTEM-AUDIT.md — the whole-system audit, accumulated

> **Created S151, 2026-08-18. This file is EXTENDED by every pass and rewritten by none.**
>
> **If you are starting a pass: read §0 first.** It exists so pass N+1 extends this document
> rather than inventing a twelfth format.

---

## §0 — How this works

**Eleven passes. Each takes ONE module as its subject and checks it against EVERY other module.**
By the end, every module has been the **subject** once and a **consumer** ten times.

The asymmetry is the point. A module's own pass asks *"is this well built, and what does it break
elsewhere?"* — the other ten ask *"what does this module assume about the subject, and is that
assumption still true?"* A defect that a module's own authors cannot see is usually visible from
the module that consumes it.

### What this audit is about

**The software: does it work, is it fast, is it well built, will it hold up, and what does it
break elsewhere.** Doc-vs-schema drift is in scope and is the *least* important axis. This is
deliberately a different audit from `S150-m7-completion-audit.md`, which reconciled documents
against schema and said so.

Josh's framing, kept verbatim so it does not drift across eleven passes:

> _"less concerned about drift between docs and schema… more concerned about the functionality of
> the software, plus the speed, quality, and durability. However, I think everything should be
> covered."_

### The six axes, in priority order

| # | Axis | What it asks |
| --- | --- | --- |
| **1** | **Cross-system impact** — *primary* | Who consumes the subject, what do they assume, and is it still true? Where does another module WRITE to a table it does not own? |
| 2 | Functionality | Does each feature work end to end? Prove it with a live test where possible; **say "unverified" and why** where not. |
| 3 | Speed | Split: *statically inferable* (N+1, missing indexes, unbounded SELECTs, sequential awaits) vs *not inferable* (page-load, render). **Never estimate the second.** |
| 4 | Quality | Swallowed errors, missing row-count guards, `.limit(1)` with no `ORDER BY`, duplicated logic, import-boundary violations `tsc` misses, dead code. |
| 5 | Durability | RLS gaps; **policies that refuse by ABSENCE rather than by rule**; money paths without coverage; missing FKs; nullable columns the code assumes non-null; races; UI-only enforcement that belongs in the database. |
| 6 | Drift | Doc-vs-schema. Lowest priority. Include it. |

### Standing rules for every pass

- **Verify against `pg_proc`, `pg_policies` and `information_schema` — never migration files.** A
  later migration supersedes an earlier body and specs here cite superseded ones. S143 shipped a
  defect on exactly that.
- **`scripts/live-sql.mjs` is read-only and rebuild-test-only.**
- **`STATE.md`'s module table is badly stale** — it lists M5 and M6 as "not started" when both
  shipped. Establish a module's surface from the repo, never from that table.
- **Live tests are the strongest evidence available.** Write them. But check them for *vacuous
  passes* — the M9 interview audit found every "client reads 0" probe passing because no client
  could reach anything at all. **Assume that shape exists elsewhere and look for it.**
- **Findings and proposals only.** No application code, service or schema changes during a pass.
  Test files and audit documents are the only things a pass commits.

### Where a pass writes

- **Its own findings** → `docs/specs/S<session>-m<N>-audit.md`.
- **This file** → extend §1 (dependency map), §2 (coverage ledger), §3 (contradictions).

---

## §1 — System dependency map

> Extended by every pass. A row is added when a pass establishes it **from the repo**, not from a
> spec. "Assumes" is the part that matters — it is what a later pass checks against reality.

### §1.1 — Module 1 (Settings, Admin & Billing) — filled S151

**M1 owns:** `companies`, `profiles`, `company_members`, `invitations`, `subscriptions`,
`platform_admins`, `trial_lifecycle`, `trial_emails`, `deletion_jobs`, `export_jobs`, and the
role helpers `get_my_role()` / `get_my_company_id()` / `get_my_member_id()` / `is_platform_admin()`.

**⚠️ `companies` is the platform's configuration god-object: 73 columns [LIVE].** Nine modules have
hung settings on it. This is the single most important structural fact about M1 and it is what
makes M1 a consumer-of-everything as well as a dependency-of-everything.

> **[S152] 72 → 73.** `updated_by` was added so `companies_set_updated_by` — the trigger CLAUDE.md
> mandates for every per-tenant table — could exist at all (**M1-06**). The god-object is
> **recorded and not restructured** [RULED Josh, S152]; the measurement establishes it is a
> *boundary* problem and not a performance one (the table holds one row per tenant), with the
> QuickBooks block named as the one seam a side-table split could follow. See
> `S152-rls-helper-measurement.md` §6.

| Consumer | Reads from M1 | Assumes | Verified S151 |
| --- | --- | --- | --- |
| **Every module's RLS** | `get_my_role()`, `get_my_company_id()` | one profile per auth user; a resolvable role | ✅ backed by `profiles_user_id_key`; fails **closed** on soft-delete. **[S152] COST MEASURED: 11.1–11.3 µs per call, invoked PER ROW in 268 of 273 policies** — see `S152-rls-helper-measurement.md` |
| **M6/M7 RLS + punch, expenses, time** | `get_my_member_id()` | one member row per profile | ✅ backed by `idx_company_members_profile_id` (UNIQUE, partial). **[S152] 15.7 µs/call** |
| **31 tables' RLS (58 policies)** | `can_view_project(project_id)` | a per-row visibility test | ⚠️ **[S152] 636.6 µs per call — 67× the others, and NOT hoistable (row-varying argument). 96% of all measured policy cost.** M1 owns the helper; the cost lands in M5/M6/M7. |
| **M4 estimating** | `default_*_markup_percent`, `default_*_margin_percent`, `default_tax_rate`, `default_pricing_mode`, `default_labor_rate`, `estimate_number_prefix`/`_sequence`, `default_terms_sections`, `default_expiration_days`, `default_proposal_*` | nullable defaults are optional | not re-verified this pass |
| **M6 time tracking** | `timezone`, `week_starts_on`, `ot_threshold_hours`, `breaks_paid`, `paid_break_cap_minutes`, `gps_clock_mode` | all NOT NULL with defaults | ✅ all NOT NULL [LIVE] |
| **Platform-wide date logic** | `timezone` (**70 files**) | never UTC; falls back to `America/New_York` | NOT NULL + default ✅; **13 sites still derive UTC** — `#116`, pre-existing |
| **M7A job cost** | `fixed_burden_per_hour`, `gl_account_*` | nullable; burden is forward-only | not re-verified this pass |
| **M7D invoicing** | `invoice_number_prefix`/`_sequence` | NOT NULL | ✅ [LIVE] |
| **M7F lien releases** | `name`, address block, `license_number`, `signatory_name`/`_title`, `contractor_signature_path`, `timezone` | may be NULL; generate route degrades | partially — `s146-generate-route` covers the NULL signatory path |
| **M7G QuickBooks** | `qb_*` (10 columns) | `qb_connection_state` NOT NULL | ✅ [LIVE] |
| **M7I contracts** | `client_contracts_enabled`, `signatory_*`, `contractor_signature_path` | toggle off ⇒ byte-identical behaviour | flag has zero `app/` readers (7I criterion 1) |
| **M5 change orders** | `contractor_signature_path`, `name`, `slug`, `logo_url`, `brand_color` | signature path may be NULL; send route gates on it | ✅ gated at `api/change-orders/[id]/send/route.ts:121` |
| **M9 client portal** *(unbuilt)* | `logo_url`, `name` (branding, `9-spec.md` §11/R20) | branding swaps after auth | **`logo_url` is nullable and M9 is unbuilt** — flagged, not a defect yet |

**Downstream WRITES into M1's tables** (a module writing a table it does not own):

| Writer | Writes | Guarded? |
| --- | --- | --- |
| M7I `contracts-client.ts:466` `setClientContractsEnabled` | `companies.client_contracts_enabled` | ✅ row-counted. ~~⚠️ does **not** set `updated_at`~~ — **that was WRONG, corrected [S152]:** `companies_updated_at` has always stamped it. See **M1-06**. |
| Stripe `api/stripe/checkout/route.ts:70` | `companies.stripe_customer_id` | server route |
| Stripe `api/stripe/webhook/route.ts:98` | `companies.stripe_customer_id` | server route |

### §1.2 — Module 2 (Contacts & CRM) — filled S153

**M2 owns:** `contacts`, `contact_addresses`, and `project_contacts` (the project↔contact junction).

**⚠️ If M1 is the table everything writes config INTO, M2 is the table everything POINTS AT.**
Contacts are the counterparty identity for estimating, projects, invoicing, contracts and the
unbuilt portal. **Nine foreign keys land on M2 [LIVE].**

| Consumer | Points at | Assumes | Verified S153 |
| --- | --- | --- | --- |
| **M4 estimating** | `estimates.contact_id` (NOT NULL), `estimates.contact_address_id` (nullable) | a contact exists and has an address | FK `NO ACTION` both ✅. Address picker feeds `contact_address_id` from `listAddressesForContact()`, which **returns `[]` on error** — M2-07 |
| **M5 projects** | `projects.contact_id` (NOT NULL), `projects.contact_address_id` (nullable), `project_contacts.contact_id` | same | FK `NO ACTION` ✅ |
| **M5 change orders / proposals** | `contacts.email` via `proposal-data.ts:272` | **an email exists** | ⚠️ **nullable, unconstrained — M2-04.** Printed unguarded into a client-facing PDF |
| **M4 proposal SEND** | `contacts.email` | an email exists | ✅ **guarded** — `api/proposals/send/route.ts:79` refuses first |
| **M7D invoicing** | `client_payments.contact_id`, `client_refunds.contact_id` (both NOT NULL) | contact is durable | FK `NO ACTION` ✅ |
| **M7D reminders** | `client_reminder_settings.contact_id` | — | FK **CASCADE** |
| **M7F lien releases** | `projects.contact_address_id` → address block | address may be NULL | reads by id without an `is_deleted` filter — **correct** per the trash-bin convention (V6) |
| **M7I contracts** | `estimates`/`projects.contact_address_id` | may be NULL | ✅ **refuses to render** rather than printing a blank required field (`contracts-shared.ts:129`) — the discipline other consumers lack |
| **M9 client portal** *(unbuilt)* | `contacts` as the client counterparty; `9-spec.md` §3 R1 *"username is the email"*, R3 *"several contacts per project"* | **every client contact has an email** | ⚠️ **M2-04.** A client contact with no email cannot be invited, and nothing prevents one |
| **M7G QuickBooks** | `contacts.qb_customer_id` | — | column exists with **zero application writers** [REPO] — scaffolding |

**Downstream WRITES into M2's tables:**

| Writer | Writes | Guarded? |
| --- | --- | --- |
| M5 `project-contacts-client.ts:50` | inserts a `contacts` row (inline contact-create) | ✅ `.insert(...).select('id').single()` — an RLS refusal surfaces |

**One write, and it is guarded — M2's ratio is 1 of 1**, against M1's 1 of 8.

~~**⚠️ M2's own writers are the problem, not its consumers': 0 of 3 UPDATE-shaped writers carry a
row-count guard** (M2-03), and **soft delete does not work at all** on `contacts` or
`subcontractors` (M2-02).~~ **✅ BOTH FIXED [S154].** All three writers row-count through the shared
`applied()`/`DISCARDED`, and soft delete works on both tables with the row restorable.

**[S158] Two amendments to the paragraph above, from the click-test on the merged result.**

1. **"All three writers" was true of `contacts-client.ts` and NOT of `subcontractors-client.ts`.**
   That file's `updateSubcontractor()` and `deleteSubcontractor()` checked `error` and nothing else,
   so a foreman, crew member, subcontractor or client — every role outside
   `subcontractors_update_authorized` — was told a write had happened over zero rows. The S154 pass
   fixed the table its findings named and not its twin. **All three writers in that file are guarded
   now**, not only the one the finding would have named; a file that teaches both patterns is the
   M1-01 shape. Proof: `s158-trash-restore.live.ts` C1/C2.
2. **"the row restorable" was true of the DATABASE and of no surface in the product.** From S154 to
   S158 a soft delete was indistinguishable from a hard one *for the user*: the row left the list
   and nothing listed it. `S153-m2-audit.md` §1 had said so — *"there is no
   `getTrash()`/`listDeleted()` for contacts at all, so no trash UI exists to restore into"* — and
   the fix pass closed the policy half only. **`getDeletedContacts()`, `getDeletedSubcontractors()`,
   `restoreContact()`, `restoreSubcontractor()` and two `/trash` routes close it.** No migration:
   every policy this needed shipped in `20261005000000`.

   ⚠️ **The generalisable half.** A restorable row and a restore flow are different deliverables,
   and a pass that fixes RLS can report the first while shipping neither. CLAUDE.md's trash-bin
   pattern names **three** functions — list, by-id, and `getTrash()` — and M2 had shipped two of
   them for a year. **When a module claims the trash-bin pattern, count the functions.**

### §1.2a — NEW EDGE [S154]: M2 → M5/M6, the assignment-scoped site address

**`contact_addresses` is no longer read by role alone.** `contact_addresses_select_scoped` now has a
second arm that reaches **through M5 and M6** to decide visibility:

| Reader | Sees | Resolved through |
| --- | --- | --- |
| owner / admin / PM / foreman / crew | every company address | `get_my_role()` — the S131 floor |
| **`subcontractor`, ASSIGNED** | **exactly `projects.contact_address_id` for their assigned projects** | `my_assigned_site_address_ids()` → `project_assignments` (M6) ⋈ `projects` (M5) |
| `subcontractor`, unassigned · `client` | nothing | — |

**⚠️ What this means for M5 and M6's own passes.** A change to either table now moves an M2
visibility boundary:

- **`project_assignments` (M6)** — adding, soft-deleting or re-scoping an assignment grants or
  revokes an address. `s154-m2-fixes.live.ts` **B2d** pins that it tracks assignment rather than
  having been satisfied once.
- **`projects.contact_address_id` (M5)** — repointing a project's site address moves what its
  assigned subs can read. It is nullable; null means the sub sees nothing, which is the correct
  degradation.
- **The grant deliberately does NOT go through `can_view_project()`**, which would have cost 636 µs
  per row. It is a 0-argument set-returning function so `id IN (SELECT …)` hoists — see §3's S154
  entry.

---

### §1.3 — Module 3 (Document & File Management) — filled S155

**M3 owns:** `files`, the `project-files` bucket, and — uniquely — **a SECOND ENFORCEMENT SURFACE.**

**⚠️ Every other module is guarded by one thing: RLS on its tables. M3 is guarded by two —
`files` RLS and `storage.objects` RLS — written in different migrations, in different shapes
(a category-and-project floor over a row, versus a regex over a folder path), with nothing keeping
them in agreement. They do not agree (M3-01).**

**23 foreign keys point at `files` [LIVE]** — the widest fan-in in the system.

| Consumer | Points at | Assumes | Verified S155 |
| --- | --- | --- | --- |
| **M7D invoicing** | `files` rows, category `invoices` | the Financial Visibility Floor withholds them below owner/admin (PM excepted) | ✅ on the TABLE · ⚠️ **NOT on the bucket — M3-01** |
| **M5 change orders**, **M7I contracts**, **M7F lien releases** | `files` rows in floored categories | same | ✅ both surfaces — their paths are not project-scoped, so storage fails closed |
| **M6 daily logs, deliveries, safety, punch, photos** | `files` via five optional parent FKs | project-scoped visibility | ✅ consistent — these categories are not floored on either surface |
| **M4 estimating** | `estimate_files` (CASCADE), `signed_proposal_file_id`, `signed_contract_file_id` | a signed PDF persists | ✅ `SET NULL`/`NO ACTION` — a deleted file never takes a contract with it |
| **M9 client portal** *(unbuilt)* | `files.client_visible` | the flag gates client file access | ⚠️ **nothing reads it for access control — M3-06.** Inert today because both policies refuse `client` outright |
| **M3H AI tagging** | `ai_tag_logs.file_id` (`SET NULL`) | cost rows survive a file delete | ✅ per the append-only-log convention |

### §1.4 — Module 4 (Sales & Estimating) — filled S156

**M4 owns:** `estimates` and its six child tables, `signing_sessions`, and **the only
unauthenticated write path in the platform** — `/sign/[token]`.

| Edge | Direction | Verified S156 |
| --- | --- | --- |
| **M4 → M5/M7 via `convert_estimate_to_project`** | the widest blast radius in the system; **redefined six times** | ✅ **live body byte-identical to E1's migration** (md5 `13b0a5a4…`) — no drift, the S143 class is clean here |
| **M4 → M2** (closing the edge from M4's side) | `estimates.contact_id` NOT NULL, `contact_address_id` nullable | consumers resolve contacts **by id** without an `is_deleted` filter — correct per the trash-bin convention (S153 V6). The send routes guard a null email (`send:79`); `proposal-data.ts:272` does not — **M2-04's consequence, filed there** |
| **M4 → M3** | `signed_proposal_file_id`, `signed_contract_file_id`, `estimate_files` | ✅ FK rules safe (§1.3) |
| **M4 → M7I** | nine 7I columns on `estimates` | ✅ off by default, **zero `app/` readers** of `clientContractAppliesToEstimate()` — criterion 1 holds |
| **`signing_sessions`** | one SELECT policy, owner/admin; all writes service-role | ✅ the token is the capability, and that is the correct pattern — **do not add write policies** |

**⚠️ M4 is the counter-example to the row-count-guard pattern.** M1 shipped 1 of 8 writers guarded,
M2 0 of 3, M3 0 of 4 — **M4 is 6 of 6.** Recorded here because four passes of the same finding would
otherwise read as a platform-wide indictment. It is three modules and one counter-example.

---

## §2 — Coverage ledger

> **This is what makes "everything checks against everything" verifiable instead of aspirational.**
> Each cell is one directed edge: **row = subject, column = the module it was checked against.**
> A pass fills its own row, and fills its own column as far as that pass legitimately established
> the other direction.
>
> Legend: `S` examined from the **subject's** side · `C` examined from the **consumer's** side ·
> `✓` both · `—` not yet examined · `n/a` module unbuilt.

| subject ↓ / vs → | M1 | M2 | M3 | M4 | M5 | M6 | M7 | M8 | M9 | M10 | M11 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **M1 Settings/Admin/Billing** | — | **✓** | **✓** | **✓** | S | S | S | n/a | S | — | — |
| **M2 Contacts & CRM** | **✓** | — | **C** | **✓** | **S** | — | **S** | n/a | **S** | — | — |
| **M3 Documents & Files** | **✓** | **C** | — | **✓** | **S** | **S** | **S** | n/a | **S** | — | — |
| **M4 Sales & Estimating** | **✓** | **✓** | **✓** | — | **S** | — | **S** | n/a | — | — | — |
| **M5 Project Management** | — | — | — | — | — | — | — | — | — | — | — |
| **M6 Team & Field Ops** | — | — | — | — | — | — | — | — | — | — | — |
| **M7 Job Finances** | — | — | — | — | — | — | — | — | — | — | — |
| **M8 Inventory & Tools** | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| **M9 Client Portal** | — | — | — | — | — | — | — | — | — | — | — |
| **M10 Reporting** | — | — | — | — | — | — | — | — | — | — | — |
| **M11 AI Marketing** | — | — | — | — | — | — | — | — | — | — | — |

**Passes 3 and 4 (M3, M4 — S155/S156) notes:**

- **M1↔M3, M1↔M4 are `✓`** — both passes read M1's role helpers and `can_view_project()` from the
  consumer side, and M3-01's storage policy is built on M1's `profiles` lookup inline (the same
  hoisted-by-accident shape §3 records for M2).
- **M2↔M4 is `✓`** — M2's pass examined the edge from M2's side; M4's closed it from M4's, confirming
  the by-id contact resolution is correct and locating M2-04's one unguarded consumer.
- **M2↔M3 and M3↔M2 are `C`, not `✓`** — M3's pass established that `files` has no contact edge and
  M2's established none to `files`. **Neither looked hard**; recorded honestly rather than upgraded.
- **M3↔M4 is `✓`** — from both sides: M4's signed PDFs are `files` rows, and M3's FK map confirms the
  delete rules protect them.
- **M6 is `S` from M3** and unexamined from M4. M3's markup/photo surfaces are M6's UI, and
  **`#129`'s two markup editors were NOT re-probed this pass** — that belongs to M6's pass.

**Pass 2 (M2, S153) notes on its own row:**

- **M1↔M2 is `✓` — examined from both sides.** From M2's side: `contacts`' policies are the one
  place in the repo that **inlines** `get_my_company_id()`/`get_my_role()` instead of calling them,
  which both duplicates M1's logic (a drift risk) and, by accident, runs ~65× faster (§1's M2 row,
  and `S153-m2-audit.md` §5). M2 also inherits M1's `#1-s146` defect shape wholesale — the guard
  S152 added to all eight `companies` writers reached none of M2's three.
- **M3, M6, M10, M11 are `—`.** No M2 dependency was established for them, which is weaker evidence
  than having looked. **M6 in particular is not obviously empty** — field surfaces may reach a
  contact — and its own pass should close this from the consumer side.
- **M9 is `S`, as it was for M1** — read from `9-spec.md` only, since there is no consumer code.
  M9's dependency on M2 is sharper than its dependency on M1: **its entire identity model rests on
  a contact having an email.**

**Pass 1 (M1, S151) notes on its own row:**

- **M3, M10, M11 are `—` and that is a gap, not an absence of risk.** M1's pass established M1's
  consumers by grepping for readers of M1 tables; M3/M10/M11 produced no hits, which is weaker
  evidence than having looked at them. Their own passes must close this from the consumer side.
- **M8 is `n/a`** — Inventory & Tools is unbuilt (no tables in the live schema).
- **M9 is `S`, not `✓`** — checked from M1's side against `9-spec.md` only. M9 is unbuilt, so
  there is no consumer code to check from the other direction.
- **The M1 column is empty by construction.** Passes 2–11 fill it as each module is examined
  against M1.

---

## §3 — Contradictions between passes

> **Empty at S151.** The structure exists so pass 2 has somewhere to put a disagreement instead of
> silently overwriting pass 1.
>
> **When a later pass disagrees with an earlier one, record it here — do not edit the earlier
> pass's finding.** State both readings, which evidence each rests on, and which is believed
> correct. The repo's convention is that superseded text is quoted rather than deleted, and that
> applies across passes as much as within a document.

**[S156] — PASS 4 CONTRADICTING A PATTERN THREE PASSES HAD ESTABLISHED.**

Passes 1–3 each found the same defect and the tally read as a platform property: **M1 1 of 8 writers
row-counted · M2 0 of 3 · M3 0 of 4.** S155's own document put it as *"the shared helper existing has
not been enough"* and asked whether to stop the class.

**M4 is 6 of 6.** Every UPDATE-shaped writer in `estimates-client.ts` ends `.select('id')` and reads
`data.length`. The S156 probe was written to assert the defect and went red twice before the cause
became clear.

**What this changes:** the class is **not** platform-wide, and a lint rule proposed on the strength of
three modules would have been proposed on an incomplete count. M4 also shows the fix predates the
shared helper — those writers hand-roll the check because `mutation-result.ts` did not exist when
they were written. **Later passes should count before concluding.**

---

**[S155] — A SECOND ENFORCEMENT SURFACE, which no earlier pass had to consider.**

Passes 1 and 2 could treat "the database decides" as meaning one RLS policy per table. **M3 breaks
that assumption**: `files` and `storage.objects` are both authoritative, for the same asset, and they
disagree about categories (M3-01).

**Consequence for every later pass:** *authority belongs in the database* is not satisfied by finding
one correct policy. **Where bytes are involved, there are two policies and they must be read
together.** M6 (photos, markup) and M7F/M7I (generated PDFs) all sit on this surface.

---

**[S154] — A FIX PASS CONFIRMING PASS 1's CORRECTED READING, from the other direction.**

Pass 1 established that `(SELECT helper())` hoists a zero-argument helper and that
`can_view_project(project_id)` cannot hoist because its argument varies per row. **S154 is the first
chance anyone has had to write a new visibility predicate with that knowledge in hand**, and it holds:

| rows | control | B2's `id IN (SELECT my_assigned_site_address_ids())` | delta |
| --- | --- | --- | --- |
| 1,002 | 0.52 ms | 5.36 ms | **4.85 ms** |
| 10,002 | 3.15 ms | 6.83 ms | **3.69 ms** |
| 30,000 | 9.40 ms | 13.36 ms | **3.96 ms** |

**Flat across a 30× row increase.** The naive form — `is_assigned_to_project(project_id)` per row,
measured at 71 µs each here — would have cost roughly **2.1 s** on a 30,000-row scan.

**Not a contradiction; a confirmation, and the first worked example.** Recorded here because §3 is
where a later session looks for how an earlier reading held up.

---

**[S153] — PASS 2 REFINING PASS 1. Not a contradiction of fact; a contradiction of implication,
which is the more dangerous kind because nobody goes looking for it.**

| Pass 1 said | Pass 2 found | Evidence |
| --- | --- | --- |
| *"266 of 273 policies call a `get_my_*` helper and **NONE** uses the hoistable `(SELECT …)` form."* — literally true, and it reads as *"no policy anywhere is hoisted."* | **M2's INSERT and UPDATE policies are already hoisted**, because they **inline the `profiles` lookup as an uncorrelated subquery** instead of calling the helper. Measured 10k rows: **2.36 ms inline vs 153.9 ms helper** — Postgres evaluates it once per query. | `S153-m2-audit.md` §5 [LIVE] |

**Why this matters rather than being trivia:** pass 1's conversion plan was written as though the
fast pattern did not exist anywhere in the repo. **It does, it shipped, and it is the precedent to
copy.** It also shows the cost is not evenly spread — `contacts` carries the **slow** form on its
SELECT policy (the hot path) and the **fast** form on its writes.

⚠️ **And it does not make the duplication acceptable.** M2's policies restate M1's helper logic, so
a change to `get_my_role()` will never reach them. The right end state is the helper **wrapped**,
`(SELECT get_my_role())` — fast *and* single-sourced. M2 demonstrates the speed; it is not the
model for how to get it.

---

**[S152] — a FIX PASS disagreeing with pass 1, recorded here because the shape is the one §3 is
for, even though S152 is not pass 2.**

| Earlier claim | Where | Corrected reading | Evidence |
| --- | --- | --- | --- |
| *"toggling client contracts on or off never advances `updated_at` on the company row"* | S151 **M1-06** | **False.** `companies_updated_at` already existed and stamps `updated_at` unconditionally. Only `companies_set_updated_by` was missing. | `pg_trigger` [LIVE, S152] |
| *"The direction is not in doubt; the size is"* — i.e. wrap the helpers and the only question is how many | S151 **M1-04** | **The direction WAS in doubt.** `(SELECT …)` cannot hoist `can_view_project(project_id)` because the argument varies per row — 554 ms bare vs 576 ms wrapped. The naive conversion would have left 96% of the cost in place. | `S152-rls-helper-measurement.md` §3 |

**Both had the same root cause, and it is worth naming for later passes:** each was read from a
*document* (`CLAUDE.md`'s holdover note; the general advice that RLS helpers should be wrapped)
rather than from the system. §0's standing rule — *verify against `pg_proc`, `pg_policies` and
`information_schema`, never migration files* — should be read as covering **prose about the system
as well as migrations**.

---

## §4 — Provenance

| Pass | Subject | Session | Findings document | Live evidence |
| --- | --- | --- | --- | --- |
| 1 | Module 1 — Settings, Admin & Billing | S151, 2026-08-18 | `docs/specs/S151-m1-audit.md` | `apps/web/test/s151-m1-audit.live.ts` (6/6) |
| 1-fix | Module 1 — fix pass for pass 1's §4 | S152 | `S151-m1-audit.md` §0a (outcomes) · `S152-rls-helper-measurement.md` (Group D) | `s152-m1-fixes.live.ts` (11/11) · `s152-cron-absence.test.ts` (4/4) |

| 2 | Module 2 — Contacts & CRM | S153, 2026-08-18 | `docs/specs/S153-m2-audit.md` | `apps/web/test/s153-m2-audit.live.ts` (13/13) |
| 2-fix | Module 2 — fix pass for pass 2's §4 | S154 | `S153-m2-audit.md` §0a (outcomes) | `s154-m2-fixes.live.ts` (18/18) |
| 3 | Module 3 — Document & File Management | S155, 2026-08-18 | `docs/specs/S155-m3-audit.md` | `apps/web/test/s155-m3-audit.live.ts` (12/12) |
| 4 | Module 4 — Sales & Estimating | S156, 2026-08-18 | `docs/specs/S156-m4-audit.md` | `apps/web/test/s156-m4-audit.live.ts` (15/15) |

**A fix pass is not a pass.** It closes an existing pass's findings and does not fill a row or a
column in §2.

---

## §5 — Full-verification runs

> **One row per pass that ran the full battery.** A pass reports green only against a *complete*
> run, and records pre-existing reds here so the next pass does not re-diagnose them.
>
> ⚠️ **Read the exit status the way `CLAUDE.md` requires** — redirected to a file and printed, never
> through a pipe and never off a task summary. The S155/S156 run below is a worked example of why:
> the live-harness command's **background task notification reported "exit code 0" while the code
> printed into the log was `1`.** The notification was describing the wrapper, not vitest.

### S155/S156 — passes 3 and 4, verified 2026-08-19

| # | Check | Result |
| --- | --- | --- |
| 1 | `npx turbo run type-check` (all packages) | **exit 0** |
| 2 | `next lint` | **exit 0** — 16 warnings, 0 errors, **all pre-existing** (see below) |
| 3 | `npm run build` | **exit 0** — first run was a `FULL TURBO` cache hit and was **re-run with `--force`**: 0 cached, 2m39s, `Compiled successfully` |
| 4 | Committed vitest suite | **795/795 passed**, 55 files — matches the expected count exactly |
| 5 | Every live harness (`test/*.live.ts`, 75 files) | **866 passed, 11 failed** — **all 11 pre-existing**, itemised below |
| 6 | Playwright, four chunks | **517 passed, 5 skipped, 0 failed** — `m-shell` 54 · `m-sections` 59 · `m-photos` 42 · rest 362. The four chunks partition the suite exactly (54+59+42+367 = 522) |
| 7 | `npx supabase migration list` | **113 files = 113 local = 113 applied**, zero rows where `local <> remote` |
| 8 | Fixture leakage | **companies 2 → 2**, unchanged across the live and Playwright runs |

**Why none of the 11 reds belongs to this branch, by construction.** `git diff 2c36759..HEAD`
touches **five files: two new `.live.ts` harnesses and three documents. No application code, no
service, no schema.** All four failing harness files are byte-identical to `main`, so the same run
on `main` produces the same result. The two new harnesses write only to `signing_sessions`, `files`,
`project_assignments` and `estimates`, and reference none of the failing tables except one comment.

| Harness | Failed | Cause — all **pre-existing**, none fixed (this pass changes no application code) |
| --- | --- | --- |
| `s138-trial-deletion-run` | 7 | The first assertion is a **safety gate** — *"the fixture is the ONLY company due for deletion"* — and it read `[]`. The fixture it needs is absent, so the remaining six cascade. **A precondition failure, not six independent defects.** |
| `s145-contracts` | 2 | (a) *"companies carries the master and defaults it OFF"* asserts **live row state on a shared company**, not a default: `Bishop Contracting.client_contracts_enabled` is `true`. **The schema is correct** — `information_schema` gives `column_default = false`, `NOT NULL` [LIVE] — so this is a stale toggle plus an assertion whose name over-claims. Its only harness writer, `s146`, sets and restores in a `try/finally` capturing the prior value, so **once the flag is left on, every later run faithfully restores it on**. Same family as **M4-05**. (b) *"an 'initial' box takes neither key nor label"* expects no error and gets CHECK `23514` — a **schema-vs-test disagreement**, unexamined. |
| `s140-lien-releases` | 1 | *"NONE of them carries a PDF — FrameFocus supplies no form"* expected null and read a `file_id`. **Fixture residue**, same class as M4-05. |
| `s121-contact-addresses-floor` | 1 | ⚠️ **The one worth acting on.** Its `describe` is titled **"contact_addresses SELECT is NOT floored"** and asserts all three of crew/foreman/subcontractor *"can still READ an address — the ruling was about writes"*. **S154's M2 Group B fix floored exactly that SELECT**, so the harness now asserts the opposite of the shipped ruling. Only the `subcontractor` case reddens: the live `contact_addresses_select_scoped` excludes **`subcontractor` and `client` only** (crew and foreman still read company-wide, by design), so the other two cases still pass **while asserting a claim the policy no longer supports company-wide**. |

**The lesson, because it generalises past this harness.** S155's probe commit states the discipline —
*"tests asserting current wrong behaviour name what a fix looks like, so they are inverted rather
than deleted when Josh rules"* — and S154 applied it to **its own** pass-2 probes. It did not sweep
for **older** harnesses asserting the behaviour it had just overturned. `s121-contact-addresses-floor`
is that miss, and it is a quiet one: **a partially-stale harness that still passes two of three cases
reads as healthy.** A fix pass should grep for harnesses naming the table it just floored, not only
invert the probes it wrote.

**Lint warnings (16, all pre-existing).** 12 × `jsx-a11y/alt-text` and `@next/next/no-img-element`
in PDF templates (`co-template.tsx`, `invoice-template.tsx`, `proposal-template.tsx`) and auth
screens, plus one `react-hooks/exhaustive-deps` in `chat-thread.tsx`. **None is in a file this
branch touches** — the branch adds only `test/` and `docs/`.

---

### S157 — the fix pass. **ALL 11 REDS CLEARED**, and none of them was the product.

> **Recorded here rather than in a new section, because §5's job is the red-harness ledger and the
> ledger is now empty.** Every one of the 11 was a defect in a TEST or in fixture residue.

| Harness | Was | Cause, and what it teaches |
| --- | --- | --- |
| `s121-contact-addresses-floor` | 1 | ⚠️ **A test asserting the OPPOSITE of a shipped ruling, while passing.** S154 floored the SELECT this file's describe block was titled to protect. Only the `subcontractor` case reddened, so the file read as healthy. **Inverted.** This is why `CLAUDE.md` now carries the sweep rule. |
| `s138-trial-deletion-run` | 7 | **One cause, not seven.** `nuke()` deleted `trial_emails` INSIDE a loop over auth users — but this file's whole point is that `runTrialDeletion` DELETES THE AUTH USER, and succeeds. So a PASSING run left a row; three passes left three; the fourth got no `trial_lifecycle` row (the signup trigger only creates one below three prior trials) and the safety gate read `[]`. A FAILING run cleaned up, making it a **self-resetting four-run cycle — three passes per failure**, which is why it was never explained. **The cleanup depended on a handle the run destroys** — the same trap this file's own `MARKERS` comment already documents for companies. Proven fixed by three consecutive 9/9 runs leaving zero rows. |
| `s140-lien-releases` | 1 | The test **forbade a supported action**: "NONE of them carries a PDF" went red when a PDF was uploaded to a default template, which is the feature (`7f2` §2). Rewritten to the real invariant — `seed_lien_release_templates()` never sets `pdf_file_id`, so any PDF present must be a real upload owned by this company. That also catches a dangling FK and a cross-tenant file, which the old loop could not. |
| `s145-contracts` | 2 | **One wrong test, one state-inheriting test.** (a) an `initial` box insert expected success and got CHECK `23514` — **the schema is right**: `payload_check` requires `party IS NOT NULL` for signature/initial boxes, and the test was written from `7I` §10.2's sketch, which predates the column. Fixed, plus the missing negative case. (b) "defaults it OFF" asserted a **column default by reading a row**; the default really is `false NOT NULL`, and it could not self-heal because `s146` restores the PRIOR value — once left on, restored on forever. |

**Fixture residue cleared on rebuild-test, all to schema defaults:** `EST-100.include_client_contract`
(M4-05, and `s150-e1-contract-decoupling` had **no teardown at all** — given one),
`Bishop Contracting.client_contracts_enabled`, and **7 leaked `s152` `trial_emails` rows** found
while diagnosing `s138` — those inflate every trial count and are the same mechanism that broke it.
Company count unchanged at 2.

**The generalisable lesson, which is now `CLAUDE.md`'s sweep rule.** Three of the four causes are the
same shape: **an assertion that describes the freshly-seeded world and is then tested forever against
live, shared, mutable data.** If an assertion's name says *default*, *none* or *never*, check that it
reads the schema and not a row.

**⚠️ THE FIX PASS BROKE ONE THING AND PLAYWRIGHT CAUGHT IT — recorded because the catch is the
point.** Aligning storage to `files` RLS (`20261007000000`) refused the annotated-photo derivative,
which has no `files` row by design. `m-photos.spec.ts` went 42 passed → **5 failed**, and the
symptom was a **silent fallback to the unannotated original** — the `#129` PARITY shape. Fixed by
`20261008000000`. Two things worth carrying:

1. **The audit had reasoned to this risk and filed it for MODULE 9**, while the same defect was live
   in **Module 6**. *A risk you expect a future module to hit is worth checking against the modules
   that already exist.*
2. **Only the browser suite could see it.** Every live harness was green, because the failure was a
   render-time fallback, not a refused query. The four-chunk Playwright run is not ceremony.

**⚠️ And a trap for whoever writes the next storage probe.** The bucket holds **105 objects against
108 `files` rows** [LIVE, S157], so some rows are dangling — and `createSignedUrl` fails on a
dangling row with **the same error as a policy refusal** (Storage conflates "you may not" with "it is
not there", deliberately, as anti-enumeration). Two probes in this session failed that way and read
as policy denials. **Pair every refusal assertion with a caller who DOES get the bytes**, or use a
fixture you uploaded yourself.

---

### S158 — the click-test findings. Verified 2026-08-19.

> **Not a pass and not a fix pass.** S157's merged result was click-tested by Josh and passed; these
> are three product gaps it surfaced on the way, all ruled before the work started. **No schema
> change** — the two service-layer findings needed no migration, which is itself the finding in
> Finding 2's case.

| # | Check | Result |
| --- | --- | --- |
| 1 | `npx turbo run type-check` (all packages) | **exit 0** — `@framefocus/web` a cache MISS, so it really ran |
| 2 | `next lint` | **exit 0** — 16 warnings, **0 introduced.** Identical list to the S155/S156 run |
| 3 | `npm run build --force` | **exit 0** — `Compiled successfully`, and both new routes in the manifest: `/dashboard/contacts/trash` 2.48 kB, `/dashboard/subcontractors/trash` 1.78 kB. ⚠️ See the SIGTERM note below |
| 4 | Committed vitest suite | **806/806 passed**, 56 files — 795/55 plus this session's 11 in one new file |
| 5 | Every live harness (`test/*.live.ts`, 77 files) | **877 passed, 25 skipped, 2 failed, 1 suite failed** — all three **pre-existing and diagnosed below**, none in a table this branch touches |
| 6 | Playwright, four chunks | **517 passed, 9 skipped, 0 failed** — `m-shell` 54 · `m-sections` 59 (+4 skipped) · `m-photos` 42 · rest 362 (+5 skipped) |
| 7 | `npx supabase migration list` | **115 files = 115 local = 115 applied**, zero rows where `local <> remote` |
| 8 | Fixture leakage | **companies 2 → 2**; zero `S158TRASH` rows left in `contacts` or `subcontractors` |

**⚠️ THE BUILD FAILED TWICE BEFORE IT PASSED, AND THE CAUSE WAS NOT THE CODE.** `next build` exited
`1` after `✓ Compiled successfully` with `Next.js build worker exited with code: null and signal:
SIGTERM` — a worker killed under memory pressure, not a compile or type error. **Established as
environmental rather than argued to be:** the branch was `git stash push -u`'d and the SAME build run
against clean `HEAD` failed identically. A stale `next dev` server was holding **1.2 GB** on a
7.9 GB / 2-core box; `scripts/e2e-preflight.sh` with `E2E_PREFLIGHT_START=0` cleared it by PID (never
`pkill -f` — #137), and the build then passed. *A SIGTERM after "Compiled successfully" is a
resource report, not a verdict on the diff — and the way to prove that is to build the baseline, not
to re-read the log.*

**The e2e run was served by `npm run start`, not `npm run dev`** — the production build had just been
made, `reuseExistingServer` attaches to whatever holds 3000, and #135's own measurements put the dev
server at ~1400 MB against ~320 MB for `next start`. Same code CI serves.

#### The three reds, none of them this branch's and none of them the product

| Harness | Failed | Cause |
| --- | --- | --- |
| `s133-subcontractor-read-floor` | suite (25 skipped) | `beforeAll` refused to run: *"josh+s133-pm2@worthprop.com already exists — a previous run did not clean up."* **Leaked fixture identity**, `auth.users.created_at = 2026-08-19 10:18:47 UTC` — roughly two hours before this session's first edit. The harness is doing exactly what it should; something aborted earlier today. **Not cleaned up here** — deleting an auth identity on rebuild-test is a destructive act nobody ruled, and it is one `admin.auth.admin.deleteUser` away whenever Josh says so. |
| `s123-cron-loops` | 2 | ⚠️ **The one worth acting on, and it is the S121 shape again.** *"16:00 nudges the WORKER and nobody else"* asserts `recipients.has(ownerProfileId) === false`. It is `true` — **because the Owner has his own open time-clock session**, `time_clock_sessions.clock_in = 2026-08-19 12:07:51 UTC`, `clock_out IS NULL` [LIVE]. `runStillClockedIn` nudges *every* open session's worker, so the Owner appears as a recipient **on his own account**, not because management was told about the crew member's. The 17:00 test then fails downstream for the same reason: `rows.find(r => r.recipient_profile_id === ownerProfileId)` picks the Owner's own *"You're still clocked in"* row instead of the manager's overtime row. |

**What `s123-cron-loops` is actually missing.** Both assertions are scoped by **recipient** and not by
the **session under test**, so any real open session in the shared company reddens them — and a
person being clocked in is not an error state, it is the product working. This is precisely
`CLAUDE.md`'s sweep-rule cousin: *an assertion that describes the freshly-seeded world and is then
tested forever against live, shared, mutable data.* The fix is to filter `rows` to notifications
arising from the seeded `openSessionId` / seeded member rather than asserting over every row of the
type. **Left red deliberately: it is outside all three ruled findings, and Josh rules before a test
is rewritten.** It is also **not** fixable by clocking the Owner out — that is his live data.

#### Sweep for existing tests encoding the overturned behaviour [CLAUDE.md, S157 rule]

Findings 1 and 2 both change list behaviour, so the sweep was run before finishing rather than after:

- **`contacts-list` / `subcontractors-list`** — no committed test referenced either component. The
  only e2e specs touching `/dashboard/contacts` assert the **chat launcher** (`desktop-chat-panel`,
  `desktop-chat-switcher`) and the **route guard** (`desktop-dashboard-guard`); none reads a row
  action. All green.
- **`s153-m2-audit.live.ts` F2/F2b/F3** — already inverted at S154, and F2b drives PostgREST
  directly rather than `deleteSubcontractor()`, so the new row-count guard does not touch it.
- **`s154-m2-fixes.live.ts` A4** — *"list surfaces still exclude deleted rows"*. Deliberately still
  true: `getContacts()`/`getSubcontractors()` are unchanged and the new functions are the only ones
  that may return `is_deleted = true`. `s158-trash-restore` **D1** asserts the service half of the
  same invariant.
- **`s130-ffnav.test.ts` / `desktop-ffnav.spec.ts`** — Finding 3 changes the aside's layout classes.
  Both read `NAV_ITEMS` by regex and `aside nav` by selector respectively; neither asserts geometry.
  Both green.
- **Titles read, not only assertions.** Nothing in `test/` or `e2e/` is titled around contacts row
  actions or around a deleted contact being unreachable.

**Four extra Playwright skips versus the S155/S156 run (5 → 9)**, all in `m-sections` and all
guarded by `if (n === 0) test.skip(…, 'no change orders on this project' / 'no documents on this
project')`. Data-conditional on the shared rebuild-test project, in Change Orders, Deliveries, Files
and Safety — none of which this branch touches.

---

### S159 — two harness fixes, subs matched to contacts, one investigation. Verified 2026-08-19.

> **The red-harness ledger is empty again, and this time nothing is skipped either.** S158 closed
> with three reds it had diagnosed and deliberately left; all three are now closed by ruling, and
> the 25 tests `s133` had been skipping run again.

| # | Check | Result |
| --- | --- | --- |
| 1 | `npx turbo run type-check` (all packages) | **exit 0** |
| 2 | `next lint` | **exit 0** — 16 warnings, **0 introduced**; same list as S155/S156 and S158 |
| 3 | `npm run build --force` | **exit 0** — `Compiled successfully`; `/dashboard/subcontractors` 4.68 kB, `[id]` 2.17 kB, `trash` 1.78 kB |
| 4 | Committed vitest suite | **818/818 passed**, 57 files — 806/56 plus this session's 12 in one new file |
| 5 | Every live harness (`test/*.live.ts`, 77 files) | **904 passed, 0 skipped, 0 failed.** Was 877 / 25 / 2 + 1 failed suite at S158 |
| 6 | Playwright, four chunks | **517 passed, 9 skipped, 0 failed** — `m-shell` 54 · `m-sections` 59 (+4) · `m-photos` 42 · rest 362 (+5) |
| 7 | `npx supabase migration list` | **115 files = 115 local = 115 applied**, zero rows where `local <> remote`. **No migration this session** |
| 8 | Fixture leakage | **companies 2 → 2**; zero `S158TRASH` and zero `S133` rows after the run |

**⚠️ `supabase migration list` must run from the REPO ROOT.** From `apps/web` it fails with
`LegacyProjectNotLinkedError: Cannot find project ref` — the link lives in `supabase/.temp/` at the
root. It is an unlinked-CLI error, not a drift report, and it would be easy to read as one.

#### The three S158 reds, closed

| Was red | Closed by | Note |
| --- | --- | --- |
| `s123-cron-loops` ×2 | **APPROVED [Josh]** — scope §3j to the seeded session | See below. Verified green **with the Owner still clocked in**: `clock_out` re-checked after the run and still NULL, so 9/9 is the fix and not the weather |
| `s133-subcontractor-read-floor` (suite, 25 skipped) | **APPROVED [Josh]** — delete the leaked identity | See below |

**`s123-cron-loops` — the fix, and why it generalises.** Both §3j assertions built their recipient
set from every `still_clocked_in` row the run produced and read the Owner's presence in it as
*"management was told about the crew member's session"*. It does not mean that:
`runStillClockedIn` nudges the worker of **every open session in the company**, so an Owner who is
himself clocked in appears as a recipient **on his own account**. `notify()` already writes
`source_id` from the cron's `source: { table: 'time_clock_sessions', id: session.id }`, so every row
states which session produced it — and **the last test in that block has scoped by `source_id`
since S131.** These two were never brought into line with it. Both now filter to the seeded session
and both assert the scoped set is non-empty first, so a scoping bug cannot pass on an empty array.

> **`source_id` does not replace `since`.** They narrow different axes: `since` separates this run
> from earlier ones on the same session, which the 16:00 and 17:00 tests reuse by design because
> `idx_time_clock_sessions_one_open_per_member` allows exactly one open session per member.

**`s133-subcontractor-read-floor` — what was actually removed.** The guard that refused to start
(*"josh+s133-pm2@worthprop.com already exists"*) was the visible tip. The full residue of the
aborted 10:18 UTC run, all of it stamped by the harness's own marker and all of it deleted in that
harness's own `afterAll` order:

| Removed | Count |
| --- | --- |
| `project_assignments` (deleted FIRST — `NO ACTION`, it pins the member) | 1 |
| `tasks` / `deliveries` / `inspections` / `purchase_orders` / `project_budget_items` / `subcontractor_contracts` — `STAMP = 'S133 read-floor probe'` | 7 |
| `company_members`, `profiles`, the `auth.users` identity, the `invitations` row | 4 |

Read-then-delete-then-read, every step error-checked, rebuild-test asserted before anything ran.
The harness now passes **25/25 and leaves zero rows behind**, verified by re-querying after it.

> **Worth carrying: a leaked fixture is rarely one row.** The guard names the one that blocks
> startup; seven more sat on the sub's own project, inflating exactly the counts other harnesses
> assert against.

#### §1.2 amendment — Subs & Vendors now matches Contacts

**RULED [Josh, S159]: *"subs should match contacts with a panel."*** S158 gave Contacts a row-click
sheet; the sub list still had a name link to `/dashboard/subcontractors/[id]` (S140 ruling A1) plus
an Edit link and a Delete button. **Two interaction models under one nav group is the defect** —
and S140's name link was solving exactly the problem S158 solved for contacts, a session apart and
in a different shape.

**The one thing that did NOT move, decided and reported rather than defaulted: the compliance
section.** The S140 page holds a header, a six-field contact card, and `ComplianceSection`.
**Contracts and bids are not on it** — checked at S159: `subcontractor_contracts` render on the
project contracts panel and bids on the estimate. The header and card are reproduced in the sheet
field for field, plus Rating. Compliance stays on the page and the sheet links out to it, because:

- `getComplianceStatus()` is a **server** service and a sheet is a client component, so mounting it
  there needs a **client-side read of compliance documents that does not exist** — a second
  implementation of one read, which is `#129`;
- the page does not merely hide the section from a PM, it **declines to run the query**, because
  "RLS returned nothing" and "this sub has no documents" render identically and only one is true —
  reasoning worth having exactly one copy of;
- a 304-line document manager is not a card of facts.

The link is Owner/Admin only. `s159-subs-sheet.test.tsx` reads the page's `<Field label="…">` labels
**out of its source** and requires each to render in the sheet, so a field added to the page later
and not mirrored goes red — the realistic way this diverges, which a hardcoded list would miss.

#### A source-level test that reads its own explanation — third instance

`not.toContain('deleteContact')` reddened on a **correct** file, because the comment saying the
function is no longer imported **names it**. Same shape as S158's `mt-auto` and `Sign out`. Anchored
on the import statement instead, and paired with a positive assertion that both SHEETS do import it.

> **The rule, now that it has happened three times: a source-level assertion must match a syntactic
> anchor — an import statement, a `className="…"`, a JSX attribute — never a bare identifier or an
> English phrase.** These files are written to explain themselves, so the prose reliably contains
> every term the assertion is looking for.

#### Investigation — invite email deliverability

Full findings: **[`S159-invite-email-investigation.md`](S159-invite-email-investigation.md)**. Not a
pass, not a fix; no code, schema or configuration changed.

**The hypothesis — that the invite flow calls Supabase Auth's mailer — is disproven.** The message
went through Resend; its Amazon-SES fingerprints are what a healthy Resend send looks like, because
Resend runs on SES and Google Workspace's Sender column shows the **envelope** sender.

**The real finding is next door.** Four surfaces — sign-up, **invite acceptance**,
forgot-password, and the team page's reset — call GoTrue's mailer, which on production has
`smtp_host: null`, `hook_send_email_enabled: false` and `rate_limit_email_sent: 2` per hour
project-wide, with `mailer_autoconfirm: false`. **The invite flow therefore needs two emails on two
providers**, and the second — the one that can block an invitee entirely — is unaligned, capped, and
absent from `email_logs`.

⚠️ **One check remains and it was deliberately not run: production's `email_logs`.**
`scripts/live-sql.mjs` refuses any project but rebuild-test and that guard was not bypassed. The
query, and what each of its three outcomes means — including the one that would prove the finding
wrong — is §6 of the investigation.

---

### S160 — the five S159 proposals, built. Verified 2026-08-19.

> **⚠️ P1 and P3 are BUILT AND NOT ENABLED.** Changing production auth configuration is attended, so
> the code, the migration and the tests landed and the two dashboard settings did not. Until
> [`S160-auth-email-hook.md`](S160-auth-email-hook.md) §3 is run by hand, auth email still goes over
> Supabase's shared mailer exactly as S159 found it — **merging this breaks nothing and fixes
> nothing.** P4 and P5 need no configuration and take effect on merge.

| # | Check | Result |
| --- | --- | --- |
| 1 | `npx turbo run type-check` | **exit 0** |
| 2 | `next lint` | **exit 0** — 16 warnings, **0 introduced** |
| 3 | `npm run build --force` | **exit 0** — `/api/auth/send-email` in the route manifest |
| 4 | Committed vitest suite | **866/866 passed**, 58 files (818/57 + 19 new + 4 added to the brand guard, less two absorbed) |
| 5 | Every live harness (`test/*.live.ts`, 79 files) | **925 passed, 0 skipped, 0 failed** |
| 6 | Playwright, four chunks | **517 passed, 9 skipped, 0 failed** — 54 · 59 (+4) · 42 · 362 (+5) |
| 7 | `npx supabase migration list` | **116 files = 116 local = 116 applied**, zero mismatches. One added: `20261009000000_auth_email_types.sql`, applied to rebuild-test |
| 8 | Fixture leakage | **companies 2 → 2**; zero `s160` rows in `auth.users`, `profiles`, `invitations` or `email_logs` |

#### ⚠️ PLAYWRIGHT MUST RUN FROM `apps/web` — and from the root it lies

The mirror of S159's `supabase migration list` note, and it cost a full chunk here. Run from the
repo root, Playwright still **collects** all 522 specs — but `storageState: 'e2e/.auth/user.json'`
resolves against the wrong root, so every authenticated test fails. Seventeen reds in `m-shell`
alone, reported as **product** failures (*"the open sheet swallows the tab bar"*), not as a config
error. The tell is in the test paths: `apps/web/e2e/m-shell.spec.ts` instead of `e2e/m-shell.spec.ts`.

> **Two commands in this repo now fail in a way that reads as a real defect when run from the wrong
> directory** — `supabase migration list` from `apps/web` (reads as migration drift), and
> `playwright test` from the root (reads as broken UI). Both are cwd errors. The re-run logs its own
> `cwd:` line as the first thing in the file, so the next reader can tell in one glance.

#### §1.1 amendment — M1 no longer owns auth email delivery alone

`email_logs` gains six `auth_*` types, and once the hook is enabled the **application** becomes the
sender for GoTrue's own mail. That is a new edge worth recording before M1's next pass:

| Consumer | Points at | Assumes |
| --- | --- | --- |
| **GoTrue → `/api/auth/send-email`** | `profiles.user_id` → `companies` (sender identity), `invitations` (the P3 check), `email_logs` (P2) | a profile exists for the user **by the time the email is sent**. True by construction — `handle_new_user()` runs INSIDE the `auth.users` insert — and handled when it is not: the email still goes out, only the log is skipped, because `email_logs.company_id` is `NOT NULL` |

**And a standing constraint for whoever next edits auth settings:** `mailer_autoconfirm` must stay
`false`. S160 ruled that *invited* users skip confirmation and implemented it **per message** for
exactly this reason — the flag is project-wide and would also skip confirmation for public sign-ups,
where the address is self-asserted. `S160-auth-email-hook.md` §3 step 4.3 is the guard.

#### What the existing suite caught, unprompted

`brand-email-footer.test.tsx` went red the moment `auth-email.tsx` appeared on disk. It walks the
templates directory rather than trusting a list — built that way at S136, **after** a stale product
name reached real recipients because `InviteEmail` had shipped and nobody added it to a hardcoded
five. It did its job here without anyone remembering it existed, and it was satisfied properly (all
six kinds rendered, HTML and plain text, plus the SUBJECT — S136's actual hole, since subjects are
not templates) rather than by adding a filename to a set.

> **This is the second session running in which the strongest check was one a previous session left
> behind.** S159's was `s121-contact-addresses-floor`'s title; S160's is this walk.

#### The registry seam, closed from all three sides

`email_logs.email_type` is `NOT NULL` with an FK to `email_types ON DELETE RESTRICT`, and the
`EmailType` union is hand-maintained. The table half fails at **runtime**, the union half at
**compile** time — so shipping one without the other ships silently, which is exactly what `mention`
did at S126 (found by a ruling sweep, not by anything failing). `s160-auth-email.test.tsx` now
asserts all three declare the same set: every type `ACTIONS` logs under is in the migration, and in
the union, and the migration declares nothing the union has not heard of.

#### What is still owed

- **The attended config** — `S160-auth-email-hook.md` §3. Until then P1/P2/P3 are inert.
- **That GoTrue really calls the hook with the payload shape assumed.** Everything else about the
  route, signature verification included, is covered in the committed suite: `svix` can *sign* a
  payload exactly as Supabase does, so unsigned → 400, bad signature → 401 and correctly signed →
  200 are all decidable with no server. It was nearly filed as "unverifiable until the switch is
  thrown"; only that one line actually is.
- **Production's `email_logs` for `email_type = 'invite'`** — S159 §6, left for Josh by his own
  instruction and independent of all of this.
