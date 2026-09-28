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
