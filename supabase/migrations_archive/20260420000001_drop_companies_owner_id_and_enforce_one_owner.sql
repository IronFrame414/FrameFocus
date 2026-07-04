-- ============================================================
-- FrameFocus — Migration 024: Tech debt #65
-- Enforce one owner per company + drop unmaintained companies.owner_id
-- ============================================================

-- (a) Partial unique index — at most one active owner per company
CREATE UNIQUE INDEX profiles_one_owner_per_company
  ON public.profiles (company_id)
  WHERE role = 'owner' AND is_deleted = false;

-- (b) Drop unmaintained column. profiles.role='owner' is the source of truth.
-- Verified Session 35: zero application reads/writes; signup trigger no longer
-- inserts into this column (current handle_new_user() inserts only name + slug).
ALTER TABLE public.companies DROP COLUMN owner_id;