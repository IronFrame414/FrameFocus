# context94.md — Session 94 handoff

**Branch:** `feature/113c-award-commitment-spec` (NOT merged to main)
**Commits this session:** `5633b5d` (spec), `79c1ae8` (stage 1 build)
**main:** unchanged at `46bb643`
**DB link at session end:** `nmyphyhmfttxkdoposvf` (rebuild-test) — **verify anyway next
session; S93 ended with it on production and a Codespace rebuild drops it silently.**

---

## 1. What this session did

**#113(c) — decided, specced, and stage 1 of 5 built.** This was the item gating 7D.
7D is now unblocked at the decision level.

- Interview → approved input→store→output trace → `docs/specs/113c-spec.md` (`5633b5d`)
- Stage 1 built, click-tested on rebuild-test, committed (`79c1ae8`)

Nothing else from the S94 brief was started. S-4, S-5, S-2, the multi-role click-test,
and 7D are all untouched.

---

## 2. #113(c) — the locked model

Awarding a subcontractor bid **is a commitment**. The seven locked decisions:

1. A won bid becomes a **real `subcontractor_contract`**, materialized at
   `convert_estimate_to_project` (no budget exists before conversion).
2. It lands as a **draft** contributing **$0 committed**.
3. **Confirm = set the payment schedule + approve the stage rows.** Approval is what
   makes committed count. Same on both paths. Reuses shipped 7C machinery.
4. A per-draft **`requires_formal_contract` toggle**. Off → committed is firm on
   approval. On → committed counts but renders **italic + "wait on contract signature"**;
   the sub's signature flips italic → firm.
5. **Italic = not locked in.** While formal-and-unsigned with no payments, the user can
   revise amount / schedule / terms. Signing closes that path.
6. `budgeted_amount` stays the plan; `committed_amount` reflects the contract. A
   renegotiation before confirm shows as variance.
7. **7F grows** to own the sub-contract agreement (template + sub-facing e-signature),
   gated behind the Pre-Module 9 external-surface gate. **Not on 7D's critical path.**

### Correction recorded (important)

Mid-session I flagged that #113(c) would require making the origin predicate
(`payables-shared.ts`) **state-aware**, and called that the core mechanical work.
**That was wrong.** Verified against `recompute_budget_item_committed`
(`20260730010000_money_representation.sql`): committed sums only expense rows with
`status='approved'` AND commitment-origin. **A draft sub-contract has no payment
schedule, therefore no expense rows, therefore $0 committed** — with no predicate
change at all. The shipped pending→approved gate _is_ the confirm. The spec reflects
the corrected model; §9 lists what is explicitly not touched.

---

## 3. Stage 1 as built (`79c1ae8`)

Migration `supabase/migrations/20260731000000_113c_stage1_sub_member_id.sql` — TECH_DEBT
**#105(a)** adopted as stage 1, because `estimate_sub_bids.subcontractor_id` points at
`subcontractors` while `subcontractor_contracts.member_id` points at `company_members`,
and the only bridge was a fragile name-match.

- `subcontractors.member_id uuid REFERENCES company_members(id)` + partial index.
- One-time backfill on same company + `display_name = company_name` +
  `member_type='subcontractor'` + not deleted. **Exactly one hit → set; 0 or 2+ → left
  NULL with a RAISE WARNING naming the sub.** Never guesses.
  Result on rebuild-test: **2 set, 0 left NULL.**
- `create_member_for_new_subcontractor()` extended to set `NEW.member_id`; trigger
  **retimed AFTER INSERT → BEFORE INSERT** so the FK is set without a self-UPDATE.
  Reviewed and accepted — column defaults are applied before BEFORE ROW triggers, and
  the `updated_*` triggers are disabled/re-enabled around the backfill only because
  `auth.uid()` is NULL in migration context.
- `packages/shared/types/database.ts` regenerated — diff is exactly the expected 10 lines.
- Full `npm run build` clean. Click-tests 1 and 2 passed (existing subs resolve; a new
  sub created in the app carries `member_id` from the BEFORE trigger).

**#105(b)** (platform-wide unique names) explicitly NOT built — stays a separate soft
warning per the TECH_DEBT recommendation.

**Not yet applied to production.** Before that push, confirm production's trigger names
match rebuild-test — the migration does an unguarded `DROP TRIGGER
subcontractors_create_member` and a `DISABLE TRIGGER` pair by exact name.

---

## 4. Decisions made on the context93 open items

**§7.2 — batch-approve default: FORCE TARGETS.** No Miscellaneous fallback. A sub's
payment stages must always tie to a real budget line. Josh, S94.

> **Consequence — read before planning stage 4.** The S-2 stage picker does not exist
> (the RPC accepts `budget_item_id`; the UI dead-ends). Forcing targets makes **S-2 a
> hard prerequisite for #113(c) stage 4**, not a parallel task.

**§7.3 — hard-delete of captured allocations: ACCEPT, do not preserve.** Josh, S94. The
field-vs-approver trail is not worth keeping. Largely dissolved by #115 anyway — if the
field never enters a split, there is no trail to lose.

---

## 5. Tech debt filed

**#115 — Expense capture model: field roles write budget-line allocations.**
DEFERRED-POST-LAUNCH. Josh is rethinking whether foreman/crew should allocate to budget
lines at all ("they aren't going to know what is budgeted for what"); his view is that
field capture should be total/job/location/photo and allocation should be an
Owner/Admin function at approval. This reverses S93's split-at-capture (§4.4) and
collides with A-7 (zero-allocation approval illegal). **Not patched — evaluate
post-launch with real staff usage, then interview before any change.**

---

## 6. #113(c) remaining stages — dependency shape

They chain; they cannot all be built at once.

| Stage | Work                                                                       | Depends on                    |
| ----- | -------------------------------------------------------------------------- | ----------------------------- |
| 2     | Conversion arm creates draft contracts + `requires_formal_contract` column | stage 1 (done)                |
| 3     | Estimate award summary (#113a) + bid attach at entry (#113b)               | nothing — **parallel to 2**   |
| 4     | Confirm flow: Review popup → schedule → approve                            | stage 2 **+ S-2 picker** (§4) |
| 5     | Editable-while-unsigned revise path                                        | stage 4                       |
| 6     | 7F sub-contract template + sub-facing e-signature                          | **GATED — Pre-M9**, not now   |

Max compression is **2+3 in one run, then 4, then 5.** Keep 4 and 5 as separate runs:
4 is where `committed_amount` first moves, and 5 tears down and rebuilds approved
expense rows against the column-scope immutability trigger. Both are UI-heavy — the
exact category S93's single unattended run silently failed on.

**No interview remains for #113(c).** Everything undecided in the spec is tagged
`[BUILD-VERIFY]` mechanics, not intent.

---

## 7. Owed

- **`module7-architecture.md` §7.2 (7F row):** update to record that 7F now owns the
  sub-contract agreement alongside lien releases. Spec §7. Not yet written.
- Branch `feature/113c-award-commitment-spec` is unmerged and now carries both the spec
  and a real build. Decide merge-to-main vs. PR before starting unrelated work.

---

## 8. Suggested next session order

1. Verify pwd, branch, tip, and **DB link target** before anything.
2. Decide the branch question (§7) — merge or keep.
3. **S-4** (rate history + supersede + date input) — still the sharpest remaining gap.
4. **S-2 pickers** — now a prerequisite for #113(c) stage 4, not optional.
5. **S-5** (CO builder rate fields).
6. #113(c) stages 2+3, then 4, then 5.
7. Click-test merged Budget & Cost under PM, foreman, crew — only Owner exercised.
8. Then **7D** — and note it needs the full #113(c) treatment: `module7-architecture.md`
   §7.10 marks 7D and 7E as workflow-heavy with only partial traces, explicitly TODO.
   Interview → approved trace → spec → staged build. It is **not** spec-ready.

---

## 9. Still owed from the S94 brief (untouched)

`#103` foreman test identity + `#104` second test company — **no cross-company isolation
proof exists**; every role-gated screen is unverifiable until it does, and 7D/7E add
more of them. `#106` bill doc attachment. `#108` did_not_finish invisible + closeout
reason/rating + read-only sub profile. `#109` no payment edit or void. `#110` PO total
placement + PO cancel. `#111` UTC in backdating guard (accepted). `#112` concurrent
renegotiations unserialized (accepted). `#113(a)`/`(b)` — specced, built in stage 3.
`#114` rateless banner stale until reload. Dead `stageIds` in `setupPaymentSchedule`.
Test coverage on `payables.ts`, `payables-client.ts`, `expenses.ts`, `budget.ts`,
`contract-value.ts`. `COMPLIANCE_ALERT_DAYS[1]` no consumer + dead import
`payables.ts:30`. `#95` casts. RESEND secret. Domain cutover + login branding. `#101`
mobile shell. `#102` PO total drift. Files-manager redesign. FINANCIAL-RLS-FLOOR
migration. FFNav reindex. `#90` crew probe. `#82` reopen trigger.

**PARKED (interview-first when Josh raises it):** project material record — client-visible,
semi-structured list + open notes + photos, logged as you go. Crosses the Pre-Module 9
external-surface gate. See context93 §8.
