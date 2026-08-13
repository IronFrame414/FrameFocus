-- ============================================================================
-- Module 7I — CONTRACTS. Schema.
-- ============================================================================
--
-- Spec: docs/specs/7I-spec.md §10 (schema), §8 (roles, REWRITTEN at S145),
--       §5 (client half, estimate stage), §6 (sub half, project stage).
--
-- ⚠️ BUILT AGAINST THE AUDITED SPEC. Rev 4 was verified at `d395c01` and carried
-- five DANGEROUS stale claims; S144 found them and S145 corrected them before a
-- line of this was written. In particular §8's "the gate is UI-only over an open
-- database" was the opposite of the truth and would have talked a builder out of
-- the guards below.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS MIGRATION DOES NOT CONTAIN, AND WHY
-- ----------------------------------------------------------------------------
--   * NO document engine. 7F shipped it at S141 — `lien_release_templates`'s
--     fraction-based box maps, `renderRelease()`, `fitTextToBox()`,
--     `selectTemplate()`. §1's "consumes it rather than rebuilding it" is
--     literal now, and 7I's tables mirror 7F's shape so one renderer serves both.
--   * NO tokenised sub e-signature. §6.5's `/sign-contract/[token]` is 113c
--     stage 6, still named in Gate 1 (`GATED.md:58`), and S140's re-scope makes
--     subcontractors the paradigm case of a new recurring external surface.
--     The sub half ships its notary / upload-back path and is usable without it.
--   * NO amendment to `convert_estimate_to_project` [ruling A1(ii)]. The §5.1a
--     edge — proposal signed, contract declined — is accepted; the Contracts
--     panel shows the contract's own state. Teaching `v_is_signed` about the
--     toggle would be the SIXTH redefinition of that function across six
--     migrations, and S143 proved what happens when a body drifts from its
--     citation. Recorded as owed, not taken.
--   * NO money columns anywhere. The contract value lives on the source row and,
--     as rendered text, inside `filled_values`. 7I stores no amount.
-- ----------------------------------------------------------------------------


-- ============================================================================
-- 1. Toggles and carriers on existing tables (§10.1, §10.3)
-- ============================================================================

-- §5.2 — the MASTER half of the two-level toggle. Off by default: a company
-- that has never heard of client contracts sees today's behaviour exactly.
ALTER TABLE public.companies
  ADD COLUMN client_contracts_enabled boolean NOT NULL DEFAULT false;

-- §10.3 — the client contract is an ESTIMATE-STAGE document, so everything it
-- needs hangs off the estimate. All nullable, so an estimate with the toggle
-- off is untouched.
ALTER TABLE public.estimates
  -- The exact parallel of the shipped `signed_proposal_file_id`.
  ADD COLUMN signed_contract_file_id uuid REFERENCES public.files(id),
  -- §7.1 / §7.5 — project-level values Josh moved to the estimate side, because
  -- the contract is signed BEFORE a project exists.
  ADD COLUMN start_date date,
  ADD COLUMN target_end_date date,
  ADD COLUMN retainage_percent numeric(5,2),
  -- §7.5c — the twin of 7F's `projects.legal_description`, which is now LIVE.
  ADD COLUMN legal_description text,
  ADD COLUMN substantial_completion_days integer,
  -- §5.2 — the PER-PROPOSAL half of the toggle, and the single trigger for
  -- everything conditional in §5.
  ADD COLUMN include_client_contract boolean NOT NULL DEFAULT false;

ALTER TABLE public.estimates
  ADD CONSTRAINT estimates_retainage_percent_check
    CHECK (retainage_percent IS NULL OR (retainage_percent >= 0 AND retainage_percent <= 100)),
  ADD CONSTRAINT estimates_substantial_completion_days_check
    CHECK (substantial_completion_days IS NULL OR substantial_completion_days > 0);

COMMENT ON COLUMN public.estimates.include_client_contract IS
  '7I §5.2 — the per-proposal half of the two-level toggle. The master is '
  'companies.client_contracts_enabled. This column is the single trigger for '
  'everything conditional in §5: whether the proposal send renders a contract, '
  'whether the signing page shows a second step, and what conversion carries.';


-- ============================================================================
-- 2. contract_templates + contract_template_boxes (§10.2, option B)
-- ============================================================================
--
-- 7I's OWN template tables, not shared rows with 7F [S99 ruling, option B].
-- The axes differ and that is the reason: a lien release selects on
-- `type` x `is_final`; a contract selects on `document_kind`. Forcing both into
-- one table would mean two nullable axis pairs, each meaningless on half the
-- rows.
--
-- The BOX shape is deliberately identical to `lien_release_template_boxes` —
-- fractions of page width/height, top-left origin — so `renderRelease()` and
-- `fitTextToBox()` serve both without a second renderer. One difference:
-- `kind` gains 'initial' (§7.3d, typed and drawn).

CREATE TABLE public.contract_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    name text NOT NULL,
    document_kind text NOT NULL,
    pdf_file_id uuid,
    is_default boolean DEFAULT false NOT NULL,

    CONSTRAINT contract_templates_pkey PRIMARY KEY (id),
    CONSTRAINT contract_templates_document_kind_check
      CHECK (document_kind = ANY (ARRAY['client_contract'::text, 'sub_contract'::text]))
);

ALTER TABLE ONLY public.contract_templates
  ADD CONSTRAINT contract_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
-- The template survives its PDF being permanently deleted, reading as "no form
-- attached" — the ai_tag_logs.file_id precedent, and 7F's.
ALTER TABLE ONLY public.contract_templates
  ADD CONSTRAINT contract_templates_pdf_file_id_fkey FOREIGN KEY (pdf_file_id) REFERENCES public.files(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.contract_templates
  ADD CONSTRAINT contract_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.contract_templates
  ADD CONSTRAINT contract_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_contract_templates_company_id ON public.contract_templates (company_id);

CREATE TABLE public.contract_template_boxes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    template_id uuid NOT NULL,
    page integer DEFAULT 0 NOT NULL,
    x numeric(8,6) NOT NULL,
    y numeric(8,6) NOT NULL,
    width numeric(8,6) NOT NULL,
    height numeric(8,6) NOT NULL,
    kind text NOT NULL,
    value_key text,
    custom_label text,

    CONSTRAINT contract_template_boxes_pkey PRIMARY KEY (id),
    CONSTRAINT contract_template_boxes_kind_check
      CHECK (kind = ANY (ARRAY['value'::text, 'signature'::text, 'initial'::text, 'custom'::text])),
    CONSTRAINT contract_template_boxes_bounds_check
      CHECK (x >= 0 AND x <= 1 AND y >= 0 AND y <= 1
             AND width > 0 AND width <= 1 AND height > 0 AND height <= 1),
    -- §10.2 — shape-checked against `kind`, the invoices_void_shape_check
    -- precedent. A value box with no key stamps nothing; a custom box with no
    -- label asks for something unnamed. Both are silent no-ops at render time,
    -- so they are refused at write time instead.
    CONSTRAINT contract_template_boxes_payload_check
      CHECK (
        (kind = 'value'        AND value_key IS NOT NULL AND custom_label IS NULL)
        OR (kind = 'custom'    AND custom_label IS NOT NULL AND value_key IS NULL)
        OR (kind = ANY (ARRAY['signature'::text, 'initial'::text])
            AND value_key IS NULL AND custom_label IS NULL)
      )
);

ALTER TABLE ONLY public.contract_template_boxes
  ADD CONSTRAINT contract_template_boxes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.contract_template_boxes
  ADD CONSTRAINT contract_template_boxes_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.contract_templates(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.contract_template_boxes
  ADD CONSTRAINT contract_template_boxes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.contract_template_boxes
  ADD CONSTRAINT contract_template_boxes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_contract_template_boxes_template_id ON public.contract_template_boxes (template_id);


-- ============================================================================
-- 3. contract_documents (§10.4)
-- ============================================================================
--
-- One row per generated contract, either direction. Keeps 7I out of Module 5's
-- columns (§11.4) — the contract RECORDS on `client_contracts` and
-- `subcontractor_contracts` ship from 5A and are not rebuilt.
--
-- BOTH PDFs are retained, always. v1 (generated, contractor-signed) is never
-- overwritten by v2 (fully executed / notarised upload); the pair is the audit
-- trail and only the second is legally operative. Same rule as 7F.

CREATE TABLE public.contract_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    template_id uuid NOT NULL,
    document_kind text NOT NULL,

    -- Exactly one subject, matched to the kind — the 7F `lien_releases_subject_
    -- check` precedent, which S145 proved was worth deciding before the table
    -- shipped rather than after.
    estimate_id uuid,
    sub_contract_id uuid,
    -- NULL until conversion on the client half; backfilled then (§5.6).
    project_id uuid,

    status text DEFAULT 'draft'::text NOT NULL,
    delivery_mode text NOT NULL,

    generated_pdf_file_id uuid,
    executed_pdf_file_id uuid,

    -- §7 step 7 — the snapshot of what was stamped, including the printed
    -- payment schedule (§6.3). A contract must survive its sources changing:
    -- a client renaming, an address correction, a schedule revision. Re-deriving
    -- a signed instrument would silently restate what was agreed.
    filled_values jsonb DEFAULT '{}'::jsonb NOT NULL,

    void_reason text,
    voided_by uuid,
    voided_at timestamp with time zone,
    supersedes_document_id uuid,

    CONSTRAINT contract_documents_pkey PRIMARY KEY (id),
    CONSTRAINT contract_documents_document_kind_check
      CHECK (document_kind = ANY (ARRAY['client_contract'::text, 'sub_contract'::text])),
    CONSTRAINT contract_documents_status_check
      CHECK (status = ANY (ARRAY['draft'::text, 'sent'::text, 'signed'::text,
                                 'notarized'::text, 'declined'::text, 'voided'::text])),
    CONSTRAINT contract_documents_delivery_mode_check
      CHECK (delivery_mode = ANY (ARRAY['esignature'::text, 'notary'::text])),
    CONSTRAINT contract_documents_subject_check
      CHECK (
        (document_kind = 'client_contract'
           AND estimate_id IS NOT NULL AND sub_contract_id IS NULL)
        OR (document_kind = 'sub_contract'
           AND sub_contract_id IS NOT NULL AND estimate_id IS NULL)
      ),
    -- Shape-checked BOTH ways: a voided row cannot lack its reason and a live
    -- row cannot carry one.
    CONSTRAINT contract_documents_void_shape_check
      CHECK (
        (status = 'voided'
           AND void_reason IS NOT NULL AND voided_by IS NOT NULL AND voided_at IS NOT NULL)
        OR (status <> 'voided'
           AND void_reason IS NULL AND voided_by IS NULL AND voided_at IS NULL)
      )
);

ALTER TABLE ONLY public.contract_documents
  ADD CONSTRAINT contract_documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.contract_documents
  ADD CONSTRAINT contract_documents_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.contract_templates(id);
ALTER TABLE ONLY public.contract_documents
  ADD CONSTRAINT contract_documents_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id);
ALTER TABLE ONLY public.contract_documents
  ADD CONSTRAINT contract_documents_sub_contract_id_fkey FOREIGN KEY (sub_contract_id) REFERENCES public.subcontractor_contracts(id);
ALTER TABLE ONLY public.contract_documents
  ADD CONSTRAINT contract_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE ONLY public.contract_documents
  ADD CONSTRAINT contract_documents_generated_pdf_file_id_fkey FOREIGN KEY (generated_pdf_file_id) REFERENCES public.files(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.contract_documents
  ADD CONSTRAINT contract_documents_executed_pdf_file_id_fkey FOREIGN KEY (executed_pdf_file_id) REFERENCES public.files(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.contract_documents
  ADD CONSTRAINT contract_documents_supersedes_fkey FOREIGN KEY (supersedes_document_id) REFERENCES public.contract_documents(id);
ALTER TABLE ONLY public.contract_documents
  ADD CONSTRAINT contract_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.contract_documents
  ADD CONSTRAINT contract_documents_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.contract_documents
  ADD CONSTRAINT contract_documents_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES auth.users(id);

CREATE INDEX idx_contract_documents_company_id ON public.contract_documents (company_id);
CREATE INDEX idx_contract_documents_estimate_id ON public.contract_documents (estimate_id);
CREATE INDEX idx_contract_documents_sub_contract_id ON public.contract_documents (sub_contract_id);


-- ============================================================================
-- 4. contract_signing_sessions (§10.5) — ONE table, both directions
-- ============================================================================
--
-- Shape copied from `co_signing_sessions`, keyed to `contract_document_id`.
-- One table rather than two: the directions run the identical ceremony and the
-- direction is already carried by `contract_documents.document_kind`.
--
-- `decline_notes` is FREE TEXT with no reason-code CHECK [S99 — the sub ruling,
-- applied to both]. `signing_sessions` has a six-value CHECK; matching
-- `co_signing_sessions` instead is deliberate.

CREATE TABLE public.contract_signing_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),

    contract_document_id uuid NOT NULL,
    token text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,

    recipient_email text,
    expires_at timestamp with time zone NOT NULL,
    signed_at timestamp with time zone,

    signature_type text,
    signature_data text,
    -- §7.3d — initials, typed AND drawn. Typed initials rasterise client-side
    -- before submit, exactly as `typedToDataUrl` does, so one server path
    -- serves both modes.
    initial_type text,
    initial_data text,

    signer_name text,
    signer_ip text,
    signer_user_agent text,
    consent_given boolean DEFAULT false NOT NULL,
    consent_text text,

    declined_at timestamp with time zone,
    decline_notes text,

    CONSTRAINT contract_signing_sessions_pkey PRIMARY KEY (id),
    CONSTRAINT contract_signing_sessions_token_key UNIQUE (token),
    CONSTRAINT contract_signing_sessions_status_check
      CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'declined'::text,
                                 'expired'::text, 'invalidated'::text])),
    CONSTRAINT contract_signing_sessions_signature_type_check
      CHECK (signature_type IS NULL OR signature_type = ANY (ARRAY['draw'::text, 'type'::text])),
    CONSTRAINT contract_signing_sessions_initial_type_check
      CHECK (initial_type IS NULL OR initial_type = ANY (ARRAY['draw'::text, 'type'::text]))
);

ALTER TABLE ONLY public.contract_signing_sessions
  ADD CONSTRAINT contract_signing_sessions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.contract_signing_sessions
  ADD CONSTRAINT contract_signing_sessions_document_fkey FOREIGN KEY (contract_document_id) REFERENCES public.contract_documents(id) ON DELETE CASCADE;

CREATE INDEX idx_contract_signing_sessions_document ON public.contract_signing_sessions (contract_document_id);


-- ============================================================================
-- 5. Triggers (CLAUDE.md per-tenant checklist)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_contract_templates_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$
LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.set_contract_template_boxes_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$
LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.set_contract_documents_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$
LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER contract_templates_updated_at
  BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER contract_templates_set_updated_by
  BEFORE UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_contract_templates_updated_by();

CREATE TRIGGER contract_template_boxes_updated_at
  BEFORE UPDATE ON public.contract_template_boxes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER contract_template_boxes_set_updated_by
  BEFORE UPDATE ON public.contract_template_boxes
  FOR EACH ROW EXECUTE FUNCTION public.set_contract_template_boxes_updated_by();

CREATE TRIGGER contract_documents_updated_at
  BEFORE UPDATE ON public.contract_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER contract_documents_set_updated_by
  BEFORE UPDATE ON public.contract_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_contract_documents_updated_by();

CREATE TRIGGER contract_signing_sessions_updated_at
  BEFORE UPDATE ON public.contract_signing_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ============================================================================
-- 6. RLS — OWNER/ADMIN ONLY, SELECT included (§8)
-- ============================================================================
--
-- §8's ruling stands and its reasoning was rewritten at S145. The two surviving
-- legs: the Financial Visibility Floor's carve-out admits a PM to invoice
-- amounts but NOT to contract value, "on every surface"; and money-rep P9 does
-- not reach contract value either. A contract displays contract value.
--
-- The third leg used to argue this was "a UI gate over an open database". THE
-- DATABASE NOW AGREES WITH THE RULING: FINANCIAL-RLS-FLOOR shipped at S97,
-- `project_financials` is Owner/Admin, and both 5A contract tables freeze their
-- financial columns below Owner/Admin. This is the house pattern for legal
-- documents — 7F shipped the same shape at S141 — not an outlier.
--
-- No DELETE policy anywhere: soft delete only, and a voided contract is
-- retained forever.
--
-- `contract_signing_sessions` gets SELECT ONLY and no write policy at all —
-- every write goes through the service-role client, which is the shipped
-- pattern for both existing signing tables and is deliberate.

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_template_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_signing_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY contract_templates_select_owner_admin ON public.contract_templates
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));
CREATE POLICY contract_templates_insert_owner_admin ON public.contract_templates
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));
CREATE POLICY contract_templates_update_owner_admin ON public.contract_templates
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY contract_template_boxes_select_owner_admin ON public.contract_template_boxes
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));
CREATE POLICY contract_template_boxes_insert_owner_admin ON public.contract_template_boxes
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));
CREATE POLICY contract_template_boxes_update_owner_admin ON public.contract_template_boxes
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));
-- Boxes CASCADE with their template, which needs a DELETE path RLS does not
-- otherwise grant. Deleting one box while editing a map is an ordinary edit.
CREATE POLICY contract_template_boxes_delete_owner_admin ON public.contract_template_boxes
  FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY contract_documents_select_owner_admin ON public.contract_documents
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));
CREATE POLICY contract_documents_insert_owner_admin ON public.contract_documents
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));
CREATE POLICY contract_documents_update_owner_admin ON public.contract_documents
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY contract_signing_sessions_select_owner_admin ON public.contract_signing_sessions
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));


-- ============================================================================
-- 7. Void authority — the S143 pattern, applied to a legal document [C5]
-- ============================================================================
--
-- ⚠️ THIS CLOSES A HOLE THAT IS LIVE TODAY, and it is why the audit mattered.
--
-- `contracts-panel.tsx:145` already voids a CLIENT CONTRACT through
-- `updateClientContract`, and `status` is NOT among the columns either 5A
-- column-scope trigger freezes. `client_contracts_update_authorized` admits an
-- assigned project_manager. So a PM can void a client contract today, through
-- the shipped UI, with no database opinion at all.
--
-- That is precisely the invoice-void defect class S143 closed
-- (`20260923000000`), on a document with more legal weight. §8's original
-- reasoning — "a UI gate over an open database" — would have argued a builder
-- out of fixing it.
--
-- Voiding a contract is OWNER/ADMIN, on all three tables that carry a contract
-- state: the two 5A records and 7I's own documents.

CREATE OR REPLACE FUNCTION public.enforce_contract_void_authority()
RETURNS TRIGGER AS $$
BEGIN
  -- Only a transition INTO a voided state is this function's business.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> ALL (ARRAY['void'::text, 'voided'::text]) THEN
    RETURN NEW;
  END IF;

  -- Service-role paths carry no auth context and are not a role decision.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() <> ALL (ARRAY['owner'::text, 'admin'::text]) THEN
    RAISE EXCEPTION 'Voiding a contract is Owner/Admin only (7I 8).';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

CREATE TRIGGER client_contracts_void_authority
  BEFORE UPDATE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_contract_void_authority();

CREATE TRIGGER subcontractor_contracts_void_authority
  BEFORE UPDATE ON public.subcontractor_contracts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_contract_void_authority();

CREATE TRIGGER contract_documents_void_authority
  BEFORE UPDATE ON public.contract_documents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_contract_void_authority();

COMMENT ON FUNCTION public.enforce_contract_void_authority() IS
  '7I 8 [S145, ruling C5]. Voiding a contract is Owner/Admin. Enforced here '
  'because client_contracts_update_authorized admits an assigned PM, `status` '
  'is not frozen by either column-scope trigger, and contracts-panel.tsx:145 '
  'already exposes the action — so a PM could void a client contract through '
  'the shipped UI with no database opinion. Same defect class as the invoice- '
  'void hole S143 closed. Guarded by apps/web/test/s145-contracts.live.ts.';
