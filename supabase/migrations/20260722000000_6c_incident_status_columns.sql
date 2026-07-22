-- 6C UI build (S87/S88): safety_incidents resolution columns.
--
-- Q1 (approved): prevention_notes (what was done so it doesn't happen again),
-- status ('open' | 'closed' — EXACTLY these two), outcome (resolution
-- narrative). status/outcome are Owner/Admin-editable in the UI; RLS remains
-- row-level (reporter OR Owner/Admin) per the accepted live edit breadth.
-- The automated 2-day follow-up prompt stays DEFERRED (6C-spec §9 #10).
--
-- Idempotent per the rebuild-test-first batch pattern.

ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS prevention_notes text;
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';
ALTER TABLE safety_incidents ADD COLUMN IF NOT EXISTS outcome text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'safety_incidents_status_check') THEN
    ALTER TABLE safety_incidents
      ADD CONSTRAINT safety_incidents_status_check CHECK (status = ANY (ARRAY['open'::text, 'closed'::text]));
  END IF;
END $$;
