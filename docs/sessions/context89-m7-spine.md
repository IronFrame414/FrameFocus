# context89-m7-spine.md — Session 89: The M7 Spine (7A/7B/7C specs)

> **Session:** 89 — July 28, 2026. **Branch:** `feature/7a-spec` — five S89 commits on-branch:
> `ed92aae` 7A spec, `02d09d7` 7A amendments, `5de1af7` 7B spec, `11ae2c4` 7C spec + 7A
> boundary amendments, `09b5dc4` TECH_DEBT #96–#99. Only this wrap file is uncommitted.
> **Shape:** prereq verification → three-phase spec protocol (Phase 1 read-only → Phase 2
> questions → Phase 3 write) run three times — 7A, 7B, 7C — plus architecture amendments,
> a close-out correction pass, and four security filings.
> **Ground rule held all session:** git/migrations over any spec or handoff claim; every
> Phase 1 assertion carries file:line.

---

## 1. Reopen path — §7.7 #2 CLOSED

Verified against the repo: **no reopen path existed.** `STATUS_TRANSITIONS` in
`apps/web/lib/services/projects-client.ts:10-16` had `complete: ['archived','cancelled']`
(line 13), service-layer only, no DB trigger. The founder's recollection that a prior spec
built it was **wrong**. Resolution: `7A-spec.md` §2.7/§3.4 specs the full reopen —
`complete → active`, **Owner/Admin only**, punch gate re-runs automatically on every
re-complete (the gate keys on `active→complete`, `projects-client.ts:124-127`), and
`actual_end_date` is **prompted** (keep original vs. today) on re-complete only.
`module7-architecture.md` §7.7 #2 amended CLOSED (S89 block, `:338-345`); §7.8.5 ripple
amended. Interplay with TECH_DEBT #82 flagged: the future DB transition trigger must encode
the new machine.

## 2. §7.12 prereq reads closed (#1, #4, #5, #7, #8)

- **#1/#7 (debt reconcile):** TECH_DEBT #80 number confirmed correct; #81 (dormant sub-invite)
  missing from §7.1 — relevant to 7C sub onboarding; §7.1 debt #3 mischaracterized 6D's
  damaged-return item (6D-spec marks it RESOLVED-won't-build); debt #8 overstated — 
  `project_budget_items.committed_amount`/`actual_amount` already exist as stub columns
  (`20260704212000:43-44`).
- **#4 (CO/signed-artifact schema):** verified as built; one conflict — signed-artifact-spec §8
  "flows to contract value" contradicts 5D display-only (D-6/#80); no PDF FK on
  `change_orders`; no material-selection table exists at all.
- **#5 (M6 shapes):** time/pay/snapshot tables mapped; **6D has zero dollar columns**
  (PO lines are quantity-only); sub daily-log hours have no rate source.
- **#8 (T&M settings):** founder's "already in company settings" only PARTIALLY holds —
  `default_labor_rate` + `default_material_markup_percent` exist but are **estimating-scoped**;
  no T&M-labeled config, no rounding setting anywhere.

## 3. 7A — Job Expenses + Job Cost Rollup (written, then amended)

`docs/specs/7A-spec.md`. Core: receipts-only capture (any role, mandatory prompt on material
runs with explicit "No purchase made" decline), uniform pending→approved/rejected gate
(Owner/Admin), optional split-allocation to `project_budget_items.actual_amount`
(trigger-maintained, expense allocations ONLY — labor never persisted there, floor-critical),
role-dependent rollup, GL account mapping columns, reopen + re-complete date prompt.
**S89 amendments applied same session:**

- **Sell reversal** — no `sell_amount` on cost rows (architecture §7.8.1 amended; debt #7
  unaffected, still owed elsewhere).
- **`state committed|actual`** column added (v1 writes `actual` only).
- **Labor burden** (architecture §7.8.3): `member_burden_settings` (pay-rates-floor RLS) +
  `companies.fixed_burden_per_hour`; ×/+ operator safeguard; **frozen into
  `time_session_rate_snapshots` at approval, FORWARD ONLY** (follow-up decision — approved
  labor never re-prices; NULL burden on pre-burden approvals = pass-through, permanently).
- **Boundary (7C pass):** `subcontractor` removed from every capture surface, retained in the
  DB CHECK for 7C writers only; `gl_account_subcontractor` kept for 7C bills.

Known flag: `companies.fixed_burden_per_hour` sits below the financial floor
(`companies_select_own` is company-wide) — carried to the FINANCIAL-RLS-FLOOR migration.

## 4. 7B — Contract Value (derivation, not mutation)

`docs/specs/7B-spec.md`. **`projects.contract_value` is never mutated** — revised = original +
Σ(client-signed CO `net_delta`), bidirectional, voided COs drop out by filter. "Signed" =
client-signed verified as already true in code (single writer: `co-signing-service.ts:179`).
One shared derivation: new `lib/services/contract-value.ts` with the exported
`CONTRACT_CONTRIBUTING_CO_FILTER` + two functions (per-project, portfolio); DB view
PROPOSED-deferred; **zero migrations**. Complete call-site migration list (7 sites);
projects-list Contract column switches to revised; overview shows Revised headline / Original
caption. `requires_client_signature` documented dormant. **Closes #80 by design — the
TECH_DEBT closure note is owed (S90 queue item 2).**

## 5. 7C — Accounts Payable

`docs/specs/7C-spec.md`. Boundary: anything invoiced/billed enters through 7C; commitments ARE
expense rows (`state='committed'`) — sub signed-quote stages auto-commit at schedule setup,
PO commits when `total_amount` is entered (the entry IS the agreement), manual committed
entries allowed. Bill entry owner/admin/PM (PM pending). Record-only payments
(`expense_payments`). **Close-out correction (founder): live-split partials — every payment
converts to actual AT PAYMENT TIME; committed holds only the remaining balance** ($2,000 stage,
$1,500 paid = $1,500 actual + $500 committed); `state` demoted to a settlement marker; money
math derives from payments. Retainage per sub per job (percent-across withheld-stays-committed,
or final-hold); **Owner-only final/retainage release** (CLAUDE.md owner-only #5).
`awaiting_paper` flag for expected bills. Orphaned-commitment closeout (reason required,
"did not finish" flag). Compliance: **7C ships `subcontractor_compliance_documents` exactly per
5I §3a** (flagged to 5I — do not recreate), **−30/−7 thresholds** (matches 5I; S89's interview
"30/14" superseded), warn-never-block, calendar surface verified REAL. Job-close with open
committed rows WARNS, never blocks (P2). One 7C migration (expenses columns, payments table,
retainage columns, `purchase_orders.total_amount`, compliance table).

## 6. M6B RLS probes

Full probe grid **PASS except four findings — filed as TECH_DEBT #96–#99** (all scheduled S90):

- **#96** `files` company-wide leak (`files_select_non_client`/`_update_non_client` not
  project-scoped; anyone can set `client_visible=true` anywhere) — must fix before any
  client-facing surface (Pre-M9 gate); probe queries recorded in the entry.
- **#97** `daily_logs` INSERT author spoofing (WITH CHECK doesn't bind `author_member_id`).
- **#98** `daily_logs` soft-delete reversal (one-directional `is_deleted` enforcement).
- **#99** `daily_log_crew`/`daily_log_sub_entries` accept cross-company `member_id`.

## 7. Architecture amendments applied (`module7-architecture.md`, S89 blocks)

P5 approval terminology (approved/pending/rejected, uniform gate; 7H must follow);
§7.8.1 sell reversal (STORE/OUTPUT rewritten, decision struck); §7.8.2 approval lifecycle;
§7.8.4 rename; §7.7 #2 closed; §7.8.5 resolved marker. **Still owed:** §7.2 7B-row
"write through" wording (superseded by 7B derivation), §7.12 task-list tidy.

## 8. S90 QUEUE (in order)

1. **Fix #96–#99** (one security migration).
2. **Close #80** in TECH_DEBT with the derivation note (grep `#80` refs:
   `co-signing-service.ts:108`, 5D migration header).
3. **Merge `feature/7a-spec`.**
4. **7B build** (zero migrations — lowest risk), then **7A build**, then **7C build**.

**Owed beyond S90:** 7D–7H reconciliation pass (7H committed/sell/"verified" wording, 7D/7E
consumer updates); architecture §7.2 wording; 7G "approved"→signed term; **#94 HEIC** — now a
real 7A review-popup risk (approver can't read an iPhone receipt); RESEND secret; domain
cutover; login branding.

## 9. Flags

- **Parallel S89 notifications session** — shape UNVERIFIED here; 7C names the notifications
  module as a future consumer only (compliance −30/−7 evaluations, "clear for payment",
  due-date reminders, over-stage flag are named event emitters; no delivery mechanics
  invented). Reconcile when that session's architecture lands.
- **CLI re-link required before any S90 push** (Supabase CLI project link does not persist the
  Codespace rebuild — do this before the #96–#99 migration).
- All S89 work is committed on `feature/7a-spec` (`ed92aae`, `02d09d7`, `5de1af7`, `11ae2c4`,
  `09b5dc4`); **only this wrap file is uncommitted** at wrap. Commit + merge are Josh's.
