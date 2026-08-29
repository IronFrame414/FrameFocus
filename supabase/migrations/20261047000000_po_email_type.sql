-- ============================================================================
-- PO module R-L4 — `purchase_order` becomes a real email type.
-- ============================================================================
-- The union rule this table has bitten twice (`mention`, near-miss `invite`):
-- BOTH HALVES OR NEITHER — this row and the `EmailType` union entry land in
-- the SAME commit. The PO id rides in `metadata.po_id` (the `mention` /
-- `selection_released` pattern; email_logs has no po column and does not
-- gain one for an outbound vendor mail).

INSERT INTO public.email_types (email_type)
VALUES ('purchase_order')
ON CONFLICT (email_type) DO NOTHING;
