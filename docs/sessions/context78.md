# Context — FrameFocus Session 78 (July 19, 2026)

> **Format note:** Short, decisions-focused. Detailed work lives in git log. See STATE.md for live repo status.

---

## Session summary

Landed Module 6 (6B/6C/6D) on rebuild-test, then eliminated the constraint drift
that caused the blocker. Started on `feat/signed-artifacts`, HEAD c4a57bd (one
commit ahead of the handoff's 56a664a — the S77 context doc itself, benign).

The 6D `db push` was blocked by `email_logs_email_type_check`. Diagnosis: 6C and
6D were written against the OLD baseline email_type list and each DROP/re-ADD a
narrower array than `signed_artifacts` (20260710120000) had already established.
The 21 live CO-type rows (`change_order` ×13, `co_signature_complete` ×8) violated
the narrowed constraint → push aborted. A regression: the two migrations silently
dropped signed_artifacts' additions.

Fix landed in two stages: (1) widen 6C/6D to the full 11-value superset so the push
succeeds; (2) replace the CHECK entirely with an `email_types` lookup table so the
list lives in one place and can never drift again.

**4 commits on `feat/signed-artifacts`:**

| Commit  | Description                                                        |
| ------- | ------------------------------------------------------------------ |
| 4cefd6b | fix(migrations): widen 6C/6D email_type CHECK to full superset     |
| 9e852f8 | chore(types): regenerate database.ts with 6B/6C/6D applied         |
| fe5cdf4 | refactor(migrations): replace email_type CHECK with lookup table   |
| 1ee7f83 | chore(types): regenerate database.ts with email_types lookup table |

HEAD: 1ee7f83.

---

## Decisions made

### 1. Widen, don't clean

The 21 CO-type rows are legitimate email categories the app actively sends.
Deleting them to satisfy the narrow constraint would be data loss. Widened the
constraint to match the data instead.

### 2. Lookup table over ENUM

To kill the drift permanently, replaced the CHECK with an `email_types` table
(text PK) + FK `email_logs.email_type → email_types(email_type) ON DELETE RESTRICT`.
Adding a future email type is now one INSERT — no CHECK list to restate anywhere.
ENUM was rejected (transaction-in-migration gotchas with ADD VALUE).

### 3. New forward migration, not editing applied files

6C/6D were already applied to rebuild-test, so their content was NOT rewritten to
share a list — you don't edit applied migration history. The lookup fix is a new
forward migration (20260720000000).

---

## What was built

- **supabase/migrations/20260711130000_module6_6d_material_deliveries.sql** —
  email_type array widened 6 → 11 values.
- **supabase/migrations/20260711140000_module6_6c_safety_incidents.sql** —
  email_type array widened 7 → 11 values.
- **supabase/migrations/20260720000000_email_types_lookup.sql** — new. Creates
  `email_types`, seeds 11 values, drops `email_logs_email_type_check`, adds
  `email_logs_email_type_fkey ON DELETE RESTRICT`.
- **packages/shared/types/database.ts** — regenerated twice (4484 → 4503 lines).

All three Module 6 migrations (6B/6C/6D) + the lookup migration are applied to
rebuild-test. Type-check green, 5/5 packages, both times.

---

## Lessons learned

1. **Timestamp collisions fail silently.** The lookup migration was first written
   as 20260719000000 — already used by `add_company_timezone`. Supabase keys on the
   14-digit prefix, so it would have been SKIPPED with no error. Caught before push,
   renamed to 20260720000000. Always check the prefix isn't taken.

2. **Basic commands belong in the Codespace terminal, not CC.** `npm run db:types`,
   `tsc`, `git`, `npx supabase` are terminal commands. CC is only for SQL/JSX that
   the clipboard mangles. Over-routing to CC wasted turns this session.

3. **`db query` targets LOCAL Postgres, not the linked remote.** For remote reads,
   route the query through CC (already connected to rebuild-test), not the CLI.

4. **CC can't see the Codespace terminal.** CC insisted the lookup migration was
   applied "by another actor" — it wasn't; Josh ran `db push` in his terminal, which
   CC has no visibility into. When CC reports mystery state, check terminal output
   before believing it.

---

## Carry-forward to Session 79

1. **The original hardcoded-list drift still exists in the applied files**
   (signed_artifacts, 6C, 6D each hardcode 11 values). It can no longer bite — the
   lookup table is now the single source of truth going forward — but the historical
   files remain as-is. No action needed; noted for completeness.

2. **`feat/signed-artifacts` open items** (from S76/S77 handoff, unchanged this
   session): locate/verify TECH_DEBT.md and file the two waiting items; cursive
   signature font; two-signature v2 client-signing path (untested); API error-message
   convention; six owed test areas. Branch not mergeable until these are green.

3. **rebuild-test now carries** 6A + 6B/6C/6D + email_types lookup. Types reflect
   all of it.

---

## How to start Session 79

1. Open the Codespace, `git pull`, `bash scripts/session-start.sh`.
2. Paste snapshot + `STATE.md` + `docs/sessions/context78.md` into a new Claude Chat.
3. Confirm branch + HEAD with `git branch --show-current && git log --oneline -5`
   before trusting any claim in this file.

---

**End of context78.md.**
