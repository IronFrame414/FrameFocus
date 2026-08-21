-- ============================================================================
-- Allowances & Selections — TWO AMENDMENTS to stage 4. [S172, Josh]
-- ============================================================================
--
-- 1. DENIED IS A RESTING STATE, NOT A TRANSIENT ONE.
--    Stage 4 built denial as an immediate return to draft with the session
--    recording 'declined'. Josh: "it should be flagged as denied. A user can
--    choose to re-open it, which moves to draft." So a denied selection SITS
--    in 'denied' until a company user explicitly reopens it. The offered
--    stamps are KEPT on a denied row so the company can see what was refused;
--    reopen clears them on the way to draft.
--
--    This pairs with WITHDRAW (kept): withdraw is the company pulling an offer
--    back and lands directly in draft — the company is already acting, there
--    is nothing to reopen. Denial is the client refusing it and lands in
--    denied, which the company must act on via reopen. Two causes, two
--    landing states, one company-owned path forward.
--
--    The client SELECT arm (`status <> 'draft'`) already admits 'denied' — she
--    sees what she declined. `approved_is_signed` is unaffected.
--
-- 2. OPTION IMAGES ARE SERVED THROUGH A SECURITY DEFINER READ KEYED ON THE
--    SELECTION — "if you can see the selection, you can see its option images."
--    No flag involved.
--
--    Josh raised the alternative — auto-setting files.client_visible on upload
--    — and agreed this is better. The two LOOK interchangeable and are not:
--      * an auto-set flag is still a flag, and a flag can be unset (by a file
--        manager edit, a bulk toggle, a future "hide from client" button) with
--        no signal that a selection just lost its picture;
--      * the flag puts the image into the GENERAL client-visible pool — it
--        appears in the portal's photo gallery and in every "client_visible"
--        listing — rather than scoping it to the selection it belongs to;
--      * under files_insert_non_client only owner/admin may set the flag, so a
--        PM's upload would have needed a second, privileged write.
--    The general client_visible mechanism stays EXACTLY as it is for documents
--    and photos. This function does not read or write it.
--
--    ⚠️ RLS DOES NOT RUN INSIDE SECURITY DEFINER, so the visibility test is
--    restated here, verbatim from selections_select_staff / _select_client
--    (20261026000000). If those arms change, this must change with them —
--    the harness S172-B pins the two together by probing every role.
-- ============================================================================

BEGIN;

-- ── 1. 'denied' ─────────────────────────────────────────────────────────────
ALTER TABLE public.selections DROP CONSTRAINT selections_status_check;
ALTER TABLE public.selections ADD CONSTRAINT selections_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'in_discussion'::text, 'awaiting_approval'::text, 'approved'::text, 'denied'::text]));

-- ── 2. The definer read ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.selection_option_images(p_selection_id uuid)
RETURNS TABLE (option_id uuid, kind text, file_id uuid, file_path text, mime_type text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH visible AS (
    SELECT s.id
    FROM public.selections s
    WHERE s.id = p_selection_id
      AND s.is_deleted = false
      AND (
        -- staff arm (selections_select_staff)
        (s.company_id = get_my_company_id()
         AND get_my_role() <> 'client'
         AND can_view_project(s.project_id))
        OR
        -- client arm (selections_select_client)
        (s.company_id = my_company_id_flat()
         AND s.status <> 'draft'
         AND is_client_of_project(s.project_id)
         AND client_has_full_access())
      )
  )
  SELECT o.id, 'image'::text, f.id, f.file_path, f.mime_type
    FROM visible v
    JOIN public.selection_options o ON o.selection_id = v.id AND o.is_deleted = false
    JOIN public.files f ON f.id = o.image_file_id AND f.is_deleted = false
  UNION ALL
  SELECT o.id, 'link_thumbnail'::text, f.id, f.file_path, f.mime_type
    FROM visible v
    JOIN public.selection_options o ON o.selection_id = v.id AND o.is_deleted = false
    JOIN public.files f ON f.id = o.link_thumbnail_file_id AND f.is_deleted = false;
$$;

REVOKE ALL ON FUNCTION public.selection_option_images(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.selection_option_images(uuid) TO authenticated;

COMMIT;
