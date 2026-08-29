# Outstanding work register — everything the desktop redesign session owes

> **Purpose.** The redesign spec (`desktop-redesign-spec.md`) rules what is _in_ the pass. This file is
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

| #       | Item                                  | Status | Where it stands                                                                                            |
| ------- | ------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| A1      | Proposal view tracking (P3)           | 🟢     | Prompt written — `cc-blocking-items-prompt.md`, item 2                                                     |
| A2      | Client contract amounts (Fix 1)       | 🟢     | Prompt written — same file, item 1. **Live exposure.**                                                     |
| A3      | `16c` Terms — three schema changes    | 🟢     | **Fully ruled** + prompt — `cc-terms-module-prompt.md`                                                     |
| A4      | Add-items sheet + POs (`17`/`18`)     | 🟢     | **Fully ruled. SPEC WRITTEN** — `docs/specs/po-module-spec.md` @ `282a9c6`. Phase 4 awaiting go.           |
| A5      | Module 7G — QuickBooks                | 🟡     | ⚠️ **UNBLOCKED — the Intuit developer account now exists.** Was the only blocker.                          |
| A6      | Company margin target                 | 🟡     | **Confirmed** as specced. Unscheduled.                                                                     |
| A7      | Stored sell                           | 🟡     | Unchanged                                                                                                  |
| A8      | Paid-cancellation retention (90 days) | 🟡     | Copy shipped in step 10; the feature is not built                                                          |
| A9      | Notification per-type routing grid    | 🟡     | CC deferred it in step 8 — a schema change, ask-first                                                      |
| A10     | **Event log**                         | 🟢     | **Fully ruled** (four rulings) + prompt — `cc-event-log-prompt.md`. ⚠️ **Prompt needs amending — see §G.** |
| A11     | Proposed timeline from estimate       | 🟡     | Deferred in step 10. Zero machinery.                                                                       |
| A12     | Portfolio money rollups               | ✅     | **SHIPPED** in step 10.1 — `getPortfolioMoney`, concurrent after a caught perf regression                  |
| A13     | Recent activity feed                  | 🟢     | Ruled _with_ A10 — it is the same event log                                                                |
| A14     | Custom composable roles               | ⚪     | → `TECH_DEBT.md`                                                                                           |
| A15     | Unbilled to client                    | ⚪     | → `TECH_DEBT.md`                                                                                           |
| A16     | Package scope rename                  | ⚪     | → `TECH_DEBT.md`                                                                                           |
| A17     | Row tints                             | 🟡     | ⚠️ **RULED: they mean row STATE, not category nesting.** Nothing applies them yet.                         |
| A18     | `/m` photo chips (Safety, Marked up)  | ⚪     | Desktop has six, mobile four                                                                               |
| A19     | The five `prompt()` sites             | ⚪     | Two remain in Settings forms; sequencing still open                                                        |
| A20     | Floor-document amendment              | ✅     | CLOSED [A20 close-out, full-audit fix 3] — §12a superseded-quoted; CLAUDE.md bullet, both Floor docs and every live citer amended |
| **A21** | **Files excludes what Photos shows**  | 🟡     | ⚠️ **NEW — ruled, not yet specced.** See §D.                                                               |

⚠️ **A12 shipped after this register was first written.** The dashboard's portfolio money rollup landed
in step 10.1, reusing each per-project sibling's shared maths so it agrees with the projects list by
construction. Owner/Admin-only, zero queries for gated roles. **A perf regression was caught by the
battery** — the serial profitability loop added ~9s to every Owner dashboard render; it is now
concurrent.

## B — 🔴 Blocking

### B1 · A1 — Proposal view tracking (prerequisite P3)

**Ruled built ahead of the restyle; it was not.** `14b` renders "sent <date>" / "not sent" until it lands.

**The shape is already ruled.** Row per view — estimate id, timestamp, **user agent**. Total-opened and
last-opened are **derived**; they are the _display_, not the storage.

_Why not a counter:_ email security scanners hit these links. Filtering at write time freezes today's
scanner rule into data that cannot be corrected; with rows, the rule improves and history improves with
it. Rows also answer what a counter cannot — three opens in an afternoon reads differently from three
across three weeks, and the alert copy (_"no client activity since it was opened Aug 14"_) is a timeline
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

1. **Floor SELECT + INSERT/UPDATE** — the write side is _already_ floored by two deliberate triggers, and
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

| Field           | Reality                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deposit %**   | ❌ **Stored nowhere on an estimate.** The only `deposit` in the schema is `invoice_lines.source_deposit_invoice_id` — a deposit is _an invoice that later credits_, not a term. |
| **Invoice due** | ❌ **Not on the estimate** — `invoices.due_date` is set per invoice.                                                                                                            |
| **Retainage %** | ✅ `retainage_percent` — the one payment term that is already a real column.                                                                                                    |

**The mockup's own copy is correct about the problem:** _"these three numbers were previously buried in
the terms paragraph, where nothing could read them."_ Two of the three do not exist. **The fix is
columns plus a migration.**

⚠️ **This connects to P-1.** Payment terms being unruled is _why_ invoice due dates are never written —
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

**It also reverses a shipped model:** committed cost lands when someone _types a total_; the design makes
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
posts to the QuickBooks export _(confirmed: that caption appears nowhere in shipped code — do not write
it)_, and the **Accounting tab must say GL mapping is LIVE, not frozen** — unlike burden and retainage,
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

| Path                  | Retention   | Access                                                                               | Built?           |
| --------------------- | ----------- | ------------------------------------------------------------------------------------ | ---------------- |
| Trial expiry          | **14 days** | **Locked.** Recoverable only by paying — for a lapsed trial, opening a paid account. | ✅               |
| **Paid cancellation** | **90 days** | **Locked**, same as trial.                                                           | ❌ **not built** |

The only trace is a comment: _"cancellation gets 30 days and is a different path that is not built
here."_ **90 days is a FEATURE** — a lock, a retention clock, and an unban-on-payment route. The trial
path is the precedent, and its comment warns the way back must clear **both the ban and the retention
clock.**

⚠️ **Retention is a data-deletion policy.** If a terms of service or privacy policy states a different
period, code and document must agree.

### C7 · A9 — Notification per-type routing grid

**A schema change.** There is **no `notification_preferences` table** and no per-type app/email toggle
anywhere. What exists: `companies.notify_hours_start/end` (quiet hours) and a wired `push_subscriptions`

- service worker.

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

| #       | Item                                             | Note                                                                                                                                                                                                                                                                                                                                           |
| ------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A14** | **Custom composable roles**                      | Ruled toward roles, **not** per-person grants: every gate keys on `get_my_role()`, RLS cannot restrict columns, and testing loses its fixed set. The real need is legitimate — a bookkeeper who needs invoices but not the schedule. → `TECH_DEBT.md`                                                                                          |
| **A15** | **Unbilled to client** (Expenses)                | No expense→invoice link; needs schema. ⚠️ **Do not confuse with `13c`'s "Cost you've fronted"** — that is cost fronted on a _project_, derivable via `invoice_cost_claims`. Different questions.                                                                                                                                               |
| **A16** | **Package scope rename** (`@framefocus/shared`)  | ~150 import lines, breaks the build on a miss, **zero user-facing change.** → `TECH_DEBT.md`                                                                                                                                                                                                                                                   |
| **A17** | **Row tints**                                    | `rowTintAttention` / `rowTintProblem` shipped as tokens; **no screen applies them.** The mockups use them for row _state_ (a lapsed-insurance sub, an over-budget line); Josh suggested category/subcategory nesting. **Two different meanings — rule before applying**, or a tint means "problem" on one screen and "subcategory" on another. |
| **A18** | **`/m` photo chips**                             | Desktop now has six, mobile four, over the same data. CC correctly declined to widen a ruled `/m` surface as a rider on a desktop step.                                                                                                                                                                                                        |
| **A19** | **The five `prompt()` sites** (`#1-dialogsweep`) | All five collect a _value_, which is why the sweep left them. Sites: `contract-settings-form` · `lien-release-settings-form` · `items-tab` · `releases-panel` · `markup-editor`. **Build a value-collecting overlay, or ship native dialogs through the restyle?**                                                                             |
| **A20** | **Floor-document amendment**                     | `money-representation.md` and `7d1-spec.md` §12a still state the **overturned** S97 carve-out (_"a PM sees the amounts on an invoice they can reach"_). §7.1 obliged the amendment; the fix commit did not make it. **The Floor documents currently disagree with the shipped Floor.** Parked with the invoice-floor work. **CLOSED [full-audit fix 3]:** §12a carries the superseding banner (what shipped, and why it was overturned — the PM-Payments-tab read); `money-representation.md`'s citing note amended; CLAUDE.md's Floor bullet superseded-quoted; residual live citers (invoices.ts/-client.ts comments, 7f2 §S98-strike note, 7I, 7d1 §4c, allowances cross-ref) annotated. Session records left as history. |

---

## E — ✅ Done, recorded so nobody respecs them

| Item                                  | Where                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sub-inbound lien releases**         | Shipped in step 6.4 as **UI over schema that already shipped** (`20260925000000`). S145 ruled signing (upload-back, no external surface), the two triggers, roles, templates and the never-block posture. **No spec needed — do not write one.**                                                               |
| **Custom file categories**            | Shipped in step 6.1 with `20261039000000`. ⚠️ **Produced a regression**: the seed trigger broke company hard-deletion via an FK the deletion lists did not know about. **The lesson: a new table with a `company_id` must join `COMPANY_CHILDREN`, trial deletion's `COMPANY_TABLES`, and the purge helpers.** |
| **The invoice floor**                 | Shipped `2ff9966` + `20261038000000`. Keyed on **`author_member_id`, not `created_by`** — the latter is NULL on 10 of 18 live invoices.                                                                                                                                                                        |
| **The tz fix · the three N+1s**       | `8de9b4d` · `04b67f4`.                                                                                                                                                                                                                                                                                         |
| **Notification chips + decision set** | Ruled and shipped in step 7.                                                                                                                                                                                                                                                                                   |

---

## G — Rulings made AFTER this register was first written

⚠️ **The register was written before several interviews happened.** Everything below is ruled and was
not in the original file. **This section is the audit's output.**

### G1 — The event log (A10 + A13) — four rulings

| #   | Ruling                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Build the FULL log**, not an estimates-only one, and do not cut the panels. _(Three options were weighed.)_                                                                                                                                                                                                                                                           |
| 2   | **HYBRID: database triggers for completeness, plus an OPTIONAL CONTEXT FIELD for _why_.** A trigger cannot know _"sub bid came in high"_; explicit-only would let call sites forget.                                                                                                                                                                                    |
| 3   | **Changed columns only** — never whole-row snapshots. That is the version that grows without bound.                                                                                                                                                                                                                                                                     |
| 4   | **Prune at six months, EXCEPT where the parent is still open.** Projects: **`archived` is the ONLY terminal state** — a _completed_ project keeps its history until archived, which puts the decision in the user's hands rather than a timer's. Estimates: `converted`/`voided` are terminal, **but a converted estimate's history is kept** as the project's history. |

### G2 — `16c` Terms (A3) — the full shape

**Deposit:** prints as a term **and auto-generates the invoice on conversion** _(the alternative — a
client paying before acceptance — was rejected: an invoice belongs to a project, and there is no project
before conversion)_. **Company-wide default in Settings**, overridable **per estimate before sending**.
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

| Decision                      | Ruling                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Committed cost**            | ⚠️ **An agreed subcontract — AND an issued material PO.** This _narrows_ the design and removes the module's largest risk: an earlier reading had it reversing what committed means, dragging Budget & Cost, the dashboard and `getPayablesSummary` along. **It does not.**                                                                             |
| **Vendor**                    | From `cost_catalog.default_vendor_id` when catalog-sourced; **blank when typed manually**; filled in on the project side                                                                                                                                                                                                                                |
| **PO lines**                  | Gain **cost** and **`budget_item_id`**                                                                                                                                                                                                                                                                                                                  |
| **Status**                    | draft · issued · closed, **partial issue allowed, per-line issue states**                                                                                                                                                                                                                                                                               |
| **The material run**          | Tag a member to **specific lines** · one clumped expense with a receipt · ⚠️ **asked what is missing** · office breaks it down at review · purchased lines move to the bottom and leave the open PO                                                                                                                                                     |
| **Who may be tagged**         | ⚠️ **The five staff roles** — `expenses_insert` excludes subcontractors, so tagging one would create an assignment they cannot fulfil                                                                                                                                                                                                                   |
| **A flagged-missing line**    | Notifies **Owner, Admin, PM**; the item **stays open**. New type → **Field chip + decision set**                                                                                                                                                                                                                                                        |
| **The run expense's PO link** | ⚠️ **A NEW column (`source_po_id`), NOT `purchase_order_id`** — the origin predicate in `recompute_budget_item_committed` treats `purchase_order_id` as _"this row IS the commitment"_, so reusing it would double-commit and hide the amount from actual. **The module's sharpest edge.**                                                              |
| **Favorites**                 | Company-wide                                                                                                                                                                                                                                                                                                                                            |
| **v1 scope**                  | **Catalog + manual only**; assemblies **out**; sub-bid and past-estimate sources **out**                                                                                                                                                                                                                                                                |
| **Old POs**                   | ⚠️ **Not updated.** New POs derive their total from lines; old ones keep the typed total. Some will not foot — **deliberate.** The UI must tolerate a PO with no line costs **without rendering zeros or errors.**                                                                                                                                      |
| **`set_po_total_amount`**     | ⚠️ `s97ct-floor3` §5 asserts _"the RPC stays the path"_. Every new writer takes the same `app.po_total` exemption; **the test must keep passing on the property, not vacuously.**                                                                                                                                                                       |
| **PO numbering**              | **At issue**, following the projects and change-order scheme — not at draft                                                                                                                                                                                                                                                                             |
| **Issuing**                   | ⚠️ **Both vendor email AND PDF download.** Three consequences to spec: does a vendor row carry an **email address**; the PO email is a **new template carrying the CONTRACTOR's identity**, not the platform's; and a PO with a typed `vendor_name` and **no `vendor_id` has no address** — the email option must be **unavailable**, not fail at send. |

**A finding worth keeping:** the estimate row's `unit_cost`/`amount` **is already the cost basis** —
markup is only ever applied forward. So a PO de-markups **by construction**, never by inverse arithmetic,
and `budgeted_amount` is the same basis. That is what makes "Against the estimate" apples-to-apples.

### G4 — Smaller rulings

- **A6** — confirmed as specced: company-wide, nullable, **no comparison renders when unset.**
- **A17** — ⚠️ **row tints mean row STATE** (a lapsed-insurance sub, an over-budget line), **not category
  nesting.** An earlier suggestion of nesting was a guess and was withdrawn. If both meanings shipped, a
  tint would mean "problem" on one screen and "subcategory" on another.
- **A5** — the **Intuit developer account now exists**, so 7G is unblocked. _(Free; the customer's own
  QuickBooks subscription is their cost, and an Intuit app review stands between credentials and going
  live.)_

---

## H — ⚠️ THE EVENT-LOG PROMPT NEEDS AMENDING

`cc-event-log-prompt.md` asks CC several things that are **design decisions, not repo facts.** Those
belong to Josh, not to an analysis phase. **Rule these, then amend the prompt:**

| Open                                | Why it is not a repo question                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Which tables get the trigger**    | This is the module's scope. _Recommendation: the objects a contractor talks about — estimates, projects, change orders, invoices, payments, selections, punch items, contracts, POs. **Not** `time_segments`, `notifications`, or the log itself: high-churn tables produce noise, not history._ |
| **Does the log carry `project_id`** | A row-shape decision                                                                                                                                                                                                                                                                             |
| **The RLS policy shape**            | The constraint is known — ⚠️ **a "margin changed 31% → 18.4%" event IS a margin figure**, and margin is Owner/Admin, so an event log is a well-known way to leak the thing it describes. But the **shape** is rulable.                                                                           |
| **Re-parenting on conversion**      | Whether a converted estimate's events re-parent to the project or follow its state                                                                                                                                                                                                               |

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
combination. If Photos shows _images_ rather than _the photos category_, a PDF filed under `photos`
would vanish from both.

_Belongs with **A18** — both are Photos-surface decisions left open._

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
