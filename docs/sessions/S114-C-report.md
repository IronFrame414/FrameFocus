# S114 PARTS C and B — session report

Running log. Appended, committed and pushed after every measurement, test run, sabotage, build exit
line, unattended decision and stop. Newest entries at the bottom.

**Branch at start:** `feature/s114-c-no-migration`, cut from `main` = `2269a9a9` (verified:
`git rev-parse origin/main` → `2269a9a94877ae29074c5495ac019894ad48bad3`, 2026-09-28).
**CLI link:** `supabase/.temp/project-ref` reads `nmyphyhmfttxkdoposvf` (rebuild-test). Read only.

## Rulings carried in by the prompt (build to these, do not re-ask)

- **Order:** PART C first, then PART B. C is split: **C-branch 1 = no migration** (merges on CI under
  R8), **C-branch 2 = needs a migration** (waits on Josh's runbook). PART B is its own branch after C.
- **No production override.** Applying a migration to production is Josh's action. Never
  `supabase link`; never `migration repair --status reverted`. Four versions owed from unmerged branches
  (`20261850000000`, `20261860000000`, `20261890000000`, `20261900000000`) are PART E, expected absent.
- **R4** — photo upload with no project selected: **refuse**. Existing orphans untouched; count them and
  hand Josh the query (FILL-C-4.3).
- **R7** — Files filters by **CATEGORY, never MIME type**.
- **C-6** — "Summary with Descriptions" SHOWS line descriptions. Fix the page first; trim the payload to
  the corrected page.
- **C-8** — site-visit markup on `/m/site-visits/[id]` and desktop `site-visit-record.tsx`; unsent visits
  only; frozen visit shows a notice saying why ("part of a sent estimate, can't be annotated"). PARITY.
- **R3 (PART B)** — QuickBooks exclusion: per project, **Owner only** (DB policy, not a hidden button),
  changeable any time, stops **future** sync only, nothing unlinked/deleted. Control in the project
  overview STATUS section. **The Project Executive must not see it.**
- **New items to add to the spec in place:** C-9 (contact name-or-company), C-10 (subcontractor detail
  redirects a PE), F-10 (debt numbering now `#166`+), G-6 (PART A click-test owed, not passed).
- **Gates:** C-2 — no fix before FILL-C-2.1. C-1 — proof walks the real email link on a second device.
  B — FILL-B-1 (what the QB integration does today, from code) before any design.
- **Stop rules:** production writes; unsettled decisions; destroying/moving rows; constraints over
  existing production rows (count first); anything weakening the Financial Visibility Floor; refund or
  contract authority.

## Log

### Step 0 — start (2026-09-28)
- `main` = `2269a9a9` confirmed by `git rev-parse origin/main`. Branch `feature/s114-c-no-migration` cut from it.
- MCP `get_project_url` → `nmyphyhmfttxkdoposvf` (**rebuild-test**). Production is not reachable from this session;
  every production number below is a query handed to Josh.
- Spec: C-9, C-10, F-10, G-6 added in place; F-4 corrected (`#164` → `#166`+), old text quoted. Pushed.
- Phase 1 audits dispatched read-only (C-1/C-9/C-10; C-2/C-4; C-3/C-6/C-7/C-8; C-5 + B-1/B-2 + STATUS section).

### Step 1 — the two carried-over items, measured (rebuild-test, MCP `execute_sql`)
**`project_financials.contract_value` PE arms.**
- Columns named `contract_value`: 3 tables (`client_contract_amounts`, `project_financials`,
  `subcontractor_contracts`) — `information_schema.columns WHERE column_name ILIKE '%contract_value%'`.
- `project_financials` policies: 6 — SELECT/INSERT/UPDATE `_owner_admin` + SELECT/INSERT/UPDATE `_project_executive`
  (`pe_on_project(project_id)`). No client arm → **a client never reads this row.** The portal's contract figure is
  `client_contract_amounts.contract_value` (`lib/services/portal.ts:321`).
- **App writers: 0.** `grep -rn -B2 -A6 project_financials apps/web/{lib,app}` filtered for `.insert/.update/.upsert/.delete`
  → the only hit is a `projects` update at `projects-client.ts:117`, which explicitly REFUSES `contract_value` (`:109`).
- **DB functions reading it: 3** (`prosrc ~* 'project_financials'`): `convert_estimate_to_project` (the writer, SECURITY
  DEFINER), `enforce_projects_column_scope`, and **`enforce_contract_billing_ceiling`** — on a fixed-price project
  `project_financials.contract_value` IS the billing ceiling (`SELECT f.contract_value … FOR UPDATE`; no value = no
  ceiling). On cost-plus/T&M it is a projection that never feeds billing.
- **Reading:** not a working margin figure. On fixed price it is the enforced cap on what may be billed to the client.
  A PE UPDATE arm lets a PE raise (or NULL) the ceiling it bills against. No UI uses the write. Recommendation for
  Phase 2: drop the two PE write arms, keep SELECT.

**Q4 hand-built sub commitments.**
- `expenses_insert_project_executive` does not restrict `sub_contract_id`, `state`, `cost_category` or `awaiting_paper`.
  `expenses_insert_authorized` grants exactly the same to the **PM** (those clauses are O/A/PM). So the PE's reach
  here equals the PM's; it is not a PE-specific widening.
- Side effect, applies to PM and PE alike: `setup_payment_schedule()`'s one-schedule check is
  `expenses WHERE sub_contract_id = … AND is_retainage = false AND is_deleted = false`. A single hand-entered expense
  linked to a subcontract makes the formal schedule refuse **for the Owner too** ("a schedule already exists").
