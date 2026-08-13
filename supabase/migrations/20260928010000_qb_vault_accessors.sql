-- ============================================================================
-- 7G SLICE 1b — the Vault accessor pair. The token store's actual API.
-- ============================================================================
--
-- `20260928000000` added `companies.qb_token_secret_id`, and a uuid pointing at
-- a row nobody can reach is not a token store.
--
-- ----------------------------------------------------------------------------
-- ⚠️ WHY A WRAPPER AND NOT `vault.create_secret()` DIRECTLY
-- ----------------------------------------------------------------------------
-- Found by running the probe rather than by reading: PostgREST exposes only its
-- configured schemas, and `vault` is not one of them. A supabase-js call to
-- `rpc('create_secret')` returns:
--
--   PGRST202: Could not find the function public.create_secret(...) in the
--             schema cache
--
-- The alternative was to expose the `vault` schema to PostgREST. That is worse:
-- it would put `vault.secrets` and `vault.decrypted_secrets` one grant mistake
-- away from the wire for every future table in that schema. These two wrappers
-- keep the vault unexposed and give the worker exactly two verbs.
--
-- ----------------------------------------------------------------------------
-- ⚠️ `REVOKE … FROM PUBLIC` DOES NOT CLOSE A FUNCTION ON SUPABASE
-- ----------------------------------------------------------------------------
-- Supabase grants EXECUTE to `anon` and `authenticated` explicitly on functions
-- in `public`, and those grants SURVIVE a revoke from PUBLIC. Revoking from
-- PUBLIC alone leaves both roles able to call these — which would hand any
-- signed-in user a decrypt oracle and defeat the entire reason Vault was chosen
-- over an app-layer key. Both roles are therefore revoked BY NAME below, and
-- `s148-qb-connection.live.ts` probes an Owner session against both verbs.
-- ============================================================================


-- Store or replace a company's token blob. Returns the secret id to persist in
-- `companies.qb_token_secret_id`.
--
-- ⚠️ REPLACES, NEVER MERGES. Intuit's refresh token rotates every ~24h and each
-- rotation invalidates its predecessor; a merge that kept an older field would
-- reintroduce exactly the `invalid_grant` this design exists to avoid.
CREATE OR REPLACE FUNCTION public.qb_vault_put(
  p_company_id uuid,
  p_payload    text,
  p_secret_id  uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_secret_id IS NULL THEN
    v_id := vault.create_secret(
      p_payload,
      'qb_tokens_' || p_company_id::text,
      'QuickBooks OAuth tokens for company ' || p_company_id::text
    );
  ELSE
    PERFORM vault.update_secret(p_secret_id, p_payload);
    v_id := p_secret_id;
  END IF;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault';

-- Read a company's token blob back, decrypted.
CREATE OR REPLACE FUNCTION public.qb_vault_get(p_secret_id uuid)
RETURNS text AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = p_secret_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'vault';

-- Remove a company's tokens on disconnect. The `companies` column is cleared by
-- the caller; this drops the ciphertext so a disconnect is not a soft delete.
CREATE OR REPLACE FUNCTION public.qb_vault_forget(p_secret_id uuid)
RETURNS void AS $$
  DELETE FROM vault.secrets WHERE id = p_secret_id;
$$ LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'vault';


-- ----------------------------------------------------------------------------
-- Grants — by name, because PUBLIC is not the whole story (see the header).
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.qb_vault_put(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.qb_vault_get(uuid)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.qb_vault_forget(uuid)          FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.qb_vault_put(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.qb_vault_get(uuid)             TO service_role;
GRANT EXECUTE ON FUNCTION public.qb_vault_forget(uuid)          TO service_role;

COMMENT ON FUNCTION public.qb_vault_put(uuid, text, uuid) IS
  '7G §S [S148]. Writes a company''s QuickBooks token blob into Vault and '
  'returns the secret id. REPLACES the blob, never merges — Intuit rotates the '
  'refresh token every ~24h and invalidates the predecessor. service_role only.';
