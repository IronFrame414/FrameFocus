-- S128 Part H, section 2 of 2 — THE DIVISION ESTIMATE.
-- ⚠️ PART H IS REBUILD-TEST ONLY. NOT MERGED. NEVER APPLIED TO PRODUCTION (S128 prompt, stop rule 1).
--
-- docs/specs/estimates-and-change-orders-spec.md H-1, H-4, H-6, H-7, H-8, H-12, H-14, H-15.
--
-- H-1  Division → Section (optional) → Line.
-- H-4  A line: name · quantity (default 1) · cost · description · internal notes · cost code ·
--      out-to-bid · alternate. NO unit of measure [Josh]. The description may reach a client under
--      a format (H-10, not built this session); the INTERNAL NOTE never does, under any format.
-- H-6  out_to_bid is CARRIED as a column now, so lines can be marked later without a migration
--      over live rows. No bidding is built (moved to the separate build).
-- H-12 ⚠️ The estimate SNAPSHOTS its divisions and its bottom block when division budgeting is
--      turned on (enable_division_budget). Later edits to the company template reach NEW estimates
--      only — the estimate's rows are copies, with no reference back to the template.
-- H-14 ⚠️ A division budget is MONEY (the Financial Visibility Floor, #136). Read: Owner and Admin,
--      and the Project Executive ASSIGNED to the estimate (estimate_assignments, the existing
--      "Project Executive access" control). Every other role — PM, foreman, crew, client, sub —
--      reads NOTHING: the rows are not in their payload, not merely hidden.
-- H-15 Lock on send: writes only while the estimate is a draft (the same state the line-item
--      estimate's policies pin). Void/reissue copying of division data is NOT built (S128 report).
--
-- Every table CASCADES from companies and from its estimate: a division budget is part of its
-- estimate, never independent history (and see section 1 on the S147 purge lesson).

-- ── 0. The format toggle (H: "A toggle on the estimate's Details page") ─────
-- Applied over existing rebuild-test rows: every one takes the default 'line_item', which the
-- CHECK admits. (Rebuild-test only — stop rule 3 concerns production rows; none are touched.)
ALTER TABLE public.estimates
  ADD COLUMN budget_format text NOT NULL DEFAULT 'line_item'
  CONSTRAINT estimates_budget_format_check CHECK (budget_format IN ('line_item', 'division'));

-- ── 1. Who may read / write a division budget ───────────────────────────────
-- SQL (not plpgsql) SECURITY DEFINER, the repo's pattern for an RLS-protected lookup inside a
-- policy. VOLATILE because pe_assigned_estimate is (S119: a fresh snapshot per call).
CREATE OR REPLACE FUNCTION public.division_budget_readable(p_estimate_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM estimates e
     WHERE e.id = p_estimate_id
       AND e.company_id = get_my_company_id()
       AND (get_my_role() = ANY (ARRAY['owner', 'admin'])
            OR (get_my_role() = 'project_executive' AND pe_assigned_estimate(p_estimate_id)))
  );
$function$;

CREATE OR REPLACE FUNCTION public.division_budget_writable(p_estimate_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.division_budget_readable(p_estimate_id)
     AND EXISTS (SELECT 1 FROM estimates e WHERE e.id = p_estimate_id AND e.status = 'draft');
$function$;
REVOKE ALL ON FUNCTION public.division_budget_readable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.division_budget_writable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.division_budget_readable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.division_budget_writable(uuid) TO authenticated;

-- ── 2. estimate_divisions ───────────────────────────────────────────────────
CREATE TABLE public.estimate_divisions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL DEFAULT public.get_my_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  estimate_id  uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  code         text NOT NULL CONSTRAINT estimate_divisions_code_format CHECK (code ~ '^[0-9]{2}$'),
  name         text NOT NULL CHECK (char_length(btrim(name)) > 0),
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by   uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  is_deleted   boolean NOT NULL DEFAULT false,
  deleted_at   timestamptz
);
CREATE INDEX idx_estimate_divisions_estimate_id ON public.estimate_divisions (estimate_id);
CREATE INDEX idx_estimate_divisions_company_id ON public.estimate_divisions (company_id);

-- ── 3. estimate_division_sections ───────────────────────────────────────────
CREATE TABLE public.estimate_division_sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL DEFAULT public.get_my_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  estimate_id  uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  division_id  uuid NOT NULL REFERENCES public.estimate_divisions(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(btrim(name)) > 0),
  cost_code    text CONSTRAINT estimate_division_sections_cost_code_format
                 CHECK (cost_code IS NULL OR cost_code ~ '^[0-9]{5}$'),
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by   uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  is_deleted   boolean NOT NULL DEFAULT false,
  deleted_at   timestamptz
);
CREATE INDEX idx_estimate_division_sections_estimate_id ON public.estimate_division_sections (estimate_id);
CREATE INDEX idx_estimate_division_sections_division_id ON public.estimate_division_sections (division_id);
CREATE INDEX idx_estimate_division_sections_company_id ON public.estimate_division_sections (company_id);

-- ── 4. estimate_division_lines ──────────────────────────────────────────────
CREATE TABLE public.estimate_division_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL DEFAULT public.get_my_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  estimate_id     uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  division_id     uuid NOT NULL REFERENCES public.estimate_divisions(id) ON DELETE CASCADE,
  section_id      uuid REFERENCES public.estimate_division_sections(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (char_length(btrim(name)) > 0),
  quantity        numeric(14,4) NOT NULL DEFAULT 1,
  cost            numeric(14,2) NOT NULL DEFAULT 0,
  description     text CONSTRAINT estimate_division_lines_description_length
                    CHECK (description IS NULL OR char_length(description) <= 2000),
  internal_notes  text,
  cost_code       text CONSTRAINT estimate_division_lines_cost_code_format
                    CHECK (cost_code IS NULL OR cost_code ~ '^[0-9]{5}$'),
  out_to_bid      boolean NOT NULL DEFAULT false,
  alternate_kind  text CHECK (alternate_kind IS NULL OR alternate_kind IN ('alternate', 'add_deduct')),
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by      uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  is_deleted      boolean NOT NULL DEFAULT false,
  deleted_at      timestamptz
);
CREATE INDEX idx_estimate_division_lines_estimate_id ON public.estimate_division_lines (estimate_id);
CREATE INDEX idx_estimate_division_lines_division_id ON public.estimate_division_lines (division_id);
CREATE INDEX idx_estimate_division_lines_section_id ON public.estimate_division_lines (section_id);
CREATE INDEX idx_estimate_division_lines_company_id ON public.estimate_division_lines (company_id);
COMMENT ON COLUMN public.estimate_division_lines.internal_notes IS
  'S128 H-4: NEVER reaches a client, under any proposal format.';
COMMENT ON COLUMN public.estimate_division_lines.cost_code IS
  'S128 H-2: MasterFormat 1995 DDSSS, five characters of TEXT, zero-padded. Never a number.';

-- ── 5. estimate_bottom_lines (the block below the divisions, H-7/H-8/H-8a) ──
CREATE TABLE public.estimate_bottom_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL DEFAULT public.get_my_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  estimate_id        uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  name               text NOT NULL CHECK (char_length(btrim(name)) > 0),
  kind               text NOT NULL CHECK (kind IN ('flat','percent','contingency','allowance','bond')),
  charge_mode        text NOT NULL CHECK (charge_mode IN ('amount','base','total')),
  rate               numeric(9,4) CHECK (rate IS NULL OR rate >= 0),
  amount             numeric(14,2),
  -- Mode 1 only. NULL = the Sub Total of all divisions; an array = only those divisions.
  base_division_ids  uuid[],
  -- Mode 1 only. Lines ABOVE this one ticked OFF its base (the exception; H-8a ruling).
  base_excluded_ids  uuid[] NOT NULL DEFAULT '{}',
  sort_order         integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by         uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  is_deleted         boolean NOT NULL DEFAULT false,
  deleted_at         timestamptz
);
CREATE INDEX idx_estimate_bottom_lines_estimate_id ON public.estimate_bottom_lines (estimate_id);
CREATE INDEX idx_estimate_bottom_lines_company_id ON public.estimate_bottom_lines (company_id);

-- ── 6. Triggers + RLS, the same for all four ────────────────────────────────
DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['estimate_divisions','estimate_division_sections','estimate_division_lines','estimate_bottom_lines'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
                   t || '_updated_at', t);
    EXECUTE format($f$CREATE OR REPLACE FUNCTION public.%I() RETURNS TRIGGER AS $b$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $b$ LANGUAGE plpgsql SECURITY DEFINER$f$,
                   'set_' || t || '_updated_by');
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.%I()',
                   t || '_set_updated_by', t, 'set_' || t || '_updated_by');
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (company_id = public.get_my_company_id() AND public.division_budget_readable(estimate_id))',
                   t || '_select_budget_readers', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (company_id = public.get_my_company_id() AND public.division_budget_writable(estimate_id))',
                   t || '_insert_budget_writers', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (company_id = public.get_my_company_id() AND public.division_budget_writable(estimate_id)) WITH CHECK (company_id = public.get_my_company_id() AND public.division_budget_writable(estimate_id))',
                   t || '_update_budget_writers', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (company_id = public.get_my_company_id() AND public.division_budget_writable(estimate_id))',
                   t || '_delete_budget_writers', t);
  END LOOP;
END
$do$;

-- ── 7. Turn division budgeting on: seed the company (once), SNAPSHOT into the estimate ──
-- H-12: the copy happens here, once. Re-enabling an estimate that already has divisions keeps
-- its own snapshot — it never re-reads the template.
CREATE OR REPLACE FUNCTION public.enable_division_budget(p_estimate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_status  text;
BEGIN
  SELECT company_id, status INTO v_company, v_status FROM estimates WHERE id = p_estimate_id;
  IF NOT FOUND OR v_company IS DISTINCT FROM get_my_company_id() THEN
    RAISE EXCEPTION 'Estimate not found.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT division_budget_readable(p_estimate_id) THEN
    RAISE EXCEPTION 'Only the Owner, an Admin or the estimate''s Project Executive can budget by division.'
      USING ERRCODE = '42501';
  END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'This estimate is no longer a draft, so its budget is locked.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM estimate_divisions WHERE estimate_id = p_estimate_id) THEN
    PERFORM seed_company_division_defaults(v_company);
    INSERT INTO estimate_divisions (company_id, estimate_id, code, name, sort_order)
    SELECT v_company, p_estimate_id, d.code, d.name, d.sort_order
      FROM company_divisions d
     WHERE d.company_id = v_company AND d.is_deleted = false;
    INSERT INTO estimate_bottom_lines (company_id, estimate_id, name, kind, charge_mode, rate, amount, sort_order)
    SELECT v_company, p_estimate_id, b.name, b.kind, b.charge_mode, b.rate, b.amount, b.sort_order
      FROM company_bottom_template_lines b
     WHERE b.company_id = v_company AND b.is_deleted = false;
  END IF;

  UPDATE estimates SET budget_format = 'division' WHERE id = p_estimate_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.enable_division_budget(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enable_division_budget(uuid) TO authenticated;
