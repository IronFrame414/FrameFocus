# CC PROMPT — the two blocking items: client contract amounts · proposal view tracking

> **SPEC FIRST, THEN BUILD.** Two independent items, both small, both fully ruled. **Separate specs,
> separate migrations, separate commits.** They share nothing technically — they are together only
> because neither needs an interview and both block something.
>
> **Phases:** 1 read-only analysis → 2 questions in one batch, stop → 3 write both specs, stop for
> approval → 4 build, item 1 first.
>
> Commit often, path-scoped; log every step; push after each. Never `git add -A`. Never commit a state
> that does not type-check. **Cut from `main`.**

---

## STANDING TRAPS — each cost a wrong conclusion in this project

- **A constructed identifier is invisible to a literal grep.**
- **Read triggers and constraints, not just RLS policies.** ⚠️ **Item 1 was proposed wrong TWICE for
  exactly this reason.**
- **A later migration may supersede an earlier one's comments.**
- **A test that passes on zero rows is a failure.** Eight caught.
- ⚠️ **A new table with a `company_id` must join `COMPANY_CHILDREN`, trial deletion's `COMPANY_TABLES`,
  and the shared purge module (`test-support/company-purge.ts`).** The `file_categories` trigger broke
  company hard-deletion and took out ten suites; a stale duplicate of the purge list in
  `e2e/trial-fixture.ts` detonated again days later. **Both items here add a table.**

---

# ITEM 1 — `client_contract_amounts` (Fix 1)

**A live Financial Visibility Floor exposure.** PM, foreman and crew read client contract values today.
**Highest priority in this prompt.**

## The ruling

| Contract type               | Who may see the value                                          | Why                                                                                                                                                          |
| --------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Subcontractor contracts** | Everyone **except** subs and clients                           | A **committed price — cost.** The Floor's cost tier is broadly visible; a foreman coordinating subs legitimately needs it. **CORRECT TODAY. DO NOT CHANGE.** |
| **Client contracts**        | **Owner/Admin only** — blocked for **PM, foreman, crew, subs** | Client-facing revenue, which is what the Floor reserves. **This is the exposure.**                                                                           |

They wear the same words and point in opposite directions — which is why one absent gate covers both and
only half of it is wrong.

**RULED: move `contract_value` to a 1:1 `client_contract_amounts` side table.** Backfill, retarget the
convert RPC and the panel readers, drop the column and its now-moot write-guard trigger, regen types.
The `project_financials` precedent.

⚠️ **IT NEEDS TWO SELECT ARMS — Owner/Admin AND client-of-project.** `portal.ts:347` shows a client
their own contract value (the counterparty view, S164). **An Owner/Admin-only table breaks the client
portal.** This was caught late; do not lose it.

## ⚠️ Two mechanisms were tried and rejected. Do not revisit them.

**1 — Floor SELECT _and_ INSERT/UPDATE.** Rejected: the write side is **already floored** by two
deliberate triggers — `contract_value` at `20260809000000_financial_rls_floor_part3.sql:155`, voiding at
`20260926000000_7i_contracts.sql:503-504`. The trigger-over-policy choice was ruled **twice**, specifically
so **a PM can still edit contract notes.** Narrowing UPDATE would overturn that ruling as a side effect.

**2 — Floor SELECT only.** Rejected on a **measured** finding: in Postgres an `UPDATE … WHERE` must
match the row **through the SELECT policy.** Impersonation on rebuild-test showed a PM's WHERE-filtered
update matched **0 rows** while `client_contracts_update_authorized` still admitted that PM. So a row
floor **silently removes PM writes**, kills notes-editing, and makes both triggers dead code. It also
breaks four tests: `s145 C4` and `s97ct-floor3 4a` go **red** (the trigger never fires), and
`s97ct-floor3 4b` and the s145 narrow-guard test go **FALSE-GREEN** — passing vacuously on zero rows.

**Why a side table is right here when S121 rejected one:** S121 rejected it because _"the money sits on
rows a PM must INSERT and UPDATE."_ Here the inverse holds — a PM **does not** write the money (a
trigger already blocks it) but **does** write other columns. That is precisely the case a side table
exists for.

**The ruling is about the VALUE, not the row.** A PM keeps the contract; they lose the figure.

## Blast radius, established — do not re-derive

| Surface          | Work                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration        | New `client_contract_amounts` (1:1), **owner/admin + client SELECT arms**, owner/admin INSERT/UPDATE, **no DELETE**; backfill; rewrite `convert_estimate_to_project` to insert the amount; edit `enforce_client_contracts_column_scope` to drop its `contract_value` clause; drop `client_contracts.contract_value`; **leave `client_contracts_select_visible` broad** |
| Types            | `database.ts` regen                                                                                                                                                                                                                                                                                                                                                    |
| Readers          | `getClientContracts` (join) · the `ClientContract` type · `contracts-panel.tsx` (~8 sites incl. revise/confirm) · **`portal.ts:347` (client arm)** · `createClientContract`'s dead-code field                                                                                                                                                                          |
| **Not** affected | `lien-releases.ts:461` (a _sub_ contract) · `contract-value.ts` (`project_financials`)                                                                                                                                                                                                                                                                                 |
| Tests            | Rewrite `s97ct-floor3` 4a/4b to the side table; add amounts-floor **and client-arm** coverage                                                                                                                                                                                                                                                                          |

## ⚠️ ACCEPTANCE SIGNAL

**`s97ct-floor3 4b` and the s145 narrow-guard test must stay GENUINELY green.** If either passes on zero
rows, the fix is wrong in the same way the two rejected mechanisms were. **Say which — the trigger or
RLS — refused, and prove it.**

---

# ITEM 2 — proposal view tracking (prerequisite P3)

**Ruled built ahead of the redesign; it was not.** `14b`'s Client Activity renders "sent <date>" /
"not sent" until it lands.

## The ruling — the shape is already decided

**Row per view:** estimate id, timestamp, **user agent.** Total-opened and last-opened are **derived** —
they are the _display_, not the storage.

**Why not a counter on the estimate.** Email security scanners hit these links and will inflate any
count. **Filtering at write time freezes today's scanner rule into data that cannot be corrected**; with
rows, the rule improves and every historical count improves with it. Rows also answer what a counter
cannot — three opens in an afternoon reads differently from three across three weeks, and the alert copy
(_"no client activity since it was opened Aug 14"_) is a **timeline claim**, not a tally.

**Do not count the contractor's own views.** Josh will open his own proposal to check it; that must not
render as client activity.

**No IP stored.** User agent only, and only to filter non-humans.

## ⚠️ The write path is the whole security question

The proposal link is **public and logged-out.** RLS on a table written from an unauthenticated surface
needs care — **this is the part to get right, not the schema.**

## ✅ The column is already waiting

**`estimates.viewed_at` and status `'viewed'` exist with ZERO writers.** Establish in Phase 1 whether
they should be used, kept in step with the rows, or dropped as superseded — **do not assume.**

---

# PHASE 1 — analysis. Answer everything, then stop.

## Item 1

1. Both SELECT policies' exact WHERE clauses, live. Every trigger on `client_contracts`.
2. Every reader of `contract_value` — confirm the list above and report anything missing.
3. What `portal.ts:347` needs, precisely, so the client arm is right first time.
4. `convert_estimate_to_project` — where the amount insert goes, and whether the RPC stays transactional.
5. Every test touching `client_contracts` — which go **red**, which would go **false-green**.

## Item 2

6. What the public proposal route is, how it authenticates (or does not), and what can write from it.
7. `estimates.viewed_at` and status `'viewed'` — every reader. Superseded, or kept in step?
8. How the contractor's own view is distinguished from a client's on a logged-out surface. ⚠️ **This is
   not obvious — say what identifies the viewer, or that nothing does.**
9. Any existing precedent for an unauthenticated write in this codebase (the CO signing token floor,
   the client portal's write arms).
10. Retention: is there a precedent for pruning? _(An event-log spec ruled six months with an
    open-object exception; this may or may not want the same.)_

---

# PHASE 2 — one batch, both items, then stop

What you found, what needs ruling, every test that would go red or false-green, and any premise you
could not confirm. ⚠️ **Finish the analysis before asking** — item 1 cost a ruling and its reversal
because a question was asked from a half-read file.

---

# PHASE 3 — write BOTH specs, then stop

`docs/specs/client-contract-amounts-spec.md` and `docs/specs/proposal-view-tracking-spec.md`.
**Separate files** — they are separate work.

Each carries: the ruling with its reasoning · the schema change and its migration shape · **an
`input → store → output` trace with real numbers** · **a UI section** (screens, roles, entry points) ·
open `§S` items · what is explicitly out of scope.

⚠️ **Item 1's spec must record both rejected mechanisms and why** — including the measured 0-row
finding. That is the most reusable thing this project learned this week, and the next person to floor a
column will need it.

**Then stop.** Josh reads both before anything is built.

---

# PHASE 4 — build, after approval

**Item 1 first** — it is the live exposure. Separate commits. Migrations pushed **attended, one at a
time**, DB before git, CLI re-linked to rebuild-test immediately after.

Full battery at the end — type-check, lint, cold build, unit, the live RLS suites, **Playwright in four
chunks** (the dev server does not survive one pass). Report counts per suite.
