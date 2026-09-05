-- ============================================================================
-- 7G MIGRATION M-B — the Intuit webhook verifier token, in VAULT.
-- ============================================================================
--
-- RULED [Josh, S103, Q6]: the verifier token goes in **Vault**, alongside the
-- OAuth tokens — same credential class, one store, one access pattern.
-- 7g2-spec.md §7 item 2.
--
-- ----------------------------------------------------------------------------
-- ⚠️ DEVIATION FROM THE SPEC'S SUGGESTED SHAPE, AND WHY. READ THIS FIRST.
-- ----------------------------------------------------------------------------
-- §7 item 2 suggests, in its own hedged words, "e.g. a
-- `companies.qb_webhook_verifier_secret_id uuid` -> `vault.secrets`".
-- **That column is NOT created here, and the RULING is still honoured in full.**
--
-- The ruling is about the STORE (Vault, not a plain column, not an env var).
-- The "e.g." is the spec's suggestion about the token's SCOPE, and the scope is
-- wrong:
--
--   **Intuit issues ONE webhook verifier token per APP per ENVIRONMENT.** It is
--   configured in the developer portal beside the endpoint URL. It is not per
--   realmId and not per customer.
--
-- Hanging it off `companies` would mean, at Josh's stated 200-400 company scale,
-- either 400 copies of one secret (so a token rotation is a 400-row migration
-- that will half-fail) or 400 rows pointing at one secret id (a denormalised
-- app-level credential living on a tenant row, where the next reader will
-- reasonably assume it is per-tenant and write per-tenant code against it).
--
-- So the token is stored ONCE, app-scoped, in the same Vault, reached by the
-- same kind of service_role-only accessor pair as `qb_vault_put/get/forget`
-- (20260928010000). One mechanism, not two — CLAUDE.md's PARITY reasoning
-- applies to credentials as much as to editors.
--
-- **If Intuit ever issues per-realm verifier tokens, the company column is the
-- correct addition at that point** and these accessors become its fallback.
-- Nothing here forecloses that.
--
-- ----------------------------------------------------------------------------
-- ⚠️ THE SECRET IS KEYED BY ENVIRONMENT, and that is not decoration.
-- ----------------------------------------------------------------------------
-- Sandbox and production have DIFFERENT verifier tokens. Each environment also
-- has its own Supabase project (rebuild-test vs production), so a bare name
-- would usually work — right up until someone points a sandbox deployment at a
-- production database and every webhook silently fails signature verification
-- with no clue why. The environment is in the name so that failure reads as
-- "there is no sandbox token here" instead.
--
-- ----------------------------------------------------------------------------
-- ⚠️ `vault.secrets` HAS NO UNIQUE CONSTRAINT ON `name` IN VAULT 0.3.1.
-- ----------------------------------------------------------------------------
-- Measured on rebuild-test this run: the only constraint on `vault.secrets` is
-- `secrets_pkey PRIMARY KEY (id)`. So "put by name" can silently accumulate
-- duplicates, and a later "get by name" would be an UNORDERED `.limit(1)` over
-- them — CLAUDE.md's S165 rule, and exactly the failure mode it describes (it
-- passes for several runs, then returns the other row after any update).
--
-- The invariant is therefore enforced HERE rather than assumed: `put` updates
-- the existing row in place and DELETES any older duplicates, so at most one row
-- per name can exist; `get` is ordered anyway, belt and braces, so that even a
-- row inserted around these accessors resolves to the newest deterministically.
-- ============================================================================


-- Store or rotate the verifier token for one environment. Idempotent, and
-- self-healing if duplicates ever appeared around it.
CREATE OR REPLACE FUNCTION public.qb_webhook_verifier_put(
  p_environment text,
  p_payload     text
)
RETURNS uuid AS $$
DECLARE
  v_name text := 'qb_webhook_verifier_' || p_environment;
  v_id   uuid;
BEGIN
  SELECT id INTO v_id
    FROM vault.secrets
   WHERE name = v_name
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_id IS NULL THEN
    v_id := vault.create_secret(
      p_payload,
      v_name,
      'Intuit webhook verifier token (' || p_environment || ')'
    );
  ELSE
    PERFORM vault.update_secret(v_id, p_payload);
    -- Collapse any duplicates that predate this call. Keeps `get` honest.
    DELETE FROM vault.secrets WHERE name = v_name AND id <> v_id;
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault';

-- Read it back, decrypted. Returns NULL when no token is stored — and the
-- webhook route MUST treat NULL as "reject every request", never as "skip
-- verification". An unverified webhook is an open write endpoint on a money path.
CREATE OR REPLACE FUNCTION public.qb_webhook_verifier_get(p_environment text)
RETURNS text AS $$
  SELECT decrypted_secret
    FROM vault.decrypted_secrets
   WHERE name = 'qb_webhook_verifier_' || p_environment
   ORDER BY created_at DESC
   LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'vault';


-- ----------------------------------------------------------------------------
-- Grants — BY NAME. `REVOKE ... FROM PUBLIC` does not close a function on
-- Supabase: `anon` and `authenticated` hold EXECUTE explicitly on functions in
-- `public` and those grants survive a revoke from PUBLIC. 20260928010000's
-- header records this; leaving it out would hand any signed-in user the verifier
-- token, which is the whole ballgame — with it, anyone can forge a webhook.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.qb_webhook_verifier_put(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.qb_webhook_verifier_get(text)       FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.qb_webhook_verifier_put(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.qb_webhook_verifier_get(text)       TO service_role;

COMMENT ON FUNCTION public.qb_webhook_verifier_put(text, text) IS
  '7G M-B [S103 Q6]. Stores Intuit''s webhook verifier token in Vault, APP-'
  'SCOPED per environment (Intuit issues one per app per environment, not one '
  'per realm — see the migration header for why this is not a companies '
  'column). service_role only. Set by the platform admin, once per environment.';

COMMENT ON FUNCTION public.qb_webhook_verifier_get(text) IS
  '7G M-B [S103 Q6]. Returns the verifier token or NULL. NULL means REJECT '
  'EVERY WEBHOOK — never skip verification. service_role only.';
