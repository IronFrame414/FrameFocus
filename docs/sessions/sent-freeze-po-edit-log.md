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

