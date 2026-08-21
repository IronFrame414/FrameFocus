# S171 — Allowances & Selections stages 2, 3, 4: build and verification log

**Branch:** `feature/s171-selections-stages-2-4` off `main` @ `e9a26ae`. **Linked project:**
`nmyphyhmfttxkdoposvf` (rebuild-test) — verified. **Started:** 2026-08-21T13:30Z.
Written and committed after each step. Printed exit line only. Lint stays at 0.
**Stage 5 is NOT in this session** — no 7B/7D/7H change, nothing written to `project_budget_items`.

## Stage 2 — the selections tables and their policies — ✅ COMMITTED

**Migration:** `20261026000000_selections_tables.sql` (501 lines), pushed to rebuild-test, exit 0.
Nine tables, all RLS-enabled, 33 policies. `database.ts` regenerated (8368 → 8996 lines).

| Table | Floor | Policies |
|---|---|---|
| `selection_areas`, `selections`, `selection_options` | staff incl. **subcontractor** (`can_view_project`); client via `is_client_of_project` ∧ `client_has_full_access()` ∧ **`status <> 'draft'`**; write owner/admin/PM; **no DELETE on `selections`** | 4 / 4 / 5 |
| **`selection_option_amounts`** (1:1 off options) | **owner/admin/PM** — the first floor. No client arm. | 4 |
| **`selection_notes`** (1:1 off selections) | **owner/admin/PM/foreman** — the second floor | 3 |
| `selection_threads` / `_messages` / `_message_photos` | follows the selection's visibility; client arm on the M9 shape; authors post as self | 3 / 4 / 4 |
| `selection_signing_sessions` | owner/admin/PM read; client reads **her own**; **service-role write only** | 2 |

**Structural rulings (CHECKs, not conventions):** `client_supplied ⇒ every stamp IS NULL` (Q6);
offered stamps travel together, signed stamps travel together; `approved ⇔ signed` on a money
selection; option `source` ⇔ its FK; **one thread per selection**; **partial unique — at most one
un-superseded `completed` session per selection** (2b.5); a `completed` session must carry
consent + snapshot. `signer_channel` CHECK admits **only `portal_session`** — tighter than the CO
table, because there is no emailed anonymous link for a selection.

**Services:** `lib/services/selections.ts` (server reads — grouped-by-area, `getAllowanceBudgetLines()`
for the dropdown, thread, sessions; **no service-role read anywhere** — a reader the floors exclude
gets `null` money, never `$0`) and `selections-client.ts` (writes; every UPDATE through `applied()`).

**Harness:** `s171-selections-tables.live.ts` — **41/41, twice in a row, exit 0, zero residue.**
Every floor probe is paired with an owner read of the same rows (non-vacuous) and a session check;
the client counterfactual is the real **LINKED / CONTROL** pair (M9's lesson): LINKED reads the
non-draft selection, option, area, thread and her own session and **not the draft**; CONTROL reads
nothing and cannot post. Sub/foreman/crew read selections, options and the thread; **sub, crew,
client read 0 amounts rows; foreman reads 0 amounts but reads and edits notes**; sub's UPDATE on a
note returns zero rows and the row is unchanged (mutation-proved). All 7 CHECKs refused with the
refused row confirmed absent service-role.

**Stop conditions:** none. No 7B/7D/7H file touched. `project_budget_items` untouched (read-only,
for the dropdown).

## Stage 3 — ⏳

## Stage 4 — ⏳

## Verification battery — ⏳
