-- ============================================================================
-- S118 item 14 — RENAME A PROJECT (Owner/Admin only).
-- ============================================================================
-- "The name travels": QuickBooks memo text, proposals, invoices, emails,
-- notifications. RULED: already-sent documents keep the name they were sent
-- under. Audit (FILL-14.1/14.2, S118 report): issued INVOICE PDFs and the
-- signed CHANGE-ORDER copy are rebuilt from the LIVE project name — a rename
-- would reach a sent document. The fix touches no invoice or CO row: every
-- rename is logged here, and a sent document resolves the name that was in
-- effect when it was sent (project_name_at). With no rename logged, that is
-- the current name — nothing changes for any existing document.
--
-- Also closes a live gap: enforce_projects_column_scope had no rule for
-- `name`, so an assigned PM or PE could rename a project with a direct call.
-- No constraint over existing rows (the blank-name check binds CHANGES only).
-- ============================================================================

-- Append-only (like ai_tag_logs): no updated_*, no soft delete, no client writes.
CREATE TABLE public.project_name_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  project_id  uuid NOT NULL REFERENCES public.projects(id),
  old_name    text NOT NULL,
  new_name    text NOT NULL,
  renamed_at  timestamptz NOT NULL DEFAULT now(),
  renamed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_name_history_company_id ON public.project_name_history (company_id);
CREATE INDEX idx_project_name_history_project_id ON public.project_name_history (project_id, renamed_at);
ALTER TABLE public.project_name_history ENABLE ROW LEVEL SECURITY;

-- Read: Owner/Admin (the renamers). Documents resolve through project_name_at().
CREATE POLICY project_name_history_select_owner_admin ON public.project_name_history
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner', 'admin'])
  );
-- No INSERT/UPDATE/DELETE policy: the trigger below is the only writer.

CREATE OR REPLACE FUNCTION public.log_project_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO project_name_history (company_id, project_id, old_name, new_name, renamed_by)
  VALUES (NEW.company_id, NEW.id, OLD.name, NEW.name, auth.uid());
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.log_project_rename() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER projects_log_rename AFTER UPDATE OF name ON public.projects
  FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name)
  EXECUTE FUNCTION public.log_project_rename();

-- The name a document sent at p_at was sent under: the OLD name of the first
-- rename after p_at, else the current name. Visible only to a caller who can
-- see the project (staff on it, or its client) — the same people who can open
-- the document — and to the service role, which renders the signed CO copy.
CREATE OR REPLACE FUNCTION public.project_name_at(p_project_id uuid, p_at timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT h.old_name FROM project_name_history h
      WHERE h.project_id = pr.id AND h.renamed_at > p_at
      ORDER BY h.renamed_at ASC, h.id ASC
      LIMIT 1),  -- ordered: the FIRST rename after the document
    pr.name)
  FROM projects pr
  WHERE pr.id = p_project_id
    AND (
      -- the service role (the CO signing page renders the signed copy with it;
      -- anon has no EXECUTE, so no JWT-less caller reaches this arm but it)
      auth.uid() IS NULL
      OR (pr.company_id = get_my_company_id()
          AND (can_view_project(pr.id) OR is_client_of_project(pr.id)))
    );
$function$;
REVOKE ALL ON FUNCTION public.project_name_at(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_name_at(uuid, timestamptz) TO authenticated, service_role;

-- enforce_projects_column_scope: the live body (20261013000000, md5 67665363…
-- on production and rebuild-test) + the two [S118 item 14] blocks.
CREATE OR REPLACE FUNCTION public.enforce_projects_column_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- [S118 item 14] A renamed project needs a name — binds every role, so it sits
  -- BEFORE the Owner/Admin return. A check on CHANGE only: no constraint over
  -- existing rows.
  IF NEW.name IS DISTINCT FROM OLD.name AND (NEW.name IS NULL OR btrim(NEW.name) = '') THEN
    RAISE EXCEPTION 'A project needs a name.' USING ERRCODE = 'check_violation';
  END IF;

  -- ==========================================================================
  -- COLUMN FREEZES — unchanged from the previous body, plus [S118 item 14] name.
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

  -- [S118 item 14] RENAME is Owner/Admin only. _Superseded:_ no rule for `name`,
  -- so an assigned PM or PE could rename a project with a direct call.
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    RAISE EXCEPTION 'Only an Owner or Admin can rename a project.' USING ERRCODE = '42501';
  END IF;

  -- [S149] Separate RAISE from the financial one: a connector column is not a
  -- financial term, and a message naming the wrong cause is worse than none.
  IF NEW.qb_sub_customer_id IS DISTINCT FROM OLD.qb_sub_customer_id THEN
    RAISE EXCEPTION 'QuickBooks sync columns are written by the connector, not by hand.';
  END IF;

  RETURN NEW;
END;
$function$;
