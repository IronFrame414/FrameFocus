-- ============================================================================
-- STAGE 2 of Allowances & Selections — the selections tables and their
-- policies. [S171]
-- ============================================================================
--
-- Spec: docs/specs/allowances-selections-spec.md §3, §4. Analysis 2b.3, 2b.5.
-- Stages 0/1 (20261024000000, 20261025000000) made 'allowance' a row_type;
-- this stage gives it something to be selected against.
--
-- FOUR DESIGN FACTS THAT SHAPE THE SCHEMA — rulings, not preferences:
--
-- 1. A SEPARATE thread table (Q12), not a fourth chat_threads.kind.
--    chat_threads is UNIQUE (project_id, kind) — one thread per kind per
--    project — and a selection needs ONE THREAD PER SELECTION. A fourth kind
--    would also need six policy edits: the client SELECT arms are pinned to
--    kind = 'client' (a new kind is INVISIBLE to the client) and the
--    RESTRICTIVE gates are pinned the same way (a new kind is UNPROTECTED from
--    crew and foreman). A second table costs a second thread implementation and
--    avoids all of it.
--
-- 2. TWO 1:1 side-table splits, because there are TWO different floors.
--    Postgres RLS is row-level and has no column equivalent (contract-value.ts:10
--    — the reason contract_value and budgeted_amount are their own rows). So:
--      selection_option_amounts  cost basis   SELECT owner/admin/PM
--      selection_notes           internal     SELECT owner/admin/PM/FOREMAN
--    The project Selections tab is visible to SUBCONTRACTORS (Q10) and must be
--    UNABLE to read money, not merely decline to render it. A note reading
--    "margin is thin here" reaching a sub is the failure the second floor
--    exists to prevent. The client never gets a SELECT arm on amounts: a client
--    who reads unit_cost and markup_percent reverses the markup.
--
-- 3. SELL IS STAMPED at offer and at signature (offered_*, signed_*) on the
--    selections row — client-readable, with no cost basis recoverable from
--    them. This is NOT "sell stored on the budget line" (project-income.ts:11
--    forbids that): it is the price OFFERED and ACCEPTED, the same category as
--    invoice_lines.billed_amount, the one place sell is already materialised.
--    It exists so (a) the client reads a figure without reading its cost basis
--    and (b) the figure she signed cannot move under her signature — a
--    post-approval cost edit cannot change contract value without a new one.
--    Stage 5 sums signed_variance; stage 2 only stores it.
--
-- 4. CLIENT-SUPPLIED (Q6) means NO MONEY AT ALL, and the budget derivation
--    (stage 5) must EXCLUDE such rows from the allowance join — joined at zero
--    they render a phantom full underage. The CHECK below makes "no money"
--    structural: client_supplied ⇒ every stamp IS NULL.
--
-- NOTHING HERE TOUCHES project_budget_items. The §2 budget subcategory is
-- DERIVED AT READ (Q2); insert-only doctrine and s97ct-budget-immutability
-- stand.
--
-- Status lifecycle: draft → in_discussion → awaiting_approval → approved, with
-- two RETURNS (Q9): approved → in_discussion (revision, new signing session,
-- old retained) and awaiting_approval → draft (denial). Denial is a return, not
-- a terminus, so there is no 'denied' selection status — the SESSION records
-- 'declined'.
-- ============================================================================

BEGIN;

-- ── §3.1 selection_areas ────────────────────────────────────────────────────
CREATE TABLE public.selection_areas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  updated_by  uuid REFERENCES auth.users(id),
  is_deleted  boolean NOT NULL DEFAULT false,
  deleted_at  timestamptz,
  project_id  uuid NOT NULL REFERENCES public.projects(id),
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX selection_areas_project_name_live
  ON public.selection_areas (project_id, lower(name)) WHERE is_deleted = false;
CREATE INDEX idx_selection_areas_project_id ON public.selection_areas(project_id);

ALTER TABLE public.selection_areas ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.selection_areas ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.selection_areas ALTER COLUMN updated_by SET DEFAULT auth.uid();
CREATE INDEX idx_selection_areas_company_id ON public.selection_areas(company_id);
CREATE TRIGGER selection_areas_updated_at BEFORE UPDATE ON public.selection_areas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION set_selection_areas_updated_by() RETURNS TRIGGER AS $$
BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER selection_areas_set_updated_by BEFORE UPDATE ON public.selection_areas
  FOR EACH ROW EXECUTE FUNCTION set_selection_areas_updated_by();
ALTER TABLE public.selection_areas ENABLE ROW LEVEL SECURITY;

-- ── §3.2 selections ─────────────────────────────────────────────────────────
CREATE TABLE public.selections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  updated_by  uuid REFERENCES auth.users(id),
  is_deleted  boolean NOT NULL DEFAULT false,
  deleted_at  timestamptz,
  project_id        uuid NOT NULL REFERENCES public.projects(id),
  area_id           uuid REFERENCES public.selection_areas(id),
  name              text NOT NULL,
  description       text,
  due_date          date,
  -- The link that makes variance computable — to the BUDGET line, not the
  -- estimate row: a CO's allowance has a budget line too, and the link must
  -- survive estimate revision.
  allowance_budget_item_id uuid REFERENCES public.project_budget_items(id),
  mode              text NOT NULL DEFAULT 'options'
                    CONSTRAINT selections_mode_check CHECK (mode = ANY (ARRAY['options'::text, 'discussion'::text])),
  allow_multiple    boolean NOT NULL DEFAULT false,
  show_differences  boolean NOT NULL DEFAULT true,
  client_supplied   boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'draft'
                    CONSTRAINT selections_status_check CHECK (status = ANY (ARRAY['draft'::text, 'in_discussion'::text, 'awaiting_approval'::text, 'approved'::text])),
  -- Stamps — see fact 3. numeric(12,2), as invoice_lines.billed_amount.
  offered_sell_amount          numeric(12,2),
  offered_allowance_deduction  numeric(12,2),
  offered_variance             numeric(12,2),
  offered_at                   timestamptz,
  signed_sell_amount           numeric(12,2),
  signed_allowance_deduction   numeric(12,2),
  signed_variance              numeric(12,2),
  signed_at                    timestamptz,
  signed_session_id            uuid, -- FK added after selection_signing_sessions exists
  -- Fact 4, structural: a client-supplied selection carries no money.
  CONSTRAINT selections_client_supplied_no_money CHECK (
    client_supplied = false OR (
      offered_sell_amount IS NULL AND offered_allowance_deduction IS NULL AND offered_variance IS NULL
      AND signed_sell_amount IS NULL AND signed_allowance_deduction IS NULL AND signed_variance IS NULL
    )
  ),
  -- The three offered stamps travel together, as do the three signed ones.
  CONSTRAINT selections_offered_stamps_together CHECK (
    (offered_sell_amount IS NULL) = (offered_allowance_deduction IS NULL)
    AND (offered_sell_amount IS NULL) = (offered_variance IS NULL)
    AND (offered_sell_amount IS NULL) = (offered_at IS NULL)
  ),
  CONSTRAINT selections_signed_stamps_together CHECK (
    (signed_sell_amount IS NULL) = (signed_allowance_deduction IS NULL)
    AND (signed_sell_amount IS NULL) = (signed_variance IS NULL)
    AND (signed_sell_amount IS NULL) = (signed_at IS NULL)
    AND (signed_sell_amount IS NULL) = (signed_session_id IS NULL)
  ),
  -- approved ⇔ signed (a money selection); a client-supplied one is approved
  -- by signature too but carries no stamps, so the equivalence is money-only.
  CONSTRAINT selections_approved_is_signed CHECK (
    client_supplied = true OR (status = 'approved') = (signed_at IS NOT NULL)
  )
);
CREATE INDEX idx_selections_project_id ON public.selections(project_id);
CREATE INDEX idx_selections_area_id ON public.selections(area_id);
CREATE INDEX idx_selections_allowance_budget_item_id ON public.selections(allowance_budget_item_id);

ALTER TABLE public.selections ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.selections ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.selections ALTER COLUMN updated_by SET DEFAULT auth.uid();
CREATE INDEX idx_selections_company_id ON public.selections(company_id);
CREATE TRIGGER selections_updated_at BEFORE UPDATE ON public.selections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION set_selections_updated_by() RETURNS TRIGGER AS $$
BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER selections_set_updated_by BEFORE UPDATE ON public.selections
  FOR EACH ROW EXECUTE FUNCTION set_selections_updated_by();
ALTER TABLE public.selections ENABLE ROW LEVEL SECURITY;

-- ── §3.3 selection_options — NO money columns ───────────────────────────────
CREATE TABLE public.selection_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  updated_by  uuid REFERENCES auth.users(id),
  is_deleted  boolean NOT NULL DEFAULT false,
  deleted_at  timestamptz,
  selection_id        uuid NOT NULL REFERENCES public.selections(id),
  name                text NOT NULL,
  description         text,
  spec_detail         text,
  source              text NOT NULL DEFAULT 'scratch'
                      CONSTRAINT selection_options_source_check CHECK (source = ANY (ARRAY['scratch'::text, 'catalog'::text, 'budget'::text])),
  catalog_item_id     uuid REFERENCES public.cost_catalog(id),
  source_budget_item_id uuid REFERENCES public.project_budget_items(id),
  image_file_id       uuid REFERENCES public.files(id) ON DELETE SET NULL,
  link_url            text,
  link_thumbnail_file_id uuid REFERENCES public.files(id) ON DELETE SET NULL,
  is_chosen           boolean NOT NULL DEFAULT false,
  sort_order          integer NOT NULL DEFAULT 0,
  CONSTRAINT selection_options_source_columns CHECK (
    CASE source
      WHEN 'scratch' THEN catalog_item_id IS NULL AND source_budget_item_id IS NULL
      WHEN 'catalog' THEN catalog_item_id IS NOT NULL AND source_budget_item_id IS NULL
      WHEN 'budget'  THEN source_budget_item_id IS NOT NULL AND catalog_item_id IS NULL
      ELSE false
    END
  )
);
CREATE INDEX idx_selection_options_selection_id ON public.selection_options(selection_id);

ALTER TABLE public.selection_options ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.selection_options ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.selection_options ALTER COLUMN updated_by SET DEFAULT auth.uid();
CREATE INDEX idx_selection_options_company_id ON public.selection_options(company_id);
CREATE TRIGGER selection_options_updated_at BEFORE UPDATE ON public.selection_options
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION set_selection_options_updated_by() RETURNS TRIGGER AS $$
BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER selection_options_set_updated_by BEFORE UPDATE ON public.selection_options
  FOR EACH ROW EXECUTE FUNCTION set_selection_options_updated_by();
ALTER TABLE public.selection_options ENABLE ROW LEVEL SECURITY;

-- ── §3.4 selection_option_amounts — THE COST-BASIS SIDE TABLE ───────────────
-- 1:1 off selection_options. Floor: owner/admin/PM. No client arm, ever.
CREATE TABLE public.selection_option_amounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  updated_by  uuid REFERENCES auth.users(id),
  option_id   uuid NOT NULL UNIQUE REFERENCES public.selection_options(id) ON DELETE CASCADE,
  quantity    numeric(12,4) NOT NULL DEFAULT 1,
  unit_cost   numeric(12,2) NOT NULL DEFAULT 0,
  markup_percent numeric(7,3)
);

ALTER TABLE public.selection_option_amounts ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.selection_option_amounts ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.selection_option_amounts ALTER COLUMN updated_by SET DEFAULT auth.uid();
CREATE INDEX idx_selection_option_amounts_company_id ON public.selection_option_amounts(company_id);
CREATE TRIGGER selection_option_amounts_updated_at BEFORE UPDATE ON public.selection_option_amounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION set_selection_option_amounts_updated_by() RETURNS TRIGGER AS $$
BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER selection_option_amounts_set_updated_by BEFORE UPDATE ON public.selection_option_amounts
  FOR EACH ROW EXECUTE FUNCTION set_selection_option_amounts_updated_by();
ALTER TABLE public.selection_option_amounts ENABLE ROW LEVEL SECURITY;

-- ── §3.5 selection_notes — INTERNAL NOTES, the second floor ─────────────────
-- 1:1 off selections. Floor: owner/admin/PM/FOREMAN. No sub, no crew, no client.
CREATE TABLE public.selection_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),
  updated_by  uuid REFERENCES auth.users(id),
  selection_id uuid NOT NULL UNIQUE REFERENCES public.selections(id) ON DELETE CASCADE,
  internal_notes text NOT NULL DEFAULT ''
);

ALTER TABLE public.selection_notes ALTER COLUMN company_id SET DEFAULT get_my_company_id();
ALTER TABLE public.selection_notes ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.selection_notes ALTER COLUMN updated_by SET DEFAULT auth.uid();
CREATE INDEX idx_selection_notes_company_id ON public.selection_notes(company_id);
CREATE TRIGGER selection_notes_updated_at BEFORE UPDATE ON public.selection_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION set_selection_notes_updated_by() RETURNS TRIGGER AS $$
BEGIN NEW.updated_by = auth.uid(); RETURN NEW; END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER selection_notes_set_updated_by BEFORE UPDATE ON public.selection_notes
  FOR EACH ROW EXECUTE FUNCTION set_selection_notes_updated_by();
ALTER TABLE public.selection_notes ENABLE ROW LEVEL SECURITY;

-- ── §3.6 selection_threads / _messages / _message_photos (Q12) ──────────────
CREATE TABLE public.selection_threads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  selection_id uuid NOT NULL UNIQUE REFERENCES public.selections(id) ON DELETE CASCADE
);
ALTER TABLE public.selection_threads ALTER COLUMN company_id SET DEFAULT get_my_company_id();
CREATE INDEX idx_selection_threads_company_id ON public.selection_threads(company_id);
ALTER TABLE public.selection_threads ENABLE ROW LEVEL SECURITY;

-- Append-only (CLAUDE.md exception): written once, never updated or deleted.
CREATE TABLE public.selection_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  thread_id         uuid NOT NULL REFERENCES public.selection_threads(id) ON DELETE CASCADE,
  author_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  body              text NOT NULL,
  link_url          text
);
ALTER TABLE public.selection_messages ALTER COLUMN company_id SET DEFAULT get_my_company_id();
CREATE INDEX idx_selection_messages_company_id ON public.selection_messages(company_id);
CREATE INDEX idx_selection_messages_thread_id ON public.selection_messages(thread_id, created_at);
ALTER TABLE public.selection_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.selection_message_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  message_id  uuid NOT NULL REFERENCES public.selection_messages(id) ON DELETE CASCADE,
  file_id     uuid NOT NULL REFERENCES public.files(id),
  sort_order  integer NOT NULL DEFAULT 0
);
ALTER TABLE public.selection_message_photos ALTER COLUMN company_id SET DEFAULT get_my_company_id();
CREATE INDEX idx_selection_message_photos_company_id ON public.selection_message_photos(company_id);
CREATE INDEX idx_selection_message_photos_message_id ON public.selection_message_photos(message_id);
ALTER TABLE public.selection_message_photos ENABLE ROW LEVEL SECURITY;

-- ── §3.7 selection_signing_sessions ─────────────────────────────────────────
-- co_signing_sessions minus the token: PORTAL ONLY. A selection is signed by
-- an authenticated client in her portal; there is no emailed anonymous link.
-- The CHECK is therefore tighter than the CO one (which admits token_link).
CREATE TABLE public.selection_signing_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  selection_id       uuid NOT NULL REFERENCES public.selections(id),
  status             text NOT NULL DEFAULT 'pending'
                     CONSTRAINT selection_signing_sessions_status_check
                     CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'declined'::text, 'expired'::text, 'invalidated'::text])),
  signer_channel     text NOT NULL DEFAULT 'portal_session'
                     CONSTRAINT selection_signing_sessions_channel_check CHECK (signer_channel = 'portal_session'),
  signer_profile_id  uuid REFERENCES public.profiles(id),
  signed_at          timestamptz,
  signature_type     text CONSTRAINT selection_signing_sessions_sigtype_check CHECK (signature_type IS NULL OR signature_type = ANY (ARRAY['draw'::text, 'type'::text])),
  signature_data     text,
  signer_name        text,
  signer_ip          text,
  signer_user_agent  text,
  consent_given      boolean NOT NULL DEFAULT false,
  consent_text       text,
  declined_at        timestamptz,
  decline_notes      text,
  superseded_at      timestamptz,
  -- What the client SAW: option set, stamps, binding wording — signed-artifact
  -- doctrine ("a document the client actually saw is never destroyed").
  snapshot           jsonb,
  CONSTRAINT selection_signing_sessions_completed_shape CHECK (
    status <> 'completed' OR (
      signed_at IS NOT NULL AND signer_profile_id IS NOT NULL AND signature_data IS NOT NULL
      AND consent_given = true AND consent_text IS NOT NULL AND snapshot IS NOT NULL
    )
  )
);
-- 2b.5: AT MOST ONE CURRENT SIGNATURE. Without this, two completed sessions
-- could both claim to be current and the audit trail is ambiguous.
CREATE UNIQUE INDEX selection_signing_sessions_one_current
  ON public.selection_signing_sessions (selection_id)
  WHERE status = 'completed' AND superseded_at IS NULL;
CREATE INDEX idx_selection_signing_sessions_company_id ON public.selection_signing_sessions(company_id);
CREATE INDEX idx_selection_signing_sessions_selection_id ON public.selection_signing_sessions(selection_id);
CREATE INDEX idx_selection_signing_sessions_signer_profile_id ON public.selection_signing_sessions(signer_profile_id);
CREATE TRIGGER selection_signing_sessions_updated_at BEFORE UPDATE ON public.selection_signing_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
ALTER TABLE public.selection_signing_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.selections
  ADD CONSTRAINT selections_signed_session_id_fkey
  FOREIGN KEY (signed_session_id) REFERENCES public.selection_signing_sessions(id);

-- ============================================================================
-- POLICIES (§4)
-- ============================================================================
-- Staff arms use get_my_company_id() + can_view_project(); client arms use
-- my_company_id_flat() + is_client_of_project() + client_has_full_access() —
-- the M9 shape (20261019000000), NOT the chat_* kind test.

-- ── selection_areas ──
CREATE POLICY selection_areas_select_staff ON public.selection_areas FOR SELECT
  USING (company_id = get_my_company_id() AND get_my_role() <> 'client' AND can_view_project(project_id));
CREATE POLICY selection_areas_select_client ON public.selection_areas FOR SELECT
  USING (company_id = my_company_id_flat() AND is_deleted = false
         AND is_client_of_project(project_id) AND client_has_full_access());
CREATE POLICY selection_areas_insert_manager ON public.selection_areas FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]) AND can_view_project(project_id));
CREATE POLICY selection_areas_update_manager ON public.selection_areas FOR UPDATE
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]) AND can_view_project(project_id))
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]) AND can_view_project(project_id));

-- ── selections ──
-- Staff: every role that can view the project, INCLUDING subcontractor (Q10).
-- The table carries no cost; the money is on the floored side tables.
CREATE POLICY selections_select_staff ON public.selections FOR SELECT
  USING (company_id = get_my_company_id() AND get_my_role() <> 'client' AND can_view_project(project_id));
-- Client: never a draft.
CREATE POLICY selections_select_client ON public.selections FOR SELECT
  USING (company_id = my_company_id_flat() AND is_deleted = false AND status <> 'draft'
         AND is_client_of_project(project_id) AND client_has_full_access());
CREATE POLICY selections_insert_manager ON public.selections FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]) AND can_view_project(project_id));
CREATE POLICY selections_update_manager ON public.selections FOR UPDATE
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]) AND can_view_project(project_id))
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]) AND can_view_project(project_id));
-- No DELETE policy: soft-delete only (a selection may carry a signature).

-- ── selection_options ──
CREATE POLICY selection_options_select_staff ON public.selection_options FOR SELECT
  USING (company_id = get_my_company_id() AND get_my_role() <> 'client'
         AND EXISTS (SELECT 1 FROM public.selections s WHERE s.id = selection_id AND can_view_project(s.project_id)));
CREATE POLICY selection_options_select_client ON public.selection_options FOR SELECT
  USING (company_id = my_company_id_flat() AND is_deleted = false AND client_has_full_access()
         AND EXISTS (SELECT 1 FROM public.selections s WHERE s.id = selection_id
                     AND s.is_deleted = false AND s.status <> 'draft' AND is_client_of_project(s.project_id)));
CREATE POLICY selection_options_insert_manager ON public.selection_options FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
              AND EXISTS (SELECT 1 FROM public.selections s WHERE s.id = selection_id AND can_view_project(s.project_id)));
CREATE POLICY selection_options_update_manager ON public.selection_options FOR UPDATE
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
         AND EXISTS (SELECT 1 FROM public.selections s WHERE s.id = selection_id AND can_view_project(s.project_id)))
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]));
CREATE POLICY selection_options_delete_manager ON public.selection_options FOR DELETE
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
         AND EXISTS (SELECT 1 FROM public.selections s WHERE s.id = selection_id
                     AND s.status IN ('draft', 'in_discussion') AND can_view_project(s.project_id)));

-- ── selection_option_amounts — THE FLOOR ──
-- owner/admin/PM only. No client arm. No sub. No foreman. No crew.
CREATE POLICY selection_option_amounts_select_manager ON public.selection_option_amounts FOR SELECT
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]));
CREATE POLICY selection_option_amounts_insert_manager ON public.selection_option_amounts FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]));
CREATE POLICY selection_option_amounts_update_manager ON public.selection_option_amounts FOR UPDATE
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]))
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]));
CREATE POLICY selection_option_amounts_delete_manager ON public.selection_option_amounts FOR DELETE
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]));

-- ── selection_notes — THE SECOND FLOOR ──
-- owner/admin/PM/FOREMAN. No sub, no crew, no client.
CREATE POLICY selection_notes_select_staff ON public.selection_notes FOR SELECT
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text]));
CREATE POLICY selection_notes_insert_staff ON public.selection_notes FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text]));
CREATE POLICY selection_notes_update_staff ON public.selection_notes FOR UPDATE
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text]))
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text]));

-- ── selection_threads ──
-- Visibility FOLLOWS the selection's (§3.6): a sub who can see the selection
-- can read its thread; the money never enters a thread.
CREATE POLICY selection_threads_select_staff ON public.selection_threads FOR SELECT
  USING (company_id = get_my_company_id() AND get_my_role() <> 'client'
         AND EXISTS (SELECT 1 FROM public.selections s WHERE s.id = selection_id AND can_view_project(s.project_id)));
CREATE POLICY selection_threads_select_client ON public.selection_threads FOR SELECT
  USING (company_id = my_company_id_flat() AND client_has_full_access()
         AND EXISTS (SELECT 1 FROM public.selections s WHERE s.id = selection_id
                     AND s.is_deleted = false AND s.status <> 'draft' AND is_client_of_project(s.project_id)));
CREATE POLICY selection_threads_insert_manager ON public.selection_threads FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text])
              AND EXISTS (SELECT 1 FROM public.selections s WHERE s.id = selection_id AND can_view_project(s.project_id)));

-- ── selection_messages ──
CREATE POLICY selection_messages_select_staff ON public.selection_messages FOR SELECT
  USING (company_id = get_my_company_id() AND get_my_role() <> 'client'
         AND EXISTS (SELECT 1 FROM public.selection_threads t JOIN public.selections s ON s.id = t.selection_id
                     WHERE t.id = thread_id AND can_view_project(s.project_id)));
CREATE POLICY selection_messages_select_client ON public.selection_messages FOR SELECT
  USING (company_id = my_company_id_flat() AND client_has_full_access()
         AND EXISTS (SELECT 1 FROM public.selection_threads t JOIN public.selections s ON s.id = t.selection_id
                     WHERE t.id = thread_id AND s.is_deleted = false AND s.status <> 'draft' AND is_client_of_project(s.project_id)));
-- Authors: staff who can read it (owner/admin/PM/foreman/crew/sub) and the client.
CREATE POLICY selection_messages_insert_staff ON public.selection_messages FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() <> 'client'
              AND author_profile_id = get_my_profile_id()
              AND EXISTS (SELECT 1 FROM public.selection_threads t JOIN public.selections s ON s.id = t.selection_id
                          WHERE t.id = thread_id AND can_view_project(s.project_id)));
CREATE POLICY selection_messages_insert_client ON public.selection_messages FOR INSERT
  WITH CHECK (company_id = my_company_id_flat() AND client_has_full_access()
              AND author_profile_id = get_my_profile_id()
              AND EXISTS (SELECT 1 FROM public.selection_threads t JOIN public.selections s ON s.id = t.selection_id
                          WHERE t.id = thread_id AND s.is_deleted = false AND s.status <> 'draft' AND is_client_of_project(s.project_id)));

-- ── selection_message_photos ──
CREATE POLICY selection_message_photos_select_staff ON public.selection_message_photos FOR SELECT
  USING (company_id = get_my_company_id() AND get_my_role() <> 'client'
         AND EXISTS (SELECT 1 FROM public.selection_messages m JOIN public.selection_threads t ON t.id = m.thread_id
                     JOIN public.selections s ON s.id = t.selection_id
                     WHERE m.id = message_id AND can_view_project(s.project_id)));
CREATE POLICY selection_message_photos_select_client ON public.selection_message_photos FOR SELECT
  USING (company_id = my_company_id_flat() AND client_has_full_access()
         AND EXISTS (SELECT 1 FROM public.selection_messages m JOIN public.selection_threads t ON t.id = m.thread_id
                     JOIN public.selections s ON s.id = t.selection_id
                     WHERE m.id = message_id AND s.is_deleted = false AND s.status <> 'draft' AND is_client_of_project(s.project_id)));
CREATE POLICY selection_message_photos_insert_author ON public.selection_message_photos FOR INSERT
  WITH CHECK (company_id = get_my_company_id()
              AND EXISTS (SELECT 1 FROM public.selection_messages m WHERE m.id = message_id AND m.author_profile_id = get_my_profile_id()));
CREATE POLICY selection_message_photos_insert_client ON public.selection_message_photos FOR INSERT
  WITH CHECK (company_id = my_company_id_flat() AND client_has_full_access()
              AND EXISTS (SELECT 1 FROM public.selection_messages m WHERE m.id = message_id AND m.author_profile_id = get_my_profile_id()));

-- ── selection_signing_sessions ──
-- Written by the SERVICE ROLE only (stage 4's service), like co_signing_sessions.
-- owner/admin/PM read; the client reads HER OWN.
CREATE POLICY selection_signing_sessions_select_manager ON public.selection_signing_sessions FOR SELECT
  USING (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text]));
CREATE POLICY selection_signing_sessions_select_own ON public.selection_signing_sessions FOR SELECT
  USING (company_id = my_company_id_flat() AND signer_profile_id = get_my_profile_id());

COMMIT;
