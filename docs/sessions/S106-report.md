# S106 — session report

**Append after every step, commit, push.** Branch `feature/s106`, off
`feature/s105b` (2e3552f) — Part C needs the unmerged `estimate_id` foundation.

## Phase 1 — analyze (read-only)

### Step 0 — setup
- git: `main` = `662b531` (S105b unmerged), tree clean. **FILL-0 done.**
- Branched `feature/s106` off `feature/s105b`; wrote `docs/specs/S106-spec.md`
  (canonical; the untracked `S106-spec (skeleton).md` is the user's paste, left
  in place).
- Foundation verified present: `uploadFile` has `estimate_id`, migration
  `20261540000000` on the branch.
- **Next:** push, then measure Parts A / B / C (fan out).

### Step 1 — DB measurements (rebuild-test), Part B + C

**Line-item columns (relevant to B.1–B.4):**
- `estimate_line_items`: `total_price` (default 0), **`total_price_override`** (nullable),
  **`override_cost`** (nullable), `discount_amount` — all NUMERIC, **no precision/scale
  (unbounded)**.
- `estimate_line_rows`: **`markup_percent`** (nullable), `total` (default 0), `rate`,
  `quantity`, `unit_cost`, `amount` — all unbounded NUMERIC.
- ⚠️ **`total_price_override` ALREADY EXISTS** on the line item and is treated as a
  manually-set flat total (the convert function guards `total_price_override IS NOT NULL
  AND override_cost IS NULL`). So an editable line total may reuse this column rather than
  need a new one — the Part-B agent will confirm how it relates to `markup_percent`.
- **FILL-B.4 (partial):** the money columns are **unbounded NUMERIC**, so there is NO
  DB-forced rounding — rounding/precision is a code decision (contrast CLAUDE.md's
  NUMERIC(10,6) convention; these estimate columns don't use it). A back-solved margin can
  be stored at full precision.

**FILL-B.6 — write floor is DB-ENFORCED (not just UI).** `estimate_line_items_update_manager`
and `estimate_line_rows_update_manager` both `qual`:
`company_id = get_my_company_id() AND role IN (owner,admin,project_manager) AND EXISTS(estimate
e WHERE e.status='draft' AND (role IN (owner,admin) OR e.created_by = auth.uid()))`.
So a line (its margin/total) is editable by **owner/admin (any draft) or PM (own draft only)**;
foreman/crew/sub/client cannot. Editing the total is a WRITE gated by this policy — no `#136`
write leak, the DB refuses it. (Read floor mirrors: `estimates_select_authenticated` = owner/admin
all, PM own.) **The editable-total UI rides on an already-DB-floored write.**

**FILL-C.7 (partial) — production apply.** Migration `20261540000000` is the 216th; the
production ledger was 215 at S105b start and CC never applied to production → it is **UNAPPLIED
on production.** Production row-count for the CHECK validation is **PENDING** — MCP is bound to
rebuild-test; no safe production read channel (same constraint as S105b FILL-6A.6). Recommend
Josh run the null-project category count on production before the attended apply; on rebuild-test
the CHECK validated against 326 rows / 0 violations.
