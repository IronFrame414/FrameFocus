-- ============================================================================
-- Module 7F §12 — SUB-INBOUND lien releases. The schema half.
-- ============================================================================
--
-- Ruled [Josh, S145]:
--   (i)   Signing method  — UPLOAD-BACK. Send the PDF, the signed copy comes
--         back and is uploaded. No tokenised link, no new external surface.
--   (ii)  Trigger         — TWO triggers, and the TYPE differs by trigger:
--                           sub completion -> CONDITIONAL
--                           payment        -> UNCONDITIONAL
--   (iii) Roles           — Owner/Admin, matching client-outbound.
--   (iv)  Templates       — their own rows; the sub is the lienor, the form differs.
--   Both triggers are OPTIONAL. The system prompts; it never blocks.
--
-- ----------------------------------------------------------------------------
-- WHY THIS MIGRATION IS SMALL: the table shape already shipped
-- ----------------------------------------------------------------------------
-- `20260922000000` took ruling C6 at spec time and built `lien_releases` with
-- nullable `invoice_id` plus `expense_id` / `sub_contract_id`, and
-- `lien_releases_subject_check` requiring exactly one, keyed off `direction`.
-- That was decided deliberately WHILE SUB-INBOUND WAS DEFERRED, precisely so
-- this build would not have to migrate a shipped table. It did not.
--
-- Verified live before writing this: the CHECK reads
--   client_outbound -> invoice_id NOT NULL, expense_id NULL, sub_contract_id NULL
--   sub_inbound     -> invoice_id NULL, (expense_id IS NOT NULL) <> (sub_contract_id IS NOT NULL)
-- which is exactly ruling B2's split: completion -> sub_contract_id,
-- payment -> expense_id.
--
-- So this migration adds ONE column and FOUR seeded rows per company. That is
-- the whole schema cost of the second direction.
--
-- ----------------------------------------------------------------------------
-- 1. `completed_at` — the signal that did not exist [ruling B1(b)]
-- ----------------------------------------------------------------------------
--
-- ⚠️ THE RULING NAMED A TRIGGER POINT THE SCHEMA COULD NOT EXPRESS, and the
-- Phase 2 question that surfaced it is worth keeping. There was no
-- representation of "this sub finished":
--
--   * subcontractor_contracts.status is draft|sent|signed|void — no completion.
--   * expenses.closed_out_at closes ONE commitment row, not the sub's work.
--   * subcontractors.did_not_finish is written once and READ NOWHERE
--     (payables-client.ts, TECH_DEBT #108(a)).
--   * projects.status = 'complete' is the JOB — a job has many subs.
--
-- The cheap option was to fire on the last stage closing out. It was rejected
-- because it collapses the two triggers back together on the common case where
-- the final payment closes the final stage — and keeping conditional-at-
-- completion distinct from unconditional-at-payment is the entire point of
-- ruling (ii). A conditional release says "I will release when paid"; an
-- unconditional says "I have been paid". Deriving the first from the second
-- makes it a lie.
--
-- So completion is an EXPLICIT act, recorded here. It also finally gives
-- `did_not_finish` a sibling that something actually reads: a sub-contract now
-- has both a "finished" and a "walked off" signal on the same lifecycle.

ALTER TABLE public.subcontractor_contracts
  ADD COLUMN completed_at timestamp with time zone,
  ADD COLUMN completed_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.subcontractor_contracts.completed_at IS
  'When the sub''s work on this contract was marked complete [S145, ruling B1(b)]. '
  'An EXPLICIT act, not derived from stage closeout — 7F §12 fires a CONDITIONAL '
  'sub-inbound lien-release prompt here, and payment fires the UNCONDITIONAL one. '
  'Deriving this from the last payment would collapse the two into one event. '
  'Advisory throughout: nothing blocks on it.';

-- ⚠️ FROZEN BELOW OWNER/ADMIN, like every other financial column on this table.
-- The existing trigger body is preserved verbatim from the live definition read
-- at S145 and gains two lines. Recreated rather than ALTERed because Postgres
-- stores plpgsql as text — the S143 rename lesson, applied pre-emptively.
CREATE OR REPLACE FUNCTION public.enforce_subcontractor_contracts_column_scope()
RETURNS TRIGGER AS $$
BEGIN
  -- Service-role clients have no auth context; RLS already doesn't apply to
  -- them and this trigger must not break their writes.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.get_my_role() = ANY (ARRAY['owner'::text, 'admin'::text]) THEN
    RETURN NEW;
  END IF;

  IF NEW.contract_value IS DISTINCT FROM OLD.contract_value
     OR NEW.retainage_percent IS DISTINCT FROM OLD.retainage_percent
     OR NEW.retainage_shape IS DISTINCT FROM OLD.retainage_shape
     OR NEW.signed_doc_file_id IS DISTINCT FROM OLD.signed_doc_file_id
     OR NEW.executed_date IS DISTINCT FROM OLD.executed_date
     OR NEW.member_id IS DISTINCT FROM OLD.member_id
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at   -- [S145]
     OR NEW.completed_by IS DISTINCT FROM OLD.completed_by   -- [S145]
     THEN
    RAISE EXCEPTION 'The financial terms of a subcontract are Owner/Admin only.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- ----------------------------------------------------------------------------
-- 2. The four sub-inbound templates [ruling B5]
-- ----------------------------------------------------------------------------
--
-- Four, mirroring the client set [ruling B3], so `type` x `is_final` selects
-- the same way in both directions and `selectTemplate()` needs no change — it
-- already filters on `direction`.
--
-- PRE-NAMED, NOT PRE-FILLED, exactly as client-outbound: no PDF is attached and
-- none will be. The company uploads its own form. FrameFocus authors no legal
-- text in either direction — the liability posture does not change because the
-- lienor does.
--
-- Re-runnable: skips any company that already has sub-inbound rows.

INSERT INTO public.lien_release_templates
  (company_id, name, type, is_final, direction, is_default, created_by, updated_by)
SELECT c.id, t.name, t.type, t.is_final, 'sub_inbound', true, NULL, NULL
FROM public.companies c
CROSS JOIN (VALUES
    ('Sub Conditional Release',                    'conditional',   false),
    ('Sub Unconditional Release',                  'unconditional', false),
    ('Sub Unconditional Release — Final Payment',  'unconditional', true),
    ('Sub Conditional Release — Final Payment',    'conditional',   true)
  ) AS t(name, type, is_final)
WHERE NOT EXISTS (
  SELECT 1 FROM public.lien_release_templates x
  WHERE x.company_id = c.id AND x.direction = 'sub_inbound'
);

-- New companies get BOTH sets at signup. The shipped seed function is replaced
-- rather than supplemented, so one function owns the whole default set and a
-- future third direction has one place to land.
CREATE OR REPLACE FUNCTION public.seed_lien_release_templates()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.lien_release_templates
    (company_id, name, type, is_final, direction, is_default, created_by, updated_by)
  SELECT NEW.id, t.name, t.type, t.is_final, t.direction, true, NULL, NULL
  FROM (VALUES
      ('Conditional Release',                        'conditional',   false, 'client_outbound'),
      ('Unconditional Release',                      'unconditional', false, 'client_outbound'),
      ('Unconditional Release — Final Payment',      'unconditional', true,  'client_outbound'),
      ('Conditional Release — Final Payment',        'conditional',   true,  'client_outbound'),
      ('Sub Conditional Release',                    'conditional',   false, 'sub_inbound'),
      ('Sub Unconditional Release',                  'unconditional', false, 'sub_inbound'),
      ('Sub Unconditional Release — Final Payment',  'unconditional', true,  'sub_inbound'),
      ('Sub Conditional Release — Final Payment',    'conditional',   true,  'sub_inbound')
    ) AS t(name, type, is_final, direction);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 3. One unconditional per PAID STAGE [ruling B2]
-- ----------------------------------------------------------------------------
--
-- Client-outbound is one release per invoice per type
-- (idx_lien_releases_one_per_invoice_type). Sub-inbound mirrors it on the two
-- subject columns: one release per expense (a paid stage) per type, and one per
-- sub-contract per type for the completion path.
--
-- Voided rows are excluded from both, so a corrected release can be reissued
-- after a void — the supersedes-link exists for exactly that.

CREATE UNIQUE INDEX idx_lien_releases_one_per_expense_type
  ON public.lien_releases (expense_id, type)
  WHERE expense_id IS NOT NULL AND is_deleted = false AND status <> 'voided';

CREATE UNIQUE INDEX idx_lien_releases_one_per_sub_contract_type
  ON public.lien_releases (sub_contract_id, type)
  WHERE sub_contract_id IS NOT NULL AND is_deleted = false AND status <> 'voided';

-- ----------------------------------------------------------------------------
-- 4. What is NOT here
-- ----------------------------------------------------------------------------
-- No new table, no new policy, no new external surface.
--
-- RLS: `lien_releases` and `lien_release_templates` are already Owner/Admin on
-- SELECT, INSERT and UPDATE, with no DELETE policy at all. Ruling (iii) is
-- therefore satisfied by the shipped policies — sub-inbound inherits them by
-- being rows in the same tables. Choosing Owner-ONLY would have required a new,
-- narrower arm; Owner/Admin was both the ruling and the zero-cost option.
--
-- No tokenised signing route. Ruling (i) is upload-back, which reuses
-- `attachNotarizedCopy()` and touches no external surface — so sub-inbound is
-- clear of Gate 1, which S140 re-scoped to still cover exactly this: "a surface
-- aimed at a party the platform does not email today, most notably
-- subcontractors".
