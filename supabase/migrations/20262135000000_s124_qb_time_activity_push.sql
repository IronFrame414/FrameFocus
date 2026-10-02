-- ============================================================================
-- S124 Part 1 — APPROVED TIMESHEETS → QUICKBOOKS TIME ENTRIES, through the
-- EXISTING qb_sync_queue. No second queue, no second resolver, no second worker.
-- ============================================================================
-- [Josh, 2026-09-30] "the plan is for timesheets to sync to QB".
--
-- ⚠️ BORN GATED. Part 2 (20262134000000) shipped companies.qb_time_export_enabled
-- DEFAULT false first [Josh, RULED Q7: 0 → 2 → 1 → 3]. This trigger enqueues
-- NOTHING unless that switch is on — and only the Owner can turn it on.
-- S124 1.2 proved the production deployment talks to LIVE books.
--
-- ⚠️ NO BACKFILL [Josh, Part 2 point 2; RULED Q5 = A]. The only thing that ever
-- enqueues a time entry is an APPROVAL — the status transition into 'approved'
-- — happening while the switch is on. No sweep, no cron, no "catch up". A day
-- approved before the switch went on never moves unless a person edits and
-- re-approves it (Q5 = A, deliberately).
--
-- ⚠️ ONE ENTRY PER SESSION [Josh, RULED Q1 = A], no customer, no job: pay must
-- never wait on a customer record. JOB COSTING STAYS IN FRAMEFOCUS.
--
-- ⚠️ CREATE vs UPDATE IS CHOSEN BY THE STORED ID. A session that already carries
-- qb_time_activity_id is queued as an UPDATE, never a create (stop rule 5 —
-- QuickBooks has no PUT; a second POST is a second time entry on the same day
-- against the same person). The handler ALSO looks for its own marker before
-- any create, for the case where the id was lost (lib/quickbooks/entities.ts).
--
-- (1) qb_employee_map — crew member → QuickBooks Employee, per realm.
--     [Josh, RULED Q2 = A] chosen by a person on a matching screen; anyone
--     unmatched is held and never sent; the app NEVER creates an Employee.
--     [Josh, RULED Q4 = A] Owner-only to write; Owner/Admin may read.
--     Realm-scoped like qb_vendor_map, so a reconnect to different books can
--     never read a stale match.
-- (2) qb_enqueue_time_activity() + its AFTER UPDATE trigger on time_clock_sessions.
-- ============================================================================

-- ── (1) qb_employee_map ─────────────────────────────────────────────────────

CREATE TABLE public.qb_employee_map (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL DEFAULT get_my_company_id() REFERENCES public.companies(id),
  realm_id         text NOT NULL,
  member_id        uuid NOT NULL REFERENCES public.company_members(id),
  qb_employee_id   text NOT NULL,
  -- The name as QuickBooks showed it when the match was chosen. A label for the
  -- screen, not the match — the id is the match.
  qb_employee_name text NOT NULL,
  created_at       timestamp with time zone DEFAULT now(),
  updated_at       timestamp with time zone DEFAULT now(),
  created_by       uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by       uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  is_deleted       boolean DEFAULT false,
  deleted_at       timestamp with time zone
);

-- One live match per member per realm…
CREATE UNIQUE INDEX idx_qb_employee_map_one_per_member
  ON public.qb_employee_map (company_id, realm_id, member_id)
  WHERE is_deleted = false;
-- …and ⚠️ one member per QuickBooks Employee: two people matched to one
-- Employee would pay one person for the other's hours.
CREATE UNIQUE INDEX idx_qb_employee_map_one_per_employee
  ON public.qb_employee_map (company_id, realm_id, qb_employee_id)
  WHERE is_deleted = false;
CREATE INDEX idx_qb_employee_map_company_id ON public.qb_employee_map (company_id);

CREATE TRIGGER qb_employee_map_updated_at
  BEFORE UPDATE ON public.qb_employee_map
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION public.set_qb_employee_map_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER qb_employee_map_set_updated_by
  BEFORE UPDATE ON public.qb_employee_map
  FOR EACH ROW EXECUTE FUNCTION set_qb_employee_map_updated_by();

ALTER TABLE public.qb_employee_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY qb_employee_map_select_owner_admin ON public.qb_employee_map
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']));

CREATE POLICY qb_employee_map_insert_owner ON public.qb_employee_map
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() = 'owner'
    AND EXISTS (SELECT 1 FROM public.company_members m
                 WHERE m.id = member_id AND m.company_id = get_my_company_id())
  );

CREATE POLICY qb_employee_map_update_owner ON public.qb_employee_map
  FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id() AND get_my_role() = 'owner')
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = 'owner');

-- No DELETE policy: a match is retired by soft delete (is_deleted), Owner only.

COMMENT ON TABLE public.qb_employee_map IS
  'S124 Part 1. Crew member -> QuickBooks Employee, per realm, chosen by the Owner on Settings -> '
  'Accounting [Josh, RULED Q2/Q4]. An unmatched member''s approved day is held (parked), never sent. '
  'The app never creates a QuickBooks Employee. One member per Employee and one Employee per member.';

-- ── (2) the enqueue trigger ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.qb_enqueue_time_activity()
RETURNS TRIGGER
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- ONLY the transition INTO 'approved', on a live, closed session.
  IF NEW.status IS DISTINCT FROM 'approved'
     OR OLD.status IS NOT DISTINCT FROM 'approved'
     OR NEW.is_deleted IS DISTINCT FROM false
     OR NEW.clock_out IS NULL THEN
    RETURN NEW;
  END IF;

  -- ⚠️ THE GATE. Off (the default) → nothing is queued, and nothing remembers
  -- that it could have been: no backfill when it is later turned on.
  IF NOT EXISTS (
    SELECT 1 FROM companies c
     WHERE c.id = NEW.company_id
       AND c.qb_time_export_enabled = true
       AND c.qb_connection_state = 'connected'
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.qb_enqueue(
    NEW.company_id,
    'time_activity',
    NEW.id,
    CASE WHEN NEW.qb_time_activity_id IS NULL THEN 'create' ELSE 'update' END,
    NULL
  );
  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Never block an approval on the QuickBooks queue. The day stays approved; it
  -- simply was not queued, which the Accounting screen's flag shows.
  RAISE WARNING '[S124] time_activity enqueue failed for session %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.qb_enqueue_time_activity() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.qb_enqueue_time_activity() IS
  'S124 Part 1. Queues time_activity create/update on the transition into approved, ONLY while '
  'companies.qb_time_export_enabled is on and connected. Update when qb_time_activity_id is stored, '
  'never a create. No backfill path exists.';

CREATE TRIGGER time_clock_sessions_qb_enqueue
  AFTER UPDATE OF status ON public.time_clock_sessions
  FOR EACH ROW EXECUTE FUNCTION public.qb_enqueue_time_activity();
