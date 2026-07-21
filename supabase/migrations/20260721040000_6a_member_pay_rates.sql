-- ============================================================================
-- Module 6 / 6A — Effective-dated member pay rates + approval-time rate
-- snapshots (owed backend from the S85 build report; approved S85 decisions
-- 1–9 of the pay-rate interview).
--
-- ⚠️ WRITTEN, NOT APPLIED. Josh applies manually (rebuild-test first, after
-- 20260721030000). Run `npm run db:push` after applying to regenerate types —
-- the pay-rate service files call these tables through untyped-narrowed
-- helpers until then.
--
-- MODEL:
--   * member_pay_rates — effective-dated rate rows. A rate applies from its
--     effective_date (company-tz calendar DATE) FORWARD; each day prices at
--     the rate effective that day, so a mid-week raise legitimately splits a
--     week. Rates are Financial-Visibility-Floor data: Owner/Admin-only RLS,
--     deliberately NOT a column on the company-readable company_members.
--   * time_session_rate_snapshots — write-once freeze rows. At the moment a
--     session is APPROVED, the rate effective on its clock-in date (company
--     tz) is snapshotted. Approved sessions price from their snapshot FOREVER:
--     backdated rate changes affect only unapproved/future sessions. A session
--     approved with no rate on file freezes a NULL rate and never reprices
--     (decision 5). Snapshots live in their own Owner/Admin-only table — a
--     column on time_clock_sessions would leak the rate to every supervisor
--     who can read the session row.
--   * OT pricing (first 40h straight, later hours 1.5x, chronological
--     attribution) is DERIVED at read time in
--     packages/shared/utils/time-tracking.ts (weekLaborCost) — never stored.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. member_pay_rates
-- ----------------------------------------------------------------------------

CREATE TABLE public.member_pay_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    member_id uuid NOT NULL,
    hourly_rate numeric(10,2) NOT NULL,
    effective_date date NOT NULL,   -- company-tz calendar date; applies forward

    CONSTRAINT member_pay_rates_pkey PRIMARY KEY (id),
    CONSTRAINT member_pay_rates_rate_positive_check CHECK (hourly_rate >= 0)
);

ALTER TABLE ONLY public.member_pay_rates
    ADD CONSTRAINT member_pay_rates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.member_pay_rates
    ADD CONSTRAINT member_pay_rates_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.company_members(id);
ALTER TABLE ONLY public.member_pay_rates
    ADD CONSTRAINT member_pay_rates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.member_pay_rates
    ADD CONSTRAINT member_pay_rates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_member_pay_rates_company_id ON public.member_pay_rates USING btree (company_id);
CREATE INDEX idx_member_pay_rates_member_id ON public.member_pay_rates USING btree (member_id);

-- One live rate row per member per effective date.
CREATE UNIQUE INDEX idx_member_pay_rates_member_effective
  ON public.member_pay_rates (member_id, effective_date)
  WHERE (is_deleted = false);

CREATE TRIGGER member_pay_rates_updated_at
  BEFORE UPDATE ON public.member_pay_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_member_pay_rates_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER member_pay_rates_set_updated_by
  BEFORE UPDATE ON public.member_pay_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_member_pay_rates_updated_by();

ALTER TABLE public.member_pay_rates ENABLE ROW LEVEL SECURITY;

-- Financial Visibility Floor: Owner/Admin only, reads AND writes. No DELETE
-- policy — soft-delete is an UPDATE.
CREATE POLICY member_pay_rates_select_admin ON public.member_pay_rates
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY member_pay_rates_insert_admin ON public.member_pay_rates
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY member_pay_rates_update_admin ON public.member_pay_rates
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- ----------------------------------------------------------------------------
-- 2. time_session_rate_snapshots — write-once freeze rows.
--    Not the standard-columns shape on purpose: rows are created exactly once
--    by the snapshot trigger and never updated or deleted (no updated_*, no
--    soft-delete, no UPDATE/DELETE policies). ON DELETE CASCADE on session_id:
--    a snapshot is meaningless without its session (sessions are soft-deleted
--    in practice; hard deletes don't occur).
-- ----------------------------------------------------------------------------

CREATE TABLE public.time_session_rate_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),

    session_id uuid NOT NULL,
    member_id uuid,
    hourly_rate numeric(10,2),        -- NULL = approved with no rate on file; frozen, never reprices (decision 5)
    rate_effective_date date,         -- the rate row's effective_date, NULL when hourly_rate is NULL

    CONSTRAINT time_session_rate_snapshots_pkey PRIMARY KEY (id),
    CONSTRAINT time_session_rate_snapshots_session_unique UNIQUE (session_id)
);

ALTER TABLE ONLY public.time_session_rate_snapshots
    ADD CONSTRAINT time_session_rate_snapshots_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.time_session_rate_snapshots
    ADD CONSTRAINT time_session_rate_snapshots_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.time_clock_sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.time_session_rate_snapshots
    ADD CONSTRAINT time_session_rate_snapshots_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.company_members(id) ON DELETE SET NULL;

CREATE INDEX idx_time_session_rate_snapshots_company_id ON public.time_session_rate_snapshots USING btree (company_id);
CREATE INDEX idx_time_session_rate_snapshots_member_id ON public.time_session_rate_snapshots USING btree (member_id);

ALTER TABLE public.time_session_rate_snapshots ENABLE ROW LEVEL SECURITY;

-- Owner/Admin-only SELECT (the whole point of the separate table). INSERT
-- policy exists per convention; in practice rows are written by the
-- SECURITY DEFINER trigger below. No UPDATE/DELETE policies — write-once.
CREATE POLICY time_session_rate_snapshots_select_admin ON public.time_session_rate_snapshots
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY time_session_rate_snapshots_insert_authenticated ON public.time_session_rate_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());

-- ----------------------------------------------------------------------------
-- 3. Snapshot trigger — freeze the rate at the moment of approval.
--    SECURITY DEFINER so a PM's approval snapshots a rate the PM cannot read
--    (member_pay_rates is Owner/Admin-only). ON CONFLICT DO NOTHING keeps the
--    FIRST snapshot authoritative even if a session is ever un-approved and
--    re-approved — frozen means frozen.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.snapshot_session_rate()
RETURNS TRIGGER AS $$
DECLARE
  v_local_date date;
  v_rate numeric(10,2);
  v_effective date;
BEGIN
  -- Only the pending->approved transition (or a direct approved INSERT).
  IF TG_OP = 'UPDATE' AND (OLD.status IS NOT DISTINCT FROM NEW.status) THEN
    RETURN NULL;
  END IF;
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NULL;
  END IF;

  -- The session's calendar date in the COMPANY timezone (decision 8: an
  -- overnight session prices entirely at its clock-in date).
  SELECT (NEW.clock_in AT TIME ZONE c.timezone)::date
  INTO v_local_date
  FROM companies c
  WHERE c.id = NEW.company_id;

  -- Rate effective that day: latest effective_date <= the session date.
  SELECT r.hourly_rate, r.effective_date
  INTO v_rate, v_effective
  FROM member_pay_rates r
  WHERE r.member_id = NEW.member_id
    AND r.company_id = NEW.company_id
    AND r.is_deleted = false
    AND r.effective_date <= v_local_date
  ORDER BY r.effective_date DESC
  LIMIT 1;

  -- Always write the freeze row — a NULL rate is itself frozen (decision 5).
  INSERT INTO time_session_rate_snapshots (company_id, session_id, member_id, hourly_rate, rate_effective_date)
  VALUES (NEW.company_id, NEW.id, NEW.member_id, v_rate, v_effective)
  ON CONFLICT (session_id) DO NOTHING;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER time_clock_sessions_rate_snapshot_insert
  AFTER INSERT ON public.time_clock_sessions
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_session_rate();

CREATE TRIGGER time_clock_sessions_rate_snapshot_update
  AFTER UPDATE ON public.time_clock_sessions
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_session_rate();
