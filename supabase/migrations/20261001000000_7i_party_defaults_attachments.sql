-- ============================================================================
-- Module 7I — CONTRACTS. Party, one-default enforcement, attachments, sent_at.
-- ============================================================================
--
-- Spec: docs/specs/7I-spec.md §7.4 (attachments), §10.2 (box shape).
-- Rulings [Josh, S150]: R4, R5 (party), R8 (is_default), R9 (attachments),
-- R13 (sent_at). Where a ruling and the spec disagree, THE RULING WINS — the
-- spec is the older document.
--
-- Extends `20260926000000_7i_contracts.sql`. Four independent changes, one
-- migration because they land together behind the same UI slice.


-- ============================================================================
-- 1. R4 / R5 — `party` on contract_template_boxes
-- ============================================================================
--
-- WHICH SIDE SIGNS. A contract is executed by two parties and a template must
-- be able to place both signature blocks; before this, a box knew it was a
-- signature but not whose, so one of the two could never be stamped.
--
-- ⚠️ THE VALUE IS `recipient`, NOT `client` OR `counterparty` [R4, deliberate].
-- One editor serves both `document_kind`s, and a value that reads correctly on
-- a client contract but wrongly on a subcontract would push the UI back into
-- per-kind special-casing — which is precisely what §2.1 exists to prevent. The
-- STORED value stays kind-neutral; the UI derives the LABEL from
-- `document_kind` ("Client signature" / "Subcontractor signature").
--
-- ⚠️ R5: this applies to `initial` AS WELL AS `signature`. §7.3d requires the
-- Owner's initials on the Chapter 558 notice-and-cure clause, and the
-- contractor may need to initial elsewhere on the same form. Both kinds carry a
-- party; NULL on `value` and `custom`, which have no signer.

ALTER TABLE public.contract_template_boxes
  ADD COLUMN party text;

ALTER TABLE public.contract_template_boxes
  ADD CONSTRAINT contract_template_boxes_party_check
    CHECK (party IS NULL OR party = ANY (ARRAY['contractor'::text, 'recipient'::text]));

-- BACKFILL BEFORE THE SHAPE CHECK TIGHTENS, or every existing signature and
-- initial box violates it the moment the constraint is added.
--
-- The pre-R4 editor labelled `signature` "company signature" (copied from 7F,
-- whose signature box IS the company's) and `initial` "signer's initials". The
-- backfill takes each at its shipped word. This is test data only — the system
-- is in testing and no live contract has been generated — so the risk here is
-- an author re-picking a dropdown, not a wrong signature on an executed
-- instrument.
UPDATE public.contract_template_boxes
   SET party = 'contractor'
 WHERE kind = 'signature' AND party IS NULL;

UPDATE public.contract_template_boxes
   SET party = 'recipient'
 WHERE kind = 'initial' AND party IS NULL;

-- The payload check now discriminates on four columns rather than three. Same
-- reasoning as the original (20260926000000:150): a box whose payload does not
-- match its kind is a silent no-op at render time, so it is refused at write
-- time instead. A signature box with no party is exactly that no-op.
ALTER TABLE public.contract_template_boxes
  DROP CONSTRAINT contract_template_boxes_payload_check;

ALTER TABLE public.contract_template_boxes
  ADD CONSTRAINT contract_template_boxes_payload_check
    CHECK (
      (kind = 'value'
         AND value_key IS NOT NULL AND custom_label IS NULL AND party IS NULL)
      OR (kind = 'custom'
         AND custom_label IS NOT NULL AND value_key IS NULL AND party IS NULL)
      OR (kind = ANY (ARRAY['signature'::text, 'initial'::text])
         AND value_key IS NULL AND custom_label IS NULL AND party IS NOT NULL)
    );

COMMENT ON COLUMN public.contract_template_boxes.party IS
  '7I R4/R5 [S150]. Which side signs: contractor | recipient. NOT NULL for '
  'signature and initial (enforced by the payload CHECK, not by the column), '
  'NULL for value and custom. Deliberately kind-neutral — one editor serves '
  'both document_kinds and the UI derives the label from document_kind.';


-- ============================================================================
-- 2. R8 — one default template per document_kind per company, IN THE DATABASE
-- ============================================================================
--
-- `is_default` shipped at 20260926000000 with no enforcement of any kind, so
-- "the default" was whichever row a reader happened to hit first. Two writers
-- setting a default produced two defaults and nothing complained.
--
-- ⚠️ THE PREDICATE IS `is_deleted IS NOT TRUE`, NOT `NOT is_deleted` [deliberate
-- deviation from the ruling's literal wording]. `is_deleted` is `boolean
-- DEFAULT false` and therefore NULLABLE; `NOT is_deleted` evaluates to NULL on
-- a NULL row, which EXCLUDES it from a partial index. A live row with a NULL
-- flag would then escape the uniqueness guarantee entirely — the opposite of
-- what the index is for. `IS NOT TRUE` is identical for `false` and correct for
-- NULL.
--
-- A soft-deleted row keeps `is_default = true` and simply leaves the index.
-- That is intended: removing the default form leaves the company with NO
-- default, which R8 says to resolve by PROMPTING at send time, not by refusing.

CREATE UNIQUE INDEX contract_templates_one_default_per_kind
  ON public.contract_templates (company_id, document_kind)
  WHERE is_default AND is_deleted IS NOT TRUE;

-- The SAME-TRANSACTION clear [R8]. A trigger rather than an RPC, deliberately:
-- the invariant then holds for EVERY writer — the settings UI, a future send
-- flow, a fixture, a hand-run UPDATE — instead of only for callers who
-- remember to use the RPC. Two sequential client writes were refused outright
-- by the ruling, and would in any case trip the index above between them.
--
-- Recursion terminates: the clearing UPDATE sets `is_default = false`, so the
-- trigger re-fires with NEW.is_default false and returns at the first guard.
CREATE OR REPLACE FUNCTION public.enforce_one_default_contract_template()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  -- A soft-deleted row is not the default, so it clears nothing.
  IF NEW.is_deleted IS TRUE THEN
    RETURN NEW;
  END IF;

  UPDATE public.contract_templates
     SET is_default = false
   WHERE company_id = NEW.company_id
     AND document_kind = NEW.document_kind
     AND id <> NEW.id
     AND is_default
     AND is_deleted IS NOT TRUE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- BEFORE, so the clear lands before the index is checked for the incoming row.
CREATE TRIGGER contract_templates_one_default
  BEFORE INSERT OR UPDATE ON public.contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_one_default_contract_template();

COMMENT ON FUNCTION public.enforce_one_default_contract_template() IS
  '7I R8 [S150]. Setting a template default clears the previous one for the '
  'same (company_id, document_kind) in the SAME transaction. A trigger rather '
  'than an RPC so the invariant binds every writer, not just the ones that '
  'remember to call it. Paired with contract_templates_one_default_per_kind.';


-- ============================================================================
-- 3. R9 / §7.4 — contract_document_attachments
-- ============================================================================
--
-- Exhibit D (Plans and Specifications) is the named case, and the agreement
-- itself says such material "shall become part of this Agreement when received
-- by Contractor" — so attachments can arrive AFTER execution.
--
--   * Attached BEFORE send  → merged into the rendered PDF in `sort_order`.
--   * Attached AFTER execution → NEVER merged. v2 is frozen. It is stored and
--     linked with `attached_after_execution = true`, so the record shows what
--     arrived later without rewriting what was signed. §7.4 calls this "the
--     rule that keeps the artifact honest" and it is the reason for the column.
--
-- ⚠️ R9: Owner/Admin in BOTH windows, and NON-PDF UPLOADS ARE REFUSED at the
-- upload with an explanation. The refusal is a service-layer decision (the
-- database cannot see a MIME type from here); revisiting it — other formats, or
-- server-side conversion to PDF so they can be sent — is filed as tech debt.
--
-- ⚠️ `file_id` IS NULLABLE, WHERE §7.4 SPECIFIES NOT NULL. Deliberate, and
-- flagged for reversal if Josh disagrees. `files` has a permanent-delete path
-- for Owner/Admin; NOT NULL would force either CASCADE (which erases the record
-- that an exhibit was ever attached) or RESTRICT (which blocks a delete the
-- product otherwise allows). SET NULL keeps the row — label, sort order, and
-- whether it arrived after execution — reading as "this exhibit was attached
-- and its file is gone". That is the honest artifact §7.4 asks for; CASCADE
-- would quietly rewrite history. Same reasoning as the ai_tag_logs precedent in
-- CLAUDE.md and as contract_templates.pdf_file_id one migration earlier.

CREATE TABLE public.contract_document_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid DEFAULT public.get_my_company_id() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid DEFAULT auth.uid(),
    updated_by uuid DEFAULT auth.uid(),
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,

    contract_document_id uuid NOT NULL,
    file_id uuid,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    attached_after_execution boolean DEFAULT false NOT NULL,

    CONSTRAINT contract_document_attachments_pkey PRIMARY KEY (id),
    CONSTRAINT contract_document_attachments_label_check
      CHECK (btrim(label) <> '')
);

ALTER TABLE ONLY public.contract_document_attachments
  ADD CONSTRAINT contract_document_attachments_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id);
ALTER TABLE ONLY public.contract_document_attachments
  ADD CONSTRAINT contract_document_attachments_document_fkey
  FOREIGN KEY (contract_document_id) REFERENCES public.contract_documents(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.contract_document_attachments
  ADD CONSTRAINT contract_document_attachments_file_id_fkey
  FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.contract_document_attachments
  ADD CONSTRAINT contract_document_attachments_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE ONLY public.contract_document_attachments
  ADD CONSTRAINT contract_document_attachments_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id);

CREATE INDEX idx_contract_document_attachments_document
  ON public.contract_document_attachments (contract_document_id);
CREATE INDEX idx_contract_document_attachments_company_id
  ON public.contract_document_attachments (company_id);

CREATE OR REPLACE FUNCTION public.set_contract_document_attachments_updated_by()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END; $$
LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER contract_document_attachments_updated_at
  BEFORE UPDATE ON public.contract_document_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER contract_document_attachments_set_updated_by
  BEFORE UPDATE ON public.contract_document_attachments
  FOR EACH ROW EXECUTE FUNCTION public.set_contract_document_attachments_updated_by();

-- Owner/Admin, SELECT included — the shape every 7I table already carries
-- (20260926000000 §6) and the house pattern for legal documents. No DELETE
-- policy: soft delete only, and an attachment on an executed contract is part
-- of the record.
ALTER TABLE public.contract_document_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY contract_document_attachments_select_owner_admin
  ON public.contract_document_attachments
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY contract_document_attachments_insert_owner_admin
  ON public.contract_document_attachments
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));

CREATE POLICY contract_document_attachments_update_owner_admin
  ON public.contract_document_attachments
  FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]))
  WITH CHECK (company_id = public.get_my_company_id()
         AND public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]));


-- ============================================================================
-- 4. R13 — contract_documents.sent_at
-- ============================================================================
--
-- R13 requires the notarisation date entered from the stamped paper to be
-- validated as "not in the future, not before the send date", and there WAS no
-- send date: `contract_documents` carried `created_at` and `status` and nothing
-- else. `created_at` is the wrong anchor — a draft can be created days before
-- it is sent, which would admit a notarisation date earlier than the document
-- the notary saw.
--
-- Nullable: a draft has not been sent. Set when status moves to 'sent'.

ALTER TABLE public.contract_documents
  ADD COLUMN sent_at timestamp with time zone;

COMMENT ON COLUMN public.contract_documents.sent_at IS
  '7I R13 [S150]. When the contract actually went out, as opposed to when the '
  'row was created. The floor for validating a notarisation date entered from '
  'stamped paper — created_at would admit a date earlier than the instrument '
  'the notary saw.';
