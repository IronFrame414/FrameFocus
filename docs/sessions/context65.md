# Context — FrameFocus Session 65 (July 10, 2026)

> **Format note:** Short, decisions-focused. Detailed work lives in `git log`. See `STATE.md` for live repo status.

---

## Session summary

Thread (a) — signed-artifact testing — plus a full Module 6A build and merge, and a Module 6 spec-hardening pass. Three branches touched, all committed. `main` pushed with 6A merged. The signed-artifacts migration was applied to the **throwaway only**, which surfaced a migration-history entanglement that defers the 6A database apply to next session.

**Commits pushed to `main`:**

| Commit  | Description                                                            |
| ------- | ---------------------------------------------------------------------- |
| 7e09738 | Merge Module 6A: time tracking (sessions + segments) — `--no-ff` merge |

**Branches NOT pushed (local only):**

- `feat/signed-artifacts` — carries the signature-fix commits below. **UNMERGED. Not smoke-tested end to end.**
- `spec/module-6-hardening` — carries the spec reconciliation commit below.

---

## What happened, in order

1. **Verified session-open state against git.** Settled a commit-count discrepancy three ways: `feat/signed-artifacts` is **SIX** commits ahead of `main`. The session-open said six, STATE.md said four, and the branch-tip commit message said five. Git settled it — six is correct.

2. **Built Module 6A (Time Tracking)** via CC on branch `feat/module-6a`. Six files:
   - `supabase/migrations/20260710130000_module6_6a_time_tracking.sql` — two tables: `time_clock_sessions` (payroll truth, no `project_id`/category/break columns, nullable `status` for the Owner case) and `time_segments` (attribution; six segment types; `project_id` gated to `work`/`material_run`/`warranty`; `task_id` only on `work`; `ON DELETE CASCADE` to the session).
   - `packages/shared/utils/time-tracking.ts` — pure derivation (`paidHours`, `workedHoursByProject`, `overtimeHours`, `weeklyHoursSummary`), settings passed in as params, defaults to unpaid breaks / 40h week.
   - `packages/shared/validation/time-tracking.ts` — zod schemas mirroring the CHECK constraints.
   - `apps/web/lib/services/time-tracking.ts` (server, reads + rollups) and `apps/web/lib/services/time-tracking-client.ts` (clock in/out, switch, approve, edit).
   - Helpers: `time_role_rank`, `can_approve_member` (strictly-below, no self/peer), `can_view_time_session`, `owns_open_session`. RLS: supervisors read company-wide, members read own, live clock-out/segment-open gated to the member's own open session, edits Owner/Admin only.
   - **Committed in 4 path-scoped batches:** `4790932` (migration), `31497a7` (shared), `889b09f` (services), `f928f7a` (docs reconciliation of `future_module_architecture.md` §7.1/§7.4/§7.8/§7.9 and `CLAUDE_MODULES.md` §6.1/§6.9 to as-built).
   - **CC verified §10 acceptance numbers:** paid 8.0 all four (breaks paid, ≤30 cap), worked A/B 7.5 / C 8.0 / Josh 7.0 = 30.0, OT 0, warranty excluded from active budget. Every number matched.
   - **Migration was NOT applied to any database at build time.**

3. **Applied the signed-artifacts migration** (`20260710120000_signed_artifacts.sql`) to the **THROWAWAY** (`nmyphyhmfttxkdoposvf`, framefocus-rebuild-test, Ohio). Verified the CLI link was on the throwaway and **not** production (`jwkcknyuyvcwcdeskrmz`) first, dry-ran, then pushed. Applied clean including the destructive `email_logs` CHECK swap. Regenerated `database.ts` — verified 3528 lines, `contractor_signature_path` present x3 (guarding against the silent `2>/dev/null` regen failure). Type-check clean across all 5 packages — the 43 known "column not in database.ts" errors cleared.

4. **Smoke test of the CO send flow revealed a missing feature, not a bug.** The contractor-signature step was **never wired into the send UI** (`co-builder.tsx` rendered only Client name + Client email + Confirm Send). The send route, validation, PDF compositing, and the Settings-side signature upload were all already built and waiting; only the send-panel capture and the `sendChangeOrder` client-fn payload were missing — so first send always failed with HTTP 400. **Not** a library/pin/mount/storage issue. CC built the fix (3 files, frontend-only): inline signature step in the send panel, mode toggle defaulting to saved-image-if-on-file else typed-name, required printed-name field prefilled with company name, client-side guards so failures are legible before the round-trip. Re-send path shows a note instead of re-prompting. Type-clean.
   - **Committed on `feat/signed-artifacts`:** `c80da39` (signature-step wiring across `change-orders-client.ts`, `page.tsx`, `co-builder.tsx`), `bd109cc` (regenerated `database.ts`).
   - **The live CO send was still never run end to end** — only the type layer and control flow are verified. A real browser send is the final confirmation, and it is still owed.

5. **Ran an unattended spec-hardening job** on isolated branch `spec/module-6-hardening`: reconciled the `6B`/`6C`/`6D` specs to as-built 6A. Each spec got an AS-BUILT RECONCILIATION banner, inline `[DRIFT]` flags at each point of use, a NEEDS INTERVIEW blocker on its PROPOSED acceptance trace, and a Questions-for-Josh block. **Zero guesses substituted** — traces stayed PROPOSED. `6E` left DEFERRED (no field basis). `6D` open-item-2 (damaged-goods return) left OPEN by instruction. **Committed:** `cb8633e`.

6. **Merged `feat/module-6a` into `main`** (`--no-ff`, `7e09738`) and pushed `main`. The merge is 7 files, 1264 insertions. Clean.

---

## Decisions made

### 1. Pre-Module 9 Decision Gate — REVERSED

Every client deliverable (estimates, invoices, change orders, material selections) is delivered by **email**. The client portal becomes an **additional** access surface (deliverables plus schedule, photos, notes), not the delivery mechanism. This is a recorded reversal, weight equal to D-4.

- **The CO send route already sends email.** The `api/change-orders/[id]/send/route.ts` code resolves the recipient, mints a token, generates v1, and emails it with the tokenized link. The "Sending is your internal acceptance… no email goes out automatically" text in `co-builder.tsx` is **stale copy from the old 5D flow** and needs updating. This is an open item, not a code fix to the route.
- **The broader implementation is captured, NOT built.** Universal email across all deliverables, plus the portal itself (Module 9), each need their own spec and interview-first treatment. This session recorded the direction only.

### 2. Signed-artifacts must NOT merge yet

It has not been smoke-tested end to end. The live CO send was never run; only type-check and control-flow are verified. Merging untested code to solve an unrelated migration-bookkeeping problem was considered (Option A) and **rejected** at Josh's direction.

### 3. 6A database apply deferred — throwaway migration history is entangled

The throwaway has `20260710120000_signed_artifacts.sql` applied (from Step 3, run off `feat/signed-artifacts`). But that file exists **only on `feat/signed-artifacts`**, not on `main`. So when checked out on `main` (which now has 6A but not signed-artifacts), a `db push` fails with _"Remote migration versions not found in local migrations directory."_ Verified the cause: the file is present on the branch (`git ls-tree feat/signed-artifacts`) and absent from `main`'s working dir. **Nothing is broken.** Applying 6A cleanly requires untangling this deliberately — next-session work, not a session-close rush. Do **not** run the CLI's suggested `migration repair` / `db pull` blindly.

### 4. 6A build-scope decisions (locked in the CC interview)

- Build scope = **data layer only** (migration + shared + services). **No UI this pass** — building UI against un-regenerated `database.ts` would have re-created the 43-error entanglement in fresh work.
- Derivation = **pure functions with settings passed as params** — no dependency on the deferred Settings schema; unit-testable against §10 today.
- Owner status = **nullable** (`status` dropped `NOT NULL`; CHECK `status IS NULL OR status IN ('pending','approved')`). NULL = "no approval state applies," the Session-64 reversal expressed in schema.
- Subcontractor rank = **same tier as crew** (subs clock in, approve nobody) — this is what the CC build reflects. **CONFIRM this matches intent** — the "do subs clock in on Bishop jobs" question was answered to CC directly but not walked through in chat.

### 5. Signature-step defaults (locked)

Approach = **inline in the send panel** (frontend-only, ~3 touch points, no route/schema change). Default = **saved image if on file, else typed name; printed name prefilled with company name**, mirroring what the send route itself does. Flagged: the client-side signature step (when built) should prefill the printed name from the **client's** name, not the company's — do not let this contractor-side decision leak into that one.

---

## What was built

- Module 6A: migration + shared derivation + validation + server/client services (merged to `main`).
- CO send-panel contractor-signature step (3 files, on `feat/signed-artifacts`).
- Spec reconciliation for 6B/6C/6D (on `spec/module-6-hardening`).

Databases: signed-artifacts migration applied to the **throwaway only**. 6A migration applied **nowhere**.

---

## Open items surfaced this session

**From the CO smoke test (Josh's 5 UI issues):**

1. **CO does not auto-populate client name/email from the project** — the send _route_ has the fallback logic (project → contact), but the _form_ doesn't prefill. **Unresolved.**
2. **Signature capture** — **FIXED this session.**
3. **Default markup does not import into the change order** — **not diagnosed.** Likely lives in CO-creation / estimate-conversion code, probably **not** `feat/signed-artifacts` scope. Do not fix on that branch.
4. **Company logo won't upload** — **not diagnosed.** (Note: the _signature_-image upload in Settings **is** built and working — that's separate from the logo.)
5. **Client email** — not a bug; was the gate (now reversed) plus possibly missing `RESEND_API_KEY` / `NEXT_PUBLIC_APP_URL` on the throwaway. Stale UI copy needs updating (see Decision 1).

**From the spec-hardening job (Questions-for-Josh, resolve nothing silently):**

- **PM/Foreman read-visibility conflict (recurs across 6B/6C/6D Q1):** all three specs grant PM/Foreman **company-wide** read of logs/incidents/POs, but M5's `can_view_project()` restricts them to **assigned** projects. This is a policy decision only Josh can make. Biggest open item.
- **6B timezone / day-boundary (Q2):** `time_segments` are `timestamptz` with no stored date; 6A stores no timezone. What defines "`segment_start` on `log_date`" — the company's local day, from where? Governs crew-present and employee-hours auto-fill.
- **Who owns per-member-per-day hours derivation (6B Q3):** 6A exposes only project-grouped hours (`workedHoursByProject`), never member-grouped. Should 6B build its own, or should 6A grow a shared `hoursByMemberForProjectDay` helper both consume? (Recommended: the shared helper, to avoid a second derivation drifting from 6A's.)
- **Sub double-count (6B Q6):** a subcontractor with a login who clocks in via 6A _and_ is entered manually in a delivery/log is counted twice.
- **6D damaged-goods return (open item #2):** a return that never comes back is invisible. `qty_damaged` + a note record that goods _were_ damaged, but nothing tracks the return itself. **Left OPEN — do not read the spec pass as resolving it.**
- **`incident_type` enum home (6C):** should be declared once and added to `TECH_DEBT.md` (the `row_type` enum is already hand-duplicated across five files — don't repeat that).

---

## Carry-forward, still unresolved from Session 64

- **CONSENT_TEXT** ("I have reviewed this proposal") — routed to counsel, not to be rewritten here.
- **Company Settings batched pass** owes: paid-break on/off + paid-break minutes-per-day, from 6A.
- **The five-copy `row_type` enum** is still unfiled in `TECH_DEBT.md`.
- **`apps/web/.claude/`** is untracked and ungitignored — TECH_DEBT #51.
- **`context64.md` was never written** — the Session 64 chat remains the only record.

---

## Lessons learned

1. **Applying an unmerged branch's migration to a shared throwaway pollutes that throwaway's migration history for every other branch.** After applying `20260710120000` (signed-artifacts) to the throwaway, `main` could no longer `db push` — the throwaway remembers a migration whose file isn't on `main`. Be deliberate about _which branch_ you apply a migration from when the target DB is shared. A branch-specific migration on a shared throwaway blocks pushes from branches that don't carry that file.

2. **A "can't upload / field does nothing" symptom is not automatically a library or version problem.** The signature field wasn't broken — the step was never wired into the UI. Diagnose (read the component + the route it feeds) before reaching for the version-pin explanation.

3. **Verify commit counts against git, never against prose.** Three sources disagreed (six / four / five). `git log --oneline main..branch` settled it in one command.

4. **Don't merge untested code to solve a bookkeeping problem.** Consolidating branches to line up migration history would have dragged un-smoke-tested signing code into the merge. Rejected. The bookkeeping tangle is worth handling deliberately instead.

5. **Unattended spec work is safe when it's scoped to mark, not invent.** The spec-hardening job produced reconciled specs with every interview-gated part clearly blocked — useful output, zero guesses, on an isolated branch, committing nothing. That is the ceiling for unattended work; unattended _code_ building on unproven traces is not.

---

## How to start Session 66

1. Open the Codespace at `github.com/IronFrame414/FrameFocus`.
2. Run:
   ```bash
   git checkout main
   git pull
   git log --oneline -5
   git branch -vv
   git status --short
   ```
3. Paste the snapshot output plus `STATE.md` and this `context65.md` into a new Claude Chat session.
4. Paste the opening prompt below.
5. Switch to Claude Code once a plan is agreed.
6. End the session in Chat with a `STATE.md` update and `context66.md`.

---

### SESSION 66 OPENING PROMPT (paste this into the new chat)

> FrameFocus — new session, picking up from Session 65.
>
> **WHO I AM.** Building FrameFocus solo. Working contractor, not a traditional developer. I need click-level, step-by-step guidance.
>
> **HOW THIS RUNS.** ONE action or question at a time, then stop and wait for me. ~15 lines max. No bundling — if something needs checking before step 1, that check IS step 1 and nothing else goes in the response. Decisive recommendations with brief rationale, not open option lists. Flag conflicts explicitly; never resolve them silently. Skip "what you should see if it worked" — just give the command.
>
> **VERIFY BEFORE YOU PROPOSE.** Read `STATE.md` and `CLAUDE.md`. Then confirm actual state with `git log`, `git branch -vv`, `git status`, or by reading the file. Context files drift; git is ground truth. State out loud what you confirmed before proposing anything. A previous session's claim is a claim to verify, not a fact.
>
> **INTERVIEW-FIRST IS NON-NEGOTIABLE.** For 6B/6C/6D: I narrate a real Bishop workflow with real numbers; you mirror it as input → store → output; I correct it; the approved trace becomes the acceptance example. The three specs already carry NEEDS INTERVIEW blockers — do not build from the PROPOSED traces.
>
> **CLAUDE CODE PROTOCOL.** Phase 0: check branch, create a feature branch if on main. Phase 1: read every dependency, ask all questions at once, stop. Phase 2: build autonomously. CC never commits. I commit manually, in path-scoped batches. Never `git add -A`. Content with backticks or angle brackets goes through CC, never clipboard.
>
> **STATE AT SESSION 65 CLOSE — verify all of it.**
>
> `main` is at `7e09738` — Module 6A (time tracking, two tables + shared derivation + services) is MERGED. Its migration `20260710130000_module6_6a_time_tracking.sql` is on `main` but **applied to NO database**.
>
> `feat/signed-artifacts` is local-only, UNMERGED, and **NOT smoke-tested end to end**. It carries the CO signing/PDF/email build plus this session's contractor-signature-step UI fix (`c80da39`, `bd109cc`). Its migration `20260710120000_signed_artifacts.sql` HAS been applied to the throwaway.
>
> `spec/module-6-hardening` is local-only at `cb8633e` — 6B/6C/6D specs reconciled to as-built 6A, with `[DRIFT]` flags, NEEDS INTERVIEW blockers, and Questions-for-Josh blocks.
>
> **THROWAWAY MIGRATION HISTORY IS ENTANGLED.** The throwaway (`nmyphyhmfttxkdoposvf`) has `20260710120000` applied, but that file lives only on `feat/signed-artifacts`, not on `main`. So `db push` from `main` fails with "Remote migration versions not found in local migrations directory." Nothing is broken. Do NOT run the CLI's suggested `migration repair` / `db pull` blindly. The CLI loses its link between Codespace sessions — re-verify with `npx supabase projects list` before any push, and confirm the ● is on the throwaway, NOT production (`jwkcknyuyvcwcdeskrmz`).
>
> **THIS SESSION'S FIRST DECISION.** Untangling the throwaway so 6A's migration can be applied and verified. The options are: (A) reset/repair the throwaway to match `main` then apply 6A, or (B) provision a fresh throwaway for 6A. I want to talk this through before any command runs — it involves migration history and I don't want it rushed.
>
> **THEN, IN ORDER:**
>
> 1. Apply and verify the 6A migration (after untangling).
> 2. Run the CO send flow LIVE in the browser — the smoke test that was never actually run. (Needs `RESEND_API_KEY` + `NEXT_PUBLIC_APP_URL` set; a failed email is a warning, not a rollback.)
> 3. Review the spec-hardening output and answer the Questions-for-Josh — especially the **PM/Foreman read-visibility conflict** (company-wide vs. M5 assigned-only), which recurs across 6B/6C/6D.
> 4. 6B interview before any 6B code.
>
> **CARRY-FORWARD, unresolved:** stale "no email goes out automatically" copy in `co-builder.tsx` (the route already sends — Pre-Module 9 gate was REVERSED: all deliverables via email, portal is additional); CO client autofill (#1), markup import (#3, likely not signed-artifacts scope), logo upload (#4) — all undiagnosed; CONSENT_TEXT with counsel; Company Settings paid-break settings from 6A; the five-copy `row_type` enum unfiled in `TECH_DEBT.md`; `apps/web/.claude/` untracked+ungitignored (TECH_DEBT #51).
>
> **FIRST ACTION, NOTHING ELSE.** Ask me to paste:
> `git checkout main && git pull && git log --oneline -5 && git branch -vv && git status --short`
> Report what you confirmed, flag anything that contradicts the above, then let's talk through the throwaway-untangle decision. Stop there.

---

**End of context65.md.**
