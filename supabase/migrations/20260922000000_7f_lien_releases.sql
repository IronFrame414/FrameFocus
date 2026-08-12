-- ============================================================================
-- Module 7F — Lien releases and waivers. Schema.
-- ============================================================================
--
-- Spec: docs/specs/7f2-spec.md §10 (schema), §4 (templates), §5 (triggers and
--       scope), §8 (lifecycle and roles), §12 (sub-inbound).
-- Scope this run: CLIENT-OUTBOUND ONLY [ruling C0, S140]. Sub-inbound is
--       deferred, but its SHAPE is settled here — see `direction` and the
--       subject CHECK below, and the note at lien_releases.
--
-- THE DOCUMENT MODEL, because it constrains everything else [S98 RULED]:
-- PDF OVERLAY AND NOTHING ELSE. The company uploads its own counsel- or
-- lender-approved PDF; the user places boxes over the blanks; at generate time
-- FrameFocus stamps values into those positions. FrameFocus supplies NO page
-- content — not the body wording, not the notary block, not the printed title.
-- The uploaded PDF *is* the legal instrument. The decider was legal, not cost:
-- Fla. Stat. §713.20 prescribes a statutory form and bars requiring a lienor to
-- furnish a different one, and lender forms must be reproduced exactly.
--
-- Consequence for this file: nothing here stores document TEXT. Templates hold
-- a file reference and a box map; releases hold a rendered file and a snapshot
-- of the values that were stamped.
--
-- ----------------------------------------------------------------------------
-- 1. Net-new columns on existing tables (§10.1, §10.2)
-- ----------------------------------------------------------------------------

-- §6.3 — prints ALONGSIDE the property address, never instead of it. Blank is
-- normal and legal; the address alone is what defuses a missing legal
-- description on the FL form.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS legal_description text;

-- §10.2 — the ENTIRE remaining signatory build. The signature IMAGE already
-- exists: companies.contractor_signature_path shipped in 20260710120000, has
-- a capture UI in Company Settings, and already stamps change orders. S97's
-- finding that it was net-new was FALSE. Only the printed name and title are
-- new, and there is ONE signatory per company [S98 RULED].
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS signatory_name text,
  ADD COLUMN IF NOT EXISTS signatory_title text;

-- Lien-release PDFs — both the generated one and the notarized upload — need
-- somewhere to live that is not 'contracts' or 'other'.
ALTER TABLE public.files DROP CONSTRAINT IF EXISTS files_category_check;
ALTER TABLE public.files ADD CONSTRAINT files_category_check
  CHECK (category = ANY (ARRAY[
    'photos'::text, 'contracts'::text, 'plans'::text, 'permits'::text,
    'invoices'::text, 'change_orders'::text, 'daily_logs'::text,
    'receipts'::text, 'safety'::text, 'deliveries'::text,
    'compliance'::text, 'lien_releases'::text, 'other'::text
  ]));

-- ----------------------------------------------------------------------------
-- 2. lien_release_templates (§4, §10.3)
-- ----------------------------------------------------------------------------
--
-- Four ship as pre-named starting rows; the set is UNLIMITED. Titles are
-- PICKER LABELS, never stamped content (§2). Selection is `type` x `is_final`
-- and needs no new data: `is_final` comes from invoices.is_final, which 7D
-- already writes, and the retainage release invoice is created with
-- isFinal: true (payments-client.ts).

CREATE TABLE public.lien_release_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    name text NOT NULL,
    type text NOT NULL,
    is_final boolean DEFAULT false NOT NULL,

    -- §4.4 [ruling C3, S140]: KEPT AS A DISPLAY LABEL. It drives no selection
    -- — that is `type` x `is_final` — but it is how a user tells two Florida
    -- forms from a Georgia one in a picker. Derivable for a prefill:
    -- contact_addresses.state is NOT NULL.
    jurisdiction_state text,

    -- §12 — the engine is direction-agnostic. Only 'client_outbound' is
    -- reachable this run; the column exists so the sub-inbound build adds
    -- rows, not a migration.
    direction text DEFAULT 'client_outbound'::text NOT NULL,

    pdf_file_id uuid,
    /** One of the four shipped starting rows. Renaming one does not clear it. */
    is_default boolean DEFAULT false NOT NULL,

    CONSTRAINT lien_release_templates_pkey PRIMARY KEY (id),
    CONSTRAINT lien_release_templates_type_check
      CHECK (type = ANY (ARRAY['conditional'::text, 'unconditional'::text])),
    CONSTRAINT lien_release_templates_direction_check
      CHECK (direction = ANY (ARRAY['client_outbound'::text, 'sub_inbound'::text]))
);

ALTER TABLE ONLY public.lien_release_templates
  ADD CONSTRAINT lien_release_templates_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id);
-- The template survives its PDF being permanently deleted, reading as "no form
-- attached" rather than vanishing with the blob — the ai_tag_logs.file_id
-- precedent, and the same reason compliance docs use SET NULL.
ALTER TABLE ONLY public.lien_release_templates
  ADD CONSTRAINT lien_release_templates_pdf_file_id_fkey
  FOREIGN KEY (pdf_file_id) REFERENCES public.files(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.lien_release_templates
  ADD CONSTRAINT lien_release_templates_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.lien_release_templates
  ADD CONSTRAINT lien_release_templates_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_lien_release_templates_company_id
  ON public.lien_release_templates (company_id);

-- ----------------------------------------------------------------------------
-- 3. lien_release_template_boxes (§3, §10.3)
-- ----------------------------------------------------------------------------
--
-- Position and size are FRACTIONS of page width/height, not points —
-- resolution-independent, multiplied by the PDF's own point dimensions at
-- generate time. A form re-scanned at a different DPI keeps its box map.

CREATE TABLE public.lien_release_template_boxes (
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
    /** Value-catalog key (§6) when kind='value'. */
    value_key text,
    /** Company-supplied label when kind='custom' — a bank name, a lender file
     *  number, a DISPUTED line: blanks on the uploaded form that FrameFocus
     *  has no source for and must never invent. */
    custom_label text,

    CONSTRAINT lien_release_template_boxes_pkey PRIMARY KEY (id),
    CONSTRAINT lien_release_template_boxes_kind_check
      CHECK (kind = ANY (ARRAY['value'::text, 'signature'::text, 'custom'::text])),
    -- Fractions, so anything outside [0,1] is a bug rather than a big box.
    CONSTRAINT lien_release_template_boxes_bounds_check
      CHECK (x >= 0 AND x <= 1 AND y >= 0 AND y <= 1
             AND width > 0 AND width <= 1 AND height > 0 AND height <= 1),
    -- A value box without a key stamps nothing; a custom box without a label
    -- asks the user for something unnamed. Both are silent no-ops at render
    -- time, so they are refused at write time instead.
    CONSTRAINT lien_release_template_boxes_payload_check
      CHECK (
        (kind = 'value'     AND value_key IS NOT NULL AND custom_label IS NULL)
        OR (kind = 'custom' AND custom_label IS NOT NULL AND value_key IS NULL)
        OR (kind = 'signature' AND value_key IS NULL AND custom_label IS NULL)
      )
);

ALTER TABLE ONLY public.lien_release_template_boxes
  ADD CONSTRAINT lien_release_template_boxes_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id);
-- A box has no meaning without its template.
ALTER TABLE ONLY public.lien_release_template_boxes
  ADD CONSTRAINT lien_release_template_boxes_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES public.lien_release_templates(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.lien_release_template_boxes
  ADD CONSTRAINT lien_release_template_boxes_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.lien_release_template_boxes
  ADD CONSTRAINT lien_release_template_boxes_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_lien_release_template_boxes_template_id
  ON public.lien_release_template_boxes (template_id);

-- ----------------------------------------------------------------------------
-- 4. lien_releases (§5.2, §7, §8, §10.3)
-- ----------------------------------------------------------------------------
--
-- ⚠️ THE SUBJECT COLUMNS, and why they are nullable [ruling C6, S140].
--
-- §10.3 specified `invoice_id NOT NULL`, and §5.2 rules ONE RELEASE PER
-- INVOICE. That is right for client-outbound and IMPOSSIBLE for sub-inbound,
-- which §12 added at S98 without reconciling the two: a release collected FROM
-- a sub has no client invoice — the sub is the lienor and the money-out row is
-- an `expenses` payable against a `subcontractor_contracts` row.
--
-- Sub-inbound is DEFERRED this run. The shape is settled anyway, because the
-- alternative is migrating a table that has already shipped. Exactly one
-- subject is set, enforced by CHECK and keyed off `direction`:
--
--   direction = 'client_outbound'  ->  invoice_id           (and nothing else)
--   direction = 'sub_inbound'      ->  expense_id OR sub_contract_id
--
-- The per-invoice scoping stays what keeps the amount unambiguous: 7E shipped
-- a genuine many-to-many payment<->invoice join, so a cleared check covering
-- three invoices produces THREE unconditional releases, not one ambiguous one.

CREATE TABLE public.lien_releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    template_id uuid,
    direction text DEFAULT 'client_outbound'::text NOT NULL,

    -- Exactly one of these three, per the CHECK below.
    invoice_id uuid,
    expense_id uuid,
    sub_contract_id uuid,

    type text NOT NULL,
    is_final boolean DEFAULT false NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,

    -- §7 — the notary path renders the signature area BLANK [ruling C4, S140]:
    -- a notary attests to a signature made in their presence, so a pre-stamped
    -- image defeats the acknowledgment. Blank is the safer error.
    notary_required boolean DEFAULT false NOT NULL,

    -- BOTH are retained (§7). Only the notarized upload is legally operative;
    -- the pair is the audit trail.
    generated_pdf_file_id uuid,
    notarized_pdf_file_id uuid,

    -- §7 step 7 — the values actually stamped, frozen at render. The release
    -- must survive its sources changing: a client renaming, an address being
    -- corrected, a rate being superseded. Re-deriving a signed instrument
    -- would silently restate what was waived.
    filled_values jsonb DEFAULT '{}'::jsonb NOT NULL,

    amount numeric(12,2),

    -- §8.1 — a voided release is RETAINED FOREVER, never deleted. A release in
    -- the client's hands cannot be recalled the way a bad invoice can be
    -- reissued, so the record of having issued it is the point.
    void_reason text,
    voided_by uuid,
    voided_at timestamp with time zone,
    supersedes_release_id uuid,

    CONSTRAINT lien_releases_pkey PRIMARY KEY (id),
    CONSTRAINT lien_releases_type_check
      CHECK (type = ANY (ARRAY['conditional'::text, 'unconditional'::text])),
    CONSTRAINT lien_releases_direction_check
      CHECK (direction = ANY (ARRAY['client_outbound'::text, 'sub_inbound'::text])),
    CONSTRAINT lien_releases_status_check
      CHECK (status = ANY (ARRAY['draft'::text, 'signed'::text, 'notarized'::text,
                                 'sent'::text, 'voided'::text])),
    -- Exactly one subject, and the right one for the direction.
    CONSTRAINT lien_releases_subject_check
      CHECK (
        (direction = 'client_outbound'
           AND invoice_id IS NOT NULL
           AND expense_id IS NULL AND sub_contract_id IS NULL)
        OR (direction = 'sub_inbound'
           AND invoice_id IS NULL
           AND (expense_id IS NOT NULL) <> (sub_contract_id IS NOT NULL))
      ),
    -- The invoices_void_shape_check precedent: shape-checked BOTH ways, so a
    -- voided row cannot lack its reason and a live row cannot carry one.
    CONSTRAINT lien_releases_void_shape_check
      CHECK (
        (status = 'voided'
           AND void_reason IS NOT NULL AND voided_by IS NOT NULL AND voided_at IS NOT NULL)
        OR (status <> 'voided'
           AND void_reason IS NULL AND voided_by IS NULL AND voided_at IS NULL)
      )
);

ALTER TABLE ONLY public.lien_releases
  ADD CONSTRAINT lien_releases_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id);
-- A template may be deleted after releases were issued from it; the release
-- keeps its rendered PDF and its filled_values snapshot regardless.
ALTER TABLE ONLY public.lien_releases
  ADD CONSTRAINT lien_releases_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES public.lien_release_templates(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.lien_releases
  ADD CONSTRAINT lien_releases_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);
ALTER TABLE ONLY public.lien_releases
  ADD CONSTRAINT lien_releases_expense_id_fkey
  FOREIGN KEY (expense_id) REFERENCES public.expenses(id);
ALTER TABLE ONLY public.lien_releases
  ADD CONSTRAINT lien_releases_sub_contract_id_fkey
  FOREIGN KEY (sub_contract_id) REFERENCES public.subcontractor_contracts(id);
ALTER TABLE ONLY public.lien_releases
  ADD CONSTRAINT lien_releases_generated_pdf_file_id_fkey
  FOREIGN KEY (generated_pdf_file_id) REFERENCES public.files(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.lien_releases
  ADD CONSTRAINT lien_releases_notarized_pdf_file_id_fkey
  FOREIGN KEY (notarized_pdf_file_id) REFERENCES public.files(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.lien_releases
  ADD CONSTRAINT lien_releases_supersedes_release_id_fkey
  FOREIGN KEY (supersedes_release_id) REFERENCES public.lien_releases(id);
ALTER TABLE ONLY public.lien_releases
  ADD CONSTRAINT lien_releases_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.lien_releases
  ADD CONSTRAINT lien_releases_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.lien_releases
  ADD CONSTRAINT lien_releases_voided_by_fkey
  FOREIGN KEY (voided_by) REFERENCES auth.users(id);

CREATE INDEX idx_lien_releases_company_id ON public.lien_releases (company_id);
CREATE INDEX idx_lien_releases_invoice_id ON public.lien_releases (invoice_id);
-- §5.2 — one release per invoice PER TYPE. A conditional at send and an
-- unconditional when funds clear are both legal against the same invoice; two
-- conditionals are not. Voided rows are excluded so a corrected release can be
-- reissued after a void, which §8.1's supersedes-link exists for.
CREATE UNIQUE INDEX idx_lien_releases_one_per_invoice_type
  ON public.lien_releases (invoice_id, type)
  WHERE invoice_id IS NOT NULL AND is_deleted = false AND status <> 'voided';

-- ----------------------------------------------------------------------------
-- 5. Column defaults, triggers (CLAUDE.md per-tenant checklist)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_lien_release_templates_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.set_lien_release_template_boxes_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.set_lien_releases_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER lien_release_templates_updated_at
  BEFORE UPDATE ON public.lien_release_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER lien_release_templates_set_updated_by
  BEFORE UPDATE ON public.lien_release_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_lien_release_templates_updated_by();

CREATE TRIGGER lien_release_template_boxes_updated_at
  BEFORE UPDATE ON public.lien_release_template_boxes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER lien_release_template_boxes_set_updated_by
  BEFORE UPDATE ON public.lien_release_template_boxes
  FOR EACH ROW EXECUTE FUNCTION public.set_lien_release_template_boxes_updated_by();

CREATE TRIGGER lien_releases_updated_at
  BEFORE UPDATE ON public.lien_releases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER lien_releases_set_updated_by
  BEFORE UPDATE ON public.lien_releases
  FOR EACH ROW EXECUTE FUNCTION public.set_lien_releases_updated_by();

-- ----------------------------------------------------------------------------
-- 6. RLS — OWNER/ADMIN ONLY, on all three tables, INCLUDING SELECT (§8.2)
-- ----------------------------------------------------------------------------
--
-- Deliberately NARROWER than 7E's payment tables, which admit project_manager
-- on SELECT. The reason is one leg and it is sufficient: a release WAIVES
-- LEGAL RIGHTS, and voiding does not retrieve it. Whatever generates one also
-- stamps the company's signature onto a legal instrument, so the actor must be
-- someone authorised to bind the company.
--
-- ⚠️ The Financial Visibility Floor is NOT the reason, and must not be cited as
-- one [S98 — the rationale was STRUCK]. CLAUDE.md's Floor carries an explicit
-- S97 carve-out letting a PM see invoice totals and retainage — which IS the
-- release amount — and 7E shipped its payment read policies including
-- project_manager. A PM can already see the figures that feed a release. A
-- role gate resting on false reasoning invites a future session to "fix" it.
--
-- No DELETE policy on any of the three: soft delete only, and a voided release
-- is retained forever.

ALTER TABLE public.lien_release_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lien_release_template_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lien_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY lien_release_templates_select_owner_admin
  ON public.lien_release_templates FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));
CREATE POLICY lien_release_templates_insert_owner_admin
  ON public.lien_release_templates FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));
CREATE POLICY lien_release_templates_update_owner_admin
  ON public.lien_release_templates FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY lien_release_template_boxes_select_owner_admin
  ON public.lien_release_template_boxes FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));
CREATE POLICY lien_release_template_boxes_insert_owner_admin
  ON public.lien_release_template_boxes FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));
CREATE POLICY lien_release_template_boxes_update_owner_admin
  ON public.lien_release_template_boxes FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));
-- Boxes are CASCADE-deleted with their template, which needs a DELETE path
-- that RLS does not grant to anyone. Deleting a single box while editing a map
-- is an ordinary edit, so it gets one — scoped identically.
CREATE POLICY lien_release_template_boxes_delete_owner_admin
  ON public.lien_release_template_boxes FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY lien_releases_select_owner_admin
  ON public.lien_releases FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));
CREATE POLICY lien_releases_insert_owner_admin
  ON public.lien_releases FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));
CREATE POLICY lien_releases_update_owner_admin
  ON public.lien_releases FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));

COMMENT ON TABLE public.lien_releases IS
  '7F lien releases and waivers. Owner/Admin ONLY on SELECT, INSERT and UPDATE '
  '(7f2-spec §8.2) — narrower than 7E''s payment tables by design: a release '
  'waives legal rights and voiding does not retrieve it. Do NOT re-justify this '
  'gate on the Financial Visibility Floor; that rationale was STRUCK at S98 '
  'because the Floor''s S97 carve-out already lets a PM see invoice totals. '
  'No DELETE policy: a voided release is retained forever. One release per '
  'invoice per type (idx_lien_releases_one_per_invoice_type). Sub-inbound '
  'columns exist but are unreachable until 7F''s second build [C0, S140].';

-- ----------------------------------------------------------------------------
-- 7. The four starting templates, per existing company (§4)
-- ----------------------------------------------------------------------------
--
-- Pre-NAMED, not pre-filled: each row has a name, a type and an is_final flag
-- and NO PDF. It cannot generate anything until the company uploads its own
-- form and places boxes — which is the liability posture, not an oversight.
-- Names are user-editable; is_default marks them as the shipped four.
--
-- Re-runnable: skips any company that already has templates.

INSERT INTO public.lien_release_templates
  (company_id, name, type, is_final, direction, is_default, created_by, updated_by)
SELECT c.id, t.name, t.type, t.is_final, 'client_outbound', true, NULL, NULL
FROM public.companies c
CROSS JOIN (VALUES
    ('Conditional Release',                    'conditional',   false),
    ('Unconditional Release',                  'unconditional', false),
    ('Unconditional Release — Final Payment',  'unconditional', true),
    ('Conditional Release — Final Payment',    'conditional',   true)
  ) AS t(name, type, is_final)
WHERE NOT EXISTS (
  SELECT 1 FROM public.lien_release_templates x WHERE x.company_id = c.id
);

-- New companies get theirs at signup, the same way tag_options are seeded.
CREATE OR REPLACE FUNCTION public.seed_lien_release_templates()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.lien_release_templates
    (company_id, name, type, is_final, direction, is_default, created_by, updated_by)
  SELECT NEW.id, t.name, t.type, t.is_final, 'client_outbound', true, NULL, NULL
  FROM (VALUES
      ('Conditional Release',                    'conditional',   false),
      ('Unconditional Release',                  'unconditional', false),
      ('Unconditional Release — Final Payment',  'unconditional', true),
      ('Conditional Release — Final Payment',    'conditional',   true)
    ) AS t(name, type, is_final);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER companies_seed_lien_release_templates
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.seed_lien_release_templates();
