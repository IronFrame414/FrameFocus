-- ============================================================================
-- 7G MIGRATION M-P — a failed disconnect must not strand a tenant forever.
--                    [S189, closing S188 §4a]
-- ============================================================================
--
-- ⚠️ THE FAILURE IS PERMANENT, SILENT, AND ONLY REACHABLE ON AN ERROR PATH.
--
-- `/api/quickbooks/disconnect` deletes the Vault secret and then nulls
-- `companies.qb_token_secret_id`. The delete is best-effort -- its error is
-- caught and logged -- and the column is nulled REGARDLESS, because a tenant
-- must always be able to disconnect. So a delete that fails leaves the secret
-- alive with nothing pointing at it.
--
-- `vault.secrets` carries a UNIQUE index on `name`, and this connector's names
-- are deterministic: `qb_tokens_<company_id>`. So the orphan OWNS that name.
-- Every later reconnect calls `create_secret` with the same name, gets 23505,
-- and the callback returns `qb_error=vault_failed`.
--
--   ⚠️ THE TENANT CAN NEVER RECONNECT. Not "until a retry" -- ever. Retrying
--   is the one thing that cannot work, because the collision is deterministic.
--   And the message they are shown says only that the connection could not be
--   stored securely, which points at nothing.
--
-- ----------------------------------------------------------------------------
-- WHY NOT SIMPLY KEEP THE POINTER WHEN THE DELETE FAILS
-- ----------------------------------------------------------------------------
-- That was considered and REJECTED. It makes reconnect work (the callback
-- passes the surviving id, so `update_secret` replaces the blob) and it is the
-- smaller diff -- but it answers the wrong question.
--
--   ⚠️ A TOKEN IS A CREDENTIAL. The user asked to disconnect. Keeping the
--   pointer does not make the credential any less present; it makes the ROW
--   tidy while a live OAuth refresh token sits in the vault, now advertised by
--   a company row that claims to be disconnected.
--
-- It also only covers orphans created by THIS path. An orphan can equally come
-- from a crash between the two statements, a partial restore from backup, or
-- manual surgery -- and in every one of those the pointer is already gone, so
-- keeping it is not even an option.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS MIGRATION DOES INSTEAD -- TWO INDEPENDENT HALVES
-- ----------------------------------------------------------------------------
--
-- 1. `qb_vault_scrub` -- DESTROY THE CREDENTIAL BEFORE TRYING TO DESTROY THE
--    ROW. The caller scrubs, then deletes, as TWO round trips. That ordering
--    is the whole point and it is not a style choice:
--
--      ⚠️ SCRUB AND DELETE CANNOT SHARE A TRANSACTION. If they did, a failed
--      DELETE would roll the scrub back with it, and the surviving orphan
--      would still hold real tokens -- exactly the outcome being prevented.
--      Separate statements from the app means the scrub is already COMMITTED
--      when the delete is attempted.
--
--    So the worst end state becomes an empty husk under a name, instead of a
--    working refresh token nobody is tracking.
--
-- 2. `qb_vault_put` -- ADOPT AN EXISTING SECRET BY NAME instead of colliding
--    with it. The name belongs to exactly one company by construction (the
--    company uuid is IN it), so there is no tenant it could be adopted from.
--    This closes the lockout for EVERY cause of an orphan, not just a failed
--    delete, which is why it is here rather than a `catch` in the route.
--
-- ⚠️ THE TWO ARE DELIBERATELY INDEPENDENT. Half 2 alone would let a tenant
-- reconnect while a live credential sat in the vault until they did. Half 1
-- alone would leave an empty husk that still owned the name and still locked
-- them out. Neither is sufficient; the failure needs both closed.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Scrub -- overwrite the ciphertext, keep the row.
-- ----------------------------------------------------------------------------
--
-- ⚠️ THE TOMBSTONE IS VALID JSON ON PURPOSE. `getTokenBlob` throws on a payload
-- it cannot parse, and that exception would surface from a path that is only
-- ever reached by accident. A parseable blob with no token fields fails the way
-- a missing credential should: `getAccessToken` finds no usable access token
-- and routes to `needs_reauth`, which is a state the UI already explains.
--
-- It is also unreachable in the normal case: `getAccessToken` returns null for
-- a `disconnected` company before it reads Vault at all. This is defence for
-- the case where the delete failed AND something later looks anyway.
CREATE OR REPLACE FUNCTION public.qb_vault_scrub(p_secret_id uuid)
RETURNS void AS $$
  SELECT vault.update_secret(
    p_secret_id,
    '{"scrubbed":true}'
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'vault';


-- ----------------------------------------------------------------------------
-- 2. Put -- adopt by name rather than collide.
-- ----------------------------------------------------------------------------
--
-- ⚠️ ONLY THE `p_secret_id IS NULL` BRANCH CHANGES. When the caller knows the
-- id -- the ordinary refresh and the ordinary reconnect -- nothing here is
-- different: `update_secret` on that id, exactly as before.
--
-- ⚠️ AND IT STILL REPLACES, NEVER MERGES. Intuit rotates the refresh token on
-- roughly every use and each rotation invalidates its predecessor; a merge that
-- kept an older field would reintroduce the `invalid_grant` this design exists
-- to avoid. Adoption overwrites the whole payload with the fresh blob.
CREATE OR REPLACE FUNCTION public.qb_vault_put(
  p_company_id uuid,
  p_payload    text,
  p_secret_id  uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_id   uuid;
  v_name text := 'qb_tokens_' || p_company_id::text;
BEGIN
  IF p_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(p_secret_id, p_payload);
    RETURN p_secret_id;
  END IF;

  -- ⚠️ THE ORPHAN BRANCH. A secret already owns this company's name and the
  -- company row no longer points at it. Before M-P this raised 23505 and the
  -- tenant was locked out permanently.
  --
  -- The company's uuid is part of the name, so the row can only ever be this
  -- company's own abandoned secret -- never another tenant's.
  SELECT id INTO v_id FROM vault.secrets WHERE name = v_name;

  IF v_id IS NOT NULL THEN
    -- ⚠️ ONLY A **TRUE** ORPHAN MAY BE ADOPTED, AND THIS GUARD WAS ADDED
    -- BECAUSE THE FIRST VERSION WITHOUT IT DESTROYED A LIVE CREDENTIAL.
    --
    -- An orphan is defined by nothing pointing at it. If a company row still
    -- references this secret then it is not abandoned -- it is IN USE, and the
    -- caller has asked to create a credential for a company that already has
    -- one. Silently overwriting it would replace a working connection with
    -- whatever the caller happened to be holding.
    --
    -- Measured, not hypothesised: with the unguarded version,
    -- `s149-qb-queue-webhooks.live.ts` (S149-E) called this with no secret id
    -- against the genuinely-connected fixture company. It adopted the real
    -- OAuth blob, overwrote it with a test payload, and its own cleanup then
    -- deleted the row -- destroying the rebuild-test connection. Before M-P
    -- that same call had raised 23505 and the probe silently no-opped, so the
    -- 23505 had been acting as an accidental guardrail.
    --
    -- ⚠️ WHICH FAILURE IS PREFERABLE IS THE WHOLE QUESTION HERE, and it is not
    -- symmetrical. Refusing costs a caller an error on a path that should not
    -- have taken it. Proceeding costs a customer their connection, silently,
    -- with the credential unrecoverable. So this refuses, loudly, and names
    -- the situation rather than the constraint.
    IF EXISTS (
      SELECT 1 FROM public.companies WHERE qb_token_secret_id = v_id
    ) THEN
      RAISE EXCEPTION
        '[7G] refusing to overwrite the QuickBooks token for company % -- a '
        'company row still points at this secret, so it is in use, not '
        'orphaned. Pass p_secret_id to replace a live blob.', p_company_id;
    END IF;

    PERFORM vault.update_secret(v_id, p_payload);
    RAISE WARNING '[7G] adopted an orphaned Vault secret for company % -- a '
                  'previous disconnect failed to delete it', p_company_id;
    RETURN v_id;
  END IF;

  v_id := vault.create_secret(
    p_payload,
    v_name,
    'QuickBooks OAuth tokens for company ' || p_company_id::text
  );
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'vault';


-- ----------------------------------------------------------------------------
-- Grants -- BY NAME, because PUBLIC is not the whole story.
-- ----------------------------------------------------------------------------
--
-- ⚠️ `REVOKE ... FROM PUBLIC` DOES NOT CLOSE A FUNCTION ON SUPABASE. It grants
-- EXECUTE to `anon` and `authenticated` explicitly, and those survive a revoke
-- from PUBLIC. Revoking both by name is what makes the refusal real --
-- `s148-qb-connection.live.ts` probes an Owner session against these verbs, so
-- an omission here goes red there rather than shipping.
REVOKE ALL ON FUNCTION public.qb_vault_scrub(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qb_vault_scrub(uuid) TO service_role;

-- `qb_vault_put` was REPLACED, not created, and CREATE OR REPLACE preserves the
-- existing grants. Restated anyway: a future edit that drops and recreates it
-- would silently reopen the function to `authenticated`.
REVOKE ALL ON FUNCTION public.qb_vault_put(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qb_vault_put(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.qb_vault_scrub(uuid) IS
  '7G M-P [S189]. Overwrites a token blob with a tombstone WITHOUT deleting the '
  'row. Called immediately before qb_vault_forget, as a SEPARATE statement: if '
  'the two shared a transaction, a failed DELETE would roll the scrub back and '
  'the surviving orphan would still hold live tokens. The point is that a '
  'disconnect whose delete fails leaves an empty husk, never a credential.';

COMMENT ON FUNCTION public.qb_vault_put(uuid, text, uuid) IS
  '7G §S [S148], amended M-P [S189]. Writes a company''s QuickBooks token blob '
  'into Vault and returns the secret id. With no p_secret_id it now ADOPTS an '
  'existing secret of the same name instead of raising 23505 -- the name '
  'carries the company uuid, so the adopted row can only be that company''s own '
  'orphan. Without this, one failed disconnect locked a tenant out of '
  'reconnecting FOREVER, deterministically, with an error naming nothing.';
