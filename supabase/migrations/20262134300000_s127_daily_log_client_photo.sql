-- ============================================================================
-- S127 ITEM 5a — THE DAILY LOG'S CLIENT-FACING PHOTO, OR A STATED REASON.
-- [RULED Josh, 2026-10-02, option B; S127 rulings #4 a dedicated slot, #5 in
--  the PDF marked as client-facing, #6 more than one, no cap.]
-- ============================================================================
--
-- Box C ("Next two days") is replaced on the close-out by a dedicated
-- client-facing photo slot. A log cannot be sent without at least one
-- client-facing photo OR a one-tap reason for having none. The REASON is the
-- only new data, and this is its column.
--
-- ⚠️ NO NEW SCHEMA FOR THE PHOTO ITSELF. "Client-facing" is the existing
-- `files.client_visible = true` on a photo linked to the log
-- (`files.daily_log_id`) — the portal already lists client-visible images
-- (`getPortalPhotos()`) through `files_select_client`, which ALSO requires
-- `is_client_of_project` and `client_has_full_access()`. So a documents-only
-- client still sees nothing; the screen says so rather than promising otherwise.
--
-- ⚠️ WHY A REASON AND NOT A HARD REQUIREMENT [Josh]: on a day with no visible
-- progress a foreman either cannot close out or takes a filler photo to get
-- past the gate — and a filler photo reaching a client is worse than none. The
-- reason gives the same guarantee without manufacturing a picture of a wall.
--
-- ⚠️ BOX C'S COLUMNS ARE NOT DROPPED. `tasks_tomorrow_date`, `tasks_day_after`,
-- `tasks_day_after_date` hold live data (production at S127: 2 of 2 logs carry
-- a value). The inputs stop being shown; existing values keep showing on the
-- log and in the PDF. A column drop is a separate, later decision.
--
-- A new NULLABLE column with no default: every existing row reads NULL, which
-- is not a claim about it. The CHECK constrains only this new column.
-- ============================================================================

ALTER TABLE public.daily_logs ADD COLUMN client_photo_skip_reason text;

ALTER TABLE public.daily_logs
  ADD CONSTRAINT daily_logs_client_photo_skip_reason_check
  CHECK (client_photo_skip_reason IS NULL
         OR client_photo_skip_reason IN ('inspection_day', 'weather', 'no_site_access', 'no_visible_progress'));

COMMENT ON COLUMN public.daily_logs.client_photo_skip_reason IS
  'S127 item 5a. Why this log carries no client-facing photo (a one-tap reason): inspection_day, '
  'weather, no_site_access, no_visible_progress. NULL when it has one, and on every log before S127. '
  'The client-facing photos themselves are files.client_visible = true with files.daily_log_id = this log.';
