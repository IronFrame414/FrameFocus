# context90.md — Session 90: 7B + 7A Built, Security Migration Live, Probe Harness Corrected

> **Session:** 90 — July 28–29, 2026. **Branch:** built on `feature/7a-expenses-ui`, merged to
> `main` (fast-forward, Josh). Sixteen S90 commits on main: `9fbcc1c` security migration,
> `512279f` #96–#99 closure + record correction, `e57043c`/`93d41d7` 7B, `f8c37c7`/`cd3b468`
> #80 docs, `77e42e5` 7A schema, `073760f` 7A services, `de3eaf9` #94 HEIC, `0e4683d` #100,
> `0832e04` #94 closure, `13eb96f` #101, `5e5c485` capture polish, `907a649` additive reads,
> `798570b` 7A UI, `f544c6d` prod-applied header update. Only this wrap file is uncommitted.
> **Shape:** security migration → 7B build → 7A build (schema → services → three-phase UI) →
> #94 fix → polish pass → prod push. Three-phase protocol run for the 7A UI; #94 ran its own
> three-phase (including a stood-down backfill plan).
> **Ground rule held:** git/migrations over any spec, handoff, or prior-session claim; a stale
> git-status snapshot and a stale Phase 1 were both re-verified against HEAD before building.

---

## 1. RECORD CORRECTION — S89's RLS probe grid was INVALID

The S89 "full probe grid" (context89 §6) ran via Supabase MCP as `current_user=postgres` with
**RLS bypassed** — its results were meaningless in **both** directions: passes proved nothing,
and the four findings could just as well have been noise. **#96–#99 survived only because they
were derived from reading policy text, not from execution.** S90 established a real harness:

```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub": "<user-uuid>", ...}';
-- probe, then ROLLBACK
```

Negative AND positive controls both passed under impersonation — the S90 probes are the
evidentiary run (recorded in the #96 closed entry, `512279f`). **This harness also unblocks
#90** (crew-role RLS verification, previously blocked on a working Crew login — impersonation
sidesteps the broken login path). Standing lesson: **MCP SQL is postgres; never cite it as RLS
behavior evidence.**

## 2. Security migration `20260728000000_security_rls_96_99.sql` (#96–#99) — LIVE ON PROD

`9fbcc1c`. Files select/insert/update re-created project-scoped + category-gated; `files`
column-scope trigger (`client_visible`, gated-category recategorization); `daily_logs` author
bind + soft-delete lockdown; `daily_log_crew`/`daily_log_sub_entries` same-company EXISTS.
Storage policies scoped in parallel (defense-in-depth — storage cannot see `files.category`).
**Applied to BOTH rebuild-test and production this session** — the "prod push owed" caveats on
#96–#99 are removed from TECH_DEBT.

**FILES ACCESS MODEL DECIDED (S90, Josh)** — the rule the migration encodes:
`contracts`/`change_orders` = Owner/Admin; `invoices` = Owner/Admin/PM; **all other categories
= project-scoped via `can_view_project`**; `project_id IS NULL` = Owner/Admin;
`client_visible` writes and recategorization INTO the gated trio = Owner/Admin via BEFORE
UPDATE trigger.

## 3. 7B built — contract value by derivation (#80 CLOSED)

`e57043c` (service) + `93d41d7` (call sites). `lib/services/contract-value.ts`:
revised = original + Σ(client-signed CO `net_delta`), `projects.contract_value` never mutated;
all seven call sites migrated; overview shows Revised headline / Original caption. Zero
migrations, per spec. #80 closed by design (`f8c37c7`); write-through comment refs repointed
(`cd3b468`).

**SPEC DRIFT (7B-spec §3 row 3):** `budget/page.tsx:55` had an unspecced null-branch returning
`signedCoTotal` when `contract_value` is NULL. Removed — null now renders the em-dash state,
matching the overview. The spec's call-site table did not know this branch existed.

## 4. 7A built in full — schema, services, UI (§4 + §5.1–§5.9)

- **Schema** (`77e42e5`, migration `20260728010000_7a_expenses_job_cost.sql`): `expenses`
  (pending→approved/rejected gate, `state committed|actual` v1-actual-only),
  `expense_allocations` + `actual_amount` recompute trigger, `files.expense_id`,
  `companies.gl_account_*` + `fixed_burden_per_hour`, `member_burden_settings`, burden columns
  frozen into `time_session_rate_snapshots` at approval. **Applied to BOTH rebuild-test and
  production.**
- **Services** (`073760f`): expenses server reads + rollup (`getJobCostRollup` — labor gated by
  snapshot RLS, `labor.available` flag), client mutations + `approve_expense` RPC,
  `setMemberBurden`, reopen/re-complete in `transitionProjectStatus` (opts
  `userRole`/`endDateChoice`).
- **UI** (`907a649`, `798570b`, `5e5c485`): `/dashboard/expenses` (role-scoped list, review
  queue tab + badge, trash), `/expenses/new` (shared capture form), review popup (receipt
  strip, correct-before-approve, reassign, always-shown allocation + inline add-line, reject
  with required note), Job Cost tab at `projects/[id]/costs` (Owner/Admin full "labor +
  expenses to date"; PM/Foreman expenses-only; crew redirected, tab hidden), material-run
  prompt on BOTH end paths, reopen/re-complete prompts in status-control, GL + fixed-burden
  settings section, burden multiplier/toggle with ×/+ operator-flipping preview on the
  pay-rates card, Expenses nav item appended after Timeclock (item 13 of the locked 12; lock
  comment updated, FFNav reindex still owed).
- **Polish pass** (`5e5c485`): allocation inputs pre-fill the unallocated remainder on focus
  (first line selected gets the full amount); **receipt photo required at capture** — submit
  blocked with "Receipt photo required" — with **Owner/Admin exempt** and edit-mode exempt
  (never forces a re-upload on a row that already passed capture). Exemption is
  presentation-only: no service or RLS change; the review gate remains the enforcement point.

**Every 7A surface was click-verified live this session** (capture, prompt/decline, review
approve + allocate, reassign, reject, trash/restore, Job Cost per role, reopen → re-complete
date prompt, settings, burden preview).

## 5. SPEC AMENDMENTS OWED — 7A-spec (two, both verified against the live build)

1. **§3.2 `declineMaterialRunExpense(segmentId)` cannot exist.** 6A RLS forbids an author
   patching an ENDED segment's note, and we do not widen RLS for a decline marker. The decline
   composes into the end note AT END TIME — `MATERIAL_RUN_DECLINE_NOTE` + `withDeclineNote()`
   (`expenses-client.ts`), which forces the prompt to fire BEFORE the segment ends. **Verified
   live:** segment `0cab1358` carries `"test — No purchase made"` on `time_segments.note`.
2. **§5.1 named only the clock modal as the material-run end hook**, but material runs also
   end via `timeclock-client.tsx` `handleSwitch` — the MORE common crew path (return from the
   store → switch back to work, no clock-out). Both paths now run the same prompt/capture
   components; the spec should name both.

## 6. #94 HEIC — CLOSED (upload conversion; backfill stood down)

`de3eaf9`: client-side `heic2any` (new dependency, approved) dynamically imported in
`uploadFile` — HEIC→JPEG at quality 0.82, rename `.heic`→`.jpg`, `mime_type 'image/jpeg'`,
converted size; on conversion failure the original bytes upload exactly as before (logged).
`uploadFile` is the single choke point — all seven photo call sites (daily logs, safety,
deliveries ×4, 7A receipts, generic files) inherit it; grids/PDF services/review popup needed
zero changes (they key off `mime_type`). Size limit applies to ORIGINAL bytes (stated in a
comment). A planned Owner/Admin backfill page went through Phase 1/2 and was **stood down**:
all 9 pre-fix HEIC rows (~16.6 MB) are test data. Backfill fact for the record: **heic2any
cannot run in Node** (module-top-level `window`/`Worker`/`URL.createObjectURL`) — any future
backfill runs in a browser context or uses a different decoder.

## 7. Debt filed: #100, #101

- **#100** (`0e4683d`) — photo markup invisible outside the markup editor; intent (Josh):
  markup persists as a non-destructive LAYER, viewable wherever the photo is viewed, composite
  only when leaving the app. Cross-refs #53/#55.
- **#101** (`13eb96f`) — job/task switching unreachable outside /dashboard/timeclock
  (ClockModal has no 'switch' mode → the 7A switch-path prompt only fires there) + zero mobile
  handling in the shell (236px `shrink-0` sidebar, non-sticky header, clock button scrolls
  away). Field crew on phones are the primary 6A/7A capture audience. Cross-ref #30.

## 8. Decisions made (chat-only; recorded here)

- Receipt photo required at capture; **Owner/Admin exempt; presentation-only** (DB unchanged).
- Allocation pre-fill = current unallocated remainder, editable, over-allocation block intact.
- HEIC: store converted ONLY (original has no consumer); fall back to original bytes on
  failure; backfill separate and then stood down (test data).
- #94 moved to Closed (not narrowed): upload path fully resolves the entry; failure-fallback
  and browser-only-ness are design notes, not open debt.
- Job Cost tab sits immediately after Budget; Expenses nav appended after Timeclock.
- Material-run prompt hooks BOTH end paths; capture happens AFTER the end; decline rides the
  end note (see §5).
- Edit-own-pending is exempt from the photo requirement (no receipts-count read exists
  client-side; forcing re-upload was explicitly rejected).

## 9. Lessons

- **Impersonate or it didn't happen** (§1). The probe harness is cheap; use it for every
  future RLS claim, including the pending FINANCIAL-RLS-FLOOR migration and #90.
- **The UI must call the real shipped signatures, not the spec's** — §3.2's decline function
  and `getExpenses(projectId?, filters?)` both differed from what shipped; Phase 1 re-reads
  caught both before any UI code was written.
- **Single-choke-point payoff:** #94 was a one-function fix because every photo upload already
  routed through `uploadFile`.
- **Stale snapshots lie twice:** the conversation-start git status predated `073760f`, and the
  first Phase 1 predated `de3eaf9` — both re-grounded via `git log`/`git diff` before building.
  (The CLAUDE.md Session-8 rule, still earning its keep.)

## 10. OWED / NEXT SESSION

1. **7C build** (AP: bills, commitments-as-expense-rows, payments, retainage, compliance —
   `7C-spec.md`).
2. **7D–7H reconciliation pass** — 7H committed/sell/"verified" wording (7A-spec §6 conflicts
   1–3), 7D/7E consumer updates.
3. **7A-spec amendments** from §5 above (§3.2 decline shape, §5.1 both end paths).
4. **Architecture §7.2 wording** (7B "write through" superseded by derivation) + §7.12 tidy.
5. **7G "approved"→signed term** fix.
6. **#95** — M6B `as unknown as` cast cleanup (one at a time, type-check between).
7. **RESEND secret**, **domain cutover**, **FrameFocus login branding** (still carrying from
   S89).
8. **#100** (markup layer) and **#101** (switch-from-anywhere + responsive shell) — #101
   matters before crew field use of 7A capture.
9. Still pending, unchanged: **FINANCIAL-RLS-FLOOR migration** (batch; now includes
   `companies.fixed_burden_per_hour`), **FFNav reindex** (Expenses is item 13), **#90** crew
   probe run (now unblocked by §1's harness), **#82** DB transition trigger must encode reopen.

## 11. Flags

- Prod-applied status for both S90 migrations recorded on the founder's confirmation; the MCP
  connection in-session points at rebuild-test only.
- `clock-modal.tsx` ↔ `expense-capture-form.tsx` import cycle (styles one way, capture modal
  the other) — inert (render-time-only dereference), noted in case a bundler change surfaces it.
- Crew edit of a legacy photo-less pending expense can still save without a photo (edit-mode
  exemption) — flagged at build; add a receipts-count read if this should tighten.
