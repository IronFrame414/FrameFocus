-- ============================================================================
-- The AI tagging counter [storage-archive-ai-spec §5, §S10/§S11 — RULED]:
-- 1,500 photos / calendar month in the COMPANY'S timezone, hard cap.
--
-- ⚠️ WHY A FUNCTION AND NOT A CLIENT COUNT: ai_tag_logs SELECT is
-- Owner/Admin-only (ai_tag_logs_select_owner_admin), and autoTagFile() runs
-- as WHOEVER uploaded — crew and foremen most of all. A count through the
-- caller's client would read 0 for exactly the users who upload most, and
-- the cap would silently never fire. SECURITY DEFINER, caller-scoped, the
-- company_storage_used_bytes() shape.
--
-- The month boundary is computed HERE, in the company's own timezone
-- (§S11: `companies.timezone`, the durable rule — no Stripe period exists to
-- anchor to). `success = true` only: failed calls are logged for OUR cost
-- audit (Module 3H) but must never burn a customer's cap.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.company_ai_tags_this_month()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::integer
  FROM public.ai_tag_logs l
  CROSS JOIN (
    SELECT COALESCE(c.timezone, 'America/New_York') AS tz
    FROM public.companies c
    WHERE c.id = public.get_my_company_id()
  ) z
  WHERE l.company_id = public.get_my_company_id()
    AND l.success
    AND l.created_at >= date_trunc('month', now() AT TIME ZONE z.tz) AT TIME ZONE z.tz;
$$;

COMMENT ON FUNCTION public.company_ai_tags_this_month() IS
  'Spec §5 [20261059]: successful GPT-4o tagging calls this CALENDAR MONTH in the company''s timezone. The quota counter — caller-scoped; failed calls excluded (our cost, not their cap).';

REVOKE EXECUTE ON FUNCTION public.company_ai_tags_this_month() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_ai_tags_this_month() TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_ai_tags_this_month() TO service_role;

-- The month-window aggregate stays index-only-ish: company + created_at is
-- already indexed DESC for cost views; success is a cheap filter on top.
CREATE INDEX IF NOT EXISTS idx_ai_tag_logs_company_created
  ON public.ai_tag_logs (company_id, created_at DESC);
