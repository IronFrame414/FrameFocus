-- ============================================================================
-- S114 PART A, section 1 — the Project Executive's OPERATIONAL arms.
-- ============================================================================
--
-- R1 [Josh, 2026-09-27]: complete access to the projects it is assigned to,
-- two carve-outs (no refunds; no contract authority), nothing at company level.
-- 20261830/1910/1920/1930 gave it its projects' MONEY. This gives it the rest
-- of what a project_manager does ON A PROJECT: files and photos, tasks,
-- phases, inspections, schedule, purchase orders, selections, the project
-- team and contacts, project status, sub-thread chat, and expense entry.
--
-- Inventory: docs/specs/S114-SPEC-close-open-items.md FILL-A-1 — 114 policies
-- name project_manager; this section is G5's table arms (46). The storage arm
-- (20261950000000), the functions (20261960000000), the ruled roster/catalog
-- reads (20261970000000) and Q2's drops (20261980000000) are their own files.
--
-- ⚠️ NEVER BY APPENDING TO A PM LIST. Many PM arms carry no project scope in
-- the policy (selection_amounts, selection_option_amounts, selection_notes,
-- task_dependencies, po_item_assignments UPDATE, schedule_entries with a NULL
-- project). A PM there is "any project"; this role must be "its projects".
-- Every arm below is its own `{table}_{cmd}_project_executive` policy through
-- pe_on_project() (role + company + assignment), resolved through the row's
-- parent where the row has no project_id.
--
-- RULINGS applied here [Josh, S114 Phase 2]:
--   Q3 A — projects UPDATE on its projects; archive ('archived') and trash
--          (is_deleted) stay Owner/Admin, enforced here, not only in the UI.
--   Q4 A — expenses: all four PM-only entry types (committed, subcontractor
--          category, subcontract/PO link, awaiting paper) on its projects.
--          Retainage stays Owner/Admin, as for the PM.
--   Q6 A — schedule_entries on its projects only (plus its own rows, which
--          schedule_entries_select_scoped already returns). Never the company
--          schedule. The double-booking cost is filed as debt.
--   Q7 C — timesheets are NOT in PART A. Nothing here touches time_*.
--
-- ⚠️ NOT GRANTED (each deliberately):
--   - client_contracts / subcontractor_contracts / contract_documents writes,
--     client_refunds writes — R1's carve-outs (S114 Q2, Q5; S181 Q1, Q2).
--   - contacts, contact_addresses, subcontractors, cost_catalog, scope_library
--     writes — company level (S111 Q3, Q4).
--   - projects INSERT (S111 Q6); every estimate_* write and site visits (S111 Q7).
--   - safety incidents with no project — company level. Project-linked ones,
--     their injuries and witnesses are already readable (can_view_project).
--   - chat_messages in CLIENT threads: no staff role inserts there through RLS
--     (chat_messages_insert_authorized covers crew and sub kinds only); Q9's
--     client-thread reach is may_enter_client_thread(), in 20261960000000.
--   - purchase_order_item_assignments: the assignable-member list is left as
--     the PM's (O/A/PM/F/crew). The PE can assign; it is not itself assignable
--     to a PO line. Narrower option, taken unattended; see the S114 report.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. files — upload and edit on its projects (photos included).
-- ---------------------------------------------------------------------------
-- Mirrors files_insert_non_client / files_update_non_client for a PM, scoped
-- to its projects. 'invoices' files are allowed (it has invoice authority on
-- its projects, 1910); 'change_orders' stay excluded exactly as for the PM
-- (generated server-side); 'contracts' are carve-out 2.
CREATE POLICY files_insert_project_executive ON public.files FOR INSERT
  WITH CHECK (company_id = get_my_company_id()
    AND project_id IS NOT NULL
    AND pe_on_project(project_id)
    AND COALESCE(client_visible, false) = false
    AND category <> ALL (ARRAY['contracts'::text, 'change_orders'::text]));

CREATE POLICY files_update_project_executive ON public.files FOR UPDATE
  USING (company_id = get_my_company_id()
    AND project_id IS NOT NULL
    AND pe_on_project(project_id)
    AND category <> ALL (ARRAY['contracts'::text, 'change_orders'::text]))
  WITH CHECK (company_id = get_my_company_id()
    AND project_id IS NOT NULL
    AND pe_on_project(project_id)
    AND category <> ALL (ARRAY['contracts'::text, 'change_orders'::text]));

-- ---------------------------------------------------------------------------
-- 2. tasks, task_dependencies, phases, inspections.
-- ---------------------------------------------------------------------------
CREATE POLICY tasks_insert_project_executive ON public.tasks FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));
CREATE POLICY tasks_update_project_executive ON public.tasks FOR UPDATE
  USING (company_id = get_my_company_id() AND pe_on_project(project_id))
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));

-- A dependency has no project_id: BOTH ends must be tasks on its projects.
CREATE POLICY task_dependencies_insert_project_executive ON public.task_dependencies FOR INSERT
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM tasks p WHERE p.id = task_dependencies.predecessor_id AND pe_on_project(p.project_id))
    AND EXISTS (SELECT 1 FROM tasks s WHERE s.id = task_dependencies.successor_id AND pe_on_project(s.project_id)));
CREATE POLICY task_dependencies_update_project_executive ON public.task_dependencies FOR UPDATE
  USING (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM tasks p WHERE p.id = task_dependencies.predecessor_id AND pe_on_project(p.project_id))
    AND EXISTS (SELECT 1 FROM tasks s WHERE s.id = task_dependencies.successor_id AND pe_on_project(s.project_id)))
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM tasks p WHERE p.id = task_dependencies.predecessor_id AND pe_on_project(p.project_id))
    AND EXISTS (SELECT 1 FROM tasks s WHERE s.id = task_dependencies.successor_id AND pe_on_project(s.project_id)));

CREATE POLICY phases_insert_project_executive ON public.phases FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));
CREATE POLICY phases_update_project_executive ON public.phases FOR UPDATE
  USING (company_id = get_my_company_id() AND pe_on_project(project_id))
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));

CREATE POLICY inspections_insert_project_executive ON public.inspections FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));
CREATE POLICY inspections_update_project_executive ON public.inspections FOR UPDATE
  USING (company_id = get_my_company_id() AND pe_on_project(project_id))
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));

-- ---------------------------------------------------------------------------
-- 3. schedule_entries — its projects only (Q6 A). A NULL project_id is the
--    company schedule, which is company level.
-- ---------------------------------------------------------------------------
CREATE POLICY schedule_entries_select_project_executive ON public.schedule_entries FOR SELECT
  USING (company_id = get_my_company_id() AND project_id IS NOT NULL AND pe_on_project(project_id));
CREATE POLICY schedule_entries_insert_project_executive ON public.schedule_entries FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND project_id IS NOT NULL AND pe_on_project(project_id));
CREATE POLICY schedule_entries_update_project_executive ON public.schedule_entries FOR UPDATE
  USING (company_id = get_my_company_id() AND project_id IS NOT NULL AND pe_on_project(project_id))
  WITH CHECK (company_id = get_my_company_id() AND project_id IS NOT NULL AND pe_on_project(project_id));

-- ---------------------------------------------------------------------------
-- 4. Purchase orders, their lines, and line assignments.
-- ---------------------------------------------------------------------------
-- Closing a PO and soft-deleting one stay Owner/Admin, as for the PM.
CREATE POLICY purchase_orders_insert_project_executive ON public.purchase_orders FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));
CREATE POLICY purchase_orders_update_project_executive ON public.purchase_orders FOR UPDATE
  USING (company_id = get_my_company_id() AND pe_on_project(project_id))
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id)
    AND status <> 'closed'::text
    AND is_deleted = false);

CREATE POLICY purchase_order_items_insert_project_executive ON public.purchase_order_items FOR INSERT
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM purchase_orders po
                 WHERE po.id = purchase_order_items.purchase_order_id AND pe_on_project(po.project_id)));
CREATE POLICY purchase_order_items_update_project_executive ON public.purchase_order_items FOR UPDATE
  USING (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM purchase_orders po
                 WHERE po.id = purchase_order_items.purchase_order_id AND pe_on_project(po.project_id)))
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM purchase_orders po
                 WHERE po.id = purchase_order_items.purchase_order_id AND pe_on_project(po.project_id)));
CREATE POLICY purchase_order_items_delete_project_executive ON public.purchase_order_items FOR DELETE
  USING (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM purchase_orders po
                 WHERE po.id = purchase_order_items.purchase_order_id AND pe_on_project(po.project_id)));

CREATE POLICY po_item_assignments_insert_project_executive ON public.purchase_order_item_assignments FOR INSERT
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM company_members m JOIN profiles p ON p.id = m.profile_id
                 WHERE m.id = purchase_order_item_assignments.member_id
                   AND m.company_id = get_my_company_id()
                   AND p.role = ANY (ARRAY['owner'::text, 'admin'::text, 'project_manager'::text, 'foreman'::text, 'crew_member'::text]))
    AND EXISTS (SELECT 1 FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.purchase_order_id
                 WHERE poi.id = purchase_order_item_assignments.po_item_id AND pe_on_project(po.project_id)));
CREATE POLICY po_item_assignments_update_project_executive ON public.purchase_order_item_assignments FOR UPDATE
  USING (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.purchase_order_id
                 WHERE poi.id = purchase_order_item_assignments.po_item_id AND pe_on_project(po.project_id)))
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.purchase_order_id
                 WHERE poi.id = purchase_order_item_assignments.po_item_id AND pe_on_project(po.project_id)));

-- ---------------------------------------------------------------------------
-- 5. Selections and everything hanging off one.
-- ---------------------------------------------------------------------------
CREATE POLICY selections_insert_project_executive ON public.selections FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));
CREATE POLICY selections_update_project_executive ON public.selections FOR UPDATE
  USING (company_id = get_my_company_id() AND pe_on_project(project_id))
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));

CREATE POLICY selection_areas_insert_project_executive ON public.selection_areas FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));
CREATE POLICY selection_areas_update_project_executive ON public.selection_areas FOR UPDATE
  USING (company_id = get_my_company_id() AND pe_on_project(project_id))
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));

CREATE POLICY selection_options_insert_project_executive ON public.selection_options FOR INSERT
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selections s WHERE s.id = selection_options.selection_id AND pe_on_project(s.project_id)));
CREATE POLICY selection_options_update_project_executive ON public.selection_options FOR UPDATE
  USING (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selections s WHERE s.id = selection_options.selection_id AND pe_on_project(s.project_id)))
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selections s WHERE s.id = selection_options.selection_id AND pe_on_project(s.project_id)));
CREATE POLICY selection_options_delete_project_executive ON public.selection_options FOR DELETE
  USING (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selections s WHERE s.id = selection_options.selection_id
                  AND s.status = ANY (ARRAY['draft'::text, 'in_discussion'::text])
                  AND pe_on_project(s.project_id)));

CREATE POLICY selection_option_amounts_select_project_executive ON public.selection_option_amounts FOR SELECT
  USING (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selection_options o JOIN selections s ON s.id = o.selection_id
                 WHERE o.id = selection_option_amounts.option_id AND pe_on_project(s.project_id)));
CREATE POLICY selection_option_amounts_insert_project_executive ON public.selection_option_amounts FOR INSERT
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selection_options o JOIN selections s ON s.id = o.selection_id
                 WHERE o.id = selection_option_amounts.option_id AND pe_on_project(s.project_id)));
CREATE POLICY selection_option_amounts_update_project_executive ON public.selection_option_amounts FOR UPDATE
  USING (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selection_options o JOIN selections s ON s.id = o.selection_id
                 WHERE o.id = selection_option_amounts.option_id AND pe_on_project(s.project_id)))
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selection_options o JOIN selections s ON s.id = o.selection_id
                 WHERE o.id = selection_option_amounts.option_id AND pe_on_project(s.project_id)));
CREATE POLICY selection_option_amounts_delete_project_executive ON public.selection_option_amounts FOR DELETE
  USING (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selection_options o JOIN selections s ON s.id = o.selection_id
                 WHERE o.id = selection_option_amounts.option_id AND pe_on_project(s.project_id)));

CREATE POLICY selection_amounts_select_project_executive ON public.selection_amounts FOR SELECT
  USING (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selections s WHERE s.id = selection_amounts.selection_id AND pe_on_project(s.project_id)));
CREATE POLICY selection_amounts_insert_project_executive ON public.selection_amounts FOR INSERT
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selections s WHERE s.id = selection_amounts.selection_id AND pe_on_project(s.project_id)));
CREATE POLICY selection_amounts_update_project_executive ON public.selection_amounts FOR UPDATE
  USING (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selections s WHERE s.id = selection_amounts.selection_id AND pe_on_project(s.project_id)))
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selections s WHERE s.id = selection_amounts.selection_id AND pe_on_project(s.project_id)));

CREATE POLICY selection_notes_select_project_executive ON public.selection_notes FOR SELECT
  USING (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selections s WHERE s.id = selection_notes.selection_id AND pe_on_project(s.project_id)));
CREATE POLICY selection_notes_insert_project_executive ON public.selection_notes FOR INSERT
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selections s WHERE s.id = selection_notes.selection_id AND pe_on_project(s.project_id)));
CREATE POLICY selection_notes_update_project_executive ON public.selection_notes FOR UPDATE
  USING (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selections s WHERE s.id = selection_notes.selection_id AND pe_on_project(s.project_id)))
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selections s WHERE s.id = selection_notes.selection_id AND pe_on_project(s.project_id)));

CREATE POLICY selection_threads_insert_project_executive ON public.selection_threads FOR INSERT
  WITH CHECK (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selections s WHERE s.id = selection_threads.selection_id AND pe_on_project(s.project_id)));

CREATE POLICY selection_signing_sessions_select_project_executive ON public.selection_signing_sessions FOR SELECT
  USING (company_id = get_my_company_id()
    AND EXISTS (SELECT 1 FROM selections s WHERE s.id = selection_signing_sessions.selection_id AND pe_on_project(s.project_id)));

-- ---------------------------------------------------------------------------
-- 6. The project's team and contacts (S111 Q8: existing people, no invites).
-- ---------------------------------------------------------------------------
CREATE POLICY project_assignments_insert_project_executive ON public.project_assignments FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));
CREATE POLICY project_assignments_update_project_executive ON public.project_assignments FOR UPDATE
  USING (company_id = get_my_company_id() AND pe_on_project(project_id))
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));

CREATE POLICY project_contacts_insert_project_executive ON public.project_contacts FOR INSERT
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));
CREATE POLICY project_contacts_update_project_executive ON public.project_contacts FOR UPDATE
  USING (company_id = get_my_company_id() AND pe_on_project(project_id))
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(project_id));

-- ---------------------------------------------------------------------------
-- 7. projects — status and details on its projects (Q3 A).
-- ---------------------------------------------------------------------------
-- Archive ('archived') and trash (is_deleted) are Owner/Admin: refused HERE.
-- The financial terms, the QB column and the complete→active reopen are
-- already Owner/Admin in enforce_projects_column_scope(), for every role.
CREATE POLICY projects_update_project_executive ON public.projects FOR UPDATE
  USING (company_id = get_my_company_id() AND pe_on_project(id) AND is_deleted = false)
  WITH CHECK (company_id = get_my_company_id() AND pe_on_project(id)
    AND is_deleted = false
    AND status <> 'archived'::text);

-- ---------------------------------------------------------------------------
-- 8. chat — post in its projects' SUB threads (crew threads already admit it).
-- ---------------------------------------------------------------------------
CREATE POLICY chat_messages_insert_project_executive ON public.chat_messages FOR INSERT
  WITH CHECK (company_id = get_my_company_id()
    AND author_profile_id = get_my_profile_id()
    AND EXISTS (SELECT 1 FROM chat_threads t
                 WHERE t.id = chat_messages.thread_id AND t.kind = 'sub'::text AND pe_on_project(t.project_id)));

-- ---------------------------------------------------------------------------
-- 9. expenses — the four PM-only entry types, on its projects (Q4 A).
-- ---------------------------------------------------------------------------
-- The base rules of expenses_insert_authorized hold unchanged: its own
-- authorship, pending, never pre-approved/rejected/closed out. Retainage stays
-- Owner/Admin (is_retainage = false). Approval is expenses_update_authorized,
-- Owner/Admin, untouched.
CREATE POLICY expenses_insert_project_executive ON public.expenses FOR INSERT
  WITH CHECK (company_id = get_my_company_id()
    AND pe_on_project(project_id)
    AND author_member_id = get_my_member_id()
    AND status = 'pending'::text
    AND approved_by IS NULL AND approved_at IS NULL
    AND rejected_by IS NULL AND rejected_at IS NULL
    AND is_retainage = false
    AND closed_out_at IS NULL AND closed_out_by IS NULL AND closeout_reason IS NULL);
