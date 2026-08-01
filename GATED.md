# GATED.md — blocked work, what blocks it, what unblocks it

> **Created:** Session 95 (2026-07-31). **Purpose:** one place that answers "what is
> blocked, behind what, and what unblocks it," so gated work stops living only inside
> spec sections and session handoffs.
> **This file is the repo copy and the source of truth.** A mirror may exist in the
> claude.ai project knowledge — regenerate that mirror from this file, never the
> reverse.
> **Verify before acting.** Entries are registers, not authorities — confirm against
> git, migrations, and the named spec section before building. Claims that could NOT
> be verified against the repo are marked **[UNVERIFIED]**.

---

## Gate 1 — Pre-M9 external-surface gate

Nothing that puts a FrameFocus surface in front of someone outside the company ships
until this gate is cleared. First external surface = first impression; identity,
branding, and delivery must be settled first.

**Blocked behind it**

- **#113(c) stage 6 — 7F sub-contract template + sub-facing e-signature.** Generates
  the sub-contract document from a company template and sends it to the subcontractor
  to sign. This is also what gives the "contract isn't signed" state real backing —
  today it is the `requires_formal_contract` toggle plus an advisory payment-time
  warning (S95), not an observed signature. Detail: `docs/specs/113c-spec.md` §7 and
  §10.6. Stages 1–5 are internal-only and shipped (through migration
  `20260731050000`) — but stage 5's RPC body is SUPERSEDED by the S95 second ruling
  set (rulings 8–12 below): replacement migration `20260731060000` is written,
  **UNAPPLIED**.
- **Project material record.** Client-visible, semi-structured list + open notes +
  photos, logged as work proceeds. PARKED, interview-first — do not build without an
  interview. Detail: `docs/sessions/context93.md` §8 (restated context94 §9).

**What unblocks the gate** (from context94 §9's owed list)

- RESEND secret (transactional email actually deliverable — the Codespace override
  slip has recurred)
- Domain cutover
- Login branding

---

## Gate 2 — Test identities (blocks all role verification)

**Blocked behind it**

- Click-testing the merged Budget & Cost screen as PM, foreman, crew — only Owner has
  ever been exercised (context93 §12.5, still owed).
- Verification of every role-gated surface built since (S95: rate section
  Owner/Admin-only, supersede/Correct-rates Owner-only, CO rate fields PM-read-only,
  picker amount-hiding). All verified by reading the mount/gate in code, not by
  logging in.
- **Cross-company isolation proof — none exists** (context94 §9): every role gate and
  RLS policy is asserted from code reading, not demonstrated.

**What unblocks it**

- **#103** foreman test identity
- **#104** second test company

---

## Gate 3 — 7D–7H specs (blocked on reconciliation + decisions, not on code)

7E–7H are gated behind 7D's design. **The repo currently disagrees with itself about
7D's readiness — reconcile this before any 7D build:**

- The TRACKED specs `docs/specs/7D-spec.md` and `7E-spec.md` (committed S91/S92)
  claim **"WORKFLOW APPROVED + PROVEN (interview)"** with only the §S schema layer
  deliberately absent (CC writes it against live schemas).
- `docs/sessions/context94.md` §8 and `module7-architecture.md` §7.10 say 7D/7E are
  workflow-heavy with only **partial traces** and explicitly **not spec-ready**.
- The UNTRACKED prep docs — `docs/specs/7D Spec-Prep.md`, `7E`, `7G`, `7H`
  (no 7F; verified on disk 2026-07-31) — describe themselves as the **draft**
  input→store→output trace plus the decision record needed to approve it.
- ALSO UNTRACKED: a second generation of spec revisions — `docs/specs/7d1-spec.md`
  through `7h1-spec.md` (all five, 7F included; appeared on disk late 2026-07-31).
  Spot-checked headers: `7d1` presents as the 7D spec deriving from
  money-representation (FINAL, S93); `7f1` as "Interview-backed plan (S92, extended
  and reconciled [S94])". Their relationship to the tracked `7D-spec.md`–`7H-spec.md`
  AND to the prep docs is **[UNVERIFIED]** — three generations of 7D–7H documents now
  coexist.

**What unblocks it**

- One reconciliation pass deciding which generation is authoritative — the tracked
  S91/S92 specs, the Spec-Prep drafts, or the new `7x1-spec.md` revisions — followed
  by committing the winner and deleting or archiving the rest.
- Josh answers whatever decision lists survive that pass.
- **[UNVERIFIED]** provenance: the untracked docs are said to come from a parallel
  session. Whatever their origin, anything written before late 2026-07-31 predates
  the S95 rulings below and must be reconciled with them before being trusted.

Standing rule (Interview-First Mandate, `future_module_architecture.md` §2/§2a): no
spec without an approved trace.

---

## Deferred by decision (not blocked — chosen)

- **Conversion-stamp (contract-start date) — CONFLICT, resolve before build.**
  `money-representation.md` §5.1 item 4 + §7.1 S-4 (amended 2026-07-31) COMMIT to
  stamping the first rate's `effective_from` = contract start AT CONVERSION
  (`[BUILD-VERIFY]` mechanic — likely a definer-side UPDATE in the RPC). A same-day
  chat decision reportedly deferred this pending a distinct project-level
  contract-start field (new column; Owner+Admin editable, whereas rate correction is
  Owner-only) — **[UNVERIFIED]**: no repo document records that deferral, and it
  contradicts the spec as amended. If the deferral is the ruling, amend §5.1/§7.1
  first. Interim reality either way: Correct-rates already lets the Owner set the
  first rate's date by hand; only the default is at stake.
- **Live-job rate renegotiation, original S93 scope.** Superseded by the S95
  project-side rate section; the post-conversion recompute question dissolved (budget
  lines store cost only; rate-in-force pricing of incurred cost/hours is deferred to
  7D).
- **`setup_payment_schedule` RPC hardening.** Force-targets (every sub stage must
  carry a real budget line) is UI-enforced only — the RPC still accepts targetless
  stages via direct API. Follow-up filed alongside FINANCIAL-RLS-FLOOR
  (money-representation.md §7.1 S-2 as amended).
- **#115 expense capture model** — field roles writing budget-line allocations.
  DEFERRED-POST-LAUNCH by Josh (TECH_DEBT #115). Do not touch; interview before any
  change.

---

## Open defects logged S95 (not gated, just not yet fixed)

- **Overview "Cost to Date" / "Projected Margin" render "—".** NOT a mystery —
  deliberate ui-04 §S3 placeholders whose gating comments are now STALE:
  `projects/[id]/page.tsx:116` ("Em-dash until Module 7A populates actuals" — 7A
  shipped; `getJobCostRollup`/`getBudgetRollup` exist) and `:125` ("until the
  sell/profit schema gap is fixed" — substantially resolved by the money-
  representation pass). The KPIs were never wired to the now-existing rollups. Fix =
  wiring, not investigation.
- **`inForceRowIds` re-implements the rate-in-force selection rule** locally in
  `budget/rate-section.tsx` — deliberately (it yields the winning ROW ids for badges,
  where the shared `rateInForce` returns the value), but it is one rule stated in two
  places. Low drift risk; refactor to a shared row-yielding helper when touched.
- **CO post-creation type switcher unbuilt** — `co_type` is set at creation only
  (changes-panel). Interacts with P4 no-mixing and repricing. Nothing needs it to
  price a CO (S-5 flag, S95).

---

## S95 rulings later work must respect (2026-07-31)

Recorded because they reverse earlier decisions and will otherwise be re-litigated.
Each is also recorded at the cited authority — that document wins on detail.

1. **Future-dating allowed** (reverses the 2026-07-30 P5 no-future rule). Any
   effective date — past, today, or future; a future rate sits dormant until its
   date; renegotiations keep the forward-only floor. Guard no longer references
   `CURRENT_DATE`; debt #111 closed moot. (money-representation.md P5; migration
   `20260731010000`.)
2. **Supersede = Owner-only "Correct rates" edit mode** — any live row's amount AND
   date, required reason. Correction replacements are EXEMPT from the renegotiation
   floor; only the no-duplicate-live-date rule binds. Immutability = "renegotiations
   can't rewrite history; Owner corrections deliberately can."
   (money-representation.md §4.2/§5.5/§7.1; migration `20260731020000`.)
3. **Ruling B — awarding a bid must not overwrite an estimator-entered sub cost**
   (reverses the S93 TECH_DEBT #113 NON-ISSUE). Fill-only-when-empty; row still
   created when missing (stage 4's budget-line tie depends on it); budgeted stays the
   plan, the award arrives as `contract_value`, the difference is
   budgeted-vs-committed variance. (TECH_DEBT #113; 113c-spec §1; migration
   `20260731040000`.)
4. **Sub stages require a real budget line** — no Miscellaneous, no fallback; PO
   totals MAY target Miscellaneous. (money-representation.md §7.1 S-2 as amended.)
5. **Rates live on the project, not the estimate.** Full editor + history on Budget &
   Cost, read-only summary on Overview, Owner/Admin only; the estimate keeps
   amount-only, date-free rate entry (S-3). (money-representation.md §7.1 S-4 as
   amended.)
6. **Formal-contract payment warning is advisory** — banner + explicit confirm, never
   a block. (113c build, S95; PaymentModal.)
7. **Revise is Owner/Admin only** — PM excluded (approve-level authority;
   INVOKER/RLS posture). Role floor unchanged by the second ruling set below; the
   citation migration `20260731050000` is otherwise superseded (ruling 8).
   (113c-spec §8 as amended.)

**Second ruling set, same day (2026-07-31, S95 — partial revise). Supersedes
stage 5 as shipped: migration `20260731050000`'s RPC body is replaced by
`20260731060000_113c_partial_revise_schedule.sql` (written, UNAPPLIED — no db
push has run).**

8. **Revise applies to ANY contract — the `requires_formal_contract` gate is
   DROPPED.** Editability is decoupled from the formal flag; italic stays a
   display signal only. (113c-spec §0.5/§5 as amended.)
9. **Partial revise.** Unpaid stages fully editable — torn down and replaced;
   replacements land PENDING and need Owner/Admin re-approval before they count
   toward committed. A PARTIALLY-PAID stage stays editable in place, its amount
   FLOORED AT GROSS PAID — never below money already out; it keeps
   `status='approved'`. FROZEN: closed-out stages, and any stage on a signed or
   void contract. (113c-spec §5 as amended.)
10. **`contract_value` is warn-only on revise** — Σ stages vs contract value
    warns, never blocks (the standing P2 posture); no hard floor. (113c-spec §5
    as amended.)
11. **Retainage mid-stream changes allowed** — percent changes AND shape
    switches (`percent_across` ↔ `final_hold`), forward-only via per-payment
    computation; the withheld accrual row is NEVER touched. (113c-spec §5 as
    amended.)
12. **UI direction (NEXT RUN, not built):** ONE panel-level edit mode subsuming
    the per-draft "Review & confirm" — setup view for contracts without a
    schedule (keeping the award budget-line tie + plan-vs-contract variance),
    editable stages for contracts with one. (113c-spec §5 as amended.)
