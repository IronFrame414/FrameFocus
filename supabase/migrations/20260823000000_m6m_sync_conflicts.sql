-- ============================================================================
-- M6M §7b / §5.7 — Required migration 2 of 2: the conflict holding store
-- (D-17, extended [S98]).
-- ============================================================================
--
-- WHY
--   D-17: when a queued offline mutation targets a row the server has changed
--   since capture, THE SERVER VERSION STANDS — but the queued copy is neither
--   overwritten nor discarded. It leaves the sync queue and enters Owner/Admin
--   reconciliation review. This table is where it waits.
--
--   Extended [S98]: the held copy goes to a SERVER-SIDE table, not IndexedDB.
--   A store that survives only while the app does would satisfy the old
--   criterion and still lose the work on a cleared PWA or a new handset
--   (A-19g is the criterion that ruling exists for).
--
--   Ordering: this must land BEFORE ANY OFFLINE WRITE PATH SHIPS, and no later.
--   Shipping the queue first would mean a conflict path with nowhere to put a
--   conflict. It is independent of §7a and may land in either order relative
--   to it.
--
-- ---------------------------------------------------------------------------
-- BUILD TRAP — READ BEFORE WRITING THE CLIENT (§5.7)
-- ---------------------------------------------------------------------------
--   The author of a held copy CAN INSERT their conflict row and CANNOT SELECT
--   IT BACK — they are not Owner/Admin. The client must therefore insert
--   WITHOUT requesting the representation: no `.select()` chained onto the
--   insert. With one chained, PostgREST performs the read, RLS refuses it, and
--   THE WRITE LOOKS LIKE IT FAILED WHEN IT SUCCEEDED. Same class as the
--   storage-policy helper trap in CLAUDE.md: the error surfaces far from its
--   cause. Asserted by A-19j.
--
-- ---------------------------------------------------------------------------
-- WHY THERE IS NO SNAPSHOT OF THE SERVER ROW (§5.7, deliberate omission)
-- ---------------------------------------------------------------------------
--   A reviewer choosing between the field copy and the desktop version must
--   see the desktop version AS IT IS NOW, not as it stood at detection — the
--   row may have been edited again since. `server_updated_at` records the race;
--   the LIVE row supplies the content. Storing a stale snapshot would let a
--   reviewer "keep" a version that no longer exists. Do not add one.
--   Asserted by A-19l.
--
-- ---------------------------------------------------------------------------
-- WHY THE SHAPE IS GENERIC WHEN THE RULING NAMED THE DAILY LOG (§5.7)
-- ---------------------------------------------------------------------------
--   §5.6's comparison applies to any queued mutation targeting an EXISTING
--   row, so this is keyed by (target_table, target_row_id) rather than by a
--   daily_log_id column. In v1 the daily log is the only producer, and that is
--   not an accident: a clock-in and a photo are INSERTs, and A-19f rules an
--   insert is never a conflict. The CHECK is pinned to 'daily_logs'; widening
--   it later is a one-line change, whereas a daily_log_id column would have had
--   to be migrated away.
--
-- NOT an append-only log — it has a resolution lifecycle, so it takes the full
-- standard column set, both BEFORE UPDATE triggers and the three column
-- defaults. Evidence: A-19g, A-19i, A-19j, A-19k, A-19l ([live]); A-19h is
-- [unit] and belongs to the queue, not to this migration.
-- ============================================================================


CREATE TABLE public.sync_conflicts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id),

  -- The target is identified by (table, row id). NO FK on target_row_id: the
  -- target table varies, and a FK to one table would block the CHECK ever
  -- widening beyond 'daily_logs'.
  target_table      TEXT NOT NULL,
  target_row_id     UUID NOT NULL,

  -- Denormalised so a future review surface can scope and filter without
  -- joining through the target row.
  project_id        UUID REFERENCES public.projects(id),

  -- The queued payload exactly as the online path would have sent it (§5.2).
  rejected_body     JSONB NOT NULL,

  -- The BUSINESS timestamp from the queue entry — when the field user acted,
  -- NOT when the conflict was detected. No default: the client supplies it.
  captured_at       TIMESTAMPTZ NOT NULL,

  -- The field user whose work is being held.
  author_member_id  UUID NOT NULL REFERENCES public.company_members(id),

  -- The target row's updated_at AT DETECTION — the value that lost the
  -- comparison, kept so a reviewer can see the race that occurred.
  server_updated_at TIMESTAMPTZ NOT NULL,

  status            TEXT NOT NULL DEFAULT 'pending',
  resolved_by       UUID REFERENCES public.company_members(id),
  resolved_at       TIMESTAMPTZ,
  resolution_note   TEXT,

  -- Standard columns (full set — this is not an append-only log).
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  created_by        UUID REFERENCES auth.users(id),
  updated_by        UUID REFERENCES auth.users(id),
  is_deleted        BOOLEAN DEFAULT false,
  deleted_at        TIMESTAMPTZ,

  CONSTRAINT sync_conflicts_target_table_check
    CHECK (target_table = ANY (ARRAY['daily_logs'::text])),
  CONSTRAINT sync_conflicts_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'kept_server'::text, 'kept_field'::text, 'dismissed'::text]))
);


-- Per-tenant column defaults (CLAUDE.md) — without these a client INSERT sends
-- company_id NULL, RLS compares NULL = get_my_company_id() -> false, and the
-- insert fails with a 403 that does not obviously point at the missing default.
ALTER TABLE public.sync_conflicts ALTER COLUMN company_id SET DEFAULT public.get_my_company_id();
ALTER TABLE public.sync_conflicts ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.sync_conflicts ALTER COLUMN updated_by SET DEFAULT auth.uid();


-- Indexes. §5.7 specifies none; these follow the house naming convention and
-- the reads §5.7 describes: company scoping, and project_id which exists
-- SPECIFICALLY so a review surface can filter without joining the target row.
CREATE INDEX idx_sync_conflicts_company_id ON public.sync_conflicts USING btree (company_id);
CREATE INDEX idx_sync_conflicts_project_id ON public.sync_conflicts USING btree (project_id);


-- Standard triggers. update_updated_at() is the shared function from Migration
-- 001 — reused, never redefined.
CREATE TRIGGER sync_conflicts_updated_at
  BEFORE UPDATE ON public.sync_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_sync_conflicts_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER sync_conflicts_set_updated_by
  BEFORE UPDATE ON public.sync_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.set_sync_conflicts_updated_by();


-- ----------------------------------------------------------------------------
-- RLS. Reconciliation is an Owner/Admin job (D-17).
--
-- THERE IS NO DELETE POLICY, DELIBERATELY. Supabase grants table-level DELETE
-- to `authenticated` by default, so RLS is the only gate: with no permissive
-- DELETE policy, DELETE is denied to EVERY role. Resolved rows are the audit
-- trail of a near-miss data loss and are kept, never removed (trash-bin rule,
-- soft delete only). Matches the financial side tables. Asserted by A-19k.
-- ----------------------------------------------------------------------------

ALTER TABLE public.sync_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_conflicts_select_owner_admin ON public.sync_conflicts
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- The author writes their own conflict during sync; Owner/Admin may also write
-- one. The author cannot read it back — see the BUILD TRAP above.
CREATE POLICY sync_conflicts_insert_authorized ON public.sync_conflicts
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      author_member_id = public.get_my_member_id()
      OR public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

-- This is how a row is resolved. §5.7 states one predicate; it is applied to
-- BOTH arms so a resolving Owner/Admin cannot move a row to another company on
-- the way through — the same shape as files_update_non_client.
CREATE POLICY sync_conflicts_update_owner_admin ON public.sync_conflicts
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );
