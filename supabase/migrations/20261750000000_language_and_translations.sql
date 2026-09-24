-- S110 Section H — LANGUAGE: a per-user setting, and a cache for translating
-- what people typed, FOR THE READER. [RULED Josh, 2026-09-23; Phase 2 Q12, Q13]
--
--   1. profiles.language — 'en' | 'es', per user, set on /dashboard/account and
--      /m/account (ruling 1). Spanish and English only (ruling 4).
--   2. The self-edit guard admits `language` beside the name.
--   3. text_translations — the company-scoped cache (Q12: "on read, with the
--      company-scoped cache keyed by (text hash, language, model)"). THE ORIGINAL
--      IS NEVER OVERWRITTEN: every source column stays as typed; a translation
--      lives only here.
--   4. ai_translation_logs — the Module 3H cost log: a row on success AND on
--      failure, the requested model, append-only.
--
-- ⚠️ EVERYTHING CLIENT-FACING IS ENGLISH (ruling 5). Nothing here is read by a
-- client: text_translations has NO policy at all (service role only, behind a
-- route that refuses a client), and no client-facing renderer imports the
-- translation module (test/s110-client-facing-english.test.ts).
--
-- ⚠️ PRODUCTION ROWS GOVERNED. The CHECK on profiles.language governs every
-- profile row, but the column is NEW and every existing row takes the DEFAULT
-- 'en', which satisfies it — it cannot abort. For the record (READ-ONLY):
--   select count(*) from profiles;
-- The two new tables start empty.

-- ---------------------------------------------------------------------------
-- 1. profiles.language
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN language text NOT NULL DEFAULT 'en'
  CONSTRAINT profiles_language_check CHECK (language IN ('en', 'es'));

COMMENT ON COLUMN public.profiles.language IS
  'S110 H: the reader''s language. Translates /m system text and user-entered text shown to this user. Never applies to anything client-facing.';

-- ---------------------------------------------------------------------------
-- 2. Self-serve may change the NAME and the LANGUAGE — nothing else.
--    Body verbatim from 20261080000000 plus the one marked line.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profiles_self_column_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  expected public.profiles%ROWTYPE;
BEGIN
  -- Service role / no auth context (the seed, the admin client): not a self-serve
  -- edit. RLS already governs those paths; do not constrain them, or the seed
  -- could no longer set a role.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only constrain a user editing their OWN row. Owner/Admin edits of OTHER
  -- members go through profiles_update_{owner,admin} + Team management and must be
  -- untouched here.
  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- Self-serve is NAME and LANGUAGE only. `updated_at` is set by the
  -- profiles_updated_at trigger; `updated_by` is an audit column — both are
  -- allowed to move. Anything else changing on a self-update — role, company_id,
  -- is_deleted, email, contact_id, client_access_state, avatar_url, phone, notes,
  -- user_id, id, created_* … — is refused.
  expected := OLD;
  expected.first_name := NEW.first_name;
  expected.last_name  := NEW.last_name;
  expected.language   := NEW.language;  -- [S110 H, ruling 1] a person's own language
  expected.updated_at := NEW.updated_at;
  expected.updated_by := NEW.updated_by;

  IF NEW IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'You can change your own name and language only.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. text_translations — the cache. Tenant data (it holds their words), so it
--    joins the tenant-deletion walk. Written and read ONLY by the service role
--    behind /api/translate, which authenticates the caller, refuses a client,
--    and scopes every read and write to the caller's company.
-- ---------------------------------------------------------------------------
CREATE TABLE public.text_translations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- sha256 of the exact source text, hex. The text itself is not stored twice:
  -- the reader already holds it.
  source_hash     text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  -- What the model detected. NULL when detection failed.
  source_lang     text,
  target_lang     text NOT NULL CHECK (target_lang IN ('en', 'es')),
  model           text NOT NULL,
  -- NULL = "already in the target language, show the original" (no second copy).
  translated_text text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT text_translations_key UNIQUE (company_id, source_hash, target_lang, model)
);
CREATE INDEX idx_text_translations_company_id ON public.text_translations (company_id);
ALTER TABLE public.text_translations ENABLE ROW LEVEL SECURITY;
-- ⚠️ NO POLICIES, deliberately: no role reads or writes this through PostgREST.
-- A cache row is immutable once written (a better model is a NEW key), so the
-- append-only exception applies: no updated_*, no soft delete.

-- ---------------------------------------------------------------------------
-- 4. ai_translation_logs — our AI spend. Survives a tenant deletion with
--    company_id NULLED (the ai_tag_logs / ai_transcription_logs ruling, S137 Q1).
-- ---------------------------------------------------------------------------
CREATE TABLE public.ai_translation_logs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  -- The REQUESTED model (a translation response carries the resolved one; the
  -- route logs that when present, else the request).
  model              text NOT NULL,
  target_lang        text NOT NULL,
  text_count         integer NOT NULL,
  input_tokens       integer,
  output_tokens      integer,
  estimated_cost_usd numeric(10,6),
  success            boolean NOT NULL,
  error_message      text,
  created_at         timestamptz DEFAULT now()
);
CREATE INDEX idx_ai_translation_logs_company_id ON public.ai_translation_logs (company_id);
ALTER TABLE public.ai_translation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_translation_logs_select_owner_admin ON public.ai_translation_logs FOR SELECT
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']));
