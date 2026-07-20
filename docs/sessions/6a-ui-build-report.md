# Module 6A UI Build Report — 6A-1 Personal Timeclock + 6A-2 Supervisor Timesheets

> **Session 85 (2026-07-20)** · branch `feat/module-6a-ui` · base commit `1e797d0`
> Phase 3 unattended build per the approved Phase 2 decisions. **Nothing is committed;
> no migration has been applied anywhere.** `tsc` and `next build` are green after both
> slices. Signed-artifacts, change-order, and PDF code paths were not touched.

---

## ⚠️ TOP-PRIORITY NOTES FOR JOSH

1. **Week start = MONDAY — your Phase 2 answer left the `[MONDAY|SUNDAY]` placeholder
   unfilled.** I proceeded with **Monday** (my stated recommendation) rather than stall the
   unattended run. It is a single constant — `WEEK_STARTS_ON = 1` in
   `packages/shared/utils/time-tracking.ts` — wired through `weekWindow()` /
   `weekWindowForYmd()` and used by the queue, the weekly totals, and the
   `approve_member_week` RPC window. **If your payroll week is Sunday–Saturday, flip the
   constant to `0` before applying anything** — approval windows bake it in. The
   company-setting column that will eventually drive it is deliberately NOT built; file it
   with the batched Company Settings pass.

2. **OWED: employee pay-rate backend (per your decision on Phase 2 item 6).** No employee
   hourly-rate column exists anywhere (`profiles`, `company_members` — confirmed live).
   Subcontractors carry `subcontractors.default_hourly_rate`, but `company_members` has no
   FK to the subcontractors row, so even sub rates are not joinable from member rows. The
   Labor Cost (wk) KPI therefore renders an **em-dash for Owner/Admin** (with a "no
   pay-rate source yet" caption) and is absent for all other roles. **The follow-up build
   must be an effective-dated pay-rate table** (e.g. `member_pay_rates(member_id, hourly_rate,
   effective_from)` with Owner/Admin-only RLS): a rate change must **never reprice
   historical weeks**, so the KPI joins the rate effective during the priced week — a plain
   rate column on the member cannot satisfy this. Rates are Financial-Visibility-Floor
   data; do not put them on the company-readable `company_members` table.

3. **Migrations are WRITTEN, NOT APPLIED** (your standing rule). Apply order:
   `20260721000000` → `20260721010000` → `20260721020000`, then `npm run db:push` to
   regenerate types. Note they queue **behind `20260710120000_signed_artifacts.sql`,
   which STATE.md still lists as unapplied to prod.**

---

## Files changed

### Migrations (written, never applied)
| File | What it does |
| --- | --- |
| `supabase/migrations/20260721000000_6a1_own_recent_segment_edit.sql` | 6A-1 §S-2: `is_my_recent_segment()` + `time_session_member()` helpers; segments UPDATE policy widened from own-OPEN to own-MOST-RECENT; new BEFORE UPDATE column-scope trigger on `time_segments` (self may edit attribution fields only; `segment_end` NULL→value for the live end; times frozen). |
| `supabase/migrations/20260721010000_6a2_tiered_time_rls.sql` | 6A-2 §S-1/2/3: `time_member_rank()`; tiered `time_clock_sessions_select_scoped` (strictly-below reads); `can_view_time_session()` re-tiered (segment SELECT leak closed); `can_approve_member()` rebuilt on member rank (fixes the rank-0 subcontractor bug — security tightening); supervisor arm on segment UPDATE policy + both column-scope triggers; **`time_edit_logs`** append-only audit table + AFTER UPDATE audit triggers on both time tables. |
| `supabase/migrations/20260721020000_6a2_week_approval_fn.sql` | 6A-2 §S-5: `approve_member_week(member, start, end)` — SECURITY INVOKER plpgsql, one guarded UPDATE (atomic), RLS + `can_approve_member` still evaluated per row. |

### Specs
- `docs/specs/6A-1-spec.md` — §2.3 + §S-3 amended **[S85]**: PM job picker is
  assigned-only (Josh's call, Phase 2 item 11). See CONFLICTS.

### Shared package
- `packages/shared/utils/time-tracking.ts` — added `TIME_ROLE_RANK` / `timeMemberRank()` /
  `canApproveByRank()` (TS mirrors of the SQL rank functions, UI-gating only),
  `WEEK_STARTS_ON`, `weekWindow()`, `weekWindowForYmd()` (timezone-correct Monday-start
  windows, DST-safe two-pass midnight resolution).

### Services
- `apps/web/lib/services/time-tracking.ts` — `getSessions` gains `open` filter (§S-4:
  `clock_out IS NULL`); new member-joined reads `getSessionsWithMember`,
  `getSessionsForReview` (member + segments for the queue rollup), `getSessionDetail`
  (4b read). Both `company_members` joins carry explicit FK hints (two FKs exist).
- `apps/web/lib/services/time-tracking-client.ts` — column allowlists +
  `updateMyRecentSegment`, `updateSubordinateSession`, `updateSubordinateSegment`;
  `updateSession`/`updateSegment` now filter to explicit Owner/Admin business-column
  lists (no more arbitrary-column raw updates); `approveMemberWeek()` RPC wrapper
  (unknown-narrowed call until types regenerate); client-side reads
  `listOpenSessionsLive()` (live-board poll) and `listPickerTasks()` (interaction-time
  picker) — a documented deviation from the reads-are-server convention, since polling
  and pickers are inherently client-side; `GpsFix` exported.

### UI
- `apps/web/app/dashboard/dashboard-shell.tsx` — two interim nav links after Schedule
  (code-commented as interim; FFNav 11-item reindex NOT built, per instruction):
  **Timeclock** (all roles) and **Timesheets** (owner/admin/PM/foreman).
- `apps/web/components/time/time-ui.tsx` — shared 6A visuals: segment color bars
  (work blue / break grey / travel-shop amber per handoff), status badges incl.
  "No approval / Owner — n/a", read-only captions, mono time/duration formatters.
- `apps/web/app/dashboard/timeclock/page.tsx` + `timeclock-client.tsx` — 6A-1: clock
  in/out with capture-if-available GPS (5s timeout, never blocks, quiet "location not
  captured" caption), job (mandatory, RLS-scoped active projects) → task (optional,
  unassigned-on-job + assigned-to-me), unlimited switching with shared boundary
  timestamps, note/completion collection on segment end, live elapsed clock, today's
  segment list, **Edit on the most-recent segment only** (attribution fields), task
  cross-completion warning banner.
- `apps/web/app/dashboard/timesheets/page.tsx` + `timesheets-client.tsx` +
  `live-board.tsx` — 6A-2 4a: week selector (`?week=YYYY-MM-DD`), scope note, live
  board (30s poll, paused when tab hidden), 4-up KPI row (Pending / Paid / OT amber /
  Labor Cost Owner-Admin-only em-dash), member table on the handoff grid
  (`1.6fr 1fr 1fr 1fr 1fr 1.2fr` + checkbox column) with paid≠worked, derived OT,
  "approved by X", partial weeks ("n of m days approved"), Owner n/a badge, per-member
  day expansion linking to 4b, **Approve selected / Approve week** via the atomic RPC,
  derived-OT footer note. **No Export control anywhere** (dropped per §2 [S84]).
- `apps/web/app/dashboard/timesheets/[sessionId]/page.tsx` + `day-detail-client.tsx` —
  6A-2 4b: breadcrumb, status badge, **Edit hours** (Owner/Admin full; supervisors
  clock-times-only path), **Approve day** (`approveSession`, only when tier-approvable
  and pending), 4-up KPI (Clock In/Out · Paid · Worked "derived" · GPS "On site"/"—"),
  segment timeline with color bars and completion states, per-segment Edit
  (attribution for supervisors; + times for Owner/Admin), reconciliation footer from
  real data with an explicit discrepancy strip when the chain doesn't sum to the
  clocked day.

---

## CONFLICTS (spec vs. live — none resolved silently)

1. **PM job-picker scope (6A-1 §2.3).** Spec said PM sees all active jobs; live
   `projects_select_visible` + the CLAUDE.md role table scope PM to assigned projects.
   **Resolved by Josh (Phase 2 item 11): live RLS wins.** Spec amended [S85]; the picker
   lists whatever RLS grants (owner/admin all; PM/foreman/crew assigned).
2. **`can_approve_member` rank-0 latent bug.** Profile-less subcontractor members ranked
   0 via `time_role_rank(NULL)`, so crew (rank 1) could approve them — and under naive
   tiering would have seen their sessions. Session-64 intent is sub == crew (peers).
   Fixed in `20260721010000` via `time_member_rank()` (pins profile-less members to rank
   1) — a **behavior change on prod once applied**: crew can no longer approve/see subs.
3. **Handoff 4b "Edit hours: Owner/Admin only" vs. 6A-2 §4.3 supervisor clock-time
   corrections.** Enforcement follows §4.3: supervisors may edit a subordinate's
   `clock_in`/`clock_out` (session) and job/task attribution (segment) — never segment
   times, never delete, all audited. UI shows Edit hours to Owner/Admin **and**
   tier-qualified supervisors; the segment-time inputs render for Owner/Admin only.
4. **Handoff 4b paid-break sample vs. live defaults.** `DEFAULT_TIME_SETTINGS` has breaks
   unpaid (the Company Settings columns don't exist yet), so the reconciliation footer
   shows breaks as unpaid real math, captioned "unpaid until Company Settings lands" —
   per the spec's "render the sum from real data".

## Judgment calls

- **DB triggers for column scope (approved Phase 2 item 1).** Deliberate departure from
  the repo's service-layer-only convention — the specs' acceptance criteria require
  direct-API rejection, which client-side JS can't provide. Documented in both migration
  headers. Trigger names (`*_column_scope`) sort before the `updated_at`/`set_updated_by`
  triggers, so they fire first and don't inspect `updated_*` (owned by those triggers).
- **Audit scope (item 4 as you confirmed):** every cross-member edit is audited —
  supervisor corrections, Owner/Admin hours edits, and approval writes (status/
  approved_by/approved_at diffs) alike. Self-edits (own live clock-out) are not audit
  rows. Trigger-based, so direct-API edits are captured.
- **Segment bar colors:** the handoff names work/break/travel-shop only;
  `material_run`/`warranty` render blue (project-bearing work).
- **6A-1 exposes all six segment types** (approved item 10) — without it there is no way
  to log a break/travel/shop, and 4b renders them.
- **Day-detail access is supervisor-roles only** (same gate as the queue). A crew member
  cannot open their own day detail; personal history review is a later 6A slice per
  6A-1 §6.
- **Edit-hours inputs use the browser's timezone** (`datetime-local`); the modal says so.
  Office users are expected to be in the company timezone; revisit if not.
- **`approve_member_week` is called through an unknown-narrowed rpc signature** until the
  migration applies and `npm run db:push` regenerates types — swap to the typed call then
  if you like (`time_edit_logs` will also appear in `database.ts`).
- **Restricted joins degrade gracefully:** a segment whose project the viewer can't read
  (RLS) renders "Restricted project" — visibility of the member's time is tiered, but
  project detail still honors project RLS.
- **"Approve selected" loops the per-member RPC** — atomicity is per member-week, exactly
  what §S-5 specifies; a failure on one member never partially approves that member's
  week, and other members' results are independent (failures are listed by name).
- **Soft-deleted members keep their rank** in `time_member_rank()`, so a departed
  member's history stays visible to (only) their old supervisors.
- **Two-owner edge:** two `owner` profiles could not see each other's sessions under
  strict tiering (rank 5 is not > 5). FrameFocus companies have exactly one Owner by
  design, so this is theoretical; flagging for completeness.
- **GPS on desktop:** per §4.2 [S84] — one `getCurrentPosition` with a 5s timeout at
  clock-in and clock-out; denial/timeout proceeds silently with GPS null; the 4b GPS KPI
  shows "On site" iff a clock-in fix exists (no distance math — there is nothing to
  measure against in v1).

## Deferred / owed (beyond the two top-priority notes)

- **FFNav 11-item reindex** (Field Ops hub) — out of scope per instruction; interim links
  are code-commented in `dashboard-shell.tsx`.
- **Mobile GPS enforcement** (block-on-denial, owner/admin override + audit) — deferred
  to the mobile build per 6A-1 §4.2 [S84].
- **Auto-clock-out at midnight, still-clocked-in notifications, QB export** — explicitly
  not built (6A-1 §4.1/§6, 6A-2 §6).
- **Week-start company setting** — batched Company Settings pass (see top note 1).
- **STATE.md / TECH_DEBT.md not updated** — left for your commit/wrap flow so this branch
  touches only build artifacts.

## What to verify before committing

1. **Read the three migrations** — especially the two security-tightening diffs
   (tiered SELECT; `can_approve_member` sub fix) and the trigger column rules. Apply to
   **rebuild-test first**, then `npm run db:push`, re-run `npm run type-check`.
2. **RLS acceptance checks (direct client calls, per both specs' §5):**
   - As a PM: `select * from time_clock_sessions` returns crew+foreman+self only — no
     admin/owner rows; segments likewise.
   - As crew: update of own most-recent **ended** segment's `project_id` succeeds;
     update of its `segment_start` fails; update of an older segment fails.
   - As foreman: update of a crew session's `clock_in` succeeds and writes a
     `time_edit_logs` row; update of `status` to 'approved' on a **peer** fails;
     `approve_member_week` on self/peer/owner raises.
   - Owner sessions: status stays NULL; never matched by week approval; n/a badge shown.
3. **UI walkthrough:** clock in (deny + allow location), switch through work→break→work,
   clock out; confirm the "location not captured" caption, the task-completion warning,
   most-recent-only Edit. Queue: partial week ("n of m days"), Approve week, Approve
   selected, per-day approve on 4b, reconciliation footer + forced discrepancy (admin-edit
   a segment end) — the amber strip must appear.
4. **Nav:** crew/subcontractor sees Timeclock but not Timesheets; deep-linking
   `/dashboard/timesheets` as crew redirects to the dashboard.
5. **Week boundary sanity:** with company timezone America/New_York, a Sunday-evening
   session lands in the prior (Monday-start) week — confirm that matches your payroll
   expectation, else flip `WEEK_STARTS_ON` (top note 1).

---

## Addendum (S85, later same session) — global clock button + Timesheets nesting

**AMENDMENT TO THE OWED FFNAV REINDEX (decision, Josh):** Timesheets is **no longer a
first-class nav item**. It moved to a subpage of Timeclock —
`/dashboard/timeclock/timesheets` (day detail `…/timesheets/[sessionId]`), surfaced by a
tab strip (My clock · Timesheets) visible to supervisor roles only, with redirect stubs
at the old `/dashboard/timesheets*` URLs. **The M6 handoff's FFNav (11 items, Timesheets
at index 3) is superseded on this point: the future FFNav reindex must build 10 items**
(Field Ops keeps its slot; Timesheets does not get one). The sidebar now carries a single
interim Timeclock link.

Also added: a **global header strip** in `DashboardShell` (every dashboard page shifts
down by its 54px height — accepted) hosting a clock in/out button with live state
("Clocked in · since 7:02 AM", company-tz). The clock-in/clock-out modal flows were
extracted from the timeclock page into shared `components/time/clock-modal.tsx` so the
header button is fully functional on any page (state via `getOpenSession()` in the
dashboard layout; freshness = router.refresh() after mutations, no polling in v1;
`listActiveProjects()` client read added for the global job picker).
