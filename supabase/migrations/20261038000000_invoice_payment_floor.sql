-- ============================================================================
-- The invoice / payment floor — the Payments tab becomes Owner/Admin; the
-- Invoices tab stays PM but AUTHORSHIP-SCOPED. [Josh, Fix 4]
-- ============================================================================
--
-- RULED [Josh]: a PM signed in on a live project and read the Payments tab —
-- collected to date, spent, ahead by, the full AR aging table, retainage held,
-- total outstanding, every invoice's remaining balance, payments received. That
-- is the client's whole financial position on the job. The absolute form "a PM
-- sees no client-facing billing" cannot hold — a PM who builds an invoice sees
-- its amount — so the workable rule is the S121 shape applied to invoices:
-- AUTHORSHIP, not role. A PM creates invoices, sees the ones THEY created, and
-- submits for approval. Every AGGREGATE, and other people's invoices, go.
--
-- ----------------------------------------------------------------------------
-- THIS REVERSES A DECISION MADE KNOWINGLY — quoted, not deleted (S121 posture)
-- ----------------------------------------------------------------------------
-- 20260806000000_financial_rls_floor.sql:56 named the tension in its own words:
--   "That collides with 7D §12a, which deliberately lets a PM create invoices."
-- project-header.tsx cited 7D §12 and 7E P-3:
--   "a PM reads it (P-3) because a PM who cannot see whether their invoice was
--    paid cannot do the job."
-- The floor campaign met this and resolved it IN FAVOUR of PM read access, on
-- purpose. That premise is now REJECTED: the aggregates ARE the client's
-- position and cannot be authorship-scoped, so the Payments tab is Owner/Admin
-- and the Invoices tab is authorship-scoped. P-3's "cannot see whether paid" is
-- superseded — a PM sees the invoices THEY authored and submits them; whether
-- the CLIENT has paid, across the whole job, is the Owner's to hold.
--
-- ----------------------------------------------------------------------------
-- AUTHORSHIP KEYS ON author_member_id, NOT created_by
-- ----------------------------------------------------------------------------
-- S121 scoped change orders by created_by = auth.uid(). That does NOT transfer:
-- measured on rebuild-test, created_by is NULL on 10 of 18 live invoices, while
-- author_member_id is NOT NULL on every row and AGREES with created_by wherever
-- both are present. Keying on created_by would hide those 10 from everyone. The
-- reliable authorship column is author_member_id, and the arm below matches the
-- proven pattern in 20260825000000_expenses_select_widen.sql:75
-- (`author_member_id = get_my_member_id()`).
--
-- ----------------------------------------------------------------------------
-- THE POSTGRES TRAP WORKS FOR US HERE (the inverse of the client-contract floor)
-- ----------------------------------------------------------------------------
-- UPDATE ... WHERE id = X reads the row through the SELECT policy, so narrowing
-- SELECT narrows write-by-filter too. In the client-contract floor that was the
-- HAZARD, because that floor was Owner/Admin-ONLY and hid the PM's own writable
-- rows. Here the floor is AUTHORSHIP-scoped: a PM keeps SELECT on their OWN
-- invoices, so they keep editing and submitting them; only writes on OTHER
-- people's invoices are removed, which is the point. The approval guard
-- `enforce_invoices_column_scope` still fires for a PM on their OWN invoice —
-- `s97ct-floor3` 6a is the acceptance signal: the refusal must come from that
-- TRIGGER, not from RLS returning zero rows. No PM write the workflow needs is
-- removed; a PM never wrote payments (INSERT/UPDATE were Owner/Admin already).


-- ── 1. invoices — the PM read arm becomes AUTHORSHIP-SCOPED ─────────────────
--
--   REPLACED, recorded verbatim so the change is legible in review:
--     invoices_select_visible USING
--       company_id = get_my_company_id()
--       AND get_my_role() = ANY (ARRAY['owner','admin','project_manager'])
--       AND can_view_project(project_id)
--
--   The Owner/Admin arm is unchanged (company-wide, every invoice). The client
--   arm `invoices_select_client` is a SEPARATE policy and is UNTOUCHED — the M9
--   portal keeps reading the client's own sent/paid invoices. `invoice_lines`
--   visibility follows this policy through its own EXISTS(invoices) arm, so a PM
--   sees the lines of exactly the invoices they can now see.
DROP POLICY IF EXISTS invoices_select_visible ON public.invoices;
CREATE POLICY invoices_select_visible ON public.invoices
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (
        public.get_my_role() = 'project_manager'::text
        AND public.can_view_project(project_id)
        AND author_member_id = public.get_my_member_id()
      )
    )
  );


-- ── 2. client money — the AGGREGATES. PM dropped; Owner/Admin only. ─────────
--
--   These three carried a `project_manager` arm ONLY on SELECT; INSERT and
--   UPDATE were already Owner/Admin, so a PM never wrote them and nothing here
--   removes a PM write. `client_refunds` was already Owner/Admin on all three
--   commands and needs no change. Renamed `_select_scoped` -> `_select_owner_admin`
--   now that each names a single role (the {table}_{action}_{role} convention).
DROP POLICY IF EXISTS client_payments_select_scoped ON public.client_payments;
CREATE POLICY client_payments_select_owner_admin ON public.client_payments
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS client_payment_applications_select_scoped ON public.client_payment_applications;
CREATE POLICY client_payment_applications_select_owner_admin ON public.client_payment_applications
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );

DROP POLICY IF EXISTS retainage_releases_select_scoped ON public.retainage_releases;
CREATE POLICY retainage_releases_select_owner_admin ON public.retainage_releases
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
  );


-- ── 3. files — invoice PDFs follow the invoices floor (authorship) ──────────
--
--   The invoice arm let a PM read EVERY invoice-category PDF on a viewable
--   project. Narrow it to the invoices the PM AUTHORED, via EXISTS on invoices
--   (files.invoice_id -> invoices.author_member_id). Contracts and change_order
--   files were already Owner/Admin; the non-financial arm (can_view_project) and
--   the client arm `files_select_client` are UNCHANGED. Whole policy reproduced
--   from the live definition so only the invoice arm moves.
--
--   REPLACED invoice arm, recorded verbatim:
--     (category = 'invoices' AND get_my_role() = 'project_manager'
--      AND can_view_project(project_id))
DROP POLICY IF EXISTS files_select_non_client ON public.files;
CREATE POLICY files_select_non_client ON public.files
  FOR SELECT TO authenticated
  USING (
    company_id = public.get_my_company_id()
    AND public.get_my_role() <> 'client'::text
    AND (
      public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text])
      OR (
        project_id IS NOT NULL
        AND (
          (
            category = 'invoices'::text
            AND public.get_my_role() = 'project_manager'::text
            AND EXISTS (
              SELECT 1 FROM public.invoices i
              WHERE i.id = files.invoice_id
                AND i.author_member_id = public.get_my_member_id()
            )
          )
          OR (
            category <> ALL (ARRAY['contracts'::text, 'change_orders'::text, 'invoices'::text])
            AND public.can_view_project(project_id)
          )
        )
      )
    )
  );
