-- ============================================================================
-- Company Settings pass (batched) — time-tracking settings on companies
-- Owed by: migration 20260710130000 header + 6A-spec §13 + 6a-ui-build-report
-- top note 1. Session 86.
--
-- Five columns. Spec amendments applied here (logged in 6a-ui-build-report.md
-- §"[S86] Company Settings pass amendments"):
--   * admin_timeclock_enabled is DROPPED (Josh, S86) — the timeclock is always
--     available to every role; no company gate. Supersedes 6A-spec §4/§8/§13.
--   * GPS is a three-state mode (off | capture | enforce), default 'capture'
--     (S86). Desktop honors 'off' by not capturing; 'enforce' is reserved for
--     the mobile build (6A-1 §4.2 [S84] — desktop treats it as 'capture').
--   * Daily OT threshold (6A open item #4) deferred entirely — no column.
--
-- Consumers read these through getCompanyTimeSettings() and thread them into
-- the pure helpers in packages/shared/utils/time-tracking.ts; nothing in SQL
-- computes week windows or OT (approve_member_week takes the window as
-- parameters), so no function changes are needed here.
--
-- week_starts_on: changing it re-buckets historical sessions into new weeks at
-- read time and re-derives OT / Labor Cost for past periods. Accepted, no
-- effective-dating (Josh, S86) — documented in TECH_DEBT.md #92 and captioned
-- in the settings UI.
-- ============================================================================

ALTER TABLE companies
  -- Payroll week start, 0 = Sunday … 6 = Saturday. Default Monday (S85
  -- decision 9). UI offers Sunday/Monday only; storage allows any weekday.
  ADD COLUMN week_starts_on smallint NOT NULL DEFAULT 1
    CONSTRAINT companies_week_starts_on_check
      CHECK (week_starts_on BETWEEN 0 AND 6),

  -- Weekly paid-hours OT threshold (6A-spec §9, default 40). Hours above it
  -- are overtime, derived at read time — never stored.
  ADD COLUMN ot_threshold_hours numeric(5,2) NOT NULL DEFAULT 40
    CONSTRAINT companies_ot_threshold_hours_check
      CHECK (ot_threshold_hours > 0),

  -- Paid breaks (6A-spec §13, Session 64): when ON, break-segment time up to
  -- the DAILY cap counts toward paid hours (and thus the OT threshold). Break
  -- segments never carry project_id, so paid-break time never lands on a job.
  ADD COLUMN breaks_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN paid_break_cap_minutes integer NOT NULL DEFAULT 30
    CONSTRAINT companies_paid_break_cap_minutes_check
      CHECK (paid_break_cap_minutes >= 0),

  -- GPS at clock in/out: 'off' = never capture; 'capture' = capture-if-
  -- available (§4.2 [S84]); 'enforce' = mobile-future, desktop = 'capture'.
  ADD COLUMN gps_clock_mode text NOT NULL DEFAULT 'capture'
    CONSTRAINT companies_gps_clock_mode_check
      CHECK (gps_clock_mode IN ('off', 'capture', 'enforce'));
