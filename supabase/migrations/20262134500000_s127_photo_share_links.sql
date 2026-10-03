-- ============================================================================
-- S127 ITEM 4e — THE PUBLIC PHOTO SHARE LINK. [RULED Josh, 2026-10-02: A-1c;
-- #1 expiry 90 days, extendable, revocable; #2 the MARKED-UP version, with a
-- mandatory pre-confirm preview; #3 build it, gated on the payload proof, plus
-- the company LOGO on the public page.]
-- ============================================================================
--
-- ⚠️ AN APP-ISSUED TOKEN THE APPLICATION RESOLVES — NOT A SUPABASE SIGNED URL.
-- The S121 ruling in lib/share-image.ts stands: a signed URL is "a time-limited
-- bearer credential to a private project file … no login, no RLS, no audit" and
-- nothing can revoke it once it exists. This link is resolved by the app on
-- every view (service role, server side), can be revoked at once, expires, is
-- scoped to ONE photo, and logs every view. The public page NEVER sees a storage
-- URL: it streams the bytes through the app (`/share/p/[token]/image`).
--
-- ⚠️ THE TOKEN IS STORED HASHED (sha256). The plain token exists only in the URL
-- handed to the creator. A leaked database row cannot be turned into a working
-- link. (The /sign-co and /bid precedents store plain tokens; this is stricter
-- on purpose — this link is public by design.)
--
-- ⚠️ WHAT THE PUBLIC PAGE SHOWS — RULED, AND THE GATE ON SHIPPING IT: the photo,
-- the company logo, the company name, the date. NOTHING ELSE. No project name,
-- no site address, no client name, no task, note, file name or description.
-- Proved by inspecting the PAYLOAD (the HTML and every byte the page sends), not
-- the screen (S127 stop rule 10).
--
-- WHO MAY CREATE, LIST, REVOKE, EXTEND: Owner and Admin. [S127 reading, stated
-- in the report: the bulk-share and bulk-delete rulings (A-1a) are Owner/Admin,
-- and a link anyone on the internet can open is the most outward-facing act in
-- the photo viewer.] Nobody else has a policy; views are written by the server
-- with the service role and read by Owner/Admin only.
-- ============================================================================

CREATE TABLE public.photo_share_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) DEFAULT get_my_company_id(),
  file_id         uuid NOT NULL REFERENCES public.files(id),
  -- The storage object served — the marked-up derivative when markup exists,
  -- decided at creation by the same rule the preview showed (lib/photos/share-path.ts).
  share_path      text NOT NULL,
  token_hash      text NOT NULL,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  view_count      integer NOT NULL DEFAULT 0,
  last_viewed_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  is_deleted      boolean NOT NULL DEFAULT false,
  deleted_at      timestamptz,
  CONSTRAINT photo_share_links_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT photo_share_links_expiry_check CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX photo_share_links_token_hash_key ON public.photo_share_links (token_hash);
CREATE INDEX idx_photo_share_links_company_id ON public.photo_share_links (company_id);
CREATE INDEX idx_photo_share_links_file_id ON public.photo_share_links (file_id);

COMMENT ON TABLE public.photo_share_links IS
  'S127 item 4e. A public, revocable, expiring, logged link to ONE photo, resolved by the app '
  '(never a storage signed URL). token_hash = sha256 of the URL token.';

CREATE TABLE public.photo_share_link_views (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  link_id     uuid NOT NULL REFERENCES public.photo_share_links(id) ON DELETE CASCADE,
  viewed_at   timestamptz NOT NULL DEFAULT now(),
  -- What the request said about itself; nothing that identifies a person.
  user_agent  text
);
CREATE INDEX idx_photo_share_link_views_link_id ON public.photo_share_link_views (link_id);
CREATE INDEX idx_photo_share_link_views_company_id ON public.photo_share_link_views (company_id);
COMMENT ON TABLE public.photo_share_link_views IS
  'S127 item 4e. Append-only view log for photo_share_links (written by the server, service role).';

CREATE TRIGGER photo_share_links_updated_at BEFORE UPDATE ON public.photo_share_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION public.set_photo_share_links_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER photo_share_links_set_updated_by BEFORE UPDATE ON public.photo_share_links
  FOR EACH ROW EXECUTE FUNCTION public.set_photo_share_links_updated_by();

-- A user may REVOKE (once, for good) and EXTEND (forward only, at most a year
-- out). Nothing else about a link changes after it is made; a revoked link
-- never comes back.
CREATE OR REPLACE FUNCTION public.enforce_photo_share_links_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;  -- the server's view counter
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.file_id IS DISTINCT FROM OLD.file_id
     OR NEW.share_path IS DISTINCT FROM OLD.share_path
     OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
     OR NEW.view_count IS DISTINCT FROM OLD.view_count
     OR NEW.last_viewed_at IS DISTINCT FROM OLD.last_viewed_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.is_deleted IS DISTINCT FROM OLD.is_deleted THEN
    RAISE EXCEPTION 'A share link can only be revoked or extended.' USING ERRCODE = '42501';
  END IF;
  IF OLD.revoked_at IS NOT NULL
     AND (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at) THEN
    RAISE EXCEPTION 'A revoked share link stays revoked.' USING ERRCODE = '42501';
  END IF;
  IF NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    NEW.revoked_at := now();
    NEW.revoked_by := auth.uid();
  END IF;
  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at
     AND (NEW.expires_at < OLD.expires_at OR NEW.expires_at > now() + interval '366 days') THEN
    RAISE EXCEPTION 'A share link can be extended up to a year out, never shortened (revoke it instead).'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER photo_share_links_scope BEFORE UPDATE ON public.photo_share_links
  FOR EACH ROW EXECUTE FUNCTION public.enforce_photo_share_links_scope();

ALTER TABLE public.photo_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_share_link_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY photo_share_links_select_owner_admin ON public.photo_share_links
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']));
CREATE POLICY photo_share_links_insert_owner_admin ON public.photo_share_links
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin'])
              AND EXISTS (SELECT 1 FROM public.files f
                           WHERE f.id = file_id AND f.company_id = get_my_company_id()
                             AND f.is_deleted = false AND f.mime_type LIKE 'image/%'));
CREATE POLICY photo_share_links_update_owner_admin ON public.photo_share_links
  FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']))
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']));

CREATE POLICY photo_share_link_views_select_owner_admin ON public.photo_share_link_views
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']));
