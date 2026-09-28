# S114 — session report (PART A: Project Executive operational arms)

Branch: `feature/s114-pe-operational-arms` (from `main` 210683b0). Appended after every step.

## Step 0 — branch + spec source fix

- Branched from `main` at 210683b0.
- Spec header: source of items corrected from `S181-open-items-audit.md` (no such file) to
  `docs/specs/S114-open-items.md`.
- CLI link read (not written): `supabase/.temp/project-ref` = `nmyphyhmfttxkdoposvf` (rebuild-test).
- CI at start: run 36361033388 (`main`, the S111/S181 merge) in progress.

## Step 1 — Phase 1: FILL-A-1, FILL-A-2 (rebuild-test, MCP `execute_sql`; `get_project_url` = nmyphyhmfttxkdoposvf)

- **Production is not reachable from this session** (MCP + CLI both on rebuild-test). The five S181 migrations are
  recorded as applied and verified by object in 8388478d..cfbe480c (Josh's run); re-confirmation query handed to Josh in Phase 2.
- The "98" reproduces exactly with S181's `= ANY (ARRAY[...'project_manager'...])` regex (98, 2 now naming PE). That
  filter misses the scalar `get_my_role() = 'project_manager'` form. **Full set: 114 policies on 53 tables**
  (`LIKE '%project_manager%'` on qual‖with_check). Grouped in the spec: G1 answered 20, G2 carve-out 4, G3 company-level 40 (incl. 3 null-project safety SELECTs, corrected from G5),
  G4 ruled reads 3, G5 operational arms 47. Functions: 21 name PM (7 add, 1 carve-out, 11 sales-stage, 2 already answer).
- Storage: 13 policies, 0 call `get_my_company_id()`; one gap (`project_files_insert_non_client`), SELECT/UPDATE already admit PE via `files` RLS.

## Step 2 — Phase 1: FILL-A-3, A-4 (plan), A-5, A-6 (measured), ASK-A-1 (open points)

- TS sweep (background agent, then 6 sites spot-checked by hand and the 96 source hits re-counted): 4 `Record<CompanyRole>` maps + 14
  `forEveryRole` calls all answer the PE; carve-out predicates pinned false. 178 `'project_manager'` literals, 96 source (17 already PE,
  79 not), 82 tests. Classified in the spec. No TS role gate on the four contract create/update calls — RLS is the only barrier (correct by #136).
- A-4 plan: N1–N8, each no-RETURNING with its own sabotage; `contract_documents` UPDATE stated as not isolatable.
- ⚠️ ASK-A-1 a: `client_contract_amounts` PE write arms (1910, production) vs R1 carve-out 2 — reported, not reconciled.
- Phase 2 questions sent; STOPPED for rulings. Nothing built, no migration written.

## Step 3 — Rulings received (Josh, 2026-09-27); UNATTENDED from here

- Q1 A · Q2 B · Q3 A · Q4 A · Q5 A · Q6 A (+debt) · Q7 C (timesheets out; filed) · Q8 A · Q9 A · Q10 A. Recorded in the spec PART A header.
- Scoped production override for this session: CC applies PART A's own migrations and merges. CLAUDE.md and R8 unchanged.
- Q1 production row recorded with its pattern (`LIKE '%\_project\_executive'` ends-with; contains-pattern gives 21 non-SELECT).
- PART A opening paragraph corrected in place (98 → 114, both searches stated; reads exist, writes missing), old text quoted.

## Step 4 — Build (no database touched yet; main CI 36361033388 still running)

- **Migrations written** (not applied): `20261940000000` operational arms (46: 41 non-SELECT + 5 SELECT), `20261950000000`
  storage upload arm + `pe_can_upload_project_file()` (resolves the caller inline from auth.uid(); no get_my_company_id),
  `20261960000000` seven functions (role clause only; PE scoped by pe_on_project; pre-md5 recorded in the header),
  `20261970000000` roster + catalog reads (3 SELECT), `20261980000000` Q2 drops (2). No constraint added anywhere.
- **Tests written**: `s114-pe-carveouts.live.ts` (N1–N9, no RETURNING, own project), `s114-pe-operational.live.ts`
  (ON lands / BARE refused per arm, no RETURNING; UPDATE ON only — stated limit), `s114-project-operations.test.ts`.
- **TS**: `PROJECT_OPERATIONS: Record<CompanyRole,…>` + `managesProjectOperations` / `supervisesProjectWork` /
  `receivesAssignedProjectAlerts` in `packages/shared/constants/roles.ts`; 22 hand lists replaced (schedule, punch ×3 incl.
  /m, PO ×6, selections ×6, team, contacts, project status, expenses ×3, split editor). Q8: assigned-PE project alerts
  (recipients.ts + check-in route, one predicate); safety alerts add only PEs assigned to the incident's project.
  Chat sub-thread candidates, surface toggle, translate readers: + PE. Catalog nav: + PE (read; manage stays O/A/PM).
  Tests inverted in place: `s130-ffnav` (old expectation quoted), `s123-incident-notify` comment. tsc exit 0; 7 unit files 104/104.
- **Q2 UI control**: none exists to remove. `grep -rn client_contract_amounts apps/web/{app,lib,components}` shows reads only;
  the one writer is `convert_estimate_to_project()` (SECURITY DEFINER, migrations 1051/1550/1770).
- **Debt filed**: `#1-s114a` (Q6 double-booking), `#2-s114a` (Q7 timesheets, both options).

### Reversible decisions taken unattended (narrower option)
1. `purchase_order_item_assignments`: the ASSIGNABLE member list stays the PM's (O/A/PM/F/crew) — the PE can assign lines, it
   cannot itself be assigned one. Alternative: add PE to the target list.
2. `files` for the PE: `change_orders`-category files excluded exactly as for the PM; `invoices` allowed (it holds invoice
   authority, 1910); `contracts` refused (carve-out 2). Alternative: allow change_orders files.
3. Client chat (Q9): the PE gets what the PM has — `may_enter_client_thread()` (read/enter). No staff role can INSERT into a
   client thread through RLS today; I did not add one for the PE. Alternative: a PE client-thread insert arm.
4. `schedule_entries`: no PE write of project-less rows (PTO/shop), even its own. Alternative: own project-less rows.
5. `projects` UPDATE: an already-archived project is not editable by the PE at all (WITH CHECK status <> 'archived').
6. Subcontractor detail page still redirects the PE (`subcontractors/[id]/page.tsx:43`) although S111 Q4 rules the directory
   readable — the DB read exists; the UI fails closed. Not widened here. Alternative: admit the PE read-only.

### ⚠️ Awaiting a ruling (reported, not acted on)
- `project_financials.contract_value` — the PE has INSERT/UPDATE arms from 1910 (on production). Q2's reasoning ("the
  contract value is the defining term of the agreement the client signed") may reach this figure too; Q2 named only
  `client_contract_amounts`. Not changed.
- Q4 lets the PE insert committed `subcontractor` expenses linked to a `sub_contract_id` by hand, i.e. build stage-like
  commitments without `setup_payment_schedule()` (and without its one-schedule-per-contract check). The subcontract's
  own terms (value, retainage) stay untouchable. Built as ruled; flagged.

## Step 5 — rebuild-test: negative-first, apply, verify, green

- Main CI 36361033388 **completed success** before any DB work; in-progress runs at push time: 0. Lint exit 0; `next build` exit 0 (133/133).
- **Negative-first (before the migrations):** carve-outs 11 passed / **2 failed — N9i (PE INSERTed a contract amount, tally 0→1)
  and N9u (PE changed contract_value 50000→1)**: Q2's defect, live. Operational: **36 failed** (every ON write refused) / 6 passed
  (control + the deliberate refusals: contracts file, project-less schedule, archive/trash, retainage expense, catalog write).
  Three fixture errors fixed on the way (catalog CHECK values; PO author default is get_my_member_id(), NULL for the service role).
- **Apply (rebuild-test only):** `supabase/.temp/project-ref` = nmyphyhmfttxkdoposvf. The four held files (1850/1860/1890/1900) copied
  in **temporarily, uncommitted** from their origin branches (S181 precedent; no `migration repair`). `db push --dry-run --include-all`
  exit 0 listed exactly 1940/1950/1960/1970/1980. Push exit 0, "Applying migration" ×5. Copies deleted; tree clean but the test file.
- **Verified by object (MCP):** ledger 5/5; `pe_read_arms` (ends-with `%\_project\_executive`, SELECT) **27** = 19+5+3;
  `pe_write_arms` **59** = 19+41+1−2; `client_contract_amounts` PE write arms **0**, read arm 1; storage arm 1; anon EXECUTE on
  `pe_can_upload_project_file` false; 7/7 functions name the PE; `setup_payment_schedule` no PE; contract void no PE;
  carve-out write arms naming the PE **0**.
- **After:** carve-outs **13/13**; operational **42/42** (one more fixture fix: a trigger pre-creates the selection's unique
  selection_amounts row — removed so the PE's insert lands where the tally sees it; BARE PO line set `issued` so
  flag_po_item_missing refuses on scope, not on line status). Row counts: every ON insert 0→1 or n→n+1, every BARE n→n with an RLS
  error; storage ON 1 / BARE 0; roster 10=10 profiles, 590=590 members, catalog 4=4; teardown 0 projects left.

## Step 6 — FILL-A-4 sabotage (rebuild-test, MCP), every one restored and read back

Pre-snapshot: policies on client_refunds / client_contracts / subcontractor_contracts / contract_documents /
client_contract_amounts `md5 379fda4a9cf049a1a5789274339bc914` (20 policies); `setup_payment_schedule` `d606120d…`;
`enforce_contract_void_authority` `def223b2…`; `pe_on_project` `97c8c884…`; `pe_can_upload_project_file` `f72520ec…`;
`is_assigned_to_project` `e105a6c0…`.

| Round | Sabotage | Red (as predicted) | Stayed green (and why) |
| --- | --- | --- | --- |
| A | 9 `…_s114_sabotage` arms (refunds I/U, client_contracts I/U, subcontracts I/U, contract_documents I, client_contract_amounts I/U) + PE added to `setup_payment_schedule` | **N1** 1→2, **N2** →approved, **N3** 2→3, **N4** notes changed, **N5** 1→2, **N7** 0→1, **N8** stage expense 0→1, **N9i** 0→1, **N9u** 50000→1 | N4v (void trigger: "Voiding a contract is Owner/Admin only"), **N6 — a PROBE DEFECT**: it updated `contract_value`, which `enforce_subcontractor_contracts_column_scope` refuses for non-O/A, so it measured the trigger, not RLS |
| — | restore A | policies md5 **379fda4a… (identical)**, setup md5 **d606120d… (identical)**, 0 sabotage left | |
| fix | N6 now updates `scope_of_work`; the value probe kept as **N6f**, plus **N6v** (subcontract void). Clean: 15/15 | | |
| B1 | client_contracts + subcontract UPDATE arms only | **N4**, **N6** | N4v, N6f, N6v — each refused by its trigger (second line proven live) |
| B2 | B1 + DISABLE `client_contracts_void_authority`, `subcontractor_contracts_void_authority`, `subcontractor_contracts_column_scope` | **N4v** →void, **N6f** →999999, **N6v** →void | — |
| — | restore B | ⚠️ first restore batch **rolled back** (a type error in my read-back SELECT inside the same batch); state re-read (2 arms left, 3 triggers `D`), restore re-run alone → policies md5 **379fda4a… identical**, void md5 **def223b2… identical**, all 15 triggers `O`, 0 sabotage left. Clean carve-outs 15/15 | |
| C | `pe_on_project` without its assignment clause; upload helper without its assignment join | 14 BARE probes (every arm scoped directly by `pe_on_project`, + storage) | 12 parent-resolved arms/functions (task deps, PO lines/assignments, selection children, chat, set_po_total, chat_can_post, budget capture) — their parent subquery also runs under the parent's SELECT RLS (`can_view_project`): a genuine second line |
| D | C + `is_assigned_to_project` = any project in my company | **all 28** BARE/scope probes, incl. the 12 above | 14 = ON updates + deliberate refusals |
| — | restore C/D | `pe_on_project` **97c8c884…**, upload helper **f72520ec…**, `is_assigned_to_project` **e105a6c0…** — all identical; anon EXECUTE false on all | |

Teardown after every round: 0 projects left. Clean final: carve-outs **15/15**, operational **42/42**.
⚠️ Stated limit, unchanged: `contract_documents` UPDATE cannot be isolated (PE has no SELECT on it; control reads 0).

## Step 7 — S157 sweep + regression runs (rebuild-test, after the migrations)

- Sweep: `grep -rln client_contract_amounts|project_executive|qa-pe apps/web/{test,e2e}` → 7 + 15 files read. One test named a
  behaviour this branch overturns: `s111-project-executive-writes.live.ts` **P3** (`client_contract_amounts_insert_project_executive`,
  an arm Q2 drops). Annotated in place, old title quoted, still asserting the refusal; the ON proof is s114 N9i/N9u.
  `s111-role-caps.test.ts` + `e2e/desktop-team.spec.ts` (withheld) are FILL-A-6's, inverted there.
- Existing PE live suites: `s111-project-executive-floor` 7/7, `-writes` 19/19, `s181-project-executive-liens` 17/17,
  `-retainage` 10/10.
- Other roles' suites through the seven replaced functions / changed notify code: `po18-committed` 8/8, `s112-co-summaries` 14/14,
  `s121-co-floor` 41/41, `s123-co-signed-notify` 8/8, `s123-incident-notify` 12/12, `s126-chat-sub` 7/7, `s97ct-budget-writers` 10/10,
  `s97ct-floor3` 19/19.
- Full committed unit suite: **132 files, 1837 tests, exit 0**. In-progress CI before any run: 0.
- Requesting CI on this HEAD (no `[skip ci]`).

## Step 8 — CI on the build: run 36364688797 on 763667b2 — **success** (Lint & Type Check success, E2E (Playwright) success)

## Step 9 — PRODUCTION (jwkcknyuyvcwcdeskrmz), worked under Josh's scoped override — runbook `S114-PRODUCTION-RUNBOOK.md`

**Step 0.** `project-ref` read `nmyphyhmfttxkdoposvf` → `supabase link --project-ref jwkcknyuyvcwcdeskrmz` exit 0 → reads
`jwkcknyuyvcwcdeskrmz`. Read-only pre-check (`supabase db query --linked`, exit 0), every value as expected:
`pe_profiles_now 0` · `newest_migration 20261930000000` · `s114_ledger_rows 0` · `pe_read_arms 19` · `pe_write_arms 19` (ends-with
pattern) · `contract_amount_arms 2` · `upload_helper 0` · `fn_md5_before` = the 1960 header exactly (c420c2c3 / ac7cfdfb / 42b561a9 /
28969ada / 9fcbda5e / 030fa292 / 7c596d84) · `pe_on_project` 97c8c884 and `is_assigned_to_project` e105a6c0 = rebuild-test.

**§1 `20261940000000_s114_pe_operational_arms.sql` — APPLIED, VERIFIED.** Dry run exit 0, exactly one line. Push exit 0:
`Applying migration 20261940000000_s114_pe_operational_arms.sql...` → `Finished supabase db push.`
| column | measured | expected |
| --- | --- | --- |
| ledger_row | 1 | 1 |
| pe_read_arms | 24 | 24 (19+5) |
| pe_write_arms | 60 | 60 (19+41) |
| named_arms (the 46) | 46 | 46 |
| pe_profiles_now | 0 | 0 |

**§2 `20261950000000_s114_pe_storage_upload_arm.sql` — APPLIED, VERIFIED.** Dry run exit 0, exactly one line. Push exit 0,
`Applying migration …` → `Finished supabase db push.`
| column | measured | expected |
| --- | --- | --- |
| ledger_row | 1 | 1 |
| storage_arm | 1 | 1 |
| pe_write_arms | 61 | 61 |
| helper_md5 | f72520ec11555bb6d74a47c258dce771 | f72520ec11555bb6d74a47c258dce771 |
| anon_can_run | false | false |
| pe_profiles_now | 0 | 0 |

**§3 `20261960000000_s114_pe_functions.sql` — APPLIED, VERIFIED.** Dry run exit 0, exactly one line. Push exit 0.
| column | measured | expected |
| --- | --- | --- |
| ledger_row | 1 | 1 |
| chat_can_post | c576b7fa8c622e9584e3313101a3446a | same |
| create_budget_line_at_capture | b499b0085c4d58a70a7e70ed41b081b6 | same |
| flag_po_item_missing | f8b4fb4b5800a7e371ca64b2057274a4 | same |
| get_approved_change_order_summaries | dcbc9ccf9d85c41e62dc4472e9ed14fa | same |
| issue_po_lines | d88f4fa6ee180b515abd451aef11aea1 | same |
| may_enter_client_thread | e3bf9066e29aa705094db89b3129461b | same |
| set_po_total_amount | ccfe85c605385084cbc5463c7a7d36b9 | same |
| setup_has_pe | false | false (Q5) |
| contract_void_has_pe | false | false (Q2) |
| pe_profiles_now | 0 | 0 |

**§4 `20261970000000_s114_pe_roster_catalog_reads.sql` — APPLIED, VERIFIED.** Dry run exit 0, exactly one line. Push exit 0.
| column | measured | expected |
| --- | --- | --- |
| ledger_row | 1 | 1 |
| named_arms (profiles / company_members / cost_catalog SELECT) | 3 | 3 |
| pe_read_arms | 27 | 27 (24+3) |
| pe_profiles_now | 0 | 0 |

**§5 `20261980000000_s114_pe_contract_amount_drops.sql` — APPLIED, VERIFIED.** Dry run exit 0, exactly one line. Push exit 0.
| column | measured | expected |
| --- | --- | --- |
| ledger_row | 1 | 1 |
| contract_amount_arms (PE insert/update) | 0 | 0 (Q2 B) |
| contract_amount_read_arm | 1 | 1 |
| pe_write_arms | 59 | 59 (61−2) |
| pe_read_arms | 27 | 27 |
| carveout_write_arms_with_pe (refunds, client/sub contracts, contract_documents) | 0 | 0 |
| s114_ledger_rows | 5 | 5 |
| newest_migration | 20261980000000 | 20261980000000 |
| pe_profiles_now | 0 | 0 |

Final `db push --dry-run` exit 0: **"Remote database is up to date."** Nothing written to production but the five migrations (no rows, no
grants, no backfill; no `migration repair`). Hold dir empty; `git status supabase/migrations` clean.
**Relinked:** `supabase link --project-ref nmyphyhmfttxkdoposvf` exit 0; `supabase/.temp/project-ref` reads **`nmyphyhmfttxkdoposvf`**.
