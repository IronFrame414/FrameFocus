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

## Stage 3 — the company selection sheet and the project Selections tab — ✅ COMMITTED

**Built:**
- `/dashboard/projects/[id]/selections` — the **no-cost tab** (§9.2), every role, grouped by area.
  The server page strips money and notes **before the client boundary** and the tab component's
  props type has no amount field, so a future edit cannot "just show the price" without changing the
  contract. Owner/admin/PM get "+ New selection" (name + area, area creatable inline).
- `/dashboard/projects/[id]/selections/[selectionId]` — the **company sheet** (§9.1): name · area ·
  **allowance dropdown from `row_type='allowance'` budget lines** · description · due date · mode ·
  the three toggles · options with **three sources** (scratch / catalog picker / job budget) ·
  **four image paths** (upload button, drag-and-drop onto the card, clipboard image paste,
  product-link → fetched thumbnail) · per-option amounts editor with live sell (owner/admin/PM;
  **`price —` for anyone the floor excludes**) · chosen-option toggles (single or multiple per
  `allow_multiple`) · internal notes (owner/admin/PM/**foreman**; rendered only when RLS returned a
  row) · discussion thread (body + link + N photos as one unit).
- `/api/selections/link-thumbnail` — server-side og:image fetch with an SSRF guard (http(s) only,
  loopback/link-local/RFC1918 literals refused, 6s timeout, 4 MB cap, image content-type required;
  **does not DNS-resolve** — limitation documented in the route). Stores via service role with
  `client_visible = true`.
- Project nav: **Selections** tab between *Budget & Cost* and *Change Orders*, no role filter (Q10).
- `/m/p/[projectId]/selections` — read-only parity page, same service, no costs.
- Stage-4 stub `selection-lifecycle.tsx` so the sheet compiles; filled in next.

**Proof:** `e2e/desktop-selections.spec.ts` — **8/8 against the production build.** Owner and PM see
`= $5,040.00` (4200 × 1.20) and the notes; **foreman sees `price —`, no `4,200`/`5,040` anywhere on
the sheet, notes visible, fields disabled, no add-option buttons**; the tab has no money for owner
or foreman; the tab sits between Budget and Change Orders; the sub reaches `/m/p/…/selections` and
reads the chosen option with no money or notes. type-check 0, lint 0.

**Flagged for Josh (not blockers):**
1. **PM-uploaded option images are not client-visible.** `files_insert_non_client` lets only
   owner/admin set `client_visible = true`; the sheet flips it for owner/admin after upload and
   leaves a PM's upload staff-only. Link-thumbnails are service-role and always client-visible.
   **Stage 7 must decide:** serve option images to the client through a definer read keyed on the
   selection (my recommendation — the selection, not the file flag, is the authority), or flip the
   flag owner/admin-side. Until then a client would see a PM's uploaded picture as a placeholder.
2. **No `/m` hub tile.** The hub is a ruled nine-tile set (*"NINE TILES, AND NONE IS FINANCE — A-12,
   D-9 as narrowed by D-37"*); a tenth is an M6M ruling change. The `/m` route exists and works.
3. **No `/m` edit sheet.** Drag/drop, clipboard paste and the catalog picker are desktop
   affordances; `M6M-edit-surfaces-spec` decides which edits get an `/m` surface.

**Stop conditions:** none. No 7B/7D/7H file touched; `project_budget_items` read-only (dropdown and
"from budget" option source).


## Stage 4 — ⏳

## Verification battery — ⏳
