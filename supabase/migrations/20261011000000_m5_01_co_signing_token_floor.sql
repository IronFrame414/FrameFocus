-- ============================================================================
-- M5-01 [S163] — the change-order signing token stops being readable by a PM.
-- ============================================================================
--
-- Finding: `docs/specs/S161-m5-audit.md` M5-01. Ruling: Josh, S163 — *"no
-- reason a PM should read these."*
--
-- ----------------------------------------------------------------------------
-- WHAT WAS WRONG
-- ----------------------------------------------------------------------------
-- `co_signing_sessions_select_manager` was:
--
--     company_id = get_my_company_id()
--     AND get_my_role() = ANY (ARRAY['owner','admin','project_manager'])
--
-- No project test. No change-order test. The table carries `token`,
-- `signature_data`, `signer_ip`, `signer_user_agent` and `recipient_email`.
--
-- `change_orders_select_visible` — the S121 read floor — is far narrower: a PM
-- sees only change orders they authored. **The two disagreed, and the wider one
-- carried the credential.**
--
-- MEASURED [S161, rebuild-test, as the PM identity]:
--
--     change orders readable            1
--     co_signing_sessions readable     20   ← every one carrying a token
--     sessions for a CO it CANNOT see  19
--
-- `/sign-co/[token]` and `POST /api/sign-co/[token]/complete` are
-- unauthenticated by design — the route's own header says *"No auth: the token
-- is the credential."* **Reading the token is the ability to sign the change
-- order as the client**, supplying the signature, the signer name and the ESIGN
-- consent record.
--
-- ----------------------------------------------------------------------------
-- WHY OWNER/ADMIN AND NOT "THE PM'S OWN COs"
-- ----------------------------------------------------------------------------
-- Both were on the table. Josh ruled the simpler one, and it also makes the
-- three signing flows agree — this was the only one of three that was a role
-- wider [LIVE]:
--
--     signing_sessions           (M4 estimates)  owner, admin
--     contract_signing_sessions  (M7I contracts) owner, admin
--     co_signing_sessions        (M5 COs)        owner, admin, project_manager  ← was
--
-- ⚠️ KNOWN CONSEQUENCE, ACCEPTED BY THE RULING AND RECORDED HERE.
-- `app/dashboard/projects/[id]/changes/[coId]/page.tsx:38` computes `canManage`
-- as owner/admin/PM and passes `pendingSigningToken` into `CoBuilder`, which
-- turns it into a copyable `/sign-co/{token}` URL. After this migration a PM
-- gets `null` there — including for a change order they authored themselves.
--
-- **Sending is unaffected.** `POST /api/change-orders/[id]/send` creates the
-- session and emails the client through the SERVICE-ROLE client
-- (`createCoSigningSession(admin, …)`, `route.ts:88,188`), and its own role gate
-- still admits a PM. What a PM loses is re-copying the link afterwards; the
-- client still receives it, and an Owner or Admin can still retrieve it.
--
-- No service or component changes: `getCoSigningSessions()` already returns []
-- for a caller RLS refuses, and the page already renders the absence.
-- ============================================================================

DROP POLICY IF EXISTS co_signing_sessions_select_manager ON public.co_signing_sessions;

CREATE POLICY co_signing_sessions_select_manager ON public.co_signing_sessions
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

COMMENT ON POLICY co_signing_sessions_select_manager ON public.co_signing_sessions IS
  'M5-01 [S163]. Owner/Admin only. `token` is the CREDENTIAL for the unauthenticated /sign-co/[token] route, so reading this row is the ability to sign a client''s change order. Previously admitted project_manager with no project or author test, which let a PM read 19 tokens for change orders change_orders_select_visible refuses them. Matches signing_sessions (M4) and contract_signing_sessions (M7I), which were already owner/admin. There are still NO write policies — every write is service-role, and that is deliberate.';
