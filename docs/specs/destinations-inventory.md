# Top-level destinations — inventory (READ-ONLY)

> Feasibility facts for the five desktop-redesign destinations:
> `/dashboard` · `/dashboard/schedule` · `/dashboard/field-ops` · `/dashboard/timeclock` ·
> `/dashboard/billing`. **Nothing designed, nothing changed.** Every claim carries a path; a line
> number where it is one line.

**Branch:** `main` · **HEAD:** `6fc72ab merge: S175 item 9 — native dialogs replaced with a shared confirm overlay`
Baseline `main`, working tree clean.

## ⚠️ These screens carry the most NEW elements in the handoff

The single biggest net-new item — **"proposed timeline from your estimate"** (B6) — **does not exist in
any form** (no estimate→phase link anywhere). Portfolio money rollups (A1), crew load bars (B3), the
company-level schedule Gantt/By-crew views (B1), and a recent-activity stream (A4) are also absent. What
*is* built is noted per row below.

---

## PART A — Dashboard (`page.tsx`, 234; `getDashboardData` in `dashboard.ts`)

| # | Item | Finding |
| --- | --- | --- |
| 1 | **Portfolio money (Coming in / Going out / Not yet billed)** | **No company-wide rollup exists.** Only per-project services: `getProjectAging` (`payments.ts`), `getPayablesSummary`/`getBillsAndCommitments` (`payables.ts`), `getProfitabilityReport` (`profitability.ts`). Queries a rollup would run: **Coming in** = Σ invoice receivable, `status IN ('sent','partially_paid')`, company-wide; **Going out** = Σ `committedRemaining` over approved payable expenses, `closed_out_at IS NULL`; **Not yet billed** = cost-to-date (approved expenses) minus invoiced — **no company-wide equivalent for any of the three.** |
| 2 | **"Cash in, 30 days"** | Derivable but **not implemented.** ⚠️ P-1: `invoices.due_date` is optional; when NULL the clock runs from `issue_date` (`payments-shared.ts:150-169`). Query keys on `(due_date ?? issue_date) ≤ today+30` with remaining>0. |
| 3 | **"Needs you today"** | The existing feed (`dashboard.ts`, capped **6**) has **3 severities**: **amber** = CO awaiting signature >7 days; **blue** = active project missing `start_date`/`target_end_date`; **green** = CO signed within 7 days. Mockup's **compliance expiry, timesheet approvals, estimate expiry, estimate conversion are all NEW** (3 of 8 exist). |
| 4 | **Recent activity** | **No activity/event/audit table exists** (page comment "Activity log arrives with a later module", `page.tsx:213`) — matches the estimate/PO passes: there is no audit stream for projects either. Would be assembled per source. |
| 5 | **Crew schedule card** (`schedule-card.tsx`, 196) | Renders "This week — crew schedule": a 7-day grid of event chips (tasks/general/inspections) from `getCalendarEvents`. **The week/month toggle already exists** (`:39, 80-98`) — month view swaps in the `Calendar` component. No per-project phase Gantt on the card. |
| 6 | **Role gates** (`page.tsx:38-40`) | `canSeeFinancials` = owner/admin — hides the contract-value card + all `$` captions (row reflows). `canCreate` = owner/admin/pm — hides "+ New Project" (`:127`). `isCrew` = crew_member/subcontractor — loads own member, scopes to own tasks (`:41`). |

---

## PART B — Schedule (`schedule/page.tsx`, 44; `company-calendar.tsx`)

| # | Item | Finding |
| --- | --- | --- |
| 1 | **Timeline/Gantt + views** | Today `/dashboard/schedule` renders **only a Calendar** (`CompanyCalendar`, fed by `getCalendarEvents` = tasks + `schedule_entries` + inspections + compliance expiries). **A Gantt component exists but is project-level only** (`components/schedule/gantt.tsx`, used at `projects/[id]/schedule/`). **No company-level Timeline, By-crew, or phase-bar view exists.** |
| 2 | **Crew double-booking** | Pure query — **and it's already built:** `findOverlaps(memberId, start, end)` (`schedule-client.ts:17`) unions a member's dated tasks + general entries in range, returns warning strings, **non-blocking**, called from task/entry create forms. The mockup's *"also at 44 hours this week"* needs **hours**, which overlaps don't carry (see B3). |
| 3 | **Crew load bars ("33/40h")** | **Not built, and not cheaply derivable.** `tasks` has **no hours/duration/estimate column** (cols: assignee_id, start_date, due_date, status, percent_complete, phase_id, priority…). Scheduled hours per member cannot be computed from tasks; actual hours would come from `time_segments`/`daily_log_sub_entries`. Whether the bar is scheduled or actual is a spec decision — only actual is derivable today. |
| 4 | **Inspections** | Separate **`inspections`** table (`project_id, inspection_type, scheduled_date, result, inspector, permit_file_id, notes`); surfaced as calendar chips. `result` ∈ pass/fail/pending. |
| 5 | **"Cannot schedule until dates set" / "Resumes when permit clears"** | First is **derivable** — `projects.start_date`/`target_end_date` missing. Second is **not** — **no `hold_reason` column anywhere**, and `inspections` has only `result` (pass/fail/pending), no hold/permit-status state. Confirmed. |
| 6 | **"Proposed timeline from your estimate"** | **Does not exist in any form** (grep for estimate→phase generation: zero hits). `phases` has only `name, sort_order, project_id` — **no `estimate_id`, no dates, no dollar weight, no FK to `estimate_categories`.** To build it would need: read `estimate_categories` + summed line totals, rank by dollar weight → generate phases, an Accept action to insert `phases`, and (for spans) task dates. **The biggest NEW item in the handoff.** |

---

## PART C — Field Ops (`field-ops/page.tsx`, 77)

⚠️ **The three tabs are PER-PROJECT, not company-level.** The Field Ops *hub* (`field-ops/page.tsx`) is a
**project list** (each row: latest log date, log count, hazard badge). The Daily Logs · Deliveries · Safety
tabs (`components/field/field-tabs.tsx:8-12`) live under `field-ops/[projectId]/`. A company-level Field Ops
with tabs + KPI badges would be new.

| # | Item | Finding |
| --- | --- | --- |
| 1 | **Three tabs** | Confirmed, **per project**: **Daily Logs** (6B log list, hazard badge), **Deliveries** (6D PO + orderless list, open/closed), **Safety** (6C incident list). |
| 2 | **"2 of 4 jobs logged yesterday"** | Only the **cron** `runDailyLogMissing()` (`crons/daily-log-missing.ts`) exists; it counts projects **with clocked time that day**, not active projects, and only notifies. **No service-layer, page-callable equivalent.** A page version needs active-projects minus projects-with-a-log-for-the-day. |
| 3 | **Open hazards / deliveries this week / incidents 90d** | **Hazards** = `daily_logs.hazards_present` (bool, **no time window** — rolls up any hazard ever, `getProjectLogSummaries`). **Deliveries this week** = derivable from `purchase_orders` + `delivery_items` rollup (`deliveries.ts:65-90`). **Incidents 90d** = derivable from `safety_incidents` (`status` open/closed, `incident_date`). All derivable; **none surfaced as a company KPI today.** |
| 4 | **Crew count & hours per log** | **Not stored on `daily_logs`** (no crew_count/hours columns). **Joined:** count = `daily_log_crew` rows; hours = Σ `daily_log_sub_entries.hours` (`daily-logs.ts:61-64`). Shown only on the log *detail*, not the list. |
| 5 | **Hazard / Delivery / Missing flags per row** | **Hazard** ✓ direct (`hazards_present`). **Delivery** ✗ — no link between `daily_logs` and `deliveries` (deliveries are project-scoped, not date-linked to a log). **Missing** ✗ not stored — inferred only at cron-notification time. |

---

## PART D — Timeclock (`timeclock/page.tsx`, 68; `timeclock-client.tsx`, 758)

| # | Item | Finding |
| --- | --- | --- |
| 1 | **"On the clock now", 30s refresh** | **Exists** — `timeclock/timesheets/live-board.tsx`: `POLL_MS = 30_000` (`:18`), polls `listOpenSessionsLive()`, pauses on hidden tab. Shows name/role/segment/project/elapsed/clock-in. |
| 2 | **On-site / off-site badge** | Badge = `hasCoordinates(row.gps_in)` — means **GPS coordinates were captured at clock-in, NOT proximity.** The code says so explicitly (`live-board.tsx:129-140`, M6M D-34/S99). **No jobsite coordinate exists anywhere** — `projects` has only `contact_address_id`; `contact_addresses` has address text, **no lat/lng**. So the badge can only ever mean "GPS captured," never "on the jobsite." |
| 3 | **Hours by job for the week** | One-query path: `getProjectWorkedHours()` (`time-tracking.ts:256`) reads `time_segments` once, rolls up via pure `workedHoursByProject(segments)`. Confirmed. |
| 4 | **"Approve roles strictly below you"** | **Accurate and enforced in the DB.** `can_approve_member()` (RLS + function, `20260710130000:58`, revised `20260721010000:89`): caller's rank must be **strictly greater** than target's and **not self**. Ranks: owner5/admin4/pm3/foreman2/crew1/sub·null 0. |
| 5 | **Labor cost, burdened, per week** | Derivable, **Owner/Admin only.** `weekLaborCost()` reads the **frozen `time_session_rate_snapshots`** (`hourly_rate, burden_multiplier, fixed_burden_per_hour`, `database.ts:8408`) for approved sessions, live `member_pay_rates` for pending; OT split chronologically at the threshold (`timesheets/page.tsx:162-195`). |
| 6 | **Overtime "derived, never entered"** | **Accurate.** `weeklyHoursSummary` → `overtimeHours(paid, settings) = max(0, paid − otThresholdHours)` (`utils/time-tracking.ts`); **no OT column stored anywhere.** |

---

## PART E — Billing (`billing/page.tsx`, 142) — least explored, thorough

1. **Renders** — status, `plan_tier` (starter $79 / professional $149 / business $249), `seat_limit` ("X included"),
   trial notice, past-due warning, cancel-at-period-end notice; actions = Choose/Change Plan link +
   **Manage Subscription** (only if `stripe_subscription_id`) + the Add-Ons section. Backed by `getSubscription`,
   `getTrialDaysRemaining` (`billing.ts`), `getAddOns` (`add-ons.ts`).
2. **Plan / seats / storage / QB — real vs display:**

| Item | Status |
| --- | --- |
| Plan tier | Real — `subscriptions.plan_tier`, set from Stripe checkout/webhook. |
| **Seats** | **Real & enforced** — `getSeatUsage()` (`seats.ts`) counts active members + pending invites (excl. client/sub) vs `seat_limit` (default 2); `canInvite: used < limit` gates invites. |
| **File storage** | **Display-only — never measured.** No storage-quota/meter anywhere (the only "bytes" code is trial-export/offline). |
| QuickBooks sync | **Display-only** — QB is a 7G stub (`qb_*` columns exist, no sync service), consistent with the expenses/PO passes. |

3. **Add-ons** — **only ONE exists:** `companies.ai_tagging_enabled` (the AI Photo Auto-Tagging toggle, `add-ons-section.tsx`).
   **"Client portal branding $19" and "Extra storage $15" do not exist** — no columns, no toggles. ⚠️ **There is no branding
   gate on the portal logo:** `portal-shell.tsx:81` renders `companies.logo_url` **unconditionally** (`portal.ts:220-227`),
   so nothing sells or gates portal branding today.
4. **Invoice history + PDFs** — **not stored in FrameFocus.** "Manage Subscription" POSTs `/api/stripe/portal` and redirects to
   the **Stripe customer portal** (`manage-subscription-button.tsx:13`), which hosts payment method + invoice history/PDFs.
   Provider = **Stripe**, wired. An in-app invoice list would be new.
5. **Trial** — **enforced.** Lifecycle (`trial/lifecycle.ts:10-30`): day −7/−3 warnings → **day 0 account LOCKED** (middleware
   `isMyCompanyLocked` → `/locked`, or `403 TRIAL_LOCKED` for APIs, `middleware.ts:140-155`) → **14 days retained**
   (`RETENTION_DAYS_TRIAL=14`, recoverable only by paying) → deletion cron (built, unscheduled).
6. **Cancel → "read-only for 90 days"** — **not implemented, and the number is wrong.** The code comment
   (`trial/lifecycle.ts:29`): *"a PAID cancellation gets **30 days** and is a different path that is **not built here**."* The
   built retention path is the 14-day **trial** one; there is no post-cancel read-only mode. The mockup line is copy.
7. **Owner-only** — confirmed: `if (!profile || profile.role !== 'owner') redirect('/dashboard')` (`billing/page.tsx:24`).
   (Not Owner/Admin — Admin is redirected too.)

---

## PART F — cross-cutting

1. **N+1** — `field-ops/page.tsx` runs `getProjects` + `getProjectLogSummaries` (two rollup reads, no per-row loop — fine).
   `schedule-card`/schedule use single `getCalendarEvents`. Billing = a few single reads. **No new N+1 found** in the five
   pages (the previously-logged dashboard-UTC defect and prior N+1s are unchanged). One to watch, not a defect: a portfolio
   money rollup built naively as per-project calls would N+1 across projects — flagged for the design.
2. **Money to the wrong role** — Dashboard gates all `$` behind `canSeeFinancials` (owner/admin). Timeclock labor cost is
   Owner/Admin only. Billing is owner-only. **No leak found in these five.** (Cross-area: the PO committed total reaching
   foreman/crew is logged in the PO inventory, not here.)
3. **Six-section regrouping** — **touches none of the five.** It is the **project-detail** strip (referenced only in
   `estimate-detail-inventory.md` / invoice tests), and none of these destinations are project-detail pages. Confirmed.

---

## UNKNOWNS (and what was tried)

| # | Unknown | Tried |
| --- | --- | --- |
| 1 | Whether the redesign's Field Ops tabs are meant to be **company-level** (today they're per-project under `[projectId]`). Confirmed the current structure; the mockup's intent is a design call. |
| 2 | Whether "Coming in / Going out / Not yet billed" are three cards or one portfolio card, and the exact receivable/earned definitions. Confirmed no rollup exists; the metric shapes are inferable but not built. |
| 3 | Whether a crew **load bar** should be scheduled or actual hours. Only actual (from `time_segments`) is derivable — tasks carry no hours; scheduled-hours needs a new column. |
| 4 | Meaning of a NULL `time_session_rate_snapshots.hourly_rate` (unpriceable session). Code treats any session lacking a rate as making the week not fully priced; did not enumerate every null path. |
| 5 | Exact receivable columns for "Cash in 30 days" — confirmed `due_date` optional (falls back to `issue_date`), but did not trace every invoice-status transition that sets `due_date`. |
