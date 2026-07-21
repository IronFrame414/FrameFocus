-- ============================================================================
-- Module 6 / 6A — Fix self clock-out RLS rejection on time_clock_sessions
-- (Session 85 live-test bug; approved fix).
--
-- ⚠️ WRITTEN, NOT APPLIED. Josh applies manually (rebuild-test first).
--
-- THE BUG (shipped in the original 6A migration 20260710130000): the UPDATE
-- policy had USING but NO explicit WITH CHECK. When WITH CHECK is absent,
-- Postgres re-evaluates the USING expression against the NEW row. The
-- self-edit arm — (member_id = get_my_member_id() AND clock_out IS NULL) —
-- references the very column a clock-out mutates, so on the NEW row
-- (clock_out just stamped) the arm is false; owner/admin is false for
-- PM/foreman/crew/sub, and can_approve_member(self) is false by definition.
-- Result: EVERY non-Owner/Admin self clock-out failed with "new row violates
-- row-level security policy". Deterministically — the segment-end step of
-- clockOut() passed (its self-arm, is_my_recent_segment(id), references no
-- mutated column), then the session close died, manufacturing the
-- "segment ended / session still open" wedge state.
--
-- THE FIX: keep USING exactly as-is (the OLD row must still be open for a
-- self-edit — correct gating of WHICH rows a member may touch), and add an
-- explicit WITH CHECK whose self-arm drops the clock_out IS NULL condition.
-- Widening the NEW-row check gives nothing away:
--   * row selection (openness) is still enforced by USING against OLD;
--   * WHAT may change is enforced by the column-scope trigger
--     (enforce_time_clock_sessions_column_scope, migration 20260721010000):
--     self = clock_out NULL->value, gps_out, soft-delete pair only.
-- ============================================================================

DROP POLICY time_clock_sessions_update_authorized ON public.time_clock_sessions;

CREATE POLICY time_clock_sessions_update_authorized ON public.time_clock_sessions
  FOR UPDATE TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])   -- edit hours (§8.1)
      OR (member_id = public.get_my_member_id() AND clock_out IS NULL)   -- own live clock-out
      OR public.can_approve_member(member_id)                           -- approval / correction (§8)
    )
  )
  WITH CHECK (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR member_id = public.get_my_member_id()   -- no clock_out IS NULL here: the NEW row
                                                 -- of a self clock-out has it set (the bug)
      OR public.can_approve_member(member_id)
    )
  );
