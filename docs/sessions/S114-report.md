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
