-- S120 1-F — TECH_DEBT #180: a trial-deletion job remembers WHOSE logins it
-- must delete.
--
-- The finding (S119 ITEM A-1): runTrialDeletion re-read the auth user ids from
-- `profiles` on every run. Once deleteRows had removed `profiles`, a retry read
-- [], so an auth user whose deleteUser had failed was never retried, and the
-- job completed with auth_done = true. The security half is already closed
-- (banAuthUsers bans every login before any row goes, S119); what remained was
-- an orphaned auth row and an auth_done that lied.
--
-- The fix: the first run persists the ids here; every later run reads them
-- from here. NULLABLE, no default, no constraint — a column over a live table
-- that says nothing about existing rows (stop rule 2 does not apply). A job
-- that predates this column has NULL and reads `profiles` exactly as before.

ALTER TABLE public.deletion_jobs ADD COLUMN user_ids uuid[];

COMMENT ON COLUMN public.deletion_jobs.user_ids IS
  'S120 #180: the auth user ids of the company, captured on the job''s first run '
  'BEFORE profiles are deleted, so a retry still knows which logins to ban/delete. '
  'NULL on jobs that predate the column (they read profiles as before).';
