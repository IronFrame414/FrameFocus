-- ============================================================================
-- M5-02 [S163] — `status` joins the column-scope trigger, and the two status
--                rules stop being browser-only.
-- ============================================================================
--
-- Finding: `docs/specs/S161-m5-audit.md` M5-02. Ruling: Josh, S163 —
-- *"authority belongs in the database, and a service-layer-only gate fails
-- open."*
--
-- ----------------------------------------------------------------------------
-- WHAT WAS WRONG
-- ----------------------------------------------------------------------------
-- `transitionProjectStatus()` (`lib/services/projects-client.ts:135`) enforces
-- three things IN THE BROWSER. `projects_update_authorized` enforced none of
-- them, and `status` was not among the four columns this trigger froze.
--
-- PROVEN [S161 B1/B2], as an assigned PM, one PostgREST call each:
--   · a `complete` project was set back to `active` — 1 row, no error.
--     7A §3.4 makes the reopen Owner/Admin only.
--   · a project with OPEN punch items was set to `complete` — 1 row, no error.
--     5A §2 / 5C §6 make that the punch gate.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS ENFORCES, AND WHAT IT DELIBERATELY DOES NOT
-- ----------------------------------------------------------------------------
-- ENFORCED HERE:
--   1. `complete -> active` requires owner/admin.
--   2. Moving INTO `complete` requires every punch item closed — matching
--      `checkPunchGate()` exactly: blocking is `status IN ('open','in_progress')`
--      OR (`status = 'complete'` AND `requires_verification`), over
--      `is_deleted = false`.
--
-- NOT ENFORCED HERE — the full transition table (`STATUS_TRANSITIONS`).
-- The service refuses e.g. `archived -> active`; this trigger does not. That is
-- a lifecycle model with five states and ten legal edges, and encoding it in
-- plpgsql duplicates a table that lives in TypeScript and will drift. **The two
-- rules above are the ones with an authorization or data-integrity consequence**
-- — the rest is workflow. Recorded as a deliberate boundary, not an oversight.
--
-- ⚠️ THE PUNCH GATE RUNS FOR OWNER/ADMIN TOO, so it is placed BEFORE the
-- owner/admin early return rather than after it. `checkPunchGate()` runs for
-- every role, and a gate that an Owner can walk through is not a gate. This
-- reorders the function: status rules first, then the existing column freezes.
--
-- ⚠️ THE SERVICE-ROLE ESCAPE IS PRESERVED, UNCHANGED. `auth.uid() IS NULL`
-- still returns early. `convert_estimate_to_project`, the trial deletion job and
-- every harness fixture write project status through the service role and must
-- keep working. This is the same exemption the function already had.
--
-- ----------------------------------------------------------------------------
-- ⚠️ THE THREE PROJECTS ALREADY IN AN INVALID STATE ARE NOT REPAIRED. RULED.
-- ----------------------------------------------------------------------------
-- Three projects on rebuild-test are `active` (or reachable) with open punch
-- items, and one is `complete`. **This migration does not touch a single row.**
-- Josh's ruling: *"A migration that silently rewrites project status is riskier
-- than three records Josh corrects knowingly."* They are listed in the S163
-- report with their ids.
--
-- Note this trigger is BEFORE UPDATE and only fires on an UPDATE, so existing
-- rows are unaffected until somebody moves them — at which point the gate
-- applies, which is the intended behaviour.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_projects_column_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_blocking integer;
BEGIN
  -- Service-role clients have no auth context; RLS already doesn't apply to
  -- them and this trigger must not break their writes.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- ==========================================================================
  -- STATUS RULES [M5-02, S163] — BEFORE the owner/admin early return, because
  -- the punch gate binds every role.
  -- ==========================================================================
  IF NEW.status IS DISTINCT FROM OLD.status THEN

    -- 7A §3.4 — the REOPEN is Owner/Admin only. `transitionProjectStatus()`
    -- checks this against an `opts.userRole` the CALLER supplies, and against a
    -- `from` the caller also supplies; both are advisory. This is not.
    IF OLD.status = 'complete' AND NEW.status = 'active'
       AND public.get_my_role() <> ALL (ARRAY['owner'::text, 'admin'::text]) THEN
      RAISE EXCEPTION 'Only an Owner or Admin can reopen a completed project.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- 5A §2 / 5C §6 — the PUNCH GATE. An item is closed when verified (where
    -- verification is required) or complete (where it is not). Open and
    -- in-progress items block; complete-but-unverified items block too.
    IF NEW.status = 'complete' AND OLD.status <> 'complete' THEN
      SELECT count(*) INTO v_blocking
      FROM public.punch_list_items pli
      WHERE pli.project_id = NEW.id
        AND pli.is_deleted = false
        AND (
          pli.status = ANY (ARRAY['open'::text, 'in_progress'::text])
          OR (pli.status = 'complete' AND pli.requires_verification = true)
        );

      IF v_blocking > 0 THEN
        RAISE EXCEPTION
          '% punch list item(s) must be closed (verified where required) before the project can be completed.',
          v_blocking
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- ==========================================================================
  -- COLUMN FREEZES — unchanged from the previous body.
  -- ==========================================================================
  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  -- contract_value is NOT listed here any more: it left this table entirely
  -- (RULING 2) and is now protected by RLS on project_financials, which covers
  -- reads as well as writes. The rest of the financial terms stay on the
  -- project row and stay frozen below Owner/Admin.
  IF NEW.retainage_percent IS DISTINCT FROM OLD.retainage_percent
     OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
     OR NEW.source_estimate_id IS DISTINCT FROM OLD.source_estimate_id THEN
    RAISE EXCEPTION 'The financial terms of a project are Owner/Admin only.';
  END IF;

  -- [S149] Separate RAISE from the financial one: a connector column is not a
  -- financial term, and a message naming the wrong cause is worse than none.
  IF NEW.qb_sub_customer_id IS DISTINCT FROM OLD.qb_sub_customer_id THEN
    RAISE EXCEPTION 'QuickBooks sync columns are written by the connector, not by hand.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_projects_column_scope() IS
  'BEFORE UPDATE on projects. [M5-02, S163] Enforces the two status rules that the browser previously owned alone — the Owner/Admin-only reopen (7A §3.4) and the punch gate (5A §2 / 5C §6) — plus the pre-existing Owner/Admin column freezes on retainage_percent, tax_rate, source_estimate_id and qb_sub_customer_id. The status rules run BEFORE the owner/admin early return because the punch gate binds every role. Service-role writes (auth.uid() IS NULL) are exempt, unchanged. The full STATUS_TRANSITIONS table is deliberately NOT duplicated here — see 20261013000000.';
