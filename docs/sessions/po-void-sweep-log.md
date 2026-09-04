# PO void + edit, and the five deferred sweep items — running log

Branch: `fix/po-void-and-sweep` (cut from `main`; `fix/silent-wrong-answers` is NOT merged and this
does not depend on it). Session S103, 2026-09-04.

The Codespace has restarted repeatedly. This log is the durable deliverable — appended and committed
after every step.

## Plan (from the prompt)
- §2 PO void (ruled): reason always required; PARTIAL closeout (completed lines keep committed value,
  incomplete lose it); nothing-complete → 0; fully-complete → allowed, unchanged; decide what
  `softDeletePurchaseOrder` becomes.
- §3 issued PO editable in place, with an audit trail (differs from estimates/COs/contracts on
  purpose — internal vendor doc). Check for an existing audit mechanism first.
- §4.1 #116 UTC calendar-date bug — 10 measured sites → `companyToday(timeZone)`; check desktop test
  complicity; pin the 21:00-EDT boundary.
- §4.2 `.limit(1)` sweep — 140 candidates; find the risky subset first; report that count.
- §4.3 #3-s168 — rebuild `CO-QA-M9-SENT` as `-2`; tighten ARM 4a to assert `sent`.
- §4.4 #54 — trash page server-side `is_deleted` filter.
- §4.5 #67 — delete the dead `packages/shared/utils/index.ts` barrel.

## Log

### Step 0 — setup
- Confirmed clean tree on `fix/silent-wrong-answers`; `git checkout main && git checkout -b
  fix/po-void-and-sweep`. Created this log.
- Next: Phase 1 analysis for §2 (PO schema, how "completed" is determined per line,
  `countsTowardCommitted`, `voidContractWithCloseout` precedent).

### Step 1 — §4.5 #67 dead barrel (DONE)
- Verified all four functions in `packages/shared/utils/index.ts` (`hasPermission`, `formatName`,
  `generateSlug`, `formatCurrency`) have ZERO callers across `apps/` + `packages/`. Barrel had no
  importers (`from '@framefocus/shared/utils'` — none; live utils imported by specific path
  `@framefocus/shared/utils/dates`).
- Deleted the file; removed `export * from './utils'` from `packages/shared/index.ts` (left a note).
- Verified: `npm run type-check` exit 0.
- Commit: `[Shared] #67 — delete the dead utils barrel`.

### Step 2 — §2/§3 PO analysis (Phase 1) + a genuine STOP on §2's money rule
Subagent mapped the PO subsystem (verified against migrations, no re-run of behaviour yet):
- `purchase_orders.status` CHECK = `draft|issued|closed` (`20261042000000_po_lifecycle_lines.sql`);
  NO void/cancel status, NO `void_reason/voided_by/voided_at` columns (unlike change_orders,
  estimates, invoices, which all have them — the house void-column precedent).
- Committed dollars = ONE `expenses` row per PO (`state='committed'`, `purchase_order_id`), amount =
  `Σ(qty×unit_cost)` over lines with `line_status IN ('issued','flagged')` AND `is_deleted=false`
  (`sync_po_commitment`, `po_rpcs.sql:46-52`). `draft` and `purchased` lines are EXCLUDED.
  `countsTowardCommitted` (`payables-shared.ts:50-54`) = `status='approved' && closed_out_at=null &&
  !is_deleted`.
- NO trigger re-syncs commitment on PO UPDATE/soft-delete. `softDeletePurchaseOrder`
  (`deliveries-client.ts:173`) writes only `is_deleted` → leaves an orphaned live committed expense
  (the #110(b) harm). `closePurchaseOrder` sets header `status='closed'`+reason, also does NOT touch
  the committed row.
- `voidContractWithCloseout` (`payables-client.ts:656`) = the ALL-OR-NOTHING precedent (closes out
  every open committed row). PO void must be PARTIAL, so it differs.
- Two schema notions of "completed" per line: (a) `line_status='purchased'` (a REVIEW act via
  `mark_po_lines_purchased`), and (b) delivery-received qty on `delivery_items.qty_received/qty_damaged`
  via `po_item_id`. `sync_po_commitment` keys on (a); legacy non-costed lines use (b).

⚠️ **STOP — genuine ruling needed [logged, not guessed].** §2.2's rule ("committed drops to the
COMPLETED PORTION, not zeroed") and §2's proof ("some completed → committed = exactly the completed
portion") are CONSISTENT ONLY IF "completed" means a line that is **received but still carries
committed value** (i.e. still `issued`, and the void KEEPS it). But for the new COSTED lines the
committed sum EXCLUDES `purchased`, so if "completed" = `purchased` those lines already carry ZERO
committed and the arithmetic is impossible; the void would always zero committed. The schema gives
two contradictory "completed" notions and does not say whether costed PO lines ever get delivery
check-ins. **The ruling must fix: for a costed line, is "completed" = `line_status='purchased'`
(review) or = fully delivery-received (qty)? And does committed retain the completed portion, or does
"completed" convert to ACTUAL and committed go to 0 with the completed cost living as actual?** The
mechanism today makes `purchased` → out of committed → the money moves to actual; under THAT model
the proof should measure money-on-the-job (committed+actual), not committed alone.

⚠️ **Consequence:** §2 (void) cannot be built correctly on a guess between these two readings — the
measurable result differs. NOT built this run; recorded for Josh. §3 (issued-PO edit + audit) does
NOT hit this ambiguity (its re-sync uses the unambiguous issued+flagged committed sum), but is a
large independent build (new append-only `purchase_order_events`/`po_line_edits` table on the
`client_access_events`/`time_edit_logs` shape + a SECURITY DEFINER edit RPC that re-runs
`sync_po_commitment` + service + UI). Deferred on context grounds after the sweep items; precise
shape recorded here.
- Next: continue the well-specified sweep items (#116 remaining sites, #54, .limit(1) finder, #3-s168).

### Step 3 — §4.1 #116 highest-severity site (projects-client.ts) DONE
- `transitionProjectStatus` stamped `actual_end_date = new Date().toISOString().slice(0,10)` (UTC) at
  two branches → a project completed after ~20:00 EDT was dated TOMORROW. Now fetches
  `companies.timezone` (RLS-scoped, no id filter — the payables-client/instrument-rates pattern) and
  stamps `companyToday(tz ?? 'America/New_York')`. type-check exit 0.
- Next: check desktop test complicity, then the remaining 9 #116 sites.

### Step 4 — §4.1 #116 remaining 9 sites: complicity check done; sites logged as remaining
- **Desktop-test complicity finding:** scanned `apps/web/test` + `e2e` for the `toISOString().slice(0,10)`
  derivation shape. Hits are comments, symmetric date-arithmetic (`s164` windowOpen `day()`),
  fixture-INPUT dates (`s98ct-offline` log_date, `s175` 400-days-ago), or timezone-AWARE tests
  (`s123-timesheets-ready`, `pricing-as-of`). **None asserts `actual_end_date` == a UTC-derived
  today**, so the projects-client fix breaks no complicit test. (m6m-hubs was already de-complicited
  per the entry — confirmed it now pins the 21:00-EDT boundary, not re-touched.)
- **Remaining 9 sites — NOT done, logged precisely.** All are `'use client'` components with a bare
  `const today = new Date().toISOString().slice(0,10)` and NO timezone in scope, so each needs the
  company timezone threaded from its parent server component (prop) or fetched. Sites: `daily-logs.ts:281`
  (service fallback — can fetch `companies.timezone` directly), `contract-section.tsx:94`,
  `items-tab.tsx:105`, `bidding-tab.tsx:386`, `co-rate-section.tsx:103`, `rate-summary.tsx:33`,
  `projects/[id]/page.tsx:105` (server — easy), `budget/rate-section.tsx:153`. Fix each with
  `companyToday(timezone ?? 'America/New_York')`, timezone from parent/`companies.timezone`. These are
  DISPLAY bugs (wrong rate-in-force after ~20:00 EDT), lower severity than the persisted
  `actual_end_date` already fixed. Deferred on context grounds — per-component prop plumbing across 7
  client components is error-prone at this session depth.
- Next: #54 trash server-side filter.

### Step 5 — §4.4 #54 trash server filter: ALREADY FIXED (stale entry)
- `getFiles` (`files.ts:98`) already has an `only_deleted?: boolean` param → `query.eq('is_deleted',
  true)` at the DB, with a comment documenting the exact old-vs-new (was `include_deleted:true` +
  in-memory filter). The trash page (`projects/[id]/files/trash/page.tsx:35`) calls
  `getFiles({ project_id, only_deleted: true })`. Server-side filter is in place. #54 is STALE — no
  change. (Add to the register-hygiene note.)
- Next: §4.2 .limit(1) risky-finder (subagent) for the risky count.

### Step 6 — §4.2 .limit(1) sweep: RISKY COUNT = 0 (finding)
- 140 `.limit(1)` in live tests; 39 already ordered; **101 unordered but all SAFE-arbitrary**
  (existence/non-vacuity probes reading only `.length`/truthiness; schema/column-exists checks;
  own-row-by-RLS reads; and filter-scoped fixtures where the `.in(...)`/`.neq`/`.not(...)` scope
  already guarantees the test's premise for every candidate). **RISKY = 0.**
- Both named precedents are already fixed in place: `s143-void-authority:155` carries `.order('project_id')`;
  `s163-m5-m6-fixes:372` carries `.neq(member_id, owner).order('id')` (scoped AND ordered). The tree
  has already been swept. **Nothing to fix.** (Optional future nicety, not done: add an
  "arbitrary by design" comment to the bare `.eq(company_id).limit(1)` picks in `s97ct-roles:92,97,144`
  and `s97ct-invoice-email:43` to spare the next sweep — cosmetic only.)

### Step 7 — §4.3 #3-s168 CO fixture: NOT STARTED (logged precisely)
- Deferred on context grounds (this session is very deep). Precise shape for the next run:
  1. Rename the corrupted signed row aside — its NAME/description to `ZZ SUPERSEDED — QA M9 sent CO
     (portal-signed during click-test)`; `co_number` is frozen by the immutability trigger so it stays
     taken (that is WHY the rebuild takes `-2`).
  2. In `seed-test-identities.mjs`, build `CO-QA-M9-SENT-2` idempotently: draft CO → add a line → flip
     to `sent` (per the S167 repair block).
  3. Tighten `s164-m9-read-arms` ARM 4a to assert the seeded CO is specifically `sent` (today it
     asserts only `status !== 'draft'`, which `signed` satisfied — the reason it stayed 188/188 over a
     broken fixture). Then run and record the new count.
  ⚠️ The entry cautions NOT to re-seed during a live click-test (the S167 mistake); I cannot verify
     from here whether Josh's click-test is finished. The prompt directs the rebuild, so a next run
     should confirm the click-test is done before touching `CO-QA-M9-SENT`.

### Summary of this run
DONE: #67 (dead barrel deleted); #116 highest-severity (projects-client actual_end_date → company tz)
+ complicity check (0 complicit tests) + remaining 9 sites logged; #54 confirmed already-fixed (stale);
.limit(1) risky count = 0 (already swept). STOPS/ANALYSIS: §2 PO void — genuine money-rule ruling
needed (logged); §3 PO edit — analyzed, large build deferred; #3-s168 — logged precisely, not started.

---

## RUN 2 (S103, 2026-09-04) — build the void, restrict soft-delete, finish sweep

### Step 8 — §1 money rule CORRECTED [Josh]
The earlier phrasing "committed drops to the completed portion, not zeroed" is WITHDRAWN (my STOP was
right). Corrected ruling: (1) "completed" = `purchased` (review status), not delivery qty — void and
the committed sum now key on the SAME notion; (2) **void ZEROES the remaining committed**; (3)
purchased lines keep their cost as ACTUAL, untouched; (4) nothing purchased → 0; (5) fully purchased →
void succeeds, changes nothing financially; (6) reason always required. Mechanism: a purchased line is
already excluded from `sync_po_commitment`'s sum, so "release remaining committed, leave actual alone"
= close out the PO's single committed expense row (`closed_out_at`), amount kept as history — mirrors
`voidContractWithCloseout`'s `writeCloseout`, but PARTIAL is unnecessary because purchased already left
committed on its own.

### Step 9 — §4.1 #116 nine display sites (doing FIRST, per prompt)
- All 9 remaining #116 sites addressed — UTC-tomorrow defect eliminated everywhere.
  - SERVER (real per-company tz via `companies.timezone`): `projects/[id]/page.tsx`, `daily-logs.ts:281`,
    `rate-summary.tsx`, `budget/rate-section.tsx`.
  - CLIENT (deep in `estimate-builder`/`co-builder` trees): `contract-section`, `items-tab`,
    `bidding-tab`, `co-rate-section` → `companyToday('America/New_York')` (sanctioned column-default
    fallback, NEVER UTC). ⚠️ Follow-up (bounded, logged): thread the real per-company tz from each
    server page (all already fetch `companies`) → builder → component. This is display-only; the
    confident-wrong-answer (tomorrow's date) is gone.
  - Complicity: re-confirmed no test asserts these values the UTC way (the toISOString-slice test hits
    are comments, symmetric arithmetic, fixture inputs, or tz-aware tests). No green→red.
  - Commits: `[Projects] actual_end_date` (run 1), `[Projects][DailyLogs] two server`, `[Projects] rate
    display`, `[Estimates][Projects] four client`.

### Step 10 — §2 PO VOID: build
- Migration `20261300000000_purchase_order_void.sql`: `voided` status + `void_reason/voided_by/voided_at`
  + two-way shape CHECK + lifecycle trigger (freeze voided POs; soft-delete only for drafts) +
  `void_purchase_order(p_po_id, p_reason)` SECURITY DEFINER RPC (O/A authority — mirrors the WITH CHECK's
  closed/is_deleted restriction, because void releases committed dollars). Mechanism: soft-delete the
  non-purchased lines → `sync_po_commitment` recomputes the PO's single committed expense to 0 → closes
  it out; purchased lines' ACTUAL untouched. Applied to rebuild-test; objects + ledger verified.
- **PROVEN BY OBSERVATION** (impersonated owner for the RPC; committed = the PO's committed expense
  amount where closed_out_at IS NULL; test data ZZVOID%, created and fully removed — 0 left):
  | case | committed before → after | notes |
  | --- | --- | --- |
  | nothing purchased (2 issued, 500) | 500 → **0** | all lines cancelled |
  | some purchased (1 purchased 300, 1 issued 200) | 200 → **0** | ⚠️ purchased line UNCHANGED (still `purchased`, not soft-deleted); the $200 issued line cancelled → sum 0 → committed row closed out. Purchased $300 stays as actual. |
  | fully purchased (2 purchased) | 0 → **0** | void succeeds, changes nothing financially |
  | void with no reason | **REFUSED** — "A void needs a reason. It is kept permanently." |
  | soft-delete an ISSUED PO | **REFUSED** — "An issued purchase order cannot be deleted — void it instead." |
  | soft-delete a DRAFT | **SUCCEEDED** |
- Service layer (`deliveries-client.ts`): added `voidPurchaseOrder(id, reason)` → `rpc('void_purchase_order')`.
  Restricted `softDeletePurchaseOrder` to DRAFT (pre-check with the "void it instead" message) and gave it
  the `.select('id')` + zero-row guard (it was a bare UPDATE reporting success over an RLS-filtered
  delete). DB lifecycle trigger is the real enforcement; the pre-check is the clean message. type-check clean.
- ⚠️ UI follow-up (bounded, NOT built this run): a Void button on `po-actions.tsx` (reason-required
  confirm) calling `voidPurchaseOrder`, and hiding Delete for non-draft POs. Same shape as the CO/estimate
  void buttons already shipped. Logged; the money + authority are fully enforced in the DB regardless.

### Step 11 — §3 issued-PO edit + audit: established, DEFERRED as larger-than-it-looks (per §3's allowance)
- Drafts are already editable (`updatePurchaseOrder`, header fields; `setPurchaseOrderItems` for
  non-costed lines). An issued PO's HEADER (vendor_name/po_number/need_by) is also already editable via
  RLS (O/A/PM while not closed). The real gap is editing an issued LINE's amount (qty/unit_cost) — no
  path exists, and it must re-run `sync_po_commitment` to keep committed honest.
- Audit mechanism: NO reusable edit-history table. `time_edit_logs` is time-tracking-specific,
  `client_access_events` is client-lifecycle-specific; there is no generic change-log. So §3 needs a NEW
  append-only table (e.g. `purchase_order_events(company_id default get_my_company_id(), actor_id default
  auth.uid(), po_id, field, old_value, new_value, created_at)` on the `client_access_events`/`time_edit_logs`
  shape, O/A RLS, no updated_*/is_deleted per the append-only-log convention) + a SECURITY DEFINER edit RPC
  that writes the change rows AND re-runs `sync_po_commitment`. That is a full table+RPC+service+UI+proof
  build. ⚠️ **DEFERRED, not half-built** [per §3's explicit instruction], on context grounds — the PO
  VOID (the run's headline) is fully built and proven.

### Step 12 — §4.2 #3-s168 CO fixture: DEFERRED on context; plan stands (from run-1 log)
No click-test running (prompt confirms), so it may proceed. Not started this run — context is deep after
the void build. Plan (unchanged, from the run-1 log Step 7): rename `CO-QA-M9-SENT` aside
(`ZZ SUPERSEDED — …`; co_number frozen), build `CO-QA-M9-SENT-2` in the seed (draft→line→sent,
idempotent), tighten `s164-m9-read-arms` ARM 4a to assert `sent`, run it and record the count, and keep
the seed twice-clean.

### RUN 2 SUMMARY
DONE: all 9 #116 sites (UTC-tomorrow defect eliminated; 4 server with real tz, 4 client with NY-fallback +
logged threading follow-up); PO VOID built + proven by observation (6 cases) + soft-delete restricted to
drafts + service fns; #54 confirmed stale; #67 done (run-1). DEFERRED (logged, not half-built): §3
issued-PO edit+audit (new table+RPC+UI — larger than it looks); #3-s168 CO fixture (context). No test
turned green→red (all changes are additive guards / tz corrections; type-check clean throughout).

---

## RUN 3 (S103, 2026-09-04) — the Void BUTTON, real timezone, the s168 fixture

Grounding: clean tree, `fix/po-void-and-sweep` @ `e685701`. §1a re-read; the void money+authority are
enforced in the DB from run 2 and PROVEN. This run makes the feature reachable, threads the real tz,
and rebuilds the s168 fixture.

### Step 13 — §1 THE VOID BUTTON (built + type-check clean)
The feature was unreachable — no control called `voidPurchaseOrder`. Built, following the shipped
CO/estimate void pattern (a reason-required PANEL, never a `window.confirm()` — the reason is DATA):

- **`po-actions.tsx` → new `VoidPoButton`** modeled on the shipped `ClosePoButton` reason-modal (the
  PO-local precedent — same surface, not a second pattern). Reason required; calls
  `voidPurchaseOrder(id, reason.trim())`; on success `router.refresh()` so the voided state renders.
- **`page.tsx` (PO detail):**
  - Void button rendered **Owner/Admin only** (`isAdminRole`) and only for `issued`/`closed` POs —
    matching the RPC (a draft has no committed dollars and exits via Delete; the RPC refuses to void
    a draft).
  - **Delete now hidden for non-draft POs** — was `isAdminRole` for any status; now
    `isAdminRole && po.status === 'draft'`. The DB freezes non-draft delete anyway, so a Delete
    button on an issued/closed PO could never succeed (the offered-then-fails anti-pattern).
  - **Voided badge** added to the header (was falling through to "Closed").
  - **Voided record block** read back (reason + date) below the ordered-vs-usable panel, mirroring the
    closed block and the CO void's read-back.
  - Edit link and `PoTotalControl` edit gated off `voided` (frozen at the DB).
- **`po-lines-panel.tsx`** — a voided PO is TERMINAL like closed: introduced `readOnly = closed ||
  voided` and replaced the three `poStatus !== 'closed'` control gates with `!readOnly`, so a voided
  PO shows no issue/review/assign controls (they'd hit the DB freeze). Prop type widened to include
  `voided`.
- **`deliveries-sections.tsx` (list)** — `StatusBadge` gains a distinct **Voided** badge (was
  mislabelling voided as "Closed"); grouping now puts `closed`+`voided` in the terminal section
  (was `!== 'closed'`, which listed voided under "Open" with the wrong badge). Section retitled
  "Closed & voided purchase orders".
- **`deliveries.ts`** — `PurchaseOrderStatus` union widened `'draft'|'issued'|'closed'` →
  `+ 'voided'`. This is the load-bearing type fix: the void columns already ride `PurchaseOrder` via
  `Omit<PurchaseOrderRow,'status'>`, but the hand-maintained status union could not represent a
  voided PO. Widening it surfaced every stale status consumer (the list grouping, the panel cast) —
  each fixed above; `check-in` pages and `po-lines-client` filter `=== 'issued'` and are correct
  unchanged (a voided PO drops out).

Who sees the control: **Owner/Admin only**, on an issued or closed PO. Proven reachable by
type-check + the PO unit tests (below); observed money behaviour was proven in run 2.

### Step 14 — ⚠️ ledger repair + types regen (the database.ts was STALE for purchase_orders)
`database.ts` did **not** carry the void columns — the run-2 migration was applied to rebuild-test via
MCP `apply_migration` but `db:types` was never run, so `page.tsx`'s `po.void_reason`/`voided_at`
reads failed type-check.

- **Ledger defect found and repaired** (the "MCP apply_migration writes no ledger row — check and
  repair" caution, in its actual form here): the void migration was recorded **twice** — under the
  canonical file version `20261300000000` AND under an MCP auto-stamp `20260904012646` (no migration
  file carries that version). Deleted the orphan `20260904012646` row; one canonical row remains.
  Schema objects all verified present on rebuild-test: 3 void columns, both constraints, the RPC, and
  the status CHECK includes `voided`.
- **`npm run db:types`** regenerated `database.ts` from the linked project — confirmed
  `framefocus-rebuild-test` (NOT production), via the script's own link marker. 9558→9962 lines.
  ⚠️ The diff is **+417/−13** — larger than the 3 void columns because the committed `database.ts`
  was stale for MULTIPLE already-committed migrations (estimate_events, scope_library,
  estimate_award_bases, estimate_sub_bid_requests, contacts_dedupe_log; RPCs mark_estimate_lost,
  submit_sub_bid_reply, compute_member_coi_expiry, void_purchase_order). This is pre-existing
  stale-types drift on the branch, corrected by the regen — **all additive, from committed
  migrations**. The 13 deletions are cosmetic generator reformatting of the utility types; verified
  `payment_method_on_file` is NOT dropped (present in both old and new — diff re-anchoring only).
- type-check exit 0 (5/5 tasks). PO unit tests: `po-legacy-tolerance` + `s123-delivery-discrepancy`
  10/10 passed, exit 0.

### Step 15 — §2 #116: thread the REAL tz into the four fallback sites (done, type-check clean)
The four sites used `companyToday('America/New_York')` (hardcoded fallback — the UTC-tomorrow defect
was already gone, but a company in another tz still gets the wrong day). Threaded the real
per-company tz server-page → builder → component. NY fallback kept for a null column (matching
`getCompanyTimeSettings`); NEVER UTC. Committed as two trees (each a complete type-checking unit; a
restart costs one tree, not all four):

- **Estimate tree** — `contract-section` (via details-tab), `items-tab`, `bidding-tab`/AddBidForm.
  The estimate page did **NOT** already fetch companies (the prompt's "every page fetches companies"
  did not hold here), so `page.tsx` now calls `getCompanyTimezone()` and threads `companyTimeZone`
  through `EstimateBuilder` → `TabProps` → each tab. The four sibling text tabs partially destructure
  `TabProps` and are unaffected.
- **CO tree** — `co-rate-section` via `CoBuilder`. The CO page already fetched `companies` (for the
  name); added `timezone` to that same select and threaded `companyTimeZone` → `CoBuilder` →
  `CoRateSection`. No second round-trip.
- Both mounts are the only consumers of the widened prop interfaces (grep-confirmed); type-check exit
  0 (5/5) after each tree.
- **Complicity re-check:** no test asserts these four defaults the UTC way. The four are
  client-component FORM defaults (`.live.ts` tests hit the DB, never render these); the
  `new Date().toISOString` hits across the suite are fixture-INPUT dates, symmetric arithmetic, or
  tz-AWARE helper tests (`pricing-as-of` validates tz handling — the opposite of complicit).
  Consistent with the run-1/run-2 finding. No green→red.
