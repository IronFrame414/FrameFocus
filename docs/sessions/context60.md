# Context — FrameFocus Session 60

**Date:** July 5, 2026
**Scope:** Review the overnight Module 5 launch build (uncommitted on `feat/module-5`), fix what review surfaced, and commit it in scoped buckets. NOT a build session — the code already existed; this reviewed and committed it.
**Outcome:** Full M5 launch build committed in 8 scoped commits on `feat/module-5`. One real defect fixed (Part 1). No DB push yet — migrations still unexecuted. Testing deferred to the supervised push.

> Format note: decisions-focused; detailed work is in the git log and the 8 commit messages. Numbering: `context57.md` (committed this session, `6b7b472`) is the **company_members build session's** file, which pre-existed on disk untracked — this session (the review/commit) is its own session and gets this file. Assuming 58/59 are the parallel sub-portal-spec and Module 6 sessions; **rename this file if that's wrong.**

---

## Starting state (verified against the tree, not the handoffs)

- Branch `feat/module-5`, pointing at the **same commit as `main`** (`d134d27`) — zero committed divergence; the entire build was working-tree.
- 6 M5 migrations untracked + baseline. 13 modified files, ~40 new files.
- `company_members` overlap resolved: the overnight build **folded it in** (its migration + `members.ts`/`members-client.ts` were in this tree). The standalone Session-57 build was never separately committed. Not a conflict; nothing rebuilt.
- STATE.md in project knowledge was stale (Session 54) — confirmed git-is-ground-truth the hard way.

---

## The big decision: subcontractor identity (reversed twice — final landing below)

Part 1 defect: `InvitableRole` type included `'subcontractor'` but the `INVITABLE_ROLES` array omitted it; `tsc` passed because a 5-element array satisfies the 6-member type. No sub-invite path was built.

The scope call churned before landing:

1. First instinct — subs aren't a company role, remove it.
2. Decision **B** — keep the started sub-invite scaffolding dormant, only pull the role value.
3. Reversal — **subs SHOULD have real accounts** (they recur across jobs; a magic-link they'd need re-sent every time is the wrong model). So `subcontractor` **stays a real `CompanyRole`**.
4. **Final:** sub portal is wanted **pre-launch**; subs authenticate as normal Supabase users (Pattern 1, their own `profiles` row). The coherent Part 1 fix flipped to **fail-closed**: remove `'subcontractor'` from the `InvitableRole` **type** (array already omits it → type/array agree), keep it everywhere else (`CompanyRole`, both migration CHECKs, `member_type`, hierarchy, labels).

**Why fail-closed, verified in code:** `createInvitation` (`team.ts`) sets no `member_id`, and there is no other invite-creation path. So a generic-dropdown sub invite would create a `role='subcontractor'` profile with **no** `company_members` row (§7a skips crew-member creation for subs; the accept-side linking branch no-ops on NULL `member_id`) = an unassignable sub. Narrowing the type prevents that. The real invite-from-subcontractor-record flow (that sets `member_id`) is the sub-portal spec's job.

Fix applied via CC — 2 lines: dropped `| 'subcontractor'` from `InvitableRole` (`types/roles.ts`) + the `subcontractor` entry from `ROLE_DESCRIPTIONS` (`constants/roles.ts`, which is `Record<InvitableRole,…>` so it'd otherwise be an excess-property error). Verified by grep + `tsc` green from `apps/web`.

**Spawned:** a parallel **sub-portal spec session** (prompt handed off). It produced `docs/specs/5I-spec.md` — **finished, uncommitted, not built.**

---

## Review findings (Part 2 cross-cutting — the substance)

The build held up. One real fix (Part 1); two apparent defects were correct-by-design.

- **Type/runtime + SQL-vs-TS enum parity — clean.** All four new status enums (Project/Task/Punch/ChangeOrder) match their migration CHECKs exactly; all secondary enums line up. Only finding: the row-type enum (`labor|material|subcontractor|other`) is hand-declared **5×** (estimate-items validation, estimate-totals, estimates-client, change-orders, budget) — identical today, latent drift trap → **tech debt**.
- **RLS — all 19 new tables enabled.** `project_budget_items` is select-only **by design** (writes go through the SECURITY DEFINER `convert_estimate_to_project()` RPC). Punch policies are permissive-by-design (`_authenticated`, not `_authorized`) — lifecycle gates live in the service layer per the 5C spec. **Accepted:** punch gates are service-layer only, not DB-enforced (RLS = tenancy + visibility only).
- **Standard columns/triggers — clean.** `co_signing_sessions` correctly has `_updated_at` but **no** `set_updated_by` — it has no `updated_by` column (public signing-flow table, service-role client). CC caught this and refused my "mirror the other 3" instruction; it was right. Correct design exception, not a gap.
- **Identity model — clean.** `get_my_member_id()` used for every assignment/membership FK; `auth.uid()` used only for `created_by`/`updated_by` (which FK `auth.users`). No misuse anywhere.
- **Migration ordering / FK integrity — clean.** Nothing references a table before it exists. `tasks.change_order_id → change_orders` is a correct deferred `ALTER…ADD CONSTRAINT` in the 5D migration (column created bare in 5B).
- **Shared-util reuse (5D imports vs copies §4.4a math) — SKIPPED** per "move faster." Numbers are correct regardless (copied math still works); flagged as verify-at-leisure.

**Review scope decision:** skipped full per-sub-module spec-conformance (Parts 3–5). Rationale: structural correctness verified by the sweeps above; remaining behavioral/spec-intent drift is caught faster by the live test than by reading. Confirmed the one cross-module wire worth checking — the **punch→project-complete gate lives at the DB layer** in the 5A migration (stronger than a service-layer gate).

---

## What was committed — `feat/module-5`, 8 scoped commits

| Hash      | Bucket                                                                |
| --------- | --------------------------------------------------------------------- |
| `03c1bc3` | company_members foundation + `get_my_member_id()` (+ Part 1 role fix) |
| `c047a03` | 5A projects, contracts, contacts + conversion RPC                     |
| `809f9db` | 5E read-only budget view                                              |
| `9802624` | 5B tasks, phases, dependencies, calendar + custom Gantt               |
| `1c28194` | 5C punch lists + lifecycle gates                                      |
| `e12d813` | 5D change orders, CO builder + tokenized signing                      |
| `934b501` | integration wiring (nav, convert action, database.ts stopgap)         |
| `6b7b472` | docs: context57                                                       |

Dual-concern files committed with their primary bucket + noted in the message: `project-header.tsx`/`layout.tsx` (5A shell + 5D tab → 5A), `budget/page.tsx` (5E view + 5D §7 line → 5E). The `team/` orphan folded into 5D. Committed manually in buckets; CC committed nothing. `git add -A` never used.

---

## Solo-decision ledger — accepted this session

- Subcontractors are a real `CompanyRole`, authenticate as real users (Pattern 1).
- Punch lifecycle gates service-layer only (not DB-enforced) — by design.
- 5D: inline CO signing (no React-PDF), no notifications, decline notes-only leaving CO at `sent`.
- Conversion roles: Owner + Admin + PM (confirmed override of spec's Owner/PM).
- CO lifecycle draft→sent→signed→voided; tokenized signing, no email (Pre-M9 gate); no `contract_value` mutation (M7, #80).

---

## Deferred (not done tonight — don't lose these)

- **`TECH_DEBT.md` — NOT committed.** Its `#81` entry is **stale** (written under decision B as "dormant/parked, Module 6+"). Reality now: subs are a real role, portal is pre-launch, spec exists (5I). `#81` must be **rewritten** as a pointer to 5I ("sub-portal invite create-side — spec'd in 5I, not built"), and **deleted only after** the sub-portal is built + committed. Paired with the 5I docs commit so the pointer is accurate. The `M` edit sits in the working tree for that pass.
- **`5F/5G/5I` specs — uncommitted.** Their own docs commit (5F/5G finalized earlier; 5I is the parallel session's).
- **New tech-debt item to file:** the 5× row-type enum drift trap.
- **Existing note holds:** 5B cycle prevention is service-layer DFS only; DB enforcement deferred (Q-N4).

---

## Lessons learned

1. **Reading the tree beat trusting the summary — 4× tonight.** CC's diff header looked like it added lines it should've deleted; a `grep` proved the deletion landed. CC's "mirror the other 3 tables" summary would've been wrong; reading the table showed the exception. The pattern earned its keep every time.
2. **CC refusing a bad instruction is the system working.** The `co_signing_sessions` trigger: CC read the actual columns, found no `updated_by`, and stopped rather than apply my instruction that would've broken every UPDATE at runtime. Trust CC's "I found a conflict" over my confident instruction.
3. **A product decision can invert a "defect."** The Part 1 fix flipped direction three times as the subcontractor product model got decided. The code CC built was mostly _right for where Josh was heading_ — the churn was in the requirements, not the build.
4. **Skip the safely-skippable, not the load-bearing.** Full spec-conformance reading was skippable (testing catches it better); enum-vs-CHECK parity and the punch cross-module wire were not. "Move faster" ≠ skip the checks that only reading can do.

---

## How to start the next session

1. Open the Codespace (`github.com/IronFrame414/FrameFocus`), branch `feat/module-5`.
2. **Verify tree first:** `git branch --show-current && git log --oneline -9 && git status --short`. Confirm the 8 commits above are present and only docs (`TECH_DEBT.md`, `5F/5G/5I`) remain untracked.
3. **First task — the supervised migration push (FIRST execution of all 6 migrations):**
   - Reinstall tooling (wiped on rebuild): `postgresql-client`, `npx supabase login` + `link` from repo root, CC via `npm install -g @anthropic-ai/claude-code`.
   - Linked Supabase = **PRODUCTION** (`jwkcknyuyvcwcdeskrmz`). The throwaway is deleted. **Create a fresh throwaway project, push there first (`supabase db push` from repo root), verify, THEN prod — both supervised.** DB password letters+numbers only.
   - Then `npm run db:types` (replaces the `database.ts` stopgap) → re-run `tsc` for parity (a mismatch reveals schema/type drift).
   - Live tests: conversion trace (EST-0001 → PRJ-0001; row counts; Σ budgeted < contract_value; provenance FKs); RLS by role; punch-complete gate; CO create/send gates.
4. **Then the deferred docs pass:** commit `5F/5G/5I`; rewrite `TECH_DEBT.md` #81 as the 5I pointer; file the row-type-enum item.
5. **Open, not blocking:** decide sub-portal launch scope (in M5 launch vs deferred); build 5I (invite create-side + portal); confirm Module 6 6A–6E breakdown + interview-first on 6A.

---

**End of context60.md.**
