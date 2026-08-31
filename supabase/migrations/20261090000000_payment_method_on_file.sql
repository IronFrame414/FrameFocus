-- ============================================================================
-- Card-at-signup: the gate flag. [spec public-site-and-trial-conversion §S3/§S8]
-- ============================================================================
-- A company has `payment_method_on_file = true` once the owner completes the
-- onboarding Stripe Checkout (`mode:'setup'`). New signups default FALSE and are
-- redirected to /onboarding until the card lands; every EXISTING company is
-- grandfathered TRUE so the gate catches only post-migration signups.
--
-- ⚠️ WHY THE GRANDFATHER BACKFILL IS LOAD-BEARING. The Sabal Point fixture has
-- NO subscription row at all (it predates trials), and every owner sign-in in
-- the live suite would otherwise be trapped at /onboarding. Backfilling all
-- existing companies to TRUE means only companies created AFTER this migration
-- are gated. (Verified: 4 of 6 rebuild-test companies have no subscription row.)

ALTER TABLE public.companies
  ADD COLUMN payment_method_on_file boolean NOT NULL DEFAULT false;

-- Grandfather every existing company. `ADD COLUMN ... DEFAULT false` set them all
-- false; this flips existing rows true. The DEFAULT false keeps applying to rows
-- inserted AFTER this migration (handle_new_user does not set the column).
UPDATE public.companies SET payment_method_on_file = true;

-- ⚠️ THE FLAG IS SET BY THE PAYMENT SYSTEM, NEVER BY A USER — and this trigger,
-- not RLS, is what enforces that. `companies_update_owner_admin` admits the OWNER
-- to their company ROW (they edit settings through it), and RLS cannot scope a
-- column. Without this guard an owner could PostgREST their own row to
-- `payment_method_on_file = true` and walk straight past the gate without ever
-- adding a card. Same shape as `enforce_profiles_self_column_scope` (S177): a
-- BEFORE UPDATE trigger comparing NEW to OLD, keyed on auth.uid().
--
-- Service role / no auth context (the webhook, the setup-success handler, the
-- seed, this migration) has auth.uid() = NULL and may set it. A user session
-- (auth.uid() NOT NULL) may not change it at all.
CREATE OR REPLACE FUNCTION public.enforce_companies_payment_flag_service_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.payment_method_on_file IS DISTINCT FROM OLD.payment_method_on_file THEN
    RAISE EXCEPTION 'payment_method_on_file is set by the payment system, not by a user.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER companies_payment_flag_service_only
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_companies_payment_flag_service_only();
