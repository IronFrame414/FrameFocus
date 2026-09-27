# docs/claude/roles.md

> Users, roles, and the visibility floors (roster, financial, client counterparty), plus the Admin principle and the approvals table, in full with every banner. Verbatim from CLAUDE.md (main `80e15bad`).
> **Nothing here was rewritten.** CLAUDE.md carries the operative statement and links here.


<!-- CLAUDE.md lines 589–853 -->

## User & Role Architecture

There are two completely separate layers of users. They use different auth systems and should never be confused.

### Layer 1: Platform Admins (FrameFocus internal team)

These users manage the FrameFocus platform itself. They are NOT tied to any company tenant.

| Role           | Description                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Platform Admin | Full access to all companies, subscriptions, support tools, platform analytics, and system configuration. Josh and any future FrameFocus team members. |

**Implementation:** Platform Admins are stored in a separate `platform_admins` table (not the company `profiles` table). They access a separate admin dashboard route (`/admin`). They do NOT have a `company_id`.

### Layer 2: Company Users (contractor customers)

Each subscribing company is an isolated tenant. Within that company, there are 6 roles with descending access levels. The Owner is always the billing contact.

| Role            | DB Value          | Web Access                           | Mobile Access     | Key Permissions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------- | ----------------- | ------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner           | `owner`           | Full                                 | Full              | All features, billing/subscription management, user invitations, approval authority on change orders/payments/AI content, company settings, QuickBooks connection — [SUPERSEDED for COs — Owner-final-approval gate removed; see module5-architecture.md §5.7c AMENDMENT (Session 55). Owner/Admin/PM all create+send.]                                                                                                                                                                                                      |
| Admin           | `admin`           | Full                                 | Full              | Everything Owner can do EXCEPT items in the owner-only list below                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Project Manager | `project_manager` | Full (scoped to assigned projects)   | Full              | Create/manage estimates, manage assigned projects, assign tasks, create change orders, **view job ACTUAL AND COMMITTED COSTS — NOT contract value, budgeted/sell amounts, or CO dollar amounts** (Financial Visibility Floor, added 2026-07-20; **"actual only" corrected to "actual and committed" [S140]** per money-rep P9 — `budgetColumnsFor()` has shipped `seesCommitted: true` for a PM since S97. **The same widening for FOREMAN is OVERTURNED [Josh, S150] — see the Floor below.**), manage client communication |
| Foreman         | `foreman`         | Limited                              | Full              | Manage assigned field crews, daily logs, schedule crew tasks, review Crew Member submissions, punch lists, quality control                                                                                                                                                                                                                                                                                                                                                                                                   |
| Crew Member     | `crew_member`     | Minimal                              | Full              | Clock in/out with GPS, daily log entries, photo capture, task status updates, view assigned tasks and schedule                                                                                                                                                                                                                                                                                                                                                                                                               |
| Client          | `client`          | Portal only — **see the note below** | No (future phase) | View project timeline, photo gallery, approve selections, sign documents, make payments, message PM, view AI weekly summaries                                                                                                                                                                                                                                                                                                                                                                                                |

### Roster Visibility Floor — **RULED [Josh, S131]**, and `DASHBOARD_ROLES` is now enforced

**"Portal only" in the Client row above described an intention, not a mechanism, until S131.**
`DASHBOARD_ROLES` (`packages/shared/constants/roles.ts`) excluded `subcontractor` and `client`
from the day it was written and **no code consulted it**. Measured on rebuild-test in S130 as the
real QA identities: a subcontractor and a client each signed in to `/dashboard` and read the
company's **full contacts list, sub roster and team roster — 6 / 4 / 7 rows, identical to the
Owner's.** There was also no portal route tree for a client to be "only" in.

Two separate changes, because one is routing and one is data:

- **Ruling A — the route.** `middleware.ts` and `app/dashboard/layout.tsx` both guard `/dashboard`
  via `apps/web/lib/dashboard-access.ts` (M6M D-54: hidden **and** route-guarded). A
  `subcontractor` goes to `/m/projects`; a `client` goes to a **placeholder** that Module 9
  replaces. ⚠️ ~~**The Pre-Module 9 gate — hosted portal vs. email plus magic-link tokenised pages —
  is OPEN and untouched.**~~ **RESOLVED [Josh, S164]: FrameFocus hosts the portal, with accounts**
  (R1); outbound webhooks become **Module 12**. See "Pre-Module 9 Decision Gate" in `STATE.md`.
  **The placeholder itself is still a placeholder** — that half of the sentence stands until M9
  stage 1 replaces it. A placeholder is not a portal.
- **Ruling B — the data.** `20260911000000_roster_visibility_floor.sql`. **A redirect protects no
  data**, since `/m`, every API route and any direct PostgREST call bypass routing entirely.

| Role                       | Team roster (`profiles` **and** `company_members`) | `contacts` | `subcontractors` |
| -------------------------- | -------------------------------------------------- | ---------- | ---------------- |
| `subcontractor`            | Owner, Admin, PM **only**                          | **none**   | **none**         |
| `client`                   | **none**                                           | **none**   | **none**         |
| the five `DASHBOARD_ROLES` | unchanged, company-wide                            | unchanged  | unchanged        |

**Own row is always readable, for every role.** Not a softening of the ruling — a precondition for
it. There are 94 direct `from('profiles')` reads keyed on `user_id = auth.uid()`, including both
layouts; a client who cannot read their own row cannot load the placeholder they were just
redirected to.

**Two traps recorded for whoever edits these policies next:**

1. **The roster is TWO tables.** `/dashboard/team` reads `profiles`; `/m/team` reads
   `company_members` via `getMembers()`. Flooring one closes one surface.
2. **`profiles` carried TWO permissive SELECT policies**, and permissive policies are **OR**'d.
   Adding a third, narrower one changes nothing — the widest always wins. Both were replaced by one.

### Financial Visibility Floor (authoritative — added 2026-07-20)

**Only Owner and Admin may see contract/budget/sell/CO dollar figures. Project Manager sees ACTUAL AND COMMITTED COST. Foreman and Crew see ACTUAL COST ONLY.** — **RULED [Josh, S150]**

> ## ⚠️ THIS IS A DELIBERATE RULING CHANGE. IT IS NOT A DISCOVERED DRIFT.
>
> **Read this before concluding the floor was quietly weakened.** Most of S150's other
> corrections to this file went the other way — the document was stale, the code was
> right, and the document was brought to the code as record-keeping. **This one is
> different.** Foreman's access was **decided** at S150, and the decision **narrows**
> what the S97 ruling in `7h1-spec.md` §7H.2 #10 had granted. That the code already
> matches is the outcome, not the argument.
>
> ### What was decided
>
> **`#1-m7cpl` is RESOLVED IN FAVOUR OF THE SHIPPED CODE. Foreman stays `actual_only`
> — 3 columns, `seesCommitted: false`.** `budgetColumnsFor()`
> (`apps/web/lib/services/invoices-shared.ts:460-472`) is correct as it stands and is
> not to be changed to admit committed cost for a foreman.
>
> ### What it supersedes
>
> _Superseded text, quoted rather than rewritten:_ _"Only Owner and Admin may see
> contract/budget/sell/CO dollar figures. **Project Manager and Foreman see ACTUAL AND
> COMMITTED COST ONLY.** Crew sees ACTUAL COST ONLY."_ — the S140 correction, itself
> quoting and superseding an older _"Project Manager, Foreman, and Crew see ACTUAL AND
> COMMITTED COST ONLY."_ All three generations are kept so the direction of travel stays
> legible: the grant to foreman was widened at S97 and is **narrowed again here**.
>
> The S140 banner that stood in this place is retired. It read, in part: _"⚠️ **THE
> SHIPPED CODE DOES NOT MATCH THIS ROW FOR FOREMAN, and the code is not obviously
> wrong.** … **This needs a ruling, and it is filed as `#1-m7cpl`**"_. This is that
> ruling.
>
> ### ⚠️ AND THE S140 BANNER MIS-ATTRIBUTED ITS OWN AUTHORITY — corrected here
>
> _Superseded claim, quoted rather than deleted:_ _"money-rep **P9** is the source of
> the widening"_, and _"narrowing the ruling to match the code would discard a decision
> money-rep P9 made on purpose."_ **Both are false, and `TECH_DEBT.md` #1-m7cpl repeated
> the error by listing the authority as one column headed "money-rep P9, 7h1 #10".**
>
> **money-rep P9 widens the PM and says nothing whatever about foreman**
> (`docs/specs/money-representation.md:113` — _"Owner/Admin see everything. PM sees
> **actual AND committed** (widens today's actual-only floor)"_). And
> `money-representation.md` **puts foreman at actual-only in two other places, explicitly**:
>
> - `:863` — _"**Foreman — actual only**, matching today's gated reflow
>   (`budget/page.tsx:57-88`)."_
> - `:1046` — §7.3's per-screen role matrix, row _"S-1 committed (remaining)"_: Foreman
>   is **—**, while _"S-1 actual / cost to date"_ (`:1047`) is **✓**.
>
> The extension to foreman is **`7h1-spec.md` §7H.2 #10's own**, and that document says
> so in its own words: _"Ruled [S97]: **P9's widening stands, and extends to foreman.**"_
> — an extension **beyond** P9, not a restatement of it.
>
> **This matters for how the S150 ruling should be read.** It does not overturn the money
> model of record; it **restores agreement with it.** `money-representation.md` and the
> shipped code have said the same thing about foreman all along, and this section is now
> the third to agree.
>
> ### The floor as ruled
>
> | Role            | Sees               | `budgetColumnsFor()`                                             |
> | --------------- | ------------------ | ---------------------------------------------------------------- |
> | Owner / Admin   | everything         | `full`, 7 columns                                                |
> | Project Manager | actual + committed | `committed`, 5 columns                                           |
> | **Foreman**     | **actual only**    | **`actual_only`, 3 columns, `seesCommitted: false`**             |
> | Crew            | actual only        | `none` — redirected off the screen entirely, i.e. stricter still |
>
> `ui-05` §7.1's per-role column counts (Owner/Admin 7, PM 5, Foreman 3),
> `s97ct-budget-floor.live.ts`, and `money-representation.md` §7.3 all already assert this
> shape and need no change.
>
> ### ✅ Every document now agrees — `#1-m7cpl` is CLOSED
>
> **`7h1-spec.md` §7H.2 #10 was amended at S150**, at all nine sites that stated or relied
> on the foreman grant, with the superseded text quoted rather than deleted. **Its argument
> was withdrawn, not just its conclusion** — including §7H.12 A.1's warning at `:199` that
> an un-corrected `CLAUDE.md` _"would gate committed cost from the two roles that are
> supposed to see it"_. That warning was **right for the PM and inverted for the foreman**:
> on foreman the un-corrected `CLAUDE.md` agreed with P9, with `money-representation.md`
> §7.3, and with the code that had already shipped.
>
> **The lesson recorded there, because it is the one that generalises:** §7H.12 A.1 is what
> _changed_ this file at S140, on a citation nobody checked. An obliged amendment to
> `CLAUDE.md` is only as good as the citation behind it.
>
> Document set as of S150 — **`CLAUDE.md`, `money-representation.md`, `7h1-spec.md`,
> `ui-05` §7.1, `s97ct-budget-floor.live.ts` and `budgetColumnsFor()` all agree.**
> `#1-m7cpl` closed; see `TECH_DEBT.md`.

- **Gated from PM/foreman/crew:** contract value (`project_financials.contract_value`), original/revised contract, budgeted and sell/price amounts (`project_budget_amounts.budgeted_amount` and any future sell column), labor/burden rates (`instrument_rates`), variance, projected margin, and **change-order dollar amounts** (`change_orders.net_delta` and any `$` sum derived from it). Both money columns moved to 1:1 side tables to get this enforced — see the status table below; the old `projects.contract_value` and `project_budget_items.budgeted_amount` no longer exist.
- **Visible to all roles:** actual and committed cost (`project_budget_items.actual_amount` and `committed_amount`), and non-dollar facts — CO counts/statuses, project status, dates, punch counts, schedule. **This is deliberate, not an oversight:** the budgeted figure was split off onto `project_budget_amounts` precisely so actual and committed could stay on a row Foreman and Crew can still read. A role floor on `project_budget_items` itself would over-reach — `s97ct-roles.live.ts` **8b-ii** and `s97ct-budget-floor.live.ts` **7-foreman/7-crew_member** exist to fail loudly if anyone adds one.

  > **⚠️ This bullet is about the DATABASE, and it does NOT contradict the foreman ruling above.** `project_budget_items` deliberately has **no role floor**, so `committed_amount` is readable at the DB by every role and must stay that way — the two live tests named above fail loudly if anyone floors it. **A foreman not seeing committed cost is a UI gate, in `budgetColumnsFor()`, not a policy.** Read "visible to all roles" here as "not floored in RLS", never as "rendered for every role". [Clarified S150 alongside the `#1-m7cpl` ruling.]

- ~~**Named carve-out [S97, 2026-08-01]**~~ — ⚠️ **OVERTURNED [Josh — the invoice floor, `2ff9966` + `20261038000000_invoice_payment_floor.sql`; recorded here at A20 close-out].** _Superseded text, quoted not rewritten:_ _"a **PM may see the amounts ON an invoice they can reach** (7D client invoicing) — derived lines, draws, discounts, credits, invoice totals and retainage."_ **The live rule:** a PM sees **only invoices they AUTHORED** — `invoices_select_visible` keys on `author_member_id = get_my_member_id()` (not `created_by`, NULL on most legacy rows) — and **Payments plus every AR aggregate (collected to date, aging, retainage held, total outstanding) are Owner/Admin**. Why it was overturned: Josh signed in as a PM and read the Payments tab; the premise "a PM who cannot see whether their invoice was paid cannot do the job" was rejected. Full banner: [`docs/specs/7d1-spec.md`](docs/specs/7d1-spec.md) §12a. The negative half of the old text (no contract value, budget/sell, CO dollars for a PM) survives a fortiori — the floor got narrower, not wider.
- **Why:** this narrows the previous blanket "PM views job finances" grant (PM row above) to actual cost, and extends the same floor to foreman/crew. Foreman/crew are "Limited/Minimal" web roles; they had no business reason to see contract/margin figures, but nothing enforced it.
- **Current enforcement status [corrected 2026-08-02, S97]:** the UI-refresh specs (ui-01 §11, applied across ui-02–ui-06) gate these figures at the UI layer, and **three of the four figure families are now DB-enforced as well**. The previous text here — "the DB-level floor is NOT yet in place" — is superseded. Verify against the cited migrations rather than trusting this prose:

| Figure                      | Where it lives now                                                        | Enforcement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract value              | `project_financials.contract_value` (1:1 off `projects`)                  | **DB-enforced, Owner/Admin.** Table + `project_financials_{select,insert,update}_owner_admin`: `20260811000000_project_financials.sql`. Writer retargeted: `20260811010000_convert_estimate_project_financials.sql`. Old column dropped: `20260812000000_drop_projects_contract_value.sql`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Budgeted amount             | `project_budget_amounts.budgeted_amount` (1:1 off `project_budget_items`) | **DB-enforced, Owner/Admin.** Table + `project_budget_amounts_{select,insert,update}_owner_admin` + backfill: `20260816000000_budget_amounts.sql`. Transitional sync trigger: `20260816010000_budget_amounts_sync.sql`. Old column dropped, sync trigger removed, all four SQL writers retargeted in one transaction: `20260817000000_drop_budgeted_amount.sql`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Labor/burden rates          | `instrument_rates`                                                        | **DB-enforced, Owner/Admin SELECT floor.** `20260806000000_financial_rls_floor.sql` §1 replaces `instrument_rates_select_company` with `instrument_rates_select_owner_admin`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Change-order dollar amounts | `change_orders.net_delta` — still on the parent row, not split            | **PARTLY DB-ENFORCED — corrected 2026-08-09 [S123] against the live policy.** _Superseded text, quoted not rewritten: "**UI-ONLY, and deliberately so.** `change_orders_select_visible` is `company_id = get_my_company_id() AND can_view_project(project_id)` — no role floor, no author scoping."_ **That is not what the policy says.** The live `change_orders_select_visible` is `company_id = get_my_company_id() AND can_view_project(project_id) AND (get_my_role() = ANY (ARRAY['owner','admin']) OR (get_my_role() = 'project_manager' AND created_by = auth.uid()))` — the S121 read floor, applied by `20260830000000_change_order_read_floor.sql` (which replaced the S89-era policy from `20260704215000_module5_5d_change_orders.sql` that the superseded text describes). So foreman, crew and subcontractor **cannot SELECT a change order at all**, and a PM sees **only the ones they authored**. What remains UI-only is narrow and is the deliberate part: a PM sees `net_delta` on their **own** COs, because they must be able to author them and see what they wrote. Rationale, residual risk and the open scoping question: **[TECH_DEBT.md #117](TECH_DEBT.md)**. |

Both split tables carry SELECT/INSERT/UPDATE for Owner/Admin and **no DELETE policy at all**, so DELETE is denied to every role. `can_view_project()` still has no role floor of its own — the gating comes from the side tables, which is why the columns were moved rather than the helper changed.

**Do not "finish" this by flooring `change_orders`** without reading #117 first — the obvious fix breaks CO authoring for PMs.

### ⚠️ THE FLOOR GOVERNS STAFF. A CLIENT IS A COUNTERPARTY. — **RULED [Josh, S164]**

**Everything above this line is about the internal hierarchy. A client is not in it.** The Floor was
written to answer "which of my own people may see this", and it never contemplated the person paying
the bill. Module 9 forced the question and it is ruled here.

**A client sees MORE than a Project Manager on cost-plus and T&M, and LESS on lump sum.** Josh:
_"client can see more than a PM except for lump sum contracts. During the interview I broke down what
the client can see with each form of billing."_

| Instrument    | The client sees                                                                                                                | Note                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Cost-plus** | budgeted, actual, **markup %**, **hourly rate**, line total with markup, category totals, project total to date, expected      | `committed` is REMOVED — it derives from `purchase_orders` / `subcontractor_contracts`, which clients are excluded from |
| **T&M**       | what the company paid, the agreed **markup %**, the total billed — **the pre-markup figure IS shown beside the marked-up one** | one row per labor type, one row per material line                                                                       |
| **Lump sum**  | the total billed, sectioned by bill; **no line-level price and no cost basis**                                                 | the only opaque instrument                                                                                              |

**Why this is not a hole in the Floor.** The client pays against actuals on cost-plus and T&M, so
the cost basis is _theirs_. On lump sum they agreed a price and the cost basis is not. The Floor's
own doctrine already says this: **sell derives per instrument, then aggregates.**

> ### ⚠️ AND THE CONSEQUENCE THAT SHAPES THE BUILD
>
> **A lump-sum contract can carry a T&M change order.** Josh: _"that means sometimes the original
> contract will be different from COs."_ One project then renders **two visibility rules at once**,
> and **the CO's rule follows the CO, not the contract.**
>
> **Any derivation that assumes one visibility setting per project is wrong**, and it will be wrong
> in a way that looks right on every single-instrument project you test it against. The mechanism
> already exists and is per-bill: **`invoices.presentation_level`** (`full_detail` / `by_section` /
> `lump_sum`), shipped before M9 and needing no new column.

**The rule that makes this simple to reason about, and it resolves a class of questions rather than
one** — Josh, S164 Q3:

> **"The easy way to understand what a client will see is that they see what is on the invoice. In
> the portal, they see all of it on one page and totals added."**

The portal shows what the invoice shows. `presentation_level` is the single source of truth for
detail; the portal aggregates those per-bill decisions and adds totals. **It does not apply a
second, separate visibility model on top.**

**Enforced in the DATABASE, not the renderer** [Josh, S164 Q3]: the client's `invoice_lines` arm is
gated on the parent invoice's `presentation_level = 'full_detail'`. `invoice_lines` has no role or
project check of its own — it is safe purely by RLS containment on `invoices` — so a client arm on
`invoices` opens the lines **automatically and silently**, and hiding prices in the UI would leave
the whole lump-sum rule defeatable with one PostgREST call.

### The Admin Role Principle (authoritative)

**Admin is defined as "Owner minus money minus Admin promotion."** Anywhere in the platform where the rule for an action is not explicitly owner-only, Admin has the same access as Owner. When in doubt during implementation, Admin can do it.

**Owner-only actions (Admin is NOT allowed):**

1. **Billing and subscription management** — viewing/changing the subscription plan, updating payment methods, canceling the subscription, viewing billing history. Admin cannot see the Billing page at all.
2. **Promoting a user to the Admin role** — Admin cannot create more Admins. Only Owner can invite at the Admin level or promote an existing user to Admin.
3. **Transferring ownership** — only the current Owner can transfer ownership to another user. Admin cannot initiate ownership transfer.
4. **Connecting or disconnecting QuickBooks** — QB connection is treated as billing-adjacent because it controls financial data flow out of FrameFocus. Owner-only.
5. **Releasing final sub payments (money out the door)** — Admin can review, adjust, and approve sub pay applications, but the final "release payment" click that actually records payment and triggers the QB sync is Owner-only.
6. **Approving client-facing AI weekly summaries** — before an AI-drafted weekly project summary is shown to the client, it must be approved by the Owner specifically. Admin cannot approve these.
7. **Approving marketing content for publishing** — AI-generated social posts, review request emails, and any marketing content going out under the company name must be Owner-approved before publishing. Admin cannot approve these.
8. **Deleting the company account** — only Owner can close the company account (this is a billing-adjacent action).

### Role Permissions Quick Reference (By Action)

For any action not listed in the owner-only section above, assume Admin has access. When building a new feature, if a permission decision needs to be made, default to "Owner + Admin can do it" unless there is a specific reason (financial sign-off, billing, or client-facing owner-approval) to restrict it to Owner only.

**Who can approve what (summary):**

| Approval                           | Owner | Admin | PM  | Foreman |
| ---------------------------------- | ----- | ----- | --- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Billing changes                    | ✓     | —     | —   | —       |
| Promote to Admin                   | ✓     | —     | —   | —       |
| Connect QuickBooks                 | ✓     | —     | —   | —       |
| Release sub payments               | ✓     | —     | —   | —       |
| Approve AI weekly summaries        | ✓     | —     | —   | —       |
| Approve marketing content          | ✓     | —     | —   | —       |
| Approve change orders (final)      | ✓     | —     | —   | —       | — [SUPERSEDED for COs — Owner-final-approval gate removed; see module5-architecture.md §5.7c AMENDMENT (Session 55). Owner/Admin/PM all create+send.] |
| Approve sub pay apps (review step) | ✓     | ✓     | ✓   | —       |
| Approve estimates for sending      | ✓     | ✓     | ✓   | —       |
| Approve foreman timesheets         | ✓     | ✓     | ✓   | —       |
| Approve crew timesheets            | ✓     | ✓     | ✓   | ✓       |
| Invite users (non-Admin)           | ✓     | ✓     | —   | —       |
| Delete files                       | ✓     | ✓     | ✓   | —       |
| Edit company settings              | ✓     | ✓     | —   | —       |

---
