# Module 6A-2 — Supervisor / Hierarchy Timeclock View (UI) — Spec

> **Derives from** the 6A time-tracking migration (`20260710130000_module6_6a_time_tracking.sql`)
> and the existing 6A service layer (`apps/web/lib/services/time-tracking.ts` +
> `time-tracking-client.ts`). When this spec and shipped code conflict, **git is ground truth** —
> amend the spec.
>
> **Status:** WORKFLOW APPROVED (interview, Session 84). **Schema/RLS layer deliberately absent
> where changes are required** — see §S. No new table names, columns, or policy names are asserted
> as fact. CC reads the live `time_clock_sessions` / `time_segments` schema and RLS policies
> (including `time_clock_sessions_select_scoped`, `can_approve_member`, `time_role_rank`) before
> writing any migration named in §S, then this spec is complete.
>
> **Conventions:** follow `CLAUDE.md` — standard columns, per-tenant triggers, RLS naming,
> `get_my_company_id()` / `get_my_member_id()`, soft-delete/trash, server/client service split,
> append-only audit precedent (cf. ownership-transfer audit pattern). Deviations called out where
> they arise.
>
> **Scope note:** this is 6A-2, the _supervisor_ view. The personal timeclock (clock in/out,
> pick job/task, own-segment edits) is **6A-1**, a separate spec and build. 6A-1 should be built
> first — it is the smaller, self-contained slice.

---

## §1 — Scope

6A-2 owns the supervisor's view of their team's time: a live "who is clocked in now" board, a
timesheet review with full segment detail, correction of a subordinate's clock/job/task,
tier-enforced approval, and a per-person weekly hours summary.

**Starting reality (verified read, Session 84):** the 6A **data layer exists**, but **no UI exists
anywhere** — not even the personal clock. 6A-2 builds its UI from zero over existing service reads,
plus three RLS/schema additions (§S).

**The three things RLS does NOT do today (must be built — §S):**

1. **Tiered read visibility.** Today RLS is _flat_: owner/admin/PM/foreman all read every session
   in the company; crew/sub see only their own. Our rule is _tiered_ (§2).
2. **Column-scoped supervisor edits.** Today the update policy lets a supervisor edit _any column_
   of a lower-ranked member's session. Our rule limits edits to clock/job/task fields.
3. **Edit audit trail.** No record exists of who changed whose time. Our rule: audited.

---

## §2 — Locked decisions (interview, Session 84)

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

**Approval:** in scope, and **per-week, not per-session** (decision, Session 84). A supervisor
approves a subordinate's whole week in **one atomic action**, not one click per session.

- Today approval is strictly per-session: `approveSession(sessionId)` guards `status = 'pending'`;
  there is **no** week/period approval object — "week" is only a read-time derivation
  (`getWeeklyHours`), never stored. Approving a week today would be N separate `approveSession`
  calls in a loop with no transaction (a mid-loop failure leaves the week half-approved — not
  acceptable for payroll).
- **Required (§S-5):** a new atomic week-approval service function taking member + week window,
  performing a single guarded write over that member's pending sessions in range. RLS still
  evaluates `can_approve_member` **per row**, so the tier gate is preserved. The `approved_by` /
  `approved_at` stamping stays service-layer-enforced, same convention as `approveSession`.
- Tier gate unchanged: strictly-below rank, never self, never peer, never the owner.

**Weekly hours:** per-person paid/regular/overtime summary is in scope, via `getWeeklyHours`.

---

## §3 — Service layer (exists — UI calls these)

Verified via read-only inventory, Session 84.

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
  never Owner, never self/peer; hierarchy enforced by RLS via `can_approve_member`.
- `updateSession(id, updates)` → raw update (Owner/Admin hours-edit path today); **accepts
  arbitrary columns, no client-side role or column check** — §S-2 constrains this.
- `updateSegment(id, updates)` → raw update on a segment; same unconstrained shape.
- `deleteSession(id)` / `deleteSegment(id)` → soft-delete.

---

## §4 — Build items (UI from zero + three RLS/schema additions)

### §4.1 — Live board

Show open sessions (`getSessions({ status: open })` — confirm the open-status expression in §S)
scoped to the caller's tier, each with its current open segment (job/task) and elapsed time.
Refresh strategy (poll vs. realtime) is CC's call against current stack; note the choice.

### §4.2 — Timesheet review + full segment detail

List historical sessions in the caller's tier (date-window filter via `getSessions`), each
expandable to full segment detail via `getSessionSegments`. Show per-person weekly totals via
`getWeeklyHours`.

### §4.3 — Supervisor correction (NEW enforcement — §S-2 + §S-3)

Supervisor edits a subordinate's clock in/out, job, or task. Editable columns are **restricted**
to that set server-side; every edit writes an audit row.

### §4.4 — Approval queue (week-level)

Present pending time grouped **by member and week**, not as loose sessions. The approve action
approves the whole week atomically via the new week-approval function (§S-5), not a per-session
loop. `getPendingApprovals()` / `getSessions({ status: pending })` supply the underlying rows;
the UI rolls them up per member-week for review, showing the week's segment/job/task detail and
`getWeeklyHours` totals before approval. The UI should only show weeks the caller may approve for
that member (avoid presenting rows the write will reject).

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
live. This replaces any per-session loop — no partial-week approvals. Propose the function +
(if needed) an RPC for atomicity; flag conflicts, resolve nothing silently.

---

## §5 — Acceptance criteria

- [ ] A PM sees crew + foreman sessions only; **cannot** see admin or owner sessions (verified by
      a direct client read as a PM). Admin sees +PM; owner sees all; crew/sub see only their own.
- [ ] Live board shows currently-clocked-in subordinates with current job/task + elapsed time.
- [ ] Timesheet review expands to full segment detail per person; per-person weekly
      paid/regular/overtime totals shown.
- [ ] Supervisor can edit a subordinate's clock times, job, and task — and **only** those; a direct
      client call attempting to edit any other column is rejected server-side.
- [ ] Every supervisor edit to another member's time writes an append-only audit row (who, whom,
      fields, when).
- [ ] Approval is presented and performed **per member-week**; approving a week is one atomic
      write (no partial-week state on failure); self/peer/owner approvals rejected and only
      approvable weeks shown (RLS `can_approve_member` regression-check per row).
- [ ] All tier and column rules enforced at RLS/service, verified by direct client calls bypassing
      the UI.

---

## §6 — Out of scope for 6A-2

- Personal timeclock (clock in/out, pick job/task, own-segment edits) → **6A-1**.
- Auto-clock-out at midnight → separate backend/cron task.
- 4pm/5pm still-clocked-in notification delivery → Notifications build (TECH_DEBT #91).
- Payroll export / external payroll integration → later, not this slice.
