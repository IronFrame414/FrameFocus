-- ============================================================================
-- M9 — THE CANCELLATION WINDOW. Two clocks, still one place. (S164)
-- ============================================================================
--
-- **RULED [Josh, S164]:** *"A cancelled project ENDS portal access 30 days after
-- cancellation. The clock starts the DAY THE USER CANCELS, not
-- `actual_end_date` — a cancelled project may never have one. 30 days, not 45.
-- Two windows now exist deliberately: completion 45, cancellation 30.
-- `client_window_open()` stays the ONLY place either number is written."*
--
-- This answers the question `20261017000000` §1 raised and deliberately did not
-- settle.
--
-- ----------------------------------------------------------------------------
-- 1 — NOTHING RECORDED A CANCELLATION DATE. Surveyed before adding the column.
-- ----------------------------------------------------------------------------
-- `projects` carries `start_date`, `target_end_date` and `actual_end_date` and
-- **no cancellation date of any kind**. There is no status-change log anywhere
-- in the schema — no `from_status`/`to_status` column on any table — and the
-- three triggers on `projects` (`projects_column_scope`,
-- `projects_set_updated_by`, `projects_updated_at`) capture none of it.
--
-- ⚠️ **`updated_at` CANNOT STAND IN FOR IT**, which is the trap worth naming:
-- it looks like a cancellation date on a project that has not been edited since,
-- and it silently becomes wrong the moment anybody touches any other column.
-- A client's access would then extend every time a PM edited a note.
--
-- **Zero cancelled projects exist platform-wide** (`status` is `active` x8 and
-- `complete` x2 at the time of writing), so there is no backfill and no
-- historical ambiguity: the column starts empty and is correct from the first
-- cancellation onwards. Had there been existing cancelled rows, they would have
-- had NO defensible date and the fail-open branch below would have covered them.
--
-- ----------------------------------------------------------------------------
-- 2 — CAPTURED BY TRIGGER, NOT BY THE WRITER
-- ----------------------------------------------------------------------------
-- The status can be set from the projects service, a future bulk action, or a
-- direct PostgREST call. A trigger is the only place that catches all of them,
-- and this is a date somebody's access expires on — a writer that forgets it
-- grants indefinite access rather than failing.
--
-- **Re-cancelling restarts the clock.** Moving OFF `cancelled` clears the date,
-- so a project that is cancelled, revived and cancelled again gets a fresh 30
-- days rather than inheriting a date from the first time. A stale date would
-- expire access the same day the project was re-cancelled.
--
-- ----------------------------------------------------------------------------
-- 3 — ⚠️ ARCHIVED IS UNCHANGED, AND THIS IS RULED, NOT OVERLOOKED
-- ----------------------------------------------------------------------------
-- **RULED [Josh, S164]: archived stays fail-open.** Stated plainly, because it
-- is the consequence somebody will otherwise read as a bug:
--
--   > **A client whose project is ARCHIVED keeps reading that project
--   > indefinitely. Archiving does not end portal access. The only thing that
--   > ends it is R17 — an Owner or Admin terminating the account.**
--
-- Archiving is a filing action, not an end to the relationship, and R5 is
-- explicit that deactivation is *"a switch, not a shredder"*. If archiving
-- should end access, that is a ruling to make and this function is where it
-- lands — do not infer it.
--
-- `complete` with no `actual_end_date` also stays open, as shipped at
-- `20261017000000` and unchanged here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The column.
-- ----------------------------------------------------------------------------
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

COMMENT ON COLUMN projects.cancelled_at IS
  'M9 [S164]: when status became ''cancelled''. Set and cleared by '
  'projects_capture_cancelled_at, never by a writer. Starts the 30-day client '
  'window — NOT actual_end_date, which a cancelled project may never have.';

-- ONE function, both operations. TG_OP rather than two functions, so the rule
-- for what a cancellation date means cannot diverge between INSERT and UPDATE.
CREATE OR REPLACE FUNCTION public.capture_project_cancelled_at()
RETURNS TRIGGER AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
      NEW.cancelled_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    -- Entering cancelled: stamp it. Always — re-cancelling restarts the 30
    -- days rather than inheriting a date from a previous cancellation, which
    -- would expire access the same day the project was re-cancelled.
    NEW.cancelled_at := now();
  ELSIF NEW.status IS DISTINCT FROM 'cancelled' AND OLD.status = 'cancelled' THEN
    -- Leaving cancelled: the date no longer describes anything true.
    NEW.cancelled_at := NULL;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

DROP TRIGGER IF EXISTS projects_capture_cancelled_at ON projects;
CREATE TRIGGER projects_capture_cancelled_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION capture_project_cancelled_at();

-- A project created directly as cancelled never fires a BEFORE UPDATE.
DROP TRIGGER IF EXISTS projects_capture_cancelled_at_insert ON projects;
CREATE TRIGGER projects_capture_cancelled_at_insert
  BEFORE INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION capture_project_cancelled_at();

-- ----------------------------------------------------------------------------
-- 2. The window — now two numbers, still one function.
-- ----------------------------------------------------------------------------
-- Created as an OVERLOAD first so every caller can be moved across before the
-- two-argument version is dropped; SQL function bodies are parsed at creation,
-- so dropping it while a caller still names it would fail.
CREATE OR REPLACE FUNCTION public.client_window_open(
  p_status text,
  p_actual_end date,
  p_cancelled_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $fn$
  SELECT CASE
    -- 45 days after COMPLETION [R2/R5].
    WHEN p_status = 'complete'  THEN p_actual_end IS NULL OR p_actual_end + 45 >= current_date
    -- 30 days after CANCELLATION [Josh, S164]. A different number on purpose:
    -- a cancelled job has no closeout, so the tail is shorter.
    WHEN p_status = 'cancelled' THEN p_cancelled_at IS NULL
                                     OR p_cancelled_at + INTERVAL '30 days' >= now()
    -- active, on_hold, archived. ⚠️ ARCHIVED IS DELIBERATE — see the header.
    ELSE true
  END;
$fn$;

COMMENT ON FUNCTION public.client_window_open(text, date, timestamptz) IS
  'M9 [S164]: BOTH client windows, written once — completion 45 days from '
  'actual_end_date, cancellation 30 days from cancelled_at. Read by '
  'is_client_of_project() (access), my_client_access_level(), and all three '
  'get_invitation_* helpers (the invite clock). A second copy of either number '
  'is how the clocks drift apart. Archived is deliberately open-ended.';

-- ----------------------------------------------------------------------------
-- 3. Every caller moves to the three-argument window.
-- ----------------------------------------------------------------------------
-- Five call sites, and they must move together: a caller left on the
-- two-argument version would keep granting access to a cancelled project
-- forever, and nothing would fail.

CREATE OR REPLACE FUNCTION public.my_client_access_level()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(
    (
      SELECT CASE
               WHEN me.client_access_state = 'deactivated' THEN 'none'
               WHEN NOT EXISTS (
                 SELECT 1
                 FROM projects ap
                 WHERE ap.company_id = me.company_id
                   AND ap.is_deleted = false
                   AND client_window_open(ap.status, ap.actual_end_date, ap.cancelled_at)
                   AND (
                     ap.contact_id = me.contact_id
                     OR EXISTS (
                       SELECT 1 FROM project_contacts pc
                       WHERE pc.project_id = ap.id
                         AND pc.contact_id = me.contact_id
                         AND pc.is_deleted = false
                     )
                   )
               ) THEN 'none'
               WHEN me.client_access_state = 'signed_documents_only' THEN 'signed_documents_only'
               WHEN me.client_access_state = 'documents_for_signature' THEN 'documents_for_signature'
               ELSE 'full'
             END
      FROM profiles me
      WHERE me.user_id = auth.uid()
        AND me.is_deleted = false
        AND me.role = 'client'
        AND me.contact_id IS NOT NULL
      LIMIT 1
    ),
    'none'
  );
$fn$;

CREATE OR REPLACE FUNCTION public.is_client_of_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM profiles me
    JOIN projects pr
      ON pr.id = p_project_id
     AND pr.company_id = me.company_id
     AND pr.is_deleted = false
    WHERE me.user_id = auth.uid()
      AND me.is_deleted = false
      AND me.role = 'client'
      AND me.contact_id IS NOT NULL
      AND me.client_access_state <> 'deactivated'
      AND (
        pr.contact_id = me.contact_id
        OR EXISTS (
          SELECT 1 FROM project_contacts pc
          WHERE pc.project_id = pr.id
            AND pc.contact_id = me.contact_id
            AND pc.is_deleted = false
        )
      )
      -- R5, over ALL her projects: "no standing archive access without an
      -- active project", and its converse "she sees old projects IN FULL".
      AND EXISTS (
        SELECT 1
        FROM projects ap
        WHERE ap.company_id = me.company_id
          AND ap.is_deleted = false
          AND client_window_open(ap.status, ap.actual_end_date, ap.cancelled_at)
          AND (
            ap.contact_id = me.contact_id
            OR EXISTS (
              SELECT 1 FROM project_contacts pc2
              WHERE pc2.project_id = ap.id
                AND pc2.contact_id = me.contact_id
                AND pc2.is_deleted = false
            )
          )
      )
  );
$fn$;

DROP FUNCTION IF EXISTS public.get_invitation_for_signup(uuid);
CREATE OR REPLACE FUNCTION public.get_invitation_for_signup(invite_token uuid)
RETURNS TABLE(id uuid, company_id uuid, role text, member_id uuid, contact_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    i.id,
    i.company_id,
    i.role,
    i.member_id,
    CASE WHEN i.role = 'client' THEN i.contact_id ELSE NULL END AS contact_id
  FROM invitations i
  LEFT JOIN projects pr ON pr.id = i.project_id
  WHERE i.token = invite_token
    AND i.status = 'pending'
    AND i.is_deleted = false
    AND CASE
          WHEN i.role = 'client'
            THEN pr.id IS NOT NULL
             AND pr.is_deleted = false
             AND client_window_open(pr.status, pr.actual_end_date, pr.cancelled_at)
          ELSE i.expires_at > now()
        END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(invite_token uuid)
RETURNS TABLE(id uuid, company_name text, email text, role text, expires_at timestamp with time zone)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT
    i.id,
    c.name AS company_name,
    i.email,
    i.role,
    i.expires_at
  FROM invitations i
  JOIN companies c ON c.id = i.company_id
  LEFT JOIN projects pr ON pr.id = i.project_id
  WHERE i.token = invite_token
    AND i.status = 'pending'
    AND i.is_deleted = false
    AND CASE
          WHEN i.role = 'client'
            THEN pr.id IS NOT NULL
             AND pr.is_deleted = false
             AND client_window_open(pr.status, pr.actual_end_date, pr.cancelled_at)
          ELSE i.expires_at > now()
        END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_invitation_status(invite_token uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN i.is_deleted            THEN 'unknown'
        WHEN i.status = 'accepted'   THEN 'already_used'
        WHEN i.status = 'cancelled'  THEN 'cancelled'
        WHEN i.status = 'expired'    THEN 'expired'
        WHEN i.role = 'client' THEN
          CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM projects pr
              WHERE pr.id = i.project_id
                AND pr.is_deleted = false
                AND client_window_open(pr.status, pr.actual_end_date, pr.cancelled_at)
            ) THEN 'expired'
            WHEN i.status = 'pending' THEN 'valid'
            ELSE 'unknown'
          END
        WHEN i.expires_at <= now()   THEN 'expired'
        WHEN i.status = 'pending'    THEN 'valid'
        ELSE 'unknown'
      END
      FROM invitations i
      WHERE i.token = invite_token
    ),
    'unknown'
  );
$fn$;

-- ----------------------------------------------------------------------------
-- 4. The two-argument window is gone.
-- ----------------------------------------------------------------------------
-- Dropped rather than left as a convenience overload. An overload that silently
-- ignores cancellation is exactly the second copy the ruling forbids, and it
-- would be the one a hurried caller reaches for because it has fewer arguments.
DROP FUNCTION IF EXISTS public.client_window_open(text, date);
