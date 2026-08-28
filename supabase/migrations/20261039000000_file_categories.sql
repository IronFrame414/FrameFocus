-- ============================================================================
-- Desktop redesign §8.9.1 — PER-COMPANY FILE CATEGORIES (custom categories IN,
-- RULED [Josh]), with a seeded default set.
-- ============================================================================
--
-- THE CRUX, AND THE SHAPE THAT PROTECTS IT: system-generated categories must
-- still resolve. The app itself writes 'lien_releases', 'selections',
-- 'daily_logs' (and more) into files.category — so `files.category` KEEPS ITS
-- ROLE AS THE STABLE KEY. What changes:
--
--   · a `file_categories` table carries the RENAMEABLE LABEL, ordering, and
--     any custom categories a company adds;
--   · the fixed 14-value CHECK on files.category is REPLACED by a composite
--     FK (company_id, category) → file_categories(company_id, key), so a
--     custom key is as legal as a seeded one but an unknown key is not;
--   · `key` is IMMUTABLE by trigger — renaming changes the label, never the
--     key, so no writer can be orphaned by a rename. Get this wrong and
--     uploads break silently; that is why the guard is a trigger, not a
--     convention.
--
-- Custom categories may be project-scoped (`project_id` set — "per-job custom
-- categories"): the scope decides where the PICKER offers them, not what the
-- FK admits, because a file re-assigned across projects must not lose its
-- category. Storage paths are project-scoped, not category-scoped, so
-- re-categorising cannot orphan a stored object (the files-client comment).

BEGIN;

CREATE TABLE public.file_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  -- The stable key writers target. Seeded rows use the historical enum
  -- values verbatim; custom rows get a slug at creation. NEVER updated.
  key         text NOT NULL,
  label       text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  -- Seeded rows: key is load-bearing for app writers; row cannot be deleted.
  is_system   boolean NOT NULL DEFAULT false,
  -- NULL = company-wide. Set = offered on that project's picker only.
  project_id  uuid REFERENCES public.projects(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  updated_by  uuid REFERENCES auth.users(id),
  is_deleted  boolean NOT NULL DEFAULT false,
  deleted_at  timestamptz,
  CONSTRAINT file_categories_company_key_unique UNIQUE (company_id, key)
);

CREATE INDEX idx_file_categories_company_id ON public.file_categories (company_id);

-- Per-tenant column defaults (CLAUDE.md checklist) so client INSERTs pass RLS.
ALTER TABLE public.file_categories ALTER COLUMN company_id SET DEFAULT public.get_my_company_id();
ALTER TABLE public.file_categories ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.file_categories ALTER COLUMN updated_by SET DEFAULT auth.uid();

-- Standard update triggers (shared updated_at fn from Migration 001).
CREATE TRIGGER file_categories_updated_at
  BEFORE UPDATE ON public.file_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.set_file_categories_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER file_categories_set_updated_by
  BEFORE UPDATE ON public.file_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_file_categories_updated_by();

-- The key contract, enforced: key and is_system never change, and a system
-- row cannot be soft-deleted (its key is what app writers target).
CREATE OR REPLACE FUNCTION public.enforce_file_category_key_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.key IS DISTINCT FROM OLD.key THEN
    RAISE EXCEPTION 'file_categories.key is immutable — rename the label, never the key';
  END IF;
  IF NEW.is_system IS DISTINCT FROM OLD.is_system THEN
    RAISE EXCEPTION 'file_categories.is_system is immutable';
  END IF;
  IF OLD.is_system AND NEW.is_deleted THEN
    RAISE EXCEPTION 'a system category cannot be deleted — app writers target its key';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER file_categories_key_immutable
  BEFORE UPDATE ON public.file_categories
  FOR EACH ROW EXECUTE FUNCTION public.enforce_file_category_key_immutable();

-- RLS: labels are not sensitive — company-wide SELECT for staff surfaces and
-- the portal alike (files RLS is what actually bounds file visibility).
-- Category ADMINISTRATION is Owner/Admin (the Admin Role Principle default).
-- No DELETE policy: soft delete only, and system rows refuse even that.
ALTER TABLE public.file_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY file_categories_select_company ON public.file_categories
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY file_categories_insert_owner_admin ON public.file_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

CREATE POLICY file_categories_update_owner_admin ON public.file_categories
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  )
  WITH CHECK (company_id = public.get_my_company_id());

-- ── Seed: the historical 14, per company, keys verbatim ─────────────────────
CREATE OR REPLACE FUNCTION public.seed_file_categories(p_company_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.file_categories (company_id, key, label, sort_order, is_system)
  VALUES
    (p_company_id, 'photos',        'Photos',        1,  true),
    (p_company_id, 'contracts',     'Contracts',     2,  true),
    (p_company_id, 'plans',         'Plans',         3,  true),
    (p_company_id, 'permits',       'Permits',       4,  true),
    (p_company_id, 'invoices',      'Invoices',      5,  true),
    (p_company_id, 'change_orders', 'Change Orders', 6,  true),
    (p_company_id, 'daily_logs',    'Daily Logs',    7,  true),
    (p_company_id, 'receipts',      'Receipts',      8,  true),
    (p_company_id, 'safety',        'Safety',        9,  true),
    (p_company_id, 'deliveries',    'Deliveries',    10, true),
    (p_company_id, 'compliance',    'Compliance',    11, true),
    (p_company_id, 'lien_releases', 'Lien Releases', 12, true),
    (p_company_id, 'selections',    'Selections',    13, true),
    (p_company_id, 'other',         'Other',         14, true)
  ON CONFLICT (company_id, key) DO NOTHING;
$$;

-- Backfill every existing company…
SELECT public.seed_file_categories(id) FROM public.companies;

-- …and every future one (the seed_lien_release_templates precedent).
CREATE OR REPLACE FUNCTION public.seed_file_categories_for_new_company()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.seed_file_categories(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER companies_seed_file_categories
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.seed_file_categories_for_new_company();

-- ── The enum is replaced by the FK ──────────────────────────────────────────
-- Every existing files.category value is one of the seeded 14, and every
-- company now carries those rows, so the FK validates against live data.
ALTER TABLE public.files DROP CONSTRAINT IF EXISTS files_category_check;
ALTER TABLE public.files ADD CONSTRAINT files_category_fkey
  FOREIGN KEY (company_id, category)
  REFERENCES public.file_categories (company_id, key);

COMMIT;
