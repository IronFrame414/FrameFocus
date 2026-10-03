ALTER POLICY photo_share_links_insert_owner_admin ON public.photo_share_links
  WITH CHECK (company_id = get_my_company_id() AND get_my_role() = ANY (ARRAY['owner', 'admin'])
              AND EXISTS (SELECT 1 FROM public.files f
                           WHERE f.id = file_id AND f.company_id = get_my_company_id()
                             AND f.is_deleted = false AND f.mime_type LIKE 'image/%'));
