-- ============================================================================
-- Email §3 [Josh ruling, 2026-08-30] — the unsubscribe store.
-- docs/specs/email-deliverability-diagnosis.md Part B: exactly THREE of the 25
-- email types get unsubscribe (reminder, co_reminder, invoice_reminder — the
-- recurring class), 21 transactional types get nothing, and retention_warning
-- is RULED to get nothing: it is the only channel warning of permanent
-- deletion, an honoured opt-out converts "we warned you three times" into
-- "you told us not to warn you", and its three finite messages are not the
-- recurring mail the rule exists for.
--
-- EMAIL-KEYED, CLASS-SCOPED (the diagnosis's design, adopted): the key is an
-- email ADDRESS, not a profile or contact id, because reminder recipients are
-- counterparties who may hold no account at all. The scope is the CLASS
-- ('reminders' covers all three types), not the individual type — a person who
-- one-clicks out of invoice reminders has said "stop the recurring chasing",
-- not "chase me by change order instead".
--
-- Checked inside sendEmail() (the one call site), so a future recurring sender
-- inherits the check the same way it inherits Reply-To resolution.
-- ============================================================================

CREATE TABLE email_unsubscribes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  -- Stored LOWERCASED, always — normalization happens in the service
  -- (email-unsubscribe.ts), and the unique constraint below relies on it.
  email       TEXT NOT NULL,
  scope       TEXT NOT NULL DEFAULT 'reminders' CHECK (scope IN ('reminders')),
  -- Which email_type's link recorded the opt-out — audit, not behaviour.
  source      TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  -- Plain columns, not an expression index: PostgREST upsert's on_conflict
  -- needs a named uniqueness on real columns.
  CONSTRAINT email_unsubscribes_company_email_scope_key UNIQUE (company_id, email, scope)
);

CREATE INDEX idx_email_unsubscribes_company_id ON email_unsubscribes (company_id);

-- Append-only consent log (CLAUDE.md append-only exception): written once,
-- never updated. It deliberately OMITS updated_at / created_by / updated_by /
-- is_deleted — there is no user context at write time (the recipient holds no
-- session) and consent is not soft-deletable. A future resubscribe flow is an
-- admin DELETE via service role, recorded wherever that flow logs itself.
ALTER TABLE email_unsubscribes ENABLE ROW LEVEL SECURITY;

-- SELECT: Owner/Admin see who opted out of their company's reminders.
CREATE POLICY email_unsubscribes_select_owner_admin ON email_unsubscribes
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND get_my_role() = ANY (ARRAY['owner', 'admin'])
  );

-- ⚠️ NO INSERT / UPDATE / DELETE POLICIES — deliberately, and this is the
-- security property, not an omission: writes come ONLY from the tokenized
-- unsubscribe endpoint via the service role. A client-side INSERT policy
-- would let any authenticated user suppress any address's reminders with one
-- PostgREST call.
