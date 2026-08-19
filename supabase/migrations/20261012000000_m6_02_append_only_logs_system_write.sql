-- ============================================================================
-- M6-02 [S163] — the three append-only logs become SYSTEM-WRITE-ONLY.
-- ============================================================================
--
-- Finding: `docs/specs/S162-m6-audit.md` M6-02. Ruling: Josh, S163 — *"Remove
-- the authenticated INSERT path entirely… An audit log any user can forge is
-- not an audit log."*
--
-- ----------------------------------------------------------------------------
-- WHAT WAS WRONG
-- ----------------------------------------------------------------------------
-- A census of every write-side policy in the database [LIVE, S162]: **3 of 82
-- were gated by company scoping alone**, and they were exactly the three
-- append-only logs.
--
--     time_edit_logs                WITH CHECK (company_id = get_my_company_id())
--     time_session_rate_snapshots   WITH CHECK (company_id = get_my_company_id())
--     ai_tag_logs                   WITH CHECK (company_id = get_my_company_id())
--
-- No role test. No test that the caller is the actor named in the row. No test
-- that the referenced session or segment is one the caller may touch.
--
-- PROVEN [S162 B1/B2]: a crew member inserted a `time_edit_logs` row **naming a
-- different member as the editor**, and an `ai_tag_logs` cost row. Both landed.
-- Neither can be read back by its author — SELECT on all three is owner/admin —
-- so **the forgery is invisible to the forger and shown to the Owner as fact.**
--
-- `time_session_rate_snapshots` reaches money rather than only integrity: it
-- carries `hourly_rate`, `burden_multiplier` and `fixed_burden_per_hour`, which
-- `lib/services/expenses.ts:315` reads to compute a project's labour cost.
--
-- ⚠️ The counterfactual FAILED during the audit — the sibling log was equally
-- open — which is what makes this a CONVENTION rather than one slip, and why
-- all three move together.
--
-- ----------------------------------------------------------------------------
-- ⚠️ THE RULING'S PREMISE WAS TRUE FOR TWO OF THREE. THE THIRD WAS MADE TRUE.
-- ----------------------------------------------------------------------------
-- The ruling says these are *"written by the system (service-role or SECURITY
-- DEFINER), never by users."* Verified before dropping anything [LIVE]:
--
--   time_edit_logs               ← `audit_time_segment_edit()` and
--                                  `audit_time_clock_session_edit()`, both
--                                  SECURITY DEFINER triggers on `time_segments`
--                                  and `time_clock_sessions`. **No application
--                                  code writes it.** ✅ premise holds.
--   time_session_rate_snapshots  ← `snapshot_session_rate()`, a SECURITY
--                                  DEFINER trigger on `time_clock_sessions`
--                                  (insert and update). ✅ premise holds.
--   ai_tag_logs                  ← ⚠️ `lib/services/ai-tagging.ts:191`, through
--                                  the CALLER'S session client. **The premise
--                                  did not hold**, and dropping the policy alone
--                                  would have silently stopped the AI cost log.
--
-- So `ai-tagging.ts` moves to `getSupabaseAdmin()` in the same commit — which is
-- what the ruling describes, applied to the one writer that was not yet doing
-- it. Recorded here because the SQL alone does not show it.
--
-- ⚠️ AND WHY THE TRIGGERS KEEP WORKING WITH NO INSERT POLICY AT ALL. All three
-- functions are `SECURITY DEFINER` and owned by `postgres`, which owns these
-- tables, and **`relforcerowsecurity` is false on all three** [LIVE]. A table
-- owner bypasses RLS unless FORCE is set, so the definer context is not subject
-- to any policy. Checked rather than assumed: with FORCE on, this migration
-- would have broken every time edit and every rate snapshot.
--
-- ----------------------------------------------------------------------------
-- WHAT IS LEFT
-- ----------------------------------------------------------------------------
-- Each table keeps exactly one policy — its owner/admin SELECT. With no INSERT,
-- UPDATE or DELETE policy, all three verbs are denied to every authenticated
-- role, which is the correct shape for an append-only log and matches what
-- `co_signing_sessions` and `signing_sessions` already do on their write side.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. time_edit_logs — the record that answers "who changed these hours".
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS time_edit_logs_insert_authenticated ON public.time_edit_logs;

COMMENT ON TABLE public.time_edit_logs IS
  'Append-only audit of time edits. SYSTEM-WRITE-ONLY [M6-02, S163]: no INSERT/UPDATE/DELETE policy exists, so every authenticated write is denied. Rows are written by the SECURITY DEFINER triggers audit_time_segment_edit() and audit_time_clock_session_edit(), which run as the table owner and are not subject to RLS. Do not add an INSERT policy — a crew member previously forged a row naming another member as the editor, invisible to them and shown to the Owner as fact.';

-- ----------------------------------------------------------------------------
-- 2. time_session_rate_snapshots — the frozen pay rate labour cost is read from.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS time_session_rate_snapshots_insert_authenticated ON public.time_session_rate_snapshots;

COMMENT ON TABLE public.time_session_rate_snapshots IS
  'Frozen approval-time pay and burden per session. SYSTEM-WRITE-ONLY [M6-02, S163]: written by the SECURITY DEFINER trigger snapshot_session_rate() only. hourly_rate / burden_multiplier / fixed_burden_per_hour are read by lib/services/expenses.ts to compute labour cost, so a forged row moves money. UNIQUE (session_id) previously limited the forgery to sessions with no snapshot yet; the policy is now the limit.';

-- ----------------------------------------------------------------------------
-- 3. ai_tag_logs — per-call AI cost. See the writer note above.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS ai_tag_logs_insert_authenticated ON public.ai_tag_logs;

COMMENT ON TABLE public.ai_tag_logs IS
  'Append-only per-call cost log for GPT-4o auto-tagging. SYSTEM-WRITE-ONLY [M6-02, S163]: written by lib/services/ai-tagging.ts through the SERVICE-ROLE client, which S163 changed it to use — before that it wrote through the caller''s session and this table carried an authenticated INSERT policy anyone could forge a cost row into.';
