# 113c-award-assignment-spec.md — Awarding a contract assigns the sub to the project

> **Status:** SPEC ONLY — nothing here is built. [S121]
> **Ruled [Josh, S121]:** _"AWARDING A CONTRACT AUTO-ASSIGNS THE SUB TO THE PROJECT. A sub awarded work
> on a project is assigned to it, without anyone remembering to do it separately."_
> **Scope:** 7C / #113c and `project_assignments`. **This is desktop and database work, not M6M** — see
> §6 for the A-28 consequence.
> **Blocks:** D-65's project scoping, which is HELD until this lands and a backfill runs (§3).

---

## 0. Why this exists

M6M's D-65 scopes the punch assignee picker to members assigned to the project. Measuring before
building it turned up the reason it could not be depended on: **1 of 33 subcontractor members has any
`project_assignments` row**, and that one row is a seed fixture written by
`scripts/seed-test-identities.mjs`, not by a user.

The Team tab (`/dashboard/projects/[id]/team`) *does* assign subs — it offers every member and labels
subcontractors `(Sub)` on purpose — and it is used: **12 of 19 assignment rows carry a real
`created_by`**. It has simply never been used for a sub. Meanwhile the Contracts tab **is** used for
subs: all 9 `subcontractor_contracts` rows carry a real `created_by`.

So the gap is not a missing screen. It is that the app has two facts about "this sub works on this
project" and only one of them is ever recorded.

---

## 1. Where award happens — three entry points, not one

| # | Path | Mechanism | Runs as |
|---|------|-----------|---------|
| 1 | **Estimate → project conversion** | `convert_estimate_to_project()` **step 5c** — one DRAFT `subcontractor_contracts` row per winning bid (`20260731030000_113c_stage2_award_draft_contracts.sql`) | SQL, **SECURITY DEFINER** |
| 2 | **Contracts tab, manual create** | `createSubcontractorContract()` (`contracts-client.ts:43`) ← `contracts-panel.tsx:93` | browser, caller's JWT |
| 3 | **Status transitions** | `updateSubcontractorContract()` — draft → signed → void | browser, caller's JWT |

### ⚠️ "Award" is contract **existence**, not signature — and the data forces this

Live rows today: **8 `draft`, 1 `void`, 0 `signed`.**

A rule keyed on `status = 'signed'` would fire on **zero** existing rows and a backfill would create
**none**. Draft *is* the award: §113c's own framing is "award-as-commitment: a won bid materializes as a
REAL draft subcontractor_contract at conversion". A draft contract already means the sub is doing the
work.

**Recommended trigger point: row INSERT, any status.** Not signature, not a later transition.

## 2. Shape — a database trigger, not a service-layer write

**Recommendation: `AFTER INSERT` trigger on `subcontractor_contracts`, `SECURITY DEFINER`, inserting
into `project_assignments` with `ON CONFLICT (project_id, member_id) DO NOTHING`.**

Three reasons, in order of weight:

1. **There are two creation paths and one of them is SQL.** A service-layer write in
   `contracts-client.ts` covers path 2 and cannot cover path 1 —
   `convert_estimate_to_project()` is a `SECURITY DEFINER` plpgsql function, so covering it means
   editing the RPC too. That is **two implementations of one rule**, in two languages, which is exactly
   the drift this ruling exists to end. A trigger covers both by construction, and covers path 4 —
   whatever 7F's send-for-signature flow turns out to be — without anyone remembering.
2. **The codebase already uses this shape for this exact job.**
   `create_member_for_new_subcontractor()` (`20260704210000_company_members_foundation.sql:196`) is a
   trigger on `subcontractors` that materialises a derived `company_members` row. Same pattern, same
   table family, already understood.
3. **`ON CONFLICT` is free at the database and awkward above it.** `project_assignments` carries
   `UNIQUE (project_id, member_id)`; the client service already has to work around it (`reassignMember`
   exists solely to handle the soft-deleted-row case). A trigger states the rule once.

**Why `SECURITY DEFINER`:** `project_assignments_insert_authorized` admits owner/admin, or a PM already
assigned to that project. A PM creating a contract on a project they are on would pass — but the
conversion path and any future service-role path would not, and a trigger that works for some callers is
worse than none. Definer, with the tenant scope taken from the contract row rather than from
`get_my_company_id()`.

### The one genuinely undecided sub-question — soft-deleted assignments

`ON CONFLICT DO NOTHING` leaves a **soft-deleted** row soft-deleted, so a sub removed from the project by
hand and then awarded a new contract stays unassigned. `DO UPDATE SET is_deleted = false` would resurrect
it — and would silently reverse a removal an owner performed deliberately.

**Recommendation: `DO NOTHING`,** i.e. a manual removal wins over a later award, with the reasoning
recorded in the migration. It is the conservative direction: the failure mode is "someone must assign
manually", which is visible and fixable, versus "a removal you performed came back", which is not.
**Not decided — flagged for a ruling.**

## 3. ⚠️⚠️ THE BLAST RADIUS: assignment is a DATA-ACCESS GRANT, not a label

**This is the part that needs a ruling before any code is written.**

`can_view_project()` is `owner/admin OR is_assigned_to_project()`, and **the second arm is role-blind** —
`project_assignments → company_members → profiles` never looks at a role or a `member_type`
(`20260822000000_m6m_subcontractor_photo_access.sql` says so in as many words). So an assignment row is
what makes a project *readable*.

Auto-assigning on award therefore means **awarding a contract grants the subcontractor read access to
that project**, including:

| Surface | Policy | What the sub gets |
| ------- | ------ | ----------------- |
| **Change orders** | `change_orders_select_visible` = company + `can_view_project()`, **no role floor** | **Every CO on the project, at full `net_delta`.** This is TECH_DEBT **#117**, and it is measured, not theoretical: `seed-test-identities.mjs` §5 records that an assigned sub reads both fixture COs at 1410 and 21385.91. |
| Punch items | `punch_list_items_select_visible` | Narrowed to assignee-or-author by **D-57** — this one is safe. |
| Files / photos | `files_select_non_client` + `20260822000000` | Project files; a sub passes the non-client arm. |
| Daily logs | `daily_logs_select_visible` = company + `can_view_project()` | Every log on the project. |

**Today this is mostly latent: 32 of 33 subcontractor members have no `profile_id` — no login at all.**
They are directory entries, minted one-per-`subcontractors`-row by
`create_member_for_new_subcontractor()`. An assignment row for a member nobody can sign in as grants
nothing to nobody.

**But the mechanism is real and the population is one sign-up away from mattering.** The moment a sub is
given a login — which is the whole point of §7a's subcontractor identity work — every project they hold a
contract on becomes readable, change-order dollars included.

**Three options, recommended in order:**

- **(a) Ship the auto-assign and accept the grant, with #117 closed first.** The cleanest story: assignment
  means "works here", and what a sub may *see* is each surface's own business. Requires #117 to stop
  being UI-only.
- **(b) Ship the auto-assign now and accept the grant as-is.** Defensible while subs have no logins, and
  it is the state the seeded QA sub is already in. Dangerous the day that changes, and nothing in the
  code would flag it.
- **(c) Split the concepts** — a new `role_on_project = 'contracted'` (or a separate flag) that D-65's
  picker reads but `can_view_project()` ignores. Most correct, most work, and it means two notions of
  "assigned" that will be confused forever.

**Recommendation: (a).** (c) trades a known problem for a subtler one, and (b) is (a) with the risk
undocumented.

## 4. Contracts already awarded with no assignment row

**Measured:**

```
subcontractor_contracts          9 live   (8 draft, 1 void)   all with a real created_by
projects with >=1 contract       3 of 9
distinct (project, sub) pairs    5
  ...already assigned            0
  ...a backfill would create     5
```

**Every single existing contract is missing its assignment row.** A trigger alone changes nothing for
them — it fires on INSERT, and these rows already exist.

| Option | Effect |
| ------ | ------ |
| **Backfill** (recommended) | +5 rows. Projects with **both** a crew and a sub assigned goes **2 → 5 of 8**. |
| Leave | The picker's sub side stays empty on the three projects that have contracts, which are exactly the projects where a sub is most likely to be assigned a punch item. |
| Re-award by hand | 5 rows through the Team tab. Fine at this scale, useless as a policy — a real tenant has hundreds. |

**Recommendation: backfill, in the same migration as the trigger, `ON CONFLICT DO NOTHING`, restricted to
non-deleted contracts.** Whether to include `void`-only pairs is moot today (§5) but should be stated:
**include them**, for the same reason void does not unassign.

**⚠️ The backfill inherits §3's blast radius in one step**, on real data, retroactively. If §3 resolves to
(a), the backfill should land *after* #117, not before.

## 5. Should unawarding or voiding unassign? — **No, and the data is stronger than the instinct**

Josh's stated instinct: no, because manual and automatic assignment are indistinguishable after the fact.
That is true and sufficient. **The data supplies a better reason.**

```
(project, sub) -> contract statuses
  PRJ-102 | DVDF  ->  [draft, draft, draft]
  PRJ-102 | xfgn  ->  [draft]
  PRJ-105 | DVDF  ->  [draft]
  PRJ-107 | DVDF  ->  [void, draft]      <-- one void, one live
  PRJ-102 | btb   ->  [draft, draft]

pairs whose contracts are ALL void: 0
```

**A (project, sub) pair carries many contracts. Void is per-CONTRACT; assignment is per-PAIR. They are at
different grains.** An unassign-on-void would today remove DVDF from PRJ-107 **while they still hold a
live draft contract on it** — wrong on the only real data point that exists.

Getting it right would mean "unassign when the *last* non-void contract for this pair goes away", which
is a strictly harder rule, still cannot see manual assignments, and would fire on zero rows today.

**Recommendation: no unassign, on any transition, ever. Removal stays manual, through the Team tab.**
Stated as a rule in the migration so it is not "added for symmetry" later.

## 6. The Team panel's on-screen copy

`team-panel.tsx:~72` currently reads:

> _"Assignment controls project visibility for PMs, foremen, and crew. It is not required for task or
> punch assignment."_

**Both sentences have a problem, and only one of them is D-65's fault.**

1. **Already wrong, today, independent of everything here.** "for PMs, foremen, and crew" omits
   **subcontractors**, and assignment governs what a sub sees more sharply than any other role — it is the
   precondition for D-57's narrowing to mean anything. A reader of this sentence would conclude assigning
   a sub is inconsequential, which is the opposite of §3.
2. **Becomes wrong under D-65.** "not required for … punch assignment" is exactly what D-65 reverses: once
   the picker scopes, assignment becomes the precondition for being *assignable*.

**Recommendation: change it when D-65's scoping actually ships, not before.** It is true of punch today,
and rewriting it now would make it wrong in the other direction while the scoping is held (§7). The
subcontractor omission in sentence 1 could be fixed at any time and is worth doing with the trigger.

Proposed replacement, for when both land:

> _"Assignment controls what a member can see on this project — every role, subcontractors included — and
> who can be assigned punch items on it. Awarding a subcontract assigns the sub automatically."_

## 7. Consequence for D-65 — **the scoping is HELD**

The ruling's own condition: _"BUILD part 3's scoping only if part 1's spec shows it is safe to depend on.
If the picker would still be empty on most projects until a backfill runs, say so and hold it."_

**It would be.** The trigger fires only on new inserts, so with the trigger alone every one of the 5
existing pairs stays unassigned and the sub side stays empty on the same 6 of 8 projects as today.

Even after the backfill, **3 of 8 projects have no sub assigned at all** — correctly so, since they have
neither a contract nor a manual assignment. So an empty Sub/Vendor side stays a legitimate state that
needs its own copy and its own way out, which is a design question D-65 has not answered.

One more measured consequence, on the crew side: after a backfill, **1 of 11 existing punch assignments
is still not reproducible** by a scoped picker — `PRJ-107 ← Casey Crew`, a **crew** member with no
assignment row. Award auto-assign does nothing for that; it is the crew half of the same gap.

**Order of operations before D-65's scoping can ship:** §3 ruled → trigger + backfill land → re-measure →
decide the empty-side behaviour → then scope the picker.

## 8. Not in this spec

- Whether a sub should get a login at all (§7a's concern).
- TECH_DEBT #117 itself.
- The crew-side assignment gap (§7's last paragraph).
- Any change to `can_view_project()`.
