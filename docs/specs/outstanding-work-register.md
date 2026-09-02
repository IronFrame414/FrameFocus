# Outstanding work register — everything the desktop redesign session owes

> **Purpose.** The redesign spec (`desktop-redesign-spec.md`) rules what is *in* the pass. This file is
> the register of everything ruled **out** of it, everything the build surfaced, and everything a
> ruling created but nobody scheduled. **Nothing here is lost by being here.**
>
> **Why it exists:** the spec's §5 out-of-pass list carried **eight** items while §6b documented
> **seven**. `16c` Terms was named as out-of-pass and had no entry anywhere — no owner, no scope, no
> record of what it actually involves. That gap is what prompted this file.
>
> **Status key:** 🔴 blocking something · 🟡 ruled, unscheduled · ⚪ logged, no ruling · ✅ done

---

## A — The register at a glance

**Status key:** 🔴 blocking · 🟡 ruled, unscheduled · 🟢 ruled AND specced/prompted · ⚪ logged, no ruling · ✅ done

| # | Item | Status | Where it stands |
| --- | --- | --- | --- |
| A1 | Proposal view tracking (P3) | ✅ | **SHIPPED** — `proposal_views`, service-role write path, `14b` Client Activity now renders real opens |
| A2 | Client contract amounts (Fix 1) | ✅ | **SHIPPED** — the last live Floor exposure is closed; side table with owner/admin + restated-client arms |
| A3 | `16c` Terms — three schema changes | 🟢 | **Fully ruled** + prompt — `cc-terms-module-prompt.md` |
| A4 | Add-items sheet + POs (`17`/`18`) | ✅ | **SHIPPED** — merged at `b14806d`, nine migrations on production. Phase B added R-B1..R-B3 and the reviewer-set ruling. |
| A5 | Module 7G — QuickBooks | 🟡 | Spec + prompt written. ⚠️ **See §N — the critical path.** Blocked on publishing the legal routes. |
| A6 | Company margin target | 🟡 | **Confirmed** as specced. Unscheduled. |
| A7 | Stored sell | 🟡 | Unchanged |
| A8 | Paid-cancellation retention (90 days) | ✅ | **SHIPPED** — 90-day lock at `subscription.deleted`, portal carve-out, tokenized resubscribe, shared unban |
| A9 | Notification per-type routing grid | 🟡 | CC deferred it in step 8 — a schema change, ask-first |
| A10 | **Event log** | 🟢 | **Fully ruled** (four rulings) + prompt — `cc-event-log-prompt.md`. ⚠️ **Prompt needs amending — see §G.** |
| A11 | Proposed timeline from estimate | 🟡 | Deferred in step 10. Zero machinery. |
| A12 | Portfolio money rollups | ✅ | **SHIPPED** in step 10.1 — `getPortfolioMoney`, concurrent after a caught perf regression |
| A13 | Recent activity feed | 🟢 | Ruled *with* A10 — it is the same event log |
| A14 | Custom composable roles | ⚪ | **Genuine debt** (deferred decision) — filed `TECH_DEBT.md` **#155** ✅ [S179] |
| A15 | Unbilled to client | ⚪ | **Owed work, on THIS register** — needs schema. Reclassified out of `TECH_DEBT.md` [S179] |
| A16 | Package scope rename | ⚪ | **Owed work, on THIS register** — ~340 import lines. Reclassified out of `TECH_DEBT.md` [S179] |
| A17 | Row tints | 🟡 | ⚠️ **RULED: they mean row STATE, not category nesting.** Nothing applies them yet. |
| A18 | `/m` photo chips (Safety, Marked up) | ⚪ | Desktop has six, mobile four |
| A19 | The five `prompt()` sites | ⚪ | Two remain in Settings forms; sequencing still open |
| A20 | Floor-document amendment | ⚪ | Docs still contradict the shipped Floor |
| **A21** | **Files excludes what Photos shows** | 🟡 | Ruled, not yet specced. See §I. |
| **M4–M8** | Storage caps · trash · archive · AI cap | ✅ | **SHIPPED** — see §M. Made most of the legal documents' claims true. |
| **O1** | ⚠️ **Test harness sending REAL email** | 🔴 | **423 sends, still running.** Ruled: gate + key. See §O. |
| **O2** | ⚠️ **Gmail filtering as spam** | 🔴 | **Not an auth problem.** Diagnosis running. See §O. |

⚠️ **A12 shipped after this register was first written.** The dashboard's portfolio money rollup landed
in step 10.1, reusing each per-project sibling's shared maths so it agrees with the projects list by
construction. Owner/Admin-only, zero queries for gated roles. **A perf regression was caught by the
battery** — the serial profitability loop added ~9s to every Owner dashboard render; it is now
concurrent.

## B — 🔴 Blocking

### B1 · A1 — Proposal view tracking (prerequisite P3)

**Ruled built ahead of the restyle; it was not.** `14b` renders "sent <date>" / "not sent" until it lands.

**The shape is already ruled.** Row per view — estimate id, timestamp, **user agent**. Total-opened and
last-opened are **derived**; they are the *display*, not the storage.

*Why not a counter:* email security scanners hit these links. Filtering at write time freezes today's
scanner rule into data that cannot be corrected; with rows, the rule improves and history improves with
it. Rows also answer what a counter cannot — three opens in an afternoon reads differently from three
across three weeks, and the alert copy (*"no client activity since it was opened Aug 14"*) is a timeline
claim.

**Do not count the contractor's own views.**

⚠️ **The write path is the entire security question.** The proposal link is **public and logged-out**;
RLS on a table written from an unauthenticated surface needs care. **No IP stored** — user agent only,
and only to filter non-humans.

✅ **The column is already waiting:** `estimates.viewed_at` and status `'viewed'` exist **with zero
writers.**

### B2 · A2 — Client contract side table (Fix 1)

**A live Financial Visibility Floor exposure.** PM, foreman and crew read client contract values today.

**Ruled fix:** move `contract_value` to a 1:1 `client_contract_amounts` table. Backfill, retarget the
convert RPC and panel readers, drop the column and its now-moot trigger, regen types.

⚠️ **It needs TWO SELECT arms — Owner/Admin AND client-of-project.** `portal.ts:347` shows a client
their own contract value (the counterparty view, S164). **An Owner/Admin-only table breaks the client
portal.**

**Two mechanisms were tried and rejected. Do not revisit them:**
1. **Floor SELECT + INSERT/UPDATE** — the write side is *already* floored by two deliberate triggers, and
   the trigger-over-policy choice was ruled **twice** so a PM keeps editing notes.
2. **Floor SELECT only** — **measured**: a PM's WHERE-filtered UPDATE matched **0 rows**, because
   Postgres reads the row through the SELECT policy to match it. A row floor silently kills PM writes,
   makes both triggers dead code, and leaves four tests broken — two red, two **false-green**.

**Acceptance signal:** `s97ct-floor3 4b` and the s145 narrow-guard test must stay **genuinely** green. If
either passes on zero rows, the fix is wrong in the same way.

**Full blast radius** is in the spec's §8b.

---

## C — 🟡 Ruled, unscheduled

### C1 · A3 — `16c` Terms — THE GAP THIS FILE WAS WRITTEN FOR

**Named out-of-pass in §5, documented nowhere.** It is not one change but **three**.

#### C1a — Structured payment terms
`estimates.terms_sections` validates as `{ name: string, content: string }` — **free text. Nothing parses
it.**

| Field | Reality |
| --- | --- |
| **Deposit %** | ❌ **Stored nowhere on an estimate.** The only `deposit` in the schema is `invoice_lines.source_deposit_invoice_id` — a deposit is *an invoice that later credits*, not a term. |
| **Invoice due** | ❌ **Not on the estimate** — `invoices.due_date` is set per invoice. |
| **Retainage %** | ✅ `retainage_percent` — the one payment term that is already a real column. |

**The mockup's own copy is correct about the problem:** *"these three numbers were previously buried in
the terms paragraph, where nothing could read them."* Two of the three do not exist. **The fix is
columns plus a migration.**

⚠️ **This connects to P-1.** Payment terms being unruled is *why* invoice due dates are never written —
which is why AR aging falls back to issue date and why "Expected in 30 days" is deferred. **Specing
payment terms unblocks the aging split and that metric.**

#### C1b — Excluded scope sections
`estimates.scope_sections` validates as `{ title, bullets[] }` — one level, **no per-section flag.**
Adding Excluded changes the schema **and every reader of that JSON**, including
`ProposalScopeSection` in the proposal renderer.

#### C1c — A saved scope library
Does not exist. `companies.default_terms_sections` is a **terms** library; there is **no
`default_scope_sections`** anywhere. The nearest existing reuse path is cloning a whole estimate.

### C2 · A4 — The add-items sheet and PO conversion (`17a`–`17c`, `18a`–`18b`)

**Its own module spec.** Full detail in §6b.5. The headline: **the design's PO has no schema behind it.**
`purchase_order_items` carries description · qty · unit · sort_order — **no money at all.** The only
dollar figure is a hand-entered `total_amount` committing as one lump against one budget line.

**It also reverses a shipped model:** committed cost lands when someone *types a total*; the design makes
it **the sum of de-marked-up lines, committed on issue.** Everything reading committed cost moves with
it.

⚠️ **CARRY THIS RULING VERBATIM — it is the point of the handoff:**
> The estimate carries **cost and sell**. A **purchase order is cost only** — every line, subtotal and
> total de-marked-up. **"Against the estimate" compares ordered cost to budgeted cost, never to sell.**

Schema gaps: PO lines need money columns and a `budget_item_id` · **vendor exists but is not wired**
(`subcontractors.sub_type='vendor'` is real and `cost_catalog.default_vendor_id` uses it, but
`purchase_orders.vendor_name` is free text with no FK, and a material estimate row has no vendor at all)
· `cost_catalog` is **material-only** (no Equipment/Labor/Sub, no cost code, no favorites, no assemblies)
· PO status is **open/closed only** · the convert RPC creates no POs.

### C3 · A5 — Module 7G, the QuickBooks connector

**A priority, its own session, blocked on the Intuit developer account.**

Schema is **staged**: `expenses.qb_push_status / qb_bill_id / qb_synced_at` and
`companies.gl_account_*` all exist. **No writer exists** — `approve_expense` never touches the `qb_*`
columns and there is no export service. **A connector plus a push path, not a schema build.**

⚠️ **Two things the redesign must handle meanwhile:** the Expenses Review-queue must not claim approving
posts to the QuickBooks export *(confirmed: that caption appears nowhere in shipped code — do not write
it)*, and the **Accounting tab must say GL mapping is LIVE, not frozen** — unlike burden and retainage,
it is read at export time, so a change is retroactive.

### C4 · A6 — Company margin target

One nullable column plus a Company Settings field. **Company-wide only**; no mockup shows a per-project
override. **Margin renders as a number without it** — only the judgment disappears.

**Recommendation on the table:** no target set means the comparison UI does not render, rather than
defaulting to a number nobody chose.

Unblocks three treatments: `14a`'s "Margin under target", the dashboard's Margin-by-job card, and
`13e`'s "8.5 points under your 30% target".

### C5 · A7 — Stored sell

The codebase already went halfway: **`signed_sell_amount` IS persisted** on a selection. What is not
stored is sell on **rate-derived instruments**, where it is `cost × the rate in force when the cost was
incurred` — and rates are **effective-dated**.

⚠️ **The hard part is invalidation, not storage.** Owner correct-rates edit mode exists, so a stored sell
can go **silently stale** — worse than a slow correct one.

Unblocks `13e`'s per-category Revenue and Margin columns, which are em-dashes today because
`project_budget_amounts` carries only `budgeted_amount`.

### C6 · A8 — Paid-cancellation retention

⚠️ **The Billing copy ships in step 10; the feature does not exist.**

| Path | Retention | Access | Built? |
| --- | --- | --- | --- |
| Trial expiry | **14 days** | **Locked.** Recoverable only by paying — for a lapsed trial, opening a paid account. | ✅ |
| **Paid cancellation** | **90 days** | **Locked**, same as trial. | ❌ **not built** |

The only trace is a comment: *"cancellation gets 30 days and is a different path that is not built
here."* **90 days is a FEATURE** — a lock, a retention clock, and an unban-on-payment route. The trial
path is the precedent, and its comment warns the way back must clear **both the ban and the retention
clock.**

⚠️ **Retention is a data-deletion policy.** If a terms of service or privacy policy states a different
period, code and document must agree.

### C7 · A9 — Notification per-type routing grid

**A schema change.** There is **no `notification_preferences` table** and no per-type app/email toggle
anywhere. What exists: `companies.notify_hours_start/end` (quiet hours) and a wired `push_subscriptions`
+ service worker.

✅ **Already ruled and shipped in step 7:** the type→chip mapping and the decision set, both derived from
`type` with no category column. Those do not need respecing.

### C8 · A10 — Estimate History event log

**No audit, event or history table exists anywhere** — confirmed across all migrations, and the same
finding appeared in the estimate, PO and destinations passes. `version_number` is a **dead `DEFAULT
'v1.1'` with zero writers.**

The mockup wants "Priced to $123,651", "Margin dropped 31% → 18.4%", "Created from Weller template".
**Building the panel means building the log.** ⚠️ It would also serve A13.

### C9 · A11 — Proposed timeline from estimate categories

**The largest NEW item in the whole handoff, and it has zero machinery.** `phases` carries only `name`,
`sort_order`, `project_id` — **no `estimate_id`, no dates, no dollar weight, no link to
`estimate_categories`.**

Deriving phases from category dollar weight, previewing them, and an Accept action that writes real
tasks is a build in its own right.

### C10 · A12 — Portfolio money rollups

Coming in · Going out · Not yet billed. Only **per-project** services exist — `getProjectAging`,
`getPayablesSummary`, `getProfitabilityReport`. **No company-wide rollup of any of the three.**

⚠️ Anything keyed on `due_date` inherits **P-1** — see C1a. **Specing payment terms may unblock part of
this.**

### C11 · A13 — Recent activity feed

No event table (see C8). Assembled per source, or built on A10's log.

---

## D — ⚪ Logged, no ruling

| # | Item | Note |
| --- | --- | --- |
| **A14** | **Custom composable roles** | Ruled toward roles, **not** per-person grants: every gate keys on `get_my_role()`, RLS cannot restrict columns, and testing loses its fixed set. The real need is legitimate — a bookkeeper who needs invoices but not the schedule. **✅ Genuine debt — filed `TECH_DEBT.md` #155 [S179]** (deferred decision, the one that stays in the debt file). |
| **A15** | **Unbilled to client** (Expenses) | No expense→invoice link; needs schema. ⚠️ **Do not confuse with `13c`'s "Cost you've fronted"** — that is cost fronted on a *project*, derivable via `invoice_cost_claims`. Different questions. **[S179] Owed work — reclassified OUT of `TECH_DEBT.md` (was `#2-regbacklog`); it lives HERE, not there.** ⚠️ **[S180] DEFERRED to attended; full design in `register-closeout-log.md` §3.1.** Finding: it's answerable TODAY without schema via `expenses→expense_allocations→invoice_cost_claims` (query in the log); the `source_expense_id` denormalization (ON DELETE SET NULL, nullable, backfill query in the log) is an optional optimization. Build attended. |
| **A16** | **Package scope rename** (`@framefocus/shared`) | Breaks the build on a miss, **zero user-facing change.** ⚠️ **[S179] the "~150 import lines" is low — measured 340 `from '@framefocus/shared…'` statements across 271 files.** Owed work — reclassified OUT of `TECH_DEBT.md` (was `#3-regbacklog`); it lives HERE. ⚠️ **[S180] DEFERRED to the consolidated EZ-Contractor-Binder rebrand pass — NOT blocked-on-name** [Josh]. Exact scope re-measured: **343 import lines / 274 files + 6 config refs** (package.json ×3, tsconfig paths ×2, next.config transpilePackages). Pure literal replace. Do it in ONE attended pass with the RafterWorks sidebar wordmark + remaining brand strings; scope string TBD (`@ezbinder/shared` / `@ez-contractor-binder/shared` / `@binder/shared`). Not done in the S180 close-out (collision surface + shouldn't be renamed in isolation). |
| **A17** | **Row tints** | `rowTintAttention` / `rowTintProblem` shipped as tokens; **no screen applies them.** The mockups use them for row *state* (a lapsed-insurance sub, an over-budget line); Josh suggested category/subcategory nesting. **Two different meanings — rule before applying**, or a tint means "problem" on one screen and "subcategory" on another. |
| **A18** | **`/m` photo chips** | Desktop now has six, mobile four, over the same data. CC correctly declined to widen a ruled `/m` surface as a rider on a desktop step. |
| **A19** | **The five `prompt()` sites** (`#1-dialogsweep`) | All five collect a *value*, which is why the sweep left them. Sites: `contract-settings-form` · `lien-release-settings-form` · `items-tab` · `releases-panel` · `markup-editor`. **Build a value-collecting overlay, or ship native dialogs through the restyle?** |
| **A20** | **Floor-document amendment** | `money-representation.md` and `7d1-spec.md` §12a still state the **overturned** S97 carve-out (*"a PM sees the amounts on an invoice they can reach"*). §7.1 obliged the amendment; the fix commit did not make it. **The Floor documents currently disagree with the shipped Floor.** Parked with the invoice-floor work. |

---

## E — ✅ Done, recorded so nobody respecs them

| Item | Where |
| --- | --- |
| **Sub-inbound lien releases** | Shipped in step 6.4 as **UI over schema that already shipped** (`20260925000000`). S145 ruled signing (upload-back, no external surface), the two triggers, roles, templates and the never-block posture. **No spec needed — do not write one.** |
| **Custom file categories** | Shipped in step 6.1 with `20261039000000`. ⚠️ **Produced a regression**: the seed trigger broke company hard-deletion via an FK the deletion lists did not know about. **The lesson: a new table with a `company_id` must join `COMPANY_CHILDREN`, trial deletion's `COMPANY_TABLES`, and the purge helpers.** |
| **The invoice floor** | Shipped `2ff9966` + `20261038000000`. Keyed on **`author_member_id`, not `created_by`** — the latter is NULL on 10 of 18 live invoices. |
| **The tz fix · the three N+1s** | `8de9b4d` · `04b67f4`. |
| **Notification chips + decision set** | Ruled and shipped in step 7. |

---

## G — Rulings made AFTER this register was first written

⚠️ **The register was written before several interviews happened.** Everything below is ruled and was
not in the original file. **This section is the audit's output.**

### G1 — The event log (A10 + A13) — four rulings

| # | Ruling |
| --- | --- |
| 1 | **Build the FULL log**, not an estimates-only one, and do not cut the panels. *(Three options were weighed.)* |
| 2 | **HYBRID: database triggers for completeness, plus an OPTIONAL CONTEXT FIELD for *why*.** A trigger cannot know *"sub bid came in high"*; explicit-only would let call sites forget. |
| 3 | **Changed columns only** — never whole-row snapshots. That is the version that grows without bound. |
| 4 | **Prune at six months, EXCEPT where the parent is still open.** Projects: **`archived` is the ONLY terminal state** — a *completed* project keeps its history until archived, which puts the decision in the user's hands rather than a timer's. Estimates: `converted`/`voided` are terminal, **but a converted estimate's history is kept** as the project's history. |

### G2 — `16c` Terms (A3) — the full shape

**Deposit:** prints as a term **and auto-generates the invoice on conversion** *(the alternative — a
client paying before acceptance — was rejected: an invoice belongs to a project, and there is no project
before conversion)*. **Company-wide default in Settings**, overridable **per estimate before sending**.
Generated as a **DRAFT, never sent** — conversion must not send client-facing mail as a side effect —
with a **post-conversion prompt and a button straight to the invoice.**

**Invoice due:** stored on the estimate and carried to the invoices it drives. ⚠️ **This is what retires
P-1.**

**Excluded scope:** prints **in its own block**, at **all five detail levels** — exclusions matter most
at the lump-sum end. ⚠️ **Empty sections print NOTHING — no header, no label — and that applies to ALL
sections, not just exclusions.**

**Scope library:** Company Settings, Estimating tab. **Insert copies; it does not link.** ⚠️ **Save-back
is allowed**, and a **collision prompts to rename or overwrite.**

### G3 — The PO module (A4) — ruled and specced

Beyond §C2's schema facts, these were ruled at interview:

| Decision | Ruling |
| --- | --- |
| **Committed cost** | ⚠️ **An agreed subcontract — AND an issued material PO.** This *narrows* the design and removes the module's largest risk: an earlier reading had it reversing what committed means, dragging Budget & Cost, the dashboard and `getPayablesSummary` along. **It does not.** |
| **Vendor** | From `cost_catalog.default_vendor_id` when catalog-sourced; **blank when typed manually**; filled in on the project side |
| **PO lines** | Gain **cost** and **`budget_item_id`** |
| **Status** | draft · issued · closed, **partial issue allowed, per-line issue states** |
| **The material run** | Tag a member to **specific lines** · one clumped expense with a receipt · ⚠️ **asked what is missing** · office breaks it down at review · purchased lines move to the bottom and leave the open PO |
| **Who may be tagged** | ⚠️ **The five staff roles** — `expenses_insert` excludes subcontractors, so tagging one would create an assignment they cannot fulfil |
| **A flagged-missing line** | Notifies **Owner, Admin, PM**; the item **stays open**. New type → **Field chip + decision set** |
| **The run expense's PO link** | ⚠️ **A NEW column (`source_po_id`), NOT `purchase_order_id`** — the origin predicate in `recompute_budget_item_committed` treats `purchase_order_id` as *"this row IS the commitment"*, so reusing it would double-commit and hide the amount from actual. **The module's sharpest edge.** |
| **Favorites** | Company-wide |
| **v1 scope** | **Catalog + manual only**; assemblies **out**; sub-bid and past-estimate sources **out** |
| **Old POs** | ⚠️ **Not updated.** New POs derive their total from lines; old ones keep the typed total. Some will not foot — **deliberate.** The UI must tolerate a PO with no line costs **without rendering zeros or errors.** |
| **`set_po_total_amount`** | ⚠️ `s97ct-floor3` §5 asserts *"the RPC stays the path"*. Every new writer takes the same `app.po_total` exemption; **the test must keep passing on the property, not vacuously.** |
| **PO numbering** | **At issue**, following the projects and change-order scheme — not at draft |
| **Issuing** | ⚠️ **Both vendor email AND PDF download.** Three consequences to spec: does a vendor row carry an **email address**; the PO email is a **new template carrying the CONTRACTOR's identity**, not the platform's; and a PO with a typed `vendor_name` and **no `vendor_id` has no address** — the email option must be **unavailable**, not fail at send. |

**A finding worth keeping:** the estimate row's `unit_cost`/`amount` **is already the cost basis** —
markup is only ever applied forward. So a PO de-markups **by construction**, never by inverse arithmetic,
and `budgeted_amount` is the same basis. That is what makes "Against the estimate" apples-to-apples.

### G4 — Smaller rulings

- **A6** — confirmed as specced: company-wide, nullable, **no comparison renders when unset.**
- **A17** — ⚠️ **row tints mean row STATE** (a lapsed-insurance sub, an over-budget line), **not category
  nesting.** An earlier suggestion of nesting was a guess and was withdrawn. If both meanings shipped, a
  tint would mean "problem" on one screen and "subcategory" on another.
- **A5** — the **Intuit developer account now exists**, so 7G is unblocked. *(Free; the customer's own
  QuickBooks subscription is their cost, and an Intuit app review stands between credentials and going
  live.)*

---

## H — ✅ RESOLVED: the event-log prompt was amended

> **Done.** The four design decisions below were ruled and folded in as R5–R10; the prompt's Phase 1 is
> now analysis only. Kept as the record of what was wrong and why.


`cc-event-log-prompt.md` asks CC several things that are **design decisions, not repo facts.** Those
belong to Josh, not to an analysis phase. **Rule these, then amend the prompt:**

| Open | Why it is not a repo question |
| --- | --- |
| **Which tables get the trigger** | This is the module's scope. *Recommendation: the objects a contractor talks about — estimates, projects, change orders, invoices, payments, selections, punch items, contracts, POs. **Not** `time_segments`, `notifications`, or the log itself: high-churn tables produce noise, not history.* |
| **Does the log carry `project_id`** | A row-shape decision |
| **The RLS policy shape** | The constraint is known — ⚠️ **a "margin changed 31% → 18.4%" event IS a margin figure**, and margin is Owner/Admin, so an event log is a well-known way to leak the thing it describes. But the **shape** is rulable. |
| **Re-parenting on conversion** | Whether a converted estimate's events re-parent to the project or follow its state |

**Genuinely repo-only, and correctly left to analysis:** how `auth.uid()` behaves inside a trigger under
SECURITY DEFINER and service-role writes · what changed-column computation costs on a wide table ·
which registries a new table must join · what breaks in the fixtures.

---

## I — A21: Files excludes what Photos shows

⚠️ **NEW, ruled, not yet specced.** Noticed live: a photo appears in **both** the Files tab and the
Photos tab, because both read `files` — Photos filters `category='photos'`, Files renders everything.

**RULED: the Files tab excludes anything the Photos tab shows.** The design's Files mockup lists
Permits, Plans & Drawings, Inspections, Insurance, Closeout — **no photos category** — so separation was
the implicit assumption.

⚠️ **Define the predicate ONCE and have both tabs use it**, so they cannot drift. Photos includes X;
Files excludes exactly X.

**The failure mode to avoid: a file that NEITHER tab shows.** Before building, establish what the Photos
gallery actually filters on — `category='photos'`, a MIME check (`image/*`), a derived source, or a
combination. If Photos shows *images* rather than *the photos category*, a PDF filed under `photos`
would vanish from both.

*Belongs with **A18** — both are Photos-surface decisions left open.*

---

## K — ⚠️ RAISED AND THEN BURIED — the skipped-steps audit

**Eleven items were raised during a session, acknowledged, and then buried by whatever came next.**
None was ruled closed; each was simply overtaken. **This section exists so that stops happening.**

Ranked by consequence.

### K1 — ⚠️ Billing promises 90-day retention that does not exist. LIVE ON PRODUCTION.
Step 10.4 shipped the ruled retention copy, so **Billing now tells a customer their data is kept 90 days
after cancelling.** **Paid cancellation is not built.** The only trace in code is a comment: *"cancellation
gets 30 days and is a different path that is not built here."* The **trial** path is real — 14 days,
locked, recoverable only by paying.

⚠️ **This is not a deferred feature. It is live text making a commitment.** Either the feature ships, or
the copy changes until it does. *(Register A8.)*

### K2 — The compliance expiry gap, raised and never ruled
`subcontractor_compliance_documents.expiration_date` is **nullable for every doc type and nothing
enforces otherwise**, so **a COI or licence saved with no date silently never warns** — the query filters
`.not('expiration_date','is',null)`, and the UI shows a neutral *"No expiry"* chip that reads as benign.

It was called *"the real gap"* when the dual-store question was ruled **leave as is** — and then it was
never ruled either way. ⚠️ **`subcontractors.insurance_expiry` has the same hole, so this is not a
regression — but "not a regression" is not "handled."**

> ✅ **ALREADY BUILT — RECORDED [register-batch2, 2026-09-01]. This entry was STALE.** The batch-two
> prompt carried it as "RULED, apparently never built"; the tree disagrees. Migration
> `supabase/migrations/20261049000000_compliance_expiry_required.sql` adds the ruled CHECK —
> `CHECK (doc_type NOT IN ('coi','license') OR expiration_date IS NOT NULL)` — with `w9`/`other` left
> optional. **Object-level verified on rebuild-test:** the constraint
> `compliance_docs_expiring_types_require_date` is live. **Tested, not false-green:**
> `test/s140-compliance-floor.live.ts:141` inserts a dateless `coi`, asserts the CHECK refuses it by
> name, then inserts WITH a date and asserts success. The migration comment records production had 0
> violating rows at ship time (I cannot re-verify production — MCP is rebuild-test-only — but it is an
> old, presumably-deployed migration). `subcontractors.insurance_expiry` stays as ruled (LEAVE AS IS).
> **Nothing to build.**

### K3 — ⚠️ The live app has never been tested
**Four separate deferrals** of "test later." What is now live and unclicked: **forty redesigned
screens** · the **whole PO module** · **nine production migrations**, two of which touched existing data
— `20261042` relabelled `open` → `issued` on real POs, and `20261048` added a CHECK requiring costed
lines to carry a budget link.

⚠️ **The CHECK should not bite** (existing POs have no line costs) — **but that is a prediction, not an
observation.** Opening one old PO would settle it.

> 📌 **JOSH'S TASK — RECORDED, NOT ACTIONED [register-batch2, 2026-09-01].** This needs a human clicking
> the live production app; CC cannot do it and it is explicitly out of scope (batch-two §3.2). Left open
> and routed to Josh. The one concrete check worth doing first: open one pre-`20261048` PO and confirm
> the costed-line/budget-link CHECK does not bite.

### K4 — This register is stale again
**A4** (the PO module) and **A12** (portfolio rollups) both **shipped**. PO Phase B produced **R-B1
through R-B3** plus the **reviewer-set-stays-Owner/Admin** ruling. None of it is recorded above.

### K5 — Three prompts written and never sent
`cc-blocking-items-prompt.md` (A1 + A2) · `cc-terms-module-prompt.md` (A3) · `cc-event-log-prompt.md`
(A10/A13). All complete, all committed to `docs/prompts/`, none run.

### K6 — 7G
The **Intuit developer account was created**, and 7G was "tomorrow." That was two sessions ago. It is a
stated priority and it is now unblocked. *(Register A5.)*

### K7 — Row tints ruled, applied nowhere
Ruled to mean **row state** — a lapsed-insurance sub, an over-budget line — **not** category nesting.
The tokens shipped in `theme.ts`; **no screen uses them.** `14a` and `14d` both have rows the mockups
tint. *(Register A17.)*

> ✅ **`14a` DONE · `14d` OWNED — [register-batch2, 2026-09-01, RULED Josh].**
> - ⚠️ **Premise correction:** "no screen uses them" was wrong. `rowTintAttention` was already used at
>   `changes-panel.tsx:327` (as a section banner). `rowTintProblem` was the genuinely-unused one.
> - **`14a` projects — BUILT** (`projects-list.tsx`, commit `d64f375`). Ruling [Josh Q1]: tint the rows
>   whose four-condition "needs attention" set is non-empty with `rowTintAttention` (the token's literal
>   meaning). NOT the "over-budget" trigger — that is margin-under-target, DEFERRED with the C4/A6 target
>   (§8.1 excludes it from the set). Hover mouseleave now returns to the tint, not white.
> - **`14d` subs — OWNED, NOT BUILT** [Josh Q2]. Its "lapsed-insurance sub" tint (`rowTintProblem`) would
>   force a choice between the two insurance stores that redesign-spec §8.4 rules **LEAVE AS IS**
>   (`insurance_expiry` vs `subcontractor_compliance_documents`, the latter empty on the fixture). Skipped
>   pending a ruling that revisits the store question. `rowTintProblem` stays unused by design until then.

### K8 — Two token names now hold identical values
`warning` == `warningDeep` and `danger` == `dangerAlt` after the README ramp landed — the design carries
one of each. **CC kept both names deliberately, which was right: a repaint is not a rename.** ⚠️ **But no
TECH_DEBT line was ever written, so the next reader will assume they differ.**

> ✅ **[S179] Verified and reclassified.** Confirmed still true on the tree: `apps/web/lib/theme.ts:45-49`
> — `warning`/`warningDeep` both `#b45309`, `danger`/`dangerAlt` both `#c0362c`, the collapse
> documented in-comment at `:38-40`. It *was* briefly filed in `TECH_DEBT.md` as `#4-regbacklog`, then
> Josh's S179 split ruled it **owed work, not debt** — so it lives HERE, on the register, as the
> record. **The fix (owed, small, mechanical):** pick one name, sweep its consumers, delete the other.
>
> ✅✅ **DONE [S180, commit `00690df`].** Kept the base names `warning`/`danger`; deleted `warningDeep`
> and `dangerAlt`; rewrote all 41 call sites. Rename only — no hex change (semantic-status colours, not
> brand amber). Tailwind config unaffected (raw hex). `tsc --noEmit` clean. Grep confirmed no
> string-literal/config references existed. See `register-closeout-log.md`.
>
> ⚠️ **[S180, Josh] THIS ENTRY'S OWN RATIONALE ABOVE WAS WRONG — recorded, not deleted.** The line
> *"CC kept both names deliberately, which was right: a repaint is not a rename"* is **superseded**:
> the two names never held **distinct values** — `warningDeep` was equal to `warning` (and `dangerAlt`
> to `danger`) from the ramp onward, so there was no distinction to "keep deliberately"; it was a
> duplicate identifier for one hex, not a preserved design decision. ⚠️ **Precision, since the tree
> disagrees with a looser telling:** the duplicate *names* were NOT unused — `color.warningDeep` had
> ~80 call sites across 38 files and `color.dangerAlt` ~17; what was "dead" was the *distinct colour*
> the second name implied, never the identifier. Deletion is safe because all call sites collapse onto
> one hex. **If a design later wants a genuinely deeper warning/danger shade, adding a new token back
> is trivial** — this removed a duplicate, not a capability.

### K9 — `crew-manifest.ts:66` still says "platform"
The literal `description` — *"The all-in-one platform for residential and commercial contractors"* —
predates the rebrand and sits under a banner reading **"EVERY BRAND VALUE IS IMPORTED. NONE IS A
LITERAL."** Not a missed import: **`brand.ts` has no `description` field**, so there is nowhere to import
it from.

> ✅ **[S180] The IMPORT gap is CLOSED (already done before this pass).** `crew-manifest.ts` now reads
> `brand.description`, and `apps/web/lib/brand.ts:69` carries the field — so it is imported, not a
> literal. ⚠️ **Residual, NOT closed:** the VALUE still says "…**platform**…" — pre-rebrand copy with
> no ruled replacement. Folded into the EZ-Contractor-Binder rebrand pass (with A16 + the RafterWorks
> wordmark). Not guessing new copy unattended.

### K10 — `brand.ts` `backgroundColor` is still an unverified assumption
Its own comment flags it as needing a **real-handset check**: a navy splash means a dark-to-light flash
on every cold start, and *"if that reads badly on a real handset, this value — and only this value —
becomes the surface grey."*

⚠️ **§S2 has since MOVED it to the new navy — so the assumption is now untested on a different value.**

> 📌 **OWED, ROUTED TO JOSH [register-batch2, 2026-09-01].** CC cannot test this — it needs a real
> handset. Confirmed on the tree: `brand.ts:96` `backgroundColor: '#0f1729'` (navy), its own comment
> `:84-96` flags the untested-splash assumption. **The exact check for Josh:** install the PWA on an
> iPhone and Android, cold-start it, and watch the splash→first-paint transition. If the navy splash
> flashes badly into the light app surface, change **only** `backgroundColor` to the surface grey
> (`#f4f6fa`) — `themeColor` stays navy either way. No code change until that observation exists.

### K11 — `s138-trial-unlock`'s purge timeout, classified but not root-caused
A **DB statement timeout in the shared purge under parallel load** — not an assertion failure, green in
isolation. The audit left it an explicit UNKNOWN: **a bigger `statement_timeout`, or fewer concurrent
suites deleting companies?** ⚠️ Same family as `s146-C5` and `s97ct-roles 6b`; **one fix may address
more than one.**

---

### ⚠️ The pattern worth naming
Every one of these was **raised, understood, and agreed to matter** — then a new thing arrived and the
old thing was never closed. **The fix is not more diligence in the moment; it is that this section gets
re-read at the start of a session, not the end.**

---

## L — ⚠️ SECOND-PASS AUDIT — eight more, none previously recorded

**Found on a deliberate second pass over the session, after §K.** ⚠️ **That §K did not catch these is the
point: one pass is not enough.**

### L1 — ⚠️ The register's own TECH_DEBT pointers were never followed
**A14** (custom composable roles), **A15** (unbilled to client) and **A16** (package scope rename) each
say *"→ `TECH_DEBT.md`"*. **Nobody wrote them there.** Same for **K8**'s duplicate token names and
**`s146-C5`**'s three-time flake.

⚠️ **The register points at a file that does not contain them.** A reader who checks `TECH_DEBT.md`
finds nothing, and a reader who checks the register thinks it was filed. **Filing is a step, not a
sentence.**

> ✅ **RESOLVED [S179] — and the resolution went the other way for three of the four.** They *were*
> subsequently filed (as `#1`–`#4-regbacklog`), so the "nobody wrote them there" state above is
> stale. But Josh then ruled the debt/owed-work split: **only A14 (custom roles) is genuine debt** —
> now `TECH_DEBT.md` **#155**. **A15, A16 and K8 were reclassified back OUT of `TECH_DEBT.md` as owed
> work and live on THIS register** (§D and §K8). The pointers were verified against the ledger this
> time — *"filing is a step, not a sentence"* applied to itself. (`s146-C5`'s flake was root-caused
> and fixed, per the register-backlog note in `TECH_DEBT.md`'s header — not filed.)

### L2 — `feature/full-audit` is local-only and unmerged
CC's closing line: *"The branch is local-only; merging or pushing is yours."* **The full audit report
exists on one branch on one machine.** A Codespace rebuild takes it.

### L3 — ⚠️ The dialog sweep's coverage gap was flagged, then never chased
S175 item 9 merged with *"the coverage gap made explicit"* — and the explicit gap is this: **only 1 of
the 54 converted `confirm()` sites has an e2e test that clicks it.** The other 53, and **all 20**
`alert()` sites, are **unclicked by any test.**

The sweep removed Playwright's silent auto-dismiss trap and **made every dialog clickable and testable —
it did not manufacture the coverage.** The redesign spec's §9 says *"check what remains before assuming
every dialog is styled."* **That check was never done.**

> ✅ **THE RULED SIX ARE BUILT — RECORDED [register-batch2, 2026-09-01]. This entry was STALE.** The
> batch-two prompt carried L3 as "check whether already built" — it is. `apps/web/e2e/desktop-confirms
> .spec.ts` exists (header: *"Register backlog §2 — the RULED SIX [Josh, Phase 2 Q5]"*) and covers
> exactly the six money-irreversible confirms: send invoice · project complete→reopen→cancel round-trip
> · delete payment · void contract · delete change order · delete estimate. Each asserts pre-state via
> admin, clicks `confirm-accept`, and polls post-state via the DB (not vacuous). Contract-template delete
> was correctly excluded (*"not a financial record"*). Pass-verification: see the batch-two log / §7
> Playwright run. **The broader gap — 53 other `confirm()` + 20 `alert()` sites unclicked — was ruled
> out of the "six"; it stays as recorded scope, not owed work.**

### L4 — ⚠️ Four things were CUT PERMANENTLY but read as deferrals
A permanent cut and a deferral **look identical in a list**, and someone will eventually try to build a
cut one.

| Cut | Why it can never be built as designed |
| --- | --- |
| **Crew-load bars** | `tasks` has **no hours column**. Showing worked hours as "booked" would be the on-site-badge class of lie. **Dropped, not faked.** |
| **The Coverage check** | **No link exists** between scope sections and line-item categories — no FK, no shared key. The only match is free-typed strings against free-typed strings. **Ruled: do not build as designed** — it would produce confident wrong answers. |
| **Company By-crew / Gantt** | The Gantt is project-level only; the company schedule is calendar-only. No backing machinery. |
| **"Resumes when permit clears"** | **No `hold_reason` column exists** anywhere. |

⚠️ **These need a "will not build" marker, not a queue position.**

> ⛔ **WILL NOT BUILD — MARKED [register-batch2, 2026-09-01].** All four are permanent cuts, not
> deferrals. Premises re-verified against the tree: `tasks` has no hours column
> (`20260704213000_module5_5b_tasks_scheduling.sql:63-101`); no scope↔category link exists; the Gantt
> is project-level only; `hold_reason` appears in no migration. **The redesign spec already carries the
> ⛔ markers** — `desktop-redesign-spec.md:1063` (Coverage check), `:1212` (Crew-load bars), `:1213`
> (Company Gantt/By-crew), `:1214` ("Resumes when permit clears"), each tagged `[register-backlog
> §1.3]`. This register entry now matches. A cut is not a queue position; do not build any of these.

### L5 — Two step-9 deferrals never reached the register
- **"Send me a test"** on the estimate send flow — **not built.** ("Mark as sent" is.)
- **Deep-linkable estimate tabs** — tab state is a client `useState`, not a URL param. Making them
  linkable is **a change, not a restyle**, and was left for a ruling.

### L6 — The `m-capture` fixture-backed e2e is owed
⚠️ **CC did the right thing:** no e2e drives the expense capture form at all, so rather than ship a
vacuous green it **recorded the fact and filed the test as owed** in the PO spec §9. **Owed, and not in
this register until now.**

### L7 — The `FrameFocus-work` worktree
Josh: *"then get me off of it."* The plan was to remove it once `feature/po-module` merged. **It merged.**
⚠️ **Two stray downloads landed in the wrong worktree in a single day** — including the redesign spec
itself, under a renamed filename.

### L8 — The staging question, raised and dropped
Josh asked whether the PO module *"should be pushed on main."* The answer given: **`main` IS production —
merging is deploying** — and that a staging environment would give somewhere to click through before
customers see it, but **that is a change to how the project ships**, not a fault in that push.

⚠️ **Never revisited.** It is a real question, and **§K3 — forty screens and nine production migrations
never clicked — is what it looks like when the answer stays "no."**

---

## M — ⚠️ THIRD-PASS AUDIT — everything raised since the legal documents

**Fourteen items, none previously recorded.** They came out of the pricing, storage-cost, AI-tagging and
public-site conversation. ⚠️ **Two of them make the published legal documents inaccurate**, so they are
first.

---

### ⚠️ M1 — THE PRIVACY POLICY AND TERMS BOTH LEAN ON AN EXPORT THAT IS PARTLY BROKEN

**The documents say:** *"You can export your data at any time while your account is active"* (privacy),
and the terms' §4 repeats it. **The retention warning emails lean on it harder still** — *"you cannot
export while locked"* only stands as fair warning if the export was real **beforehand.**

**The deletion-sweep analysis found it is not:**
- ⚠️ **`export-categories.ts` names three tables that DO NOT EXIST** — `estimate_items`, `time_entries`,
  `timesheets`. `readTable()` **throws** on an unknown table, so **selecting the Estimates or Time
  category fails the export job at runtime.** Only `contacts` was ever live-tested.
- ⚠️ **The entire Module 7 financial record is missing from the export** — invoices, client payments,
  expenses, purchase orders, subcontractor contracts, lien releases, selections, safety incidents.
  **The export a contractor needs for taxes omits exactly those records.**

**Ruled into the deletion-sweep build (Q7).** Recorded here because **the legal documents cannot be
published until it is true.**

### ⚠️ M2 — The documents need updating before they go live

Beyond M1, this conversation changed facts the documents describe:

| Change | What the documents must say |
| --- | --- |
| **Plan storage caps** (50/120/500 GB) | The terms describe a subscription with no mention of limits |
| **AI photo tagging: 1,500/month, hard cap** | Neither document mentions the add-on's limit |
| ⚠️ **Trash still occupies storage** | A file in trash counts against the cap; **permanent delete is an Owner/Admin action** |
| **Trash auto-purges at 6 months** | A retention behaviour the privacy policy does not state |
| **Project ZIP download** | Strengthens the export claim — say it plainly |
| ⚠️ **The trial does NOT auto-convert** | The terms describe trials but do not say the customer must **intentionally** choose to continue. **This is a promise worth making explicitly** — it is a differentiator and it protects you. |

---

## The pricing change

### M3 — New pricing, and it replaces what ships today
**$50 / $100 / $200** · **3 / 7 / 20** team members · **50 / 120 / 500 GB** · **client portal on
Professional and Business.** No paying customers, so no migration.

⚠️ **Four things come OFF the plans, and one is worse than the others:**
- **AI estimates** — not built at all.
- ⚠️ **Workflow automations** — **nobody can say what they were.** A plan listing a feature that cannot
  be described is selling nothing.
- **Client portal branding ($19)** — already ruled **no charge**; the gate does not exist.
- **Extra storage ($15)** — does not exist, and storage was never measured.
- **QuickBooks "Included"** — ⚠️ **not built.** 7G is in spec.

### M4 — AI photo tagging: finalise and activate
**$20/month · 1,500 photos · hard cap · resets monthly.** *(Was $29 and unlimited on the old Billing
page.)*

**Costed from the code and current OpenAI pricing:** `gpt-4o`, $2.50/$10 per million tokens. A phone
photo is ~765 image tokens plus the tag-list prompt — **about a third of a cent per photo.** At the cap
that is ~$4.50 in tokens plus egress, **roughly 4× margin.**

**What exists:** `autoTagFile()` and `companies.ai_tagging_enabled`.
**What does not:** a counter, the cap, the cap message, and the $20 price.

⚠️ **RULED: hard cap, no overage.** Metering into Stripe usage records is real work and 1,500 covers a
contractor shooting 30 photos a day twice over. **If someone genuinely hits it regularly, that is the
signal to build overage** — with a real customer asking, not speculative machinery.
⚠️ **At the cap, uploads still work; the photos just arrive untagged. The message must say so** rather
than reading as a failure.

> ⚠️ **M4a — `gpt-4o` is two generations behind and kept for ONE reason: GPT-4.1 has no vision
> support.** Fine today. **A model this old will eventually be deprecated** — and the file's own comment
> already says *"VERIFY before public launch and any time OpenAI publishes a price change."* **Make that
> a standing item, not a comment.**

---

## Storage — the cap, and the thing that breaks it

### M5 — Storage caps must actually be enforced
⚠️ **Storage was audited as "never measured — display only."** The Billing page shows "2.4 GB of 100 GB"
against nothing.

**The shape: warn at 80% and 95%, block NEW UPLOADS at 100%.** ⚠️ **Never delete automatically, and
never block anything else** — a contractor at cap can still invoice, schedule and run their jobs. **Only
uploads stop.**

### ⚠️ M6 — Soft-deleted files still occupy storage, which breaks "delete to free space"
**A file in trash still holds its bytes.** So a contractor at cap who deletes photos to make room
**frees nothing**, and permanent delete is a **manual Owner/Admin action per file.**

**Ruled:**
- **The limit screen states that trash must be emptied by an Owner or Admin for space to return**, and
  **offers Empty Trash as the action.**
- **Trash auto-purges at 6 months.**

### M7 — Project ZIP download
**Everything, separated into folders.** ⚠️ **This is what makes the cap humane** — download the project,
then delete it.

Two cautions: **it reads every file, so a 500 MB project is 500 MB of egress per download**; and
**generating it cannot happen in a normal request** — it needs a background job and a link when ready.

### M8 — ⚠️ The photo gallery serves FULL-SIZE images
**Josh: "that was the intention from the beginning."** A 34-photo gallery is **~100 MB per load.**
Thumbnails cut it by an order of magnitude.

⚠️ **Egress is the meter that moves on Supabase** — $0.09/GB uncached — **not storage**, which is
$0.021/GB/month. **This is the single largest cost lever in the product.**

---

## The public site

### M9 — Four public routes, none of which exist
`/` · `/pricing` · `/terms` · `/privacy`. **Spec and prompt written** —
`docs/specs/public-site-spec.md`.

⚠️ **These are the first unauthenticated routes in the product.** Every other route is behind sign-in,
and the middleware and layouts assume a session.

### M10 — ⚠️ The pages must not go live before the deletion sweep ships
The privacy policy says data is **permanently deleted** after the 14/90-day windows. **That is only true
once the sweep is scheduled.** Publishing first repeats the exact failure this project already caught —
Billing shipping copy that promised 90-day retention nothing implemented.

### M11 — Trial behaviour, ruled and possibly a behaviour change
**A card is required to start a trial. The trial does NOT auto-convert** — at the end the customer must
**intentionally choose to continue and pick a plan.** They are **not** silently charged.

⚠️ **If Stripe is configured today with a trial that rolls into a subscription, this is a behaviour
change, not a page.** Filed as the public-site spec's §S4.

### M12 — One source for plan definitions
⚠️ **The pricing page and the in-app Billing page must read the SAME source**, or they drift the first
time a price changes. **Two pages showing different prices is what a customer screenshots.**

---

## Intuit, and one thing tabled

### M13 — Intuit production review needs three working URLs
The **Launch**, **Disconnect** and **Connect/Reconnect** URLs are required for production approval, and
**Intuit's reviewers will click them.** They point at the dashboard and the Settings Accounting tab.
⚠️ **Do not submit for review until 7G's OAuth flow actually works** — the links must do something.

**Also required and now drafted:** the EULA and privacy policy URLs. **This is what forced the legal
documents**, and sandbox keys are gated behind them.

### M14 — Deleting completed projects after 12 months: ⚠️ TABLED
Josh raised it as a storage-cost control and **tabled it after the numbers came in.**

**Recorded so it is not revived without the reasoning:** storage is **not** the cost driver — a
contractor's whole year of photos costs about **$0.43/month**. And the published privacy policy says
*"Construction records outlive the job — nothing is deleted just because a job finished."* ⚠️ **Deleting
at 12 months would contradict a legally-reviewed document and take away the thing contractors need this
for.** Warranties, liens and disputes surface years later.

---

## N — ⚠️ THE QUICKBOOKS CRITICAL PATH

**Everything between here and a working 7G, in required order.** ⚠️ **Several items elsewhere in this
register are NOT on it** — the homepage, thumbnails, A21, the event log, `16c` — and putting them in
the way of QuickBooks would be a mistake.

### The chain

> **N1 sweep scheduled → N2 trial + seats settled → N3 documents updated ONCE → N4 legal routes
> published → N5 Intuit sandbox keys → N6 build 7G → N7 Intuit production review**

⚠️ **The actual gate is N4.** **Intuit will not release sandbox keys without live EULA and privacy
URLs** — that is the only reason those documents were written at all.

---

### N1 — The deletion sweep's `vercel.json` line ⏳ *in flight*
Q8's chain: **#126 verified ✓ · warnings shipped and live ✓ · dry run reviewed and CLEAN ✓** —
production returned `{"dryRun":true,"due":[]}`, so **nothing is past its `delete_after`** and there is no
past-due-and-unwarned company. **The line is ruled; CC is adding it with the S157 inversion of `s137`
test 20.**

⚠️ **Until it lands, the privacy policy's *"permanently deleted"* sentence is a promise, not a fact.**

### ⚠️ N1b — THE STRIPE PRICE OBJECTS MUST BE RECREATED — **blocks QuickBooks**
**Found in the public-site Phase 2 analysis, and it would have shipped a customer being overcharged.**

⚠️ **The catalog number is DISPLAY ONLY.** The amount actually charged is the **Stripe Price object**,
read from `STRIPE_PRICE_*` env vars. **Changing `plan-catalog.ts` to $50 / $100 / $200 changes the page
and nothing else — a real checkout still charges $79 / $149 / $249.**

**A customer paying more than the page advertised is not a bug to find later.**

**Owed:** create new Stripe Price objects at the ruled amounts, update the env vars, and **verify a real
checkout charges the advertised number.**

⚠️ **It blocks QuickBooks because it blocks publishing.** The pricing page cannot go live showing a
number the checkout will not honour, and **`/pricing` ships with `/terms` and `/privacy`** — which are
the Intuit gate.

### N1c — Seat limits: enforced, but the numbers disagree
✅ **Seats ARE enforced** — `seats.ts` reads `subscription.seat_limit` and blocks invites past it, set
from the catalog at checkout. **So N2's second question is answered: enforcement exists.**

⚠️ **But two numbers must move together or the page lies:** the **catalog** (currently 2 / 5 / 15 →
ruled **3 / 7 / 20**) **and the trial default `seat_limit = 2` set in the trigger.** Otherwise **a
trialing Starter can invite 2 while the page says 3.**

### N2 — Two facts the documents depend on ❌ *not started*
⚠️ **Both must be settled BEFORE the documents are written, or they get revised after publication —
which is exactly what Josh ruled against.**

- ✅ **Trial auto-convert: ANSWERED, and the premise was inverted.** ⚠️ **No card is taken at signup
  today** — a trial is a **DB-only row** with no Stripe customer and no subscription, so **nothing can
  auto-charge because there is nothing to charge.** At day 30 a cron locks the account and starts the
  14-day clock.
  ⚠️ **BUT Josh has now ruled a card IS required at signup** — *"that will weed out time wasters."*
  **That is a genuine payment-integration build** (Stripe customer + SetupIntent, stored not charged),
  **and it makes the conversion-approval ruling matter again:** once a card is on file, *"nothing is
  charged without approval"* stops being trivially true and becomes **a promise the code must keep.**
- ✅ **Seat enforcement: ANSWERED — seats ARE enforced.** See **N1c** for what still has to change.

### N3 — Update the legal documents ONCE, completely ❌ *not started*
**Both are written, legally reviewed and dated** — `docs/specs/terms-of-service.md` and
`privacy-policy.md`. **The storage build made most of their claims true.** What still needs writing in:

| Change | Now true? |
| --- | --- |
| Plan storage caps (50 / 120 / 500 GB) | ✅ enforced |
| Trash still occupies storage; **permanent delete is Owner/Admin** | ✅ built |
| Trash auto-purges at 6 months | ✅ scheduled |
| Project ZIP archive | ✅ built |
| AI tagging cap (1,500/month) | ✅ built |
| The export being real | ✅ fixed (sweep Q7) |
| **Permanent deletion after 14/90 days** | ⏳ **N1** |
| **The trial does not auto-convert** | ⏳ **N2** |

⚠️ **Do not write them until N1 and N2 land.** Josh: *"I don't want fast, I want everything built
correctly and ready — this prevents patching and revising documents."*

### N4 — Publish `/terms` and `/privacy` ❌ *not started*
⚠️ **THE GATE.** Prompt written and unrun: `docs/prompts/cc-public-site-prompt.md`.

**Only two of its four routes are required for Intuit.** The homepage and pricing page are the same
build but **are not on this critical path** — they can follow.

⚠️ **These are the first unauthenticated routes in the product.** Middleware and layouts all assume a
session (spec §S6).

### N5 — Intuit sandbox keys ❌ *blocked on N4*
The developer account exists and an app is created. **Keys are behind the EULA and privacy URLs.**
**Development keys work only with sandbox companies.**

### N6 — Build 7G ❌ *blocked on N5*
Spec and prompt written: `docs/specs/7g-quickbooks-spec.md`, `docs/prompts/cc-7g-quickbooks-prompt.md`.
**Nine `§S` blocks** CC fills from the tree **and the sandbox.**

⚠️ **The rule that governs it: an API shape recalled rather than read is the likeliest way this ships
wrong**, and it will not surface until a real push fails against a real company. **Nothing may be
asserted against a mocked response not seen from the sandbox at least once.**

**Ruled and not to be re-opened:** only **purchases (expense)** and **invoice payments (income)** push —
⚠️ **committed cost NEVER pushes** · **tokens readable by nobody**, service-role only, with a separate
readable status flag · **queued, not synchronous** · **a failed push leaves the expense APPROVED**,
notifies, and offers retry · **catalog type wins, cost category is the fallback** · **the payment
account is chosen at REVIEW.**

**Payroll is investigate-first (§S8)** — Josh is on QuickBooks Payroll with employees set up; whether
hours can be pushed and what stays manual is a sandbox fact, not a design decision.

### N7 — Intuit production review ❌ *blocked on N6*
Required before connecting **real** QuickBooks companies. Free; it takes time.

⚠️ **It needs three working URLs — Launch, Disconnect, Connect/Reconnect — and reviewers will click
them.** They point at the dashboard and the Settings Accounting tab. **Do not submit until 7G's OAuth
flow actually works.**

---

## O — ⚠️ FOURTH-PASS AUDIT — the email findings

**Two live problems found this session, neither previously recorded.**

### O1 — ⚠️ The test harness has been sending REAL email through a live key
**423 real Resend sends since July 14, up to 78 in a day**, in bursts tracking test-battery runs.
**Still sending.**

**~368 landed in Josh's inbox** via plus-addressed QA identities (`josh+qa-admin@`, `josh+pm@`,
`josh+test50@`, `josh+e2econfirm@`). **No real client or subcontractor received anything** — but
⚠️ **52 sends bounced at `qa-client-a@example.invalid`, a reserved TLD that can never resolve.**

**Not a loop, cron, trigger or retry.** Every email is a distinct event a test created on purpose:
`safety_incident` (133 — one test files real injury incidents, and the route fans out to **every
supervisor above the submitter**, so 3 emails per incident) · `material_delivery` (86) ·
`co_signature_complete` (~106).

**Why it delivers:** ⚠️ **`sendEmail()` has NO environment guard of any kind**, and the test env holds
the **live, all-domains Resend key** — via `.env.local` **and a personal Codespaces secret that
overrides the shell env and returns after every rebuild.** That is the same mechanism that has now
caused three separate incidents in this project.

**S126 already recorded the rule** — *"the transport is stubbed… a test that really sent would put mail
in a person's inbox on every run"* — ⚠️ **but it is convention only, and Playwright drives the real dev
server where nothing can be stubbed.**

**RULED [Josh]: options 1 AND 2 together.**
1. ⚠️ **An explicit send-allowed gate inside `sendEmail()`** — one choke point, covers e2e. **It must
   fail LOUD**: a mis-set flag in production that silently kills all mail is worse than the current
   problem, because **the retention warnings are the only channel that reaches a locked customer.**
2. **Replace or remove the live key in the test env.** ⚠️ **Alongside, not instead of** — that control
   has already failed twice by the same mechanism.

**Rejected: option 3** (making QA identities undeliverable) — they are deliverable because **magic-link
sign-in needs them.**

### O2 — ⚠️ Gmail is filtering this mail as SPAM, and it is not an auth problem
**SPF PASS · DKIM PASS · DMARC PASS · TLS · correct `mailed-by` and `signed-by`.** ⚠️ **Authentication
is not the cause**, which is what makes this a real problem rather than a DNS fix.

**The leading hypothesis is O1's volume**, and it reads like a textbook filter trigger: **a 26-day-old
domain** · **423 sends in six weeks** · **52 bounces at a reserved TLD** · **most to plus-addresses of a
single mailbox that never opens or replies** · **repetitive machine-string subjects**
(*"Change order CO-QA-M9-SIGN-1788125799165 signed"*).

⚠️ **Also to check before blaming Gmail: Resend suppression.** A bounced address gets suppressed, and
**suppressed mail never sends — which looks identical to Gmail refusing it.**

⚠️ **And the recovery is NOT the same as the fix.** Stopping the sends is necessary; **reputation
returning is a matter of time and clean sending**, on a different timescale. **Do not conflate them.**

**Diagnosis prompt written and running.**

### O3 — Unsubscribe headers, and where they must NOT go
⚠️ **Gmail's bulk-sender rules make one-click unsubscribe mandatory above their threshold, and its
absence contributes to spam placement below it.** **No message currently sets `List-Unsubscribe`.**

⚠️ **But a blanket header is the wrong answer**, and it needs a per-type ruling:

| Class | Rule |
| --- | --- |
| **Transactional — NO unsubscribe** | ⚠️ **A recipient cannot opt out of being told their contract was signed.** Offering it would let someone unsubscribe from documents they need. |
| **Recurring — REQUIRED** | Payment reminders, proposal reminders, notification digests. |
| ⚠️ **Retention warnings — RULE EXPLICITLY** | Recurring platform mail, so it would normally apply — **but it is the ONLY channel telling someone their data is about to be permanently deleted.** |

⚠️ **There is no `notification_preferences` table** — per-type routing was scoped and deferred — so
**what an unsubscribe would even unsubscribe FROM is an open question.** And **one-click unsubscribe
needs an endpoint that works without a session**, which is exactly where the warning emails' resubscribe
link already bit.

### O4 — The tenant/platform Reply-To boundary, confirmed and worth keeping
**Platform mail** uses `SUPPORT_REPLY_TO = ezcontractorbinder@gmail.com`. **Tenant-facing mail** keeps
resolving Reply-To to the company via `resolveCompanyReplyTo()`.

⚠️ **This was nearly changed by mistake.** A change-order signature notice looked wrong only because
Bishop Contracting is a test fixture and Josh was the recipient — **in production, a homeowner replying
about their change order must reach their BUILDER, not the platform's support inbox.**

### O5 — `CRON_SECRET` was rotated
The old value could not be read back from Vercel. **Production redeployed with the new one.** It was
**not** in `.env.local`, so nothing local depended on it. ⚠️ **Recorded because a rotated shared secret
is exactly what confuses the next debugging session.**

### O6 — `desktop-payload` #117 PM-CO: a THIRD sighting
Failed in-shard, then **8/8 green in isolation on identical data**, for the third battery running.
**Classified cross-suite contamination.** ⚠️ **The contaminating shard-neighbour should be identified
ONCE rather than re-diagnosed every battery** — a flaky live battery stops being a usable signal, which
is how a genuine regression gets waved through as "probably the flake."

### O7 — Two policy findings from the storage build, worth keeping
- ⚠️ **`ai_tag_logs` SELECT is Owner/Admin-only** — a client-side quota count **would have read ZERO for
  crew**, who are the heaviest uploaders, and **the cap would silently never have fired.** Hence the
  SECURITY DEFINER counter. **A bug that produces no error and no red test.**
- ⚠️ **`subscriptions_select_owner_admin` is MISNAMED** — its clause is company-only with **no role
  arm**, which is precisely what lets every role read `plan_tier` for the cap check. **A correctly-named
  policy would have broken the build.**

### O8 — The DMARC `rua` still points at `josh@worthprop.com`
Was filed as `#1-delsweep`. ⚠️ **Its own fine print matters: neither destination publishes the RFC 7489
authorization record**, so **the closing evidence after the TXT edit is seeing an aggregate report
actually land** — not the DNS change itself.

> **[S179] Reclassified as owed work — it lives on THIS register (here + §Q3), not `TECH_DEBT.md`.**
> The fix is one TXT DNS edit Josh controls. ✅ **The contradiction with §Q3 is RESOLVED [Josh, S179]:
> the `#1-delsweep` analysis wins.** A `gmail.com` `rua` **does not work** — RFC 7489 needs
> `ezcontractorbinder.com._report._dmarc.gmail.com`, which cannot be published, so **no reports arrive
> either way.** §Q3's "repoint to Gmail" ruling was made without that fact and is **overturned** (see
> §Q3, quoted-and-superseded). **The ruling that stands:** publish the authorization record at
> `worthprop.com` (Option 1, one TXT Josh controls). ⚠️ **Closing evidence is a report LANDING, not
> the DNS edit.**

#### ⚠️ THE EXACT RECORD TO PUBLISH — verified against RFC 7489 §7.1, not reconstructed from memory

**Live state, confirmed [S179, 2026-09-01] by DoH lookup:** `_dmarc.ezcontractorbinder.com` reads
`v=DMARC1; p=none; rua=mailto:josh@worthprop.com` (the cross-domain `rua` is still there), and
`ezcontractorbinder.com._report._dmarc.worthprop.com` returns **NOERROR with no answer — i.e. the
authorization record is NOT published.** So the fix is still owed and nothing has changed under it.

**Why this record.** The `rua` on `_dmarc.ezcontractorbinder.com` points at `josh@worthprop.com`.
Because the destination host (`worthprop.com`) differs from the policy domain (`ezcontractorbinder.com`),
RFC 7489 §7.1 makes a receiver verify an **External Destination** authorization record before it will
send any aggregate report. Construction (§7.1, verbatim): _"Prepend the string `_report._dmarc`. Prepend
the domain name from which the policy was retrieved…"_ → `[policy-domain]._report._dmarc.[destination]`.
RFC worked example: a policy at `blue.example.com` with `rua=mailto:reports@red.example.net` is verified
by a TXT query for **`blue.example.com._report._dmarc.red.example.net`** carrying **`v=DMARC1`**.

**Applied to us — publish ONE TXT record in the `worthprop.com` zone:**

| Field | Value |
| --- | --- |
| **Zone (where it is published)** | `worthprop.com` — the **destination** domain, NOT `ezcontractorbinder.com` |
| **Full record name (FQDN)** | `ezcontractorbinder.com._report._dmarc.worthprop.com` |
| **"Host" / "Name" field** | `ezcontractorbinder.com._report._dmarc` (most editors append the `.worthprop.com` zone automatically — do **not** type the zone twice; if your editor wants the FQDN, use the full name above) |
| **Type** | `TXT` |
| **Value / Content** | `v=DMARC1` |
| **TTL** | default is fine (e.g. 3600) |

> ⚠️ **WHERE this is edited — verified live [S179, 2026-09-01], and it is probably NOT Spaceship.** A
> DoH lookup shows `worthprop.com`'s SOA nameserver is **`ns1.vercel-dns.com`** (`hostmaster.nsone.net`),
> i.e. **`worthprop.com`'s DNS is delegated to Vercel/NS1.** Spaceship may be the *registrar*, but the
> live zone is served by Vercel — so this record is added **wherever `worthprop.com`'s zone is actually
> edited (the Vercel dashboard, if the nameservers are `*.vercel-dns.com`), not necessarily Spaceship.**
> _Superseded assumption, quoted not deleted: the `#1-delsweep` entry and the S179 brief both described
> this as "a Spaceship DNS change."_ **The record name and value are RFC-verified and correct on any
> provider; only the paste location changes.** (`ezcontractorbinder.com` — where the `rua` lives — is
> the Spaceship domain; that is a different zone and is not touched by this fix.)

⚠️ **Two things that silently break it:**
1. **The name is literal — the `.com` in `ezcontractorbinder.com` stays.** The label is
   `ezcontractorbinder.com._report._dmarc`, NOT `ezcontractorbinder._report._dmarc`. RFC 7489 prepends
   the whole policy domain, dots included.
2. **The value is exactly `v=DMARC1` and nothing else** — no `p=`, no `rua=`. It is an authorization
   flag, not a policy. If Spaceship's editor requires quoting, `"v=DMARC1"` is equivalent; enter it
   however Spaceship formats other TXT records in that zone.

**This authorizes the `rua` where it already is; it does NOT move it.** `josh@worthprop.com` keeps
receiving. If Josh later wants the WorthProp string gone entirely, that is the separate same-domain
option (`rua=mailto:dmarc@ezcontractorbinder.com` + an inbox/forwarder on the send-only domain) — more
work, out of scope for closing this.

⚠️ **CLOSING EVIDENCE — the record is not the finish line.** Publishing the TXT record only makes
delivery *permitted*. **Close this ONLY when an aggregate report has actually LANDED in the
`josh@worthprop.com` inbox** (Gmail/large receivers send these ~daily as gzipped XML attachments).
**A published record that still delivers nothing is the same problem wearing a tick** — verify the
report, not the DNS edit. If none arrives within ~72h, re-check the record name for trap #1 above and
confirm `_dmarc.ezcontractorbinder.com` still carries a `rua=`.

---

## P — ⚠️ THE DELETION SWEEP: WHAT IS STILL OWED

**The sweep is built, tested and merged to local `main` — and it is NOT live.** Everything below stands
between here and it actually running.

⚠️ **This section exists because the sweep is the one piece of work in the product that permanently
destroys customer data on a timer.** A half-finished deployment of it is worse than none.

---

### P1 — ⚠️ Nothing is pushed. Everything is local.
13 commits sit on local `main`: the whole email fix **and** the `vercel.json` deletion-cron entry at
**15:00 UTC daily**.

⚠️ **A Codespace rebuild takes the local repo with it — that has already happened twice today.**
**Push to a non-deploying backup ref first** (`backup/pre-email-deploy`), because pushing `main`
deploys, and this merge is not ready to deploy in one step. See P2.

### P2 — ⚠️ The migration must go to production BEFORE the code
`20261060000000_email_unsubscribes.sql` is on rebuild-test only.

**The unsubscribe endpoint and the send gate both read that table.** ⚠️ **Deploying the code first
means a live route querying a table production does not have.**

**Order: link to production → `db push --dry-run` → `db push` → re-link to rebuild-test → push `main`.**

### P3 — ⚠️ Pushing `main` SCHEDULES PERMANENT DELETION
The `vercel.json` entry goes live the moment `main` deploys. From then on, **every day at 15:00 UTC,
companies past their `delete_after` are permanently deleted.**

**What makes that safe today, and it should be re-checked at the moment of the push:**
- **The dry run was CLEAN** — production returned `{"dryRun":true,"due":[]}`, so **nothing was past
  `delete_after`** and there was **no past-due-and-unwarned company.**
- ⚠️ **That was true when it was run. Re-run it immediately before pushing** — the curl is
  `GET /api/cron/trial-deletion?dry_run=1` with `Authorization: Bearer $CRON_SECRET`, and **`?dry_run=1`
  is the only thing between a read and a real sweep.** Confirm the response begins `"dryRun": true`.
- **`feature/dry-run-warnings` is merged**, so the dry run now also reports `lockedAt`, `daysPastDue`
  and both warning stamps — **it answers a review by itself.**

### P4 — The Resend webhook must be registered
⚠️ **The webhook was never configured in Resend at all** — no endpoint, no secret, which is why
`delivered_at`/`opened_at`/`bounced_at` are **zero across all 1,105 rows.** The route is now built.

**Until the URL and signing secret are registered in the Resend dashboard, the platform stays blind to
its own bounces** — including ⚠️ **a bounced retention warning, which means a customer is deleted having
been told nothing.**

**This is a dashboard action, not a deploy. It is Josh's.**

### P5 — The live Resend key must leave the test environment
**The gate (`a0596db`) is the control that does not depend on env hygiene** — it refuses **before**
`getResend()`, so a refusal is identical with or without a key.

⚠️ **But 1b is still owed and it is Josh's alone:** `.env.local` is permission-blocked to CC, and the
**personal Codespaces secret returns after every rebuild** (context87). **That mechanism has now caused
three separate incidents.**

### P6 — Warning coverage has not elapsed
The warnings cron went live only recently. ⚠️ **A company that locks today gets its full sequence; the
concern was only ever an already-locked company**, and **the dry run showed none.**

**Re-confirm at push time (P3), not by memory.**

---

## ⚠️ P7 — WHAT "DONE" MEANS HERE, AND WHAT IT DOES NOT

**Scheduling the sweep makes the privacy policy's *"permanently deleted"* sentence TRUE.** That was the
point — it is **N1 on the QuickBooks critical path**, and the legal documents cannot be published until
it lands.

⚠️ **But it does not make the documents publishable on its own.** **N2 still stands:** the trial
auto-convert question and seat enforcement both go into the text, and Josh ruled the documents get
written **once, completely** — *"I don't want fast, I want everything built correctly and ready; this
prevents patching and revising documents."*

---

## Q — ⚠️ FIFTH-PASS: findings from the email fix build

**Four items. The first is the one with reach beyond its own build.**

---

### ⚠️ Q1 — Vitest was running a SHARED PROCESS POOL, so `process.env` bled between test files
**This is not an email finding. It is a test-infrastructure finding, and it is retroactive.**

The send gate looked like it was not firing. The cause: vitest's default pool **shares processes across
files**, so **one file's `process.env` mutation was visible to another.** Fixed with `pool: 'forks'`,
which isolates per file.

⚠️ **The consequence nobody has audited: ANY prior test that asserted on an environment variable may
have been reading another file's value.** A test that passed may have passed for the wrong reason, and
a test that was quietly disabled by a neighbour's env would look identical to one that never ran.

**This belongs with the vacuity-trap family** — nine caught in this project, all of the same shape: an
assertion that appears green while asserting nothing.

**Owed: a sweep of every test touching `process.env`, re-run under `forks`, checking each still passes
for the reason it claims to.**

> ✅ **DONE [S180].** Swept: 12 files touch `process.env` (9 save/restore, 3 mutate constants only —
> all fork-safe). The 6 env-touching UNIT files were each re-run in isolation under forks and each
> passes on its own with a real, non-zero tally (45 assertions total) — so none was passing on a
> neighbour's leaked value. The 6 env-touching `.live.ts` files save/restore and run env-gated in the
> live battery. No vacuity found; the forks fix holds. See `register-closeout-log.md`.

### Q2 — The Resend webhook is built but NOT REGISTERED
⚠️ **It was never configured in Resend at all** — no endpoint, no secret — which is why
`delivered_at` / `opened_at` / `bounced_at` are **zero across all 1,105 rows.** The route now exists and
verifies the signature.

**Until the URL and signing secret are entered in the Resend dashboard, the platform stays blind to its
own bounces** — including ⚠️ **a bounced retention warning, which means a customer is deleted having
been told nothing.**

**A dashboard action, not a deploy. Josh's.** *(Also tracked at §P4.)*

### Q3 — The DMARC `rua` repoint — ⚠️ OVERTURNED [Josh, S179]: a Gmail `rua` does not work
> ⚠️ **SUPERSEDED — quoted, not deleted.** _Original ruling: **"Ruled: repoint `rua` to
> `ezcontractorbinder@gmail.com`.** ⚠️ **The RFC 7489 authorization record cannot be published at
> `gmail.com`** — so this does not make it same-domain and **it does not technically fix the
> authorization gap.** It is the pragmatic choice; the alternative needs a record at `worthprop.com`."_

**⚠️ OVERTURNED [Josh, S179] — the `#1-delsweep` analysis wins.** The original ruling was made without
one fact: **repointing `rua` to a Gmail address does not merely "not technically fix the gap" — it
means NO REPORTS ARRIVE AT ALL.** RFC 7489 §7.1 requires a cross-domain `rua` to be authorized by a
`ezcontractorbinder.com._report._dmarc.gmail.com` TXT record, and **nobody can publish under
`gmail.com`** — so every conforming reporter (Gmail included) sends nothing. The "pragmatic choice"
delivers zero aggregate reports, which is the same blind state the entry exists to end.

**The ruling that stands (`#1-delsweep` Option 1):** publish the authorization record at `worthprop.com`
— one TXT, `ezcontractorbinder.com._report._dmarc.worthprop.com = v=DMARC1`, a domain Josh already
controls — keeping the `rua` where it is and making cross-domain delivery spec-compliant. (The cleaner
long-term form is a same-domain `rua` on `ezcontractorbinder.com` that forwards, but that costs standing
up an inbox on the send-only domain first.)

⚠️ **The closing evidence is an aggregate report actually LANDING — not the TXT edit.** A Spaceship DNS
change, Josh's. *(`#1-delsweep`; see §O8.)*

### ⚠️ Q4 — The safety-incident fan-out: genuine debt, `TECH_DEBT.md` #156, deliberately NOT fixed
`app/api/safety-incidents/route.ts:141` notifies **every supervisor above the submitter**
(`computeIncidentRecipients`, `lib/services/incident-notify.ts:93`) — **three emails per incident in a
four-person fixture**, and it is **the single largest contributor** to the 442 harness sends.

⚠️ **It was left alone on purpose: who gets told about an injury is a SAFETY decision, not an email
one.** The send gate now hides the symptom, which is exactly why this must not be forgotten — **on a
real twenty-person company the fan-out is far larger, and nobody has ruled that it should be.**

> **[S179] This is genuine debt (a deferred decision), so it STAYS in `TECH_DEBT.md` — now #156.**
> ⚠️ **Id correction:** it was filed under the provisional id `#1-email`, *not* `#3-email` as some
> notes said; converted to real number **#156** at S179. This register entry is the cross-reference,
> not a second filing.

---

## R — ⚠️ SIXTH-PASS: findings from the public-site analysis

### ⚠️ R1 — The legal documents were NEVER PUT IN THE REPO
**`docs/specs/terms-of-service.md` and `privacy-policy.md` do not exist** — not in the tree, not in
history, not on any branch. **CC searched.**

They were written, legally reviewed, dated and revised **entirely as chat artifacts**, and **nobody ever
downloaded them.** ⚠️ **Every prompt that says "render them verbatim" was pointing at nothing.**

**They must be pasted into the repo before `/terms` and `/privacy` can be built** — and those two routes
are **the Intuit gate.**

⚠️ **The lesson is the same one that has bitten repeatedly this session: a document that exists only in
a chat window does not exist.**

### R2 — Card at signup: ruled IN, and it is a real build
⚠️ **The premise was inverted.** No card is taken today; a trial is a **DB-only row** with no Stripe
customer. **Nothing can auto-charge because there is nothing to charge.**

**RULED [Josh]: require a card anyway** — *"that will weed out time wasters."*

**That is a payment-integration build**: a Stripe customer plus a **SetupIntent** at signup, **stored,
not charged.** ⚠️ **And it revives the conversion-approval requirement** — with a card on file,
*"nothing is charged without approval"* stops being trivially true.

### R3 — The fixture rename: 73 references, and an upstream nobody can find
**RULED: rename to `Sabal Point Construction`.**

⚠️ **73 occurrences across ~45 test and e2e files**, plus a live DB rename on rebuild-test, the seed
constant, and an **email From-header assertion** (`email-unsubscribe.live.ts:185`).

**A mitigating detail:** most are `.eq('name', …).single()`, which **throws** on a miss rather than
passing silently — so a missed reference goes **red**, not green-against-nothing. **Prove it with the
battery regardless.**

⚠️ **The unresolved part: the company row originates from an import OUTSIDE the seed script** —
`seed-test-identities.mjs:188` looks it up by name and **throws if absent.** **CC could not locate the
upstream.** **A rebuild-test rebuild could resurrect "Bishop Contracting" unless that import is found
and changed.**

### R4 — Screenshot data sanitisation
**RULED: sanitise ALL ad-hoc rows** — the `test4` family, `af SAZF`, and **three real Florida
addresses** (Boynton Beach, Ft. Lauderdale, West Palm Beach). ⚠️ **QA-marker and S97 rows are
test-pinned and stay untouched.**

**Why all of them:** the dashboard lists every project, so *"Copy of Copy of test4"* would sit beside a
polished hero shot in the same screenshot.

⚠️ **Leave the QA email addresses alone** — Team and Contacts will not be captured.

### R5 — An obsolete duplicate of the plan constants
`packages/shared/constants/subscriptions.ts` still carries the **old prices and seats**, plus a dead
`aiEstimates` field. And `dashboard/billing/page.tsx:60-64` **hardcodes the price labels separately** —
⚠️ **that is the "three surfaces disagree" risk, already live.**

### R6 — Trial length duplicated across two migrations
`now() + INTERVAL '30 days'` appears in **both** `20260918000000:468` and `20261017000000:564`, with the
same `'starter', 'trialing', 2` defaults. ⚠️ **Change the trial length one day and it changes in one
place and not the other.**

> ✅ **[S179] Verified on the tree** — `20260918000000_trial_lifecycle.sql:468` and
> `20261017000000_m9_client_lifecycle.sql:564` both read `v_trial_end := now() + INTERVAL '30 days';`.
> Owed work: fold the literal into one shared default. Confirmed, not just remembered.

---

## S — SEVENTH-PASS [S179]: test-suite integrity, and two known states

> ⚠️ **Disambiguation:** K10's reference to "§S2" points at the **desktop-redesign spec's** §S2 (the
> navy background), NOT this section. The items below are S1–S4 of the register.
>
> **Why this pass exists.** The S179 debt/owed-work split (`TECH_DEBT.md` header) surfaced test-suite
> findings that are **owed work, not debt** — and two facts about the live environment that are
> **neither debt nor a task**, but must be written down so nobody rediscovers them the hard way.

### S1 — 279 skipped tests in the last full live battery
**Reported figure: 279 skipped in the last full live battery.** ⚠️ **Skipped tests are the quiet form
of a green suite that proves nothing** — a skip reads as a pass in every summary line. **Nobody has
established whether 279 is normal** (env-gated `.live.ts` harnesses that correctly no-op off
rebuild-test) or a pile of quietly-disabled coverage.

⚠️ **VERIFICATION UNKNOWN — recorded honestly.** This number comes from a battery run, not from the
tree; a docs-only pass cannot reproduce it without running the suite. **Owed:** run the battery, break
the 279 down by *reason* (env-gated vs `it.skip` vs `describe.skip`), and rule which are legitimate.
Pairs with §Q1 (the env-bleed sweep) and §O6 (the `desktop-payload #117` flake) — the same family:
a suite you cannot fully trust is not a signal.

> ⚠️ **[S180] BROKEN DOWN AGAINST THE TREE — and "279 in the live battery" does not survive it.** Full
> working: `register-closeout-log.md` → "Phase 3 continuation → 2.3". Summary:
> - **vitest `.live.ts` has 0 conditional skips**, and the S180 live run actually skipped **7**, not
>   279 — so 279/285 is a **Playwright** runtime number, not a live-battery one.
> - Verified census, whole tree: **0** hardcoded `describe.skip`/`it.skip`, **0** `skipIf`, **42**
>   Playwright `test.skip(true, 'no X on fixture')` **fixture-data guards** in the mobile specs
>   (`m-destinations`, `m-sections`, `m-details`, `m-photos`, …).
> - ⚠️ **The finding IS the fixture guards:** they green-out when rebuild-test lacks a row — phases,
>   change orders, punch, deliveries, documents, incidents, photos, subs, contacts, crew-visible
>   expenses. Exactly this section's "green when the fixture is empty" fear, and `m-details.spec.ts:322`
>   already warns of it in-file.
> - ⚠️ **Two mis-tellings corrected:** there is **no** `s136-email-and-debt.live.ts` (it is a git
>   branch; real s136 is `s136-company-slug.live.ts`); no `.live.ts` file has 264 tests (max 42); the
>   email `.live.ts` files **mock** Resend rather than self-skip on `RESEND_API_KEY`.
> - **Ruled [Josh, S180]: do NOT make them run — that is his call.** Whether to seed the fixtures (so
>   the guards cannot stand down) or to fail-instead-of-skip on absent data is owed to him. The exact
>   Playwright runtime tally is still owed on a quiet DB (not run: flaky, shared with a live session).

### S2 — `V1`'s 7I-toggle guard encodes a search-set judgement, and it is NOT the file list some notes claimed
**V1** (`apps/web/test/s156-m4-audit.live.ts:360-397`) pins 7I criterion 1 — *"toggle off ⇒ behaviour
byte-identical"* — by asserting that **nothing in the request-serving code reads the toggle.** It does
this by grepping for the only reader function, `clientContractAppliesToEstimate`, across a **fixed
search set**:

```
apps/web/app   apps/web/components   apps/web/middleware.ts
```

⚠️ **The judgement is the SEARCH SET, not a file allowlist.** Earlier notes described V1 as exempting
`co-data.ts`, `contract-documents.ts` and "two 7I components" as legitimate readers — **that is not
what the test does** (verified against the file [S179]). The reality:

- **Deliberately EXCLUDED blind spots, named in-comment for Josh to rule on:** `apps/web/lib/**` (a
  grep there also matches the *definition* in `contracts.ts`, so it needs an exclude before it can be
  searched) and `packages/**` (shared utils, Supabase edge functions).
- ⚠️ **The risk is real and precise:** if someone adds a real toggle reader **under `lib/**` or
  `packages/**`, V1 stays green** — criterion 1 would be silently broken. `middleware.ts` was added to
  the set at S178 (commit `6a35be8`) precisely because it was the same class of blind spot.

**Owed:** either extend the search set to `lib/**` (with the definition-file exclude) and `packages/**`,
or rule those out of scope explicitly. A judgement encoded in a grep is invisible until it fails.

> ✅ **DONE [S180].** Widened the search set to include `apps/web/lib` and `packages`, with a single
> `grep -v 'apps/web/lib/services/contracts.ts'` to drop the definition's self-match. **Proven it
> still goes red:** planting a reader under `lib/` made the grep non-empty (detected), removing it
> returned it to empty — the exclude filters only the definition file, not real callers. The function
> still has zero callers anywhere. `s156-m4-audit.live.ts:360-397`, commit in the S180 close-out.

### S3 — Production holds FOUR test tenants alongside the real one, and the deletion sweep now runs on prod daily
**Known state, not a task — recorded so it is not discovered mid-incident.** Production carries four
test tenants — **`Bishop Contracting`, `Bis Contracting`, `test const`, `H&H Signature Renovations`** —
alongside the real company, **Worth Properties.**

⚠️ **The deletion sweep now runs on production daily** (`vercel.json` cron, 15:00 UTC — see §P3). **Any
of these test tenants on a lapsed trial will lock and delete like a real customer**, on the timer, with
no special-casing. This is the intended behaviour of the sweep; the note exists so that a test tenant
vanishing is understood, not investigated as data loss. (Cross-ref §R3 — the rebuild-test fixture
rename to `Sabal Point Construction` — a *different* environment; do not conflate.)

### S4 — Stripe is TEST MODE ONLY; production cannot accept a real payment
**Known state, on the QuickBooks/Intuit critical path.** Stripe is in **test mode only.** **Live mode
requires a connected bank account**, which has not been done — so **production cannot accept a real
payment today.**

⚠️ **This sits on the Intuit review path (§N):** Intuit's review will click the pricing page, and the
card-at-signup build (§R2) puts a real Stripe SetupIntent in front of every trial. **A test-mode Stripe
cannot take a live card.** Not debt, not a code task — a business/onboarding step (open the bank
account, flip Stripe to live) that gates going live, recorded here so it is on the critical-path
checklist rather than in someone's memory.

### ⚠️ S5 — Environment hazard: files change under you, mid-session, from outside your control
**This is a recurrence, not a one-off — that is why it is recorded as a hazard.**

- **Earlier this project:** four downloads landed in the **wrong worktree** (§L7 — including the
  redesign spec itself, under a renamed filename), and `FrameFocus-work` had to be removed.
- **S179:** while a docs session was editing `TECH_DEBT.md` and `outstanding-work-register.md`,
  `docs/specs/register-backlog-spec.md` — **a file that session never touched** — was **overwritten
  mid-run** with a stale copy of the register's content, by something outside the session's control
  (an editor sync, a hook, or a stray drop). It was caught only because `git status` showed a
  modification the session could not account for, and restored to HEAD.

⚠️ **The rule for the next session:** **an unexpected diff is SUSPICIOUS, not your own doing.** Run
`git status` before committing, and if a file you did not touch is modified, **look at it before
staging** — do not `git add -A`, and do not assume you made the change. This box has destroyed and
mangled work repeatedly; a clean `git status` at the end is a load-bearing check, not a formality.

### S6 — ✅ RESOLVED [Josh, S180]: `display_name` now MIRRORS the profile name (was: stale in production)
> ✅✅ **RULED & FIXED [Josh, S180].** Josh chose option (a): *"display_name should MIRROR the profile
> name."* Shipped as `20261100000000_sync_member_display_name.sql` — an `AFTER UPDATE` trigger on
> `profiles` that recomputes the linked STAFF member's `display_name` (same formula as the creation
> trigger) whenever `first_name`/`last_name` changes, plus a backfill for existing drift. **Subs stay
> exempt** (`member_type <> 'subcontractor'`): their `display_name` is the company name (F-6's other
> half, which stands). Applied to rebuild-test via MCP and **functionally verified** (a probe renamed a
> staff profile, confirmed `display_name` mirrored, and reverted; 0 staff drift remains). ⚠️ **Production
> apply is Josh's** (normal migration deploy) — the trigger only closes the drift once it is on prod.
> This overturns F-6's "no sync trigger" **for staff only**, by ruling. The OPEN analysis below is kept
> as the record of why.

**Surfaced closing register item 1.2 (the stale-`display_name` twin). The fixture symptom was
reconciled; the product cause was NOT — and must not be read as resolved.** _(Superseded by the ruling
above — retained as the reasoning of record.)_

- **What's fixed:** the stale rebuild-test row (`josh+test50@` showed "Josh Bishop" vs profile "Dave
  Whitfield") was reconciled, and `scripts/seed-test-identities.mjs` now self-heals crew/staff
  `display_name` on every run (commit in the S180 close-out). ⚠️ **This fixes the FIXTURE, not the
  product.**
- **The product bug.** `company_members.display_name` is the field **30+ readers** show (expenses
  author, schedule, PDFs, lien releases, payables, deliveries, change-orders, safety, punch). It is
  seeded ONCE by `create_member_for_new_profile` and has **no sync trigger — by design, spec F-6**
  (`20260704210000_company_members_foundation.sql:212-213`). The ONLY self-service name edit,
  `updateMyName` (`apps/web/lib/services/profile-self.ts:43`), writes `profiles.first_name/last_name`
  and **does not touch `display_name`.** ⚠️ **So in production, any member who changes their name gets
  a stale `display_name` across all 30+ readers** — and cleaning the test DB hides it exactly where QA
  would catch it.
- **Why F-6 doesn't hold up.** F-6's implicit rationale is snapshot-for-historical-accuracy, but
  `display_name` is **one mutable row per member, not a per-document snapshot** — so it gives
  **neither** live accuracy **nor** historical accuracy. A March lien release does not keep March's
  name; it shows whatever the row said at seed/creation time. Real historical names would be snapshotted
  **at document creation**, not on the membership row.
- **The decision owed (ATTENDED — not for an unattended run, on a field 30+ features read):** either
  (a) propagate `updateMyName` → `display_name` (a runtime sync; overturns F-6), or (b) snapshot names
  onto documents at creation and let `display_name` stay a company-assigned label. **Recorded here as
  OPEN; do NOT close as resolved.**

---

## J — Suggested order, and why

1. **A2 (client contracts)** — the only live exposure. Everything else is a feature.
2. **A1 (view tracking)** — small, self-contained, and `14b` renders degraded until it lands.
3. **A3 (`16c` Terms)** — ⚠️ **the highest-leverage of the features.** It unblocks P-1, which unblocks
   the AR aging split, "Expected in 30 days", and part of A12. It is also three changes, so scope it
   deliberately rather than as one screen.
4. **A6 (margin target)** — one column, one settings field, unblocks three treatments.
5. **A5 (7G)** — a stated priority, but gated on Intuit access rather than on us.
6. **A4 (`17`/`18`)** — the largest, and it changes what "committed cost" means. It deserves a clear run.
7. Everything else as it becomes worth doing.

⚠️ **A10 (event log) is worth deciding early even if built late** — A13 depends on it, and if it is
never built, both panels come out of the design permanently rather than sitting as unbuilt promises.