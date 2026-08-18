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

### §1.2 — Modules 2–11

*Not yet mapped. Each pass fills its own subsection here.*

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
| **M1 Settings/Admin/Billing** | — | S | — | S | S | S | S | n/a | S | — | — |
| **M2 Contacts & CRM** | — | — | — | — | — | — | — | — | — | — | — |
| **M3 Documents & Files** | — | — | — | — | — | — | — | — | — | — | — |
| **M4 Sales & Estimating** | — | — | — | — | — | — | — | — | — | — | — |
| **M5 Project Management** | — | — | — | — | — | — | — | — | — | — | — |
| **M6 Team & Field Ops** | — | — | — | — | — | — | — | — | — | — | — |
| **M7 Job Finances** | — | — | — | — | — | — | — | — | — | — | — |
| **M8 Inventory & Tools** | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| **M9 Client Portal** | — | — | — | — | — | — | — | — | — | — | — |
| **M10 Reporting** | — | — | — | — | — | — | — | — | — | — | — |
| **M11 AI Marketing** | — | — | — | — | — | — | — | — | — | — | — |

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

**A fix pass is not a pass.** It closes an existing pass's findings and does not fill a row or a
column in §2 — pass 2's subject is still Module 2, and M1's coverage is unchanged by it.
