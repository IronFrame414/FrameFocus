-- 6B UI build (S87 revision): files.daily_log_id — log-bound photos.
--
-- Daily-log photos are LOG-BOUND, not day-pooled: with two same-day logs on
-- one project, each log's grid and PDF must show only its own attachments.
-- The prior predicate (project + category + company-tz day window on
-- created_at) cannot distinguish them, so the link becomes explicit.
--
-- Mechanism: a nullable FK column on files, not a junction table — M3's
-- convention is nullable domain pointers on files itself (files.project_id is
-- the precedent), and an attachment belongs to exactly one log. ON DELETE
-- SET NULL per the repo rule that nothing cascades into files: if a log row
-- were ever hard-removed, its photos survive as ordinary project files.
--
-- Supersedes the Q4/S87 upload-day predicate for log photos (6B-spec open
-- item #8). Idempotent per the rebuild-test-first batch pattern.

ALTER TABLE files ADD COLUMN IF NOT EXISTS daily_log_id uuid REFERENCES daily_logs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_files_daily_log_id
  ON files (daily_log_id)
  WHERE daily_log_id IS NOT NULL;
