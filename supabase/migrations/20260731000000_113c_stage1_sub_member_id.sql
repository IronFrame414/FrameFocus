-- ============================================================================
-- 113c STAGE 1 — #105(a): subcontractors.member_id FK + one-time backfill
-- (docs/specs/113c-spec.md §2.1 / §10 step 1) [S94]
--
-- Scope: THIS STAGE ONLY. No conversion arm, no requires_formal_contract,
-- no confirm flow, no revise RPC (stages 2-5). The origin predicate, the
-- budget recomputes, record_expense_payment, and the settlement flip are
-- untouched (spec §9).
--
-- Why: today company_members ↔ subcontractors resolution is a fragile
-- display_name = company_name match (payables-client.ts flagSubDidNotFinish
-- — exactly-one-hit-or-warn). TECH_DEBT #105(a): give it a real FK.
-- #105(b) (unique-name enforcement) is explicitly NOT built here.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The FK column (spec §2.1). Nullable — an unresolved sub stays NULL and
--    is surfaced, never guessed.
-- ----------------------------------------------------------------------------

ALTER TABLE public.subcontractors
  ADD COLUMN member_id uuid REFERENCES public.company_members(id);

CREATE INDEX idx_subcontractors_member_id
  ON public.subcontractors (member_id)
  WHERE member_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. One-time backfill via the existing name-match, tightened to the
--    create_member trigger's own provenance: same company, display_name =
--    company_name, member_type = 'subcontractor', member not deleted.
--    Exactly one hit → set. Zero or 2+ → leave NULL and emit a log line
--    (RAISE WARNING) naming the sub — never guess (spec §2.1).
--
--    Soft-deleted subs are backfilled too: a trash-restored sub should come
--    back with its identity link intact.
--
--    The updated_at / updated_by triggers are disabled around the UPDATE:
--    this is a system provenance fill, not a user edit — auth.uid() is NULL
--    here and set_subcontractors_updated_by would null out updated_by on
--    every matched row.
-- ----------------------------------------------------------------------------

ALTER TABLE public.subcontractors DISABLE TRIGGER subcontractors_set_updated_by;
ALTER TABLE public.subcontractors DISABLE TRIGGER subcontractors_updated_at;

DO $$
DECLARE
  v_sub RECORD;
  v_member_id uuid;
  v_match_count integer;
  v_set integer := 0;
  v_unresolved integer := 0;
BEGIN
  FOR v_sub IN
    SELECT id, company_id, company_name
    FROM public.subcontractors
    ORDER BY created_at
  LOOP
    SELECT count(*) INTO v_match_count
    FROM public.company_members m
    WHERE m.company_id = v_sub.company_id
      AND m.member_type = 'subcontractor'
      AND m.is_deleted = false
      AND m.display_name = v_sub.company_name;

    IF v_match_count = 1 THEN
      SELECT m.id INTO v_member_id
      FROM public.company_members m
      WHERE m.company_id = v_sub.company_id
        AND m.member_type = 'subcontractor'
        AND m.is_deleted = false
        AND m.display_name = v_sub.company_name;

      UPDATE public.subcontractors
      SET member_id = v_member_id
      WHERE id = v_sub.id;
      v_set := v_set + 1;
    ELSE
      v_unresolved := v_unresolved + 1;
      RAISE WARNING '113c stage 1 backfill: subcontractor "%" (%) left NULL — % matching member(s); resolve by hand, never guessed',
        v_sub.company_name, v_sub.id, v_match_count;
    END IF;
  END LOOP;

  RAISE NOTICE '113c stage 1 backfill: % member_id set, % left NULL', v_set, v_unresolved;
END $$;

ALTER TABLE public.subcontractors ENABLE TRIGGER subcontractors_set_updated_by;
ALTER TABLE public.subcontractors ENABLE TRIGGER subcontractors_updated_at;

-- ----------------------------------------------------------------------------
-- 3. Extend subcontractors_create_member so new subs carry member_id from
--    birth (spec §2.1). Retimed AFTER INSERT → BEFORE INSERT: the function
--    now sets NEW.member_id directly, which an AFTER trigger cannot do
--    without a self-UPDATE (and that UPDATE would fire the updated_*
--    triggers on a row created this instant). Column defaults (company_id,
--    created_by) are already applied when BEFORE ROW triggers run, so the
--    company_members INSERT sees the same values as before.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_member_for_new_subcontractor()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member_id uuid;
BEGIN
  INSERT INTO company_members (company_id, profile_id, member_type, display_name, created_by)
  VALUES (NEW.company_id, NULL, 'subcontractor', NEW.company_name, NEW.created_by)
  RETURNING id INTO v_member_id;

  NEW.member_id := v_member_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER subcontractors_create_member ON public.subcontractors;
CREATE TRIGGER subcontractors_create_member
  BEFORE INSERT ON public.subcontractors
  FOR EACH ROW EXECUTE FUNCTION public.create_member_for_new_subcontractor();
