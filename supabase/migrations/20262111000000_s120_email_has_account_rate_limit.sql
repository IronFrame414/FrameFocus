-- S120 1-B — TECH_DEBT #176: `email_has_account` is rate-limited per caller.
--
-- The finding (S119 ITEM A-3): the function is SECURITY DEFINER, EXECUTE
-- `authenticated`, and answers "does this address have a FrameFocus account
-- anywhere" to any Owner/Admin. Anyone becomes an Owner by signing up, so it
-- was an account-existence oracle for any address, unlimited.
--
-- RULING: none from Josh at build time. S120 Phase 2 ASK-1, unattended default
-- A — A RATE LIMIT, the narrower change: it does not alter WHAT the function
-- answers, only how OFTEN, and the invite flow depends on the platform-wide
-- answer (an address with an account anywhere cannot accept an invitation).
-- The alternative (B, same-company scope) is recorded in the S120 report.
--
-- The limit: 30 answered checks per caller per rolling hour. The only caller is
-- POST /api/invites, once per invitation sent; 30 invitations in an hour is
-- beyond any real crew onboarding and far below an enumeration. The 31st call
-- raises 54000 (program_limit_exceeded) and is NOT counted, so the window
-- clears on its own. The route maps 54000 to a 429 with its own message.
--
-- The ledger is a rate-limit counter, not an audit log: the function prunes the
-- caller's own rows older than a day on each answered call. It is written only
-- inside this SECURITY DEFINER function — there is deliberately NO INSERT,
-- UPDATE or DELETE policy, so a session cannot add rows to lock itself (or
-- anyone) out, or remove rows to reset its window. Owner/Admin may read their
-- own company's rows.
--
-- The function becomes VOLATILE (it writes). Signature, return type, the
-- Owner/Admin check, the answer and the grants are unchanged.

CREATE TABLE public.email_account_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT get_my_company_id() REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_email_account_checks_company_id ON public.email_account_checks (company_id);
CREATE INDEX idx_email_account_checks_created_by ON public.email_account_checks (created_by, created_at);

ALTER TABLE public.email_account_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_account_checks_select_owner_admin ON public.email_account_checks
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin']));

COMMENT ON TABLE public.email_account_checks IS
  'S120 #176: per-caller ledger for the email_has_account rate limit (30 per rolling hour). '
  'Written only inside email_has_account (SECURITY DEFINER); no write policies by design.';

CREATE OR REPLACE FUNCTION public.email_has_account(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_recent integer;
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'owner'
     AND public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only Owner or Admin may check whether an address is already in use.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- #176 [S120]: 30 answered checks per caller per rolling hour.
  SELECT count(*) INTO v_recent
  FROM email_account_checks
  WHERE created_by = auth.uid()
    AND created_at > now() - interval '1 hour';
  IF v_recent >= 30 THEN
    RAISE EXCEPTION 'Too many address checks in the last hour. Try again later.'
      USING ERRCODE = 'program_limit_exceeded';
  END IF;

  INSERT INTO email_account_checks (company_id, created_by)
  VALUES (public.get_my_company_id(), auth.uid());
  DELETE FROM email_account_checks
  WHERE created_by = auth.uid()
    AND created_at < now() - interval '1 day';

  RETURN EXISTS (
    SELECT 1 FROM profiles p
    WHERE LOWER(p.email) = LOWER(TRIM(p_email))
      AND p.is_deleted = false
  );
END;
$$;

COMMENT ON FUNCTION public.email_has_account(text) IS
  'D3.1 [S135]: true when an address already has a FrameFocus profile in ANY '
  'company. Boolean only — never which company. Owner/Admin only, authenticated '
  'only. Lets the invite form refuse to issue a link that could not be accepted. '
  '#176 [S120]: 30 answered checks per caller per rolling hour (54000 beyond).';

REVOKE ALL ON FUNCTION public.email_has_account(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_has_account(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.email_has_account(text) TO authenticated;
