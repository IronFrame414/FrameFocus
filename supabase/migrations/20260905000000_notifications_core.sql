-- ============================================================================
-- NOTIFICATIONS — the core tables and the push plumbing. SLICE 1.
-- Spec: docs/specs/notifications-architecture.md (S123), §4 and §5.
-- ============================================================================
--
-- Four things, in one transaction:
--   1. get_my_profile_id()            — the ND-2 helper this module is built on
--   2. companies.notify_hours_*       — R4's window
--   3. push_subscriptions             — §4.4
--   4. notifications                  — §4.1
--
-- Chat (§4.2, §4.3) is NOT here. It is a later slice and shares none of this.
--
-- ============================================================================
-- ND-2 — WHY EVERY RECIPIENT IS A `profiles` ROW AND NEVER A `company_members` ONE
-- ============================================================================
-- The S89 architecture keyed notifications on "recipient member_id". Verified
-- against the live database at S123, that cannot work — for these three reasons:
--
--   · 34 of 41 live company_members rows have profile_id IS NULL. They are
--     non-login labour records for time tracking and punch assignment. Most of
--     the roster cannot sign in, so most of it cannot read a notification.
--   · `client` has NO member row at all (7 of 8 profiles have one; the client is
--     the exception), so a member-keyed table cannot address a client — which
--     Module 9's portal will need.
--   · company_members CARRIES NO ROLE, and this is the strongest reason. R7's
--     Financial Visibility Floor is applied per recipient at WRITE time and keys
--     on profiles.role. member_type cannot tell an Owner from a crew member, so
--     a member-keyed recipient has to join to profiles to be rendered at all —
--     at which point the member row is doing no work.
--
-- ⚠️ A FOURTH REASON WAS CLAIMED AND IS FALSE. The spec originally argued
--    "Owner, Admin and PM have no company_members row at all, so an FK to it
--    cannot address the Owner." Corrected [S123, slice 1] after the live harness
--    failed on it: member_type is a STAFF-VS-SUBCONTRACTOR DISCRIMINATOR, NOT A
--    ROLE. owner, admin, project_manager, foreman and crew_member ALL map to
--    member_type='crew'. The Owner does have a member row. Recorded rather than
--    quietly dropped, because the false reason is the intuitive one and will be
--    re-invented by the next person who reads member_type as a role.
--
-- The shipped precedent already resolved this correctly and is what ND-2 codifies:
-- computeIncidentRecipients() queries `profiles` by role
-- (apps/web/lib/services/incident-notify.ts:41-47).
--
-- ⚠️ THE ONE PLACE company_members IS STILL CORRECT is punch assignment —
-- punch_list_items.assignee_id REFERENCES company_members(id), and that is where
-- subcontractors genuinely live. Resolution for a notification is
-- assignee_id -> company_members.profile_id -> profiles, with subcontractors.email
-- as the email-only fallback when profile_id IS NULL (spec §13).

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. get_my_profile_id()
--
-- Deliberately the same shape as get_my_member_id() (baseline schema): STABLE,
-- SECURITY DEFINER, and SQL rather than plpgsql. CLAUDE.md → Database Patterns:
-- "plpgsql SECURITY DEFINER functions still hit RLS in some trigger contexts.
--  SQL SECURITY DEFINER functions bypass reliably. When in doubt, use SQL."
--
-- It exists because `profiles.id` and `auth.uid()` are NOT the same value —
-- auth.uid() is profiles.user_id. Every RLS policy below would otherwise carry
-- the same three-line subquery, and the first one written slightly differently
-- is a silent hole.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id
  FROM profiles p
  WHERE p.user_id = auth.uid()
    AND p.is_deleted = false
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_my_profile_id() IS
  'The caller''s profiles.id (NOT auth.uid(), which is profiles.user_id). ND-2: every notification recipient is a profile.';

-- ----------------------------------------------------------------------------
-- 2. R4 — the notify-hours window.
--
-- A company-set pair, NOT business hours: the spec is explicit that crew are
-- briefed before the day starts, so this window legitimately opens earlier than
-- the working day. Evaluated in companies.timezone, which ALREADY EXISTS (6A) and
-- is reused unchanged.
--
-- Defaults 07:00–18:00 are a starting position, not a ruling. NOT NULL so that
-- notify() never has to decide what a NULL window means — an unset window that
-- silently meant "always push" would be the worst possible default, and one that
-- meant "never push" would look like the feature is broken.
-- ----------------------------------------------------------------------------
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS notify_hours_start time NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS notify_hours_end   time NOT NULL DEFAULT '18:00';

COMMENT ON COLUMN companies.notify_hours_start IS
  'R4 notify-hours window start, in companies.timezone. NOT business hours — crew are briefed before the day starts.';
COMMENT ON COLUMN companies.notify_hours_end IS
  'R4 notify-hours window end, in companies.timezone. Outside the window: row is written, no push, nothing queued.';

-- ----------------------------------------------------------------------------
-- 3. push_subscriptions — §4.4
--
-- WHY `surface` EXISTS. ND-4 rules a SECOND, push-only service worker at
-- /dashboard rather than widening public/sw.js's '/m' scope. A push subscription
-- belongs to a REGISTRATION, so an endpoint minted by the /m worker and one
-- minted by the /dashboard worker are two different subscriptions for the same
-- human, and both must be stored and both sent to.
--
-- WHY SOFT DELETE AND NOT HARD DELETE ON 410. The spec §4.4 says a 410/404
-- response "deletes the row". CLAUDE.md's trash-bin rule says "Soft deletes only.
-- Never hard delete records", and this table is not one of the two documented
-- exceptions (it is neither an append-only log nor ephemeral). Resolved in favour
-- of the house rule: pruning sets is_deleted, and a later re-subscribe REVIVES the
-- row via the endpoint unique key rather than colliding with a tombstone. The
-- behaviour the spec asked for is preserved exactly — a dead endpoint is never
-- sent to again — without carving a third exception into the convention.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id),
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- The Web Push subscription itself. endpoint is the identity of a device+worker
  -- pair and is what a 410 is reported against, so it carries the unique key.
  endpoint      text NOT NULL,
  p256dh        text NOT NULL,
  auth          text NOT NULL,

  surface       text NOT NULL CHECK (surface IN ('mobile', 'desktop')),
  device_label  text,
  last_seen_at  timestamptz DEFAULT now(),

  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id),
  updated_by    uuid REFERENCES auth.users(id),
  is_deleted    boolean DEFAULT false,
  deleted_at    timestamptz
);

-- One row per endpoint, live or tombstoned, so re-subscribe can revive rather
-- than duplicate. Partial-unique on the live rows would let tombstones pile up
-- under the same endpoint and make "revive" ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
  ON push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_profile_id
  ON push_subscriptions (profile_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_company_id
  ON push_subscriptions (company_id);

-- CLAUDE.md → per-tenant column-defaults checklist. Without these a client
-- INSERT sends company_id = NULL, RLS compares NULL = get_my_company_id() and
-- fails with a 403 that does not point at the missing default.
ALTER TABLE push_subscriptions ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE push_subscriptions ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE push_subscriptions ALTER COLUMN updated_by SET DEFAULT auth.uid();

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Own rows only, on every verb. A push subscription is a device credential:
-- there is no role, Owner included, with a reason to read another person's
-- endpoint, and reading one is enough to send to their phone.
CREATE POLICY push_subscriptions_select_own ON push_subscriptions
  FOR SELECT TO authenticated
  USING (profile_id = get_my_profile_id());

CREATE POLICY push_subscriptions_insert_own ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = get_my_profile_id() AND company_id = get_my_company_id());

CREATE POLICY push_subscriptions_update_own ON push_subscriptions
  FOR UPDATE TO authenticated
  USING (profile_id = get_my_profile_id())
  WITH CHECK (profile_id = get_my_profile_id());

-- NO DELETE POLICY, deliberately — DELETE is denied to every role. 410 pruning
-- runs server-side under the service role (getSupabaseAdmin), which is not
-- subject to RLS, and it soft-deletes rather than deleting.

CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_push_subscriptions_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER push_subscriptions_set_updated_by
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_push_subscriptions_updated_by();

COMMENT ON TABLE push_subscriptions IS
  'Web Push endpoints, one per device+worker pair (ND-4 puts a second push-only worker at /dashboard, so one human can hold both a mobile and a desktop subscription). Own-rows-only on every verb: an endpoint is a device credential. No DELETE policy — 410 pruning runs service-role and soft-deletes.';

-- ----------------------------------------------------------------------------
-- 4. notifications — §4.1
--
-- ⚠️ THIS TABLE IS NEITHER STANDARD NOR APPEND-ONLY, AND THE DIFFERENCE IS
--    DELIBERATE. CLAUDE.md documents two shapes: the standard per-tenant table
--    (soft delete, never hard delete) and the append-only audit log (write once,
--    no updates, no deletes). This is a third thing and the columns say so:
--
--      · NOT append-only — read_at and starred are UPDATEd after insert.
--      · NOT trash-binned — the table has a BUILT-IN 30-DAY EXPIRY (R2) and a
--        cron that DELETES expired rows (§5.6). A trash bin for expired
--        notifications is an absurdity: nobody restores a notification, and
--        is_deleted would simply grow forever alongside expires_at, giving two
--        independent notions of "gone" that can disagree.
--
--    So: hard delete, no is_deleted, no deleted_at. Recorded here rather than
--    left for a reader to infer from missing columns.
--
-- ⚠️ NO INSERT POLICY FOR `authenticated`. Rows are written ONLY by notify()
--    under the service role. This is a security property, not an oversight: with
--    a client INSERT policy any signed-in user could forge a notification
--    addressed to themselves — or, worse, craft its pre-rendered text. R7 is
--    enforced in STORED BYTES (title/body are rendered per recipient at write
--    time), so the stored text has to be trustworthy for the floor to mean
--    anything.
--
-- ⚠️ WHY title/body ARE PRE-RENDERED AND NOT TEMPLATED AT READ TIME. R7: an
--    Owner's copy of "CO #3 signed — $4,200" and a PM's copy of "CO #3 signed"
--    are DIFFERENT ROWS with different bytes. Rendering at read time would put
--    the Financial Visibility Floor in the renderer, i.e. in the UI, which is
--    exactly the failure mode TECH_DEBT #117 exists to record.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES companies(id),
  recipient_profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  type text NOT NULL CHECK (type IN (
    'mention',
    'assignment',
    'incident',
    'signed',
    'reminders_exhausted',
    'discrepancy',
    'timesheet_ready',
    'daily_log_missing',
    'still_clocked_in',
    'contract_signed',
    'punch_assigned',
    'low_stock'          -- RESERVED (ND-16): M8 has no tables, so no v1 producer.
  )),

  -- R7's enforcement point. Rendered per recipient, at write time.
  title text NOT NULL,
  body  text,

  -- ND-11: a surface-agnostic KEY, not a path. One row, two destinations.
  -- link_key NULL is meaningful and is not "no link by accident" — ND-8 gives
  -- non-author PMs a CO notification with deliberately no link, because the S121
  -- read floor makes the row unreadable to them and a link would 404.
  link_key    text,
  link_params jsonb NOT NULL DEFAULT '{}'::jsonb,

  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  source_table text,
  source_id    uuid,

  read_at    timestamptz,
  starred    boolean NOT NULL DEFAULT false,
  -- R2: 30 days unless starred. NULL means "never expires", which is what
  -- starring sets it to.
  expires_at timestamptz DEFAULT (now() + interval '30 days'),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_profile_id
  ON notifications (recipient_profile_id, created_at DESC);
-- The badge query: unread and unexpired, for one recipient.
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications (recipient_profile_id) WHERE read_at IS NULL;
-- The expiry cron's sweep.
CREATE INDEX IF NOT EXISTS idx_notifications_expires_at
  ON notifications (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_company_id
  ON notifications (company_id);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ⚠️ SELECT IS OWN-ROWS-ONLY FOR EVERY ROLE, OWNER INCLUDED. Not an oversight
-- and not over-tight. R7 puts the Financial Visibility Floor in the stored text,
-- so one person reading another person's rows defeats the floor at the only
-- place it is enforced — an Owner reading a PM's rows is harmless, but the
-- policy that permits it is the same policy that would let a PM read an Owner's.
CREATE POLICY notifications_select_own ON notifications
  FOR SELECT TO authenticated
  USING (recipient_profile_id = get_my_profile_id());

-- Mark-read, star, unstar. USING and WITH CHECK both pin the recipient so a row
-- can never be reassigned to somebody else.
--
-- Column pinning is deliberately NOT added on top of this. A user can rewrite
-- their own notification's title — which discloses nothing to anybody, because
-- nobody else can read the row (see the SELECT policy above). The threat R7
-- guards against is a PM SEEING an Owner's figure, not a PM editing their own
-- copy of their own text.
CREATE POLICY notifications_update_own ON notifications
  FOR UPDATE TO authenticated
  USING (recipient_profile_id = get_my_profile_id())
  WITH CHECK (recipient_profile_id = get_my_profile_id());

-- Dismiss. The 30-day expiry cron also deletes, but it runs service-role.
CREATE POLICY notifications_delete_own ON notifications
  FOR DELETE TO authenticated
  USING (recipient_profile_id = get_my_profile_id());

-- NO INSERT POLICY — see the header block. notify() writes under the service role.

CREATE TRIGGER notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- R2, enforced in the database rather than trusted to the caller: starring
-- clears the expiry, unstarring restores a 30-day one measured from now. Putting
-- this in a trigger means the star toggle is a single-column UPDATE from the UI
-- and cannot drift from the retention rule.
CREATE OR REPLACE FUNCTION set_notifications_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.starred IS DISTINCT FROM OLD.starred THEN
    IF NEW.starred THEN
      NEW.expires_at = NULL;
    ELSE
      NEW.expires_at = now() + interval '30 days';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER notifications_set_expiry
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION set_notifications_expiry();

COMMENT ON TABLE notifications IS
  'Per-recipient notification rows. Recipients are profiles (ND-2): company_members has 34/41 rows with no login, no row at all for client, and carries no role — so R7''s floor (keyed on profiles.role) cannot be applied to a member-keyed recipient. Ephemeral by design: 30-day expiry, hard delete, no is_deleted. NO INSERT POLICY: notify() writes service-role, because R7 is enforced in the stored title/body and forged text would defeat it.';

COMMIT;
