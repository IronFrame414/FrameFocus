# Module 6A-2 — Supervisor / Hierarchy Timeclock View (UI) — Spec

> **Derives from** the 6A time-tracking migration (`20260710130000_module6_6a_time_tracking.sql`)
> and the existing 6A service layer (`apps/web/lib/services/time-tracking.ts` +
> `time-tracking-client.ts`). When this spec and shipped code conflict, **git is ground truth** —
> amend the spec.
>
> **Status:** WORKFLOW APPROVED (interview, Session 83; internal text previously said "Session 84"
> — cosmetic). **AMENDED Session 84** — reconciled against the M6 desktop UI handoff
> (`FrameFocus Module 6 - Field Operations` + `FFNav`, screens 4a/4b). Amendments are tagged
> **[S84]** inline. One S83 lock is **reversed with rationale** (§2, approval granularity).
> **Schema/RLS layer deliberately absent where changes are required** — see §S. No new table
> names, columns, or policy names are asserted as fact. CC reads the live `time_clock_sessions` /
> `time_segments` schema and RLS policies (including `time_clock_sessions_select_scoped`,
> `can_approve_member`, `time_role_rank`) before writing any migration named in §S, then this
> spec is complete.
>
> **Conventions:** follow `CLAUDE.md` — standard columns, per-tenant triggers, RLS naming,
> `get_my_company_id()` / `get_my_member_id()`, soft-delete/trash, server/client service split,
> append-only audit precedent (cf. ownership-transfer audit pattern). Deviations called out where
> they arise.
>
> **Design authority for layout/visuals [S84]:** the M6 UI handoff screens **4a** (timesheets
> approval queue) and **4b** (timesheet day detail), same 1a "Refined Navy" token system as the
> shell handoff. The handoff's Module-6 semantic tokens (segment color bars, status badges,
> Owner-n/a badge) are **authoritative for these screens** (§4.5). The handoff `.dc.html` files
> are design references, not code to port.
>
> **Scope note:** this is 6A-2, the _supervisor_ view. The personal timeclock (clock in/out,
> pick job/task, own-segment edits) is **6A-1**, a separate spec and build. 6A-1 should be built
> first — it is the smaller, self-contained slice.

---

## §1 — Scope

6A-2 owns the supervisor's view of their team's time: a live "who is clocked in now" board, a
timesheet review with full segment detail, correction of a subordinate's clock/job/task,
tier-enforced approval, and a per-person weekly hours summary.

**Starting reality (verified read, Session 83):** the 6A **data layer exists** (live on prod as of
S83), but **no UI exists anywhere** — not even the personal clock. 6A-2 builds its UI from zero
over existing service reads, plus RLS/schema additions (§S).

**The things RLS does NOT do today (must be built — §S):**

1. **Tiered read visibility.** Today RLS is _flat_: owner/admin/PM/foreman all read every session
   in the company; crew/sub see only their own. Our rule is _tiered_ (§2).
2. **Column-scoped supervisor edits.** Today the update policy lets a supervisor edit _any column_
   of a lower-ranked member's session. Our rule limits edits to clock/job/task fields.
3. **Edit audit trail.** No record exists of who changed whose time. Our rule: audited.

---

## §2 — Locked decisions (interview S83; amended S84)

**Tiered read visibility (tighter than today):**

- Foreman/PM/admin/owner see subordinates _below their rank only_, not company-wide.
- **PM** sees crew + foreman. **Admin** sees crew + foreman + PM. **Owner** sees all.
- A PM must **not** see the owner's or admin's time. (This is the change from flat RLS.)
- Rank source is the existing `time_role_rank` (owner 5 > admin 4 > PM 3 > foreman 2 > crew =
  subcontractor 1) — confirm against live definition in §S.

**Purpose — both:**

- **Live board:** who is clocked in right now (open sessions), and on what job/task.
- **Timesheet review + approval:** historical sessions, reviewable and approvable.

**Granularity:** full **segment** detail per person (job/task breakdown), not just session totals —
chosen deliberately to surface same-day inaccuracies so they get corrected while fresh.

**Supervisor edits:** a supervisor may correct a subordinate's **clock times, job, and task**.
Not system/approval/audit columns (§S-2). Clock-time edits on subordinates are a supervisor right
here (distinct from 6A-1, where a user edits only their own segment's job/task).

**Audit:** every supervisor edit to another member's time is **audited** — who changed what, when —
append-only (§S-3).

**Approval — BOTH per-week and per-day [S84 — REVERSAL of the S83 lock].**

- The S83 lock read: week approval "replaces any per-session loop — no partial-week approvals."
  **Reversed Session 84** (reconciliation with handoff 4b, Josh's decision): per-day approval is
  also permitted, so a week may legitimately be part-approved mid-review. What is **retained**
  from S83: the week _action_ itself is still **one atomic write** (§S-5) — never a client-side
  per-session loop.
- **Approve week** — primary action in the 4a queue. New atomic week-approval service function
  taking member + week window, performing a single guarded write over that member's pending
  sessions in range (§S-5). RLS still evaluates `can_approve_member` **per row**, so the tier
  gate is preserved. `approved_by` / `approved_at` stamping stays service-layer-enforced, same
  convention as `approveSession`.
- **Approve day** — available on the 4b day-detail screen via the **existing**
  `approveSession(sessionId)`. No new mechanics; the reviewer who just inspected a day approves
  it in place.
- The two compose at the data layer: approval is stored per-session either way. The week rollup
  (§4.4) shows partially-approved weeks; QB export (Module 7) gates on each session's `approved`
  status, not on the week.
- Tier gate unchanged for both paths: strictly-below rank, never self, never peer, never the
  owner. Owner rows never enter approval — render the **"No approval / Owner — n/a"** badge
  (§4.5); do **not** auto-approve.

**Weekly hours:** per-person paid/regular/overtime summary is in scope, via `getWeeklyHours`.

**Labor Cost visibility [S84]:** the Labor Cost KPI (§4.4) is **Owner/Admin only**. It does not
render at all for PM/foreman — no placeholder, no em-dash, the card is absent and the KPI row
reflows. (PM/foreman see labor totals through project financial actuals if permitted there; that
is not this screen's concern.) Rate source: the **team member's profile** (§S-6).

**QuickBooks export [S84]:** the handoff 4a header shows an "Export" button. **Dropped from v1** —
QB export is Module 7. Do not build; leave no dead button.

---

## §3 — Service layer (exists — UI calls these)

Verified via read-only inventory, Session 83.

**Reads (server, `time-tracking.ts`):**

- `getSessions({ memberId?, status?, from?, to? })` → session rows (no segments), soft-deleted
  excluded, newest clock_in first. **Applies no role logic of its own — visibility is whatever RLS
  grants.** (So tiering must be an RLS change, §S-1, not a param.)
- `getSessionSegments(sessionId)` → a session's segments, chronological (for the full-detail view).
- `getPendingApprovals()` → same rows pre-filtered to pending; the approval-queue candidate set.
  Does **not** itself check whether the caller can approve each one (that gate is on the write).
- `getWeeklyHours(memberId, weekStart, weekEnd, settings?)` → `{ paidHours, regularHours,
overtimeHours }` for one member's week; returns zeros on query failure.

**Mutations (client, `time-tracking-client.ts`):**

- `approveSession(sessionId)` → marks a pending session approved; guards `status = 'pending'`,
  never Owner, never self/peer; hierarchy enforced by RLS via `can_approve_member`. **[S84] This
  is the "Approve day" path on 4b — reused as-is.**
- `updateSession(id, updates)` → raw update (Owner/Admin hours-edit path today); **accepts
  arbitrary columns, no client-side role or column check** — §S-2 constrains this.
- `updateSegment(id, updates)` → raw update on a segment; same unconstrained shape.
- `deleteSession(id)` / `deleteSegment(id)` → soft-delete.

---

## §4 — Build items (UI from zero + RLS/schema additions)

### §4.1 — Live board

Show open sessions (`getSessions({ status: open })` — confirm the open-status expression in §S)
scoped to the caller's tier, each with its current open segment (job/task) and elapsed time.
Refresh strategy (poll vs. realtime) is CC's call against current stack; note the choice.

### §4.2 — Timesheet review + full segment detail [S84 — layout from handoff 4b]

List historical sessions in the caller's tier (date-window filter via `getSessions`), each
expandable to full segment detail via `getSessionSegments`. Show per-person weekly totals via
`getWeeklyHours`.

**Day-detail screen (handoff 4b — authoritative layout):**

- Breadcrumb; title + status badge; actions: **Edit hours** (Owner/Admin only — absent for
  others) and **Approve day** (renders only when the caller may approve this member per the tier
  gate; calls `approveSession`).
- **4-up KPI row:** Clock In/Out · Paid Hours · Worked (job cost) · GPS ("On site" when GPS data
  present; confirm rendering rule against live gps columns in §S).
- **Segments card:** contiguous rows, each = start time · **segment color bar** (§4.5) · type +
  project (or "no project") + task/note · duration. A completed task renders its
  marked-complete state (green). A paid break renders with no project and the "never job cost"
  read-only caption.
- **Reconciliation footer:** worked hours + paid-break hours = day total (e.g. 7.5 + 0.5 = 8.0).
  Segments must be contiguous and sum to the clocked day — render the sum from real data; if it
  does not reconcile, show the discrepancy rather than hiding it.

### §4.3 — Supervisor correction (NEW enforcement — §S-2 + §S-3)

Supervisor edits a subordinate's clock in/out, job, or task. Editable columns are **restricted**
to that set server-side; every edit writes an audit row.

### §4.4 — Approval queue (week-level) [S84 — layout from handoff 4a]

Present pending time grouped **by member and week**, not as loose sessions.
`getPendingApprovals()` / `getSessions({ status: pending })` supply the underlying rows; the UI
rolls them up per member-week for review, showing the week's segment/job/task detail and
`getWeeklyHours` totals before approval. The UI should only show weeks the caller may approve for
that member (avoid presenting rows the write will reject). **Approve week** is one atomic write
(§S-5). Per-day approval on 4b is also legal (§2) — the queue must render partially-approved
weeks coherently (e.g. "3 of 5 days approved"), not treat them as an error state.

**Queue screen (handoff 4a — authoritative layout):**

- Header: week selector + scope note ("you may approve roles strictly below you"); primary
  action **Approve selected** (week-atomic per member). ~~Export~~ **dropped, v1 (§2)**.
- **4-up KPI row:** Pending · Paid Hours (wk) · **Overtime (derived)** in amber · **Labor Cost
  (wk)** — Labor Cost card is **Owner/Admin only**; the row reflows for other roles (§2, §S-6).
- **Member table**, grid `1.6fr 1fr 1fr 1fr 1fr 1.2fr`: Member (avatar + role) · **Paid hrs** ·
  **Worked** (job-cost hours) · **OT** · Status · Action. Rows must surface the model facts:
  paid ≠ worked (paid lunch), derived-OT rows (e.g. 42.5 paid → 2.5 OT), already-approved rows
  ("by {approver}"), and the **Owner row with the "No approval / Owner — n/a" badge**.
- Footer note: "OT is derived from weekly paid hours over the threshold (default 40), never
  selected."

### §4.5 — Design tokens [S84 — handoff authoritative for these screens]

Same 1a "Refined Navy" system as the shell (ui-01). Module-6 semantic deltas, from the handoff
README:

- **Segment color bars** (6px, rounded, left of each segment row): work = blue `#2f49d1`;
  break = grey `#c3c9d4`; travel/shop = amber `#e88a52`.
- **Status badges:** Pending = `#fdece0` / `#b45309`; Approved = `#e4f0e6` / `#3d7a4b`;
  **No approval / Owner n/a** = `#eef1f6` / `#6b7280`.
- **Read-only markers:** small `#9aa1ac` captions on every derived/read-only value (e.g.
  "derived", "read-only, from time tracking").
- All hours, money, dates, IDs in IBM Plex Mono per the shell convention.

---

## §S — Schema & RLS layer (CC fills from live reads — nothing below asserted as fact)

CC must read the live policies before writing. Confirm exact policy/column/function names against
`time_clock_sessions`, `time_segments`, `time_clock_sessions_select_scoped`, `time_role_rank`,
`can_approve_member`, `ROLE_HIERARCHY`.

**§S-1 — Tiered read visibility.** Read the current `time_clock_sessions_select_scoped` (flat:
owner/admin/PM/foreman company-wide). Replace with a tiered predicate: a caller reads a session iff
the session's member is _strictly below_ the caller's `time_role_rank` (owner reads all). Confirm
the crew/sub self-only floor is preserved. This is a security-tightening change — surface the exact
predicate diff before applying; do not resolve silently. **Note:** adjacent to the deferred
FINANCIAL-RLS-FLOOR work — flag if they should be designed together.

**§S-2 — Column-scoped supervisor edits.** Read the current session/segment UPDATE policies. Today
a supervisor (foreman/PM above target) can update _any column_ of a lower-ranked member's session.
Constrain supervisor edits to clock in/out (session) and job/task (segment) columns only — not
approval, audit, or system columns. Decide enforcement layer (column-privilege / trigger / service
guard) and confirm exact column names live. Owner/Admin retain broader edit; propose migration.

**§S-3 — Edit audit trail (append-only).** Design an append-only audit table capturing at minimum:
who edited (caller member id), whose session/segment, which fields changed (before/after or field
list), and when. Follow the existing append-only convention. Write on every supervisor edit path
(§4.3). Propose table + trigger/service wiring; confirm naming against repo convention.

**§S-4 — Open-status expression.** Confirm how "currently clocked in / open session" is expressed
(likely `clock_out IS NULL`) so the live board (§4.1) filters correctly, and whether `getSessions`
supports it or needs a param/filter.

**§S-5 — Atomic week approval.** Design a new service function that approves a member's week in one
write: input member id + week window (`weekStart`/`weekEnd`, matching the `getWeeklyHours`
convention); a single guarded `UPDATE` over that member's `status = 'pending'` sessions whose
`clock_in` falls in range, stamping `approved_by` / `approved_at`. RLS must still evaluate
`can_approve_member` per row (confirm the existing UPDATE policy admits a bulk write — the read
notes a qualifying supervisor's row-wise `UPDATE ... WHERE member_id = X AND clock_in in range AND
status = 'pending'` should pass). Confirm exact column names and the pending-status expression
live. **[S84] "Pending" here means sessions still pending at action time — days already approved
via 4b are simply not in the write's WHERE set; that is correct behavior, not a conflict.**
Propose the function + (if needed) an RPC for atomicity; flag conflicts, resolve nothing silently.

**§S-6 — Labor Cost rate source [S84 — NEW].** The Labor Cost KPI (§4.4, Owner/Admin only) prices
each member's paid hours from an hourly rate on the **team member's profile**. CC: read the live
member/profile schema and confirm whether an hourly-rate column exists for **employee** members
(memory says subcontractors carry `default_hourly_rate`; employees are UNVERIFIED). **If no such
column exists, STOP and flag** — the fix is likely a small migration, but that is a decision for
Josh, not CC. Until a rate source is live, the KPI renders em-dash for Owner/Admin (never a fake
number) and remains absent for all other roles. No weekly wage-rate summary UI — the rate is an
input to the KPI, not a displayed report.

---

## §5 — Acceptance criteria

- [ ] A PM sees crew + foreman sessions only; **cannot** see admin or owner sessions (verified by
      a direct client read as a PM). Admin sees +PM; owner sees all; crew/sub see only their own.
- [ ] Live board shows currently-clocked-in subordinates with current job/task + elapsed time.
- [ ] Timesheet review expands to full segment detail per person; per-person weekly
      paid/regular/overtime totals shown.
- [ ] 4b day detail renders the segment color bars, the 4-up KPI row, and a reconciliation footer
      whose sum comes from real data (worked + paid break = day total).
- [ ] Supervisor can edit a subordinate's clock times, job, and task — and **only** those; a direct
      client call attempting to edit any other column is rejected server-side.
- [ ] Every supervisor edit to another member's time writes an append-only audit row (who, whom,
      fields, when).
- [ ] **Approve week** is one atomic write (no partial-week state on a failed write); **Approve
      day** works from 4b via `approveSession`; a week part-approved by day renders coherently in
      the queue; self/peer/owner approvals rejected and only approvable weeks shown
      (`can_approve_member` regression-check per row).
- [ ] Owner rows render the "No approval / Owner — n/a" badge and expose no approve action.
- [ ] Labor Cost KPI renders for Owner/Admin only (absent, not blanked, for PM/foreman); value
      comes from the member-profile rate per §S-6, or em-dash if no rate source exists yet.
- [ ] No "Export" control anywhere in the v1 UI.
- [ ] All tier and column rules enforced at RLS/service, verified by direct client calls bypassing
      the UI.

---

## §6 — Out of scope for 6A-2

- Personal timeclock (clock in/out, pick job/task, own-segment edits) → **6A-1**.
- Auto-clock-out at midnight → separate backend/cron task.
- 4pm/5pm still-clocked-in notification delivery → Notifications build (TECH_DEBT #91).
- QuickBooks export (the 4a "Export" action) → **Module 7**. Dropped from v1 (§2).
- Payroll export / external payroll integration → later, not this slice.
