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
