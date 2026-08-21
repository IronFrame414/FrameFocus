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


## Stage 4 — offer, sign, deny, revise — ✅ COMMITTED

**Migration:** `20261027000000_selection_notifications.sql` — `selection_approved` / `selection_denied`
on the `notifications_type_check` (+ `NotificationType` union, same commit; in-app + push only, so
`email_types` deliberately untouched). Pushed, exit 0.

**Service:** `lib/services/selection-lifecycle-service.ts` — `offerSelection` (company, gated by the
**caller's RLS UPDATE**; stamps `offered_*` from Σ chosen sell − allowance sell; opens one `pending`
session, invalidating any older pending one), `withdrawSelectionOffer`, `reviseSelection` (approved →
in_discussion; the completed session gets `superseded_at`, **never deleted**), and the client's two
acts through **one write path with M9's caller-context** — `completeSelectionSignature` (portal only;
session `completed` with consent text, IP, UA, channel, profile and a **snapshot of what she saw**;
selection `approved` with `signed_* = offered_*`) and `declineSelection` (→ **draft**, stamps
cleared, session `declined` with her note). Owner/Admin notified on both via `notify()`.
**Binding wording** (Josh): *"…accept the stated price of $X, less my allowance of $Y, for an added
price / a credit of $Z. This signature is binding and accepts the stated costs."* — and the
**no-money variant** for client-supplied (*"I am supplying this item myself; no charge applies. This
signature is binding."*). **Allowance sell** = `budgeted_amount` × (1 + markup) with the Q3 chain
(source row → instrument material markup → company material default).

**Routes:** `/api/selections/[id]/{offer,withdraw,revise}` (staff) and
`/api/portal/{sign-selection,decline-selection}` (client; mirror `/api/portal/sign-co`, validate
`completeSignatureSchema`, pass `caller: { kind: 'portal_session', profileId }`). The portal PAGE
that calls them is stage 7 — the dead route stays dead; the harness exercises the write path.

**Sheet:** `selection-lifecycle.tsx` — Send for approval (needs ≥1 priced chosen option unless
client-supplied/discussion), the ruled price block (*Selections Price / Allowance Deduction / Added
Price* or *Credit Owed*), Withdraw, Revise (confirm names the retained prior signature), session
history; fields freeze once offered.

**Harness:** `s171-selections-lifecycle.live.ts` — **18/18 twice, exit 0, zero residue**, calling the
real service with real sessions (PM offers/revises; LINKED signs/declines; SUB and CONTROL refused,
mutation-proved). **B3 is the sentence this stage exists to prove: after approval NO change order
exists, `project_financials.contract_value` and Σ signed CO `net_delta` are byte-identical to the
baseline, and `project_budget_items` has the same count.** Also proven: a cost edit after offer does
not move the offered stamp (A4); revise supersedes and retains (`signature_data` intact, C1); a
second sign gives two completed sessions with exactly one current (C2); decline returns to draft
with the note in the notification (D1); client-supplied signs with no stamps and the no-money wording
(E2); unlinked = pure add, deduction 0 (E3).

**Playwright:** `desktop-selections.spec.ts` now **10/10** — owner sends, sees the price block
(`$5,040.00` pure add), withdraws back to draft; foreman sees no lifecycle buttons.

**One affordance beyond the rulings, flagged:** **Withdraw** (company-side awaiting_approval → draft,
pending session invalidated). Not in Q9, which rules the client's denial; added because a company
that notices a wrong price after sending otherwise has no way back except waiting for the client to
decline. Same mechanics as deny, company-initiated. Remove if unwanted.

**Stop conditions:** none. **No 7B/7D/7H file touched** — verified by B3 and by `git diff --stat`
on this stage (no `contract-value.ts`, `invoice*`, `profitability*`). Nothing written to
`project_budget_items`. No new markup column, no new rate type.


## Verification battery

| # | Step | Status | Result |
|---|---|---|---|
| V0 | `fixture-snapshot.mjs` BEFORE | 🟢 | 14:00:38Z, exit 0 |
| V1 | `turbo run type-check --force` | 🟢 | exit 0, 5/5, 0 cached |
| V2 | `next lint` (0) | 🟢 | exit 0, still 0 |
| V3 | `turbo run build --force` | 🟢 | exit 0, 0 cached, compiled |
| V4 | committed vitest | 🟢 after 2 guard catches | first run **exit 1, 902/904**: `brand-literals` caught a product-name literal in the link-preview route's user-agent (now `brand.name` — the old name would have gone out in an HTTP header); `s123-still-clocked-in` caught my notifications-CHECK restatement in its producer grep — allowlisted with the S137 reasoning (a CHECK declaration is not an emitter). Re-run **exit 0, 59 files, 904/904** |
| V5 | every live harness | ⏳ | |
| V6 | Playwright ×4 from `apps/web` | ⏳ | |
| V7 | `supabase migration list` (repo root) | 🟢 | exit 0, **134 = 134**, latest `20261027000000` |
| V8 | `fixture-snapshot.mjs` AFTER | ⏳ | |

