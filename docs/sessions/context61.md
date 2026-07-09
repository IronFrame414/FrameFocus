FrameFocus — Session 61 CLOSE / brief for Session 62. Outcome: the M5 launch schema is LIVE ON PRODUCTION — first-ever apply of all 6 M5 migrations, done supervised, after reconciling a prod migration-ledger mismatch. Types regenerated, tsc clean. Functional testing was deliberately deferred (chose the safe boundary). This doc is the handoff; read it, then verify with git before trusting any line.

HOW THIS SESSION RUNS (carry forward — unchanged)

- Git is ground truth. Verify with git log / status / ls / reading the file before asserting anything is committed, applied, or done. Don't trust this summary.
- One action at a time, then stop and wait. No bundling. Any gating check goes first, alone.
- Not a traditional developer — one command / file / click per step, report back before the next. Concise (~15 lines), no "what you should see if it worked" endings.
- Prod (jwkcknyuyvcwcdeskrmz) is hard to reverse. Throwaway-first, supervised, verified. Migrations via CLI ONLY (npx supabase db push) — never the SQL Editor.
- Never git add -A / commit -am — path-scoped commits only. I commit manually in scoped batches; CC never commits.

WHAT SESSION 61 ACTUALLY DID (verified live, not asserted)

- Confirmed start state: feat/module-5, HEAD 8ad46aa; baseline + 6 M5 migrations on disk.
- Corrected a stale claim from context60: 5F/5G/5I specs are ALREADY COMMITTED (f7b1d38 = 5F+5G, 3ef22b2 = 5I). context60's "commit these specs" was drift. The only pre-session uncommitted file was TECH_DEBT.md.
- Created a fresh throwaway Supabase project: name framefocus-rebuild-test, ref nmyphyhmfttxkdoposvf, region East US (Ohio) → pooler host aws-1-us-east-2.pooler.supabase.com:5432.
- Applied all 6 M5 migrations to the throwaway: clean. Verified via psql — 40 public tables; tasks / phases / task_dependencies all present. (db diff was NOT usable — no Docker in Codespaces; used pg_dump + psql instead.)
- Prod dry-run FAILED: "Remote migration versions not found in local migrations directory." Root cause: prod's ledger carried 37 pre-baseline migration rows (the un-squashed history); local has the squashed baseline (20260101000000) + 6 M5 files. This is the baseline/ledger mismatch, not a schema problem.
- Verified prod schema is a FAITHFUL SUBSET of the throwaway before touching anything: CREATE TABLE diff showed only ">" lines (the 18 M5 tables absent from prod, nothing prod-only); the column-line diff filtered to "^<" was EMPTY (no pre-M5 column in prod missing/different from the baseline). So the 6 M5 files were safe to apply on prod.
- Backed up prod's ledger to /tmp/prod_ledger_backup.csv (COPY 37) — undo insurance.
- Confirmed schema_migrations columns: version (text, NOT NULL, PK), statements (text[], nullable), name (text, nullable).
- Reconciled the ledger with ONE atomic statement (NOT the CLI's blind repair, NOT db pull):
  BEGIN; DELETE FROM supabase_migrations.schema_migrations; INSERT ... VALUES ('20260101000000'); COMMIT;
  → DELETE 37, INSERT 0 1, COMMIT. Ledger left with exactly the baseline row. Touched only the ledger table, never schema.
- Dry-run then showed exactly the 6 M5 migrations pending. Applied them to prod: all 6 applied, "Finished supabase db push."
  - One expected NOTICE during 5A: "files.project_id: nulled 2 orphaned placeholder value(s) before adding FK." The 2 file rows still exist; only their dangling project_id was nulled so the new FK could attach. Real prod data the empty throwaway couldn't surface.
- Confirmed 7 M5 tables now physically on prod (the same check returned 0 before the push): change_orders, client_contracts, company_members, phases, projects, punch_lists, tasks.
- Regenerated types: packages/shared/types/database.ts → 3474 lines, "company_members" appears 12× (reflects the new schema, replaces the hand-authored stopgap).
- npm run type-check: 5 successful / 5 total, no errors. shared/web/mobile ran fresh (cache miss) and passed → no schema/type drift.

STATE AT CLOSE

- Prod: M5 schema LIVE and verified. Ledger = baseline + 6 M5 rows.
- Working tree UNCOMMITTED (verify with git status; scoped commits are mine to make):
  - packages/shared/types/database.ts — regenerated types (was the stopgap)
  - TECH_DEBT.md — the #81→5I pointer rewrite, in progress
- No git push happened. feat/module-5 was NOT merged to main. The migration push was a DB operation, kept separate from git — as intended.
- Throwaway framefocus-rebuild-test is STILL LIVE (kept on purpose — see next session's first real task).

LANDMINES (confirmed/learned this session — do not trip)

- Prod pooler is aws-1-us-east-1; the throwaway is aws-1-us-east-2. Read the host from each project's Connect panel — they differ.
- The ledger fix: do NOT run the CLI's suggested `migration repair --status reverted [37 versions]` blindly, and NEVER `supabase db pull` here — db pull would overwrite/destroy the local M5 migration files. Back up the ledger, then reconcile with the atomic DELETE+INSERT above.
- Terminal paste hazard (bit us once): pasting previous command OUTPUT back into the shell runs each line as a command ("Connecting: command not found", etc.). Type commands fresh; don't paste prior output.
- npm run db:types trap CONFIRMED live: it does `... 2>/dev/null > database.ts`, so a failure is silent (empty file). After regenerating, verify: `wc -l database.ts` (expect thousands) + grep an M5 table name, then `npm run type-check`.
- db diff / any local-shadow-DB command needs Docker → unavailable in Codespaces. Use pg_dump + psql for schema verification instead.
- Supabase CLI: login + link from repo ROOT each rebuild; it caches the DB password in supabase/.temp so a re-link may not re-prompt — confirm the link target with `npx supabase projects list` (● marks the linked project) before any push.

ENVIRONMENT (wiped on rebuild — reinstall as needed)

- postgresql-client (psql + pg_dump), v17: sudo apt-get install -y postgresql-client
- Supabase CLI v2.88.1 (an update to 2.10x/2.109 was offered repeatedly — did NOT update mid-push; decide separately): npx supabase login + npx supabase link (from repo root)
- CC only if needed: npm install -g @anthropic-ai/claude-code
- Prod ref jwkcknyuyvcwcdeskrmz (us-east-1). Throwaway ref nmyphyhmfttxkdoposvf (us-east-2). DB passwords: letters+numbers only.

NEXT SESSION — START HERE (functional tests, no prod writes)
Session 61 deliberately stopped before functional testing to avoid writing test data into prod at the tail of a long push. The plan:

1. Ground-truth the tree first (git branch / log / status) — a parallel session may have moved things; database.ts + TECH_DEBT.md should still be the uncommitted pair unless committed since.
2. SEED THE THROWAWAY (framefocus-rebuild-test) with test data — at minimum an estimate to convert — so the conversion trace and gate tests run there, NOT on prod.
3. Then run the deferred functional tests against the throwaway:
   - Conversion trace: EST-0001 → PRJ-0001; row counts; Σ budgeted < contract_value; provenance FKs.
   - RLS by role.
   - Punch-complete gate.
   - CO create/send gates (Owner/Admin/PM all have create-and-send; sending = internal acceptance, client signature = binding).

ALSO OPEN (not blocking; carried from before)

- Scoped commits for database.ts and TECH_DEBT.md — capture the hashes at close and carry forward.
- Deferred docs pass: rewrite TECH_DEBT.md #81 as a pointer to 5I (delete only after the sub-portal is built); file the 5x row-type-enum tech-debt item. (5F/5G/5I specs are already committed — that part of context60 was stale.)
- Sub-portal 5I: decide M5-launch scope (in vs deferred); build 5I (invite create-side + portal surface).
- Module 6 spec session: confirm 6A–6E breakdown, interview-first on 6A.
- Post-Module-4: evaluate Kamai (kamai.io) for blueprint-to-structured-data integration.
- Housekeeping: the throwaway can be deleted once functional testing no longer needs it.
