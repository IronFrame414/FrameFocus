-- ============================================================================
-- RULING 2 — APPROVED and applied S97 (2026-08-02).
--
-- STEP 1 of 4. This migration is a PURE ADDITION: it creates and backfills the
-- new table and takes nothing away. projects.contract_value survives until the
-- code is proven (step 4), and until then it remains the rollback.
--
-- RULING 2 (Josh, S97 2026-08-02): PM, Foreman and Crew must not READ
-- projects.contract_value. Assertions 7b/7c have failed since d395c01.
--
-- WHY A SCHEMA MOVE AND NOT A POLICY. Postgres RLS is ROW-level. There is no
-- column-level equivalent, and the three alternatives were ruled out with
-- evidence in the S97 mechanism report:
--   - column GRANT/REVOKE: all app users share the `authenticated` Postgres
--     role, so revoking hits Owner too; and getProject/getProjects use
--     `select('*, contact:…')`, which Postgres rejects outright when the role
--     lacks privilege on ANY column. Every project screen, every role, dead.
--   - a masking view: works, but every read moves to the view (28 call sites)
--     while writes stay on the table — the model splits.
--   - a read trigger: does not exist in Postgres.
-- Moving the column to its own row-level-secured table is the only option that
-- uses the mechanism the codebase already relies on everywhere else.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. The table. One row per project, created lazily — a project with no
--    contract value simply has no row, which reads the same as NULL does today.
-- ----------------------------------------------------------------------------
CREATE TABLE public.project_financials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),

    project_id uuid NOT NULL,
    contract_value numeric,

    CONSTRAINT project_financials_pkey PRIMARY KEY (id),
    CONSTRAINT project_financials_project_unique UNIQUE (project_id)
);

ALTER TABLE ONLY public.project_financials
    ADD CONSTRAINT project_financials_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.project_financials
    ADD CONSTRAINT project_financials_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

CREATE INDEX idx_project_financials_company_id ON public.project_financials USING btree (company_id);
CREATE INDEX idx_project_financials_project_id ON public.project_financials USING btree (project_id);

-- Standard trigger pair (CLAUDE.md).
CREATE TRIGGER project_financials_updated_at
  BEFORE UPDATE ON public.project_financials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_project_financials_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER project_financials_set_updated_by
  BEFORE UPDATE ON public.project_financials
  FOR EACH ROW EXECUTE FUNCTION public.set_project_financials_updated_by();

-- ----------------------------------------------------------------------------
-- 2. RLS — the whole point. Owner/Admin only, on every verb.
--    No can_view_project(): assignment is irrelevant here. A PM assigned to the
--    job still must not see the contract value (Financial Visibility Floor).
-- ----------------------------------------------------------------------------
ALTER TABLE public.project_financials ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_financials_select_owner_admin ON public.project_financials
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY project_financials_insert_owner_admin ON public.project_financials
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY project_financials_update_owner_admin ON public.project_financials
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

-- No DELETE policy: the row dies with its project via ON DELETE CASCADE.

-- ----------------------------------------------------------------------------
-- 3. Data migration. Every project that HAS a value gets a row; projects with
--    NULL get none. Runs as the migration role, so the defaults that call
--    get_my_company_id() are bypassed by setting company_id explicitly.
-- ----------------------------------------------------------------------------
INSERT INTO public.project_financials (company_id, project_id, contract_value)
SELECT p.company_id, p.id, p.contract_value
FROM public.projects p
WHERE p.contract_value IS NOT NULL;

-- Verification, inline: the migration ABORTS if a single value failed to move.
DO $$
DECLARE
  v_missing integer;
BEGIN
  SELECT count(*) INTO v_missing
  FROM public.projects p
  LEFT JOIN public.project_financials f ON f.project_id = p.id
  WHERE p.contract_value IS NOT NULL
    AND (f.id IS NULL OR f.contract_value IS DISTINCT FROM p.contract_value);

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'project_financials backfill incomplete: % projects did not move', v_missing;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Convert the SQL-side writer.
--
--    convert_estimate_to_project() is SECURITY DEFINER and sets the new
--    project's contract value from the accepted estimate. It must write the new
--    table instead. NOT INCLUDED HERE as a full body — the function is long and
--    replacing it demands the byte-exact-declaration treatment against the LIVE
--    definition at apply time, not against a copy taken days earlier. The
--    change itself is two lines:
--
--      - drop `contract_value` from the INSERT INTO projects (...) column list
--        and its matching v_contract_value from the VALUES list;
--      - after the project row is created, add:
--
--          IF v_contract_value IS NOT NULL THEN
--            INSERT INTO project_financials (company_id, project_id, contract_value)
--            VALUES (v_company_id, v_project_id, v_contract_value);
--          END IF;
--
--    It is SECURITY DEFINER, so the Owner/Admin RLS on project_financials does
--    NOT block it — which is correct: conversion is a PM-permitted action and
--    the value comes from the estimate, not from the PM.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 5. Retirement of projects.contract_value — RECOMMENDATION: KEEP IT FOR NOW.
--
--    DO NOT DROP THE COLUMN IN THIS MIGRATION. Recommended sequence:
--
--      step 1 (this migration)  create + backfill + RLS. Column still present,
--                               still readable, still the source of truth for
--                               any site not yet moved.
--      step 2 (code deploy)     move every call site in the plan.
--      step 3 (soak)            run the live suite; 7b/7c flip to PASS the
--                               moment the code reads the new table, because
--                               they assert on what a PM can READ, not on where
--                               it is stored.
--      step 4 (follow-up)       a second migration drops projects.contract_value
--                               once nothing reads it.
--
--    WHY, and this is the whole argument: dropping the column in step 1 makes
--    the change ATOMIC AND IRREVERSIBLE at the worst moment. A star-select
--    (`select('*, contact:…')`) does not error when a column disappears — it
--    silently returns a row without that key, and `project.contract_value`
--    becomes `undefined`. Every screen keeps rendering; the contract value just
--    quietly reads as absent, for OWNERS TOO. That is the failure mode you least
--    want and least easily notice, and it is exactly what §3's "what breaks"
--    describes.
--
--    Keeping the column means step 1 is a PURE ADDITION: nothing reads the new
--    table yet, nothing has been taken away, and the migration is reversible
--    with a single DROP TABLE. The exposure 7b/7c describe persists for one more
--    deploy, which it has already done since d395c01 — one more deploy is a
--    cheaper price than an un-rollback-able silent-null bug.
--
--    THE TRADE-OFF, stated plainly: between step 1 and step 4 the value lives in
--    TWO places and can drift if a write path is missed. That is why §2 of the
--    plan lists the writers exhaustively and why the drop must not be deferred
--    indefinitely — it should land in the same session, not the same quarter.
-- ----------------------------------------------------------------------------

COMMIT;

-- ============================================================================
-- STEP 4 (a SEPARATE migration, after the code deploy soaks):
--
--   ALTER TABLE public.projects DROP COLUMN contract_value;
--
-- Before running it, confirm nothing reads the column:
--   grep -rn "contract_value" apps/web --include=*.ts --include=*.tsx \
--     | grep -v project_financials | grep -v subcontractor | grep -v client_contract
-- must return only comments.
-- ============================================================================
