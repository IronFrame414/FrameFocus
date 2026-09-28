# S114 PART B — exclude a project from QuickBooks — report

Branch `feature/s114-b-qb-exclusion` (rebased onto `main` `584573e7`). Full running log: `docs/sessions/S114-C-report.md`
Steps 3, 17, 19–21 (it carries PART B's entries too). Rulings: R3; Q16 A (table, Admin read-only line); Q17 A (all five);
Q18 **reversed** by P5 (control shown always, connected or not).

- **FILL-B-1:** a working, trigger-driven integration (`qb_enqueue()` from five AFTER triggers + the job chain; cron drain every
  5 min). QuickBooks has no project object — everything posts to the client's Customer.
- **FILL-B-2:** every push is born in `qb_enqueue()` and leaves through the worker's drain loop → two gates:
  ENTRY (`qb_enqueue` / `qb_enqueue_job_chain` return NULL for an excluded project's entity) and EXIT (worker drops a row
  at pickup: `failed_terminal`, reason "Not sent: this project is excluded from QuickBooks by the Owner."; a failed check
  is transient — never push on doubt). Client payments: excluded if ANY covered invoice is (Q17 d).
- **FILL-B-3:** `project_qb_exclusions` (migration `20262010000000`): INSERT/UPDATE **Owner** only, SELECT Owner + Admin,
  no other arm; resolvers EXECUTE service_role only. Live proof `s114-qb-exclusion.live.ts` 14/14: Admin / PM / PE
  inserts refused (no RETURNING, service-role tally 0 → 0); PE and PM read 0 rows; Admin cannot re-include; entry gate
  queues nothing for an excluded project's sent invoice (control queues invoice + customer); resolver per type; exit gate.
  Sabotage: Admin INSERT + PE SELECT policies → 4 red; resolver → false → 5 red; restored, md5 identical.
- **FILL-B-4:** `QbExclusionControl` in the project overview STATUS card; Owner button ("Exclude from QuickBooks" /
  "Include in QuickBooks again") with a confirm stating how many records already in QuickBooks stop being updated; state
  line "Not syncing to QuickBooks since <date> (<name>)" for Owner and Admin; PE / PM / field / client: nothing
  (`QB_PROJECT_EXCLUSION` total map). No /m surface (STATUS section was cut from /m) — stated, not a divergence.
- **FILL-B-5:** P5 (Josh, production): QuickBooks disconnected on both companies; 0 pushed records, 0 queued.
- ⚠️ **Q17 (a)–(e): BUILT TO RULING, UNPROVEN AGAINST LIVE QUICKBOOKS DATA** — there is none. Nothing here talked to Intuit.
- Trial deletion: `project_qb_exclusions` added to the walk (census test caught its absence). Types: +3 blocks only.
- Local: tsc 0; unit 133 files / 1,845 tests (pre-rebase); `next build` exit 0. Migration on production: **Josh's runbook
  §3** (`docs/sessions/S114-CB-PRODUCTION-RUNBOOK.md`). Not merged until verified there.
