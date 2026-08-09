-- ============================================================================
-- TECH_DEBT #132 — the sub RATE, MARKUP and TAX ID become Owner/Admin, in the
-- DATABASE. RULED [Josh, S122].
-- ============================================================================
--
--   "OWNER AND ADMIN ONLY, for all three: default_hourly_rate,
--    default_markup_percent and ein. Same answer for each. This is a real
--    floor, not a UI gate."
--
-- WHAT WAS TRUE BEFORE THIS MIGRATION. `subcontractors_select_authenticated`
-- is `company_id = <caller's company> AND is_deleted = false` and NOTHING
-- else — no role arm at all. `getSubcontractors()` and `getSubcontractor()`
-- both `select('*')`. So `default_hourly_rate`, `default_markup_percent` and
-- `ein` were in the payload for crew_member, foreman, project_manager and
-- subcontractor alike, on every screen that lists subs. M6M §4.13.4 cut all
-- three from the mobile M-27 screen and said in the spec that the cut was
-- UI-ONLY. This makes it real.
--
--   default_markup_percent  is the company's MARGIN on that sub — precisely
--                           the class the Financial Visibility Floor keeps
--                           from PM/foreman/crew everywhere else.
--   default_hourly_rate     a cost rate, adjacent to instrument_rates, which
--                           IS already DB-floored Owner/Admin (20260806000000).
--   ein                     a tax identifier. Not a visibility question at
--                           all — a PII one.
--
-- ============================================================================
-- WHY A SIDE TABLE AND NOT A POLICY — #117's SHAPE, FOR #117's REASON
-- ============================================================================
-- Postgres RLS is ROW-level. There is no column-level equivalent, and the
-- alternatives were ruled out with evidence when contract_value and
-- budgeted_amount were moved (20260811000000, 20260816000000):
--   · column GRANT/REVOKE — every app user shares the `authenticated` role, so
--     revoking hits Owner too; and a `select('*')` is rejected outright when
--     the role lacks privilege on ANY column, which would kill every sub
--     screen for every role.
--   · a masking view — works, but reads move to the view while writes stay on
--     the table, and the model splits.
--   · a read trigger — does not exist in Postgres.
-- Moving the columns to their own row-level-secured table is the only option
-- that uses the mechanism this codebase already relies on everywhere else.
-- This is the THIRD time it has been applied, so it is a house pattern now.
--
-- ⚠️ THE #117 CARVE-OUT DOES NOT APPLY HERE, and that is why this one CAN be
-- floored. `change_orders.net_delta` stayed UI-only because a PM must be able
-- to author COs and read the value of the ones they write — flooring it would
-- break authoring. There is no equivalent claim for these three: nothing below
-- Admin writes them, and the one client-side reader that fetched
-- `default_markup_percent` (the 4D bidding tab's picker) NEVER USED IT — the
-- select renders `company_name` only. Verified S122: zero references to
-- `.default_markup_percent` outside the Owner/Admin form and a live harness.
-- That dead fetch is removed in the same commit.
--
-- ============================================================================
-- ONE TRANSACTION, CREATE THROUGH DROP — deliberately unlike #117's four-step
-- ============================================================================
-- contract_value and budgeted_amount were split across sessions (add+backfill,
-- then retarget, then drop) because application code shipped BETWEEN the
-- steps, and a transitional sync trigger was needed to stop the two copies
-- drifting. Here the migration and every code change land in the SAME commit,
-- so there is no window in which both copies exist and can disagree. A split
-- would create the drift risk it was designed to manage.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. The table. One row per subcontractor, created lazily — a sub with none of
--    the three values simply has no row, which reads the same as NULL does now.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subcontractor_financials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),

    subcontractor_id uuid NOT NULL,

    default_hourly_rate numeric,
    default_markup_percent numeric,
    ein text,

    CONSTRAINT subcontractor_financials_pkey PRIMARY KEY (id),
    CONSTRAINT subcontractor_financials_subcontractor_id_key UNIQUE (subcontractor_id)
);

ALTER TABLE public.subcontractor_financials
  DROP CONSTRAINT IF EXISTS subcontractor_financials_subcontractor_id_fkey;
ALTER TABLE public.subcontractor_financials
  ADD CONSTRAINT subcontractor_financials_subcontractor_id_fkey
  FOREIGN KEY (subcontractor_id) REFERENCES public.subcontractors(id) ON DELETE CASCADE;

ALTER TABLE public.subcontractor_financials
  DROP CONSTRAINT IF EXISTS subcontractor_financials_company_id_fkey;
ALTER TABLE public.subcontractor_financials
  ADD CONSTRAINT subcontractor_financials_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id);

CREATE INDEX IF NOT EXISTS idx_subcontractor_financials_company_id
  ON public.subcontractor_financials (company_id);
CREATE INDEX IF NOT EXISTS idx_subcontractor_financials_subcontractor_id
  ON public.subcontractor_financials (subcontractor_id);

-- Per-tenant column defaults, so a client INSERT passes RLS without the caller
-- setting them by hand (CLAUDE.md's checklist — migration 022 was a fix for
-- exactly this miss).
ALTER TABLE public.subcontractor_financials ALTER COLUMN company_id SET DEFAULT public.get_my_company_id();
ALTER TABLE public.subcontractor_financials ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.subcontractor_financials ALTER COLUMN updated_by SET DEFAULT auth.uid();

-- ----------------------------------------------------------------------------
-- 2. Standard triggers — both, in the migration that creates the table.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS subcontractor_financials_updated_at ON public.subcontractor_financials;
CREATE TRIGGER subcontractor_financials_updated_at
  BEFORE UPDATE ON public.subcontractor_financials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_subcontractor_financials_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS subcontractor_financials_set_updated_by ON public.subcontractor_financials;
CREATE TRIGGER subcontractor_financials_set_updated_by
  BEFORE UPDATE ON public.subcontractor_financials
  FOR EACH ROW EXECUTE FUNCTION public.set_subcontractor_financials_updated_by();

-- ----------------------------------------------------------------------------
-- 3. THE FLOOR. Owner/Admin for SELECT, INSERT and UPDATE — and NO DELETE
--    POLICY AT ALL, which denies DELETE to every role including Owner. That
--    matches project_financials and project_budget_amounts exactly: the row
--    goes when the parent sub does, via ON DELETE CASCADE, and never on its
--    own.
-- ----------------------------------------------------------------------------
ALTER TABLE public.subcontractor_financials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subcontractor_financials_select_owner_admin ON public.subcontractor_financials;
CREATE POLICY subcontractor_financials_select_owner_admin
  ON public.subcontractor_financials FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner', 'admin'])
  );

DROP POLICY IF EXISTS subcontractor_financials_insert_owner_admin ON public.subcontractor_financials;
CREATE POLICY subcontractor_financials_insert_owner_admin
  ON public.subcontractor_financials FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner', 'admin'])
  );

DROP POLICY IF EXISTS subcontractor_financials_update_owner_admin ON public.subcontractor_financials;
CREATE POLICY subcontractor_financials_update_owner_admin
  ON public.subcontractor_financials FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner', 'admin'])
  );

-- ----------------------------------------------------------------------------
-- 4. Backfill. Only rows that actually carry a value — a sub with all three
--    NULL gets no row, which is the lazy-creation shape above.
-- ----------------------------------------------------------------------------
INSERT INTO public.subcontractor_financials
  (company_id, subcontractor_id, default_hourly_rate, default_markup_percent, ein, created_by, updated_by)
SELECT s.company_id, s.id, s.default_hourly_rate, s.default_markup_percent, s.ein, s.created_by, s.updated_by
FROM public.subcontractors s
WHERE (s.default_hourly_rate IS NOT NULL
       OR s.default_markup_percent IS NOT NULL
       OR s.ein IS NOT NULL)
ON CONFLICT (subcontractor_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Drop the old columns. This is what makes the floor REAL rather than
--    advisory — while they exist, `select('*')` keeps shipping them to every
--    role and the side table is decoration.
-- ----------------------------------------------------------------------------
ALTER TABLE public.subcontractors DROP COLUMN IF EXISTS default_hourly_rate;
ALTER TABLE public.subcontractors DROP COLUMN IF EXISTS default_markup_percent;
ALTER TABLE public.subcontractors DROP COLUMN IF EXISTS ein;

COMMENT ON TABLE public.subcontractor_financials IS
  'TECH_DEBT #132 [S122]. Owner/Admin-only side table holding the three sub '
  'figures that must not reach PM, foreman, crew or subcontractors: '
  'default_hourly_rate, default_markup_percent (the company margin on that '
  'sub) and ein (PII). Split off subcontractors because RLS is row-level and '
  'subcontractors_select_authenticated has no role arm -- the same reason '
  'contract_value and budgeted_amount were moved. SELECT/INSERT/UPDATE are '
  'Owner/Admin; there is NO DELETE policy, so DELETE is denied to every role '
  'and the row goes only with its parent via ON DELETE CASCADE.';

COMMIT;
