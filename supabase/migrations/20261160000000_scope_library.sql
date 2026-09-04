-- Estimates redesign — Migration #7 of the S103 build: the scope library.
-- Spec: docs/specs/estimates-redesign-spec.md §3.5 row 7; Q8.
--
-- Q8 ruled a NEW scope_library TABLE (not company JSONB) so that "editing here
-- doesn't change the saved copy" is structural: 16b's *Insert* COPIES a library
-- row's title+bullets into estimates.scope_sections; editing the estimate's
-- copy never touches the library row. Established (§5.1) as its OWN migration —
-- none of #1–#6 touches scope.
--
-- Per-tenant standard shape (CLAUDE.md): the standard columns, the three
-- per-tenant column defaults, and BOTH BEFORE UPDATE triggers, all in this
-- migration. Trash-bin pattern: soft delete only; RLS does not filter
-- is_deleted (the service layer does). SELECT is company-wide (scope text is not
-- sensitive); authoring is Owner/Admin/PM — the estimate builders.
--
-- section_kind mirrors 16b's Included/Excluded state so a saved exclusion
-- inserts as an exclusion.
-- Independently pushable: a new table; depends on nothing.

CREATE TABLE scope_library (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL DEFAULT get_my_company_id() REFERENCES companies(id),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  created_by   uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_by   uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  is_deleted   boolean DEFAULT false,
  deleted_at   timestamptz,
  title        text NOT NULL,
  bullets      jsonb NOT NULL DEFAULT '[]'::jsonb,
  section_kind text NOT NULL DEFAULT 'included'
    CHECK (section_kind IN ('included', 'excluded')),
  sort_order   integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE scope_library IS
  'Saved scope sections (16b, Q8). *Insert* COPIES title+bullets into '
  'estimates.scope_sections; editing the estimate copy never changes the library '
  'row. Trash-bin soft delete. S103 migration #7.';

CREATE INDEX idx_scope_library_company_id ON scope_library (company_id);

ALTER TABLE scope_library ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of the company may read the library to insert from it.
CREATE POLICY scope_library_select_company ON scope_library
  FOR SELECT USING (company_id = get_my_company_id());

-- INSERT/UPDATE: the estimate builders (Owner/Admin/PM). UPDATE covers soft
-- delete (is_deleted) — no hard DELETE policy (trash-bin pattern).
CREATE POLICY scope_library_insert_builder ON scope_library
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager'])
  );

CREATE POLICY scope_library_update_builder ON scope_library
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner', 'admin', 'project_manager'])
  );

-- Standard per-tenant triggers (CLAUDE.md).
CREATE TRIGGER scope_library_updated_at
  BEFORE UPDATE ON scope_library
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION set_scope_library_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER scope_library_set_updated_by
  BEFORE UPDATE ON scope_library
  FOR EACH ROW EXECUTE FUNCTION set_scope_library_updated_by();
