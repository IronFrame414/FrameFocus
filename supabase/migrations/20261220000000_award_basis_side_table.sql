-- Estimates redesign — Q5 side table: freeze the winning bid's split + coverage
-- AT AWARD. [Josh, S103]
--
-- Migration #4 deliberately STOPPED this part: persisting the labor/material
-- split and scope-coverage so the subcontract's basis is fixed at award and a
-- later edit to estimate_sub_bids can't silently change the contract basis.
-- The ruling chose option (C): a 1:1 SIDE TABLE keyed on the winning line row —
-- NOT new columns on estimate_line_rows (which would fight its type-columns
-- CHECK). This migration builds that table and extends set_winning_bid to write
-- it. estimate_line_rows and its CHECK are UNTOUCHED.
--
-- Written ONLY by set_winning_bid (SECURITY DEFINER). There are no user-facing
-- INSERT/UPDATE/DELETE policies, so once written the basis is frozen from every
-- surface except a re-award (which the RPC upserts). SELECT mirrors
-- estimate_sub_bids: company-scoped, gated on a visible estimate.

CREATE TABLE estimate_award_bases (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL DEFAULT get_my_company_id() REFERENCES companies(id),
  line_row_id            uuid NOT NULL UNIQUE REFERENCES estimate_line_rows(id) ON DELETE CASCADE,
  sub_bid_id             uuid REFERENCES estimate_sub_bids(id) ON DELETE SET NULL,
  labor_amount           numeric,
  material_amount        numeric,
  scope_coverage_percent numeric
    CONSTRAINT estimate_award_bases_scope_coverage_percent_check
    CHECK (scope_coverage_percent IS NULL
           OR (scope_coverage_percent >= 0 AND scope_coverage_percent <= 100)),
  awarded_at             timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_estimate_award_bases_company_id ON estimate_award_bases(company_id);
CREATE INDEX idx_estimate_award_bases_sub_bid_id ON estimate_award_bases(sub_bid_id);

COMMENT ON TABLE estimate_award_bases IS
  'Q5 [S103]: the winning bid''s labor/material split + scope coverage, FROZEN at award and keyed 1:1 on the winning estimate_line_rows row. Written only by set_winning_bid; no user write policies. Do not add columns to estimate_line_rows for this — the side table exists precisely to avoid its type-columns CHECK.';

ALTER TABLE estimate_award_bases ENABLE ROW LEVEL SECURITY;

-- SELECT only. No INSERT/UPDATE/DELETE policies: the frozen basis is written
-- exclusively by the SECURITY DEFINER RPC, which bypasses RLS.
CREATE POLICY estimate_award_bases_select_authenticated ON estimate_award_bases
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND EXISTS (
      SELECT 1
      FROM estimate_line_rows r
      JOIN estimate_line_items li ON li.id = r.line_item_id
      JOIN estimates e ON e.id = li.estimate_id
      WHERE r.id = estimate_award_bases.line_row_id
    )
  );

-- Extend set_winning_bid: after upserting the single subcontractor row, capture
-- that row's id and freeze the winning bid's split + coverage onto the side
-- table (upsert, so a re-award replaces the basis for that same winning row).
CREATE OR REPLACE FUNCTION public.set_winning_bid(p_line_item_id uuid, p_sub_bid_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id UUID := get_my_company_id();
  v_role TEXT := get_my_role();
  v_line estimate_line_items%ROWTYPE;
  v_bid estimate_sub_bids%ROWTYPE;
  v_estimate estimates%ROWTYPE;
  v_sub_row_count INTEGER;
  v_sub_row_id UUID;
  v_next_sort INTEGER;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'project_manager') THEN
    RAISE EXCEPTION 'Only Owner, Admin, or PM can set a winning bid';
  END IF;

  SELECT * INTO v_line FROM estimate_line_items WHERE id = p_line_item_id;
  IF NOT FOUND OR v_line.company_id <> v_company_id THEN
    RAISE EXCEPTION 'Line item not found';
  END IF;

  SELECT * INTO v_bid FROM estimate_sub_bids WHERE id = p_sub_bid_id;
  IF NOT FOUND OR v_bid.company_id <> v_company_id
     OR v_bid.line_item_id <> p_line_item_id OR v_bid.is_deleted THEN
    RAISE EXCEPTION 'Sub bid not found for this line item';
  END IF;

  SELECT * INTO v_estimate FROM estimates WHERE id = v_line.estimate_id;
  IF v_estimate.status <> 'draft' THEN
    RAISE EXCEPTION 'Estimate is not editable (status: %)', v_estimate.status;
  END IF;

  -- D2: PMs can only act on estimates they created
  IF v_role = 'project_manager' AND v_estimate.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'PMs can only modify their own estimates';
  END IF;

  -- Flip the winner on the audit table (clear first so the partial
  -- unique index never sees two winners).
  UPDATE estimate_sub_bids
  SET is_winner = false
  WHERE line_item_id = p_line_item_id AND is_winner = true;

  UPDATE estimate_sub_bids SET is_winner = true WHERE id = p_sub_bid_id;

  -- Upsert exactly one subcontractor row on the line (Rev 2 §2.5).
  SELECT count(*) INTO v_sub_row_count
  FROM estimate_line_rows
  WHERE line_item_id = p_line_item_id AND row_type = 'subcontractor';

  IF v_sub_row_count >= 2 THEN
    RAISE EXCEPTION 'Line has % subcontractor rows; winning-bid auto-management requires 0 or 1', v_sub_row_count;
  ELSIF v_sub_row_count = 1 THEN
    -- S95 ruling: fill-only-when-empty. An estimator-entered cost is never
    -- overwritten by an award; an empty (0/NULL) cost is seeded from the bid.
    UPDATE estimate_line_rows
    SET subcontractor_id = v_bid.subcontractor_id,
        amount = CASE WHEN COALESCE(amount, 0) = 0 THEN v_bid.bid_amount ELSE amount END,
        total  = CASE WHEN COALESCE(amount, 0) = 0 THEN v_bid.bid_amount ELSE total  END   -- service recomputes with markup/tax
    WHERE line_item_id = p_line_item_id AND row_type = 'subcontractor';

    SELECT id INTO v_sub_row_id
    FROM estimate_line_rows
    WHERE line_item_id = p_line_item_id AND row_type = 'subcontractor';
  ELSE
    SELECT COALESCE(max(sort_order) + 1, 0) INTO v_next_sort
    FROM estimate_line_rows WHERE line_item_id = p_line_item_id;

    INSERT INTO estimate_line_rows (
      company_id, line_item_id, row_type, name, sort_order,
      markup_percent, apply_tax, total, amount, subcontractor_id
    ) VALUES (
      v_company_id, p_line_item_id, 'subcontractor', 'Subcontractor bid', v_next_sort,
      NULL, false, v_bid.bid_amount, v_bid.bid_amount, v_bid.subcontractor_id
    )
    RETURNING id INTO v_sub_row_id;
  END IF;

  -- Q5 [S103]: freeze the winning bid's split + scope coverage onto the side
  -- table, keyed on the winning row. Upsert so a re-award replaces the basis.
  -- The subcontract draws from this; leaving it only on estimate_sub_bids would
  -- let a later edit silently change the contract basis.
  INSERT INTO estimate_award_bases (
    company_id, line_row_id, sub_bid_id, labor_amount, material_amount, scope_coverage_percent, awarded_at
  ) VALUES (
    v_company_id, v_sub_row_id, p_sub_bid_id,
    v_bid.labor_amount, v_bid.material_amount, v_bid.scope_coverage_percent, now()
  )
  ON CONFLICT (line_row_id) DO UPDATE SET
    sub_bid_id             = EXCLUDED.sub_bid_id,
    labor_amount           = EXCLUDED.labor_amount,
    material_amount        = EXCLUDED.material_amount,
    scope_coverage_percent = EXCLUDED.scope_coverage_percent,
    awarded_at             = EXCLUDED.awarded_at;
END;
$function$;
