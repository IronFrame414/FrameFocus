-- ============================================================================
-- 7G SLICE 1 — the QuickBooks connection and token store. SCHEMA ONLY.
-- ============================================================================
--
-- Ruled [Josh, S148]. 7g1-spec.md §S, first bullet: per company, realmId +
-- encrypted tokens + a QB-Payments flag + the income-Item mapping + the
-- connection state driving #8's banner.
--
-- ⚠️ NO OAUTH ROUTE, NO WORKER, NO UI, AND NOTHING CALLS INTUIT. This slice
-- adds columns, one guard and one index. Everything stays inert, exactly as
-- 20260924000000's scaffolding did.
--
-- ----------------------------------------------------------------------------
-- ⚠️ TWO NAMING CONVENTIONS FOR QB WRITE GUARDS — READ THIS BEFORE GREPPING
-- ----------------------------------------------------------------------------
-- There are now TWO shapes, and a search for the obvious one finds only three
-- of the five tables that carry QB columns:
--
--   enforce_expenses_column_scope             guards qb_push_status, qb_bill_id
--   enforce_invoices_column_scope             guards qb_push_status, qb_invoice_id, qb_synced_at
--   enforce_time_clock_sessions_column_scope  guards qb_push_status, qb_time_activity_id
--   enforce_client_payments_qb_scope   <- SEPARATE FUNCTION, own trigger
--   enforce_client_refunds_qb_scope    <- SEPARATE FUNCTION, own trigger
--   enforce_companies_qb_scope         <- added here, same second convention
--
-- At S148 a sweep for `enforce%column_scope` returned the first three and
-- reported the 7E pair as unguarded. THEY ARE GUARDED; the query was wrong.
-- Anyone auditing "is every QB column write-guarded?" must search for BOTH
-- `_column_scope` AND `_qb_scope`, or they will conclude there is a hole and
-- either "fix" a non-problem or lose trust in the scaffolding.
--
-- ----------------------------------------------------------------------------
-- WHY THE TOKENS ARE NOT IN THIS TABLE
-- ----------------------------------------------------------------------------
-- `supabase_vault` 0.3.1 is installed. On `vault.decrypted_secrets`,
-- `service_role` holds SELECT and `anon` / `authenticated` hold NOTHING —
-- measured at S148. So the sync worker can decrypt and no browser session can,
-- by construction rather than by our care, and it survives an RLS mistake on
-- `companies`. The alternative considered was app-layer AES-256-GCM with the
-- key in an env var; rejected [Josh, S148] because we would own the crypto and
-- the key would live in two places.
--
-- `qb_token_secret_id` points at ONE `vault.secrets` row holding a JSON blob:
--   { access_token, refresh_token, access_expires_at, refresh_issued_at }
-- rewritten ATOMICALLY on every refresh via `vault.update_secret()`.
--
-- ⚠️ THE CLASSIC FAILURE, WRITTEN DOWN because it costs a day to diagnose:
-- Intuit's refresh token ROTATES roughly every 24-26 hours and each rotation
-- INVALIDATES ITS PREDECESSOR. Storing the token issued at connect time and
-- reusing it returns `invalid_grant` a day later. The blob must be replaced in
-- full on every refresh, never merged.
--
-- ----------------------------------------------------------------------------
-- THREE CLOCKS, AND WHY TWO OF THEM ARE IN THE CLEAR
-- ----------------------------------------------------------------------------
--   access token   1 hour          -- inside the Vault blob
--   refresh token  100-day rolling, rotating every ~24h  -- inside the blob
--   hard ceiling   5 YEARS         -- `qb_reauth_required_after`, in the clear
--
-- A connection made today expires in 2031 regardless of use. The banner and any
-- support query need to answer "when must this be reconnected?" and "when did it
-- last rotate?" WITHOUT decrypting anything, so those two live as ordinary
-- columns. Nothing secret is exposed by either.
-- ============================================================================


-- ============================================================================
-- 1. The connection, on `companies`
-- ============================================================================

ALTER TABLE public.companies
  -- Intuit's account identifier. NOT a secret: it is needed in support and in
  -- logs, and encrypting it would buy nothing.
  ADD COLUMN qb_realm_id text,

  -- -> vault.secrets(id). Never the token itself.
  ADD COLUMN qb_token_secret_id uuid,

  -- §7G.4 / #3: with no QB Payments connection an invoice carries NO pay button
  -- at all. Defaulting FALSE is the safe direction — a wrong TRUE renders a
  -- button that cannot take money.
  ADD COLUMN qb_payments_enabled boolean NOT NULL DEFAULT false,

  -- The income Item invoices post against ("Construction Income" by default,
  -- remappable). ⚠️ DELIBERATELY NOT A FIFTH `gl_account_*` [Josh, S148]: those
  -- four are COST-side accounts (20260728010000); an Item is a different QB
  -- object and folding them would be a category error.
  ADD COLUMN qb_income_item_id text,
  ADD COLUMN qb_income_item_name text,

  -- #8's banner reads this.
  ADD COLUMN qb_connection_state text NOT NULL DEFAULT 'disconnected',
  ADD COLUMN qb_connected_at timestamp with time zone,
  ADD COLUMN qb_last_refresh_at timestamp with time zone,
  ADD COLUMN qb_refresh_rotated_at timestamp with time zone,
  ADD COLUMN qb_reauth_required_after timestamp with time zone;

COMMENT ON COLUMN public.companies.qb_connection_state IS
  'disconnected: never connected, or explicitly disconnected. connected: tokens '
  'valid. needs_reauth: refresh returned invalid_grant, or the 5-year ceiling '
  'passed — the work KEEPS QUEUEING [Josh, S148], nothing is marked failed, and '
  'it flows on reconnect. revoked: Intuit told us the grant is gone.';

ALTER TABLE public.companies
  ADD CONSTRAINT companies_qb_connection_state_check
    CHECK (qb_connection_state = ANY (ARRAY['disconnected'::text, 'connected'::text,
                                            'needs_reauth'::text, 'revoked'::text])),

  -- Shape invariants. A "connected" company with no realm or no token is a
  -- state that cannot be acted on, and it should not be representable.
  ADD CONSTRAINT companies_qb_realm_required_check
    CHECK (qb_connection_state = 'disconnected' OR qb_realm_id IS NOT NULL),
  ADD CONSTRAINT companies_qb_token_required_check
    CHECK (qb_connection_state <> ALL (ARRAY['connected'::text, 'needs_reauth'::text])
           OR qb_token_secret_id IS NOT NULL);

-- One realm binds to at most one tenant. Two companies sharing a realmId would
-- interleave their books silently, which is the worst failure this integration
-- can have. Partial: an unconnected company has no realm and must not collide.
CREATE UNIQUE INDEX idx_companies_qb_realm_id
  ON public.companies (qb_realm_id)
  WHERE qb_realm_id IS NOT NULL;


-- ============================================================================
-- 2. The write guard — OWNER ONLY, which is NARROWER than the table's policy
-- ============================================================================
--
-- ⚠️ `companies_update_owner_admin` admits OWNER AND ADMIN. CLAUDE.md's
-- owner-only list, item 4, rules the opposite for this integration:
--
--   "Connecting or disconnecting QuickBooks — QB connection is treated as
--    billing-adjacent because it controls financial data flow out of
--    FrameFocus. Owner-only."
--
-- RLS cannot express a per-column rule, so nothing enforced that ruling before
-- now: an Admin could have written every column above through the shipped
-- policy. This closes it at the database rather than in a screen.
--
-- The service-role escape is what lets the WORKER rotate tokens and set
-- `needs_reauth` — it carries no JWT, and that is not a role decision.

CREATE OR REPLACE FUNCTION public.enforce_companies_qb_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = 'owner' THEN
    RETURN NEW;
  END IF;

  IF NEW.qb_realm_id IS DISTINCT FROM OLD.qb_realm_id
     OR NEW.qb_token_secret_id IS DISTINCT FROM OLD.qb_token_secret_id
     OR NEW.qb_payments_enabled IS DISTINCT FROM OLD.qb_payments_enabled
     OR NEW.qb_income_item_id IS DISTINCT FROM OLD.qb_income_item_id
     OR NEW.qb_income_item_name IS DISTINCT FROM OLD.qb_income_item_name
     OR NEW.qb_connection_state IS DISTINCT FROM OLD.qb_connection_state
     OR NEW.qb_connected_at IS DISTINCT FROM OLD.qb_connected_at
     OR NEW.qb_last_refresh_at IS DISTINCT FROM OLD.qb_last_refresh_at
     OR NEW.qb_refresh_rotated_at IS DISTINCT FROM OLD.qb_refresh_rotated_at
     OR NEW.qb_reauth_required_after IS DISTINCT FROM OLD.qb_reauth_required_after THEN
    RAISE EXCEPTION 'Connecting or disconnecting QuickBooks is Owner-only.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER companies_qb_scope
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_companies_qb_scope();

COMMENT ON FUNCTION public.enforce_companies_qb_scope() IS
  '7G §S [S148]. OWNER ONLY — narrower than companies_update_owner_admin, per '
  'CLAUDE.md owner-only item 4 (QB connection is billing-adjacent). Nothing '
  'enforced that ruling before this. Service-role escape lets the sync worker '
  'rotate tokens and set needs_reauth. Probed by s148-qb-connection.live.ts.';
