# Module 6A-1 — Personal Timeclock (UI) — Spec

> **Derives from** the 6A time-tracking migration (`20260710130000_module6_6a_time_tracking.sql`)
> and the existing 6A service layer (`apps/web/lib/services/time-tracking.ts` +
> `time-tracking-client.ts`). When this spec and shipped code conflict, **git is ground truth** —
> amend the spec.
>
> **Status:** WORKFLOW APPROVED (interview, Session 84). **Schema/RLS layer deliberately absent
> where changes are required** — see §S. No new table names, columns, policy names, or file paths
> are asserted as fact. CC reads the live `time_clock_sessions` / `time_segments` schema and RLS
> policies before writing any migration named in §S, then this spec is complete.
>
> **Conventions:** follow `CLAUDE.md` — standard columns, per-tenant triggers, RLS naming,
> `get_my_company_id()` / `get_my_member_id()`, soft-delete/trash, server/client service split.
> Deviations called out where they arise.
>
> **Scope note:** this is 6A-1, the _personal_ timeclock only. The hierarchy/supervisor view
> (PM sees crew+foreman, admin +PM, owner all; owner/admin clock-time edits) is **6A-2**, a
> separate spec and build. Do not build supervisor views here.

---

## §1 — Scope

6A-1 owns the single user's own timeclock: clocking in, picking a job/task, switching job/task
during the day, clocking out, and correcting their own most-recent segment. Every function this
UI calls for the happy path **already exists** in the 6A service layer (§3). This is a
UI-over-existing-services build plus three additions (§4).

**Two layers the user experiences (locked):**

- **Payroll clock** — one open `time_clock_session` per user (clock-in → clock-out), GPS + timestamp
  at each end.
- **Job/task attribution** — `time_segment`s inside that session. Job mandatory, task optional.
  Switching job/task ends one segment and opens the next under the same session.

---

## §2 — Workflow (approved trace, Session 84)

1. **Every user has a timeclock** — crew, foreman, PM, admin, owner.
2. **Clock in** on arrival at first location → opens a session, stamps GPS + timestamp.
   **GPS is required** — if the device denies or cannot provide a fix, clock-in is **blocked**
   (owner/admin override exists — see §4.2).
3. **Prompted to pick a job (mandatory), then a task (optional).**
   - Job list is role-scoped: crew/foreman see only assigned active jobs; PM/admin/owner see all
     active jobs. **Active jobs only** (no completed/archived).
   - Task list = unassigned tasks on the chosen job **plus** tasks assigned to this user.
   - "Job, no task" is allowed — the user may skip the task step.
4. **Switch job/task any time, unlimited** → current segment ends, new segment opens, same session
   (shared boundary timestamp, contiguous chain).
5. **Clock out** → stamps GPS + timestamp, ends the open segment, closes the session.
   Clock-out does **not** mark the task/job complete — only the user's time on it stops.
6. **Correct own most-recent segment** — see §4.3.

---

## §3 — Service layer (exists — UI calls these, does not rebuild)

Verified present via read-only inventory, Session 84. Client mutations return
`{ success: boolean; error?: string } & Partial<T>`.

**Reads (server, `time-tracking.ts`):**

- `getOpenSession()` → caller's own currently-open session with segments (scoped to caller's
  member id; supervisors do not see teammates here — correct for 6A-1).
- `getSessionSegments(sessionId)` → a session's non-deleted segments, chronological.

**Mutations (client, `time-tracking-client.ts`):**

- `clockIn({ first_segment, gps_in?, clock_in?, session_client_id?, segment_client_id? })` →
  opens session + first segment together; soft-deletes the session if the first segment insert
  fails (no clocked-in-with-no-segment state).
- `switchSegment({ end, next, segment_client_id? })` → ends current open segment, opens the next,
  shared boundary timestamp; returns an optional `taskWarning`.
- `clockOut({ session_id, end, gps_out?, clock_out? })` → ends open segment + stamps clock_out
  (+ optional GPS) at one shared timestamp.
- `updateSegment(id, updates)` → raw update on a segment (see §4.3 — the edit rule constrains
  _who_ and _which columns_, and today's RLS/client is looser than our rule).

**Shape available:** `GpsFix` = `{ lat, lng, accuracy?, captured_at? }` (compile-time only today —
no runtime validation).

---

## §4 — Build items (three additions beyond wiring existing services)

### §4.1 — (removed from 6A-1)

Auto-clock-out at midnight is **out of scope** for 6A-1 (decision, Session 84). It is a
scheduled/backend job with no UI surface and no implementation anywhere today. File as its own
build task alongside the Notifications build. Do not build it in this UI page.

### §4.2 — GPS-required clock-in (NEW — needs UI + server enforcement)

Today `gps_in` is optional at every layer (nullable column, optional param, no validation). Our
rule: **clock-in is blocked without a GPS fix.**

- **UI:** request geolocation before enabling the clock-in action; if denied/unavailable, block
  and show why. Offer an **owner/admin override** path (override records the clock-in with GPS
  null, flagged as overridden).
- **Server:** enforcement cannot live in the UI alone (the client mutation is callable directly).
  See §S-1 for the RLS/service change CC must design against the live policy.

### §4.3 — Own most-recent-segment edit, option B (NEW — needs RLS + column restriction)

**Decision (Session 84):** a user may edit their own **most-recent segment even after it is
ended** — not only the currently-open one.

- Today's RLS (`time_segments_update_authorized`) allows a non-owner/admin to edit their own
  **open** segment only (`owns_open_session(session_id) AND segment_end IS NULL`). Once ended,
  only owner/admin can edit. This does **not** meet option B.
- Additionally, `updateSegment` accepts an arbitrary `updates` object with **no column-level
  restriction** — a user could change any column, not just job/task.
- **Required (see §S-2):** loosen the user's edit window to "own most-recent segment" **and**
  restrict the editable columns to the job/task attribution fields only (not timestamps, not
  arbitrary columns). Clock _times_ (in/out) remain owner/admin-only.

---

## §S — Schema & RLS layer (CC fills from live reads — nothing below is asserted as fact)

CC must read the live migration and policies before writing anything here. Do **not** trust the
names below; confirm them against `time_clock_sessions` / `time_segments` and their policies.

**§S-1 — GPS-required enforcement.** Read the current `time_clock_sessions` insert policy and the
`clockIn` write path. Decide where "GPS present unless overridden by owner/admin" is enforced
server-side (check constraint vs. RLS vs. service guard). Design the owner/admin override so it is
auditable (who overrode, when). Propose the migration; surface the choice — do not resolve silently.

**§S-2 — Own most-recent-segment edit (option B).** Read `time_segments_update_authorized` (exact
current predicate) and any `updateSegment` service guard. Design: (a) a predicate that lets a user
update their own **most-recent** segment (open or the latest ended), and (b) a **column-level**
restriction limiting user edits to the job/task attribution columns only. Owner/admin retain full
edit. Confirm exact column names from the live table before writing. Propose migration; flag
conflicts.

**§S-3 — Read scope for the job picker.** Confirm how "active jobs assigned to me" vs. "all active
jobs" is expressed against the live `projects` / `project_assignments` schema and existing RLS, so
the picker's role-scoping is enforced server-side and not UI-only.

---

## §5 — Acceptance criteria

- [ ] User can clock in only with a GPS fix; denial blocks with a clear reason; owner/admin can
      override, and the override is recorded.
- [ ] After clock-in, user is prompted for job (mandatory, active + role-scoped) then task
      (optional; unassigned-on-job + assigned-to-user).
- [ ] "Job, no task" clock-in succeeds.
- [ ] User can switch job/task unlimited times; segment chain stays contiguous.
- [ ] Clock-out stamps GPS + time, ends the open segment, closes the session, leaves the task open.
- [ ] User can edit their own most-recent segment's job/task fields (open or latest ended); cannot
      edit clock times; cannot edit other columns; cannot edit older segments.
- [ ] All server-side rules (§S-1, §S-2, §S-3) are enforced at RLS/service, verified by a direct
      client call bypassing the UI.
- [ ] One open session per user is preserved (existing behavior — regression-check).

---

## §6 — Out of scope for 6A-1 (do not build here)

- Supervisor/hierarchy view and owner/admin clock-time editing → **6A-2**.
- Auto-clock-out at midnight → separate backend/cron task (§4.1).
- 4pm/5pm still-clocked-in notification **delivery** → Notifications build (TECH_DEBT #91); 6A
  emits named events only.
- Weekly/overtime hours rollups and approval-queue UI → later 6A slice, not 6A-1.
