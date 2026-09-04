# Session log — sent-estimate freeze + issued PO line edit

Branch: `fix/sent-freeze-po-line-edit`, off `main` @ `0210019`.
Two rulings [Josh, S103]: (1) nobody edits a sent estimate; (2) issued PO lines editable Owner/Admin
only, with an audit trail + `sync_po_commitment` recompute.

⚠️ `feature/estimates-redesign` is UNMERGED and bears on both items. Every finding names which tree it
came from. Migrations: rebuild-test only, never production; check ledger after each `apply_migration`.

---

## Phase 0 — branch
- Confirmed `feature/estimates-redesign` tree clean (`git status --porcelain` empty).
- `git checkout main && git checkout -b fix/sent-freeze-po-line-edit`. main tip `0210019`.
- Created this log.

## Phase 1 — READ-ONLY analysis

### Environment / tooling
- No Supabase MCP tools this session. Used `supabase db query --linked` (Management API → rebuild-test)
  for read-only catalog reads, and `@supabase/supabase-js` (anon + service-role, reading `.env.local`)
  for the live owner-probe. Migrations will go via `supabase db push` (records the ledger).
- ⚠️ **`supabase migration list` shows MANY remote-only entries (`"local":""`) applied to rebuild-test
  with no file on `main`** — the `feature/estimates-redesign` migrations (20261110000000–20261260000000
  and others) are ALREADY LIVE on rebuild-test. **So a live probe reflects the BRANCH tree, not main.**
  Findings below name their tree accordingly.

### ITEM 1 — is the sent-estimate hole still open?

**Trigger present on both trees:** `estimates_z_immutability` → `enforce_estimate_immutability()`, a
BEFORE UPDATE trigger. ⚠️ Its `z_` name makes it fire LAST (after `estimates_set_updated_by` and
`estimates_updated_at`), so `updated_at`/`updated_by` are ALWAYS different in the check — any allowlist
MUST permit them or every sent-estimate write dies.

**Shape = DENYLIST** (lists frozen columns; anything unlisted is writable). Same shape as the cited
precedent `enforce_change_order_immutability` (which is ALSO a denylist, not the allowlist the ruling
describes — a finding).

**Freeze list differs by tree:**
- `main` (`20261032000000_estimate_void_reissue.sql`): freezes the money/content set but NOT
  `deposit_percent`, `invoice_due_days`, `also_send_to`, nor the `lost_reason_code`/decline-reason arm.
- `feature/estimates-redesign` (adds `20261120000000` deposit_terms, `20261190000000` mark_lost_reason,
  `20261210000000` also_send_to_freeze): adds `deposit_percent`, `invoice_due_days`, `also_send_to` to
  the freeze and the decline/lost-reason once-set guards. This is what is LIVE on rebuild-test.

**LIVE PROBE (branch, owner via anon key, throwaway `status='sent'` estimate — measured, not inferred):**
| column | result |
| --- | --- |
| name, grand_total, scope_summary, deposit_percent, also_send_to | **REFUSED** — "A sent estimate is immutable" |
| **internal_notes, projected_value, reminder_schedule** | ⚠️ **APPLIED — HOLES** |
| viewed_at, reminder_count | APPLIED (correct — machinery) |

⇒ **Item 1 is PARTIALLY closed.** The original `#2-s174` holes (name, grand_total, scope_summary) are
CLOSED on both trees. But the denylist leaves holes: measured `internal_notes`, `projected_value`,
`reminder_schedule`; and by column-census also the identity/audit columns `id`, `company_id`,
`created_at`, `created_by`, `created_by_role`, `parent_estimate_id`, `cloned_from_estimate_id`, and
`is_deleted`/`deleted_at`, `project_id`, `signed_contract_file_id`. On `main`, additionally
`deposit_percent`/`invoice_due_days`/`also_send_to`. **Build = convert the denylist to an allowlist.**

### Every writer that touches a sent (OLD.status NOT draft/review) estimate, and its columns
The send transition itself (draft/review → sent) is EXEMPT — the trigger early-returns when OLD.status
is draft/review, so `sent_at`/`reviewed_at`/`reviewed_by`/totals are written while still a draft.
Writers acting on an ALREADY-sent row:
| writer | columns on `estimates` |
| --- | --- |
| `lib/proposal/record-view.ts` | viewed_at |
| `lib/notify/crons/estimate-reminders.ts` | reminder_count, last_reminder_sent_at; also status→'expired' |
| `signing-service.ts` completeSignature | status→accepted, accepted_at, signed_proposal_file_id |
| `signing-service.ts` declineEstimate | status→declined, declined_at, decline_reason_code, decline_reason_notes |
| `signing-service.ts` unsubscribe | client_unsubscribed_at |
| `void_estimate` RPC | status→voided, void_reason, voided_at, voided_by |
| `mark_estimate_lost` RPC | status→declined, declined_at, lost_reason_code |
| `convert_estimate_to_project` RPC | project_id, status→converted |
| `estimates-client.ts` soft-delete | is_deleted, deleted_at |
| triggers (always) | updated_at, updated_by |

⚠️ **Writers the ruling's permitted list would BREAK** (its list: viewed_at, accepted_at, declined_at,
reminder_count, last_reminder_sent_at, client_unsubscribed_at, signed_proposal_file_id, status):
- `void_estimate` → **void_reason, voided_at, voided_by** (NOT on the list) → void breaks
- `mark_estimate_lost` → **lost_reason_code** → mark-lost breaks
- decline → **decline_reason_code, decline_reason_notes** → decline-reason breaks
- convert → **project_id** → convert-to-project breaks
- triggers → **updated_at, updated_by** → EVERY sent-estimate write breaks (fatal)
- soft-delete → **is_deleted, deleted_at** → trash/restore breaks

⇒ **The allowlist to build = the ruling's 8 columns PLUS: decline_reason_code, decline_reason_notes,
lost_reason_code, void_reason, voided_by, voided_at, project_id, is_deleted, deleted_at, updated_at,
updated_by.** Everything else frozen. The existing once-set/void/status sub-guards are preserved on top.
`is_deleted`/`deleted_at` inclusion is a Phase-2 decision (keep trash working) — flagged below.

Test data: created + deleted one throwaway `EST-ZZZ-PROBE` (status sent) in the owner company. Removed.

### ITEM 2 — issued PO line edit

**PO tables (live = branch; item-2 tables are on `main` too — PO module predates the estimates branch).**
- `purchase_orders` status ∈ {draft, issued, closed, voided}. Header cols incl. vendor_name, vendor_id,
  po_number, need_by, deliver_to, total_amount. Header triggers: `enforce_purchase_order_lifecycle`
  (voided → no edit; issued → no soft-delete), `enforce_purchase_orders_column_scope` (total_amount only
  via `set_po_total_amount`, which uses the GUC `app.po_total='on'`), set_updated_by, updated_at.
- `purchase_order_items` line_status ∈ {draft, issued, purchased, flagged}. Commitment cols =
  **qty_ordered, unit_cost, budget_item_id**. ⚠️ **NO immutability/lifecycle trigger — only
  set_updated_by + updated_at.**
- `sync_po_commitment(po_id)` sums `round(qty_ordered*unit_cost,2)` over lines with `line_status IN
  ('issued','flagged')`, grouped by budget_item_id → writes the `committed`-state expense +
  allocations. It is NOT called by any trigger — callers invoke it (e.g. `set_po_total_amount`, void).

**RLS:** `purchase_order_items_update_authorized` = company + role owner/admin/**PM** + can_view_project,
**with NO PO-status check.** So a line edit is NOT blocked by RLS — a direct PostgREST UPDATE by
owner/admin/PM on an ISSUED line would SUCCEED today, unaudited, and would NOT resync commitment.
"No path exists" = no SERVICE/UI path + no resync + no audit, NOT an RLS block. `purchase_orders`
UPDATE = owner/admin/PM (closed/deleted gated to owner/admin) — header editable as the prompt says.

⇒ Build needs (a) an owner/admin-only, audited, resyncing edit path for issued lines, and (b) to stop
the raw path from bypassing it.

**`estimate_events` is estimate-SPECIFIC, NOT generalisable.** Columns: `id, company_id, estimate_id,
kind, actor_id, payload, created_at` — keyed by `estimate_id` (FK to estimates), and it is an EVENT
log (kind+payload), not a field-level EDIT log. Forcing PO edits into it would mean a null estimate_id
and a repurposed payload. **Build a new PO audit table.** Precedents to follow: `time_edit_logs`
(append-only, `changes` jsonb, company-scoped) and `client_access_events` (`actor_id` default from
auth). Both are append-only: SELECT/INSERT only, no `updated_*`/`is_deleted`.

## Phase 2 — questions, answered with reversible defaults (nobody watching; did not wait)

**Item 1**
1. Allowlist mechanism? Default: rewrite `enforce_estimate_immutability` to compare
   `to_jsonb(NEW) - permitted[]` vs `to_jsonb(OLD) - permitted[]` (a true allowlist that also closes
   FUTURE columns), keeping the existing once-set/void/status sub-guards verbatim on top. Reversible.
2. `is_deleted`/`deleted_at` on a sent estimate — freeze or permit? Default: **PERMIT** (keep
   trash/restore + trial-deletion working; the ruling freezes the DOCUMENT, not the trash bin).
   Named as a decision. Reversible (drop from the permitted list to freeze).
3. Permitted set = ruling's 8 (viewed_at, accepted_at, declined_at, reminder_count,
   last_reminder_sent_at, client_unsubscribed_at, signed_proposal_file_id, status) + the writer-census
   additions (decline_reason_code, decline_reason_notes, lost_reason_code, void_reason, voided_by,
   voided_at, project_id, is_deleted, deleted_at, updated_at, updated_by). Everything else frozen.

**Item 2**
4. Audit table: `purchase_order_edits`, append-only (SELECT/INSERT only; no updated_*/is_deleted),
   cols: id, company_id (dflt get_my_company_id()), purchase_order_id, purchase_order_item_id (NULL =
   header), edit_kind ('header'|'line'), changes jsonb ({col:[old,new]}), actor_id (dflt auth.uid()),
   created_at. Follows time_edit_logs/client_access_events.
5. Line-edit path: SECURITY DEFINER RPC `edit_purchase_order_line(p_line_id, p_qty_ordered, p_unit_cost,
   p_budget_item_id)` — owner/admin only; parent PO must be `issued` (draft → "edit lines directly";
   voided/closed → frozen); sets GUC `app.po_line_edit='on'` (mirrors `app.po_total`), UPDATEs the line,
   writes ONE `purchase_order_edits` row, then `sync_po_commitment` — one txn.
6. Bypass guard: BEFORE UPDATE trigger on `purchase_order_items` raises if a commitment col
   (qty_ordered/unit_cost/budget_item_id) changes on a non-draft parent PO unless `app.po_line_edit`
   is set → forces the RPC (so audit+resync can't be skipped). Draft lines unchanged.
7. Header audit: AFTER UPDATE trigger on `purchase_orders` logging changed header cols to
   `purchase_order_edits` (edit_kind='header') when OLD.status <> 'draft' — audits the EXISTING
   owner/admin/PM path without rewiring it. Draft header edits stay unchanged/unaudited.
8. RPC line columns: qty_ordered, unit_cost, budget_item_id (commitment drivers); description/unit left
   to the normal path (no resync impact). Proof edits qty + unit_cost. Reversible.

None of these needs Josh — all reversible. Building.

## Phase 3 — build

### Migration mechanics (applies to every migration this session)
⚠️ `supabase db push` REFUSES: the remote ledger holds branch/MCP migrations with no local file
(`LegacyDbPushMissingLocalError`), and its suggested `migration repair --status reverted 2026111…`
would FALSELY mark the applied estimates-branch migrations reverted — a ledger corruption, NOT done.
So each migration is applied via `supabase db query --linked -f <file>` (DDL, no ledger row — same as
MCP apply_migration) and the ledger row is then inserted by hand into
`supabase_migrations.schema_migrations (version, name, statements)` and verified present. Idle check
(`pg_stat_activity` active writes = 0) run before applying.

### ✅ ITEM 1 — `20261310000000_sent_estimate_allowlist_freeze.sql` — BUILT + PROVEN
Rewrote `enforce_estimate_immutability` from a denylist to an ALLOWLIST (same function, same
`estimates_z_immutability` trigger). On a non-draft/review estimate, `to_jsonb(NEW) - permitted[]` vs
`to_jsonb(OLD) - permitted[]` freezes any change outside the permitted machinery set; the existing
once-set/void/status sub-guards preserved. Applied to rebuild-test; ledger row `20261310000000`
inserted + verified.

**PROOF by observation (owner via anon key, throwaway sent estimates; measured, not read):**
- FROZEN now (all REFUSED "A sent estimate is immutable"): name, grand_total, scope_summary,
  **internal_notes, projected_value, reminder_schedule** (the previously-open holes), deposit_percent.
- MACHINERY still writable (all APPLIED): viewed_at, reminder_count, last_reminder_sent_at,
  client_unsubscribed_at, project_id. ⚠️ Each of these APPLIED updates ALSO changed updated_at/
  updated_by via the trailing triggers — proving the allowlist permits them and does NOT break every
  sent-estimate write.
- `void_estimate` on a sent estimate → OK (status=voided, voided_at set).
- `mark_estimate_lost` on a sent estimate → OK (status=declined, declined_at set,
  lost_reason_code=lost_to_competitor). (First attempt used an invalid code — the RPC's own validation,
  not the freeze; re-proven with a valid code.)
- Draft estimate → name AND grand_total both APPLIED (fully editable, unchanged).

Test data: throwaways EST-ZZZ-FREEZE/VOID/LOST/DRAFT/LOST2 (+ earlier EST-ZZZ-PROBE) created and all
deleted. Net zero rows added.

### ✅ ITEM 2 — `20261320000000_po_line_edit_audit.sql` — BUILT + PROVEN
Four parts, all applied to rebuild-test + ledger row `20261320000000` inserted/verified:
1. `purchase_order_edits` — append-only audit table (id, company_id dflt get_my_company_id(),
   purchase_order_id, purchase_order_item_id NULL=header, edit_kind header|line, changes jsonb
   {col:[old,new]}, actor_id dflt auth.uid(), created_at). SELECT/INSERT only; SELECT mirrors
   `purchase_order_items` visibility (company + can_view_project) so NO cost figure is exposed to
   anyone who can't already see the PO lines — Financial Visibility Floor not widened.
2. `enforce_po_line_commit_guard` BEFORE UPDATE on purchase_order_items — raises if a money col
   (qty_ordered/unit_cost/budget_item_id) changes on a COMMITTED line (line_status issued/flagged AND
   unit_cost NOT NULL) unless the GUC `app.po_line_edit='on'` is set. Scoped to committed lines so the
   existing draft/uncosted reconciler (`setPurchaseOrderItems`, which refuses costed lines) and the
   line_status flows (issue/flag/purchase) and void soft-delete are untouched.
3. `log_purchase_order_header_edit` AFTER UPDATE on purchase_orders — audits vendor_name/vendor_id/
   po_number/need_by/deliver_to changes on an issued+ PO (draft header edits stay unchanged/unaudited).
   Header authority unchanged (owner/admin/PM); this only records.
4. `edit_purchase_order_line(p_line_id, p_qty_ordered, p_unit_cost, p_budget_item_id)` SECURITY
   DEFINER — owner/admin only; PO must be `issued` (draft → edit directly; voided/closed → frozen);
   line must be issued/flagged; sets the GUC, UPDATEs, writes ONE audit row, then `sync_po_commitment`
   — audit + recompute inseparable, one txn.

`estimate_events` was NOT reused (estimate-specific, keyed by estimate_id).

**PROOF by observation (throwaway issued PO on a budgeted project, committed = the state='committed'
expense sum; measured, not read):**
- A) OWNER `edit_purchase_order_line` unit_cost 5→7 (qty 10) → OK; **committed 70 = 10×7**; audit row
  `line {unit_cost:[5,7]}` actor=owner.
- A2) OWNER edit qty 10→4 → **committed 28 = 4×7**; audit row `line {qty_ordered:[10,4]}`. (Restored
  qty→10, committed 70.) ⇒ recompute tracks BOTH drivers, arithmetic exact.
- B) PM via RPC → REFUSED "Only an owner or admin…"; PM direct table UPDATE → REFUSED "…edited through
  the edit action, not directly." Line + committed unchanged (7 / 70).
- C) PM edits header need_by → APPLIED, and audit row `header {need_by:[…]}` actor=PM. (Header stays
  owner/admin/PM, now recorded.)
- D) OWNER edit line on a VOIDED PO → REFUSED "…voided and its lines are frozen."
- E) DRAFT PO direct line qty edit 1→8 → APPLIED (unchanged behaviour).

Test data: 3 throwaway POs (PO-ZZZ/ZZZ2/ZZZ3) + lines + their audit/expense rows created and deleted;
one leftover PO-ZZZ from an aborted setup run was also swept. PM was already assigned to the reused
project, so no assignment row was created. Net zero rows added; reused project untouched.

