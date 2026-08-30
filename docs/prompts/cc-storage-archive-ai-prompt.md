# CC PROMPT — storage caps, trash, the project archive, and the AI cap

> **Spec: `docs/specs/storage-archive-ai-spec.md`.** Read it in full first. **Eleven `§S` blocks** are
> facts it cannot assert until you read the tree.
>
> **Phase 1** — read-only analysis, fill every `§S`. **Phase 2** — every question, one batch, stop.
> **Phase 3** — finalise the spec, then build.
>
> Commit often, path-scoped; log every step. **Per S173 you do not push — Josh does.**
> Never `git add -A`. Never commit a state that does not type-check.

---

## ⚠️ WHY THIS IS ON A CRITICAL PATH

**The privacy policy and terms of service are written and legally reviewed — and cannot be published
until this ships.** They describe **plan storage limits**, **trash behaviour** and **an export**, none
of which is true today.

**And the chain runs further than that:**

> **this build → the documents become accurate → publish `/terms` and `/privacy` → Intuit releases
> sandbox keys → 7G can be built**

⚠️ **Intuit will not issue sandbox keys without live EULA and privacy URLs.** That is the actual reason
those documents exist.

**So: no shortcuts, and nothing claimed that is not true.** ⚠️ **This project has twice shipped copy
promising something the code does not do** — Billing's 90-day retention, and the Expenses "posts to the
QuickBooks export" caption. **A legal document is where that mistake is most expensive.**

---

## STANDING TRAPS

- **A constructed identifier is invisible to a literal grep.**
- **Read triggers and constraints, not just RLS policies.**
- **A later migration may supersede an earlier one's comments.**
- **A test that passes on zero rows is a failure.** Nine caught here.
- ⚠️ **A new table with a `company_id` must join `COMPANY_CHILDREN`, trial deletion's `COMPANY_TABLES`,
  and the shared purge module.** ⚠️ **This has detonated THREE times** — and the deletion-sweep analysis
  found **23 more tables** in neither list. **If this build adds a table, it joins them in the same
  commit.**
- ⚠️ **`turbo` cache hits replay old logs.** Use `--force` for anything you assert about the tree.

---

# PHASE 1 — analysis. Fill every `§S`. Change nothing.

| Block    | What it owes                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§S1**  | Does `files` carry a size column, **populated on every row**? What does Billing display today? ⚠️ **Null sizes make the sum wrong from day one.**          |
| **§S2**  | Where the total is computed, and how often — per request or cached.                                                                                        |
| **§S3**  | ⚠️ **Every upload path**, and which are subject to the cap. **A generated invoice PDF is not a user upload and MUST NOT fail at the cap.**                 |
| **§S4**  | ⚠️ **Does permanent delete remove the storage OBJECT or only the row?** **Verify in code, not by the function name.**                                      |
| **§S5**  | Empty Trash scope, and what runs the 6-month purge.                                                                                                        |
| **§S6**  | ⚠️ **What runs an ON-DEMAND background job in this deploy.** The crons are scheduled; this is not. **Report what exists; do not assume a worker runtime.** |
| **§S7**  | Does the archive reuse `export_jobs`, or need its own?                                                                                                     |
| **§S8**  | ⚠️ **Where the ZIP lives, for how long, and whether it counts against the cap.**                                                                           |
| **§S9**  | The folder structure — propose it.                                                                                                                         |
| **§S10** | ⚠️ **Does `ai_tag_logs` already give the photo count?** If it has a row per tagged photo, **the counter is a query, not a new table.**                     |
| **§S11** | Calendar month or billing period for the AI reset.                                                                                                         |

## The four that will shape the build most

⚠️ **§S4 — if permanent delete leaves the storage object, this entire feature does nothing.** The cap
can never be relieved, Empty Trash is theatre, and the limit screen offers an action that doesn't work.
**Check this first.**

⚠️ **§S3 — a cap that blocks a generated invoice PDF takes a contractor's business offline over a
billing limit.** The ruling is explicit: **only user uploads stop. Everything else keeps working.**

⚠️ **§S6 — the archive reads every file in a project.** It cannot run in a request. **If nothing in this
deploy runs an on-demand background job, say so — that changes the design, and it is better known now.**

⚠️ **§S8 — a 500 MB archive written into the `exports` bucket while the customer is AT their cap is a
real problem.** Propose an answer rather than discovering it.

**Then stop.**

---

# PHASE 2 — one batch, then STOP

Every question, together. Include what needs ruling, every test that would go red or false-green, and
any premise you could not confirm. ⚠️ **Finish the analysis before you ask** — twice in this project a
question asked from a half-read file cost a ruling and its reversal.

---

# PHASE 3 — finalise the spec, then build

Fold every answer in, replacing each `§S` with the fact. **Commit the finalised spec before the first
build commit.**

## Build order

1. **Storage measurement** — nothing else works without the number.
2. **Trash: Empty Trash, the 6-month purge, and the object-deletion fix if §S4 needs one.**
3. **The cap and the limit screen.** ⚠️ **The screen only makes sense once trash actually reclaims
   space** — build it after 2, or it offers an action that does not work.
4. **The archive.**
5. **The AI cap.**

## The rulings — do not re-litigate

- **Storage = the sum of `files.size`**, not the bucket. Trashed files **count**.
- ⚠️ **Warn at 80% and 95%; block NEW UPLOADS at 100%. Nothing else stops.** A contractor at their cap
  can still invoice, schedule, run jobs and get paid. **Storage is a billing limit, not a reason to take
  someone's business offline.**
- **Trash auto-purges at 6 months.** The limit screen **names the Owner/Admin requirement** and
  **offers Empty Trash.**
- **The archive includes trash**, in its own folder.
- ⚠️ **The delete prompt appears ONLY AFTER the download completes**, warns the customer to **check the
  ZIP first**, and says **irreversible**. **Nothing is automatic — the archive never deletes anything.**
- **AI: $20/month, 1,500 photos, hard cap, no overage.** ⚠️ **At the cap, uploads still work and the
  photos arrive untagged — the message must say exactly that**, not read as a failure.

## Acceptance — and the last one matters most

- A company over its cap **cannot upload and can still invoice, schedule and clock in.**
- ⚠️ **Generated PDFs are not blocked.**
- The limit screen names the trash rule, the Owner/Admin requirement, Empty Trash, and the archive.
- ⚠️ **Emptying trash actually reclaims bytes — prove the storage OBJECT is gone, not just the row.**
- An archive contains every file including trash, in folders, **and opens.**
- The delete prompt appears only after download, warns to check, says irreversible.
- Tagging stops at 1,500; uploads still succeed.
- ⚠️ **THE NEGATIVE CASE: a company UNDER its cap is unaffected by every one of these.** Uploads work,
  nothing is purged, tagging runs. **A test proving the cap fires says nothing about it firing on the
  wrong company.**

## Then the battery

Type-check `--force` · lint · cold build · unit · live RLS · **Playwright in four chunks.**
**Counts per suite.** ⚠️ **A count below baseline is a finding, not a footnote.** Name the class of
every red and re-run in isolation before calling anything a regression.

---

## NOT IN SCOPE

**Thumbnails for the photo gallery** (register M8 — ⚠️ **the single largest cost lever in the product**,
and its own work) · overage billing for AI · seat-limit enforcement · the public site · 7G · the
deletion sweep.
