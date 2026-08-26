-- ============================================================================
-- Allowances & Selections — STAGE 6: the specifications sheet. [S175 item 4]
-- Spec: docs/specs/allowances-selections-spec.md §7.3, §9.4.
-- ============================================================================
--
-- Two registry rows and nothing else. Stage 6 adds NO TABLE, NO COLUMN and NO
-- POLICY: the sheet is a rendering of rows stage 2 and stage 4 already store,
-- filed through the `files` table every other PDF service already uses.
--
-- ---------------------------------------------------------------------------
-- 1. `files_category_check` gains 'selections'
-- ---------------------------------------------------------------------------
-- Precedent, byte for byte: 'deliveries' (20260723010000), 'compliance' and
-- 'lien_releases' (20260921000000 / 20260922000000). The category does not
-- decide who may read the row — `files_select_non_client` (20260728000000)
-- gates only the trio contracts/change_orders/invoices — it makes the artifact
-- findable as something other than 'other'.
--
-- ⚠️ AND THE CATEGORY IS THE REPLACE KEY, WHICH MAKES IT LOAD-BEARING.
-- `storeSelectionSpecPdf()` keeps exactly ONE current sheet per project and
-- hard-removes the stale one, found by `(project_id, category = 'selections')`
-- — there is no `files.selection_id` to key on, because the sheet is a
-- PROJECT-level artifact covering N selections, and a scalar FK cannot name N
-- (the same reason `email_logs` got no `selection_id` at 20261029000000).
--
-- So a row that lands in this category by any OTHER route would be deleted by
-- the next generation. Nothing offers that route: the manual upload picker
-- (`app/dashboard/projects/[id]/files/upload/upload-form.tsx`) lists nine
-- categories and this is not one of them, exactly as 'deliveries',
-- 'compliance', 'safety' and 'lien_releases' are not. **Do not add
-- 'selections' to that picker.** If a manual upload into this category is ever
-- wanted, the replace key has to change first.
--
-- ---------------------------------------------------------------------------
-- 2. `email_types` gains 'selection_specifications'
-- ---------------------------------------------------------------------------
-- `20260720000000_email_types_lookup.sql` dropped `email_logs_email_type_check`
-- and replaced it with a FOREIGN KEY to `email_types`, so a new sender is an
-- INSERT here, not a CHECK edit. Precedent: 20260807000000 (invoice),
-- 20260815000000 (invoice_reminder), 20260906000000 (mention), 20260915000000
-- (invite), 20261029000000 (selection_released).
--
-- ⚠️ BOTH HALVES OR NEITHER. `EmailType` in `lib/services/email-service.ts`
-- gains `'selection_specifications'` in THIS COMMIT. The table half fails at
-- RUNTIME and the union half at COMPILE time, so shipping one without the
-- other ships silently — S126 found `mention` in exactly that state.
--
-- ⚠️ AND IT IS A SEPARATE TYPE FROM `selection_released`, deliberately.
-- They are two different messages to the same person about the same rows:
-- `selection_released` asks her to CHOOSE and links the portal;
-- `selection_specifications` tells her what she chose and attaches the PDF.
-- One type covering both would make "did the spec sheet go out?" —
-- Q4.1's whole answer, since the artifact is REPLACED and only `email_logs`
-- records which version went when — unanswerable from this table.
--
-- ⚠️ NO `email_logs.selection_id` COLUMN, for 20261029000000's reason verbatim:
-- one sheet covers N selections and a scalar FK cannot describe that row
-- without naming one of the N. The ids ride in `metadata.selection_ids`.
-- ============================================================================

BEGIN;

ALTER TABLE public.files DROP CONSTRAINT IF EXISTS files_category_check;
ALTER TABLE public.files ADD CONSTRAINT files_category_check
  CHECK (category = ANY (ARRAY[
    'photos'::text, 'contracts'::text, 'plans'::text, 'permits'::text,
    'invoices'::text, 'change_orders'::text, 'daily_logs'::text,
    'receipts'::text, 'safety'::text, 'deliveries'::text,
    'compliance'::text, 'lien_releases'::text, 'selections'::text,
    'other'::text
  ]));

INSERT INTO public.email_types (email_type)
VALUES ('selection_specifications')
ON CONFLICT (email_type) DO NOTHING;

COMMIT;
